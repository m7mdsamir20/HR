"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
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
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => String(o.value) === String(selectedValue));

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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
        const idx = options.findIndex((o) => String(o.value) === String(selectedValue));
        setHighlightedIndex(idx >= 0 ? idx : 0);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
      case "Tab":
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex];
          if (opt) handleSelect(opt.value);
        }
        break;
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
            const idx = options.findIndex((o) => String(o.value) === String(selectedValue));
            setHighlightedIndex(idx >= 0 ? idx : 0);
          }}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-describedby={describedBy}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-control border border-input bg-surface px-3 text-base text-ink transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            error && "border-destructive ring-3 ring-destructive/20",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span className={cn("truncate", !selectedOption && "text-ink-soft")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-soft" aria-hidden />
        </button>

        {isOpen && (
          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            className="absolute start-0 top-full z-50 mt-1 flex max-h-64 w-full flex-col overflow-hidden rounded-control border border-line bg-surface p-1 shadow-lg animate-in fade-in-50 zoom-in-95"
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {options.length === 0 ? (
                <p className="px-3 py-3 text-center text-caption text-secondary">
                  لا توجد خيارات متاحة
                </p>
              ) : (
                options.map((o, idx) => {
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
                        "flex w-full items-center justify-between rounded-control px-2.5 py-2 text-start text-sm transition-colors cursor-pointer",
                        isSelected
                          ? "bg-indigo/10 font-semibold text-indigo"
                          : isHighlighted
                            ? "bg-paper text-ink"
                            : "text-ink hover:bg-paper"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && <Check className="size-4 shrink-0 text-indigo ms-2" aria-hidden />}
                    </button>
                  );
                })
              )}
            </div>
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
