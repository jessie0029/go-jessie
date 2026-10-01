// GO JESSIE! — app UI and behaviour.
import { QUOTES } from "./quotes.js";
import * as L from "./logic.js";
import * as Sync from "./sync.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hasCJK = (s) => /[㐀-鿿]/.test(s);

// ---------------- state ----------------
const STORE = "gj-state-v1";
let S = { tasks: {}, events: {}, rewards: {}, settings: structuredClone(L.DEFAULT_SETTINGS) };
try {
  const raw = localStorage.getItem(STORE);
  if (raw) { const d = JSON.parse(raw); S = { ...S, ...d, settings: { ...S.settings, ...d.settings, points: { ...L.DEFAULT_POINTS, ...(d.settings?.points || {}) } } }; }
  else if (window.GJ_DEMO) S = window.GJ_DEMO(S, L);
} catch { /* storage blocked: run in memory */ }
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} }

const ui = {
  view: "home", filter: "All", sort: "date", showDone: false,
  calMonth: L.monthKey(), calDay: L.dayKey(), progMonth: L.monthKey(),
  qi: Math.floor(Math.random() * QUOTES.length),
};

const tasks = () => Object.values(S.tasks).filter((t) => !t.deleted);
const events = () => Object.values(S.events).sort((a, b) => a.at - b.at);
const rewards = () => Object.values(S.rewards).filter((r) => !r.deleted).sort((a, b) => a.cost - b.cost);

// ---------------- mutations ----------------
function putTask(t) { t.updated = Date.now(); S.tasks[t.id] = t; save(); Sync.write("tasks", t); }
function putEvents(evs) { for (const e of evs) { S.events[e.id] = e; Sync.write("events", e); } save(); }
function putReward(r) { r.updated = Date.now(); S.rewards[r.id] = r; save(); Sync.write("rewards", r); }
function putSettings(patch) { S.settings = { ...S.settings, ...patch, updated: Date.now() }; save(); Sync.write("settings", S.settings); }

function toggleDone(id) {
  const t = S.tasks[id]; if (!t) return;
  if (!t.done) {
    const r = L.completionEvents(t, S.settings, Date.now(), events());
    putEvents(r.events);
    putTask({ ...t, done: true, doneAt: Date.now(), completions: r.n });
    const sum = r.events.reduce((s, e) => s + e.pts, 0);
    const bits = [r.onTime && "on time", t.priority === "high" && "high priority", r.events.find((e) => e.type === "streak") && `${r.events.find((e) => e.type === "streak").streak}-day streak`].filter(Boolean);
    toast(`<span class="p">+${sum}</span> points${bits.length ? " · " + bits.join(" · ") : ""}`);
  } else {
    const u = L.undoEvent(t, events());
    if (u) putEvents([u]);
    putTask({ ...t, done: false, doneAt: null });
    toast(u ? `Marked open again · ${u.pts} points` : "Marked open again");
  }
  render();
}
function snooze(id, days) {
  const t = S.tasks[id]; if (!t) return;
  const today = L.dayKey();
  const from = t.target && t.target > today ? t.target : today;
  const ev = L.snoozeEvent(t, S.settings);
  putEvents([ev]);
  const target = L.addDays(from, days);
  putTask({ ...t, target, snoozes: (t.snoozes || 0) + 1 });
  const past = t.deadline && L.endOfDayMs(target) > L.deadlineMs(t.deadline);
  toast(`Snoozed to ${L.prettyDay(target)} · <span class="p">${ev.pts}</span>${past ? " · after the deadline!" : ""}`);
  closeSheet(); render();
}
function checkMisses() {
  const m = L.missEvents(tasks(), events(), S.settings);
  if (m.length) { putEvents(m); toast(`Missed deadline: <span class="p">${m.reduce((s, e) => s + e.pts, 0)}</span> points`); }
}

