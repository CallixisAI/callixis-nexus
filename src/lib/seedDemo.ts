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
      await supabase.from("campaigns").upsert({
        user_id: userId,
        name: camp.name,
        status: camp.status,
        total_leads: camp.totalLeads,
        called_leads: camp.calledLeads,
        qualified_count: camp.qualifiedCount
      }, { onConflict: "user_id,name" });
    }

    console.log("Demo account successfully seeded with 6 months of active data!");
    return true;
  } catch (err) {
    console.error("Error seeding demo data:", err);
    return false;
  }
}
