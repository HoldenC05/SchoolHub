import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { TimeEntry } from "../lib/types";
import { entryDuration, fmtDuration, fmtDurationClock, fmtEntryDate, isRunning } from "../lib/time";
import { Button } from "./ui";

export function TimeSection({
  entityType,
  entityId,
  entityName,
}: {
  entityType: "course" | "activity";
  entityId: number;
  entityName: string;
}) {
  const { data, refresh } = useData<TimeEntry[]>("/api/time_entries");
  const [now, setNow] = useState(new Date());

  const mine = (data || []).filter((e) => e.entity_type === entityType && e.entity_id === entityId);
  const running = mine.find(isRunning);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const total = useMemo(
    () => mine.reduce((acc, e) => acc + entryDuration(e, now), 0),
    [mine, now],
  );

  const start = async () => {
    await api.create<TimeEntry>("/api/time_entries", {
      entity_type: entityType,
      entity_id: entityId,
      label: entityName,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: 0,
    });
    refresh();
  };

  const stop = async () => {
    if (!running) return;
    await api.update<TimeEntry>(`/api/time_entries/${running.id}`, {
      ended_at: new Date().toISOString(),
      duration_seconds: entryDuration(running, now),
    });
    refresh();
  };

  const recent = [...mine].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Total tracked: <span className="text-indigo-600">{fmtDuration(total)}</span>
          </p>
          {running && (
            <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <span className="font-mono font-semibold text-indigo-600">{fmtDurationClock(entryDuration(running, now))}</span>
              since {fmtEntryDate(running.started_at)}
            </p>
          )}
        </div>
        {running ? (
          <Button variant="danger" onClick={() => void stop()}>■ Stop</Button>
        ) : (
          <Button onClick={() => void start()}>▶ Start timer</Button>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-500">No time tracked for this {entityType} yet.</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              <span className="text-slate-600">{fmtEntryDate(e.started_at)}</span>
              <span className="font-medium text-slate-800">{fmtDuration(entryDuration(e, now))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
