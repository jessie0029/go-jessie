// GO JESSIE! reminder sender. Runs every hour on GitHub Actions (free).
// It can see dates and done/open status, but not what the tasks are: titles are encrypted.
// It forwards the encrypted titles; your phone decrypts them when the notification arrives.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { plan } from "./plan.mjs";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("Missing FIREBASE_SERVICE_ACCOUNT secret."); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const fcm = getMessaging();
const TEST = process.env.TEST === "1";

const users = await db.collection("users").listDocuments();
for (const u of users) {
  const devices = (await u.collection("devices").get()).docs;
  if (!devices.length) { console.log("No devices registered yet."); continue; }
  let messages;
  if (TEST) {
    messages = [{ kind: "test", head: "GO JESSIE! test", body: "Reminders from GitHub reach this phone. 加油！", tag: "test" }];
  } else {
    const settings = (await u.collection("meta").doc("settings").get()).data() || {};
    const sentRef = u.collection("meta").doc("sent");
    const sent = (await sentRef.get()).data() || {};
    const tasks = (await u.collection("tasks").where("done", "==", false).get()).docs.map((d) => d.data());
    const p = plan({ settings, tasks, sentDay: sent.day, now: new Date() });
    console.log(p.reason);
    if (!p.send) continue;
    messages = p.messages;
    await sentRef.set({ day: p.today, at: Date.now() });
  }
  for (const m of messages) {
    const data = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    for (const d of devices) {
      try {
        await fcm.send({ token: d.data().token, data, webpush: { headers: { Urgency: "high", TTL: "43200" } } });
      } catch (e) {
        console.log("Send failed:", e.code);
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(e.code)) await d.ref.delete();
      }
    }
  }
  console.log(`Sent ${messages.length} notification(s) to ${devices.length} device(s).`);
}
