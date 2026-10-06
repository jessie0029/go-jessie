// Decides which reminders to send. Pure function so it can be tested without Firebase.
const pad = (n) => String(n).padStart(2, "0");
const toDay = (s) => s.slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.UTC(...b.split("-").map((x, i) => +x - (i === 1))) - Date.UTC(...a.split("-").map((x, i) => +x - (i === 1)))) / 86400000);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDeadline(dl) {
  const [y, m, d] = dl.slice(0, 10).split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${d} ${MON[m - 1]}, ${dl.slice(11, 16) || "23:59"}`;
}
export function localNow(tz, now = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}

export function plan({ settings = {}, tasks = [], sentDay = null, now = new Date() }) {
  const morning = Number.isFinite(settings.morningHour) ? settings.morningHour : 8;
  const alertDays = Array.isArray(settings.alertDays) ? settings.alertDays : [7, 3, 1];
  const { today, hour } = localNow(settings.tz, now);
  if (sentDay === today) return { send: false, today, reason: `Already sent today (${today}).` };
  // GitHub's scheduler often skips hours, so send at the first run from the morning hour onwards,
  // any time until 22:00 (no late-night pings). Once sent, nothing more that day.
  const LAST = 22;
  if (hour < morning) return { send: false, today, reason: `Local hour ${hour}, too early: morning summary from ${morning}:00.` };
  if (hour >= Math.max(LAST, morning + 1)) return { send: false, today, reason: `Local hour ${hour}, too late: nothing sent after ${LAST}:00.` };

  const open = tasks.filter((t) => !t.done && !t.deleted);
  const urg = (t) => Math.min(t.deadline ? Date.parse(t.deadline) : Infinity, t.target ? Date.parse(t.target + "T23:59") : Infinity);
  const item = (t, x) => ({ e: t.encT || "", x });
  const messages = [];

  // 1. Morning summary
  const due = open.filter((t) => (t.target && t.target <= today) || (t.deadline && daysBetween(today, toDay(t.deadline)) <= 7)).sort((a, b) => urg(a) - urg(b));
  if (due.length) {
    const items = due.slice(0, 6).map((t) => {
      if (t.deadline) { const n = daysBetween(today, toDay(t.deadline)); return item(t, n < 0 ? "deadline passed" : n === 0 ? "deadline today" : `${n}d to deadline`); }
      return item(t, t.target < today ? "overdue" : "");
    });
    messages.push({ kind: "summary", tag: "summary", head: `GO JESSIE! · ${due.length} on your list`, items: JSON.stringify(items), more: due.length > 6 ? due.length - 6 : undefined });
  }
  // 2. Countdown alerts before absolute deadlines
  for (const t of open) {
    if (!t.deadline) continue;
    const n = daysBetween(today, toDay(t.deadline));
    if (alertDays.includes(n))
      messages.push({ kind: "alert", tag: `alert-${n}-${t.deadline}`, head: `${n} day${n > 1 ? "s" : ""} left`, items: JSON.stringify([item(t, "")]), dl: prettyDeadline(t.deadline) });
  }
  // 3. Overdue nudge
  if (settings.overdue !== false) {
    const late = open.filter((t) => t.target && t.target < today).sort((a, b) => urg(a) - urg(b));
    if (late.length) messages.push({ kind: "overdue", tag: "overdue", head: `${late.length} task${late.length > 1 ? "s" : ""} past due`, items: JSON.stringify(late.slice(0, 5).map((t) => item(t, `${daysBetween(t.target, today)}d late`))), more: late.length > 5 ? late.length - 5 : undefined });
  }
  return { send: messages.length > 0, today, messages, reason: `${messages.length} reminder(s) for ${today}.` };
}
