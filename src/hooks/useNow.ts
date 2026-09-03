import { useEffect, useState } from "react";

// docs/counting-model-plan/README.md, Phase 2 §B.3 — a lead stuck `dialing` for 30 minutes
// (STUCK_CALL_MINUTES, src/lib/callPipeline.ts) should read as `stalled` without the user having
// to reload the page. bucketLead()/isStalledDialing() take a `now` argument for exactly this: a
// component re-renders on a tick from this hook, calls them with a fresh `now`, and a lead
// crosses the threshold live instead of only on the next full data refetch.
//
// Minute granularity is deliberate — nothing in this app's counting model needs second-level
// precision, and re-rendering every consumer once a second for no reason is wasteful. Untested by
// design: this is a thin setInterval wrapper around Date.now(), the same kind of "just a clock"
// utility this project doesn't unit-test elsewhere (Dashboard.tsx's pre-existing `gmtTime` clock
// is the same shape).
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
