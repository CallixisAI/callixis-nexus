import { useState } from "react";
import { Play, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Campaign } from "./types";

interface StartCampaignDialogProps {
  campaign: Campaign | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (campaign: Campaign) => Promise<void>;
  /**
   * 2026-09-11 — `profiles.company_name` is blank, so the assistant would introduce itself as
   * "...calling on behalf of [nothing]" on every call this campaign makes. Passed down rather
   * than re-derived here so the page banner and this gate share one predicate
   * (`needsCompanyName`) and can never disagree about what counts as missing.
   */
  companyNameMissing?: boolean;
}

// §B.4 — "nobody should ever be surprised by who got called." Shows the actual numbers the
// dispatcher will act on (Phase 4), not a generic "Start campaign?" prompt.
const StartCampaignDialog = ({ campaign, onOpenChange, onConfirm, companyNameMissing = false }: StartCampaignDialogProps) => {
  const [isStarting, setIsStarting] = useState(false);
  const navigate = useNavigate();
  if (!campaign) return null;

  // Client-feedback plan §E.13 — a Completed campaign hit its Max Qualified Leads cap. Restarting
  // it without raising the cap first means it flips straight back to "completed" on its very next
  // qualified call (call-ingest §E.6), so the confirmation has to say so out loud.
  const isRestart = campaign.status === "Completed";
  const capStillBinding =
    campaign.maxQualifiedLeads > 0 && campaign.qualifiedLeadsSent >= campaign.maxQualifiedLeads;

  const handleConfirm = async () => {
    setIsStarting(true);
    try {
      await onConfirm(campaign);
      onOpenChange(false);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Play className="h-4 w-4 text-primary" /> {isRestart ? "Restart" : "Start"} "{campaign.name}"?</DialogTitle>
          <DialogDescription>This starts dialing immediately — the engine picks it up within minutes.</DialogDescription>
        </DialogHeader>
        <div className="bg-secondary/50 rounded-lg p-4 border border-border space-y-2 text-sm">
          <p className="text-foreground">
            This will call <span className="font-bold">{campaign.leadCounts.queued.toLocaleString()}</span> lead{campaign.leadCounts.queued === 1 ? "" : "s"},
            up to <span className="font-bold">{campaign.dailyCallCap.toLocaleString()}</span>/day.
          </p>
          <p className="text-muted-foreground text-xs">
            {campaign.workHours.days.length > 0 ? campaign.workHours.days.join(", ") : "No active days set"} · {campaign.workHours.startTime}–{campaign.workHours.endTime} ({campaign.timezone})
          </p>
          {/* 2026-09-11 — two very different situations produce "0 queued", and telling a user
              to "upload some" is wrong advice for one of them. A campaign that auto-completed
              because it ran out of leads HAS been fully worked; a brand-new one hasn't been
              started at all. isRestart distinguishes them. */}
          {campaign.leadCounts.queued === 0 && (
            <p className="text-yellow-500 text-xs">
              {isRestart && campaign.leadCounts.total > 0
                ? "Every lead on this campaign has already been called. Restarting won't dial anyone until you add new leads."
                : "No pending leads on this campaign yet — starting it won't dial anyone until you upload some."}
            </p>
          )}
          {isRestart && capStillBinding && (
            <p className="text-yellow-500 text-xs">
              This campaign already reached its Max Qualified Leads cap
              ({campaign.qualifiedLeadsSent} / {campaign.maxQualifiedLeads}). Raise the cap in
              Settings first, or it will stop again on its very next qualified call.
            </p>
          )}
        </div>
        {/* 2026-09-11 — a blocking gate, not a warning: unlike the cap notice above (which
            describes a campaign that will run and then stop), this one describes every call
            going out with a broken sentence in its opening line. Deliberately checked here,
            where a human is present and can fix it, rather than by skipping leads inside
            dispatch-batch — a silent skip there returns {leads: []} with a 200 and the n8n run
            goes all green, indistinguishable from a quiet night (call-quality plan §ORDER). */}
        {companyNameMissing && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-relaxed">
              <p className="text-foreground font-medium">Set your company name first.</p>
              <p className="text-muted-foreground mt-1">
                The AI introduces itself as "…calling on behalf of <span className="italic">your company</span>" on every
                call. Yours is blank, so every lead on this campaign would hear that sentence with a gap in it.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-[11px] border-yellow-500/40"
                onClick={() => { onOpenChange(false); navigate("/settings?tab=company"); }}
              >
                Set company name
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={isStarting || companyNameMissing}
            title={companyNameMissing ? "Set your company name in Settings → Company first" : undefined}
            className="glow-cyan"
          >
            {isStarting ? (isRestart ? "Restarting…" : "Starting…") : (isRestart ? "Restart Campaign" : "Start Campaign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartCampaignDialog;
