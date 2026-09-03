import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PermissionLevel } from "@/lib/roleMatrix";

// Phase 1 (20260812000000_roles_as_data.sql): roles became data — the real set is now
// super_admin/admin/it_manager/sales_manager/support_manager/affiliate_manager/operator/
// pending_role_review (roles.key, editable in the DB from Phase 3 on), not this 3-value
// enum from before. Kept as a plain string rather than re-hardcoding the new list for the
// same reason the DB column did: a role added later via Phase 3's UI shouldn't need a
// types.ts-style edit here too.
export type UserRole = string;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  // Set only after role/profile/permissions have settled (or failed to). ProtectedRoute
  // must wait on this in addition to `loading` — see PHASE-0-foundation-security.md §C.1.
  // Without it, `loading` goes false as soon as the session resolves while role/profile
  // are still mid-fetch, so a role check evaluated in that window always sees `role === null`.
  profileLoaded: boolean;
  role: UserRole | null;
  // Phase 2 (docs/admin-module-plan/PHASE-2-app-reads-roles.md §B) — real data
  // (`roles.is_super`) replacing the `role === 'admin'` string short-circuit that used to
  // live in computeHasPermission. Which role is all-powerful is now a database decision,
  // not one welded into the client bundle.
  isSuper: boolean;
  permissions: string[];
  // Permission-overrides plan Phase 4 §G (docs/permission-overrides-plan/README.md) — the
  // level get_my_permissions() has always returned and this context has always thrown away
  // (E7: `.map((p) => p.permission_key)` kept only the key). Additive: `permissions` above is
  // unchanged, so the 5 existing hasPermission( call sites see no behaviour change (G's own
  // exit criterion) — this is new plumbing nothing reads yet until §H's action-gates call
  // hasPermissionAtLeast below.
  permissionLevels: Record<string, PermissionLevel>;
  profile: { full_name: string; company_name: string; avatar_url: string; email: string } | null;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasPermissionAtLeast: (permission: string, minLevel: PermissionLevel) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profileLoaded: false,
  role: null,
  isSuper: false,
  permissions: [],
  permissionLevels: {},
  profile: null,
  signOut: async () => {},
  hasPermission: () => false,
  hasPermissionAtLeast: () => false,
});

export const useAuth = () => useContext(AuthContext);

// Phase 2 §B: the admin short-circuit ("if (role === 'admin') return true") is gone. It was
// "the exact opposite of only based on what we give permissions to" (ADMIN-RBAC-PLAN.md §4.4)
// — while it existed, a role named admin/super_admin could never be restricted no matter what
// role_permissions said, because the string was welded into the client bundle. isSuper is data
// (roles.is_super, resolved server-side and mirrored here), so which role is all-powerful is
// now a decision made in the database.
export const computeHasPermission = (isSuper: boolean, permissions: string[], permission: string) =>
  isSuper || permissions.includes(permission);

// Permission-overrides plan Phase 4 §G — same view < edit < full order roleMatrix.ts's
// LEVEL_CYCLE already encodes for the matrix editor's click-to-cycle control (G.3: reuse the
// existing ranking, don't write a second one that can drift from it).
export const LEVEL_RANK: Record<PermissionLevel, number> = { view: 1, edit: 2, full: 3 };

// The level-aware sibling of computeHasPermission. isSuper always passes (a super role holds
// every permission at 'full' regardless of what role_permissions lists, Phase 1 §D — same
// bypass computeHasPermission already gives presence checks). Missing a grant entirely means
// "no level," which never meets any minLevel.
export const computeHasPermissionAtLeast = (
  isSuper: boolean,
  levels: Record<string, PermissionLevel>,
  permission: string,
  minLevel: PermissionLevel
) => isSuper || LEVEL_RANK[levels[permission]] >= LEVEL_RANK[minLevel];

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionLevels, setPermissionLevels] = useState<Record<string, PermissionLevel>>({});
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);

  const fetchUserData = async (userId: string) => {
    setProfileLoaded(false);

    // .maybeSingle(), not .single() — Phase 0 §D.3/[E8]. .single() *errors* unless exactly
    // one row comes back, which turned a zero-row (deleted/pending profile) or two-row
    // (see §D.2 — user_roles used to permit >1 role per user) result into a silently
    // null role with no logged reason, quietly stripping a real admin of all access.
    //
    // Phase 2 §C: `user_permissions` is no longer read directly [E9] — that let the client
    // disagree with the database about who can do what, since the raw table doesn't apply
    // role grants, deny-beats-allow, or the is_super bypass. get_my_permissions() is the same
    // resolver RLS itself uses, so the UI and the database cannot disagree.
    //
    // The `roles` catalogue (just key + is_super, ~9 rows, world-readable to any
    // authenticated user) is fetched alongside rather than embedded via a `user_roles ->
    // roles` join — no other query in this codebase uses a nested-resource select, and this
    // keeps the pattern consistent without hand-adding Relationships metadata to types.ts.
    const [
      { data: userRoleRow, error: roleError },
      { data: prof, error: profileError },
      { data: roleCatalogue, error: roleCatalogueError },
      { data: perms, error: permsError },
    ] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, company_name, avatar_url, email").eq("id", userId).maybeSingle(),
      supabase.from("roles").select("key, is_super"),
      supabase.rpc("get_my_permissions"),
    ]);

    if (roleError) console.error("AuthContext: failed to load role", roleError);
    if (profileError) console.error("AuthContext: failed to load profile", profileError);
    if (roleCatalogueError) console.error("AuthContext: failed to load role catalogue", roleCatalogueError);
    if (permsError) console.error("AuthContext: failed to load permissions", permsError);

    const resolvedRole = userRoleRow ? (userRoleRow.role as UserRole) : null;
    const resolvedIsSuper = !!roleCatalogue?.find((r) => r.key === resolvedRole)?.is_super;

    setRole(resolvedRole);
    setIsSuper(resolvedIsSuper);
    setProfile(prof ?? null);
    setPermissions(perms ? perms.map((p) => p.permission_key) : []);
    // Phase 4 §G — the level get_my_permissions() already returns alongside permission_key,
    // kept this time instead of thrown away (E7).
    setPermissionLevels(
      perms ? Object.fromEntries(perms.map((p) => [p.permission_key, p.level as PermissionLevel])) : {}
    );
    setProfileLoaded(true);
  };

  const hasPermission = (permission: string) => computeHasPermission(isSuper, permissions, permission);
  const hasPermissionAtLeast = (permission: string, minLevel: PermissionLevel) =>
    computeHasPermissionAtLeast(isSuper, permissionLevels, permission, minLevel);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchUserData(session.user.id), 0);
      } else {
        setRole(null);
        setIsSuper(false);
        setProfile(null);
        setPermissions([]);
        setPermissionLevels({});
        setProfileLoaded(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchUserData(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsSuper(false);
    setProfile(null);
    setPermissions([]);
    setPermissionLevels({});
    setProfileLoaded(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, profileLoaded, role, isSuper, permissions, permissionLevels, profile,
        signOut, hasPermission, hasPermissionAtLeast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
