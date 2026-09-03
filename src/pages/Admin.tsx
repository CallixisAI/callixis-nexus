import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Shield,
  UserPlus,
  CheckCircle2,
  Clock,
  Lock,
  Loader2,
  Search,
  ScrollText,
  Globe,
  Snowflake,
  Ban,
  Archive,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_PERMISSIONS } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";
import { RolesTab } from "@/components/admin/RolesTab";
import { SecurityTab } from "@/components/admin/SecurityTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { VapiAssistantsTab } from "@/components/admin/VapiAssistantsTab";
import { AssignRoleSelect } from "@/components/admin/AssignRoleSelect";
import { useRoleCatalogue, useActorRoleInfo, useRolePermissionMatrix } from "@/hooks/useRoles";
import { describeFunctionError } from "@/lib/functionError";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import { EditInviteDialog } from "@/components/admin/EditInviteDialog";
import { effectiveStatus, STATUS_LABEL, type AccountStatus, type UserDisplay } from "@/lib/userLifecycle";
import { mergeUserDirectory } from "@/lib/userDirectory";
import { permissionsGrantedByRole } from "@/lib/roleMatrix";

// Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §A) — was a second,
// hand-maintained copy of AppSidebar.tsx's nav list [E14]; now the one shared catalogue.
// `admin.roles_invites` (this page's own gating permission) is deliberately excluded from
// the list below: granting access to this page through an invite would hand a brand-new user
// the power to invite other admins on their first login, which is a decision this form
// shouldn't make silently on an admin's behalf.
//
// Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1, D-1) — this
// used to also be the invite dialog's checklist SOURCE ("tick a box, cut a personal key that
// then ignores the user's role forever" — see that plan's "Why this exists"). It's now only
// the read-only "this role grants" preview's page list (§B.4/B.12) — nothing here writes
// `user_permissions` as a side effect of an invite any more.
const APP_FEATURES = APP_PERMISSIONS.filter((p) => p.key !== "admin.roles_invites").map((p) => ({
  id: p.key,
  label: p.label,
  icon: p.icon,
}));

