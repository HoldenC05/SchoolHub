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

const imageInputRef = { current: null as HTMLInputElement | null };
const fileInputRef = { current: null as HTMLInputElement | null };

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
    </div>
  );
}

export function InlineNoteEditor({
  initialHtml,
  onSave,
  placeholder = "Write your notes here…",
  autosaveMs = 800,
}: {
  initialHtml: string;
  onSave: (html: string) => void;
  placeholder?: string;
  autosaveMs?: number;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lastSavedRef = useRef(initialHtml);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const [slash, setSlash] = useState<SlashState>(null);
  const [index, setIndex] = useState(0);
  const slashRef = useRef<SlashState>(null);
  const indexRef = useRef(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const pendingAttachRef = useRef<{ from: number; to: number } | null>(null);

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

  const runSlash = useCallback((item: SlashItem) => {
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
  }, []);

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

  const flush = useCallback(() => {
    const html = editorRef.current?.getHTML() ?? "";
    if (!dirtyRef.current || html === lastSavedRef.current) return;
    dirtyRef.current = false;
    lastSavedRef.current = html;
    setStatus("saving");
    onSaveRef.current(html);
    setStatus("saved");
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), autosaveMs);
  }, [flush, autosaveMs]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true }),
      FileAttachment,
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    autofocus: false,
    editorProps: {
      attributes: {
        class: "note-body min-h-[10rem] focus:outline-none",
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
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) flush();
    };
  }, [flush]);

  const attachPicked = (file: File, kind: "image" | "file") => {
    const reader = new FileReader();
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

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-2">
        <Toolbar editor={editor} />
        <span className={`shrink-0 pr-1 text-[10px] ${status === "saved" ? "text-slate-400" : "text-transparent"}`}>
          Saved
        </span>
      </div>
      <div className="relative px-4 py-3">
        <EditorContent editor={editor} />
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
