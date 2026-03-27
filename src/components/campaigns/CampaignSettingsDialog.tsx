import { useState } from "react";
import { Settings2, Clock, Users, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Campaign, ALL_DAYS, WorkHours } from "./types";

interface CampaignSettingsDialogProps {
  campaign: Campaign;
  onSave: (id: string, updates: Partial<Campaign>) => void;
}

const CampaignSettingsDialog = ({ campaign, onSave }: CampaignSettingsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [workHours, setWorkHours] = useState<WorkHours>(campaign.workHours);
  const [maxLeads, setMaxLeads] = useState(campaign.maxQualifiedLeads);
  const [crmEndpoint, setCrmEndpoint] = useState(campaign.crmApiEndpoint);

  const toggleDay = (day: string) => {
    setWorkHours(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
  };

  const handleSave = () => {
    onSave(campaign.id, {
      workHours,
      maxQualifiedLeads: maxLeads,
      crmApiEndpoint: crmEndpoint,
    });
    setOpen(false);
    toast.success(`Settings updated for "${campaign.name}"`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">{campaign.name} — Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {/* Work Hours */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Work Hours
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Active Days</Label>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                      workHours.days.includes(day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Start Time</Label>
                <Input
                  type="time"
                  value={workHours.startTime}
                  onChange={(e) => setWorkHours(prev => ({ ...prev, startTime: e.target.value }))}
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">End Time</Label>
                <Input
                  type="time"
                  value={workHours.endTime}
                  onChange={(e) => setWorkHours(prev => ({ ...prev, endTime: e.target.value }))}
                  className="bg-secondary border-border text-sm"
                />
              </div>
            </div>
          </div>

          {/* Max Qualified Leads */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Max Qualified Leads
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Maximum leads to qualify & push to CRM ({campaign.qualifiedLeadsSent} sent so far)
              </Label>
              <Input
                type="number"
                min={0}
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                className="bg-secondary border-border text-sm"
                placeholder="0 = unlimited"
              />
            </div>
            {maxLeads > 0 && (
              <div className="bg-secondary/50 rounded-lg p-2.5 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{campaign.qualifiedLeadsSent} / {maxLeads}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min((campaign.qualifiedLeadsSent / maxLeads) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* CRM API Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="h-4 w-4 text-primary" />
              CRM API Endpoint
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL to push qualified leads
              </Label>
              <Input
                type="url"
                value={crmEndpoint}
                onChange={(e) => setCrmEndpoint(e.target.value)}
                className="bg-secondary border-border text-sm"
                placeholder="https://your-crm.com/api/leads"
              />
            </div>
          </div>

          <Button onClick={handleSave} className="w-full">Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignSettingsDialog;
