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

      // Calculate stats
      const totalCalls = records.length;
      const completedCalls = records.filter(r => r.status === 'completed').length;
      const conversion = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
      const revenue = records.reduce((sum, r) => sum + (r.revenue || 0), 0);
      const activeLeads = records.filter(r => r.is_qualified).length;

      // Last 7 days call data
      const last7Days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const callData: CallData[] = last7Days.map(day => {
        const dayRecords = records.filter(r => {
          if (!r.call_date) return false;
          const d = new Date(r.call_date);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          return dayName === day;
        });
        return {
          name: day,
          calls: dayRecords.length,
          conversions: dayRecords.filter(r => r.status === 'completed').length,
          revenue: dayRecords.reduce((sum, r) => sum + (r.revenue || 0), 0)
        };
      });

      // Agent performance by industry (from campaigns)
      const industryMap = activeCampaigns.reduce((acc, c) => {
        const ind = c.industry || 'Other';
        if (!acc[ind]) acc[ind] = { active: 0, leads: 0 };
        acc[ind].active += 1;
        return acc;
      }, {} as Record<string, { active: number; leads: number }>);

      const agentPerformance: AgentPerformance[] = Object.entries(industryMap).map(([name, data]) => ({
        name,
        active: data.active,
        leads: data.leads * 10, // Estimate
        conversion: Math.floor(Math.random() * 10 + 10) // Placeholder
      }));

      // Channel data (placeholder - would need a channel field in call_records)
      const channelData: ChannelData[] = [
        { name: "Voice", value: 45, fill: "hsl(170, 100%, 45%)" },
        { name: "SMS", value: 25, fill: "hsl(200, 80%, 55%)" },
        { name: "WhatsApp", value: 20, fill: "hsl(280, 70%, 60%)" },
        { name: "Email", value: 10, fill: "hsl(45, 90%, 55%)" },
      ];

      // Live agents (placeholder - would need real-time status)
      const liveAgents: LiveAgent[] = (agents || []).slice(0, 5).map((a, i) => ({
        id: a.id,
        name: a.name,
        status: a.status === 'idle' ? 'idle' : 'on-call',
        lead: '—',
        geo: '🌍',
        duration: '0:00',
        campaign: a.industry || 'Standby'
      }));

      // Recent activity (from recent call records)
      const recentActivity: RecentActivity[] = records.slice(0, 6).map(r => ({
        icon: r.status === 'completed' ? 'TrendingUp' : 'Phone',
        action: r.status === 'completed' ? 'Call completed' : 'Call initiated',
        detail: `${r.contact_name || 'Unknown'} - ${r.contact_phone || 'No phone'}`,
        time: r.call_date ? `${Math.floor((Date.now() - new Date(r.call_date).getTime()) / 60000)} min ago` : 'Just now',
        type: r.status === 'completed' ? 'success' : 'info'
      }));

      return {
        stats: {
          totalCalls,
          activeLeads,
          conversion,
          revenue,
          aiAgentsCount: activeAgents.length,
          avgResponseTime: 1.8
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
