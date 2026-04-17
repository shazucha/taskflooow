import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import {
  createProject,
  createTask,
  deleteTask,
  fetchProfiles,
  fetchProjects,
  fetchTasks,
  updateProfile,
  updateTask,
} from "./api";
import type { Profile, Task, TaskStatus } from "./types";
import { useSession } from "./useSession";

export function useCurrentUserId() {
  const { user } = useSession();
  return user?.id ?? null;
}

export function useProfiles() {
  return useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
}

export function useTasks() {
  const qc = useQueryClient();

  // Realtime — refresh on any change
  useEffect(() => {
    const channel = supabase
      .channel("tasks-realtime")
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
  }, [qc]);

  return useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) => updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
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
