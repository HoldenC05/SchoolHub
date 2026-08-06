import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { TimeEntry } from "../lib/types";
import { entryDuration, fmtDuration, fmtDurationClock, fmtEntryDate, isRunning } from "../lib/time";
import { Button, Card } from "./ui";

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

  const stats = useMemo(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const week = new Date(day);
    week.setDate(week.getDate() - week.getDay());
    let today = 0;
    let thisWeek = 0;
    let all = 0;
    const byDay = new Map<string, number>();
    for (const e of mine) {
      const dur = entryDuration(e, now);
      const start = new Date(e.started_at);
      const dayKey = start.toISOString().slice(0, 10);
      all += dur;
      if (start >= day) today += dur;
      if (start >= week) thisWeek += dur;
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + dur);
    }
    const dayBreakdown = [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
      .map(([date, seconds]) => ({ date, seconds }));
    return { today, thisWeek, all, dayBreakdown };
  }, [mine, now]);

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

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.today)}</p><p className="text-xs text-slate-500">Today</p></Card>
        <Card className="p-3"><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.thisWeek)}</p><p className="text-xs text-slate-500">This week</p></Card>
        <Card className="p-3"><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.all)}</p><p className="text-xs text-slate-500">All time</p></Card>
      </div>

      {stats.dayBreakdown.length > 0 && (
        <Card className="space-y-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Last 7 days</p>
          {stats.dayBreakdown.map((d) => (
            <div key={d.date} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="font-medium text-slate-800">{fmtDuration(d.seconds)}</span>
            </div>
          ))}
        </Card>
      )}

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
