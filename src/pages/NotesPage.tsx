import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useData, useUpdate, useDelete } from "../lib/useData";
import { api } from "../lib/api";
import type { Note } from "../lib/types";
import { formatTags, parseTags } from "../lib/tags";
import { TagPills } from "../components/Tags";
import { NoteEditor } from "../components/NoteEditor";
import { DeleteButton, IconButton } from "../components/ui";

function isDescendant(notes: Note[], parentId: number | null, targetId: number): boolean {
  let cur = parentId;
  const seen = new Set<number>();
  while (cur !== null && !seen.has(cur)) {
    if (cur === targetId) return true;
    seen.add(cur);
    const parent = notes.find((n) => n.id === cur);
    cur = parent?.parent_id ?? null;
  }
  return false;
}

function NotesPage({
  selectedId,
  onSelect,
  onBack,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onBack: () => void;
}) {
  const { data: notes, refresh, loading } = useData<Note[]>("/api/notes");
  const { update } = useUpdate<Note>("/api/notes");
  const { remove } = useDelete("/api/notes");
  const [selected, setSelected] = useState<number | null>(selectedId);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (notes && !initialized.current) {
      initialized.current = true;
      setExpanded(new Set(notes.map((n) => n.id)));
    }
  }, [notes]);

  const byParent = useMemo(() => {
    const map = new Map<number | null, Note[]>();
    for (const n of notes || []) {
      const key = n.parent_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [notes]);

  const selectedNote = useMemo(
    () => notes?.find((n) => n.id === selected) ?? null,
    [notes, selected],
  );

  const createNote = async (parentId: number | null) => {
    const parent = parentId !== null ? notes?.find((n) => n.id === parentId) : undefined;
    const created = await api.create<Note>("/api/notes", {
      title: "Untitled",
      body_md: "",
      parent_id: parentId,
      tags: parent ? formatTags(parseTags(parent.tags)) : undefined,
    });
    refresh();
    if (parentId !== null) {
      setExpanded((s) => new Set(s).add(parentId));
    }
    onSelect(created.id);
  };

  const deleteNote = async (id: number) => {
    const ok = await remove(id);
    if (ok) {
      refresh();
      if (id === selected) onBack();
    }
  };

  const moveNote = async (id: number, parentId: number | null) => {
    const ok = await update(id, { parent_id: parentId });
    if (ok) refresh();
  };

  const toggleExpand = (id: number) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRow = (note: Note, depth: number): ReactNode => {
    const children = byParent.get(note.id) ?? [];
    const isOpen = expanded.has(note.id);
    const isSel = note.id === selected;
    return (
      <div key={note.id}>
        <div
          draggable
          onDragStart={(e) => {
            setDragId(note.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragId === null || dragId === note.id) return;
            if (isDescendant(notes || [], note.id, dragId)) return;
            setDragId(null);
            void moveNote(dragId, note.id);
          }}
          className={`group flex cursor-grab items-center gap-1 rounded-md px-2 py-1 ${
            isSel ? "bg-indigo-50 text-indigo-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <button
            onClick={() => toggleExpand(note.id)}
            className={`w-4 shrink-0 text-slate-500 transition-transform ${children.length === 0 ? "invisible" : ""} ${isOpen ? "rotate-90" : ""}`}
            title={isOpen ? "Collapse" : "Expand"}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => onSelect(note.id)}
            className="min-w-0 flex-1 text-left text-sm"
            title={note.title || "Untitled"}
          >
            <span className="block truncate">{note.title || "Untitled"}</span>
            <TagPills tags={parseTags(note.tags)} max={3} className="mt-0.5" />
          </button>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton
              title="New note inside"
              className="!p-1"
              onClick={() => void createNote(note.id)}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </IconButton>
            <DeleteButton
              onConfirm={() => void deleteNote(note.id)}
            />
          </div>
        </div>
        {isOpen &&
          children.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex h-full gap-4">
      <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Notes
          </span>
          <button
            onClick={() => void createNote(null)}
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            title="New note"
          >
            + New note
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {loading ? (
            <p className="px-2 py-1 text-xs text-slate-500">Loading…</p>
          ) : (notes?.length ?? 0) === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-slate-500">No notes yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first one above</p>
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId !== null) {
                  setDragId(null);
                  void moveNote(dragId, null);
                }
              }}
            >
              {(byParent.get(null) ?? []).map((root) => renderRow(root, 0))}
              <p className="mt-2 border-t border-dashed border-slate-200 px-2 pt-2 text-[10px] text-slate-400">
                Drag a note here to unnest it
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            onChanged={refresh}
            onDeleted={(id) => void deleteNote(id)}
            onBack={onBack}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-4xl">📝</span>
            <p className="font-medium text-slate-600">
              {loading ? "Loading…" : "Select a note to start writing"}
            </p>
            <p className="max-w-xs text-sm text-slate-500">
              Create a note, nest notes inside notes, and drag them around to organize.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default NotesPage;
