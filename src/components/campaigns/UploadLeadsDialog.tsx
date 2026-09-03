import { useState } from "react";
import Papa from "papaparse";
import { Upload, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Campaign } from "./types";
import { buildLeadPreview, type LeadPreview, type RawCsvRow } from "@/lib/leadCsv";
import { fireDispatchTrigger, shouldFireLeadsUploadedTrigger } from "@/lib/dispatchTrigger";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface UploadLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: Campaign[];
  defaultCampaignId?: string;
  addLeads: (args: { campaignId: string; rows: LeadPreview["validRows"]; onProgress?: (done: number, total: number) => void }) => Promise<{ inserted: number; attempted: number }>;
}

type Step = "select" | "preview" | "uploading";

const downloadExampleCSV = () => {
  const csvContent = "Country Code,Name,Surname,Email,Phone,Source,Notes\n+1,John,Smith,john@example.com,555-0199,Website,Interested in mortgage\n+44,Jane,Doe,jane@example.co.uk,7700 900123,Google Ads,Follow up next week";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "callixis_leads_example.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const UploadLeadsDialog = ({ open, onOpenChange, campaigns, defaultCampaignId, addLeads }: UploadLeadsDialogProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("select");
  const [campaignId, setCampaignId] = useState(defaultCampaignId ?? "");
  const [preview, setPreview] = useState<LeadPreview | null>(null);
  const [existingDuplicateCount, setExistingDuplicateCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setStep("select");
    setCampaignId(defaultCampaignId ?? "");
    setPreview(null);
    setExistingDuplicateCount(0);
    setProgress({ done: 0, total: 0 });
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const handleFile = (file: File | undefined) => {
    if (!file || !campaignId || !user) return;

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.data.length === 0) {
          toast.error("File is empty or could not be parsed.");
          return;
        }

        const built = buildLeadPreview(results.data);
        setPreview(built);
        setIsChecking(true);
        setStep("preview");

        // §A.5 — the (user_id, phone) unique index is what actually rejects duplicates on
        // insert; this is only to show the count ahead of time, per §A.4's "show a preview
        // before committing" rather than surprising the user with a smaller count after the fact.
        try {
          const phones = built.validRows.map((row) => row.phone);
          if (phones.length > 0) {
            const { count, error } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .in("phone", phones);
            if (error) throw error;
            setExistingDuplicateCount(count ?? 0);
          } else {
            setExistingDuplicateCount(0);
          }
        } catch (err) {
          toast.error(`Could not check for existing duplicates: ${errorMessage(err)}`);
        } finally {
          setIsChecking(false);
        }
      },
      error: (error: Error) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const handleConfirm = async () => {
    if (!preview || preview.validRows.length === 0 || !campaignId) return;
    setStep("uploading");
    setProgress({ done: 0, total: preview.validRows.length });
    try {
      const result = await addLeads({
        campaignId,
        rows: preview.validRows,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      // Event-driven Phase 4 §B.2 — once, after the whole (possibly chunked) upload resolves,
      // never per chunk. §B.2b: only for a campaign that's already Active — the dialog already
      // has the campaign's status in hand (`campaigns` is passed in as a prop), so there's no
      // need to guess or let dispatch-batch discover it server-side.
      const targetCampaign = campaigns.find((c) => c.id === campaignId);
      if (shouldFireLeadsUploadedTrigger(targetCampaign)) {
        void fireDispatchTrigger("leads_uploaded", campaignId);
      }
      const skipped = result.attempted - result.inserted;
      toast.success(
        `Added ${result.inserted} lead${result.inserted === 1 ? "" : "s"}` +
          (skipped > 0 ? ` (${skipped} already existed and were skipped)` : "")
      );
      close();
    } catch (err) {
      toast.error(`Upload failed: ${errorMessage(err)}`);
      setStep("preview");
    }
  };

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Upload Leads</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Select Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Choose a campaign..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {campaigns.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Upload File (CSV)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/40 transition-colors">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">Drag & drop or click to browse</p>
                <p className="text-xs text-muted-foreground mb-4">Supported: .csv</p>
                <Input type="file" accept=".csv" className="max-w-xs mx-auto bg-secondary border-border" onChange={(e) => handleFile(e.target.files?.[0])} disabled={!campaignId} />
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
              <p className="text-xs text-muted-foreground mt-1">Phone numbers are normalized to E.164 before anything is saved.</p>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                <p className="text-lg font-bold text-foreground">{preview.validRows.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ready to add</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                <p className="text-lg font-bold text-destructive">{preview.invalidCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Invalid phone</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                <p className="text-lg font-bold text-yellow-500">{preview.duplicateInFileCount + existingDuplicateCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Duplicates</p>
              </div>
            </div>

            {isChecking && (
              <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Checking for existing leads…</p>
            )}

            {(preview.invalidCount > 0 || preview.duplicateInFileCount > 0) && (
              <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {preview.rows.filter((r) => r.invalidReason || r.duplicateInFile).slice(0, 20).map((r) => (
                  <div key={r.rowNum} className="p-2 text-xs flex justify-between gap-2">
                    <span className="text-muted-foreground">Row {r.rowNum}{r.firstName ? ` — ${r.firstName}` : ""}</span>
                    <span className="text-destructive text-right">{r.invalidReason ?? "duplicate in file"}</span>
                  </div>
                ))}
              </div>
            )}

            {existingDuplicateCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {existingDuplicateCount} of the valid rows already exist for {selectedCampaign ? "this account" : "you"} and will be skipped, not duplicated.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border" onClick={reset}>Back</Button>
              <Button className="flex-1 glow-cyan" onClick={handleConfirm} disabled={preview.validRows.length === 0 || isChecking}>
                Add {preview.validRows.length} Lead{preview.validRows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "uploading" && (
          <div className="space-y-4 pt-4 pb-2">
            <p className="text-sm text-muted-foreground text-center">Uploading {progress.total} lead{progress.total === 1 ? "" : "s"}…</p>
            <Progress value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} />
            <p className="text-xs text-muted-foreground text-center">{progress.done} / {progress.total}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UploadLeadsDialog;
