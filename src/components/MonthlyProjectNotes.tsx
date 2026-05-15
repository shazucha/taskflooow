import { useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { Chat } from "./Chat";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";

interface Props {
  projectId: string;
}

/**
 * Poznámky k projektu zoskupené po mesiacoch — drží mesačnú „evidenciu",
 * aby zadávateľ jasne videl, čo zamestnanec v danom mesiaci zapísal.
 */
export function MonthlyProjectNotes({ projectId }: Props) {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const isCurrent = monthKey === currentMonthKey();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMonthKey(currentMonthKey())}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold capitalize text-foreground hover:bg-card"
          title="Skočiť na aktuálny mesiac"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          {formatMonthLabel(monthKey)}
          {!isCurrent && (
            <span className="rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Archív
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Nasledujúci mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <Chat
        scope="project"
        projectId={projectId}
        variant="notes"
        monthKey={monthKey}
      />
    </div>
  );
}
