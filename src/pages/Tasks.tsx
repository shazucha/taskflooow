import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { MonthFilter } from "@/components/MonthFilter";
import { cn } from "@/lib/utils";
import type { Priority, Task } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { filterTasksByMonth, currentMonthKey } from "@/lib/recurring";
import { useCurrentUserId, useTasks } from "@/lib/queries";
import { formatLocalDayHeader, isSameLocalDay, localDayKey, localTodayTomorrow, startOfLocalDay } from "@/lib/dayLabels";

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

  const groupByDate = (list: Task[]) => {
    const withDate: Task[] = [];
    const noDate: Task[] = [];
    for (const t of list) {
      if (t.due_date) withDate.push(t);
      else noDate.push(t);
    }
    withDate.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
    const map = new Map<string, { date: Date; tasks: Task[] }>();
    for (const t of withDate) {
      const d = new Date(t.due_date!);
      const key = localDayKey(d);
      const existing = map.get(key);
      if (existing) existing.tasks.push(t);
      else map.set(key, { date: startOfLocalDay(d), tasks: [t] });
    }
    return { groups: Array.from(map.values()), noDate };
  };

  const { today } = localTodayTomorrow();
  const { groups, noDate } = useMemo(() => groupByDate(filtered), [filtered]);
  const todayGroups = groups.filter((g) => isSameLocalDay(g.date, today));
  const otherGroups = groups.filter((g) => !isSameLocalDay(g.date, today));
  // najbližší budúci deň otvoríme automaticky, ak dnes nič nie je
  const upcoming = otherGroups.find((g) => g.date.getTime() >= today.getTime());
  const orderedGroups = [...todayGroups, ...otherGroups];
  const todayStart = today;

  const chips: { id: Filter; label: string; cls?: string }[] = [
    { id: "all", label: "Všetko" },
    { id: "mine", label: "Moje" },
    { id: "high", label: PRIORITY_META.high.label, cls: "data-[active=true]:bg-priority-high-soft data-[active=true]:text-priority-high" },
    { id: "medium", label: PRIORITY_META.medium.label, cls: "data-[active=true]:bg-priority-medium-soft data-[active=true]:text-priority-medium" },
    { id: "low", label: PRIORITY_META.low.label, cls: "data-[active=true]:bg-priority-low-soft data-[active=true]:text-priority-low" },
  ];

  return (
    <div className="page-container">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Úlohy</h1>
        <NewTaskDialog />
      </header>

      <div className="mt-4">
        <MonthFilter value={monthKey} onChange={setMonthKey} />
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
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

      <div className="mt-5 space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Žiadne úlohy v tomto filtri.
          </p>
        ) : (
          <>
            {orderedGroups.map((g) => {
              const isToday = isSameLocalDay(g.date, today);
              const overdue = g.date.getTime() < todayStart.getTime();
              const defaultOpen = isToday || overdue || (todayGroups.length === 0 && upcoming === g);
              return (
                <Collapsible
                  key={g.date.toISOString()}
                  defaultOpen={defaultOpen}
                  className={cn(
                    "rounded-xl border bg-card/60",
                    overdue
                      ? "border-2 border-priority-high/60 bg-priority-high-soft/40 shadow-[0_0_0_3px_hsl(var(--priority-high)/0.08)]"
                      : "border-border/60"
                  )}
                >
                  <CollapsibleTrigger
                    className={cn(
                      "group flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors",
                      overdue ? "hover:bg-priority-high-soft/60" : "hover:bg-surface-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                        overdue ? "text-priority-high" : "text-muted-foreground"
                      )}
                    >
                      {overdue && <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      {formatLocalDayHeader(g.date)}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal",
                          overdue ? "bg-priority-high text-white" : "bg-surface-muted"
                        )}
                      >
                        {g.tasks.length}
                      </span>
                      {overdue && <span aria-hidden className="font-extrabold">!</span>}
                      {isToday && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-primary-foreground">
                          Dnes
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform group-data-[state=open]:rotate-180",
                        overdue ? "text-priority-high" : "text-muted-foreground"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="space-y-2.5 px-2 pb-2 pt-1">
                      {g.tasks.map((t) => (
                        <TaskCard key={t.id} task={t} showProject onOpen={setOpenTask} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            {noDate.length > 0 && (
              <Collapsible defaultOpen={false} className="rounded-xl border border-border/60 bg-card/60">
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Bez dátumu
                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
                      {noDate.length}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="space-y-2.5 px-2 pb-2 pt-1">
                    {noDate.map((t) => (
                      <TaskCard key={t.id} task={t} showProject onOpen={setOpenTask} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
      <TaskDetailDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </div>
  );
}
