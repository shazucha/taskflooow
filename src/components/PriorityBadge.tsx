import { cn } from "@/lib/utils";
import { PRIORITY_META } from "@/lib/types";
import type { Priority } from "@/lib/types";

interface Props {
  priority: Priority;
  className?: string;
  showLabel?: boolean;
}

export function PriorityBadge({ priority, className, showLabel = true }: Props) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.soft,
        meta.text,
        className
      )}
    >
      <span className={cn("priority-dot", meta.dot)} />
      {showLabel && meta.label}
    </span>
  );
}
