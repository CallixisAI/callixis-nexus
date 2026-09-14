import { useEffect, useMemo, useState } from "react";
import { Phone, Mail, Clock, Star, AlertTriangle, ChevronDown, ChevronRight, ShieldAlert, Trash2, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CallRecord } from "./types";
import { DISPLAY_STATUS_LABEL, DISPLAY_STATUS_HELP, describeAttempts, formatRetryTime } from "@/lib/callPipeline";
import { resolveTranscriptTurns } from "@/lib/transcript";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const OUTCOME_OPTIONS = ["Qualified", "Not Qualified", "Requested Follow-up", "Voicemail", "Unreachable"];
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface CallDetailSheetProps {
  record: CallRecord | null;
  onOpenChange: (open: boolean) => void;
  onOverride: (args: { leadId: string | null; callRecordId: string | null; outcome: string; isQualified: boolean }) => Promise<void>;
  // D.12 — offered specifically for "unattributed" (debris) rows, which already have a working
  // delete action in Campaigns.tsx's table (deleteRecordByKind); this just surfaces the same
  // action here, next to the explanation of why the row isn't a real call.
  onDelete?: (record: CallRecord) => Promise<void>;
  // Permission-overrides plan Phase 4 §H.4 — mirrors the same campaigns.lead_management-at-full
  // gate Campaigns.tsx's own row-delete button uses, since this triggers the identical
  // deleteRecordByKind action. Defaults true so a future caller that doesn't pass it isn't
  // silently locked out.
  canDelete?: boolean;
}

