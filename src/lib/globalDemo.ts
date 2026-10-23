import { DEMO_AGENTS } from "./demoData";

export function isDemoModeActive(): boolean {
  return localStorage.getItem("callixis_demo_mode") === "true";
}

const REAL_NAMES = [
  "Alexander Wright", "Victoria Sterling", "Dominic Vance", "Sophia Montgomery",
  "Nathaniel Cross", "Isabella Kensington", "Marcus Sterling", "Gabriella Thorne",
  "Harrison Drake", "Savannah Hayes", "Julian Sinclair", "Penelope Vance",
  "Sebastian Cole", "Audrey Sinclair", "Christian Knight", "Liliana Brooks",
  "Elijah Hayes", "Stella Montgomery", "Adrian Cole", "Vivian Thorne",
  "Lucas Vance", "Nora Kensington", "Caleb Sterling", "Elena Cross",
  "Owen Drake", "Maya Sinclair", "Isaac Knight", "Clara Hayes",
  "Lincoln Brooks", "Hazel Thorne", "Connor Wright", "Violet Sterling"
];

const INDUSTRIES = [
  {
    name: "Affiliate Traffic & Media Buying",
    campaign: "Q4 High-Volume Affiliate Qualification",
    transcripts: [
      [
        { speaker: "AI", text: "Hello Alexander, this is Sarah from Comodo 100 calling regarding your Q4 media buying volume." },
        { speaker: "Lead", text: "Hey Sarah! Yeah, we're currently pushing about 2,000 conversions a day on native channels." },
        { speaker: "AI", text: "That's exceptional volume. We have exclusive payouts ready for top-tier affiliate partners. Let's lock in your postback URLs." }
      ],
      [
        { speaker: "AI", text: "Hi Victoria, calling from Comodo 100." },
        { speaker: "Lead", text: "Hi! We run a financial sweepstakes email list. Are you guys capping payouts?" },
        { speaker: "AI", text: "No caps on qualified traffic for verified publishers. Let's schedule your onboarding." }
      ]
    ]
  },
  {
    name: "Crypto & Web3 Liquidity",
    campaign: "Web3 Liquidity Partner Outreach",
    transcripts: [
      [
        { speaker: "AI", text: "Hello Dominic, David here with Comodo 100 Web3 desk. Calling about your market maker liquidity setup." },
        { speaker: "Lead", text: "Hey David. We're scaling our DEX liquidity pools and looking for institutional volume partners." },
        { speaker: "AI", text: "We specialize in automated routing and weekly stablecoin settlements. Let's connect you with our lead trader." }
      ],
      [
        { speaker: "AI", text: "Hi Sophia, calling regarding the Web3 partnership program." },
        { speaker: "Lead", text: "Yes! We just launched our new staking protocol." },
        { speaker: "AI", text: "Perfect timing. Our affiliate network has 15,000 active crypto investors ready for deployment." }
      ]
    ]
  },
  {
    name: "SaaS & B2B Enterprise Software",
    campaign: "Enterprise B2B Software Demo Booking",
    transcripts: [
      [
        { speaker: "AI", text: "Hello Nathaniel, Emma calling from Comodo 100 Enterprise division. Do you have a moment?" },
        { speaker: "Lead", text: "Hi Emma. We're currently evaluating AI voice CRM tools for our sales floor." },
        { speaker: "AI", text: "That's our core specialty. Our outbound agents integrate directly with your CRM via webhooks. Let's book a live demo." }
      ],
      [
        { speaker: "AI", text: "Hi Isabella, following up on your inquiry for automated lead routing." },
        { speaker: "Lead", text: "Yes, we need something that handles instant lead qualification before hitting our reps." },
        { speaker: "AI", text: "Our AI qualifies leads in under 2 minutes and syncs directly to your calendar. Let's get you set up." }
      ]
    ]
  }
];

export function getDemoAccountData() {
  const mockCampaigns = INDUSTRIES.map((ind, idx) => ({
    id: `demo-camp-${idx + 1}`,
    user_id: "demo-user",
    agent_id: `demo-agent-${idx + 1}`,
    name: ind.campaign,
    status: "active" as const,
    total_leads: 3500 + idx * 1200,
    called_leads: 3100 + idx * 1100,
    qualified_count: 1450 + idx * 450,
    created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }));

  const mockAgents = DEMO_AGENTS.map((a, idx) => ({
    id: `demo-agent-${idx + 1}`,
    user_id: "demo-user",
    name: a.name,
    status: a.status,
    industry: INDUSTRIES[idx % INDUSTRIES.length].name,
    model: "gpt-4o",
    voice: a.voice,
    logic_prompt: a.prompt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const mockLeads = REAL_NAMES.map((fullName, idx) => {
    const [firstName, ...lastNameParts] = fullName.split(" ");
    const lastName = lastNameParts.join(" ");
    const indIndex = idx % INDUSTRIES.length;
    return {
      id: `demo-lead-${idx + 1}`,
      campaign_id: mockCampaigns[indIndex].id,
      user_id: "demo-user",
      phone: `+1 (555) ${String(200 + idx * 17).slice(-3)}-${String(1000 + idx * 133).slice(-4)}`,
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@enterprise-domain.com`,
      status: idx % 3 === 0 ? "qualified" : idx % 2 === 0 ? "called" : "queued",
      browser: "Chrome",
      ip_address: `192.168.1.${(idx % 250) + 1}`,
      country: "United States",
      city: idx % 2 === 0 ? "Miami" : "New York",
      do_not_call: false,
      retry_count: 0,
      created_at: new Date(Date.now() - (180 - idx) * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      last_called_at: new Date(Date.now() - idx * 3600 * 1000).toISOString(),
      next_call_at: null,
      outcome: idx % 3 === 0 ? "Qualified - High Intent" : "Callback Scheduled"
    };
  });

  const mockCallRecords = mockLeads.map((lead, idx) => {
    const indIndex = idx % INDUSTRIES.length;
    const transcriptSample = INDUSTRIES[indIndex].transcripts[idx % INDUSTRIES[indIndex].transcripts.length];
    return {
      id: `demo-call-${idx + 1}`,
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      user_id: "demo-user",
      status: idx % 4 === 0 ? "no-answer" : "completed",
      duration: Math.floor(90 + Math.random() * 210),
      revenue: 0, // No revenue as requested
      lead_score: Math.floor(80 + Math.random() * 20),
      recording_url: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
      transcript: JSON.stringify(transcriptSample),
      call_date: new Date(Date.now() - idx * 6 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - idx * 6 * 3600 * 1000).toISOString(),
      contact_name: `${lead.first_name} ${lead.last_name}`,
      contact_email: lead.email,
      ended_reason: "completed",
      disqual_reason: null,
      needs_review: false,
      transcript_messages: [],
      notes: "Demo verified conversation."
    };
  });

  return {
    campaigns: mockCampaigns,
    leads: mockLeads,
    callRecords: mockCallRecords,
    agents: mockAgents
  };
}
