import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, CalendarOff, CheckSquare, CheckCircle2, RotateCcw, Trash2, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { MonthFilter } from "@/components/MonthFilter";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Priority, Task } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { filterTasksByMonth, currentMonthKey } from "@/lib/recurring";
import { useCurrentUserId, useIsAppAdmin, useProjects, useTasks, useDeleteTasks, useUpdateTasksBulk } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatLocalDayHeader, isSameLocalDay, localDayKey, localTodayTomorrow, startOfLocalDay } from "@/lib/dayLabels";
import { toast } from "sonner";

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime());
}

type Scope = "mine" | "all";
type PriorityFilter = "all" | Priority;

export default function Tasks() {
  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();
  const currentUserId = useCurrentUserId();
  const isAdmin = useIsAppAdmin();
  const [scope, setScope] = useState<Scope>("mine");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey());
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const deleteTasksMutation = useDeleteTasks();
  const bulkUpdate = useUpdateTasksBulk();
  const [bulkPriority, setBulkPriority] = useState<Priority | "">("");
  const [bulkDue, setBulkDue] = useState<string>("");

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Naozaj chceš zmazať ${selected.size} úloh?`)) return;
    try {
      await deleteTasksMutation.mutateAsync(Array.from(selected));
      toast.success(`Zmazané: ${selected.size}`);
      exitSelectMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zmazanie zlyhalo");
    }
  };

  // Hromadná zmena priority a/alebo termínu pre vybrané úlohy.
  const handleBulkApply = async () => {
    if (selected.size === 0) return;
    if (!bulkPriority && !bulkDue) {
      toast.error("Vyber prioritu alebo termín");
      return;
    }
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const updates = Array.from(selected).map((id) => {
      const patch: Partial<Task> = {};
      if (bulkPriority) patch.priority = bulkPriority as Priority;
      if (bulkDue) {
        const prev = byId.get(id)?.due_date ? new Date(byId.get(id)!.due_date as string) : null;
        const [y, m, d] = bulkDue.split("-").map(Number);
        const next = new Date(y, m - 1, d, prev && isValidDate(prev) ? prev.getHours() : 9, prev && isValidDate(prev) ? prev.getMinutes() : 0, 0, 0);
        patch.due_date = next.toISOString();
      }
      return { id, patch };
    });
    try {
      await bulkUpdate.mutateAsync(updates);
      toast.success(`Upravených: ${updates.length}`);
      setBulkPriority("");
      setBulkDue("");
      exitSelectMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Úprava zlyhala");
    }
  };

  // Hromadná zmena stavu (dokončené / späť na nesplnené)
  const handleBulkStatus = async (status: "done" | "todo") => {
    if (selected.size === 0) return;
    const updates = Array.from(selected).map((id) => ({ id, patch: { status } as Partial<Task> }));
    try {
      await bulkUpdate.mutateAsync(updates);
      toast.success(status === "done" ? `Dokončených: ${updates.length}` : `Vrátených späť: ${updates.length}`);
      exitSelectMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Úprava zlyhala");
    }
  };

  const selectAllVisible = (list: Task[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of list) next.add(t.id);
      return next;
    });
  };

  const myProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const scopedBase = useMemo(() => {
    const monthScoped = filterTasksByMonth(tasks, monthKey).filter((t) => t.status !== "done");
    return {
      mine: monthScoped.filter((t) => t.assignee_id === currentUserId),
      all: isAdmin
        ? monthScoped
        : monthScoped.filter((t) => t.project_id && myProjectIds.has(t.project_id)),
    };
  }, [tasks, monthKey, myProjectIds, currentUserId, isAdmin]);

  const applyPriority = (list: Task[]) =>
    priorityFilter === "all" ? list : list.filter((t) => t.priority === priorityFilter);
  const isOverdue = (t: Task) => !!t.due_date && new Date(t.due_date).getTime() < Date.now();
  const applyOverdue = (list: Task[]) => (overdueOnly ? list.filter(isOverdue) : list);

  const filtered = useMemo(() => {
    return applyOverdue(applyPriority(scopedBase[scope])).sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      return order[a.priority] - order[b.priority];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedBase, scope, priorityFilter, overdueOnly]);

  const scopeCounts = {
    mine: applyOverdue(applyPriority(scopedBase.mine)).length,
    all: applyOverdue(applyPriority(scopedBase.all)).length,
  };
  const priorityCounts = {
    all: applyOverdue(scopedBase[scope]).length,
    high: applyOverdue(scopedBase[scope].filter((t) => t.priority === "high")).length,
    medium: applyOverdue(scopedBase[scope].filter((t) => t.priority === "medium")).length,
    low: applyOverdue(scopedBase[scope].filter((t) => t.priority === "low")).length,
  } as Record<PriorityFilter, number>;
  const overdueTotal = scopedBase[scope].filter(isOverdue).length;

  const groupByDate = (list: Task[]) => {
    const withDate: Task[] = [];
    const noDate: Task[] = [];
    for (const t of list) {
      if (t.due_date) {
        const d = new Date(t.due_date);
        if (isValidDate(d)) withDate.push(t);
        else noDate.push(t);
      } else noDate.push(t);
    }
    const hasTime = (t: Task) => {
      const d = new Date(t.due_date!);
      return d.getHours() !== 0 || d.getMinutes() !== 0;
    };
    withDate.sort((a, b) => {
      const da = new Date(a.due_date!);
      const db = new Date(b.due_date!);
      const dayDiff = startOfLocalDay(da).getTime() - startOfLocalDay(db).getTime();
      if (dayDiff !== 0) return dayDiff;
      const at = hasTime(a);
      const bt = hasTime(b);
      if (at !== bt) return at ? -1 : 1;
      return da.getTime() - db.getTime();
    });
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

  const chips: { id: PriorityFilter; label: string; cls?: string }[] = [
    { id: "all", label: "Všetky" },
    { id: "high", label: PRIORITY_META.high.label, cls: "data-[active=true]:bg-priority-high-soft data-[active=true]:text-priority-high" },
    { id: "medium", label: PRIORITY_META.medium.label, cls: "data-[active=true]:bg-priority-medium-soft data-[active=true]:text-priority-medium" },
    { id: "low", label: PRIORITY_META.low.label, cls: "data-[active=true]:bg-priority-low-soft data-[active=true]:text-priority-low" },
  ];

  return (
    <div className="page-container">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Úlohy</h1>
        <div className="flex items-center gap-2">
          {!selectMode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectMode(true)}
              className="gap-1.5"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Výber
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={exitSelectMode} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Zrušiť
            </Button>
          )}
          <NewTaskDialog />
        </div>
      </header>

      {selectMode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft/40 p-2">
          <span className="text-xs font-semibold">Vybraných: {selected.size}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => selectAllVisible(filtered)}
            className="h-7 text-xs"
          >
            Označiť všetky viditeľné
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="h-7 text-xs"
          >
            Vyčistiť
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || bulkUpdate.isPending}
            onClick={() => handleBulkStatus("done")}
            className="h-7 gap-1.5 border-success/40 bg-success/10 text-xs text-success hover:bg-success/20"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Označiť ako dokončené
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || bulkUpdate.isPending}
            onClick={() => handleBulkStatus("todo")}
            className="h-7 gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Vrátiť na nesplnené
          </Button>

          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0 || deleteTasksMutation.isPending}
            onClick={handleBulkDelete}
            className="ml-auto h-7 gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Zmazať vybrané
          </Button>

          <div className="flex w-full flex-wrap items-center gap-2 border-t border-primary/20 pt-2">
            <Select value={bulkPriority} onValueChange={(v) => setBulkPriority(v as Priority)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue placeholder="Priorita" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={bulkDue}
              onChange={(e) => setBulkDue(e.target.value)}
              className="h-7 w-[150px] text-xs"
            />
            <Button
              size="sm"
              disabled={selected.size === 0 || bulkUpdate.isPending || (!bulkPriority && !bulkDue)}
              onClick={handleBulkApply}
              className="h-7 text-xs"
            >
              Použiť na vybrané
            </Button>
          </div>
        </div>
      )}

      <p className="mt-2 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex h-3 w-3 rounded-full border-2 border-priority-high bg-priority-high-soft shadow-[0_0_8px_hsl(var(--priority-high)/0.5)]" />
        Červený rámček a pulzujúci štítok = úloha je po termíne
      </p>

      <div className="mt-4">
        <MonthFilter value={monthKey} onChange={setMonthKey} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-surface-muted p-1">
        {([
          { id: "mine", label: "Moje", count: scopeCounts.mine },
          { id: "all", label: "Tím", count: scopeCounts.all },
        ] as { id: Scope; label: string; count: number }[]).map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            data-active={scope === s.id}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors data-[active=true]:bg-foreground data-[active=true]:text-background"
          >
            {s.label}
            <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-bold text-foreground data-[active=true]:bg-background/20">
              {s.count}
            </span>
          </button>
        ))}
        </div>
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          data-active={overdueOnly}
          title="Zobraziť iba úlohy po termíne"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
            overdueOnly
              ? "border-priority-high/60 bg-priority-high text-white shadow-[0_0_12px_hsl(var(--priority-high)/0.5)]"
              : "border-priority-high/40 bg-priority-high-soft/50 text-priority-high hover:bg-priority-high-soft"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
          Po termíne
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            overdueOnly ? "bg-white/20" : "bg-priority-high/15"
          )}>
            {overdueTotal}
          </span>
        </button>
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
        {chips.map((c) => (
          <button
            key={c.id}
            data-active={priorityFilter === c.id}
            onClick={() => setPriorityFilter(c.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              "bg-surface-muted text-muted-foreground data-[active=true]:bg-foreground data-[active=true]:text-background",
              c.cls
            )}
          >
            {c.label}
            <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
              {priorityCounts[c.id]}
            </span>
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
                        <div key={t.id} className="flex items-start gap-2">
                          {selectMode && (
                            <Checkbox
                              className="mt-3"
                              checked={selected.has(t.id)}
                              onCheckedChange={() => toggleSelected(t.id)}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <TaskCard
                              task={t}
                              showProject
                              onOpen={selectMode ? () => toggleSelected(t.id) : setOpenTask}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            {noDate.length > 0 && (
              <Collapsible defaultOpen={false} className="rounded-xl border border-dashed border-muted-foreground/30 bg-surface-muted/40">
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <CalendarOff className="h-3.5 w-3.5" strokeWidth={2.5} />
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
                      <div key={t.id} className="flex items-start gap-2">
                        {selectMode && (
                          <Checkbox
                            className="mt-3"
                            checked={selected.has(t.id)}
                            onCheckedChange={() => toggleSelected(t.id)}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <TaskCard
                            task={t}
                            showProject
                            onOpen={selectMode ? () => toggleSelected(t.id) : setOpenTask}
                          />
                        </div>
                      </div>
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
