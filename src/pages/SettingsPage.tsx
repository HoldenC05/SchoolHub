import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useData, useUpdate } from "../lib/useData";
import { api, isTauri } from "../lib/api";
import type { AppSettings, CourseFile, Note } from "../lib/types";
import { ACCENT_PRESETS, applyAccent } from "../lib/theme";
import {
  allNotesHtml,
  allNotesMarkdown,
  allNotesText,
  htmlToText,
  saveBytes,
  saveText,
} from "../lib/export";
import { Button, Card, Field, TextInput } from "../components/ui";

interface CalSel {
  href: string;
  name: string;
}

interface CalStatus {
  email: string;
  connected: boolean;
  calendars: CalSel[];
  push_calendar: CalSel | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

function slug(s: string): string {
  return s.trim().replace(/[^A-Za-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "export";
}

function fileExt(name: string | null): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || "");
  return m ? `.${m[1].toLowerCase()}` : "";
}

export function SettingsPage() {
  const { data, refresh } = useData<AppSettings[]>("/api/settings");
  const { update } = useUpdate<AppSettings>("/api/settings");
  const notes = useData<Note[]>("/api/notes");
  const files = useData<CourseFile[]>("/api/files");
  const settings = data?.[0] ?? null;

  const [appName, setAppName] = useState("School Hub");
  const [accent, setAccent] = useState("indigo");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [calStatus, setCalStatus] = useState<CalStatus | null>(null);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setAppName(settings.app_name || "School Hub");
    setAccent(settings.accent || "indigo");
    try {
      setHidden(new Set(JSON.parse(settings.today_hidden_calendars || "[]")));
    } catch {
      setHidden(new Set());
    }
  }, [settings]);

  useEffect(() => {
    if (settings) applyAccent(settings.accent || "indigo");
  }, [settings?.accent]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<CalStatus>("cal_sync_status")
      .then(setCalStatus)
      .catch(() => setCalStatus(null));
    invoke<string>("data_dir")
      .then(setDataDir)
      .catch(() => setDataDir(null));
  }, []);

  const saveGeneral = async () => {
    setSaved("saving");
    const ok = await update(1, {
      app_name: appName.trim() || "School Hub",
      accent,
      today_hidden_calendars: JSON.stringify([...hidden]),
    });
    setSaved(ok ? "saved" : "error");
    refresh();
  };

  const toggleHidden = (href: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const pickAccent = (name: string) => {
    setAccent(name);
    applyAccent(name);
  };

  const exportNotes = async (fmt: "md" | "html" | "txt") => {
    if (!notes.data || notes.data.length === 0) {
      setMsg("No notes to export yet — create one in Notes first.");
      return;
    }
    setMsg(null);
    const name = `${slug(appName)}-notes.${fmt}`;
    if (fmt === "md") await saveText(name, allNotesMarkdown(notes.data));
    else if (fmt === "html")
      await saveText(name, allNotesHtml(notes.data, appName || "School Hub"), "text/html;charset=utf-8");
    else await saveText(name, allNotesText(notes.data));
  };

  const exportDoc = async (f: CourseFile, kind: "original" | "text") => {
    setBusy(true);
    setMsg(null);
    try {
      const base = (f.filename || f.title).replace(/\.[^.]+$/, "");
      if (kind === "original") {
        await saveBytes(
          `${base}${fileExt(f.filename) || ".bin"}`,
          f.data || "",
          f.mime || "application/octet-stream",
        );
      } else {
        const res = await api.get<{ html: string }>(`/api/files/${f.id}/text`);
        await saveText(`${base}.txt`, htmlToText(res.html || ""));
      }
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await invoke<{ canceled?: boolean; path?: string }>("export_backup");
      if (res.canceled) setMsg("Backup canceled");
      else setMsg(`Backup saved to ${res.path}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const connectedCals = calStatus?.connected ? calStatus.calendars : [];
  const shownCals = connectedCals.filter((c) => !hidden.has(c.href));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Make School Hub yours</p>
      </header>

      <Card className="space-y-4">
        <h2 className="font-semibold text-slate-900">Appearance</h2>
        <Field label="App name">
          <div className="flex items-center gap-2">
            <TextInput value={appName} onChange={setAppName} placeholder="School Hub" />
            <Button onClick={() => void saveGeneral()} disabled={saved === "saving"}>
              {saved === "saving" ? "Saving…" : "Save"}
            </Button>
          </div>
        </Field>
        <Field label="Accent color">
          <div className="flex flex-wrap gap-3">
            {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => pickAccent(key)}
                title={preset.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105 ${
                  accent === key ? "ring-2 ring-slate-900 ring-offset-2" : ""
                }`}
                style={{ backgroundColor: preset.swatch }}
              >
                {accent === key && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2.5 8.5l3.5 3.5 7-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {ACCENT_PRESETS[accent]?.label ?? "Accent"} — previews instantly, saved with the button above.
          </p>
        </Field>
        {saved === "saved" && <p className="text-xs text-emerald-600">Saved ✓</p>}
        {saved === "error" && <p className="text-xs text-rose-600">Couldn't save settings.</p>}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Today view calendars</h2>
          <p className="text-sm text-slate-500">
            Pick which connected calendars show up in your Today page. Hidden calendars still
            appear in Calendar and Planner.
          </p>
        </div>
        {connectedCals.length === 0 ? (
          <p className="text-sm text-slate-500">
            No connected calendars.{" "}
            {isTauri() ? "Add one in Integrations first." : "Calendars sync from your Mac."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {connectedCals.map((c) => {
              const on = !hidden.has(c.href);
              return (
                <label
                  key={c.href}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                    on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-500"
                    checked={on}
                    onChange={() => toggleHidden(c.href)}
                  />
                  <span className={`min-w-0 flex-1 truncate text-sm ${on ? "text-slate-900" : "text-slate-400 line-through"}`}>
                    {c.name || c.href}
                  </span>
                  {on ? (
                    <span className="shrink-0 text-xs text-emerald-600">In Today</span>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400">Hidden</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        {connectedCals.length > 0 && (
          <div className="flex items-center gap-2">
            <Button onClick={() => void saveGeneral()} disabled={saved === "saving"}>
              Save
            </Button>
            <span className="text-xs text-slate-500">
              Showing {shownCals.length} of {connectedCals.length} calendar{connectedCals.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">Export & backup</h2>
          <p className="text-sm text-slate-500">
            Export your notes and documents, or back up the whole database.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            All notes ({notes.data?.length ?? 0})
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => void exportNotes("md")}
              disabled={busy || (notes.data?.length ?? 0) === 0}
            >
              Markdown (.md)
            </Button>
            <Button
              variant="ghost"
              onClick={() => void exportNotes("html")}
              disabled={busy || (notes.data?.length ?? 0) === 0}
            >
              HTML (.html)
            </Button>
            <Button
              variant="ghost"
              onClick={() => void exportNotes("txt")}
              disabled={busy || (notes.data?.length ?? 0) === 0}
            >
              Plain text (.txt)
            </Button>
          </div>
          {(notes.data?.length ?? 0) === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              No notes yet — they'll light up once you create one.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Documents ({files.data?.length ?? 0})
          </p>
          {files.data && files.data.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {files.data.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{f.title}</span>
                  <button
                    onClick={() => void exportDoc(f, "original")}
                    className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    disabled={busy}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => void exportDoc(f, "text")}
                    className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    disabled={busy}
                  >
                    Text
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No documents uploaded yet.</p>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <Button onClick={() => void backup()} disabled={busy || !isTauri()}>
            {busy ? "Working…" : "Back up database"}
          </Button>
          {!isTauri() && (
            <p className="mt-1 text-xs text-slate-500">Full backups are available on your Mac.</p>
          )}
        </div>

        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold text-slate-900">Where your data lives</h2>
        <p className="text-sm text-slate-500">
          Everything is stored locally on your Mac in a single SQLite database. There's no
          automatic cloud backup — calendar events are the only thing that syncs (two-way with
          iCloud). Use <span className="text-slate-700">Back up database</span> above to make a
          snapshot anytime.
        </p>
        {dataDir && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs">
            <p className="text-slate-500">
              App data: <code className="break-all text-slate-700">{dataDir}</code>
            </p>
            <p className="mt-1 text-slate-500">
              Database: <code className="break-all text-slate-700">{dataDir}/school-hub.db</code>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
