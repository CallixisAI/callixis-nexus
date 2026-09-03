import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { describeFunctionError } from "@/lib/functionError";
import callixisLogo from "@/assets/callixis-logo.png";

// Phase 4 (docs/admin-module-plan/PHASE-4-invite-and-activation.md §F) — the unauthenticated
// route an invitation link points at. Two steps against the same edge function
// (supabase/functions/activate-invite): a token-only 'lookup' on mount (§F.3 — show which
// email/role is being activated before asking for anything), then an 'activate' submit
// carrying token + code + password together. See that function's own header for why the auth
// user doesn't exist until this succeeds, and for the generic-error reasoning behind §D.4.
const MIN_PASSWORD_LENGTH = 8;

type LookupState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; email: string; fullName: string; roleLabel: string };

const Activate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [lookup, setLookup] = useState<LookupState>({ status: "loading" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const runLookup = useCallback(async () => {
    if (!token) {
      setLookup({ status: "error", message: "This activation link is missing its token." });
      return;
    }
    const { data, error } = await supabase.functions.invoke("activate-invite", {
      body: { action: "lookup", token },
    });
    if (error || data?.error) {
      const message = data?.error ?? (await describeFunctionError(error, "This invitation link is invalid, expired, or already used."));
      setLookup({ status: "error", message });
      return;
    }
    setLookup({ status: "ready", email: data.email, fullName: data.full_name, roleLabel: data.role_label });
  }, [token]);

  useEffect(() => {
    runLookup();
  }, [runLookup]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lookup.status !== "ready") return;

    // Client-side copies of §D.5/F.5's server-enforced rules — checked here purely to avoid
    // a round trip for an obviously-doomed submission; activate-invite re-checks both
    // regardless, since a client-side check is decoration (this project's own recurring rule).
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("activate-invite", {
      body: { action: "activate", token, code, password },
    });

    if (error || data?.error) {
      const message = data?.error ?? (await describeFunctionError(error, "Activation failed. Check your code and try again."));
      toast.error(message);
      setSubmitting(false);
      return;
    }

    // activate-invite ran on the service role — it created the account but never gave this
    // browser a session. Sign in for real now that the password is proven correct.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: lookup.email,
      password,
    });
    setSubmitting(false);

    if (signInError) {
      toast.success("Account activated. Sign in with your new password.");
      navigate("/login");
      return;
    }

    toast.success(`Welcome to Callixis AI${lookup.fullName ? `, ${lookup.fullName.split(" ")[0]}` : ""}!`);
    navigate("/");
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
          <h1 className="text-3xl font-display tracking-tight">Activate your account</h1>
        </div>

        {lookup.status === "loading" && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {lookup.status === "error" && (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground text-sm">{lookup.message}</p>
            <Link to="/login">
              <Button variant="outline">Back to login</Button>
            </Link>
          </div>
        )}

        {lookup.status === "ready" && (
          <form onSubmit={handleActivate} className="space-y-5">
            <p className="text-center text-sm text-muted-foreground">
              Activating <span className="text-foreground font-medium">{lookup.email}</span>
              {lookup.fullName ? <> as <span className="text-foreground font-medium">{lookup.fullName}</span></> : null}
            </p>

            {/* §F.4 [E29]: read-only, no picker. The role came from the invite; Phase 1's
                server-side assignment (handle_new_user()) ignores anything the browser sends
                regardless — leaving an editable control here would just be a control that
                lies about doing something. */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">You've been invited as</Label>
              <div className="h-11 flex items-center px-3 rounded-md bg-secondary/50 border border-border text-sm text-foreground">
                {lookup.roleLabel}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code" className="text-sm text-muted-foreground">Activation code</Label>
              <Input
                id="code"
                placeholder="XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-secondary border-border focus:border-primary h-11 tracking-widest text-center font-mono uppercase"
                autoComplete="one-time-code"
                required
              />
              <p className="text-xs text-muted-foreground">From the invitation email — dashes are optional.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">New password</Label>
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
              <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">Confirm password</Label>
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

            <Button type="submit" className="w-full h-11 font-semibold text-sm glow-cyan" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate account"}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Already active? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Activate;
