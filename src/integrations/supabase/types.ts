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
          // Phase 4 (20260814000000_invite_activation.sql) — [E12]'s actual fix: the invite
          // dialog always collected this, it had nowhere on the user's own record to land.
          // Written once by activate-invite/index.ts, right after handle_new_user() creates
          // the row. Not the same thing as Phase 6's planned profiles.status — see that
          // migration's own header for why the two didn't land together.
          phone: string | null
          updated_at: string
          // Phase 6 (20260827000000_user_lifecycle.sql §A) — five states:
          // invited/active/frozen/blocked/removed. See that migration's own header for why a
          // profiles row is never actually seen at 'invited' given Phase 4's architecture.
          status: string
          status_reason: string | null
          frozen_until: string | null
          status_changed_at: string | null
          status_changed_by: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          status?: string
          status_reason?: string | null
          frozen_until?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          status?: string
          status_reason?: string | null
          frozen_until?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          // Phase 1 (20260812000000_roles_as_data.sql): was the "admin"|"affiliate"|"brand"
          // app_role enum; now free TEXT referencing roles.key (roles became data). Kept as
          // plain string rather than a literal union of the 8 seeded keys on purpose --
          // roles.key is meant to grow via Phase 3's UI without a types.ts edit each time.
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          id: string
          user_id: string
          permission_key: string
          // Phase 1: 'allow' (default, matches every pre-existing row's meaning) or 'deny' --
          // deny beats allow beats role, see get_my_permissions() in the same migration.
          effect: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          permission_key: string
          effect?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          permission_key?: string
          effect?: string
          created_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          key: string
          label: string
          description: string | null
          is_system: boolean
          is_super: boolean
          rank: number
          created_at: string
        }
        Insert: {
          key: string
          label: string
          description?: string | null
          is_system?: boolean
          is_super?: boolean
          rank?: number
          created_at?: string
        }
        Update: {
          key?: string
          label?: string
          description?: string | null
          is_system?: boolean
          is_super?: boolean
          rank?: number
          created_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          key: string
          label: string
          category: string
          feature_group: string | null
          sensitivity: string
          route: string | null
          sort_order: number
        }
        Insert: {
          key: string
          label: string
          category?: string
          feature_group?: string | null
          sensitivity?: string
          route?: string | null
          sort_order?: number
        }
        Update: {
          key?: string
          label?: string
          category?: string
          feature_group?: string | null
          sensitivity?: string
          route?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role_key: string
          permission_key: string
          level: string
        }
        Insert: {
          role_key: string
          permission_key: string
          level?: string
        }
        Update: {
          role_key?: string
          permission_key?: string
          level?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          id: string
          email: string
          full_name: string
          phone: string | null
          role: string
          permissions: string[]
          status: string
          created_at: string | null
          // Phase 4 (20260814000000_invite_activation.sql §C) — hashes only, never the
          // plaintext token/code (§D: a readable value here would turn the /admin table into
          // a set of account keys). Generated and compared in
          // supabase/functions/activate-invite/index.ts, never read by the browser.
          token_hash: string | null
          code_hash: string | null
          expires_at: string | null
          attempt_count: number
          accepted_at: string | null
          invited_by: string | null
        }
        Insert: {
          id?: string
          email: string
          full_name: string
          phone?: string | null
          role: string
          permissions: string[]
          status?: string
          created_at?: string | null
          token_hash?: string | null
          code_hash?: string | null
          expires_at?: string | null
          attempt_count?: number
          accepted_at?: string | null
          invited_by?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          phone?: string | null
          role?: string
          permissions?: string[]
          status?: string
          created_at?: string | null
          token_hash?: string | null
          code_hash?: string | null
          expires_at?: string | null
          attempt_count?: number
          accepted_at?: string | null
          invited_by?: string | null
        }
        Relationships: []
      }
      user_plugins: {
        Row: {
          id: string
          user_id: string
          plugin_id: string
          status: string
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plugin_id: string
          status?: string
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plugin_id?: string
          status?: string
          config?: Json | null
          created_at?: string
          updated_at?: string
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
          logic_provider: string | null
          script: string | null
          voice_settings: Json | null
          vapi_assistant_id: string | null
          prompt_instructions: string | null
          welcome_message: string | null
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
          logic_provider?: string | null
          script?: string | null
          voice_settings?: Json | null
          vapi_assistant_id?: string | null
          prompt_instructions?: string | null
          welcome_message?: string | null
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
          logic_provider?: string | null
          script?: string | null
          voice_settings?: Json | null
          vapi_assistant_id?: string | null
          prompt_instructions?: string | null
          welcome_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      industry_assistants: {
        Row: {
          industry: string
          vapi_assistant_id: string
          label: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          industry: string
          vapi_assistant_id: string
          label?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          industry?: string
          vapi_assistant_id?: string
          label?: string | null
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
          timezone: string
          daily_call_cap: number
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
          timezone?: string
          daily_call_cap?: number
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
          timezone?: string
          daily_call_cap?: number
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
          lead_id: string | null
          vapi_call_id: string | null
          ended_reason: string | null
          lead_score: number | null
          transcript: string | null
          cost: number | null
          disqual_reason: string | null
          needs_review: boolean
          reviewed_by: string | null
          reviewed_at: string | null
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
          lead_id?: string | null
          vapi_call_id?: string | null
          ended_reason?: string | null
          lead_score?: number | null
          transcript?: string | null
          cost?: number | null
          disqual_reason?: string | null
          needs_review?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
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
          lead_id?: string | null
          vapi_call_id?: string | null
          ended_reason?: string | null
          lead_score?: number | null
          transcript?: string | null
          cost?: number | null
          disqual_reason?: string | null
          needs_review?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          user_id: string
          campaign_id: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string
          country: string | null
          source: string | null
          external_ref: string | null
          call_status: string
          outcome: string | null
          lead_score: number | null
          retry_count: number
          last_called_at: string | null
          next_call_at: string | null
          do_not_call: boolean
          timezone: string | null
          active_call_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          campaign_id?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone: string
          country?: string | null
          source?: string | null
          external_ref?: string | null
          call_status?: string
          outcome?: string | null
          lead_score?: number | null
          retry_count?: number
          last_called_at?: string | null
          next_call_at?: string | null
          do_not_call?: boolean
          timezone?: string | null
          active_call_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          campaign_id?: string | null
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string
          country?: string | null
          source?: string | null
          external_ref?: string | null
          call_status?: string
          outcome?: string | null
          lead_score?: number | null
          retry_count?: number
          last_called_at?: string | null
          next_call_at?: string | null
          do_not_call?: boolean
          timezone?: string | null
          active_call_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_deals: {
        Row: {
          affiliate_user_id: string
          bid_expiry_at: string
          conversion_rate: number
          created_at: string
          funnel: string
          geo: string
          id: string
          lead_volume: number
          notes: string | null
          price: number
          source: string
          status: string
          terms_type: string
          updated_at: string
        }
        Insert: {
          affiliate_user_id: string
          bid_expiry_at: string
          conversion_rate?: number
          created_at?: string
          funnel: string
          geo: string
          id?: string
          lead_volume?: number
          notes?: string | null
          price?: number
          source: string
          status?: string
          terms_type: string
          updated_at?: string
        }
        Update: {
          affiliate_user_id?: string
          bid_expiry_at?: string
          conversion_rate?: number
          created_at?: string
          funnel?: string
          geo?: string
          id?: string
          lead_volume?: number
          notes?: string | null
          price?: number
          source?: string
          status?: string
          terms_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_offers: {
        Row: {
          bid_price: number
          created_at: string
          deal_id: string
          desk_user_id: string
          id: string
          quantity: number
          reserved_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          bid_price?: number
          created_at?: string
          deal_id: string
          desk_user_id: string
          id?: string
          quantity?: number
          reserved_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          bid_price?: number
          created_at?: string
          deal_id?: string
          desk_user_id?: string
          id?: string
          quantity?: number
          reserved_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_reservations: {
        Row: {
          amount: number
          created_at: string
          desk_user_id: string
          id: string
          offer_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          desk_user_id: string
          id?: string
          offer_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          desk_user_id?: string
          id?: string
          offer_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_deliveries: {
        Row: {
          accepted_leads: number
          affiliate_user_id: string
          created_at: string
          deal_id: string
          delivered_leads: number
          desk_user_id: string
          id: string
          notes: string | null
          offer_id: string | null
          rejected_leads: number
          status: string
          updated_at: string
        }
        Insert: {
          accepted_leads?: number
          affiliate_user_id: string
          created_at?: string
          deal_id: string
          delivered_leads?: number
          desk_user_id: string
          id?: string
          notes?: string | null
          offer_id?: string | null
          rejected_leads?: number
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_leads?: number
          affiliate_user_id?: string
          created_at?: string
          deal_id?: string
          delivered_leads?: number
          desk_user_id?: string
          id?: string
          notes?: string | null
          offer_id?: string | null
          rejected_leads?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispatch_tick_log: {
        // Event-driven Phase 3 (20260819000000_dispatch_clock.sql) — pg_cron's own tick log.
        // Not queried from src/ (RLS denies all to anon/authenticated on purpose — this is
        // operational data written only by the SECURITY DEFINER dispatch_tick()/
        // check_dispatch_tick_health() functions or a service-role connection). Typed anyway per
        // the schema-change skill's convention, so a future app-side query doesn't have to guess.
        Row: {
          checked: boolean
          checked_at: string | null
          error_msg: string | null
          id: number
          request_id: number | null
          status_code: number | null
          ticked_at: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          error_msg?: string | null
          id?: number
          request_id?: number | null
          status_code?: number | null
          ticked_at?: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          error_msg?: string | null
          id?: number
          request_id?: number | null
          status_code?: number | null
          ticked_at?: string
        }
        Relationships: []
      }
      dispatch_trigger_state: {
        // Event-driven Phase 4 (20260820000000_dispatch_trigger.sql) — dispatch-trigger's own
        // debounce state, a singleton row (id is always 1). RLS denies all to anon/authenticated
        // on purpose — only dispatch-trigger/index.ts's service-role Supabase client reads or
        // writes it.
        Row: {
          id: number
          last_triggered_at: string | null
        }
        Insert: {
          id?: number
          last_triggered_at?: string | null
        }
        Update: {
          id?: number
          last_triggered_at?: string | null
        }
        Relationships: []
      }
      user_ip_rules: {
        // Phase 5 admin-module-plan (20260826000000_ip_whitelisting.sql) — D-7 (self-declared,
        // admin-approved): a user inserts their own row (always approved_by null); an
        // admin.roles_invites holder approves it by setting approved_by.
        Row: {
          id: string
          user_id: string
          cidr: string
          label: string | null
          is_active: boolean
          approved_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cidr: string
          label?: string | null
          is_active?: boolean
          approved_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cidr?: string
          label?: string | null
          is_active?: boolean
          approved_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      security_settings: {
        // Phase 5 admin-module-plan — single-row global switch (id is always true). No RLS
        // policies at all (§B.8) — read/write only via get_security_settings()/
        // set_ip_enforcement(), both permission-checked in-function. Typed anyway per the
        // schema-change skill's convention, even though src/ never queries this table directly.
        Row: {
          id: boolean
          ip_enforcement: string
        }
        Insert: {
          id?: boolean
          ip_enforcement?: string
        }
        Update: {
          id?: boolean
          ip_enforcement?: string
        }
        Relationships: []
      }
      ip_access_log: {
        // Phase 5 admin-module-plan — written only by session-guard's service-role client, in
        // every mode including 'off' (§D.4). Readable by admin.roles_invites holders only, for
        // §F.5/F.6's mandatory pre-enforcement audit-period review.
        Row: {
          id: number
          user_id: string | null
          ip: string | null
          allowed: boolean
          mode: string
          created_at: string
        }
        Insert: {
          id?: number
          user_id?: string | null
          ip?: string | null
          allowed: boolean
          mode: string
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string | null
          ip?: string | null
          allowed?: boolean
          mode?: string
          created_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        // Phase 7 admin-module-plan (20260828000000_admin_audit_log.sql §A) — append-only;
        // no UPDATE/DELETE policy exists for any role. `success` is a deliberate deviation
        // from the phase doc's literal schema (see the migration's own header) — the doc's
        // sketch has no way to represent a denied/failed action except a magic JSONB key.
        Row: {
          id: number
          actor_id: string | null
          actor_email: string | null
          action: string
          target_type: string | null
          target_id: string | null
          target_label: string | null
          before: Json | null
          after: Json | null
          reason: string | null
          success: boolean
          ip: string | null
          created_at: string
        }
        Insert: {
          id?: number
          actor_id?: string | null
          actor_email?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          target_label?: string | null
          before?: Json | null
          after?: Json | null
          reason?: string | null
          success?: boolean
          ip?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          actor_id?: string | null
          actor_email?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          target_label?: string | null
          before?: Json | null
          after?: Json | null
          reason?: string | null
          success?: boolean
          ip?: string | null
          created_at?: string
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
          // Phase 1 (20260812000000_roles_as_data.sql step 10): recreated with a TEXT
          // parameter, not the dropped app_role enum -- was "admin" | "affiliate" | "brand".
          _role: string
          _user_id: string
        }
        Returns: boolean
      }
      check_invite: {
        Args: {
          p_email: string
        }
        Returns: {
          full_name: string
          phone: string | null
          role: string
        }[]
      }
      // Phase 1 §16 / Phase 2 §C — the one resolver both the UI (here) and RLS itself read,
      // so the client can't disagree with the database about who can do what. Returns the
      // per-permission Full/Edit/View level too, not just the key, for Phase 3's matrix UI;
      // Phase 2 only consumes permission_key.
      get_my_permissions: {
        Args: Record<PropertyKey, never>
        Returns: {
          permission_key: string
          level: string
        }[]
      }
      // Phase 5 admin-module-plan — the only read path to security_settings (the table itself
      // has no SELECT policy). Returns zero rows for a caller who doesn't hold
      // admin.roles_invites, same "empty means not authorized" shape as an RLS-filtered query.
      get_security_settings: {
        Args: Record<PropertyKey, never>
        Returns: {
          ip_enforcement: string
        }[]
      }
      // Phase 5 admin-module-plan — the only write path to security_settings.ip_enforcement.
      // Raises (not a silent no-op) if the caller lacks admin.roles_invites or passes an
      // unrecognized mode.
      set_ip_enforcement: {
        Args: {
          p_mode: string
        }
        Returns: undefined
      }
      // Phase 6 (20260827000000_user_lifecycle.sql §B.1) — folded into RLS on
      // leads/campaigns/call_records, not called via supabase.rpc() from src/ directly.
      is_account_active: {
        Args: {
          p_user_id: string
        }
        Returns: boolean
      }
      // Phase 6 — the community-documented workaround for revoking an arbitrary user's
      // sessions server-side (auth.sessions has no PostgREST-exposed table to DELETE from
      // directly). service_role only; called from supabase/functions/manage-users, not src/.
      revoke_user_sessions: {
        Args: {
          p_user_id: string
        }
        Returns: number
      }
      // Phase 6 — get_my_permissions()'s logic, parameterized. service_role only; used by
      // manage-users' update_permissions action to check what the ACTING admin holds (a
      // service-role connection has no auth.uid(), so get_my_permissions() itself can't answer
      // that from an edge function). get_my_permissions() (above) is now a one-line wrapper
      // around this with p_user_id = auth.uid() — same result set as before, same callers.
      get_permissions_for: {
        Args: {
          p_user_id: string
        }
        Returns: {
          permission_key: string
          level: string
        }[]
      }
    }
    // app_role removed by Phase 1 (20260812000000_roles_as_data.sql) -- roles.key (a real
    // table) replaced the enum. Nothing in src/ or supabase/functions/ referenced
    // Database["public"]["Enums"]["app_role"] directly (checked before removing this).
    // Same no-enums shape convention supabase gen types uses, matching CompositeTypes below.
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
