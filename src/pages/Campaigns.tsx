import { useState } from "react";
import Papa from "papaparse";
import { Upload, ChevronDown, ChevronRight, Phone, Play, Pause, CheckCircle, XCircle, Clock, FileAudio, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TimeframeFilter, type TimeframePreset } from "@/components/TimeframeFilter";
import { toast } from "sonner";
import { Campaign, CallRecord, statusColor } from "@/components/campaigns/types";
import CampaignSettingsDialog from "@/components/campaigns/CampaignSettingsDialog";
import CreateCampaignDialog from "@/components/campaigns/CreateCampaignDialog";
import { useCampaigns } from "@/hooks/useCampaigns";

const callStatusIcons: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "completed": { icon: CheckCircle, color: "text-primary", label: "Completed" },
  "no-answer": { icon: XCircle, color: "text-yellow-400", label: "No Answer" },
  "voicemail": { icon: FileAudio, color: "text-blue-400", label: "Voicemail" },
  "callback": { icon: Phone, color: "text-orange-400", label: "Callback" },
  "pending": { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  "in-progress": { icon: Play, color: "text-primary", label: "In Progress" },
  "failed": { icon: XCircle, color: "text-destructive", label: "Failed" },
};

const defaultWorkHours = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" };

const sampleRecords: CallRecord[] = [
  { id: "1", name: "John Smith", phone: "+1 (555) 234-5678", email: "john@realty.com", status: "completed", duration: "3:24", callDate: "2025-03-22 10:15", hasRecording: true, notes: "Interested in listing. Follow up next week.", agent: "LeadGen Pro" },
  { id: "2", name: "Maria Garcia", phone: "+1 (555) 345-6789", email: "maria.g@email.com", status: "no-answer", duration: "0:00", callDate: "2025-03-22 10:18", hasRecording: false, notes: "", agent: "LeadGen Pro" },
  { id: "3", name: "Robert Chen", phone: "+1 (555) 456-7890", email: "rchen@properties.com", status: "voicemail", duration: "0:32", callDate: "2025-03-22 10:22", hasRecording: true, notes: "Left voicemail with callback info.", agent: "LeadGen Pro" },
  { id: "4", name: "Sarah Johnson", phone: "+1 (555) 567-8901", email: "sarah.j@mail.com", status: "callback", duration: "1:45", callDate: "2025-03-22 10:30", hasRecording: true, notes: "Requested callback at 3 PM.", agent: "LeadGen Pro" },
  { id: "5", name: "David Wilson", phone: "+1 (555) 678-9012", email: "dwilson@email.com", status: "completed", duration: "5:12", callDate: "2025-03-22 10:35", hasRecording: true, notes: "Booked appointment for property viewing.", agent: "LeadGen Pro" },
  { id: "6", name: "Emily Brown", phone: "+1 (555) 789-0123", email: "emily.b@gmail.com", status: "pending", duration: "—", callDate: "—", hasRecording: false, notes: "", agent: "LeadGen Pro" },
  { id: "7", name: "Michael Davis", phone: "+1 (555) 890-1234", email: "mdavis@outlook.com", status: "failed", duration: "0:03", callDate: "2025-03-22 11:00", hasRecording: false, notes: "Invalid number.", agent: "LeadGen Pro" },
  { id: "8", name: "Lisa Anderson", phone: "+1 (555) 901-2345", email: "lisa.a@realestate.com", status: "in-progress", duration: "2:10", callDate: "2025-03-22 11:05", hasRecording: false, notes: "Currently on call.", agent: "LeadGen Pro" },
];

