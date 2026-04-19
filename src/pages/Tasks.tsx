import { useMemo, useState } from "react";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { MonthFilter } from "@/components/MonthFilter";
import { cn } from "@/lib/utils";
import type { Priority, Task } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { filterTasksByMonth, currentMonthKey } from "@/lib/recurring";
import { useCurrentUserId, useTasks } from "@/lib/queries";

type Filter = "all" | Priority | "mine";

export default function Tasks() {
  const { data: tasks = [] } = useTasks();
  const currentUserId = useCurrentUserId();
  const [filter, setFilter] = useState<Filter>("all");
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey());
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const filtered = useMemo(() => {
    const monthScoped = filterTasksByMonth(tasks, monthKey);
    const base = monthScoped
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 } as const;
        return order[a.priority] - order[b.priority];
      });
    if (filter === "all") return base;
    if (filter === "mine") return base.filter((t) => t.assignee_id === currentUserId);
    return base.filter((t) => t.priority === filter);
  }, [tasks, filter, currentUserId, monthKey]);

  const chips: { id: Filter; label: string; cls?: string }[] = [
    { id: "all", label: "Všetko" },
    { id: "mine", label: "Moje" },
    { id: "high", label: PRIORITY_META.high.label, cls: "data-[active=true]:bg-priority-high-soft data-[active=true]:text-priority-high" },
    { id: "medium", label: PRIORITY_META.medium.label, cls: "data-[active=true]:bg-priority-medium-soft data-[active=true]:text-priority-medium" },
    { id: "low", label: PRIORITY_META.low.label, cls: "data-[active=true]:bg-priority-low-soft data-[active=true]:text-priority-low" },
  ];

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Úlohy</h1>
        <NewTaskDialog />
      </header>

      <div className="mt-4">
        <MonthFilter value={monthKey} onChange={setMonthKey} />
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => (
          <button
            key={c.id}
            data-active={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              "bg-surface-muted text-muted-foreground data-[active=true]:bg-foreground data-[active=true]:text-background",
              c.cls
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Žiadne úlohy v tomto filtri.
          </p>
        ) : (
          filtered.map((t) => <TaskCard key={t.id} task={t} showProject onOpen={setOpenTask} />)
        )}
      </div>
      <TaskDetailDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </div>
  );
}
