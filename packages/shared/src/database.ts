/**
 * Hand-written Supabase Database type.
 * Keeps queries type-safe without needing the Supabase CLI codegen.
 * Update this file whenever the schema changes.
 */
export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          title: string;
          date: string;
          time: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          time: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date?: string;
          time?: string;
          status?: string;
          created_at?: string;
        };
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
      };
      reservations: {
        Row: {
          id: string;
          event_id: string;
          entry_id: string;
          full_name: string;
          date_of_birth: string;
          email: string;
          status: string;
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
          status?: string;
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
          status?: string;
          ticket_opened_at?: string | null;
          qr_scanned_at?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
