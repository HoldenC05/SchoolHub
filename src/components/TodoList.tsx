import { useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { Todo } from "../lib/types";
import { compareTodos, dueBucket, fmtDue, priorityBadge, PRIORITY_ORDER } from "../lib/todos";
import { TodoEdit, type TodoPayload } from "./TodoEdit";
import { Button, DeleteButton, IconButton, inputStyles } from "./ui";

export function TodoList({
  entityType,
  entityId,
  onChanged,
  className = "",
}: {
  entityType: string | null;
  entityId: number | null;
  onChanged?: () => void;
  className?: string;
}) {
  const { data, refresh } = useData<Todo[]>("/api/todos");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<Todo | null>(null);

  const mine = (data || []).filter(
    (t) => (t.entity_type ?? null) === entityType && t.entity_id === entityId,
  );
  const sorted = [...mine].sort(compareTodos);

  const after = () => {
    refresh();
    onChanged?.();
  };

  const add = async () => {
    const title = text.trim();
    if (!title) return;
    await api.create<Todo>("/api/todos", {
      title,
      status: "todo",
      priority: 1,
      entity_type: entityType,
      entity_id: entityId,
    });
    setText("");
    after();
  };

  const toggle = async (t: Todo) => {
    await api.update<Todo>(`/api/todos/${t.id}`, {
      status: t.status === "done" ? "todo" : "done",
    });
    after();
  };

  const save = async (payload: TodoPayload) => {
    const body = {
      title: payload.title,
      status: payload.status,
      priority: payload.priority,
      due_at: payload.due_at,
      notes: payload.notes,
    };
    if (editing) {
      await api.update<Todo>(`/api/todos/${editing.id}`, body);
    } else {
      await api.create<Todo>("/api/todos", {
        ...body,
        entity_type: entityType,
        entity_id: entityId,
      });
    }
    setEditing(null);
    after();
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add a to-do…"
          className={inputStyles}
        />
        <Button onClick={() => void add()} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="py-1 text-xs text-slate-400">No to-dos here yet.</p>
      ) : (
        sorted.map((t) => (
          <div key={t.id} className="group flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
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
            <button
              onClick={() => setEditing(t)}
              className={`min-w-0 flex-1 truncate text-left text-sm ${
                t.status === "done" ? "text-slate-400 line-through" : "text-slate-800"
              }`}
              title={t.title}
            >
              {t.title}
            </button>
            {t.priority !== 1 && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadge(t.priority)}`}>
                {PRIORITY_ORDER[t.priority]}
              </span>
            )}
            {t.due_at && (
              <span
                className={`shrink-0 text-[10px] font-medium ${
                  dueBucket(t) === "overdue" && t.status !== "done" ? "text-rose-600" : "text-slate-400"
                }`}
              >
                {fmtDue(t)}
              </span>
            )}
            <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <IconButton title="Edit" onClick={() => setEditing(t)} className="!p-1">
                <EditSvg />
              </IconButton>
              <DeleteButton
                onConfirm={async () => {
                  await api.remove(`/api/todos/${t.id}`);
                  after();
                }}
              />
            </div>
          </div>
        ))
      )}
      <TodoEdit
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={save}
        initial={editing}
      />
    </div>
  );
}

const EditSvg = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
