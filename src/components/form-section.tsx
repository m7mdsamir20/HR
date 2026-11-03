import { cn } from "@/lib/utils";

// One titled card per group of fields. The grid fills the page width (CLAUDE.md §6: forms never sit
// in a narrow column with empty space beside them): 1 column on phones, up to 4 on wide screens.
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 rounded-card border border-line bg-surface p-4 md:p-6", className)}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex flex-col gap-1" aria-hidden>
        <p className="text-card">{title}</p>
        {description && <p className="text-secondary">{description}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
    </fieldset>
  );
}

/** Read-only counterpart: a titled card with label/value pairs on the same grid. */
export function FactsSection({ title, items }: { title: string; items: { label: string; value: React.ReactNode }[] }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 md:p-6">
      <h2 className="mb-5 text-card">{title}</h2>
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="flex flex-col gap-0.5">
            <dt className="text-secondary">{i.label}</dt>
            <dd className="font-semibold tabular-nums">{i.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
