import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generateToken, generateCode, formatCodeForDisplay, sha256Hex } from "../_shared/invite-crypto.ts"
import { writeAuditLog, getClientIp, type AuditAction } from "../_shared/audit-log.ts"

// 🔀 D-10 (Phase 0 §D.1/[E10]): keeping '*' rather than pinning to the app origin, for now.
// This function already does its own bearer-token + admin-role check before touching
// anything (below) — CORS is not the security boundary here, and every other deployed
// function in this project (n8n-proxy, call-ingest, dispatch-batch) uses the same '*'.
// Revisit if/when the app's production origin is confirmed and pinning all four at once
// makes sense as one change, rather than this function alone drifting from the pattern.
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

// Phase 7 (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §A/§B) — everything below
// this comment down to the handlers is the audit-log plumbing shared across all 11 actions.
//
// Scoping rule, recorded once here rather than repeated at every call site: a row is written
// once the TARGET is known and a check runs against it (a rank guard, a last-super-admin
// guard, a business rule, or the write itself). A malformed request that fails before any
// target is resolved (missing user_id, an unknown role key, an invalid override value) is NOT
// logged — there is nothing meaningful to attach it to yet, and §B's own framing ("a denied
// attempt to block someone is more interesting than a successful one") is about authorization/
// business-rule denials, not client input bugs.
interface AuditCtx { actorEmail: string | null; ip: string | null }

// One extra SELECT per handler invocation — these are admin-triggered, low-frequency actions,
// not a hot path. Denormalises the target's current email into the audit row per §A.2, and
// doubles as the "before" status snapshot the six profile-status actions below all need.
async function getProfileSnapshot(supabaseClient, userId: string): Promise<{ email: string | null; status: string | null }> {
  const { data } = await supabaseClient.from('profiles').select('email, status').eq('id', userId).maybeSingle()
  return { email: data?.email ?? null, status: data?.status ?? null }
}

async function logDenied(
  supabaseClient,
  callerId: string,
  ctx: AuditCtx,
  action: AuditAction,
  targetId: string | null,
  targetLabel: string | null,
  reason: string
): Promise<void> {
  await writeAuditLog(supabaseClient, {
    actorId: callerId,
    actorEmail: ctx.actorEmail,
    action,
    targetId,
    targetLabel,
    reason,
    success: false,
    ip: ctx.ip,
  })
}

async function logSuccess(
  supabaseClient,
  callerId: string,
  ctx: AuditCtx,
  action: AuditAction,
  targetId: string | null,
  targetLabel: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  reason: string | null = null
): Promise<void> {
  await writeAuditLog(supabaseClient, {
    actorId: callerId,
    actorEmail: ctx.actorEmail,
    action,
    targetId,
    targetLabel,
    before,
    after,
    reason,
    success: true,
    ip: ctx.ip,
  })
}

