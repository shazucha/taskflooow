import { useMemo, useState } from "react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { CalendarDays, MoreHorizontal, Trash2, Check, Users, Repeat, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { seriesIndex, seriesSize, getSeriesKey } from "@/lib/recurring";
import { PriorityBadge } from "./PriorityBadge";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  useCurrentUserId,
  useDeleteTask,
  useDeleteTasks,
  useProfiles,
  useProjects,
  useSetTaskWatchers,
  useSyncProjectMembers,
  useTasks,
  useTaskWatchers,
  useToggleTaskStatus,
  useUpdateTask,
} from "@/lib/queries";

interface Props {
  task: Task;
  onOpen?: (t: Task) => void;
  showProject?: boolean;
}

export function TaskCard({ task, onOpen, showProject }: Props) {
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const { data: allWatchers = [] } = useTaskWatchers();
  const { data: allTasks = [] } = useTasks();
  const toggleStatus = useToggleTaskStatus();
  const updateTask = useUpdateTask();
  const setWatchersM = useSetTaskWatchers();
  const syncProjectMembers = useSyncProjectMembers();
  const del = useDeleteTask();
  const delMany = useDeleteTasks();

  const seriesKey = useMemo(() => getSeriesKey(allTasks, task), [allTasks, task]);
  const seriesTaskIds = useMemo(() => {
    if (!seriesKey) return [] as string[];
    return allTasks
      .filter((t) => getSeriesKey(allTasks, t) === seriesKey)
      .map((t) => t.id);
  }, [allTasks, seriesKey, task.id]);

  const deleteSeries = async () => {
    if (seriesTaskIds.length === 0) return;
    if (!confirm(`Naozaj zmazať celú sériu (${seriesTaskIds.length} úloh)?`)) return;
    try {
      await delMany.mutateAsync(seriesTaskIds);
      toast.success(`Zmazaných ${seriesTaskIds.length} úloh`);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa zmazať sériu");
    }
  };

  const watcherIds = useMemo(
    () => allWatchers.filter((w) => w.task_id === task.id).map((w) => w.user_id),
    [allWatchers, task.id]
  );

  // Poradie vybraných: prvý = hlavný (assignee), ďalší = watchers
  const initialSelected = useMemo(() => {
    const arr: string[] = [];
    if (task.assignee_id) arr.push(task.assignee_id);
    watcherIds.forEach((id) => {
      if (!arr.includes(id)) arr.push(id);
    });
    return arr;
  }, [task.assignee_id, watcherIds]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialSelected);

  // Sync keď sa otvorí menu / zmenia sa dáta
  const openChange = (v: boolean) => {
    if (v) setSelected(initialSelected);
    setMenuOpen(v);
  };

  const toggleUser = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const saveAssignment = async () => {
    try {
      const newAssignee = selected[0] ?? task.created_by;
      const newWatchers = selected.slice(1).filter((id) => id !== newAssignee);
      const sameWatchers =
        newWatchers.length === watcherIds.length &&
        newWatchers.every((id) => watcherIds.includes(id));
      if (task.project_id) {
        await syncProjectMembers.mutateAsync({
          projectId: task.project_id,
          userIds: [task.created_by, currentUserId, newAssignee, ...newWatchers].filter(
            (value): value is string => !!value
          ),
        });
      }
      if (newAssignee !== task.assignee_id) {
        await updateTask.mutateAsync({ id: task.id, patch: { assignee_id: newAssignee } });
      }
      if (!sameWatchers) {
        await setWatchersM.mutateAsync({ taskId: task.id, userIds: newWatchers });
      }
      if (newAssignee !== task.assignee_id || !sameWatchers) {
        toast.success("Priradenie uložené");
      }
      setMenuOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

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
          aria-label={done ? "Označiť ako nedokončené" : "Označiť ako dokončené"}
          title={done ? "Klikni pre vrátenie na nedokončené" : "Označiť ako dokončené"}
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
            {(() => {
              const size = seriesSize(allTasks, task);
              if (size < 2) return null;
              const idx = seriesIndex(allTasks, task);
              return (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  title="Opakovaná úloha"
                >
                  <Repeat className="h-3 w-3" />
                  {idx}/{size}
                </span>
              );
            })()}
          </div>
        </button>

        <div className="flex flex-col items-end gap-2">
          <DropdownMenu open={menuOpen} onOpenChange={openChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" /> Komu úloha patrí
              </DropdownMenuLabel>
              <p className="px-2 pb-1 text-[10px] text-muted-foreground">
                1. zaškrtnutý = hlavný zodpovedný
              </p>
              <div className="max-h-64 overflow-y-auto px-1">
                {profiles.map((p) => {
                  const idx = selected.indexOf(p.id);
                  const active = idx !== -1;
                  const isPrimary = idx === 0;
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition",
                        active ? "bg-primary/10" : "hover:bg-surface-muted"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={() => toggleUser(p.id)}
                      />
                      <UserAvatar profile={p} size="sm" />
                      <span className="flex-1 truncate">{p.full_name ?? p.email}</span>
                      {isPrimary && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                          Hlavný
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="px-2 py-1.5">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={saveAssignment}
                  disabled={updateTask.isPending || setWatchersM.isPending || syncProjectMembers.isPending}
                >
                  Uložiť priradenie
                </Button>
              </div>
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
                <div key={v.id} className="rounded-full ring-2 ring-card">
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
