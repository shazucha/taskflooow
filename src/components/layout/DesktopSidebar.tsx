import { useMemo } from "react";
import { NavLink, Link } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListChecks, User, FolderOpen } from "lucide-react";
import { VrHeadsetIcon } from "@/components/VrHeadsetIcon";
import { cn } from "@/lib/utils";
import { useUnreadTeamChat } from "@/lib/useUnreadChat";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useCurrentUserId, useFeedbackNewCount, useIsAppAdmin, useMySubscriptionPendingTotal, useProfiles, useTasks } from "@/lib/queries";
import { pendingTasksForUser } from "@/lib/recurring";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badgeKey?: "team" | "dm" | "tasks" | "projects" | "feedback";
};

export function DesktopSidebar() {
  const teamUnread = useUnreadTeamChat();
  const { total: dmUnread } = useUnreadDirect();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const { data: subPending } = useMySubscriptionPendingTotal();
  const feedbackNew = useFeedbackNewCount();
  const taskPending = useMemo(
    () => pendingTasksForUser(tasks, currentUserId).all.length,
    [tasks, currentUserId]
  );
  const me = profiles.find((p) => p.id === currentUserId);
  const base: NavItem[] = [
    { to: "/", label: "Prehľad", icon: LayoutDashboard, end: true, badgeKey: "team" },
    { to: "/projects", label: "Projekty", icon: FolderKanban, badgeKey: "projects" },
    { to: "/tasks", label: "Úlohy", icon: ListChecks, badgeKey: "tasks" },
    { to: "/company-materials", label: "Firemné materiály", icon: FolderOpen },
    { to: "/vr-liptov", label: "VR Liptov", icon: VrHeadsetIcon as unknown as typeof LayoutDashboard },
    { to: "/me", label: "Profil", icon: User },
  ];
  const items: NavItem[] = base;


  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/50 bg-card/70 backdrop-blur-2xl md:flex">
      <div className="flex items-center gap-3 px-6 py-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground font-display text-lg font-bold shadow-[var(--shadow-glow)]">
          T
        </div>
        <div className="leading-tight">
          <span className="block font-display text-base font-bold tracking-tight">Taskflow</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace</span>
        </div>
      </div>


      <nav aria-label="Hlavná navigácia" className="flex-1 overflow-y-auto px-3 pb-2">
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
                : badgeKey === "feedback"
                ? feedbackNew
                : 0;
            const glow = badgeKey === "tasks" || badgeKey === "projects" || badgeKey === "feedback";
            const badgeTitle =
              badgeKey === "tasks"
                ? `${badge} nedokončených úloh v aktuálnom mesiaci (červené = po termíne)`
                : badgeKey === "projects"
                ? `${badge} nedokončených položiek v náplni predplatného`
                : badgeKey === "feedback"
                ? `${badge} nových nahlásení (chyby/vylepšenia)`
                : undefined;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  title={badgeTitle}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                      isActive
                        ? "bg-gradient-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                        : "text-muted-foreground hover:translate-x-0.5 hover:bg-surface-muted hover:text-foreground"
                    )
                  }
                >

                  <span className="relative flex h-5 w-5 items-center justify-center">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
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

      <div className="px-3">
        <ThemeToggle className="w-full justify-center" withLabel />
      </div>

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