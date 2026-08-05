import { useEffect, useState } from "react";
import { useData } from "../lib/useData";
import type { Activity, Course, Todo, TodoStatus } from "../lib/types";
import { PRIORITY_ORDER } from "../lib/todos";
import { toLocalInput } from "../lib/datetime";
import { Button, Field, Modal, SelectInput, TextInput, inputStyles } from "./ui";

export type TodoContextKind = "course" | "activity" | "project" | "assignment" | "meeting" | "idea" | "standalone";

export interface TodoPayload {
  title: string;
  status: TodoStatus;
  priority: number;
  due_at: string | null;
  notes: string | null;
  entity_type: string | null;
  entity_id: number | null;
}

const CONTEXT_KINDS: { value: TodoContextKind; label: string }[] = [
  { value: "standalone", label: "Standalone" },
  { value: "course", label: "Course" },
  { value: "activity", label: "Activity" },
  { value: "project", label: "Project" },
  { value: "assignment", label: "Assignment" },
  { value: "meeting", label: "Meeting" },
  { value: "idea", label: "Idea" },
];

export function TodoEdit({
  open,
  onClose,
  onSave,
  initial,
  defaultContext,
  showContext = false,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: TodoPayload) => Promise<void> | void;
  initial?: Todo | null;
  defaultContext?: { entity_type: string | null; entity_id: number | null } | null;
  showContext?: boolean;
}) {
  const courses = useData<Course[]>("/api/courses");
  const activities = useData<Activity[]>("/api/activities");
  const projects = useData<unknown[]>("/api/projects");
  const assignments = useData<unknown[]>("/api/assignments");
  const meetings = useData<unknown[]>("/api/meetings");
  const ideas = useData<unknown[]>("/api/ideas");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TodoStatus>("todo");
  const [priority, setPriority] = useState(1);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<TodoContextKind>("standalone");
  const [entityId, setEntityId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setStatus(initial?.status ?? "todo");
    setPriority(initial?.priority ?? 1);
    setDue(initial?.due_at ? toLocalInput(initial.due_at) : "");
    setNotes(initial?.notes ?? "");
    const et = initial?.entity_type ?? defaultContext?.entity_type ?? null;
    const ei = initial?.entity_id ?? defaultContext?.entity_id ?? null;
    setKind(
      et === "course" || et === "activity" || et === "project" || et === "assignment" || et === "meeting" || et === "idea"
        ? (et as TodoContextKind)
        : "standalone",
    );
    setEntityId(ei);
  }, [open, initial, defaultContext]);

  const entityOptions = (k: TodoContextKind): { value: number; label: string }[] => {
    const rows = {
      course: courses.data || [],
      activity: activities.data || [],
      project: projects.data || [],
      assignment: assignments.data || [],
      meeting: meetings.data || [],
      idea: ideas.data || [],
    } as Record<string, { id: number; title?: string; name?: string }[]>;
    const all = k === "standalone" ? [] : rows[k] ?? [];
    return all.map((r) => ({ value: r.id, label: r.title || r.name || `#${r.id}` }));
  };

  const options = kind === "standalone" ? [] : entityOptions(kind);
  const selectedId =
    options.some((o) => o.value === entityId) ? entityId : null;

  const save = async () => {
    const payload: TodoPayload = {
      title: title.trim() || "Untitled",
      status,
      priority,
      due_at: due ? new Date(due).toISOString() : null,
      notes: notes.trim() || null,
      entity_type: kind === "standalone" ? null : kind,
      entity_id: kind === "standalone" ? null : selectedId,
    };
    await onSave(payload);
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit to-do" : "New to-do"}>
      <div className="space-y-3">
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="What needs doing?" />
        </Field>
        {showContext && (
          <div className="space-y-2">
            <Field label="Attach to">
              <SelectInput
                value={kind}
                onChange={(v) => {
                  setKind(v as TodoContextKind);
                  setEntityId(null);
                }}
                options={CONTEXT_KINDS}
              />
            </Field>
            {options.length > 0 && (
              <Field label="Item">
                <SelectInput
                  value={selectedId === null ? "" : String(selectedId)}
                  onChange={(v) => setEntityId(v ? Number(v) : null)}
                  options={[
                    { value: "", label: "— Select —" },
                    ...options.map((o) => ({ value: String(o.value), label: o.label })),
                  ]}
                />
              </Field>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectInput
              value={status}
              onChange={(v) => setStatus(v as TodoStatus)}
              options={[
                { value: "todo", label: "To do" },
                { value: "in_progress", label: "In progress" },
                { value: "done", label: "Done" },
              ]}
            />
          </Field>
          <Field label="Priority">
            <SelectInput
              value={String(priority)}
              onChange={(v) => setPriority(Number(v))}
              options={[0, 1, 2].map((p) => ({ value: String(p), label: PRIORITY_ORDER[p] }))}
            />
          </Field>
        </div>
        <Field label="Due date & time">
          <input
            type="datetime-local"
            className={inputStyles}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={`${inputStyles} min-h-[70px] resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details…"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>{initial ? "Save changes" : "Add to-do"}</Button>
        </div>
      </div>
    </Modal>
  );
}
