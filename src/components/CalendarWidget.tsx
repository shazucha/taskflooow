import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useDeleteTask, useProfiles, useProjects, useTaskWatchers, useTasks, useToggleTaskDone } from "@/lib/queries";
import type { Project, Task } from "@/lib/types";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { NewTaskDialog } from "./NewTaskDialog";
import { fetchGoogleEvents, GoogleReconnectRequiredError, pullGoogleEvents, type GoogleEvent } from "@/lib/googleCalendar";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Prefill = { date: string; time?: string; end?: string } | null;

interface CalendarWidgetProps {
  /** If set, calendar shows tasks for this user instead of the current user, in read-only mode. */
  userId?: string;
  readOnly?: boolean;
}

export function CalendarWidget({ userId, readOnly = false }: CalendarWidgetProps = {}) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(new Date());
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const currentUserId = useCurrentUserId();
  const targetUserId = userId ?? currentUserId;
  const isReadOnly = readOnly || (!!userId && userId !== currentUserId);
  const { data: tasks = [] } = useTasks();
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const { data: watchers = [] } = useTaskWatchers();
  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const owner = profiles.find((p) => p.id === targetUserId);
  const myColor = owner?.color || "hsl(var(--primary))";

  const myTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.due_date &&
          (t.assignee_id === targetUserId || watchers.some((w) => w.task_id === t.id && w.user_id === targetUserId))
      ),
    [tasks, watchers, targetUserId]
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

  // ---- Google Calendar events (only for the current user, not when viewing others)
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const warnedReconnectRef = useRef(false);
  const googlePullInFlightRef = useRef<Promise<void> | null>(null);
  const showGoogle = !userId || userId === currentUserId;
  const qc = useQueryClient();

  useEffect(() => {
    if (!showGoogle) {
      setGoogleEvents([]);
      return;
    }
    // Fetch a wide window around the cursor: previous, current and next month
    const from = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0, 23, 59, 59);
    let cancelled = false;
    fetchGoogleEvents(from, to)
      .then((evs) => {
        warnedReconnectRef.current = false;
        if (!cancelled) setGoogleEvents(evs);
      })
      .catch((error) => {
        if (error instanceof GoogleReconnectRequiredError && !warnedReconnectRef.current) {
          warnedReconnectRef.current = true;
          toast.error("Google kalendár treba znova pripojiť");
        }
        if (!cancelled) setGoogleEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cursor, showGoogle]);

  // ---- Pull Google -> TaskFlow (bidirectional sync)
  // Runs on mount, every 60s, and when the tab is refocused.
  useEffect(() => {
    if (!showGoogle) return;
    let cancelled = false;

    const run = async () => {
      if (googlePullInFlightRef.current) return googlePullInFlightRef.current;

      let request: Promise<void> | null = null;
      request = (async () => {
        try {
          const r = await pullGoogleEvents();
          if (cancelled) return;
          if (r && (r.imported > 0 || r.updated > 0 || r.deleted > 0)) {
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }
        } catch (error) {
          if (error instanceof GoogleReconnectRequiredError && !warnedReconnectRef.current) {
            warnedReconnectRef.current = true;
            toast.error("Google kalendár treba znova pripojiť");
          }
        } finally {
          if (googlePullInFlightRef.current === request) {
            googlePullInFlightRef.current = null;
          }
        }
      })();

      googlePullInFlightRef.current = request;

      try {
        await request;
      } finally {
        if (cancelled && googlePullInFlightRef.current === request) {
          googlePullInFlightRef.current = null;
        }
      }
    };

    void run();
    const id = window.setInterval(() => {
      void run();
    }, 60_000);
    const onFocus = () => {
      void run();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [showGoogle, qc]);

  const googleByDay = useMemo(() => {
    const map = new Map<string, GoogleEvent[]>();
    for (const e of googleEvents) {
      if (!e.start) continue;
      const d = new Date(e.start);
      const key = dayKey(d);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [googleEvents]);

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
          googleByDay={googleByDay}
          myColor={myColor}
          readOnly={isReadOnly}
          onSelect={(d) => setSelected(d)}
          onDrillDay={(d) => {
            setSelected(d);
            setCursor(d);
            setView("day");
          }}
          onCreateAt={(d) => {
            if (isReadOnly) return;
            setPrefill({ date: fmtDate(d) });
            setCreateOpen(true);
          }}
        />
      )}

      {view === "week" && (
        <WeekView
          cursor={cursor}
          selected={selected}
          today={today}
          tasksByDay={tasksByDay}
          googleByDay={googleByDay}
          myColor={myColor}
          readOnly={isReadOnly}
          onSelect={(d) => setSelected(d)}
          onDrillDay={(d) => {
            setSelected(d);
            setCursor(d);
            setView("day");
          }}
          onCreateAt={(d) => {
            if (isReadOnly) return;
            setPrefill({ date: fmtDate(d) });
            setCreateOpen(true);
          }}
        />
      )}

      {view === "day" && (
        <DayView
          date={cursor}
          tasks={tasksByDay.get(dayKey(cursor)) ?? []}
          googleEvents={googleByDay.get(dayKey(cursor)) ?? []}
          myColor={myColor}
          projectsById={projectsById}
          readOnly={isReadOnly}
          onOpenTask={setOpenTask}
          onCreateSlot={(slotIdx) => {
            if (isReadOnly) return;
            const h = Math.floor(slotIdx / 2);
            const m = slotIdx % 2 === 0 ? 0 : 30;
            const endSlot = Math.min(slotIdx + 2, 48);
            const eh = Math.floor(endSlot / 2);
            const em = endSlot % 2 === 0 ? 0 : 30;
            setPrefill({ date: fmtDate(cursor), time: fmtTime(h, m), end: fmtTime(eh, em) });
            setCreateOpen(true);
          }}
          onCreateRange={(startSlot, endSlot) => {
            if (isReadOnly) return;
            const sh = Math.floor(startSlot / 2);
            const sm = startSlot % 2 === 0 ? 0 : 30;
            const eh = Math.floor(endSlot / 2);
            const em = endSlot % 2 === 0 ? 0 : 30;
            setPrefill({
              date: fmtDate(cursor),
              time: fmtTime(sh, sm),
              end: fmtTime(eh, em),
            });
            setCreateOpen(true);
          }}
        />
      )}

      {/* Selected day list (for month/week) */}
      {view !== "day" && (
        <SelectedDayList
          selected={selected}
          tasks={tasksByDay.get(dayKey(selected)) ?? []}
          googleEvents={googleByDay.get(dayKey(selected)) ?? []}
          myColor={myColor}
          projectsById={projectsById}
          onOpenTask={setOpenTask}
          readOnly={isReadOnly}
        />
      )}

      <TaskDetailDialog
        task={openTask}
        open={!!openTask}
        onOpenChange={(v) => !v && setOpenTask(null)}
      />

      <NewTaskDialog
        hideTrigger
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setPrefill(null);
        }}
        defaultDueDate={prefill?.date}
        defaultDueTime={prefill?.time}
        defaultEndTime={prefill?.end}
      />
    </div>
  );
}

