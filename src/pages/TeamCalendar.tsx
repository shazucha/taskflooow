import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CalendarDays, Users2 } from "lucide-react";
import { CalendarWidget } from "@/components/CalendarWidget";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import {
  useCurrentUserId,
  useIsAppAdminStatus,
  useProfiles,
  useTasks,
} from "@/lib/queries";

type Layout = "merged" | "columns";

export default function TeamCalendar() {
  const { isAdmin, loading: adminLoading } = useIsAppAdminStatus();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("merged");

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

  // Wait for the session to hydrate before deciding whether to redirect.
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
    </div>
  );
}