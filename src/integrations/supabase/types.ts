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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          attachment_ref: string | null
          created_at: string
          id: string
          option_key: string
          participant_id: string
          question_id: string
          reason_chip_id: string | null
          reason_text: string | null
          session_question_id: string
          visibility: string
        }
        Insert: {
          attachment_ref?: string | null
          created_at?: string
          id?: string
          option_key: string
          participant_id: string
          question_id: string
          reason_chip_id?: string | null
          reason_text?: string | null
          session_question_id: string
          visibility?: string
        }
        Update: {
          attachment_ref?: string | null
          created_at?: string
          id?: string
          option_key?: string
          participant_id?: string
          question_id?: string
          reason_chip_id?: string | null
          reason_text?: string | null
          session_question_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_reason_chip_id_fkey"
            columns: ["reason_chip_id"]
            isOneToOne: false
            referencedRelation: "reason_chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          guest_token: string | null
          id: string
          name: string
          profile_id: string | null
          props: Json
          session_id: string | null
        }
        Insert: {
          created_at?: string
          guest_token?: string | null
          id?: string
          name: string
          profile_id?: string | null
          props?: Json
          session_id?: string | null
        }
        Update: {
          created_at?: string
          guest_token?: string | null
          id?: string
          name?: string
          profile_id?: string | null
          props?: Json
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          child_session_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          inviter_participant_id: string | null
          opened_at: string | null
          personal_note: string | null
          recipient_email: string | null
          recipient_label: string | null
          recipient_participant_id: string | null
          session_id: string
          token: string
        }
        Insert: {
          child_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          inviter_participant_id?: string | null
          opened_at?: string | null
          personal_note?: string | null
          recipient_email?: string | null
          recipient_label?: string | null
          recipient_participant_id?: string | null
          session_id: string
          token: string
        }
        Update: {
          child_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          inviter_participant_id?: string | null
          opened_at?: string | null
          personal_note?: string | null
          recipient_email?: string | null
          recipient_label?: string | null
          recipient_participant_id?: string | null
          session_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_child_session_id_fkey"
            columns: ["child_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_participant_id_fkey"
            columns: ["inviter_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_recipient_participant_id_fkey"
            columns: ["recipient_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          option_a: string
          option_b: string
          option_c: string | null
          spice_level: number
          text: string
          topic_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          option_a: string
          option_b: string
          option_c?: string | null
          spice_level?: number
          text: string
          topic_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string | null
          spice_level?: number
          text?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      reason_chips: {
        Row: {
          id: string
          option_key: string
          question_id: string
          text: string
        }
        Insert: {
          id?: string
          option_key: string
          question_id: string
          text: string
        }
        Update: {
          id?: string
          option_key?: string
          question_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reason_chips_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participant_topics: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          session_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          session_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          session_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participant_topics_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participant_topics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participant_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          display_name: string | null
          guest_token: string | null
          id: string
          joined_at: string
          profile_id: string | null
          role: string
          session_id: string
        }
        Insert: {
          display_name?: string | null
          guest_token?: string | null
          id?: string
          joined_at?: string
          profile_id?: string | null
          role?: string
          session_id: string
        }
        Update: {
          display_name?: string | null
          guest_token?: string | null
          id?: string
          joined_at?: string
          profile_id?: string | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_question_votes: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          question_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          question_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_question_votes_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_question_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_questions: {
        Row: {
          ai_prompts: Json | null
          id: string
          order_index: number
          question_id: string
          revealed_at: string | null
          session_id: string
          snapshot: Json | null
        }
        Insert: {
          ai_prompts?: Json | null
          id?: string
          order_index?: number
          question_id: string
          revealed_at?: string | null
          session_id: string
          snapshot?: Json | null
        }
        Update: {
          ai_prompts?: Json | null
          id?: string
          order_index?: number
          question_id?: string
          revealed_at?: string | null
          session_id?: string
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "session_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          current_index: number
          ended_at: string | null
          host_profile_id: string | null
          id: string
          kind: string
          room_code: string | null
          spice_max: number
          status: string
        }
        Insert: {
          created_at?: string
          current_index?: number
          ended_at?: string | null
          host_profile_id?: string | null
          id?: string
          kind?: string
          room_code?: string | null
          spice_max?: number
          status?: string
        }
        Update: {
          created_at?: string
          current_index?: number
          ended_at?: string | null
          host_profile_id?: string | null
          id?: string
          kind?: string
          room_code?: string | null
          spice_max?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_host_profile_id_fkey"
            columns: ["host_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_messages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          participant_id: string
          session_question_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          participant_id: string
          session_question_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          participant_id?: string
          session_question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_messages_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          active: boolean
          id: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_guest_token: { Args: never; Returns: string }
      is_my_participant: { Args: { _participant_id: string }; Returns: boolean }
      is_session_member: { Args: { _session_id: string }; Returns: boolean }
      question_tally: {
        Args: { _question_id: string }
        Returns: {
          option_key: string
          votes: number
        }[]
      }
      session_question_revealed: {
        Args: { _session_question_id: string }
        Returns: boolean
      }
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
  public: {
    Enums: {},
  },
} as const
