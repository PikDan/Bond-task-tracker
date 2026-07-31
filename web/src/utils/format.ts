import { format, isToday } from "date-fns";

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(sec)}`;
}

// Reports' stat cards show hours as a plain decimal (e.g. "0.08 Hours")
// rather than h:mm:ss — a summary figure, not a session length.
export function formatDecimalHours(totalSeconds: number): string {
  return (Math.max(0, totalSeconds) / 3600).toFixed(2);
}

export function formatTimeOfDay(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

export function formatTimeRange(startedAt: string, endedAt: string | null | undefined): string {
  const start = formatTimeOfDay(startedAt);
  const end = endedAt ? formatTimeOfDay(endedAt) : "now";
  return `${start} - ${end}`;
}

export function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

export function formatDayHeading(dayKeyValue: string): string {
  const date = new Date(`${dayKeyValue}T00:00:00`);
  if (isToday(date)) return "Today";
  return format(date, "EEE, d MMM");
}

// <input type="datetime-local"> takes/returns "YYYY-MM-DDTHH:mm" with no
// timezone, which the browser (and `new Date(...)`) treats as local time —
// exactly what we want for editing a wall-clock start/end time.
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