// Phase 3 (docs/admin-module-plan/PHASE-3-role-management-ui.md §E, checklist E.1/E.2) —
// the only write path to user_roles for an EXISTING user. This function runs on the
// service-role key, so it must reproduce the two rank guardrails Phase 1 §E put on
// user_roles as *database* triggers (enforce_role_rank_guard, enforce_last_super_admin) —
// those triggers key off auth.uid(), which is NULL for a service-role connection, so they
// do not fire here. This is the "manage-users needs the equivalent checks added in its own
// application code" follow-up both PHASE-1-CHECKLIST.md and this migration's header note
// flagged as a known gap. Read-modify-write against `roles` for rank/is_super rather than
// trusting the caller's own client-side check, for the same reason §C.1 insists the UI
// isn't the real control.
// supabaseClient is deliberately left unannotated (not typed `any`) — eslint's
// @typescript-eslint/no-explicit-any covers this file too (eslint.config.js's `files` glob
// isn't scoped to src/), and this file has no Database generic to type it against anyway
// (createClient() is called with no <Database> type argument, same as the rest of this
// function). Leaving the parameter unannotated is behaviourally identical to `any` here
// without tripping the lint rule.
async function handleSetRole(
  supabaseClient,
  callerId: string,
  body: { user_id?: string; role?: string },
  ctx: AuditCtx
) {
  const { user_id: targetUserId, role: newRoleKey } = body

  if (!targetUserId || !newRoleKey) {
    return jsonResponse({ error: 'user_id and role are required' }, 400)
  }

  // Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §C.11) — "every action refuses
  // self-block, self-remove, and self-demotion." A role CHANGE is the only way to demote
  // yourself, so this is where that third case belongs, not §C.11's other two (which are new
  // actions below). Blocking any self role change (not just a strict downgrade) is the
  // simpler, safer reading: it also stops an accidental "lateral" self-change, at the cost of
  // an admin needing a second admin to change their own role at all — the same trade every
  // other self-target refusal in this file already makes.
  if (targetUserId === callerId) {
    await logDenied(supabaseClient, callerId, ctx, 'user.role_changed', targetUserId, ctx.actorEmail, 'You cannot change your own role. Ask another admin.')
    return jsonResponse({ error: 'You cannot change your own role. Ask another admin.' }, 403)
  }

  const targetLabel = (await getProfileSnapshot(supabaseClient, targetUserId)).email

  // Two-step lookups rather than a `user_roles.select('role, roles!inner(...)')` nested
  // embed — AuthContext.tsx deliberately avoids that pattern project-wide ("no other query
  // in this codebase uses a nested-resource select, and this keeps the pattern consistent");
  // matching it here rather than introducing the only embed in the codebase inside a
  // function nobody can test live this session.
  const { data: allRoles, error: rolesError } = await supabaseClient
    .from('roles')
    .select('key, rank, is_super')

  if (rolesError) throw rolesError
  const roleByKey = new Map((allRoles ?? []).map((r) => [r.key, r]))

  const newRole = roleByKey.get(newRoleKey)
  if (!newRole) {
    return jsonResponse({ error: `Unknown role: ${newRoleKey}` }, 400)
  }

  const { data: actorRoleRow, error: actorRoleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .maybeSingle()

  if (actorRoleError) throw actorRoleError
  const actorRole = actorRoleRow ? roleByKey.get(actorRoleRow.role) : undefined
  if (!actorRole) {
    return jsonResponse({ error: 'Acting user has no role' }, 403)
  }
  const actorRank: number = actorRole.rank

  const { data: targetRoleRow, error: targetRoleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (targetRoleError) throw targetRoleError
  const targetOldRole = targetRoleRow ? roleByKey.get(targetRoleRow.role) : undefined

  // Mirrors enforce_role_rank_guard (20260812000000_roles_as_data.sql §E): cannot touch a
  // user whose current role outranks the actor, and cannot hand out a role that outranks
  // the actor.
  if (targetOldRole && targetOldRole.rank < actorRank) {
    await logDenied(supabaseClient, callerId, ctx, 'user.role_changed', targetUserId, targetLabel, 'Cannot modify a user whose current role outranks your own')
    return jsonResponse({ error: 'Cannot modify a user whose current role outranks your own' }, 403)
  }
  if (newRole.rank < actorRank) {
    await logDenied(supabaseClient, callerId, ctx, 'user.role_changed', targetUserId, targetLabel, 'Cannot grant a role that outranks your own')
    return jsonResponse({ error: 'Cannot grant a role that outranks your own' }, 403)
  }

  // Mirrors enforce_last_super_admin (20260812000000_roles_as_data.sql §E): refuse a change
  // that would leave zero super admins.
  if (targetOldRole?.is_super && !newRole.is_super) {
    const superRoleKeys = (allRoles ?? []).filter((r) => r.is_super).map((r) => r.key)
    const { count, error: countError } = await supabaseClient
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .in('role', superRoleKeys)
      .neq('user_id', targetUserId)

    if (countError) throw countError
    if (!count) {
      await logDenied(supabaseClient, callerId, ctx, 'user.role_changed', targetUserId, targetLabel, 'Refusing to remove the last super admin')
      return jsonResponse({ error: 'Refusing to remove the last super admin' }, 403)
    }
  }

  // Delete-then-insert, not upsert — same (user_id, role) uniqueness reasoning as the
  // invite path below.
  const { error: deleteError } = await supabaseClient
    .from('user_roles')
    .delete()
    .eq('user_id', targetUserId)

  if (deleteError) throw deleteError

  const { error: insertError } = await supabaseClient
    .from('user_roles')
    .insert({ user_id: targetUserId, role: newRoleKey })

  if (insertError) throw insertError

  await logSuccess(
    supabaseClient, callerId, ctx, 'user.role_changed', targetUserId, targetLabel,
    { role: targetOldRole?.key ?? null }, { role: newRoleKey }
  )

  return jsonResponse({ success: true, user_id: targetUserId, role: newRoleKey }, 200)
}

// Phase 4 (docs/admin-module-plan/PHASE-4-invite-and-activation.md §E) — [E13]'s real fix.
// The old behaviour here (see git history / this file before 2026-08-14) called
// auth.admin.inviteUserByEmail, which creates the auth user immediately and sends Supabase's
// own built-in, rate-limited mailer — indistinguishable from silence in production, and with
// no room for the brief's second factor (a short code, readable aloud).
//
// 🔀 DEVIATION from the phase doc's literal §E steps 1-4, recorded here (and in the migration
// header, and PHASE-4-CHECKLIST.md's Notes and deviations): the auth user is NOT created here.
// It's created in activate-invite/index.ts, at the moment the invitee supplies a correct
// token + code. Reasons:
//   - Creating it now, with profiles.status = 'invited' as the phase doc describes, needs a
//     profiles.status column this migration deliberately doesn't add — that's Phase 6's
//     column, with a 5-value CHECK constraint this phase has no business narrowing first.
//   - handle_new_user() (20260812000000_roles_as_data.sql, unchanged by this phase) already
//     resolves a brand-new auth user's role from the matching *pending* user_invites row by
//     email — so waiting until activation to create the user means that trigger does step 3
//     (assign the role) correctly, for free, with no risk of this function and the trigger
//     disagreeing about who gets what role.
//   - It also means an invite that's never activated never accumulates an orphaned,
//     unconfirmed auth.users row — nothing to clean up if it expires unused.
// Step 4 (permission overrides) is applied in activate-invite too, for the same reason: there
// is no user_id to attach a user_permissions row to until then. This function's job is
// steps 5-6 only: generate the token+code, store the hashes, send the email.
const INVITE_EXPIRY_HOURS = 72

async function handleInvite(
  supabaseClient,
  callerId: string,
  body: { email?: string; full_name?: string; phone?: string; role?: string; notify?: boolean },
  ctx: AuditCtx
) {
  const email = (body.email ?? '').trim().toLowerCase()
  const fullName = (body.full_name ?? '').trim()
  const phone = body.phone?.trim() || null
  const roleKey = body.role
  // Permission-overrides plan (docs/permission-overrides-plan/README.md, Phase 1 §B.8, D-1) —
  // the real enforcement point. An invite never carries a personal permission list, full
  // stop: this door always stores `[]`, regardless of anything a caller sends (a browser is
  // not the only possible caller of an edge function, and the front-end fix alone would be
  // bypassable). This is what makes it structurally impossible for ANY invite — including the
  // 4 stale pending rows D-2 leaves untouched — to mint a personal key once activate-invite's
  // own copy step (below, in that file) is also removed.
  const permissions: string[] = []
  // Phase 6 (docs/admin-module-plan/PHASE-6-CHECKLIST.md D.1) — "Copy link" for a pending
  // invite reuses this same reissue path (there is no way to recover a PREVIOUSLY issued
  // token; only its hash is ever stored) but explicitly opts out of the email send, since the
  // whole point of that menu item is "give me the link without re-emailing them". Defaults to
  // true so every existing caller (the invite dialog, the old "Resend invite" button) is
  // unaffected.
  const notify = body.notify !== false

  if (!email || !fullName) {
    return jsonResponse({ error: 'email and full_name are required' }, 400)
  }
  if (!roleKey) {
    return jsonResponse({ error: 'role is required' }, 400)
  }

  // D-2 (Phase 1, PHASE-1-CHECKLIST.md): "admin differs from super_admin in exactly three
  // places — User Roles & Invites, Permission Overrides, Add/Withdraw Budget." The live RLS
  // policy on user_invites ("Admins can manage invites",
  // 20260812000000_roles_as_data.sql §11) already restricts a direct browser write to
  // super_admin only. This function runs on the service-role key, which bypasses that policy
  // — the outer caller check above (admin OR super_admin, kept loose for set_role's sake)
  // is not enough on its own here, or a plain 'admin' could invite through this door despite
  // RLS refusing them the equivalent direct write.
  const { data: callerRoleRow } = await supabaseClient
    .from('user_roles').select('role').eq('user_id', callerId).maybeSingle()
  if (callerRoleRow?.role !== 'super_admin') {
    await logDenied(supabaseClient, callerId, ctx, 'user.invited', null, email, 'Only super admins can invite users')
    return jsonResponse({ error: 'Only super admins can invite users' }, 403)
  }

  // Same rank ceiling Admin.tsx's role picker already applies client-side
  // (`roleCatalogue.filter(r => r.rank >= actorRank)`) and handleSetRole enforces server-side
  // for an existing user — reproduced here so the UI filter isn't the only thing stopping an
  // inviter from handing out more power than they hold. super_admin (rank 0) passes trivially.
  const { data: targetRole, error: roleLookupError } = await supabaseClient
    .from('roles').select('key, rank').eq('key', roleKey).maybeSingle()
  if (roleLookupError) throw roleLookupError
  if (!targetRole) return jsonResponse({ error: `Unknown role: ${roleKey}` }, 400)

  const { data: callerRoleInfo } = await supabaseClient
    .from('roles').select('rank').eq('key', callerRoleRow.role).maybeSingle()
  if (targetRole.rank < (callerRoleInfo?.rank ?? Infinity)) {
    await logDenied(supabaseClient, callerId, ctx, 'user.invited', null, email, 'Cannot invite into a role that outranks your own')
    return jsonResponse({ error: 'Cannot invite into a role that outranks your own' }, 403)
  }

  // [E12]/§E.1 belt-and-braces half — Admin.tsx is expected to filter its own invite list
  // against existing profiles, but a stale client shouldn't be able to quietly resurrect
  // someone who already has a real account by re-sending an invite to their email.
  const { data: existingProfile } = await supabaseClient
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) {
    await logDenied(supabaseClient, callerId, ctx, 'user.invited', existingProfile.id, email, 'A user with that email already has an account')
    return jsonResponse({ error: 'A user with that email already has an account' }, 400)
  }

  const token = generateToken()
  const code = generateCode()
  const [tokenHash, codeHash] = await Promise.all([sha256Hex(token), sha256Hex(code)])
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()

  // Upsert, not insert — re-inviting an email that already has a row (pending, expired, or
  // even previously accepted) reissues it: fresh token/code/expiry, attempt_count reset back
  // to 0, accepted_at cleared. Matches the pre-existing invite dialog's own "this doubles as
  // reissue" behaviour (onConflict: 'email'), now depending on the migration's §A.2 unique
  // index actually existing live — see PHASE-4-CHECKLIST.md §A.4/A.5.
  const { data: inviteRow, error: upsertError } = await supabaseClient
    .from('user_invites')
    .upsert(
      {
        email, full_name: fullName, phone, role: roleKey, permissions,
        status: 'pending',
        token_hash: tokenHash, code_hash: codeHash, expires_at: expiresAt,
        attempt_count: 0, accepted_at: null, invited_by: callerId,
      },
      { onConflict: 'email' }
    )
    .select('id')
    .single()

  if (upsertError) throw upsertError

  // Phase 7 (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §E.7) — this is that call
  // site. `after` deliberately omits phone (denormalised PII with no security-decision value
  // in an audit trail) and never the token/code (redactSecrets in _shared/audit-log.ts would
  // strip them anyway, but they're simply not in this object to begin with).
  await logSuccess(supabaseClient, callerId, ctx, 'user.invited', inviteRow.id, email, null, { role: roleKey, permissions })

  const activationUrl = `${APP_ORIGIN}/activate?token=${encodeURIComponent(token)}`
  const emailResult = notify
    ? await sendInviteEmail({
        to: email,
        fullName,
        activationUrl,
        codeDisplay: formatCodeForDisplay(code),
      })
    : { sent: false as const }

  if (notify && !emailResult.sent) {
    console.error(`manage-users: invite row created for ${email} but email send failed: ${(emailResult as { error?: string }).error}`)
  }

  return jsonResponse(
    {
      success: true,
      invite_id: inviteRow.id,
      email_sent: emailResult.sent,
      // Only meaningful as a fallback when email_sent is false (e.g. RESEND_API_KEY not yet
      // configured — see PHASE-4-CHECKLIST.md §A.3) — lets Admin.tsx offer the same
      // "copy the link" affordance the old flow had, now pointing at a real, single-use
      // token instead of the open /signup page [E13]. Never persisted server-side; only the
      // sha256 hash above lives in the database.
      activation_url: activationUrl,
    },
    200
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md) — user lifecycle actions.
// Shared helpers first, then one handler per action in §C's table. All of these run on the
// service-role key, same as handleSetRole/handleInvite above — user_roles/profiles have no
// browser write policy admins could use instead, and even where a policy exists (e.g.
// user_permissions), Phase 1/3's own rank/grant-ceiling triggers only fire for an
// authenticated client session (auth.uid() IS NOT NULL), never for this service-role
// connection — so every one of the checks below reproduces in application code exactly what
// the equivalent trigger already does for a direct browser write. Same known, accepted gap
// Phase 1's migration flagged for manage-users as a whole; not new to this phase.
// ═══════════════════════════════════════════════════════════════════════════════════════

interface RoleInfo { key: string; rank: number; is_super: boolean }

async function getRoleByKeyMap(supabaseClient): Promise<Map<string, RoleInfo>> {
  const { data, error } = await supabaseClient.from('roles').select('key, rank, is_super')
  if (error) throw error
  return new Map((data ?? []).map((r: RoleInfo) => [r.key, r]))
}

async function getUserRoleInfo(supabaseClient, userId: string, roleByKey: Map<string, RoleInfo>): Promise<RoleInfo | undefined> {
  const { data, error } = await supabaseClient.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? roleByKey.get(data.role) : undefined
}

// Mirrors enforce_role_rank_guard (Phase 1 §E) / handleSetRole's own inline version above:
// refuses acting on a target whose CURRENT role outranks the caller. Every action below that
// touches an existing user runs this first.
function assertCanActOnTarget(actorRank: number, targetRole: RoleInfo | undefined) {
  if (targetRole && targetRole.rank < actorRank) {
    return { ok: false as const, response: jsonResponse({ error: 'Cannot act on a user whose role outranks your own' }, 403) }
  }
  return { ok: true as const }
}

// §C.11: refuse self-block and self-remove — a caller acting on their OWN account for either
// of these could lock themselves out with no other admin able to reverse it in time
// (self-demotion, the third case §C.11 names, is handleSetRole's own job above — a role
// change, not one of these two).
function assertNotSelf(callerId: string, targetUserId: string, action: string) {
  if (callerId === targetUserId) {
    return jsonResponse({ error: `You cannot ${action} your own account. Ask another admin.` }, 403)
  }
  return null
}

// Every trigger this project adds raises a plain-English message (see
// 20260812000000_roles_as_data.sql / 20260813000000_role_management_ui.sql /
// 20260827000000_user_lifecycle.sql) — this only needs to catch the shapes that AREN'T already
// readable as-is, mirroring src/lib/roleMatrix.ts's friendlyDbError for the browser side.
function friendlyDbError(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  if (!error) return fallback
  if (error.code === '23503') return 'That reference no longer exists — refresh and try again.'
  return error.message?.trim() || fallback
}

async function setProfileStatus(
  supabaseClient,
  targetUserId: string,
  callerId: string,
  status: string,
  reason: string | null,
  frozenUntil: string | null
) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({
      status,
      status_reason: reason,
      frozen_until: frozenUntil,
      status_changed_at: new Date().toISOString(),
      status_changed_by: callerId,
    })
    .eq('id', targetUserId)
  return error
}

// §C.1/E20: ban_duration is documented, long-standing GoTrue/supabase-js admin behaviour —
// believed to work, but NOT verified against this project's live GoTrue this session (see
// PHASE-6-CHECKLIST.md's dated note for why that live test was deliberately deferred). Every
// caller below treats a failure here as non-fatal and reports it honestly (§C.2) rather than
// always claiming "immediately": profiles.status + is_account_active() folded into RLS
// (20260827000000_user_lifecycle.sql) still block real data access even if this call silently
// no-ops on an unsupported GoTrue version.
const INDEFINITE_BAN_HOURS = 876_000 // ~100 years — the phase doc's own example

async function setGoTrueBan(supabaseClient, userId: string, durationHoursOrLift: number | 'lift'): Promise<{ applied: boolean; error?: string }> {
  const ban_duration = durationHoursOrLift === 'lift' ? 'none' : `${Math.max(1, Math.ceil(durationHoursOrLift))}h`
  const { error } = await supabaseClient.auth.admin.updateUserById(userId, { ban_duration })
  if (error) {
    console.error(`manage-users: ban_duration update failed for ${userId}:`, error.message)
    return { applied: false, error: error.message }
  }
  return { applied: true }
}

// §B item 3 / C.9 — see revoke_user_sessions() in 20260827000000_user_lifecycle.sql for why
// this is a database RPC rather than a supabase-js admin method (none exists for "revoke every
// session belonging to an arbitrary user id"). Best-effort: a failure here must not abort the
// status change that triggered it — is_account_active()'s RLS backstop still applies regardless.
async function revokeSessions(supabaseClient, userId: string): Promise<void> {
  const { error } = await supabaseClient.rpc('revoke_user_sessions', { p_user_id: userId })
  if (error) console.error(`manage-users: revoke_user_sessions failed for ${userId}:`, error.message)
}

// §C.4/E.2 — writes user_permissions allow/deny/inherit for an EXISTING user. 'inherit' means
// "no override" (delete the row, if any); 'allow'/'deny' upsert it. Mirrors
// enforce_grant_ceiling (Phase 1 §E) for the 'allow' case — denying is never an escalation and
// is never checked, same rule that trigger already applies.
async function handleUpdatePermissions(
  supabaseClient,
  callerId: string,
  body: { user_id?: string; overrides?: Record<string, string> },
  ctx: AuditCtx
) {
  const targetUserId = body.user_id
  const overrides = body.overrides ?? {}
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)
  if (Object.keys(overrides).length === 0) {
    return jsonResponse({ error: 'overrides must contain at least one permission_key' }, 400)
  }

  const targetLabel = (await getProfileSnapshot(supabaseClient, targetUserId)).email

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  // get_my_permissions() reads auth.uid(), which is NULL on this service-role connection —
  // get_permissions_for() (20260827000000_user_lifecycle.sql) is the same resolver
  // parameterized so this check can ask "what does the CALLER hold" explicitly.
  const { data: actorGrants, error: actorGrantsError } = await supabaseClient
    .rpc('get_permissions_for', { p_user_id: callerId })
  if (actorGrantsError) throw actorGrantsError
  const actorHeld = new Set((actorGrants ?? []).map((g: { permission_key: string }) => g.permission_key))

  // Permission-overrides plan Phase 4 §I.1 (docs/permission-overrides-plan/README.md) — the
  // real enforcement point for H.1's template case. The UI hides EditUserDialog's override
  // editor from anyone lacking admin.permission_overrides, but this function runs on the
  // service-role key and, until now, never checked that itself — a crafted request could still
  // call update_permissions directly. get_permissions_for() already gives super_admin every key
  // at `full` via its own is_super branch, so no special-casing is needed here.
  if (!actorHeld.has('admin.permission_overrides')) {
    await logDenied(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, 'Acting user lacks admin.permission_overrides')
    return jsonResponse({ error: 'You do not have permission to edit permission overrides.' }, 403)
  }

  // §B — a real before-snapshot, limited to exactly the keys this request touches, rather than
  // logging `before: null`. See this file's header comment on the "same transaction" gap: this
  // read and the write below are still two separate statements, not one.
  const { data: existingOverrides } = await supabaseClient
    .from('user_permissions')
    .select('permission_key, effect')
    .eq('user_id', targetUserId)
    .in('permission_key', Object.keys(overrides))
  const beforeOverrides = Object.fromEntries(
    (existingOverrides ?? []).map((r: { permission_key: string; effect: string }) => [r.permission_key, r.effect])
  )

  const toDelete: string[] = []
  const toUpsert: { user_id: string; permission_key: string; effect: string }[] = []

  for (const [permissionKey, choice] of Object.entries(overrides)) {
    if (choice === 'inherit') {
      toDelete.push(permissionKey)
      continue
    }
    if (choice !== 'allow' && choice !== 'deny') {
      return jsonResponse({ error: `Invalid override "${choice}" for ${permissionKey}` }, 400)
    }
    if (choice === 'allow' && !actorHeld.has(permissionKey)) {
      await logDenied(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, `Cannot grant ${permissionKey} — you do not hold it yourself`)
      return jsonResponse({ error: `Cannot grant ${permissionKey} — you do not hold it yourself` }, 403)
    }
    toUpsert.push({ user_id: targetUserId, permission_key: permissionKey, effect: choice })
  }

  if (toDelete.length > 0) {
    const { error } = await supabaseClient
      .from('user_permissions').delete().eq('user_id', targetUserId).in('permission_key', toDelete)
    if (error) {
      const message = friendlyDbError(error, 'Failed to clear overrides.')
      await logDenied(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, message)
      return jsonResponse({ error: message }, 400)
    }
  }

  if (toUpsert.length > 0) {
    // (user_id, permission_key) is a live, undocumented UNIQUE constraint (found Phase 1
    // §D.3-D.7) — UPSERT, not INSERT, or a key already overridden the other way errors instead
    // of updating.
    const { error } = await supabaseClient
      .from('user_permissions').upsert(toUpsert, { onConflict: 'user_id,permission_key' })
    if (error) {
      const message = friendlyDbError(error, 'Failed to save overrides.')
      await logDenied(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, message)
      return jsonResponse({ error: message }, 400)
    }
  }

  await logSuccess(supabaseClient, callerId, ctx, 'user.permissions_changed', targetUserId, targetLabel, beforeOverrides, overrides)

  return jsonResponse({ success: true, user_id: targetUserId }, 200)
}

