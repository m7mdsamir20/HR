import type { Tone } from "@/components/status-pill";
import type { Role } from "@/lib/auth/roles";

export interface WorkforceKpis {
  total_employees: number;
  saudi_count: number | null;
  expat_count: number | null;
  saudization_rate: number | null;
  departments_count: number | null;
  branches_count: number | null;
  expiring_docs_30d: number | null;
  critical_docs_15d: number | null;
}

export interface TaskKpis {
  total: number;
  approved: number;
  submitted: number;
  in_progress: number;
  changes_requested: number;
  assigned: number;
  overdue: number;
  completion_rate: number;
  avg_rating: number;
  hours_spent: number;
}

export interface AttendanceKpis {
  today_present: number;
  today_on_time: number;
  today_late: number;
  today_absent: number;
  today_rate: number;
  month_leaves: number;
  month_deductions: number;
}

export interface LatestPayrollKpis {
  year: number;
  month: number;
  status: string;
  total_gross: number;
  total_net: number;
  total_gosi_employer: number;
  total_deductions: number;
  employee_count: number;
}

export interface FinancialKpis {
  has_run: boolean;
  latest_run: LatestPayrollKpis | null;
  active_advances_count: number;
  total_advances_balance: number;
}

export interface DepartmentBreakdown {
  id: string;
  name_ar: string;
  name_en: string | null;
  employee_count: number;
}

export interface AnalyticsSummary {
  role: Role;
  workforce: WorkforceKpis | null;
  tasks: TaskKpis;
  attendance: AttendanceKpis;
  financial: FinancialKpis | null;
  departments: DepartmentBreakdown[];
}

/**
 * Returns tone for Saudization percentage based on Saudi labor guidelines.
 */
export function saudizationTone(rate: number | null): Tone {
  if (rate === null) return "neutral";
  if (rate >= 40) return "stamp";
  if (rate >= 20) return "indigo";
  if (rate >= 10) return "saffron";
  return "brick";
}

/**
 * Returns tone for task completion rate percentage.
 */
export function taskCompletionTone(rate: number): Tone {
  if (rate >= 80) return "stamp";
  if (rate >= 50) return "indigo";
  if (rate >= 25) return "saffron";
  return "brick";
}

/**
 * Returns tone for attendance rate percentage.
 */
export function attendanceTone(rate: number): Tone {
  if (rate >= 90) return "stamp";
  if (rate >= 75) return "indigo";
  if (rate >= 60) return "saffron";
  return "brick";
}
