// Sync layer: Firebase (free plan) for sign-in, encrypted storage and push tokens.
// When FIREBASE_CONFIG is null the app runs fully local and none of this loads.
import { FIREBASE_CONFIG, VAPID_KEY } from "./config.js";
import * as C from "./crypto.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
export const enabled = !!FIREBASE_CONFIG;

let fb = null, auth = null, db = null, key = null, user = null, vault = null, H = null;
let unsubs = [];
export const state = { phase: enabled ? "loading" : "off", email: null, error: null, push: false };
// phases: off | loading | signed-out | link-needs-email | needs-setup | needs-unlock | synced | offline-unverified

const set = (p) => { Object.assign(state, p); H?.status?.(state); };
const col = (name) => fb.collection(db, "users", user.uid, name);
const ref = (name, id) => fb.doc(db, "users", user.uid, name, id);

export async function init(handlers) {
  H = handlers;
  if (!enabled) return;
  try {
    const [a, b, c] = await Promise.all([
      import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js"),
    ]);
    fb = { ...a, ...b, ...c };
  } catch (e) {
    set({ phase: "offline-unverified", error: "Sync is offline. Your changes are saved on this device and will sync later." });
    return;
  }
  const app = fb.initializeApp(FIREBASE_CONFIG);
  auth = fb.getAuth(app);
  try { db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) }); }
  catch { db = fb.getFirestore(app); }

  if (fb.isSignInWithEmailLink(auth, location.href)) {
    const email = localStorage.getItem("gj-email");
    if (email) await completeLink(email);
    else set({ phase: "link-needs-email" });
  }
  fb.onAuthStateChanged(auth, (u) => {
    user = u;
    if (u) { set({ email: u.email }); afterSignIn(); }
    else { stop(); if (state.phase !== "link-needs-email") set({ phase: "signed-out", email: null }); }
  });
}

export async function sendLink(email) {
  localStorage.setItem("gj-email", email);
  await fb.sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
}
export async function completeLink(email) {
  try {
    await fb.signInWithEmailLink(auth, email, location.href);
    localStorage.setItem("gj-email", email);
    history.replaceState(null, "", location.pathname + "#settings");
  } catch (e) {
    set({ phase: "signed-out", error: "That sign-in link has expired or was already used. Request a new one." });
    history.replaceState(null, "", location.pathname + "#settings");
  }
}
export async function signOut() {
  await C.forgetLocalKey();
  key = null;
  await fb.signOut(auth);
}

async function afterSignIn() {
  try {
    const snap = await fb.getDoc(ref("meta", "vault"));
    vault = snap.exists() ? snap.data() : null;
  } catch {
    set({ phase: "offline-unverified", error: "Can't reach the server yet. Changes are kept on this device." });
    setTimeout(() => user && afterSignIn(), 15000);
    return;
  }
  if (!vault) return set({ phase: "needs-setup" });
  const local = await C.loadLocalKey().catch(() => null);
  if (local && (await check(local))) { key = local; return start(); }
  set({ phase: "needs-unlock" });
}
async function check(k) {
  try { return (await C.decryptJSON(k, vault.check)) === "gojessie"; } catch { return false; }
}

export async function setupPassphrase(pass) {
  const r = await C.setupKeys(pass);
  key = await C.loadLocalKey();
  vault = { ...r.vault, check: await C.encryptJSON(key, "gojessie"), created: Date.now() };
  await fb.setDoc(ref("meta", "vault"), vault);
  start();
  return r.recovery;
}
export async function unlockWith(secret, useRecovery) {
  let k;
  try { k = await C.unlock(vault, secret, useRecovery); } catch { throw new Error(useRecovery ? "That recovery code doesn't match." : "Wrong passphrase."); }
  if (!(await check(k))) throw new Error("Wrong passphrase.");
  key = k;
  start();
}
export async function changePassphrase(oldSecret, newPass, oldIsRecovery) {
  try { vault = await C.rewrap(vault, oldSecret, newPass, oldIsRecovery); }
  catch { throw new Error(oldIsRecovery ? "That recovery code doesn't match." : "Current passphrase is wrong."); }
  await fb.setDoc(ref("meta", "vault"), vault);
}

// ---- live sync ----
function stop() { unsubs.forEach((u) => u()); unsubs = []; }
function start() {
  stop();
  set({ phase: "synced", error: null });
  const seen = { tasks: false, events: false, rewards: false };
  for (const name of ["tasks", "events", "rewards"]) {
    unsubs.push(fb.onSnapshot(col(name), async (qs) => {
      const remoteIds = new Set();
      for (const d of qs.docs) remoteIds.add(d.id);
      for (const ch of qs.docChanges()) {
        if (ch.type === "removed") continue;
        const item = await decode(name, ch.doc.id, ch.doc.data());
        if (item) H.remote(name, item);
      }
      if (!seen[name]) {
        seen[name] = true;
        // Upload anything this device has that the server lacks or holds an older copy of.
        const remoteUpdated = Object.fromEntries(qs.docs.map((d) => [d.id, d.data().updated || 0]));
        for (const it of H.localItems(name)) {
          if (!remoteIds.has(it.id) || (name !== "events" && (it.updated || 0) > remoteUpdated[it.id])) write(name, it);
        }
      }
    }, () => set({ error: "Sync paused. Changes are saved on this device." })));
  }
  unsubs.push(fb.onSnapshot(ref("meta", "settings"), (d) => {
    if (d.exists()) H.remote("settings", d.data());
    else write("settings", H.localItems("settings"));
  }));
}

async function decode(name, id, d) {
  try {
    if (name === "events") return { ...d, id };
    const secret = d.enc ? await C.decryptJSON(key, d.enc) : {};
    const { enc, encT, ...rest } = d;
    return { ...rest, ...secret, id };
  } catch { return null; }
}

export async function write(name, item) {
  if (state.phase !== "synced" || !key) return;
  let data;
  if (name === "settings") data = { ...item };
  else if (name === "events") { const { id, ...rest } = item; data = rest; }
  else if (name === "tasks") {
    const { id, title, notes, tag, priority, ...rest } = item;
    data = { ...rest, enc: await C.encryptJSON(key, { title, notes, tag, priority }), encT: await C.encryptJSON(key, { title: String(title).slice(0, 120) }) };
  } else if (name === "rewards") {
    const { id, name: nm, cost, ...rest } = item;
    data = { ...rest, enc: await C.encryptJSON(key, { name: nm, cost }) };
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  const target = name === "settings" ? ref("meta", "settings") : ref(name, item.id);
  fb.setDoc(target, data).catch(() => set({ error: "Some changes haven't reached the server yet." }));
}

// ---- push notifications ----
export async function enablePush(registration) {
  if (state.phase !== "synced") return false;
  const m = await import(SDK + "firebase-messaging.js");
  if (!(await m.isSupported())) return false;
  const messaging = m.getMessaging();
  const token = await m.getToken(messaging, { vapidKey: VAPID_KEY || undefined, serviceWorkerRegistration: registration });
  if (!token) return false;
  let dev = localStorage.getItem("gj-device");
  if (!dev) { dev = crypto.randomUUID().replace(/-/g, "").slice(0, 16); localStorage.setItem("gj-device", dev); }
  await fb.setDoc(ref("devices", dev), { token, updated: Date.now(), ua: navigator.userAgent.slice(0, 120) });
  localStorage.setItem("gj-push", "1");
  set({ push: true });
  return true;
}
