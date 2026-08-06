import { useState } from "react";
import { api } from "../lib/api";
import { refreshAll, useData } from "../lib/useData";
import type { AssignmentKind, Course } from "../lib/types";
import { KIND_LABELS } from "../lib/types";
import { Button, Field, Modal, SelectInput, TextInput, inputStyles } from "./ui";

type Kind = "task" | "note" | "assignment" | "meeting";

const TABS: { key: Kind; label: string }[] = [
  { key: "task", label: "Task" },
  { key: "note", label: "Note" },
  { key: "assignment", label: "Assignment" },
  { key: "meeting", label: "Meeting" },
];

function toIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("task");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: courses } = useData<Course[]>("/api/courses");

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [assignKind, setAssignKind] = useState<AssignmentKind>("homework");
  const [courseId, setCourseId] = useState("");

  const reset = () => {
    setTitle("");
    setDueAt("");
    setStartsAt("");
    setAssignKind("homework");
    setCourseId("");
    setError(null);
    setBusy(false);
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "task") {
        await api.create("/api/todos", { title: title.trim(), due_at: toIso(dueAt) });
      } else if (kind === "note") {
        await api.create("/api/notes", { title: title.trim() });
      } else if (kind === "assignment") {
        await api.create("/api/assignments", {
          title: title.trim(),
          kind: assignKind,
          course_id: courseId ? Number(courseId) : null,
          due_at: toIso(dueAt),
        });
      } else {
        await api.create("/api/meetings", {
          title: title.trim(),
          starts_at: toIso(startsAt),
        });
      }
      refreshAll();
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openWith = (k: Kind) => {
    setKind(k);
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={() => openWith("task")}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        title="Quick add"
        aria-label="Quick add"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Quick add">
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setKind(t.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                kind === t.key
                  ? "bg-indigo-500 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={kind === "meeting" ? "Meeting title" : "Title"}>
            <TextInput
              value={title}
              onChange={setTitle}
              placeholder={
                kind === "task"
                  ? "e.g. Read chapter 4"
                  : kind === "note"
                    ? "e.g. Chemistry formula sheet"
                    : kind === "assignment"
                      ? "e.g. Essay draft"
                      : "e.g. Robotics club meeting"
              }
            />
          </Field>

          {kind === "task" && (
            <Field label="Due">
              <input type="datetime-local" className={inputStyles} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
          )}

          {kind === "assignment" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <SelectInput
                    value={assignKind}
                    onChange={(v) => setAssignKind(v as AssignmentKind)}
                    options={(["homework", "test", "project"] as const).map((k) => ({
                      value: k,
                      label: KIND_LABELS[k],
                    }))}
                  />
                </Field>
                <Field label="Class">
                  <SelectInput
                    value={courseId}
                    onChange={setCourseId}
                    options={[
                      { value: "", label: "No class" },
                      ...(courses || []).map((c) => ({ value: String(c.id), label: c.name })),
                    ]}
                  />
                </Field>
              </div>
              <Field label="Due">
                <input type="datetime-local" className={inputStyles} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </Field>
            </>
          )}

          {kind === "meeting" && (
            <Field label="Starts">
              <input type="datetime-local" className={inputStyles} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()} className="disabled:opacity-50">
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
