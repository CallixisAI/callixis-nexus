import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingRedirect from "@/components/LandingRedirect";
import Login from "./pages/Login";
import Activate from "./pages/Activate";
import ResetPassword from "./pages/ResetPassword";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Campaigns from "./pages/Campaigns";
import AIAgents from "./pages/AIAgents";
import Plugins from "./pages/Plugins";
import CallCenter from "./pages/CallCenter";
import Reports from "./pages/Reports";
import Finance from "./pages/Finance";
import SettingsPage from "./pages/SettingsPage";
import Marketplace from "./pages/Marketplace";
import CalendarScheduling from "./pages/CalendarScheduling";
import NoAccess from "./pages/NoAccess";
import NotFound from "./pages/NotFound";

// docs/counting-model-plan/README.md, Phase 2 §B.7 — `retry` only. staleTime/refetchInterval
// live on useAccountData.ts alone (§B.2); a global staleTime here would silently change the
// freshness of every other query in the app (useUsers/useRoles/useAuditLog/useSecurity chief
// among them) — none of which this plan has a mandate to touch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Phase 2 §D.4/[E25]: was `<Navigate to="/login" replace />` unconditionally.
                  LandingRedirect sends an unauthenticated visitor to /login exactly the same
                  as before, but a signed-in one to the first route their own permissions
                  allow instead of a fixed page — see src/components/LandingRedirect.tsx. */}
              <Route path="/" element={<LandingRedirect />} />
              <Route path="/login" element={<Login />} />
              {/* Phase 4 §F.7: D-4 (Phase 0) turned public signup off, confirmed live
                  (disable_signup: true) — the old Signup.tsx's auth.signUp() call would 400
                  for every visitor regardless of anything this route did, so it's deleted
                  rather than left as unreachable dead code (same reasoning Phase 2 used to
                  remove the unused requireRole mechanism). Redirect rather than 404 the URL;
                  people still have it bookmarked or linked from pre-Phase-4 invites. Real
                  onboarding is /activate now. */}
              <Route path="/signup" element={<Navigate to="/login" replace state={{ signupDisabled: true }} />} />
              <Route path="/activate" element={<Activate />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Reachable outside the permission system on purpose — it's the floor
                  LandingRedirect and ProtectedRoute's denied fallback both land on for a
                  user with zero page permissions. Gating it would recreate the loop it
                  exists to stop. */}
              <Route path="/no-access" element={<NoAccess />} />
              {/*
                Phase 0 §C.2/§C.4: the outer ProtectedRoute here only proves "logged in,
                and role/profile have finished loading" (it carries no requirement, so
                `canAccess` always resolves "allowed" once profileLoaded is true) — it
                exists to gate AppLayout/the sidebar itself. Each nested route then carries
                its own requirement, matching AppSidebar's permission map 1:1 so a denied
                user can't reach a page by URL that the sidebar already hides from them —
                the sidebar filter stays in place too (§C.6); this is belt and braces, not
                a replacement for it.
              */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<ProtectedRoute requirePermission="dashboard"><Dashboard /></ProtectedRoute>} />
                {/* Phase 2 §D.3: was gated on requireRole="admin" (Phase 0 §C.7's deliberate
                    interim step). Now the same requirePermission gate as every other route.
                    Key is `admin.roles_invites`, NOT the placeholder `admin.users` the phase
                    doc names — see src/lib/permissions.ts's comment for why: the real,
                    already-seeded matrix (Phase 1) grants this to super_admin only, matching
                    the live RLS policies on user_invites/user_permissions. A plain `admin`
                    loses this nav item and route as a result — that is the source matrix's
                    decision (D-2), not a bug introduced here. */}
                <Route path="/admin" element={<ProtectedRoute requirePermission="admin.roles_invites"><Admin /></ProtectedRoute>} />
                <Route path="/campaigns" element={<ProtectedRoute requirePermission="campaigns"><Campaigns /></ProtectedRoute>} />
                <Route path="/ai-agents" element={<ProtectedRoute requirePermission="ai-agents"><AIAgents /></ProtectedRoute>} />
                <Route path="/plugins" element={<ProtectedRoute requirePermission="plugins"><Plugins /></ProtectedRoute>} />
                <Route path="/call-center" element={<ProtectedRoute requirePermission="call-center"><CallCenter /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute requirePermission="reports"><Reports /></ProtectedRoute>} />
                <Route path="/finance" element={<ProtectedRoute requirePermission="finance"><Finance /></ProtectedRoute>} />
                <Route path="/marketplace" element={<ProtectedRoute requirePermission="marketplace"><Marketplace /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute requirePermission="calendar"><CalendarScheduling /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requirePermission="settings"><SettingsPage /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