/* ---------------- Month ---------------- */
function MonthView({
  cursor, selected, today, tasksByDay, googleByDay, myColor, readOnly, onSelect, onDrillDay, onCreateAt,
}: {
  cursor: Date; selected: Date; today: Date;
  tasksByDay: Map<string, Task[]>; googleByDay: Map<string, GoogleEvent[]>; myColor: string; readOnly?: boolean;
  onSelect: (d: Date) => void; onDrillDay: (d: Date) => void;
  onCreateAt: (d: Date) => void;
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
          const dayGoogle = googleByDay.get(key) ?? [];
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selected);
          return (
            <div
              key={key}
              className={cn(
                "group relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition cursor-pointer",
                isSelected ? "ring-2 ring-primary" : "hover:bg-surface-muted",
                isToday && !isSelected && "bg-surface-muted"
              )}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onDrillDay(d)}
            >
              <span className={cn(isToday && "font-bold text-primary")}>{d.getDate()}</span>
              {(dayTasks.length > 0 || dayGoogle.length > 0) && (
                <span className="absolute bottom-1 flex items-center gap-0.5">
                  {dayTasks.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: myColor }} />
                  )}
                  {dayGoogle.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" title="Google Calendar" />
                  )}
                </span>
              )}
              {!readOnly && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCreateAt(d); }}
                title="Pridať úlohu"
                className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground shadow group-hover:flex"
              >
                +
              </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Week ---------------- */
