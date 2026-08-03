import { useMemo, useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import type {
  Assignment,
  AssignmentKind,
  AssignmentStatus,
  Course,
  CourseFile,
  Meeting,
  Note,
  Project,
} from "../lib/types";
import { KIND_LABELS, STATUS_LABELS } from "../lib/types";
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
} from "../components/ui";

type SubTab = "overview" | "calendar" | "assignments" | "meetings" | "notes" | "files" | "projects";

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{8}$/.test(t)) return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (iso)
    return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDue(s: string | null): string {
  if (!s) return "No date";
  const d = parseDate(s);
  if (!d) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtWhen(s: string | null): string {
  if (!s) return "No date set";
  const d = parseDate(s);
  if (!d) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

const KIND_COLOR: Record<AssignmentKind | "meeting", string> = {
  homework: "bg-sky-500/15 text-sky-300",
  test: "bg-rose-500/15 text-rose-300",
  project: "bg-amber-500/15 text-amber-300",
  meeting: "bg-indigo-500/15 text-indigo-300",
};

const KIND_DOT: Record<AssignmentKind | "meeting", string> = {
  homework: "bg-sky-400",
  test: "bg-rose-400",
  project: "bg-amber-400",
  meeting: "bg-indigo-400",
};

const STATUS_ORDER: AssignmentStatus[] = ["todo", "in_progress", "done", "graded"];

export function CoursePage({ courseId }: { courseId: number }) {
  const { data: course } = useData<Course>(`/api/courses/${courseId}`);
  const { data: assignments, refresh: refreshAssignments } = useData<Assignment[]>("/api/assignments");
  const { data: meetings, refresh: refreshMeetings } = useData<Meeting[]>("/api/meetings");
  const { data: projects, refresh: refreshProjects } = useData<Project[]>("/api/projects");
  const { data: notes, refresh: refreshNotes } = useData<Note[]>("/api/notes");
  const { data: files, refresh: refreshFiles } = useData<CourseFile[]>("/api/files");
  const [sub, setSub] = useState<SubTab>("overview");
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; editing: Assignment | null }>({
    open: false,
    editing: null,
  });
  const [meetingModal, setMeetingModal] = useState<{ open: boolean; editing: Meeting | null }>({
    open: false,
    editing: null,
  });

  if (!course) return <p className="text-sm text-slate-500">Loading…</p>;

  const myAssignments =
    (assignments || []).filter((a) => a.course_id === courseId) || [];
  const myMeetings = (meetings || []).filter((m) => m.course_id === courseId) || [];
  const myProjects = (projects || []).filter((p) => p.course_id === courseId) || [];
  const myNotes =
    notes?.filter((n) => n.entity_type === "course" && n.entity_id === courseId) || [];
  const myFiles = (files || []).filter((f) => f.course_id === courseId) || [];

  const upcoming = myAssignments.filter(
    (a) => (a.status === "todo" || a.status === "in_progress") && a.due_at,
  );
  const nextUp = upcoming.sort((a, b) => (a.due_at || "").localeCompare(b.due_at || ""))[0];

  const tabs: { key: SubTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "calendar", label: "Calendar" },
    { key: "assignments", label: `Assignments (${myAssignments.length})` },
    { key: "meetings", label: `Meetings (${myMeetings.length})` },
    { key: "notes", label: `Notes (${myNotes.length})` },
    { key: "files", label: `Files (${myFiles.length})` },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold"
            style={{ backgroundColor: (course.color || "#334155") + "33", color: course.color || "#94a3b8" }}
          >
            {course.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{course.name}</h1>
            <p className="text-sm text-slate-400">
              {[course.teacher, course.term].filter(Boolean).join(" · ") || "Course"}
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              sub === t.key
                ? "bg-indigo-500 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "overview" && (
        <div className="space-y-4">
          {nextUp && (
            <Card className="border-indigo-500/30 bg-indigo-500/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Next up
              </p>
              <p className="mt-1 font-medium text-slate-100">{nextUp.title}</p>
              <p className="text-sm text-slate-400">
                {KIND_LABELS[nextUp.kind]} · {fmtDue(nextUp.due_at)}
              </p>
            </Card>
          )}
          {course.blackboard_url && (
            <Card className="border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Blackboard
              </p>
              <a
                href={course.blackboard_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-sm font-medium text-indigo-300 hover:underline"
              >
                {course.blackboard_url}
              </a>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-2xl font-bold text-slate-100">
                {myAssignments.filter((a) => a.kind === "test").length}
              </p>
              <p className="text-sm text-slate-500">Tests</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">
                {myAssignments.filter((a) => a.kind === "homework").length}
              </p>
              <p className="text-sm text-slate-500">Homework</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myMeetings.length}</p>
              <p className="text-sm text-slate-500">Meetings</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myNotes.length}</p>
              <p className="text-sm text-slate-500">Notes</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myFiles.length}</p>
              <p className="text-sm text-slate-500">Files</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myProjects.length}</p>
              <p className="text-sm text-slate-500">Projects</p>
            </Card>
          </div>
          {myAssignments.filter((a) => a.status === "todo" || a.status === "in_progress").length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Open assignments
              </h3>
              <div className="space-y-2">
                {myAssignments
                  .filter((a) => a.status === "todo" || a.status === "in_progress")
                  .slice(0, 5)
                  .map((a) => (
                    <Card key={a.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{a.title}</p>
                        <p className="text-xs text-slate-500">{fmtDue(a.due_at)}</p>
                      </div>
                      <Pill className={KIND_COLOR[a.kind]}>{KIND_LABELS[a.kind]}</Pill>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sub === "calendar" && (
        <ClassCalendar assignments={myAssignments} meetings={myMeetings} />
      )}

      {sub === "assignments" && (
        <AssignmentList
          assignments={myAssignments}
          onAdd={() => setAssignmentModal({ open: true, editing: null })}
          onEdit={(a) => setAssignmentModal({ open: true, editing: a })}
          onChanged={refreshAssignments}
        />
      )}

      {sub === "meetings" && (
        <MeetingList
          meetings={myMeetings}
          onAdd={() => setMeetingModal({ open: true, editing: null })}
          onEdit={(m) => setMeetingModal({ open: true, editing: m })}
          onChanged={refreshMeetings}
        />
      )}

      {sub === "notes" && (
        <NoteList notes={myNotes} onChanged={refreshNotes} courseId={courseId} />
      )}

      {sub === "files" && (
        <FileList files={myFiles} onChanged={refreshFiles} courseId={courseId} />
      )}

      {sub === "projects" && (
        <ProjectList
          projects={myProjects}
          onChanged={refreshProjects}
          courseId={courseId}
        />
      )}

      <CourseAssignmentModal
        key={assignmentModal.editing?.id ?? "new"}
        open={assignmentModal.open}
        onClose={() => setAssignmentModal({ open: false, editing: null })}
        onDone={refreshAssignments}
        initial={assignmentModal.editing ?? undefined}
        courseId={courseId}
      />
      <CourseMeetingModal
        key={meetingModal.editing?.id ?? "new"}
        open={meetingModal.open}
        onClose={() => setMeetingModal({ open: false, editing: null })}
        onDone={refreshMeetings}
        initial={meetingModal.editing ?? undefined}
        courseId={courseId}
      />
    </div>
  );
}

function ClassCalendar({
  assignments,
  meetings,
}: {
  assignments: Assignment[];
  meetings: Meeting[];
}) {
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const todayKey = dayKey(new Date());

  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, key: dayKey(d), inMonth: d.getMonth() === anchor.getMonth() };
    });
  }, [anchor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, { kind: AssignmentKind | "meeting"; title: string; id: number }[]>();
    const push = (
      key: string,
      it: { kind: AssignmentKind | "meeting"; title: string; id: number },
    ) => {
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    };
    for (const a of assignments) {
      const d = parseDate(a.due_at);
      if (d) push(dayKey(d), { kind: a.kind, title: a.title, id: a.id });
    }
    for (const m of meetings) {
      const d = parseDate(m.starts_at);
      if (d) push(dayKey(d), { kind: "meeting", title: m.title, id: m.id });
    }
    return map;
  }, [assignments, meetings]);

  const selectedItems = selected ? itemsByDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))}>
            ←
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const now = new Date();
              setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Today
          </Button>
          <Button variant="ghost" onClick={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))}>
            →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="bg-slate-950 px-2 py-1 text-center text-xs font-semibold text-slate-500">
            {d}
          </div>
        ))}
        {monthCells.map((c) => {
          const items = itemsByDay.get(c.key) ?? [];
          return (
            <button
              key={c.key}
              onClick={() => setSelected(selected === c.key ? null : c.key)}
              className={`flex min-h-16 flex-col items-start gap-1 p-1 text-left transition-colors ${
                c.inMonth ? "bg-slate-900" : "bg-slate-950/60"
              } hover:bg-slate-800 ${
                selected === c.key ? "ring-2 ring-inset ring-indigo-500" : ""
              }`}
            >
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  c.key === todayKey ? "bg-indigo-500 font-semibold text-white" : "text-slate-400"
                }`}
              >
                {c.date.getDate()}
              </span>
              {items.slice(0, 3).map((it) => (
                <span
                  key={it.id}
                  className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium"
                  title={it.title}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[it.kind]}`} />
                  <span className="truncate text-slate-300">{it.title}</span>
                </span>
              ))}
              {items.length > 3 && (
                <span className="px-1 text-[11px] text-slate-500">+{items.length - 3} more</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {(Object.keys(KIND_DOT) as (AssignmentKind | "meeting")[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT[k]}`} />
            {k === "meeting" ? "Meeting" : KIND_LABELS[k]}
          </span>
        ))}
      </div>

      {selected && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {parseDate(selected)?.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing scheduled.</p>
          ) : (
            selectedItems.map((it) => (
              <Card key={it.id} className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-medium text-slate-100">{it.title}</p>
                <Pill className={KIND_COLOR[it.kind]}>
                  {it.kind === "meeting" ? "Meeting" : KIND_LABELS[it.kind]}
                </Pill>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentList({
  assignments,
  onAdd,
  onEdit,
  onChanged,
}: {
  assignments: Assignment[];
  onAdd: () => void;
  onEdit: (a: Assignment) => void;
  onChanged: () => void;
}) {
  const { update } = useUpdate<Assignment>("/api/assignments");
  const { remove } = useDelete("/api/assignments");
  const [filter, setFilter] = useState<"all" | AssignmentKind>("all");

  const cycleStatus = async (a: Assignment) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(a.status) + 1) % STATUS_ORDER.length];
    await update(a.id, { status: next });
    onChanged();
  };

  const visible = assignments
    .filter((a) => filter === "all" || a.kind === filter)
    .sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at.localeCompare(b.due_at);
    });

  const statusColor = (s: AssignmentStatus) =>
    s === "done" || s === "graded"
      ? "bg-emerald-500/15 text-emerald-300"
      : s === "in_progress"
        ? "bg-sky-500/15 text-sky-300"
        : "bg-slate-800 text-slate-400";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["all", "homework", "test", "project"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filter === k ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {k === "all" ? "All" : KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <Button onClick={onAdd}>+ Assignment</Button>
      </div>
      {visible.length === 0 ? (
        <EmptyState icon="✏️" title="Nothing here" hint="Add a homework, test, or project" />
      ) : (
        visible.map((a) => (
          <Card key={a.id} className="group flex items-center justify-between gap-3">
            <button onClick={() => cycleStatus(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Click to change status">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  a.status === "done" || a.status === "graded"
                    ? "border-emerald-400 bg-emerald-400/20"
                    : "border-slate-600"
                }`}
              >
                {(a.status === "done" || a.status === "graded") && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className={`block truncate font-medium text-slate-100 ${a.status === "done" || a.status === "graded" ? "line-through opacity-60" : ""}`}>
                  {a.title}
                </span>
                <span className="block text-xs text-slate-500">{fmtDue(a.due_at)}</span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1.5">
              <Pill className={KIND_COLOR[a.kind]}>{KIND_LABELS[a.kind]}</Pill>
              <button onClick={() => cycleStatus(a)} title="Change status" className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${statusColor(a.status)}`}>
                {STATUS_LABELS[a.status]}
              </button>
              <IconButton title="Edit" onClick={() => onEdit(a)}>
                <EditIcon />
              </IconButton>
              <DeleteButton
                onConfirm={async () => {
                  await remove(a.id);
                  onChanged();
                }}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function MeetingList({
  meetings,
  onAdd,
  onEdit,
  onChanged,
}: {
  meetings: Meeting[];
  onAdd: () => void;
  onEdit: (m: Meeting) => void;
  onChanged: () => void;
}) {
  const { remove } = useDelete("/api/meetings");
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Meeting</Button>
      </div>
      {meetings.length === 0 ? (
        <EmptyState icon="🤝" title="No meetings" hint="Add the first one" />
      ) : (
        meetings.map((m) => (
          <Card key={m.id} className="group flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-100">{m.title}</p>
              <p className="text-xs text-slate-500">{fmtWhen(m.starts_at)}</p>
              {m.agenda && <p className="mt-1 text-sm text-slate-400">{m.agenda}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <IconButton title="Edit" onClick={() => onEdit(m)}>
                <EditIcon />
              </IconButton>
              <DeleteButton
                onConfirm={async () => {
                  await remove(m.id);
                  onChanged();
                }}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function NoteList({
  notes,
  onChanged,
  courseId,
}: {
  notes: Note[];
  onChanged: () => void;
  courseId: number;
}) {
  const { create, error } = useCreate<Note>("/api/notes", onChanged);
  const { update } = useUpdate<Note>("/api/notes");
  const { remove } = useDelete("/api/notes");
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const startEdit = (n: Note) => {
    setEditing(n);
    setTitle(n.title);
    setBody(n.body_md);
  };

  const save = async () => {
    if (!title.trim()) return;
    if (editing) {
      const ok = await update(editing.id, { title: title.trim(), body_md: body });
      if (ok) {
        setEditing(null);
        onChanged();
      }
    } else {
      create({
        title: title.trim(),
        body_md: body,
        entity_type: "course",
        entity_id: courseId,
      });
    }
    setTitle("");
    setBody("");
  };

  return (
    <div className="space-y-3">
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-center gap-2">
            <TextInput value={title} onChange={setTitle} placeholder={editing ? "Editing…" : "Note title"} />
            {editing && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setTitle("");
                  setBody("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <textarea
            className="min-h-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write in Markdown…"
          />
          {error && <p className="text-xs text-rose-400">{error.message}</p>}
          <div className="flex justify-end">
            <Button type="submit">{editing ? "Save" : "Add note"}</Button>
          </div>
        </form>
      </Card>
      {notes.length === 0 ? (
        <EmptyState icon="📝" title="No notes" />
      ) : (
        notes.map((n) => (
          <Card key={n.id} className="group">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-100">{n.title}</p>
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <IconButton title="Edit" onClick={() => startEdit(n)}>
                  <EditIcon />
                </IconButton>
                <DeleteButton
                  onConfirm={async () => {
                    await remove(n.id);
                    onChanged();
                  }}
                />
              </div>
            </div>
            {n.body_md && (
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{n.body_md}</pre>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function FileList({
  files,
  onChanged,
  courseId,
}: {
  files: CourseFile[];
  onChanged: () => void;
  courseId: number;
}) {
  const { remove } = useDelete("/api/files");
  const [modal, setModal] = useState<{ open: boolean; editing: CourseFile | null }>({
    open: false,
    editing: null,
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setModal({ open: true, editing: null })}>+ Upload</Button>
      </div>
      {files.length === 0 ? (
        <EmptyState icon="📎" title="No files" hint="Upload notes, worksheets, or study guides" />
      ) : (
        files.map((f) => {
          const href = f.data
            ? `data:${f.mime || "application/octet-stream"};base64,${f.data}`
            : null;
          return (
            <Card key={f.id} className="group flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-100">{f.title}</p>
                <p className="text-xs text-slate-500">
                  {f.filename}
                  {f.size ? ` · ${(f.size / 1024).toFixed(1)} KB` : ""}
                </p>
                {f.notes && <p className="mt-1 text-sm text-slate-400">{f.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {href && (
                  <a
                    href={href}
                    download={f.filename || f.title}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                    title="Download"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                )}
                <IconButton title="Edit" onClick={() => setModal({ open: true, editing: f })}>
                  <EditIcon />
                </IconButton>
                <DeleteButton
                  onConfirm={async () => {
                    await remove(f.id);
                    onChanged();
                  }}
                />
              </div>
            </Card>
          );
        })
      )}
      <FileModal
        key={modal.editing?.id ?? "new"}
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        onDone={onChanged}
        initial={modal.editing ?? undefined}
        courseId={courseId}
      />
    </div>
  );
}

function FileModal({
  open,
  onClose,
  onDone,
  initial,
  courseId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: CourseFile;
  courseId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<CourseFile>("/api/files", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<CourseFile>("/api/files");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; size: number; data: string } | null>(null);
  const error = createError || updateError;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      setFileMeta({
        name: f.name,
        mime: f.type,
        size: f.size,
        data: comma >= 0 ? result.slice(comma + 1) : result,
      });
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      notes: notes.trim() || null,
      course_id: courseId,
      ...(initial
        ? {}
        : {
            filename: fileMeta?.name ?? null,
            mime: fileMeta?.mime ?? null,
            size: fileMeta?.size ?? null,
            data: fileMeta?.data ?? null,
          }),
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
    <Modal open={open} onClose={onClose} title={editing ? "Edit file" : "Upload a file"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Chapter 4 worksheet" />
        </Field>
        {!editing && (
          <Field label="File">
            <input
              type="file"
              onChange={onPick}
              className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
            />
          </Field>
        )}
        {fileMeta && (
          <p className="text-xs text-slate-500">
            {fileMeta.name} · {(fileMeta.size / 1024).toFixed(1)} KB
          </p>
        )}
        <Field label="Notes">
          <TextInput value={notes} onChange={setNotes} placeholder="Optional" />
        </Field>
        {error && <p className="text-xs text-rose-400">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Upload"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectList({
  projects,
  onChanged,
  courseId,
}: {
  projects: Project[];
  onChanged: () => void;
  courseId: number;
}) {
  const { update } = useUpdate<Project>("/api/projects");
  const { remove } = useDelete("/api/projects");
  const [modal, setModal] = useState<{ open: boolean; editing: Project | null }>({
    open: false,
    editing: null,
  });

  const cycleStatus = async (p: Project) => {
    const next =
      p.status === "backlog" ? "in_progress" : p.status === "in_progress" ? "done" : "backlog";
    await update(p.id, { status: next });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setModal({ open: true, editing: null })}>+ Project</Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState icon="🚀" title="No projects" hint="Add the first one" />
      ) : (
        projects.map((p) => (
          <Card key={p.id} className="group flex items-center justify-between gap-3">
            <button onClick={() => cycleStatus(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Click to change status">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  p.status === "done" ? "border-emerald-400 bg-emerald-400/20" : "border-slate-600"
                }`}
              >
                {p.status === "done" && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className={`block truncate font-medium text-slate-100 ${p.status === "done" ? "line-through opacity-60" : ""}`}>
                  {p.title}
                </span>
                <span className="block text-xs text-slate-500">
                  {p.status === "in_progress" ? "In progress" : p.status} · due {fmtWhen(p.deadline)}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <IconButton title="Edit" onClick={() => setModal({ open: true, editing: p })}>
                <EditIcon />
              </IconButton>
              <DeleteButton
                onConfirm={async () => {
                  await remove(p.id);
                  onChanged();
                }}
              />
            </div>
          </Card>
        ))
      )}
      <ProjectModal
        key={modal.editing?.id ?? "new"}
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        onDone={onChanged}
        initial={modal.editing ?? undefined}
        courseId={courseId}
      />
    </div>
  );
}

