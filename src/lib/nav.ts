export type Nav =
  | "today"
  | "calendar"
  | "planner"
  | "classes"
  | "homework"
  | "tasks"
  | "tracker"
  | "notes"
  | "ideas"
  | "activities"
  | "integrations"
  | "settings"
  | { kind: "activity"; id: number }
  | { kind: "course"; id: number }
  | { kind: "note"; id: number; returnTo?: Nav };
