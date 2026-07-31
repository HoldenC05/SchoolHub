import type { Activity } from "../lib/types";
import type { Nav } from "../lib/nav";

const MAIN_ITEMS: { nav: Nav; label: string; icon: string }[] = [
  { nav: "today", label: "Today", icon: "📅" },
  { nav: "planner", label: "Planner", icon: "🗓️" },
  { nav: "classes", label: "Classes", icon: "📚" },
  { nav: "homework", label: "Homework / Tests", icon: "✏️" },
  { nav: "notes", label: "Notes", icon: "📝" },
  { nav: "ideas", label: "Ideas", icon: "💡" },
];

export function Sidebar({
  nav,
  onNavigate,
  activities,
  onAddActivity,
}: {
  nav: Nav;
  onNavigate: (nav: Nav) => void;
  activities: Activity[] | null;
  onAddActivity: () => void;
}) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="px-5 py-5">
        <h1 className="text-lg font-bold tracking-tight text-slate-100">School Hub</h1>
        <p className="text-xs text-slate-500">Everything in one place</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">
          {MAIN_ITEMS.map(({ nav: target, label, icon }) => (
            <li key={label}>
              <button
                onClick={() => onNavigate(target)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  nav === target
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span>{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 mb-2 flex items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Activities
          </span>
          <button
            onClick={onAddActivity}
            className="rounded p-0.5 text-slate-500 hover:text-slate-200"
            title="Add activity"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="space-y-1">
          {activities && activities.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-slate-600">
              No activities yet — add a club, team, or org
            </li>
          )}
          {activities?.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onNavigate({ kind: "activity", id: a.id })}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  typeof nav === "object" && nav.kind === "activity" && nav.id === a.id
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
                  style={{ backgroundColor: (a.color || "#334155") + "33", color: a.color || "#94a3b8" }}
                >
                  {a.icon || a.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-slate-800 pt-4">
          <button
            onClick={() => onNavigate("integrations")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              nav === "integrations"
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <span>🔌</span>
            Integrations
          </button>
        </div>
      </nav>
    </div>
  );
}
