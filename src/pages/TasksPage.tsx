import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { Activity, Course, Todo, TodoStatus } from "../lib/types";
import { dueBucket, fmtDue, PRIORITY_ORDER, priorityBadge } from "../lib/todos";
import { TodoEdit, type TodoPayload } from "../components/TodoEdit";
import { EmptyState, SelectInput } from "../components/ui";

type Scope = { kind: "all" } | { kind: "course"; id: number; name: string } | { kind: "activity"; id: number; name: string };

const COLUMNS: { key: TodoStatus; label: string; dot: string }[] = [
  { key: "todo", label: "To do", dot: "bg-slate-300" },
  { key: "in_progress", label: "In progress", dot: "bg-sky-400" },
  { key: "done", label: "Done", dot: "bg-emerald-400" },
];

export function TasksPage() {
  const { data, refresh } = useData<Todo[]>("/api/todos");
  const courses = useData<Course[]>("/api/courses");
  const activities = useData<Activity[]>("/api/activities");

  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ id: number; before: boolean } | null>(null);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [adding, setAdding] = useState<{ open: boolean; status: TodoStatus }>({ open: false, status: "todo" });

  const scopeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "all", label: "All to-dos" }];
    for (const c of courses.data || []) opts.push({ value: `course-${c.id}`, label: `📚 ${c.name}` });
    for (const a of activities.data || []) opts.push({ value: `activity-${a.id}`, label: `${a.icon || "🏅"} ${a.name}` });
    return opts;
  }, [courses.data, activities.data]);

  const inScope = (t: Todo): boolean => {
    if (scope.kind === "all") return true;
    return t.entity_type === scope.kind && t.entity_id === scope.id;
  };

  const byStatus = (status: TodoStatus) =>
    (data || [])
      .filter((t) => t.status === status && inScope(t))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);

  const contextName = (t: Todo): string => {
    if (t.entity_type === "course") return courses.data?.find((c) => c.id === t.entity_id)?.name ?? "Course";
    if (t.entity_type === "activity") return activities.data?.find((a) => a.id === t.entity_id)?.name ?? "Activity";
    return "";
  };

  const moveCard = async (targetStatus: TodoStatus, targetId: number | null, before: boolean) => {
    if (dragId === null) return;
    const dragged = (data || []).find((t) => t.id === dragId);
    if (!dragged) return;

    const base = byStatus(targetStatus).filter((t) => t.id !== dragId);
    let idx = base.length;
    if (targetId !== null) {
      const ti = base.findIndex((t) => t.id === targetId);
      if (ti >= 0) idx = before ? ti : ti + 1;
    }
    const next = [...base.slice(0, idx), dragged, ...base.slice(idx)];
    try {
      for (let i = 0; i < next.length; i++) {
        const t = next[i];
        const patch: Partial<Todo> = { position: i };
        if (t.status !== targetStatus) patch.status = targetStatus;
        await api.update<Todo>(`/api/todos/${t.id}`, patch);
      }
    } catch (err) {
      console.error("Failed to reorder todos:", err);
    }
    setDragId(null);
    setOver(null);
    refresh();
  };

  const handleColumnDrop = (e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    console.log("Column drop:", status);
    void moveCard(status, null, false);
  };

  const save = async (payload: TodoPayload) => {
    if (editing) {
      await api.update<Todo>(`/api/todos/${editing.id}`, {
        title: payload.title,
        status: payload.status,
        priority: payload.priority,
        due_at: payload.due_at,
        notes: payload.notes,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
      });
    } else {
      await api.create<Todo>("/api/todos", {
        ...payload,
        status: adding.status,
      });
    }
    setEditing(null);
    setAdding({ open: false, status: "todo" });
    refresh();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">A board for your to-dos — drag cards between columns or reorder within a column</p>
        </div>
        <SelectInput
          value={scope.kind === "all" ? "all" : `${scope.kind}-${scope.id}`}
          onChange={(v) => {
            if (v === "all") return setScope({ kind: "all" });
            const [kind, idStr] = v.split("-");
            const id = Number(idStr);
            if (kind === "course") {
              const c = courses.data?.find((x) => x.id === id);
              if (c) setScope({ kind: "course", id, name: c.name });
            } else {
              const a = activities.data?.find((x) => x.id === id);
              if (a) setScope({ kind: "activity", id, name: a.name });
            }
          }}
          options={scopeOptions}
        />
      </header>

      <p className="text-sm text-slate-500">
        {scope.kind === "all" ? "Showing to-dos from everything." : `Board for ${scope.name}.`}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COLUMNS.map((col) => {
          const cards = byStatus(col.key);
          return (
            <div
              key={col.key}
              data-status={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(null);
              }}
              onDrop={(e) => handleColumnDrop(e, col.key)}
              onDragLeave={() => setOver(null)}
              className="flex min-h-[300px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                    {cards.length}
                  </span>
                </div>
                <button
                  onClick={() => setAdding({ open: true, status: col.key })}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  title={`Add to ${col.label}`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 space-y-2">
                {cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">
                    Drop a card here
                  </p>
                ) : (
                  cards.map((t) => {
                    const isOver = over?.id === t.id;
                    const showTop = isOver && over?.before;
                    const showBottom = isOver && !over?.before;
                    return (
                      <div
                        key={t.id}
                        data-status={col.key}
                        draggable
                        onDragStart={(e) => {
                          setDragId(t.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", t.id.toString());
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const rect = e.currentTarget.getBoundingClientRect();
                          const before = e.clientY < rect.top + rect.height / 2;
                          setOver({ id: t.id, before });
                        }}
                        onDragLeave={() => setOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const before = e.clientY < rect.top + rect.height / 2;
                          const status = e.currentTarget.getAttribute("data-status") as TodoStatus;
                          void moveCard(status, t.id, before);
                        }}
                        onClick={() => setEditing(t)}
                        className={`cursor-grab rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow ${
                          t.status === "done" ? "opacity-60" : ""
                        } ${showTop ? "border-t-2 border-indigo-500" : ""} ${showBottom ? "border-b-2 border-indigo-500" : ""}`}
                        title="Drag to reorder or to another column, click to edit"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadge(t.priority)}`}>
                            {PRIORITY_ORDER[t.priority]}
                          </span>
                          <p className={`min-w-0 flex-1 text-sm ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                            {t.title}
                          </p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                          {t.due_at && (
                            <span className={`font-medium ${dueBucket(t) === "overdue" && t.status !== "done" ? "text-rose-600" : ""}`}>
                              {fmtDue(t)}
                            </span>
                          )}
                          {scope.kind === "all" && contextName(t) && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                              {contextName(t)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {scope.kind !== "all" && (data || []).filter(inScope).length === 0 && (
        <EmptyState icon="🗂️" title={`Nothing on ${scope.name} yet`} hint="Add a to-do on a column above, or create to-dos from the class or activity page." />
      )}

      <TodoEdit
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={save}
        initial={editing}
      />
      <TodoEdit
        open={adding.open}
        onClose={() => setAdding({ open: false, status: "todo" })}
        onSave={save}
        defaultContext={scope.kind === "all" ? null : { entity_type: scope.kind, entity_id: scope.id }}
      />
    </div>
  );
}