import { supabase } from "@/integrations/supabase/client";
import { DEMO_CAMPAIGNS, DEMO_AGENTS, DEMO_CALL_RECORDS } from "./demoData";

export async function seedDemoAccount(userId: string) {
  try {
    // 1. Insert Demo AI Agents
    for (const agent of DEMO_AGENTS) {
      await supabase.from("ai_agents").upsert({
        user_id: userId,
        name: agent.name,
        role: agent.role,
        voice: agent.voice,
        status: agent.status,
        prompt: agent.prompt
      }, { onConflict: "user_id,name" });
    }

    // 2. Insert Demo Campaigns
    for (const camp of DEMO_CAMPAIGNS) {
      const { data: campaignRow } = await supabase.from("campaigns").upsert({
        user_id: userId,
        name: camp.name,
        status: camp.status,
        total_leads: camp.totalLeads,
        called_leads: camp.calledLeads,
        qualified_count: camp.qualifiedCount
      }, { onConflict: "user_id,name" }).select("id").single();

      // 3. Insert Demo Leads and Call Records for each campaign
      const campaignId = campaignRow?.id;
      if (campaignId) {
        for (let i = 1; i <= 25; i++) {
          const leadName = `Affiliate Partner ${i} (Demo)`;
          const phone = `+1 (555) ${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
          const email = `partner${i}@affiliatenetwork.com`;
          
          const { data: leadRow } = await supabase.from("leads").upsert({
            user_id: userId,
            campaign_id: campaignId,
            name: leadName,
            phone: phone,
            email: email,
            status: i % 3 === 0 ? "qualified" : i % 2 === 0 ? "called" : "queued",
            browser: "Chrome",
            ip_address: "192.168.1.10",
            country: "United States",
            city: "Miami"
          }, { onConflict: "user_id,phone" }).select("id").single();

          // Add a call record
          if (leadRow?.id) {
            await supabase.from("call_records").upsert({
              user_id: userId,
              campaign_id: campaignId,
              lead_id: leadRow.id,
              status: i % 3 === 0 ? "completed" : "no-answer",
              duration_seconds: Math.floor(60 + Math.random() * 240),
              transcript: JSON.stringify([
                { speaker: "AI", text: `Hello ${leadName}, calling from Comodo 100 regarding your Q4 traffic volume.` },
                { speaker: "Lead", text: "Hey! We are scaling our native campaigns and interested in weekly payouts." },
                { speaker: "AI", text: "That is fantastic. Let's get your postback setup completed today." }
              ])
            }, { onConflict: "user_id,lead_id" });
          }
        }
      }
    }

    console.log("Demo account successfully seeded with full leads and call records!");
    return true;
  } catch (err) {
    console.error("Error seeding demo data:", err);
    return false;
  }
}