async function handleBlock(supabaseClient, callerId: string, body: { user_id?: string; reason?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  const reason = (body.reason ?? '').trim()
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)
  if (!reason) return jsonResponse({ error: 'A reason is required to block a user' }, 400)

  const selfCheck = assertNotSelf(callerId, targetUserId, 'block')
  if (selfCheck) {
    await logDenied(supabaseClient, callerId, ctx, 'user.blocked', targetUserId, ctx.actorEmail, 'You cannot block your own account. Ask another admin.')
    return selfCheck
  }

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.blocked', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  // profiles_last_super_admin_guard (20260827000000_user_lifecycle.sql) raises here, not
  // silently, if this would leave zero active super admins — same "the trigger is the control"
  // shape as every guard already in this project.
  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'blocked', reason, null)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to block the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.blocked', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, INDEFINITE_BAN_HOURS)
  await revokeSessions(supabaseClient, targetUserId)

  await logSuccess(supabaseClient, callerId, ctx, 'user.blocked', targetUserId, targetLabel, { status: beforeStatus }, { status: 'blocked' }, reason)

  return jsonResponse({
    success: true,
    user_id: targetUserId,
    status: 'blocked',
    ban_applied: ban.applied,
    // §C.2: honest about the real delay if ban_duration turns out unsupported — falls back to
    // the RLS backstop regardless.
    note: ban.applied
      ? 'Blocked. Login and token refresh are now refused; the active session was also revoked.'
      : 'Blocked and signed out, but the GoTrue-level login ban could not be confirmed (see function logs) — data access is still blocked by row-level security regardless.',
  }, 200)
}

