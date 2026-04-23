import { supabase } from "./supabase";
import type {
  Profile,
  Project,
  ProjectRecurringWork,
  ProjectRecurringWorkCompletion,
  ProjectWork,
  Task,
  TaskActivity,
  TaskMaterial,
} from "./types";

const PROJECT_COLS = "id, name, description, color, owner_id, created_at, monthly_price, currency, client_since, category";

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
  category?: string | null;
}): Promise<Project> {
  const { data, error } = await supabase.rpc("create_project_with_membership", {
    _name: input.name,
    _description: input.description,
    _color: input.color,
    _owner_id: input.owner_id,
    _monthly_price: input.monthly_price ?? null,
    _currency: input.currency ?? null,
    _client_since: input.client_since ?? null,
    _category: input.category ?? null,
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

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
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
const TASK_COLS_FULL =
  "id, project_id, title, description, priority, status, assignee_id, created_by, due_date, due_end, series_id, created_at, updated_at";
const TASK_COLS_FALLBACK =
  "id, project_id, title, description, priority, status, assignee_id, created_by, due_date, due_end, created_at, updated_at";

export async function fetchTasks(): Promise<Task[]> {
  const first = await supabase
    .from("tasks")
    .select(TASK_COLS_FULL)
    .order("created_at", { ascending: false });
  let rows: unknown[] | null = first.data as unknown[] | null;
  let err = first.error;
  if (err && (err as { code?: string }).code === "42703") {
    const fallback = await supabase
      .from("tasks")
      .select(TASK_COLS_FALLBACK)
      .order("created_at", { ascending: false });
    rows = fallback.data as unknown[] | null;
    err = fallback.error;
  }
  if (err) throw err;
  return (rows ?? []) as Task[];
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
  // Best-effort — pridanie členov projektu nesmie zhodiť celé vytvorenie úlohy
  // (napr. ak používateľ nemá oprávnenie na sync alebo RPC dočasne zlyhá).
  try {
    await syncProjectMembers(input.project_id, relatedUserIds);
  } catch (e) {
    console.warn("syncProjectMembers failed (non-fatal):", e);
  }
  if (watcherIds.length > 0) {
    const rows = watcherIds.map((user_id) => ({ task_id: task.id, user_id }));
    const { error: wErr } = await supabase.from("task_watchers").insert(rows);
    if (wErr) {
      console.warn("Failed to insert watchers (non-fatal):", wErr);
    }
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

// ---- Project members management (admin/owner)
export async function fetchProjectMembers(projectId: string): Promise<{ project_id: string; user_id: string; role: string }[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, user_id, role")
    .eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

export async function addProjectMember(projectId: string, userId: string) {
  const { error } = await supabase.rpc("add_project_member", { _project_id: projectId, _user_id: userId });
  if (error) throw error;
}

export async function removeProjectMember(projectId: string, userId: string) {
  const { error } = await supabase.rpc("remove_project_member", { _project_id: projectId, _user_id: userId });
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

export async function deleteTasks(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from("tasks").delete().in("id", ids);
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

// ---- Project recurring works (mesačná náplň predplatného)
const RECURRING_COLS = "id, project_id, title, note, position, created_at";

export async function fetchProjectRecurringWorks(projectId: string): Promise<ProjectRecurringWork[]> {
  const { data, error } = await supabase
    .from("project_recurring_works")
    .select(RECURRING_COLS)
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProjectRecurringWork[];
}

export async function createProjectRecurringWork(input: {
  project_id: string;
  title: string;
  note: string | null;
  position?: number;
}): Promise<ProjectRecurringWork> {
  const { data, error } = await supabase
    .from("project_recurring_works")
    .insert({
      project_id: input.project_id,
      title: input.title,
      note: input.note,
      position: input.position ?? 0,
    })
    .select(RECURRING_COLS)
    .single();
  if (error) throw error;
  return data as ProjectRecurringWork;
}

export async function deleteProjectRecurringWork(id: string) {
  const { error } = await supabase.from("project_recurring_works").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRecurringWorkCompletions(
  projectId: string
): Promise<ProjectRecurringWorkCompletion[]> {
  const { data, error } = await supabase
    .from("project_recurring_work_completions")
    .select(
      "id, work_id, month_key, completed_by, completed_at, project_recurring_works!inner(project_id)"
    )
    .eq("project_recurring_works.project_id", projectId);
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string;
    work_id: string;
    month_key: string;
    completed_by: string | null;
    completed_at: string;
  }>).map((r) => ({
    id: r.id,
    work_id: r.work_id,
    month_key: r.month_key,
    completed_by: r.completed_by,
    completed_at: r.completed_at,
  }));
}

export async function markRecurringWorkDone(input: {
  work_id: string;
  month_key: string;
  user_id: string;
}): Promise<ProjectRecurringWorkCompletion> {
  const { data, error } = await supabase
    .from("project_recurring_work_completions")
    .insert({
      work_id: input.work_id,
      month_key: input.month_key,
      completed_by: input.user_id,
    })
    .select("id, work_id, month_key, completed_by, completed_at")
    .single();
  if (error) throw error;
  return data as ProjectRecurringWorkCompletion;
}

export async function unmarkRecurringWorkDone(work_id: string, month_key: string) {
  const { error } = await supabase
    .from("project_recurring_work_completions")
    .delete()
    .eq("work_id", work_id)
    .eq("month_key", month_key);
  if (error) throw error;
}


// ---- Task materials
const MATERIAL_COLS = "id, task_id, url, label, created_by, created_at";

export async function fetchTaskMaterials(taskId: string): Promise<TaskMaterial[]> {
  const { data, error } = await supabase
    .from("task_materials")
    .select(MATERIAL_COLS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskMaterial[];
}

export async function createTaskMaterial(input: {
  task_id: string;
  url: string;
  label: string | null;
  created_by: string;
}): Promise<TaskMaterial> {
  const { data, error } = await supabase
    .from("task_materials")
    .insert({
      task_id: input.task_id,
      url: input.url,
      label: input.label,
      created_by: input.created_by,
    })
    .select(MATERIAL_COLS)
    .single();
  if (error) throw error;
  return data as TaskMaterial;
}

export async function deleteTaskMaterial(id: string): Promise<void> {
  const { error } = await supabase.from("task_materials").delete().eq("id", id);
  if (error) throw error;
}
