import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { typedConfirmationMatches } from "@/lib/userLifecycle";

// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §D.4/§D.5) — the one dialog behind
// every action that needs a mandatory reason and/or a typed confirmation naming the user, so
// "block"/"freeze"/"remove"/"cancel invite" don't each grow their own slightly-different
// AlertDialog. Uses a plain <button>-driven AlertDialogContent rather than AlertDialogAction —
// AlertDialogAction closes the dialog on click unconditionally, which is wrong here: a failed
// mutation (e.g. the last-super-admin trigger refusing) needs the dialog to stay open with the
// error visible, same reasoning RolesTab.tsx's own delete-role dialog already applies.
export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  /** The user's display name — typing it exactly is required to enable Confirm. */
  requireTypedName?: string;
  // §A: only "freeze" ever passes this — the one action with an optional auto-expiry.
  showFrozenUntil?: boolean;
  onConfirm: (reason: string | null, frozenUntil: string | null) => Promise<void>;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  requireReason = false,
  requireTypedName,
  showFrozenUntil = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [frozenUntil, setFrozenUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTyped("");
      setFrozenUntil("");
      setError(null);
    }
  }, [open]);

  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = !requireTypedName || typedConfirmationMatches(typed, requireTypedName);
  const canConfirm = reasonOk && typedOk && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const frozenUntilIso = showFrozenUntil && frozenUntil ? new Date(frozenUntil).toISOString() : null;
      await onConfirm(requireReason ? reason.trim() : null, frozenUntilIso);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {requireReason && (
            <div className="space-y-2">
              <Label htmlFor="confirm-reason" className="text-xs">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? This is recorded and shown to other admins."
                className="bg-secondary/30 border-border"
                rows={2}
              />
            </div>
          )}

          {showFrozenUntil && (
            <div className="space-y-2">
              <Label htmlFor="confirm-frozen-until" className="text-xs">
                Auto-unfreeze at (optional)
              </Label>
              <Input
                id="confirm-frozen-until"
                type="datetime-local"
                value={frozenUntil}
                onChange={(e) => setFrozenUntil(e.target.value)}
                className="bg-secondary/30 border-border"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank for an indefinite freeze — access returns automatically once this time passes (§S.2).
              </p>
            </div>
          )}

          {requireTypedName && (
            <div className="space-y-2">
              <Label htmlFor="confirm-typed" className="text-xs">
                Type <span className="font-semibold text-foreground">{requireTypedName}</span> to confirm
              </Label>
              <Input
                id="confirm-typed"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="bg-secondary/30 border-border font-mono"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