const initialCampaigns: Campaign[] = [
  { id: "1", name: "Real Estate Q1 Outreach", status: "Active", calls: 12400, conversion: "16.2%", industry: "Real Estate", agent: "LeadGen Pro", records: sampleRecords, workHours: defaultWorkHours, maxQualifiedLeads: 500, qualifiedLeadsSent: 142, crmApiEndpoint: "https://crm.example.com/api/leads" },
  { id: "2", name: "Insurance Lead Gen", status: "Active", calls: 8300, conversion: "12.8%", industry: "Insurance", agent: "InsureBot", records: sampleRecords.slice(0, 5), workHours: defaultWorkHours, maxQualifiedLeads: 300, qualifiedLeadsSent: 87, crmApiEndpoint: "" },
  { id: "3", name: "Medical Appointments", status: "Paused", calls: 5600, conversion: "22.1%", industry: "Medical", agent: "MedScheduler", records: sampleRecords.slice(0, 3), workHours: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "08:00", endTime: "16:00" }, maxQualifiedLeads: 200, qualifiedLeadsSent: 200, crmApiEndpoint: "https://medical-crm.io/webhook" },
  { id: "4", name: "Auto Dealership Follow-up", status: "Active", calls: 3200, conversion: "9.4%", industry: "Car Sales", agent: "AutoSales AI", records: sampleRecords.slice(0, 4), workHours: { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], startTime: "10:00", endTime: "19:00" }, maxQualifiedLeads: 0, qualifiedLeadsSent: 45, crmApiEndpoint: "" },
  { id: "5", name: "Home Improvement Summer", status: "Scheduled", calls: 0, conversion: "—", industry: "Home Improvement", agent: "HomeReno Bot", records: [], workHours: defaultWorkHours, maxQualifiedLeads: 100, qualifiedLeadsSent: 0, crmApiEndpoint: "" },
];

