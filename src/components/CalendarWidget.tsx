import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useProfiles, useTasks } from "@/lib/queries";
import { Link } from "react-router-dom";
import type { Task } from "@/lib/types";

type View = "month" | "week" | "day";

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
function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // Monday-first
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return out;
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function hasTime(t: Task) {
  // due_date with non-zero time component
  if (!t.due_date) return false;
  const d = new Date(t.due_date);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

export function CalendarWidget() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(new Date());
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
    const map = new Map<string, Task[]>();
    for (const t of myTasks) {
      const d = new Date(t.due_date!);
      const key = dayKey(d);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [myTasks]);

  const today = new Date();

  // ---- Navigation ----
  const goPrev = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else if (view === "week") setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1));
  };
  const goNext = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else if (view === "week") setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1));
  };

  const headerLabel = useMemo(() => {
    if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      return `${s.getDate()}. ${MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()}. ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
    }
    return cursor.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [cursor, view]);

  return (
    <div className="card-elevated p-4">
      {/* View switcher */}
      <div className="mb-3 flex gap-1 rounded-xl bg-surface-muted p-1">
        {(["month", "week", "day"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setView(v);
              if (v === "day") setCursor(selected);
            }}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v === "month" ? "Mesiac" : v === "week" ? "Týždeň" : "Deň"}
          </button>
        ))}
      </div>

      {/* Header nav */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label="Predchádzajúce"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-bold capitalize">{headerLabel}</h3>
        <button
          type="button"
          onClick={goNext}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label="Ďalšie"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {view === "month" && (
        <MonthView
          cursor={cursor}
          selected={selected}
          today={today}
          tasksByDay={tasksByDay}
          myColor={myColor}
          onSelect={(d) => setSelected(d)}
          onDrillDay={(d) => {
            setSelected(d);
            setCursor(d);
            setView("day");
          }}
        />
      )}

      {view === "week" && (
        <WeekView
          cursor={cursor}
          selected={selected}
          today={today}
          tasksByDay={tasksByDay}
          myColor={myColor}
          onSelect={(d) => setSelected(d)}
          onDrillDay={(d) => {
            setSelected(d);
            setCursor(d);
            setView("day");
          }}
        />
      )}

      {view === "day" && (
        <DayView
          date={cursor}
          tasks={tasksByDay.get(dayKey(cursor)) ?? []}
          myColor={myColor}
        />
      )}

      {/* Selected day list (for month/week) */}
      {view !== "day" && (
        <SelectedDayList
          selected={selected}
          tasks={tasksByDay.get(dayKey(selected)) ?? []}
          myColor={myColor}
        />
      )}
    </div>
  );
}

/* ---------------- Month ---------------- */
function MonthView({
  cursor, selected, today, tasksByDay, myColor, onSelect, onDrillDay,
}: {
  cursor: Date; selected: Date; today: Date;
  tasksByDay: Map<string, Task[]>; myColor: string;
  onSelect: (d: Date) => void; onDrillDay: (d: Date) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthDays = daysInMonth(cursor);
  const firstDow = (monthStart.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= monthDays; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {WEEKDAYS.map((w) => (<div key={w} className="py-1">{w}</div>))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const key = dayKey(d);
          const dayTasks = tasksByDay.get(key) ?? [];
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selected);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(d)}
              onDoubleClick={() => onDrillDay(d)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition",
                isSelected ? "ring-2 ring-primary" : "hover:bg-surface-muted",
                isToday && !isSelected && "bg-surface-muted"
              )}
            >
              <span className={cn(isToday && "font-bold text-primary")}>{d.getDate()}</span>
              {dayTasks.length > 0 && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: myColor }} />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Week ---------------- */
function WeekView({
  cursor, selected, today, tasksByDay, myColor, onSelect, onDrillDay,
}: {
  cursor: Date; selected: Date; today: Date;
  tasksByDay: Map<string, Task[]>; myColor: string;
  onSelect: (d: Date) => void; onDrillDay: (d: Date) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  );

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const key = dayKey(d);
        const dayTasks = tasksByDay.get(key) ?? [];
        const isToday = sameDay(d, today);
        const isSelected = sameDay(d, selected);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(d)}
            onDoubleClick={() => onDrillDay(d)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg p-2 text-xs transition",
              isSelected ? "ring-2 ring-primary" : "hover:bg-surface-muted",
              isToday && !isSelected && "bg-surface-muted"
            )}
          >
            <span className="text-[10px] font-bold uppercase text-muted-foreground">{WEEKDAYS[i]}</span>
            <span className={cn("text-base font-semibold", isToday && "text-primary")}>{d.getDate()}</span>
            <span className="flex h-1.5 items-center gap-0.5">
              {dayTasks.slice(0, 3).map((t) => (
                <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: myColor }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Day ---------------- */
function DayView({ date, tasks, myColor }: { date: Date; tasks: Task[]; myColor: string }) {
  const allDay = tasks.filter((t) => !hasTime(t));
  const timed = tasks
    .filter((t) => hasTime(t))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const tasksByHour = new Map<number, Task[]>();
  for (const t of timed) {
    const h = new Date(t.due_date!).getHours();
    const arr = tasksByHour.get(h) ?? [];
    arr.push(t);
    tasksByHour.set(h, arr);
  }

  return (
    <div className="space-y-3">
      {allDay.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Celý deň</p>
          <ul className="space-y-1">
            {allDay.map((t) => <TaskRow key={t.id} task={t} myColor={myColor} />)}
          </ul>
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border/60">
        {hours.map((h) => {
          const list = tasksByHour.get(h) ?? [];
          return (
            <div key={h} className="flex gap-2 border-b border-border/40 px-2 py-1.5 last:border-b-0">
              <span className="w-10 shrink-0 pt-0.5 text-[10px] font-semibold text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </span>
              <div className="flex-1 space-y-1">
                {list.length === 0 ? (
                  <span className="block h-4" />
                ) : (
                  list.map((t) => {
                    const d = new Date(t.due_date!);
                    return (
                      <Link
                        key={t.id}
                        to={t.project_id ? `/projects/${t.project_id}` : "/tasks"}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface-muted"
                        style={{ borderLeft: `3px solid ${myColor}` }}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
                        </span>
                        <span className="truncate">{t.title}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">Žiadne úlohy v tento deň.</p>
      )}
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function SelectedDayList({ selected, tasks, myColor }: { selected: Date; tasks: Task[]; myColor: string }) {
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {selected.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      {tasks.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Žiadne úlohy.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {tasks.map((t) => <TaskRow key={t.id} task={t} myColor={myColor} />)}
        </ul>
      )}
    </div>
  );
}

function TaskRow({ task, myColor }: { task: Task; myColor: string }) {
  const timed = hasTime(task);
  const d = task.due_date ? new Date(task.due_date) : null;
  return (
    <li>
      <Link
        to={task.project_id ? `/projects/${task.project_id}` : "/tasks"}
        className="flex items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-surface-muted"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: myColor }} />
        {timed && d && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
          </span>
        )}
        <span className="flex-1 truncate">{task.title}</span>
      </Link>
    </li>
  );
}
