export function initials(name: string): string {
  return (
    (name || "?")
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

/** "Oct 7" from YYYY-MM-DD. */
export function fmtDay(day: string | null | undefined): string {
  if (!day) return "";
  const d = new Date(day.length <= 10 ? day + "T12:00:00" : day);
  if (isNaN(+d)) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Oct 7, 2026" from YYYY-MM-DD. */
export function fmtLongDay(day: string | null | undefined): string {
  if (!day) return "";
  const d = new Date(day.length <= 10 ? day + "T12:00:00" : day);
  if (isNaN(+d)) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 7, 2:20 PM" from an ISO timestamp. */
export function fmtAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d
    .toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .replace(/ /g, " ");
}

export function fmtTokens(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

export function fmtUsd(n: number): string {
  if (n > 0 && n < 0.01) return "<$0.01";
  return "$" + n.toFixed(2);
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export function plural(n: number, one: string, many = one + "s"): string {
  return n + " " + (n === 1 ? one : many);
}

/** Score display: 73, 88.5. */
export function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return String(Math.round(n * 2) / 2);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addYears(day: string, years: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function courseDatesLabel(start: string | null, end: string, autoEnd: boolean): string {
  if (autoEnd) return "Until " + fmtLongDay(end) + ", archives automatically";
  if (start) return fmtLongDay(start) + " to " + fmtLongDay(end);
  return "Until " + fmtLongDay(end);
}

/** "Aug 25 to Dec 12, 2026", or "Until Oct 30, 2027" when the course has no start date or ends automatically. */
export function courseSpanLabel(start: string | null, end: string, autoEnd: boolean): string {
  if (!start || autoEnd) return "Until " + fmtLongDay(end);
  return (start.slice(0, 4) === end.slice(0, 4) ? fmtDay(start) : fmtLongDay(start)) + " to " + fmtLongDay(end);
}

const DAY_MS = 86_400_000;
const dayNum = (day: string) => Math.floor(Date.parse(day.slice(0, 10) + "T00:00:00Z") / DAY_MS);

/** Where a running course is in its term: "Starts Jan 12", "Week 10 of 16", or "Week 10" when it ends automatically. Null once it has ended, or without a start date. */
export function courseTermLabel(start: string | null, end: string, autoEnd: boolean, today = todayIso()): string | null {
  if (!start || end < today) return null;
  if (start > today) return "Starts " + (start.slice(0, 4) === today.slice(0, 4) ? fmtDay(start) : fmtLongDay(start));
  const week = Math.floor((dayNum(today) - dayNum(start)) / 7) + 1;
  if (autoEnd) return "Week " + week;
  return `Week ${week} of ${Math.ceil((dayNum(end) - dayNum(start) + 1) / 7)}`;
}
