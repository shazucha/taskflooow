import { useMemo } from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListChecks, MessageCircle, User, CalendarDays, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadTeamChat } from "@/lib/useUnreadChat";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import { UserAvatar } from "@/components/UserAvatar";
import { useCurrentUserId, useIsAppAdmin, useMySubscriptionPendingTotal, useProfiles, useTasks } from "@/lib/queries";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badgeKey?: "team" | "dm" | "tasks" | "projects";
};

export function DesktopSidebar() {
  const teamUnread = useUnreadTeamChat();
  const { total: dmUnread } = useUnreadDirect();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const { data: subPending } = useMySubscriptionPendingTotal();
  const taskPending = useMemo(
    () =>
      currentUserId
        ? tasks.filter((t) => t.assignee_id === currentUserId && t.status !== "done").length
        : 0,
    [tasks, currentUserId]
  );
  const isAdmin = useIsAppAdmin();
  const me = profiles.find((p) => p.id === currentUserId);
  const base: NavItem[] = [
    { to: "/", label: "Prehľad", icon: LayoutDashboard, end: true, badgeKey: "team" },
    { to: "/projects", label: "Projekty", icon: FolderKanban, badgeKey: "projects" },
    { to: "/tasks", label: "Úlohy", icon: ListChecks, badgeKey: "tasks" },
    { to: "/company-materials", label: "Firemné materiály", icon: FolderOpen },
    { to: "/chat", label: "Chat", icon: MessageCircle, badgeKey: "dm" },
    { to: "/me", label: "Profil", icon: User },
  ];
  const items: NavItem[] = isAdmin
    ? [
        ...base,
        { to: "/team-calendar", label: "Tímový kalendár", icon: CalendarDays },
      ]
    : base;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card/60 backdrop-blur-xl md:flex">
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
          T
        </div>
        <span className="text-base font-bold tracking-tight">Taskflow</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon, end, badgeKey }) => {
            const badge =
              badgeKey === "team"
                ? teamUnread
                : badgeKey === "dm"
                ? dmUnread
                : badgeKey === "tasks"
                ? taskPending
                : badgeKey === "projects"
                ? subPending?.total ?? 0
                : 0;
            const glow = badgeKey === "tasks" || badgeKey === "projects";
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    )
                  }
                >
                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    {badge > 0 && (
                      <span
                        className={cn(
                          "absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                          glow
                            ? "bg-priority-high text-white shadow-[0_0_10px_hsl(var(--priority-high)/0.6)] ring-2 ring-background"
                            : "bg-destructive text-destructive-foreground"
                        )}
                      >
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        to="/me"
        className="m-3 flex items-center gap-3 rounded-xl border border-border/60 p-3 transition hover:bg-surface-muted"
      >
        <UserAvatar profile={me} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{me?.full_name?.trim() || "Profil"}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
        </div>
      </Link>
    </aside>
  );
}