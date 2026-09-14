import { describe, it, expect } from "vitest";
import { draftKey, readDraftValue, writeDraftValue, removeDraftValue } from "./useDraftState";

// Client-feedback plan §G — the hook itself needs React + a real localStorage; these cover the
// pure pieces it's built from: the key shape (G.2/G.3) and the try/catch resilience (G.5).

describe("draftKey", () => {
  it("namespaces by user (G.2) — two users never collide on the same form", () => {
    expect(draftKey("user-a", "create-campaign")).toBe("callixis:draft:v1:user-a:create-campaign");
    expect(draftKey("user-b", "create-campaign")).toBe("callixis:draft:v1:user-b:create-campaign");
    expect(draftKey("user-a", "create-campaign")).not.toBe(draftKey("user-b", "create-campaign"));
  });

  it("carries the v1 version prefix (G.3) so a future shape change discards old drafts", () => {
    expect(draftKey("u", "agent-wizard").startsWith("callixis:draft:v1:")).toBe(true);
  });

  it("falls back to 'anon' when there is no signed-in user", () => {
    expect(draftKey(undefined, "upload-leads-campaign")).toBe("callixis:draft:v1:anon:upload-leads-campaign");
  });
});

// A minimal in-memory Storage; and one that throws on every call, standing in for a private
// window / storage-disabled browser (G.5).
function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
const throwingStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("readDraftValue / writeDraftValue / removeDraftValue", () => {
  it("round-trips an object through JSON", () => {
    const storage = memStorage();
    const key = draftKey("u", "create-campaign");
    writeDraftValue(storage, key, { name: "Q4 Push", maxLeads: 50 });
    expect(readDraftValue<{ name: string; maxLeads: number }>(storage, key)).toEqual({ name: "Q4 Push", maxLeads: 50 });
    removeDraftValue(storage, key);
    expect(readDraftValue(storage, key)).toBeUndefined();
  });

  it("returns undefined for a missing key", () => {
    expect(readDraftValue(memStorage(), "nope")).toBeUndefined();
  });

  it("returns undefined (never throws) on malformed JSON", () => {
    const storage = memStorage();
    storage.setItem("k", "{not json");
    expect(readDraftValue(storage, "k")).toBeUndefined();
  });

  it("G.5 — every operation swallows a throwing storage instead of crashing the caller", () => {
    expect(() => readDraftValue(throwingStorage, "k")).not.toThrow();
    expect(readDraftValue(throwingStorage, "k")).toBeUndefined();
    expect(() => writeDraftValue(throwingStorage, "k", { a: 1 })).not.toThrow();
    expect(() => removeDraftValue(throwingStorage, "k")).not.toThrow();
  });

  it("G.5 — tolerates storage being entirely unavailable (undefined)", () => {
    expect(readDraftValue(undefined, "k")).toBeUndefined();
    expect(() => writeDraftValue(undefined, "k", 1)).not.toThrow();
    expect(() => removeDraftValue(undefined, "k")).not.toThrow();
  });
});
