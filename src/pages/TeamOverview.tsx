import { Navigate } from "react-router-dom";
import { Users2, ShieldCheck } from "lucide-react";
import { CalendarWidget } from "@/components/CalendarWidget";
import { UserAvatar } from "@/components/UserAvatar";
import { AdminCollaboratorsOverview } from "@/components/AdminCollaboratorsOverview";
import {
  useCurrentUserId,
  useIsAppAdmin,
  useProfiles,
  useTasks,
  useTaskWatchers,
} from "@/lib/queries";

export default function TeamOverview() {
  const isAdmin = useIsAppAdmin();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const { data: watchers = [] } = useTaskWatchers();

  if (!isAdmin) return <Navigate to="/" replace />;

  // Spolupracovníci = všetci profily okrem admina
  const collaborators = profiles
    .filter((p) => p.id !== currentUserId)
    .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));

  return (
    <div className="page-container">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Prehľad zamestnancov
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aktivity a kalendáre tvojich spolupracovníkov.
          </p>
        </div>
        <ShieldCheck className="hidden h-8 w-8 text-primary md:block" />
      </header>

      <section className="mt-6">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <Users2 className="h-4 w-4" /> Kalendáre spolupracovníkov
        </h2>

        {collaborators.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadni spolupracovníci.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {collaborators.map((p) => {
              const taskCount = tasks.filter(
                (t) =>
                  t.assignee_id === p.id ||
                  watchers.some((w) => w.task_id === t.id && w.user_id === p.id)
              ).length;
              const openCount = tasks.filter(
                (t) =>
                  t.status !== "done" &&
                  (t.assignee_id === p.id ||
                    watchers.some((w) => w.task_id === t.id && w.user_id === p.id))
              ).length;
              return (
                <div key={p.id} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <UserAvatar profile={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {p.full_name?.trim() || p.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {openCount} otvorených · {taskCount} celkovo
                      </p>
                    </div>
                  </div>
                  <CalendarWidget userId={p.id} readOnly />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4" /> Dokončené úlohy spolupracovníkov
        </h2>
        <AdminCollaboratorsOverview />
      </section>
    </div>
  );
}
