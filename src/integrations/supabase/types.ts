export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: "admin" | "affiliate" | "brand"
          user_id: string
        }
        Insert: {
          id?: string
          role: "admin" | "affiliate" | "brand"
          user_id: string
        }
        Update: {
          id?: string
          role?: "admin" | "affiliate" | "brand"
          user_id?: string
        }
        Relationships: []
      }
      ai_agents: {
        Row: {
          id: string
          user_id: string
          name: string
          status: string
          industry: string | null
          model: string
          voice: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          status?: string
          industry?: string | null
          model?: string
          voice?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          status?: string
          industry?: string | null
          model?: string
          voice?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          user_id: string
          agent_id: string | null
          name: string
          status: string
          industry: string | null
          budget: number
          max_qualified_leads: number
          crm_api_endpoint: string | null
          work_hours: Json
          start_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent_id?: string | null
          name: string
          status?: string
          industry?: string | null
          budget?: number
          max_qualified_leads?: number
          crm_api_endpoint?: string | null
          work_hours?: Json
          start_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agent_id?: string | null
          name?: string
          status?: string
          industry?: string | null
          budget?: number
          max_qualified_leads?: number
          crm_api_endpoint?: string | null
          work_hours?: Json
          start_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_records: {
        Row: {
          id: string
          campaign_id: string
          user_id: string
          contact_name: string | null
          contact_phone: string | null
          contact_email: string | null
          status: string
          duration: number
          call_date: string | null
          notes: string | null
          recording_url: string | null
          is_qualified: boolean
          revenue: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          user_id: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          status?: string
          duration?: number
          call_date?: string | null
          notes?: string | null
          recording_url?: string | null
          is_qualified?: boolean
          revenue?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          user_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          status?: string
          duration?: number
          call_date?: string | null
          notes?: string | null
          recording_url?: string | null
          is_qualified?: boolean
          revenue?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: "admin" | "affiliate" | "brand"
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "affiliate" | "brand"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
