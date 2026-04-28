import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { TeamMembersRail } from "@/components/TeamMembersRail";
import { useTeamPresence } from "@/lib/useTeamPresence";

export function AppShell() {
  // Keep global app presence alive on every protected route and viewport.
  // The desktop rail is not mounted on mobile, so it cannot be responsible
  // for publishing whether a user is online.
  useTeamPresence();

  return (
    <div className="app-shell">
      <DesktopSidebar />
      <Outlet />
      <BottomNav />
      <TeamMembersRail />
    </div>
  );
}
