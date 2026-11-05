"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxFieldProps {
  name: string;
  label: string;
  options: ComboboxOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ComboboxField({
  name,
  label,
  options,
  defaultValue = "",
  value: controlledValue,
  onChange,
  error,
  hint,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  disabled = false,
  className,
}: ComboboxFieldProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlledValue !== undefined ? controlledValue : internalValue;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === selectedValue);

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Focus search input on open
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (val: string) => {
    if (controlledValue === undefined) {
      setInternalValue(val);
    }
    onChange?.(val);
    setIsOpen(false);
    setSearch("");
  };

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div ref={containerRef} className={cn("relative flex flex-col gap-2", className)}>
      <Label htmlFor={`${id}-button`}>{label}</Label>
      <input type="hidden" name={name} value={selectedValue} />

      <button
        id={`${id}-button`}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-describedby={describedBy}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-control border border-input bg-surface px-3 text-base text-ink transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          error && "border-destructive ring-3 ring-destructive/20",
          "disabled:opacity-50"
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-ink-soft")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-soft" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute start-0 top-full z-50 mt-1 flex max-h-64 w-full flex-col overflow-hidden rounded-control border border-line bg-surface p-1 shadow-lg animate-in fade-in-50 zoom-in-95"
        >
          {/* Search Box */}
          <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
            <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
            />
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-center text-caption text-secondary">
                لا توجد نتائج مطابقة
              </p>
            ) : (
              filteredOptions.map((o) => {
                const isSelected = o.value === selectedValue;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(o.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-control px-2.5 py-2 text-start text-sm transition-colors",
                      isSelected
                        ? "bg-indigo/10 font-semibold text-indigo"
                        : "text-ink hover:bg-paper"
                    )}
                  >
                    <span>{o.label}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-indigo" aria-hidden />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

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
