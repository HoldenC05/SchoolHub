export type Nav =
  | "today"
  | "calendar"
  | "planner"
  | "classes"
  | "homework"
  | "notes"
  | "ideas"
  | "activities"
  | "integrations"
  | { kind: "activity"; id: number }
  | { kind: "course"; id: number }
  | { kind: "note"; id: number };
