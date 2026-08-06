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
  course_id: number | null;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  agenda: string | null;
  notes: string | null;
  location: string | null;
  attendees: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseFile {
  id: number;
  course_id: number | null;
  title: string;
  filename: string | null;
  mime: string | null;
  size: number | null;
  data: string | null;
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
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  done: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  entity_type: string | null;
  entity_id: number | null;
  parent_id: number | null;
  title: string;
  body_md: string;
  body_html: string | null;
  tags: string | null;
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

export type TodoStatus = "todo" | "in_progress" | "done";

export interface Todo {
  id: number;
  entity_type: string | null;
  entity_id: number | null;
  activity_id: number | null;
  title: string;
  status: TodoStatus;
  priority: number;
  due_at: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type TimeCategory = "course" | "activity" | "other";

export interface TimeEntry {
  id: number;
  entity_type: TimeCategory | null;
  entity_id: number | null;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface CalendarEvent {
  id: number;
  remote_uid: string;
  summary: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  description: string | null;
  source: string;
  calendar_href: string | null;
  remote_href: string | null;
  rrule: string | null;
  recurrence_id: string | null;
  exdates: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: number;
  app_name: string;
  accent: string;
  today_hidden_calendars: string;
  created_at: string;
  updated_at: string;
}

export interface TrashItem {
  id: number;
  table_name: string;
  row_id: number;
  label: string;
  deleted_at: string;
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
