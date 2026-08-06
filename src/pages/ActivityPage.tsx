import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import { api } from "../lib/api";
import { toLocalInput } from "../lib/datetime";
import type { Activity, Meeting, Note, Project, ProjectTask, Todo } from "../lib/types";
import type { Nav } from "../lib/nav";
import { InlineNoteEditor } from "../components/InlineNoteEditor";
import { formatTags, mergeTags, parseTags } from "../lib/tags";
import { TagPills } from "../components/Tags";
import { TodoList } from "../components/TodoList";
import { TimeSection } from "../components/TimeSection";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Pill,
  TextInput,
  inputStyles,
} from "../components/ui";

type SubTab = "overview" | "meetings" | "projects" | "notes" | "todos" | "time";

function fmtWhen(s: string | null): string {
  if (!s) return "No date set";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M3 1.5h8l2 2v11H3v-13z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ListIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M5.5 3.5h8M5.5 8h8M5.5 12.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M2.5 3.5h.01M2.5 8h.01M2.5 12.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export function ActivityPage({ activityId, onOpenNote }: { activityId: number; onOpenNote: (id: number, returnTo?: Nav) => void }) {
  const { data: activity } = useData<Activity>(`/api/activities/${activityId}`);
  const { data: meetings, refresh: refreshMeetings } = useData<Meeting[]>("/api/meetings");
  const { data: projects, refresh: refreshProjects } = useData<Project[]>("/api/projects");
  const { data: notes, refresh: refreshNotes } = useData<Note[]>("/api/notes");
  const { data: tasks, refresh: refreshTasks } = useData<ProjectTask[]>("/api/project_tasks");
  const { data: todos, refresh: refreshTodos } = useData<Todo[]>("/api/todos");
  const [sub, setSub] = useState<SubTab>("overview");
  const [meetingModal, setMeetingModal] = useState<{ open: boolean; editing: Meeting | null }>({
    open: false,
    editing: null,
  });
  const [projectModal, setProjectModal] = useState<{ open: boolean; editing: Project | null }>({
    open: false,
    editing: null,
  });

  if (!activity) return <p className="text-sm text-slate-500">Loading…</p>;

  const mine = <T extends { activity_id: number | null }>(xs: T[] | null) =>
    (xs || []).filter((x) => x.activity_id === activityId);

  const myMeetings = mine(meetings);
  const myProjects = mine(projects);
  const myNotes = notes?.filter((n) => n.entity_type === "activity" && n.entity_id === activityId) || [];
  const myTodos = (todos || []).filter((t) => t.entity_type === "activity" && t.entity_id === activityId) || [];
  const upcoming = myMeetings.filter((m) => !m.starts_at || new Date(m.starts_at) >= new Date());
  const nextMeeting = upcoming.sort((a, b) =>
    (a.starts_at || "").localeCompare(b.starts_at || ""),
  )[0];

  const tabs: { key: SubTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "meetings", label: `Meetings (${myMeetings.length})` },
    { key: "projects", label: `Projects (${myProjects.length})` },
    { key: "notes", label: `Notes (${myNotes.length})` },
    { key: "todos", label: `To-Dos (${myTodos.length})` },
    { key: "time", label: "Time" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
            style={{ backgroundColor: (activity.color || "#334155") + "33" }}
          >
            {activity.icon || activity.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{activity.name}</h1>
            <p className="text-sm text-slate-400">
              {[activity.category, activity.contact].filter(Boolean).join(" · ") || "Activity"}
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
                : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "overview" && (
        <div className="space-y-4">
          {nextMeeting && (
            <Card className="border-indigo-500/30 bg-indigo-500/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Next meeting
              </p>
              <p className="mt-1 font-medium text-slate-900">{nextMeeting.title}</p>
              <p className="text-sm text-slate-400">{fmtWhen(nextMeeting.starts_at)}</p>
              {nextMeeting.agenda && (
                <p className="mt-2 text-sm text-slate-600">{nextMeeting.agenda}</p>
              )}
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-2xl font-bold text-slate-900">{myMeetings.length}</p>
              <p className="text-sm text-slate-500">Meetings</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-900">{myProjects.length}</p>
              <p className="text-sm text-slate-500">Projects</p>
            </Card>
          </div>
          {myProjects.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Active projects
              </h3>
              <div className="space-y-2">
                {myProjects.map((p) => (
                  <Card key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{p.title}</p>
                      <p className="text-xs text-slate-500">{fmtWhen(p.deadline)}</p>
                    </div>
                    <Pill
                      className={
                        p.status === "done"
                          ? "bg-emerald-50 text-emerald-600"
                          : p.status === "in_progress"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-100 text-slate-500"
                      }
                    >
                      {p.status.replace("_", " ")}
                    </Pill>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sub === "meetings" && (
        <MeetingList
          meetings={myMeetings}
          onAdd={() => setMeetingModal({ open: true, editing: null })}
          onEdit={(m) => setMeetingModal({ open: true, editing: m })}
          onChanged={refreshMeetings}
          onOpenNote={(id) => onOpenNote(id, { kind: "meeting", id })}
        />
      )}

      {sub === "projects" && (
        <ProjectList
          projects={myProjects}
          tasks={(tasks || []).filter((t) => myProjects.some((p) => p.id === t.project_id))}
          onAdd={() => setProjectModal({ open: true, editing: null })}
          onEdit={(p) => setProjectModal({ open: true, editing: p })}
          onChanged={refreshProjects}
          onTasksChanged={refreshTasks}
          activityName={activity.name}
          onOpenNote={(id) => onOpenNote(id, { kind: "activity", id: activityId, sub })}
        />
      )}

      {sub === "notes" && (
        <NoteList notes={myNotes} onChanged={refreshNotes} activityId={activityId} activityName={activity.name} onOpenNote={(id) => onOpenNote(id, { kind: "activity", id: activityId, sub })} />
      )}

      {sub === "todos" && (
        <TodoList entityType="activity" entityId={activityId} onChanged={refreshTodos} />
      )}

      {sub === "time" && (
        <TimeSection entityType="activity" entityId={activityId} entityName={activity.name} />
      )}

      <MeetingModal
        key={meetingModal.editing ? `meeting-${meetingModal.editing.id}` : "add-meeting"}
        open={meetingModal.open}
        onClose={() => setMeetingModal({ open: false, editing: null })}
        onDone={refreshMeetings}
        initial={meetingModal.editing ?? undefined}
        activityId={activityId}
      />
      <ProjectModal
        key={projectModal.editing ? `project-${projectModal.editing.id}` : "add-project"}
        open={projectModal.open}
        onClose={() => setProjectModal({ open: false, editing: null })}
        onDone={refreshProjects}
        initial={projectModal.editing ?? undefined}
        activityId={activityId}
      />
    </div>
  );
}

function MeetingList({
  meetings,
  onAdd,
  onEdit,
  onChanged,
  onOpenNote,
}: {
  meetings: Meeting[];
  onAdd: () => void;
  onEdit: (m: Meeting) => void;
  onChanged: () => void;
  onOpenNote: (id: number, returnTo?: Nav) => void;
}) {
  const { remove } = useDelete("/api/meetings");
  const { update } = useUpdate<Meeting>("/api/meetings");
  const [openNotes, setOpenNotes] = useState<number | null>(null);
  const [openTodos, setOpenTodos] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const saveNotes = async (m: Meeting, html: string) => {
    setDrafts((d) => ({ ...d, [m.id]: html }));
    await update(m.id, { notes: html });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Meeting</Button>
      </div>
      {meetings.length === 0 ? (
        <EmptyState icon="🤝" title="No meetings" hint="Add the first one" />
      ) : (
meetings.map((m) => {
            const expanded = openNotes === m.id;
            const notesHtml = drafts[m.id] ?? m.notes ?? "";
            return (
              <Card key={m.id} className="group cursor-pointer" onClick={() => onOpenNote(m.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{m.title}</p>
                  <p className="text-xs text-slate-500">{fmtWhen(m.starts_at)}</p>
                  {m.agenda && <p className="mt-1 text-sm text-slate-500">{m.agenda}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={() => setOpenNotes(expanded ? null : m.id)}
                    className={`rounded-md p-1.5 text-slate-500 transition-transform hover:bg-slate-100 ${
                      expanded ? "rotate-90" : ""
                    }`}
                    title={expanded ? "Hide notes" : "Take notes"}
                  >
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                      <path d="M2 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setOpenTodos(openTodos === m.id ? null : m.id)}
                    className={`rounded-md p-1.5 text-slate-500 transition-transform hover:bg-slate-100 ${
                      openTodos === m.id ? "rotate-90" : ""
                    }`}
                    title={openTodos === m.id ? "Hide to-dos" : "Show to-dos"}
                  >
                    <ListIcon />
                  </button>
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
              </div>
              {expanded && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <InlineNoteEditor
                    initialHtml={notesHtml}
                    onSave={(html: string) => void saveNotes(m, html)}
                  />
                </div>
              )}
              {openTodos === m.id && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <TodoList entityType="meeting" entityId={m.id} />
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function ProjectList({
  projects,
  tasks,
  onAdd,
  onEdit,
  onChanged,
  onTasksChanged,
  activityName,
  onOpenNote,
}: {
  projects: Project[];
  tasks: ProjectTask[];
  onAdd: () => void;
  onEdit: (p: Project) => void;
  onChanged: () => void;
  onTasksChanged: () => void;
  activityName: string;
  onOpenNote: (id: number, returnTo?: Nav) => void;
}) {
  const { update } = useUpdate<Project>("/api/projects");
  const { remove } = useDelete("/api/projects");
  const { create: createTask } = useCreate<ProjectTask>("/api/project_tasks");
  const { update: updateTask } = useUpdate<ProjectTask>("/api/project_tasks");
  const { remove: removeTask } = useDelete("/api/project_tasks");
  const [open, setOpen] = useState<number | null>(null);
  const [newTask, setNewTask] = useState<Record<number, string>>({});

  const createNote = async (p: Project) => {
    const created = await api.create<Note>("/api/notes", {
      title: "Untitled",
      body_md: "",
      entity_type: "project",
      entity_id: p.id,
      tags: formatTags(mergeTags([p.title], [activityName])),
    });
    onOpenNote(created.id);
  };

  const cycleStatus = async (p: Project) => {
    const next =
      p.status === "backlog" ? "in_progress" : p.status === "in_progress" ? "done" : "backlog";
    await update(p.id, { status: next });
    onChanged();
  };

  const addTask = async (projectId: number) => {
    const title = (newTask[projectId] ?? "").trim();
    if (!title) return;
    await createTask({ project_id: projectId, title, done: 0 });
    setNewTask((d) => ({ ...d, [projectId]: "" }));
    onTasksChanged();
  };

  const toggleTask = async (t: ProjectTask) => {
    await updateTask(t.id, { done: t.done ? 0 : 1 });
    onTasksChanged();
  };

  const deleteTask = async (t: ProjectTask) => {
    await removeTask(t.id);
    onTasksChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Project</Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState icon="🚀" title="No projects" hint="Add the first one" />
      ) : (
        projects.map((p) => {
          const projectTasks = tasks.filter((t) => t.project_id === p.id);
          const doneCount = projectTasks.filter((t) => t.done).length;
          const pct = projectTasks.length
            ? Math.round((doneCount / projectTasks.length) * 100)
            : 0;
          const expanded = open === p.id;
          const taskInput = newTask[p.id] ?? "";
          return (
            <Card key={p.id} className="group">
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => cycleStatus(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Click to change status">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      p.status === "done" ? "border-emerald-500 bg-emerald-100" : "border-slate-300"
                    }`}
                  >
                    {p.status === "done" && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate font-medium text-slate-900 ${p.status === "done" ? "line-through opacity-60" : ""}`}>
                      {p.title}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.status === "in_progress" ? "In progress" : p.status} · due {fmtWhen(p.deadline)}
                      {projectTasks.length > 0 && ` · ${doneCount}/${projectTasks.length} tasks`}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={() => setOpen(expanded ? null : p.id)}
                    className={`rounded-md p-1.5 text-slate-500 transition-transform hover:bg-slate-100 ${
                      expanded ? "rotate-90" : ""
                    }`}
                    title={expanded ? "Hide tasks" : "Tasks"}
                  >
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                      <path d="M2 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <IconButton title="Edit" onClick={() => onEdit(p)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton title="New note" onClick={() => void createNote(p)}>
                    <NoteIcon />
                  </IconButton>
                  <DeleteButton
                    onConfirm={async () => {
                      await remove(p.id);
                      onChanged();
                    }}
                  />
                </div>
              </div>
              {expanded && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  {projectTasks.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {doneCount} of {projectTasks.length} complete
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {projectTasks.map((t) => (
                      <div key={t.id} className="group/task flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-slate-50">
                        <button
                          onClick={() => void toggleTask(t)}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            t.done ? "border-emerald-500 bg-emerald-100" : "border-slate-300 hover:border-indigo-400"
                          }`}
                          title={t.done ? "Mark not done" : "Mark done"}
                        >
                          {t.done && (
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            t.done ? "text-slate-400 line-through" : "text-slate-700"
                          }`}
                        >
                          {t.title}
                        </span>
                        <button
                          onClick={() => void deleteTask(t)}
                          className="shrink-0 rounded p-1 text-slate-400 opacity-100 transition-opacity hover:text-rose-600 md:opacity-0 md:group-hover/task:opacity-100"
                          title="Delete task"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M6 4V2.5h4V4m-6.5 0l.5 9h7l.5-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={taskInput}
                      onChange={(e) => setNewTask((d) => ({ ...d, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addTask(p.id);
                      }}
                      placeholder="Add a task…"
                      className={inputStyles}
                    />
                    <Button onClick={() => void addTask(p.id)} disabled={!taskInput.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function NoteList({
  notes,
  onChanged,
  activityId,
  activityName,
  onOpenNote,
}: {
  notes: Note[];
  onChanged: () => void;
  activityId: number;
  activityName: string;
  onOpenNote: (id: number, returnTo?: { kind: "activity"; id: number; sub?: SubTab }) => void;
}) {
  const { remove } = useDelete("/api/notes");

  const createNote = async () => {
    const created = await api.create<Note>("/api/notes", {
      title: "Untitled",
      body_md: "",
      entity_type: "activity",
      entity_id: activityId,
      tags: formatTags([activityName]),
    });
    onChanged();
    onOpenNote(created.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => void createNote()}>+ New note</Button>
      </div>
      {notes.length === 0 ? (
        <EmptyState icon="📝" title="No notes" hint="Notes open in the full note editor" />
      ) : (
        notes.map((n) => (
          <Card key={n.id} className="group cursor-pointer transition-colors hover:bg-slate-50">
            <button className="w-full text-left" onClick={() => onOpenNote(n.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{n.title || "Untitled"}</p>
                  <TagPills tags={parseTags(n.tags)} max={3} className="mt-1" />
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DeleteButton
                    onConfirm={async () => {
                      await remove(n.id);
                      onChanged();
                    }}
                  />
                </div>
              </div>
              {n.body_md && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{n.body_md}</p>
              )}
            </button>
          </Card>
        ))
      )}
    </div>
  );
}

function MeetingModal({
  open,
  onClose,
  onDone,
  initial,
  activityId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Meeting;
  activityId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Meeting>("/api/meetings", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Meeting>("/api/meetings");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at));
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      starts_at: startsAt || null,
      agenda: agenda || null,
      activity_id: activityId,
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
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Robotics build session" />
        </Field>
        <Field label="When">
          <input type="datetime-local" className={inputStyles} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Agenda">
          <TextInput value={agenda} onChange={setAgenda} placeholder="e.g. Motor wiring, design review" />
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

function ProjectModal({
  open,
  onClose,
  onDone,
  initial,
  activityId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Project;
  activityId: number;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Project>("/api/projects", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Project>("/api/projects");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(initial?.deadline));
  const [status, setStatus] = useState(initial?.status ?? "backlog");
  const error = createError || updateError;

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      deadline: deadline || null,
      status,
      activity_id: activityId,
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
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Competition robot chassis" />
        </Field>
        <Field label="Deadline">
          <input type="datetime-local" className={inputStyles} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={status === "done"}
            onChange={(e) => setStatus(e.target.checked ? "done" : "backlog")}
            className="h-4 w-4 accent-indigo-500"
          />
          <span className="text-sm text-slate-600">Mark as done</span>
        </div>
        {error && <p className="text-xs text-rose-600">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
