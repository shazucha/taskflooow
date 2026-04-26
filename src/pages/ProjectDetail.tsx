import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, NotebookPen } from "lucide-react";
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
import type { Task } from "@/lib/types";
import { useCurrentUserId, useIsAppAdmin, useProjects, useProjectTasks } from "@/lib/queries";

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

  // V detaile projektu zobrazujeme VŠETKY úlohy (vrátane všetkých výskytov sérií),
  // aby bolo vidno celú históriu prác v rámci projektu.
  const monthFiltered = useMemo(() => {
    if (!monthKey) return projectTasks;
    return projectTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return k === monthKey;
    });
  }, [projectTasks, monthKey]);

  const grouped = useMemo(() => {
    return {
      todo: monthFiltered.filter((t) => t.status === "todo"),
      in_progress: monthFiltered.filter((t) => t.status === "in_progress"),
      done: monthFiltered.filter((t) => t.status === "done"),
    };
  }, [monthFiltered]);

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

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Úlohy</h2>
            <MonthFilter value={monthKey} onChange={setMonthKey} />
          </div>

          {(["in_progress", "todo", "done"] as const).map((s) => {
            const list = grouped[s];
            if (list.length === 0) return null;
            const labels = { in_progress: "Prebieha", todo: "Nezačaté", done: "Hotové" };
            const defaultOpen = s === "todo";
            return (
              <Collapsible key={s} defaultOpen={defaultOpen} className="rounded-2xl bg-surface-muted/40">
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-surface-muted">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {labels[s]} · {list.length}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="space-y-2.5 px-1 pb-2 pt-1 md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0">
                    {list.map((t) => <TaskCard key={t.id} task={t} onOpen={setOpenTask} />)}
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
            <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
              <NotebookPen className="h-4 w-4" /> Poznámky k projektu
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
