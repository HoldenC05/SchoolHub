import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { marked } from "marked";
import { useUpdate, useDelete } from "../lib/useData";
import type { Note } from "../lib/types";
import { Button, DeleteButton } from "./ui";

function initialHtml(note: Note): string {
  if (note.body_html) return note.body_html;
  if (!note.body_md) return "";
  try {
    return marked.parse(note.body_md, { async: false, gfm: true }) as string;
  } catch {
    return note.body_md;
  }
}

function ToolbarBtn({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-sm font-medium transition-colors ${
        active ? "bg-indigo-500/25 text-indigo-200" : "text-slate-300 hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const link = () => {
    const url = window.prompt("Link URL", editor.getAttributes("link").href || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-800 bg-slate-900/60 px-3 py-1.5">
      <ToolbarBtn label="B" title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarBtn label="I" title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarBtn label="U" title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarBtn label="S" title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="mx-1 h-5 w-px bg-slate-700" />
      <ToolbarBtn label="H1" title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarBtn label="H2" title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarBtn label="H3" title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span className="mx-1 h-5 w-px bg-slate-700" />
      <ToolbarBtn label="•" title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarBtn label="1." title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarBtn label="☑" title="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolbarBtn label="❝" title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarBtn label="<>" title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <span className="mx-1 h-5 w-px bg-slate-700" />
      <ToolbarBtn label="🔗" title="Link" active={editor.isActive("link")} onClick={link} />
      <span className="flex-1" />
      <ToolbarBtn label="↩" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarBtn label="↪" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

export function NoteEditor({
  note,
  onChanged,
  onDeleted,
  onBack,
}: {
  note: Note;
  onChanged: () => void;
  onDeleted: (id: number) => void;
  onBack: () => void;
}) {
  const { update } = useUpdate<Note>("/api/notes");
  const { remove } = useDelete("/api/notes");
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const titleRef = useRef(note.title);
  titleRef.current = title;
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("saving");
    const html = editorRef.current?.getHTML() ?? "";
    const ok = await update(note.id, {
      title: titleRef.current.trim() || "Untitled",
      body_html: html,
    });
    setStatus(ok ? "saved" : "error");
    if (ok) onChanged();
  }, [update, note.id, onChanged]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (status !== "saving") setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), 700);
  }, [flush, status]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write anything…" }),
    ],
    content: initialHtml(note),
    autofocus: false,
    editorProps: {
      attributes: {
        class: "note-body min-h-[40vh] focus:outline-none",
      },
    },
    onUpdate: () => {
      editorRef.current = editor ?? null;
      scheduleSave();
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    return () => {
      if (dirtyRef.current && timerRef.current) {
        clearTimeout(timerRef.current);
        void flush();
      }
    };
  }, [flush]);

  const confirmDelete = async () => {
    const ok = await remove(note.id);
    if (ok) onDeleted(note.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 px-6 py-2.5">
        <Button variant="ghost" onClick={onBack}>← All notes</Button>
        <span className="flex-1" />
        <span className={`text-xs ${status === "error" ? "text-rose-400" : "text-slate-500"}`}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : ""}
        </span>
        <DeleteButton onConfirm={() => void confirmDelete()} />
      </div>
      <Toolbar editor={editor} />
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave();
          }}
          onBlur={() => void flush()}
          placeholder="Untitled"
          className="w-full bg-transparent text-3xl font-bold text-slate-100 placeholder-slate-600 outline-none"
        />
        <div className="mt-4">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
