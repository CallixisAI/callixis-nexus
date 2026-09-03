import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Phase 5 (admin-module-plan) — docs/admin-module-plan/PHASE-5-ip-whitelisting.md §D.
// The post-login edge gate. Login.tsx calls this immediately after a successful
// signInWithPassword, before navigating (§D.2) — see that file's own comment for D-5's
// recorded decision: checked at login only, not continuously. A session that moves networks
// mid-lifetime keeps working until the token expires; that is a materially weaker claim than
// "checked continuously" and is written down here, not silently implied.
//
// | Aspect | Decision |
// |---|---|
// | Auth   | verify_jwt: true — caller is the just-signed-in user's own session.
// | Header | cf-connecting-ip (§A, run live 2026-08-26 — see the migration's header comment).
// |        | Cloudflare sets this at the edge; a client cannot forge it, unlike
// |        | x-forwarded-for, which this function deliberately does NOT trust.
// | Fail-open on our own errors | §A.3 of dispatch-trigger's own precedent: a bug/outage in
// |        | THIS function must never itself block a legitimate login. Only an explicit,
// |        | successfully-computed `allowed: false` blocks. Any exception, missing IP, or
// |        | DB error returns `allowed: true` — see the catch-all at the bottom.
// |        | ⚠️ This is a deliberate, recorded trade-off, not an oversight: it means an outage
// |        | of THIS function silently degrades IP enforcement to "off" rather than locking
// |        | everyone out. The RLS layer (ip_allowed(), in the migration) has no equivalent
// |        | escape hatch — it fails CLOSED on a missing header once in 'enforce' mode with
// |        | real rules on file, which is the layer that actually has to hold under attack.
// |        | This function's job is a fast, friendly denial message; the RLS layer is the
// |        | real boundary. Recorded here so nobody mistakes this fail-open behaviour for the
// |        | feature's real enforcement.
// | Log    | Every mode, including 'off' (§D.4) — via the service-role client, which bypasses
// |        | ip_access_log's admin-only RLS policy (same pattern call-ingest/dispatch-batch use
// |        | to write tables their own RLS would otherwise block them from).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonResponse = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      // No session to guard — not this function's job to decide whether that's okay.
      return jsonResponse({ allowed: true })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      // Not this function's job to reject a bad session — signInWithPassword already
      // succeeded by the time this runs; Login.tsx has its own handling for that case.
      return jsonResponse({ allowed: true })
    }

    // §A's finding, applied here exactly as in ip_allowed(): cf-connecting-ip only.
    const clientIp = req.headers.get('cf-connecting-ip')

    const { data: settingsRows } = await supabase
      .from('security_settings')
      .select('ip_enforcement')
      .eq('id', true)
      .maybeSingle()
    const mode = settingsRows?.ip_enforcement ?? 'off'

    let allowed = true

    if (mode === 'enforce') {
      const { data: rules } = await supabase
        .from('user_ip_rules')
        .select('cidr')
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .not('approved_by', 'is', null)

      // D-8: no approved rules on file for this user = unrestricted, not locked out.
      if (rules && rules.length > 0) {
        allowed = !!clientIp && rules.some((r) => ipInCidr(clientIp, r.cidr))
      }
    }
    // 'off'/'audit': always allowed through at this layer — 'audit' exists to observe the real
    // IP spread (§F.1/F.5/F.6) before anyone commits to blocking on it, not to block anything
    // itself.

    // §D.4 — log in every mode, including 'off'. Best-effort: a logging failure must not
    // affect the login outcome either.
    await supabase.from('ip_access_log').insert({
      user_id: caller.id,
      ip: clientIp,
      allowed,
      mode,
    }).then(
      () => {},
      (err) => console.error('session-guard: failed to write ip_access_log', err)
    )

    return jsonResponse({ allowed, ip: clientIp, mode })
  } catch (error) {
    console.error('session-guard: unexpected error, failing open', error instanceof Error ? error.message : String(error))
    return jsonResponse({ allowed: true })
  }
})

// Minimal IPv4/IPv6 CIDR containment check — Deno's std lib has no built-in inet type, and
// pulling in a dependency for one comparison isn't worth it. Handles the two shapes
// user_ip_rules.cidr can actually contain (checked by the DB's own CHECK constraint: v4 /24+
// or v6 /48+), not general-purpose IP parsing.
function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  if (ip.includes(':') !== range.includes(':')) return false // family mismatch

  if (ip.includes(':')) {
    return ipv6InCidr(ip, range, bits)
  }
  return ipv4InCidr(ip, range, bits)
}

function ipv4InCidr(ip: string, range: string, bits: number): boolean {
  const toInt = (addr: string) =>
    addr.split('.').reduce((acc, octet) => (acc << 8) + (parseInt(octet, 10) & 255), 0) >>> 0
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (toInt(ip) & mask) === (toInt(range) & mask)
}

function ipv6InCidr(ip: string, range: string, bits: number): boolean {
  const toBytes = (addr: string): number[] => {
    // Expand '::' shorthand.
    const [head, tail] = addr.split('::')
    const headParts = head ? head.split(':') : []
    const tailParts = tail ? tail.split(':') : []
    const missing = 8 - headParts.length - tailParts.length
    const parts = addr.includes('::')
      ? [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts]
      : addr.split(':')
    const bytes: number[] = []
    for (const part of parts) {
      const val = parseInt(part || '0', 16)
      bytes.push((val >> 8) & 0xff, val & 0xff)
    }
    while (bytes.length < 16) bytes.push(0)
    return bytes.slice(0, 16)
  }

  const ipBytes = toBytes(ip)
  const rangeBytes = toBytes(range)
  let remaining = bits
  for (let i = 0; i < 16; i++) {
    if (remaining <= 0) break
    const byteBits = Math.min(8, remaining)
    const mask = byteBits === 8 ? 0xff : (0xff << (8 - byteBits)) & 0xff
    if ((ipBytes[i] & mask) !== (rangeBytes[i] & mask)) return false
    remaining -= 8
  }
  return true
}
