// Zdieľané skeleton loadingy a prázdne stavy pre zoznamy vo VR Liptov.
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton riadky zoznamu (avatar + dva riadky textu + suma). */
export function VrListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border/50" aria-busy="true" aria-label="Načítavam záznamy">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-2/3 max-w-[200px]" />
              <Skeleton className="h-3.5 w-14 shrink-0" />
            </div>
            <Skeleton className="h-3 w-1/2 max-w-[150px]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Skeleton pre súhrnné karty. */
export function VrSummarySkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/60 bg-card/60 p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Prívetivý prázdny stav s ikonou, nadpisom a nápovedou. */
export function VrEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center sm:py-10">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vr-soft text-vr">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-[34ch] text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
