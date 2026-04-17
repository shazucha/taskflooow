import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { cn } from "@/lib/utils";
import type { Priority } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";

type Filter = "all" | Priority | "mine";

export default function Tasks() {
  const tasks = useApp((s) => s.tasks);
  const currentUserId = useApp((s) => s.currentUserId);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const base = tasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 } as const;
        return order[a.priority] - order[b.priority];
      });
    if (filter === "all") return base;
    if (filter === "mine") return base.filter((t) => t.assignee_id === currentUserId);
    return base.filter((t) => t.priority === filter);
  }, [tasks, filter, currentUserId]);

  const chips: { id: Filter; label: string; cls?: string }[] = [
    { id: "all", label: "Všetko" },
    { id: "mine", label: "Moje" },
    { id: "high", label: PRIORITY_META.high.label, cls: "data-[active=true]:bg-priority-high-soft data-[active=true]:text-priority-high" },
    { id: "medium", label: PRIORITY_META.medium.label, cls: "data-[active=true]:bg-priority-medium-soft data-[active=true]:text-priority-medium" },
    { id: "low", label: PRIORITY_META.low.label, cls: "data-[active=true]:bg-priority-low-soft data-[active=true]:text-priority-low" },
  ];

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Úlohy</h1>
        <NewTaskDialog />
      </header>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          filtered.map((t) => <TaskCard key={t.id} task={t} showProject />)
        )}
      </div>
    </div>
  );
}
