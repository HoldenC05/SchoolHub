import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import { toLocalInput } from "../lib/datetime";
import type { Assignment, AssignmentKind, AssignmentStatus, Course } from "../lib/types";
import { KIND_LABELS, STATUS_LABELS } from "../lib/types";
import { summarizeGrades } from "../lib/grades";
import { TodoList } from "../components/TodoList";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Pill,
  SelectInput,
  TextInput,
  inputStyles,
} from "../components/ui";

function fmtDue(s: string | null): string {
  if (!s) return "No due date";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_ORDER: AssignmentStatus[] = ["todo", "in_progress", "done", "graded"];

function AssignmentModal({
  open,
  onClose,
  onDone,
  initial,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Assignment;
  courses: Course[] | null;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Assignment>("/api/assignments", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Assignment>("/api/assignments");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<AssignmentKind>(initial?.kind ?? "homework");
  const [courseId, setCourseId] = useState(initial?.course_id ? String(initial.course_id) : "");
  const [dueAt, setDueAt] = useState(toLocalInput(initial?.due_at));
  const [status, setStatus] = useState<AssignmentStatus>(initial?.status ?? "todo");
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      kind,
      status,
      course_id: courseId ? Number(courseId) : null,
      due_at: dueAt || null,
      grade: grade.trim() || null,
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
    <Modal open={open} onClose={onClose} title={editing ? "Edit assignment" : "Add assignment"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Unit 5 problem set" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <SelectInput
              value={kind}
              onChange={(v) => setKind(v as AssignmentKind)}
              options={[
                { value: "homework", label: "Homework" },
                { value: "test", label: "Test" },
                { value: "project", label: "Project" },
              ]}
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={status}
              onChange={(v) => setStatus(v as AssignmentStatus)}
              options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </Field>
        </div>
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
        <Field label="Due date">
          <input type="datetime-local" className={inputStyles} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Grade">
          <TextInput value={grade} onChange={setGrade} placeholder="e.g. 92, A-, 17/20" />
        </Field>
        {error && <p className="text-xs text-rose-600">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function HomeworkTestsPage() {
  const { data: assignments, refresh, loading } = useData<Assignment[]>("/api/assignments");
  const { data: courses } = useData<Course[]>("/api/courses");
  const { update } = useUpdate<Assignment>("/api/assignments");
  const { remove } = useDelete("/api/assignments");
  const [filter, setFilter] = useState<"all" | AssignmentKind>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const courseName = (id: number | null) =>
    courses?.find((c) => c.id === id)?.name || null;

  const cycleStatus = async (a: Assignment) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(a.status) + 1) % STATUS_ORDER.length];
    await update(a.id, { status: next });
    refresh();
  };

  const visible = (assignments || []).filter((a) => filter === "all" || a.kind === filter);

  const statusColor = (s: AssignmentStatus) =>
    s === "done" || s === "graded"
      ? "bg-emerald-50 text-emerald-600"
      : s === "in_progress"
        ? "bg-sky-50 text-sky-700"
        : "bg-slate-100 text-slate-500";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Homework & Tests</h1>
          <p className="text-sm text-slate-500">Track everything that's due</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Add</Button>
      </header>

      {(() => {
        const grades = summarizeGrades((assignments || []).map((a) => a.grade));
        if (grades.count === 0) return null;
        return (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Overall GPA
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {grades.averagePoints?.toFixed(2)}
                  <span className="ml-2 text-lg font-semibold text-slate-500">
                    {grades.letter} · {grades.count} graded
                  </span>
                </p>
                {grades.averagePercent !== null && (
                  <p className="text-sm text-slate-500">
                    {grades.averagePercent}% average
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      <div className="flex gap-2">
        {(["all", "homework", "test", "project"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === k ? "bg-indigo-500 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {k === "all" ? "All" : KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon="✏️" title="Nothing here" hint="Add a homework, test, or project" />
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <div key={a.id}>
              <Card className="group flex items-center justify-between gap-3">
                <button onClick={() => cycleStatus(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Click to change status">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      a.status === "done" || a.status === "graded"
                        ? "border-emerald-500 bg-emerald-100"
                        : "border-slate-300"
                    }`}
                  >
                    {(a.status === "done" || a.status === "graded") && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate font-medium text-slate-900 ${a.status === "done" || a.status === "graded" ? "line-through opacity-60" : ""}`}>
                      {a.title}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {courseName(a.course_id) || "No class"} · {fmtDue(a.due_at)}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {a.grade && (
                    <Pill className="bg-emerald-50 text-emerald-600">{a.grade}</Pill>
                  )}
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
                  <button onClick={() => cycleStatus(a)} title="Change status" className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${statusColor(a.status)}`}>
                    {STATUS_LABELS[a.status]}
                  </button>
                  <IconButton
                    title={expanded === a.id ? "Hide to-dos" : "Show to-dos"}
                    onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M5.5 3.5h8M5.5 8h8M5.5 12.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M2.5 3.5h.01M2.5 8h.01M2.5 12.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </IconButton>
                  <IconButton
                    title="Edit"
                    onClick={() => {
                      setEditing(a);
                      setModalOpen(true);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  </IconButton>
                  <DeleteButton
                    onConfirm={async () => {
                      await remove(a.id);
                      refresh();
                    }}
                  />
                </div>
              </Card>
              {expanded === a.id && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <TodoList entityType="assignment" entityId={a.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AssignmentModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onDone={refresh}
        initial={editing ?? undefined}
        courses={courses}
      />
    </div>
  );
}
