import { supabase } from "./supabase";
import type { Profile, Project, Task } from "./types";

// ---- Profiles
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Profile[];
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

export async function createTask(input: Omit<Task, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("tasks")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
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
