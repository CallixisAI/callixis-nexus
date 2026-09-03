import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMyIpRules, useCreateMyIpRule, useDeleteIpRule } from "@/hooks/useSecurity";
import { normalizeCidrInput } from "@/lib/ipRules";

// Phase 5 admin-module-plan (docs/admin-module-plan/PHASE-5-ip-whitelisting.md §C/D-7) — the
// self-declare half of "self-declared, admin-approved." Deliberately lives in Settings, not
// inside Admin.tsx's Security tab: D-7 means EVERY signed-in user can declare their own
// network, not only admin.roles_invites holders. (An earlier version of this build nested it
// inside the admin-gated tab by mistake — a plain user could never have reached it there. Kept
// as a live example of why the "who can reach this" question needs checking against the actual
// route/permission gate, not just against what the component itself does.) Approval is admin-
// only, on the Security tab under /admin.
export function MyNetworksCard() {
  const { data: myRules = [] } = useMyIpRules();
  const createMyRule = useCreateMyIpRule();
  const deleteRule = useDeleteIpRule();

  const [addOpen, setAddOpen] = useState(false);
  const [newCidr, setNewCidr] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const handleAddRule = async () => {
    if (!newCidr.trim()) {
      toast.error("Enter an IP address or CIDR range.");
      return;
    }
    try {
      await createMyRule.mutateAsync({ cidr: normalizeCidrInput(newCidr), label: newLabel.trim() });
      toast.success("Added — it's inert until an admin approves it.");
      setAddOpen(false);
      setNewCidr("");
      setNewLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add that range.");
    }
  };

  return (
    <Card className="bg-card border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground font-medium">Trusted networks</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            If IP restriction is turned on for your account, only networks listed and approved here can
            sign in. Declaring one here does nothing on its own — an admin has to approve it first.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add network
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>Add a network</DialogTitle>
              <DialogDescription>
                A single IP (e.g. 203.0.113.9) or a range (e.g. 203.0.113.0/24, minimum /24).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>IP address or CIDR range</Label>
                <Input
                  placeholder="203.0.113.9"
                  value={newCidr}
                  onChange={(e) => setNewCidr(e.target.value)}
                  className="bg-secondary border-border font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  placeholder="Home, Manila office…"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddRule} disabled={createMyRule.isPending}>
                {createMyRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {myRules.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No networks declared yet.</p>
      ) : (
        <div className="space-y-1.5">
          {myRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs">{r.cidr}</code>
                {r.label && <span className="text-xs text-muted-foreground">{r.label}</span>}
                {r.approved_by ? (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/40 text-emerald-500">
                    approved
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/40 text-amber-500">
                    pending approval
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteRule.mutate(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
