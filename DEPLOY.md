# Putting Crownhold online

The multiplayer half — alliances, Help, raids, the Watch, the arena, the Muster Roll — needs a Node
process. GitHub Pages cannot run one, which is why the live site is solo-only, and why `net.js`
refuses to treat `github.io` as its own API rather than pretending:

```js
if(!server && ... && !/(github\.io|claude\.ai)$/.test(location.hostname))
  server = location.origin;
if(!server) server = DEFAULT_SERVER;   // http://localhost:8787
```

**Serve the game FROM the server.** `server/server.js` already serves `dist/` as static files, so
one process hosts both the page and the API. That makes them same-origin, which removes three
problems at once rather than solving them: no CORS, no mixed-content block, and no server URL for a
player to configure — `net.js` picks up `location.origin` on its own.

Do not host the page on Pages and the API on the VPS. The page would be `https://` and the API
`http://`, and every browser blocks that as mixed content. If you want that split you need TLS on
the API anyway, at which point serving both from one origin is strictly less work.

---

## What the VPS needs

- **Node 20 or newer** (`package.json` declares `engines`). Node 18 is end-of-life.
- **A domain pointed at it.** Not optional: browsers require HTTPS for a site that holds passwords,
  and a certificate needs a name.
- Roughly 512MB of RAM. The whole database is one JSON file held in memory; a few hundred holds is
  a file measured in megabytes.

## Deploy

```sh
# on the VPS, as a non-root user
git clone https://github.com/yankiakal/crownhold.git
cd crownhold
npm ci                 # NOT --omit=dev: vite is a devDependency and the build needs it
npm run build          # writes dist/, which the server serves
npm run verify:server  # 85 assertions against a throwaway database — do this before trusting it
```

`dist/` is gitignored, so the build has to happen on the machine (or be copied there). A server
started without it still runs the API and says so on stdout.

## systemd

`/etc/systemd/system/crownhold.service`:

```ini
[Unit]
Description=Crownhold
After=network.target

[Service]
Type=simple
User=crownhold
WorkingDirectory=/home/crownhold/crownhold
Environment=PORT=8787
Environment=HOST=127.0.0.1
Environment=DATA_DIR=/var/lib/crownhold
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3

# the process needs to write its database and nothing else
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/crownhold

[Install]
WantedBy=multi-user.target
```

```sh
sudo mkdir -p /var/lib/crownhold && sudo chown crownhold: /var/lib/crownhold
sudo systemctl enable --now crownhold
journalctl -u crownhold -f
```

**`HOST=127.0.0.1` matters.** Without it the process binds every interface and `:8787` answers the
open internet in plain HTTP — anyone could talk to it directly, unencrypted, with a real session
token in the request body, and the proxy's certificate would be decoration. Bound to loopback, the
only way in is through the proxy.

**Never set `ALLOW_DEBUG=1`.** `/api/debug/kit`, `/warp`, `/bump` and `/embassy` let any signed-in
account rewrite its own hold: Town Hall 20, 900k of every resource, a jump through time. They exist
for the verification suite. The server prints a loud warning at startup if they are on — an env var
set once in a shell and forgotten is exactly how this would go wrong.

## TLS, with Caddy

Caddy gets a certificate on its own, renews it on its own, and needs three lines.
`/etc/caddy/Caddyfile`:

```
crownhold.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8787
}
```

```sh
sudo systemctl reload caddy
```

That is the whole thing. Visit `https://crownhold.example.com` and the game is online: sign-in works,
the Alliance tab appears in the bar, and raids reach real holds.

nginx works equally well if you already run it — proxy `/` to `127.0.0.1:8787` and let certbot handle
the certificate. Caddy is suggested only because it is fewer moving parts.

## Updating

```sh
cd crownhold && git pull && npm ci && npm run build && sudo systemctl restart crownhold
```

The database survives a restart — it lives in `DATA_DIR`, outside the checkout, and every write is
atomic (written to `.tmp`, then renamed). `migrate()` runs over every stored hold on load, which is
what lets a save made three versions ago pick up fields that did not exist then. Restarting during a
battle costs nothing: state advances from timestamps, so a hold catches up on its next request rather
than losing the interval.

## Back it up

One file, so this is a one-liner in cron on the VPS — the only scheduled thing in this project, and
it belongs to you rather than to the game:

```sh
0 * * * * cp /var/lib/crownhold/accounts.json /var/backups/crownhold-$(date +\%H).json
```

