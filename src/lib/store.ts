import { create } from "zustand";
import type { Project, Task, Profile, Priority, TaskStatus } from "./types";
import { mockProfiles, mockProjects, mockTasks } from "./mock-data";

interface AppState {
  profiles: Profile[];
  projects: Project[];
  tasks: Task[];
  currentUserId: string;
  addProject: (p: Omit<Project, "id" | "created_at">) => void;
  addTask: (t: Omit<Task, "id" | "created_at" | "updated_at">) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  delegateTask: (id: string, assigneeId: string) => void;
  toggleTaskStatus: (id: string) => void;
  deleteTask: (id: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useApp = create<AppState>((set) => ({
  profiles: mockProfiles,
  projects: mockProjects,
  tasks: mockTasks,
  currentUserId: "u1",
  addProject: (p) =>
    set((s) => ({
      projects: [
        { ...p, id: uid(), created_at: new Date().toISOString() },
        ...s.projects,
      ],
    })),
  addTask: (t) =>
    set((s) => ({
      tasks: [
        {
          ...t,
          id: uid(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...s.tasks,
      ],
    })),
  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t
      ),
    })),
  delegateTask: (id, assigneeId) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, assignee_id: assigneeId, updated_at: new Date().toISOString() } : t
      ),
    })),
  toggleTaskStatus: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const next: TaskStatus =
          t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "todo";
        return { ...t, status: next, updated_at: new Date().toISOString() };
      }),
    })),
  deleteTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
