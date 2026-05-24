export type Priority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  color: string | null;
}

export type ProjectCategory = "odstartujto.sk" | "shazucha.sk";

export const PROJECT_CATEGORIES: ProjectCategory[] = ["odstartujto.sk", "shazucha.sk"];

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
  category: ProjectCategory | null;
  hourly_rate: number | null;
}

export interface ProjectWork {
  id: string;
  project_id: string;
  title: string;
  price: number | null;
  note: string | null;
  created_at: string;
}

export interface ProjectRecurringWork {
  id: string;
  project_id: string;
  title: string;
  note: string | null;
  position: number;
  created_at: string;
  assignee_id: string | null;
}

export interface ProjectRecurringWorkCompletion {
  id: string;
  work_id: string;
  month_key: string; // "YYYY-MM"
  completed_by: string | null;
  completed_at: string;
}

export interface ProjectMonthlyWork {
  id: string;
  project_id: string;
  month_key: string; // "YYYY-MM"
  title: string;
  note: string | null;
  position: number;
  source_work_id: string | null;
  created_at: string;
  assignee_id: string | null;
}

export interface ProjectMonthlyWorkCompletion {
  id: string;
  monthly_work_id: string;
  completed_by: string | null;
  completed_at: string;
}

export interface ProjectMonthlyBonus {
  id: string;
  project_id: string;
  month_key: string; // "YYYY-MM"
  title: string;
  note: string | null;
  position: number;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  qty: number;
  unit_price: number | null;
  hours: number | null;
  hourly_rate: number | null;
  catalog_id: string | null;
  unit_type: ServiceUnitType;
}

export type ServiceUnitType = "piece" | "hourly";

export interface ServiceCatalogItem {
  id: string;
  title: string;
  unit_price: number;
  default_hours: number | null;
  note: string | null;
  position: number;
  active: boolean;
  created_at: string;
  unit_type: ServiceUnitType;
  description: string | null;
}

export interface ProjectServiceOverride {
  id: string;
  project_id: string;
  catalog_id: string;
  unit_price: number | null;
  default_hours: number | null;
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
  series_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskMaterial {
  id: string;
  task_id: string;
  url: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProjectMaterial {
  id: string;
  project_id: string;
  url: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CompanyMaterial {
  id: string;
  url: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
  position: number | null;
  color: string | null;
  subcategory: string | null;
}

export const AI_TOOL_CATEGORIES = [
  "tvorba-textu",
  "obrazky",
  "video",
  "audio",
  "design",
  "tvorba-webu",
  "tvorba-loga",
  "chatbot",
  "produktivita",
  "kod",
  "marketing",
  "prezentacie",
  "ai-agenti",
  "ai-avatari",
  "prepis-hovoreneho-slova",
  "ine",
] as const;
export type AiToolCategoryPreset = (typeof AI_TOOL_CATEGORIES)[number];
// Povolíme aj vlastné (používateľské) kategórie – ukladajú sa ako voľný text.
export type AiToolCategory = AiToolCategoryPreset | (string & {});

export const AI_TOOL_CATEGORY_LABEL: Record<AiToolCategoryPreset, string> = {
  "tvorba-textu": "Tvorba textu",
  "obrazky": "Obrázky",
  "video": "Video",
  "audio": "Audio",
  "design": "Design",
  "tvorba-webu": "Tvorba webu a aplikácií",
  "tvorba-loga": "Tvorba loga",
  "chatbot": "Chatbot",
  "produktivita": "Produktivita",
  "kod": "Kód & dev",
  "marketing": "Marketing & SEO",
  "prezentacie": "Prezentácie",
  "ai-agenti": "AI Agenti",
  "ai-avatari": "AI Avatari",
  "prepis-hovoreneho-slova": "Prepis hovoreného slova",
  "ine": "Iné",
};

// Pomocná funkcia – vráti label pre prednastavenú alebo vlastnú kategóriu.
export function getAiToolCategoryLabel(c: string): string {
  if (c in AI_TOOL_CATEGORY_LABEL) return AI_TOOL_CATEGORY_LABEL[c as AiToolCategoryPreset];
  // Vlastná kategória – odvodí pekný label zo slugu.
  return c
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface AiTool {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category: AiToolCategory;
  image_url: string | null;
  created_by: string | null;
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
  month_key?: string | null;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

export interface DirectMessageRead {
  user_id: string;
  peer_id: string;
  last_read_at: string;
}

export type TaskActivityAction = "created" | "field_changed" | "watcher_added" | "watcher_removed";

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: TaskActivityAction;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
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
  todo: "Nedokončená",
  in_progress: "Nedokončená",
  done: "Dokončená",
};
