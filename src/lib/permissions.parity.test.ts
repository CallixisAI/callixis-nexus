import { describe, it, expect } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { APP_PERMISSIONS } from "./permissions";

// Phase 2 (docs/admin-module-plan/PHASE-2-CHECKLIST.md §A.5/§A.6) — the permission catalogue
// exists in two places on purpose (this file's own comment explains why), and duplication is
// exactly what caused [E14]. This test is the guard: it fails if APP_PERMISSIONS and the
// live `permissions` table diverge.
//
// §A.6 decision, recorded here rather than left implicit: this needs a real database
// connection, which none of this project's other tests have [E30] — every other test file is
// pure-logic. This repo also has no CI pipeline yet (no .github/workflows, checked
// 2026-08-12), so "runs in CI" isn't available as an option today. Landed as an **opt-in**
// Vitest integration test instead of a separate script, so it stays in the one test runner
// everyone already uses rather than adding a second tool — but it does NOT run by default:
// `.env.test`'s fake Supabase URL would make every assertion below fail on a network error,
// not a real parity mismatch, which is worse than not running it. Gated behind an explicit
// flag so `npm test` / `./scripts/check.sh` stay green without a live project, and a real run
// against the hosted database is a deliberate, visible action:
//
//   RUN_SUPABASE_INTEGRATION_TESTS=1 npm test -- permissions.parity
//
// (needs `callixis-nexus/.env` — not `.env.test` — populated with the real project's URL and
// publishable key; see this repo's CLAUDE.md "Setup" section.)
//
// ⚠️ Not run this session — no live Supabase credentials were available (the environment's
// Supabase MCP connection is unauthenticated). §S.5 ("the parity check runs and passes
// somewhere real") is therefore still open; someone with the real `.env` needs to run the
// command above at least once.
const RUN_INTEGRATION = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";

describe.skipIf(!RUN_INTEGRATION)("permission catalogue parity (DB vs APP_PERMISSIONS)", () => {
  it("every APP_PERMISSIONS key exists as a real row in the permissions table", async () => {
    const { data, error } = await supabase.from("permissions").select("key");
    expect(error).toBeNull();

    const dbKeys = new Set((data ?? []).map((row) => row.key));
    const missingFromDb = APP_PERMISSIONS.map((p) => p.key).filter((key) => !dbKeys.has(key));

    expect(missingFromDb, `TS has keys the DB doesn't: ${missingFromDb.join(", ")}`).toEqual([]);
  });

  it("every page-level DB permission is wired into APP_PERMISSIONS (the nav/route guard)", async () => {
    // Scoped to category='page' deliberately: the 24 granular action permissions (Phase 1
    // §6) aren't nav items and were never meant to be — only admin.roles_invites, one of
    // those 24, is in APP_PERMISSIONS, because it's this app's one route gated on an action
    // key rather than a page key. See src/lib/permissions.ts's own comment for why.
    const { data, error } = await supabase.from("permissions").select("key").eq("category", "page");
    expect(error).toBeNull();

    // Set<string>, explicitly widened from AppPermissionKey's literal union — the DB's `key`
    // column is a plain string, and comparing it against the narrower literal type is a real
    // type error, not just noise (caught by `tsc`, not by vitest's transpile-only runner).
    const tsKeys = new Set<string>(APP_PERMISSIONS.map((p) => p.key));
    const missingFromTs = (data ?? []).map((row) => row.key).filter((key) => !tsKeys.has(key));

    expect(missingFromTs, `DB has page permissions with no nav/route entry: ${missingFromTs.join(", ")}`).toEqual([]);
  });
});
