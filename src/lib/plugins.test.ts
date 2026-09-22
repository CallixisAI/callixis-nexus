import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  PLUGIN_REGISTRY,
  PLUGINS_BY_ID,
  LIVE_PLUGIN_IDS,
  pluginById,
  visibleConfigFields,
  isPluginConfigured,
  missingRequiredFields,
  type PluginSpec,
} from "./plugins";

// Plugins plan (docs/plugins-plan/README.md) §F — the four anti-drift guards, plus the ordinary
// unit tests for §B's registry helpers. §F.3/§F.5 read two Deno edge functions' raw source as
// TEXT (fs.readFileSync, not an import — Deno code can't be imported into Vitest, the same
// boundary src/lib/phone.ts documents) and mirror-check them against this registry.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

describe("PLUGIN_REGISTRY — basic shape", () => {
  it("has exactly 12 entries (§C: 1 live + 4 managed + 7 planned)", () => {
    expect(PLUGIN_REGISTRY).toHaveLength(12);
  });

  it("every id is unique", () => {
    const ids = PLUGIN_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("PLUGINS_BY_ID and pluginById agree with the registry for every id", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      expect(PLUGINS_BY_ID[plugin.id]).toBe(plugin);
      expect(pluginById(plugin.id)).toBe(plugin);
    }
    expect(pluginById("does-not-exist")).toBeUndefined();
  });

  it("readiness is one of the three §A.2 values for every entry", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      expect(["live", "managed", "planned"]).toContain(plugin.readiness);
    }
  });
});

describe("§F.1 — every entry has non-empty evidence, and cited path:line tokens are real", () => {
  const PATH_LINE_RE = /\b((?:[\w.-]+\/)+[\w.-]+\.\w+):(\d[\d,-]*)/g;

  it("every entry's evidence string is non-empty", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      expect(plugin.evidence.trim().length, `${plugin.id} has empty evidence`).toBeGreaterThan(0);
    }
  });

  it("every path:line token in evidence resolves to a real file with at least that many lines", () => {
    // §F.1's own rule: check the file EXISTS and is long enough — never assert the line's
    // CONTENTS, which breaks on any unrelated edit above it.
    for (const plugin of PLUGIN_REGISTRY) {
      const matches = [...plugin.evidence.matchAll(PATH_LINE_RE)];
      for (const [, filePath, numsStr] of matches) {
        const maxLine = Math.max(...(numsStr.match(/\d+/g) ?? ["0"]).map(Number));
        const absPath = resolve(REPO_ROOT, filePath);
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(absPath);
        } catch {
          throw new Error(`${plugin.id}'s evidence cites ${filePath}, which does not exist`);
        }
        expect(stat.isFile(), `${plugin.id}'s evidence cites ${filePath}, which is not a file`).toBe(true);
        const lineCount = readFileSync(absPath, "utf8").split("\n").length;
        expect(
          lineCount,
          `${plugin.id}'s evidence cites ${filePath}:${maxLine}, but the file only has ${lineCount} lines`
        ).toBeGreaterThanOrEqual(maxLine);
      }
    }
  });

  // A citation with no parseable path:line (a bare n8n node name, "no code in repo", "registry
  // entry only") is expected and fine — this just confirms at least SOME entries exercise the
  // path-checking half above, so a regex typo that silently matched nothing would be caught.
  it("at least one entry's evidence actually contains a checkable path:line token", () => {
    const anyChecked = PLUGIN_REGISTRY.some((p) => PATH_LINE_RE.test(p.evidence));
    expect(anyChecked).toBe(true);
  });
});

describe("whereReal — the plain-language version actually shown on the page (James, 2026-09-22)", () => {
  // `evidence` is the technical citation F.1 checks against real files — it is deliberately
  // NEVER rendered on the page (a raw "supabase/functions/n8n-proxy/index.ts:32-105" reads as
  // jargon to a non-technical viewer). `whereReal` is the sentence Plugins.tsx actually shows
  // for a live/managed card, and this guards it from ever regressing back into looking technical.
  const JARGON_MARKERS = [
    /\//, // a path separator
    /`/, // a backtick
    /:\d/, // a line-number-shaped colon+digit
    /\.\w{2,4}\b/, // a file-extension-shaped token, e.g. .ts, .sql, .json
  ];

  it("every live/managed entry has a whereReal sentence", () => {
    for (const plugin of PLUGIN_REGISTRY.filter((p) => p.readiness === "live" || p.readiness === "managed")) {
      expect(plugin.whereReal?.trim().length, `${plugin.id} has no whereReal sentence`).toBeGreaterThan(0);
    }
  });

  it("no whereReal sentence contains a file path, line number, or code-identifier-shaped token", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      if (!plugin.whereReal) continue;
      for (const marker of JARGON_MARKERS) {
        expect(
          marker.test(plugin.whereReal),
          `${plugin.id}'s whereReal ("${plugin.whereReal}") looks technical — matched ${marker}`
        ).toBe(false);
      }
    }
  });
});

