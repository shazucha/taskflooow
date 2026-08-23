import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { VrHeadsetIcon } from "@/components/VrHeadsetIcon";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import {
  VR_KIND_META,
  useCreateVrEntry,
  useDeleteVrEntry,
  useVrEntries,
  type VrEntry,
  type VrEntryKind,
} from "@/lib/vrApi";

const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];
const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

// Rozsah otváracích hodín zobrazený na časovej osi
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 7:00 – 20:00

const KIND_DEFAULT_TIME: Record<VrEntryKind, { start: string; end: string }> = {
  work: { start: "07:00", end: "14:00" },
  session: { start: "14:00", end: "20:00" },
  reservation: { start: "14:00", end: "20:00" },
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Trvanie zápisu v hodinách (napr. 2,5 h)
function durationLabel(e: VrEntry) {
  const mins = toMin(e.end_time) - toMin(e.start_time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h},${String(Math.round((m / 60) * 10))} h` : `${h} h`;
}

export default function VrLiptov() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [openHour, setOpenHour] = useState<number | null>(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const { data: entries = [] } = useVrEntries(dayKey(monthStart), dayKey(monthEnd));

  const createEntry = useCreateVrEntry();
  const deleteEntry = useDeleteVrEntry();

  const [kind, setKind] = useState<VrEntryKind>("work");
  const [start, setStart] = useState(KIND_DEFAULT_TIME.work.start);
  const [end, setEnd] = useState(KIND_DEFAULT_TIME.work.end);
  const [note, setNote] = useState("");

  const byDay = useMemo(() => {
    const m = new Map<string, VrEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.day) ?? [];
      arr.push(e);
      m.set(e.day, arr);
    }
    return m;
  }, [entries]);

  const cells = useMemo(() => {
    const offset = (monthStart.getDay() + 6) % 7;
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor, monthStart, monthEnd]);

  const dayEntries = byDay.get(selected) ?? [];
  const todayKey = dayKey(new Date());

  // Kto je prítomný v danej hodine
  const entriesForHour = (h: number) =>
    dayEntries.filter((e) => toMin(e.start_time) < (h + 1) * 60 && toMin(e.end_time) > h * 60);

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Používateľ";
  };

  function pickKind(k: VrEntryKind) {
    setKind(k);
    setStart(KIND_DEFAULT_TIME[k].start);
    setEnd(KIND_DEFAULT_TIME[k].end);
  }

  async function submit() {
    if (!userId) return;
    if (start >= end) {
      toast.error("Koniec musí byť neskôr ako začiatok.");
      return;
    }
    try {
      await createEntry.mutateAsync({
        user_id: userId,
        day: selected,
        start_time: start,
        end_time: end,
        kind,
        note: note.trim() || null,
      });
      setNote("");
      toast.success("Zaznačené.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa uložiť.");
    }
  }

  const selectedDate = new Date(`${selected}T00:00:00`);

  return (
    <main className="mx-auto w-full max-w-5xl px-3 pb-28 pt-5 sm:px-4 sm:pt-6 md:pl-72 md:pr-8">
      <header className="mb-5 rounded-2xl border border-vr/30 bg-vr-soft/60 p-4">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-vr sm:text-2xl">
          <VrHeadsetIcon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" /> VR Liptov
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Dochádzka a rezervácie VR herne. <strong>7:00 – 14:00</strong> kancelária / práca,{" "}
          <strong>14:00 – 20:00</strong> VR sessions pre zákazníkov (ak nie sú klienti, dá sa využiť na prácu).
        </p>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold sm:text-base">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Predchádzajúci mesiac"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Nasledujúci mesiac"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground sm:text-[11px]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const isSel = k === selected;
            return (
              <button
                key={k}
                onClick={() => { setSelected(k); setOpenHour(null); }}
                className={cn(
                  "flex min-h-[52px] flex-col items-center gap-1 rounded-xl border p-1 text-[11px] transition sm:min-h-[62px] sm:p-1.5 sm:text-xs",
                  isSel
                    ? "border-vr bg-vr-soft text-vr"
                    : "border-border/50 hover:bg-surface-muted",
                  k === todayKey && !isSel && "border-vr/50"
                )}
              >
                <span className="font-semibold">{d.getDate()}</span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {list.slice(0, 6).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", VR_KIND_META[e.kind].dot)} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground sm:text-[11px]">
          {(Object.keys(VR_KIND_META) as VrEntryKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", VR_KIND_META[k].dot)} />
              {VR_KIND_META[k].label}
            </span>
          ))}
        </div>
      </section>

      {/* Časová os – rozklikni hodinu a uvidíš, kto tam bude */}
      <section className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-3 sm:mt-5 sm:p-4">
        <h2 className="mb-1 text-sm font-semibold sm:text-base">
          Rozpis hodín — {selectedDate.getDate()}. {MONTHS[selectedDate.getMonth()].toLowerCase()}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Klikni na hodinu a uvidíš, kto tam v tom čase bude.</p>

        <div className="grid grid-cols-3 gap-1.5 xs:grid-cols-4 sm:grid-cols-7">
          {HOURS.map((h) => {
            const list = entriesForHour(h);
            const isOpen = openHour === h;
            return (
              <button
                key={h}
                onClick={() => setOpenHour(isOpen ? null : h)}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition",
                  isOpen
                    ? "border-vr bg-vr text-vr-foreground"
                    : list.length > 0
                      ? "border-vr/40 bg-vr-soft text-vr hover:border-vr"
                      : "border-border/50 text-muted-foreground hover:bg-surface-muted"
                )}
              >
                <span>{String(h).padStart(2, "0")}:00</span>
                <span className="flex items-center gap-1 text-[10px] opacity-90">
                  <Users className="h-3 w-3" /> {list.length}
                </span>
              </button>
            );
          })}
        </div>

        {openHour !== null && (
          <div className="mt-3 rounded-xl border border-vr/30 bg-vr-soft/50 p-3">
            <p className="mb-2 text-xs font-semibold text-vr">
              {String(openHour).padStart(2, "0")}:00 – {String(openHour + 1).padStart(2, "0")}:00
              {openHour < 14 ? " · kancelária / práca" : " · VR sessions"}
            </p>
            {entriesForHour(openHour).length === 0 ? (
              <p className="text-xs text-muted-foreground">V tejto hodine nikto nie je nahlásený.</p>
            ) : (
              <ul className="space-y-1.5">
                {entriesForHour(openHour).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg bg-card/70 px-2 py-1.5">
                    <UserAvatar profile={profiles.find((x) => x.id === e.user_id)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{nameOf(e.user_id)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {hhmm(e.start_time)}–{hhmm(e.end_time)} · {durationLabel(e)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-3 sm:mt-5 sm:p-4">
        <h2 className="mb-3 text-sm font-semibold sm:text-base">
          Nahlásení na {selectedDate.getDate()}. {MONTHS[selectedDate.getMonth()].toLowerCase()} {selectedDate.getFullYear()}
        </h2>

        {dayEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatiaľ sa nikto nenahlásil na tento deň.</p>
        ) : (
          <ul className="space-y-2">
            {dayEntries.map((e) => {
              const p = profiles.find((x) => x.id === e.user_id);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-2 sm:gap-3 sm:px-3"
                >
                  <UserAvatar profile={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p?.full_name?.trim() || p?.email || "Používateľ"}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {hhmm(e.start_time)}–{hhmm(e.end_time)} · {durationLabel(e)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className={cn("mr-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", VR_KIND_META[e.kind].badge)}>
                        {VR_KIND_META[e.kind].label}
                      </span>
                      {e.note}
                    </p>
                  </div>
                  {e.user_id === userId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => deleteEntry.mutate(e.id)}
                      aria-label="Zmazať zápis"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Select value={kind} onValueChange={(v) => pickKind(v as VrEntryKind)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(VR_KIND_META) as VrEntryKind[]).map((k) => (
                <SelectItem key={k} value={k}>{VR_KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full sm:w-28" />
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full sm:w-28" />
          </div>
          <Button onClick={submit} disabled={createEntry.isPending} className="w-full bg-vr text-vr-foreground hover:bg-vr/90 sm:w-auto">
            <Plus className="mr-1 h-4 w-4" /> Nahlásiť sa
          </Button>
          <Input
            placeholder="Poznámka (napr. rezervácia pre firemku, práca na projekte…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="sm:col-span-4"
          />
        </div>
      </section>
    </main>
  );
}
