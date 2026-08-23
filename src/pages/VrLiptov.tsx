import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Headset } from "lucide-react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import {
  VR_KIND_META,
  useCreateVrEntry,
  useDeleteVrEntry,
  useVrEntries,
  type VrEntryKind,
} from "@/lib/vrApi";

const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];
const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

// Predvolené časové rozsahy podľa typu zápisu
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

export default function VrLiptov() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));

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
    const m = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = m.get(e.day) ?? [];
      arr.push(e);
      m.set(e.day, arr);
    }
    return m;
  }, [entries]);

  // Mriežka mesiaca začínajúca pondelkom
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
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:pl-72 md:pr-8">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Headset className="h-6 w-6 text-primary" /> VR Liptov
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dochádzka a rezervácie VR herne. <strong>7:00 – 14:00</strong> kancelária / práca,{" "}
          <strong>14:00 – 20:00</strong> VR sessions pre zákazníkov (ak nie sú klienti, dá sa využiť na prácu).
        </p>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Predchádzajúci mesiac"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Nasledujúci mesiac"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
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
                onClick={() => setSelected(k)}
                className={cn(
                  "flex min-h-[62px] flex-col items-center gap-1 rounded-xl border p-1.5 text-xs transition",
                  isSel
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border/50 hover:bg-surface-muted",
                  k === todayKey && !isSel && "border-primary/50"
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

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(VR_KIND_META) as VrEntryKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", VR_KIND_META[k].dot)} />
              {VR_KIND_META[k].label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-border/60 bg-card/60 p-4">
        <h2 className="mb-3 text-base font-semibold">
          {selectedDate.getDate()}. {MONTHS[selectedDate.getMonth()].toLowerCase()} {selectedDate.getFullYear()}
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
                  className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2"
                >
                  <UserAvatar profile={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p?.full_name?.trim() || p?.email || "Používateľ"}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {hhmm(e.start_time)}–{hhmm(e.end_time)}
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
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(VR_KIND_META) as VrEntryKind[]).map((k) => (
                <SelectItem key={k} value={k}>{VR_KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="sm:w-28" />
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="sm:w-28" />
          <Button onClick={submit} disabled={createEntry.isPending}>
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
