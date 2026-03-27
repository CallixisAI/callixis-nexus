import { useState, useRef } from "react";
import { Plus, Clock, Users, Globe, Briefcase, Bot, Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Campaign, ALL_DAYS, WorkHours } from "./types";

interface CreateCampaignDialogProps {
  onCreated: (campaign: Campaign) => void;
}

const INDUSTRIES = [
  "Real Estate",
  "Insurance",
  "Medical",
  "Car Sales",
  "Home Improvement",
  "Legal",
  "Financial Services",
  "Education",
  "SaaS / Tech",
  "Other",
];

const AGENTS = [
  "LeadGen Pro",
  "InsureBot",
  "MedScheduler",
  "AutoSales AI",
  "HomeReno Bot",
];

const defaultWorkHours: WorkHours = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startTime: "09:00",
  endTime: "17:00",
};

const CreateCampaignDialog = ({ onCreated }: CreateCampaignDialogProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [agent, setAgent] = useState("");
  const [workHours, setWorkHours] = useState<WorkHours>(defaultWorkHours);
  const [maxLeads, setMaxLeads] = useState(0);
  const [crmEndpoint, setCrmEndpoint] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [startImmediately, setStartImmediately] = useState(false);

  const toggleDay = (day: string) => {
    setWorkHours((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const resetForm = () => {
    setName("");
    setIndustry("");
    setAgent("");
    setWorkHours(defaultWorkHours);
    setMaxLeads(0);
    setCrmEndpoint("");
    setUploadedFile(null);
    setStartImmediately(false);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!industry) {
      toast.error("Please select an industry");
      return;
    }
    if (!agent) {
      toast.error("Please select an AI agent");
      return;
    }
    if (workHours.days.length === 0) {
      toast.error("Select at least one active day");
      return;
    }

    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: name.trim(),
      status: startImmediately ? "Active" : "Scheduled",
      calls: 0,
      conversion: "—",
      industry,
      agent,
      records: [],
      workHours,
      maxQualifiedLeads: maxLeads,
      qualifiedLeadsSent: 0,
      crmApiEndpoint: crmEndpoint.trim(),
    };

    onCreated(newCampaign);
    toast.success(`Campaign "${newCampaign.name}" created`);
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="glow-cyan">
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">
            Create New Campaign
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Name & Industry */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Briefcase className="h-4 w-4 text-primary" />
              Campaign Details
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Campaign Name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-secondary border-border text-sm"
                placeholder="e.g. Spring Real Estate Push"
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Industry
                </Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger className="bg-secondary border-border text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  AI Agent
                </Label>
                <Select value={agent} onValueChange={setAgent}>
                  <SelectTrigger className="bg-secondary border-border text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {AGENTS.map((a) => (
                      <SelectItem key={a} value={a}>
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          {a}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Work Hours */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Work Hours
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Active Days
              </Label>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
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
                <Label className="text-xs text-muted-foreground">
                  Start Time
                </Label>
                <Input
                  type="time"
                  value={workHours.startTime}
                  onChange={(e) =>
                    setWorkHours((prev) => ({
                      ...prev,
                      startTime: e.target.value,
                    }))
                  }
                  className="bg-secondary border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  End Time
                </Label>
                <Input
                  type="time"
                  value={workHours.endTime}
                  onChange={(e) =>
                    setWorkHours((prev) => ({
                      ...prev,
                      endTime: e.target.value,
                    }))
                  }
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
                Maximum leads to qualify & push to CRM (0 = unlimited)
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
          </div>

          {/* CRM Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Globe className="h-4 w-4 text-primary" />
              CRM API Endpoint
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL to push qualified leads (optional)
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

          {/* Upload Data */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Upload className="h-4 w-4 text-primary" />
              Upload Contact Data
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Import contacts from a CSV or Excel file (optional)
              </Label>
              {uploadedFile ? (
                <div className="flex items-center gap-2 bg-secondary rounded-lg p-2.5 border border-border">
                  <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{uploadedFile.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(uploadedFile.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                  <p className="text-xs text-muted-foreground mb-1">Click to browse or drag & drop</p>
                  <p className="text-xs text-muted-foreground/60">Supported: .csv, .xlsx, .xls</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadedFile(file);
                }}
              />
            </div>
            <div className="bg-secondary/50 rounded-lg p-2.5 border border-border">
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Expected columns:</p>
              <p className="text-xs text-muted-foreground">Name, Phone, Email, Notes (optional)</p>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => {
                setStartImmediately(false);
                handleCreate();
              }}
            >
              Create as Scheduled
            </Button>
            <Button
              className="flex-1 glow-cyan"
              onClick={() => {
                setStartImmediately(true);
                handleCreate();
              }}
            >
              Create & Start Now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCampaignDialog;
