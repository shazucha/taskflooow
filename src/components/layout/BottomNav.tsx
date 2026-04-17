import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Prehľad", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projekty", icon: FolderKanban },
  { to: "/tasks", label: "Úlohy", icon: ListChecks },
  { to: "/me", label: "Profil", icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border/60 bg-card/90 backdrop-blur-xl">
      <ul className="grid grid-cols-4">
        {items.map(({ to, label, icon: Icon, end }) => (
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
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                      isActive ? "bg-primary-soft" : "bg-transparent"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
