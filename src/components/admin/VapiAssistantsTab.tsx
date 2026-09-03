import { useState } from "react";
import { toast } from "sonner";
import { Bot, Save, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { INDUSTRIES } from "@/lib/industries";
import {
  useIndustryAssistants,
  useSetIndustryAssistant,
  useDeleteIndustryAssistant,
  isValidAssistantId,
} from "@/hooks/useIndustryAssistants";

// AI Agents plan (docs/AI-Agents-plan/README.md), Phase 4 §E.13 — the admin UI for the
// industry → Vapi assistant map (D-2, D-5: super_admin only, enforced by this table's own RLS,
// not just this component being hidden — see 20260903000000_industry_assistants.sql §B). Follows
// SecurityTab.tsx/AuditTab.tsx's existing shape: one row per meaningful unit (here, one of the
// INDUSTRIES list values), inline edit, save writes immediately.
//
// D-12/E20 — every value saved here is Callixis-wide: one assistant serves every customer whose
// campaigns are in that industry, not just the admin who pasted it. Get the id right; a mistake
// here silently redirects an entire industry's calls, platform-wide, which is the exact bug
// (Medical leads pitched home-improvement) this whole plan exists to end.
export function VapiAssistantsTab() {
  const { data: rows = [], isLoading } = useIndustryAssistants();
  const setAssistant = useSetIndustryAssistant();
  const deleteAssistant = useDeleteIndustryAssistant();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const byIndustry = new Map(rows.map((r) => [r.industry, r]));
  const mappedCount = rows.length;

  const draftFor = (industry: string) => drafts[industry] ?? byIndustry.get(industry)?.vapi_assistant_id ?? "";

  const handleSave = async (industry: string) => {
    const value = draftFor(industry).trim();
    if (!isValidAssistantId(value)) {
      toast.error("That doesn't look like a Vapi assistant id (expected a UUID).");
      return;
    }
    try {
      await setAssistant.mutateAsync({ industry, vapiAssistantId: value });
      toast.success(`"${industry}" now points at ${value}.`);
      setDrafts((prev) => { const next = { ...prev }; delete next[industry]; return next; });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    }
  };

  const handleClear = async (industry: string) => {
    try {
      await deleteAssistant.mutateAsync(industry);
      toast.success(`"${industry}" is unmapped — leads in it will be skipped, not dialled with a fallback (D-4).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear.");
    }
  };

  return (
    <div className="space-y-6">
      <Alert className="border-primary/30 bg-primary/5">
        <Bot className="h-4 w-4 text-primary" />
        <AlertTitle className="text-sm">Callixis-wide, not per-customer</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          One assistant per industry serves every customer in it (D-12) — a customer's own
          agent script is layered on top per call and never changes what's saved here. A lead
          whose industry has no assistant mapped is skipped, not dialled with a default (D-4) —
          {mappedCount} of {INDUSTRIES.length} industries currently mapped.
        </AlertDescription>
      </Alert>

      <Card className="border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Industry → Vapi assistant</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste the assistant id from the Vapi dashboard. Format only is checked here — not
            that the id actually exists on Vapi.
          </p>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            INDUSTRIES.map((industry) => {
              const existing = byIndustry.get(industry);
              const draft = draftFor(industry);
              const dirty = draft !== (existing?.vapi_assistant_id ?? "");
              return (
                <div key={industry} className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="w-40 shrink-0">
                    <p className="text-sm font-medium text-foreground">{industry}</p>
                    {existing ? (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-500 mt-1">Mapped</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-500 mt-1">Unmapped — leads skipped</Badge>
                    )}
                  </div>
                  <Input
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [industry]: e.target.value }))}
                    placeholder="311aed1f-7c12-4259-9ad8-202b5a0ae688"
                    className="flex-1 min-w-[240px] bg-secondary border-border font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={!dirty || setAssistant.isPending}
                    onClick={() => handleSave(industry)}
                    className="gap-1.5"
                  >
                    {setAssistant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                  {existing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleClear(industry)}
                      title="Unmap this industry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
