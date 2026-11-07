"use client";

import { Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  id: string;
  name: string;
  jobTitle?: string | null;
}

interface TaskEmployeeFilterProps {
  employees: EmployeeOption[];
  labels: {
    all: string;
    label: string;
    clear: string;
  };
  className?: string;
}

export function TaskEmployeeFilter({
  employees,
  labels,
  className,
}: TaskEmployeeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentEmployeeId = searchParams.get("employee") ?? "";
  const selectedEmployee = employees.find((e) => e.id === currentEmployeeId);

  const setEmployee = (empId: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (empId) {
      sp.set("employee", empId);
    } else {
      sp.delete("employee");
    }
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative flex items-center">
        <Users className="pointer-events-none absolute start-3 size-4 text-ink-soft" aria-hidden />
        <select
          value={currentEmployeeId}
          onChange={(e) => setEmployee(e.target.value || null)}
          aria-label={labels.label}
          className="min-h-9 ps-9 pe-8 rounded-control border border-line bg-surface text-label text-ink hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo transition-colors appearance-none cursor-pointer"
        >
          <option value="">{labels.all}</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}{emp.jobTitle ? ` — ${emp.jobTitle}` : ""}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute end-2.5 text-caption text-ink-soft">▾</span>
      </div>

      {selectedEmployee && (
        <div className="inline-flex items-center gap-1.5 rounded-control border border-indigo/20 bg-indigo/10 px-2.5 py-1 text-label text-indigo font-medium">
          <span>{selectedEmployee.name}</span>
          <button
            type="button"
            onClick={() => setEmployee(null)}
            aria-label={labels.clear}
            className="rounded p-0.5 hover:bg-indigo/20 text-indigo transition-colors cursor-pointer"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
