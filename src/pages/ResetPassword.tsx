import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import callixisLogo from "@/assets/callixis-logo.png";

// Client-feedback plan §A — the client's complaint verbatim: "it changes the password and drops
// you back without a clear confirmation." This page now:
//   - confirms in-page (a panel, not a 2-second toast) instead of navigating on success
//   - signs the recovery session out FIRST (A.6, load-bearing — see the comment in handleReset)
//   - hands off to /login with a single button rather than pushing the user INTO the app
// Brought up to Activate.tsx's standard while open (A.3/A.4/A.9): 8-char minimum from the shared
// src/lib/password.ts, a confirm-password field, and sonner instead of the shadcn useToast this
// file was one of the last stragglers still on.

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side pre-checks — GoTrue re-validates regardless; these only avoid a round trip on
    // an obviously-doomed submit. Mirrors Activate.tsx:63-70.
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // A.6 — the load-bearing line. updateUser() just ran on a live recovery session, so the user
    // is currently signed IN. Without this signOut, clicking "Go to Login" on the panel below
    // lands on /login, which redirects an already-authenticated user straight back into the app —
    // the client never sees a login screen and the hand-off silently fails, which is the exact
    // behaviour they complained about. Login.tsx:62-67 documents the sibling of this bug being
    // fixed there; ResetPassword was never brought into line.
    await supabase.auth.signOut();

    // A.7 — drop the #type=recovery fragment so a page refresh doesn't re-arm this form against a
    // session that no longer exists.
    window.history.replaceState(null, "", window.location.pathname);

    setLoading(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="w-full max-w-md p-8 space-y-6 relative z-10 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-display tracking-tight">Password updated</h1>
            <p className="text-muted-foreground text-sm">
              Your password has been changed. Sign in with your new password to continue.
            </p>
          </div>
          <Button
            onClick={() => navigate("/login")}
            className="w-full h-11 font-semibold text-sm glow-cyan"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Invalid or expired reset link.</p>
          <Button onClick={() => navigate("/login")} variant="outline">Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="w-full max-w-md p-8 space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={callixisLogo} alt="Callixis AI" width={64} height={64} />
          </div>
          <h1 className="text-3xl font-display tracking-tight">Reset Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new password</p>
        </div>
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-muted-foreground">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-border focus:border-primary h-11"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-secondary border-border focus:border-primary h-11"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          <Button type="submit" className="w-full h-11 font-semibold text-sm glow-cyan" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
