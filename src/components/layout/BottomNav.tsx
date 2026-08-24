import { useMemo } from "react";
import type React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListChecks, User, FolderOpen } from "lucide-react";
import { VrHeadsetIcon } from "@/components/VrHeadsetIcon";
import { cn } from "@/lib/utils";
import { useUnreadTeamChat } from "@/lib/useUnreadChat";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import { useCurrentUserId, useMySubscriptionPendingTotal, useTasks } from "@/lib/queries";
import { pendingTasksForUser } from "@/lib/recurring";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badgeKey?: "team" | "dm" | "tasks" | "projects";
};

// Hlavné sekcie sa posúvajú vodorovne, VR Liptov a Profil sú vždy zafixované vpravo.
const scrollItems: NavItem[] = [
  { to: "/", label: "Prehľad", icon: LayoutDashboard, end: true, badgeKey: "team" },
  { to: "/projects", label: "Projekty", icon: FolderKanban, badgeKey: "projects" },
  { to: "/tasks", label: "Úlohy", icon: ListChecks, badgeKey: "tasks" },
  { to: "/company-materials", label: "Materiály", icon: FolderOpen },
];

const pinnedItems: NavItem[] = [
  { to: "/vr-liptov", label: "VR Liptov", icon: VrHeadsetIcon as unknown as typeof LayoutDashboard },
  { to: "/me", label: "Profil", icon: User },
];

export function BottomNav() {
  const teamUnread = useUnreadTeamChat();
  const { total: dmUnread } = useUnreadDirect();
  const currentUserId = useCurrentUserId();
  const { data: tasks = [] } = useTasks();
  const { data: subPending } = useMySubscriptionPendingTotal();
  const taskPending = useMemo(
    () => pendingTasksForUser(tasks, currentUserId).all.length,
    [tasks, currentUserId]
  );
  const renderItem = ({ to, label, icon: Icon, end, badgeKey }: NavItem) => {
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
    const badgeTitle =
      badgeKey === "tasks"
        ? `${badge} nedokončených úloh v aktuálnom mesiaci (červené = po termíne)`
        : badgeKey === "projects"
        ? `${badge} nedokončených položiek v náplni predplatného`
        : undefined;
    return (
      <li key={to} className="shrink-0 snap-start">
        <NavLink
          to={to}
          end={end}
          title={badgeTitle}
          className={({ isActive }) =>
            cn(
              "flex w-[68px] flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all",
                  isActive
                    ? "bg-gradient-primary text-primary-foreground shadow-[var(--shadow-glow)] scale-105"
                    : "bg-transparent"
                )}
              >
                <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} aria-hidden />
                {badge > 0 && (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                      glow
                        ? "bg-priority-high text-white shadow-[0_0_10px_hsl(var(--priority-high)/0.6)] ring-2 ring-background"
                        : "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="max-w-[64px] truncate">{label}</span>
            </>
          )}
        </NavLink>
      </li>
    );
  };

  // Ovládanie pásu klávesnicou: šípky presúvajú fokus medzi položkami.
  const onStripKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
    const idx = links.findIndex((l) => l === document.activeElement);
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowRight") next = Math.min(links.length - 1, idx + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else next = links.length - 1;
    const target = links[next < 0 ? 0 : next];
    target?.focus();
    target?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };

  return (
    <nav
      aria-label="Hlavná navigácia"
      className="fixed bottom-0 left-0 z-40 flex w-full items-stretch border-t border-border/50 bg-card/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-18px_hsl(224_45%_12%/0.35)] backdrop-blur-2xl md:hidden"
    >
      {/* Posúvateľné hlavné sekcie */}
      <ul
        onKeyDown={onStripKeyDown}
        aria-label="Hlavné sekcie (posun šípkami)"
        className="flex flex-1 snap-x snap-mandatory gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {scrollItems.map(renderItem)}
      </ul>

      {/* Fixná skupina: VR Liptov + Profil */}
      <ul className="flex shrink-0 gap-0.5 border-l border-border/50 bg-surface-muted/40 px-1">
        {pinnedItems.map(renderItem)}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