// §D — "record the calls" becomes visible to a human here: the full call outcome, the audio
// (the single most useful thing on the page per the phase doc), and a way to correct the AI.
const CallDetailSheet = ({ record, onOpenChange, onOverride, onDelete, canDelete = true }: CallDetailSheetProps) => {
  // Permission-overrides plan Phase 4 §H.4 (docs/permission-overrides-plan/README.md) —
  // callcenter.recording_access ("view: play recordings, cannot delete" — no delete-recording
  // action exists in this app yet, so presence is the whole gate) and callcenter.outcome_tagging
  // (every holder is `full` in the live matrix, so presence is the whole gate there too).
  const { hasPermission } = useAuth();
  const canAccessRecording = hasPermission("callcenter.recording_access");
  const canTagOutcome = hasPermission("callcenter.outcome_tagging");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [overrideOutcome, setOverrideOutcome] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // §D.2 — the only way to tell "no recording exists" apart from "a recording exists but won't
  // play" (E11 — hasRecording can't do it; it's the same signal as recordingUrl itself).
  const [recordingError, setRecordingError] = useState(false);
  // §D.6 (2026-09-11 addendum) — the URL stored in the DB is Vapi's raw, private storage path,
  // not something a browser can fetch directly (confirmed live: a real recording_url returned a
  // 400 from Cloudflare R2). `get-recording-url` re-derives a fresh, short-lived, actually
  // playable link on demand — fetched once per opened record, never cached past this sheet's
  // lifetime, since Vapi's own docs say the signed URL expires quickly.
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlLoading, setSignedUrlLoading] = useState(false);
  const [signedUrlError, setSignedUrlError] = useState<string | null>(null);

  useEffect(() => {
    setTranscriptOpen(false);
    setOverrideOutcome(record?.outcome || "");
    setRecordingError(false);
    setSignedUrl(null);
    setSignedUrlError(null);

    if (!record?.recordingUrl || !record.callRecordId) {
      setSignedUrlLoading(false);
      return;
    }
    let cancelled = false;
    setSignedUrlLoading(true);
    supabase.functions
      .invoke("get-recording-url", { body: { call_record_id: record.callRecordId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.url) {
          setSignedUrlError(
            data?.error === "no_recording"
              ? "No recording was saved for this call."
              : "Couldn't get a playable link for this recording.",
          );
          return;
        }
        setSignedUrl(data.url as string);
      })
      .catch(() => {
        if (!cancelled) setSignedUrlError("Couldn't get a playable link for this recording.");
      })
      .finally(() => {
        if (!cancelled) setSignedUrlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record?.id, record?.outcome, record?.recordingUrl, record?.callRecordId]);

  // §E.1/§E.2 — D-3's "both": prefers the structured artifact.messages when call-ingest has
  // captured it, falls back to parsing the flat `transcript` string otherwise. Computed before
  // the early return below so hook order stays stable regardless of whether `record` is null.
  const transcriptTurns = useMemo(
    () => resolveTranscriptTurns(record?.transcriptMessages, record?.transcript ?? null),
    [record?.transcriptMessages, record?.transcript],
  );

  if (!record) return null;

  // 2026-09-11 — null for a lead nobody has dialled yet, so the block below simply doesn't render.
  const attempts = describeAttempts(record);
  const retryAt = formatRetryTime(attempts?.retryAt);

  const canOverride = record.kind === "lead";

  const handleSaveOverride = async () => {
    if (!overrideOutcome) return;
    setIsSaving(true);
    try {
      await onOverride({
        leadId: record.kind === "lead" ? record.id : null,
        callRecordId: record.callRecordId ?? null,
        outcome: overrideOutcome,
        isQualified: overrideOutcome === "Qualified",
      });
      toast.success("Outcome updated");
    } catch (err) {
      toast.error(`Failed to update outcome: ${errorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(record);
      toast.success("Row deleted");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to delete: ${errorMessage(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={!!record} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-foreground">
            {record.name || "Unknown lead"}
            {record.needsReview && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                <ShieldAlert className="h-3 w-3" /> Needs Review
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>Call detail{record.doNotCall ? " · flagged do-not-call" : ""}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {record.phone || "—"}</div>
            <div className="flex items-center gap-2 text-muted-foreground truncate"><Mail className="h-3.5 w-3.5 shrink-0" /> {record.email || "—"}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {record.duration} · {record.callDate}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Star className="h-3.5 w-3.5" /> Lead score: {record.leadScore ?? "—"}</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* C.15 — mapped through the one shared label map, not the raw call_records/leads
                vocabulary, so this always agrees with Campaigns/Call Center. */}
            <Badge variant="outline" className="text-xs">{DISPLAY_STATUS_LABEL[record.status]}</Badge>
            {record.outcome && <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">{record.outcome}</Badge>}
          </div>
          {/* 2026-09-11 — the call history a user would otherwise have to open Vapi to learn.
              Rendered for ANY attempted lead, not just the queued ones the table annotates:
              here there is room, and "they hung up" is useful context even on a lead whose
              badge already says the call completed. The raw endedReason is shown alongside the
              friendly label deliberately — this pane is where debugging happens, and an
              unmapped reason must not silently vanish. */}
          {attempts && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1.5">
              <p className="text-xs text-foreground font-medium">
                Attempt {attempts.attemptsMade} of {attempts.attemptsAllowed}
                {attempts.reasonLabel ? ` · ${attempts.reasonLabel}` : ""}
              </p>
              {attempts.rawReason && (
                <p className="text-[10px] text-muted-foreground font-mono">{attempts.rawReason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {attempts.attemptsExhausted
                  ? "No attempts left — this lead won't be dialled again automatically."
                  : retryAt
                    ? `Next attempt scheduled for ${retryAt}.`
                    : "Waiting to be picked up by the dispatcher."}
              </p>
            </div>
          )}

          {/* C.17 — stalled gets its own explanatory line naming the dispatcher's sweep, so
              "why has this lead been dialing forever" has an answer right here. */}
          {record.status === "stalled" && (
            <p className="text-xs text-orange-400/90 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5 leading-relaxed">
              {DISPLAY_STATUS_HELP.stalled}
            </p>
          )}

          {/* D.12 — "Not a call attempt" rows are debris (E9), excluded from every count already;
              this is the hint offering the same delete action Campaigns.tsx's table already has,
              right next to the explanation of why the row looks like this. */}
          {record.status === "unattributed" && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{DISPLAY_STATUS_HELP.unattributed}</p>
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || !canDelete}
                  title={canDelete ? undefined : "Needs the Campaigns — Lead Management permission at Full"}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {isDeleting ? "Deleting…" : "Delete this row"}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Summary</p>
            <p className="text-sm text-foreground bg-secondary/40 rounded-lg p-3 border border-border">{record.notes || "No summary recorded for this call."}</p>
          </div>

          {record.disqualReason && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Disqualification Reason</p>
              <p className="text-sm text-foreground bg-secondary/40 rounded-lg p-3 border border-border">{record.disqualReason}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recording</p>
            {!canAccessRecording ? (
              <p className="text-xs text-muted-foreground">Needs the Call Center — Recording Access permission.</p>
            ) : !record.recordingUrl ? (
              <p className="text-xs text-muted-foreground">No recording was saved for this call.</p>
            ) : signedUrlLoading ? (
              <p className="text-xs text-muted-foreground">Getting a playable link…</p>
            ) : signedUrl ? (
              <div className="space-y-1.5">
                <audio
                  controls
                  preload="none"
                  src={signedUrl}
                  className="w-full h-10"
                  // §D.2 — this is the ONLY way to distinguish "recording exists but won't play"
                  // (an expired signed link, an unsupported codec) from having none at all — even
                  // with a real, freshly-signed URL, playback can still fail for reasons this
                  // component can't predict up front.
                  onError={() => setRecordingError(true)}
                />
                {recordingError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> The recording couldn't be loaded — open it directly.
                  </p>
                )}
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Open in new tab
                </a>
              </div>
            ) : (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {signedUrlError ?? "Couldn't get a playable link for this recording."}
              </p>
            )}
          </div>

          {transcriptTurns.length > 0 && (
            <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between border-border text-xs">
                  Transcript
                  {transcriptOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {/* §E.5a — the escape hatch. Exactly one "unknown" turn means the parser found no
                    speaker markers at all — render the original flat block verbatim, unchanged
                    from today, rather than turning unparseable text into one giant mislabelled
                    "bubble". */}
                {transcriptTurns.length === 1 && transcriptTurns[0].speaker === "unknown" ? (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-secondary/40 rounded-lg p-3 border border-border max-h-64 overflow-y-auto font-sans">{transcriptTurns[0].text}</pre>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto bg-secondary/40 rounded-lg p-3 border border-border">
                    {transcriptTurns.map((turn, index) => (
                      <div key={index} className={`flex ${turn.speaker === "lead" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-lg p-2.5 text-xs ${
                            turn.speaker === "lead"
                              ? "bg-primary/10 text-foreground"
                              : turn.speaker === "agent"
                                ? "bg-card border border-border text-foreground"
                                : "bg-muted/50 text-muted-foreground italic"
                          }`}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-70">
                            {turn.speaker === "agent" ? record.agent || "Agent" : turn.speaker === "lead" ? record.name || "Lead" : "Unknown"}
                          </p>
                          <p className="whitespace-pre-wrap">{turn.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Manual Override</p>
            {!canTagOutcome ? (
              <p className="text-xs text-muted-foreground">Needs the Call Center — Outcome Tagging permission.</p>
            ) : canOverride ? (
              <>
                <p className="text-xs text-muted-foreground">Correct the AI's verdict. This is recorded against your account and timestamped.</p>
                <div className="flex gap-2">
                  <Select value={overrideOutcome} onValueChange={setOverrideOutcome}>
                    <SelectTrigger className="bg-secondary border-border text-sm flex-1"><SelectValue placeholder="Choose outcome…" /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {OUTCOME_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSaveOverride} disabled={isSaving || !overrideOutcome || overrideOutcome === record.outcome} className="glow-cyan shrink-0">
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">This call record predates the leads table (or couldn't be matched to a lead), so there's no outcome field to override here.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CallDetailSheet;
