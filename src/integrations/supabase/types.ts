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
      library_books: {
        Row: {
          created_at: string
          id: string
          last_opened: string
          last_page: number
          local_cache_key: string
          pdf_url: string
          session_id: string | null
          title: string
          total_pages: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_opened?: string
          last_page?: number
          local_cache_key: string
          pdf_url: string
          session_id?: string | null
          title?: string
          total_pages?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_opened?: string
          last_page?: number
          local_cache_key?: string
          pdf_url?: string
          session_id?: string | null
          title?: string
          total_pages?: number
          user_id?: string
        }
        Relationships: []
      }
      page_discussions: {
        Row: {
          content: string
          created_at: string
          id: string
          page_number: number
          participant_id: string
          participant_name: string
          session_id: string
          type: Database["public"]["Enums"]["page_message_type"]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          page_number: number
          participant_id: string
          participant_name: string
          session_id: string
          type?: Database["public"]["Enums"]["page_message_type"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          page_number?: number
          participant_id?: string
          participant_name?: string
          session_id?: string
          type?: Database["public"]["Enums"]["page_message_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_discussions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_progress: {
        Row: {
          created_at: string
          current_page: number
          id: string
          last_activity: string
          participant_id: string
          reading_time_seconds: number
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_page?: number
          id?: string
          last_activity?: string
          participant_id: string
          reading_time_seconds?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_page?: number
          id?: string
          last_activity?: string
          participant_id?: string
          reading_time_seconds?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_progress_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          created_at: string
          current_page: number
          id: string
          is_leader: boolean
          last_seen: string
          name: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_page?: number
          id?: string
          is_leader?: boolean
          last_seen?: string
          name: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_page?: number
          id?: string
          is_leader?: boolean
          last_seen?: string
          name?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          book_name: string
          code: string
          created_at: string
          current_page: number
          id: string
          leader_id: string
          pan_x: number
          pan_y: number
          pdf_url: string | null
          presentation_mode: boolean
          rotation: number
          total_pages: number
          updated_at: string
          zoom: number
        }
        Insert: {
          book_name?: string
          code: string
          created_at?: string
          current_page?: number
          id?: string
          leader_id: string
          pan_x?: number
          pan_y?: number
          pdf_url?: string | null
          presentation_mode?: boolean
          rotation?: number
          total_pages?: number
          updated_at?: string
          zoom?: number
        }
        Update: {
          book_name?: string
          code?: string
          created_at?: string
          current_page?: number
          id?: string
          leader_id?: string
          pan_x?: number
          pan_y?: number
          pdf_url?: string | null
          presentation_mode?: boolean
          rotation?: number
          total_pages?: number
          updated_at?: string
          zoom?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_library_book: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_page_message: {
        Args: { p_message_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: undefined
      }
      get_progress: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: {
          current_page: number
          last_activity: string
          reading_time_seconds: number
        }[]
      }
      participant_heartbeat: {
        Args: {
          p_current_page: number
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      post_page_message: {
        Args: {
          p_content: string
          p_is_leader_note: boolean
          p_page_number: number
          p_session_id: string
          p_user_id: string
          p_user_name: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          page_number: number
          participant_id: string
          participant_name: string
          session_id: string
          type: Database["public"]["Enums"]["page_message_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "page_discussions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_session_total_pages: {
        Args: { p_session_id: string; p_total: number; p_user_id: string }
        Returns: undefined
      }
      update_page_message: {
        Args: { p_content: string; p_message_id: string; p_user_id: string }
        Returns: undefined
      }
      update_presentation_state: {
        Args: {
          p_pan_x?: number
          p_pan_y?: number
          p_presentation_mode?: boolean
          p_rotation?: number
          p_session_id: string
          p_user_id: string
          p_zoom?: number
        }
        Returns: undefined
      }
      update_session_page: {
        Args: { p_page: number; p_session_id: string; p_user_id: string }
        Returns: undefined
      }
      update_session_pdf: {
        Args: {
          p_book_name: string
          p_pdf_url: string
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_library_book: {
        Args: {
          p_last_page: number
          p_local_cache_key: string
          p_pdf_url: string
          p_session_id: string
          p_title: string
          p_total_pages: number
          p_user_id: string
        }
        Returns: {
          created_at: string
          id: string
          last_opened: string
          last_page: number
          local_cache_key: string
          pdf_url: string
          session_id: string | null
          title: string
          total_pages: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "library_books"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_participant: {
        Args: {
          p_current_page: number
          p_name: string
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_progress: {
        Args: {
          p_current_page: number
          p_reading_time_seconds: number
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      page_message_type: "leader_note" | "discussion_message"
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
    Enums: {
      page_message_type: ["leader_note", "discussion_message"],
    },
  },
} as const
