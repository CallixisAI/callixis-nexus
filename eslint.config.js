import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/components/ui/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Phase 7 admin-module-plan (docs/admin-module-plan/PHASE-7-audit-and-hardening.md §D —
      // D-11) — re-enabled as a warning first, per the phase doc's own recommendation ("Yes, as
      // a warning first"). The backlog this turned up (mostly stale imports left behind by
      // earlier phases) was cleared in the same change; see PHASE-7-CHECKLIST.md's D.1 note for
      // the count. Left at "warn", not promoted to "error" yet — D-11's own third step
      // ("promote to error") is a separate, later call once this has run clean for a while with
      // nobody actively working around it.
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
