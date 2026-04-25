import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useCreateMonthlyBonus,
  useCurrentUserId,
  useDeleteMonthlyBonus,
  useProjectMonthlyBonuses,
  useUpdateMonthlyBonus,
} from "@/lib/queries";
import { NewTaskDialog } from "./NewTaskDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";

interface Props {
  projectId: string;
}

export function MonthlyBonusesCard({ projectId }: Props) {
  const userId = useCurrentUserId();
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const { data: bonuses = [], isLoading } = useProjectMonthlyBonuses(projectId, monthKey);
  const create = useCreateMonthlyBonus(projectId);
  const update = useUpdateMonthlyBonus(projectId);
  const remove = useDeleteMonthlyBonus(projectId);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const { doneCount, total } = useMemo(
    () => ({ doneCount: bonuses.filter((b) => b.done).length, total: bonuses.length }),
    [bonuses]
  );

  const submit = async () => {
    if (!title.trim() || !userId) return;
    try {
      await create.mutateAsync({
        project_id: projectId,
        month_key: monthKey,
        title: title.trim(),
        note: note.trim() || null,
        position: bonuses.length,
        created_by: userId,
      });
      setTitle("");
      setNote("");
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const onBonusClick = (name: string) => {
    setTaskTitle(name);
    setTaskOpen(true);
  };

  const toggleDone = (id: string, done: boolean) => {
    update.mutate({
      id,
      patch: {
        done: !done,
        done_by: !done ? userId : null,
        done_at: !done ? new Date().toISOString() : null,
      },
    });
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> Bonusy v rámci predplatného
        </h2>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Pridať
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold capitalize">
          {formatMonthLabel(monthKey)}
          {total > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              · {doneCount}/{total} hotových
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Nasledujúci mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Bonusy sa ukladajú iba pre tento mesiac — nezdedia sa do ďalších.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam...</p>
      ) : bonuses.length === 0 && !adding ? (
        <p className="rounded-xl bg-surface-muted p-4 text-center text-xs text-muted-foreground">
          V tomto mesiaci žiadne bonusy. Klikni „Pridať".
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bonuses.map((b) => (
            <li
              key={b.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl border px-2 py-2 transition",
                b.done
                  ? "border-success/30 bg-success/5"
                  : "border-border bg-surface-muted/40 hover:border-primary/40"
              )}
            >
              <button
                type="button"
                disabled={!userId || update.isPending}
                onClick={() => toggleDone(b.id, b.done)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                  b.done
                    ? "border-success bg-success text-success-foreground"
                    : "border-border bg-card hover:border-primary"
                )}
                aria-label={b.done ? "Označiť ako nehotové" : "Označiť ako hotové"}
              >
                {b.done && <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => onBonusClick(b.title)}
                className={cn(
                  "min-w-0 flex-1 text-left text-sm transition",
                  b.done ? "text-muted-foreground line-through" : "text-foreground hover:text-primary"
                )}
                title={b.note ?? `Vytvoriť úlohu: ${b.title}`}
              >
                <span className="truncate block">{b.title}</span>
                {b.note && (
                  <span className="block truncate text-[11px] text-muted-foreground">{b.note}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Odstrániť „${b.title}" z bonusov?`)) {
                    remove.mutate(b.id);
                  }
                }}
                className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Odstrániť"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3">
          <div className="space-y-1">
            <Label htmlFor="mb-title" className="text-xs">Názov bonusu</Label>
            <Input
              id="mb-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. extra reels, mimoriadny newsletter…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setTitle(""); setNote(""); }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mb-note" className="text-xs">Poznámka (voliteľné)</Label>
            <Textarea
              id="mb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Detail / rozsah"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTitle(""); setNote(""); }}>
              Zrušiť
            </Button>
            <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Pridávam..." : "Pridať"}
            </Button>
          </div>
        </div>
      )}

      <NewTaskDialog
        hideTrigger
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultProjectId={projectId}
        defaultTitle={taskTitle}
      />
    </div>
  );
}