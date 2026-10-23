// Demo mode unified mock data to power Dashboard, Campaigns, AI Agents, Plugins, and Call Center seamlessly.

export interface DemoCampaign {
  id: string;
  name: string;
  status: "active" | "completed" | "paused";
  totalLeads: number;
  calledLeads: number;
  qualifiedCount: number;
  conversionRate: string;
  assistantName: string;
}

export interface DemoAgent {
  id: string;
  name: string;
  role: string;
  voice: string;
  status: string;
  totalCalls: number;
  successRate: string;
  prompt: string;
}

export interface DemoCallRecord {
  id: string;
  leadName: string;
  phone: string;
  campaign: string;
  agentName: string;
  duration: string;
  status: "completed" | "no-answer" | "failed" | "qualified";
  sentiment: "Positive" | "Neutral" | "Interested";
  transcript: { speaker: "AI" | "Lead"; text: string }[];
  date: string;
}

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: "camp-1",
    name: "Q4 Affiliate Lead Qualification",
    status: "active",
    totalLeads: 1000,
    calledLeads: 850,
    qualifiedCount: 264,
    conversionRate: "31.0%",
    assistantName: "Sarah - Affiliate Qualifier"
  },
  {
    id: "camp-2",
    name: "High-Intent VIP Follow-up",
    status: "active",
    totalLeads: 150,
    calledLeads: 120,
    qualifiedCount: 82,
    conversionRate: "68.3%",
    assistantName: "David - VIP Account Closer"
  },
  {
    id: "camp-3",
    name: "Affiliate Network Re-engagement Blast",
    status: "completed",
    totalLeads: 500,
    calledLeads: 500,
    qualifiedCount: 145,
    conversionRate: "29.0%",
    assistantName: "Sarah - Affiliate Qualifier"
  }
];

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "agent-1",
    name: "Sarah - Affiliate Qualifier",
    role: "Lead Qualification & Intake",
    voice: "Vapi - Rachel (Natural Female)",
    status: "Active / Dialing",
    totalCalls: 620,
    successRate: "32.4%",
    prompt: "You are Sarah, a professional affiliate network intake specialist for Comodo 100. Friendly, direct, and focused on verifying traffic sources and payout details."
  },
  {
    id: "agent-2",
    name: "David - VIP Account Closer",
    role: "High-Ticket Closing & Scheduling",
    voice: "Vapi - Adam (Professional Male)",
    status: "Active / Standby",
    totalCalls: 350,
    successRate: "65.1%",
    prompt: "You are David, senior account director at Comodo 100. Speak with confidence, authority, and assist high-volume media buyers with custom payout structures."
  },
  {
    id: "agent-3",
    name: "Emma - Support & FAQ",
    role: "Post-Call & Webhook Assistant",
    voice: "Vapi - Elli (Helpful Female)",
    status: "Standby",
    totalCalls: 180,
    successRate: "45.0%",
    prompt: "You are Emma, customer success lead. Assist affiliates with tracking pixels, postback URLs, and payout schedules."
  }
];

export const DEMO_CALL_RECORDS: DemoCallRecord[] = [
  {
    id: "call-101",
    leadName: "Marcus Vance",
    phone: "+1 (555) 382-9102",
    campaign: "High-Intent VIP Follow-up",
    agentName: "David - VIP Account Closer",
    duration: "3m 42s",
    status: "qualified",
    sentiment: "Positive",
    date: "10 mins ago",
    transcript: [
      { speaker: "AI", text: "Hello Marcus, this is David calling from Comodo 100. I saw you submitted your media buying stats on our portal. Do you have a quick moment?" },
      { speaker: "Lead", text: "Hey David, yeah absolutely. We are scaling our native traffic right now and looking for weekly payouts." },
      { speaker: "AI", text: "We specialize in weekly payouts for qualified partners doing over $10k monthly spend. Let's get your postback URLs hooked up right away." }
    ]
  },
  {
    id: "call-102",
    leadName: "Jessica Alpert",
    phone: "+1 (555) 491-8823",
    campaign: "Q4 Affiliate Lead Qualification",
    agentName: "Sarah - Affiliate Qualifier",
    duration: "2m 15s",
    status: "completed",
    sentiment: "Interested",
    date: "28 mins ago",
    transcript: [
      { speaker: "AI", text: "Hi Jessica, Sarah here with Comodo 100 CRM. Calling regarding your affiliate network application." },
      { speaker: "Lead", text: "Hi Sarah! Yes, I run a financial offers email list with about 50k subscribers." },
      { speaker: "AI", text: "That is a perfect fit for our top-tier finance offers. Let me schedule a quick onboarding call with our account team." }
    ]
  },
  {
    id: "call-103",
    leadName: "Brandon Cole",
    phone: "+1 (555) 902-1144",
    campaign: "Q4 Affiliate Lead Qualification",
    agentName: "Sarah - Affiliate Qualifier",
    duration: "1m 05s",
    status: "completed",
    sentiment: "Neutral",
    date: "1 hour ago",
    transcript: [
      { speaker: "AI", text: "Hello Brandon, calling from Comodo 100." },
      { speaker: "Lead", text: "Can you call me back tomorrow afternoon? I am in a meeting right now." },
      { speaker: "AI", text: "Not a problem at all Brandon! I will set a follow-up callback for tomorrow at 2 PM. Have a great day!" }
    ]
  }
];

export const DEMO_DASHBOARD_STATS = {
  totalCalls: 1470,
  activeLeads: 1150,
  conversion: "34.8%",
  revenue: "$142,800",
  aiAgentsCount: 3,
  activeCampaignsCount: 2,
  connectRate: "78.2%"
};