async function handleUnblock(supabaseClient, callerId: string, body: { user_id?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.unblocked', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'active', null, null)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to unblock the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.unblocked', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, 'lift')

  await logSuccess(supabaseClient, callerId, ctx, 'user.unblocked', targetUserId, targetLabel, { status: beforeStatus }, { status: 'active' })

  return jsonResponse({ success: true, user_id: targetUserId, status: 'active', ban_lifted: ban.applied }, 200)
}

async function handleFreeze(
  supabaseClient,
  callerId: string,
  body: { user_id?: string; reason?: string; frozen_until?: string | null },
  ctx: AuditCtx
) {
  const targetUserId = body.user_id
  const reason = (body.reason ?? '').trim()
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)
  if (!reason) return jsonResponse({ error: 'A reason is required to freeze a user' }, 400)

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.frozen', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  let frozenUntil: string | null = null
  let banHours = INDEFINITE_BAN_HOURS
  if (body.frozen_until) {
    const until = new Date(body.frozen_until)
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return jsonResponse({ error: 'frozen_until must be a valid time in the future' }, 400)
    }
    frozenUntil = until.toISOString()
    banHours = (until.getTime() - Date.now()) / 3_600_000
  }

  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'frozen', reason, frozenUntil)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to freeze the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.frozen', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, banHours)
  await revokeSessions(supabaseClient, targetUserId)

  await logSuccess(
    supabaseClient, callerId, ctx, 'user.frozen', targetUserId, targetLabel,
    { status: beforeStatus }, { status: 'frozen', frozen_until: frozenUntil }, reason
  )

  return jsonResponse({ success: true, user_id: targetUserId, status: 'frozen', frozen_until: frozenUntil, ban_applied: ban.applied }, 200)
}

