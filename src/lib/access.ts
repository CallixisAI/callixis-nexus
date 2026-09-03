import { computeHasPermission } from "@/contexts/AuthContext";

// Phase 0 §C — the pure decision `ProtectedRoute` renders around. Kept separate and
// side-effect-free so it's unit-testable without mounting React/router/Supabase
// (checklist C.8). See docs/admin-module-plan/PHASE-0-foundation-security.md §C.

export type AccessResult = "allowed" | "denied" | "pending";

export interface AccessState {
  // False until AuthContext's role/profile/permissions fetch has settled. While false,
  // `permissions`/`isSuper` may still be their initial empty values even for a user who
  // does have access — deciding "denied" in that window is the race §C.1 exists to close.
  profileLoaded: boolean;
  isSuper: boolean;
  permissions: string[];
}

// Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §B/§D) — `requireRole` is gone.
// It was Phase 0's deliberate interim step for gating /admin before permissions were real
// data (App.tsx's own comment called it a "two-step," completed here). The only live caller
// (`requireRole="admin"`) is now `requirePermission="admin.roles_invites"` — see
// src/lib/permissions.ts's own comment for why that key, not the placeholder `admin.users`
// the phase doc names. Every route now goes through the one gate, sourced from the one
// resolver (`get_my_permissions()`), so there is no second lever left to drift out of sync.
export interface AccessRequirement {
  requirePermission?: string;
}

export function canAccess(state: AccessState, requirement: AccessRequirement = {}): AccessResult {
  if (!state.profileLoaded) return "pending";

  if (
    requirement.requirePermission &&
    !computeHasPermission(state.isSuper, state.permissions, requirement.requirePermission)
  ) {
    return "denied";
  }

  return "allowed";
}