describe("§F.2 — readiness: \"live\" is pinned to exactly { n8n }", () => {
  it("LIVE_PLUGIN_IDS is exactly [\"n8n\"]", () => {
    expect(LIVE_PLUGIN_IDS).toEqual(["n8n"]);
  });

  it("no entry other than n8n has readiness live", () => {
    const liveEntries = PLUGIN_REGISTRY.filter((p) => p.readiness === "live").map((p) => p.id);
    expect(liveEntries).toEqual(["n8n"]);
  });
});

describe("§F.4 — no price-shaped key exists on any registry entry (D-2)", () => {
  it("no entry carries a price/priceMonthly/priceYearly key", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      const keys = Object.keys(plugin as unknown as Record<string, unknown>);
      expect(keys).not.toContain("price");
      expect(keys).not.toContain("priceMonthly");
      expect(keys).not.toContain("priceYearly");
    }
  });
});

describe("§D.5 — a planned plugin collects no secrets", () => {
  it("no planned entry declares a secret: true config field", () => {
    for (const plugin of PLUGIN_REGISTRY.filter((p) => p.readiness === "planned")) {
      const secretFields = plugin.configFields.filter((f) => f.secret);
      expect(secretFields, `${plugin.id} is planned but declares a secret field`).toHaveLength(0);
    }
  });

  it("a managed entry's config fields, if any, are never secret (D-5's rule applies here too)", () => {
    for (const plugin of PLUGIN_REGISTRY.filter((p) => p.readiness === "managed")) {
      const secretFields = plugin.configFields.filter((f) => f.secret);
      expect(secretFields, `${plugin.id} is managed but declares a secret field`).toHaveLength(0);
    }
  });
});

describe("§D-6 (revised 2026-09-22, James, twice — first for planned, then managed too) — every plugin can be configured and manually toggled", () => {
  // The original D-6 ("planned has no Config/Enable button, managed has neither") left
  // fraud-shield/stripe with zero fields and the whole "managed" group with no buttons at all —
  // both of which produced a "why isn't there a button here" report. `Plugins.tsx`'s Config
  // button keys off visibleConfigFields().length, and Enable/Disable is now unconditional
  // (canToggle = true) — this test pins the DATA half of that contract so a future entry can't
  // silently ship with nothing to configure again.
  it("every registry entry has at least one visible (non-secret-gated) config field", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      expect(
        visibleConfigFields(plugin).length,
        `${plugin.id} (${plugin.readiness}) has no configurable fields, so its Config button would be hidden`
      ).toBeGreaterThan(0);
    }
  });

  it("a managed plugin's fields are cosmetic only — none are required, since there is nothing real to validate here", () => {
    for (const plugin of PLUGIN_REGISTRY.filter((p) => p.readiness === "managed")) {
      const requiredFields = plugin.configFields.filter((f) => f.required);
      expect(requiredFields, `${plugin.id} is managed but has a required field`).toHaveLength(0);
    }
  });
});

describe("visibleConfigFields", () => {
  it("returns all fields, secret or not, for a live plugin", () => {
    const n8n = pluginById("n8n") as PluginSpec;
    expect(visibleConfigFields(n8n).map((f) => f.key)).toEqual(n8n.configFields.map((f) => f.key));
  });

  it("drops secret fields for a non-live plugin (guards D-5 even if one is ever added)", () => {
    const fakeSpec: PluginSpec = {
      ...(pluginById("crm-sync") as PluginSpec),
      configFields: [
        { key: "endpoint", label: "Endpoint", placeholder: "", type: "url", required: false, secret: false },
        { key: "token", label: "Token", placeholder: "", type: "text", required: false, secret: true },
      ],
    };
    expect(visibleConfigFields(fakeSpec).map((f) => f.key)).toEqual(["endpoint"]);
  });
});

