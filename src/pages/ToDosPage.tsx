import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { Activity, Course, Todo, TodoStatus } from "../lib/types";
import { compareTodos, dueBucket, fmtDue, PRIORITY_ORDER, priorityBadge } from "../lib/todos";
import { TodoEdit, type TodoPayload } from "../components/TodoEdit";
import { Button, Card, DeleteButton, EmptyState, IconButton, Pill, SelectInput, inputStyles } from "../components/ui";

type ContextFilter = "all" | "standalone" | "course" | "activity" | "project" | "assignment" | "meeting" | "idea";
type StatusFilter = "all" | "open" | TodoStatus;
type PriorityFilter = "all" | "0" | "1" | "2";
type DueFilter = "all" | "overdue" | "today" | "week" | "later" | "none";
type SortKey = "due" | "priority" | "created" | "title";

const CONTEXT_LABEL: Record<Exclude<ContextFilter, "all">, string> = {
  standalone: "Standalone",
  course: "Courses",
  activity: "Activities",
  project: "Projects",
  assignment: "Assignments",
  meeting: "Meetings",
  idea: "Ideas",
};

function contextDisplay(
  t: Pick<Todo, "entity_type" | "entity_id">,
  courses: Course[],
  activities: Activity[],
  projects: { id: number; title: string }[],
  assignments: { id: number; title: string }[],
  meetings: { id: number; title: string }[],
  ideas: { id: number; title: string }[],
): { label: string; kind: Exclude<ContextFilter, "all">; color: string } {
  const et = t.entity_type;
  const eid = t.entity_id;
  const color =
    et === "course"
      ? "bg-sky-50 text-sky-700"
      : et === "activity"
        ? "bg-violet-50 text-violet-700"
        : et === "project"
          ? "bg-amber-50 text-amber-700"
          : et === "assignment"
            ? "bg-rose-50 text-rose-600"
            : et === "meeting"
              ? "bg-indigo-50 text-indigo-600"
              : et === "idea"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500";
  let label = CONTEXT_LABEL.standalone;
  let kind: Exclude<ContextFilter, "all"> = "standalone";
  if (et === "course") {
    kind = "course";
    label = courses.find((c) => c.id === eid)?.name ?? "Course";
  } else if (et === "activity") {
    kind = "activity";
    label = activities.find((a) => a.id === eid)?.name ?? "Activity";
  } else if (et === "project") {
    kind = "project";
    label = projects.find((p) => p.id === eid)?.title ?? "Project";
  } else if (et === "assignment") {
    kind = "assignment";
    label = assignments.find((a) => a.id === eid)?.title ?? "Assignment";
  } else if (et === "meeting") {
    kind = "meeting";
    label = meetings.find((m) => m.id === eid)?.title ?? "Meeting";
  } else if (et === "idea") {
    kind = "idea";
    label = ideas.find((i) => i.id === eid)?.title ?? "Idea";
  }
  return { label, kind, color };
}

