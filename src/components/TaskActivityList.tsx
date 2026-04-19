import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { sk } from "date-fns/locale";
import { History } from "lucide-react";
import { useProjects, useProfiles, useTaskActivity } from "@/lib/queries";
import { PRIORITY_META, STATUS_LABEL, type Priority, type TaskActivity, type TaskStatus } from "@/lib/types";
import { UserAvatar } from "./UserAvatar";

const FIELD_LABEL: Record<string, string> = {
  title: "názov",
  description: "popis",
  priority: "prioritu",
  status: "stav",
  project_id: "projekt",
  assignee_id: "hlavného zodpovedného",
  due_date: "termín",
  due_end: "koniec termínu",
};

interface Props {
  taskId: string;
}

export function TaskActivityList({ taskId }: Props) {
  const { data: activity = [], isLoading } = useTaskActivity(taskId);
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();

  const profileById = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p]));
    return m;
  }, [profiles]);
  const projectById = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p]));
    return m;
  }, [projects]);

  const formatValue = (field: string | null, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "priority") return PRIORITY_META[value as Priority]?.label ?? String(value);
    if (field === "status") return STATUS_LABEL[value as TaskStatus] ?? String(value);
    if (field === "project_id") {
      const p = projectById.get(value as string);
      return p?.name ?? "neznámy projekt";
    }
    if (field === "assignee_id") {
      const p = profileById.get(value as string);
      return p?.full_name ?? p?.email ?? "neznámy";
    }
    if (field === "due_date" || field === "due_end") {
      try {
        return new Date(value as string).toLocaleString("sk-SK", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return String(value);
      }
    }
    if (field === "description") {
      const s = String(value);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    }
    return String(value);
  };

  const renderEntry = (a: TaskActivity) => {
    if (a.action === "created") return <>vytvoril(a) úlohu</>;
    if (a.action === "watcher_added") {
      const p = profileById.get(a.new_value as string);
      return (
        <>
          pridal(a) spolupracovníka{" "}
          <strong>{p?.full_name ?? p?.email ?? "neznámy"}</strong>
        </>
      );
    }
    if (a.action === "watcher_removed") {
      const p = profileById.get(a.old_value as string);
      return (
        <>
          odobral(a) spolupracovníka{" "}
          <strong>{p?.full_name ?? p?.email ?? "neznámy"}</strong>
        </>
      );
    }
    // field_changed
    const label = FIELD_LABEL[a.field ?? ""] ?? a.field ?? "pole";
    const oldV = formatValue(a.field, a.old_value);
    const newV = formatValue(a.field, a.new_value);
    return (
      <>
        zmenil(a) <strong>{label}</strong>: <span className="text-muted-foreground">{oldV}</span>
        {" → "}
        <strong>{newV}</strong>
      </>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <History className="h-3.5 w-3.5" /> História zmien
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam…</p>
      ) : activity.length === 0 ? (
        <p className="text-xs text-muted-foreground">Zatiaľ žiadne zmeny.</p>
      ) : (
        <ul className="space-y-1.5 rounded-xl border border-border/60 bg-surface-muted/40 p-2 max-h-64 overflow-y-auto">
          {activity.map((a) => {
            const actor = a.actor_id ? profileById.get(a.actor_id) : undefined;
            return (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                {actor ? (
                  <UserAvatar profile={actor} size="sm" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="leading-snug">
                    <span className="font-semibold">
                      {actor?.full_name ?? actor?.email ?? "Niekto"}
                    </span>{" "}
                    {renderEntry(a)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: sk })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