async function handleUnfreeze(supabaseClient, callerId: string, body: { user_id?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.unfrozen', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'active', null, null)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to unfreeze the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.unfrozen', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, 'lift')

  await logSuccess(supabaseClient, callerId, ctx, 'user.unfrozen', targetUserId, targetLabel, { status: beforeStatus }, { status: 'active' })

  return jsonResponse({ success: true, user_id: targetUserId, status: 'active', ban_lifted: ban.applied }, 200)
}

// §A.1/D-6 — soft delete ONLY. auth.users and everything that cascades from it (profiles,
// campaigns, call_records, leads — see the migration's own header for the confirmed-live FK
// list) is deliberately left untouched. "Removed" means invisible/blocked, never destroyed.
async function handleRemove(supabaseClient, callerId: string, body: { user_id?: string; reason?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  const reason = (body.reason ?? '').trim()
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)
  if (!reason) return jsonResponse({ error: 'A reason is required to remove a user' }, 400)

  const selfCheck = assertNotSelf(callerId, targetUserId, 'remove')
  if (selfCheck) {
    await logDenied(supabaseClient, callerId, ctx, 'user.removed', targetUserId, ctx.actorEmail, 'You cannot remove your own account. Ask another admin.')
    return selfCheck
  }

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.removed', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'removed', reason, null)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to remove the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.removed', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, INDEFINITE_BAN_HOURS)
  await revokeSessions(supabaseClient, targetUserId)

  await logSuccess(supabaseClient, callerId, ctx, 'user.removed', targetUserId, targetLabel, { status: beforeStatus }, { status: 'removed' }, reason)

  return jsonResponse({ success: true, user_id: targetUserId, status: 'removed', ban_applied: ban.applied }, 200)
}

