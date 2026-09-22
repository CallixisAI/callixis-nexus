// Plugins plan (docs/plugins-plan/README.md) §B — the one shared plugin catalogue. Moved out of
// src/pages/Plugins.tsx (where it used to be a hardcoded array, Plugins.tsx:71-133 before this
// change) so it can be unit-tested (src/lib/plugins.test.ts) and so a card can never claim more
// than this file says is true. Same pattern this repo already uses four times over —
// src/lib/permissions.ts, src/lib/industries.ts, src/lib/voices.ts, src/lib/dashboardTiles.ts —
// each created because two independent copies of the same list had drifted.
//
// §A.1 — the two ideas this file keeps separate:
//   readiness  — does this integration actually do anything? A fact about the repo, identical
//                for every customer. Lives here, in code.
//   enabled    — has THIS user switched it on? Per-user. Lives in user_plugins.status, in the
//                database. Never rendered as if it were the same thing as readiness — a
//                `planned` plugin cannot reach an enabled state at all (D-6).
//
// §A.3 — every entry's `evidence` names a real file or n8n node, never a feeling. Where it
// contains a `path:line` token, src/lib/plugins.test.ts's F.1 guard resolves it against the
// real file on disk and fails if the file doesn't exist or is shorter than the cited line.
// `evidence` itself is deliberately NEVER shown on the page (James, 2026-09-22 — file paths and
// line numbers on a plugin card read as raw engineering jargon to a non-technical viewer). It
// exists purely as the thing a developer/reviewer can check the claim against, and as what F.1
// tests. What actually renders is `whereReal` — one plain-English sentence, no file paths, line
// numbers, code identifiers, or backticks — asserted jargon-free by its own test.

import type { LucideIcon } from "lucide-react";
import { Workflow, Phone, MessageSquare, Mail, Sparkles, Database, MessageCircle, Calendar, Globe, Languages, ShieldAlert, CreditCard } from "lucide-react";

export type PluginReadiness = "live" | "managed" | "planned";

export interface PluginConfigField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "url" | "email";
  required: boolean;
  /** D-3/D-5: a secret never touches user_plugins.config. Only `live` plugins may set this. */
  secret: boolean;
  /** Plain-language note shown under the field. */
  help?: string;
}

export interface PluginSpec {
  id: string;
  name: string;
  provider: string;
  category: "Automation" | "Communication" | "Intelligence" | "Scheduling" | "Finance";
  readiness: PluginReadiness;
  /** One line, honest, present tense only when readiness is live or managed. */
  summary: string;
  /** What it does / would do, and its limit. Rendered in the detail sheet. */
  detail: string;
  /** §A.3 — a path:line or workflow node, never a feeling. Asserted non-empty by F.1. Internal
   *  only — never rendered on the page. See `whereReal` for the plain-language version shown. */
  evidence: string;
  /** One short, plain-English sentence for `live`/`managed` cards — where this really runs or is
   *  controlled. No file paths, line numbers, code identifiers, or backticks. This is what the
   *  page actually shows; `evidence` above is the technical citation behind it. */
  whereReal?: string;
  features: string[];
  icon: LucideIcon;
  configFields: PluginConfigField[];
}

// Note what is absent: there is no `price`, `priceMonthly` or `priceYearly` field anywhere on
// this type. D-2 ("no prices at all — a price nobody can pay is the same class of fabrication
// as the old green dot") is enforced by the type itself; F.4 asserts it stays that way.

