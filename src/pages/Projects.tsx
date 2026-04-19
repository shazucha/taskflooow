import { Link } from "react-router-dom";
import { ChevronRight, FolderKanban } from "lucide-react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { useProjects, useTasks } from "@/lib/queries";

export default function Projects() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: tasks = [] } = useTasks();

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projekty</h1>
        <NewProjectDialog />
      </header>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam...</p>
        ) : projects.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne projekty. Klikni na „Nový" hore.
          </p>
        ) : (
          projects.map((p) => {
            const projectTasks = tasks.filter((t) => t.project_id === p.id);
            const total = projectTasks.length;
            const done = projectTasks.filter((t) => t.status === "done").length;
            const open = total - done;
            const high = projectTasks.filter((t) => t.priority === "high" && t.status !== "done").length;
            const progress = total === 0 ? 0 : Math.round((done / total) * 100);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card-elevated flex items-center gap-3 p-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${p.color}1a`, color: p.color ?? undefined }}
                >
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {open} otvorených · {done}/{total} hotových ({progress}%)
                    {high > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-priority-high">{high} urgentných</span>
                      </>
                    )}
                  </p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: p.color ?? "hsl(var(--primary))" }}
                    />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
