import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import {
  addProjectMember,
  createProject,
  createProjectMonthlyBonus,
  createProjectRecurringWork,
  createProjectWork,
  createTask,
  createTaskMaterial,
  deleteProject,
  deleteProjectMonthlyBonus,
  deleteProjectRecurringWork,
  deleteProjectWork,
  deleteTask,
  deleteTaskMaterial,
  deleteTasks,
  fetchProfiles,
  fetchProjectMembers,
  fetchProjectMonthlyBonuses,
  fetchProjectTasks,
  fetchProjectRecurringWorks,
  fetchProjects,
  fetchProjectWorks,
  fetchRecurringWorkCompletions,
  fetchTaskActivity,
  fetchTaskMaterials,
  fetchTasks,
  fetchTaskWatchers,
  markRecurringWorkDone,
  removeProjectMember,
  setTaskWatchers,
  syncProjectMembers,
  unmarkRecurringWorkDone,
  updateProfile,
  updateProject,
  updateProjectMonthlyBonus,
  updateTask,
} from "./api";
import type { Profile, Project, Task, TaskStatus } from "./types";
import { useSession } from "./useSession";
import { syncTaskToGoogle } from "./googleCalendar";

function fireAndForgetTaskSync(taskId: string, action: "upsert" | "delete" = "upsert") {
  void syncTaskToGoogle(taskId, action).catch((error) => {
    console.error("Google task sync failed", { taskId, action, error });
  });
}

export function useCurrentUserId() {
  const { user } = useSession();
  return user?.id ?? null;
}

const ADMIN_EMAIL = "hazucha.stano@gmail.com";
export function useIsAppAdmin() {
  const { user } = useSession();
  return !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL;
}

export function useProjectMembers(projectId: string | undefined) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["project_members", projectId],
    queryFn: () => fetchProjectMembers(projectId!),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addProjectMember(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_members", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_members", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
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

export function useProjectTasks(projectId: string | undefined) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  const query = useQuery({
    queryKey: ["project_tasks", projectId, user?.id ?? null],
    queryFn: () => fetchProjectTasks(projectId!),
    enabled: !!projectId && isReady && !!user,
  });
  useEffect(() => {
    if (!isReady || !user || !projectId) return;
    const channel = supabase
      .channel(`project-tasks-${projectId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project_tasks", projectId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, isReady, user, projectId]);
  return query;
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

// ---- Monthly bonuses (per mesiac, nezdedia sa do iných mesiacov)
export function useProjectMonthlyBonuses(projectId: string | undefined, monthKey: string) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  useEffect(() => {
    if (!isReady || !user || !projectId) return;
    const channel = supabase
      .channel(`monthly-bonuses-${projectId}-${monthKey}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_monthly_bonuses", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project_monthly_bonuses", projectId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, isReady, user, projectId, monthKey]);
  return useQuery({
    queryKey: ["project_monthly_bonuses", projectId, monthKey],
    queryFn: () => fetchProjectMonthlyBonuses(projectId!, monthKey),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useCreateMonthlyBonus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectMonthlyBonus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_monthly_bonuses", projectId] }),
  });
}

export function useUpdateMonthlyBonus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateProjectMonthlyBonus>[1] }) =>
      updateProjectMonthlyBonus(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_monthly_bonuses", projectId] }),
  });
}

export function useDeleteMonthlyBonus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectMonthlyBonus(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_monthly_bonuses", projectId] }),
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
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project_tasks"] });
      qc.invalidateQueries({ queryKey: ["task_watchers"] });
      if (created?.id) fireAndForgetTaskSync(created.id, "upsert");
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
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<Task[]>(
          key,
          data.map((t) => (t.id === vars.id ? { ...t, ...vars.patch } : t))
        );
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project_tasks"] });
      qc.invalidateQueries({ queryKey: ["task_activity", vars.id] });
      fireAndForgetTaskSync(vars.id, "upsert");
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete Google event BEFORE removing the task row (we need its mapping).
      await syncTaskToGoogle(id, "delete");
      return deleteTask(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project_tasks"] });
    },
  });
}

export function useDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => syncTaskToGoogle(id, "delete")));
      return deleteTasks(ids);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project_tasks"] });
    },
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

export function useToggleTaskDone() {
  const update = useUpdateTask();
  return (task: Task) => {
    const next: TaskStatus = task.status === "done" ? "in_progress" : "done";
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

export function useTaskMaterials(taskId: string | null | undefined) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user || !taskId) return;
    const channel = supabase
      .channel(`task-materials-${taskId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_materials", filter: `task_id=eq.${taskId}` },
        () => qc.invalidateQueries({ queryKey: ["task_materials", taskId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, taskId, qc]);

  return useQuery({
    queryKey: ["task_materials", taskId],
    queryFn: () => fetchTaskMaterials(taskId as string),
    enabled: isReady && !!user && !!taskId,
  });
}

export function useCreateTaskMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTaskMaterial,
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["task_materials", vars.task_id] }),
  });
}

export function useDeleteTaskMaterial(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTaskMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_materials", taskId] }),
  });
}
