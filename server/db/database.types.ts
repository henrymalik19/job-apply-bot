
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "application_events": {
                  Row: {
                    "application_id": string | null,"cause": string,"created_at": string,"detail": Json | null,"from_status": string | null,"id": number,"job_id": string | null,"to_status": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"cause": string,"created_at"?: string,"detail"?: Json | null,"from_status"?: string | null,"id"?: never,"job_id"?: string | null,"to_status"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string | null,"cause"?: string,"created_at"?: string,"detail"?: Json | null,"from_status"?: string | null,"id"?: never,"job_id"?: string | null,"to_status"?: string | null,"updated_at"?: string
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
      referencedRelation: "public_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"application_evidence_items": {
                  Row: {
                    "application_id": string,"created_at": string,"email_message_id": string | null,"id": string,"kind": string,"storage_path": string | null,"text_excerpt": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind": string,"storage_path"?: string | null,"text_excerpt"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind"?: string,"storage_path"?: string | null,"text_excerpt"?: string | null,"updated_at"?: string
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
      referencedRelation: "public_applications"
      referencedColumns: ["id"]
    }
                  ]
                },"application_questions": {
                  Row: {
                    "answer": string | null,"answer_source": string | null,"answer_value": Json | null,"application_id": string,"bucket": string,"created_at": string,"description": string | null,"field_name": string | null,"field_type": string | null,"id": string,"needs_check": boolean,"options": Json | null,"question": string,"question_id": string | null,"reason": string | null,"required": boolean,"sort_order": number,"updated_at": string,"user_approved": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"answer_source"?: string | null,"answer_value"?: Json | null,"application_id": string,"bucket": string,"created_at"?: string,"description"?: string | null,"field_name"?: string | null,"field_type"?: string | null,"id"?: string,"needs_check"?: boolean,"options"?: Json | null,"question": string,"question_id"?: string | null,"reason"?: string | null,"required"?: boolean,"sort_order"?: number,"updated_at"?: string,"user_approved"?: boolean
                  }
                  Update: {
                    "answer"?: string | null,"answer_source"?: string | null,"answer_value"?: Json | null,"application_id"?: string,"bucket"?: string,"created_at"?: string,"description"?: string | null,"field_name"?: string | null,"field_type"?: string | null,"id"?: string,"needs_check"?: boolean,"options"?: Json | null,"question"?: string,"question_id"?: string | null,"reason"?: string | null,"required"?: boolean,"sort_order"?: number,"updated_at"?: string,"user_approved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_questions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_questions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "public_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"application_status_transitions": {
                  Row: {
                    "created_at": string,"from_status": string,"to_status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_status": string,"to_status": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"from_status"?: string,"to_status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"applications": {
                  Row: {
                    "apply_method": string | null,"approved_at": string | null,"confirmed_at": string | null,"cover_letter": string | null,"created_at": string,"flags": NonNullable<Json>,"id": string,"job_id": string,"last_status_at": string,"match_id": string | null,"prepare_error": string | null,"prepared_at": string | null,"resume_content": Json | null,"resume_pdf_path": string | null,"status": string,"submitted_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_method"?: string | null,"approved_at"?: string | null,"confirmed_at"?: string | null,"cover_letter"?: string | null,"created_at"?: string,"flags"?: NonNullable<Json>,"id"?: string,"job_id": string,"last_status_at"?: string,"match_id"?: string | null,"prepare_error"?: string | null,"prepared_at"?: string | null,"resume_content"?: Json | null,"resume_pdf_path"?: string | null,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "apply_method"?: string | null,"approved_at"?: string | null,"confirmed_at"?: string | null,"cover_letter"?: string | null,"created_at"?: string,"flags"?: NonNullable<Json>,"id"?: string,"job_id"?: string,"last_status_at"?: string,"match_id"?: string | null,"prepare_error"?: string | null,"prepared_at"?: string | null,"resume_content"?: Json | null,"resume_pdf_path"?: string | null,"status"?: string,"submitted_at"?: string | null,"updated_at"?: string
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
                },"certifications": {
                  Row: {
                    "created_at": string,"credential_url": string | null,"expires_on": string | null,"id": string,"issued_on": string | null,"issuer": string | null,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credential_url"?: string | null,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"issuer"?: string | null,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"credential_url"?: string | null,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"issuer"?: string | null,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "active": boolean,"ats": string,"board_token": string | null,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"ats": string,"board_token"?: string | null,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"ats"?: string,"board_token"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"educations": {
                  Row: {
                    "completed": boolean,"created_at": string,"degree": string | null,"end_year": number | null,"field_of_study": string | null,"id": string,"institution": string,"sort_order": number,"start_year": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed"?: boolean,"created_at"?: string,"degree"?: string | null,"end_year"?: number | null,"field_of_study"?: string | null,"id"?: string,"institution": string,"sort_order"?: number,"start_year"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "completed"?: boolean,"created_at"?: string,"degree"?: string | null,"end_year"?: number | null,"field_of_study"?: string | null,"id"?: string,"institution"?: string,"sort_order"?: number,"start_year"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"emails": {
                  Row: {
                    "application_id": string | null,"classification": string | null,"created_at": string,"from_addr": string | null,"id": string,"match_confidence": number | null,"message_id": string,"processed_at": string,"received_at": string,"snippet": string | null,"subject": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"classification"?: string | null,"created_at"?: string,"from_addr"?: string | null,"id"?: string,"match_confidence"?: number | null,"message_id": string,"processed_at"?: string,"received_at": string,"snippet"?: string | null,"subject"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string | null,"classification"?: string | null,"created_at"?: string,"from_addr"?: string | null,"id"?: string,"match_confidence"?: number | null,"message_id"?: string,"processed_at"?: string,"received_at"?: string,"snippet"?: string | null,"subject"?: string | null,"updated_at"?: string
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
      referencedRelation: "public_applications"
      referencedColumns: ["id"]
    }
                  ]
                },"employment_responsibilities": {
                  Row: {
                    "created_at": string,"employment_id": string,"id": string,"sort_order": number,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"employment_id": string,"id"?: string,"sort_order"?: number,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"employment_id"?: string,"id"?: string,"sort_order"?: number,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employment_responsibilities_employment_id_fkey"
      columns: ["employment_id"]
isOneToOne: false
      referencedRelation: "employments"
      referencedColumns: ["id"]
    }
                  ]
                },"employment_skills": {
                  Row: {
                    "created_at": string,"employment_id": string,"skill_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"employment_id": string,"skill_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"employment_id"?: string,"skill_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employment_skills_employment_id_fkey"
      columns: ["employment_id"]
isOneToOne: false
      referencedRelation: "employments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_skills_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"employments": {
                  Row: {
                    "created_at": string,"description": string | null,"employer": string,"employment_type": string | null,"end_date": string | null,"id": string,"is_current": boolean,"location": string | null,"sort_order": number,"start_date": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"employer": string,"employment_type"?: string | null,"end_date"?: string | null,"id"?: string,"is_current"?: boolean,"location"?: string | null,"sort_order"?: number,"start_date": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"employer"?: string,"employment_type"?: string | null,"end_date"?: string | null,"id"?: string,"is_current"?: boolean,"location"?: string | null,"sort_order"?: number,"start_date"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"jobs": {
                  Row: {
                    "apply_url": string | null,"closed_at": string | null,"company_id": string | null,"company_name": string,"created_at": string,"dedup_key": string,"description_md": string | null,"external_id": string | null,"first_seen_at": string,"id": string,"last_seen_at": string,"location": string | null,"posted_at": string | null,"raw": Json | null,"remote_type": string | null,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"source": string,"title": string,"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apply_url"?: string | null,"closed_at"?: string | null,"company_id"?: string | null,"company_name": string,"created_at"?: string,"dedup_key": string,"description_md"?: string | null,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_type"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"source": string,"title": string,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "apply_url"?: string | null,"closed_at"?: string | null,"company_id"?: string | null,"company_name"?: string,"created_at"?: string,"dedup_key"?: string,"description_md"?: string | null,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_type"?: string | null,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"source"?: string,"title"?: string,"updated_at"?: string,"url"?: string
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
                },"lessons": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"platform": string | null,"rule": string,"scope": string,"source": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"platform"?: string | null,"rule": string,"scope"?: string,"source"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"platform"?: string | null,"rule"?: string,"scope"?: string,"source"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"llm_calls": {
                  Row: {
                    "cache_read_tokens": number,"cache_write_tokens": number,"cost_usd": number,"created_at": string,"id": string,"input_tokens": number,"job_id": string | null,"model": string,"output_tokens": number,"purpose": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_read_tokens"?: number,"cache_write_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"id"?: string,"input_tokens"?: number,"job_id"?: string | null,"model": string,"output_tokens"?: number,"purpose": string,"updated_at"?: string
                  }
                  Update: {
                    "cache_read_tokens"?: number,"cache_write_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"id"?: string,"input_tokens"?: number,"job_id"?: string | null,"model"?: string,"output_tokens"?: number,"purpose"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "llm_usage_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"match_criteria": {
                  Row: {
                    "created_at": string,"dealbreakers": (string)[],"excluded_companies": (string)[],"notes": string,"roles": (string)[],"salary_max": number | null,"salary_min": number | null,"seniority": (string)[],"threshold": number,"updated_at": string,"user_id": string,"willing_to_relocate": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dealbreakers"?: (string)[],"excluded_companies"?: (string)[],"notes"?: string,"roles"?: (string)[],"salary_max"?: number | null,"salary_min"?: number | null,"seniority"?: (string)[],"threshold"?: number,"updated_at"?: string,"user_id": string,"willing_to_relocate"?: boolean | null
                  }
                  Update: {
                    "created_at"?: string,"dealbreakers"?: (string)[],"excluded_companies"?: (string)[],"notes"?: string,"roles"?: (string)[],"salary_max"?: number | null,"salary_min"?: number | null,"seniority"?: (string)[],"threshold"?: number,"updated_at"?: string,"user_id"?: string,"willing_to_relocate"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_criteria_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "created_at": string,"error": string | null,"hard_filter_passed": boolean,"hard_filter_reason": string | null,"id": string,"job_id": string,"model": string | null,"reasons": Json | null,"score": number | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"hard_filter_passed": boolean,"hard_filter_reason"?: string | null,"id"?: string,"job_id": string,"model"?: string | null,"reasons"?: Json | null,"score"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"hard_filter_passed"?: boolean,"hard_filter_reason"?: string | null,"id"?: string,"job_id"?: string,"model"?: string | null,"reasons"?: Json | null,"score"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_facts": {
                  Row: {
                    "active": boolean,"category": string,"confirmed_at": string,"created_at": string,"fact": string,"id": string,"sort_order": number,"source": string | null,"structured": Json | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category": string,"confirmed_at"?: string,"created_at"?: string,"fact": string,"id"?: string,"sort_order"?: number,"source"?: string | null,"structured"?: Json | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string,"confirmed_at"?: string,"created_at"?: string,"fact"?: string,"id"?: string,"sort_order"?: number,"source"?: string | null,"structured"?: Json | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profile_skills": {
                  Row: {
                    "created_at": string,"last_used_year": number | null,"proficiency": string | null,"skill_id": string,"sort_order": number,"updated_at": string,"years_override": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"last_used_year"?: number | null,"proficiency"?: string | null,"skill_id": string,"sort_order"?: number,"updated_at"?: string,"years_override"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"last_used_year"?: number | null,"proficiency"?: string | null,"skill_id"?: string,"sort_order"?: number,"updated_at"?: string,"years_override"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_skills_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: true
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "city": string | null,"country": string,"created_at": string,"email": string | null,"first_name": string | null,"github_url": string | null,"headline": string | null,"last_name": string | null,"linkedin_url": string | null,"notice_period": string | null,"phone": string | null,"postal_code": string | null,"preferred_name": string | null,"state": string | null,"summary": string | null,"updated_at": string,"user_id": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"email"?: string | null,"first_name"?: string | null,"github_url"?: string | null,"headline"?: string | null,"last_name"?: string | null,"linkedin_url"?: string | null,"notice_period"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"preferred_name"?: string | null,"state"?: string | null,"summary"?: string | null,"updated_at"?: string,"user_id": string,"website_url"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"email"?: string | null,"first_name"?: string | null,"github_url"?: string | null,"headline"?: string | null,"last_name"?: string | null,"linkedin_url"?: string | null,"notice_period"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"preferred_name"?: string | null,"state"?: string | null,"summary"?: string | null,"updated_at"?: string,"user_id"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"question_aliases": {
                  Row: {
                    "confidence": number | null,"confirmed": boolean,"created_at": string,"normalized_text": string,"polarity": string,"question_id": string,"skill_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: number | null,"confirmed"?: boolean,"created_at"?: string,"normalized_text": string,"polarity"?: string,"question_id": string,"skill_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "confidence"?: number | null,"confirmed"?: boolean,"created_at"?: string,"normalized_text"?: string,"polarity"?: string,"question_id"?: string,"skill_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_aliases_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_aliases_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"question_answers": {
                  Row: {
                    "created_at": string,"question_id": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"question_id": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"question_id"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: true
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "answer_source": string,"answer_type": string,"category": string,"created_at": string,"id": string,"key": string,"label": string,"source_field": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_source": string,"answer_type": string,"category"?: string,"created_at"?: string,"id"?: string,"key": string,"label": string,"source_field"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "answer_source"?: string,"answer_type"?: string,"category"?: string,"created_at"?: string,"id"?: string,"key"?: string,"label"?: string,"source_field"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"resumes": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"id": string,"is_master": boolean,"label": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"created_at"?: string,"id"?: string,"is_master"?: boolean,"label": string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_master"?: boolean,"label"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "created_at": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"skill_aliases": {
                  Row: {
                    "alias": string,"created_at": string,"skill_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias": string,"created_at"?: string,"skill_id": string,"updated_at"?: string
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string,"skill_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_aliases_skill_id_fkey"
      columns: ["skill_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id"]
    }
                  ]
                },"skills": {
                  Row: {
                    "category": string | null,"created_at": string,"id": string,"name": string,"normalized": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"name": string,"normalized": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"normalized"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"id": string,"role": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"role"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"work_authorizations": {
                  Row: {
                    "authorized": boolean,"country": string,"created_at": string,"id": string,"notes": string | null,"requires_sponsorship": boolean,"status": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authorized": boolean,"country": string,"created_at"?: string,"id"?: string,"notes"?: string | null,"requires_sponsorship": boolean,"status"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "authorized"?: boolean,"country"?: string,"created_at"?: string,"id"?: string,"notes"?: string | null,"requires_sponsorship"?: boolean,"status"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"worker_runs": {
                  Row: {
                    "counts": Json | null,"created_at": string,"error": string | null,"finished_at": string | null,"id": string,"ok": boolean | null,"samples": Json | null,"source": string | null,"started_at": string,"updated_at": string,"worker": string
                  }
                  ComputedFields: never
                  Insert: {
                    "counts"?: Json | null,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"ok"?: boolean | null,"samples"?: Json | null,"source"?: string | null,"started_at"?: string,"updated_at"?: string,"worker": string
                  }
                  Update: {
                    "counts"?: Json | null,"created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"ok"?: boolean | null,"samples"?: Json | null,"source"?: string | null,"started_at"?: string,"updated_at"?: string,"worker"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "public_applications": {
                  Row: {
                    "company_name": string | null,"created_at": string | null,"id": string | null,"job_title": string | null,"job_url": string | null,"last_status_at": string | null,"status": string | null,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"worker_source_statuses": {
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
{ Args: { "p_application_id": string,"p_cause": string,"p_detail"?: Json,"p_to": string }; Returns: {
              "apply_method": string | null,
"approved_at": string | null,
"confirmed_at": string | null,
"cover_letter": string | null,
"created_at": string,
"flags": NonNullable<Json>,
"id": string,
"job_id": string,
"last_status_at": string,
"match_id": string | null,
"prepare_error": string | null,
"prepared_at": string | null,
"resume_content": Json | null,
"resume_pdf_path": string | null,
"status": string,
"submitted_at": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "applications"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
