import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Plus, Sparkles, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useCreateMonthlyBonus,
  useCurrentUserId,
  useDeleteMonthlyBonus,
  useProjectMonthlyBonuses,
  useProjects,
  useProjectServiceOverrides,
  useServiceCatalog,
  useUpdateMonthlyBonus,
} from "@/lib/queries";
import { NewTaskDialog } from "./NewTaskDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";

interface Props {
  projectId: string;
}

function fmtMoney(n: number | null | undefined, cur: string | null | undefined) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("sk-SK", { style: "currency", currency: cur ?? "EUR" }).format(n);
  } catch {
    return `${n} ${cur ?? ""}`.trim();
  }
}

function bonusValue(b: {
  qty: number;
  unit_price: number | null;
  hours: number | null;
  hourly_rate: number | null;
  unit_type?: "piece" | "hourly";
}): number {
  const qty = Number(b.qty || 1);
  // Ak je položka explicitne hodinová, počítame hodiny × hodinovka × ks.
  if (b.unit_type === "hourly") {
    if (b.hours != null && b.hourly_rate != null) {
      return Number(b.hours) * Number(b.hourly_rate) * qty;
    }
    return 0;
  }
  // Inak preferujeme fixnú jednotkovú cenu × ks.
  if (b.unit_price != null) return Number(b.unit_price) * qty;
  // Fallback (staré dáta bez unit_type): ak má hodiny + hodinovku, počítaj.
  if (b.hours != null && b.hourly_rate != null) {
    return Number(b.hours) * Number(b.hourly_rate) * qty;
  }
  return 0;
}

