import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import {
  useCurrentUserId,
  useProfiles,
  useSetTaskWatchers,
  useTaskWatchers,
  useUpdateTask,
} from "@/lib/queries";
import { toast } from "sonner";

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

// Z ISO stringu vytiahne lokálny dátum (YYYY-MM-DD) a čas (HH:mm)
function splitISO(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // Ak je čas 00:00, považujeme za "celý deň"
  return { date, time: time === "00:00" ? "" : time };
}

export function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: allWatchers = [] } = useTaskWatchers();
  const setWatchers = useSetTaskWatchers();
  const updateTask = useUpdateTask();

  const initial = useMemo(
    () => (task ? allWatchers.filter((w) => w.task_id === task.id).map((w) => w.user_id) : []),
    [allWatchers, task]
  );
  const [selected, setSelected] = useState<string[]>(initial);

  // Termín
  const initialStart = useMemo(() => splitISO(task?.due_date ?? null), [task?.due_date]);
  const initialEnd = useMemo(() => splitISO(task?.due_end ?? null), [task?.due_end]);
  const [dueDate, setDueDate] = useState(initialStart.date);
  const [dueTime, setDueTime] = useState(initialStart.time);
  const [endTime, setEndTime] = useState(initialEnd.time);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  useEffect(() => {
    setDueDate(initialStart.date);
    setDueTime(initialStart.time);
    setEndTime(initialEnd.time);
  }, [initialStart.date, initialStart.time, initialEnd.time]);

  if (!task) return null;

  const isCreator = task.created_by === currentUserId;
  const available = profiles.filter(
    (p) => p.id !== task.created_by && p.id !== task.assignee_id
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const watchersDirty =
    selected.length !== initial.length || selected.some((id) => !initial.includes(id));

  const dueDirty =
    dueDate !== initialStart.date ||
    dueTime !== initialStart.time ||
    endTime !== initialEnd.time;

  const dirty = watchersDirty || dueDirty;

  const save = async () => {
    try {
      const promises: Promise<unknown>[] = [];

      if (watchersDirty) {
        promises.push(setWatchers.mutateAsync({ taskId: task.id, userIds: selected }));
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
        promises.push(
          updateTask.mutateAsync({ id: task.id, patch: { due_date, due_end } })
        );
      }

      await Promise.all(promises);
      toast.success("Uložené");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const saving = setWatchers.isPending || updateTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{task.title}</DialogTitle>
        </DialogHeader>

        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
        )}

        <div className="space-y-2 pt-2">
          <Label className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Termín
          </Label>
          <Input
            type="date"
            value={dueDate}
            disabled={!isCreator}
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
                  disabled={!isCreator}
                  onClick={() => { setDueTime(""); setEndTime(""); }}
                  className={cn(
                    "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    !dueTime
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                    !isCreator && "opacity-60 cursor-not-allowed"
                  )}
                >
                  Celý deň
                </button>
                <button
                  type="button"
                  disabled={!isCreator}
                  onClick={() => { if (!dueTime) setDueTime("09:00"); }}
                  className={cn(
                    "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    dueTime
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                    !isCreator && "opacity-60 cursor-not-allowed"
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
                      disabled={!isCreator}
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
                      disabled={!isCreator}
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
          {!isCreator && (
            <p className="text-[11px] text-muted-foreground">
              Termín môže meniť iba zadávateľ úlohy.
            </p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <Label className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Spolupracovníci
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Zadávateľ a priradený majú prístup vždy. Tu pridaj ďalších, ktorí na úlohe môžu pracovať.
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
                    disabled={!isCreator}
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground hover:text-foreground",
                      !isCreator && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {active && "✓ "}
                    {p.full_name ?? p.email}
                  </button>
                );
              })}
            </div>
          )}
          {!isCreator && (
            <p className="text-[11px] text-muted-foreground">
              Spolupracovníkov môže meniť iba zadávateľ úlohy.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zavrieť
          </Button>
          {isCreator && (
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Ukladám..." : "Uložiť"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
