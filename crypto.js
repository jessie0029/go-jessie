// End-to-end encryption for synced data.
// A random data key (AES-GCM 256) encrypts task titles, notes, tags and rewards.
// That key is stored in Firebase only in "wrapped" form: once locked with your passphrase,
// once locked with your recovery code. Neither the passphrase nor the code ever leaves the device.
// On each device the unwrapped key is kept in IndexedDB as a non-exportable key, so the
// passphrase is only needed once per device.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 310000;

export const b64 = {
  from: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  to: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

// ---- tiny IndexedDB key/value (shared with sw.js: db "gojessie", store "kv") ----
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("gojessie", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function kvGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction("kv").objectStore("kv").get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function kvSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction("kv", "readwrite");
    v === undefined ? t.objectStore("kv").delete(k) : t.objectStore("kv").put(v, k);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

// ---- key handling ----
async function kek(secret, saltB64) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64.to(saltB64), iterations: ITER },
    base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]
  );
}
async function wrap(dataKey, secret) {
  const salt = b64.from(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await kek(secret, salt);
  const w = await crypto.subtle.wrapKey("raw", dataKey, k, { name: "AES-GCM", iv });
  return { salt, iv: b64.from(iv), key: b64.from(w) };
}
async function unwrap(box, secret, extractable = false) {
  const k = await kek(secret, box.salt);
  return crypto.subtle.unwrapKey("raw", b64.to(box.key), k, { name: "AES-GCM", iv: b64.to(box.iv) },
    { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

export function makeRecoveryCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/I/L)
  const r = crypto.getRandomValues(new Uint8Array(20));
  const s = [...r].map((x) => A[x % A.length]).join("");
  return s.match(/.{5}/g).join("-");
}
const normCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,5}/g)?.join("-") || "";

// First device: create the data key, return the wrapped copies to store in Firebase.
export async function setupKeys(passphrase) {
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const recovery = makeRecoveryCode();
  const vault = { v: 1, pass: await wrap(dataKey, passphrase), rec: await wrap(dataKey, normCode(recovery)) };
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  const local = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  await kvSet("dataKey", local);
  return { vault, recovery };
}

// Other devices: unlock with passphrase or recovery code.
export async function unlock(vault, secret, useRecovery = false) {
  const key = await unwrap(useRecovery ? vault.rec : vault.pass, useRecovery ? normCode(secret) : secret);
  await kvSet("dataKey", key);
  return key;
}

// Change passphrase (needs the old passphrase or recovery code). Returns new vault.
export async function rewrap(vault, oldSecret, newPass, oldIsRecovery = false) {
  const k = await unwrap(oldIsRecovery ? vault.rec : vault.pass, oldIsRecovery ? normCode(oldSecret) : oldSecret, true);
  return { ...vault, pass: await wrap(k, newPass) };
}

export const loadLocalKey = () => kvGet("dataKey");
export const forgetLocalKey = () => kvSet("dataKey", undefined);

// ---- data ----
export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return b64.from(iv) + "." + b64.from(ct);
}
export async function decryptJSON(key, s) {
  const [iv, ct] = s.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.to(iv) }, key, b64.to(ct));
  return JSON.parse(dec.decode(pt));
}