const Campaigns = () => {
  const { campaigns = [], isLoading, createCampaign, updateCampaign: updateDBCampaign, addCallRecords, deleteCampaign, deleteCallRecord } = useCampaigns();
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedCampaignForUpload, setSelectedCampaignForUpload] = useState<string>("");
  const [playingRecording, setPlayingRecording] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});

  const downloadExampleCSV = () => {
    const csvContent = "Country Code,Name,Surname,Email,Phone,Source,Notes\n+1,John,Smith,john@example.com,555-0199,Website,Interested in mortgage\n+44,Jane,Doe,jane@example.co.uk,7700 900123,Google Ads,Follow up next week";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "callixis_leads_example.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaignForUpload) return;
    
    toast.info("Processing file...");
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedData = results.data as any[];
        
        if (parsedData.length === 0) {
          toast.error("File is empty or could not be parsed.");
          return;
        }

        const mockRecords = parsedData.map((row, i) => ({
          name: `${row.Name || row.name || ""} ${row.Surname || row.surname || ""}`.trim() || `Imported Lead ${i + 1}`,
          phone: row.Phone || row.phone || "",
          email: row.Email || row.email || "",
          notes: `${row.Source || row.source ? `Source: ${row.Source || row.source}. ` : ""}${row.Notes || row.notes || "Imported via CSV"}`
        })).filter(record => record.phone || record.email);

        if (mockRecords.length === 0) {
          toast.error("No valid contacts found. Please check columns (Name, Surname, Phone, Email).");
          return;
        }

        try {
          await addCallRecords({ campaignId: selectedCampaignForUpload, records: mockRecords });
          toast.success(`Successfully imported ${mockRecords.length} contacts!`);
        } catch (error: any) {
          toast.error(`Failed to import records: ${error.message}`);
        } finally {
          setUploadDialogOpen(false);
          setSelectedCampaignForUpload("");
          if (e.target) e.target.value = '';
        }
      },
      error: (error: any) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
      }
    });
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete campaign "${name}"? This will also delete all associated leads.`)) return;
    try {
      await deleteCampaign(id);
      toast.success("Campaign deleted");
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteCallRecord(id);
      toast.success("Lead deleted");
    } catch (err: any) {
      toast.error(`Failed to delete lead: ${err.message}`);
    }
  };

  const toggleRecording = (recordId: string) => {
    setPlayingRecording(prev => (prev === recordId ? null : recordId));
  };

  const toggleCampaignStatus = async (campaignId: string, e: React.MouseEvent, currentStatus: string, name: string) => {
    e.stopPropagation();
    const newStatus = currentStatus === "Active" ? "Paused" : "Active";
    
    try {
      await updateDBCampaign({ id: campaignId, updates: { status: newStatus } });
      toast.success(`"${name}" ${newStatus === "Active" ? "started" : "paused"}`);
    } catch (err: any) {
      toast.error(`Failed to update status: ${err?.message}`);
    }
  };

  const updateCampaignSettings = async (id: string, updates: Partial<Campaign>) => {
    try {
      // In a full implementation, you'd save 'workHours' and 'crmApiEndpoint' too.
      // We only mapped status to supabase for this quick pass.
      await updateDBCampaign({ id, updates });
      toast.success(`Settings updated`);
    } catch (err: any) {
      toast.error(`Failed to update settings: ${err?.message}`);
    }
  };

  const handleCreate = async (c: Campaign) => {
    try {
      const createdCampaign = await createCampaign(c);
      
      if (c.records && c.records.length > 0 && createdCampaign?.id) {
        await addCallRecords({ campaignId: createdCampaign.id, records: c.records });
      }
      
      toast.success("Campaign stored securely!");
    } catch (err: any) {
      toast.error(`Failed to save: ${err?.message}`);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading campaigns from database...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your outbound AI calling campaigns</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <TimeframeFilter value={timeframe} onChange={setTimeframe} customRange={customRange} onCustomRangeChange={setCustomRange} compact />
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border"><Upload className="h-4 w-4 mr-2" />Upload Data</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Upload Call Data</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Select Campaign</Label>
                  <Select value={selectedCampaignForUpload} onValueChange={setSelectedCampaignForUpload}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Choose a campaign..." /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {campaigns.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Upload File (CSV / Excel)</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/40 transition-colors">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Drag & drop or click to browse</p>
                    <p className="text-xs text-muted-foreground mb-4">Supported: .csv, .xlsx, .xls</p>
                    <Input type="file" accept=".csv,.xlsx,.xls" className="max-w-xs mx-auto bg-secondary border-border" onChange={handleFileUpload} disabled={!selectedCampaignForUpload} />
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground font-medium">Expected columns:</p>
                    <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-primary" onClick={downloadExampleCSV}>
                      <Download className="h-2.5 w-2.5 mr-1" />Download Example
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Country Code, Name, Surname, Email, Phone, Source, Notes</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <CreateCampaignDialog onCreated={handleCreate} />
        </div>
      </div>

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.length === 0 && (
          <div className="text-center p-8 bg-card border border-border rounded-lg text-muted-foreground">
            No campaigns found. Create your first real campaign above!
          </div>
        )}
        {campaigns.map((campaign: Campaign) => (
          <div key={campaign.id} className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Campaign Row */}
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
              onClick={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}
            >
              <div className="text-muted-foreground">
                {expandedCampaign === campaign.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                <p className="text-xs text-muted-foreground">
                  {campaign.industry} · {campaign.agent}
                  {campaign.workHours?.days?.length > 0 && (
                    <span className="ml-2 text-muted-foreground/60">
                      · {campaign.workHours.days.join(", ")} {campaign.workHours.startTime}–{campaign.workHours.endTime}
                    </span>
                  )}
                </p>
              </div>

              {/* Start / Pause button */}
              {campaign.status !== "Completed" && campaign.status !== "Scheduled" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => toggleCampaignStatus(campaign.id, e, campaign.status, campaign.name)}
                  title={campaign.status === "Active" ? "Pause campaign" : "Start campaign"}
                >
                  {campaign.status === "Active"
                    ? <Pause className="h-4 w-4 text-yellow-400" />
                    : <Play className="h-4 w-4 text-primary" />
                  }
                </Button>
              )}
              {campaign.status === "Scheduled" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await updateDBCampaign({ id: campaign.id, updates: { status: "Active" }});
                    toast.success(`"${campaign.name}" started`);
                  }}
                  title="Start campaign now"
                >
                  <Play className="h-4 w-4 text-primary" />
                </Button>
              )}

              {/* Settings */}
              <CampaignSettingsDialog campaign={campaign} onSave={updateCampaignSettings} />

              <Badge variant="outline" className={`text-xs ${statusColor[campaign.status]}`}>
                {campaign.status}
              </Badge>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-foreground">{campaign.calls.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">calls</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-foreground">{campaign.conversion}</p>
                <p className="text-xs text-muted-foreground">conversion</p>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-sm text-foreground">
                  {campaign.qualifiedLeadsSent}{campaign.maxQualifiedLeads > 0 ? `/${campaign.maxQualifiedLeads}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">qualified</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-foreground">{campaign.records.length}</p>
                <p className="text-xs text-muted-foreground">contacts</p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(campaign.id, campaign.name); }}
                title="Delete campaign"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Expanded Call Records */}
            {expandedCampaign === campaign.id && (
              <div className="border-t border-border">
                <Tabs defaultValue="all" className="w-full">
                  <div className="flex items-center justify-between px-4 pt-3 flex-wrap gap-2">
                    <TabsList className="bg-secondary">
                      <TabsTrigger value="all" className="text-xs">All ({campaign.records.length})</TabsTrigger>
                      <TabsTrigger value="completed" className="text-xs">Completed ({campaign.records.filter(r => r.status === "completed").length})</TabsTrigger>
                      <TabsTrigger value="pending" className="text-xs">Pending ({campaign.records.filter(r => r.status === "pending").length})</TabsTrigger>
                      <TabsTrigger value="failed" className="text-xs">Failed ({campaign.records.filter(r => ["failed", "no-answer"].includes(r.status)).length})</TabsTrigger>
                    </TabsList>
                    <Button variant="outline" size="sm" className="border-border text-xs" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedCampaignForUpload(campaign.id); setUploadDialogOpen(true); }}>
                      <Upload className="h-3 w-3 mr-1" />Add Data
                    </Button>
                  </div>

                  {["all", "completed", "pending", "failed"].map(tab => (
                    <TabsContent key={tab} value={tab} className="mt-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left text-xs font-medium text-muted-foreground p-3 pl-4">Name</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3">Phone</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden md:table-cell">Email</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3">Status</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell">Duration</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell">Date</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden xl:table-cell">Notes</th>
                              <th className="text-left text-xs font-medium text-muted-foreground p-3">Recording</th>
                              <th className="p-3 w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {campaign.records
                              .filter(r => {
                                if (tab === "all") return true;
                                if (tab === "completed") return r.status === "completed";
                                if (tab === "pending") return r.status === "pending" || r.status === "in-progress";
                                if (tab === "failed") return r.status === "failed" || r.status === "no-answer";
                                return true;
                              })
                              .map((record) => {
                                const statusConf = callStatusIcons[record.status];
                                const StatusIcon = statusConf.icon;
                                return (
                                  <tr key={record.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                                    <td className="p-3 pl-4"><p className="text-sm text-foreground font-medium">{record.name}</p></td>
                                    <td className="p-3 text-sm text-muted-foreground">{record.phone}</td>
                                    <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">{record.email}</td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5">
                                        <StatusIcon className={`h-3.5 w-3.5 ${statusConf.color}`} />
                                        <span className={`text-xs ${statusConf.color}`}>{statusConf.label}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell">{record.duration}</td>
                                    <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">{record.callDate}</td>
                                    <td className="p-3 text-xs text-muted-foreground hidden xl:table-cell max-w-[200px] truncate">{record.notes || "—"}</td>
                                    <td className="p-3">
                                      {record.hasRecording ? (
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); toggleRecording(record.id); }}>
                                          {playingRecording === record.id ? <Pause className="h-3.5 w-3.5 text-primary" /> : <Play className="h-3.5 w-3.5 text-primary" />}
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteLead(record.id); }}
                                        title="Delete lead"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            {campaign.records.filter(r => {
                              if (tab === "all") return true;
                              if (tab === "completed") return r.status === "completed";
                              if (tab === "pending") return r.status === "pending" || r.status === "in-progress";
                              if (tab === "failed") return r.status === "failed" || r.status === "no-answer";
                              return true;
                            }).length === 0 && (
                              <tr>
                                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                                  No records found. Upload data to get started.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Campaigns;
