import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Nav } from "../lib/nav";
import type {
  Activity,
  Assignment,
  Course,
  Idea,
  Meeting,
  Note,
  Project,
  Todo,
} from "../lib/types";

interface Hit {
  label: string;
  icon: string;
  title: string;
  subtitle: string;
  nav: Nav;
}

const KIND_ORDER: Record<string, number> = {
  Class: 0,
  Meeting: 1,
  "Homework / Test": 2,
  Task: 3,
  Note: 4,
  Project: 5,
  Activity: 6,
  Idea: 7,
};

export function SearchPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (nav: Nav) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setLoaded(false);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    let cancelled = false;

    Promise.all([
      api.get<Course[]>("/api/courses"),
      api.get<Note[]>("/api/notes"),
      api.get<Todo[]>("/api/todos"),
      api.get<Meeting[]>("/api/meetings"),
      api.get<Assignment[]>("/api/assignments"),
      api.get<Idea[]>("/api/ideas"),
      api.get<Activity[]>("/api/activities"),
      api.get<Project[]>("/api/projects"),
    ])
      .then(
        ([courses, notes, todos, meetings, assignments, ideas, activities, projects]) => {
          if (cancelled) return;
          const hits: Hit[] = [];
          courses.forEach((c) =>
            hits.push({
              label: "Class",
              icon: "📚",
              title: c.name,
              subtitle: c.teacher ?? c.term ?? "",
              nav: { kind: "course", id: c.id },
            }),
          );
          meetings.forEach((m) =>
            hits.push({
              label: "Meeting",
              icon: "🤝",
              title: m.title,
              subtitle: m.location ?? m.notes ?? "",
              nav: { kind: "meeting", id: m.id },
            }),
          );
          assignments.forEach((a) =>
            hits.push({
              label: "Homework / Test",
              icon: "✏️",
              title: a.title,
              subtitle: [a.due_at ?? "", a.grade ?? ""].filter(Boolean).join(" · "),
              nav: a.course_id ? { kind: "course", id: a.course_id } : "homework",
            }),
          );
          todos.forEach((t) =>
            hits.push({
              label: "Task",
              icon: "☑️",
              title: t.title,
              subtitle: t.due_at ?? "",
              nav: "tasks",
            }),
          );
          notes.forEach((n) =>
            hits.push({
              label: "Note",
              icon: "📝",
              title: n.title,
              subtitle: n.tags ?? "",
              nav: { kind: "note", id: n.id },
            }),
          );
          projects.forEach((p) =>
            hits.push({
              label: "Project",
              icon: "🚀",
              title: p.title,
              subtitle: p.status,
              nav: { kind: "project", id: p.id },
            }),
          );
          activities.forEach((a) =>
            hits.push({
              label: "Activity",
              icon: a.icon ?? "🏅",
              title: a.name,
              subtitle: a.category ?? "",
              nav: { kind: "activity", id: a.id },
            }),
          );
          ideas.forEach((i) =>
            hits.push({
              label: "Idea",
              icon: "💡",
              title: i.title,
              subtitle: i.body ?? "",
              nav: "ideas",
            }),
          );
          hits.sort((a, b) => (KIND_ORDER[a.label] ?? 9) - (KIND_ORDER[b.label] ?? 9));
          setItems(hits);
          setLoaded(true);
        },
      )
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = items
      .map((it) => {
        const title = it.title.toLowerCase();
        const sub = it.subtitle.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (title.startsWith(t)) score += 10;
          else if (title.includes(t)) score += 5;
          else if (sub.includes(t)) score += 2;
          else return null;
        }
        return { it, score };
      })
      .filter((x): x is { it: Hit; score: number } => x !== null);
    scored.sort(
      (a, b) =>
        b.score - a.score || (KIND_ORDER[a.it.label] ?? 9) - (KIND_ORDER[b.it.label] ?? 9),
    );
    return scored.slice(0, 30).map((x) => x.it);
  }, [query, items]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = filtered[selected];
        if (hit) {
          onNavigate(hit.nav);
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, selected, onClose, onNavigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[15vh] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <span className="text-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes, notes, tasks, meetings…"
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
            esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {!loaded && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>}
          {loaded && filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              No results for “{query}”
            </p>
          )}
          {filtered.map((hit, i) => (
            <button
              key={`${hit.label}-${hit.title}-${i}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                onNavigate(hit.nav);
                onClose();
              }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                i === selected ? "bg-indigo-50" : ""
              }`}
            >
              <span className="text-base">{hit.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {hit.title}
                </span>
                {hit.subtitle && (
                  <span className="block truncate text-xs text-slate-500">{hit.subtitle}</span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {hit.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
