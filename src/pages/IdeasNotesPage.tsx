import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import type { Idea, Note } from "../lib/types";
import { api } from "../lib/api";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  TextInput,
} from "../components/ui";

export function IdeasPage() {
  const { data: ideas, refresh, loading } = useData<Idea[]>("/api/ideas");
  const { create, error } = useCreate<Idea>("/api/ideas", refresh);
  const { remove } = useDelete("/api/ideas");
  const [text, setText] = useState("");

  const toggle = async (idea: Idea) => {
    await api.update(`/api/ideas/${idea.id}`, { done: idea.done ? 0 : 1 });
    refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Ideas</h1>
        <p className="text-sm text-slate-400">Quick capture — brain dumps, plans, random thoughts</p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            create({ title: text.trim() });
            setText("");
          }
        }}
      >
        <div className="flex-1">
          <TextInput value={text} onChange={setText} placeholder="Capture an idea…" />
        </div>
        <Button type="submit">Add</Button>
      </form>
      {error && <p className="text-xs text-rose-400">{error.message}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !ideas || ideas.length === 0 ? (
        <EmptyState icon="💡" title="No ideas yet" hint="Capture the first one above" />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <Card
              key={idea.id}
              className={`group flex items-start gap-3 ${idea.done ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={idea.done === 1}
                onChange={() => toggle(idea)}
                className="mt-1 h-4 w-4 accent-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <p className={`font-medium text-slate-100 ${idea.done ? "line-through" : ""}`}>
                  {idea.title}
                </p>
                {idea.body && <p className="text-sm text-slate-500">{idea.body}</p>}
              </div>
              <DeleteButton
                onConfirm={async () => {
                  await remove(idea.id);
                  refresh();
                }}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotesPage() {
  const { data: notes, refresh, loading } = useData<Note[]>("/api/notes");
  const { create, error } = useCreate<Note>("/api/notes", refresh);
  const { update } = useUpdate<Note>("/api/notes");
  const { remove } = useDelete("/api/notes");
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const save = async () => {
    if (!title.trim()) return;
    if (editing) {
      const ok = await update(editing.id, { title: title.trim(), body_md: body });
      if (ok) {
        setEditing(null);
        refresh();
      }
    } else {
      create({ title: title.trim(), body_md: body });
    }
    setTitle("");
    setBody("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Notes</h1>
        <p className="text-sm text-slate-400">Meeting notes, class notes, anything</p>
      </header>

      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <TextInput value={title} onChange={setTitle} placeholder={editing ? "Editing…" : "Note title"} />
            </div>
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
          <Field label="Body (Markdown)">
            <textarea
              className="min-h-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write in Markdown…"
            />
          </Field>
          {error && <p className="text-xs text-rose-400">{error.message}</p>}
          <div className="flex justify-end">
            <Button type="submit">{editing ? "Save" : "Save note"}</Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !notes || notes.length === 0 ? (
        <EmptyState icon="📝" title="No notes yet" />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Card key={n.id} className="group">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-100">{n.title}</p>
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <IconButton
                    title="Edit"
                    onClick={() => {
                      setEditing(n);
                      setTitle(n.title);
                      setBody(n.body_md);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  </IconButton>
                  <DeleteButton
                    onConfirm={async () => {
                      await remove(n.id);
                      refresh();
                    }}
                  />
                </div>
              </div>
              {n.body_md && (
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{n.body_md}</pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
