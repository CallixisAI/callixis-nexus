import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type CallRecordRow = Database["public"]["Tables"]["call_records"]["Row"];

export interface Campaign {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Scheduled" | "Completed";
  calls: number;
  conversion: string;
  industry: string;
  agent: string;
  records: CallRecord[];
  workHours: { days: string[]; startTime: string; endTime: string };
  maxQualifiedLeads: number;
  qualifiedLeadsSent: number;
  crmApiEndpoint: string;
}

export interface CallRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  duration: string;
  callDate: string;
  hasRecording: boolean;
  notes: string;
  agent: string;
}

function mapCampaignWithStats(row: CampaignRow, records: CallRecordRow[]): Campaign {
  const completedCalls = records.filter(r => r.status === "completed").length;
  const totalCalls = records.length;
  const conversion = totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : "0";
  
  return {
    id: row.id,
    name: row.name,
    status: row.status === "active" ? "Active" : row.status === "scheduled" ? "Scheduled" : "Paused",
    calls: totalCalls,
    conversion: `${conversion}%`,
    industry: row.industry || "General",
    agent: "LeadGen Pro",
    records: records.map(r => ({
      id: r.id,
      name: r.contact_name || "",
      phone: r.contact_phone || "",
      email: r.contact_email || "",
      status: r.status,
      duration: r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, "0")}` : "0:00",
      callDate: r.call_date ? new Date(r.call_date).toISOString().slice(0, 16).replace("T", " ") : "—",
      hasRecording: !!r.recording_url,
      notes: r.notes || "",
      agent: "LeadGen Pro"
    })),
    workHours: (row.work_hours as any) || { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" },
    maxQualifiedLeads: row.max_qualified_leads,
    qualifiedLeadsSent: records.filter(r => r.is_qualified).length,
    crmApiEndpoint: row.crm_api_endpoint || ""
  };
}

export function useCampaigns() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: campaigns, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns', userId],
    queryFn: async () => {
      if (!userId) throw new Error("No user");
      
      console.log('[DEBUG] Fetching campaigns for user:', userId);
      
      const { data: campaignRows, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (campaignError) {
        console.error('[DEBUG] Campaign fetch error:', campaignError);
        throw campaignError;
      }
      
      console.log('[DEBUG] Found campaigns:', campaignRows?.length);

      const { data: recordRows, error: recordsError } = await supabase
        .from('call_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (recordsError) {
        console.error('[DEBUG] Records fetch error:', recordsError);
        throw recordsError;
      }
      
      console.log('[DEBUG] Found records:', recordRows?.length);

      // Group records by campaign
      const recordsByCampaign = (recordRows || []).reduce((acc, record) => {
        if (!acc[record.campaign_id]) acc[record.campaign_id] = [];
        acc[record.campaign_id].push(record);
        return acc;
      }, {} as Record<string, CallRecordRow[]>);

      return (campaignRows || []).map(row => 
        mapCampaignWithStats(row, recordsByCampaign[row.id] || [])
      );
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async (newCampaign: Partial<Campaign>) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          user_id: userId,
          name: newCampaign.name,
          status: (newCampaign.status || 'Paused').toLowerCase(),
          industry: newCampaign.industry,
          budget: newCampaign.budget || 0,
          max_qualified_leads: newCampaign.maxQualifiedLeads || 0,
          crm_api_endpoint: newCampaign.crmApiEndpoint || "",
          work_hours: newCampaign.workHours || { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" },
          start_date: new Date().toISOString()
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', userId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: Partial<Campaign> }) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.status) dbUpdates.status = updates.status.toLowerCase();
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.industry) dbUpdates.industry = updates.industry;
      if (updates.budget !== undefined) dbUpdates.budget = updates.budget;
      if (updates.maxQualifiedLeads !== undefined) dbUpdates.maxQualifiedLeads = updates.maxQualifiedLeads;
      if (updates.crmApiEndpoint !== undefined) dbUpdates.crm_api_endpoint = updates.crmApiEndpoint;
      if (updates.workHours) dbUpdates.work_hours = updates.workHours;

      const { data, error } = await supabase
        .from('campaigns')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', userId] });
    },
  });

  const addCallRecordsMutation = useMutation({
    mutationFn: async ({ campaignId, records }: { campaignId: string, records: Partial<CallRecord>[] }) => {
      console.log('[DEBUG] Adding records to campaign:', campaignId, 'count:', records.length);
      
      const recordsToInsert = records.map(r => ({
        campaign_id: campaignId,
        user_id: userId,
        contact_name: r.name,
        contact_phone: r.phone,
        contact_email: r.email,
        status: 'pending',
        notes: r.notes || ""
      }));

      const { data, error } = await supabase
        .from('call_records')
        .insert(recordsToInsert)
        .select();

      if (error) {
        console.error('[DEBUG] Insert error:', error);
        throw error;
      }
      
      console.log('[DEBUG] Inserted records:', data?.length);
      return data;
    },
    onSuccess: () => {
      console.log('[DEBUG] Refreshing campaigns query...');
      queryClient.invalidateQueries({ queryKey: ['campaigns', userId] });
      // Force an immediate refetch to be safe
      refetch();
    },
  });

  return {
    campaigns,
    isLoading,
    error,
    refetch,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
    addCallRecords: addCallRecordsMutation.mutateAsync,
  };
}