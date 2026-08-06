import { useData } from "../lib/useData";
import type { AppSettings, Assignment, CalendarEvent, Meeting } from "../lib/types";
import { KIND_LABELS } from "../lib/types";
import { Card, EmptyState, Pill } from "../components/ui";
import { BibleVerse } from "../components/BibleVerse";

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

function fmtDateOnly(s: string | null): string {
  if (!s) return "No date";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function isAllDay(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function fmtTime(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sameLocalDay(s: string | null, offsetDays: number): boolean {
  if (!s) return false;
  // Handle all-day dates (YYYY-MM-DD) as local date components to avoid UTC shift
  const allDayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let d: Date;
  if (allDayMatch) {
    const [, y, m, day] = allDayMatch;
    d = new Date(Number(y), Number(m) - 1, Number(day));
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return false;
  const t = new Date();
  t.setDate(t.getDate() + offsetDays);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function EventRow({ e }: { e: CalendarEvent }) {
  const allDay = isAllDay(e.starts_at);
  return (
    <Card className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium text-slate-900">{e.summary}</p>
        <p className="text-xs text-slate-500">
          {allDay ? fmtDateOnly(e.starts_at) : fmtDate(e.starts_at)}
          {e.location ? ` · ${e.location}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium text-slate-500">
        {allDay ? "All day" : fmtTime(e.starts_at)}
      </span>
    </Card>
  );
}

export function TodayPage() {
  const assignments = useData<Assignment[]>("/api/assignments");
  const meetings = useData<Meeting[]>("/api/meetings");
  const events = useData<CalendarEvent[]>("/api/calendar_events");
  const settings = useData<AppSettings[]>("/api/settings");

  let hidden = new Set<string>();
  try {
    hidden = new Set(JSON.parse(settings.data?.[0]?.today_hidden_calendars || "[]"));
  } catch {
    /* ignore */
  }

  const due = (assignments.data || []).filter((a) => a.status !== "done" && a.status !== "graded");
  const upcoming = (meetings.data || []).filter(
    (m) => !m.starts_at || new Date(m.starts_at) >= new Date(),
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const calendarEvents = (events.data || [])
    .filter((e) => e.summary && !hidden.has(e.calendar_href || ""))
    .filter((e) => !e.starts_at || new Date(e.starts_at) >= todayStart)
    .sort((a, b) => (a.starts_at || "9999").localeCompare(b.starts_at || "9999"));
  const todayEvents = calendarEvents.filter((e) => sameLocalDay(e.starts_at, 0));
  const tomorrowEvents = calendarEvents.filter((e) => sameLocalDay(e.starts_at, 1));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Today</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      <BibleVerse />

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
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(a.due_at)}</p>
                </div>
                <Pill
                  className={
                    a.kind === "test"
                      ? "bg-rose-50 text-rose-600"
                      : a.kind === "project"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-sky-50 text-sky-700"
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
                  <p className="font-medium text-slate-900">{m.title}</p>
                  <p className="text-xs text-slate-500">{fmtDate(m.starts_at)}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {todayEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Today's calendar
          </h2>
          <div className="space-y-2">
            {todayEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </div>
        </section>
      )}

      {tomorrowEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Next up tomorrow
          </h2>
          <div className="space-y-2">
            {tomorrowEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
