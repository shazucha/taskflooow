import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, FolderKanban, AlertTriangle } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { CalendarWidget } from "@/components/CalendarWidget";
import { SubscriptionPendingBadge } from "@/components/SubscriptionPendingBadge";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useCurrentUserId, useMySubscriptionPendingTotal, useProfiles, useProjects, useTasks } from "@/lib/queries";
import { pendingTasksForUser } from "@/lib/recurring";

export default function Dashboard() {
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const { data: subPending } = useMySubscriptionPendingTotal();
  const currentUserId = useCurrentUserId();
  const me = profiles.find((p) => p.id === currentUserId);

  const { pendingCount, overdueCount } = useMemo(() => {
    const { all, overdue } = pendingTasksForUser(tasks, currentUserId);
    return { pendingCount: all.length, overdueCount: overdue.length };
  }, [tasks, currentUserId]);

  const projectPendingCount = subPending?.total ?? 0;

  return (
    <div className="page-container">
      <header className="flex items-center justify-between md:hidden">
        <div>
          <p className="text-sm text-muted-foreground">Dobrý deň</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {me?.full_name?.trim() || "Tím"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <PendingTasksBell count={pendingCount} overdue={overdueCount} />
          <Link to="/me"><UserAvatar profile={me} size="lg" /></Link>
        </div>
      </header>
      <header className="hidden md:flex md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Dobrý deň</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {me?.full_name?.trim() || "Tím"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <PendingTasksBell count={pendingCount} overdue={overdueCount} />
        </div>
      </header>

      {(pendingCount > 0 || projectPendingCount > 0) && (
        <div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-2">
          {pendingCount > 0 && (
            <Link
              to="/tasks"
              title="Červené = nedokončené úlohy v aktuálnom mesiaci. Po termíne svietia silnejšie."
              className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-priority-high/30 bg-priority-high-soft/60 p-3.5 transition hover:shadow-md"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-priority-high text-white shadow-[0_0_18px_hsl(var(--priority-high)/0.55)]">
                <Bell className="h-5 w-5" />
                <span className="absolute inset-0 animate-ping rounded-xl bg-priority-high/40" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-priority-high">
                  Máš {pendingCount} nedokončen{pendingCount === 1 ? "ú úlohu" : pendingCount < 5 ? "é úlohy" : "ých úloh"}
                </p>
                <p className="text-xs text-priority-high/80">
                  {overdueCount > 0
                    ? `${overdueCount} po termíne · klikni pre zoznam`
                    : "Klikni pre zobrazenie zoznamu"}
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-priority-high transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          )}

          {projectPendingCount > 0 && (
            <Link
              to="/projects/pending"
              title="Nedokončené náplne projektov (predplatné)."
              className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/40 bg-primary-soft/70 p-3.5 transition hover:shadow-md"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.6)]">
                <AlertTriangle className="h-5 w-5" />
                <span className="absolute inset-0 animate-ping rounded-xl bg-primary/40" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">
                  {projectPendingCount} nedokončen{projectPendingCount === 1 ? "á náplň projektu" : projectPendingCount < 5 ? "é náplne projektov" : "ých náplní projektov"}
                </p>
                <p className="text-xs text-primary/80">
                  v rámci predplatného · klikni pre zoznam
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-primary transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}

      <section className="mt-6 md:mt-8">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4" /> Kalendár
        </h2>
        <CalendarWidget mode="personal" />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold">
            <FolderKanban className="h-4 w-4" /> Projekty
          </h2>
          <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Všetky <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne projekty. Vytvor prvý v sekcii Projekty.
          </p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-4 xl:grid-cols-5">
            {projects.map((p) => {
              const color = p.color ?? "#3b82f6";
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="group relative isolate min-w-[200px] flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-xl md:min-w-0"
                >
                  {/* gradient glow accent */}
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
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold uppercase text-white shadow-sm"
                      style={{ backgroundColor: color }}
                    >
                      {p.name.trim().charAt(0) || "•"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <SubscriptionPendingBadge projectId={p.id} />
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </div>

                  <h3 className="relative mt-3 line-clamp-2 text-sm font-semibold leading-snug">
                    {p.name}
                  </h3>
                  {p.category && (
                    <p className="relative mt-1 text-[11px] text-muted-foreground">{p.category}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}

function PendingTasksBell({ count, overdue }: { count: number; overdue: number }) {
  if (count <= 0) {
    return (
      <Link
        to="/tasks"
        aria-label="Úlohy"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
      </Link>
    );
  }
  const isOverdue = overdue > 0;
  return (
    <Link
      to="/tasks"
      aria-label={`${count} nedokončených úloh`}
      title={`${count} nedokončených úloh${overdue > 0 ? ` · ${overdue} po termíne` : ""}`}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-white transition hover:scale-105 ${
        isOverdue
          ? "border-priority-high/40 bg-priority-high shadow-[0_0_16px_hsl(var(--priority-high)/0.55)]"
          : "border-primary/40 bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.5)]"
      }`}
    >
      <Bell className="h-5 w-5" />
      <span
        className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 ring-background ${
          isOverdue ? "bg-priority-high text-white" : "bg-priority-high text-white"
        }`}
      >
        {count > 99 ? "99+" : count}
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 animate-ping rounded-full ${
          isOverdue ? "bg-priority-high/30" : "bg-primary/30"
        }`}
      />
    </Link>
  );
}
