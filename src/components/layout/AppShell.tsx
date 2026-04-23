import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";

export function AppShell() {
  return (
    <div className="app-shell">
      <DesktopSidebar />
      <Outlet />
      <BottomNav />
    </div>
  );
}
