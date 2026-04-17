import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";
import {
  useCurrentUserId,
  useProfiles,
  useSetTaskWatchers,
  useTaskWatchers,
} from "@/lib/queries";
import { toast } from "sonner";

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: allWatchers = [] } = useTaskWatchers();
  const setWatchers = useSetTaskWatchers();

  const initial = useMemo(
    () => (task ? allWatchers.filter((w) => w.task_id === task.id).map((w) => w.user_id) : []),
    [allWatchers, task]
  );
  const [selected, setSelected] = useState<string[]>(initial);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  if (!task) return null;

  const isCreator = task.created_by === currentUserId;
  const available = profiles.filter(
    (p) => p.id !== task.created_by && p.id !== task.assignee_id
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const dirty =
    selected.length !== initial.length || selected.some((id) => !initial.includes(id));

  const save = async () => {
    try {
      await setWatchers.mutateAsync({ taskId: task.id, userIds: selected });
      toast.success("Uložené");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

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
            <Eye className="h-3.5 w-3.5" /> Komu sa úloha zobrazuje
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Zadávateľ a priradený vidia úlohu vždy. Tu pridaj ďalších členov.
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
              Watchers môže meniť iba zadávateľ úlohy.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zavrieť
          </Button>
          {isCreator && (
            <Button onClick={save} disabled={!dirty || setWatchers.isPending}>
              {setWatchers.isPending ? "Ukladám..." : "Uložiť"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
