// Phase 4 (docs/admin-module-plan/PHASE-4-invite-and-activation.md §B/§D) — shared between
// manage-users (issues a token+code) and activate-invite (verifies one). Supabase's CLI
// bundles relative imports outside a function's own directory at deploy time (the documented
// `_shared/` convention), so this is one implementation, not two that can drift apart —
// which matters more than usual here since a mismatch between how a hash is produced and how
// it's compared fails silently (every code just stops working) rather than loudly.
//
// Everything here is pure and synchronous-shaped (async only where Web Crypto forces it) —
// no Supabase client, no env vars, easy to reason about in isolation.

// §B.1: Crockford base32 — no I, L, O or U. Those are the four characters people misread on
// screen and mishear read aloud over a phone call; U is additionally excluded in the
// Crockford spec to avoid spelling accidental obscenities. Exactly 32 symbols, so mapping a
// uniformly-random byte via `% 32` has zero modulo bias (256 / 32 = 8 exactly).
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 32 random bytes, URL-safe base64, no padding — the long-lived link half of an invite. */
export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/** 8-character Crockford base32 code — the short, readable-aloud half of an invite. */
export function generateCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const b of bytes) code += CROCKFORD_ALPHABET[b % 32]
  return code
}

/** Display form only (`XXXX-XXXX`) — never hashed or compared in this shape. */
export function formatCodeForDisplay(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`
}

/**
 * User input -> comparable form: strip whitespace/dashes, uppercase. Does not remap
 * commonly-confused characters (Crockford's own decode table maps e.g. O -> 0, I/L -> 1) —
 * the alphabet already excludes those four letters specifically so nobody has to guess which
 * one they meant. A future enhancement, not required for §D's exit criteria.
 */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256, hex-encoded. §D: only ever the hash is stored — this is the one function that
 * produces what actually lands in token_hash/code_hash. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * §D: constant-time comparison — a naive `===` short-circuits on the first differing byte,
 * which leaks the valid hash's prefix through response timing. Both inputs here are SHA-256
 * hex digests (fixed 64 chars) produced by sha256Hex above, so the length check below never
 * itself becomes a timing oracle over attacker-controlled input.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
