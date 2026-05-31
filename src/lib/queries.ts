import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import {
  addProjectMember,
  createProject,
  createProjectMonthlyBonus,
  createProjectRecurringWork,
  createProjectWork,
  createServiceCatalogItem,
  createTask,
  createTaskMaterial,
  createProjectMaterial,
  deleteProject,
  deleteProjectMonthlyBonus,
  deleteProjectRecurringWork,
  deleteProjectServiceOverride,
  reorderProjectRecurringWorks,
  deleteProjectWork,
  deleteServiceCatalogItem,
  deleteTask,
  deleteTaskMaterial,
  deleteProjectMaterial,
  deleteTasks,
  fetchProfiles,
  fetchProjectMembers,
  fetchProjectMonthlyBonuses,
  fetchProjectTasks,
  fetchProjectRecurringWorks,
  fetchProjects,
  fetchProjectServiceOverrides,
  fetchProjectWorks,
  fetchProjectMaterials,
  createCompanyMaterial,
  deleteCompanyMaterial,
  fetchCompanyMaterials,
  reorderCompanyMaterials,
  updateCompanyMaterial,
  fetchAiTools,
  createAiTool,
  updateAiTool,
  deleteAiTool,
  fetchGuides,
  createGuide,
  updateGuide,
  deleteGuide,
  reorderGuides,
  fetchRecurringWorkCompletions,
  fetchServiceCatalog,
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
  upsertProjectServiceOverride,
  updateServiceCatalogItem,
  updateTask,
} from "./api";
import {
  fetchProjectMonthlyWorks,
  fetchMonthlyWorkCompletions,
  ensureMonthlyWorksSnapshot,
  createMonthlyWork,
  updateMonthlyWork,
  deleteMonthlyWork,
  reorderMonthlyWorks,
  setMonthlyWorkDone,
  resetMonthlySnapshot,
  saveSnapshotAsTemplate,
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

/**
 * Spočíta nedokončené položky „Náplň predplatného" pre aktuálny mesiac
 * naprieč všetkými projektmi, kde je prihlásený užívateľ priradený.
 */
export function useMySubscriptionPendingTotal() {
  const { isReady, user } = useAuthReady();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["my-subscription-pending-total", userId],
    enabled: isReady && !!userId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (!userId) return { total: 0, perProject: {} as Record<string, number> };
      const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

      // Mesačný snapshot priradený mne
      const { data: snapWorks } = await supabase
        .from("project_monthly_works")
        .select("id, project_id, month_key, assignee_id")
        .eq("month_key", monthKey)
        .eq("assignee_id", userId);
      const snapIds = (snapWorks ?? []).map((w) => w.id);
      const { data: snapDone } = snapIds.length
        ? await supabase
            .from("project_monthly_work_completions")
            .select("monthly_work_id")
            .in("monthly_work_id", snapIds)
        : { data: [] as { monthly_work_id: string }[] };
      const snapDoneSet = new Set((snapDone ?? []).map((c) => c.monthly_work_id));
      const snapPendingByProject: Record<string, number> = {};
      const projectsWithSnapshot = new Set<string>();
      for (const w of snapWorks ?? []) {
        projectsWithSnapshot.add(w.project_id);
        if (!snapDoneSet.has(w.id)) {
          snapPendingByProject[w.project_id] = (snapPendingByProject[w.project_id] ?? 0) + 1;
        }
      }

      // Šablóny (recurring works) priradené mne — len pre projekty bez snapshotu
      const { data: tplWorks } = await supabase
        .from("project_recurring_works")
        .select("id, project_id, assignee_id")
        .eq("assignee_id", userId);
      const tplForProjects = (tplWorks ?? []).filter((w) => !projectsWithSnapshot.has(w.project_id));
      const tplIds = tplForProjects.map((w) => w.id);
      const { data: tplDone } = tplIds.length
        ? await supabase
            .from("project_recurring_work_completions")
            .select("work_id, month_key")
            .eq("month_key", monthKey)
            .in("work_id", tplIds)
        : { data: [] as { work_id: string; month_key: string }[] };
      const tplDoneSet = new Set((tplDone ?? []).map((c) => c.work_id));
      const tplPendingByProject: Record<string, number> = {};
      for (const w of tplForProjects) {
        if (!tplDoneSet.has(w.id)) {
          tplPendingByProject[w.project_id] = (tplPendingByProject[w.project_id] ?? 0) + 1;
        }
      }

      const perProject: Record<string, number> = { ...snapPendingByProject };
      for (const [pid, n] of Object.entries(tplPendingByProject)) {
        perProject[pid] = (perProject[pid] ?? 0) + n;
      }
      const total = Object.values(perProject).reduce((a, b) => a + b, 0);
      return { total, perProject };
    },
  });
}

