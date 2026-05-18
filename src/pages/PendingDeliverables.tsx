import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import {
  useCurrentUserId,
  useMonthlyWorkCompletions,
  useMySubscriptionPendingTotal,
  useProjectMonthlyWorks,
  useProjectRecurringWorks,
  useProjects,
  useRecurringWorkCompletions,
} from "@/lib/queries";
import { currentMonthKey } from "@/lib/recurring";
import type { Project } from "@/lib/types";

export default function PendingDeliverables() {
  const { data: projects = [] } = useProjects();
  const { data: subPending } = useMySubscriptionPendingTotal();

  const pendingProjects = useMemo(() => {
    const perProject = subPending?.perProject ?? {};
    return projects
      .filter((p) => (perProject[p.id] ?? 0) > 0)
      .sort((a, b) => (perProject[b.id] ?? 0) - (perProject[a.id] ?? 0));
  }, [projects, subPending]);

  const total = subPending?.total ?? 0;

  return (
    <div className="page-container">
      <header className="mb-5">
        <Link
          to="/"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Späť na Prehľad
        </Link>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Nedokončené náplne projektov
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total > 0
            ? `Spolu ${total} položiek priradených tebe v aktuálnom mesiaci.`
            : "Všetko hotovo – žiadna nedokončená náplň."}
        </p>
      </header>

      {pendingProjects.length === 0 ? (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
          <p className="text-sm font-medium text-success">Si v pohode, nič nečaká.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingProjects.map((p) => (
            <ProjectPendingCard
              key={p.id}
              project={p}
              count={subPending?.perProject?.[p.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectPendingCard({ project, count }: { project: Project; count: number }) {
  const userId = useCurrentUserId();
  const monthKey = currentMonthKey();
  const { data: tplWorks = [] } = useProjectRecurringWorks(project.id);
  const { data: tplCompletions = [] } = useRecurringWorkCompletions(project.id);
  const { data: snapWorks = [] } = useProjectMonthlyWorks(project.id, monthKey);
  const { data: snapCompletions = [] } = useMonthlyWorkCompletions(project.id, monthKey);

  const pendingItems = useMemo(() => {
    if (!userId) return [] as { id: string; title: string }[];
    const hasSnapshot = snapWorks.length > 0;
    if (hasSnapshot) {
      const doneSet = new Set(snapCompletions.map((c) => c.monthly_work_id));
      return snapWorks
        .filter((w) => w.assignee_id === userId && !doneSet.has(w.id))
        .map((w) => ({ id: w.id, title: w.title }));
    }
    const doneSet = new Set(
      tplCompletions.filter((c) => c.month_key === monthKey).map((c) => c.work_id)
    );
    return tplWorks
      .filter((w) => w.assignee_id === userId && !doneSet.has(w.id))
      .map((w) => ({ id: w.id, title: w.title }));
  }, [userId, snapWorks, tplWorks, snapCompletions, tplCompletions, monthKey]);

  const color = project.color ?? "#3b82f6";

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-sm">
      <Link
        to={`/projects/${project.id}`}
        className="group flex items-center gap-3 border-b border-border/60 bg-primary-soft/40 p-4 transition hover:bg-primary-soft/70"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold uppercase text-white"
          style={{ backgroundColor: color }}
        >
          {project.name.trim().charAt(0) || "•"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
          <p className="text-xs text-primary">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {count} {count === 1 ? "nedokončená položka" : count < 5 ? "nedokončené položky" : "nedokončených položiek"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Otvoriť projekt
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </Link>

      {pendingItems.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">Načítavam položky…</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {pendingItems.map((item) => (
            <li key={item.id}>
              <Link
                to={`/projects/${project.id}#work-${item.id}`}
                className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-muted/60"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
