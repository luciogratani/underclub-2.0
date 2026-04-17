/**
 * Hand-written Supabase Database type.
 * Keeps queries type-safe without needing the Supabase CLI codegen.
 * Update this file whenever the schema changes.
 */
export interface Database {
  underclub: {
    Tables: {
      events: {
        Row: {
          id: string;
          title: string;
          date: string;
          time: string;
          status: 'draft' | 'published' | 'archived';
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          time: string;
          status?: 'draft' | 'published' | 'archived';
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date?: string;
          time?: string;
          status?: 'draft' | 'published' | 'archived';
          created_at?: string;
        };
        Relationships: [];
      };
      event_artists: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          origin: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          origin?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          origin?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'event_artists_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_entries: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          note: string | null;
          quota: number | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          note?: string | null;
          quota?: number | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          note?: string | null;
          quota?: number | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'event_entries_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      reservations: {
        Row: {
          id: string;
          event_id: string;
          entry_id: string;
          full_name: string;
          date_of_birth: string;
          email: string;
          status: 'confirmed' | 'cancelled';
          ticket_opened_at: string | null;
          qr_scanned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          entry_id: string;
          full_name: string;
          date_of_birth: string;
          email: string;
          status?: 'confirmed' | 'cancelled';
          ticket_opened_at?: string | null;
          qr_scanned_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          entry_id?: string;
          full_name?: string;
          date_of_birth?: string;
          email?: string;
          status?: 'confirmed' | 'cancelled';
          ticket_opened_at?: string | null;
          qr_scanned_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reservations_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservations_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_entries';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_public_reservation: {
        Args: {
          p_event_id: string;
          p_entry_id: string;
          p_full_name: string;
          p_date_of_birth: string;
          p_email: string;
        };
        Returns: {
          reservation_id: string;
          reservation_status: 'confirmed' | 'cancelled';
          ticket_token: string;
        }[];
      };
      get_public_entry_counts: {
        Args: {
          p_event_id: string;
        };
        Returns: {
          entry_id: string;
          confirmed_count: number;
        }[];
      };
      issue_ticket_access_token: {
        Args: {
          p_reservation_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
