import { useState } from "react";
import { useData } from "../lib/useData";
import { api } from "../lib/api";
import type { Meeting, Note, Todo } from "../lib/types";
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
  TextInput,
  Textarea,
  inputStyles,
} from "../components/ui";

type SubTab = "details" | "notes" | "todos";

export function MeetingPage({ meetingId, onBack }: { meetingId: number; onBack: () => void }) {
  const { data: meeting } = useData<Meeting>(`/api/meetings/${meetingId}`);
  const { data: notes, refresh: refreshNotes } = useData<Note[]>("/api/notes");
  const { data: todos, refresh: refreshTodos } = useData<Todo[]>("/api/todos");
  const [sub, setSub] = useState<SubTab>("details");
  const [noteModal, setNoteModal] = useState<{ open: boolean; editing: Note | null; parentId: number | null }>({ open: false, editing: null, parentId: null });
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  if (!meeting) return <p className="text-sm text-slate-500">Loading…</p>;

  const myNotes = notes?.filter((n) => n.entity_type === "meeting" && n.entity_id === meetingId) || [];
  const myTodos = todos?.filter((t) => t.entity_type === "meeting" && t.entity_id === meetingId) || [];

  const tabs: { key: SubTab; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "notes", label: `Notes (${myNotes.length})` },
    { key: "todos", label: `To-Dos (${myTodos.length})` },
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

  const deleteNote = async (id: number) => {
    await api.remove(`/api/notes/${id}`);
    refreshNotes();
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  const updateMeeting = async (patch: Partial<Meeting>) => {
    await api.update<Meeting>(`/api/meetings/${meetingId}`, patch);
  };

  const editDetails = {
    title: meeting.title,
    starts_at: meeting.starts_at ? meeting.starts_at.slice(0, 16) : "",
    ends_at: meeting.ends_at ? meeting.ends_at.slice(0, 16) : "",
    agenda: meeting.agenda || "",
    location: meeting.location || "",
    attendees: meeting.attendees || "",
  };
  const [editTitle, setEditTitle] = useState(editDetails.title);
  const [editStartsAt, setEditStartsAt] = useState(editDetails.starts_at);
  const [editEndsAt, setEditEndsAt] = useState(editDetails.ends_at);
  const [editAgenda, setEditAgenda] = useState(editDetails.agenda);
  const [editLocation, setEditLocation] = useState(editDetails.location);
  const [editAttendees, setEditAttendees] = useState(editDetails.attendees);

  const saveDetails = async () => {
    await updateMeeting({
      title: editTitle,
      starts_at: editStartsAt || null,
      ends_at: editEndsAt || null,
      agenda: editAgenda || null,
      location: editLocation || null,
      attendees: editAttendees || null,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-bold bg-indigo-100 text-indigo-700">🤝</span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{meeting.title}</h1>
            <p className="text-sm text-slate-400">
              {meeting.starts_at ? new Date(meeting.starts_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No time set"}
              {meeting.ends_at ? ` – ${new Date(meeting.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
              {meeting.location ? ` · ${meeting.location}` : ""}
            </p>
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

      {sub === "details" && (
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <h3 className="font-semibold text-slate-900">Meeting Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title"><TextInput value={editTitle} onChange={setEditTitle} placeholder="Meeting title" /></Field>
              <Field label="Start"><input type="datetime-local" className={inputStyles} value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} /></Field>
              <Field label="End"><input type="datetime-local" className={inputStyles} value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} /></Field>
              <Field label="Location"><TextInput value={editLocation} onChange={setEditLocation} placeholder="e.g. Room 101, Zoom link" /></Field>
              <Field label="Attendees" className="sm:col-span-2"><TextInput value={editAttendees} onChange={setEditAttendees} placeholder="Names, emails (comma separated)" /></Field>
              <Field label="Agenda" className="sm:col-span-2"><Textarea value={editAgenda} onChange={setEditAgenda} placeholder="Agenda items, discussion points…" rows={4} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => void saveDetails()}>Save</Button>
            </div>
          </Card>
        </div>
      )}

      {sub === "notes" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setNoteModal({ open: true, editing: null, parentId: null }); setSelectedNote(null); }}>+ New note</Button>
          </div>
          {myNotes.length === 0 ? (
            <EmptyState icon="📝" title="No meeting notes yet" hint="Create notes for this meeting" />
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

      {sub === "todos" && (
        <TodoList entityType="meeting" entityId={meetingId} onChanged={refreshTodos} />
      )}

      <InlineNoteEditor
        open={noteModal.open || selectedNote !== null}
        onClose={() => { setNoteModal({ open: false, editing: null, parentId: null }); setSelectedNote(null); }}
        onSave={saveNote}
        initial={noteModal.editing ?? selectedNote ?? undefined}
        parentId={noteModal.parentId}
      />
    </div>
  );
}