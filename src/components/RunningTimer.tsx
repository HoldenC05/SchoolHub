import { useEffect, useMemo, useState } from "react";
import { useData } from "../lib/useData";
import { api } from "../lib/api";
import type { Course, TimeEntry } from "../lib/types";
import { entryDuration, fmtDurationClock, entryLabel, isRunning } from "../lib/time";

interface RunningTimerProps {
  onOpen?: () => void;
}

export function RunningTimer({ onOpen }: RunningTimerProps) {
  const { data: entries, refresh } = useData<TimeEntry[]>("/api/time_entries");
  const courses = useData<Course[]>("/api/courses");
  const [now, setNow] = useState(new Date());

  const running = useMemo(() => (entries || []).find(isRunning), [entries]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const resolvedLabel = useMemo(() => {
    if (!running) return "";
    return entryLabel(running);
  }, [running, courses.data]);

  const onStop = async () => {
    if (!running) return;
    await api.update<TimeEntry>(`/api/time_entries/${running.id}`, {
      ended_at: new Date().toISOString(),
      duration_seconds: entryDuration(running, now),
    });
    refresh();
  };

  if (!running) return null;

  return (
    <div
      className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-lg bg-white/90 backdrop-blur px-3 py-1.5 shadow-sm border border-slate-200"
      onClick={onOpen}
      title="Click to open Time Tracker"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
    >
      <span className="text-sm font-medium text-slate-600 truncate max-w-[180px]">{resolvedLabel}</span>
      <span className="font-mono text-sm text-slate-500">
        {fmtDurationClock(entryDuration(running, now))}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); void onStop(); }}
        className="ml-1 rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        title="Stop timer"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}