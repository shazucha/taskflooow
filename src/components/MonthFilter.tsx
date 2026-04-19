import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMonthLabel, shiftMonth, currentMonthKey } from "@/lib/recurring";

interface Props {
  value: string | null; // null = všetko
  onChange: (v: string | null) => void;
  className?: string;
}

export function MonthFilter({ value, onChange, className }: Props) {
  const isAll = value === null;
  const label = isAll ? "Všetky mesiace" : formatMonthLabel(value!);
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full bg-surface-muted p-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        disabled={isAll}
        onClick={() => onChange(shiftMonth(value!, -1))}
        aria-label="Predchádzajúci mesiac"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <button
        onClick={() => onChange(isAll ? currentMonthKey() : null)}
        className="min-w-[140px] rounded-full px-2 py-1 text-xs font-semibold capitalize text-foreground hover:bg-background"
        title={isAll ? "Klikni pre tento mesiac" : "Klikni pre všetky"}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" />
          {label}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        disabled={isAll}
        onClick={() => onChange(shiftMonth(value!, 1))}
        aria-label="Nasledujúci mesiac"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