function WeekView({
  cursor, selected, today, tasksByDay, googleByDay, myColor, readOnly, onSelect, onDrillDay, onCreateAt,
}: {
  cursor: Date; selected: Date; today: Date;
  tasksByDay: Map<string, Task[]>; googleByDay: Map<string, GoogleEvent[]>; myColor: string; readOnly?: boolean;
  onSelect: (d: Date) => void; onDrillDay: (d: Date) => void;
  onCreateAt: (d: Date) => void;
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
        const dayGoogle = googleByDay.get(key) ?? [];
        const isToday = sameDay(d, today);
        const isSelected = sameDay(d, selected);
        return (
          <div
            key={key}
            className={cn(
              "group relative flex flex-col items-center gap-1 rounded-lg p-2 text-xs transition cursor-pointer",
              isSelected ? "ring-2 ring-primary" : "hover:bg-surface-muted",
              isToday && !isSelected && "bg-surface-muted"
            )}
            onClick={() => onSelect(d)}
            onDoubleClick={() => onDrillDay(d)}
          >
            <span className="text-[10px] font-bold uppercase text-muted-foreground">{WEEKDAYS[i]}</span>
            <span className={cn("text-base font-semibold", isToday && "text-primary")}>{d.getDate()}</span>
            <span className="flex h-1.5 items-center gap-0.5">
              {dayTasks.slice(0, 3).map((t) => (
                <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: myColor }} />
              ))}
              {dayGoogle.length > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" title="Google Calendar" />
              )}
            </span>
            {!readOnly && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCreateAt(d); }}
              title="Pridať úlohu"
              className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground shadow group-hover:flex"
            >
              +
            </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Day ---------------- */
const SLOT_PX = 28; // výška jedného 30-min slotu
const SLOTS_PER_DAY = 48;

