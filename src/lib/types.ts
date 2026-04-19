export type Priority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  color: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  created_at: string;
  monthly_price: number | null;
  currency: string | null;
  client_since: string | null;
}

export interface ProjectWork {
  id: string;
  project_id: string;
  title: string;
  price: number | null;
  note: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  assignee_id: string | null;
  created_by: string;
  due_date: string | null;
  due_end: string | null;
  created_at: string;
  updated_at: string;
}

export type ChatScope = "team" | "project";

export interface ChatMessage {
  id: string;
  scope: ChatScope;
  project_id: string | null;
  author_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

export const PRIORITY_META: Record<Priority, { label: string; dot: string; soft: string; text: string; ring: string }> = {
  high: {
    label: "Urgentné",
    dot: "bg-priority-high",
    soft: "bg-priority-high-soft",
    text: "text-priority-high",
    ring: "ring-priority-high/30",
  },
  medium: {
    label: "Dôležité",
    dot: "bg-priority-medium",
    soft: "bg-priority-medium-soft",
    text: "text-priority-medium",
    ring: "ring-priority-medium/30",
  },
  low: {
    label: "Bežné",
    dot: "bg-priority-low",
    soft: "bg-priority-low-soft",
    text: "text-priority-low",
    ring: "ring-priority-low/30",
  },
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Nezačaté",
  in_progress: "Prebieha",
  done: "Hotové",
};
