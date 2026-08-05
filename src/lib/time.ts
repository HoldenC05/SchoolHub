import type { TimeEntry } from "./types";

export function entryDuration(e: TimeEntry, now = new Date()): number {
  if (e.duration_seconds > 0) return e.duration_seconds;
  if (!e.ended_at) {
    const start = new Date(e.started_at).getTime();
    return Math.max(0, Math.round((now.getTime() - start) / 1000));
  }
  const start = new Date(e.started_at).getTime();
  const end = new Date(e.ended_at).getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

export function isRunning(e: TimeEntry): boolean {
  return !e.ended_at;
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtDurationClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtEntryDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  return d.toLocaleString(undefined, opts);
}

export function entryLabel(e: TimeEntry): string {
  if (e.entity_type === "other" && e.label) return e.label;
  if (e.entity_type === "course") return e.label || "Course";
  if (e.entity_type === "activity") return e.label || "Activity";
  return e.label || "Unknown";
}
