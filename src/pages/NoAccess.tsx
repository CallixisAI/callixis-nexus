import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import callixisLogo from "@/assets/callixis-logo.png";

// Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §D.4, exit criterion 5) — the
// floor LandingRedirect and ProtectedRoute's denied-access fallback both use when a signed-in
// user has zero page permissions. Not gated by ProtectedRoute itself — it must be reachable
// by exactly the users everything else bounces, or this becomes the same loop it exists to
// prevent. In practice this should be rare: `pending_role_review` (the parking role Phase 1
// introduced) inherits `operator`'s grants, so it isn't empty either — this page is the
// documented floor for the case, not the expected everyday landing spot.
const NoAccess = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-primary/3 blur-3xl" />

      <div className="w-full max-w-md p-8 space-y-6 text-center relative z-10">
        <div className="flex justify-center">
          <img src={callixisLogo} alt="Callixis AI" width={56} height={56} />
        </div>
        <h1 className="text-2xl font-display tracking-tight text-foreground">No access yet</h1>
        <p className="text-muted-foreground text-sm">
          {profile?.full_name ? `Hi ${profile.full_name}, your` : "Your"} account isn't assigned any
          permissions yet, so there's nothing here to show. Ask an administrator to grant you access
          to at least one page.
        </p>
        <Button
          variant="outline"
          className="w-full h-11"
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default NoAccess;
