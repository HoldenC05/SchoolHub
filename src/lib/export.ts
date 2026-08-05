import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import { isTauri } from "./api";

export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "Untitled";
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function downloadBlob(bytes: Uint8Array, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function saveBytes(
  name: string,
  dataBase64: string,
  mime: string,
): Promise<boolean> {
  const filename = sanitizeName(name);
  if (isTauri()) {
    try {
      const res = await invoke<{ canceled?: boolean; path?: string }>("export_file", {
        defaultName: filename,
        dataBase64,
      });
      return !res?.canceled;
    } catch (e) {
      console.error("export failed", e);
      return false;
    }
  }
  downloadBlob(base64ToBytes(dataBase64), filename, mime);
  return true;
}

export async function saveText(
  name: string,
  text: string,
  mime = "text/plain;charset=utf-8",
): Promise<boolean> {
  return saveBytes(name, bytesToBase64(new TextEncoder().encode(text)), mime);
}

type NoteLike = {
  title: string;
  body_md: string | null;
  body_html: string | null;
};

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(inlineText).join("");
  switch (tag) {
    case "strong":
    case "b":
      return `**${children}**`;
    case "em":
    case "i":
      return `*${children}*`;
    case "s":
    case "strike":
    case "del":
      return `~~${children}~~`;
    case "code":
      return `\`${children}\``;
    case "a": {
      const href = el.getAttribute("href") ?? "";
      return `[${children}](${href})`;
    }
    case "br":
      return "\n";
    case "img": {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      return `![${alt}](${src})`;
    }
    default:
      return children;
  }
}

function isTaskList(el: Element): boolean {
  return el.tagName.toLowerCase() === "ul" && el.getAttribute("data-type") === "taskList";
}

function listItemMarkdown(li: Element, depth: number, task: boolean, num?: number): string {
  const indent = "  ".repeat(depth);
  const marker = task
    ? li.getAttribute("data-checked") === "true"
      ? "- [x]"
      : "- [ ]"
    : num
      ? `${num}.`
      : "-";
  const contentEl = li.querySelector(":scope > div");
  const content = contentEl
    ? blockMarkdown(contentEl, depth + 1)
    : inlineText(li).trim();
  return `${indent}${marker} ${content}`.replace(/\s+$/g, "");
}

function blockMarkdown(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${"#".repeat(Number(tag[1]))} ${inlineText(el).trim()}`;
    case "p": {
      const t = inlineText(el).trim();
      return t || "";
    }
    case "blockquote":
      return inlineText(el)
        .trim()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "hr":
      return "---";
    case "pre":
      return "```\n" + (el.textContent ?? "").trim() + "\n```";
    case "ul": {
      const task = isTaskList(el);
      return Array.from(el.children)
        .map((li) => listItemMarkdown(li, depth, task))
        .join("\n");
    }
    case "ol":
      return Array.from(el.children)
        .map((li, i) => listItemMarkdown(li, depth, false, i + 1))
        .join("\n");
    case "li":
      return listItemMarkdown(el, depth, isTaskList(el.closest("ul") as Element));
    default:
      return Array.from(el.childNodes)
        .map((n) => blockMarkdown(n, depth))
        .filter(Boolean)
        .join("\n\n");
  }
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return Array.from(doc.body.childNodes)
    .map((n) => blockMarkdown(n, 0))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function htmlToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|blockquote|pre|ul|ol|li|div|hr)>/gi, "\n")
    .replace(/<\/td>/gi, "\t");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").trimStart())
    .filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === "")))
    .join("\n")
    .trim();
}

function noteBodyHtml(note: NoteLike): string {
  if (note.body_html) return note.body_html;
  if (!note.body_md) return "";
  try {
    return marked.parse(note.body_md, { async: false, gfm: true }) as string;
  } catch {
    return "";
  }
}

export function noteToMarkdown(note: NoteLike): string {
  const title = note.title.trim() || "Untitled";
  const body = note.body_md
    ? note.body_md.trim()
    : htmlToMarkdown(note.body_html ?? "");
  return `# ${title}\n\n${body}`.replace(/\n+$/g, "") + "\n";
}

export function noteToHtml(note: NoteLike): string {
  const title = note.title.trim() || "Untitled";
  const body = noteBodyHtml(note);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#334155;line-height:1.7}
h1{color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:.4em}
h2,h3,h4{color:#0f172a}
a{color:var(--color-indigo-600,#4f46e5)}
blockquote{border-left:3px solid var(--color-indigo-500,#6366f1);margin:1em 0;padding:.1em 0 .1em .9em;color:#475569}
code{background:#f1f5f9;border-radius:4px;padding:.12em .35em}
pre{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:.8em 1em;overflow-x:auto}
pre code{background:none;padding:0}
img{max-width:100%;border-radius:8px}
hr{border:none;border-top:1px solid #e2e8f0;margin:1.2em 0}
ul[data-type="taskList"]{list-style:none;padding-left:0}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`;
}

export function noteToText(note: NoteLike): string {
  const title = note.title.trim() || "Untitled";
  const body = note.body_md
    ? htmlToText(marked.parse(note.body_md, { async: false, gfm: true }) as string)
    : htmlToText(note.body_html ?? "");
  return `${title}\n${"=".repeat(Math.max(title.length, 1))}\n\n${body}`.replace(/\n+$/g, "") + "\n";
}

export function allNotesMarkdown(notes: NoteLike[]): string {
  return notes
    .map((n) => {
      const body = n.body_md
        ? n.body_md.trim()
        : htmlToMarkdown(n.body_html ?? "");
      return `## ${n.title.trim() || "Untitled"}\n\n${body}`.replace(/\n+$/g, "");
    })
    .join("\n\n---\n\n") + "\n";
}

export function allNotesHtml(notes: NoteLike[], appName: string): string {
  const sections = notes
    .map((n) => {
      const title = n.title.trim() || "Untitled";
      return `<h1>${escapeHtml(title)}</h1>\n${noteBodyHtml(n)}`;
    })
    .join("\n<hr>\n");
  return noteToHtml({ title: `${appName} — Notes`, body_md: null, body_html: sections });
}

export function allNotesText(notes: NoteLike[]): string {
  return (
    notes
      .map((n) => {
        const title = n.title.trim() || "Untitled";
        const body = n.body_md
          ? htmlToText(marked.parse(n.body_md, { async: false, gfm: true }) as string)
          : htmlToText(n.body_html ?? "");
        return `${title}\n${"=".repeat(Math.max(title.length, 1))}\n\n${body}`.replace(/\n+$/g, "");
      })
      .join("\n\n---\n\n") + "\n"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
