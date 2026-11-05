
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "advance_installments": {
                  Row: {
                    "advance_id": string,"amount": number,"company_id": string,"created_at": string,"created_by": string | null,"employee_id": string,"id": string,"method": string,"notes": string | null,"payment_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advance_id": string,"amount": number,"company_id": string,"created_at"?: string,"created_by"?: string | null,"employee_id": string,"id"?: string,"method": string,"notes"?: string | null,"payment_date": string
                  }
                  Update: {
                    "advance_id"?: string,"amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"id"?: string,"method"?: string,"notes"?: string | null,"payment_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "advance_installments_advance_id_fkey"
      columns: ["advance_id"]
isOneToOne: false
      referencedRelation: "advance_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "advance_installments_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "advance_installments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"advance_requests": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"employee_id": string,"id": string,"installments_count": number,"monthly_installment": number,"paid_amount": number,"reason": string,"remaining_amount": number | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id": string,"id"?: string,"installments_count": number,"monthly_installment": number,"paid_amount"?: number,"reason": string,"remaining_amount"?: never,"status"?: string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id"?: string,"id"?: string,"installments_count"?: number,"monthly_installment"?: number,"paid_amount"?: number,"reason"?: string,"remaining_amount"?: never,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "advance_requests_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "advance_requests_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_deductions": {
                  Row: {
                    "company_id": string,"created_at": string,"day_fraction": number,"decided_at": string | null,"decided_by": string | null,"employee_id": string,"id": string,"kind": string,"minutes": number,"note": string | null,"status": string,"work_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"day_fraction": number,"decided_at"?: string | null,"decided_by"?: string | null,"employee_id": string,"id"?: string,"kind": string,"minutes"?: number,"note"?: string | null,"status"?: string,"work_date": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"day_fraction"?: number,"decided_at"?: string | null,"decided_by"?: string | null,"employee_id"?: string,"id"?: string,"kind"?: string,"minutes"?: number,"note"?: string | null,"status"?: string,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_deductions_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attendance_deductions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_records": {
                  Row: {
                    "branch_id": string | null,"check_in_accuracy_m": number | null,"check_in_at": string | null,"check_in_distance_m": number | null,"check_in_lat": number | null,"check_in_lng": number | null,"check_in_outside": boolean,"check_out_accuracy_m": number | null,"check_out_at": string | null,"check_out_distance_m": number | null,"check_out_lat": number | null,"check_out_lng": number | null,"check_out_outside": boolean,"company_id": string,"corrected_by": string | null,"correction_note": string | null,"created_at": string,"early_minutes": number,"employee_id": string,"id": string,"late_minutes": number,"shift_id": string,"source": string,"status": string,"work_date": string,"worked_minutes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"check_in_accuracy_m"?: number | null,"check_in_at"?: string | null,"check_in_distance_m"?: number | null,"check_in_lat"?: number | null,"check_in_lng"?: number | null,"check_in_outside"?: boolean,"check_out_accuracy_m"?: number | null,"check_out_at"?: string | null,"check_out_distance_m"?: number | null,"check_out_lat"?: number | null,"check_out_lng"?: number | null,"check_out_outside"?: boolean,"company_id": string,"corrected_by"?: string | null,"correction_note"?: string | null,"created_at"?: string,"early_minutes"?: number,"employee_id": string,"id"?: string,"late_minutes"?: number,"shift_id": string,"source"?: string,"status"?: string,"work_date": string,"worked_minutes"?: number | null
                  }
                  Update: {
                    "branch_id"?: string | null,"check_in_accuracy_m"?: number | null,"check_in_at"?: string | null,"check_in_distance_m"?: number | null,"check_in_lat"?: number | null,"check_in_lng"?: number | null,"check_in_outside"?: boolean,"check_out_accuracy_m"?: number | null,"check_out_at"?: string | null,"check_out_distance_m"?: number | null,"check_out_lat"?: number | null,"check_out_lng"?: number | null,"check_out_outside"?: boolean,"company_id"?: string,"corrected_by"?: string | null,"correction_note"?: string | null,"created_at"?: string,"early_minutes"?: number,"employee_id"?: string,"id"?: string,"late_minutes"?: number,"shift_id"?: string,"source"?: string,"status"?: string,"work_date"?: string,"worked_minutes"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_company_id_branch_id_fkey"
      columns: ["company_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attendance_records_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "attendance_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_company_id_shift_id_fkey"
      columns: ["company_id","shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"attendance_rules": {
                  Row: {
                    "absence_fraction": number,"company_id": string,"early_grace_minutes": number,"late_tier1_fraction": number,"late_tier1_minutes": number,"late_tier2_fraction": number,"late_tier2_minutes": number,"late_tier3_fraction": number,"late_tier3_minutes": number,"late_tier4_fraction": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absence_fraction"?: number,"company_id": string,"early_grace_minutes"?: number,"late_tier1_fraction"?: number,"late_tier1_minutes"?: number,"late_tier2_fraction"?: number,"late_tier2_minutes"?: number,"late_tier3_fraction"?: number,"late_tier3_minutes"?: number,"late_tier4_fraction"?: number,"updated_at"?: string
                  }
                  Update: {
                    "absence_fraction"?: number,"company_id"?: string,"early_grace_minutes"?: number,"late_tier1_fraction"?: number,"late_tier1_minutes"?: number,"late_tier2_fraction"?: number,"late_tier2_minutes"?: number,"late_tier3_fraction"?: number,"late_tier3_minutes"?: number,"late_tier4_fraction"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_rules_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"company_id": string | null,"created_at": string,"id": number,"meta": NonNullable<Json>,"target_id": string | null,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"company_id"?: string | null,"created_at"?: string,"id"?: never,"meta"?: NonNullable<Json>,"target_id"?: string | null,"target_type": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"company_id"?: string | null,"created_at"?: string,"id"?: never,"meta"?: NonNullable<Json>,"target_id"?: string | null,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"latitude": number,"longitude": number,"name_ar": string,"name_en": string | null,"radius_m": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"latitude": number,"longitude": number,"name_ar": string,"name_en"?: string | null,"radius_m"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"latitude"?: number,"longitude"?: number,"name_ar"?: string,"name_en"?: string | null,"radius_m"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "address": string | null,"commercial_reg": string | null,"created_at": string,"email": string | null,"id": string,"logo_path": string | null,"max_employees": number,"name_ar": string,"name_en": string | null,"phone": string | null,"settings": NonNullable<Json>,"status": Database["public"]['Enums']["company_status"],"subscription_ends_at": string,"tax_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"commercial_reg"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"logo_path"?: string | null,"max_employees": number,"name_ar": string,"name_en"?: string | null,"phone"?: string | null,"settings"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["company_status"],"subscription_ends_at": string,"tax_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"commercial_reg"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"logo_path"?: string | null,"max_employees"?: number,"name_ar"?: string,"name_en"?: string | null,"phone"?: string | null,"settings"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["company_status"],"subscription_ends_at"?: string,"tax_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"company_calendar": {
                  Row: {
                    "company_id": string,"created_at": string,"end_date": string,"id": string,"kind": string,"name_ar": string,"name_en": string | null,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"end_date": string,"id"?: string,"kind": string,"name_ar": string,"name_en"?: string | null,"start_date": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"end_date"?: string,"id"?: string,"kind"?: string,"name_ar"?: string,"name_en"?: string | null,"start_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_calendar_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"name_ar": string,"name_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"name_ar": string,"name_en"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"name_ar"?: string,"name_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "departments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_compensation": {
                  Row: {
                    "bank_name": string | null,"basic_salary": number,"communication_allowance": number,"company_id": string,"employee_id": string,"gosi_number": string | null,"housing_allowance": number,"iban": string | null,"other_allowances": number,"transport_allowance": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bank_name"?: string | null,"basic_salary"?: number,"communication_allowance"?: number,"company_id": string,"employee_id": string,"gosi_number"?: string | null,"housing_allowance"?: number,"iban"?: string | null,"other_allowances"?: number,"transport_allowance"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "bank_name"?: string | null,"basic_salary"?: number,"communication_allowance"?: number,"company_id"?: string,"employee_id"?: string,"gosi_number"?: string | null,"housing_allowance"?: number,"iban"?: string | null,"other_allowances"?: number,"transport_allowance"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_compensation_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"employee_documents": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"doc_type": Database["public"]['Enums']["document_type"],"employee_id": string,"expiry_date": string | null,"file_name": string | null,"file_path": string | null,"id": string,"issue_date": string | null,"mime_type": string | null,"number": string | null,"size_bytes": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"doc_type": Database["public"]['Enums']["document_type"],"employee_id": string,"expiry_date"?: string | null,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"issue_date"?: string | null,"mime_type"?: string | null,"number"?: string | null,"size_bytes"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"doc_type"?: Database["public"]['Enums']["document_type"],"employee_id"?: string,"expiry_date"?: string | null,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"issue_date"?: string | null,"mime_type"?: string | null,"number"?: string | null,"size_bytes"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_documents_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "birth_date": string | null,"branch_id": string | null,"company_id": string,"contract_end": string | null,"contract_start": string | null,"contract_type": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"department_id": string | null,"disabled_at": string | null,"email": string | null,"employee_number": string | null,"full_name_ar": string,"full_name_en": string | null,"gender": string | null,"hire_date": string | null,"id": string,"id_type": Database["public"]['Enums']["id_type"],"job_title": string | null,"locale": string,"manager_id": string | null,"marital_status": string | null,"national_id": string,"nationality": string | null,"occupation": string | null,"phone": string | null,"probation_days": number | null,"role": Database["public"]['Enums']["employee_role"],"shift_id": string | null,"shift_since": string | null,"status": Database["public"]['Enums']["employee_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_date"?: string | null,"branch_id"?: string | null,"company_id": string,"contract_end"?: string | null,"contract_start"?: string | null,"contract_type"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"department_id"?: string | null,"disabled_at"?: string | null,"email"?: string | null,"employee_number"?: string | null,"full_name_ar": string,"full_name_en"?: string | null,"gender"?: string | null,"hire_date"?: string | null,"id"?: string,"id_type": Database["public"]['Enums']["id_type"],"job_title"?: string | null,"locale"?: string,"manager_id"?: string | null,"marital_status"?: string | null,"national_id": string,"nationality"?: string | null,"occupation"?: string | null,"phone"?: string | null,"probation_days"?: number | null,"role"?: Database["public"]['Enums']["employee_role"],"shift_id"?: string | null,"shift_since"?: string | null,"status"?: Database["public"]['Enums']["employee_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "birth_date"?: string | null,"branch_id"?: string | null,"company_id"?: string,"contract_end"?: string | null,"contract_start"?: string | null,"contract_type"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"department_id"?: string | null,"disabled_at"?: string | null,"email"?: string | null,"employee_number"?: string | null,"full_name_ar"?: string,"full_name_en"?: string | null,"gender"?: string | null,"hire_date"?: string | null,"id"?: string,"id_type"?: Database["public"]['Enums']["id_type"],"job_title"?: string | null,"locale"?: string,"manager_id"?: string | null,"marital_status"?: string | null,"national_id"?: string,"nationality"?: string | null,"occupation"?: string | null,"phone"?: string | null,"probation_days"?: number | null,"role"?: Database["public"]['Enums']["employee_role"],"shift_id"?: string | null,"shift_since"?: string | null,"status"?: Database["public"]['Enums']["employee_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_branch_fk"
      columns: ["company_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "employees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_company_id_manager_id_fkey"
      columns: ["company_id","manager_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "employees_department_fk"
      columns: ["company_id","department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "employees_manager_fk"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_shift_fk"
      columns: ["company_id","shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"leave_adjustments": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"days": number,"employee_id": string,"id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"days": number,"employee_id": string,"id"?: string,"reason": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"days"?: number,"employee_id"?: string,"id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_adjustments_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "leave_adjustments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "company_id": string,"created_at": string,"days": number,"days_full": number | null,"days_three_quarter": number | null,"days_unpaid": number | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"employee_id": string,"end_date": string,"id": string,"manager_approved_at": string | null,"manager_approved_by": string | null,"medical_ref": string | null,"reason": string | null,"start_date": string,"status": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"days": number,"days_full"?: number | null,"days_three_quarter"?: number | null,"days_unpaid"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id": string,"end_date": string,"id"?: string,"manager_approved_at"?: string | null,"manager_approved_by"?: string | null,"medical_ref"?: string | null,"reason"?: string | null,"start_date": string,"status": string,"type": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"days"?: number,"days_full"?: number | null,"days_three_quarter"?: number | null,"days_unpaid"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"employee_id"?: string,"end_date"?: string,"id"?: string,"manager_approved_at"?: string | null,"manager_approved_by"?: string | null,"medical_ref"?: string | null,"reason"?: string | null,"start_date"?: string,"status"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "leave_requests_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"advance_id": string | null,"company_id": string,"created_at": string,"days_left": number | null,"document_id": string | null,"id": number,"leave_id": string | null,"payroll_slip_id": string | null,"read_at": string | null,"recipient_id": string,"task_id": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"advance_id"?: string | null,"company_id": string,"created_at"?: string,"days_left"?: number | null,"document_id"?: string | null,"id"?: never,"leave_id"?: string | null,"payroll_slip_id"?: string | null,"read_at"?: string | null,"recipient_id": string,"task_id"?: string | null,"type": string
                  }
                  Update: {
                    "actor_id"?: string | null,"advance_id"?: string | null,"company_id"?: string,"created_at"?: string,"days_left"?: number | null,"document_id"?: string | null,"id"?: never,"leave_id"?: string | null,"payroll_slip_id"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"task_id"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_advance_id_fkey"
      columns: ["advance_id"]
isOneToOne: false
      referencedRelation: "advance_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_company_id_recipient_id_fkey"
      columns: ["company_id","recipient_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "notifications_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "employee_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_leave_id_fkey"
      columns: ["leave_id"]
isOneToOne: false
      referencedRelation: "leave_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_payroll_slip_id_fkey"
      columns: ["payroll_slip_id"]
isOneToOne: false
      referencedRelation: "payroll_slips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"payroll_runs": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"company_id": string,"created_at": string,"created_by": string | null,"employee_count": number,"id": string,"month": number,"notes": string | null,"status": string,"total_advance_deductions": number,"total_attendance_deductions": number,"total_basic": number,"total_deductions": number,"total_gosi_employee": number,"total_gosi_employer": number,"total_gross": number,"total_housing": number,"total_leave_deductions": number,"total_net": number,"total_other_allowances": number,"total_other_deductions": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"employee_count"?: number,"id"?: string,"month": number,"notes"?: string | null,"status"?: string,"total_advance_deductions"?: number,"total_attendance_deductions"?: number,"total_basic"?: number,"total_deductions"?: number,"total_gosi_employee"?: number,"total_gosi_employer"?: number,"total_gross"?: number,"total_housing"?: number,"total_leave_deductions"?: number,"total_net"?: number,"total_other_allowances"?: number,"total_other_deductions"?: number,"year": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"employee_count"?: number,"id"?: string,"month"?: number,"notes"?: string | null,"status"?: string,"total_advance_deductions"?: number,"total_attendance_deductions"?: number,"total_basic"?: number,"total_deductions"?: number,"total_gosi_employee"?: number,"total_gosi_employer"?: number,"total_gross"?: number,"total_housing"?: number,"total_leave_deductions"?: number,"total_net"?: number,"total_other_allowances"?: number,"total_other_deductions"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payroll_runs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"payroll_slips": {
                  Row: {
                    "advance_deduction": number,"attendance_deduction": number,"bank_name": string | null,"basic_salary": number,"communication_allowance": number,"company_id": string,"created_at": string,"employee_id": string,"gosi_employee": number,"gosi_employer": number,"gross_salary": number,"housing_allowance": number,"iban": string | null,"id": string,"leave_deduction": number,"net_salary": number,"notes": string | null,"other_allowances": number,"other_deductions": number,"payroll_run_id": string,"total_deductions": number,"transport_allowance": number
                  }
                  ComputedFields: never
                  Insert: {
                    "advance_deduction"?: number,"attendance_deduction"?: number,"bank_name"?: string | null,"basic_salary"?: number,"communication_allowance"?: number,"company_id": string,"created_at"?: string,"employee_id": string,"gosi_employee"?: number,"gosi_employer"?: number,"gross_salary"?: number,"housing_allowance"?: number,"iban"?: string | null,"id"?: string,"leave_deduction"?: number,"net_salary"?: number,"notes"?: string | null,"other_allowances"?: number,"other_deductions"?: number,"payroll_run_id": string,"total_deductions"?: number,"transport_allowance"?: number
                  }
                  Update: {
                    "advance_deduction"?: number,"attendance_deduction"?: number,"bank_name"?: string | null,"basic_salary"?: number,"communication_allowance"?: number,"company_id"?: string,"created_at"?: string,"employee_id"?: string,"gosi_employee"?: number,"gosi_employer"?: number,"gross_salary"?: number,"housing_allowance"?: number,"iban"?: string | null,"id"?: string,"leave_deduction"?: number,"net_salary"?: number,"notes"?: string | null,"other_allowances"?: number,"other_deductions"?: number,"payroll_run_id"?: string,"total_deductions"?: number,"transport_allowance"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payroll_slips_company_id_employee_id_fkey"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "payroll_slips_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payroll_slips_payroll_run_id_fkey"
      columns: ["payroll_run_id"]
isOneToOne: false
      referencedRelation: "payroll_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"full_name": string,"national_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"national_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"national_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"report_attachments": {
                  Row: {
                    "company_id": string,"created_at": string,"file_name": string,"file_path": string,"id": string,"mime_type": string,"report_id": string,"size_bytes": number,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"file_name": string,"file_path": string,"id"?: string,"mime_type": string,"report_id": string,"size_bytes": number,"task_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"file_name"?: string,"file_path"?: string,"id"?: string,"mime_type"?: string,"report_id"?: string,"size_bytes"?: number,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_attachments_company_id_report_id_fkey"
      columns: ["company_id","report_id"]
isOneToOne: false
      referencedRelation: "task_reports"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "company_id": string,"created_at": string,"end_time": string,"grace_minutes": number,"id": string,"name_ar": string,"name_en": string | null,"ramadan_hours": number,"start_time": string,"work_days": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"end_time": string,"grace_minutes"?: number,"id"?: string,"name_ar": string,"name_en"?: string | null,"ramadan_hours"?: number,"start_time": string,"work_days"?: (number)[]
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"end_time"?: string,"grace_minutes"?: number,"id"?: string,"name_ar"?: string,"name_en"?: string | null,"ramadan_hours"?: number,"start_time"?: string,"work_days"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"task_reports": {
                  Row: {
                    "company_id": string,"created_at": string,"hours_spent": number,"id": string,"links": (string)[],"obstacles": string | null,"rating": number | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"round": number,"status": Database["public"]['Enums']["report_status"],"submitted_by": string,"summary": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"hours_spent": number,"id"?: string,"links"?: (string)[],"obstacles"?: string | null,"rating"?: number | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"round": number,"status"?: Database["public"]['Enums']["report_status"],"submitted_by": string,"summary": string,"task_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"hours_spent"?: number,"id"?: string,"links"?: (string)[],"obstacles"?: string | null,"rating"?: number | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"round"?: number,"status"?: Database["public"]['Enums']["report_status"],"submitted_by"?: string,"summary"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_reports_company_id_submitted_by_fkey"
      columns: ["company_id","submitted_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "task_reports_company_id_task_id_fkey"
      columns: ["company_id","task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "approved_at": string | null,"assignee_id": string,"company_id": string,"created_at": string,"created_by": string,"description": string | null,"due_date": string,"due_time": string | null,"expected_hours": number | null,"id": string,"location": string | null,"priority": Database["public"]['Enums']["task_priority"],"rating": number | null,"started_at": string | null,"status": Database["public"]['Enums']["task_status"],"submitted_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"assignee_id": string,"company_id": string,"created_at"?: string,"created_by": string,"description"?: string | null,"due_date": string,"due_time"?: string | null,"expected_hours"?: number | null,"id"?: string,"location"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"rating"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"submitted_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"assignee_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"due_date"?: string,"due_time"?: string | null,"expected_hours"?: number | null,"id"?: string,"location"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"rating"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"submitted_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_company_id_assignee_id_fkey"
      columns: ["company_id","assignee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "tasks_company_id_created_by_fkey"
      columns: ["company_id","created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "tasks_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_create_company":
{ Args: { "p_commercial_reg": string,"p_max_employees": number,"p_name_ar": string,"p_name_en": string,"p_owner_name_ar": string,"p_owner_name_en": string,"p_owner_national_id": string,"p_owner_phone": string,"p_owner_user_id": string,"p_subscription_ends_at": string }; Returns: string
                           },
"advance_manual_repayment":
{ Args: { "p_advance_id": string,"p_amount": number,"p_note"?: string }; Returns: string
                           },
"advance_request_cancel":
{ Args: { "p_id": string }; Returns: undefined
                           },
"advance_request_create":
{ Args: { "p_amount": number,"p_installments": number,"p_reason": string }; Returns: string
                           },
"advance_request_decide":
{ Args: { "p_decision": string,"p_id": string,"p_note"?: string }; Returns: undefined
                           },
"attendance_assign":
{ Args: { "p_branch_id": string,"p_employee_ids": (string)[],"p_shift_id": string }; Returns: number
                           },
"attendance_check_in":
{ Args: { "p_accuracy"?: number,"p_lat"?: number,"p_lng"?: number }; Returns: Json
                           },
"attendance_check_out":
{ Args: { "p_accuracy"?: number,"p_lat"?: number,"p_lng"?: number }; Returns: Json
                           },
"attendance_correct":
{ Args: { "p_check_in": string,"p_check_out": string,"p_date": string,"p_employee_id": string,"p_note": string }; Returns: string
                           },
"attendance_deduction_decide":
{ Args: { "p_decision": string,"p_id": string,"p_note"?: string }; Returns: undefined
                           },
"can_manage_employee":
{ Args: { "p_employee_id": string }; Returns: boolean
                           },
"can_submit_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"company_set_logo":
{ Args: { "p_logo_path": string }; Returns: string
                           },
"company_update_profile":
{ Args: { "p_commercial_reg": string,"p_name_ar": string,"p_name_en": string }; Returns: undefined
                           } |
{ Args: { "p_address"?: string,"p_commercial_reg": string,"p_email"?: string,"p_name_ar": string,"p_name_en": string,"p_phone"?: string,"p_tax_number"?: string }; Returns: undefined
                           },
"consume_rate_limit":
{ Args: { "p_kind": string }; Returns: undefined
                           },
"employee_assign_user":
{ Args: { "p_employee_id": string,"p_locale": string,"p_role": Database["public"]['Enums']["employee_role"],"p_user_id": string }; Returns: undefined
                           },
"employee_create":
{ Args: { "p_file": Json,"p_national_id": string,"p_pay": Json,"p_role": Database["public"]['Enums']["employee_role"],"p_user_id": string }; Returns: string
                           },
"employee_create_begin":
{ Args: { "p_role": Database["public"]['Enums']["employee_role"] }; Returns: undefined
                           },
"employee_delete_begin":
{ Args: { "p_employee_id": string }; Returns: string
                           },
"employee_delete_finish":
{ Args: { "p_employee_id": string }; Returns: undefined
                           },
"employee_gosi_preview":
{ Args: { "p_employee_id": string }; Returns: Json
                           },
"employee_password_reset_begin":
{ Args: { "p_employee_id": string }; Returns: string
                           },
"employee_set_status":
{ Args: { "p_employee_id": string,"p_status": Database["public"]['Enums']["employee_status"] }; Returns: string
                           },
"employee_update":
{ Args: { "p_employee_id": string,"p_file": Json,"p_pay": Json,"p_role": Database["public"]['Enums']["employee_role"] }; Returns: undefined
                           },
"get_analytics_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"leave_adjust":
{ Args: { "p_days": number,"p_employee": string,"p_reason": string }; Returns: undefined
                           },
"leave_balance":
{ Args: { "p_employee": string }; Returns: Json
                           },
"leave_request_cancel":
{ Args: { "p_id": string,"p_note"?: string }; Returns: undefined
                           },
"leave_request_create":
{ Args: { "p": Json }; Returns: string
                           },
"leave_request_decide":
{ Args: { "p_decision": string,"p_id": string,"p_note"?: string }; Returns: undefined
                           },
"leave_request_trail":
{ Args: { "p_id": string }; Returns: Json
                           },
"login_begin":
{ Args: { "p_id_hash": string,"p_ip_hash": string }; Returns: number
                           },
"login_succeeded":
{ Args: { "p_attempt": number }; Returns: undefined
                           },
"my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"notifications_mark_read":
{ Args: { "p_ids": (number)[] }; Returns: undefined
                           },
"orphan_files":
{ Args: { "p_older_than"?: string }; Returns: {
              "name": string
            }[]
                           },
"payroll_run_approve":
{ Args: { "p_run_id": string }; Returns: undefined
                           },
"payroll_run_create":
{ Args: { "p_month": number,"p_notes"?: string,"p_year": number }; Returns: string
                           },
"payroll_run_delete":
{ Args: { "p_run_id": string }; Returns: undefined
                           },
"payroll_slip_adjust":
{ Args: { "p_notes"?: string,"p_other_allowances": number,"p_other_deductions": number,"p_slip_id": string }; Returns: undefined
                           },
"people_names":
{ Args: { "p_ids": (string)[] }; Returns: {
              "full_name_ar": string,"full_name_en": string,"id": string
            }[]
                           },
"profile_password_changed":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"profile_set_locale":
{ Args: { "p_locale": string }; Returns: undefined
                           },
"record_export":
{ Args: { "p_kind": string,"p_target": string }; Returns: undefined
                           },
"task_create":
{ Args: { "p": Json }; Returns: string
                           },
"task_delete":
{ Args: { "p_task_id": string }; Returns: undefined
                           },
"task_review":
{ Args: { "p_decision": string,"p_note": string,"p_rating": number,"p_task_id": string }; Returns: undefined
                           },
"task_start":
{ Args: { "p_task_id": string }; Returns: undefined
                           },
"task_submit_report":
{ Args: { "p": Json,"p_attachments": Json,"p_task_id": string }; Returns: string
                           },
"task_update":
{ Args: { "p": Json,"p_task_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "company_status": "active"|"suspended","document_type": "iqama"|"national_id"|"work_permit"|"passport"|"health_card"|"contract","employee_role": "owner"|"hr"|"manager"|"employee","employee_status": "active"|"disabled"|"deleted","id_type": "citizen"|"resident","report_status": "submitted"|"changes_requested"|"approved","task_priority": "low"|"medium"|"high"|"urgent","task_status": "assigned"|"in_progress"|"submitted"|"changes_requested"|"approved"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "company_status": ["active", "suspended"],"document_type": ["iqama", "national_id", "work_permit", "passport", "health_card", "contract"],"employee_role": ["owner", "hr", "manager", "employee"],"employee_status": ["active", "disabled", "deleted"],"id_type": ["citizen", "resident"],"report_status": ["submitted", "changes_requested", "approved"],"task_priority": ["low", "medium", "high", "urgent"],"task_status": ["assigned", "in_progress", "submitted", "changes_requested", "approved"]
          }
        }
} as const