export const PLUGIN_REGISTRY: PluginSpec[] = [
  // ── §C.1 — live: 1 entry ──────────────────────────────────────────────────────────
  {
    id: "n8n",
    name: "n8n Automation",
    provider: "n8n.io",
    category: "Automation",
    readiness: "live",
    summary: "Runs the Chat Test and the script generator through your own n8n workflow.",
    detail:
      "This is the only plugin on this page whose settings change what the app does. Point it " +
      "at your workflow's /chat webhook — not /vapi-events or /transcript, which carry call " +
      "outcomes, not chat replies. AI Agents' Chat Test and the script generator both stop " +
      "working if this is wrong.",
    evidence: "supabase/functions/n8n-proxy/index.ts:32-105; used by src/pages/AIAgents.tsx:187,359",
    whereReal: "Powers the Chat Test and the script generator in AI Agents.",
    features: ["Chat Test", "Script generator", "Webhook orchestration"],
    icon: Workflow,
    configFields: [
      { key: "webhookUrl", label: "Chat Webhook URL", placeholder: "https://n8n.yourdomain.com/webhook/chat", type: "url", required: true, secret: false },
      { key: "apiKey", label: "n8n API Key", placeholder: "Your n8n API key", type: "text", required: false, secret: true, help: "Optional — sent as X-N8N-API-KEY if your workflow checks it." },
    ],
  },

  // ── §C.2 — managed: 4 entries, no config form (D-6) ──────────────────────────────
  {
    id: "voice",
    name: "Voice Calling",
    provider: "Vapi",
    category: "Communication",
    readiness: "managed",
    summary: "Outbound AI calls. Running now, configured by the Callixis team.",
    detail:
      "Your campaigns dial through Vapi. Voices, phone numbers and call behaviour are set up by " +
      "Callixis rather than here — pick the voice on an AI Agent, and set dialling hours on the " +
      "campaign. There is nothing to connect on this card.",
    evidence: 'n8n node "Place Call (Vapi)"; supabase/functions/dispatch-batch/index.ts + supabase/functions/call-ingest/index.ts',
    whereReal: "Runs your outbound calls, set up and maintained by our team.",
    features: ["Outbound dialing", "Assistant voices", "Call scoring"],
    icon: Phone,
    // James, 2026-09-22: a generic notes field, same reasoning as the planned entries below —
    // nothing reads it, it just gives every card something to configure. The real settings for
    // this capability live on an AI Agent / campaign, as the detail text above says.
    configFields: [
      { key: "notes", label: "Notes", placeholder: "Personal notes only — real settings live on an AI Agent or campaign", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "sms",
    name: "SMS Follow-up",
    provider: "Twilio",
    category: "Communication",
    readiness: "managed",
    summary: "Texts a qualified lead after the call. Running now, configured by the Callixis team.",
    detail:
      "When a call ends and the lead qualifies with a phone number on file, the call engine " +
      "sends one follow-up text. The Twilio account is held inside n8n, not here.",
    evidence: 'n8n node "Send an SMS/MMS/WhatsApp message" (credential "Twilio account 2"), behind "Guard Phone"',
    whereReal: "Texts a lead automatically after a qualifying call.",
    features: ["Post-call SMS", "Qualified-lead follow-up"],
    icon: MessageSquare,
    configFields: [
      { key: "notes", label: "Notes", placeholder: "Personal notes only — real settings are held inside n8n", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "email",
    name: "Email Follow-up",
    provider: "Resend + Gmail",
    category: "Communication",
    readiness: "managed",
    summary: "Sends the post-call recap and admin invitations. Running now, configured by the Callixis team.",
    detail:
      "Two different senders do two different jobs. Team invitations go out through Resend from " +
      "noreply@callixis.com. The post-call recap to a qualified lead is sent by the call engine " +
      "through Gmail. Neither is configured on this page.",
    evidence: 'supabase/functions/manage-users/index.ts:905-937 (Resend); n8n node "Send a message" behind "Guard Email"',
    whereReal: "Sends team invitations and the post-call summary automatically.",
    features: ["Team invitations", "Post-call recap"],
    icon: Mail,
    configFields: [
      { key: "notes", label: "Notes", placeholder: "Personal notes only — real settings are held in n8n / Resend", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "lead-scoring",
    name: "AI Lead Scoring",
    provider: "Callixis engine",
    category: "Intelligence",
    readiness: "managed",
    summary: "Scores every completed call. Running now — you can see the scores today.",
    detail:
      "After each call the engine reads the transcript and writes a qualification verdict and a " +
      "0-100 score. They already appear on the call detail panel. This is not a configurable " +
      "scoring engine — there is no threshold setting, no rules UI, no model choice here yet.",
    evidence:
      "supabase/migrations/20260731000000_leads.sql:27 (lead_score); written by " +
      "supabase/functions/call-ingest/index.ts:301,401,432,464; shown at " +
      "src/components/campaigns/CallDetailSheet.tsx:165",
    whereReal: "Scores every call automatically — see the score on the call's details.",
    features: ["Qualification verdict", "0-100 score"],
    icon: Sparkles,
    configFields: [
      { key: "notes", label: "Notes", placeholder: "Personal notes only — no scoring settings exist here yet", type: "text", required: false, secret: false },
    ],
  },

  // ── §C.3 — planned: 7 entries, non-secret fields only (D-5) ──────────────────────
  {
    id: "crm-sync",
    name: "CRM Sync",
    provider: "Salesforce / HubSpot",
    category: "Automation",
    readiness: "planned",
    summary: "Would push qualified leads into your CRM.",
    detail:
      "Not built yet — the endpoint box on a campaign saves, but nothing in the product reads " +
      "it today. You can record your CRM endpoint here for when it is built; nothing will sync " +
      "in the meantime.",
    evidence:
      "campaigns.crm_api_endpoint written at src/components/campaigns/CreateCampaignDialog.tsx:168 " +
      "and src/components/campaigns/CampaignSettingsDialog.tsx:71, mapped at " +
      "src/hooks/useCampaigns.ts:304,364; zero readers in supabase/functions/",
    features: ["Would push qualified leads", "Field mapping"],
    icon: Database,
    configFields: [
      { key: "crmEndpoint", label: "CRM Endpoint URL", placeholder: "https://yourcrm.example.com/api/leads", type: "url", required: false, secret: false },
      { key: "objectType", label: "Object Type", placeholder: "Lead", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    provider: "Meta",
    category: "Communication",
    readiness: "planned",
    summary: "Would message leads on WhatsApp.",
    detail: "Not built yet — needs Meta Business verification before any code can be written.",
    evidence: "no code in repo",
    features: ["Would message leads on WhatsApp"],
    icon: MessageCircle,
    configFields: [
      { key: "businessPhone", label: "Business Phone Number", placeholder: "+1...", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "calendar",
    name: "Calendar & Scheduling",
    provider: "Calendly / Google",
    category: "Scheduling",
    readiness: "planned",
    summary: "Would let a lead book a slot during the call.",
    detail:
      "Not built yet — today's Calendar page is a view of calls that already happened, not a " +
      "real diary, and nothing lets a lead book anything.",
    evidence: "src/pages/CalendarScheduling.tsx:107,116 derives events from useCampaigns(), not a booking system",
    features: ["Would let a lead book a slot"],
    icon: Calendar,
    configFields: [
      { key: "bookingLink", label: "Booking Link", placeholder: "https://calendly.com/you/intro", type: "url", required: false, secret: false },
    ],
  },
  {
    id: "chatbot",
    name: "Web Chatbot",
    provider: "Callixis AI",
    category: "Communication",
    readiness: "planned",
    summary: "Would put a chat widget on your website.",
    detail: "Not built yet — no embed code exists.",
    evidence: "no code in repo",
    features: ["Would put a chat widget on your site"],
    icon: Globe,
    configFields: [
      { key: "siteDomain", label: "Website Domain", placeholder: "yourdomain.com", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "multi-language",
    name: "Multi-Language AI",
    provider: "Callixis AI",
    category: "Intelligence",
    readiness: "planned",
    summary: "Would call leads in other languages.",
    detail: "Not built yet — every configured voice is English today.",
    evidence: 'src/lib/voices.ts — all 15 entries are language: "en"',
    features: ["Would call leads in other languages"],
    icon: Languages,
    configFields: [
      { key: "preferredLanguages", label: "Preferred Languages", placeholder: "Spanish, French", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "fraud-shield",
    name: "Fraud Shield",
    provider: "Callixis",
    category: "Intelligence",
    readiness: "planned",
    summary: "Would screen incoming lead traffic for fraud.",
    detail: "Not built yet — needs a paid third-party fraud-data provider first.",
    evidence: "no code in repo",
    features: ["Would screen traffic for fraud"],
    icon: ShieldAlert,
    // James, 2026-09-22: every non-managed plugin should be manually toggleable and have
    // something to configure, even with nothing built yet — so this and stripe (the only two
    // entries that otherwise had zero fields) get a generic notes field. Nothing reads this
    // field; it's a place to record intent for whoever builds this later.
    configFields: [
      { key: "notes", label: "Notes for later", placeholder: "e.g. which provider you'd want, sensitivity level", type: "text", required: false, secret: false },
    ],
  },
  {
    id: "stripe",
    name: "Stripe Payments",
    provider: "Stripe",
    category: "Finance",
    readiness: "planned",
    summary: "Would take payments.",
    detail: "Not built yet — nothing in the product charges anyone today.",
    evidence: "registry entry only",
    features: ["Would take payments"],
    icon: CreditCard,
    configFields: [
      { key: "notes", label: "Notes for later", placeholder: "e.g. one-time vs subscription, currencies", type: "text", required: false, secret: false },
    ],
  },
];

export const PLUGINS_BY_ID: Record<string, PluginSpec> = Object.fromEntries(
  PLUGIN_REGISTRY.map((plugin) => [plugin.id, plugin])
);

// F.2 — pinned to exactly this. Adding a second `live` entry means editing this constant AND
// its guarding test, which is the point: it requires a reviewer, not a feeling.
export const LIVE_PLUGIN_IDS: readonly string[] = PLUGIN_REGISTRY.filter((p) => p.readiness === "live").map((p) => p.id);

export function pluginById(id: string): PluginSpec | undefined {
  return PLUGINS_BY_ID[id];
}

// D-5, in one tested function instead of in JSX: a planned plugin's secret-typed fields (there
// are none today, but the rule must hold if one is ever added) are never shown at all — there is
// no vault door for them to be saved into.
export function visibleConfigFields(spec: PluginSpec): PluginConfigField[] {
  if (spec.readiness === "live") return spec.configFields;
  return spec.configFields.filter((field) => !field.secret);
}

// §D.1 — the fix for the "Config Saved" bug (Plugins.tsx:457 used to read
// `Object.keys(config).length > 0`, so `{apiKey: ""}` counted as configured). A plugin with no
// required fields at all (every `planned`/`managed` entry today) is "configured" the moment its
// non-required fields have been touched at least once, OR trivially if it has no fields — the
// state a user actually sees is "nothing more to fill in", not "an empty object exists".
//
// `secretFieldKeys` names which of this spec's secret fields are known-set in Vault (from
// user_plugin_secrets' metadata) — a required secret field counts as satisfied via that set,
// never via a plaintext value in `config` (which, post-§E, secret fields never write to at all).
export function isPluginConfigured(
  spec: PluginSpec,
  config: Record<string, string>,
  secretFieldKeys: ReadonlySet<string> = new Set()
): boolean {
  const requiredFields = spec.configFields.filter((field) => field.required);
  if (requiredFields.length === 0) return true;
  return requiredFields.every((field) => {
    if (field.secret) return secretFieldKeys.has(field.key) || Boolean(config[field.key]?.trim());
    return Boolean(config[field.key]?.trim());
  });
}

// §D.2 — the fix for "required does nothing": names every required, non-secret field still
// missing a value, and every required secret field not yet set in Vault. An empty array means
// the save may proceed.
export function missingRequiredFields(
  spec: PluginSpec,
  config: Record<string, string>,
  secretFieldKeys: ReadonlySet<string> = new Set()
): PluginConfigField[] {
  return spec.configFields.filter((field) => {
    if (!field.required) return false;
    if (field.secret) return !secretFieldKeys.has(field.key) && !config[field.key]?.trim();
    return !config[field.key]?.trim();
  });
}
