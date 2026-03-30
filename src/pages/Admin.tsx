import { useState, useEffect, useCallback } from "react";
import { 
  Users, 
  Shield, 
  Mail, 
  UserPlus, 
  Phone, 
  CheckCircle2, 
  Clock,
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
  Search,
  Trash2,
  MoreVertical,
  Plus
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

interface UserDisplay {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'pending';
  permissions: string[];
}

const Admin = () => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserDisplay[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  
  // Form State for new invite
  const [newInvite, setNewInvite] = useState({
    name: "",
    email: "",
    phone: "",
    role: "brand",
    permissions: ["dashboard"] as string[]
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch active users from profiles
      const { data: profiles } = await supabase.from('profiles').select('*');
      const { data: roles } = await supabase.from('user_roles').select('*');
      const { data: perms } = await supabase.from('user_permissions').select('*');
      
      // Fetch pending invites
      const { data: invites } = await supabase.from('user_invites').select('*').eq('status', 'pending');

      const combinedUsers: UserDisplay[] = [];

      // Process Active Users
      profiles?.forEach(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id)?.role || 'brand';
        const userPerms = perms?.filter(p => p.user_id === profile.id).map(p => p.permission_key) || [];
        
        combinedUsers.push({
          id: profile.id,
          name: profile.full_name || "Unknown",
          email: "Active Account", // We don't show emails for security unless needed
          role: userRole,
          status: 'active',
          permissions: userPerms
        });
      });

      // Process Pending Invites
      invites?.forEach(invite => {
        combinedUsers.push({
          id: invite.id,
          name: invite.full_name,
          email: invite.email,
          role: invite.role,
          status: 'pending',
          permissions: invite.permissions
        });
      });

      setUsers(combinedUsers);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleTogglePermission = (id: string) => {
    setNewInvite(prev => ({
      ...prev,
      permissions: prev.permissions.includes(id) 
        ? prev.permissions.filter(p => p !== id)
        : [...prev.permissions, id]
    }));
  };

  const handleSendInvite = async () => {
    if (!newInvite.email || !newInvite.name) {
      toast.error("Name and Email are required!");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('user_invites').upsert({
        email: newInvite.email.toLowerCase(),
        full_name: newInvite.name,
        role: newInvite.role,
        permissions: newInvite.permissions,
        status: 'pending'
      });

      if (error) throw error;

      toast.success(`Invitation ready for ${newInvite.email}`);
      setIsInviteModalOpen(false);
      setNewInvite({ name: "", email: "", phone: "", role: "brand", permissions: ["dashboard"] });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (email: string) => {
    const link = `${window.location.origin}/signup?email=${encodeURIComponent(email)}`;
    navigator.clipboard.writeText(link);
    toast.success("Magic Link copied!");
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-display tracking-tight">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Scale your environment with unlimited seats and granular control.</p>
        </div>
        
        <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-11 px-6 shadow-lg shadow-primary/20 transition-all active:scale-95">
              <UserPlus className="h-4 w-4" /> Invite New User
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">New User Invitation</DialogTitle>
              <p className="text-sm text-muted-foreground">The user will receive a magic link to set their own password.</p>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input 
                    placeholder="Enter full name" 
                    value={newInvite.name} 
                    onChange={e => setNewInvite({...newInvite, name: e.target.value})}
                    className="bg-secondary/30 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input 
                    type="email" 
                    placeholder="user@company.com" 
                    value={newInvite.email} 
                    onChange={e => setNewInvite({...newInvite, email: e.target.value})}
                    className="bg-secondary/30 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number (Optional)</Label>
                  <Input 
                    placeholder="+1..." 
                    value={newInvite.phone} 
                    onChange={e => setNewInvite({...newInvite, phone: e.target.value})}
                    className="bg-secondary/30 border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>System Role</Label>
                  <Select value={newInvite.role} onValueChange={v => setNewInvite({...newInvite, role: v})}>
                    <SelectTrigger className="bg-secondary/30 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brand">Brand Partner</SelectItem>
                      <SelectItem value="affiliate">Affiliate Executive</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-primary" /> Feature Permissions
                </Label>
                <div className="grid grid-cols-1 gap-2 p-3 bg-secondary/20 rounded-lg border border-border">
                  {APP_FEATURES.map(f => (
                    <div key={f.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`modal-${f.id}`} 
                        checked={newInvite.permissions.includes(f.id)}
                        onCheckedChange={() => handleTogglePermission(f.id)}
                      />
                      <Label htmlFor={`modal-${f.id}`} className="text-xs flex items-center gap-2 cursor-pointer">
                        <f.icon className="h-3 w-3 text-muted-foreground" /> {f.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSendInvite} disabled={loading} className="px-8">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Get Link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Directory Controls */}
      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-xl border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or email..." 
            className="pl-10 bg-background border-border h-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="h-10 border-border" onClick={fetchUsers}>
          <Clock className="h-4 w-4 mr-2" /> Refresh List
        </Button>
      </div>

      {/* User Table */}
      <Card className="border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User / Member</th>
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permissions</th>
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    {loading ? "Searching the Nexus..." : "No users found in this environment."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${user.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">{user.name}</span>
                          <span className="text-[11px] text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-[10px] font-medium capitalize border-primary/20">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {user.status === 'active' ? (
                        <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                          <Clock className="h-3.5 w-3.5 animate-pulse" /> Pending
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1 flex-wrap max-w-[200px]">
                        {user.permissions.slice(0, 3).map(p => (
                          <Badge key={p} variant="secondary" className="text-[9px] h-4 px-1.5">
                            {p}
                          </Badge>
                        ))}
                        {user.permissions.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{user.permissions.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {user.status === 'pending' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => copyInviteLink(user.email)}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy Magic Link</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Admin;
