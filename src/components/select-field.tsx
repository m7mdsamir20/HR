import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SelectFieldProps = React.ComponentProps<"select"> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
};

// A native <select>: the phone's own picker is the best control there, and it needs no JS.
export function SelectField({ name, label, hint, error, options, className, ...select }: SelectFieldProps) {
  const id = select.id ?? name;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full appearance-none rounded-control border border-input bg-surface ps-3 pe-10 text-base outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50",
          )}
          {...select}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-ink-soft" aria-hidden />
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
