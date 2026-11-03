import { cn } from "@/lib/utils";

// One color per meaning across every screen (CLAUDE.md §6): stamp = good, saffron = needs
// attention soon, brick = stopped/overdue, indigo = in progress, neutral = not started.
export type Tone = "stamp" | "saffron" | "brick" | "indigo" | "neutral";

const tones: Record<Tone, string> = {
  stamp: "bg-stamp/10 text-stamp",
  saffron: "bg-saffron/12 text-saffron",
  brick: "bg-brick/10 text-brick",
  indigo: "bg-indigo/10 text-indigo",
  neutral: "bg-ink-soft/10 text-ink-soft",
};

export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
