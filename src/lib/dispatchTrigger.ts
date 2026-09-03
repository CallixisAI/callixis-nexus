import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/components/campaigns/types";

// Event-driven Phase 4 — docs/event-driven-plan/PHASE-4-real-event-triggers.md §A/§B. The one
// client-side helper all three real-event call sites use to poke supabase/functions/dispatch-trigger
// so the dispatcher wakes in seconds instead of waiting for the next timer tick.

export type DispatchTriggerReason = "campaign_started" | "leads_uploaded" | "call_completed";

/**
 * §B.2b — uploading to a paused (or missing) campaign should not start dialing early; only an
 * already-active campaign gets the instant trigger. `dispatch-batch` would correctly find
 * nothing for a paused campaign anyway, but UploadLeadsDialog.tsx already has the campaign's
 * status in hand (via `campaigns.find(...)`), so there's no reason to fire and let it discover
 * that server-side — that's one wasted execution per upload to a paused campaign, avoidable for
 * free.
 */
export function shouldFireLeadsUploadedTrigger(campaign: Pick<Campaign, "status"> | undefined | null): boolean {
  return campaign?.status === "Active";
}

/**
 * §A.3 🔒 — this is an optimization, never a guarantee: the timer/tick still covers every case
 * if this call fails for any reason, so failures are caught and logged here, never rethrown.
 * Callers should fire-and-forget this (don't await it before showing a success toast, and don't
 * wrap it in their own try/catch either — there's nothing to catch). Do not show the user an
 * error for a degraded optimization.
 */
export async function fireDispatchTrigger(reason: DispatchTriggerReason, campaignId?: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("dispatch-trigger", {
      body: { reason, campaign_id: campaignId },
    });
    if (error) {
      console.error("dispatch-trigger: invoke returned an error (non-fatal — dialing still happens on the next tick)", error);
    }
  } catch (err) {
    console.error("dispatch-trigger: failed to fire (non-fatal — dialing still happens on the next tick)", err);
  }
}
