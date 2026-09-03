import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import { getFirstAccessibleRoute } from "@/lib/permissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §D): `requireRole` is gone.
  // /admin used to be the one route gated on a hardcoded role string (Phase 0 §C.7,
  // deliberately an interim step) — it now goes through the same `requirePermission` gate
  // as every other route, sourced from the same resolver. See src/lib/access.ts.
  requirePermission?: string;
}

// Exported so LandingRedirect (the "/" route) can show the same spinner instead of a
// second implementation while it waits on the same profileLoaded flag.
export const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children, requirePermission }: ProtectedRouteProps) => {
  const { user, loading, profileLoaded, isSuper, permissions } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  // §C.1: wait for profileLoaded too, not just loading. `loading` goes false as soon as
  // the session resolves, while role/profile/permissions are still mid-fetch — deciding
  // "denied" in that window would boot a real admin off /admin on every hard refresh.
  const access = canAccess({ profileLoaded, isSuper, permissions }, { requirePermission });

  if (access === "pending") return <Loading />;

  // §C.5/§D.1: a logged-in user who is denied goes to the first route their own
  // permissions actually allow, not a hardcoded "/dashboard". Hardcoding it here had the
  // same bug [E25] fixed on Login.tsx for a different trigger: a user without `dashboard`
  // who is denied on some other route (a stale bookmark, a link they used to have) would be
  // bounced to /dashboard, denied there too, and bounced to /dashboard again — a redirect
  // loop, not a fix. getFirstAccessibleRoute can never return the very route that was just
  // denied (by construction it only returns routes the permission check passes), so this
  // cannot loop; /no-access is the floor for a user with zero page permissions.
  if (access === "denied") return <Navigate to={getFirstAccessibleRoute(isSuper, permissions) ?? "/no-access"} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
