import { supabase } from "./supabase";
import type { Profile, Project, ProjectWork, Task, TaskActivity } from "./types";

const PROJECT_COLS = "id, name, description, color, owner_id, created_at, monthly_price, currency, client_since";

// ---- Profiles
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email, color")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, "full_name" | "color">>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("id, full_name, avatar_url, email, color")
    .single();
  if (error) throw error;
  return data as Profile;
}

// ---- Projects
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(input: {
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  monthly_price?: number | null;
  currency?: string | null;
  client_since?: string | null;
}): Promise<Project> {
  const { data, error } = await supabase.rpc("create_project_with_membership", {
    _name: input.name,
    _description: input.description,
    _color: input.color,
    _owner_id: input.owner_id,
    _monthly_price: input.monthly_price ?? null,
    _currency: input.currency ?? null,
    _client_since: input.client_since ?? null,
  });
  if (error) throw error;
  return data as Project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(PROJECT_COLS)
    .single();
  if (error) throw error;
  return data as Project;
}

// ---- Project works (jednotlivé práce pre klienta)
export async function fetchProjectWorks(projectId: string): Promise<ProjectWork[]> {
  const { data, error } = await supabase
    .from("project_works")
    .select("id, project_id, title, price, note, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectWork[];
}

export async function createProjectWork(input: {
  project_id: string;
  title: string;
  price: number | null;
  note: string | null;
}): Promise<ProjectWork> {
  const { data, error } = await supabase
    .from("project_works")
    .insert(input)
    .select("id, project_id, title, price, note, created_at")
    .single();
  if (error) throw error;
  return data as ProjectWork;
}

export async function deleteProjectWork(id: string) {
  const { error } = await supabase.from("project_works").delete().eq("id", id);
  if (error) throw error;
}

// ---- Tasks
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, project_id, title, description, priority, status, assignee_id, created_by, due_date, due_end, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(
  input: Omit<Task, "id" | "created_at" | "updated_at">,
  watcherIds: string[] = []
) {
  const { data, error } = await supabase
    .from("tasks")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  const task = data as Task;
  const relatedUserIds = [input.created_by, input.assignee_id, ...watcherIds].filter(
    (value): value is string => !!value
  );
  await syncProjectMembers(input.project_id, relatedUserIds);
  if (watcherIds.length > 0) {
    const rows = watcherIds.map((user_id) => ({ task_id: task.id, user_id }));
    const { error: wErr } = await supabase.from("task_watchers").insert(rows);
    if (wErr) throw wErr;
  }
  return task;
}

// ---- Task watchers
export async function fetchTaskWatchers(): Promise<{ task_id: string; user_id: string }[]> {
  const { data, error } = await supabase.from("task_watchers").select("task_id, user_id");
  if (error) throw error;
  return data ?? [];
}

export async function setTaskWatchers(taskId: string, userIds: string[]) {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("project_id, created_by, assignee_id")
    .eq("id", taskId)
    .single();
  if (taskError) throw taskError;

  await syncProjectMembers(
    task.project_id,
    [task.created_by, task.assignee_id, ...userIds].filter((value): value is string => !!value)
  );

  const { error: deleteError } = await supabase.from("task_watchers").delete().eq("task_id", taskId);
  if (deleteError) throw deleteError;
  if (userIds.length === 0) return;
  const rows = userIds.map((user_id) => ({ task_id: taskId, user_id }));
  const { error } = await supabase.from("task_watchers").insert(rows);
  if (error) throw error;
}

export async function syncProjectMembers(projectId: string | null, userIds: string[]) {
  if (!projectId || userIds.length === 0) return;
  const uniqueUserIds = Array.from(new Set(userIds));
  const { error } = await supabase.rpc("sync_project_members", {
    _project_id: projectId,
    _user_ids: uniqueUserIds,
  });
  if (error) throw error;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---- Task activity (história zmien)
export async function fetchTaskActivity(taskId: string): Promise<TaskActivity[]> {
  const { data, error } = await supabase
    .from("task_activity")
    .select("id, task_id, actor_id, action, field, old_value, new_value, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TaskActivity[];
}
