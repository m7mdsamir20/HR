"use client";

import { Check, ChevronsUpDown, Search, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { normalizeArabic } from "@/components/select-field";
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

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentEmployeeId = searchParams.get("employee") ?? "";
  const selectedEmployee = employees.find((e) => e.id === currentEmployeeId);

  // Filter employees with Arabic normalization
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const query = normalizeArabic(searchQuery);
    return employees.filter((emp) => {
      const matchName = normalizeArabic(emp.name).includes(query);
      const matchJob = emp.jobTitle ? normalizeArabic(emp.jobTitle).includes(query) : false;
      return matchName || matchJob;
    });
  }, [employees, searchQuery]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setHighlightedIndex(-1);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    // Include the "All" item as index -1 or 0
    const totalItems = filteredEmployees.length + (searchQuery ? 0 : 1);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (!searchQuery && highlightedIndex === 0) {
        setEmployee(null);
        return;
      }
      const targetIdx = searchQuery ? highlightedIndex : highlightedIndex - 1;
      if (targetIdx >= 0 && targetIdx < filteredEmployees.length) {
        const emp = filteredEmployees[targetIdx];
        if (emp) setEmployee(emp.id);
      } else if (filteredEmployees.length > 0) {
        const emp = filteredEmployees[0];
        if (emp) setEmployee(emp.id);
      }
    }
  };

  return (
    <div ref={containerRef} className={cn("relative flex flex-wrap items-center gap-2", className)}>
      {/* Combobox Trigger Button */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-label transition-colors cursor-pointer outline-none",
            "hover:border-indigo hover:bg-paper/40 focus-visible:outline-2 focus-visible:outline-indigo",
            isOpen && "border-indigo ring-2 ring-indigo/20",
            selectedEmployee && "border-indigo/50 bg-indigo/5 text-indigo font-medium"
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={labels.label}
        >
          <Users className={cn("size-4 shrink-0", selectedEmployee ? "text-indigo" : "text-ink-soft")} aria-hidden />
          <span className="max-w-[200px] truncate sm:max-w-[260px]">
            {selectedEmployee ? (
              <>
                <span className="font-semibold text-ink">{selectedEmployee.name}</span>
                {selectedEmployee.jobTitle && (
                  <span className="text-secondary ms-1 text-2xs font-normal">
                    — {selectedEmployee.jobTitle}
                  </span>
                )}
              </>
            ) : (
              labels.all
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-soft ms-1" aria-hidden />
        </button>

        {/* Floating Dropdown Panel */}
        {isOpen && (
          <div
            role="listbox"
            tabIndex={-1}
            className="absolute start-0 top-full z-[60] mt-1.5 flex max-h-80 w-72 sm:w-84 flex-col overflow-hidden rounded-card border border-line bg-surface p-1.5 shadow-2xl animate-in fade-in-50 zoom-in-95"
          >
            {/* Search Input Box */}
            <div className="relative mb-1.5 px-1 pt-1 pb-2 border-b border-line shrink-0">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-secondary pointer-events-none" aria-hidden />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="ابحث بالاسم أو المسمى الوظيفي..."
                className="w-full ps-8 pe-8 py-2 text-sm rounded-control bg-paper border border-line text-ink outline-none focus:border-indigo focus:ring-1 focus:ring-indigo transition-all placeholder:text-secondary"
                autoComplete="off"
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-secondary hover:text-ink transition-colors cursor-pointer"
                  aria-label="مسح البحث"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="flex-1 overflow-y-auto py-0.5 space-y-0.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              {/* Option: All Employees */}
              {!searchQuery && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedEmployee}
                  onClick={() => setEmployee(null)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-control px-3 py-2 text-start text-sm transition-colors cursor-pointer",
                    !selectedEmployee
                      ? "bg-indigo/10 font-bold text-indigo"
                      : "text-ink hover:bg-paper"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Users className="size-4 shrink-0 opacity-70" aria-hidden />
                    <span>{labels.all}</span>
                  </div>
                  {!selectedEmployee && (
                    <Check className="size-4 shrink-0 text-indigo ms-2" aria-hidden />
                  )}
                </button>
              )}

              {/* Filtered Employees */}
              {filteredEmployees.length === 0 ? (
                <div className="py-6 px-3 text-center">
                  <p className="text-sm font-medium text-ink">لا توجد نتائج مطابقة</p>
                  <p className="text-caption text-secondary mt-1">
                    جرب البحث بكلمة أو حرف آخر
                  </p>
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelected = emp.id === currentEmployeeId;

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setEmployee(emp.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-control px-3 py-2 text-start text-sm transition-colors cursor-pointer",
                        isSelected
                          ? "bg-indigo/10 font-bold text-indigo"
                          : "text-ink hover:bg-paper"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{emp.name}</span>
                        {emp.jobTitle && (
                          <span className="text-2xs text-secondary truncate mt-0.5">
                            {emp.jobTitle}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-indigo ms-2" aria-hidden />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Results count footer */}
            <div className="shrink-0 pt-1.5 mt-1 border-t border-line/60 px-2 flex items-center justify-between text-2xs text-secondary">
              <span>{filteredEmployees.length} موظف</span>
              {selectedEmployee && (
                <button
                  type="button"
                  onClick={() => setEmployee(null)}
                  className="text-indigo hover:underline font-medium cursor-pointer"
                >
                  إعادة ضبط
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Employee Badge with quick clear button */}
      {selectedEmployee && (
        <div className="inline-flex items-center gap-1.5 rounded-control border border-indigo/20 bg-indigo/10 px-2.5 py-1 text-label text-indigo font-medium">
          <span>{selectedEmployee.name}</span>
          <button
            type="button"
            onClick={() => setEmployee(null)}
            aria-label={labels.clear}
            className="rounded p-0.5 hover:bg-indigo/20 text-indigo transition-colors cursor-pointer"
            title="إلغاء الفلتر"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
