import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  hint?: string;
  /** Message shown when the field is invalid; its presence marks the field invalid. */
  error?: string;
  optionalLabel?: string;
  children?: React.ReactNode;
};

/** Label + input + hint/error, wired with aria-describedby. Extra controls go in `children`. */
export function FormField({ name, label, hint, error, optionalLabel, className, children, ...input }: FormFieldProps) {
  const id = input.id ?? name;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optionalLabel && <span className="text-caption font-normal text-ink-soft">({optionalLabel})</span>}
      </Label>
      <div className="flex gap-2">
        <Input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
        {children}
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
