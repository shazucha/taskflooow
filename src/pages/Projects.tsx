import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { SubscriptionPendingBadge } from "@/components/SubscriptionPendingBadge";
import { useMySubscriptionPendingTotal, useProjects, useTasks } from "@/lib/queries";
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
  const { data: pendingData } = useMySubscriptionPendingTotal();
  const perProjectPending = pendingData?.perProject ?? {};
  const [filter, setFilter] = useState<Filter>("shazucha.sk");

  const groups = useMemo(() => {
    const map = new Map<Filter, Project[]>();
    for (const cat of PROJECT_CATEGORIES) map.set(cat, []);
    map.set("uncategorized", []);
    for (const p of projects) {
      const key: Filter = p.category && PROJECT_CATEGORIES.includes(p.category) ? p.category : "uncategorized";
      map.get(key)!.push(p);
    }
    // Zoradenie: projekty s nedokončenými „náplňami predplatného" idú dopredu
    // (najviac pending hore), zvyšok ostáva v pôvodnom poradí.
    for (const [k, list] of map) {
      const sorted = [...list].sort((a, b) => {
        const pa = perProjectPending[a.id] ?? 0;
        const pb = perProjectPending[b.id] ?? 0;
        if (pa !== pb) return pb - pa;
        return 0;
      });
      map.set(k, sorted);
    }
    return map;
  }, [projects, perProjectPending]);

  const filters: Filter[] = [...PROJECT_CATEGORIES, "uncategorized"];

  const renderProject = (p: Project) => {
    const projectTasks = tasks.filter((t) => t.project_id === p.id);
    const total = projectTasks.length;
    const open = projectTasks.filter((t) => t.status !== "done").length;
    const high = projectTasks.filter((t) => t.priority === "high" && t.status !== "done").length;
    const color = p.color ?? "#3b82f6";
    return (
      <Link
        key={p.id}
        to={`/projects/${p.id}`}
        className="group relative isolate overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-xl"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
          style={{ backgroundColor: color }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
        />
        <div className="relative flex items-start justify-between gap-2">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold uppercase text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {p.name.trim().charAt(0) || "•"}
          </span>
          <div className="flex items-center gap-1.5">
            <SubscriptionPendingBadge projectId={p.id} />
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </div>
        <h3 className="relative mt-3 line-clamp-2 text-sm font-semibold leading-snug">{p.name}</h3>
        {p.category && (
          <p className="relative mt-1 text-[11px] text-muted-foreground">{p.category}</p>
        )}
        <p className="relative mt-2 text-xs text-muted-foreground">
          {open} otvorených z {total}
          {high > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-priority-high">{high} urgentných</span>
            </>
          )}
        </p>
      </Link>
    );
  };

  return (
    <div className="page-container">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Projekty</h1>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {(groups.get(filter) ?? []).length === 0 ? (
              <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground md:col-span-full">
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
