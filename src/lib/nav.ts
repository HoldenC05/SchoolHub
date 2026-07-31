export type Nav =
  | "today"
  | "planner"
  | "classes"
  | "homework"
  | "notes"
  | "ideas"
  | "activities"
  | "integrations"
  | { kind: "activity"; id: number };
