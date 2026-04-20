import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import callixisLogo from "@/assets/callixis-logo.png";

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"affiliate" | "brand">("affiliate");
  const [loading, setLoading] = useState(false);
  const [isInvited, setIsInvited] = useState(false);
  const [signupMode, setSignupMode] = useState<"pending" | "instant">("instant");

  // Check if this email has a pre-provisioned invite
  useEffect(() => {
    const checkInvite = async () => {
      if (!email) return;
      const { data } = await supabase
        .from('user_invites')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();
      
      if (data) {
        setFullName(data.full_name);
        setPhone(data.phone || "");
        setRole(data.role);
        setIsInvited(true);
      }
    };
    checkInvite();
  }, [email]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone, role },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setLoading(false);
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      return;
    }

    const hasSession = !!data.session;
    setSignupMode(hasSession ? "instant" : "pending");
    setLoading(false);

    if (hasSession) {
      toast({
        title: "Welcome to Callixis AI",
        description: "Your account is active. You can sign in immediately.",
      });
      navigate("/dashboard");
      return;
    }

    toast({
      title: "Account created",
      description: "Your signup was accepted. If email confirmation is still enabled in Supabase, check your inbox before signing in.",
    });
    navigate("/login");
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
            Join Callixis<span className="text-gradient-cyan">-AI</span>
          </h1>
          <p className="text-muted-foreground text-sm">Create your account to get started</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm text-muted-foreground">Full Name</Label>
            <Input
              id="fullName"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-secondary border-border focus:border-primary h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm text-muted-foreground">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-secondary border-border focus:border-primary h-11"
              required
            />
          </div>
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
            <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-border focus:border-primary h-11"
              minLength={6}
              required
            />
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">I am a...</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("affiliate")}
                className={`p-4 rounded-lg border text-center transition-all ${
                  role === "affiliate"
                    ? "border-primary bg-primary/10 text-foreground glow-cyan"
                    : "border-border bg-secondary text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span className="block text-sm font-medium">Affiliate</span>
                <span className="block text-xs mt-1 text-muted-foreground">Drive leads & earn</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("brand")}
                className={`p-4 rounded-lg border text-center transition-all ${
                  role === "brand"
                    ? "border-primary bg-primary/10 text-foreground glow-cyan"
                    : "border-border bg-secondary text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span className="block text-sm font-medium">Brand</span>
                <span className="block text-xs mt-1 text-muted-foreground">Buy leads & scale</span>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-11 font-semibold text-sm glow-cyan" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
