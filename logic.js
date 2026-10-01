// Pure logic: dates, countdowns, points, streaks, levels, summaries. No DOM here.

export const TAGS = ["Daily", "Work", "Admin", "Goal"];
export const PRIORITIES = ["low", "normal", "high"];

export const DEFAULT_POINTS = { done: 10, ontime: 5, high: 5, snooze: -5, miss: -10, streak: 5, streakMin: 3 };
export const DEFAULT_SETTINGS = {
  points: { ...DEFAULT_POINTS },
  morningHour: 8,
  alertDays: [7, 3, 1],
  overdue: true,
  tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Berlin"; } })(),
  updated: 0,
};

// Ranks borrowed from the orchestra pit and the concert hall.
export const LEVELS = [
  { name: "Novice", at: 0 },
  { name: "Student", at: 100 },
  { name: "Répétiteur", at: 250 },
  { name: "Section Player", at: 500 },
  { name: "Principal", at: 1000 },
  { name: "Concertmaster", at: 2000 },
  { name: "Soloist", at: 3500 },
  { name: "Virtuoso", at: 5500 },
  { name: "Maestro", at: 8000 },
];

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const deadlineMs = (dl) => (dl ? new Date(dl).getTime() : null); // "YYYY-MM-DDTHH:MM", local time
export const endOfDayMs = (k) => { const d = parseDay(k); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
export const prettyDay = (k) => fmtDay.format(parseDay(k));
export const prettyDeadline = (dl) => { const d = new Date(dl); return `${fmtDay.format(d)}, ${fmtTime.format(d)}`; };

// Short relative label for a target date.
export function targetLabel(k, today = dayKey()) {
  const n = daysBetween(today, k);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days late`;
  if (n < 7) return `In ${n} days`;
  return prettyDay(k);
}

// Live countdown to an absolute deadline.
export function countdown(dl, now = Date.now()) {
  const ms = deadlineMs(dl) - now;
  const late = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / 86400000), h = Math.floor((a % 86400000) / 3600000), m = Math.floor((a % 3600000) / 60000);
  let big, unit, text;
  if (d >= 2) { big = d; unit = "days"; text = `${d}d ${h}h`; }
  else if (d === 1 || h >= 1) { big = d * 24 + h; unit = "hours"; text = `${d * 24 + h}h ${m}m`; }
  else { big = m; unit = "min"; text = `${m}m`; }
  return { ms, late, big, unit, text: late ? `${text} over` : `${text} left`, soon: !late && ms < 3 * 86400000 };
}

// What a task row shows on the right.
export function whenInfo(t, now = Date.now()) {
  const today = dayKey(new Date(now));
  if (t.done) return { text: t.doneAt ? `Done ${targetLabel(dayKey(new Date(t.doneAt)), today).toLowerCase()}` : "Done", cls: "" };
  if (t.deadline) {
    const c = countdown(t.deadline, now);
    const sub = t.target ? targetLabel(t.target, today) : "deadline";
    return { text: c.text, sub, cls: c.late ? "late" : c.soon ? "soon" : "" };
  }
  if (t.target) {
    const n = daysBetween(today, t.target);
    return { text: targetLabel(t.target, today), cls: n < 0 ? "late" : n <= 1 ? "soon" : "" };
  }
  return { text: "", cls: "" };
}

// Sort: overdue first, then nearest date, then priority.
const pr = { high: 0, normal: 1, low: 2 };
export function urgencyKey(t) {
  const dl = t.deadline ? deadlineMs(t.deadline) : Infinity;
  const tg = t.target ? endOfDayMs(t.target) : Infinity;
  return Math.min(dl, tg);
}
export function sortTasks(list, mode = "date") {
  const arr = [...list];
  if (mode === "priority") arr.sort((a, b) => pr[a.priority] - pr[b.priority] || urgencyKey(a) - urgencyKey(b));
  else if (mode === "new") arr.sort((a, b) => b.created - a.created);
  else arr.sort((a, b) => urgencyKey(a) - urgencyKey(b) || pr[a.priority] - pr[b.priority] || a.created - b.created);
  return arr;
}

// ---------- points ----------
// Completing returns the point events to record. n = completion number for this task.
export function completionEvents(t, settings, now = Date.now(), existingEvents = []) {
  const P = settings.points;
  const n = (t.completions || 0) + 1;
  const base = `c${n}-${t.id}`;
  const ev = [{ id: `${base}-done`, type: "done", pts: P.done, at: now, taskId: t.id }];
  const hasDate = t.target || t.deadline;
  const onTime = hasDate
    && (!t.target || now <= endOfDayMs(t.target))
    && (!t.deadline || now <= deadlineMs(t.deadline));
  if (onTime) ev.push({ id: `${base}-ontime`, type: "ontime", pts: P.ontime, at: now, taskId: t.id });
  if (t.priority === "high") ev.push({ id: `${base}-high`, type: "high", pts: P.high, at: now, taskId: t.id });
  // streak bonus, once per day
  const today = dayKey(new Date(now));
  const undone = new Set(existingEvents.filter((e) => e.type === "undo").map((e) => e.id.replace(/-undo$/, "")));
  const already = existingEvents.some((e) => e.type === "streak" && dayKey(new Date(e.at)) === today && !undone.has(e.id.replace(/-streak$/, "")));
  if (!already) {
    const days = completionDays(existingEvents);
    days.add(today);
    const s = streakFrom(days, today);
    if (s >= P.streakMin) ev.push({ id: `${base}-streak`, type: "streak", pts: P.streak, at: now, taskId: t.id, streak: s });
  }
  return { n, events: ev, onTime };
}

// Undoing a completion cancels exactly what that completion earned.
export function undoEvent(t, events, now = Date.now()) {
  const n = t.completions || 0;
  if (!n) return null;
  const prefix = `c${n}-${t.id}-`;
  if (events.some((e) => e.id === `${prefix}undo`)) return null;
  const sum = events.filter((e) => e.id.startsWith(prefix)).reduce((s, e) => s + e.pts, 0);
  return { id: `${prefix}undo`, type: "undo", pts: -sum, at: now, taskId: t.id };
}

export const snoozeEvent = (t, settings, now = Date.now()) =>
  ({ id: `s${(t.snoozes || 0) + 1}-${t.id}`, type: "snooze", pts: settings.points.snooze, at: now, taskId: t.id });

// Missed deadlines: one penalty per task, same id on every device so it never doubles.
export function missEvents(tasks, events, settings, now = Date.now()) {
  const have = new Set(events.map((e) => e.id));
  const out = [];
  for (const t of tasks) {
    if (t.deleted || t.done || !t.deadline) continue;
    if (deadlineMs(t.deadline) < now && !have.has(`miss-${t.id}`))
      out.push({ id: `miss-${t.id}`, type: "miss", pts: settings.points.miss, at: deadlineMs(t.deadline), taskId: t.id });
  }
  return out;
}

// Days on which at least one completion still stands (not undone).
export function completionDays(events) {
  const undone = new Set(events.filter((e) => e.type === "undo").map((e) => e.id.replace(/-undo$/, "")));
  const days = new Set();
  for (const e of events) if (e.type === "done" && !undone.has(e.id.replace(/-done$/, ""))) days.add(dayKey(new Date(e.at)));
  return days;
}
function streakFrom(days, endKey) {
  let s = 0, k = endKey;
  while (days.has(k)) { s++; k = addDays(k, -1); }
  return s;
}
// Current streak: counts today if done, otherwise stays alive from yesterday.
export function currentStreak(events, today = dayKey()) {
  const days = completionDays(events);
  return days.has(today) ? streakFrom(days, today) : streakFrom(days, addDays(today, -1));
}
export function bestStreak(days) {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) { run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  return best;
}

export function totals(events) {
  let earned = 0, spent = 0;
  for (const e of events) { if (e.type === "redeem") spent += -e.pts; else earned += e.pts; }
  return { score: earned, balance: earned - spent };
}
export function levelFor(score) {
  let i = 0;
  for (let j = 0; j < LEVELS.length; j++) if (score >= LEVELS[j].at) i = j;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  const pct = next ? Math.max(0, Math.min(1, (score - cur.at) / (next.at - cur.at))) : 1;
  return { ...cur, index: i, next, pct, toNext: next ? next.at - score : 0 };
}

// Weekly net points (excluding reward spending), last n weeks, Monday start.
export function weekly(events, n = 8, now = new Date()) {
  const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const start0 = monday(now);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) { const s = new Date(start0); s.setDate(s.getDate() - 7 * i); weeks.push({ start: s, pts: 0 }); }
  for (const e of events) {
    if (e.type === "redeem") continue;
    const w = monday(new Date(e.at)).getTime();
    const hit = weeks.find((x) => x.start.getTime() === w);
    if (hit) hit.pts += e.pts;
  }
  return weeks;
}

// Monthly summary for "YYYY-MM".
export function monthSummary(mk, tasks, events) {
  const inMonth = (ms) => monthKey(new Date(ms)) === mk;
  const undone = new Set(events.filter((e) => e.type === "undo").map((e) => e.id.replace(/-undo$/, "")));
  const live = (e) => !undone.has(e.id.replace(/-(done|ontime|high|streak)$/, ""));
  const ev = events.filter((e) => inMonth(e.at));
  const doneEv = ev.filter((e) => e.type === "done" && live(e));
  const onTime = ev.filter((e) => e.type === "ontime" && live(e)).length;
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const datedDone = doneEv.filter((e) => { const t = byId[e.taskId]; return t && (t.target || t.deadline); }).length;
  const tagCount = {};
  for (const e of doneEv) { const tag = byId[e.taskId]?.tag || "Other"; tagCount[tag] = (tagCount[tag] || 0) + 1; }
  const days = new Set(doneEv.map((e) => dayKey(new Date(e.at))));
  const net = ev.filter((e) => e.type !== "redeem").reduce((s, e) => s + e.pts, 0);
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    done: doneEv.length, onTime, datedDone, onTimePct: datedDone ? Math.round((onTime / datedDone) * 100) : null,
    snoozes: ev.filter((e) => e.type === "snooze").length, misses: ev.filter((e) => e.type === "miss").length,
    points: net, activeDays: days.size, bestStreak: bestStreak(days), tagCount, topTag,
  };
}

export const EVENT_LABEL = {
  done: "Completed", ontime: "On-time bonus", high: "High-priority bonus", streak: "Streak bonus",
  snooze: "Snoozed", miss: "Missed deadline", undo: "Completion undone", redeem: "Reward",
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 20);