export function MonthlyBonusesCard({ projectId }: Props) {
  const userId = useCurrentUserId();
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const { data: bonuses = [], isLoading } = useProjectMonthlyBonuses(projectId, monthKey);
  const create = useCreateMonthlyBonus(projectId);
  const update = useUpdateMonthlyBonus(projectId);
  const remove = useDeleteMonthlyBonus(projectId);
  const { data: catalog = [] } = useServiceCatalog(false);
  const { data: overrides = [] } = useProjectServiceOverrides(projectId);
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const projectHourlyRate = project?.hourly_rate ?? null;
  const currency = project?.currency ?? "EUR";

  // Mapy pre rýchly lookup
  const overrideMap = useMemo(() => {
    const m = new Map<string, { unit_price: number | null; default_hours: number | null }>();
    overrides.forEach((o) => m.set(o.catalog_id, { unit_price: o.unit_price, default_hours: o.default_hours }));
    return m;
  }, [overrides]);

  const effectiveCatalog = useMemo(() => {
    return catalog.map((c) => {
      const o = overrideMap.get(c.id);
      return {
        ...c,
        effective_unit_price: o?.unit_price ?? c.unit_price,
        effective_default_hours: o?.default_hours ?? c.default_hours,
      };
    });
  }, [catalog, overrideMap]);

  const [adding, setAdding] = useState(false);
  // 'template' | 'custom'
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [catalogId, setCatalogId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [unitType, setUnitType] = useState<"piece" | "hourly">("piece");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const { doneCount, total, totalValue, totalHours } = useMemo(
    () => ({
      doneCount: bonuses.filter((b) => b.done).length,
      total: bonuses.length,
      totalValue: bonuses.reduce((s, b) => s + bonusValue(b), 0),
      totalHours: bonuses.reduce((s, b) => s + (b.hours != null ? Number(b.hours) * Number(b.qty || 1) : 0), 0),
    }),
    [bonuses]
  );

  const resetForm = () => {
    setAdding(false);
    setMode("template");
    setCatalogId("");
    setQty("1");
    setTitle("");
    setNote("");
    setUnitPrice("");
    setHours("");
    setUnitType("piece");
  };

  const onPickTemplate = (id: string) => {
    setCatalogId(id);
    const item = effectiveCatalog.find((c) => c.id === id);
    if (item) {
      setTitle(item.title);
      setUnitType(item.unit_type);
      setUnitPrice(String(item.effective_unit_price ?? ""));
      setHours(item.effective_default_hours != null ? String(item.effective_default_hours) : "");
    }
  };

  const submit = async () => {
    if (!userId) return;
    const finalTitle = title.trim();
    if (!finalTitle) return;
    const qtyNum = Number(qty || "1") || 1;
    const hoursNum = hours.trim() ? Number(hours) : null;
    const unitPriceNum = unitPrice.trim() ? Number(unitPrice) : null;
    try {
      await create.mutateAsync({
        project_id: projectId,
        month_key: monthKey,
        title: finalTitle,
        note: note.trim() || null,
        position: bonuses.length,
        created_by: userId,
        qty: qtyNum,
        unit_price: unitPriceNum,
        hours: hoursNum,
        hourly_rate: projectHourlyRate,
        catalog_id: mode === "template" && catalogId ? catalogId : null,
        unit_type: unitType,
      });
      resetForm();
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const onBonusClick = (name: string) => {
    setTaskTitle(name);
    setTaskOpen(true);
  };

  const toggleDone = (id: string, done: boolean) => {
    update.mutate({
      id,
      patch: {
        done: !done,
        done_by: !done ? userId : null,
        done_at: !done ? new Date().toISOString() : null,
      },
    });
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> Bonusy v rámci predplatného
        </h2>
        {!adding && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Pridať
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold capitalize">
          {formatMonthLabel(monthKey)}
          {total > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              · {doneCount}/{total} hotových
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Nasledujúci mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Bonusy sa ukladajú iba pre tento mesiac — nezdedia sa do ďalších.
      </p>

      {/* Súhrn hodnoty bonusov (čo klient ušetril v rámci predplatného) */}
      {bonuses.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-success/10 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Wallet className="h-3 w-3" /> Klient ušetril
            </div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-success">
              {fmtMoney(totalValue, currency)}
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> Hodín spolu
            </div>
            <div className="mt-0.5 text-base font-bold tabular-nums">
              {totalHours > 0 ? `${totalHours.toFixed(1)} h` : "—"}
            </div>
            {projectHourlyRate != null && (
              <div className="text-[10px] text-muted-foreground">
                hodinovka {fmtMoney(projectHourlyRate, currency)}
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam...</p>
      ) : bonuses.length === 0 && !adding ? (
        <p className="rounded-xl bg-surface-muted p-4 text-center text-xs text-muted-foreground">
          V tomto mesiaci žiadne bonusy. Klikni „Pridať".
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bonuses.map((b) => (
            <li
              key={b.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl border px-2 py-2 transition",
                b.done
                  ? "border-success/30 bg-success/5"
                  : "border-border bg-surface-muted/40 hover:border-primary/40"
              )}
            >
              <button
                type="button"
                disabled={!userId || update.isPending}
                onClick={() => toggleDone(b.id, b.done)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                  b.done
                    ? "border-success bg-success text-success-foreground"
                    : "border-border bg-card hover:border-primary"
                )}
                aria-label={b.done ? "Označiť ako nehotové" : "Označiť ako hotové"}
              >
                {b.done && <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => onBonusClick(b.title)}
                className={cn(
                  "min-w-0 flex-1 text-left text-sm transition",
                  b.done ? "text-muted-foreground line-through" : "text-foreground hover:text-primary"
                )}
                title={b.note ?? `Vytvoriť úlohu: ${b.title}`}
              >
                <span className="truncate block">
                  {Number(b.qty) > 1 && (
                    <span className="mr-1 text-muted-foreground">{Number(b.qty)}×</span>
                  )}
                  {b.title}
                </span>
                {b.note && (
                  <span className="block truncate text-[11px] text-muted-foreground">{b.note}</span>
                )}
                {(b.hours != null || b.unit_price != null) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {b.hours != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {Number(b.hours)}h{Number(b.qty) > 1 ? ` × ${Number(b.qty)}` : ""}
                      </span>
                    )}
                    {b.unit_price != null && (
                      <span>
                        {fmtMoney(b.unit_price, currency)}
                        {Number(b.qty) > 1 ? ` × ${Number(b.qty)}` : ""} / ks
                      </span>
                    )}
                  </span>
                )}
              </button>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {bonusValue(b) > 0 ? fmtMoney(bonusValue(b), currency) : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Odstrániť „${b.title}" z bonusov?`)) {
                    remove.mutate(b.id);
                  }
                }}
                className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Odstrániť"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3">
          {/* Prepínač zdroj */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={cn(
                "rounded-md py-1.5 text-xs font-semibold transition",
                mode === "template" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Z cenníka
            </button>
            <button
              type="button"
              onClick={() => { setMode("custom"); setCatalogId(""); }}
              className={cn(
                "rounded-md py-1.5 text-xs font-semibold transition",
                mode === "custom" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Vlastná položka
            </button>
          </div>

          {mode === "template" && (
            <div className="space-y-1">
              <Label htmlFor="mb-cat" className="text-xs">Vyber službu</Label>
              {effectiveCatalog.length === 0 ? (
                <p className="rounded-md bg-card px-3 py-2 text-[11px] text-muted-foreground">
                  Cenník je prázdny. Admin ho môže nastaviť v Profile.
                </p>
              ) : (
                <select
                  id="mb-cat"
                  value={catalogId}
                  onChange={(e) => onPickTemplate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— vyber —</option>
                  {effectiveCatalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {fmtMoney(c.effective_unit_price, currency)}
                      {c.unit_type === "hourly" ? ` / balík (${c.effective_default_hours ?? "?"}h)` : " / ks"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="mb-title" className="text-xs">Názov bonusu</Label>
            <Input
              id="mb-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. extra reels, mimoriadny newsletter…"
              onKeyDown={(e) => {
                if (e.key === "Escape") resetForm();
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="mb-qty" className="text-xs">Ks</Label>
              <Input
                id="mb-qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mb-hours" className="text-xs">Hodiny / ks</Label>
              <Input
                id="mb-hours"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.25"
                placeholder={projectHourlyRate ? `× ${projectHourlyRate}€` : "—"}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mb-price" className="text-xs">Cena / ks</Label>
              <Input
                id="mb-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="€"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Live preview hodnoty */}
          {(() => {
            const qtyN = Number(qty || "1") || 1;
            const upN = unitPrice.trim() ? Number(unitPrice) : null;
            const hN = hours.trim() ? Number(hours) : null;
            const value = bonusValue({
              qty: qtyN,
              unit_price: upN,
              hours: hN,
              hourly_rate: projectHourlyRate,
            });
            if (value <= 0) return null;
            return (
              <p className="rounded-md bg-success/10 px-2 py-1.5 text-[11px] text-success">
                Hodnota: <strong>{fmtMoney(value, currency)}</strong>
                {hN != null && upN == null && projectHourlyRate != null && (
                  <> · {hN}h × {fmtMoney(projectHourlyRate, currency)} × {qtyN}ks</>
                )}
              </p>
            );
          })()}

          <div className="space-y-1">
            <Label htmlFor="mb-note" className="text-xs">Poznámka (voliteľné)</Label>
            <Textarea
              id="mb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Detail / rozsah"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Zrušiť
            </Button>
            <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Pridávam..." : "Pridať"}
            </Button>
          </div>
        </div>
      )}

      <NewTaskDialog
        hideTrigger
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultProjectId={projectId}
        defaultTitle={taskTitle}
      />
    </div>
  );
}