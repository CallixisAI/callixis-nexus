import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import callixisLogo from "@/assets/callixis-logo.png";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Phase 4 §F.7 — App.tsx redirects the old public /signup URL here with this flag rather
  // than 404ing it; people still have it bookmarked or linked from pre-Phase-4 invites.
  useEffect(() => {
    if ((location.state as { signupDisabled?: boolean } | null)?.signupDisabled) {
      toast({
        title: "Accounts are invite-only",
        description: "Public sign-up is off. Ask an admin to send you an invitation.",
      });
    }
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      return;
    }

    // Phase 5 (docs/admin-module-plan/PHASE-5-ip-whitelisting.md §D.2) — session-guard runs
    // immediately after sign-in succeeds, before navigating anywhere. D-5 recorded decision:
    // checked at login only, not continuously (see session-guard/index.ts's own header for
    // why that's a materially weaker claim than "checked continuously," written down rather
    // than silently implied). A guardError (function unreachable, cold start, etc.) fails
    // open deliberately — an outage of this function must not become an outage of login
    // itself; the RLS layer (ip_allowed(), in the migration) is what actually holds under
    // attack and has no equivalent escape hatch.
    const { data: guard, error: guardError } = await supabase.functions.invoke("session-guard");
    if (!guardError && guard?.allowed === false) {
      await supabase.auth.signOut();
      toast({
        title: "Access denied",
        description: `Access denied from network ${guard.ip ?? "unknown"} — ask an administrator to whitelist this address.`,
        variant: "destructive",
      });
      return;
    }

    // Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §D.4/[E25]) — was a
    // hardcoded navigate("/dashboard"). A user without the `dashboard` permission landed
    // there anyway, and with Phase 0's route guard in place that's an instant kick-out or a
    // redirect loop, not a login. "/" now runs LandingRedirect, which waits for the user's
    // real permissions to load and picks the first route they actually have.
    navigate("/");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Check your email", description: "We sent you a password reset link." });
    setShowForgot(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-primary/3 blur-3xl" />

      <div className="w-full max-w-md p-8 space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={callixisLogo} alt="Callixis AI" width={64} height={64} />
          </div>
          <h1 className="text-3xl font-display tracking-tight">
            Callixis<span className="text-gradient-cyan">-AI</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in to your AI Call Center Platform
          </p>
        </div>

        {showForgot ? (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="forgotEmail" className="text-sm text-muted-foreground">Email</Label>
              <Input
                id="forgotEmail"
                type="email"
                placeholder="you@company.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="bg-secondary border-border focus:border-primary h-11"
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold text-sm glow-cyan" disabled={forgotLoading}>
              {forgotLoading ? "Sending..." : "Send Reset Link"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <button type="button" onClick={() => setShowForgot(false)} className="text-primary hover:underline">
                Back to Sign In
              </button>
            </p>
          </form>
        ) : (
          <>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-secondary border-border focus:border-primary h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-secondary border-border focus:border-primary h-11"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold text-sm glow-cyan" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {/* Phase 4 §F.7/D-4: public signup is off (confirmed live) — nothing to link to
                anymore. Accounts arrive via /admin's invite flow (Phase 4 §E) instead. */}
            <p className="text-center text-xs text-muted-foreground">
              Accounts are invite-only. Ask an admin to send you an invitation.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
