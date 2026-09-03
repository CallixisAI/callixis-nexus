import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getFirstAccessibleRoute } from "@/lib/permissions";
import { Loading } from "@/components/ProtectedRoute";

// Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §D.4/[E25]) — mounted at "/".
// Login.tsx used to hardcode navigate("/dashboard") after a successful sign-in. A user
// without the `dashboard` permission landed there anyway, and once Phase 0's route guard
// existed that produced an instant kick-out (or a redirect loop) at login — a bug Phase 0
// created and this phase closes. Login now sends everyone to "/" instead, and this component
// waits for permissions to actually be known before picking a real destination.
const LandingRedirect = () => {
  const { user, loading, profileLoaded, isSuper, permissions } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  // Same race §C.1 already guards everywhere else: don't decide a destination before
  // permissions have actually loaded, or a real admin can bounce to /no-access on a fast
  // redirect right after login.
  if (!profileLoaded) return <Loading />;

  const firstRoute = getFirstAccessibleRoute(isSuper, permissions);
  return <Navigate to={firstRoute ?? "/no-access"} replace />;
};

export default LandingRedirect;
