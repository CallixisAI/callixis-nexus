import { useState } from "react";
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
  Lock
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
  name: string;
  email: string;
  password?: string;
  phone: string;
  role: string;
  permissions: string[];
  isCreated: boolean;
}

const Admin = () => {
  const [selectedSlotId, setSelectedSlotId] = useState("user1");
  const [slots, setSlots] = useState<Record<string, UserSlot>>({
    user1: { id: "user1", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user2: { id: "user2", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user3: { id: "user3", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user4: { id: "user4", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
    user5: { id: "user5", name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"], isCreated: false },
  });

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

  const handleCreateUser = () => {
    if (!currentSlot.email || !currentSlot.name || (!currentSlot.isCreated && !currentSlot.password)) {
      toast.error("Please fill in Name, Email, and Password!");
      return;
    }
    handleUpdateSlot("isCreated", true);
    toast.success(`User ${currentSlot.name} created successfully! Invite email sent (simulated).`);
  };

  const handleImpersonate = () => {
    toast.info(`Entering 'View Only' mode as ${currentSlot.name}. (Admin Observation Mode)`);
    // Logic: In a real app, we would store an "impersonation_id" in session and lock all 'write' actions
  };

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
                <Label htmlFor="password">Login Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    value={currentSlot.password || ""} 
                    onChange={(e) => handleUpdateSlot("password", e.target.value)}
                    className="pl-10 bg-secondary/30 border-border"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Used for user's initial login credentials.</p>
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
                >
                  {currentSlot.isCreated ? "Update User Profile" : "Create User & Set Credentials"}
                </Button>
                
                {currentSlot.isCreated && (
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
