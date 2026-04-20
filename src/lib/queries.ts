import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import {
  addProjectMember,
  createProject,
  createProjectRecurringWork,
  createProjectWork,
  createTask,
  deleteProject,
  deleteProjectRecurringWork,
  deleteProjectWork,
  deleteTask,
  deleteTasks,
  fetchProfiles,
  fetchProjectMembers,
  fetchProjectRecurringWorks,
  fetchProjects,
  fetchProjectWorks,
  fetchRecurringWorkCompletions,
  fetchTaskActivity,
  fetchTasks,
  fetchTaskWatchers,
  markRecurringWorkDone,
  removeProjectMember,
  setTaskWatchers,
  syncProjectMembers,
  unmarkRecurringWorkDone,
  updateProfile,
  updateProject,
  updateTask,
} from "./api";
import type { Profile, Project, Task, TaskStatus } from "./types";
import { useSession } from "./useSession";

export function useCurrentUserId() {
  const { user } = useSession();
  return user?.id ?? null;
}

function useAuthReady() {
  const { user, loading } = useSession();
  return { user, isReady: !loading };
}

export function useProfiles() {
  const { isReady, user } = useAuthReady();
  return useQuery({ queryKey: ["profiles", user?.id ?? null], queryFn: fetchProfiles, enabled: isReady && !!user });
}

export function useProjects() {
  const { isReady, user } = useAuthReady();
  return useQuery({ queryKey: ["projects", user?.id ?? null], queryFn: fetchProjects, enabled: isReady && !!user });
}

export function useTasks() {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  // Realtime — refresh on any change
  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`tasks-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        qc.invalidateQueries({ queryKey: ["projects"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, isReady, user]);

  return useQuery({ queryKey: ["tasks", user?.id ?? null], queryFn: fetchTasks, enabled: isReady && !!user });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Project> }) => updateProject(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useProjectWorks(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_works", projectId],
    queryFn: () => fetchProjectWorks(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProjectWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectWork,
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["project_works", vars.project_id] }),
  });
}

export function useDeleteProjectWork(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectWork(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_works", projectId] }),
  });
}

// ---- Recurring works (mesačná náplň)
export function useProjectRecurringWorks(projectId: string | undefined) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  useEffect(() => {
    if (!isReady || !user || !projectId) return;
    const channel = supabase
      .channel(`recurring-works-${projectId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_recurring_works", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project_recurring_works", projectId] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_recurring_work_completions" },
        () => qc.invalidateQueries({ queryKey: ["recurring_work_completions", projectId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, isReady, user, projectId]);
  return useQuery({
    queryKey: ["project_recurring_works", projectId],
    queryFn: () => fetchProjectRecurringWorks(projectId!),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useRecurringWorkCompletions(projectId: string | undefined) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["recurring_work_completions", projectId],
    queryFn: () => fetchRecurringWorkCompletions(projectId!),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useCreateRecurringWork(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectRecurringWork,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_recurring_works", projectId] }),
  });
}

export function useDeleteRecurringWork(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectRecurringWork(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_recurring_works", projectId] });
      qc.invalidateQueries({ queryKey: ["recurring_work_completions", projectId] });
    },
  });
}

export function useToggleRecurringWorkDone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { work_id: string; month_key: string; user_id: string; done: boolean }) => {
      if (vars.done) {
        return markRecurringWorkDone({ work_id: vars.work_id, month_key: vars.month_key, user_id: vars.user_id });
      }
      await unmarkRecurringWorkDone(vars.work_id, vars.month_key);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring_work_completions", projectId] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      task,
      watcherIds = [],
    }: {
      task: Parameters<typeof createTask>[0];
      watcherIds?: string[];
    }) => createTask(task, watcherIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_watchers"] });
    },
  });
}

export function useTaskWatchers() {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`task-watchers-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_watchers" }, () => {
        qc.invalidateQueries({ queryKey: ["task_watchers"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, isReady, user]);
  return useQuery({ queryKey: ["task_watchers", user?.id ?? null], queryFn: fetchTaskWatchers, enabled: isReady && !!user });
}

export function useSetTaskWatchers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, userIds }: { taskId: string; userIds: string[] }) =>
      setTaskWatchers(taskId, userIds),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["task_watchers"] });
      qc.invalidateQueries({ queryKey: ["task_activity", vars.taskId] });
    },
  });
}

export function useSyncProjectMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userIds }: { projectId: string | null; userIds: string[] }) =>
      syncProjectMembers(projectId, userIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) => updateTask(id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_activity", vars.id] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteTasks(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useToggleTaskStatus() {
  const update = useUpdateTask();
  return (task: Task) => {
    const next: TaskStatus =
      task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    return update.mutateAsync({ id: task.id, patch: { status: next } });
  };
}

export function useDelegateTask() {
  const update = useUpdateTask();
  return (taskId: string, assigneeId: string) =>
    update.mutateAsync({ id: taskId, patch: { assignee_id: assigneeId } });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Profile, "full_name" | "color">> }) =>
      updateProfile(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useTaskActivity(taskId: string | null | undefined) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user || !taskId) return;
    const channel = supabase
      .channel(`task-activity-${taskId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_activity", filter: `task_id=eq.${taskId}` },
        () => qc.invalidateQueries({ queryKey: ["task_activity", taskId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, taskId, qc]);

  return useQuery({
    queryKey: ["task_activity", taskId],
    queryFn: () => fetchTaskActivity(taskId as string),
    enabled: isReady && !!user && !!taskId,
  });
}
