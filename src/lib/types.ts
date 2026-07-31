export interface Course {
  id: number;
  name: string;
  term: string | null;
  color: string | null;
  teacher: string | null;
  schedule_json: string | null;
  blackboard_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  name: string;
  category: string | null;
  color: string | null;
  icon: string | null;
  contact: string | null;
  schedule_json: string | null;
  created_at: string;
  updated_at: string;
}

export type AssignmentKind = "homework" | "test" | "project";
export type AssignmentStatus = "todo" | "in_progress" | "done" | "graded";

export interface Assignment {
  id: number;
  course_id: number | null;
  activity_id: number | null;
  title: string;
  kind: AssignmentKind;
  due_at: string | null;
  status: AssignmentStatus;
  grade: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: number;
  activity_id: number | null;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  agenda: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  activity_id: number | null;
  course_id: number | null;
  title: string;
  status: string;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  entity_type: string | null;
  entity_id: number | null;
  title: string;
  body_md: string;
  created_at: string;
  updated_at: string;
}

export interface Idea {
  id: number;
  title: string;
  body: string | null;
  done: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export const KIND_LABELS: Record<AssignmentKind, string> = {
  homework: "Homework",
  test: "Test",
  project: "Project",
};

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  graded: "Graded",
};
