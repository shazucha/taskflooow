import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Users2 } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useProfiles, useProjects, useTasks } from "@/lib/queries";
import { cn } from "@/lib/utils";

type RangeKey = "7d" | "30d" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "7 dní",
  "30d": "30 dní",
  all: "Všetko",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("sk-SK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayShort(d: Date) {
  return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

function formatDayLong(d: Date) {
  return d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" });
}

type HeatCell = { date: Date; key: string; count: number };

function CompletionHeatmap({
  doneTasks,
  range,
  color,
}: {
  doneTasks: { updated_at: string }[];
  range: RangeKey;
  color: string;
}) {
  const cells = useMemo<HeatCell[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    if (range === "7d") {
      start = new Date(today);
      start.setDate(start.getDate() - 6);
    } else if (range === "30d") {
      start = new Date(today);
      start.setDate(start.getDate() - 29);
    } else {
      // All: zober od najstaršej dokončenej úlohy, max 60 dní pre čitateľnosť
      const earliest = doneTasks.reduce<Date | null>((acc, t) => {
        const d = new Date(t.updated_at);
        d.setHours(0, 0, 0, 0);
        return !acc || d < acc ? d : acc;
      }, null);
      const fallback = new Date(today);
      fallback.setDate(fallback.getDate() - 29);
      start = earliest ?? fallback;
      const maxStart = new Date(today);
      maxStart.setDate(maxStart.getDate() - 59);
      if (start < maxStart) start = maxStart;
    }

    const counts = new Map<string, number>();
    for (const t of doneTasks) {
      const d = new Date(t.updated_at);
      d.setHours(0, 0, 0, 0);
      if (d < start || d > today) continue;
      const k = dayKey(d);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const result: HeatCell[] = [];
    const cur = new Date(start);
    while (cur <= today) {
      const k = dayKey(cur);
      result.push({ date: new Date(cur), key: k, count: counts.get(k) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [doneTasks, range]);

  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  const peak = cells.reduce<HeatCell | null>(
    (best, c) => (c.count > 0 && (!best || c.count > best.count) ? c : best),
    null
  );

  return (
    <div className="px-3.5 pb-3 pt-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>Aktivita po dňoch</span>
        {peak ? (
          <span>
            Top: {formatDayShort(peak.date)} · {peak.count}
          </span>
        ) : (
          <span>Bez dokončených</span>
        )}
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {cells.map((c) => {
          const intensity = max === 0 ? 0 : c.count / max;
          const opacity = c.count === 0 ? 0.08 : 0.25 + intensity * 0.75;
          return (
            <div
              key={c.key}
              title={`${formatDayLong(c.date)} — ${c.count} dokončených`}
              className="h-3.5 w-3.5 rounded-[3px] border border-border/40"
              style={{
                backgroundColor: color,
                opacity,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AdminCollaboratorsOverview() {
  const { data: tasks = [] } = useTasks();
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const [range, setRange] = useState<RangeKey>("30d");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const cutoff = useMemo(() => {
    if (range === "all") return null;
    const days = range === "7d" ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [range]);

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  // Spolupracovníci = všetci profily okrem mňa s aspoň jednou priradenou úlohou
  const groups = useMemo(() => {
    const doneTasks = tasks.filter((t) => {
      if (t.status !== "done" || !t.assignee_id) return false;
      if (cutoff && new Date(t.updated_at) < cutoff) return false;
      return true;
    });

    const byUser = new Map<
      string,
      {
        done: typeof doneTasks;
        openCount: number;
      }
    >();

    for (const p of profiles) {
      byUser.set(p.id, { done: [], openCount: 0 });
    }

    for (const t of tasks) {
      if (!t.assignee_id) continue;
      const entry = byUser.get(t.assignee_id);
      if (!entry) continue;
      if (t.status !== "done") entry.openCount += 1;
    }

    for (const t of doneTasks) {
      const entry = byUser.get(t.assignee_id!);
      if (!entry) continue;
      entry.done.push(t);
    }

    return profiles
      .map((p) => {
        const e = byUser.get(p.id)!;
        const sorted = [...e.done].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        return { profile: p, done: sorted, openCount: e.openCount };
      })
      .filter((g) => g.done.length > 0 || g.openCount > 0)
      .sort((a, b) => b.done.length - a.done.length);
  }, [tasks, profiles, cutoff]);

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
        Zatiaľ žiadni spolupracovníci s úlohami.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 rounded-full bg-surface-muted p-1 text-xs font-medium">
        {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRange(k)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 transition",
              range === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const isOpen = expanded[g.profile.id] ?? false;
        return (
          <div key={g.profile.id} className="card-elevated overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((s) => ({ ...s, [g.profile.id]: !isOpen }))}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <UserAvatar profile={g.profile} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {g.profile.full_name?.trim() || g.profile.email}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    {g.done.length} dokončených
                  </span>
                  <span className="text-border">•</span>
                  <span>{g.openCount} otvorených</span>
                </p>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {isOpen && (
              <div className="border-t border-border/60 bg-surface-muted/40">
                <CompletionHeatmap
                  doneTasks={g.done}
                  range={range}
                  color="hsl(var(--primary))"
                />
                {g.done.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    V tomto období nedokončil žiadnu úlohu.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {g.done.map((t) => {
                      const project = t.project_id ? projectsById.get(t.project_id) : null;
                      return (
                        <li key={t.id} className="flex items-start gap-3 px-3.5 py-3">
                          <span
                            className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: project?.color ?? "#3b82f6" }}
                          />
                          <div className="min-w-0 flex-1">
                            {project && (
                              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {project.name}
                              </p>
                            )}
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Dokončené {formatDateTime(t.updated_at)}
                              {t.due_date && (
                                <>
                                  <span className="mx-1">•</span>
                                  termín {formatDate(t.due_date)}
                                </>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
