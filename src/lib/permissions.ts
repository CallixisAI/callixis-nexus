import {
  LayoutDashboard,
  Megaphone,
  Bot,
  Puzzle,
  Headphones,
  BarChart3,
  DollarSign,
  Store,
  CalendarCheck,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { computeHasPermission, computeHasPermissionAtLeast, LEVEL_RANK } from "@/contexts/AuthContext";
import type { PermissionLevel } from "@/lib/roleMatrix";

// Permission-overrides plan Phase 4 §G — re-exported from here (not redefined) so call sites
// gating an action can `import { hasPermissionAtLeast, type PermissionLevel } from
// "@/lib/permissions"` alongside APP_PERMISSIONS, without also reaching into AuthContext.tsx
// for the pure helper. computeHasPermissionAtLeast/LEVEL_RANK live in AuthContext.tsx, next to
// computeHasPermission, for the same reason that one does: it's the file that owns isSuper's
// bypass semantics.
export { computeHasPermissionAtLeast as hasPermissionAtLeast, LEVEL_RANK };
export type { PermissionLevel };

// Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §A) — the one definition of a
// permission, replacing the two hand-maintained lists that used to drift silently [E14]:
// Admin.tsx's APP_FEATURES and AppSidebar.tsx's allNavItems. Both now import this instead.
//
// This is a deliberate *second* copy of the permission catalogue — `permissions` is also a
// real database table (Phase 1, 20260812000000_roles_as_data.sql §6). The DB is the source
// of truth for which keys exist and who is granted them; this file adds the two things the
// DB row has no business knowing (icon, client-side route) for the ten page-level keys the
// nav/route-guard actually gate on. See src/lib/permissions.parity.test.ts for the test that
// keeps the two lists honest [E14 §A.1].
//
// 🔀 DEVIATION from the phase doc's own example, recorded here rather than silently:
// PHASE-2-app-reads-roles.md's snippet and PHASE-2-CHECKLIST.md §D.3 both call this key
// `admin.users`. That name was Plan/ADMIN-RBAC-PLAN.md §4.3's *placeholder* guess, written
// before the real permission matrix existed and flagged there as "⚠️ Placeholder seed —
// replace with the real matrix." The real matrix (Phase 1, from `CallixisPermissions by
// roles.xlsx`) has no `admin.users` key at all — it seeded `admin.roles_invites` instead,
// granted to `super_admin` ONLY (Phase 1 D-2's own finding: "admin differs from super_admin
// in exactly three places — User Roles & Invites, Permission Overrides, Add/Withdraw
// Budget"). The `/admin` page *is* "User Roles & Invites." Gating it on a new, unseeded
// `admin.users` key would let a plain `admin` see the page while every write on it
// (`user_invites`, `user_permissions`) still 403s at the DB layer per the live RLS policies
// — exactly the confusing half-broken UX this phase exists to prevent. Using the real seeded
// key instead means a plain `admin` correctly loses the nav item and the route, not just the
// buttons on it. Recorded in PHASE-2-CHECKLIST.md's Notes and deviations too.
export const APP_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/dashboard" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, route: "/campaigns" },
  { key: "ai-agents", label: "AI Agents", icon: Bot, route: "/ai-agents" },
  { key: "plugins", label: "Plugins", icon: Puzzle, route: "/plugins" },
  { key: "call-center", label: "Call Center", icon: Headphones, route: "/call-center" },
  { key: "reports", label: "Reports", icon: BarChart3, route: "/reports" },
  { key: "finance", label: "Finance", icon: DollarSign, route: "/finance" },
  { key: "marketplace", label: "Marketplace", icon: Store, route: "/marketplace" },
  { key: "calendar", label: "Calendar", icon: CalendarCheck, route: "/calendar" },
  { key: "settings", label: "Settings", icon: Settings, route: "/settings" },
  // Deliberately last — see the deviation note above for the key choice. Ordering also
  // matters for Login.tsx's landing-route pick (§D.4): the first entry a user has access to
  // wins, and nobody should land on /admin by default even when they can see it.
  { key: "admin.roles_invites", label: "User Management", icon: ShieldAlert, route: "/admin" },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon; route: string }[];

export type AppPermissionKey = (typeof APP_PERMISSIONS)[number]["key"];

// Phase 2 §D.4/[E25] — Login.tsx used to hardcode navigate("/dashboard"); a user without the
// `dashboard` permission landed there anyway and, once Phase 0's route guard was in place,
// was bounced straight back off it. Both Login's post-sign-in redirect (via LandingRedirect,
// the "/" route) and ProtectedRoute's own denied-access fallback now pick the first entry
// here the user actually has, instead of a fixed page. Order in APP_PERMISSIONS above is the
// priority order — `dashboard` first is deliberate, `admin.roles_invites` last so nobody
// lands on the admin page as a side effect of also having access to it.
export function getFirstAccessibleRoute(isSuper: boolean, permissions: string[]): string | null {
  const match = APP_PERMISSIONS.find((p) => computeHasPermission(isSuper, permissions, p.key));
  return match ? match.route : null;
}
