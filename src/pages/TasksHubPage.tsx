import { useState } from "react";
import { ToDosPage } from "./ToDosPage";
import { TasksPage } from "./TasksPage";

export function TasksHubPage() {
  const [mode, setMode] = useState<"list" | "board">("list");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          onClick={() => setMode("list")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "list" ? "bg-indigo-500 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          ☑️ List
        </button>
        <button
          onClick={() => setMode("board")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "board" ? "bg-indigo-500 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          🗂️ Board
        </button>
      </div>

      {mode === "list" ? <ToDosPage /> : <TasksPage />}
    </div>
  );
}