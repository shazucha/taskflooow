import { useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Users } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Priority, Task, TaskStatus } from "@/lib/types";
import { PRIORITY_META, STATUS_LABEL } from "@/lib/types";
import {
  useCurrentUserId,
  useProfiles,
  useProjects,
  useSetTaskWatchers,
  useSyncProjectMembers,
  useTaskWatchers,
  useUpdateTask,
} from "@/lib/queries";
import { toast } from "sonner";
import { TaskActivityList } from "./TaskActivityList";
import { TaskMaterialsList } from "./TaskMaterialsList";
import { GoogleReconnectRequiredError, syncTaskToGoogle } from "@/lib/googleCalendar";

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const EMPTY_IDS: string[] = [];

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function splitISO(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time: time === "00:00" ? "" : time };
}

export function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const { data: allWatchers = [] } = useTaskWatchers();
  const setWatchers = useSetTaskWatchers();
  const updateTask = useUpdateTask();
  const syncProjectMembers = useSyncProjectMembers();

  const initialWatchers = useMemo(
    () => (task ? allWatchers.filter((w) => w.task_id === task.id).map((w) => w.user_id) : EMPTY_IDS),
    [allWatchers, task]
  );
  const initialWatchersKey = initialWatchers.join("|");
  const [selected, setSelected] = useState<string[]>(initialWatchers);

  // Základné polia
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [projectId, setProjectId] = useState<string>(task?.project_id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");

  // Termín
  const initialStart = useMemo(() => splitISO(task?.due_date ?? null), [task?.due_date]);
  const initialEnd = useMemo(() => splitISO(task?.due_end ?? null), [task?.due_end]);
  const [dueDate, setDueDate] = useState(initialStart.date);
  const [dueTime, setDueTime] = useState(initialStart.time);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    setSelected((prev) => (sameIds(prev, initialWatchers) ? prev : initialWatchers));
  }, [task?.id, initialWatchersKey]);

  // Reset form fields ONLY when the opened task identity changes.
  // Including the whole `task` object or memoized derivatives in deps caused
  // an infinite re-render loop because `useTasks` returns a fresh array on
  // every realtime invalidation (new object identity for the same task).
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setProjectId(task.project_id ?? "");
    setStatus(task.status);
    const s = splitISO(task.due_date ?? null);
    const e = splitISO(task.due_end ?? null);
    setDueDate(s.date);
    setDueTime(s.time);
    setEndTime(e.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  const isCreator = task.created_by === currentUserId;
  const canEdit = isCreator || task.assignee_id === currentUserId;
  const available = profiles.filter(
    (p) => p.id !== task.created_by && p.id !== task.assignee_id
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const watchersDirty =
    selected.length !== initialWatchers.length ||
    selected.some((id) => !initialWatchers.includes(id));

  const dueDirty =
    dueDate !== initialStart.date ||
    dueTime !== initialStart.time ||
    endTime !== initialEnd.time;

  const fieldsDirty =
    title.trim() !== task.title ||
    (description.trim() || "") !== (task.description ?? "") ||
    priority !== task.priority ||
    status !== task.status ||
    (projectId || "") !== (task.project_id ?? "");

  const dirty = watchersDirty || dueDirty || fieldsDirty;

  const save = async () => {
    if (isCreator && !title.trim()) {
      toast.error("Názov nemôže byť prázdny");
      return;
    }
    try {
      const patch: Partial<Task> = {};
      if (fieldsDirty) {
        patch.title = title.trim();
        patch.description = description.trim() || null;
        patch.priority = priority;
        patch.status = status;
        patch.project_id = projectId || null;
      }
      if (dueDirty) {
        let due_date: string | null = null;
        let due_end: string | null = null;
        if (dueDate) {
          const start = new Date(`${dueDate}T${dueTime || "00:00"}:00`);
          due_date = start.toISOString();
          if (dueTime && endTime && endTime > dueTime) {
            const end = new Date(`${dueDate}T${endTime}:00`);
            due_end = end.toISOString();
          }
        }
        patch.due_date = due_date;
        patch.due_end = due_end;
      }

      if ((projectId || "") !== (task.project_id ?? "") && projectId) {
        await syncProjectMembers.mutateAsync({
          projectId,
          userIds: [task.created_by, currentUserId, task.assignee_id, ...selected].filter(
            (x): x is string => !!x
          ),
        });
      }

      if (Object.keys(patch).length) {
        await updateTask.mutateAsync({ id: task.id, patch });
      }

      if (watchersDirty) {
        await setWatchers.mutateAsync({ taskId: task.id, userIds: selected });
      }

      toast.success("Uložené");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const saving = setWatchers.isPending || updateTask.isPending || syncProjectMembers.isPending;
  const disabled = !isCreator;
  const statusDisabled = !canEdit;

  const hasTime = (() => {
    if (!task.due_date) return false;
    const d = new Date(task.due_date);
    return d.getHours() !== 0 || d.getMinutes() !== 0;
  })();

  const handleResync = async () => {
    setResyncing(true);
    try {
      const result = await syncTaskToGoogle(task.id, "upsert");
      if (result.skipped === "special_event_conflict") {
        toast.message("Stará blokovaná Google udalosť bola odpojená, skúste synchronizáciu ešte raz");
      } else {
        toast.success("Znovu odoslané do Google kalendára");
      }
    } catch (e: any) {
      if (e instanceof GoogleReconnectRequiredError) {
        toast.error("Google kalendár treba znova pripojiť");
        return;
      }
      toast.error(e?.message ?? "Synchronizácia zlyhala");
    } finally {
      setResyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail úlohy</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Názov</Label>
            <Input
              id="t-title"
              value={title}
              disabled={disabled}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Popis</Label>
            <Textarea
              id="t-desc"
              value={description}
              readOnly={disabled}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={disabled ? "Bez popisu" : "Voliteľné"}
              className={cn(
                "whitespace-pre-wrap",
                disabled && "bg-surface-muted/60 cursor-text focus-visible:ring-1"
              )}
            />
          </div>

          <div className="pt-1">
            <TaskMaterialsList taskId={task.id} taskCreatorId={task.created_by} />
          </div>

          <div className="space-y-1.5">
            <Label>Priorita</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                const meta = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPriority(p)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all",
                      active
                        ? `${meta.soft} ${meta.text} border-transparent ring-2 ${meta.ring}`
                        : "bg-surface-muted text-muted-foreground border-transparent hover:text-foreground",
                      disabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <span className={cn("priority-dot", meta.dot)} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Stav</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["todo", "done"] as TaskStatus[]).map((s) => {
                // "in_progress" sa v UI správa ako "todo" (nedokončená)
                const active = s === "done" ? status === "done" : status !== "done";
                const styles: Record<"todo" | "done", string> = {
                  todo: "bg-surface-muted text-foreground ring-border",
                  done: "bg-success/15 text-success ring-success/30",
                };
                const label = s === "done" ? "Dokončená" : "Nedokončená";
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={statusDisabled}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-xl border py-2 text-xs font-semibold transition-all",
                      active
                        ? `${styles[s as "todo" | "done"]} border-transparent ring-2`
                        : "bg-surface-muted text-muted-foreground border-transparent hover:text-foreground",
                      statusDisabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Projekt</Label>
            <Select
              value={projectId || "none"}
              disabled={disabled}
              onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Bez projektu" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Bez projektu</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Termín
            </Label>
            <Input
              type="date"
              value={dueDate}
              disabled={disabled}
              onChange={(e) => {
                setDueDate(e.target.value);
                if (!e.target.value) {
                  setDueTime("");
                  setEndTime("");
                }
              }}
            />
            {dueDate && (
              <>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => { setDueTime(""); setEndTime(""); }}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                      !dueTime
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                      disabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    Celý deň
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => { if (!dueTime) setDueTime("09:00"); }}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                      dueTime
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                      disabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    Konkrétny čas
                  </button>
                </div>
                {dueTime && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Začiatok</Label>
                      <Select
                        value={dueTime}
                        disabled={disabled}
                        onValueChange={(v) => {
                          setDueTime(v);
                          if (endTime && endTime <= v) setEndTime("");
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {HALF_HOUR_SLOTS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Koniec</Label>
                      <Select
                        value={endTime || "none"}
                        disabled={disabled}
                        onValueChange={(v) => setEndTime(v === "none" ? "" : v)}
                      >
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="none">— bez konca —</SelectItem>
                          {HALF_HOUR_SLOTS.filter((s) => s > dueTime).map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Spolupracovníci
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Zadávateľ a priradený majú prístup vždy. Tu pridaj ďalších.
            </p>

            {available.length === 0 ? (
              <p className="text-xs text-muted-foreground">Žiadni ďalší členovia.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((p) => {
                  const active = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                        disabled && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {active && "✓ "}
                      {p.full_name ?? p.email}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!isCreator && (
            <p className="text-[11px] text-muted-foreground">
              Názov, popis, prioritu, projekt a spolupracovníkov môže meniť iba zadávateľ. Stav môže meniť aj priradený.
            </p>
          )}

          <div className="pt-2 border-t border-border/60">
            <TaskActivityList taskId={task.id} />
          </div>
        </div>

        <DialogFooter>
          {canEdit && hasTime && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResync}
              disabled={resyncing || dirty}
              title={dirty ? "Najprv ulož zmeny" : "Znovu odoslať do Google kalendára"}
              className="mr-auto"
            >
              <RefreshCw className={cn("h-4 w-4", resyncing && "animate-spin")} />
              {resyncing ? "Synchronizujem..." : "Znovu synchronizovať"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zavrieť
          </Button>
          {canEdit && (
            <Button onClick={save} disabled={!dirty || saving || (isCreator && !title.trim())}>
              {saving ? "Ukladám..." : "Uložiť"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
