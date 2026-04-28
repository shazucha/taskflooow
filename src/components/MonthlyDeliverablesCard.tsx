import { useMemo, useState } from "react";
import { CalendarCheck2, Check, ChevronLeft, ChevronRight, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateRecurringWork,
  useCurrentUserId,
  useDeleteRecurringWork,
  useProjectRecurringWorks,
  useRecurringWorkCompletions,
  useReorderRecurringWorks,
  useToggleRecurringWorkDone,
} from "@/lib/queries";
import { NewTaskDialog } from "./NewTaskDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectRecurringWork } from "@/lib/types";

interface Props {
  projectId: string;
}

function SortableRow({
  work,
  done,
  onToggle,
  onOpen,
  onDelete,
  toggleDisabled,
}: {
  work: ProjectRecurringWork;
  done: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
  toggleDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: work.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-2 py-2 transition",
        done
          ? "border-success/30 bg-success/5"
          : "border-border bg-surface-muted/40 hover:border-primary/40",
        isDragging && "shadow-lg ring-2 ring-primary/40"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        aria-label="Presunúť"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={toggleDisabled}
        onClick={onToggle}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
          done
            ? "border-success bg-success text-success-foreground"
            : "border-border bg-card hover:border-primary"
        )}
        aria-label={done ? "Označiť ako nehotové" : "Označiť ako hotové"}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 text-left text-sm transition",
          done ? "text-muted-foreground line-through" : "text-foreground hover:text-primary"
        )}
        title={work.note ?? `Vytvoriť úlohu: ${work.title}`}
      >
        <span className="truncate block">{work.title}</span>
        {work.note && (
          <span className="block truncate text-[11px] text-muted-foreground">{work.note}</span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Možnosti úlohy"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" /> Odstrániť
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function MonthlyDeliverablesCard({ projectId }: Props) {
  const userId = useCurrentUserId();
  const { data: works = [], isLoading } = useProjectRecurringWorks(projectId);
  const { data: completions = [] } = useRecurringWorkCompletions(projectId);
  const create = useCreateRecurringWork(projectId);
  const remove = useDeleteRecurringWork(projectId);
  const toggle = useToggleRecurringWorkDone(projectId);
  const reorder = useReorderRecurringWorks(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const doneSet = useMemo(
    () => new Set(completions.filter((c) => c.month_key === monthKey).map((c) => c.work_id)),
    [completions, monthKey]
  );

  const doneCount = doneSet.size;
  const total = works.length;

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        project_id: projectId,
        title: title.trim(),
        note: note.trim() || null,
        position: works.length,
      });
      setTitle("");
      setNote("");
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const onWorkClick = (name: string) => {
    setTaskTitle(name);
    setTaskOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = works.findIndex((w) => w.id === active.id);
    const newIndex = works.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(works, oldIndex, newIndex);
    reorder.mutate(next.map((w, i) => ({ id: w.id, position: i })));
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck2 className="h-4 w-4" /> Náplň predplatného
        </h2>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Pridať
          </Button>
        )}
      </div>

      {/* Month switcher */}
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
        Klik na názov → vytvorí úlohu. Odškrtnutím označíš prácu za hotovú v tomto mesiaci.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam...</p>
      ) : works.length === 0 && !adding ? (
        <p className="rounded-xl bg-surface-muted p-4 text-center text-xs text-muted-foreground">
          Zatiaľ žiadne práce. Klikni „Pridať".
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={works.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {works.map((w) => (
                <SortableRow
                  key={w.id}
                  work={w}
                  done={doneSet.has(w.id)}
                  onToggle={() =>
                    userId &&
                    toggle.mutate({
                      work_id: w.id,
                      month_key: monthKey,
                      user_id: userId,
                      done: !doneSet.has(w.id),
                    })
                  }
                  onOpen={() => onWorkClick(w.title)}
                  onDelete={() => {
                    if (confirm(`Odstrániť "${w.title}" zo zoznamu?`)) remove.mutate(w.id);
                  }}
                  toggleDisabled={!userId || toggle.isPending}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3">
          <div className="space-y-1">
            <Label htmlFor="rw-title" className="text-xs">Názov práce</Label>
            <Input
              id="rw-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. 8 príspevkov na FB, 1 newsletter…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setTitle(""); setNote(""); }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rw-note" className="text-xs">Poznámka (voliteľné)</Label>
            <Textarea
              id="rw-note"
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
