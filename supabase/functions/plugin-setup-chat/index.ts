import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLUGIN_SYSTEM_PROMPTS: Record<string, string> = {
  n8n: `You are a Callixis integration specialist helping set up n8n Automation.
Guide them step by step:
1. They need an n8n Webhook URL from their n8n workflow (Webhook node).
2. Ensure the Webhook node is set to HTTP Method: POST.
3. Important: Tell them to enable "CORS" in the Webhook node options or set the Response Mode to "Last Node".
Keep answers concise.`,

  twilio: `You are a Callixis integration specialist helping users set up Twilio integration.
Guide them step by step:
1. They need a Twilio Account SID and Auth Token from https://console.twilio.com
2. They need a Twilio phone number for outbound calls and SMS.
Keep answers concise.`,

  stripe: `You are a Callixis integration specialist helping users set up Stripe Payments.
Guide them step by step:
1. They need their Stripe Publishable Key and Secret Key from the Stripe Dashboard > Developers > API Keys.
2. Recommend using Test Keys first.
Keep answers concise.`,

  sendgrid: `You are a Callixis integration specialist helping users set up SendGrid Email.
Guide them step by step:
1. They need a SendGrid API Key from their settings.
2. They must verify a sender identity.
Keep answers concise.`,

  voip: `You are a Callixis integration specialist helping users set up VoIP (Twilio) integration.
Guide them step by step:
1. They need a Twilio Account SID and Auth Token from https://console.twilio.com
2. They need a Twilio phone number for outbound calls
3. Optionally a SIP domain for advanced routing
Keep answers concise (2-3 sentences max). If they paste credentials, confirm and move to the next step.
Never display or repeat full credentials back. Just confirm you received them.`,

  sms: `You are a Callixis integration specialist helping users set up SMS Gateway (Twilio) integration.
Guide them step by step:
1. They need a Twilio Account SID and Auth Token from https://console.twilio.com
2. They need a Twilio phone number enabled for SMS
3. Optionally configure a messaging service SID for high-volume sending
Keep answers concise. If they paste credentials, confirm and move to the next step.`,

  whatsapp: `You are a Callixis integration specialist helping users set up WhatsApp Business (Meta) integration.
Guide them step by step:
1. They need a Meta Business account and WhatsApp Business API access from https://business.facebook.com
2. They need a WhatsApp Business Phone Number ID and API Token
3. They need to verify their business and get approved message templates
Keep answers concise. If they paste credentials, confirm and move to the next step.`,

  email: `You are a Callixis integration specialist helping users set up Email Campaigns (SendGrid) integration.
Guide them step by step:
1. They need a SendGrid API Key from https://app.sendgrid.com/settings/api_keys
2. They need to verify a sender identity (email or domain)
3. Optionally set up a dedicated IP for better deliverability
Keep answers concise. If they paste credentials, confirm and move to the next step.`,

  "crm-sync": `You are a Callixis integration specialist helping users set up CRM Sync integration.
Guide them step by step:
1. Ask which CRM they use (Salesforce, HubSpot, Zoho, or Custom REST API)
2. For Salesforce: they need a Connected App with OAuth credentials from Setup > App Manager
3. For HubSpot: they need a Private App access token from Settings > Integrations > Private Apps
4. For Zoho: they need a self-client OAuth token from the Zoho API Console
5. Help them configure field mapping and sync interval
Keep answers concise (2-3 sentences max). If they paste credentials, confirm and move to the next step.
Never display or repeat full credentials back.`,

  "lead-scoring": `You are a Callixis integration specialist helping configure AI Lead Scoring.
Guide them step by step:
1. They need to connect their CRM (Salesforce, HubSpot, or custom) — ask which one
2. They need to provide their CRM API key or OAuth credentials
3. Help them define scoring criteria: industry, budget range, engagement thresholds
Keep answers concise. This is a Callixis-native plugin so setup is simpler.`,

  "fraud-shield": `You are a Callixis integration specialist helping configure Fraud Shield.
Guide them step by step:
1. Ask about their traffic sources to customize fraud rules
2. Help them set sensitivity levels (low/medium/high)
3. Optionally connect IP intelligence providers (MaxMind, IPQualityScore)
Keep answers concise. This is mostly a Callixis-native plugin with optional external integrations.`,

  "multi-language": `You are a Callixis integration specialist helping configure Multi-Language AI.
Guide them step by step:
1. Ask which languages they need for their campaigns
2. Help them set up language detection preferences (auto vs manual)
3. Configure voice synthesis preferences per language
Keep answers concise. This is a Callixis-native plugin.`,

  chatbot: `You are a Callixis integration specialist helping set up Web Chatbot integration.
Guide them step by step:
1. They need to provide their website URL where the chatbot will be embedded
2. Help them customize branding (colors, logo, greeting message)
3. Configure lead qualification questions and appointment booking settings
4. They'll receive an embed code snippet to add to their website
Keep answers concise.`,
  calendar: `You are a Callixis integration specialist helping users set up Calendar & Scheduling integration.
Guide them step by step:
1. Ask which calendar provider they use (Calendly, Google Calendar, or Outlook)
2. For Calendly: they need a Personal Access Token from https://developer.calendly.com/personal-access-tokens
3. For Google Calendar: they need OAuth credentials or a service account from Google Cloud Console
4. For Outlook: they need a Microsoft Graph API token from the Azure portal
5. Help them set up a default event type URL and timezone
Keep answers concise (2-3 sentences max). If they paste credentials, confirm and move to the next step.
Never display or repeat full credentials back.`,
};
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, pluginId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt =
      PLUGIN_SYSTEM_PROMPTS[pluginId] ||
      "You are a Callixis integration specialist. Help the user set up their plugin integration step by step. Be concise.";

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
