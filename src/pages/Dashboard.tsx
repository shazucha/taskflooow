import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessagesSquare, CalendarDays, ShieldCheck } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { Chat } from "@/components/Chat";
import { CalendarWidget } from "@/components/CalendarWidget";
import { MonthFilter } from "@/components/MonthFilter";
import { AdminCollaboratorsOverview } from "@/components/AdminCollaboratorsOverview";
import { PRIORITY_META } from "@/lib/types";
import { filterTasksByMonth, currentMonthKey } from "@/lib/recurring";
import { useCurrentUserId, useIsAppAdmin, useProfiles, useProjects, useTaskWatchers, useTasks } from "@/lib/queries";

export default function Dashboard() {
  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useProfiles();
  const { data: watchers = [] } = useTaskWatchers();
  const currentUserId = useCurrentUserId();
  const isAdmin = useIsAppAdmin();
  const me = profiles.find((p) => p.id === currentUserId);
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey());

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.assignee_id === currentUserId || watchers.some((w) => w.task_id === t.id && w.user_id === currentUserId)
      ),
    [tasks, watchers, currentUserId]
  );

  // Filtrovanie podľa mesiaca + zoskupenie sérií
  const monthFiltered = useMemo(
    () => filterTasksByMonth(visibleTasks, monthKey),
    [visibleTasks, monthKey]
  );

  const counts = useMemo(() => {
    const open = monthFiltered.filter((t) => t.status !== "done");
    return {
      total: open.length,
      high: open.filter((t) => t.priority === "high").length,
      medium: open.filter((t) => t.priority === "medium").length,
      low: open.filter((t) => t.priority === "low").length,
      done: monthFiltered.filter((t) => t.status === "done").length,
    };
  }, [monthFiltered]);

  return (
    <div className="px-4 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Dobrý deň</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {me?.full_name?.trim() || "Tím"}
          </h1>
        </div>
        <Link to="/me"><UserAvatar profile={me} size="lg" /></Link>
      </header>

      <section className="mt-6">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4" /> Kalendár
        </h2>
        <CalendarWidget />
      </section>

      <section className="mt-6 flex items-center justify-between">
        <h2 className="text-base font-semibold">Prehľad</h2>
        <MonthFilter value={monthKey} onChange={setMonthKey} />
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2.5">
        {(["high", "medium", "low"] as const).map((p) => {
          const meta = PRIORITY_META[p];
          return (
            <div key={p} className={`rounded-2xl p-3 ${meta.soft}`}>
              <div className="flex items-center justify-between">
                <span className={`priority-dot ${meta.dot}`} />
                <span className={`text-xl font-bold ${meta.text}`}>{counts[p]}</span>
              </div>
              <p className={`mt-1 text-[11px] font-semibold ${meta.text}`}>{meta.label}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Projekty</h2>
          <Link to="/projects" className="text-xs font-medium text-primary inline-flex items-center">
            Všetky <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne projekty. Vytvor prvý v sekcii Projekty.
          </p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {projects.map((p) => {
              const projectTasks = tasks.filter((t) => t.project_id === p.id);
              const open = projectTasks.filter((t) => t.status !== "done").length;
              const total = projectTasks.length;
              const progress = total === 0 ? 0 : Math.round(((total - open) / total) * 100);
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="card-elevated min-w-[170px] flex-shrink-0 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color ?? "#3b82f6" }} />
                    <span className="text-xs font-medium text-muted-foreground">{open} otvorených</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-snug">{p.name}</h3>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: p.color ?? "hsl(var(--primary))" }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">{progress}% hotovo</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <MessagesSquare className="h-4 w-4" /> Tímový chat
        </h2>
        <Chat scope="team" />
      </section>

      {isAdmin && (
        <section className="mt-6 mb-6">
          <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4" /> Prehľad spolupracovníkov
          </h2>
          <AdminCollaboratorsOverview />
        </section>
      )}
    </div>
  );
}
