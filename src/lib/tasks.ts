// Task vocabulary shared by server and client. One colour per status everywhere (CLAUDE.md §6).
import type { Tone } from "@/components/status-pill";
import { daysBetween, todayInRiyadh } from "@/lib/format";

export const TASK_STATUSES = ["assigned", "in_progress", "submitted", "changes_requested", "approved"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const statusTone: Record<TaskStatus, Tone> = {
  assigned: "neutral",
  in_progress: "indigo",
  submitted: "saffron",
  changes_requested: "brick",
  approved: "stamp",
};

/** The coloured bar on a task card uses the same colour as its status pill. */
export const statusBar: Record<TaskStatus, string> = {
  assigned: "bg-ink-soft/40",
  in_progress: "bg-indigo",
  submitted: "bg-saffron",
  changes_requested: "bg-brick",
  approved: "bg-stamp",
};

/** Open work past its due date. */
export function isOverdue(status: TaskStatus, dueDate: string, today: string = todayInRiyadh()): boolean {
  return status !== "approved" && status !== "submitted" && dueDate < today;
}

export type DueGroup = "overdue" | "today" | "tomorrow" | "later" | "done";

/** The employee's list groups by day: overdue, today, tomorrow, later; finished work last. */
export function dueGroup(status: TaskStatus, dueDate: string, today: string = todayInRiyadh()): DueGroup {
  if (status === "approved") return "done";
  if (isOverdue(status, dueDate, today)) return "overdue";
  const days = daysBetween(today, dueDate);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return "later";
}
