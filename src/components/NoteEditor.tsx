import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { marked } from "marked";
import { useUpdate, useDelete } from "../lib/useData";
import type { Note } from "../lib/types";
import { Button, DeleteButton } from "./ui";
import { noteToHtml, noteToMarkdown, noteToText, sanitizeName, saveText } from "../lib/export";
import { formatTags, mergeTags, parseTags } from "../lib/tags";
import { TagPills } from "./Tags";

function initialHtml(note: Note): string {
  if (note.body_html) return note.body_html;
  if (!note.body_md) return "";
  try {
    return marked.parse(note.body_md, { async: false, gfm: true }) as string;
  } catch {
    return note.body_md;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const FileAttachment = TiptapNode.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      name: { default: null },
      mime: { default: null },
      size: { default: null },
      data: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-file-attachment]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const size = node.attrs.size ? ` · ${formatBytes(node.attrs.size)}` : "";
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-file-attachment": "", class: "note-file-chip" }),
      [
        "a",
        { href: node.attrs.data, download: node.attrs.name || "file", class: "note-file-link" },
        `📎 ${node.attrs.name || "File"}${size}`,
      ],
    ];
  },
});

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  keywords: string;
  action: (ed: Editor) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    hint: "Plain paragraph",
    icon: "Aa",
    keywords: "text paragraph p",
    action: (ed) => ed.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Big section heading",
    icon: "H1",
    keywords: "heading title h1 h-1",
    action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Medium section heading",
    icon: "H2",
    keywords: "heading title h2 h-2",
    action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Small section heading",
    icon: "H3",
    keywords: "heading title h3 h-3",
    action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    hint: "Create a simple bulleted list",
    icon: "•",
    keywords: "bullet list unordered ul b",
    action: (ed) => ed.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "Numbered list",
    hint: "Create a numbered list",
    icon: "1.",
    keywords: "number ordered list ol n",
    action: (ed) => ed.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "To-do list",
    hint: "Track tasks with a checklist",
    icon: "☑",
    keywords: "task todo checklist checkbox t",
    action: (ed) => ed.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Capture a quote",
    icon: "❝",
    keywords: "quote blockquote q",
    action: (ed) => ed.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "Show a snippet of code",
    icon: "</>",
    keywords: "code block c",
    action: (ed) => ed.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Horizontal line",
    icon: "—",
    keywords: "divider hr line rule horizontal d",
    action: (ed) => ed.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "image",
    label: "Image",
    hint: "Upload an image from your device",
    icon: "🖼️",
    keywords: "image picture photo attachment img",
    action: () => imageInputRef.current?.click(),
  },
  {
    id: "file",
    label: "File",
    hint: "Attach a file from your device",
    icon: "📎",
    keywords: "file attach attachment upload f",
    action: () => fileInputRef.current?.click(),
  },
];

const imageInputRef = { current: null as HTMLInputElement | null };
const fileInputRef = { current: null as HTMLInputElement | null };

type SlashState = { from: number; to: number; query: string; top: number; left: number } | null;

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
        active ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
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
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
      <ToolbarBtn label="B" title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarBtn label="I" title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarBtn label="U" title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarBtn label="S" title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarBtn label="H1" title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarBtn label="H2" title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarBtn label="H3" title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarBtn label="•" title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarBtn label="1." title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarBtn label="☑" title="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolbarBtn label="❝" title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarBtn label="<>" title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarBtn label="🔗" title="Link" active={editor.isActive("link")} onClick={link} />
      <span className="flex-1" />
      <ToolbarBtn label="↩" title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarBtn label="↪" title="Redo" onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

import type { Nav } from "../lib/nav";

