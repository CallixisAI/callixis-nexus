import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCampaigns() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("No user");
      
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Map DB schema to frontend types
      return (data || []).map(row => ({
        id: row.id,
        name: row.name,
        status: row.status === 'active' ? 'Active' : (row.status === 'scheduled' ? 'Scheduled' : 'Paused'),
        calls: 0, // Mock for now until call_logs relation is built
        conversion: "—",
        industry: "General", // Placeholder
        agent: "LeadGen Pro", // Placeholder
        records: [], // Placeholder until call_logs read is added
        workHours: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00" }, // Mock
        maxQualifiedLeads: 0,
        qualifiedLeadsSent: 0,
        crmApiEndpoint: ""
      }));
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (newCampaign: any) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          user_id: user?.id,
          name: newCampaign.name,
          status: newCampaign.status.toLowerCase(),
          budget: 0, // Add to form later
          start_date: new Date().toISOString()
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', user?.id] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: any }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update({ status: updates.status?.toLowerCase() })
        .eq('id', id)
        .eq('user_id', user?.id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', user?.id] });
    },
  });

  return {
    campaigns,
    isLoading,
    error,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
  };
}
