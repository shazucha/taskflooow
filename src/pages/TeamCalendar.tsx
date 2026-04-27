import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CalendarDays, Clock, ListChecks, Users2 } from "lucide-react";
import { CalendarWidget } from "@/components/CalendarWidget";
import { UserAvatar } from "@/components/UserAvatar";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { cn } from "@/lib/utils";
import {
  useCurrentUserId,
  useIsAppAdminStatus,
  useProfiles,
  useTasks,
} from "@/lib/queries";
import type { Task } from "@/lib/types";

type Layout = "merged" | "columns";

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAYS_SHORT = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

function dayLabel(d: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isToday) return "Dnes";
  if (isTomorrow) return "Zajtra";
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtTaskTime(t: Task) {
  if (!t.due_date) return null;
  const d = new Date(t.due_date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TeamCalendar() {
  const { isAdmin, loading: adminLoading } = useIsAppAdminStatus();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("merged");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);

  // Iba členovia s aspoň jednou priradenou úlohou
  const teamMembers = useMemo(() => {
    const withTasks = new Set<string>();
    for (const t of tasks) if (t.assignee_id) withTasks.add(t.assignee_id);
    return profiles
      .filter((p) => withTasks.has(p.id))
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
      });
  }, [profiles, tasks, currentUserId]);

  const profilesById = useMemo(() => {
    const m = new Map<string, typeof profiles[number]>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  // Build the upcoming task list (next 60 days), filtered by focused user if any
  const upcomingByDay = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + 60);

    const filtered = tasks.filter((t) => {
      if (!t.due_date || !t.assignee_id) return false;
      if (!showDone && t.status === "done") return false;
      if (focusUserId && t.assignee_id !== focusUserId) return false;
      const d = new Date(t.due_date);
      return d >= startOfToday && d <= horizon;
    });

    filtered.sort((a, b) => {
      const da = new Date(a.due_date!).getTime();
      const db = new Date(b.due_date!).getTime();
      return da - db;
    });

    const groups = new Map<string, { date: Date; tasks: Task[] }>();
    for (const t of filtered) {
      const d = new Date(t.due_date!);
      const key = dayKey(d);
      const existing = groups.get(key);
      if (existing) {
        existing.tasks.push(t);
      } else {
        groups.set(key, {
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          tasks: [t],
        });
      }
    }
    return Array.from(groups.values());
  }, [tasks, focusUserId, showDone]);

  // Early returns AFTER all hooks
  if (adminLoading) {
    return (
      <div className="page-container">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const allActive = focusUserId === null;
  const showColumns = allActive && layout === "columns";

  const totalUpcoming = upcomingByDay.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <div className="page-container">
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">Admin</p>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <CalendarDays className="h-6 w-6" /> Tímový kalendár
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prehľad úloh celého tímu. Iba na čítanie.
        </p>
      </header>

      {/* Member switcher */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFocusUserId(null)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            allActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Users2 className="h-3.5 w-3.5" /> Všetci
        </button>
        {teamMembers.map((p) => {
          const active = focusUserId === p.id;
          const label =
            p.id === currentUserId ? "Ja" : p.full_name?.trim() || p.email || "—";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFocusUserId(p.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color || "hsl(var(--muted-foreground))" }}
              />
              <UserAvatar profile={p} size="sm" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Layout toggle (only meaningful when "Všetci") */}
      {allActive && (
        <div className="mb-4 inline-flex gap-1 rounded-xl bg-surface-muted p-1 text-xs font-semibold">
          {(["merged", "columns"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLayout(l)}
              className={cn(
                "rounded-lg px-3 py-1.5 transition",
                layout === l
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l === "merged" ? "Zlúčené" : "Stĺpce per osoba"}
            </button>
          ))}
        </div>
      )}

      {showColumns ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamMembers.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <UserAvatar profile={p} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {p.id === currentUserId ? "Ja" : p.full_name?.trim() || p.email}
                  </p>
                </div>
                <span
                  className="ml-auto h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color || "hsl(var(--muted-foreground))" }}
                />
              </div>
              <CalendarWidget
                userId={p.id}
                readOnly
                mode="team"
                teamFocusUserId={p.id}
              />
            </div>
          ))}
        </div>
      ) : (
        <CalendarWidget
          readOnly
          mode="team"
          teamFocusUserId={focusUserId}
        />
      )}

      {/* Upcoming tasks list */}
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <ListChecks className="h-5 w-5" />
            Zoznam úloh
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {totalUpcoming}
            </span>
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            Zobraziť dokončené
          </label>
        </div>

        {totalUpcoming === 0 ? (
          <div className="card-elevated p-6 text-center text-sm text-muted-foreground">
            {focusUserId
              ? "Tento člen nemá v najbližších 60 dňoch žiadne úlohy."
              : "V najbližších 60 dňoch nie sú žiadne úlohy."}
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingByDay.map((group) => (
              <div key={dayKey(group.date)}>
                <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {dayLabel(group.date)}
                </p>
                <ul className="card-elevated divide-y divide-border/60">
                  {group.tasks.map((t) => {
                    const assignee = t.assignee_id ? profilesById.get(t.assignee_id) : undefined;
                    const time = fmtTaskTime(t);
                    const done = t.status === "done";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setOpenTask(t)}
                          className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-surface-muted"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                assignee?.color || "hsl(var(--muted-foreground))",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm font-semibold",
                                done && "text-muted-foreground line-through"
                              )}
                            >
                              {t.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              {time && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {time}
                                </span>
                              )}
                              {assignee && (
                                <span className="truncate">
                                  {assignee.id === currentUserId
                                    ? "Ja"
                                    : assignee.full_name?.trim() || assignee.email}
                                </span>
                              )}
                            </div>
                          </div>
                          {assignee && <UserAvatar profile={assignee} size="sm" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <TaskDetailDialog
        task={openTask}
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
      />
    </div>
  );
}