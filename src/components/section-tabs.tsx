"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** A module's own sections as underlined tabs. Hidden when there's only one, since there's nothing to switch to. */
export function SectionTabs({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  if (items.length < 2) return null;

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map(({ href, label: text }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 border-transparent px-4 text-label text-ink-soft hover:text-ink",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo",
                  current && "border-indigo font-semibold text-indigo hover:text-indigo",
                )}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
