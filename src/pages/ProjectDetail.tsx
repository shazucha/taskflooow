import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ChevronDown, NotebookPen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { Chat } from "@/components/Chat";
import { ProjectMetaCard } from "@/components/ProjectMetaCard";
import { MonthlyDeliverablesCard } from "@/components/MonthlyDeliverablesCard";
import { MonthlyBonusesCard } from "@/components/MonthlyBonusesCard";
import { ProjectMaterialsCard } from "@/components/ProjectMaterialsCard";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { ProjectAccessCard } from "@/components/ProjectAccessCard";
import { EditableProjectHeader } from "@/components/EditableProjectHeader";
import { MonthFilter } from "@/components/MonthFilter";
import { CalendarWidget } from "@/components/CalendarWidget";
import type { Task } from "@/lib/types";
import { useCurrentUserId, useIsAppAdmin, useProjects, useProjectTasks } from "@/lib/queries";
import { formatLocalDayHeader, isSameLocalDay, localDayKey, startOfLocalDay } from "@/lib/dayLabels";

export default function ProjectDetail() {
  const { id } = useParams();
  const { data: projects = [] } = useProjects();
  const { data: projectTasks = [] } = useProjectTasks(id);
  const currentUserId = useCurrentUserId();
  const project = projects.find((p) => p.id === id);
  const isAdmin = useIsAppAdmin();
  const isOwner = !!project && project.owner_id === currentUserId;
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const [monthKey, setMonthKey] = useState<string | null>(null);

  // Bežný používateľ vidí v projekte iba svoje úlohy (kde je assignee_id).
  // Admin alebo vlastník projektu vidí všetky úlohy projektu.
  const visibleTasks = useMemo(() => {
    if (isAdmin || isOwner) return projectTasks;
    if (!currentUserId) return [];
    return projectTasks.filter((t) => t.assignee_id === currentUserId);
  }, [projectTasks, isAdmin, isOwner, currentUserId]);

  const monthFiltered = useMemo(() => {
    if (!monthKey) return visibleTasks;
    return visibleTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return k === monthKey;
    });
  }, [visibleTasks, monthKey]);

  const grouped = useMemo(() => {
    return {
      todo: monthFiltered.filter((t) => t.status !== "done"),
      done: monthFiltered.filter((t) => t.status === "done"),
    };
  }, [monthFiltered]);

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

  const formatDayHeader = (d: Date) => formatLocalDayHeader(d);

  if (!project) {
    return (
      <div className="page-container">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Projekty
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">Projekt nenájdený.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projekty
      </Link>
      <header className="mt-3 flex items-start justify-between gap-3">
        <EditableProjectHeader project={project} canEdit={isAdmin || isOwner} />
        <div className="flex flex-wrap items-center gap-1 justify-end">
          {(isOwner || isAdmin) && <DeleteProjectDialog projectId={project.id} projectName={project.name} />}
          <NewTaskDialog defaultProjectId={project.id} />
        </div>
      </header>

      <div className="mt-4 md:grid md:grid-cols-3 md:gap-6">
        <div className="space-y-4 md:col-span-2">
          <ProjectMaterialsCard projectId={project.id} />
          <MonthlyDeliverablesCard projectId={project.id} />
          <MonthlyBonusesCard projectId={project.id} />

          <section>
            <h2 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Kalendár projektu
            </h2>
            <CalendarWidget projectId={project.id} readOnly={!(isAdmin || isOwner)} />
          </section>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Úlohy</h2>
            <MonthFilter value={monthKey} onChange={setMonthKey} />
          </div>

          {(["todo", "done"] as const).map((s) => {
            const list = grouped[s];
            if (list.length === 0) return null;
            const labels = { todo: "Nedokončené", done: "Dokončené" };
            const defaultOpen = s === "todo";
            const isTodo = s === "todo";
            return (
              <Collapsible
                key={s}
                defaultOpen={defaultOpen}
                className={cn(
                  "rounded-2xl",
                  isTodo
                    ? "border-2 border-priority-high/50 bg-priority-high-soft/40 shadow-[0_0_0_3px_hsl(var(--priority-high)/0.08)]"
                    : "bg-surface-muted/40"
                )}
              >
                <CollapsibleTrigger
                  className={cn(
                    "group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 transition-colors",
                    isTodo ? "hover:bg-priority-high-soft/60" : "hover:bg-surface-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                      isTodo ? "text-priority-high" : "text-muted-foreground"
                    )}
                  >
                    {isTodo && <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />}
                    {labels[s]} · {list.length}
                    {isTodo && <span aria-hidden className="font-extrabold">!</span>}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform group-data-[state=open]:rotate-180",
                      isTodo ? "text-priority-high" : "text-muted-foreground"
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="space-y-2 px-1 pb-2 pt-1">
                    {(() => {
                      const { groups, noDate } = groupByDate(list);
                      const today = new Date();
                      const isToday = (d: Date) => isSameLocalDay(d, today);
                      // Dnešok hore, zvyšok podľa dátumu
                      const todayGroups = groups.filter((g) => isToday(g.date));
                      const otherGroups = groups.filter((g) => !isToday(g.date));
                      const ordered = [...todayGroups, ...otherGroups];
                      return (
                        <>
                          {ordered.map((g) => {
                            const today = isToday(g.date);
                            return (
                              <Collapsible
                                key={g.date.toISOString()}
                                defaultOpen={today}
                                className="rounded-xl border border-border/60 bg-card/60"
                              >
                                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl px-3 py-2 hover:bg-surface-muted">
                                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    {formatDayHeader(g.date)}
                                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
                                      {g.tasks.length}
                                    </span>
                                    {today && (
                                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-primary-foreground">
                                        Dnes
                                      </span>
                                    )}
                                  </span>
                                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                                  <div className="space-y-2.5 px-2 pb-2 pt-1">
                                    {g.tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={setOpenTask} />)}
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
                                {noDate.map((t) => <TaskCard key={t.id} task={t} onOpen={setOpenTask} />)}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {monthFiltered.length === 0 && (
            <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
              {projectTasks.length === 0 ? "Zatiaľ žiadne úlohy." : "V tomto mesiaci žiadne úlohy."}
            </p>
          )}

          <section className="pt-4">
            <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold">
              <NotebookPen className="h-3.5 w-3.5" /> Poznámky k projektu
            </h2>
            <Chat scope="project" projectId={project.id} variant="notes" />
          </section>
        </div>

        <aside className="mt-4 space-y-4 md:mt-0">
          <ProjectMetaCard project={project} />
          {isAdmin && <ProjectAccessCard project={project} />}
        </aside>
      </div>

      <TaskDetailDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </div>
  );
}
