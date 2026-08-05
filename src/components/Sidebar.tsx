import type { Activity } from "../lib/types";
import type { Nav } from "../lib/nav";

const MAIN_ITEMS: { nav: Nav; label: string; icon: string }[] = [
  { nav: "today", label: "Today", icon: "📅" },
  { nav: "calendar", label: "Calendar", icon: "🗓️" },
  { nav: "planner", label: "Planner", icon: "🧭" },
  { nav: "classes", label: "Classes", icon: "📚" },
  { nav: "homework", label: "Homework / Tests", icon: "✏️" },
  { nav: "tasks", label: "Tasks", icon: "🗂️" },
  { nav: "tracker", label: "Time Tracker", icon: "⏱️" },
  { nav: "notes", label: "Notes", icon: "📝" },
  { nav: "ideas", label: "Ideas", icon: "💡" },
];

export function Sidebar({
  nav,
  onNavigate,
  activities,
  onAddActivity,
  appName,
}: {
  nav: Nav;
  onNavigate: (nav: Nav) => void;
  activities: Activity[] | null;
  onAddActivity: () => void;
  appName: string;
}) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-5">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">{appName}</h1>
        <p className="text-xs text-slate-500">Everything in one place</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">
          {MAIN_ITEMS.map(({ nav: target, label, icon }) => {
            const active =
              nav === target ||
              (target === "classes" && typeof nav === "object" && nav.kind === "course") ||
              (target === "notes" && typeof nav === "object" && nav.kind === "note");
            return (
              <li key={label}>
                <button
                  onClick={() => onNavigate(target)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span>{icon}</span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 mb-2 flex items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Activities
          </span>
          <button
            onClick={onAddActivity}
            className="rounded p-0.5 text-slate-400 hover:text-slate-700"
            title="Add activity"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="space-y-1">
          {activities && activities.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-slate-400">
              No activities yet — add a club, team, or org
            </li>
          )}
          {activities?.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onNavigate({ kind: "activity", id: a.id })}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  typeof nav === "object" && nav.kind === "activity" && nav.id === a.id
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
                  style={{ backgroundColor: (a.color || "#334155") + "22", color: a.color || "#64748b" }}
                >
                  {a.icon || a.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <button
            onClick={() => onNavigate("integrations")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              nav === "integrations"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>🔌</span>
            Integrations
          </button>
          <button
            onClick={() => onNavigate("settings")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              nav === "settings"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>⚙️</span>
            Settings
          </button>
        </div>
      </nav>
    </div>
  );
}
