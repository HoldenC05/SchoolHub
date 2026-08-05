import type { Todo, TodoStatus } from "./types";

export const PRIORITY_ORDER: Record<number, string> = { 0: "Low", 1: "Medium", 2: "High" };

export const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const STATUS_ORDER: TodoStatus[] = ["todo", "in_progress", "done"];

export function priorityBadge(priority: number): string {
  switch (priority) {
    case 2:
      return "bg-rose-50 text-rose-600";
    case 0:
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

export function endOfWeek(d: Date): Date {
  const out = startOfWeek(d);
  out.setDate(out.getDate() + 7);
  return new Date(out.getTime() - 1);
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export function dueBucket(todo: Pick<Todo, "due_at">, now = new Date()): DueBucket {
  if (!todo.due_at) return "none";
  const due = new Date(todo.due_at);
  if (isNaN(due.getTime())) return "none";
  if (due < now) return "overdue";
  if (due <= endOfDay(now)) return "today";
  if (due <= endOfWeek(now)) return "week";
  return "later";
}

export function fmtDue(todo: Pick<Todo, "due_at">): string | null {
  if (!todo.due_at) return null;
  const due = new Date(todo.due_at);
  if (isNaN(due.getTime())) return todo.due_at;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (due.getHours() || due.getMinutes()) opts.hour = "numeric";
  return due.toLocaleDateString(undefined, opts);
}

export function compareTodos(a: Todo, b: Todo, now = new Date()): number {
  const aDone = a.status === "done" ? 1 : 0;
  const bDone = b.status === "done" ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const aOver = dueBucket(a, now) === "overdue" ? 1 : 0;
  const bOver = dueBucket(b, now) === "overdue" ? 1 : 0;
  if (aOver !== bOver) return bOver - aOver;
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (!a.due_at && b.due_at) return 1;
  if (a.due_at && !b.due_at) return -1;
  if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
  return a.created_at.localeCompare(b.created_at);
}

export function parseDueInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