// ---------------- icons ----------------
const ic = (p, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
const I = {
  home: ic('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  list: ic('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
  cal: ic('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  chart: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.6"'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="3.2"'),
  left: ic('<path d="m15 18-6-6 6-6"/>'),
  right: ic('<path d="m9 18 6-6-6-6"/>'),
  x: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
};
const NAV = [["home", "Home", I.home], ["tasks", "Tasks", I.list], ["calendar", "Calendar", I.cal], ["progress", "Progress", I.chart], ["settings", "Settings", I.gear]];

// ---------------- shell ----------------
document.body.innerHTML = `
<div class="shell">
  <nav class="rail" aria-label="Sections">
    <p class="wordmark">GO JESSIE<span>!</span></p>
    ${NAV.map(([v, l, i]) => `<button class="tab" data-nav="${v}">${i}<span>${l}</span></button>`).join("")}
    <button class="btn add-btn" data-act="new">${I.plus} New task</button>
  </nav>
  <main id="main" tabindex="-1"></main>
</div>
<nav class="tabbar" aria-label="Sections">${NAV.map(([v, l, i]) => `<button class="tab" data-nav="${v}">${i}<span>${l}</span></button>`).join("")}</nav>
<button class="fab" data-act="new" aria-label="New task">${I.plus}</button>
<div id="sheet-root"></div>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>`;

function toast(html) {
  const el = document.createElement("div"); el.className = "toast"; el.innerHTML = html;
  const box = $("#toasts"); box.append(el);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(() => el.remove(), 3200);
}

function syncBadge() {
  const st = Sync.state;
  if (!Sync.enabled) return `<span class="sync-dot"><i></i>On this device</span>`;
  if (st.phase === "synced") return `<span class="sync-dot on"><i></i>Synced</span>`;
  if (st.phase === "loading") return `<span class="sync-dot"><i></i>Connecting…</span>`;
  return `<button class="link sync-dot off" data-nav="settings"><i></i>Finish sync setup</button>`;
}

// ---------------- views ----------------
function render() {
  const v = ui.view;
  document.querySelectorAll("[data-nav]").forEach((b) => b.dataset.nav === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  const top = `<div class="topbar"><h1 class="wordmark">GO JESSIE<span>!</span></h1>${syncBadge()}</div>`;
  $("#main").innerHTML = top + ({ home: viewHome, tasks: viewTasks, calendar: viewCalendar, progress: viewProgress, settings: viewSettings }[v] || viewHome)();
  if (v === "home") startQuoteBar();
}

function row(t) {
  const w = L.whenInfo(t);
  const chips = [
    t.priority === "high" ? `<span class="chip high">High</span>` : t.priority === "low" ? `<span class="chip low">Low</span>` : "",
    t.tag ? `<span class="chip">${esc(t.tag)}</span>` : "",
    t.deadline && !t.done ? `<span>Deadline ${esc(L.prettyDeadline(t.deadline))}</span>` : "",
  ].join("");
  return `<div class="row ${t.done ? "done" : ""}">
    <button class="check ${t.priority === "high" ? "high" : ""}" data-act="toggle" data-id="${t.id}" aria-label="${t.done ? "Mark as not done" : "Mark done"}: ${esc(t.title)}">${I.check}</button>
    <button class="main" data-act="open" data-id="${t.id}"><span class="title">${esc(t.title)}</span>${chips ? `<span class="meta">${chips}</span>` : ""}</button>
    <div class="when ${w.cls}">${esc(w.text)}${w.sub ? `<small>${esc(w.sub)}</small>` : ""}</div>
  </div>`;
}
const listOf = (arr, emptyHtml) => `<div class="list">${arr.length ? arr.map(row).join("") : `<div class="empty">${emptyHtml}</div>`}</div>`;

function quoteHtml() {
  const q = QUOTES[ui.qi % QUOTES.length];
  return `<section class="quote" id="quote" aria-label="Quote">
    <blockquote class="${hasCJK(q.t) ? "cjk" : ""}">${esc(q.t)}</blockquote>
    <div class="qfoot"><span class="by">${q.by ? "— " + esc(q.by) : ""}</span>
      <span class="qnav"><button data-act="q-prev" aria-label="Previous quote">${I.left}</button><button data-act="q-next" aria-label="Next quote">${I.right}</button></span></div>
    <i class="qbar" id="qbar"></i>
  </section>`;
}
let qTimer = null;
const QMS = 30000;
ui.qStart = Date.now();
function startQuoteBar() {
  const bar = $("#qbar"); if (!bar) return;
  const elapsed = Date.now() - ui.qStart;
  if (elapsed >= QMS) { nextQuote(1); return; }
  bar.style.transition = "none"; bar.style.width = (elapsed / QMS) * 100 + "%";
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `width ${(QMS - elapsed) / 1000}s linear`; bar.style.width = "100%"; }));
  clearTimeout(qTimer); qTimer = setTimeout(() => nextQuote(1), QMS - elapsed);
}
function nextQuote(d) {
  const el = $("#quote");
  ui.qi = (ui.qi + d + QUOTES.length) % QUOTES.length;
  ui.qStart = Date.now();
  if (!el) return;
  el.classList.add("fading");
  setTimeout(() => {
    const q = QUOTES[ui.qi];
    const bq = el.querySelector("blockquote");
    bq.textContent = q.t; bq.className = hasCJK(q.t) ? "cjk" : "";
    el.querySelector(".by").textContent = q.by ? "— " + q.by : "";
    el.classList.remove("fading"); ui.qStart = Date.now(); startQuoteBar();
  }, 450);
}

function viewHome() {
  const today = L.dayKey();
  const open = tasks().filter((t) => !t.done);
  const todayList = L.sortTasks(open.filter((t) => t.target && t.target <= today || (t.deadline && t.deadline.slice(0, 10) <= today)));
  const doneToday = tasks().filter((t) => t.done && t.doneAt && L.dayKey(new Date(t.doneAt)) === today);
  const soon = L.sortTasks(open.filter((t) => !todayList.includes(t) && t.target && L.daysBetween(today, t.target) <= 7));
  const dls = L.sortTasks(open.filter((t) => t.deadline)).slice(0, 6);
  const ev = events(); const tot = L.totals(ev); const lv = L.levelFor(tot.score); const st = L.currentStreak(ev);
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return `
  <p class="muted small" style="margin:0 0 12px">${dateLine} · ${open.length} open${todayList.length ? ` · <b style="color:var(--ink)">${todayList.length} for today</b>` : ""}</p>
  ${quoteHtml()}
  <div class="stats">
    <button class="stat" data-nav="progress" style="text-align:left"><b class="num">${tot.balance}</b><span>points</span></button>
    <button class="stat" data-nav="progress" style="text-align:left"><b class="num">${st}${st ? " 🔥" : ""}</b><span>day streak</span></button>
    <button class="stat level" data-nav="progress" style="text-align:left"><b>${esc(lv.name)}</b><span>${lv.next ? `${lv.toNext} to ${esc(lv.next.name)}` : "Top rank"}</span></button>
  </div>
  ${dls.length ? `<section class="section"><div class="section-head"><h3>Deadlines</h3></div>
    <div class="countdowns">${dls.map(cdCard).join("")}</div></section>` : ""}
  <section class="section"><div class="section-head"><h3>Today</h3><button class="link" data-nav="tasks">All tasks</button></div>
    ${listOf([...todayList, ...doneToday], `<b>Nothing due today.</b>Tap + to plan something, or pull a task forward from “Coming up”.`)}</section>
  ${soon.length ? `<section class="section"><div class="section-head"><h3>Coming up · next 7 days</h3></div>${listOf(soon, "")}</section>` : ""}`;
}
function cdCard(t) {
  const c = L.countdown(t.deadline);
  return `<button class="cd ${c.late ? "late" : c.soon ? "soon" : ""}" data-act="open" data-id="${t.id}">
    <span class="big num">${c.late ? "−" : ""}${c.big}<small>${c.unit}</small></span>
    <span class="t">${esc(t.title)}</span><span class="d">${c.late ? "Deadline passed" : esc(L.prettyDeadline(t.deadline))}</span></button>`;
}

function viewTasks() {
  let list = tasks();
  if (ui.filter !== "All") list = list.filter((t) => t.tag === ui.filter);
  const open = L.sortTasks(list.filter((t) => !t.done), ui.sort);
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return `
  <div class="toolbar"><h2>Tasks</h2>
    <select class="plain" id="sort" aria-label="Sort tasks">
      ${[["date", "By date"], ["priority", "By priority"], ["new", "Newest first"]].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? "selected" : ""}>${l}</option>`).join("")}
    </select></div>
  <div class="filters" role="group" aria-label="Filter by tag" style="margin-top:14px">
    ${["All", ...L.TAGS].map((f) => `<button class="pill" data-act="filter" data-f="${f}" aria-pressed="${ui.filter === f}">${f}</button>`).join("")}
  </div>
  <section class="section">${listOf(open, ui.filter === "All" ? `<b>No open tasks.</b>Tap + to add your first one.` : `<b>No open ${esc(ui.filter)} tasks.</b>`)}</section>
  <section class="section"><div class="section-head"><h3>Done · ${done.length}</h3>
    ${done.length ? `<button class="link" data-act="toggle-done-list">${ui.showDone ? "Hide" : "Show"}</button>` : ""}</div>
    ${ui.showDone && done.length ? listOf(done.slice(0, 60), "") : ""}</section>`;
}

function viewCalendar() {
  const [y, m] = ui.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const today = L.dayKey();
  const all = tasks();
  const byDay = {};
  const add = (k, kind, t) => ((byDay[k] ||= []).push({ kind, t }));
  for (const t of all) {
    if (t.target) add(t.target, t.done ? "ok" : "tg", t);
    if (t.deadline) add(t.deadline.slice(0, 10), t.done ? "ok" : "dl", t);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = L.dayKey(d); const out = d.getMonth() !== m - 1;
    if (i >= 35 && out && cells.length >= 35) break;
    const items = byDay[k] || [];
    const dots = items.slice(0, 4).map((x) => `<i class="dot ${x.kind === "dl" ? "dl" : x.kind === "ok" ? "ok" : ""}"></i>`).join("");
    cells.push(`<button class="day ${out ? "out" : ""} ${k === today ? "today" : ""}" data-act="calday" data-k="${k}" aria-pressed="${ui.calDay === k}" aria-label="${L.prettyDay(k)}${items.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}"><span class="num">${d.getDate()}</span><span class="dots">${dots}</span></button>`);
  }
  const sel = byDay[ui.calDay] || [];
  const uniq = [...new Map(sel.map((x) => [x.t.id, x.t])).values()];
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(first);
  const undated = all.filter((t) => !t.done && !t.target && !t.deadline).length;
  return `
  <div class="cal-head"><h2>${title}</h2>
    <div class="btns"><button class="iconbtn" data-act="cal" data-d="-1" aria-label="Previous month">${I.left}</button>
    <button class="btn ghost small" data-act="cal-today">Today</button>
    <button class="iconbtn" data-act="cal" data-d="1" aria-label="Next month">${I.right}</button></div></div>
  <div class="cal" role="grid">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="dow">${d}</span>`).join("")}${cells.join("")}</div>
  <div class="legend"><span><i class="dot"></i>Target date</span><span><i class="dot dl"></i>Absolute deadline</span><span><i class="dot ok"></i>Done</span></div>
  <section class="section"><div class="section-head"><h3>${esc(L.prettyDay(ui.calDay))}</h3><button class="link" data-act="new-on-day">Add task this day</button></div>
    ${listOf(L.sortTasks(uniq), "<b>Nothing on this day.</b>")}
    ${undated ? `<p class="muted small" style="margin:0">${undated} open task${undated > 1 ? "s have" : " has"} no date and ${undated > 1 ? "aren’t" : "isn’t"} shown here.</p>` : ""}
  </section>`;
}

