export const TEAM_TIMEZONE = 'Africa/Cairo';
const formatter = new Intl.DateTimeFormat('en', { timeZone: TEAM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const display = new Intl.DateTimeFormat('en', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const detailed = new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function teamDate(now = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function fromDate(date) { return new Date(`${date}T00:00:00Z`); }
export function dateLabel(date, withYear = false) { return (withYear ? detailed : display).format(fromDate(date)); }

export function addDays(date, days) {
  const target = fromDate(date);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

export function taskWindows(tasks, person, today) {
  const throughToday = [];
  const nextWeek = [];
  const cutoff = addDays(today, 7);
  for (const task of tasks) {
    if (task.person !== person) continue;
    if (task.date <= today) throughToday.push(task);
    else if (task.date <= cutoff) nextWeek.push(task);
  }
  const byDue = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  return { throughToday: throughToday.sort(byDue), nextWeek: nextWeek.sort(byDue) };
}