const ADMIN_EMAIL = "hazucha.stano@gmail.com";
export function useIsAppAdmin() {
  const { user } = useSession();
  return !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL;
}

/**
 * Same as `useIsAppAdmin` but also exposes the auth loading state.
 * Use in pages that gate access with <Navigate /> so we don't redirect
 * on the first render (before the session is hydrated).
 */
export function useIsAppAdminStatus() {
  const { user, loading } = useSession();
  const isAdmin = !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL;
  return { isAdmin, loading };
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
  return useQuery({ queryKey: ["projects", user?.id ?? null], queryFn: fetchProjects, enabled: isReady && !!user, placeholderData: (prev) => prev });
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

  return useQuery({ queryKey: ["tasks", user?.id ?? null], queryFn: fetchTasks, enabled: isReady && !!user, placeholderData: (prev) => prev });
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

export function useReorderRecurringWorks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; position: number }[]) => reorderProjectRecurringWorks(items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["project_recurring_works", projectId] });
      const prev = qc.getQueryData<any[]>(["project_recurring_works", projectId]);
      if (prev) {
        const map = new Map(items.map((i) => [i.id, i.position]));
        const next = [...prev]
          .map((w) => ({ ...w, position: map.get(w.id) ?? w.position }))
          .sort((a, b) => a.position - b.position);
        qc.setQueryData(["project_recurring_works", projectId], next);
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["project_recurring_works", projectId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["project_recurring_works", projectId] }),
  });
}

// ---- Monthly works (snapshot na konkrétny mesiac)
export function useProjectMonthlyWorks(projectId: string | undefined, monthKey: string) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  useEffect(() => {
    if (!isReady || !user || !projectId) return;
    const channel = supabase
      .channel(`monthly-works-${projectId}-${monthKey}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_monthly_works", filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["project_monthly_works", projectId, monthKey] });
          qc.invalidateQueries({ queryKey: ["monthly_work_completions", projectId, monthKey] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_monthly_work_completions" },
        () => qc.invalidateQueries({ queryKey: ["monthly_work_completions", projectId, monthKey] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, isReady, user, projectId, monthKey]);
  return useQuery({
    queryKey: ["project_monthly_works", projectId, monthKey],
    queryFn: () => fetchProjectMonthlyWorks(projectId!, monthKey),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useMonthlyWorkCompletions(projectId: string | undefined, monthKey: string) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["monthly_work_completions", projectId, monthKey],
    queryFn: () => fetchMonthlyWorkCompletions(projectId!, monthKey),
    enabled: !!projectId && isReady && !!user,
  });
}

function invalidateMonthly(qc: ReturnType<typeof useQueryClient>, projectId: string, monthKey: string) {
  qc.invalidateQueries({ queryKey: ["project_monthly_works", projectId, monthKey] });
  qc.invalidateQueries({ queryKey: ["monthly_work_completions", projectId, monthKey] });
}

export function useEnsureMonthlySnapshot(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ensureMonthlyWorksSnapshot(projectId, monthKey),
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useCreateMonthlyWork(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; note: string | null; position: number; assignee_id?: string | null }) => {
      await ensureMonthlyWorksSnapshot(projectId, monthKey);
      return createMonthlyWork({ project_id: projectId, month_key: monthKey, ...input });
    },
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useUpdateMonthlyWork(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<{ title: string; note: string | null; assignee_id: string | null }> }) => {
      await ensureMonthlyWorksSnapshot(projectId, monthKey);
      await updateMonthlyWork(vars.id, vars.patch);
    },
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useDeleteMonthlyWork(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureMonthlyWorksSnapshot(projectId, monthKey);
      await deleteMonthlyWork(id);
    },
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useReorderMonthlyWorks(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      await ensureMonthlyWorksSnapshot(projectId, monthKey);
      await reorderMonthlyWorks(items);
    },
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useToggleMonthlyWorkDone(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { monthly_work_id: string; user_id: string; done: boolean }) => {
      await setMonthlyWorkDone(vars);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly_work_completions", projectId, monthKey] }),
  });
}

export function useResetMonthlySnapshot(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetMonthlySnapshot(projectId, monthKey),
    onSuccess: () => invalidateMonthly(qc, projectId, monthKey),
  });
}

export function useSaveSnapshotAsTemplate(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => saveSnapshotAsTemplate(projectId, monthKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_recurring_works", projectId] });
      invalidateMonthly(qc, projectId, monthKey);
    },
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
    mutationFn: async ({
      task,
      watcherIds = [],
    }: {
      task: Parameters<typeof createTask>[0];
      watcherIds?: string[];
    }) => {
      const created = await createTask(task, watcherIds);
      return created;
    },
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
      // Best-effort: delete Google event BEFORE removing the task row (we need its mapping).
      // Network/CORS errors ("Failed to fetch"), missing Google connection or temporary
      // edge-function outages must NOT block the user from deleting the task in the DB.
      try {
        await syncTaskToGoogle(id, "delete");
      } catch (err) {
        console.warn("Google delete sync failed (continuing with DB delete):", err);
      }
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
      // Best-effort Google sync — never block the bulk DB delete.
      await Promise.all(
        ids.map((id) =>
          syncTaskToGoogle(id, "delete").catch((err) => {
            console.warn("Google delete sync failed for", id, err);
          })
        )
      );
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
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    return update.mutateAsync({ id: task.id, patch: { status: next } });
  };
}

export function useToggleTaskDone() {
  const update = useUpdateTask();
  return (task: Task) => {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
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

export function useProjectMaterials(projectId: string | null | undefined) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user || !projectId) return;
    const channel = supabase
      .channel(`project-materials-${projectId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_materials", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["project_materials", projectId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, projectId, qc]);

  return useQuery({
    queryKey: ["project_materials", projectId],
    queryFn: () => fetchProjectMaterials(projectId as string),
    enabled: isReady && !!user && !!projectId,
  });
}

export function useCreateProjectMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProjectMaterial,
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["project_materials", vars.project_id] }),
  });
}

