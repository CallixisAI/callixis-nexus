// Shared between every caller of supabase.functions.invoke(...) in this app. Originally
// written inline in AIAgents.tsx for the n8n-proxy call (Phase 5 §F.1/F.2) — supabase-js's
// functions.invoke() only ever gives a generic "Edge Function returned a non-2xx status
// code" in error.message; the real reason (e.g. manage-users's "Only admins can manage
// users") is JSON in the Response body sitting on error.context, which the caller has to
// read itself. Extracted here (Phase 3, docs/admin-module-plan/PHASE-3-role-management-ui.md)
// so useRoles.ts's manage-users calls don't duplicate it a second time.
export async function describeFunctionError(error: unknown, fallback = "Request failed."): Promise<string> {
  const err = error as { name?: string; message?: string; context?: unknown };
  const context = err?.context as Response | undefined;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // Response body wasn't JSON — fall through to the generic message below.
    }
  }
  return err?.message || fallback;
}
