import { useState, useMemo } from "react";
import Papa from "papaparse";
import { Upload, ChevronDown, ChevronRight, Phone, Play, Pause, CheckCircle, XCircle, Clock, FileAudio, Download, Trash2, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

type SortConfig = { key: keyof CallRecord; direction: 'asc' | 'desc' } | null;

const Campaigns = () => {
  const { campaigns = [], isLoading, createCampaign, updateCampaign: updateDBCampaign, addCallRecords, deleteCampaign, deleteCallRecord } = useCampaigns();
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedCampaignForUpload, setSelectedCampaignForUpload] = useState<string>("");
  const [playingRecording, setPlayingRecording] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  
  // Bulk selection and filters
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{ name?: string; phone?: string; email?: string; status?: string; duration?: string; date?: string }>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // Reset selections when campaign changes
  const handleCampaignClick = (campaignId: string) => {
    setExpandedCampaign(expandedCampaign === campaignId ? null : campaignId);
    setSelectedLeadIds(new Set()); // Clear selection when switching campaigns
    setFilters({}); // Clear filters when switching campaigns
    setSortConfig(null); // Clear sort when switching campaigns
  };

  const handleSort = (key: keyof CallRecord) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const toggleSelectLead = (id: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedLeadIds(newSelected);
  };

  const toggleSelectAll = (recordIds: string[]) => {
    if (selectedLeadIds.size === recordIds.length && recordIds.every(id => selectedLeadIds.has(id))) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(recordIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedLeadIds.size} leads?`)) return;
    
    try {
      const idsToDelete = Array.from(selectedLeadIds);
      for (const id of idsToDelete) {
        await deleteCallRecord(id);
      }
      toast.success(`Deleted ${selectedLeadIds.size} leads`);
      setSelectedLeadIds(new Set());
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

  const getFilteredAndSortedRecords = (records: CallRecord[]) => {
    let result = records.filter(r => {
      const matchesName = !filters.name || r.name.toLowerCase().includes(filters.name.toLowerCase());
      const matchesPhone = !filters.phone || r.phone.includes(filters.phone);
      const matchesEmail = !filters.email || r.email.toLowerCase().includes(filters.email.toLowerCase());
      const matchesStatus = !filters.status || r.status === filters.status;
      const matchesDuration = !filters.duration || (r.duration || "").toLowerCase().includes(filters.duration.toLowerCase());
      const matchesDate = !filters.date || (r.callDate || "").toLowerCase().includes(filters.date.toLowerCase());
      return matchesName && matchesPhone && matchesEmail && matchesStatus && matchesDuration && matchesDate;
    });

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key] || "";
        const bVal = b[sortConfig.key] || "";
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  };

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

  const SortIcon = ({ column }: { column: keyof CallRecord }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-1.5 h-3 w-3 text-muted-foreground/50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1.5 h-3 w-3 text-primary" /> : <ArrowDown className="ml-1.5 h-3 w-3 text-primary" />;
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
              onClick={() => handleCampaignClick(campaign.id)}
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
              <div className="border-t border-border" key={campaign.id}>
                <Tabs defaultValue="all" className="w-full">
                  <div className="flex items-center justify-between px-4 pt-3 flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <TabsList className="bg-secondary">
                        <TabsTrigger value="all" className="text-xs">All ({campaign.records.length})</TabsTrigger>
                        <TabsTrigger value="completed" className="text-xs">Completed ({campaign.records.filter(r => r.status === "completed").length})</TabsTrigger>
                        <TabsTrigger value="pending" className="text-xs">Pending ({campaign.records.filter(r => r.status === "pending" || r.status === "in-progress").length})</TabsTrigger>
                        <TabsTrigger value="failed" className="text-xs">Failed ({campaign.records.filter(r => ["failed", "no-answer"].includes(r.status)).length})</TabsTrigger>
                      </TabsList>
                      
                      {selectedLeadIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                          <span className="text-xs font-medium text-primary">{selectedLeadIds.size} selected</span>
                          <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={handleBulkDelete}>
                            <Trash2 className="h-3 w-3" /> Delete Selected
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <Button variant="outline" size="sm" className="border-border text-xs" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedCampaignForUpload(campaign.id); setUploadDialogOpen(true); }}>
                      <Upload className="h-3 w-3 mr-1" />Add Data
                    </Button>
                  </div>

                  {["all", "completed", "pending", "failed"].map(tab => {
                    const tabRecords = campaign.records.filter(r => {
                      if (tab === "all") return true;
                      if (tab === "completed") return r.status === "completed";
                      if (tab === "pending") return r.status === "pending" || r.status === "in-progress";
                      if (tab === "failed") return r.status === "failed" || r.status === "no-answer";
                      return true;
                    });
                    
                    const filteredRecords = getFilteredAndSortedRecords(tabRecords);
                    const allFilteredIds = filteredRecords.map(r => r.id);
                    const isAllSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedLeadIds.has(r.id));

                    return (
                      <TabsContent key={tab} value={tab} className="mt-0">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border bg-muted/30">
                                <th className="p-3 pl-4 w-10 text-left">
                                  <Checkbox 
                                    checked={isAllSelected} 
                                    onCheckedChange={() => toggleSelectAll(allFilteredIds)}
                                  />
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('name')}
                                    >
                                      Name <SortIcon column="name" />
                                    </button>
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                      <Input 
                                        placeholder="Filter..." 
                                        className="h-6 text-[10px] pl-6 bg-background border-border w-24"
                                        value={filters.name || ""}
                                        onChange={(e) => setFilters({...filters, name: e.target.value})}
                                      />
                                    </div>
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('phone')}
                                    >
                                      Phone <SortIcon column="phone" />
                                    </button>
                                    <Input 
                                      placeholder="Filter..." 
                                      className="h-6 text-[10px] px-2 bg-background border-border w-24"
                                      value={filters.phone || ""}
                                      onChange={(e) => setFilters({...filters, phone: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden md:table-cell">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('email')}
                                    >
                                      Email <SortIcon column="email" />
                                    </button>
                                    <Input 
                                      placeholder="Filter..." 
                                      className="h-6 text-[10px] px-2 bg-background border-border w-32"
                                      value={filters.email || ""}
                                      onChange={(e) => setFilters({...filters, email: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('status')}
                                    >
                                      Status <SortIcon column="status" />
                                    </button>
                                    <Select 
                                      value={filters.status || "all"} 
                                      onValueChange={(val) => setFilters({...filters, status: val === "all" ? undefined : val})}
                                    >
                                      <SelectTrigger className="h-6 text-[10px] px-2 bg-background border-border w-28">
                                        <SelectValue placeholder="Status" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-card border-border">
                                        <SelectItem value="all" className="text-xs">All</SelectItem>
                                        {Object.entries(callStatusIcons).map(([key, conf]) => (
                                          <SelectItem key={key} value={key} className="text-xs">{conf.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('duration')}
                                    >
                                      Duration <SortIcon column="duration" />
                                    </button>
                                    <Input 
                                      placeholder="Filter..." 
                                      className="h-6 text-[10px] px-2 bg-background border-border w-16"
                                      value={filters.duration || ""}
                                      onChange={(e) => setFilters({...filters, duration: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden lg:table-cell whitespace-nowrap">
                                  <div className="flex flex-col gap-1.5">
                                    <button 
                                      className="flex items-center hover:text-foreground transition-colors outline-none"
                                      onClick={() => handleSort('callDate')}
                                    >
                                      Date <SortIcon column="callDate" />
                                    </button>
                                    <Input 
                                      placeholder="Filter..." 
                                      className="h-6 text-[10px] px-2 bg-background border-border w-20"
                                      value={filters.date || ""}
                                      onChange={(e) => setFilters({...filters, date: e.target.value})}
                                    />
                                  </div>
                                </th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden xl:table-cell">Notes</th>
                                <th className="text-left text-xs font-medium text-muted-foreground p-3">Recording</th>
                                <th className="p-3 w-10 text-right"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRecords.map((record) => {
                                  const statusConf = callStatusIcons[record.status] || callStatusIcons["pending"];
                                  const StatusIcon = statusConf.icon;
                                  return (
                                    <tr key={record.id} className={`border-b border-border last:border-0 hover:bg-secondary/30 transition-colors ${selectedLeadIds.has(record.id) ? 'bg-primary/5' : ''}`}>
                                      <td className="p-3 pl-4 text-left">
                                        <Checkbox 
                                          checked={selectedLeadIds.has(record.id)} 
                                          onCheckedChange={() => toggleSelectLead(record.id)}
                                        />
                                      </td>
                                      <td className="p-3"><p className="text-sm text-foreground font-medium">{record.name}</p></td>
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
                              {filteredRecords.length === 0 && (
                                <tr>
                                  <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                                    {campaign.records.length > 0 ? "No records match your filters." : "No records found. Upload data to get started."}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </TabsContent>
                    );
                  })}
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