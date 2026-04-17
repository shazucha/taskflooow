import { Link } from "react-router-dom";
import { useApp } from "@/lib/store";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { ChevronRight, FolderKanban } from "lucide-react";

export default function Projects() {
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projekty</h1>
        <NewProjectDialog />
      </header>

      <div className="mt-6 space-y-3">
        {projects.map((p) => {
          const projectTasks = tasks.filter((t) => t.project_id === p.id);
          const open = projectTasks.filter((t) => t.status !== "done").length;
          const high = projectTasks.filter((t) => t.priority === "high" && t.status !== "done").length;
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
                  {open} otvorených úloh
                  {high > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-priority-high">{high} urgentných</span>
                    </>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
