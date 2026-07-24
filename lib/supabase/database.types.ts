export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_account_access: {
        Row: {
          admin_id: string
          created_at: string
          role: string
          tiktok_account_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          role: string
          tiktok_account_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          role?: string
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_account_access_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_account_access_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string
          email: string
          id: string
          is_super_admin: boolean
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_super_admin?: boolean
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_super_admin?: boolean
          name?: string
          status?: string
        }
        Relationships: []
      }
      caxetao_events: {
        Row: {
          close_rule: string
          created_at: string
          created_by: string
          event_date: string
          id: string
          max_principals: number | null
          max_substitutes: number | null
          registration_closes_at: string | null
          registration_opens_at: string
          status: string
          tiktok_account_id: string
        }
        Insert: {
          close_rule: string
          created_at?: string
          created_by: string
          event_date: string
          id?: string
          max_principals?: number | null
          max_substitutes?: number | null
          registration_closes_at?: string | null
          registration_opens_at: string
          status?: string
          tiktok_account_id: string
        }
        Update: {
          close_rule?: string
          created_at?: string
          created_by?: string
          event_date?: string
          id?: string
          max_principals?: number | null
          max_substitutes?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string
          status?: string
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caxetao_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caxetao_events_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      caxetao_registrations: {
        Row: {
          caxetao_event_id: string
          id: string
          player_id: string
          queue_position: number | null
          registered_at: string
          registration_type: string
          status: string
        }
        Insert: {
          caxetao_event_id: string
          id?: string
          player_id: string
          queue_position?: number | null
          registered_at?: string
          registration_type: string
          status?: string
        }
        Update: {
          caxetao_event_id?: string
          id?: string
          player_id?: string
          queue_position?: number | null
          registered_at?: string
          registration_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "caxetao_registrations_caxetao_event_id_fkey"
            columns: ["caxetao_event_id"]
            isOneToOne: false
            referencedRelation: "caxetao_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caxetao_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          id: string
          joined_at: string
          live_session_id: string
          player_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          live_session_id: string
          player_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          live_session_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          score_period_id: string | null
          session_date: string
          status: string
          tiktok_account_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          score_period_id?: string | null
          session_date: string
          status?: string
          tiktok_account_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          score_period_id?: string | null
          session_date?: string
          status?: string
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_score_period_id_fkey"
            columns: ["score_period_id"]
            isOneToOne: false
            referencedRelation: "score_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result_edits: {
        Row: {
          action: string
          created_at: string
          edited_by: string
          id: string
          match_result_id: string | null
          new_points_awarded: number | null
          new_scoring_rule_id: string | null
          previous_points_awarded: number
          previous_scoring_rule_id: string | null
          tiktok_account_id: string
        }
        Insert: {
          action: string
          created_at?: string
          edited_by: string
          id?: string
          match_result_id?: string | null
          new_points_awarded?: number | null
          new_scoring_rule_id?: string | null
          previous_points_awarded: number
          previous_scoring_rule_id?: string | null
          tiktok_account_id: string
        }
        Update: {
          action?: string
          created_at?: string
          edited_by?: string
          id?: string
          match_result_id?: string | null
          new_points_awarded?: number | null
          new_scoring_rule_id?: string | null
          previous_points_awarded?: number
          previous_scoring_rule_id?: string | null
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_result_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_edits_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_edits_new_scoring_rule_id_fkey"
            columns: ["new_scoring_rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_edits_previous_scoring_rule_id_fkey"
            columns: ["previous_scoring_rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_edits_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          created_at: string
          id: string
          match_id: string
          player_id: string
          points_awarded: number
          recorded_by: string
          scoring_rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          player_id: string
          points_awarded: number
          recorded_by: string
          scoring_rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          player_id?: string
          points_awarded?: number
          recorded_by?: string
          scoring_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_scoring_rule_id_fkey"
            columns: ["scoring_rule_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          caxetao_event_id: string | null
          id: string
          live_session_id: string | null
          played_at: string
          player_a_id: string | null
          player_b_id: string | null
          score_period_id: string | null
          tiktok_account_id: string
        }
        Insert: {
          caxetao_event_id?: string | null
          id?: string
          live_session_id?: string | null
          played_at?: string
          player_a_id?: string | null
          player_b_id?: string | null
          score_period_id?: string | null
          tiktok_account_id: string
        }
        Update: {
          caxetao_event_id?: string | null
          id?: string
          live_session_id?: string | null
          played_at?: string
          player_a_id?: string | null
          player_b_id?: string | null
          score_period_id?: string | null
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_caxetao_event_id_fkey"
            columns: ["caxetao_event_id"]
            isOneToOne: false
            referencedRelation: "caxetao_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_score_period_id_fkey"
            columns: ["score_period_id"]
            isOneToOne: false
            referencedRelation: "score_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          display_name: string
          id: string
          tiktok_handle: string
          verified_via_tiktok: boolean
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          tiktok_handle: string
          verified_via_tiktok?: boolean
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          tiktok_handle?: string
          verified_via_tiktok?: boolean
          whatsapp?: string | null
        }
        Relationships: []
      }
      score_periods: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          label: string
          starts_at: string
          status: string
          tiktok_account_id: string
          type: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          label: string
          starts_at: string
          status?: string
          tiktok_account_id: string
          type: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          label?: string
          starts_at?: string
          status?: string
          tiktok_account_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_periods_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          points: number
          tiktok_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          points: number
          tiktok_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          points?: number
          tiktok_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_accounts: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          is_active: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          handle: string
          id?: string
          is_active?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_tiktok_account: {
        Args: {
          p_avatar_url?: string
          p_display_name: string
          p_handle: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          is_active: boolean
        }
        SetofOptions: {
          from: "*"
          to: "tiktok_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_tiktok_account: {
        Args: { p_account_id: string; p_handle_confirmation: string }
        Returns: undefined
      }
      has_account_access: {
        Args: { p_tiktok_account_id: string }
        Returns: boolean
      }
      is_account_owner: {
        Args: { p_tiktok_account_id: string }
        Returns: boolean
      }
      is_approved_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
