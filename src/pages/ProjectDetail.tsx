import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useApp } from "@/lib/store";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskDialog } from "@/components/NewTaskDialog";

export default function ProjectDetail() {
  const { id } = useParams();
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const project = projects.find((p) => p.id === id);

  const grouped = useMemo(() => {
    const list = tasks.filter((t) => t.project_id === id);
    return {
      todo: list.filter((t) => t.status === "todo"),
      in_progress: list.filter((t) => t.status === "in_progress"),
      done: list.filter((t) => t.status === "done"),
    };
  }, [tasks, id]);

  if (!project) {
    return (
      <div className="px-4 pt-6">
        <p className="text-sm text-muted-foreground">Projekt nenájdený.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projekty
      </Link>
      <header className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? "#3b82f6" }} />
            <h1 className="text-2xl font-bold tracking-tight truncate">{project.name}</h1>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <NewTaskDialog defaultProjectId={project.id} />
      </header>

      {(["in_progress", "todo", "done"] as const).map((s) => {
        const list = grouped[s];
        if (list.length === 0) return null;
        const labels = { in_progress: "Prebieha", todo: "Nezačaté", done: "Hotové" };
        return (
          <section key={s} className="mt-6">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {labels[s]} · {list.length}
            </h2>
            <div className="space-y-2.5">
              {list.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