async function handleRestore(supabaseClient, callerId: string, body: { user_id?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)

  const { email: targetLabel, status: beforeStatus } = await getProfileSnapshot(supabaseClient, targetUserId)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.restored', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  const updateError = await setProfileStatus(supabaseClient, targetUserId, callerId, 'active', null, null)
  if (updateError) {
    const message = friendlyDbError(updateError, 'Failed to restore the user.')
    await logDenied(supabaseClient, callerId, ctx, 'user.restored', targetUserId, targetLabel, message)
    return jsonResponse({ error: message }, 400)
  }

  const ban = await setGoTrueBan(supabaseClient, targetUserId, 'lift')

  await logSuccess(supabaseClient, callerId, ctx, 'user.restored', targetUserId, targetLabel, { status: beforeStatus }, { status: 'active' })

  return jsonResponse({ success: true, user_id: targetUserId, status: 'active', ban_lifted: ban.applied }, 200)
}

// §C.9 — revoke sessions WITHOUT changing status. No self-restriction: forcing your OWN other
// sessions out is harmless (e.g. "I left myself logged in on a shared machine") and is not one
// of §C.11's three named refusals.
async function handleForceSignout(supabaseClient, callerId: string, body: { user_id?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)

  const targetLabel = (await getProfileSnapshot(supabaseClient, targetUserId)).email

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.force_signout', targetUserId, targetLabel, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  await revokeSessions(supabaseClient, targetUserId)

  await logSuccess(supabaseClient, callerId, ctx, 'user.force_signout', targetUserId, targetLabel, null, null)

  return jsonResponse({ success: true, user_id: targetUserId }, 200)
}

