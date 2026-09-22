import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { readDraftValue, writeDraftValue } from "@/hooks/useDraftState";
import {
  reconcileLayout,
  defaultLayout,
  moveVisibleTile,
  setTileWidth,
  hideTile,
  showTile,
  type DashboardLayout,
  type LayoutTileSpec,
  type TileWidth,
} from "@/lib/dashboardLayout";
import { DASHBOARD_TILE_SPECS } from "@/lib/dashboardTiles";

// Dashboard tiles plan §E — storage. D-5: the account (Supabase) is the source of truth; the
// localStorage copy exists for exactly one reason (stopping the first-paint flash, E.13) and is
// never itself authoritative. See docs/dashboard-tiles-plan/README.md §E items 22-25 for the full
// rationale behind every decision in this file.

type PageKey = "dashboard" | "reports";

const CACHE_PREFIX = "callixis:layout:v1";
const SAVE_DEBOUNCE_MS = 600;

// Exported for unit testing (E.21) — mirrors useDraftState's draftKey shape.
export function layoutCacheKey(userId: string | undefined, pageKey: PageKey): string {
  return `${CACHE_PREFIX}:${userId ?? "anon"}:${pageKey}`;
}

export function pageLayoutQueryKey(userId: string | undefined, pageKey: PageKey) {
  return ["page-layout", userId, pageKey] as const;
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface UsePageLayoutResult {
  layout: DashboardLayout;
  addedTileIds: string[];
  droppedTileIds: string[];
  isSaving: boolean;
  // §G.9's three-state saving indicator reads off this — see DashboardHeader.tsx.
  syncError: boolean;
  moveTile: (activeId: string, overId: string) => void;
  setWidth: (id: string, width: TileWidth) => void;
  hide: (id: string) => void;
  show: (id: string) => void;
  resetToDefault: () => void;
  // Bypasses the debounce — called on unmount and when the user presses "Done" (§G.5/item 25).
  flush: () => void;
}

export function usePageLayout(
  pageKey: PageKey,
  specs: readonly LayoutTileSpec[],
  userId: string | undefined,
  enabled: boolean,
): UsePageLayoutResult {
  const storage = getStorage();
  const cacheKey = layoutCacheKey(userId, pageKey);
  const queryClient = useQueryClient();

  // §E.13 — read the cache SYNCHRONOUSLY in the useState initializer. This is the entire
  // anti-flash guarantee: the very first paint is already the user's real (cached) layout,
  // rather than the default that would otherwise show for ~150ms until the server answers.
  const initial = useState(() => {
    const cached = readDraftValue<unknown>(storage, cacheKey);
    return reconcileLayout(cached, specs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })[0];

  const [layout, setLayoutState] = useState<DashboardLayout>(initial.layout);
  const [addedTileIds, setAddedTileIds] = useState<string[]>(initial.addedTileIds);
  const [droppedTileIds] = useState<string[]>(initial.droppedTileIds);
  const [syncError, setSyncError] = useState(false);

  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // §24's "applied at most once per mount" guard — a refetch mid-edit (e.g. from
  // invalidateQueries after a save) must never re-snap the grid out from under an in-progress
  // drag. Do not remove this.
  const hasHydratedRef = useRef(false);
  // The race guard (§E.18): true the moment the user makes their first edit. If the server
  // answers after that, its layout is discarded in favour of what the person is already doing —
  // applying it would yank a tile out from under the pointer mid-drag.
  const hasEditedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery({
    queryKey: pageLayoutQueryKey(userId, pageKey),
    queryFn: async () => {
      if (!userId) return null;
      // CLAUDE.md convention: every table is RLS-protected on auth.uid() = user_id, but every
      // query still filters explicitly too — RLS is the enforced boundary, not the documentation
      // of intent at the call site.
      const { data, error } = await supabase
        .from("user_page_layouts")
        .select("layout")
        .eq("user_id", userId)
        .eq("page_key", pageKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!userId,
  });

  const mutation = useMutation({
    mutationFn: async (next: DashboardLayout) => {
      if (!userId) return;
      const { error } = await supabase.from("user_page_layouts").upsert(
        // Structural interfaces have no implicit index signature, so TypeScript rejects
        // DashboardLayout against types.ts's recursive Json union directly — cast once, here,
        // nowhere else in this file.
        { user_id: userId, page_key: pageKey, layout: next as unknown as Json },
        { onConflict: "user_id,page_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setSyncError(false);
      queryClient.invalidateQueries({ queryKey: pageLayoutQueryKey(userId, pageKey) });
    },
    onError: () => {
      // §E.12 — a deliberate departure from this repo's usual no-onError habit: a silent failure
      // here means "your layout didn't save to your account," with no other signal anywhere on
      // the page. One toast, no retry loop.
      setSyncError(true);
      toast.error("Your layout didn't save to your account. It's saved on this device only.");
    },
  });

  const persist = useCallback(
    (next: DashboardLayout, immediate: boolean) => {
      // Synchronous on every edit — this write IS the anti-flash guarantee. Debouncing it too
      // would mean a reload 200ms after a drag shows the stale layout.
      writeDraftValue(storage, cacheKey, next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) {
        saveTimer.current = null;
        mutation.mutate(next);
      } else {
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          mutation.mutate(next);
        }, SAVE_DEBOUNCE_MS);
      }
    },
    [storage, cacheKey, mutation],
  );

  const applyEdit = useCallback(
    (updater: (prev: DashboardLayout) => DashboardLayout, immediate = false) => {
      hasEditedRef.current = true;
      setLayoutState((prev) => {
        const next = updater(prev);
        if (next === prev) return prev; // no-op — the mutation helper itself decided nothing changed
        persist(next, immediate);
        return next;
      });
    },
    [persist],
  );

  // §24 — hydration. Runs once, when the query actually settles.
  //
  // 🔴 `enabled` must be checked separately from `isLoading`: TanStack Query v5 reports
  // isLoading:false AND data:undefined for a query that is simply disabled (isLoading is defined
  // as isPending && isFetching, and a disabled query never starts fetching) — indistinguishable
  // from "fetched successfully, found no row" if this only looked at isLoading. Without this
  // guard, a user whose `enabled` (canViewOverview) starts false would have this effect fire
  // immediately, treat the disabled query as "no row", and upsert their LOCAL layout over
  // whatever was actually saved — before the real row was ever fetched.
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (!enabled) return;
    if (query.isLoading) return;
    hasHydratedRef.current = true;

    if (query.isError) {
      // Error -> keep local state, surface syncError. Never blow away the cache on a read
      // failure — that would trade a working cached layout for nothing.
      setSyncError(true);
      return;
    }

    if (hasEditedRef.current) return; // race guard (§E.18)

    if (!query.data) {
      // Success, no row -> keep local state, and adopt it into the account. This is the upgrade
      // path for anyone who customised before this migration was applied, or before their first
      // sync landed.
      persist(layoutRef.current, true);
      return;
    }

    // Success, row present -> the server wins, unconditionally.
    const result = reconcileLayout(query.data.layout, specs);
    writeDraftValue(storage, cacheKey, result.layout);
    setLayoutState(result.layout);
    setAddedTileIds(result.addedTileIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, query.isLoading, query.isError, query.data]);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      mutation.mutate(layoutRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutation]);

  // Flush on unmount. Empty deps deliberately — this must fire exactly once, at true unmount,
  // reading the LATEST layout via the ref rather than a snapshot from whenever the effect ran.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        mutation.mutate(layoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §F.2's whole point — a prop only re-renders a tile when ITS OWN prop actually changes — only
  // holds if these stay referentially stable across renders. Wrapped in useCallback so
  // React.memo(DashboardTile) isn't defeated by a fresh function literal on every render.
  const moveTile = useCallback((activeId: string, overId: string) => applyEdit((prev) => moveVisibleTile(prev, activeId, overId)), [applyEdit]);
  const setWidth = useCallback((id: string, width: TileWidth) => applyEdit((prev) => setTileWidth(prev, id, width, specs)), [applyEdit, specs]);
  const hide = useCallback((id: string) => applyEdit((prev) => hideTile(prev, id)), [applyEdit]);
  const show = useCallback((id: string) => applyEdit((prev) => showTile(prev, id)), [applyEdit]);
  const resetToDefault = useCallback(() => applyEdit(() => defaultLayout(specs), true), [applyEdit, specs]);

  return {
    layout,
    addedTileIds,
    droppedTileIds,
    isSaving: mutation.isPending,
    syncError,
    moveTile,
    setWidth,
    hide,
    show,
    resetToDefault,
    flush,
  };
}

// Six-line wrapper binding "dashboard" + the real tile registry, matching useAccountData()'s own
// convention of resolving userId from useAuth() internally rather than taking it as a parameter.
export function useDashboardLayout(enabled: boolean): UsePageLayoutResult {
  const { user } = useAuth();
  return usePageLayout("dashboard", DASHBOARD_TILE_SPECS, user?.id, enabled);
}
