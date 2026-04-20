import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FolderKanban } from "lucide-react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { useProjects, useTasks } from "@/lib/queries";
import { PROJECT_CATEGORIES, type Project, type ProjectCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = ProjectCategory | "uncategorized";

const FILTER_LABEL: Record<Filter, string> = {
  "odstartujto.sk": "odstartujto.sk",
  "shazucha.sk": "shazucha.sk",
  uncategorized: "Bez kategórie",
};

export default function Projects() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: tasks = [] } = useTasks();
  const [filter, setFilter] = useState<Filter>("shazucha.sk");

  const groups = useMemo(() => {
    const map = new Map<Filter, Project[]>();
    for (const cat of PROJECT_CATEGORIES) map.set(cat, []);
    map.set("uncategorized", []);
    for (const p of projects) {
      const key: Filter = p.category && PROJECT_CATEGORIES.includes(p.category) ? p.category : "uncategorized";
      map.get(key)!.push(p);
    }
    return map;
  }, [projects]);

  const filters: Filter[] = [...PROJECT_CATEGORIES, "uncategorized"];

  const renderProject = (p: Project) => {
    const projectTasks = tasks.filter((t) => t.project_id === p.id);
    const total = projectTasks.length;
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
            {open} otvorených z {total}
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
  };

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projekty</h1>
        <NewProjectDialog />
      </header>

      {/* Filter chips */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto rounded-xl bg-surface-muted p-1">
        {filters.map((f) => {
          const count = groups.get(f)?.length ?? 0;
          if (count === 0 && f === "uncategorized") return null;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {FILTER_LABEL[f]} <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam...</p>
        ) : projects.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne projekty. Klikni na „Nový" hore.
          </p>
        ) : (
          <div className="space-y-3">
            {(groups.get(filter) ?? []).length === 0 ? (
              <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
                V tejto kategórii zatiaľ nie sú žiadne projekty.
              </p>
            ) : (
              (groups.get(filter) ?? []).map(renderProject)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
