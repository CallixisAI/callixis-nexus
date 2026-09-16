import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0"

// Call-quality plan §D — real finding, 2026-09-11, found while diagnosing James's live test
// call rather than predicted in the plan doc. §D's original build (the `onError` handler on
// `CallDetailSheet`'s `<audio>` tag) correctly separates "no recording" from "recording won't
// play" — but it does NOT make a real recording playable, because the URL `call-ingest` stores
// straight from Vapi's webhook is not a public link. James's test call (2026-09-11, call id
// 01a08f28-…) proved this against a real one: the stored `recording_url` pointed at
// `*.r2.cloudflarestorage.com/hipaa-recordings/…`, and a plain, unauthenticated fetch of it
// returns a real `400 InvalidArgument: Authorization` from Cloudflare R2 — confirmed with curl,
// not assumed. ("hipaa-recordings" in the path is Vapi's internal bucket naming; it does not
// imply this account is in HIPAA mode — see https://docs.vapi.ai/security-and-privacy/hipaa.)
//
// Per Vapi's own docs (https://docs.vapi.ai/assistants/retrieve-call-artifacts), recordings now
// live behind an authenticated endpoint: `GET /call/{id}/mono-recording` (or `stereo-recording`),
// called with a Vapi PRIVATE API key in the Authorization header, which 302-redirects to a
// short-lived signed URL. The webhook's own `recordingUrl` is not that signed URL — it is the
// raw, private storage path, unusable directly. This function is the one place that key is
// allowed to exist (never in the browser, per CLAUDE.md's "Secrets never go in the browser"
// convention) — it re-derives a fresh, short-lived, directly-playable URL on demand, every time
// the call detail sheet is opened, rather than trying to cache one (Vapi's own docs warn signed
// URLs expire quickly — always ask again, never store the redirect target).
//
// This supersedes the call-quality plan's own D-4 ("no VAPI_API_KEY enters the app") — that
// decision was made without knowing Vapi had already moved recordings behind an authenticated
// endpoint. A Private API key is now required for playback to work at all; D-4 is recorded here
// as overturned by this finding, not silently dropped.
//
// NOT live: needs `VAPI_API_KEY` (a Vapi PRIVATE key, not the same class of credential as
// anything already in this project) set as a Supabase secret, and this function deployed.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Vapi's own recording-type endpoints, tried in this order — most calls only ever populate the
// combined "mono" recording (matches Normalize Call's own preferred field,
// `artifact.recording.mono.combinedUrl`); stereo is a documented fallback, not a guess.
const RECORDING_ENDPOINTS = ['mono-recording', 'stereo-recording'] as const

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const vapiKey = Deno.env.get('VAPI_API_KEY')
    if (!vapiKey) return jsonResponse({ error: 'not_configured' }, 500)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => null)
    const callRecordId = body && typeof body === 'object' ? (body as Record<string, unknown>).call_record_id : null
    if (typeof callRecordId !== 'string' || !callRecordId) {
      return jsonResponse({ error: 'call_record_id required' }, 400)
    }

    // The caller's own JWT, not the service role — RLS's existing "own rows only"
    // policy on call_records is what actually enforces ownership here (same pattern
    // session-guard/manage-users already use to read as the caller rather than duplicating
    // an ownership check in application code).
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: record, error: recordError } = await callerClient
      .from('call_records')
      .select('vapi_call_id, recording_url')
      .eq('id', callRecordId)
      .maybeSingle()
    if (recordError) return jsonResponse({ error: 'lookup_failed', detail: recordError.message }, 500)
    // Not found and not-yours look identical on purpose (RLS already filtered) — no ownership
    // information leaks either way.
    if (!record) return jsonResponse({ error: 'not_found' }, 404)
    if (!record.recording_url) return jsonResponse({ error: 'no_recording' }, 404)
    if (!record.vapi_call_id) return jsonResponse({ error: 'no_vapi_call_id' }, 404)

    for (const endpoint of RECORDING_ENDPOINTS) {
      const res = await fetch(`https://api.vapi.ai/call/${record.vapi_call_id}/${endpoint}`, {
        headers: { Authorization: `Bearer ${vapiKey}` },
        redirect: 'manual',
      })
      const location = res.headers.get('location')
      if (res.status === 302 && location) {
        return jsonResponse({ url: location })
      }
      // 404 here means "this call has no recording of this specific type" — try the next one.
      // Anything else (401 bad key, 500 Vapi-side) is worth surfacing, not silently retried.
      if (res.status !== 404) {
        const detail = await res.text().catch(() => '')
        return jsonResponse({ error: 'vapi_fetch_failed', status: res.status, detail }, 502)
      }
    }

    return jsonResponse({ error: 'no_recording' }, 404)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown error' }, 500)
  }
})