function chartSvg(weeks) {
  const W = 380, H = 170, padL = 26, padB = 22, padT = 16;
  const max = Math.max(10, ...weeks.map((w) => w.pts)), min = Math.min(0, ...weeks.map((w) => w.pts));
  const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(v))))); return Math.ceil(v / p) * p; };
  const top = nice(max), bot = min < 0 ? -nice(-min) : 0;
  const y = (v) => padT + (H - padT - padB) * (top - v) / (top - bot);
  const bw = (W - padL) / weeks.length;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = { format: (d) => `${d.getDate()} ${MON[d.getMonth()]}` };
  let g = `<line class="grid" x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><line class="grid" x1="${padL}" x2="${W}" y1="${y(top)}" y2="${y(top)}" stroke-dasharray="3 4"/>
    <text x="${padL - 6}" y="${y(top) + 4}" text-anchor="end">${top}</text><text x="${padL - 6}" y="${y(0) + 4}" text-anchor="end">0</text>`;
  if (bot < 0) g += `<text x="${padL - 6}" y="${y(bot) + 4}" text-anchor="end">${bot}</text>`;
  weeks.forEach((w, i) => {
    const x = padL + i * bw + bw * 0.2, bwi = bw * 0.6;
    const y0 = y(Math.max(0, w.pts)), h = Math.abs(y(w.pts) - y(0));
    const cls = i === weeks.length - 1 ? "barnow" : w.pts < 0 ? "barneg" : "barpos";
    if (w.pts !== 0) g += `<rect class="${cls}" x="${x}" y="${y0}" width="${bwi}" height="${Math.max(2, h)}" rx="3"/>`;
    g += `<text class="val" x="${x + bwi / 2}" y="${w.pts < 0 ? y(w.pts) + 13 : y0 - 5}" text-anchor="middle">${w.pts || ""}</text>`;
    g += `<text x="${x + bwi / 2}" y="${H - 6}" text-anchor="middle">${i === weeks.length - 1 ? "Now" : fmt.format(w.start)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per week, last ${weeks.length} weeks">${g}</svg>`;
}

function viewProgress() {
  const ev = events(); const tot = L.totals(ev); const lv = L.levelFor(tot.score);
  const st = L.currentStreak(ev); const best = L.bestStreak(L.completionDays(ev));
  const ms = L.monthSummary(ui.progMonth, Object.values(S.tasks), ev);
  const [py, pm] = ui.progMonth.split("-").map(Number);
  const prevKey = L.monthKey(new Date(py, pm - 2, 1));
  const prev = L.monthSummary(prevKey, Object.values(S.tasks), ev);
  const mName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(py, pm - 1, 1));
  const isNow = ui.progMonth === L.monthKey();
  const diff = ms.points - prev.points;
  const line = ms.done
    ? `You completed <b>${ms.done}</b> task${ms.done > 1 ? "s" : ""} on <b>${ms.activeDays}</b> day${ms.activeDays > 1 ? "s" : ""}${ms.onTimePct !== null ? `, <b>${ms.onTimePct}%</b> of dated tasks on time` : ""}. ${ms.topTag ? `Most of it was <b>${esc(ms.topTag)}</b>. ` : ""}Net <b>${ms.points >= 0 ? "+" : ""}${ms.points}</b> points, ${diff === 0 ? "the same as" : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than`} the month before.${ms.snoozes ? ` ${ms.snoozes} snooze${ms.snoozes > 1 ? "s" : ""}.` : ""}${ms.misses ? ` ${ms.misses} missed deadline${ms.misses > 1 ? "s" : ""}.` : ""}`
    : isNow ? "No completed tasks yet this month. The first one starts the count." : "No completed tasks this month.";
  const hist = [...ev].reverse().slice(0, 25);
  const nameOf = (e) => e.type === "redeem" ? S.rewards[e.rewardId]?.name || "Reward" : S.tasks[e.taskId]?.title || "Deleted task";
  return `
  <h2>Progress</h2>
  <section class="section"><div class="card levelcard">
    <h3>Rank</h3><div class="rank">${esc(lv.name)}</div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lv.pct * 100)}"><i style="width:${Math.round(lv.pct * 100)}%"></i></div>
    <span class="muted small">${lv.next ? `${lv.toNext} points to ${esc(lv.next.name)}` : "You reached the top rank."} · Lifetime score ${tot.score}</span>
  </div></section>
  <section class="section"><div class="card kv">
    <div><b>${tot.balance}</b><span>Points to spend</span></div>
    <div><b>${st}</b><span>Current streak (days)</span></div>
    <div><b>${best}</b><span>Best streak</span></div>
  </div></section>
  <section class="section"><h3>Points per week</h3><div class="card">${chartSvg(L.weekly(ev, 8))}</div></section>
  <section class="section"><div class="section-head"><h3>Monthly summary</h3>
    <div class="month-pick"><button class="iconbtn" data-act="pm" data-d="-1" aria-label="Previous month">${I.left}</button>
    <button class="iconbtn" data-act="pm" data-d="1" aria-label="Next month" ${isNow ? "disabled" : ""}>${I.right}</button></div></div>
    <div class="card" style="display:flex;flex-direction:column;gap:14px">
      <h2>${mName}</h2>
      <p class="summary-line" style="margin:0">${line}</p>
      <div class="kv"><div><b>${ms.done}</b><span>Completed</span></div><div><b>${ms.onTimePct === null ? "–" : ms.onTimePct + "%"}</b><span>On time</span></div>
        <div><b>${ms.points >= 0 ? "+" : ""}${ms.points}</b><span>Net points</span></div><div><b>${ms.bestStreak}</b><span>Longest streak</span></div></div>
      ${Object.keys(ms.tagCount).length ? `<div class="btns">${Object.entries(ms.tagCount).map(([k, v]) => `<span class="chip">${esc(k)} · ${v}</span>`).join("")}</div>` : ""}
    </div></section>
  <section class="section"><div class="section-head"><h3>Rewards</h3><button class="link" data-act="reward-new">Add a reward</button></div>
    <div class="list">${rewards().length ? rewards().map((r) => `<div class="reward"><span class="name">${esc(r.name)}</span><span class="pts num">${r.cost}</span>
      <button class="btn small ${tot.balance >= r.cost ? "gold" : "ghost"}" data-act="redeem" data-id="${r.id}" ${tot.balance >= r.cost ? "" : "disabled"}>${tot.balance >= r.cost ? "Redeem" : `${r.cost - tot.balance} to go`}</button></div>`).join("")
      : `<div class="empty"><b>No rewards yet.</b>Set a treat to work towards, e.g. “Concert ticket · 300 points”.</div>`}</div>
    ${rewards().length ? `<button class="link" data-act="reward-manage" style="align-self:flex-start">Edit rewards</button>` : ""}</section>
  <section class="section history"><h3>Recent points</h3>
    <div class="list">${hist.length ? hist.map((e) => `<div class="row"><div class="main" style="pointer-events:none"><span class="title" style="font-weight:500">${esc(L.EVENT_LABEL[e.type] || e.type)}</span><span class="meta">${esc(nameOf(e))} · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(e.at))}</span></div>
      <span class="pts ${e.pts >= 0 ? "pos" : "neg"}">${e.pts >= 0 ? "+" : ""}${e.pts}</span></div>`).join("") : `<div class="empty">Points appear here as you complete tasks.</div>`}</div></section>`;
}

function viewSettings() {
  const P = S.settings.points;
  const notif = "Notification" in window ? Notification.permission : "unsupported";
  const pointRow = (k, label, help) => `<div class="field"><label for="pt-${k}">${label}</label><input type="number" id="pt-${k}" data-pt="${k}" value="${P[k]}" inputmode="numeric"><small>${help}</small></div>`;
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${S.settings.morningHour === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const theme = (() => { try { return localStorage.getItem("gj-theme") || "system"; } catch { return "system"; } })();
  return `
  <h2>Settings</h2>
  <section class="section"><h3>Reminders</h3><div class="card settings-group">
    ${notif === "granted"
      ? `<p class="note">Notifications are on for this device.${Sync.enabled && Sync.state.phase === "synced" ? (Sync.state.push || localStorage.getItem("gj-push") ? " Reminders arrive even when the app is closed." : "") : " Without sync, reminders show when you open the app."}</p>`
      : notif === "unsupported" ? `<p class="note warn">This browser can’t show notifications. On Android, open the app from Chrome and install it to the home screen.</p>`
      : `<div class="btns"><button class="btn" data-act="notif">Turn on notifications</button></div>`}
    <div class="field"><label for="mh">Morning summary at</label><select class="input" id="mh">${hours}</select><small>Lists today’s tasks and upcoming deadlines.</small></div>
    <div class="field"><span class="lbl">Countdown alerts before an absolute deadline</span>
      <div class="seg" role="group">${[14, 7, 3, 2, 1].map((d) => `<button data-act="alertday" data-d="${d}" aria-pressed="${S.settings.alertDays.includes(d)}">${d} day${d > 1 ? "s" : ""}</button>`).join("")}</div></div>
    <div class="toggle-line"><span><b>Overdue nudge</b><br><small class="muted">A daily reminder about tasks past their date.</small></span>
      <label class="switch"><input type="checkbox" id="od" ${S.settings.overdue ? "checked" : ""} aria-label="Overdue nudge"><span></span></label></div>
    ${notif === "granted" ? `<button class="btn ghost small" data-act="test-notif" style="align-self:flex-start">Send a test notification</button>` : ""}
  </div></section>

  <section class="section"><h3>Sync and encryption</h3><div class="card settings-group">${syncPanel()}</div></section>

  <section class="section"><h3>Points</h3><div class="card settings-group"><div class="grid2">
    ${pointRow("done", "Task completed", "Every completion")}
    ${pointRow("ontime", "On-time bonus", "Done by the target date and before the deadline")}
    ${pointRow("high", "High-priority bonus", "Extra for high-priority tasks")}
    ${pointRow("snooze", "Snooze", "Use a negative number")}
    ${pointRow("miss", "Missed deadline", "Charged once when an absolute deadline passes")}
    ${pointRow("streak", "Daily streak bonus", "Once a day while the streak lasts")}
    ${pointRow("streakMin", "Streak bonus starts at", "Days in a row")}
  </div><button class="link" data-act="pts-reset" style="align-self:flex-start">Reset to defaults</button></div></section>

  <section class="section"><h3>Appearance</h3><div class="card"><div class="seg" role="group" aria-label="Theme">
    ${[["system", "Match phone"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join("")}</div></div></section>

  <section class="section"><h3>Backup</h3><div class="card settings-group">
    <p class="small muted" style="margin:0">A backup file holds everything in readable form. Keep it somewhere private.</p>
    <div class="btns"><button class="btn ghost small" data-act="export">Download backup</button>
    <label class="btn ghost small" for="imp" style="cursor:pointer">Restore from backup</label><input type="file" id="imp" accept="application/json,.json" hidden></div>
  </div></section>
  <p class="muted small" style="margin-top:28px">GO JESSIE! · ${QUOTES.length} quotes · ${tasks().length} tasks</p>`;
}

function syncPanel() {
  if (!Sync.enabled) return `<p class="note">Sync is off. Everything is saved on this device only. To sync your phone and browser, add your Firebase settings as described in the setup guide.</p>`;
  const st = Sync.state;
  const err = st.error ? `<p class="note warn">${esc(st.error)}</p>` : "";
  switch (st.phase) {
    case "loading": return `<p class="muted">Connecting…</p>`;
    case "offline-unverified": return err || `<p class="note">Offline. Changes are saved on this device.</p>`;
    case "signed-out": return `${err}<p class="small" style="margin:0">Sign in with your email to sync this device. You’ll get a link; open it on this device.</p>
      <form id="f-email" class="settings-group"><div class="field"><label for="em">Email</label><input type="email" id="em" required autocomplete="email" value="${esc(localStorage.getItem("gj-email") || "")}"></div>
      <button class="btn" type="submit">Email me a sign-in link</button></form>`;
    case "link-needs-email": return `<p class="small" style="margin:0">Confirm the email address you requested the link with.</p>
      <form id="f-link" class="settings-group"><div class="field"><label for="em2">Email</label><input type="email" id="em2" required autocomplete="email"></div><button class="btn" type="submit">Finish signing in</button></form>`;
    case "needs-setup": return `${err}<p class="small" style="margin:0">Signed in as <b>${esc(st.email)}</b>. Choose a passphrase to encrypt your tasks. You’ll type it once on each new device.</p>
      <p class="note warn">If you forget the passphrase and lose the recovery code, your synced tasks can’t be recovered by anyone.</p>
      <form id="f-setup" class="settings-group"><div class="field"><label for="pp1">Passphrase</label><input type="password" id="pp1" minlength="8" required autocomplete="new-password"><small>At least 8 characters. A short sentence is easiest to remember.</small></div>
      <div class="field"><label for="pp2">Repeat passphrase</label><input type="password" id="pp2" minlength="8" required autocomplete="new-password"></div>
      <button class="btn" type="submit">Turn on encrypted sync</button></form>`;
    case "needs-unlock": return `${err}<p class="small" style="margin:0">Signed in as <b>${esc(st.email)}</b>. Enter your passphrase to unlock your tasks on this device.</p>
      <form id="f-unlock" class="settings-group"><div class="field"><label for="up">Passphrase</label><input type="password" id="up" required autocomplete="current-password"></div>
      <div class="btns"><button class="btn" type="submit">Unlock</button><button class="btn ghost" type="button" data-act="use-recovery">Use recovery code instead</button></div></form>`;
    case "synced": return `${err}<p class="small" style="margin:0"><b style="color:var(--blue)">Synced and encrypted.</b> Signed in as ${esc(st.email)}. Task names, notes, tags and rewards are encrypted before they leave this device; dates stay readable so reminders know when to fire.</p>
      <div class="btns"><button class="btn ghost small" data-act="change-pass">Change passphrase</button><button class="btn ghost small" data-act="signout">Sign out on this device</button></div>`;
  }
  return err;
}

// ---------------- sheets ----------------
function openSheet(html, onMount) {
  $("#sheet-root").innerHTML = `<div class="overlay" data-act="overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow = "hidden";
  onMount?.($("#sheet-root .sheet"));
  setTimeout(() => $("#sheet-root [autofocus]")?.focus() || $("#sheet-root .sheet button")?.focus(), 30);
}
function closeSheet() { $("#sheet-root").innerHTML = ""; document.body.style.overflow = ""; }
const sheetOpen = () => !!$("#sheet-root .overlay");

function taskForm(t = null, preset = {}) {
  const v = t || { title: "", notes: "", tag: preset.tag || (ui.filter !== "All" ? ui.filter : "Work"), priority: "normal", target: preset.target ?? L.dayKey(), deadline: null };
  const today = L.dayKey();
  openSheet(`
    <div class="sheet-head"><h2>${t ? "Edit task" : "New task"}</h2><button class="iconbtn" data-act="close" aria-label="Close">${I.x}</button></div>
    <form id="f-task" class="settings-group" data-id="${t ? t.id : ""}">
      <div class="field"><label for="tt">Task</label><input type="text" id="tt" required maxlength="200" value="${esc(v.title)}" autofocus placeholder="e.g. Send press kit to Wiener Konzerthaus"></div>
      <div class="field"><span class="lbl">Tag</span><div class="seg" id="tag-seg">${L.TAGS.map((g) => `<button type="button" data-v="${g}" aria-pressed="${v.tag === g}">${g}</button>`).join("")}</div></div>
      <div class="field"><span class="lbl">Priority</span><div class="seg" id="pr-seg">${[["low", "Low"], ["normal", "Normal"], ["high", "High"]].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${v.priority === k}">${l}</button>`).join("")}</div></div>
      <div class="field"><label for="tg">Do it by</label><input type="date" id="tg" value="${v.target || ""}">
        <div class="seg" id="tg-quick"><button type="button" data-v="${today}">Today</button><button type="button" data-v="${L.addDays(today, 1)}">Tomorrow</button><button type="button" data-v="${L.addDays(today, 7)}">In a week</button><button type="button" data-v="">No date</button></div></div>
      <div class="toggle-line"><span><b>Absolute deadline</b><br><small class="muted">The hard cut-off, e.g. an application deadline.</small></span>
        <label class="switch"><input type="checkbox" id="dl-on" ${v.deadline ? "checked" : ""} aria-label="Absolute deadline"><span></span></label></div>
      <div class="field" id="dl-field" ${v.deadline ? "" : "hidden"}><label for="dl">Must be done before</label><input type="datetime-local" id="dl" value="${v.deadline || ""}"></div>
      <div class="field"><label for="nt">Notes</label><textarea id="nt" maxlength="4000" placeholder="Links, contacts, details…">${esc(v.notes || "")}</textarea></div>
      <div class="btns"><button class="btn" type="submit">${t ? "Save changes" : "Add task"}</button><button class="btn ghost" type="button" data-act="close">Cancel</button></div>
    </form>`, (root) => {
    const segPick = (id) => root.querySelector(`#${id}`).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      root.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", x === b));
    });
    segPick("tag-seg"); segPick("pr-seg");
    root.querySelector("#tg-quick").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) root.querySelector("#tg").value = b.dataset.v; });
    root.querySelector("#dl-on").addEventListener("change", (e) => {
      root.querySelector("#dl-field").hidden = !e.target.checked;
      const dl = root.querySelector("#dl");
      if (e.target.checked && !dl.value) dl.value = `${root.querySelector("#tg").value || L.addDays(today, 7)}T23:59`;
    });
  });
}
function submitTask(form) {
  const id = form.dataset.id;
  const val = (s) => form.querySelector(s).value.trim();
  const pick = (s) => form.querySelector(`${s} [aria-pressed="true"]`)?.dataset.v;
  const title = val("#tt"); if (!title) return;
  const deadline = form.querySelector("#dl-on").checked && val("#dl") ? val("#dl") : null;
  const base = id ? S.tasks[id] : { id: L.uid(), created: Date.now(), done: false, doneAt: null, completions: 0, snoozes: 0 };
  putTask({ ...base, title, notes: val("#nt"), tag: pick("#tag-seg") || null, priority: pick("#pr-seg") || "normal", target: val("#tg") || null, deadline });
  closeSheet(); toast(id ? "Saved" : "Task added"); render();
}

