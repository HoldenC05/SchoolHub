import { useState } from "react";
import { useData } from "../lib/useData";
import { api } from "../lib/api";
import type { Course, CourseFile, Note, Project } from "../lib/types";
import { parseTags } from "../lib/tags";
import { TagPills } from "../components/Tags";
import { TodoList } from "../components/TodoList";
import { InlineNoteEditor } from "../components/InlineNoteEditor";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SelectInput,
  TextInput,
  inputStyles,
} from "../components/ui";

type SubTab = "notes" | "subtasks" | "files" | "details";

export function ProjectPage({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const { data: project } = useData<Project>(`/api/projects/${projectId}`);
  const { data: notes, refresh: refreshNotes } = useData<Note[]>("/api/notes");
  const { data: files, refresh: refreshFiles } = useData<CourseFile[]>("/api/files");
  const { data: todos, refresh: refreshTodos } = useData<Todo[]>("/api/todos");
  const courses = useData<Course[]>("/api/courses");
  const [sub, setSub] = useState<SubTab>("notes");
  const [noteModal, setNoteModal] = useState<{ open: boolean; editing: Note | null; parentId: number | null }>({ open: false, editing: null, parentId: null });
  const [fileModal, setFileModal] = useState<{ open: boolean; editing: CourseFile | null }>({ open: false, editing: null });
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  if (!project) return <p className="text-sm text-slate-500">Loading…</p>;

  const myNotes = notes?.filter((n) => n.entity_type === "project" && n.entity_id === projectId) || [];
  const myFiles = files?.filter((f) => f.course_id === project.course_id && f.notes?.includes(project.title)) || [];
  const myTodos = todos?.filter((t) => t.entity_type === "project" && t.entity_id === projectId) || [];

  const course = courses.data?.find((c) => c.id === project.course_id);

  const tabs: { key: SubTab; label: string }[] = [
    { key: "notes", label: `Notes (${myNotes.length})` },
    { key: "subtasks", label: `Subtasks (${myTodos.length})` },
    { key: "files", label: `Files (${myFiles.length})` },
    { key: "details", label: "Details" },
  ];

  const saveNote = async (note: { title: string; body_md: string; tags: string | null; parent_id?: number | null }) => {
    if (noteModal.editing) {
      await api.update<Note>(`/api/notes/${noteModal.editing.id}`, {
        title: note.title,
        body_md: note.body_md,
        tags: note.tags,
      });
    }
    setNoteModal({ open: false, editing: null, parentId: null });
    refreshNotes();
  };

  const saveFile = async (payload: { title: string; notes?: string; data: string; filename: string; mime: string; size: number }) => {
    if (fileModal.editing) {
      await api.update<CourseFile>(`/api/files/${fileModal.editing.id}`, { title: payload.title, notes: payload.notes });
    } else {
      await api.create<CourseFile>("/api/files", {
        title: payload.title,
        notes: payload.notes,
        course_id: project.course_id,
        filename: payload.filename,
        mime: payload.mime,
        size: payload.size,
        data: payload.data,
      });
    }
    setFileModal({ open: false, editing: null });
    refreshFiles();
  };

  const deleteNote = async (id: number) => {
    await api.remove(`/api/notes/${id}`);
    refreshNotes();
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  const deleteFile = async (id: number) => {
    await api.remove(`/api/files/${id}`);
    refreshFiles();
  };

  const updateProject = async (patch: Partial<Project>) => {
    await api.update<Project>(`/api/projects/${projectId}`, patch);
  };

  const editDetails = {
    title: project.title,
    deadline: project.deadline ? project.deadline.slice(0, 16) : "",
    status: project.status,
  };
  const [editTitle, setEditTitle] = useState(editDetails.title);
  const [editDeadline, setEditDeadline] = useState(editDetails.deadline ?? "");
  const [editStatus, setEditStatus] = useState(editDetails.status);

  const saveDetails = async () => {
    await updateProject({ title: editTitle, deadline: editDeadline || null, status: editStatus as Project["status"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold" style={{ backgroundColor: (project.color || "#334155") + "33", color: project.color || "#94a3b8" }}>
            {project.title.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
            <p className="text-sm text-slate-400">{course?.name || "Project"} · {project.status === "in_progress" ? "In progress" : project.status} · due {project.deadline ? new Date(project.deadline).toLocaleDateString() : "No deadline"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>← Back</Button>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${sub === t.key ? "bg-indigo-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === "notes" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setNoteModal({ open: true, editing: null, parentId: null }); setSelectedNote(null); }}>+ New note</Button>
          </div>
          {myNotes.length === 0 ? (
            <EmptyState icon="📝" title="No notes yet" hint="Create your first note for this project" />
          ) : (
            <div className="space-y-2">
              {myNotes.map((n) => (
                <Card key={n.id} className="group cursor-pointer transition-colors hover:bg-slate-50" onClick={() => { setSelectedNote(n); setNoteModal({ open: false, editing: null, parentId: null }); }}>
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{n.title || "Untitled"}</p>
                      <TagPills tags={parseTags(n.tags)} max={3} className="mt-1" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton title="New sub-note" onClick={() => { setNoteModal({ open: true, editing: null, parentId: n.id }); setSelectedNote(null); }} className="!p-1"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></IconButton>
                      <DeleteButton onConfirm={() => void deleteNote(n.id)} className="!p-1" />
                    </div>
                  </div>
                  {n.body_md && <p className="px-3 pb-3 line-clamp-2 text-sm text-slate-400">{n.body_md}</p>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {sub === "subtasks" && (
        <TodoList entityType="project" entityId={projectId} onChanged={refreshTodos} />
      )}

      {sub === "files" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setFileModal({ open: true, editing: null })}>+ Upload</Button>
          </div>
          {myFiles.length === 0 ? (
            <EmptyState icon="📎" title="No files yet" hint="Upload files related to this project" />
          ) : (
            <div className="space-y-2">
              {myFiles.map((f) => {
                const href = f.data ? `data:${f.mime || "application/octet-stream"};base64,${f.data}` : null;
                return (
                  <Card key={f.id} className="group flex items-start justify-between gap-3 p-3">
                    <button className="min-w-0 text-left" onClick={() => setSelectedNote({ id: f.id, title: f.title, body_md: f.notes } as any)}>
                      <p className="font-medium text-slate-900 hover:text-indigo-600">{f.title}</p>
                      <p className="text-xs text-slate-500">{f.filename} · {f.size ? (f.size / 1024).toFixed(1) : "0"} KB</p>
                      {f.notes && <p className="mt-1 text-sm text-slate-400">{f.notes}</p>}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {href && <a href={href} download={f.filename || f.title} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Download"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></a>}
                      <DeleteButton onConfirm={() => void deleteFile(f.id)} className="!p-1" />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sub === "details" && (
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <h3 className="font-semibold text-slate-900">Project Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={editTitle} onChange={setEditTitle} placeholder="Project title" /></Field>
              <Field label="Deadline"><input type="datetime-local" className={inputStyles} value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} /></Field>
              <Field label="Status">
                <SelectInput value={editStatus} onChange={(v) => setEditStatus(v)} options={[{ value: "backlog", label: "Backlog" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }]} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => void saveDetails()}>Save</Button>
            </div>
          </Card>
          {project.notes && (
            <Card className="p-4">
              <h3 className="font-semibold text-slate-900 mb-2">Description</h3>
              <p className="text-slate-600 whitespace-pre-wrap">{project.notes}</p>
            </Card>
          )}
        </div>
      )}

      <InlineNoteEditor
        open={noteModal.open || selectedNote !== null}
        onClose={() => { setNoteModal({ open: false, editing: null, parentId: null }); setSelectedNote(null); }}
        onSave={saveNote}
        initial={noteModal.editing ?? selectedNote ?? undefined}
        parentId={noteModal.parentId}
      />

      <FileUploadModal
        open={fileModal.open}
        onClose={() => setFileModal({ open: false, editing: null })}
        onSave={saveFile}
        initial={fileModal.editing ?? undefined}
      />
    </div>
  );
}

import type { Todo } from "../lib/types";

function FileUploadModal({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { title: string; notes?: string; data: string; filename: string; mime: string; size: number }) => void;
  initial?: CourseFile;
}) {
  const editing = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; size: number; data: string } | null>(null);
  const [progress, setProgress] = useState<{ phase: "read" | "upload"; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    setProgress({ phase: "read", pct: 0 });
    const reader = new FileReader();
    reader.onprogress = (pe) => { if (pe.lengthComputable) setProgress({ phase: "read", pct: Math.round((pe.loaded / pe.total) * 100) }); };
    reader.onload = () => { const result = reader.result as string; const comma = result.indexOf(","); setFileMeta({ name: f.name, mime: f.type, size: f.size, data: comma >= 0 ? result.slice(comma + 1) : result }); setProgress(null); };
    reader.onerror = () => setUploadError("Failed to read the selected file");
    reader.readAsDataURL(f);
  };

  const save = () => {
    if (!title.trim() || !fileMeta) return;
    const { name, ...rest } = fileMeta;
    onSave({ title: title.trim(), notes: notes.trim() || undefined, filename: name, ...rest });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit file" : "Upload a file"}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title"><TextInput value={title} onChange={setTitle} placeholder="e.g. Project spec" /></Field>
        {!editing && (<Field label="File"><input type="file" onChange={onPick} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200" /></Field>)}
        {fileMeta && <div><p className="text-xs text-slate-500">{fileMeta.name} · {(fileMeta.size / 1024).toFixed(1)} KB</p>{progress && <div className="mt-2"><div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-500" style={{ width: `${Math.max(2, progress.pct)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{progress.phase === "read" ? "Reading file…" : "Uploading…"} {progress.pct}%</p></div>}</div>}
        <Field label="Notes"><TextInput value={notes} onChange={setNotes} placeholder="Optional" /></Field>
        {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
        <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!fileMeta && !editing}>{editing ? "Save" : "Upload"}</Button></div>
      </form>
    </Modal>
  );
}