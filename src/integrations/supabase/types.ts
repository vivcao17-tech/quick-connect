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
  public: {
    Tables: {
      answers: {
        Row: {
          about_participant_id: string | null
          answer_role: string
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
          about_participant_id?: string | null
          answer_role?: string
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
          about_participant_id?: string | null
          answer_role?: string
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
            foreignKeyName: "answers_about_participant_id_fkey"
            columns: ["about_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
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
      chain_answers: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_test: boolean
          option_key: string
          person_key: string
          profile_id: string | null
          week_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_test?: boolean
          option_key: string
          person_key: string
          profile_id?: string | null
          week_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_test?: boolean
          option_key?: string
          person_key?: string
          profile_id?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_answers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_answers_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "chain_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_guesses: {
        Row: {
          because_text: string | null
          created_at: string
          guessed_option: string
          guesser_key: string
          guesser_name: string
          guesser_profile_id: string | null
          id: string
          is_test: boolean
          matched: boolean | null
          opened_at: string | null
          question_id: string
          subject_actual_option: string | null
          subject_key: string | null
          subject_name: string
          token: string
          week_id: string
        }
        Insert: {
          because_text?: string | null
          created_at?: string
          guessed_option: string
          guesser_key: string
          guesser_name: string
          guesser_profile_id?: string | null
          id?: string
          is_test?: boolean
          matched?: boolean | null
          opened_at?: string | null
          question_id: string
          subject_actual_option?: string | null
          subject_key?: string | null
          subject_name: string
          token: string
          week_id: string
        }
        Update: {
          because_text?: string | null
          created_at?: string
          guessed_option?: string
          guesser_key?: string
          guesser_name?: string
          guesser_profile_id?: string | null
          id?: string
          is_test?: boolean
          matched?: boolean | null
          opened_at?: string | null
          question_id?: string
          subject_actual_option?: string | null
          subject_key?: string | null
          subject_name?: string
          token?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_guesses_guesser_profile_id_fkey"
            columns: ["guesser_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_guesses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "chain_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_guesses_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "chain_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_questions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          option_a: string
          option_b: string
          sort_order: number
          text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          option_a: string
          option_b: string
          sort_order: number
          text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          option_a?: string
          option_b?: string
          sort_order?: number
          text?: string
        }
        Relationships: []
      }
      chain_weeks: {
        Row: {
          created_at: string
          id: string
          opens_at: string
          question_id: string
          settles_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opens_at: string
          question_id: string
          settles_at: string
        }
        Update: {
          created_at?: string
          id?: string
          opens_at?: string
          question_id?: string
          settles_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chain_weeks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "chain_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          created_at: string
          id: string
          owner_participant_id: string
          session_id: string | null
          target_participant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_participant_id: string
          session_id?: string | null
          target_participant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_participant_id?: string
          session_id?: string | null
          target_participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_owner_participant_id_fkey"
            columns: ["owner_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_target_participant_id_fkey"
            columns: ["target_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_optouts: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          guest_token: string | null
          id: string
          name: string
          participant_id: string | null
          profile_id: string | null
          props: Json
          session_id: string | null
        }
        Insert: {
          created_at?: string
          guest_token?: string | null
          id?: string
          name: string
          participant_id?: string | null
          profile_id?: string | null
          props?: Json
          session_id?: string | null
        }
        Update: {
          created_at?: string
          guest_token?: string | null
          id?: string
          name?: string
          participant_id?: string | null
          profile_id?: string | null
          props?: Json
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
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
      excluded_identities: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          value?: string
        }
        Relationships: []
      }
      host_requests: {
        Row: {
          created_at: string
          id: string
          requester_participant_id: string
          resolved_at: string | null
          session_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_participant_id: string
          resolved_at?: string | null
          session_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_participant_id?: string
          resolved_at?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_requests_requester_participant_id_fkey"
            columns: ["requester_participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_requests_session_id_fkey"
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
          sender_read_option: string | null
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
          sender_read_option?: string | null
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
          sender_read_option?: string | null
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
      notifications: {
        Row: {
          actor_name: string
          created_at: string
          emailed_at: string | null
          id: string
          link: string
          participant_id: string
          question_text: string
          read_at: string | null
          session_id: string
          session_question_id: string
        }
        Insert: {
          actor_name: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          link: string
          participant_id: string
          question_text: string
          read_at?: string | null
          session_id: string
          session_question_id: string
        }
        Update: {
          actor_name?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          link?: string
          participant_id?: string
          question_text?: string
          read_at?: string | null
          session_id?: string
          session_question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_config: {
        Row: {
          created_at: string
          display_order: number
          pack: string
          unlock_threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order: number
          pack: string
          unlock_threshold: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          pack?: string
          unlock_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      participant_emails: {
        Row: {
          created_at: string
          email: string
          participant_id: string
        }
        Insert: {
          created_at?: string
          email: string
          participant_id: string
        }
        Update: {
          created_at?: string
          email?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_emails_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      person_notes: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          nickname: string | null
          note: string | null
          owner_key: string
          target_key: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          nickname?: string | null
          note?: string | null
          owner_key: string
          target_key: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          nickname?: string | null
          note?: string | null
          owner_key?: string
          target_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_impression_prefs: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          profile_id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          profile_id: string
          question_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          profile_id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_impression_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_impression_prefs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompts: {
        Row: {
          answer: string
          created_at: string
          id: string
          profile_id: string
          prompt_key: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          profile_id: string
          prompt_key: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          profile_id?: string
          prompt_key?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          handle: string | null
          id: string
          impressions_seen_at: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          handle?: string | null
          id: string
          impressions_seen_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          handle?: string | null
          id?: string
          impressions_seen_at?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          active: boolean
          created_at: string
          first_round_role: string | null
          follow_up: string | null
          id: string
          impression_pool: boolean
          is_featured: boolean
          is_values: boolean
          mode: string
          option_a: string
          option_b: string
          option_c: string | null
          pack: string | null
          question_key: string | null
          question_type: string
          self_prompt: string | null
          source: string | null
          spice_level: number
          stem_other: string | null
          stem_self: string | null
          text: string
          topic_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          first_round_role?: string | null
          follow_up?: string | null
          id?: string
          impression_pool?: boolean
          is_featured?: boolean
          is_values?: boolean
          mode?: string
          option_a: string
          option_b: string
          option_c?: string | null
          pack?: string | null
          question_key?: string | null
          question_type?: string
          self_prompt?: string | null
          source?: string | null
          spice_level?: number
          stem_other?: string | null
          stem_self?: string | null
          text: string
          topic_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          first_round_role?: string | null
          follow_up?: string | null
          id?: string
          impression_pool?: boolean
          is_featured?: boolean
          is_values?: boolean
          mode?: string
          option_a?: string
          option_b?: string
          option_c?: string | null
          pack?: string | null
          question_key?: string | null
          question_type?: string
          self_prompt?: string | null
          source?: string | null
          spice_level?: number
          stem_other?: string | null
          stem_self?: string | null
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
      session_links: {
        Row: {
          created_at: string
          expires_at: string
          participant_id: string
          session_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          participant_id: string
          session_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          participant_id?: string
          session_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_links_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
          is_test: boolean
          kind: string
          pack: string | null
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
          is_test?: boolean
          kind?: string
          pack?: string | null
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
          is_test?: boolean
          kind?: string
          pack?: string | null
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
      thread_reads: {
        Row: {
          id: string
          participant_id: string
          read_at: string
          session_question_id: string
        }
        Insert: {
          id?: string
          participant_id: string
          read_at?: string
          session_question_id: string
        }
        Update: {
          id?: string
          participant_id?: string
          read_at?: string
          session_question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_reads_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_reads_session_question_id_fkey"
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
      admin_cohorts: {
        Args: { _activity?: string; _include_test?: boolean; _weeks?: number }
        Returns: Json
      }
      admin_funnel: {
        Args: {
          _from: string
          _include_test?: boolean
          _segment?: string
          _to: string
        }
        Returns: Json
      }
      admin_impression_exhaustion: { Args: never; Returns: Json }
      admin_impression_questions: {
        Args: { _include_test?: boolean }
        Returns: Json
      }
      admin_invites: {
        Args: { _from: string; _include_test?: boolean; _to: string }
        Returns: Json
      }
      admin_median: { Args: { _values: number[] }; Returns: number }
      admin_notifications: {
        Args: { _from: string; _include_test?: boolean; _to: string }
        Returns: Json
      }
      admin_overview: {
        Args: { _from: string; _include_test?: boolean; _to: string }
        Returns: Json
      }
      admin_overview_window: {
        Args: { _from: string; _include_test: boolean; _to: string }
        Returns: Json
      }
      admin_people: {
        Args: { _include_test?: boolean; _q?: string }
        Returns: Json
      }
      admin_person_key: { Args: { _participant_id: string }; Returns: string }
      admin_person_timeline: { Args: { _person_key: string }; Returns: Json }
      admin_question_performance: {
        Args: { _include_test?: boolean }
        Returns: Json
      }
      admin_session_rows: {
        Args: { _from: string; _include_test?: boolean; _to: string }
        Returns: Json
      }
      current_guest_token: { Args: never; Returns: string }
      draw_questions: {
        Args: {
          _bonus_topic_ids?: string[]
          _exclude?: string[]
          _exclude_session_questions?: boolean
          _guest_tokens?: string[]
          _history?: string
          _max_per_topic?: number
          _modes?: string[]
          _profile_ids?: string[]
          _session_id?: string
          _slots: Json
          _spice_max?: number
          _topic_ids?: string[]
          _use_session_topics?: boolean
        }
        Returns: Json
      }
      identity_is_test: {
        Args: { _guest_token: string; _profile_id: string }
        Returns: boolean
      }
      is_my_participant: { Args: { _participant_id: string }; Returns: boolean }
      is_session_member: { Args: { _session_id: string }; Returns: boolean }
      people_overview: {
        Args: { _guest_token: string; _profile_id: string }
        Returns: Json
      }
      profile_data: {
        Args: { _include_hidden?: boolean; _profile_id: string }
        Returns: Json
      }
      profile_id_for_handle: { Args: { _handle: string }; Returns: string }
      profile_participants: {
        Args: { _profile_id: string }
        Returns: {
          id: string
        }[]
      }
      profile_wall: {
        Args: { _phase?: string; _profile_id: string }
        Returns: Json
      }
      public_person_key: {
        Args: { _guest_token: string; _id: string; _profile_id: string }
        Returns: string
      }
      question_tally: {
        Args: { _question_id: string }
        Returns: {
          option_key: string
          votes: number
        }[]
      }
      relationships_detail: {
        Args: { _guest_token: string; _profile_id: string }
        Returns: Json
      }
      room_state: {
        Args: { _guest_token: string; _session_id: string }
        Returns: Json
      }
      selection_history: {
        Args: {
          _guest_tokens: string[]
          _history: string
          _profile_ids: string[]
          _session_id: string
        }
        Returns: {
          n: number
          pkey: string
          question_id: string
        }[]
      }
      selection_persons: {
        Args: {
          _guest_tokens: string[]
          _profile_ids: string[]
          _session_id: string
        }
        Returns: {
          pids: string[]
          pkey: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