function taskDetail(id) {
  const t = S.tasks[id]; if (!t) return;
  const w = L.whenInfo(t);
  openSheet(`
    <div class="sheet-head"><div class="btns">${t.tag ? `<span class="chip">${esc(t.tag)}</span>` : ""}${t.priority !== "normal" ? `<span class="chip ${t.priority}">${t.priority === "high" ? "High" : "Low"}</span>` : ""}</div>
      <button class="iconbtn" data-act="close" aria-label="Close">${I.x}</button></div>
    <div class="detail-title">${esc(t.title)}</div>
    ${t.deadline && !t.done ? (() => { const c = L.countdown(t.deadline); return `<div class="cd ${c.late ? "late" : c.soon ? "soon" : ""}" style="pointer-events:none"><span class="big num">${c.late ? "−" : ""}${c.big}<small>${c.unit}</small></span><span class="d">${c.late ? "past the deadline" : "until the deadline"} · ${esc(c.text)}</span></div>`; })() : ""}
    <dl class="factlist">
      <dt>Do it by</dt><dd>${t.target ? `${esc(L.prettyDay(t.target))} · ${esc(L.targetLabel(t.target))}` : "No date"}</dd>
      <dt>Deadline</dt><dd>${t.deadline ? esc(L.prettyDeadline(t.deadline)) : "None"}</dd>
      <dt>Status</dt><dd>${t.done ? esc(w.text) : "Open"}${t.snoozes ? ` · snoozed ${t.snoozes}×` : ""}</dd>
    </dl>
    ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ""}
    <div class="btns">
      <button class="btn ${t.done ? "ghost" : ""}" data-act="toggle-close" data-id="${t.id}">${t.done ? "Mark as not done" : `${I.check.replace('stroke-width="3.2"', 'stroke-width="3" width="16" height="16"')} Mark done`}</button>
      <button class="btn ghost" data-act="edit" data-id="${t.id}">Edit</button>
    </div>
    ${!t.done ? `<div class="field"><span class="lbl">Snooze · ${S.settings.points.snooze} points</span>
      <div class="seg"><button data-act="snooze" data-id="${t.id}" data-d="1">1 day</button><button data-act="snooze" data-id="${t.id}" data-d="3">3 days</button><button data-act="snooze" data-id="${t.id}" data-d="7">1 week</button></div>
      ${t.deadline ? `<small>Snoozing moves the “do it by” date. The absolute deadline stays.</small>` : ""}</div>` : ""}
    <div id="del-zone"><button class="link" data-act="del-ask" data-id="${t.id}" style="color:var(--overdue)">Delete task</button></div>`);
}

