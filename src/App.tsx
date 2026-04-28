import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Tasks from "./pages/Tasks";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import Auth from "./pages/Auth";
import GoogleOAuthCallback from "./pages/GoogleOAuthCallback";
import GoogleSyncDiag from "./pages/GoogleSyncDiag";
import PresenceDiag from "./pages/PresenceDiag";
import TeamCalendar from "./pages/TeamCalendar";
import CompanyMaterials from "./pages/CompanyMaterials";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/google/callback" element={<GoogleOAuthCallback />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/chat" element={<Messages />} />
            <Route path="/me" element={<Profile />} />
            <Route path="/team-calendar" element={<TeamCalendar />} />
            <Route path="/company-materials" element={<CompanyMaterials />} />
            <Route path="/diag/google-sync" element={<GoogleSyncDiag />} />
            <Route path="/diag/presence" element={<PresenceDiag />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
