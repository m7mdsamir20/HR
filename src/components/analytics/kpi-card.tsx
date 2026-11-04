import type { LucideIcon } from "lucide-react";
import { StatusPill, type Tone } from "@/components/status-pill";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: Tone;
  badge?: string;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  badge,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 rounded-card border border-line bg-surface p-4.5 shadow-2xs transition-colors hover:border-line/80",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-secondary">{title}</span>
        {Icon && (
          <div className="flex size-8 items-center justify-center rounded-control bg-paper text-ink-soft">
            <Icon className="size-4" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-ink tabular-nums sm:text-3xl">
          {value}
        </span>
        {badge && tone && <StatusPill tone={tone}>{badge}</StatusPill>}
      </div>

      {subtitle && <p className="text-caption text-secondary">{subtitle}</p>}
    </div>
  );
}