function rewardForm(r = null) {
  openSheet(`<div class="sheet-head"><h2>${r ? "Edit reward" : "New reward"}</h2><button class="iconbtn" data-act="close" aria-label="Close">${I.x}</button></div>
    <form id="f-reward" class="settings-group" data-id="${r ? r.id : ""}">
      <div class="field"><label for="rn">Reward</label><input type="text" id="rn" required maxlength="120" value="${esc(r?.name || "")}" autofocus placeholder="e.g. Philharmonie ticket"></div>
      <div class="field"><label for="rc">Cost in points</label><input type="number" id="rc" required min="1" value="${r?.cost || 200}" inputmode="numeric"></div>
      <div class="btns"><button class="btn" type="submit">${r ? "Save" : "Add reward"}</button>${r ? `<button class="btn danger" type="button" data-act="reward-del" data-id="${r.id}">Delete</button>` : ""}</div>
    </form>`);
}
function rewardManage() {
  openSheet(`<div class="sheet-head"><h2>Edit rewards</h2><button class="iconbtn" data-act="close" aria-label="Close">${I.x}</button></div>
    <div class="list">${rewards().map((r) => `<div class="reward"><span class="name">${esc(r.name)}</span><span class="pts num">${r.cost}</span><button class="btn ghost small" data-act="reward-edit" data-id="${r.id}">Edit</button></div>`).join("")}</div>`);
}