export function useDeleteProjectMaterial(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_materials", projectId] }),
  });
}

// ---- Company materials (zdieľané pre celý tím)
export function useCompanyMaterials() {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`company-materials-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_materials" },
        () => qc.invalidateQueries({ queryKey: ["company_materials"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, qc]);

  return useQuery({
    queryKey: ["company_materials"],
    queryFn: fetchCompanyMaterials,
    enabled: isReady && !!user,
  });
}

export function useCreateCompanyMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCompanyMaterial,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_materials"] }),
  });
}

export function useDeleteCompanyMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompanyMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_materials"] }),
  });
}

export function useReorderCompanyMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: { id: string; position: number }[]) =>
      reorderCompanyMaterials(updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_materials"] }),
  });
}

export function useUpdateCompanyMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        url?: string;
        label?: string | null;
        color?: string | null;
        subcategory?: string | null;
      };
    }) =>
      updateCompanyMaterial(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_materials"] }),
  });
}

// ---- AI knižnica nástrojov
export function useAiTools() {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`ai-tools-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_tools" },
        () => qc.invalidateQueries({ queryKey: ["ai_tools"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, qc]);

  return useQuery({
    queryKey: ["ai_tools"],
    queryFn: fetchAiTools,
    enabled: isReady && !!user,
  });
}

export function useCreateAiTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAiTool,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_tools"] }),
  });
}

export function useUpdateAiTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateAiTool>[1] }) =>
      updateAiTool(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_tools"] }),
  });
}

export function useDeleteAiTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAiTool(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_tools"] }),
  });
}

// ---- Knižnica návodov
export function useGuides() {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();

  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`guides-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guides" },
        () => qc.invalidateQueries({ queryKey: ["guides"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isReady, user, qc]);

  return useQuery({
    queryKey: ["guides"],
    queryFn: fetchGuides,
    enabled: isReady && !!user,
  });
}

export function useCreateGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createGuide,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useUpdateGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateGuide>[1] }) =>
      updateGuide(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useDeleteGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGuide(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useReorderGuides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; position: number }[]) => reorderGuides(items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["guides"] });
      const prev = qc.getQueryData<import("./types").Guide[]>(["guides"]);
      if (prev) {
        const map = new Map(items.map((i) => [i.id, i.position]));
        const next = prev
          .map((g) => (map.has(g.id) ? { ...g, position: map.get(g.id)! } : g))
          .sort((a, b) => {
            const ap = a.position ?? Number.POSITIVE_INFINITY;
            const bp = b.position ?? Number.POSITIVE_INFINITY;
            if (ap !== bp) return ap - bp;
            return (b.created_at ?? "").localeCompare(a.created_at ?? "");
          });
        qc.setQueryData(["guides"], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["guides"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

// ---- Service catalog (globálny cenník)
export function useServiceCatalog(includeInactive = false) {
  const qc = useQueryClient();
  const { isReady, user } = useAuthReady();
  useEffect(() => {
    if (!isReady || !user) return;
    const channel = supabase
      .channel(`service-catalog-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_catalog" }, () => {
        qc.invalidateQueries({ queryKey: ["service_catalog"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isReady, user, qc]);
  return useQuery({
    queryKey: ["service_catalog", includeInactive],
    queryFn: () => fetchServiceCatalog(includeInactive),
    enabled: isReady && !!user,
  });
}

export function useCreateServiceCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createServiceCatalogItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_catalog"] }),
  });
}

