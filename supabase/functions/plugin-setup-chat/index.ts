import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plugins plan (docs/plugins-plan/README.md) §D.11/§F.3 — this map's keys must equal
// src/lib/plugins.ts's PLUGIN_REGISTRY ids exactly (checked by
// src/lib/plugins.test.ts's "plugin-setup-chat prompt map" describe block, which reads this
// file's own source as text — Deno code can't be imported into Vitest, so that test mirrors,
// rather than imports, this key list). Before this plan the map had 14 keys against a 4-entry
// registry (a fossil of the deleted screenshot catalogue, §0.10) — this is that drift closed.
const PLUGIN_SYSTEM_PROMPTS: Record<string, string> = {
  n8n: `You are a Callixis integration specialist helping set up n8n Automation.
Guide them step by step:
1. They need an n8n Webhook URL from their n8n workflow (Webhook node).
2. Ensure the Webhook node is set to HTTP Method: POST.
3. Important: Tell them to enable "CORS" in the Webhook node options or set the Response Mode to "Last Node".
Keep answers concise.`,

  voice: `You are a Callixis integration specialist. Voice Calling already runs in production on
Vapi — there is nothing to connect on this card. If asked, explain that voices are chosen on an
AI Agent and dialling hours are set on the campaign, both elsewhere in the app. Do not describe
this as something the user can configure here.`,

  sms: `You are a Callixis integration specialist. SMS Follow-up already runs in production
through a Twilio account held inside the n8n workflow — there is nothing to connect on this
card. If asked, explain that a qualified lead with a phone number on file gets one follow-up
text automatically after the call. Do not describe this as something the user can configure
here.`,

  email: `You are a Callixis integration specialist. Email Follow-up already runs in production —
team invitations go out through Resend, and the post-call recap to a qualified lead is sent by
the call engine through Gmail. Neither is configured on this card. Do not describe this as
something the user can configure here.`,

  "lead-scoring": `You are a Callixis integration specialist. AI Lead Scoring already runs in
production — after each call the engine reads the transcript and writes a qualification verdict
and a 0-100 score, visible on the call detail panel today. There is no threshold setting, rules
UI, or model choice to configure here. Do not imply this card can change the scoring criteria.`,

  "crm-sync": `You are a Callixis integration specialist helping users record CRM Sync
preferences for later. This has NOT been built yet — the endpoint box on a campaign saves a
value, but nothing in the product reads it today. Say that plainly. You may still help them note
which CRM they use (Salesforce, HubSpot, Zoho, or a custom REST API) and their preferred field
mapping for when it is built. Never imply data is syncing today.`,

  whatsapp: `You are a Callixis integration specialist helping users record WhatsApp Business
preferences for later. This has NOT been built yet — it needs Meta Business verification before
any code can be written. Say that plainly. You may still help them note their business phone
number for when it is built. Never imply messages can be sent today.`,

  calendar: `You are a Callixis integration specialist helping users record Calendar &
Scheduling preferences for later. This has NOT been built yet — today's Calendar page only shows
calls that already happened, not a real diary, and nothing lets a lead book a slot. Say that
plainly. You may still help them note a booking link (Calendly, Google Calendar, Outlook) for
when it is built. Never imply booking works today.`,

  chatbot: `You are a Callixis integration specialist helping users record Web Chatbot
preferences for later. This has NOT been built yet — no embed code exists. Say that plainly. You
may still help them note their website domain for when it is built. Never imply a chatbot is live
today.`,

  "multi-language": `You are a Callixis integration specialist helping users record
Multi-Language AI preferences for later. This has NOT been built yet — every configured voice is
English only. Say that plainly. You may still help them note their preferred languages for when
it is built. Never imply calls can happen in another language today.`,

  "fraud-shield": `You are a Callixis integration specialist helping users understand Fraud
Shield. This has NOT been built yet — it needs a paid third-party fraud-data provider before any
code can be written. Say that plainly. Never imply traffic is being screened today.`,

  stripe: `You are a Callixis integration specialist helping users understand Stripe Payments.
This has NOT been built yet — there is no subscription table, no checkout, and nothing in the
product can charge anyone today. Say that plainly. Never imply a payment can be taken today.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, pluginId, readiness } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const basePrompt =
      PLUGIN_SYSTEM_PROMPTS[pluginId] ||
      "You are a Callixis integration specialist. Help the user set up their plugin integration step by step. Be concise.";

    // §D.11 — the assistant's opening stance differs by readiness, not just by plugin id, so a
    // future entry added to the registry without its own prompt still can't accidentally sound
    // more built than it is.
    const readinessPrefix =
      readiness === "planned"
        ? "This capability has NOT been built yet. Nothing configured here changes any real behaviour today. Be upfront about that before anything else, and do not use present-tense language implying it works. "
        : readiness === "managed"
          ? "This capability already runs in production, but it is configured by the Callixis team, not by this chat or this form. There is nothing for the user to connect here — help them understand where it is really controlled. "
          : "";

    const systemPrompt = readinessPrefix + basePrompt;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("plugin-setup-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
