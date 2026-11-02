
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
            "audit_logs": {
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
                },"companies": {
                  Row: {
                    "commercial_reg": string | null,"created_at": string,"id": string,"logo_path": string | null,"max_employees": number,"name_ar": string,"name_en": string | null,"settings": NonNullable<Json>,"status": Database["public"]['Enums']["company_status"],"subscription_ends_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commercial_reg"?: string | null,"created_at"?: string,"id"?: string,"logo_path"?: string | null,"max_employees": number,"name_ar": string,"name_en"?: string | null,"settings"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["company_status"],"subscription_ends_at": string,"updated_at"?: string
                  }
                  Update: {
                    "commercial_reg"?: string | null,"created_at"?: string,"id"?: string,"logo_path"?: string | null,"max_employees"?: number,"name_ar"?: string,"name_en"?: string | null,"settings"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["company_status"],"subscription_ends_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"employees": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"disabled_at": string | null,"full_name_ar": string,"full_name_en": string | null,"id": string,"id_type": Database["public"]['Enums']["id_type"],"job_title": string | null,"locale": string,"manager_id": string | null,"national_id": string,"phone": string | null,"role": Database["public"]['Enums']["employee_role"],"status": Database["public"]['Enums']["employee_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"disabled_at"?: string | null,"full_name_ar": string,"full_name_en"?: string | null,"id"?: string,"id_type": Database["public"]['Enums']["id_type"],"job_title"?: string | null,"locale"?: string,"manager_id"?: string | null,"national_id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["employee_role"],"status"?: Database["public"]['Enums']["employee_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"disabled_at"?: string | null,"full_name_ar"?: string,"full_name_en"?: string | null,"id"?: string,"id_type"?: Database["public"]['Enums']["id_type"],"job_title"?: string | null,"locale"?: string,"manager_id"?: string | null,"national_id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["employee_role"],"status"?: Database["public"]['Enums']["employee_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_create_company":
{ Args: { "p_commercial_reg": string,"p_max_employees": number,"p_name_ar": string,"p_name_en": string,"p_owner_name_ar": string,"p_owner_name_en": string,"p_owner_national_id": string,"p_owner_phone": string,"p_owner_user_id": string,"p_subscription_ends_at": string }; Returns: string
                           },
"login_begin":
{ Args: { "p_id_hash": string,"p_ip_hash": string }; Returns: number
                           },
"login_succeeded":
{ Args: { "p_attempt": number }; Returns: undefined
                           },
"my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            "company_status": "active"|"suspended","employee_role": "owner"|"hr"|"manager"|"employee","employee_status": "active"|"disabled"|"deleted","id_type": "citizen"|"resident"
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
            "company_status": ["active", "suspended"],"employee_role": ["owner", "hr", "manager", "employee"],"employee_status": ["active", "disabled", "deleted"],"id_type": ["citizen", "resident"]
          }
        }
} as const