describe("isPluginConfigured / missingRequiredFields — §D.1/§D.2 fix", () => {
  const specWithRequired: PluginSpec = {
    ...(pluginById("n8n") as PluginSpec),
    configFields: [
      { key: "webhookUrl", label: "Webhook", placeholder: "", type: "url", required: true, secret: false },
      { key: "apiKey", label: "Key", placeholder: "", type: "text", required: false, secret: true },
    ],
  };

  it("a plugin with no required fields is always configured (managed/planned with optional-only fields)", () => {
    const noRequired: PluginSpec = { ...specWithRequired, configFields: [] };
    expect(isPluginConfigured(noRequired, {})).toBe(true);
  });

  it("§D.1's real bug: a present-but-blank required key must NOT count as configured", () => {
    // This is §0.9's live finding, reproduced: {apiKey: ""} used to satisfy
    // `Object.keys(config).length > 0`.
    expect(isPluginConfigured(specWithRequired, { webhookUrl: "" })).toBe(false);
    expect(isPluginConfigured(specWithRequired, { webhookUrl: "   " })).toBe(false);
  });

  it("a non-empty required value counts as configured", () => {
    expect(isPluginConfigured(specWithRequired, { webhookUrl: "https://x.example.com/webhook" })).toBe(true);
  });

  it("a required secret field is satisfied by the vault metadata set, not by a plaintext config value", () => {
    const requiresSecret: PluginSpec = {
      ...specWithRequired,
      configFields: [{ key: "apiKey", label: "Key", placeholder: "", type: "text", required: true, secret: true }],
    };
    expect(isPluginConfigured(requiresSecret, {})).toBe(false);
    expect(isPluginConfigured(requiresSecret, {}, new Set(["apiKey"]))).toBe(true);
  });

  it("missingRequiredFields names exactly the unmet required fields", () => {
    expect(missingRequiredFields(specWithRequired, {}).map((f) => f.key)).toEqual(["webhookUrl"]);
    expect(missingRequiredFields(specWithRequired, { webhookUrl: "https://x.example.com" })).toEqual([]);
  });
});

describe("§F.3 — plugin-setup-chat's prompt-map keys equal the registry ids", () => {
  // Before this plan, this map had 14 keys against a 4-entry registry (§0.10) — a fossil of the
  // deleted screenshot catalogue. This is that drift closed; this test is the one guard provable
  // against a failure that genuinely existed in this repo (§F.3a).
  it("PLUGIN_SYSTEM_PROMPTS' keys are exactly the 12 registry ids", () => {
    const source = readRepoFile("supabase/functions/plugin-setup-chat/index.ts");
    const start = source.indexOf("const PLUGIN_SYSTEM_PROMPTS");
    const end = source.indexOf("\nserve(async");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    const keyRe = /^\s{2}(?:"([\w-]+)"|([\w-]+)):\s*`/gm;
    const keys = [...block.matchAll(keyRe)].map((m) => m[1] ?? m[2]);

    expect(keys.length, "the prompt-map key regex matched nothing — it likely needs updating").toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set(PLUGIN_REGISTRY.map((p) => p.id)));
  });
});

describe("§F.5 — plugin-secrets' mirrored id list equals PLUGIN_REGISTRY's ids", () => {
  it("KNOWN_PLUGIN_IDS in the edge function matches the registry exactly", () => {
    const source = readRepoFile("supabase/functions/plugin-secrets/index.ts");
    const start = source.indexOf("const KNOWN_PLUGIN_IDS");
    const end = source.indexOf("] as const", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    const ids = [...block.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(PLUGIN_REGISTRY.map((p) => p.id)));
  });

  it("every KNOWN_SECRET_FIELDS entry in the edge function matches a real secret: true field in the registry", () => {
    const source = readRepoFile("supabase/functions/plugin-secrets/index.ts");
    const start = source.indexOf("const KNOWN_SECRET_FIELDS");
    const end = source.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, end);

    // Parse "pluginId: [\"field\", ...]" lines.
    const entryRe = /(\w[\w-]*)\s*:\s*\[([^\]]*)\]/g;
    for (const [, pluginId, fieldsStr] of block.matchAll(entryRe)) {
      const fields = [...fieldsStr.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
      const spec = pluginById(pluginId);
      expect(spec, `plugin-secrets mirrors a secret field for unknown plugin_id ${pluginId}`).toBeDefined();
      const realSecretKeys = spec!.configFields.filter((f) => f.secret).map((f) => f.key);
      for (const field of fields) {
        expect(
          realSecretKeys,
          `plugin-secrets allows ${pluginId}/${field} but src/lib/plugins.ts has no matching secret field`
        ).toContain(field);
      }
    }
  });
});

describe("§D.10 — marketplace.purchase_plugins is not referenced by this page's logic", () => {
  it("nothing in this registry or its consumers mentions marketplace permissions", () => {
    for (const plugin of PLUGIN_REGISTRY) {
      expect(JSON.stringify(plugin)).not.toMatch(/marketplace/i);
    }
  });
});
