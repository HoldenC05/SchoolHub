export type Nav =
  | "today"
  | "calendar"
  | "classes"
  | "homework"
  | "tasks"
  | "tracker"
  | "notes"
  | "ideas"
  | "activities"
  | "integrations"
  | "settings"
  | "trash"
  | { kind: "activity"; id: number; sub?: string }
  | { kind: "course"; id: number; sub?: string }
  | { kind: "note"; id: number; returnTo?: Nav }
  | { kind: "project"; id: number }
  | { kind: "meeting"; id: number };
