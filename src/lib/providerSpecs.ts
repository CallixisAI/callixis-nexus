// Provider specs and step-by-step integration configuration definitions for Callixis AI

export interface ProviderOption {
  id: string;
  name: string;
  description: string;
  fields: {
    key: string;
    label: string;
    placeholder: string;
    type: "text" | "url" | "email" | "password";
    required: boolean;
    help?: string;
  }[];
}

export const CATEGORY_PROVIDERS: Record<string, ProviderOption[]> = {
  voips: [
    {
      id: "vapi",
      name: "Vapi AI",
      description: "Advanced voice AI platform for outbound and inbound calls.",
      fields: [
        { key: "apiKey", label: "Vapi Private API Key", placeholder: "e.g. vap_priv_...", type: "password", required: true, help: "Found in your Vapi Dashboard -> API Keys." },
        { key: "assistantId", label: "Default Assistant ID", placeholder: "e.g. 8f92b... or create new", type: "text", required: true, help: "The voice assistant ID to use for calls." }
      ]
    },
    {
      id: "retell",
      name: "Retell AI",
      description: "Ultra-low latency conversational voice agents.",
      fields: [
        { key: "apiKey", label: "Retell API Key", placeholder: "key_...", type: "password", required: true, help: "Your Retell AI API key." },
        { key: "agentId", label: "Agent ID", placeholder: "agent_...", type: "text", required: true, help: "Retell Agent ID." }
      ]
    },
    {
      id: "bland",
      name: "Bland AI",
      description: "Enterprise phone calling infrastructure and agents.",
      fields: [
        { key: "apiKey", label: "Bland AI API Key", placeholder: "sk-...", type: "password", required: true, help: "Bland AI developer key." },
        { key: "pathwayId", label: "Pathway ID (Optional)", placeholder: "Optional conversational pathway ID", type: "text", required: false }
      ]
    },
    {
      id: "twilio",
      name: "Twilio Voice",
      description: "Standard SIP/VoIP trunking and telephony.",
      fields: [
        { key: "accountSid", label: "Twilio Account SID", placeholder: "AC...", type: "text", required: true },
        { key: "authToken", label: "Twilio Auth Token", placeholder: "Auth token", type: "password", required: true },
        { key: "phoneNumber", label: "Twilio Phone Number", placeholder: "+15551234567", type: "text", required: true }
      ]
    }
  ],
  emails: [
    {
      id: "resend",
      name: "Resend",
      description: "Developer-first email API for transactional emails.",
      fields: [
        { key: "apiKey", label: "Resend API Key", placeholder: "re_...", type: "password", required: true },
        { key: "fromEmail", label: "Sender Email Address", placeholder: "noreply@yourdomain.com", type: "email", required: true }
      ]
    },
    {
      id: "sendgrid",
      name: "SendGrid",
      description: "Cloud-based SMTP email delivery service.",
      fields: [
        { key: "apiKey", label: "SendGrid API Key", placeholder: "SG...", type: "password", required: true },
        { key: "fromEmail", label: "Sender Email", placeholder: "admin@yourdomain.com", type: "email", required: true }
      ]
    },
    {
      id: "gmail",
      name: "Google Gmail SMTP",
      description: "Send post-call summaries via Gmail account.",
      fields: [
        { key: "email", label: "Gmail Address", placeholder: "you@gmail.com", type: "email", required: true },
        { key: "appPassword", label: "Google App Password", placeholder: "16-digit app password", type: "password", required: true, help: "Generate from Google Account Security -> App Passwords." }
      ]
    }
  ],
  calendar: [
    {
      id: "google-calendar",
      name: "Google Calendar",
      description: "Sync AI agent appointment bookings directly to Google Calendar.",
      fields: [
        { key: "clientId", label: "Google OAuth Client ID", placeholder: "...apps.googleusercontent.com", type: "text", required: true },
        { key: "clientSecret", label: "Google Client Secret", placeholder: "GOCSPX-...", type: "password", required: true }
      ]
    },
    {
      id: "calendly",
      name: "Calendly",
      description: "Automated scheduling link integration for qualified leads.",
      fields: [
        { key: "apiKey", label: "Calendly Personal Access Token", placeholder: "eyJ...", type: "password", required: true },
        { key: "schedulingUrl", label: "Booking Link URL", placeholder: "https://calendly.com/yourname/call", type: "url", required: true }
      ]
    }
  ],
  sms: [
    {
      id: "twilio-sms",
      name: "Twilio SMS",
      description: "Automated post-call SMS follow-ups and text campaigns.",
      fields: [
        { key: "accountSid", label: "Twilio Account SID", placeholder: "AC...", type: "text", required: true },
        { key: "authToken", label: "Twilio Auth Token", placeholder: "Token...", type: "password", required: true },
        { key: "phoneNumber", label: "Sender Phone Number / Shortcode", placeholder: "+15551234567", type: "text", required: true }
      ]
    },
    {
      id: "vonage",
      name: "Vonage (Nexmo)",
      description: "Global SMS and messaging API gateway.",
      fields: [
        { key: "apiKey", label: "Vonage API Key", placeholder: "ApiKey", type: "text", required: true },
        { key: "apiSecret", label: "Vonage API Secret", placeholder: "ApiSecret", type: "password", required: true }
      ]
    }
  ],
  whatsapp: [
    {
      id: "whatsapp-cloud",
      name: "WhatsApp Cloud API (Meta)",
      description: "Official Meta WhatsApp Business API integration.",
      fields: [
        { key: "accessToken", label: "Permanent Access Token", placeholder: "EAAB...", type: "password", required: true },
        { key: "phoneNumberId", label: "Phone Number ID", placeholder: "100234...", type: "text", required: true },
        { key: "wabaId", label: "WhatsApp Business Account ID", placeholder: "200341...", type: "text", required: true }
      ]
    },
    {
      id: "twilio-whatsapp",
      name: "Twilio WhatsApp Sandbox",
      description: "Send and receive WhatsApp messages via Twilio.",
      fields: [
        { key: "accountSid", label: "Twilio Account SID", placeholder: "AC...", type: "text", required: true },
        { key: "authToken", label: "Twilio Auth Token", placeholder: "Token...", type: "password", required: true }
      ]
    }
  ]
};