function CourseAssignmentModal({
  open,
  onClose,
  onDone,
  initial,
  courseId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Assignment;
  courseId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Assignment>("/api/assignments", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Assignment>("/api/assignments");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<AssignmentKind>(initial?.kind ?? "homework");
  const [dueAt, setDueAt] = useState(initial?.due_at ?? "");
  const [status, setStatus] = useState<AssignmentStatus>(initial?.status ?? "todo");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      kind,
      status,
      course_id: courseId,
      due_at: dueAt || null,
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
        <Field label="Due date">
          <TextInput value={dueAt} onChange={setDueAt} placeholder="e.g. 2026-09-15T23:59" />
        </Field>
        {error && <p className="text-xs text-rose-400">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CourseMeetingModal({
  open,
  onClose,
  onDone,
  initial,
  courseId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Meeting;
  courseId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Meeting>("/api/meetings", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Meeting>("/api/meetings");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [startsAt, setStartsAt] = useState(initial?.starts_at ?? "");
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      starts_at: startsAt || null,
      agenda: agenda || null,
      course_id: courseId,
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
    <Modal open={open} onClose={onClose} title={editing ? "Edit meeting" : "Add meeting"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Study session" />
        </Field>
        <Field label="When">
          <TextInput value={startsAt} onChange={setStartsAt} placeholder="e.g. 2026-09-20T16:00" />
        </Field>
        <Field label="Agenda">
          <TextInput value={agenda} onChange={setAgenda} placeholder="e.g. Review chapters 1–3" />
        </Field>
        {error && <p className="text-xs text-rose-400">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectModal({
  open,
  onClose,
  onDone,
  initial,
  courseId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Project;
  courseId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Project>("/api/projects", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Project>("/api/projects");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [status, setStatus] = useState(initial?.status ?? "backlog");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      deadline: deadline || null,
      status,
      course_id: courseId,
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
    <Modal open={open} onClose={onClose} title={editing ? "Edit project" : "Add project"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Research paper" />
        </Field>
        <Field label="Deadline">
          <TextInput value={deadline} onChange={setDeadline} placeholder="e.g. 2026-11-02" />
        </Field>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={status === "done"}
            onChange={(e) => setStatus(e.target.checked ? "done" : "backlog")}
            className="h-4 w-4 accent-indigo-500"
          />
          <span className="text-sm text-slate-300">Mark as done</span>
        </div>
        {error && <p className="text-xs text-rose-400">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
