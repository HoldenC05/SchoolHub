import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { refreshAll, useData, useUpdate } from "../lib/useData";
import { api, isTauri } from "../lib/api";
import type { AppSettings, Course, CourseFile, Note } from "../lib/types";
import { ACCENT_PRESETS, applyAccent } from "../lib/theme";
import {
  allNotesHtml,
  allNotesMarkdown,
  allNotesText,
  htmlToText,
  saveBytes,
  saveText,
} from "../lib/export";
import { Button, Card, Field, SelectInput, TextInput } from "../components/ui";

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

const IMPORT_HEADERS = ["title", "course", "due", "due_at", "due date", "grade", "status", "kind", "notes"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((f) => f.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += c;
  }
  if (field !== "" || cur.length) {
    cur.push(field);
    if (cur.some((f) => f.trim() !== "")) rows.push(cur);
  }
  return rows;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseImportDate(s: string): string | null {
  const raw = s.trim();
  if (!raw) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2}))?/.exec(raw);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0"] = m;
    return `${y}-${pad2(Number(mo))}-${pad2(Number(d))}T${pad2(Number(h))}:${pad2(Number(mi))}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ]?(\d{1,2}):(\d{1,2}))?/.exec(raw);
  if (m) {
    const [, mo, d, y, h = "0", mi = "0"] = m;
    return `${y}-${pad2(Number(mo))}-${pad2(Number(d))}T${pad2(Number(h))}:${pad2(Number(mi))}`;
  }
  return null;
}

function normalizeKind(s: string): string {
  const k = s.trim().toLowerCase();
  if (k === "test" || k === "quiz" || k === "exam") return "test";
  if (k === "project") return "project";
  return "homework";
}

function normalizeStatus(s: string): string {
  const v = s.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (v === "graded" || v === "grade" || v === "done" || v === "complete" || v === "completed") {
    return v.startsWith("grad") ? "graded" : "done";
  }
  if (v === "inprogress" || v === "working") return "in_progress";
  return "todo";
}

interface ImportResult {
  imported: number;
  noClass: number;
  skipped: string[];
}

function ImportSection() {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: courses } = useData<Course[]>("/api/courses");

  const doImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const rows = parseCsv(csv);
      if (rows.length === 0) throw new Error("Paste some CSV first.");
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = headers.some((h) => IMPORT_HEADERS.includes(h));
      const data = hasHeader ? rows.slice(1) : rows;
      if (hasHeader && data.length === 0) throw new Error("No rows found under the header.");

      const courseMap = new Map<string, number>();
      for (const c of courses || []) courseMap.set(c.name.trim().toLowerCase(), c.id);

      let imported = 0;
      let noClass = 0;
      const skipped: string[] = [];

      for (const row of data) {
        let title = "";
        let courseName = "";
        let due = "";
        let grade = "";
        let status = "";
        let kind = "";
        let notes = "";

        if (hasHeader) {
          const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
          title = row[idx.title] ?? "";
          courseName = row[idx.course] ?? "";
          due = row[idx.due] ?? row[idx.due_at] ?? row[idx["due date"]] ?? "";
          grade = row[idx.grade] ?? "";
          status = row[idx.status] ?? "";
          kind = row[idx.kind] ?? "";
          notes = row[idx.notes] ?? "";
        } else {
          title = row[0] ?? "";
          courseName = row[1] ?? "";
          due = row[2] ?? "";
          grade = row[3] ?? "";
          status = row[4] ?? "";
          kind = row[5] ?? "";
        }
        title = String(title).trim();
        if (!title) continue;

        const dueAt = parseImportDate(String(due));
        const courseId = courseName
          ? courseMap.get(String(courseName).trim().toLowerCase())
          : undefined;

        await api.create("/api/assignments", {
          title,
          kind: normalizeKind(String(kind)),
          status: normalizeStatus(String(status)),
          due_at: dueAt,
          grade: grade ? String(grade).trim() : null,
          course_id: courseId ?? null,
          notes: notes ? String(notes).trim() || null : null,
        });
        imported++;
        if (courseName && courseId === undefined) noClass++;
      }

      refreshAll();
      setResult({ imported, noClass, skipped });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold text-slate-900">Import assignments</h2>
        <p className="text-sm text-slate-500">
          Paste a CSV (comma-separated, one assignment per row) to bulk-add assignments with grades.
        </p>
      </div>
      <Field label="CSV (header: title, course, due, grade, status, kind)">
        <textarea
          className="h-40 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 resize-y"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"title,course,due,grade,status,kind\nEssay 1,AP Biology,2026-09-01,92,graded,homework\nQuiz 3,AP Biology,08/15/2026,17/20,todo,test"}
        />
      </Field>
      <p className="text-xs text-slate-400">
        "course" matches a class you've already created (by name). Dates work as{" "}
        <code className="text-slate-500">2026-09-01</code>, <code className="text-slate-500">2026-09-01 14:30</code>,
        or <code className="text-slate-500">09/01/2026</code>. Status: todo / in_progress / done / graded.
      </p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {result && (
        <p className="text-xs text-emerald-600">
          Imported {result.imported} assignment{result.imported === 1 ? "" : "s"}
          {result.noClass > 0 ? ` (${result.noClass} without a matching class)` : ""}.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={() => void doImport()} disabled={busy || !csv.trim()}>
          {busy ? "Importing…" : "Import assignments"}
        </Button>
      </div>
    </Card>
  );
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
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLead, setNotifLead] = useState(60);

  useEffect(() => {
    if (!settings) return;
    setAppName(settings.app_name || "School Hub");
    setAccent(settings.accent || "indigo");
    setNotifEnabled(settings.notifications_enabled === 1);
    setNotifLead(settings.notify_before_minutes ?? 60);
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

  const saveNotifications = async () => {
    setSaved("saving");
    const ok = await update(1, {
      notifications_enabled: notifEnabled ? 1 : 0,
      notify_before_minutes: notifLead,
    });
    setSaved(ok ? "saved" : "error");
    refresh();
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
            appear in Calendar.
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

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">
            Get pinged when homework, tests, and meetings are coming up. Works while School Hub is
            open on your Mac or phone.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-500"
            checked={notifEnabled}
            onChange={(e) => setNotifEnabled(e.target.checked)}
          />
          <span className="flex-1 text-sm text-slate-900">Enable reminders</span>
        </label>
        <Field label="Remind me">
          <SelectInput
            value={String(notifLead)}
            onChange={(v) => setNotifLead(Number(v))}
            options={[
              { value: "15", label: "15 minutes before" },
              { value: "30", label: "30 minutes before" },
              { value: "60", label: "1 hour before" },
              { value: "120", label: "2 hours before" },
              { value: "1440", label: "1 day before" },
            ]}
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button onClick={() => void saveNotifications()} disabled={saved === "saving"}>
            Save notifications
          </Button>
          {saved === "saved" && <span className="text-xs text-emerald-600">Saved ✓</span>}
          {saved === "error" && <span className="text-xs text-rose-600">Couldn't save.</span>}
        </div>
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

      <ImportSection />

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
