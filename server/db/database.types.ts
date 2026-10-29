
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "answer_bank": {
                  Row: {
                    "answer": string,"canonical_question": string,"category": string | null,"id": string,"updated_at": string,"variants": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"canonical_question": string,"category"?: string | null,"id"?: string,"updated_at"?: string,"variants"?: (string)[]
                  }
                  Update: {
                    "answer"?: string,"canonical_question"?: string,"category"?: string | null,"id"?: string,"updated_at"?: string,"variants"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"application_questions": {
                  Row: {
                    "answer": string | null,"answer_bank_id": string | null,"application_id": string,"bucket": string,"field_type": string | null,"id": string,"options": Json | null,"question": string,"required": boolean,"user_approved": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"answer_bank_id"?: string | null,"application_id": string,"bucket": string,"field_type"?: string | null,"id"?: string,"options"?: Json | null,"question": string,"required"?: boolean,"user_approved"?: boolean
                  }
                  Update: {
                    "answer"?: string | null,"answer_bank_id"?: string | null,"application_id"?: string,"bucket"?: string,"field_type"?: string | null,"id"?: string,"options"?: Json | null,"question"?: string,"required"?: boolean,"user_approved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_questions_answer_bank_id_fkey"
      columns: ["answer_bank_id"]
isOneToOne: false
      referencedRelation: "answer_bank"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_questions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_questions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "public_status"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "apply_method": string | null,"approved_at": string | null,"confirmed_at": string | null,"cover_letter": string | null,"created_at": string,"id": string,"job_id": string,"last_status_at": string,"match_id": string | null,"resume_content": Json | null,"resume_pdf_path": string | null,"status": Database["public"]['Enums']["app_status"],"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_method"?: string | null,"approved_at"?: string | null,"confirmed_at"?: string | null,"cover_letter"?: string | null,"created_at"?: string,"id"?: string,"job_id": string,"last_status_at"?: string,"match_id"?: string | null,"resume_content"?: Json | null,"resume_pdf_path"?: string | null,"status"?: Database["public"]['Enums']["app_status"],"submitted_at"?: string | null
                  }
                  Update: {
                    "apply_method"?: string | null,"approved_at"?: string | null,"confirmed_at"?: string | null,"cover_letter"?: string | null,"created_at"?: string,"id"?: string,"job_id"?: string,"last_status_at"?: string,"match_id"?: string | null,"resume_content"?: Json | null,"resume_pdf_path"?: string | null,"status"?: Database["public"]['Enums']["app_status"],"submitted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "active": boolean,"ats": string,"board_token": string | null,"created_at": string,"id": string,"name": string,"priority": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"ats": string,"board_token"?: string | null,"created_at"?: string,"id"?: string,"name": string,"priority"?: number
                  }
                  Update: {
                    "active"?: boolean,"ats"?: string,"board_token"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"priority"?: number
                  }
                  Relationships: [
                    
                  ]
                },"criteria_versions": {
                  Row: {
                    "created_at": string,"criteria": NonNullable<Json>,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criteria": NonNullable<Json>,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"emails": {
                  Row: {
                    "application_id": string | null,"classification": string | null,"from_addr": string | null,"id": string,"match_confidence": number | null,"message_id": string,"processed_at": string,"received_at": string,"snippet": string | null,"subject": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"classification"?: string | null,"from_addr"?: string | null,"id"?: string,"match_confidence"?: number | null,"message_id": string,"processed_at"?: string,"received_at": string,"snippet"?: string | null,"subject"?: string | null
                  }
                  Update: {
                    "application_id"?: string | null,"classification"?: string | null,"from_addr"?: string | null,"id"?: string,"match_confidence"?: number | null,"message_id"?: string,"processed_at"?: string,"received_at"?: string,"snippet"?: string | null,"subject"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "emails_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "emails_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "public_status"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "application_id": string | null,"cause": string,"created_at": string,"detail": Json | null,"from_status": Database["public"]['Enums']["app_status"] | null,"id": number,"job_id": string | null,"to_status": Database["public"]['Enums']["app_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"cause": string,"created_at"?: string,"detail"?: Json | null,"from_status"?: Database["public"]['Enums']["app_status"] | null,"id"?: never,"job_id"?: string | null,"to_status"?: Database["public"]['Enums']["app_status"] | null
                  }
                  Update: {
                    "application_id"?: string | null,"cause"?: string,"created_at"?: string,"detail"?: Json | null,"from_status"?: Database["public"]['Enums']["app_status"] | null,"id"?: never,"job_id"?: string | null,"to_status"?: Database["public"]['Enums']["app_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "public_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence": {
                  Row: {
                    "application_id": string,"created_at": string,"email_message_id": string | null,"id": string,"kind": string,"storage_path": string | null,"text_excerpt": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind": string,"storage_path"?: string | null,"text_excerpt"?: string | null
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind"?: string,"storage_path"?: string | null,"text_excerpt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "public_status"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "apply_url": string | null,"closed_at": string | null,"company_id": string | null,"company_name": string,"dedup_key": string,"description_md": string | null,"external_id": string | null,"first_seen_at": string,"id": string,"last_seen_at": string,"location": string | null,"posted_at": string | null,"raw": Json | null,"remote_type": string | null,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"source": string,"title": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_url"?: string | null,"closed_at"?: string | null,"company_id"?: string | null,"company_name": string,"dedup_key": string,"description_md"?: string | null,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_type"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"source": string,"title": string,"url": string
                  }
                  Update: {
                    "apply_url"?: string | null,"closed_at"?: string | null,"company_id"?: string | null,"company_name"?: string,"dedup_key"?: string,"description_md"?: string | null,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_type"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"source"?: string,"title"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "created_at": string,"criteria_version_id": string,"hard_filter_passed": boolean,"hard_filter_reason": string | null,"id": string,"job_id": string,"model": string | null,"reasons": Json | null,"score": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criteria_version_id": string,"hard_filter_passed": boolean,"hard_filter_reason"?: string | null,"id"?: string,"job_id": string,"model"?: string | null,"reasons"?: Json | null,"score"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"criteria_version_id"?: string,"hard_filter_passed"?: boolean,"hard_filter_reason"?: string | null,"id"?: string,"job_id"?: string,"model"?: string | null,"reasons"?: Json | null,"score"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_criteria_version_id_fkey"
      columns: ["criteria_version_id"]
isOneToOne: false
      referencedRelation: "criteria_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"owner": {
                  Row: {
                    "created_at": string,"singleton": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"singleton"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"singleton"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"resume_versions": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"id": string,"is_master": boolean,"label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"created_at"?: string,"id"?: string,"is_master"?: boolean,"label": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_master"?: boolean,"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"runs": {
                  Row: {
                    "counts": Json | null,"error": string | null,"finished_at": string | null,"id": string,"ok": boolean | null,"source": string | null,"started_at": string,"worker": string
                  }
                  ComputedFields: never
                  Insert: {
                    "counts"?: Json | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"ok"?: boolean | null,"source"?: string | null,"started_at"?: string,"worker": string
                  }
                  Update: {
                    "counts"?: Json | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"ok"?: boolean | null,"source"?: string | null,"started_at"?: string,"worker"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"status_transitions": {
                  Row: {
                    "from_status": Database["public"]['Enums']["app_status"],"to_status": Database["public"]['Enums']["app_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "from_status": Database["public"]['Enums']["app_status"],"to_status": Database["public"]['Enums']["app_status"]
                  }
                  Update: {
                    "from_status"?: Database["public"]['Enums']["app_status"],"to_status"?: Database["public"]['Enums']["app_status"]
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "public_status": {
                  Row: {
                    "company_name": string | null,"created_at": string | null,"id": string | null,"job_title": string | null,"job_url": string | null,"last_status_at": string | null,"status": Database["public"]['Enums']["app_status"] | null,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"run_source_status": {
                  Row: {
                    "consecutive_failures": number | null,"first_run_at": string | null,"last_counts": Json | null,"last_error": string | null,"last_ok": boolean | null,"last_run_at": string | null,"last_success_at": string | null,"source": string | null,"worker": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "insert_discovered_jobs":
{ Args: { "p_jobs": Json }; Returns: Json
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"sync_board":
{ Args: { "p_company_id": string,"p_external_ids": (string)[],"p_source": string }; Returns: Json
                           },
"transition_application":
{ Args: { "p_application_id": string,"p_cause": string,"p_detail"?: Json,"p_to": Database["public"]['Enums']["app_status"] }; Returns: {
              "apply_method": string | null,
"approved_at": string | null,
"confirmed_at": string | null,
"cover_letter": string | null,
"created_at": string,
"id": string,
"job_id": string,
"last_status_at": string,
"match_id": string | null,
"resume_content": Json | null,
"resume_pdf_path": string | null,
"status": Database["public"]['Enums']["app_status"],
"submitted_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "applications"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "app_status": "queued"|"needs_input"|"manual"|"approved"|"submitted"|"confirmed"|"responded"|"interviewing"|"offer"|"rejected"|"skipped"|"expired"|"failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_status": ["queued", "needs_input", "manual", "approved", "submitted", "confirmed", "responded", "interviewing", "offer", "rejected", "skipped", "expired", "failed"]
          }
        }
} as const
