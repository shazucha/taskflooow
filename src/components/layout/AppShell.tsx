import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { TeamMembersRail } from "@/components/TeamMembersRail";

export function AppShell() {
  return (
    <div className="app-shell">
      <DesktopSidebar />
      <Outlet />
      <BottomNav />
      <TeamMembersRail />
    </div>
  );
}
