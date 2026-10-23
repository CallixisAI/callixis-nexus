import { DEMO_CAMPAIGNS, DEMO_AGENTS } from "./demoData";

export function isDemoModeActive(): boolean {
  return localStorage.getItem("callixis_demo_mode") === "true";
}

export function getDemoAccountData() {
  const mockCampaigns = DEMO_CAMPAIGNS.map((c, idx) => ({
    id: `demo-camp-${idx + 1}`,
    user_id: "demo-user",
    agent_id: `demo-agent-${(idx % 2) + 1}`,
    name: c.name,
    status: c.status,
    total_leads: c.totalLeads,
    called_leads: c.calledLeads,
    qualified_count: c.qualifiedCount,
    created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }));

  const mockAgents = DEMO_AGENTS.map((a, idx) => ({
    id: `demo-agent-${idx + 1}`,
    user_id: "demo-user",
    name: a.name,
    status: a.status,
    industry: "Affiliate Marketing",
    model: "gpt-4o",
    voice: a.voice,
    logic_prompt: a.prompt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const mockLeads = Array.from({ length: 120 }, (_, idx) => ({
    id: `demo-lead-${idx + 1}`,
    campaign_id: mockCampaigns[idx % mockCampaigns.length].id,
    user_id: "demo-user",
    phone: `+1 (555) ${String(100 + idx).padStart(3, "0")}-${String(1000 + idx * 7).padStart(4, "0")}`,
    first_name: "Affiliate",
    last_name: `Partner ${idx + 1}`,
    email: `partner${idx + 1}@affiliatenetwork.com`,
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
    outcome: idx % 3 === 0 ? "Qualified - High Volume" : "Callback Requested"
  }));

  const mockCallRecords = Array.from({ length: 350 }, (_, idx) => ({
    id: `demo-call-${idx + 1}`,
    campaign_id: mockCampaigns[idx % mockCampaigns.length].id,
    lead_id: mockLeads[idx % mockLeads.length].id,
    user_id: "demo-user",
    status: idx % 4 === 0 ? "no-answer" : "completed",
    duration: Math.floor(60 + Math.random() * 240),
    revenue: idx % 3 === 0 ? 450.00 : 120.00,
    lead_score: Math.floor(70 + Math.random() * 30),
    recording_url: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
    transcript: JSON.stringify([
      { speaker: "AI", text: `Hello Partner, calling from Comodo 100 CRM regarding your Q4 traffic.` },
      { speaker: "Lead", text: "Hey! We are scaling our native campaigns right now and looking for weekly payouts." },
      { speaker: "AI", text: "That is fantastic. Let's get your postback setup completed today." }
    ]),
    call_date: new Date(Date.now() - (180 - idx) * 12 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - (180 - idx) * 12 * 3600 * 1000).toISOString(),
    contact_name: `Affiliate Partner ${idx + 1}`,
    contact_email: `partner${idx + 1}@affiliatenetwork.com`,
    ended_reason: "completed",
    disqual_reason: null,
    needs_review: false,
    transcript_messages: [],
    notes: "Automated test call successful."
  }));

  return {
    campaigns: mockCampaigns,
    leads: mockLeads,
    callRecords: mockCallRecords,
    agents: mockAgents
  };
}
