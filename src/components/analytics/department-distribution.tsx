import { Network } from "lucide-react";
import type { DepartmentBreakdown } from "@/lib/analytics";

interface DepartmentDistributionProps {
  departments: DepartmentBreakdown[];
  totalEmployees: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function DepartmentDistribution({
  departments,
  totalEmployees,
  t,
}: DepartmentDistributionProps) {
  const max = Math.max(1, ...departments.map((d) => d.employee_count));

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-2xs">
      <div className="flex items-center gap-2.5 border-b border-line pb-4">
        <div className="flex size-9 items-center justify-center rounded-control bg-paper text-ink-soft">
          <Network className="size-4.5" aria-hidden />
        </div>
        <div className="flex flex-col">
          <h3 className="font-semibold text-ink">{t("departmentsTitle")}</h3>
          <span className="text-caption text-secondary">
            {departments.length} {t("departments")}
          </span>
        </div>
      </div>

      {departments.length === 0 ? (
        <p className="text-caption text-secondary py-3 text-center">
          {t("emptyDepartments")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {departments.map((dept) => {
            const pct = totalEmployees > 0 ? Math.round((dept.employee_count / totalEmployees) * 100) : 0;
            const barWidth = Math.round((dept.employee_count / max) * 100);

            return (
              <div key={dept.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-caption">
                  <span className="font-medium text-ink">{dept.name_ar}</span>
                  <div className="flex items-center gap-2 text-secondary">
                    <span className="tabular-nums font-semibold text-ink">
                      {dept.employee_count} موظف
                    </span>
                    <span className="tabular-nums">({pct}%)</span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-indigo transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
