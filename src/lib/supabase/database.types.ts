export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "financeiro";
export type CertificadoStatus = "ativo" | "vencendo" | "vencido" | "invalido";
export type CertificateRenewalStatus =
  | "em_acompanhamento"
  | "renovou_fasa"
  | "renovou_externo"
  | "nao_renovar"
  | "cliente_inativo";
export type NotificationEventStatus =
  | "pending"
  | "reserved"
  | "processing"
  | "retry"
  | "sent"
  | "failed"
  | "cancelled"
  | "skipped";
export type NotificationProvider = "euatendo" | "whatsapp_extension";
export type NotificationAudience = "internal" | "client";

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          role: UserRole;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: UserRole;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      clientes: {
        Row: {
          id: string;
          nome_razao_social: string;
          cnpj: string;
          email: string | null;
          telefone: string | null;
          whatsapp: string | null;
          whatsapp_notifications_enabled: boolean;
          responsavel: string | null;
          observacoes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome_razao_social: string;
          cnpj: string;
          email?: string | null;
          telefone?: string | null;
          whatsapp?: string | null;
          whatsapp_notifications_enabled?: boolean;
          responsavel?: string | null;
          observacoes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clientes"]["Insert"]>;
        Relationships: [];
      };
      certificados: {
        Row: {
          id: string;
          cliente_id: string;
          cnpj: string;
          nome_titular: string;
          senha_ciphertext: string;
          senha_iv: string;
          senha_auth_tag: string;
          data_emissao: string | null;
          data_vencimento: string;
          status: CertificadoStatus;
          storage_path: string;
          nome_arquivo_original: string;
          hash_arquivo: string;
          ultimo_upload_em: string;
          renovacao_status: CertificateRenewalStatus;
          renovacao_observacao: string | null;
          renovacao_atualizado_em: string | null;
          renovacao_atualizado_por: string | null;
          criado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          cnpj: string;
          nome_titular: string;
          senha_ciphertext: string;
          senha_iv: string;
          senha_auth_tag: string;
          data_emissao?: string | null;
          data_vencimento: string;
          status?: CertificadoStatus;
          storage_path: string;
          nome_arquivo_original: string;
          hash_arquivo: string;
          ultimo_upload_em?: string;
          renovacao_status?: CertificateRenewalStatus;
          renovacao_observacao?: string | null;
          renovacao_atualizado_em?: string | null;
          renovacao_atualizado_por?: string | null;
          criado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["certificados"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "certificados_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      configuracoes_sistema: {
        Row: {
          id: string;
          dias_aviso_vencimento: number[];
          senha_admin_certificado_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dias_aviso_vencimento?: number[];
          senha_admin_certificado_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["configuracoes_sistema"]["Insert"]>;
        Relationships: [];
      };
      links_download: {
        Row: {
          id: string;
          certificado_id: string;
          token_hash: string;
          senha_hash: string;
          ativo: boolean;
          usado: boolean;
          usado_em: string | null;
          invalidado_em: string | null;
          criado_em: string;
          atualizado_em: string;
          ip_uso: string | null;
          user_agent_uso: string | null;
          tentativas_invalidas: number;
          bloqueado_ate: string | null;
        };
        Insert: {
          id?: string;
          certificado_id: string;
          token_hash: string;
          senha_hash: string;
          ativo?: boolean;
          usado?: boolean;
          usado_em?: string | null;
          invalidado_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
          ip_uso?: string | null;
          user_agent_uso?: string | null;
          tentativas_invalidas?: number;
          bloqueado_ate?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["links_download"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "links_download_certificado_id_fkey";
            columns: ["certificado_id"];
            referencedRelation: "certificados";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          acao: string;
          certificado_id: string | null;
          ip: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          acao: string;
          certificado_id?: string | null;
          ip?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      storage_reconciliation_jobs: {
        Row: {
          id: string;
          operation_type: "upload" | "delete" | "restore" | "verify";
          certificado_id: string | null;
          storage_path: string;
          status: "pending" | "processing" | "completed" | "failed";
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          operation_type: "upload" | "delete" | "restore" | "verify";
          certificado_id?: string | null;
          storage_path: string;
          status?: "pending" | "processing" | "completed" | "failed";
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["storage_reconciliation_jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "storage_reconciliation_jobs_certificado_id_fkey";
            columns: ["certificado_id"];
            referencedRelation: "certificados";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_settings: {
        Row: {
          id: string;
          enabled: boolean;
          expired_notifications_enabled: boolean;
          dias_aviso_vencimento: number[];
          delay_minimo_segundos: number;
          delay_maximo_segundos: number;
          max_attempts: number;
          polling_interval_seconds: number;
          send_window_start: string;
          send_window_end: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          enabled?: boolean;
          expired_notifications_enabled?: boolean;
          dias_aviso_vencimento?: number[];
          delay_minimo_segundos?: number;
          delay_maximo_segundos?: number;
          max_attempts?: number;
          polling_interval_seconds?: number;
          send_window_start?: string;
          send_window_end?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_settings"]["Insert"]>;
        Relationships: [];
      };
      notification_recipients: {
        Row: {
          id: string;
          nome: string;
          telefone: string;
          telefone_normalizado: string;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          telefone: string;
          telefone_normalizado: string;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_recipients"]["Insert"]>;
        Relationships: [];
      };
      notification_templates: {
        Row: {
          id: string;
          type: string;
          title: string;
          content: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type?: string;
          title: string;
          content: string;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_templates"]["Insert"]>;
        Relationships: [];
      };
      notification_events: {
        Row: {
          id: string;
          cliente_id: string | null;
          certificado_id: string | null;
          recipient_id: string | null;
          telefone_destino: string;
          template_id: string | null;
          type: string;
          dias_restantes: number;
          send_date: string;
          mensagem_renderizada: string;
          status: NotificationEventStatus;
          provider: NotificationProvider;
          audience: NotificationAudience;
          channel: string;
          provider_message_id: string | null;
          provider_status: string | null;
          dispatched_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          reservation_id: string | null;
          reserved_at: string | null;
          reservation_expires_at: string | null;
          processing_started_at: string | null;
          sent_at: string | null;
          failed_at: string | null;
          attempt_count: number;
          max_attempts: number;
          next_retry_at: string | null;
          idempotency_key: string | null;
          error_message: string | null;
          provider_response: Json | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id?: string | null;
          certificado_id?: string | null;
          recipient_id?: string | null;
          telefone_destino: string;
          template_id?: string | null;
          type?: string;
          dias_restantes: number;
          send_date: string;
          mensagem_renderizada: string;
          status?: NotificationEventStatus;
          provider?: NotificationProvider;
          audience?: NotificationAudience;
          channel?: string;
          provider_message_id?: string | null;
          provider_status?: string | null;
          dispatched_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
          reservation_id?: string | null;
          reserved_at?: string | null;
          reservation_expires_at?: string | null;
          processing_started_at?: string | null;
          sent_at?: string | null;
          failed_at?: string | null;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          idempotency_key?: string | null;
          error_message?: string | null;
          provider_response?: Json | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "notification_events_cliente_id_fkey";
            columns: ["cliente_id"];
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_events_certificado_id_fkey";
            columns: ["certificado_id"];
            referencedRelation: "certificados";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_events_recipient_id_fkey";
            columns: ["recipient_id"];
            referencedRelation: "notification_recipients";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_dispatcher_state: {
        Row: {
          provider: NotificationProvider;
          last_dispatch_at: string | null;
          next_allowed_send_at: string;
          locked_until: string | null;
          lock_id: string | null;
          updated_at: string;
        };
        Insert: {
          provider: NotificationProvider;
          last_dispatch_at?: string | null;
          next_allowed_send_at?: string;
          locked_until?: string | null;
          lock_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_dispatcher_state"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_provider_logs: {
        Row: {
          id: string;
          provider: NotificationProvider;
          event_id: string | null;
          audience: NotificationAudience | null;
          operation: string;
          telefone_mascarado: string | null;
          template_type: string | null;
          duration_ms: number | null;
          status: "started" | "sent" | "retry" | "failed" | "skipped" | "locked" | "waiting" | "error";
          attempt_count: number | null;
          error_code: string | null;
          error_message: string | null;
          request_id: string | null;
          response_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: NotificationProvider;
          event_id?: string | null;
          audience?: NotificationAudience | null;
          operation: string;
          telefone_mascarado?: string | null;
          template_type?: string | null;
          duration_ms?: number | null;
          status: "started" | "sent" | "retry" | "failed" | "skipped" | "locked" | "waiting" | "error";
          attempt_count?: number | null;
          error_code?: string | null;
          error_message?: string | null;
          request_id?: string | null;
          response_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_provider_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_provider_logs_event_id_fkey";
            columns: ["event_id"];
            referencedRelation: "notification_events";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          certificados_verificados: number;
          eventos_criados: number;
          eventos_ignorados_idempotencia: number;
          erro: string | null;
          triggered_by: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: string;
          certificados_verificados?: number;
          eventos_criados?: number;
          eventos_ignorados_idempotencia?: number;
          erro?: string | null;
          triggered_by: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      can_read_internal: { Args: Record<string, never>; Returns: boolean };
      current_user_role: { Args: Record<string, never>; Returns: UserRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_internal_user: { Args: Record<string, never>; Returns: boolean };
      registrar_upload_certificado: {
        Args: {
          p_cnpj: string;
          p_nome_razao_social: string;
          p_email: string | null;
          p_telefone: string | null;
          p_whatsapp: string | null;
          p_whatsapp_notifications_enabled: boolean;
          p_responsavel: string | null;
          p_observacoes: string | null;
          p_nome_titular: string;
          p_senha_ciphertext: string;
          p_senha_iv: string;
          p_senha_auth_tag: string;
          p_data_emissao: string | null;
          p_data_vencimento: string;
          p_status: CertificadoStatus;
          p_storage_path: string;
          p_nome_arquivo_original: string;
          p_hash_arquivo: string;
          p_criado_por: string;
          p_ip: string | null;
          p_certificado_id_existente?: string | null;
        };
        Returns: string;
      };
      excluir_certificado_com_cliente: {
        Args: {
          p_certificado_id: string;
          p_user_id: string;
          p_ip: string | null;
          p_metadata?: Json;
        };
        Returns: Json;
      };
      release_expired_notification_reservations: {
        Args: Record<string, never>;
        Returns: number;
      };
      refresh_certificado_statuses: {
        Args: {
          p_dias_aviso?: number[];
          p_today?: string;
        };
        Returns: number;
      };
      get_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: Json;
      };
      reserve_euatendo_notification_event: {
        Args: {
          p_lock_ttl_seconds?: number;
          p_ignore_next_allowed?: boolean;
        };
        Returns: Json;
      };
      reserve_whatsapp_extension_notification_event: {
        Args: {
          p_lock_ttl_seconds?: number;
          p_ignore_next_allowed?: boolean;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      certificado_status: CertificadoStatus;
      notification_event_status: NotificationEventStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
