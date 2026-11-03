import { cn } from "@/lib/utils";

/**
 * The approval stamp: the product's one signature moment (CLAUDE.md §6). A round mark in the
 * approval colour with the rating, set down once with a short press; reduced motion shows it still.
 */
export function ApprovalStamp({
  label,
  rating,
  by,
  on,
  className,
}: {
  label: string;
  rating: number;
  by: string;
  on: string;
  className?: string;
}) {
  return (
    <figure className={cn("flex items-center gap-4", className)}>
      <div
        className="stamp-press grid size-24 shrink-0 -rotate-6 place-items-center rounded-full border-[3px] border-stamp text-stamp"
        role="img"
        aria-label={`${label} ${rating}/5`}
      >
        <div className="grid size-[5.25rem] place-items-center rounded-full border border-stamp/60 text-center leading-tight">
          <span className="text-label font-semibold">{label}</span>
          <span className="text-section tabular-nums" dir="ltr">
            {rating}/5
          </span>
        </div>
      </div>
      <figcaption className="flex flex-col text-secondary">
        <span className="text-ink">{by}</span>
        <span>{on}</span>
      </figcaption>
    </figure>
  );
}
