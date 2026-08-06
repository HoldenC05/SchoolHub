import { api } from "./api";
import { refreshAll } from "./useData";

export type UndoAction = {
  id: number;
  table: string;
  rowId: number;
  createdAt: number;
};

export const TABLE_LABEL: Record<string, string> = {
  courses: "Class",
  activities: "Activity",
  assignments: "Assignment",
  meetings: "Meeting",
  projects: "Project",
  notes: "Note",
  ideas: "Idea",
  todos: "To-do",
  files: "File",
  project_tasks: "Task",
  time_entries: "Time entry",
};

export const TABLE_ICON: Record<string, string> = {
  courses: "📚",
  activities: "🏅",
  assignments: "✏️",
  meetings: "🤝",
  projects: "🗂️",
  notes: "📝",
  ideas: "💡",
  todos: "☑️",
  files: "📄",
  project_tasks: "🔧",
  time_entries: "⏱️",
};

export function tableLabel(table: string): string {
  return TABLE_LABEL[table] ?? table;
}

const TTL_MS = 6000;

let actions: UndoAction[] = [];
let nextId = 1;
const listeners = new Set<(actions: UndoAction[]) => void>();

function emit() {
  const snapshot = [...actions];
  for (const listener of listeners) listener(snapshot);
}

export function pushUndo(table: string, rowId: number) {
  const action: UndoAction = { id: nextId++, table, rowId, createdAt: Date.now() };
  actions = [...actions, action];
  emit();
  window.setTimeout(() => dismiss(action.id), TTL_MS);
}

export function dismiss(actionId: number) {
  if (!actions.some((a) => a.id === actionId)) return;
  actions = actions.filter((a) => a.id !== actionId);
  emit();
}

export async function undo(actionId: number): Promise<boolean> {
  const action = actions.find((a) => a.id === actionId);
  if (!action) return false;
  dismiss(actionId);
  try {
    await api.create(`/api/trash/${action.table}/${action.rowId}/restore`, {});
    refreshAll();
    return true;
  } catch (err) {
    console.error("Undo failed:", err);
    return false;
  }
}

export function getUndoActions(): UndoAction[] {
  return [...actions];
}

export function subscribeUndo(listener: (actions: UndoAction[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
