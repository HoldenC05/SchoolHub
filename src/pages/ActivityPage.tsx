import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import type { Activity, Meeting, Note, Project } from "../lib/types";
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
} from "../components/ui";

type SubTab = "overview" | "meetings" | "projects" | "notes";

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

export function ActivityPage({ activityId }: { activityId: number }) {
  const { data: activity } = useData<Activity>(`/api/activities/${activityId}`);
  const { data: meetings, refresh: refreshMeetings } = useData<Meeting[]>("/api/meetings");
  const { data: projects, refresh: refreshProjects } = useData<Project[]>("/api/projects");
  const { data: notes, refresh: refreshNotes } = useData<Note[]>("/api/notes");
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
  const upcoming = myMeetings.filter((m) => !m.starts_at || new Date(m.starts_at) >= new Date());
  const nextMeeting = upcoming.sort((a, b) =>
    (a.starts_at || "").localeCompare(b.starts_at || ""),
  )[0];

  const tabs: { key: SubTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "meetings", label: `Meetings (${myMeetings.length})` },
    { key: "projects", label: `Projects (${myProjects.length})` },
    { key: "notes", label: `Notes (${myNotes.length})` },
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
            <h1 className="text-2xl font-bold text-slate-100">{activity.name}</h1>
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
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
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
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Next meeting
              </p>
              <p className="mt-1 font-medium text-slate-100">{nextMeeting.title}</p>
              <p className="text-sm text-slate-400">{fmtWhen(nextMeeting.starts_at)}</p>
              {nextMeeting.agenda && (
                <p className="mt-2 text-sm text-slate-300">{nextMeeting.agenda}</p>
              )}
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myMeetings.length}</p>
              <p className="text-sm text-slate-500">Meetings</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-slate-100">{myProjects.length}</p>
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
                      <p className="font-medium text-slate-100">{p.title}</p>
                      <p className="text-xs text-slate-500">{fmtWhen(p.deadline)}</p>
                    </div>
                    <Pill
                      className={
                        p.status === "done"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : p.status === "in_progress"
                            ? "bg-sky-500/15 text-sky-300"
                            : "bg-slate-800 text-slate-400"
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
        />
      )}

      {sub === "projects" && (
        <ProjectList
          projects={myProjects}
          onAdd={() => setProjectModal({ open: true, editing: null })}
          onEdit={(p) => setProjectModal({ open: true, editing: p })}
          onChanged={refreshProjects}
        />
      )}

      {sub === "notes" && (
        <NoteList notes={myNotes} onChanged={refreshNotes} activityId={activityId} />
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

function ProjectList({
  projects,
  onAdd,
  onEdit,
  onChanged,
}: {
  projects: Project[];
  onAdd: () => void;
  onEdit: (p: Project) => void;
  onChanged: () => void;
}) {
  const { update } = useUpdate<Project>("/api/projects");
  const { remove } = useDelete("/api/projects");

  const cycleStatus = async (p: Project) => {
    const next =
      p.status === "backlog" ? "in_progress" : p.status === "in_progress" ? "done" : "backlog";
    await update(p.id, { status: next });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={onAdd}>+ Project</Button>
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
              <IconButton title="Edit" onClick={() => onEdit(p)}>
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
    </div>
  );
}

function NoteList({
  notes,
  onChanged,
  activityId,
}: {
  notes: Note[];
  onChanged: () => void;
  activityId: number;
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
        entity_type: "activity",
        entity_id: activityId,
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
  const [startsAt, setStartsAt] = useState(initial?.starts_at ?? "");
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
          <TextInput value={startsAt} onChange={setStartsAt} placeholder="e.g. 2026-09-20T16:00" />
        </Field>
        <Field label="Agenda">
          <TextInput value={agenda} onChange={setAgenda} placeholder="e.g. Motor wiring, design review" />
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
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
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
