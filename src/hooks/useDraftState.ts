import { useCallback, useEffect, useRef, useState } from "react";

// Client-feedback plan §G — the ONE draft-persistence primitive. There was no prior pattern to
// copy: `grep -rn "localStorage\|sessionStorage" src/` returns a single hit (the Supabase auth
// store). So this is built once and shared by all three wizards rather than three ad-hoc versions.
//
// The ask, verbatim: "clears only when you finish or explicitly close it." So Esc, click-outside,
// and navigating away all KEEP the draft; only a Cancel button and a successful submit CLEAR it
// (that distinction lives in the calling dialogs — this hook just gives them clearDraft()).
//
// Contract:
//   - key: callixis:draft:v1:<userId>:<formKey>. Namespaced by user (G.2) so a shared machine
//     never shows one person's half-written campaign to another. `v1` prefix (G.3) so a future
//     shape change discards old drafts instead of hydrating a component with fields that no
//     longer exist.
//   - debounced write ~400ms (G.4) — a keystroke-per-write on a JSON blob is wasteful.
//   - EVERY read and write is wrapped in try/catch (G.5) — localStorage throws outright in
//     private windows and with site data disabled; a draft feature must never crash a dialog.
//   - returns { value, setValue, clearDraft, restored }. `restored` is true when the hook
//     hydrated from a saved draft (G.11 — the caller shows a "Draft restored" line).

const DRAFT_PREFIX = "callixis:draft:v1";
const DEBOUNCE_MS = 400;

// Exported for unit testing (the hook itself needs a real localStorage + React render).
export function draftKey(userId: string | undefined, formKey: string): string {
  return `${DRAFT_PREFIX}:${userId ?? "anon"}:${formKey}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDraftValue<T>(storage: StorageLike | undefined, key: string): T | undefined {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    // parse failure, SecurityError (private window), storage disabled — treat as "no draft".
    return undefined;
  }
}

export function writeDraftValue(storage: StorageLike | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded / disabled / private window — a draft is a convenience, never a guarantee.
  }
}

export function removeDraftValue(storage: StorageLike | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

function getStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

interface UseDraftState<T> {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  clearDraft: () => void;
  restored: boolean;
}

export function useDraftState<T>(formKey: string, initialValue: T, userId: string | undefined): UseDraftState<T> {
  const key = draftKey(userId, formKey);
  const storage = getStorage();

  // Read once, synchronously, at mount — a re-opened dialog shows the draft immediately, with no
  // flash of the empty form.
  const [{ value, restored }, setState] = useState<{ value: T; restored: boolean }>(() => {
    const saved = readDraftValue<T>(storage, key);
    return saved !== undefined ? { value: saved, restored: true } : { value: initialValue, restored: false };
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev.value) : next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => writeDraftValue(storage, key, resolved), DEBOUNCE_MS);
        return { value: resolved, restored: prev.restored };
      });
    },
    [storage, key],
  );

  const clearDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    removeDraftValue(storage, key);
    setState({ value: initialValue, restored: false });
  }, [storage, key, initialValue]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { value, setValue, clearDraft, restored };
}
