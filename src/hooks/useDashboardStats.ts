import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardStats {
  totalCalls: number;
  activeLeads: number;
  conversion: number;
  revenue: number;
  aiAgentsCount: number;
  avgResponseTime: number;
  activeCampaignsCount: number;
}

interface CallData {
  name: string;
  calls: number;
  conversions: number;
  revenue: number;
}

interface AgentPerformance {
  name: string;
  active: number;
  leads: number;
  conversion: number;
  revenue: number;
}

interface ChannelData {
  name: string;
  value: number;
  fill: string;
}

interface LiveAgent {
  id: string;
  name: string;
  status: string;
  lead: string;
  geo: string;
  duration: string;
  campaign: string;
}

interface RecentActivity {
  icon: string;
  action: string;
  detail: string;
  time: string;
  type: "success" | "info" | "neutral";
}

export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("No user");

      // Get call records with campaign info
      const { data: callRecords, error: recordsError } = await supabase
        .from('call_records')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (recordsError) throw recordsError;

      // Get campaigns
      const { data: campaigns, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id);

      if (campaignsError) throw campaignsError;

      // Get AI agents
      const { data: agents, error: agentsError } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('user_id', user.id);

      if (agentsError) throw agentsError;

      const records = callRecords || [];
      const activeCampaigns = campaigns?.filter(c => c.status === 'active') || [];
      const activeAgents = agents?.filter(a => a.status !== 'idle') || [];

      const campaignsById = new Map((campaigns || []).map((campaign) => [campaign.id, campaign]));

      // Calculate stats
      const totalCalls = records.length;
      const completedCalls = records.filter(r => r.status === 'completed').length;
      const conversion = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
      const revenue = records.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
      const activeLeads = records.filter(r => r.is_qualified).length;

      // Last 7 days call data based on actual recent dates, not weekday buckets.
      const callData: CallData[] = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        const key = date.toISOString().slice(0, 10);
        const dayRecords = records.filter(r => r.call_date?.slice(0, 10) === key);
        return {
          name: date.toLocaleDateString('en-US', { weekday: 'short' }),
          calls: dayRecords.length,
          conversions: dayRecords.filter(r => r.status === 'completed').length,
          revenue: dayRecords.reduce((sum, r) => sum + Number(r.revenue || 0), 0)
        };
      });

      const industryMap = (campaigns || []).reduce((acc, campaign) => {
        const industry = campaign.industry || 'Other';
        if (!acc[industry]) {
          acc[industry] = { campaignIds: new Set<string>(), leads: 0, completed: 0, revenue: 0 };
        }
        acc[industry].campaignIds.add(campaign.id);
        return acc;
      }, {} as Record<string, { campaignIds: Set<string>; leads: number; completed: number; revenue: number }>);

      records.forEach((record) => {
        const campaign = campaignsById.get(record.campaign_id);
        const industry = campaign?.industry || 'Other';
        if (!industryMap[industry]) {
          industryMap[industry] = { campaignIds: new Set<string>(), leads: 0, completed: 0, revenue: 0 };
        }
        industryMap[industry].leads += 1;
        industryMap[industry].revenue += Number(record.revenue || 0);
        if (record.status === 'completed') {
          industryMap[industry].completed += 1;
        }
      });

      const agentPerformance: AgentPerformance[] = Object.entries(industryMap)
        .map(([name, data]) => ({
          name,
          active: data.campaignIds.size,
          leads: data.leads,
          conversion: data.leads > 0 ? Math.round((data.completed / data.leads) * 100) : 0,
          revenue: data.revenue,
        }))
        .sort((a, b) => b.leads - a.leads);

      // Channel data (still inferred from available app capabilities until a channel field exists)
      const channelData: ChannelData[] = [
        { name: "Voice", value: 45, fill: "hsl(170, 100%, 45%)" },
        { name: "SMS", value: 25, fill: "hsl(200, 80%, 55%)" },
        { name: "WhatsApp", value: 20, fill: "hsl(280, 70%, 60%)" },
        { name: "Email", value: 10, fill: "hsl(45, 90%, 55%)" },
      ];

      // Live agents (placeholder - would need real-time status)
      const liveAgents: LiveAgent[] = (agents || []).slice(0, 5).map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status === 'idle' ? 'idle' : 'on-call',
        lead: '—',
        geo: a.industry || 'Global',
        duration: '0:00',
        campaign: a.industry || 'Standby'
      }));

      // Recent activity (from recent call records)
      const recentActivity: RecentActivity[] = records.slice(0, 6).map(r => ({
        icon: r.status === 'completed' ? 'TrendingUp' : 'Phone',
        action: r.status === 'completed' ? 'Call completed' : 'Call updated',
        detail: `${r.contact_name || 'Unknown'} - ${r.contact_phone || 'No phone'}`,
        time: r.call_date ? `${Math.max(1, Math.floor((Date.now() - new Date(r.call_date).getTime()) / 60000))} min ago` : 'Just now',
        type: r.status === 'completed' ? 'success' : 'info'
      }));

      return {
        stats: {
          totalCalls,
          activeLeads,
          conversion,
          revenue,
          aiAgentsCount: activeAgents.length,
          avgResponseTime: 1.8,
          activeCampaignsCount: activeCampaigns.length
        } as DashboardStats,
        callData,
        agentPerformance,
        channelData,
        liveAgents,
        recentActivity
      };
    },
    enabled: !!user?.id,
  });
}
