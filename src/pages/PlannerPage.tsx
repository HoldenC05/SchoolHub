import { useData } from "../lib/useData";
import type { Assignment, CalendarEvent, Meeting, Project } from "../lib/types";
import { KIND_LABELS } from "../lib/types";
import { Card, EmptyState } from "../components/ui";

interface TimelineItem {
  when: string | null;
  title: string;
  kind: "assignment" | "meeting" | "project" | "event";
  label?: string;
}

function fmt(s: string | null): string {
  if (!s) return "No date";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PlannerPage() {
  const assignments = useData<Assignment[]>("/api/assignments");
  const meetings = useData<Meeting[]>("/api/meetings");
  const projects = useData<Project[]>("/api/projects");
  const events = useData<CalendarEvent[]>("/api/calendar_events");

  const items: TimelineItem[] = [
    ...(assignments.data || []).map((a) => ({
      when: a.due_at,
      title: a.title,
      kind: "assignment" as const,
      label: KIND_LABELS[a.kind],
    })),
    ...(meetings.data || []).map((m) => ({
      when: m.starts_at,
      title: m.title,
      kind: "meeting" as const,
    })),
    ...(projects.data || []).map((p) => ({
      when: p.deadline,
      title: `${p.title} (project)`,
      kind: "project" as const,
    })),
    ...(events.data || [])
      .filter((e) => e.summary)
      .map((e) => ({
        when: e.starts_at,
        title: e.summary as string,
        kind: "event" as const,
      })),
  ].sort((a, b) => (a.when || "9999").localeCompare(b.when || "9999"));

  const upcoming = items.filter((i) => !i.when || new Date(i.when) >= new Date()).slice(0, 40);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Planner</h1>
        <p className="text-sm text-slate-400">Everything on your horizon</p>
      </header>

      {upcoming.length === 0 ? (
        <EmptyState icon="🗓️" title="Nothing scheduled" hint="Add assignments, meetings, or projects" />
      ) : (
        <div className="space-y-2">
          {upcoming.map((item, i) => (
            <Card key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {item.kind === "meeting"
                    ? "🤝"
                    : item.kind === "project"
                      ? "🚀"
                      : item.kind === "event"
                        ? "📅"
                        : "✏️"}
                </span>
                <div>
                  <p className="font-medium text-slate-100">{item.title}</p>
                  <p className="text-xs text-slate-500">{fmt(item.when)}</p>
                </div>
              </div>
              {item.label && (
                <span className="text-xs font-medium text-indigo-300">{item.label}</span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
