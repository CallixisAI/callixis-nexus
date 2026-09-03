import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { normalizeCode, sha256Hex, timingSafeEqualHex } from "../_shared/invite-crypto.ts"

// Phase 4 (docs/admin-module-plan/PHASE-4-invite-and-activation.md §D/§F) — the one door an
// invited-but-not-yet-real user reaches before they have any session at all, so per §D it must
// do its own complete validation: no Authorization header is required or checked here, on
// purpose. ⚠️ Deploy with `--no-verify-jwt` (or the dashboard's "Enforce JWT verification"
// toggle off) — same requirement call-ingest and dispatch-batch already have, and same
// limitation this project has every time: that setting isn't expressible in a committed file,
// only at deploy time. §D.8: confirm this live before trusting it.
//
// 🔀 DEVIATION from the phase doc's literal §B flow — recorded in the migration header and
// manage-users/index.ts's handleInvite too. The auth user does NOT exist until this function
// creates it, on a successful token+code verification, not at invite time. See
// 20260814000000_invite_activation.sql's header for the full reasoning; the short version:
// handle_new_user() already resolves a new auth user's role from the matching *pending*
// user_invites row by email, so creating the user here (while status is still 'pending')
// gets step 3 of the phase doc's §E list (assign the role) for free and correctly, and there's
// nothing to add profiles.status='invited' to in the first place.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// §D.4: "Every failure branch returns the identical generic message. Enumerate the branches
// (expired / wrong code / no invite / already used) and confirm each one." One constant, used
// by every branch below that runs BEFORE a correct code has been proven — expired, no such
// token, already accepted, locked out, and a wrong code all return exactly this, so a response
// can never be used to tell those cases apart (the account-enumeration oracle §D warns about).
// Once a request passes that gate (correct token AND correct code), any *further* failure
// (weak password, a createUser race) can be specific — the caller has already proven
// legitimate possession of the invite, so there's no enumeration risk left to protect against.
// This is this implementation's reading of F.6's "distinguished only after successful
// verification," recorded here since the phase doc's wording is a little ambiguous — see
// PHASE-4-CHECKLIST.md's Notes and deviations.
const GENERIC_ERROR = 'This invitation link is invalid, expired, or already used.'
const MAX_ATTEMPTS = 5
const MIN_PASSWORD_LENGTH = 8

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const action = body.action ?? 'activate'
    const token = typeof body.token === 'string' ? body.token : ''

    if (!token) {
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    const tokenHash = await sha256Hex(token)

    // Shared by both actions: find the invite this token points at, and decide (without
    // revealing which) whether it's usable. `.maybeSingle()` — same reasoning as
    // AuthContext.tsx and manage-users everywhere else in this project: a missing row must
    // fail closed into the generic branch below, not throw into the catch-all as a 500.
    const { data: invite, error: fetchError } = await supabase
      .from('user_invites')
      .select('id, email, full_name, phone, role, status, expires_at, attempt_count, code_hash')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (fetchError) throw fetchError

    const isUsable =
      !!invite &&
      invite.status === 'pending' &&
      !!invite.expires_at &&
      new Date(invite.expires_at).getTime() > Date.now()

    if (action === 'lookup') {
      // §F.3: "Show which email is being activated" before the user has typed a code at all.
      // Safe to answer from the token alone — it's 256 bits of entropy (32 random bytes,
      // manage-users' generateToken), not a brute-forceable value the way the 8-character
      // code is, so revealing "this specific token is/isn't currently usable" doesn't help
      // an attacker who doesn't already have it. No attempt_count cost — nothing here was
      // guessed.
      if (!isUsable) {
        return jsonResponse({ error: GENERIC_ERROR }, 404)
      }
      const { data: roleRow } = await supabase.from('roles').select('label').eq('key', invite.role).maybeSingle()
      return jsonResponse(
        { email: invite.email, full_name: invite.full_name, role: invite.role, role_label: roleRow?.label ?? invite.role },
        200
      )
    }

    if (action !== 'activate') {
      return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }

    const code = typeof body.code === 'string' ? body.code : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!code || !password) {
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    if (!isUsable) {
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    // §D.2: locked after 5 wrong attempts — checked before comparing, so attempt number 6
    // onward never even runs the comparison (moot for a hash compare either way, but keeps
    // the "locked" and "wrong code" paths visibly the same code path, not two that could
    // drift).
    if (invite.attempt_count >= MAX_ATTEMPTS) {
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    const suppliedCodeHash = await sha256Hex(normalizeCode(code))
    const codeMatches = timingSafeEqualHex(suppliedCodeHash, invite.code_hash ?? '')

    if (!codeMatches) {
      // §D.2: incremented on every failure. Best-effort — if this update itself fails, the
      // request still correctly refuses the wrong code below; it just doesn't count against
      // the lock, which fails open on attempt-tracking rather than open on access.
      await supabase
        .from('user_invites')
        .update({ attempt_count: invite.attempt_count + 1 })
        .eq('id', invite.id)
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    // ── Past this point, the caller has proven legitimate possession of the invite (correct
    // token AND correct code) — failures below are specific, not generic. See the GENERIC_ERROR
    // comment above for why that's a deliberate line, not an inconsistency.

    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400)
    }

    // handle_new_user() (20260812000000_roles_as_data.sql) fires on this insert and, reading
    // `user_invites` while this row's status is still 'pending' (checked above, not yet
    // flipped), assigns `invite.role` to the new user_roles row itself — see this file's
    // header comment. full_name is passed the same way Signup.tsx's old self-serve flow did
    // (raw_user_meta_data ->> 'full_name'), so the trigger's existing profiles insert needs
    // no changes for this phase.
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // successfully supplying the mailed code stands in for confirming the mailed link
      user_metadata: { full_name: invite.full_name },
    })

    if (createError || !created?.user) {
      console.error('activate-invite: createUser failed', createError)
      // A real (if generic-ish) message, not GENERIC_ERROR — this is a server/account-state
      // problem discovered after legitimate verification, not a hint about invite validity.
      const alreadyRegistered = /already.*registered|already exists/i.test(createError?.message ?? '')
      // 2026-09-01 diagnostic addition (docs/admin-module-plan/PHASE-4-ACTIVATION-CHECKLIST.md
      // §E): the generic fallback below gave no way to tell *why* createUser failed without
      // function-log access, which this environment doesn't have. Safe to include verbatim —
      // this branch only runs after token+code are already proven, same reasoning as the
      // "real (if generic-ish) message" comment above already relies on.
      return jsonResponse(
        {
          error: alreadyRegistered
            ? 'An account with this email already exists. Try signing in instead.'
            : `Could not create your account. Contact your admin and try the link again. (${createError?.message ?? createError?.status ?? 'unknown error'})`,
        },
        400
      )
    }

    const newUserId = created.user.id

    // [E12]/S.7 — the phone the admin entered, onto the user's own record. profiles row
    // already exists at this point (handle_new_user's INSERT ran synchronously as part of
    // the createUser call above).
    if (invite.phone) {
      const { error: phoneError } = await supabase.from('profiles').update({ phone: invite.phone }).eq('id', newUserId)
      if (phoneError) console.error('activate-invite: failed to save phone number', phoneError)
    }

    // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.9, D-1)
    // — this used to be [E9]'s fix: copy the permissions an admin ticked at invite time into a
    // real user_permissions row. That mechanism is exactly what made the next role change
    // pre-emptied of meaning (see that plan's "Why this exists") — a role assigned after this
    // point could never be narrower than whatever was ticked here, because these rows never
    // went away and were never visible as an exception. Deleted outright, not narrowed: an
    // invite carries a role and nothing else now (manage-users' handleInvite always stores
    // `permissions: []`, and this function no longer even selects that column above). Giving
    // one person access beyond their role stays possible — as a deliberate, visible, later
    // act in Edit User, never as a silent side effect of activation.

    // Single-use from here on — §D: "mailer_autoconfirm: true means Supabase is not doing
    // this for you." status flips out of 'pending' so a second activate attempt with the same
    // token+code fails the isUsable check above like any other used invite, and so a second
    // signup for this email no longer finds a matching row for handle_new_user() to read.
    const { error: acceptError } = await supabase
      .from('user_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
    if (acceptError) console.error('activate-invite: failed to mark invite accepted', acceptError)

    return jsonResponse({ success: true, email: invite.email }, 200)
  } catch (error) {
    console.error('activate-invite error:', error)
    return jsonResponse({ error: 'Request failed. Check function logs for detail.' }, 400)
  }
})
