// GO JESSIE! service worker: offline app shell + reminder notifications.
const VERSION = "gj-v1";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "logic.js", "sync.js", "crypto.js", "quotes.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// App files: network first (so updates arrive), cache when offline.
// Fonts and the Firebase library: cache first, refreshed in the background.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isStatic = /fonts\.(googleapis|gstatic)\.com|api\.fontshare\.com|cdn\.fontshare\.com|www\.gstatic\.com\/firebasejs/.test(url.href);
  if (sameOrigin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
  } else if (isStatic) {
    e.respondWith(caches.open(VERSION + "-ext").then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// ---- decrypting reminder text with this device's key ----
function kvGet(k) {
  return new Promise((res) => {
    const r = indexedDB.open("gojessie", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => res(null);
    r.onsuccess = () => {
      const q = r.result.transaction("kv").objectStore("kv").get(k);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    };
  });
}
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function decTitle(key, enc) {
  try {
    const [iv, ct] = enc.split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(iv) }, key, b64(ct));
    return JSON.parse(new TextDecoder().decode(pt)).title || "A task";
  } catch { return "A task"; }
}

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let msg = {};
    try { const j = e.data ? e.data.json() : {}; msg = j.data || j; } catch {}
    const key = await kvGet("dataKey");
    let items = [];
    try { items = JSON.parse(msg.items || "[]"); } catch {}
    const lines = [];
    for (const it of items) {
      const title = key && it.e ? await decTitle(key, it.e) : "A task";
      lines.push(it.x ? `${title} (${it.x})` : title);
    }
    const title = msg.head || "GO JESSIE!";
    let body = msg.body || lines.join("\n");
    if (msg.kind === "alert" && lines.length === 1 && msg.dl) body = `${lines[0].replace(/ \(.*\)$/, "")} · deadline ${msg.dl}`;
    if (msg.more) body += `\n+${msg.more} more`;
    await self.registration.showNotification(title, {
      body: body || "Open GO JESSIE! to see your list.",
      tag: msg.tag || msg.kind || "gj",
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      data: { url: "./#home" },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) { c.navigate?.(e.notification.data?.url || "./"); return c.focus(); }
    return self.clients.openWindow(e.notification.data?.url || "./");
  })());
});