export function NoteEditor({
  note,
  onChanged,
  onDeleted,
  onBack,
  returnTo,
}: {
  note: Note;
  onChanged: () => void;
  onDeleted: (id: number) => void;
  onBack: () => void;
  returnTo?: Nav;
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

  const [slash, setSlash] = useState<SlashState>(null);
  const [index, setIndex] = useState(0);
  const slashRef = useRef<SlashState>(null);
  const indexRef = useRef(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const pendingAttachRef = useRef<{ from: number; to: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(parseTags(note.tags));
  const [tagInput, setTagInput] = useState("");
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  const filtered = useMemo(() => {
    if (!slash) return SLASH_ITEMS;
    const q = slash.query.trim().toLowerCase();
    if (!q) return SLASH_ITEMS;
    const matches = SLASH_ITEMS.filter(
      (i) => i.label.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q),
    );
    return matches.sort((a, b) => {
      const aExact = a.keywords.split(/\s+/).includes(q);
      const bExact = b.keywords.split(/\s+/).includes(q);
      if (aExact !== bExact) return aExact ? -1 : 1;
      return 0;
    });
  }, [slash]);

  const runSlash = useCallback(
    (item: SlashItem) => {
      const s = slashRef.current;
      const ed = editorRef.current;
      if (!s || !ed) return;
      setSlash(null);
      if (item.id === "image" || item.id === "file") {
        pendingAttachRef.current = { from: s.from, to: s.to };
        item.action(ed);
        return;
      }
      ed.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
      item.action(ed);
    },
    [],
  );

  const slashHandlers = useRef({ run: runSlash });
  slashHandlers.current = { run: runSlash };
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const refreshSlash = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const { selection } = ed.state;
    if (!selection.empty) {
      setSlash(null);
      return;
    }
    const { from, $from } = selection;
    const block = $from.parent;
    if (!block.isTextblock) {
      setSlash(null);
      return;
    }
    const text = block.textBetween(0, $from.parentOffset, "\n", " ");
    const m = /^\/([\w-]*)$/.exec(text);
    if (!m) {
      setSlash(null);
      return;
    }
    const slashStart = from - m[1].length - 1;
    let top = 0;
    let left = 0;
    try {
      const coords = ed.view.coordsAtPos(slashStart);
      top = coords.bottom + 4;
      left = coords.left;
    } catch {
      /* ignore */
    }
    setSlash({ from: slashStart, to: from, query: m[1], top, left });
  }, []);

  useEffect(() => {
    slashRef.current = slash;
    indexRef.current = index;
    if (!slash) setIndex(0);
  }, [slash, index]);

  useEffect(() => {
    if (!slash) return;
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSlash(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [slash]);

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
      tags: formatTags(tagsRef.current),
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
      Image.configure({ allowBase64: true }),
      FileAttachment,
      Placeholder.configure({ placeholder: "Type / for commands, or write anything…" }),
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
      refreshSlash();
    },
    onSelectionUpdate: () => {
      refreshSlash();
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const dom = editorRef.current?.view?.dom as HTMLElement | null;
    if (!dom) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!slashRef.current) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i + 1) % Math.max(1, filteredRef.current.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => (i - 1 + Math.max(1, filteredRef.current.length)) % Math.max(1, filteredRef.current.length));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSlash(null);
        return;
      }
      if (event.key === "Enter") {
        const item = filteredRef.current[indexRef.current];
        if (item) {
          event.preventDefault();
          event.stopPropagation();
          slashHandlers.current.run(item);
        }
      }
    };
    dom.addEventListener("keydown", onKeyDown, true);
    return () => dom.removeEventListener("keydown", onKeyDown, true);
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

  const doExport = async (fmt: "md" | "html" | "txt") => {
    setExportOpen(false);
    const title = titleRef.current.trim() || "Untitled";
    const html = editorRef.current?.getHTML() ?? "";
    const name = sanitizeName(title);
    if (fmt === "md") {
      await saveText(`${name}.md`, noteToMarkdown({ ...note, title, body_html: html }));
    } else if (fmt === "html") {
      await saveText(`${name}.html`, noteToHtml({ ...note, title, body_html: html }), "text/html;charset=utf-8");
    } else {
      await saveText(`${name}.txt`, noteToText({ ...note, title, body_html: html }));
    }
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    setTagInput("");
    setTags((prev) => mergeTags(prev, [value]));
    scheduleSave();
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    scheduleSave();
  };

  const attachPicked = (file: File, kind: "image" | "file") => {    const reader = new FileReader();
    reader.onload = () => {
      const pending = pendingAttachRef.current;
      const ed = editorRef.current;
      if (!pending || !ed) return;
      pendingAttachRef.current = null;
      const dataUrl = reader.result as string;
      ed.chain().focus().deleteRange({ from: pending.from, to: pending.to }).run();
      if (kind === "image") {
        ed.chain().insertContent({ type: "image", attrs: { src: dataUrl, alt: file.name } }).run();
      } else {
        ed.chain()
          .insertContent({
            type: "fileAttachment",
            attrs: { name: file.name, mime: file.type, size: file.size, data: dataUrl },
          })
          .run();
      }
    };
    reader.readAsDataURL(file);
  };

  function backLabel(returnTo?: Nav): string {
  if (!returnTo) return "← All notes";
  if (returnTo === "notes") return "← All notes";
  if (typeof returnTo === "object") {
    if (returnTo.kind === "course") return `← Notes tab`;
    if (returnTo.kind === "activity") return `← Notes tab`;
    if (returnTo.kind === "note") return `← All notes`;
  }
  return `← ${returnTo}`;
}

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-2.5">
        <Button variant="ghost" onClick={onBack}>{backLabel(returnTo)}</Button>
        <span className="flex-1" />
        <span className={`text-xs ${status === "error" ? "text-rose-600" : "text-slate-500"}`}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : ""}
        </span>
        <div className="relative">
          <button
            type="button"
            title="Export note"
            onClick={() => setExportOpen((o) => !o)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => void doExport("md")}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Markdown (.md)
                </button>
                <button
                  type="button"
                  onClick={() => void doExport("html")}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  HTML (.html)
                </button>
                <button
                  type="button"
                  onClick={() => void doExport("txt")}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Plain text (.txt)
                </button>
              </div>
            </>
          )}
        </div>
        <DeleteButton onConfirm={() => void confirmDelete()} />
      </div>
      <Toolbar editor={editor} />
      <div className="relative mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave();
          }}
          onBlur={() => void flush()}
          placeholder="Untitled"
          className="w-full bg-transparent text-3xl font-bold text-slate-900 placeholder-slate-400 outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TagPills tags={tags} onRemove={removeTag} max={50} />
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder={tags.length ? "Add a tag…" : "Add tags (e.g. WSL, Project 1)…"}
            className="w-48 bg-transparent text-xs text-slate-600 placeholder-slate-400 outline-none"
          />
        </div>
        <div className="mt-4">
          <EditorContent editor={editor} />
        </div>
        {slash && (
          <div
            ref={popupRef}
            className="fixed z-50 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-2xl"
            style={{ top: slash.top, left: Math.min(slash.left, window.innerWidth - 300) }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Basic blocks
            </p>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">No results</p>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runSlash(item);
                  }}
                  onMouseEnter={() => setIndex(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
                    i === index ? "bg-indigo-50" : ""
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-700">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-900">{item.label}</span>
                    <span className="block truncate text-xs text-slate-500">{item.hint}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <input
        ref={(el) => {
          imageInputRef.current = el;
        }}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) attachPicked(f, "image");
        }}
      />
      <input
        ref={(el) => {
          fileInputRef.current = el;
        }}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) attachPicked(f, "file");
        }}
      />
    </div>
  );
}
