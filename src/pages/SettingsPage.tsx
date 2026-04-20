import { useState, useEffect } from "react";
import { User, Bell, Key, Building2, Save, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const { user, profile, role } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [companyName, setCompanyName] = useState(profile?.company_name || "");
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const derivedApiKey = "cxai_live_" + (user?.id?.slice(0, 16) || "xxxxxxxxxxxxxxxx");

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
        <p className="text-sm text-muted-foreground mt-1">Manage the profile data that is actually stored today.</p>
      </div>

      <Card className="bg-card border-border p-4 text-xs text-muted-foreground leading-relaxed">
        This page currently has one real persistence target: your `profiles` row. Notification preferences and API key management are not backed by database tables yet, so they are presented as informational status only instead of fake toggles.
      </Card>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="profile" className="gap-2"><User className="h-3.5 w-3.5" />Profile</TabsTrigger>
          <TabsTrigger value="company" className="gap-2"><Building2 className="h-3.5 w-3.5" />Company</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-3.5 w-3.5" />Notifications</TabsTrigger>
          <TabsTrigger value="api" className="gap-2"><Key className="h-3.5 w-3.5" />API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Profile Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Full Name</Label>
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} className="bg-secondary border-border h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Email</Label>
                <Input value={user?.email || profile?.email || ""} disabled className="bg-muted border-border h-10 opacity-60" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Role</Label>
                <Input value={role || "—"} disabled className="bg-muted border-border h-10 opacity-60 capitalize" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Member Since</Label>
                <Input value={user?.created_at ? new Date(user.created_at).toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—"} disabled className="bg-muted border-border h-10 opacity-60" />
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 glow-cyan"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="company" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Company Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Company Name</Label>
                <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="bg-secondary border-border h-10" placeholder="Your company" />
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 glow-cyan"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">Notification Preferences</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="py-2 border-b border-border">
                <p className="text-foreground">Notification storage is not implemented yet</p>
                <p className="text-xs mt-1">There is currently no table or persisted user preference model behind notification settings.</p>
              </div>
              <div className="py-2 border-b border-border">
                <p className="text-foreground">Current practical source of alerts</p>
                <p className="text-xs mt-1">Operational alerts currently come from the live app screens, not a saved settings system.</p>
              </div>
              <div className="py-2">
                <p className="text-foreground">Recommended next backend step</p>
                <p className="text-xs mt-1">Add a `user_notification_preferences` table before rebuilding this as an interactive settings form.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-6 space-y-5">
            <h3 className="text-foreground font-medium">API Keys</h3>
            <p className="text-sm text-muted-foreground">There is no real API key issuance flow yet. The value shown below is a derived placeholder from your user id and should not be treated as a working secret.</p>
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">Derived Placeholder Key</Label>
              <div className="flex gap-2">
                <Input value={showApiKey ? derivedApiKey : "•".repeat(32)} readOnly className="bg-secondary border-border h-10 font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                <Button variant="outline" size="icon" onClick={() => {
                  navigator.clipboard.writeText(derivedApiKey);
                  toast({ title: "Copied placeholder key" });
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Useful for UI prototyping only. Replace this tab with a real key issuance backend before exposing it publicly.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
