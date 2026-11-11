"use client";

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SelectFieldProps {
  name: string;
  label: string;
  options: SelectOption[];
  defaultValue?: string | number;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement> | { target: { name: string; value: string }; currentTarget: { name: string; value: string } }) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
}

/** Normalize Arabic letters and remove diacritics for intuitive, flexible search */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\s+/g, " ");
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  value: controlledValue,
  onChange,
  hint,
  error,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  searchable,
  disabled = false,
  required = false,
  id: explicitId,
  className,
}: SelectFieldProps) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;

  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue !== undefined ? String(defaultValue) : options[0]?.value ?? ""
  );
  const selectedValue = isControlled ? String(controlledValue) : internalValue;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Enable search by default if there are 4 or more options, or if explicitly requested
  const isSearchable = searchable ?? options.length >= 4;

  const selectedOption = options.find((o) => String(o.value) === String(selectedValue));

  // Filter options based on search query with Arabic normalization
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const normalizedQuery = normalizeArabic(searchQuery);
    return options.filter((o) => {
      const matchLabel = normalizeArabic(o.label).includes(normalizedQuery);
      const matchSub = o.sublabel ? normalizeArabic(o.sublabel).includes(normalizedQuery) : false;
      const matchVal = normalizeArabic(o.value).includes(normalizedQuery);
      return matchLabel || matchSub || matchVal;
    });
  }, [options, searchQuery]);

  // Handle click outside to close dropdown
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

  // Focus search input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setHighlightedIndex(-1);
      if (isSearchable) {
        const timer = setTimeout(() => {
          searchInputRef.current?.focus();
        }, 30);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, isSearchable]);

  const emitChange = (val: string) => {
    if (!isControlled) {
      setInternalValue(val);
    }
    if (onChange) {
      const syntheticEvent = {
        target: { name, value: val },
        currentTarget: { name, value: val },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  const handleSelect = (val: string) => {
    emitChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Keyboard navigation on trigger
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
  };

  // Keyboard navigation inside search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        const opt = filteredOptions[highlightedIndex];
        if (opt) handleSelect(opt.value);
      } else if (filteredOptions.length > 0) {
        // Select first matching option if none explicitly highlighted
        const opt = filteredOptions[0];
        if (opt) handleSelect(opt.value);
      }
    }
  };

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div ref={containerRef} className={cn("relative flex flex-col gap-2", className)}>
      <Label htmlFor={`${id}-button`}>
        {label}
        {required && <span className="ms-1 text-brick">*</span>}
      </Label>

      {/* Hidden input to ensure native form submission and Server Actions work seamlessly */}
      <input type="hidden" name={name} value={selectedValue} />

      <div className="relative">
        <button
          ref={triggerRef}
          id={`${id}-button`}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setIsOpen((prev) => !prev);
          }}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-describedby={describedBy}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-control border border-input bg-surface px-3 text-base text-ink transition-colors outline-none cursor-pointer",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            isOpen && "border-indigo ring-2 ring-indigo/20",
            error && "border-destructive ring-3 ring-destructive/20",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span className={cn("truncate text-start", !selectedOption && "text-ink-soft")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-soft ms-2" aria-hidden />
        </button>

        {isOpen && (
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            className="absolute start-0 top-full z-[60] mt-1.5 flex max-h-72 w-full flex-col overflow-hidden rounded-card border border-line bg-surface p-1.5 shadow-2xl animate-in fade-in-50 zoom-in-95"
          >
            {/* Instant Search Bar */}
            {isSearchable && (
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
                  placeholder={searchPlaceholder}
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
            )}

            {/* Scrollable Options List */}
            <div className="flex-1 overflow-y-auto py-0.5 space-y-0.5 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
              {filteredOptions.length === 0 ? (
                <div className="py-6 px-3 text-center">
                  <p className="text-sm font-medium text-ink">لا توجد نتائج مطابقة</p>
                  <p className="text-caption text-secondary mt-1">
                    جرب البحث بكلمة أو حرف آخر
                  </p>
                </div>
              ) : (
                filteredOptions.map((o, idx) => {
                  const isSelected = String(o.value) === String(selectedValue);
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(o.value)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-control px-3 py-2.5 text-start text-sm transition-colors cursor-pointer",
                        isSelected
                          ? "bg-indigo/10 font-bold text-indigo"
                          : isHighlighted
                            ? "bg-paper text-ink font-medium"
                            : "text-ink hover:bg-paper"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{o.label}</span>
                        {o.sublabel && (
                          <span className="text-2xs text-secondary truncate mt-0.5">
                            {o.sublabel}
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

            {/* Results count footer if searching */}
            {searchQuery && filteredOptions.length > 0 && (
              <div className="shrink-0 pt-1.5 mt-1 border-t border-line/60 px-2 text-end text-2xs text-secondary">
                {filteredOptions.length} من أصل {options.length}
              </div>
            )}
          </div>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="text-caption text-brick">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