Twenty-four rolling hourly copies. A player's whole hold is in there; losing it is the one failure
this game cannot apologise its way out of.

## What is already handled

Checked before recommending exposure, not assumed:

| | |
|---|---|
| Passwords | `scryptSync` with a per-account 16-byte salt, compared with `timingSafeEqual`. Never stored or logged in the clear |
| Session tokens | `randomBytes(24)` — 192 bits — reissued on every login. Compared with `===`, which is safe at that width but is not a constant-time comparison, so do not narrow the token later |
| Request size | capped at 64KB; a larger body destroys the connection |
| Rate limiting | per-IP, 150 requests per 10s, returns 429 |
| Durability | atomic write (`.tmp` then rename), flushed every 2s and on SIGINT/SIGTERM |
| Debug endpoints | off unless `ALLOW_DEBUG=1`, with a loud startup warning when on |
| Static paths | `normalize`d, leading `../` stripped, and refused unless the resolved path is inside `dist/` |

## What is not

- **No email, so no password recovery.** A forgotten password is a lost hold. Fine for testing with
  people you know; not fine for strangers.
- **Moderation exists but has no operator UI.** Players can block and report from any message, a
  wordlist masks slurs on send, and you can silence or close an account — but only over HTTP, and only
  as an admin. See below.
- **The rate limit is per-IP and in memory.** It resets on restart and does not survive a
  distributed attempt. It is a courtesy, not a defence.
- **One process, one file.** No replication. The VPS is the game.
- **Token lookup is a linear scan** over every account on every authenticated request
  (`userByToken`). Irrelevant at a few hundred holds, the first thing to fix at a few thousand.


## Moderating it

App Store Guideline 1.2 asks four things of any app carrying user-generated content, and Google Play
asks the same in different words. All four are in:

| | |
|---|---|
| A filter | a small wordlist masks slurs on send. Deliberately small — it catches slurs, not profanity, because a list that flags "Scunthorpe" is worse than no list |
| Report | any message a player did not write carries ⚑. Reports are records, never actions: nothing is hidden by being reported, or reporting becomes the abuse |
| Block | 🚫 on any message. Stored on the blocker, applied when chat is READ, so it covers state, alliance, groups AND direct messages — and the blocked party is told nothing |
| Contact | `SUPPORT_EMAIL` is published in the Settings sheet. Set it to an address you actually read |

**Becoming an admin.** Nothing in the game can grant this, on purpose — an admin endpoint any account
could reach is worse than none. Either list names in the environment:

```ini
Environment=ADMINS=yourname
Environment=SUPPORT_EMAIL=support@yourdomain
```

…or set `"role": "admin"` on your own entry in `accounts.json` with the server stopped.

**The operator's endpoints.** No UI; curl is the tool. `TOKEN` is your own session token — the app
stores it in localStorage under `crownhold-session`.

```sh
API=https://crownhold.example.com
TOKEN=...

# what has been reported, newest last
curl -s -X POST $API/api/mod/reports -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" | python3 -m json.tool

# silence someone for two hours — they are told, with the time remaining
curl -s -X POST $API/api/mod/mute -H 'content-type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"name\":\"Rude\",\"minutes\":120}"

curl -s -X POST $API/api/mod/unmute -d "{\"token\":\"$TOKEN\",\"name\":\"Rude\"}" -H 'content-type: application/json'

# close an account. Banned rather than deleted: deleting frees the name and loses the evidence
curl -s -X POST $API/api/mod/ban -d "{\"token\":\"$TOKEN\",\"name\":\"Rude\"}" -H 'content-type: application/json'
curl -s -X POST $API/api/mod/unban -d "{\"token\":\"$TOKEN\",\"name\":\"Rude\"}" -H 'content-type: application/json'

# mark a person's reports handled, so the queue stays readable
curl -s -X POST $API/api/mod/resolve -d "{\"token\":\"$TOKEN\",\"name\":\"Rude\"}" -H 'content-type: application/json'
```

A ban clears the session token, so the account is signed out immediately rather than at the end of its
natural life, and cannot sign back in — the login refusal names your support address.

**What is still missing**, and worth knowing before a public launch: nobody is watching the queue but
you, there is no automatic escalation, and "timely responses" in Guideline 1.2 means a reviewer may
test whether a report gets one. A queue you do not read is a rejection risk as well as a broken
promise.
