import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Coins, Download, Plus, Printer, Trash2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VrPartnersTab } from "@/components/vr/VrPartnersTab";
import { VrFinanceTab } from "@/components/vr/VrFinanceTab";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

// Voliteľné rozsahy časovej osi (od–do)
const RANGE_OPTIONS = [
  { id: "7-20", label: "7:00 – 20:00", from: 7, to: 20 },
  { id: "6-23", label: "6:00 – 23:00", from: 6, to: 23 },
  { id: "0-24", label: "Celých 24 hodín", from: 0, to: 24 },
] as const;

const RANGE_STORAGE_KEY = "vr-liptov-range";

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

const VR_TABS = ["dochadzka", "spolocnici", "financie"] as const;

export default function VrLiptov() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  // Aktívny tab v URL (?tab=financie) — dá sa naň odkázať jedným tapom odkiaľkoľvek.
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") ?? "";
  const activeTab = (VR_TABS as readonly string[]).includes(tabParam) ? tabParam : "dochadzka";
  const setActiveTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [openHour, setOpenHour] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<string>(() => {
    // Rozsah sa pamätá ako šablóna pre ďalšie dni.
    try {
      const saved = window.localStorage.getItem(RANGE_STORAGE_KEY);
      if (saved && RANGE_OPTIONS.some((r) => r.id === saved)) return saved;
    } catch { /* localStorage nemusí byť dostupné */ }
    return "7-20";
  });
  const [focusHour, setFocusHour] = useState<number | null>(null);

  const saveRange = (v: string) => {
    setRangeId(v);
    setOpenHour(null);
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, v);
    } catch { /* ignore */ }
  };

  const range = RANGE_OPTIONS.find((r) => r.id === rangeId) ?? RANGE_OPTIONS[0];
  const hours = useMemo(
    () => Array.from({ length: range.to - range.from }, (_, i) => range.from + i),
    [range]
  );

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

  // Hodiny s prekrývaním viacerých zápisov
  const conflicts = hours
    .map((h) => ({ hour: h, list: entriesForHour(h) }))
    .filter((c) => c.list.length > 1);

  // Tlač / export do PDF cez systémový dialóg prehliadača (Uložiť ako PDF)
  function printSchedule() {
    window.print();
  }

  // Export rozpisu vybraného dňa do CSV (otvoriteľné v Exceli)
  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows: string[][] = [["Hodina od", "Hodina do", "Stav", "Počet zápisov", "Nahlásení"]];
    for (const h of hours) {
      const list = entriesForHour(h);
      rows.push([
        `${String(h).padStart(2, "0")}:00`,
        `${String(h + 1).padStart(2, "0")}:00`,
        list.length === 0 ? "voľné" : list.length > 1 ? "prekrývanie" : "obsadené",
        String(list.length),
        list
          .map((e) => `${nameOf(e.user_id)} ${hhmm(e.start_time)}-${hhmm(e.end_time)} (${VR_KIND_META[e.kind].label})`)
          .join("; "),
      ]);
    }
    const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vr-liptov-${selected}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV stiahnuté.");
  }

  // Klávesnica: šípky menia hodinu, Enter otvorí detail, Esc zatvorí
  function onHoursKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = hours.indexOf(focusHour ?? openHour ?? hours[0]);
    const move = (delta: number) => {
      e.preventDefault();
      const next = hours[Math.min(hours.length - 1, Math.max(0, idx + delta))];
      setFocusHour(next);
      document.getElementById(`vr-hour-${next}`)?.focus();
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(-1);
    else if (e.key === "Home") move(-hours.length);
    else if (e.key === "End") move(hours.length);
    else if (e.key === "Escape") {
      setOpenHour(null);
    }
  }

  return (
    <main className="w-full overflow-x-hidden px-3 pb-28 pt-5 sm:px-6 md:px-10 md:pt-10 md:pb-12 2xl:mx-auto 2xl:max-w-[1700px]">
      <header className="mb-4 rounded-2xl border border-vr/30 bg-vr-soft/60 p-4 sm:mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-vr sm:text-2xl">
          <VrHeadsetIcon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" /> VR Liptov
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Dochádzka a rezervácie VR herne. <strong>7:00 – 14:00</strong> kancelária / práca,{" "}
          <strong>14:00 – 20:00</strong> VR sessions pre zákazníkov (ak nie sú klienti, dá sa využiť na prácu).
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-3 mb-4 overflow-x-auto px-3 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 p-1 sm:w-full">
            <TabsTrigger value="dochadzka" className="shrink-0 gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <CalendarDays className="h-4 w-4" /> Dochádzka
            </TabsTrigger>
            <TabsTrigger value="spolocnici" className="shrink-0 gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Users className="h-4 w-4" /> Spoločníci
            </TabsTrigger>
            <TabsTrigger value="financie" className="shrink-0 gap-1.5 whitespace-nowrap text-xs sm:text-sm">
              <Coins className="h-4 w-4" /> Výdaje a príjmy
            </TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="dochadzka" className="mt-0">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start xl:gap-6">

      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4 lg:p-5">
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

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground sm:text-[11px] lg:gap-2 lg:text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 lg:gap-2">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const isSel = k === selected;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={isSel}
                aria-label={`${d.getDate()}. ${MONTHS[d.getMonth()].toLowerCase()}, nahlásených ${list.length}`}
                onClick={() => { setSelected(k); setOpenHour(null); }}
                className={cn(
                  "flex min-h-[52px] flex-col items-center gap-1 rounded-xl border p-1 text-[11px] transition sm:min-h-[62px] sm:p-1.5 sm:text-xs lg:min-h-[86px] lg:justify-start lg:gap-1.5 lg:p-2 lg:text-sm",
                  isSel
                    ? "border-vr bg-vr-soft text-vr"
                    : "border-border/50 hover:bg-surface-muted",
                  k === todayKey && !isSel && "border-vr/50"
                )}
              >
                <span className="font-semibold lg:text-base">{d.getDate()}</span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {list.slice(0, 6).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full lg:h-2 lg:w-2", VR_KIND_META[e.kind].dot)} />
                  ))}
                </span>
                {list.length > 0 && (
                  <span className="hidden text-[10px] font-medium text-muted-foreground lg:block">
                    {list.length} {list.length === 1 ? "zápis" : list.length < 5 ? "zápisy" : "zápisov"}
                  </span>
                )}
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
      <section id="vr-print-area" className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4 lg:mt-0">
        {/* Hlavička len pre tlač */}
        <h2 className="mb-2 hidden text-base font-bold print:block">
          VR Liptov — rozpis {selectedDate.getDate()}. {MONTHS[selectedDate.getMonth()].toLowerCase()}{" "}
          {selectedDate.getFullYear()} ({range.label})
        </h2>
        <div className="mb-2 grid gap-2 print:hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold sm:text-base">
            Rozpis hodín — {selectedDate.getDate()}. {MONTHS[selectedDate.getMonth()].toLowerCase()}
          </h2>
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <label htmlFor="vr-range" className="sr-only">Rozsah hodín</label>
            <Select value={rangeId} onValueChange={saveRange}>
              <SelectTrigger id="vr-range" className="col-span-2 h-9 w-full text-xs sm:w-[170px]" aria-label="Rozsah hodín rozpisu">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 w-full gap-1.5 text-xs sm:w-auto" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
            <Button variant="outline" size="sm" className="h-9 w-full gap-1.5 text-xs sm:w-auto" onClick={printSchedule}>
              <Printer className="h-4 w-4" aria-hidden /> Tlač / PDF
            </Button>
          </div>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Klikni na hodinu a uvidíš, kto tam v tom čase bude. Zelená = voľné, fialová = obsadené,
          oranžová = prekrývanie viacerých zápisov. Ovládanie klávesnicou: šípky menia hodinu, Enter otvorí detail, Esc zatvorí.
        </p>

        {/* Horizontálne scrollovateľná os hodín — od–do zostáva čitateľné aj na mobile */}
        <div
          role="group"
          aria-label={`Časová os hodín ${range.from}:00 až ${range.to}:00`}
          onKeyDown={onHoursKeyDown}
        >
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-7 xl:grid-cols-7">
            {hours.map((h) => {
              const list = entriesForHour(h);
              const isOpen = openHour === h;
              const isOverlap = list.length > 1; // prekrývanie viacerých zápisov
              const isBusy = list.length === 1;
              const names = list.map((e) => `${nameOf(e.user_id)} ${hhmm(e.start_time)}–${hhmm(e.end_time)}`);
              const tip = list.length
                ? `${list.length > 1 ? "Prekrývanie: " : ""}${names.join(" · ")}`
                : "Voľná hodina — nikto nie je nahlásený";
              return (
                <Tooltip key={h}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      id={`vr-hour-${h}`}
                      onFocus={() => setFocusHour(h)}
                      onClick={() => setOpenHour(isOpen ? null : h)}
                      aria-pressed={isOpen}
                      aria-label={`${String(h).padStart(2, "0")}:00 – ${String(h + 1).padStart(2, "0")}:00, nahlásených ${list.length}`}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition lg:py-3",
                        isOpen
                          ? "border-vr bg-vr text-vr-foreground ring-2 ring-vr/40"
                          : isOverlap
                            ? "border-warning bg-warning/15 text-warning hover:border-warning"
                            : isBusy
                              ? "border-vr/50 bg-vr-soft text-vr hover:border-vr"
                              : "border-success/40 bg-success/10 text-success hover:border-success"
                      )}
                    >
                      <span className="tabular-nums">
                        {String(h).padStart(2, "0")}:00
                      </span>
                      <span className="text-[10px] opacity-80 tabular-nums">
                        –{String(h + 1).padStart(2, "0")}:00
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold">
                        <Users className="h-3 w-3" aria-hidden />
                        {list.length} {list.length === 1 ? "zápis" : list.length < 5 ? "zápisy" : "zápisov"}
                        {isOverlap && <span aria-hidden>⚠</span>}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-xs">{tip}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Prehľad konfliktov */}
        {conflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-warning/50 bg-warning/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Prekrývanie v {conflicts.length} {conflicts.length === 1 ? "hodine" : conflicts.length < 5 ? "hodinách" : "hodinách"}
            </p>
            <ul className="mt-1.5 space-y-1">
              {conflicts.map((c) => (
                <li key={c.hour} className="text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setOpenHour(c.hour)}
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {String(c.hour).padStart(2, "0")}:00–{String(c.hour + 1).padStart(2, "0")}:00
                  </button>{" "}
                  — {c.list.map((e) => `${nameOf(e.user_id)} ${hhmm(e.start_time)}–${hhmm(e.end_time)}`).join(" × ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Legenda stavov hodín */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground sm:text-[11px] print:hidden">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-success/40 bg-success/20" /> Voľné
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-vr/50 bg-vr-soft" /> Obsadené
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-warning bg-warning/25" /> Prekrývanie (2+ zápisy)
          </span>
        </div>

        {/* Kompletný rozpis pre tlač / PDF */}
        <table className="mt-3 hidden w-full border-collapse text-[11px] print:table">
          <thead>
            <tr>
              <th className="border border-black/30 px-2 py-1 text-left">Hodina</th>
              <th className="border border-black/30 px-2 py-1 text-left">Stav</th>
              <th className="border border-black/30 px-2 py-1 text-left">Nahlásení</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => {
              const list = entriesForHour(h);
              return (
                <tr key={h}>
                  <td className="border border-black/30 px-2 py-1 tabular-nums">
                    {String(h).padStart(2, "0")}:00–{String(h + 1).padStart(2, "0")}:00
                  </td>
                  <td className="border border-black/30 px-2 py-1">
                    {list.length === 0 ? "voľné" : list.length > 1 ? `prekrývanie (${list.length})` : "obsadené"}
                  </td>
                  <td className="border border-black/30 px-2 py-1">
                    {list
                      .map((e) => `${nameOf(e.user_id)} ${hhmm(e.start_time)}–${hhmm(e.end_time)} (${VR_KIND_META[e.kind].label})`)
                      .join("; ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {openHour !== null && (
          <div className="mt-3 rounded-xl border border-vr/30 bg-vr-soft/50 p-3 print:hidden">
            <p className="mb-2 text-xs font-semibold text-vr">
              {String(openHour).padStart(2, "0")}:00 – {String(openHour + 1).padStart(2, "0")}:00
              {openHour < 14 ? " · kancelária / práca" : " · VR sessions"}
              <span className="ml-2 rounded-full bg-vr/15 px-2 py-0.5 text-[10px] font-bold">
                {entriesForHour(openHour).length} nahlásených
              </span>
            </p>
            {entriesForHour(openHour).length === 0 ? (
              <p className="text-xs text-muted-foreground">V tejto hodine nikto nie je nahlásený.</p>
            ) : (
              <ul className="space-y-1.5">
                {entriesForHour(openHour).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-card/70 px-2 py-1.5">
                    <UserAvatar profile={profiles.find((x) => x.id === e.user_id)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{nameOf(e.user_id)}</span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", VR_KIND_META[e.kind].badge)}>
                      {VR_KIND_META[e.kind].label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {hhmm(e.start_time)}–{hhmm(e.end_time)} · {durationLabel(e)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      </div>

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
        </TabsContent>

        <TabsContent value="spolocnici" className="mt-0">
          <VrPartnersTab />
        </TabsContent>

        <TabsContent value="financie" className="mt-0">
          <VrFinanceTab />
        </TabsContent>
      </Tabs>
    </main>

  );
}