export function ToDosPage() {
  const { data, refresh } = useData<Todo[]>("/api/todos");
  const courses = useData<Course[]>("/api/courses");
  const activities = useData<Activity[]>("/api/activities");
  const projects = useData<{ id: number; title: string }[]>("/api/projects");
  const assignments = useData<{ id: number; title: string }[]>("/api/assignments");
  const meetings = useData<{ id: number; title: string }[]>("/api/meetings");
  const ideas = useData<{ id: number; title: string }[]>("/api/ideas");

  const [context, setContext] = useState<ContextFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [quick, setQuick] = useState("");
  const [modal, setModal] = useState<{ open: boolean; editing: Todo | null }>({ open: false, editing: null });

  const todos = data || [];

  const stats = useMemo(() => {
    const open = todos.filter((t) => t.status !== "done");
    return {
      open: open.length,
      overdue: open.filter((t) => dueBucket(t) === "overdue").length,
      today: open.filter((t) => dueBucket(t) === "today").length,
      high: open.filter((t) => t.priority === 2).length,
    };
  }, [todos]);

  const filtered = useMemo(() => {
    let out = todos.filter((t) => {
      if (context !== "all") {
        const et = t.entity_type ?? "standalone";
        if (et !== context) return false;
      }
      if (status !== "all") {
        if (status === "open") {
          if (t.status === "done") return false;
        } else if (t.status !== status) return false;
      }
      if (priority !== "all" && t.priority !== Number(priority)) return false;
      if (due !== "all") {
        const b = dueBucket(t);
        if (b !== due) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "priority":
          if (b.priority !== a.priority) return b.priority - a.priority;
          break;
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "title":
          return a.title.localeCompare(b.title);
        default:
          break;
      }
      return compareTodos(a, b);
    });
    return out;
  }, [todos, context, status, priority, due, sort]);

  const quickAdd = async () => {
    const title = quick.trim();
    if (!title) return;
    await api.create<Todo>("/api/todos", {
      title,
      status: "todo",
      priority: 1,
      entity_type: null,
      entity_id: null,
    });
    setQuick("");
    refresh();
  };

  const toggle = async (t: Todo) => {
    await api.update<Todo>(`/api/todos/${t.id}`, {
      status: t.status === "done" ? "todo" : "done",
    });
    refresh();
  };

  const save = async (payload: TodoPayload) => {
    if (modal.editing) {
      await api.update<Todo>(`/api/todos/${modal.editing.id}`, {
        title: payload.title,
        status: payload.status,
        priority: payload.priority,
        due_at: payload.due_at,
        notes: payload.notes,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
      });
    } else {
      await api.create<Todo>("/api/todos", payload);
    }
    setModal({ open: false, editing: null });
    refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">To-Dos</h1>
          <p className="text-sm text-slate-500">Everything on your plate, all in one list</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModal({ open: true, editing: null })}>+ New to-do</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><p className="text-2xl font-bold text-slate-900">{stats.open}</p><p className="text-sm text-slate-500">Open</p></Card>
        <Card><p className="text-2xl font-bold text-rose-600">{stats.overdue}</p><p className="text-sm text-slate-500">Overdue</p></Card>
        <Card><p className="text-2xl font-bold text-indigo-600">{stats.today}</p><p className="text-sm text-slate-500">Due today</p></Card>
        <Card><p className="text-2xl font-bold text-amber-600">{stats.high}</p><p className="text-sm text-slate-500">High priority</p></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void quickAdd();
          }}
          placeholder="Quick add (standalone)…"
          className={`${inputStyles} flex-1`}
        />
        <Button onClick={() => void quickAdd()} disabled={!quick.trim()}>
          Add
        </Button>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            value={context}
            onChange={(v) => setContext(v as ContextFilter)}
            options={[
              { value: "all", label: "All contexts" },
              { value: "standalone", label: "Standalone" },
              { value: "course", label: "Courses" },
              { value: "activity", label: "Activities" },
              { value: "project", label: "Projects" },
              { value: "assignment", label: "Assignments" },
              { value: "meeting", label: "Meetings" },
              { value: "idea", label: "Ideas" },
            ]}
          />
          <SelectInput
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              { value: "all", label: "Any status" },
              { value: "open", label: "Open only" },
              { value: "todo", label: "To do" },
              { value: "in_progress", label: "In progress" },
              { value: "done", label: "Done" },
            ]}
          />
          <SelectInput
            value={priority}
            onChange={(v) => setPriority(v as PriorityFilter)}
            options={[
              { value: "all", label: "Any priority" },
              { value: "2", label: "High" },
              { value: "1", label: "Medium" },
              { value: "0", label: "Low" },
            ]}
          />
          <SelectInput
            value={due}
            onChange={(v) => setDue(v as DueFilter)}
            options={[
              { value: "all", label: "Any due date" },
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Due today" },
              { value: "week", label: "Due this week" },
              { value: "later", label: "Later" },
              { value: "none", label: "No due date" },
            ]}
          />
          <SelectInput
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              { value: "due", label: "Sort: due date" },
              { value: "priority", label: "Sort: priority" },
              { value: "created", label: "Sort: newest" },
              { value: "title", label: "Sort: title" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="☑️" title="Nothing here" hint="Adjust filters or add a to-do" />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((t) => {
              const ctx = contextDisplay(t, courses.data || [], activities.data || [], projects.data || [], assignments.data || [], meetings.data || [], ideas.data || []);
              const overdue = dueBucket(t) === "overdue" && t.status !== "done";
              return (
                <div key={t.id} className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <button
                    onClick={() => void toggle(t)}
                    title={t.status === "done" ? "Mark not done" : "Mark done"}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      t.status === "done" ? "border-emerald-500 bg-emerald-100" : "border-slate-300 hover:border-indigo-400"
                    }`}
                  >
                    {t.status === "done" && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <button onClick={() => setModal({ open: true, editing: t })} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-sm ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {t.title}
                    </span>
                    {t.notes && <span className="block truncate text-xs text-slate-400">{t.notes}</span>}
                  </button>
                  <Pill className={`hidden shrink-0 sm:inline-flex ${ctx.color}`}>{ctx.label}</Pill>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadge(t.priority)}`}>
                    {PRIORITY_ORDER[t.priority]}
                  </span>
                  {t.due_at && (
                    <span className={`shrink-0 text-xs font-medium ${overdue ? "text-rose-600" : "text-slate-400"}`}>
                      {fmtDue(t)}
                    </span>
                  )}
                  {t.status === "in_progress" && (
                    <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">In progress</span>
                  )}
                  <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <IconButton title="Edit" onClick={() => setModal({ open: true, editing: t })} className="!p-1">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    </IconButton>
                    <DeleteButton
                      onConfirm={async () => {
                        await api.remove(`/api/todos/${t.id}`);
                        refresh();
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <TodoEdit
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        onSave={save}
        initial={modal.editing}
        showContext
      />
    </div>
  );
}
