import { useData } from "../lib/useData";
import type { Assignment, Meeting } from "../lib/types";
import { KIND_LABELS } from "../lib/types";
import { Card, EmptyState, Pill } from "../components/ui";

function fmtDate(s: string | null): string {
  if (!s) return "No date";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TodayPage() {
  const assignments = useData<Assignment[]>("/api/assignments");
  const meetings = useData<Meeting[]>("/api/meetings");

  const due = (assignments.data || []).filter((a) => a.status !== "done" && a.status !== "graded");
  const upcoming = (meetings.data || []).filter(
    (m) => !m.starts_at || new Date(m.starts_at) >= new Date(),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Today</h1>
        <p className="text-sm text-slate-400">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Due & in progress
        </h2>
        {due.length === 0 ? (
          <EmptyState icon="🎉" title="All caught up" hint="No outstanding assignments" />
        ) : (
          <div className="space-y-2">
            {due.map((a) => (
              <Card key={a.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-100">{a.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(a.due_at)}</p>
                </div>
                <Pill
                  className={
                    a.kind === "test"
                      ? "bg-rose-500/15 text-rose-300"
                      : a.kind === "project"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-sky-500/15 text-sky-300"
                  }
                >
                  {KIND_LABELS[a.kind]}
                </Pill>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Upcoming meetings
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState icon="🤝" title="No meetings" hint="Nothing scheduled yet" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((m) => (
              <Card key={m.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-100">{m.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(m.starts_at)}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
