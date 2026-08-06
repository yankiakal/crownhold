// Web Push, from scratch. No dependencies — Node's crypto has every primitive this needs.
//
// WHAT IT IS FOR, which is narrower than it first looks. This server has no game loop: a request
// arrives, time is fast-forwarded from lastSeen, the answer goes back. And no battles happen while
// you are away — applyOffline grants production and nothing else. So there is nothing TIME-BASED to
// notify anyone about; a build finishing has a known end time but nothing here wakes up to send it,
// and adding a scheduler to do that would be adding the game loop this design deliberately does not
// have.
//
// What does happen while you are away is another PLAYER doing something to you: raiding your hold,
// calling a rally, posting a garrison at your wall. Those are triggered by someone else's request,
// which the server is awake for by definition. So push carries player-caused events only, and needs
// no scheduler at all.
//
// It is also the honest version of the thing Whiteout Survival monetises hardest. They sell relief
// from panic — shields and instant healing, bought in the ten minutes after someone burned your
// city. A free notification prevents the panic instead of pricing it.
//
// ── the standards, and why the code looks like this ──
// RFC 8292 (VAPID): a JWT signed ES256 with a P-256 key, proving to the push service who is asking.
// RFC 8291 (payload encryption): ECDH against the subscriber's public key, HKDF to derive a content
// encryption key and nonce, then AES-128-GCM. The subscriber's browser holds the private half, so
// the push service relays a payload it cannot read.
//
// Every step is verified by a round trip in verify-server.mjs: the test decrypts what this produces
// using the subscription's private key, which is the only way to know the whole chain is right
// without a real browser and a real push service in the loop.

import { createECDH, createHmac, createSign, createPublicKey, createPrivateKey,
         generateKeyPairSync, randomBytes, createCipheriv, constants } from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = str => Buffer.from(String(str), 'base64url');

/* ── VAPID identity ──
   One keypair per deployment, generated on first use and persisted by the caller. The public half
   goes to the browser (it pins the subscription to us); the private half signs the JWT. */
export function newVapidKeys(){
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  // the raw 65-byte uncompressed point is what applicationServerKey wants
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  return {
    publicKey: b64u(pubDer.subarray(pubDer.length - 65)),
    privateKey: b64u(privateKey.export({ type: 'pkcs8', format: 'der' })),
    createdAt: Date.now(),
  };
}

/* ES256 JWT. The signature must be raw r||s, not the DER sequence Node produces by default —
   `dsaEncoding: 'ieee-p1363'` is what makes that difference, and getting it wrong yields a JWT
   every push service rejects with a 401 that says nothing useful. */
function vapidJwt(audience, privateKeyB64u, subject){
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,   // 12h; the spec caps it at 24
    sub: subject,
  }));
  const key = createPrivateKey({
    key: unb64u(privateKeyB64u), format: 'der', type: 'pkcs8',
  });
  const sig = createSign('SHA256').update(header + '.' + body)
    .sign({ key, dsaEncoding: 'ieee-p1363' });
  return header + '.' + body + '.' + b64u(sig);
}

const hkdf = (salt, ikm, info, len) => {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest()
    .subarray(0, len);
};

/* ── RFC 8291 aes128gcm ──
   Exported because the test decrypts its own output: a round trip is the only way to prove the
   ECDH → HKDF → AES-GCM chain is correct without a browser at the other end. */
export function encryptPayload(plaintext, subscriberPubB64u, authSecretB64u){
  const subPub = unb64u(subscriberPubB64u);          // 65 raw bytes
  const auth = unb64u(authSecretB64u);               // 16 bytes
  if(subPub.length !== 65) throw new Error('push: subscriber key must be 65 raw bytes');
  if(auth.length !== 16) throw new Error('push: auth secret must be 16 bytes');

  const ecdh = createECDH('prime256v1');
  const localPub = ecdh.generateKeys();              // ephemeral, one per message
  const shared = ecdh.computeSecret(subPub);
  const salt = randomBytes(16);

  /* The key derivation is two stages and the order of the two public keys in the second info
     string is subscriber-then-sender. Reversing them produces a plausible ciphertext the client
     silently fails to decrypt, with no error anywhere. */
  const prkInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'), subPub, localPub,
  ]);
  const ikm = hkdf(auth, shared, prkInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // a single record: the padding delimiter 0x02 marks it as the last one
  const padded = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);                    // record size
  header.writeUInt8(localPub.length, 20);
  return Buffer.concat([header, localPub, body]);
}

/* Send one notification. Returns { ok, status } rather than throwing, because a dead subscription
   is the normal case — people clear site data — and one stale endpoint must never take down the
   request that happened to trigger the send. 404 and 410 mean the caller should forget it. */
export async function sendPush(sub, payload, vapid, subject = 'mailto:noreply@crownhold'){
  if(!sub || !sub.endpoint || !sub.keys || !vapid) return { ok: false, status: 0, gone: false };
  let url;
  try { url = new URL(sub.endpoint); } catch { return { ok: false, status: 0, gone: true }; }
  const body = encryptPayload(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const jwt = vapidJwt(url.origin, vapid.privateKey, subject);
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'TTL': '86400',
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': 'vapid t=' + jwt + ', k=' + vapid.publicKey,
      },
      body,
    });
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e && e.message || e) };
  }
}
