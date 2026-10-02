/**
 * Hand-written Supabase Database type.
 * Keeps queries type-safe without needing the Supabase CLI codegen.
 * Update this file whenever the schema changes.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** jsonb returned by `ep_session_overview` (null when the session is not valid). */
export interface EpSessionOverview {
  contact: {
    email: string;
    full_name: string;
    marketing_consent: boolean;
    profiling_consent: boolean;
    session_expires_at: string;
  };
  reservations: EpSessionOverviewReservation[];
}

export interface EpSessionOverviewReservation {
  reservation_id: string;
  status: 'confirmed' | 'pending';
  event_id: string;
  event_title: string;
  event_date: string;
  event_time: string;
  entry_name: string;
  entry_price: number;
  entry_valid_until: string | null;
  qr_scanned_at: string | null;
  created_at: string;
  /** Derived ticket token: only for confirmed bookings of the new model, else null. */
  ticket_token: string | null;
}

/** jsonb returned by `ep_cleanup`: deleted row counts by kind. */
export type EpCleanupCounts = Record<string, number>;

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
          /** Online booking close; null = default (18:00 Europe/Rome of `date`). */
          booking_closes_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          time: string;
          status?: 'draft' | 'published' | 'archived';
          booking_closes_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date?: string;
          time?: string;
          status?: 'draft' | 'published' | 'archived';
          booking_closes_at?: string | null;
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
          price: number;
          valid_until: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          note?: string | null;
          quota?: number | null;
          sort_order?: number;
          price: number;
          valid_until?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          note?: string | null;
          quota?: number | null;
          sort_order?: number;
          price?: number;
          valid_until?: string | null;
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
          status: 'pending' | 'confirmed' | 'cancelled';
          ticket_opened_at: string | null;
          qr_scanned_at: string | null;
          created_at: string;
          ticket_access_token_hash: string | null;
          contact_id: string | null;
          pending_expires_at: string | null;
          confirmed_at: string | null;
          cancelled_at: string | null;
          source: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          entry_id: string;
          full_name: string;
          date_of_birth: string;
          email: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          ticket_opened_at?: string | null;
          qr_scanned_at?: string | null;
          created_at?: string;
          ticket_access_token_hash?: string | null;
          contact_id?: string | null;
          pending_expires_at?: string | null;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          source?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          entry_id?: string;
          full_name?: string;
          date_of_birth?: string;
          email?: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          ticket_opened_at?: string | null;
          qr_scanned_at?: string | null;
          created_at?: string;
          ticket_access_token_hash?: string | null;
          contact_id?: string | null;
          pending_expires_at?: string | null;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          source?: string | null;
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
          {
            foreignKeyName: 'reservations_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      // Not reachable by anon/authenticated except `select` on contacts for
      // admin: these are written by the serverless endpoints (service role).
      contacts: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          date_of_birth: string;
          marketing_consent_at: string | null;
          marketing_consent_revoked_at: string | null;
          profiling_consent_at: string | null;
          profiling_consent_revoked_at: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          date_of_birth: string;
          marketing_consent_at?: string | null;
          marketing_consent_revoked_at?: string | null;
          profiling_consent_at?: string | null;
          profiling_consent_revoked_at?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          date_of_birth?: string;
          marketing_consent_at?: string | null;
          marketing_consent_revoked_at?: string | null;
          profiling_consent_at?: string | null;
          profiling_consent_revoked_at?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activation_tokens: {
        Row: {
          id: string;
          contact_id: string;
          reservation_id: string | null;
          token_hash: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
          consent_marketing: boolean | null;
          consent_profiling: boolean | null;
        };
        Insert: {
          id?: string;
          contact_id: string;
          reservation_id?: string | null;
          token_hash: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
          consent_marketing?: boolean | null;
          consent_profiling?: boolean | null;
        };
        Update: {
          id?: string;
          contact_id?: string;
          reservation_id?: string | null;
          token_hash?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
          consent_marketing?: boolean | null;
          consent_profiling?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activation_tokens_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activation_tokens_reservation_id_fkey';
            columns: ['reservation_id'];
            isOneToOne: false;
            referencedRelation: 'reservations';
            referencedColumns: ['id'];
          },
        ];
      };
      contact_sessions: {
        Row: {
          id: string;
          contact_id: string;
          token_hash: string;
          expires_at: string;
          last_used_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          token_hash: string;
          expires_at: string;
          last_used_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          token_hash?: string;
          expires_at?: string;
          last_used_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contact_sessions_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      // Fixed-window hit counters for the per-IP limits (`ep_throttle`).
      // key_hash = HMAC-SHA256(IP, IP_HASH_SECRET): the clear IP never gets here.
      request_throttle: {
        Row: {
          key_hash: string;
          action: string;
          window_start: string;
          hits: number;
        };
        Insert: {
          key_hash: string;
          action: string;
          window_start: string;
          hits?: number;
        };
        Update: {
          key_hash?: string;
          action?: string;
          window_start?: string;
          hits?: number;
        };
        Relationships: [];
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
          reservation_status: 'pending' | 'confirmed' | 'cancelled';
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
      scan_ticket_check_in: {
        Args: {
          p_token: string;
        };
        Returns: {
          result_code: 'ok' | 'already_scanned' | 'cancelled' | 'pending' | 'invalid';
          reservation_id: string | null;
          full_name: string | null;
          entry_name: string | null;
          event_title: string | null;
          event_date: string | null;
          scanned_at: string | null;
          // entry.valid_until passed; null for `invalid`.
          formula_expired: boolean | null;
        }[];
      };
      // Anon + authenticated. Zero rows when the token does not match; on a
      // match it also marks a confirmed, unscanned ticket as opened.
      open_public_ticket: {
        Args: {
          p_reservation_id: string;
          p_token: string;
        };
        Returns: {
          reservation_id: string;
          status: 'pending' | 'confirmed' | 'cancelled';
          full_name: string | null;
          email: string | null;
          event_title: string;
          event_date: string;
          entry_name: string;
          ticket_opened_at: string | null;
          qr_scanned_at: string | null;
          /** The night is over (06:00 Europe/Rome of the day after the date). */
          event_ended: boolean;
        }[];
      };
      // -----------------------------------------------------------------
      // Serverless endpoints only (`ep_*`, execute granted to service_role).
      // -----------------------------------------------------------------
      ep_request_booking: {
        Args: {
          p_session_token: string | null;
          p_event_id: string;
          p_entry_id: string;
          p_full_name: string | null;
          p_date_of_birth: string | null;
          p_email: string | null;
          p_consent_marketing: boolean | null;
          p_consent_profiling: boolean | null;
          p_source: string | null;
          // TICKET_SECRET (>= 32 chars): derives the ticket token.
          p_ticket_secret: string;
        };
        Returns: {
          outcome:
            | 'confirmed'
            | 'pending'
            | 'already_booked'
            | 'sold_out'
            | 'not_bookable'
            | 'invalid_entry'
            | 'invalid_input'
            // Per-address limit reached (no-session path): nothing written.
            | 'rate_limited';
          reservation_id: string | null;
          ticket_token: string | null;
          activation_token: string | null;
          contact_email: string | null;
          contact_full_name: string | null;
          event_title: string | null;
          event_date: string | null;
          event_time: string | null;
          entry_name: string | null;
        }[];
      };
      ep_activate: {
        Args: {
          p_token: string;
          p_ticket_secret: string;
        };
        Returns: {
          outcome: 'ok' | 'invalid' | 'expired';
          reservation_outcome: 'none' | 'confirmed' | 'expired' | 'unavailable' | null;
          session_token: string | null;
          contact_id: string | null;
          reservation_id: string | null;
          ticket_token: string | null;
          contact_email: string | null;
          contact_full_name: string | null;
        }[];
      };
      ep_request_login: {
        Args: {
          p_email: string;
        };
        Returns: {
          outcome: 'sent' | 'unknown' | 'rate_limited';
          activation_token: string | null;
          contact_full_name: string | null;
        }[];
      };
      // null when the session is not valid; renews it at most once a day.
      ep_session_overview: {
        Args: {
          p_token: string;
          p_ticket_secret: string;
        };
        Returns: EpSessionOverview | null;
      };
      ep_logout: {
        Args: {
          p_token: string;
        };
        Returns: boolean;
      };
      ep_cancel_reservation: {
        Args: {
          p_token: string;
          p_reservation_id: string;
        };
        Returns: 'ok' | 'invalid_session' | 'not_found' | 'not_cancellable';
      };
      // Per-IP fixed window: true while hits <= p_limit after this hit.
      ep_throttle: {
        Args: {
          p_key_hash: string;
          p_action: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      // Periodic cleanup (Vercel Cron): deleted row counts.
      ep_cleanup: {
        Args: Record<PropertyKey, never>;
        Returns: EpCleanupCounts;
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