// §F.4 — one badge for all five states, computed off the row's EFFECTIVE status (a frozen row
// past its own frozen_until reads as active — src/lib/userLifecycle.ts's effectiveStatus()) so
// this can never visibly disagree with what is_account_active() actually decides.
function StatusBadge({ status, frozenUntil }: { status: AccountStatus; frozenUntil: string | null }) {
  const eff = effectiveStatus(status, frozenUntil);
  const STYLE: Record<AccountStatus, string> = {
    invited: "text-amber-500",
    active: "text-emerald-500",
    frozen: "text-sky-500",
    blocked: "text-destructive",
    removed: "text-muted-foreground",
  };
  const ICON: Record<AccountStatus, React.ComponentType<{ className?: string }>> = {
    invited: Clock,
    active: CheckCircle2,
    frozen: Snowflake,
    blocked: Ban,
    removed: Archive,
  };
  const Icon = ICON[eff];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${STYLE[eff]}`}>
      <Icon className="h-3.5 w-3.5" />
      {STATUS_LABEL[eff]}
      {/* The stored column can lag a passed frozen_until until something next touches the
          row (no cron reconciles it — see 20260827000000_user_lifecycle.sql's own header) —
          flag that explicitly rather than let "Active" silently mean two different things. */}
      {eff === "active" && status === "frozen" && (
        <span className="text-[10px] text-muted-foreground font-normal">(auto-unfrozen)</span>
      )}
    </div>
  );
}

const Admin = () => {
  // Phase 4 §E.1: was one `loading` flag driving both the table fetch and the invite
  // submit, so submitting an invite made the table say "Searching the Nexus…" underneath
  // the still-open dialog. `submitting` is the dialog/resend-button's own flag now;
  // `loading` stays scoped to fetchUsers.
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<UserDisplay[]>([]);
  // §F.3: distinguishes "the query itself failed" from "zero rows came back" — see fetchUsers.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // §F.4 — status filter across the five states, defaulting to everything.
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  // §E / §D — the two edit surfaces: a real user's role+tri-state overrides, or a pending
  // invite's role+flat checklist. Mutually exclusive, chosen by the row's own status.
  const [editUserTarget, setEditUserTarget] = useState<UserDisplay | null>(null);
  const [editInviteTarget, setEditInviteTarget] = useState<UserDisplay | null>(null);

  // Phase 3 (docs/admin-module-plan/PHASE-3-role-management-ui.md §A) — /admin becomes
  // tabbed: Users (this file's pre-existing directory, rebuilt properly in Phase 6) · Roles
  // (this phase) · Audit (Phase 7 placeholder). §A.3: the Roles tab carries its own
  // `admin.roles_invites` gate here too — belt and braces on top of the route-level gate
  // App.tsx already applies to the whole /admin page, same reasoning as ProtectedRoute's own
  // "sidebar filter stays in place too" comment. Right now the two gates admit the exact same
  // audience (only super_admin holds this key) — this stops mattering the day Phase 6 gives
  // the Users tab a different, broader permission.
  const { hasPermission, user: authUser } = useAuth();
  const canSeeRolesTab = hasPermission("admin.roles_invites");
  // Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §C.1) —
  // its own permission, not admin.roles_invites: 20260828000000_admin_audit_log.sql grants
  // `view` to plain `admin` too (accountability for the real destructive power Phase 6 already
  // gives that role), so this deliberately can admit a wider audience than the Roles/Security
  // tabs above. See that migration's header for the recorded reasoning.
  const canSeeAuditTab = hasPermission("admin.audit");
  // AI Agents plan (docs/AI-Agents-plan/README.md), Phase 4 §E.13/D-5 — its own permission,
  // super_admin only (20260903000000_industry_assistants.sql §C deliberately seeds no `admin`
  // grant — see that migration's comment on why this doesn't follow admin.audit's precedent).
  const canSeeAssistantsTab = hasPermission("admin.vapi_assistants");
  const { data: roleCatalogue = [] } = useRoleCatalogue();
  const { rank: actorRank } = useActorRoleInfo(roleCatalogue);
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.12) —
  // fetched once here and threaded down to both the invite dialog's read-only preview and
  // the Users table's Exceptions cell (§C.4). Same query EditUserDialog.tsx already runs;
  // TanStack Query dedupes it rather than firing a second request.
  const { data: matrixRows = [] } = useRolePermissionMatrix();

  // Form State for new invite. role starts blank rather than the old enum's 'brand' —
  // Phase 1 (20260812000000_roles_as_data.sql) retired that key along with the rest of
  // app_role, so a stale default here would silently invite someone into a role that no
  // longer exists (handle_new_user() would then fall back them to pending_role_review
  // regardless of what this form said). See the Select below, now sourced from the live
  // `roles` table instead of three hardcoded SelectItems.
  const [newInvite, setNewInvite] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        { data: profiles, error: profilesError },
        { data: roles, error: rolesError },
        { data: perms, error: permsError },
        { data: invites, error: invitesError },
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        supabase.from('user_permissions').select('*'),
        supabase.from('user_invites').select('*').eq('status', 'pending'),
      ]);

      // §F.3: supabase-js does NOT throw on a failed query — it returns { data: null, error }
      // — so the try/catch this used to rely on could never fire for a real RLS/permission
      // failure. That rendered as the cheerful "No users found in this environment.",
      // indistinguishable from a genuinely empty environment. Surfacing it instead.
      const firstError = profilesError ?? rolesError ?? permsError ?? invitesError;
      if (firstError) {
        setLoadError(firstError.message);
        setUsers([]);
        return;
      }

      // Phase 7 admin-module-plan §E.1 — the merge itself now lives in src/lib/userDirectory.ts
      // (pure, unit-tested); this stays the only place that fetches and owns loading/error state.
      setUsers(mergeUserDirectory(profiles, roles, perms, invites));
    } catch (err) {
      console.error("Error loading users:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Phase 4 §E: the browser no longer writes user_invites directly — user_invites'
  // "Admins can manage invites" RLS policy is super_admin-only (Phase 1 D-2), and the token/
  // code this now needs to generate must never round-trip through a client that could log
  // or inspect it. manage-users' 'invite' action does the whole thing server-side: caller
  // rank check, upsert, hash generation, and the actual send. Shared by both the dialog
  // (first invite) and the table's resend button (reissue) below — same request shape, same
  // upsert-by-email semantics either way.
  //
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1, D-1) — no
  // `permissions` field here any more. An invite carries a role and nothing else;
  // manage-users' handleInvite always stores `[]` regardless (the real enforcement point).
  const submitInvite = async (payload: { name: string; email: string; phone: string; role: string; notify?: boolean }) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: 'invite',
        email: payload.email.toLowerCase().trim(),
        full_name: payload.name.trim(),
        phone: payload.phone.trim() || undefined,
        role: payload.role,
        notify: payload.notify,
      },
    });

    if (error || data?.error) {
      const message = data?.error ?? (await describeFunctionError(error, "Failed to send the invitation."));
      throw new Error(message);
    }

    return data as { success: boolean; invite_id: string; email_sent: boolean; activation_url: string };
  };

  const handleSendInvite = async () => {
    if (!newInvite.email || !newInvite.name) {
      toast.error("Name and Email are required!");
      return;
    }
    if (!newInvite.role) {
      toast.error("Pick a role for this invite.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitInvite(newInvite);
      if (result.email_sent) {
        toast.success(`Invitation sent to ${newInvite.email.toLowerCase().trim()}`);
      } else {
        // §A.3 not finished yet (RESEND_API_KEY unset) or Resend itself rejected the send —
        // either way the invite row is real and usable, just not delivered. Same fallback
        // affordance the old "copy the magic link" flow had, now pointing at a real,
        // single-use activation token instead of the open /signup page [E13].
        navigator.clipboard.writeText(result.activation_url);
        toast.warning("Invite created, but the email failed to send. Activation link copied to clipboard — share it manually.");
      }
      setIsInviteModalOpen(false);
      setNewInvite({ name: "", email: "", phone: "", role: "" });
      fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Replaces the old "Copy Magic Link" button — that link was the open /signup page, which
  // no longer exists (public signup is off) and never carried a real token to begin with.
  // Resending re-runs the same invite path with a fresh token/code (manage-users upserts by
  // email), so the previous one — mailed or not — stops working the moment this succeeds.
  const handleResendInvite = async (user: UserDisplay) => {
    try {
      const result = await submitInvite({
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        role: user.role,
      });
      if (result.email_sent) {
        toast.success(`Invitation resent to ${user.email}`);
      } else {
        navigator.clipboard.writeText(result.activation_url);
        toast.warning("Reissued, but the email failed to send. Activation link copied to clipboard — share it manually.");
      }
      fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

  // Phase 6 (docs/admin-module-plan/PHASE-6-CHECKLIST.md D.1's "Copy link") — same reissue
  // path as resend above, but explicitly opts out of the email send (notify: false). There is
  // no way to recover a PREVIOUSLY issued token (only its hash is ever stored), so "give me
  // the link" necessarily means "reissue it and hand me the new one" either way.
  const handleCopyLink = async (user: UserDisplay) => {
    try {
      const result = await submitInvite({
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        role: user.role,
        notify: false,
      });
      await navigator.clipboard.writeText(result.activation_url);
      toast.success("Activation link copied to clipboard.");
      fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.4) — the
  // invite dialog's read-only "this role grants" preview, computed from the picked role plus
  // the already-fetched role/matrix data. Same helper (permissionsGrantedByRole) EditInviteDialog
  // uses for the exact same question.
  const selectedInviteRole = roleCatalogue.find(r => r.key === newInvite.role);
  const inviteGrantedKeys = new Set(permissionsGrantedByRole(newInvite.role, matrixRows));
  const inviteGrantedFeatures = APP_FEATURES.filter(f => inviteGrantedKeys.has(f.id));

  // §F.4 — search AND status filter, applied to the row's EFFECTIVE status (a frozen row past
  // its own frozen_until reads as active — see src/lib/userLifecycle.ts's effectiveStatus()).
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const eff = effectiveStatus(u.status, u.frozenUntil);
    const matchesStatus = statusFilter === "all" || eff === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground font-display tracking-tight">User Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Scale your environment with unlimited seats and granular control.</p>
      </div>

      {/* Phase 3 §A: tabbed — Users (this page's pre-existing directory) · Roles (this
          phase) · Audit (Phase 7 placeholder). */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          {canSeeRolesTab && (
            <TabsTrigger value="roles" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Roles
            </TabsTrigger>
          )}
          {/* Phase 5 admin-module-plan (docs/admin-module-plan/PHASE-5-ip-whitelisting.md §F.8)
              — same admin.roles_invites gate as Roles above; the IP allowlist is exactly the
              kind of access-control surface that gate already exists to protect. */}
          {canSeeRolesTab && (
            <TabsTrigger value="security" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Security
            </TabsTrigger>
          )}
          {canSeeAuditTab && (
            <TabsTrigger value="audit" className="gap-1.5">
              <ScrollText className="h-3.5 w-3.5" /> Audit
            </TabsTrigger>
          )}
          {canSeeAssistantsTab && (
            <TabsTrigger value="assistants" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" /> Assistants
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="space-y-6 pt-4">
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">
        <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-11 px-6 shadow-lg shadow-primary/20 transition-all active:scale-95">
              <UserPlus className="h-4 w-4" /> Invite New User
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display">New User Invitation</DialogTitle>
              {/* [E13] — retired "magic link" wording; that promised something the old flow
                  never actually did. This is now literally true: manage-users' invite
                  action sends a real email with a real activation link and code. */}
              <p className="text-sm text-muted-foreground">The user will receive an email with an activation link and a one-time code.</p>
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
                  {/* Sourced from the live `roles` table (Phase 1) rather than three
                      hardcoded options that no longer exist as of that migration — see the
                      comment on newInvite's initial state above. Capped at the actor's own
                      rank, same rule AssignRoleSelect applies for an existing user (§C.8's
                      "cannot grant a role that outranks your own"), so this form can't be
                      used to hand out more power than the inviter themselves holds. */}
                  <Select value={newInvite.role} onValueChange={v => setNewInvite({...newInvite, role: v})}>
                    <SelectTrigger className="bg-secondary/30 border-border">
                      <SelectValue placeholder="Select a role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleCatalogue
                        .filter(r => r.rank >= actorRank)
                        .map(r => (
                          <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1
                  §B.4, D-1) — this used to be a checklist that cut a personal key for this one
                  person, silently ignoring their role forever after (see that plan's "Why this
                  exists"). Read-only now: it shows the CONSEQUENCE of the role picked on the
                  left, and writes nothing. Giving one person more than their role stays
                  possible, but only later, deliberately, in Edit User. */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-primary" /> This role grants
                </Label>
                {!newInvite.role ? (
                  <p className="text-xs text-muted-foreground p-3 bg-secondary/20 rounded-lg border border-border">
                    Pick a role to see what it opens.
                  </p>
                ) : selectedInviteRole?.is_super ? (
                  <p className="text-xs text-muted-foreground p-3 bg-secondary/20 rounded-lg border border-border">
                    {selectedInviteRole.label} is a super role — full access to everything.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 p-3 bg-secondary/20 rounded-lg border border-border">
                    {inviteGrantedFeatures.length === 0 ? (
                      <p className="text-xs text-muted-foreground">This role grants no pages yet.</p>
                    ) : (
                      inviteGrantedFeatures.map(f => (
                        <div key={f.id} className="flex items-center gap-2">
                          <f.icon className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs">{f.label}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  To give this person more than their role, use Edit → Permission overrides
                  after they activate.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSendInvite} disabled={submitting} className="px-8">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Invitation"}
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
        {/* §F.4 — status filter across the five states. */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AccountStatus | "all")}>
          <SelectTrigger className="w-[160px] h-10 bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as AccountStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                {/* Permission-overrides plan (docs/permission-overrides-plan/README.md,
                    Phase 2 §C.3) — was a "Permissions" badge list that rendered every
                    override, including `deny` rows, as if the user simply HAD that
                    permission (E6). Renamed and reframed: this column now answers "does
                    this user's ACCESS differ from what their role alone would grant" — the
                    actual thing worth an admin's attention, and the thing this whole plan
                    exists because nobody could previously see. */}
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exceptions</th>
                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadError ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="text-sm font-medium">Couldn't load the user directory</span>
                      <span className="text-xs text-muted-foreground max-w-md">{loadError}</span>
                      <Button variant="outline" size="sm" className="mt-2" onClick={fetchUsers}>Try again</Button>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    {loading ? "Searching the Nexus..." : "No users found in this environment."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const targetRole = roleCatalogue.find((r) => r.key === user.role);
                  const targetRank = targetRole?.rank;
                  // §C.3/§C.4 — an "exception" is any personal override, allow or deny, on
                  // top of whatever the role itself grants. §C.4's own trigger case: a role
                  // granting nothing (and not a super role, which bypasses role_permissions
                  // entirely — Phase 1 §D) while exceptions are non-zero is exactly the
                  // "assigning a role changed nothing" bug this plan exists to surface.
                  const exceptionCount = user.permissions.length + user.denyOverrides.length;
                  const roleGrantCount = matrixRows.filter((r) => r.role_key === user.role).length;
                  const roleGrantsNothingButExceptionsDo =
                    !targetRole?.is_super && roleGrantCount === 0 && exceptionCount > 0;
                  return (
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
                      {/* Phase 3 §E.1's minimal assign control, still here for a quick inline
                          change — Phase 6's EditUserDialog (the Actions menu's "Edit" item)
                          offers the same control alongside the tri-state permission overrides.
                          Pending invites don't have a real user_id yet (manage-users' set_role
                          action needs one), so they keep the static badge — changing an
                          invite's role is EditInviteDialog's job now, not this control. */}
                      {user.status !== "invited" ? (
                        <AssignRoleSelect
                          userId={user.userId!}
                          currentRole={user.role}
                          roles={roleCatalogue}
                          actorRank={actorRank}
                          disabled={!!authUser && user.userId === authUser.id}
                          hasExceptions={exceptionCount > 0}
                        />
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-medium capitalize border-primary/20">
                          {user.role}
                        </Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={user.status} frozenUntil={user.frozenUntil} />
                      {user.statusReason && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[180px] truncate" title={user.statusReason}>
                          {user.statusReason}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {user.status === "invited" ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5 max-w-[220px]">
                          <span className={`text-xs font-medium ${exceptionCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {exceptionCount > 0
                              ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"}`
                              : "None"}
                          </span>
                          {roleGrantsNothingButExceptionsDo && (
                            <span className="text-[10px] text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              Role grants nothing — access is from exceptions only
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <UserActionsMenu
                        user={user}
                        actorRank={actorRank}
                        targetRank={targetRank}
                        onEdit={() => (user.status === "invited" ? setEditInviteTarget(user) : setEditUserTarget(user))}
                        onResendInvite={() => handleResendInvite(user)}
                        onCopyLink={() => handleCopyLink(user)}
                        onChanged={fetchUsers}
                      />
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
        </TabsContent>

        {canSeeRolesTab && (
          <TabsContent value="roles" className="pt-4">
            <RolesTab />
          </TabsContent>
        )}

        {canSeeRolesTab && (
          <TabsContent value="security" className="pt-4">
            <SecurityTab />
          </TabsContent>
        )}

        {canSeeAuditTab && (
          <TabsContent value="audit" className="pt-4">
            <AuditTab />
          </TabsContent>
        )}

        {canSeeAssistantsTab && (
          <TabsContent value="assistants" className="pt-4">
            <VapiAssistantsTab />
          </TabsContent>
        )}
      </Tabs>

      {/* §E — the two edit surfaces, mounted once at the page level rather than per-row, so
          only one is ever open at a time. */}
      {editUserTarget && (
        <EditUserDialog
          open={!!editUserTarget}
          onOpenChange={(open) => !open && setEditUserTarget(null)}
          user={editUserTarget}
          roles={roleCatalogue}
          actorRank={actorRank}
          onSaved={fetchUsers}
        />
      )}
      {editInviteTarget && (
        <EditInviteDialog
          open={!!editInviteTarget}
          onOpenChange={(open) => !open && setEditInviteTarget(null)}
          invite={editInviteTarget}
          roles={roleCatalogue}
          actorRank={actorRank}
          appFeatures={APP_FEATURES}
          matrixRows={matrixRows}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
};

export default Admin;
