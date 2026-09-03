import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Campaign } from "./types";

interface StartCampaignDialogProps {
  campaign: Campaign | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (campaign: Campaign) => Promise<void>;
}

// §B.4 — "nobody should ever be surprised by who got called." Shows the actual numbers the
// dispatcher will act on (Phase 4), not a generic "Start campaign?" prompt.
const StartCampaignDialog = ({ campaign, onOpenChange, onConfirm }: StartCampaignDialogProps) => {
  const [isStarting, setIsStarting] = useState(false);
  if (!campaign) return null;

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
          <DialogTitle className="flex items-center gap-2 text-foreground"><Play className="h-4 w-4 text-primary" /> Start "{campaign.name}"?</DialogTitle>
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
          {campaign.leadCounts.queued === 0 && (
            <p className="text-yellow-500 text-xs">No pending leads on this campaign yet — starting it won't dial anyone until you upload some.</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isStarting} className="glow-cyan">
            {isStarting ? "Starting…" : "Start Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartCampaignDialog;