// ---------------- notifications ----------------
let swReg = null;
function digest() {
  const today = L.dayKey(); const lines = []; const alerts = [];
  const open = tasks().filter((t) => !t.done);
  const due = L.sortTasks(open.filter((t) => (t.target && t.target <= today) || (t.deadline && L.daysBetween(today, t.deadline.slice(0, 10)) <= 7)));
  for (const t of due.slice(0, 6)) {
    const bits = [];
    if (t.deadline) { const n = L.daysBetween(today, t.deadline.slice(0, 10)); bits.push(n < 0 ? "deadline passed" : n === 0 ? "deadline today" : `${n}d to deadline`); }
    else if (t.target < today) bits.push("overdue");
    lines.push(`${t.title}${bits.length ? ` (${bits.join(", ")})` : ""}`);
  }
  for (const t of open) if (t.deadline) {
    const n = L.daysBetween(today, t.deadline.slice(0, 10));
    if (S.settings.alertDays.includes(n)) alerts.push({ id: t.id, title: `${n} day${n > 1 ? "s" : ""} left`, body: `${t.title} · deadline ${L.prettyDeadline(t.deadline)}` });
  }
  const overdue = open.filter((t) => t.target && t.target < today);
  return { lines, alerts, overdue, count: due.length };
}
async function showNote(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: "./#home" } };
  try { if (swReg) await swReg.showNotification(title, opts); else new Notification(title, opts); } catch {}
}
// Local reminders: used when sync/push isn't set up (or as a same-day fallback while the app is open).
function localReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (Sync.enabled && (Sync.state.push || localStorage.getItem("gj-push"))) return; // server sends them
  const today = L.dayKey(); const shown = (() => { try { return JSON.parse(localStorage.getItem("gj-shown") || "{}"); } catch { return {}; } })();
  if (new Date().getHours() < S.settings.morningHour) return;
  const d = digest();
  const mark = (k) => { shown[k] = today; };
  if (shown.summary !== today && d.count) { showNote(`GO JESSIE! · ${d.count} on your list`, d.lines.join("\n"), "summary"); mark("summary"); }
  for (const a of d.alerts) if (shown["a" + a.id] !== today) { showNote(a.title, a.body, "a" + a.id); mark("a" + a.id); }
  if (S.settings.overdue && d.overdue.length && shown.overdue !== today) {
    showNote(`${d.overdue.length} task${d.overdue.length > 1 ? "s" : ""} past due`, d.overdue.slice(0, 5).map((t) => t.title).join("\n"), "overdue"); mark("overdue");
  }
  try { localStorage.setItem("gj-shown", JSON.stringify(shown)); } catch {}
}