function DayView({
  date, tasks, googleEvents = [], myColor, projectsById, readOnly, onOpenTask, onCreateSlot, onCreateRange,
}: {
  date: Date; tasks: Task[]; googleEvents?: GoogleEvent[]; myColor: string;
  projectsById: Map<string, Project>;
  readOnly?: boolean;
  onOpenTask: (t: Task) => void;
  onCreateSlot: (slotIdx: number) => void;
  onCreateRange: (startSlot: number, endSlot: number) => void;
}) {
  const toggleStatus = useToggleTaskDone();
  const del = useDeleteTask();
  const handleDelete = async (task: Task) => {
    if (!confirm("Naozaj zmazať túto úlohu?")) return;
    try {
      await del.mutateAsync(task.id);
      toast.success("Úloha zmazaná");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nepodarilo sa zmazať úlohu";
      toast.error(msg);
    }
  };
  const allDay = tasks.filter((t) => !hasTime(t));
  const timed = tasks
    .filter((t) => hasTime(t))
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

  const googleAllDay = googleEvents.filter((e) => e.all_day);
  const googleTimed = googleEvents.filter((e) => !e.all_day && e.start);

  const blocks = timed.map((t) => {
    const s = new Date(t.due_date!);
    const startSlot = s.getHours() * 2 + (s.getMinutes() >= 30 ? 1 : 0);
    let lengthSlots = 1;
    if (t.due_end) {
      const e = new Date(t.due_end);
      const endSlot = e.getHours() * 2 + Math.ceil(e.getMinutes() / 30);
      lengthSlots = Math.max(1, endSlot - startSlot);
    }
    return { task: t, startSlot, lengthSlots };
  });

  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startSlot: number; currSlot: number } | null>(null);

  const slotFromEvent = (clientY: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clientY - rect.top;
    return Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(y / SLOT_PX)));
  };

  return (
    <div className="space-y-3">
      {(allDay.length > 0 || googleAllDay.length > 0) && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Celý deň</p>
          <ul className="space-y-1">
            {allDay.map((t) => <TaskRow key={t.id} task={t} myColor={myColor} project={t.project_id ? projectsById.get(t.project_id) ?? null : null} onOpenTask={onOpenTask} onDelete={readOnly ? undefined : handleDelete} />)}
            {googleAllDay.map((e) => <GoogleEventRow key={e.id} event={e} />)}
          </ul>
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border/60">
        <div
          ref={gridRef}
          className="relative select-none"
          style={{ height: SLOTS_PER_DAY * SLOT_PX }}
          onMouseDown={readOnly ? undefined : (e) => {
            if ((e.target as HTMLElement).closest("[data-task-block]")) return;
            const s = slotFromEvent(e.clientY);
            setDrag({ startSlot: s, currSlot: s });
          }}
          onMouseMove={readOnly ? undefined : (e) => {
            if (!drag) return;
            const s = slotFromEvent(e.clientY);
            if (s !== drag.currSlot) setDrag({ ...drag, currSlot: s });
          }}
          onMouseUp={readOnly ? undefined : (e) => {
            if (!drag) return;
            const s = slotFromEvent(e.clientY);
            const a = Math.min(drag.startSlot, s);
            const b = Math.max(drag.startSlot, s);
            setDrag(null);
            if (a === b) onCreateSlot(a);
            else onCreateRange(a, b + 1);
          }}
          onMouseLeave={readOnly ? undefined : () => setDrag(null)}
        >
          {Array.from({ length: SLOTS_PER_DAY }).map((_, i) => {
            const isHour = i % 2 === 0;
            return (
              <div
                key={i}
                className={cn(
                  "absolute left-0 right-0 flex items-start gap-2 px-2",
                  isHour ? "border-t border-border/60" : "border-t border-dashed border-border/30"
                )}
                style={{ top: i * SLOT_PX, height: SLOT_PX }}
              >
                {isHour && (
                  <span className="w-10 shrink-0 pt-0.5 text-[10px] font-semibold text-muted-foreground">
                    {String(i / 2).padStart(2, "0")}:00
                  </span>
                )}
              </div>
            );
          })}

          {/* Drag preview */}
          {drag && (() => {
            const a = Math.min(drag.startSlot, drag.currSlot);
            const b = Math.max(drag.startSlot, drag.currSlot);
            return (
              <div
                className="pointer-events-none absolute left-12 right-2 rounded-md ring-2 ring-primary"
                style={{
                  top: a * SLOT_PX + 1,
                  height: (b - a + 1) * SLOT_PX - 2,
                  backgroundColor: "hsl(var(--primary) / 0.15)",
                }}
              />
            );
          })()}

          {blocks.map(({ task, startSlot, lengthSlots }) => {
            const d = new Date(task.due_date!);
            const e = task.due_end ? new Date(task.due_end) : null;
            const proj = task.project_id ? projectsById.get(task.project_id) ?? null : null;
            const accent = proj?.color || myColor;
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                data-task-block
                className="group absolute left-12 right-2 flex gap-1 overflow-hidden rounded-md px-2 py-1 text-left text-[11px]"
                style={{
                  top: startSlot * SLOT_PX + 1,
                  height: lengthSlots * SLOT_PX - 2,
                  backgroundColor: `${accent}22`,
                  borderLeft: `3px solid ${accent}`,
                  opacity: isDone ? 0.6 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); toggleStatus(task); }}
                  title={isDone ? "Označiť ako nedokončenú" : "Označiť ako dokončenú"}
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition",
                    isDone
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary"
                  )}
                >
                  {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="flex-1 overflow-hidden text-left hover:opacity-90"
                >
                  {proj && (
                    <div className="flex items-center gap-1 truncate text-[10px] font-semibold" style={{ color: accent }}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                      <span className="truncate">{proj.name}</span>
                    </div>
                  )}
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
                    {e && ` – ${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`}
                  </div>
                  <div className={cn("truncate font-semibold", isDone && "line-through")}>{task.title}</div>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); void handleDelete(task); }}
                    title="Vymazať úlohu"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Google Calendar timed events — read-only, on the right half */}
          {googleTimed.map((ev) => {
            const s = new Date(ev.start!);
            const e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 30 * 60 * 1000);
            const startSlot = s.getHours() * 2 + (s.getMinutes() >= 30 ? 1 : 0);
            const endSlot = e.getHours() * 2 + Math.ceil(e.getMinutes() / 30);
            const lengthSlots = Math.max(1, endSlot - startSlot);
            return (
              <a
                key={ev.id}
                href={ev.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                data-task-block
                className="absolute right-2 overflow-hidden rounded-md border border-dashed border-border/70 bg-surface-muted/60 px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-surface-muted"
                style={{
                  left: "55%",
                  top: startSlot * SLOT_PX + 1,
                  height: lengthSlots * SLOT_PX - 2,
                }}
                title="Google Calendar"
              >
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  Google
                </div>
                <div className="font-mono text-[10px]">
                  {String(s.getHours()).padStart(2, "0")}:{String(s.getMinutes()).padStart(2, "0")}
                </div>
                <div className="truncate font-semibold">{ev.title}</div>
              </a>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        {readOnly ? "Náhľad iba na čítanie." : "Klikni na hodinu pre 1 h úlohu alebo potiahni pre vlastný rozsah."}
      </p>

      {tasks.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">Žiadne úlohy v tento deň.</p>
      )}
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function SelectedDayList({
  selected, tasks, googleEvents = [], myColor, projectsById, onOpenTask,
}: {
  selected: Date; tasks: Task[]; googleEvents?: GoogleEvent[]; myColor: string;
  projectsById: Map<string, Project>;
  onOpenTask: (t: Task) => void;
}) {
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {selected.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      {tasks.length === 0 && googleEvents.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Žiadne úlohy.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                myColor={myColor}
                project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
                onOpenTask={onOpenTask}
              />
            ))}
          </ul>
          {googleEvents.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {googleEvents.map((e) => (
                <GoogleEventRow key={e.id} event={e} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({
  task, myColor, project, onOpenTask,
}: {
  task: Task; myColor: string; project: Project | null; onOpenTask: (t: Task) => void;
}) {
  const timed = hasTime(task);
  const d = task.due_date ? new Date(task.due_date) : null;
  const accent = project?.color || myColor;
  const toggleStatus = useToggleTaskDone();
  const isDone = task.status === "done";
  return (
    <li>
      <div className="group flex items-start gap-1 rounded-lg p-1.5 hover:bg-surface-muted">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleStatus(task); }}
          title={isDone ? "Označiť ako nedokončenú" : "Označiť ako dokončenú"}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition",
            isDone
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card hover:border-primary"
          )}
        >
          {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className="flex flex-1 flex-col gap-0.5 text-left text-xs"
        >
          {project && (
            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            {timed && d && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
              </span>
            )}
            <span className={cn("flex-1 truncate", isDone && "line-through text-muted-foreground")}>{task.title}</span>
          </span>
        </button>
      </div>
    </li>
  );
}

function GoogleEventRow({ event }: { event: GoogleEvent }) {
  const d = event.start ? new Date(event.start) : null;
  return (
    <li>
      <a
        href={event.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 bg-surface-muted/40 p-1.5 text-xs text-muted-foreground hover:bg-surface-muted"
        title="Google Calendar"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/60" />
        {!event.all_day && d && (
          <span className="font-mono text-[10px]">
            {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}
          </span>
        )}
        <span className="flex-1 truncate">{event.title}</span>
        <span className="text-[9px] uppercase tracking-wider">G</span>
      </a>
    </li>
  );
}
