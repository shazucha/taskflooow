import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentMonthKey } from "@/lib/recurring";
import {
  useCurrentUserId,
  useMonthlyWorkCompletions,
  useProjectMonthlyWorks,
  useProjectRecurringWorks,
  useRecurringWorkCompletions,
} from "@/lib/queries";

/**
 * Vizuálna značka „nedokončená Náplň predplatného" pre aktuálny mesiac
 * a prihláseného používateľa v konkrétnom projekte.
 */
export function SubscriptionPendingBadge({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const userId = useCurrentUserId();
  const monthKey = currentMonthKey();

  const { data: tplWorks = [] } = useProjectRecurringWorks(projectId);
  const { data: tplCompletions = [] } = useRecurringWorkCompletions(projectId);
  const { data: snapWorks = [] } = useProjectMonthlyWorks(projectId, monthKey);
  const { data: snapCompletions = [] } = useMonthlyWorkCompletions(projectId, monthKey);

  const pending = useMemo(() => {
    if (!userId) return 0;
    const hasSnapshot = snapWorks.length > 0;
    const rows = hasSnapshot ? snapWorks : tplWorks;
    const doneSet = hasSnapshot
      ? new Set(snapCompletions.map((c) => c.monthly_work_id))
      : new Set(
          tplCompletions
            .filter((c) => c.month_key === monthKey)
            .map((c) => c.work_id)
        );
    return rows.filter(
      (r) =>
        (r as { assignee_id?: string | null }).assignee_id === userId &&
        !doneSet.has(r.id)
    ).length;
  }, [userId, snapWorks, tplWorks, snapCompletions, tplCompletions, monthKey]);

  if (pending <= 0) return null;

  return (
    <span
      title={`Nedokončená náplň predplatného (${pending})`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-priority-high/15 px-1.5 py-0.5 text-[10px] font-semibold text-priority-high",
        "ring-1 ring-priority-high/40 shadow-[0_0_10px_hsl(var(--priority-high)/0.45)]",
        "animate-pulse",
        className
      )}
    >
      <AlertCircle className="h-3 w-3" />
      {pending}
    </span>
  );
}
