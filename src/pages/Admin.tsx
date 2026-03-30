import { useState, useEffect } from "react";
import { 
  Users, 
  Shield, 
  Mail, 
  UserPlus, 
  Phone, 
  CheckCircle2, 
  XCircle,
  LayoutDashboard,
  Megaphone,
  Bot,
  Puzzle,
  Headphones,
  BarChart3,
  DollarSign,
  Store,
  CalendarCheck,
  Settings,
  Lock,
  Loader2,
  Copy,
  ExternalLink,
  Trash2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Define all possible app features for the permission checklist
const APP_FEATURES = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "ai-agents", label: "AI Agents", icon: Bot },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "call-center", label: "Call Center", icon: Headphones },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "finance", label: "Finance", icon: DollarSign },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "calendar", label: "Calendar", icon: CalendarCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

interface UserSlot {
  id: string;
  auth_id?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  permissions: string[];
  isCreated: boolean;
}

const Admin = () => {
  const [loading, setLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState("user1");
  const [slots, setSlots] = useState<Record<string, UserSlot>>({
    user1: { id: "user1", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user2: { id: "user2", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user3: { id: "user3", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user4: { id: "user4", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user5: { id: "user5", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
  });

  // Load existing users from profiles & user_roles on mount
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // Try fetching, but wrap in safe check to avoid crash if tables don't exist yet
        const { data: profiles } = await supabase.from('profiles').select('*');
        const { data: roles } = await supabase.from('user_roles').select('*');
        const { data: perms } = await supabase.from('user_permissions').select('*');

        if (profiles && roles) {
          const newSlots = { ...slots };
          profiles.forEach((profile, index) => {
            if (index < 5) {
              const slotId = `user${index + 1}`;
              const userRole = roles?.find(r => r.user_id === profile.id)?.role || 'brand';
              const userPerms = perms?.filter(p => p.user_id === profile.id).map(p => p.permission_key) || ["dashboard"];
              
              newSlots[slotId] = {
                id: slotId,
                auth_id: profile.id,
                name: profile.full_name || "",
                email: "", 
                phone: (profile as any).phone || "",
                role: userRole,
                permissions: userPerms,
                isCreated: true
              };
            }
          });
          setSlots(newSlots);
        }
      } catch (err) {
        console.error("Suppressed load error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const currentSlot = slots[selectedSlotId];

  const handleUpdateSlot = (field: keyof UserSlot, value: any) => {
    setSlots(prev => ({
      ...prev,
      [selectedSlotId]: { ...prev[selectedSlotId], [field]: value }
    }));
  };

  const togglePermission = (featureId: string) => {
    const currentPerms = [...currentSlot.permissions];
    if (currentPerms.includes(featureId)) {
      handleUpdateSlot("permissions", currentPerms.filter(p => p !== featureId));
    } else {
      handleUpdateSlot("permissions", [...currentPerms, featureId]);
    }
  };

  const handleCreateUser = async () => {
    if (!currentSlot.email || !currentSlot.name) {
      toast.error("Please fill in Name and Email!");
      return;
    }

    setLoading(true);
    try {
      // 1. Create a "Pre-Provisioned" entry in user_invites
      const { error } = await supabase.from('user_invites').upsert({
        email: currentSlot.email.toLowerCase(),
        full_name: currentSlot.name,
        phone: currentSlot.phone,
        role: currentSlot.role,
        permissions: currentSlot.permissions
      });

      if (error) throw error;

      handleUpdateSlot("isCreated", true);
      toast.success(`Invitation ready for ${currentSlot.email}!`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/signup?email=${encodeURIComponent(currentSlot.email)}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard!");
  };

  const handleImpersonate = () => {
    toast.info(`Entering 'View Only' mode as ${currentSlot.name}. (Admin Observation Mode)`);
    // Logic: Redirect to dashboard with impersonation flag
    // window.location.href = `/dashboard?impersonate=${currentSlot.auth_id}`;
  };

  if (loading && !Object.values(slots).some(s => s.isCreated)) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-muted-foreground animate-pulse">Syncing with CalliXis AI Database...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-display">Admin Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage user seats, roles, and granular permissions.</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 border-primary/30 bg-primary/5 text-primary gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Administrator Access
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: User Slot Selection */}
        <Card className="lg:col-span-1 p-4 border-border bg-card/50">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> User Slots
          </h3>
          <div className="space-y-2">
            {Object.values(slots).map((slot) => (
              <button
                key={slot.id}
                onClick={() => setSelectedSlotId(slot.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${
                  selectedSlotId === slot.id 
                    ? "border-primary bg-primary/10 text-foreground" 
                    : "border-border hover:border-primary/50 text-muted-foreground"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider">{slot.id}</span>
                  <span className="text-sm truncate">{slot.isCreated ? slot.name : "Available Slot"}</span>
                </div>
                {slot.isCreated ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <UserPlus className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Right: User Details & Permissions */}
        <Card className="lg:col-span-3 p-6 border-border bg-card">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {selectedSlotId.slice(-1)}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Configure {selectedSlotId.toUpperCase()}</h2>
                <p className="text-xs text-muted-foreground">Setup identity and access rights</p>
              </div>
            </div>
            {currentSlot.isCreated && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                Account Active
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Column 1: Identity */}
            <div className="space-y-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Identity Details
              </h3>
              
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  placeholder="John Doe" 
                  value={currentSlot.name} 
                  onChange={(e) => handleUpdateSlot("name", e.target.value)}
                  className="bg-secondary/30 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="john@example.com" 
                    value={currentSlot.email} 
                    onChange={(e) => handleUpdateSlot("email", e.target.value)}
                    className="pl-10 bg-secondary/30 border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="phone" 
                    placeholder="+1 (555) 000-0000" 
                    value={currentSlot.phone} 
                    onChange={(e) => handleUpdateSlot("phone", e.target.value)}
                    className="pl-10 bg-secondary/30 border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">System Role</Label>
                <Select value={currentSlot.role} onValueChange={(val) => handleUpdateSlot("role", val)}>
                  <SelectTrigger className="bg-secondary/30 border-border">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="brand">Brand Partner</SelectItem>
                    <SelectItem value="affiliate">Affiliate Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Column 2: Permissions */}
            <div className="space-y-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Feature Permissions
              </h3>
              
              <div className="bg-secondary/20 rounded-xl border border-border p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {APP_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    const isChecked = currentSlot.permissions.includes(feature.id);
                    return (
                      <div 
                        key={feature.id} 
                        className={`flex items-center space-x-3 p-2 rounded-lg transition-colors hover:bg-secondary/40 cursor-pointer ${isChecked ? 'bg-secondary/30' : ''}`}
                        onClick={() => togglePermission(feature.id)}
                      >
                        <Checkbox 
                          id={feature.id} 
                          checked={isChecked}
                          onCheckedChange={() => togglePermission(feature.id)}
                        />
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${isChecked ? 'text-primary' : 'text-muted-foreground'}`} />
                          <Label 
                            htmlFor={feature.id} 
                            className={`text-xs cursor-pointer ${isChecked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                          >
                            {feature.label}
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  onClick={handleCreateUser}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (currentSlot.isCreated ? "Update Invitation" : "Create Invitation Link")}
                </Button>
                
                {currentSlot.isCreated && (
                  <div className="space-y-2">
                    <div className="p-3 bg-secondary/50 rounded-lg border border-dashed border-primary/30 flex items-center justify-between">
                      <span className="text-[10px] font-mono truncate text-muted-foreground">
                        {window.location.origin}/signup?email={currentSlot.email}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={copyInviteLink}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1 border-primary/30 text-primary hover:bg-primary/10 gap-2"
                        onClick={handleImpersonate}
                      >
                        <Users className="h-4 w-4" /> Login as {currentSlot.name.split(' ')[0]}
                      </Button>
                      <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => handleUpdateSlot("isCreated", false)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
