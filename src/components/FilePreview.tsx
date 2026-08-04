import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, isTauri } from "../lib/api";
import type { CourseFile } from "../lib/types";
import { Button } from "./ui";

type PreviewKind = "pdf" | "image" | "html" | "markdown" | "text" | "office" | "none";

function detectKind(file: CourseFile): PreviewKind {
  const mime = (file.mime || "").toLowerCase();
  const name = (file.filename || file.title || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/html" || mime.endsWith("html")) return "html";
  if (mime.includes("markdown") || name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "text";
  if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".json") || name.endsWith(".xml")) return "text";
  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    name.endsWith(".rtf")
  ) {
    return "office";
  }
  return "none";
}

function markdownDoc(md: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0f172a;color:#cbd5e1;font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;line-height:1.7;max-width:820px;margin:0 auto}h1,h2,h3{color:#f1f5f9}code{background:#1e293b;padding:2px 6px;border-radius:4px;color:#c4b5fd}pre{background:#0b1120;padding:12px;border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}a{color:#818cf8}img{max-width:100%}blockquote{border-left:3px solid #6366f1;padding-left:12px;color:#94a3b8;margin-left:0}</style></head><body>${md}</body></html>`;
}

export function FilePreview({
  file,
  onClose,
}: {
  file: CourseFile;
  onClose: () => void;
}) {
  const kind = detectKind(file);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (kind === "none" || !file.data) {
          setError(kind === "none" ? "Preview not available for this file type" : "File has no content");
          setLoading(false);
          return;
        }
        const blob = await api.getBlob(`/api/files/${file.id}/raw`);
        if (cancelled) return;
        if (kind === "markdown") {
          const md = await blob.text();
          if (cancelled) return;
          const { marked } = await import("marked");
          const html = marked.parse(md, { async: false, gfm: true }) as string;
          setSrcDoc(markdownDoc(html));
        } else if (kind === "office") {
          const res = await api.get<{ html: string }>(`/api/files/${file.id}/text`);
          if (cancelled) return;
          setSrcDoc(res.html);
        } else if (kind === "text") {
          setText(await blob.text());
        } else {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, kind, file.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downloadHref = file.data
    ? `data:${file.mime || "application/octet-stream"};base64,${file.data}`
    : null;

  const openInDefault = async () => {
    if (!file.data) return;
    if (isTauri()) {
      try {
        const path = await invoke<string>("materialize_file", { id: file.id });
        await openPath(path);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } else if (downloadHref) {
      const a = document.createElement("a");
      a.href = downloadHref;
      a.download = file.filename || file.title;
      a.click();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-100">{file.title}</p>
            <p className="truncate text-xs text-slate-500">
              {file.filename}
              {file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Close (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-950">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading preview…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="text-3xl">📄</span>
              <p className="text-sm text-slate-400">{error}</p>
              <p className="text-xs text-slate-600">
                Open it in the default app to view it in full.
              </p>
            </div>
          ) : kind === "pdf" || kind === "html" || kind === "office" ? (
            <iframe
              src={kind === "office" ? undefined : url || undefined}
              srcDoc={kind === "office" ? (srcDoc || undefined) : undefined}
              className="h-full w-full border-0"
              title={file.title}
            />
          ) : kind === "image" ? (
            <div className="flex h-full items-center justify-center p-4">
              <img src={url || undefined} alt={file.title} className="max-h-full max-w-full object-contain" />
            </div>
          ) : kind === "markdown" ? (
            <iframe srcDoc={srcDoc || undefined} className="h-full w-full border-0" title={file.title} />
          ) : (
            <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-slate-300">
              {text}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-2.5">
          <span className="text-xs text-slate-500">
            {kind === "none" ? "Preview not available" : ""}
          </span>
          <div className="flex items-center gap-2">
            {downloadHref && (
              <a
                href={downloadHref}
                download={file.filename || file.title}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
              >
                Download
              </a>
            )}
            <Button onClick={() => void openInDefault()}>Open in default app</Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
