import { z } from "zod";
import { normalizeAmount } from "@/lib/money";
import { PRIORITIES } from "@/lib/tasks";

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const hours = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? normalizeAmount(v) || undefined : v), z.coerce.number().min(0).max(max).multipleOf(0.25).optional());

export const taskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: optional(z.string().max(4000)),
  location: optional(z.string().max(200)),
  assigneeId: z.uuid(),
  priority: z.enum(PRIORITIES),
  dueDate: z.iso.date(),
  dueTime: optional(z.string().regex(/^\d{2}:\d{2}$/)),
  expectedHours: hours(999).refine((h) => h === undefined || h > 0),
});
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskField = keyof TaskInput;
export const taskFields = Object.keys(taskSchema.shape) as TaskField[];

export function taskPayload(d: TaskInput) {
  return {
    title: d.title,
    description: d.description ?? "",
    location: d.location ?? "",
    assignee_id: d.assigneeId,
    priority: d.priority,
    due_date: d.dueDate,
    due_time: d.dueTime ?? "",
    expected_hours: d.expectedHours?.toString() ?? "",
  };
}

export const reportSchema = z.object({
  summary: z.string().trim().min(3).max(4000),
  hoursSpent: hours(999).transform((h) => h ?? 0),
  obstacles: optional(z.string().max(2000)),
  links: z
    .array(z.string().trim())
    .transform((l) => l.filter(Boolean))
    .pipe(z.array(z.url({ protocol: /^https$/ }).max(2000)).max(5)),
});

export const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), rating: z.coerce.number().int().min(1).max(5), note: optional(z.string().max(2000)) }),
  z.object({ decision: z.literal("changes"), note: z.string().trim().min(3).max(2000) }),
]);