export function useUpdateServiceCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateServiceCatalogItem>[1] }) =>
      updateServiceCatalogItem(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_catalog"] }),
  });
}

export function useDeleteServiceCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteServiceCatalogItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_catalog"] }),
  });
}

// ---- Project service overrides (per-projekt prepis cien z cenníka)
export function useProjectServiceOverrides(projectId: string | undefined) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["project_service_overrides", projectId],
    queryFn: () => fetchProjectServiceOverrides(projectId!),
    enabled: !!projectId && isReady && !!user,
  });
}

export function useUpsertProjectServiceOverride(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertProjectServiceOverride,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_service_overrides", projectId] }),
  });
}

export function useDeleteProjectServiceOverride(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProjectServiceOverride,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_service_overrides", projectId] }),
  });
}

// ===== Feedback (chyby/vylepšenia) =====
import {
  fetchFeedbackReports,
  createFeedbackReport,
  setFeedbackStatus,
  deleteFeedbackReport,
  type FeedbackKind,
  type FeedbackStatus,
} from "./feedbackApi";

export function useFeedbackReports() {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["feedback_reports"],
    queryFn: fetchFeedbackReports,
    enabled: isReady && !!user,
  });
}

export function useFeedbackNewCount() {
  const { data = [] } = useFeedbackReports();
  const isAdmin = useIsAppAdmin();
  if (!isAdmin) return 0;
  return data.filter((r) => r.status === "new").length;
}

export function useCreateFeedbackReport() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (input: { kind: FeedbackKind; title: string; description: string | null }) => {
      if (!userId) throw new Error("Nie si prihlásený");
      return createFeedbackReport({ ...input, user_id: userId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_reports"] }),
  });
}

export function useSetFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: FeedbackStatus }) =>
      setFeedbackStatus(input.id, input.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_reports"] }),
  });
}

export function useDeleteFeedbackReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFeedbackReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_reports"] }),
  });
}

import {
  fetchFeedbackComments,
  createFeedbackComment,
  deleteFeedbackComment,
} from "./feedbackApi";
import {
  fetchMonthlyWorkComments,
  createMonthlyWorkComment,
  deleteMonthlyWorkComment,
  fetchMyCommentReads,
  markCommentsRead,
} from "./monthlyWorkCommentsApi";

export function useFeedbackComments(reportId: string | undefined) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["feedback_comments", reportId],
    queryFn: () => fetchFeedbackComments(reportId!),
    enabled: !!reportId && isReady && !!user,
  });
}

export function useCreateFeedbackComment(reportId: string) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (body: string) => {
      if (!userId) throw new Error("Nie si prihlásený");
      return createFeedbackComment({ report_id: reportId, user_id: userId, body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_comments", reportId] }),
  });
}

export function useDeleteFeedbackComment(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFeedbackComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_comments", reportId] }),
  });
}

// ===== Komentáre k položkám náplne predplatného =====
export function useMonthlyWorkComments(projectId: string, monthKey: string) {
  const { isReady, user } = useAuthReady();
  return useQuery({
    queryKey: ["monthly_work_comments", projectId, monthKey],
    queryFn: () => fetchMonthlyWorkComments(projectId, monthKey),
    enabled: !!projectId && !!monthKey && isReady && !!user,
  });
}

export function useCreateMonthlyWorkComment(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (input: { work_id: string; body: string }) => {
      if (!userId) throw new Error("Nie si prihlásený");
      return createMonthlyWorkComment({
        project_id: projectId,
        month_key: monthKey,
        work_id: input.work_id,
        user_id: userId,
        body: input.body,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["monthly_work_comments", projectId, monthKey] }),
  });
}

export function useDeleteMonthlyWorkComment(projectId: string, monthKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMonthlyWorkComment,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["monthly_work_comments", projectId, monthKey] }),
  });
}

export function useMyMonthlyWorkCommentReads(workIds: string[]) {
  const { isReady, user } = useAuthReady();
  const key = workIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["monthly_work_comment_reads", user?.id, key],
    queryFn: () => fetchMyCommentReads(user!.id, workIds),
    enabled: isReady && !!user && workIds.length > 0,
  });
}

export function useMarkMonthlyWorkCommentsRead() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (work_id: string) => {
      if (!userId) throw new Error("Nie si prihlásený");
      return markCommentsRead({ user_id: userId, work_id });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["monthly_work_comment_reads", userId] }),
  });
}
