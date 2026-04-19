import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FolderKanban } from "lucide-react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { useProjects, useTasks } from "@/lib/queries";
import { PROJECT_CATEGORIES, type Project, type ProjectCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | ProjectCategory | "uncategorized";

const FILTER_LABEL: Record<Filter, string> = {
  all: "Všetky",
  "odstartujto.sk": "odstartujto.sk",
  "shazucha.sk": "shazucha.sk",
  uncategorized: "Bez kategórie",
};

export default function Projects() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: tasks = [] } = useTasks();
  const [filter, setFilter] = useState<Filter>("all");

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

  const filters: Filter[] = ["all", ...PROJECT_CATEGORIES, "uncategorized"];

  const renderProject = (p: Project) => {
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
          const count =
            f === "all"
              ? projects.length
              : (groups.get(f)?.length ?? 0);
          if (f !== "all" && count === 0 && f === "uncategorized") return null;
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
        ) : filter === "all" ? (
          // Grouped sections
          (["odstartujto.sk", "shazucha.sk", "uncategorized"] as const).map((key) => {
            const list = groups.get(key) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={key} className="space-y-2">
                <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {FILTER_LABEL[key]} <span className="opacity-60">· {list.length}</span>
                </h2>
                <div className="space-y-3">{list.map(renderProject)}</div>
              </section>
            );
          })
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
