import { useMemo } from "react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { CalendarDays, MoreHorizontal, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { PriorityBadge } from "./PriorityBadge";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDelegateTask,
  useDeleteTask,
  useProfiles,
  useProjects,
  useTaskWatchers,
  useToggleTaskStatus,
} from "@/lib/queries";

interface Props {
  task: Task;
  onOpen?: (t: Task) => void;
  showProject?: boolean;
}

export function TaskCard({ task, onOpen, showProject }: Props) {
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const { data: allWatchers = [] } = useTaskWatchers();
  const toggleStatus = useToggleTaskStatus();
  const delegate = useDelegateTask();
  const del = useDeleteTask();

  const assignee = useMemo(
    () => profiles.find((p) => p.id === task.assignee_id),
    [profiles, task.assignee_id]
  );
  const project = useMemo(
    () => projects.find((p) => p.id === task.project_id),
    [projects, task.project_id]
  );
  const viewers = useMemo(() => {
    const ids = new Set<string>();
    ids.add(task.created_by);
    if (task.assignee_id) ids.add(task.assignee_id);
    allWatchers.filter((w) => w.task_id === task.id).forEach((w) => ids.add(w.user_id));
    return Array.from(ids)
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [profiles, allWatchers, task.id, task.created_by, task.assignee_id]);
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "card-elevated p-3.5 transition-all active:scale-[0.99]",
        done && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => toggleStatus(task)}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
            done
              ? "border-success bg-success text-white"
              : "border-border hover:border-primary"
          )}
          aria-label="Označiť stav"
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>

        <button onClick={() => onOpen?.(task)} className="min-w-0 flex-1 text-left">
          <h3
            className={cn(
              "text-[15px] font-semibold leading-snug text-foreground",
              done && "line-through"
            )}
          >
            {task.title}
          </h3>
          {showProject && project && (
            <p className="mt-0.5 text-xs text-muted-foreground">{project.name}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            {task.due_date && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {format(new Date(task.due_date), "d. MMM", { locale: sk })}
              </span>
            )}
          </div>
        </button>

        <div className="flex flex-col items-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">Predať úlohu</DropdownMenuLabel>
              {profiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => delegate(task.id, p.id)}
                  className="gap-2"
                >
                  <UserAvatar profile={p} size="sm" />
                  <span className="flex-1 truncate">{p.full_name}</span>
                  {task.assignee_id === p.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => del.mutate(task.id)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Vymazať
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {viewers.length > 0 && (
            <div
              className="flex -space-x-1.5"
              title={`Pracujú na tom: ${viewers.map((v) => v.full_name ?? v.email).join(", ")}`}
            >
              {viewers.slice(0, 4).map((v) => (
                <div key={v.id} className="ring-2 ring-card rounded-full">
                  <UserAvatar profile={v} size="sm" />
                </div>
              ))}
              {viewers.length > 4 && (
                <div className="z-10 flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                  +{viewers.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
