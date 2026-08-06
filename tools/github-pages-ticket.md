# GitHub Support ticket — Pages deployments never complete

Paste this at https://support.github.com/request (category: Pages). Everything below was
verified rather than assumed; the point of writing it down is that support should not have to
re-derive it, and neither should you.

---

**Repository:** `yankiakal/crownhold` (public)
**Symptom:** Every GitHub Pages deployment since `2026-08-06 12:01 UTC` fails. The site is
frozen on the build published at 12:01. Seven consecutive deployments have failed via two
independent routes.

## What fails

The deployment reaches `in_progress` and then never reports a terminal state of its own.
`actions/deploy-pages` eventually gives up at whatever its timeout is set to:

| deployment | created (UTC) | outcome |
|---|---|---|
| 5778960538 | 12:01:42 | **success** — the build still being served |
| 5779105434 | 12:12:17 | failure |
| 5779318773 | 12:26:17 | failure |
| 5779625777 | 12:46:45 | failure |
| 5780115044 | 13:16:59 | failure |
| 5780565695 | 13:42:23 | failure |
| (14:03 run) | 14:03:47 | failure — with `timeout: 1800000` (30 min) |

Status history of 5780565695 is representative:

```
13:42:24  waiting       (cleared in 2 seconds)
13:42:26  queued        (sat here 5 minutes)
13:47:29  in_progress
13:57:36  failure       (exactly 10m00s later — the action's default timeout)
```

**No deployment status carries an error `description`.** The failure is the action running out
of patience, not Pages reporting a problem.

## What has been ruled out

- **Pages source.** Was *Deploy from a branch* (`gh-pages` / root); the branch route failed
  identically — `Build with Jekyll` succeeded every time and `Deploy to GitHub Pages` timed out
  at exactly 10m02s. Switched to **GitHub Actions**; the built-in
  `pages-build-deployment` workflow correctly stopped firing, confirming the switch took.
- **Deployment branch policy.** The `github-pages` environment has a custom branch policy
  permitting `gh-pages` and `main`. The `waiting` state clears in ~2 seconds, so the workflow's
  branch is authorised.
- **A stuck deployment holding the lock.** Every prior deployment is in a terminal state
  (`failure` / `success` / `inactive`). Nothing is pending behind the scenes.
- **Concurrency from rapid deploys.** Deploys were spaced out deliberately and one was run with
  a completely clear field. Same result.
- **The action's timeout.** Raised from the default 600000 ms to 1800000 ms. Still failed.
- **Artifact size or validity.** The whole site is one self-contained 291 KB `index.html` plus
  an icon, a manifest and a service worker — 588 KB total. `actions/upload-pages-artifact@v3`
  reports success.
- **A platform incident.** `githubstatus.com` reported *All Systems Operational* with Pages
  `operational` and no open incidents throughout.
- **The build.** The `build` job passes in ~25 seconds, running the project's full test suite
  (387 assertions) before uploading.

## What we would like

The Pages backend for this repository appears to have been wedged since roughly 12:05 UTC on
2026-08-06 — accepting deployments and never completing them. Please reset it.

**Reference run:** https://github.com/yankiakal/crownhold/actions/runs/31107149665
**Failing job:** https://github.com/yankiakal/crownhold/actions/runs/31107149665/job/92635296346
