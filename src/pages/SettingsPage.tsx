import { useState, useEffect } from "react";
import { Settings, User, Bell, Key, Building2, Save, Eye, EyeOff, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const { user, profile, role } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [companyName, setCompanyName] = useState(profile?.company_name || "");
  const [saving, setSaving] = useState(false);

  // Notification preferences (local state for now)
  const [notifNewCall, setNotifNewCall] = useState(true);
  const [notifAgentAssist, setNotifAgentAssist] = useState(true);
  const [notifDailySummary, setNotifDailySummary] = useState(false);
  const [notifWeeklyReport, setNotifWeeklyReport] = useState(true);

  // API Keys
  const [showApiKey, setShowApiKey] = useState(false);
  const demoApiKey = "cxai_live_" + (user?.id?.slice(0, 16) || "xxxxxxxxxxxxxxxx");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, company_name: companyName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and platform preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="profile" className="gap-2"><User className="h-3.5 w-3.5" />Profile</TabsTrigger>
          <TabsTrigger value="company" className="gap-2"><Building2 className="h-3.5 w-3.5" />Company</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-3.5 w-3.5" />Notifications</TabsTrigger>
          <TabsTrigger value="api" className="gap-2"><Key className="h-3.5 w-3.5" />API Keys</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Profile Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-secondary border-border h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <Input value={user?.email || ""} disabled className="bg-muted border-border h-10 opacity-60" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Role</Label>
                <Input value={role || "—"} disabled className="bg-muted border-border h-10 opacity-60 capitalize" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Member Since</Label>
                <Input
                  value={user?.created_at ? new Date(user.created_at).toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—"}
                  disabled
                  className="bg-muted border-border h-10 opacity-60"
                />
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 glow-cyan">
              <Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Company Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-secondary border-border h-10" placeholder="Your company" />
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 glow-cyan">
              <Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Notification Preferences</h3>
            <div className="space-y-4">
              {[
                { label: "New incoming call", desc: "Get notified when a new call comes in", state: notifNewCall, setter: setNotifNewCall },
                { label: "Agent needs assistance", desc: "Alert when an AI agent requests help", state: notifAgentAssist, setter: setNotifAgentAssist },
                { label: "Daily summary", desc: "Receive a daily performance summary", state: notifDailySummary, setter: setNotifDailySummary },
                { label: "Weekly report", desc: "Get a weekly analytics report", state: notifWeeklyReport, setter: setNotifWeeklyReport },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={item.state} onCheckedChange={item.setter} />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">API Keys</h3>
            <p className="text-sm text-muted-foreground">Use API keys to integrate Callixis AI with your external systems.</p>
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Live API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={showApiKey ? demoApiKey : "•".repeat(32)}
                  readOnly
                  className="bg-secondary border-border h-10 font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(demoApiKey);
                  toast({ title: "Copied to clipboard" });
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Keep this key secure. Do not share it publicly.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
