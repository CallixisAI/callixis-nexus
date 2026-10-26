import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";

export function DemoModeSettingsCard() {
  const { role } = useAuth();
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const active = localStorage.getItem("callixis_demo_mode") === "true";
    setIsDemo(active);
  }, []);

  const toggleDemo = (checked: boolean) => {
    setIsDemo(checked);
    localStorage.setItem("callixis_demo_mode", checked ? "true" : "false");
    window.location.reload();
  };

  if (role !== "super_admin" && role !== "admin") {
    return null;
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 v-5 text-primary" />
        <h3 className="text-foreground font-medium text-base">Demo Account Mode</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Enable Demo Mode to instantly populate your CRM with 6 months of active campaigns, enterprise leads, AI agents, and call transcripts for client presentations.
      </p>
      <div className="flex items-center justify-between pt-2">
        <Label htmlFor="demo-mode-switch" className="text-sm font-medium text-foreground cursor-pointer">
          {isDemo ? "Demo Mode is Active" : "Enable Demo Mode"}
        </Label>
        <Switch
          id="demo-mode-switch"
          checked={isDemo}
          onCheckedChange={toggleDemo}
        />
      </div>
    </div>
  );
}
