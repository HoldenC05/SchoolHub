import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import type { Course } from "../lib/types";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  TextInput,
} from "../components/ui";

const COLOR_OPTIONS = ["#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#94a3b8"];

function CourseModal({
  open,
  onClose,
  onDone,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Course;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Course>("/api/courses", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Course>("/api/courses");
  const [name, setName] = useState(initial?.name ?? "");
  const [teacher, setTeacher] = useState(initial?.teacher ?? "");
  const [term, setTerm] = useState(initial?.term ?? "");
  const [color, setColor] = useState(initial?.color ?? COLOR_OPTIONS[0]);
  const error = createError || updateError;

  const save = async () => {
    if (!name.trim()) return;
    const body = {
      name: name.trim(),
      teacher: teacher.trim() || null,
      term: term.trim() || null,
      color,
    };
    if (initial) {
      const ok = await update(initial.id, body);
      if (ok) {
        onClose();
        onDone();
      }
    } else {
      create(body);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit class" : "Add a class"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Class name">
          <TextInput value={name} onChange={setName} placeholder="e.g. AP Calculus BC" />
        </Field>
        <Field label="Teacher">
          <TextInput value={teacher} onChange={setTeacher} placeholder="e.g. Ms. Alvarez" />
        </Field>
        <Field label="Term">
          <TextInput value={term} onChange={setTerm} placeholder="e.g. Fall 2026" />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Color</p>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-slate-300" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-rose-600">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add class"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ClassesPage({ onOpenCourse }: { onOpenCourse: (id: number) => void }) {
  const { data: courses, refresh, loading } = useData<Course[]>("/api/courses");
  const { remove } = useDelete("/api/courses");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
          <p className="text-sm text-slate-500">Your courses for the term</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Add class</Button>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !courses || courses.length === 0 ? (
        <EmptyState icon="📚" title="No classes yet" hint="Add your first class to get started" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <Card key={c.id} className="group flex items-start gap-3">
              <button onClick={() => onOpenCourse(c.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color || "#334155" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{c.name}</span>
                  <span className="block text-sm text-slate-500">
                    {[c.teacher, c.term].filter(Boolean).join(" · ") || "No details yet"}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <IconButton
                  title="Edit"
                  onClick={() => {
                    setEditing(c);
                    setModalOpen(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </IconButton>
                <DeleteButton
                  onConfirm={async () => {
                    await remove(c.id);
                    refresh();
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <CourseModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onDone={refresh}
        initial={editing ?? undefined}
      />
    </div>
  );
}
