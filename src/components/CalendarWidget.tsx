import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useProfiles, useTasks } from "@/lib/queries";
import { Link } from "react-router-dom";

const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarWidget() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(new Date());
  const currentUserId = useCurrentUserId();
  const { data: tasks = [] } = useTasks();
  const { data: profiles = [] } = useProfiles();

  const me = profiles.find((p) => p.id === currentUserId);
  const myColor = me?.color || "hsl(var(--primary))";

  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === currentUserId && t.due_date),
    [tasks, currentUserId]
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof myTasks>();
    for (const t of myTasks) {
      const d = new Date(t.due_date!);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [myTasks]);

  const monthStart = cursor;
  const monthDays = daysInMonth(cursor);
  // Monday-first offset
  const firstDow = (monthStart.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= monthDays; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const selectedKey = selected
    ? `${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}`
    : null;
  const selectedTasks = selectedKey ? tasksByDay.get(selectedKey) ?? [] : [];

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-bold">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label="Ďalší mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayTasks = tasksByDay.get(key) ?? [];
          const isToday = sameDay(d, today);
          const isSelected = selected && sameDay(d, selected);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(d)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition",
                isSelected ? "ring-2 ring-primary" : "hover:bg-surface-muted",
                isToday && !isSelected && "bg-surface-muted"
              )}
            >
              <span className={cn(isToday && "font-bold text-primary")}>{d.getDate()}</span>
              {dayTasks.length > 0 && (
                <span
                  className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: myColor }}
                />
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {selected.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {selectedTasks.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Žiadne úlohy.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {selectedTasks.map((t) => (
                <li key={t.id}>
                  <Link
                    to={t.project_id ? `/projects/${t.project_id}` : "/tasks"}
                    className="flex items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-surface-muted"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: myColor }}
                    />
                    <span className="flex-1 truncate">{t.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