// ---------------- events ----------------
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { go(nav.dataset.nav); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act, id = a.dataset.id;
  if (act === "overlay" && e.target !== a) return;
  switch (act) {
    case "new": taskForm(); break;
    case "new-on-day": taskForm(null, { target: ui.calDay }); break;
    case "toggle": toggleDone(id); break;
    case "toggle-close": closeSheet(); toggleDone(id); break;
    case "open": taskDetail(id); break;
    case "edit": taskForm(S.tasks[id]); break;
    case "close": case "overlay": closeSheet(); break;
    case "snooze": snooze(id, +a.dataset.d); break;
    case "del-ask": $("#del-zone").innerHTML = `<div class="confirm"><b>Delete this task?</b><span class="small muted">Points you already earned or lost stay.</span><div class="btns"><button class="btn danger small" data-act="del" data-id="${id}">Delete</button><button class="btn ghost small" data-act="open" data-id="${id}">Keep it</button></div></div>`; break;
    case "del": putTask({ ...S.tasks[id], deleted: true }); closeSheet(); toast("Task deleted"); render(); break;
    case "filter": ui.filter = a.dataset.f; render(); break;
    case "toggle-done-list": ui.showDone = !ui.showDone; render(); break;
    case "q-prev": nextQuote(-1); break;
    case "q-next": nextQuote(1); break;
    case "cal": { const [y, m] = ui.calMonth.split("-").map(Number); ui.calMonth = L.monthKey(new Date(y, m - 1 + +a.dataset.d, 1)); render(); break; }
    case "cal-today": ui.calMonth = L.monthKey(); ui.calDay = L.dayKey(); render(); break;
    case "calday": ui.calDay = a.dataset.k; if (a.dataset.k.slice(0, 7) !== ui.calMonth) ui.calMonth = a.dataset.k.slice(0, 7); render(); break;
    case "pm": { const [y, m] = ui.progMonth.split("-").map(Number); const k = L.monthKey(new Date(y, m - 1 + +a.dataset.d, 1)); if (k <= L.monthKey()) ui.progMonth = k; render(); break; }
    case "reward-new": rewardForm(); break;
    case "reward-manage": rewardManage(); break;
    case "reward-edit": rewardForm(S.rewards[id]); break;
    case "reward-del": putReward({ ...S.rewards[id], deleted: true }); closeSheet(); render(); break;
    case "redeem": {
      const r = S.rewards[id]; const bal = L.totals(events()).balance; if (!r || bal < r.cost) break;
      putEvents([{ id: "r" + L.uid(), type: "redeem", pts: -r.cost, at: Date.now(), rewardId: r.id }]);
      toast(`Enjoy it: ${esc(r.name)} · <span class="p">−${r.cost}</span>`); render(); break;
    }
    case "alertday": { const d = +a.dataset.d; const s = new Set(S.settings.alertDays); s.has(d) ? s.delete(d) : s.add(d); putSettings({ alertDays: [...s].sort((x, y) => y - x) }); render(); break; }
    case "pts-reset": putSettings({ points: { ...L.DEFAULT_POINTS } }); render(); toast("Point values reset"); break;
    case "theme": setTheme(a.dataset.v); render(); break;
    case "notif": await askNotifications(); render(); break;
    case "test-notif": showNote("GO JESSIE!", "Notifications work. 加油！", "test"); break;
    case "export": exportData(); break;
    case "signout": await Sync.signOut(); render(); break;
    case "use-recovery": $("#f-unlock").outerHTML = `<form id="f-recover" class="settings-group"><div class="field"><label for="rcv">Recovery code</label><input type="text" id="rcv" required autocomplete="off" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"></div><button class="btn" type="submit">Unlock</button></form>`; break;
    case "change-pass": openSheet(`<div class="sheet-head"><h2>Change passphrase</h2><button class="iconbtn" data-act="close" aria-label="Close">${I.x}</button></div>
      <form id="f-change" class="settings-group"><div class="field"><label for="op">Current passphrase or recovery code</label><input type="password" id="op" required></div>
      <div class="field"><label for="np">New passphrase</label><input type="password" id="np" minlength="8" required autocomplete="new-password"></div>
      <p class="small muted" style="margin:0">Other devices stay unlocked. Your recovery code doesn’t change.</p><button class="btn" type="submit">Change passphrase</button></form>`); break;
  }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; const btn = f.querySelector('[type="submit"]'); const busy = (b) => btn && (btn.disabled = b);
  try {
    if (f.id === "f-task") submitTask(f);
    else if (f.id === "f-reward") {
      const id = f.dataset.id; const name = f.querySelector("#rn").value.trim(); const cost = Math.max(1, Math.round(+f.querySelector("#rc").value || 0));
      if (!name) return;
      putReward({ ...(id ? S.rewards[id] : { id: L.uid(), created: Date.now() }), name, cost }); closeSheet(); render();
    } else if (f.id === "f-email") {
      busy(true); const email = f.querySelector("#em").value.trim(); await Sync.sendLink(email);
      f.outerHTML = `<p class="note">Link sent to <b>${esc(email)}</b>. Open it on this device. Check spam if it doesn’t arrive within a minute.</p>`;
    } else if (f.id === "f-link") { busy(true); await Sync.completeLink(f.querySelector("#em2").value.trim()); }
    else if (f.id === "f-setup") {
      const p1 = f.querySelector("#pp1").value, p2 = f.querySelector("#pp2").value;
      if (p1 !== p2) { toast("The passphrases don’t match"); return; }
      busy(true); const code = await Sync.setupPassphrase(p1);
      openSheet(`<h2>Your recovery code</h2><p style="margin:0">If you ever forget your passphrase, this code unlocks your tasks. Write it down or save it in your password manager now. It won’t be shown again.</p>
        <div class="code">${esc(code)}</div><button class="btn" data-act="close">I’ve saved it</button>`);
      render();
    } else if (f.id === "f-unlock") { busy(true); await Sync.unlockWith(f.querySelector("#up").value, false); toast("Unlocked"); }
    else if (f.id === "f-recover") { busy(true); await Sync.unlockWith(f.querySelector("#rcv").value, true); toast("Unlocked. You can now set a new passphrase."); }
    else if (f.id === "f-change") {
      busy(true); const old = f.querySelector("#op").value;
      const isCode = /^[A-Z0-9]{5}-?[A-Z0-9]{5}-?[A-Z0-9]{5}-?[A-Z0-9]{5}$/i.test(old.trim());
      await Sync.changePassphrase(old, f.querySelector("#np").value, isCode); closeSheet(); toast("Passphrase changed");
    }
  } catch (err) { busy(false); toast(esc(err.message || "Something went wrong. Try again.")); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "sort") { ui.sort = t.value; render(); }
  else if (t.dataset.pt) { const v = Math.round(+t.value); if (Number.isFinite(v)) putSettings({ points: { ...S.settings.points, [t.dataset.pt]: v } }); }
  else if (t.id === "mh") putSettings({ morningHour: +t.value });
  else if (t.id === "od") putSettings({ overdue: t.checked });
  else if (t.id === "imp" && t.files[0]) importData(t.files[0]);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen()) closeSheet(); });