// §C.10 — trigger GoTrue's own password-recovery email. Routed through this admin-only door
// (rather than the browser calling auth.resetPasswordForEmail() directly, which it already
// could without any admin check) so the rank guard applies and — once Phase 7 exists — this is
// one auditable call site instead of an unaudited client-side one.
async function handleResetPassword(supabaseClient, callerId: string, body: { user_id?: string }, ctx: AuditCtx) {
  const targetUserId = body.user_id
  if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400)

  const roleByKey = await getRoleByKeyMap(supabaseClient)
  const actorRole = await getUserRoleInfo(supabaseClient, callerId, roleByKey)
  if (!actorRole) return jsonResponse({ error: 'Acting user has no role' }, 403)
  const targetRole = await getUserRoleInfo(supabaseClient, targetUserId, roleByKey)
  const rankCheck = assertCanActOnTarget(actorRole.rank, targetRole)
  if (!rankCheck.ok) {
    await logDenied(supabaseClient, callerId, ctx, 'user.password_reset_sent', targetUserId, null, 'Cannot act on a user whose role outranks your own')
    return rankCheck.response
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles').select('email').eq('id', targetUserId).maybeSingle()
  if (profileError) throw profileError
  if (!profile?.email) return jsonResponse({ error: 'No email on file for this user' }, 400)

  const { error } = await supabaseClient.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${APP_ORIGIN}/reset-password`,
  })
  if (error) {
    const message = friendlyDbError(error, 'Failed to send the reset email.')
    await logDenied(supabaseClient, callerId, ctx, 'user.password_reset_sent', targetUserId, profile.email, message)
    return jsonResponse({ error: message }, 400)
  }

  await logSuccess(supabaseClient, callerId, ctx, 'user.password_reset_sent', targetUserId, profile.email, null, null)

  return jsonResponse({ success: true, user_id: targetUserId, email: profile.email }, 200)
}

// §A.1/D-9: Resend, per the recorded decision — a real per-code template, delivery logs, and
// independence from Supabase's own rate-limited mailer. `onboarding@resend.dev` sends without
// a verified domain, which is why it's the fallback: it lets this function work the moment
// RESEND_API_KEY is set, before A.3's domain-verification step is done. Replace RESEND_FROM
// with a verified address before relying on this for real invitations — an unverified sender
// is fine for proving the flow works, not for deliverability at scale.
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:8080'
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Callixis AI <onboarding@resend.dev>'

async function sendInviteEmail(opts: {
  to: string
  fullName: string
  activationUrl: string
  codeDisplay: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    // Not thrown — an admin who hasn't finished §A.3 yet should still get a usable invite
    // row and an activation_url they can copy by hand, not a 500.
    return { sent: false, error: 'RESEND_API_KEY is not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [opts.to],
        subject: "You've been invited to Callixis AI",
        html: renderInviteEmailHtml(opts),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { sent: false, error: `Resend returned ${res.status}: ${detail.slice(0, 200)}` }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function renderInviteEmailHtml(opts: { fullName: string; activationUrl: string; codeDisplay: string }): string {
  // §B: link + code are two independent factors on purpose — a forwarded link alone must
  // not be enough to activate the account. Plain inline-styled HTML; this project has no
  // email template system, and building one is out of scope for the one email this phase
  // sends.
  const name = escapeHtml(opts.fullName)
  const url = escapeHtml(opts.activationUrl)
  const code = escapeHtml(opts.codeDisplay)
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
  <h2 style="margin-bottom:4px;">You're invited to Callixis AI</h2>
  <p>Hi ${name},</p>
  <p>An admin has invited you to join Callixis AI. Click below to activate your account:</p>
  <p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;">Activate your account</a></p>
  <p>You'll be asked for this activation code:</p>
  <p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${code}</p>
  <p style="color:#666;font-size:12px;">This link and code expire in ${INVITE_EXPIRY_HOURS} hours. If you weren't expecting this invite, you can ignore this email.</p>
</div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // This function uses the service-role key, which bypasses RLS entirely, so it must
    // check the caller's own role itself — nothing else stands between an authenticated
    // non-admin user and inviteUserByEmail/role assignment otherwise.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // .maybeSingle(), not .single() — same reasoning as AuthContext.tsx (§D.3/[E8]): a
    // missing or duplicate row must fail closed (403 below), not throw into the generic
    // catch-all and return a misleading 400.
    const { data: callerRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle()

    // Phase 1 (2026-08-12): 'super_admin' is a new tier above 'admin' the real permission
    // matrix introduced. Without the second check here, promoting the real admins to
    // super_admin locks every one of them out of this function the instant that
    // migration applies — this check would start 403'ing the very people it exists to let
    // through.
    if (callerRole?.role !== 'admin' && callerRole?.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only admins can manage users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const body = await req.json()

    // Phase 7 (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §B) — built once per
    // request, threaded into every handler below. actorEmail is denormalised into every audit
    // row per §A.2; ip is §A's `INET` column, read the same way session-guard already does
    // (cf-connecting-ip only — see _shared/audit-log.ts's getClientIp for why not
    // x-forwarded-for).
    const auditCtx = { actorEmail: caller.email ?? null, ip: getClientIp(req) }

    // Phase 3 (docs/admin-module-plan/PHASE-3-role-management-ui.md §E): a second action on
    // the same door, not a new function — same caller check above, same service-role client.
    // 'invite' (default, omitted `action` for backward compatibility with the existing invite
    // dialog) issues (or reissues) an invitation. 'set_role' changes the role of an EXISTING
    // user — the capability §E needs: "user_roles has no admin write policy in any migration
    // ... a browser-side role change is impossible regardless of UI." This is that one door.
    const action = body.action ?? 'invite'

    if (action === 'set_role') {
      return await handleSetRole(supabaseClient, caller.id, body, auditCtx)
    }
    if (action === 'invite') {
      return await handleInvite(supabaseClient, caller.id, body, auditCtx)
    }
    // Phase 6 (docs/admin-module-plan/PHASE-6-user-lifecycle.md §C) — same door, same caller
    // check above, one action per row of that section's table. 'resend_invite' deliberately
    // has no handler of its own — Admin.tsx's existing "Resend invite" affordance already
    // calls action: 'invite' (upsert-by-email IS the reissue), which already satisfies C.8;
    // adding a second action name for the same behaviour would just be two doors to one room.
    if (action === 'update_permissions') return await handleUpdatePermissions(supabaseClient, caller.id, body, auditCtx)
    if (action === 'block') return await handleBlock(supabaseClient, caller.id, body, auditCtx)
    if (action === 'unblock') return await handleUnblock(supabaseClient, caller.id, body, auditCtx)
    if (action === 'freeze') return await handleFreeze(supabaseClient, caller.id, body, auditCtx)
    if (action === 'unfreeze') return await handleUnfreeze(supabaseClient, caller.id, body, auditCtx)
    if (action === 'remove') return await handleRemove(supabaseClient, caller.id, body, auditCtx)
    if (action === 'restore') return await handleRestore(supabaseClient, caller.id, body, auditCtx)
    if (action === 'force_signout') return await handleForceSignout(supabaseClient, caller.id, body, auditCtx)
    if (action === 'reset_password') return await handleResetPassword(supabaseClient, caller.id, body, auditCtx)
    return jsonResponse({ error: `Unknown action: ${action}` }, 400)

  } catch (error) {
    // Phase 0 §D (checklist D.2): don't return raw error.message to the browser — it can
    // carry internal detail (table/column names, constraint names, provider errors). Log
    // the real error server-side (visible in `supabase functions logs manage-users`) and
    // return a generic message to the caller.
    console.error('manage-users error:', error)
    return new Response(
      JSON.stringify({ error: 'Request failed. Check function logs for detail.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
