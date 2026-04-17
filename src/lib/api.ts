import { supabase } from "./supabase";
import type { Profile, Project, Task } from "./types";

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
    .select("id, name, description, color, owner_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(input: {
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
}): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert(input)
    .select("id, name, description, color, owner_id, created_at")
    .single();
  if (error) throw error;
  // Auto-add owner as member so RLS reads work cleanly
  await supabase.from("project_members").insert({
    project_id: data.id,
    user_id: input.owner_id,
    role: "owner",
  });
  return data as Project;
}

// ---- Tasks
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, project_id, title, description, priority, status, assignee_id, created_by, due_date, created_at, updated_at"
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
  await supabase.from("task_watchers").delete().eq("task_id", taskId);
  if (userIds.length === 0) return;
  const rows = userIds.map((user_id) => ({ task_id: taskId, user_id }));
  const { error } = await supabase.from("task_watchers").insert(rows);
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