function go(v) {
  ui.view = v; closeSheet();
  if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  render(); window.scrollTo(0, 0);
}

// ---------------- theme / backup / notifications ----------------
function setTheme(v) {
  try { localStorage.setItem("gj-theme", v); } catch {}
  v === "system" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.setAttribute("data-theme", v);
}
async function askNotifications() {
  if (!("Notification" in window)) return;
  const p = await Notification.requestPermission();
  if (p !== "granted") { toast("Notifications are blocked. Allow them in your phone’s app settings."); return; }
  if (Sync.enabled && Sync.state.phase === "synced" && swReg) {
    try { (await Sync.enablePush(swReg)) ? toast("Reminders are on, even when the app is closed") : toast("Notifications on while the app is open"); }
    catch { toast("Couldn’t register for reminders. Check the setup guide (VAPID key)."); }
  } else toast("Notifications on");
  localReminders();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ app: "GO JESSIE!", exported: new Date().toISOString(), ...S }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `go-jessie-backup-${L.dayKey()}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d.tasks || !d.events) throw new Error();
    for (const k of ["tasks", "events", "rewards"]) for (const it of Object.values(d[k] || {})) {
      const cur = S[k][it.id];
      if (!cur || (it.updated || 0) > (cur.updated || 0)) { S[k][it.id] = it; Sync.write(k, it); }
    }
    save(); toast("Backup restored"); render();
  } catch { toast("That file isn’t a GO JESSIE! backup"); }
}

// ---------------- sync wiring ----------------
let rT = null;
const softRender = () => { clearTimeout(rT); rT = setTimeout(() => { if (!sheetOpen() || ui.view !== "settings") render(); }, 120); };
Sync.init({
  status: () => { softRender(); },
  remote: (kind, item) => {
    if (kind === "settings") {
      if ((item.updated || 0) > (S.settings.updated || 0)) S.settings = { ...S.settings, ...item, points: { ...L.DEFAULT_POINTS, ...item.points } };
      else if ((item.updated || 0) < (S.settings.updated || 0)) Sync.write("settings", S.settings);
    }
    else { const cur = S[kind][item.id]; if (!cur || kind === "events" || (item.updated || 0) >= (cur.updated || 0)) S[kind][item.id] = item; }
    save(); softRender();
  },
  localItems: (kind) => kind === "settings" ? S.settings : Object.values(S[kind]),
});
// keep the timezone current for server reminders
if (S.settings.tz !== L.DEFAULT_SETTINGS.tz) putSettings({ tz: L.DEFAULT_SETTINGS.tz });

// ---------------- boot ----------------
try { const th = localStorage.getItem("gj-theme"); if (th && th !== "system") document.documentElement.setAttribute("data-theme", th); } catch {}
const start = (location.hash || "#home").slice(1);
ui.view = NAV.some(([v]) => v === start) ? start : "home";
checkMisses();
render();
setInterval(() => { checkMisses(); if (!sheetOpen() && (ui.view === "home" || ui.view === "tasks")) render(); localReminders(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkMisses(); localReminders(); if (!sheetOpen()) render(); } });

if ("serviceWorker" in navigator && !window.GJ_PREVIEW) {
  navigator.serviceWorker.register("sw.js").then(async (r) => {
    swReg = await navigator.serviceWorker.ready; localReminders();
  }).catch(() => {});
} else setTimeout(localReminders, 1000);
