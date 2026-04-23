import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListChecks, User, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadTeamChat } from "@/lib/useUnreadChat";
import { useIsAppAdmin } from "@/lib/queries";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badgeKey?: "team";
};

const baseItems: NavItem[] = [
  { to: "/", label: "Prehľad", icon: LayoutDashboard, end: true, badgeKey: "team" },
  { to: "/projects", label: "Projekty", icon: FolderKanban },
  { to: "/tasks", label: "Úlohy", icon: ListChecks },
  { to: "/me", label: "Profil", icon: User },
];

export function BottomNav() {
  const teamUnread = useUnreadTeamChat();
  const isAdmin = useIsAppAdmin();
  const items: NavItem[] = isAdmin
    ? [
        baseItems[0],
        baseItems[1],
        baseItems[2],
        { to: "/admin/team", label: "Tím", icon: Users2 },
        baseItems[3],
      ]
    : baseItems;

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border/60 bg-card/90 backdrop-blur-xl md:hidden">
      <ul className={cn("grid", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
        {items.map(({ to, label, icon: Icon, end, badgeKey }) => {
          const badge = badgeKey === "team" ? teamUnread : 0;
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                        isActive ? "bg-primary-soft" : "bg-transparent"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                      {badge > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
