// Mesačné výdaje a príjmy (vrátane vkladov konateľa).
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, Pencil, Plus, Repeat, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  eur,
  useCreateVrFinanceRecord,
  useDeleteVrFinanceRecord,
  useUpdateVrFinanceRecord,
  useVrFinanceRecords,
  type VrFinanceDirection,
} from "@/lib/vrFinanceApi";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";
import { VrCompanySelect } from "@/components/vr/VrCompanySelect";


const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];

function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function VrFinanceTab() {
  const [cursor, setCursor] = useState(() => new Date());
  const monthKey = monthKeyOf(cursor);
  const { data: rows = [] } = useVrFinanceRecords(monthKey);
  const create = useCreateVrFinanceRecord();
  const remove = useDeleteVrFinanceRecord();
  const update = useUpdateVrFinanceRecord();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");


  const [direction, setDirection] = useState<VrFinanceDirection>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("prevadzka");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState(false);
  const scope = direction === "expense" ? "expense" : "income";
  const categories = useVrCategories(scope);

  const catValid = categories.some((c) => c.id === category);
  const activeCategory = catValid ? category : categories[0]?.id ?? "ine";

  // Vyhľadávanie podľa firmy/dodávateľa alebo názvu položky.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category).toLowerCase().includes(q)
    );
  }, [rows, search]);

  const expenses = visibleRows.filter((r) => r.direction === "expense");
  const incomes = visibleRows.filter((r) => r.direction === "income");
  const sum = (arr: typeof rows) => arr.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = sum(expenses);
  const totalInc = sum(incomes);
  const balance = totalInc - totalExp;


  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of expenses) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const byIncomeCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of incomes) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [incomes]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setRecurring(false);
    setOccurredOn(new Date().toISOString().slice(0, 10));
  }

  function startEdit(r: (typeof rows)[number]) {
    setEditingId(r.id);
    setDirection(r.direction);
    setTitle(r.title);
    setAmount(String(Number(r.amount)));
    setCategory(r.category);
    setOccurredOn(r.occurred_on);
    setRecurring(r.recurring);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const raw = String(amount).trim().replace(",", ".");
    const value = Number(raw);

    // Validácie
    if (!title.trim()) return toast.error("Doplň názov položky.");
    if (title.trim().length < 2) return toast.error("Názov je príliš krátky.");
    if (!raw || Number.isNaN(value)) return toast.error("Suma musí byť číslo.");
    if (value <= 0) return toast.error("Zadaj sumu väčšiu ako 0.");
    if (value > 1_000_000) return toast.error("Suma je nereálne vysoká.");
    if (!occurredOn) return toast.error("Vyber dátum.");
    if (!categories.length) return toast.error("Najprv pridaj aspoň jednu firmu / dodávateľa.");

    // Duplicita v rámci mesiaca
    const dup = rows.some(
      (r) =>
        r.id !== editingId &&
        r.direction === direction &&
        r.occurred_on === occurredOn &&
        Number(r.amount) === value &&
        r.title.trim().toLowerCase() === title.trim().toLowerCase()
    );
    if (dup) return toast.error("Taký záznam už v tomto mesiaci existuje.");

    const payload = {
      month_key: monthKeyOf(new Date(occurredOn)),
      occurred_on: occurredOn,
      direction,
      amount: value,
      title: title.trim(),
      category: activeCategory,
      recurring,
      note: null,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, patch: payload });
        toast.success("Záznam upravený.");
      } else {
        await create.mutateAsync(payload);
        toast.success(direction === "expense" ? "Výdaj zapísaný." : "Príjem zapísaný.");
      }
      resetForm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const head = "Dátum;Typ;Názov;Firma;Pravidelný;Suma\n";
    const body = rows
      .map((r) =>
        [
          r.occurred_on,
          r.direction === "expense" ? "Výdaj" : "Príjem",
          `"${r.title.replace(/"/g, '""')}"`,
          vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category),
          r.recurring ? "áno" : "nie",
          String(Number(r.amount).toFixed(2)).replace(".", ","),
        ].join(";")
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vr-liptov-financie-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const renderList = (list: typeof rows, kind: VrFinanceDirection) => (
    <ul className="divide-y divide-border/50">
      {list.length === 0 && (
        <li className="py-6 text-center text-sm text-muted-foreground">
          {kind === "expense" ? "Žiadne výdaje v tomto mesiaci." : "Žiadne príjmy ani vklady."}
        </li>
      )}
      {list.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              kind === "expense" ? "bg-priority-high-soft text-priority-high" : "bg-priority-low-soft text-priority-low"
            )}
          >
            {kind === "expense" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {r.title}
              {r.recurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Pravidelný" />}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {new Date(r.occurred_on).toLocaleDateString("sk-SK")} · {vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(Number(r.amount))}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            aria-label="Upraviť položku"
            onClick={() => startEdit(r)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Zmazať položku"
            onClick={() => remove.mutate(r.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-4">
      {/* Hlavička mesiaca + súhrn */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Predchádzajúci mesiac"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[150px] text-center text-sm font-semibold sm:text-base">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Nasledujúci mesiac"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
        <VrCategoryManager scope={scope} />
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Výdaje</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-priority-high">{eur(totalExp)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Príjmy a vklady</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-priority-low">{eur(totalInc)}</p>
        </div>
        <div className="rounded-2xl border border-vr/30 bg-vr-soft/50 p-4">
          <p className="text-xs text-muted-foreground">Bilancia mesiaca</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", balance < 0 ? "text-priority-high" : "text-vr")}>
            {eur(balance)}
          </p>
        </div>
      </div>

      {/* Formulár */}
      <div className="grid gap-2 rounded-2xl border border-border/60 bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
        {editingId && (
          <p className="flex items-center justify-between gap-2 rounded-md bg-vr-soft/60 px-3 py-1.5 text-xs sm:col-span-2 lg:col-span-5">
            Upravuješ existujúci záznam.
            <Button variant="ghost" size="sm" className="h-7" onClick={resetForm}>
              <X className="mr-1 h-3.5 w-3.5" /> Zrušiť úpravu
            </Button>
          </p>
        )}
        <Select value={direction} onValueChange={(v) => setDirection(v as VrFinanceDirection)}>
          <SelectTrigger aria-label="Typ položky"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Výdaj / náklad</SelectItem>
            <SelectItem value="income">Príjem / vklad konateľa</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} aria-label="Dátum" />
        <Input inputMode="decimal" placeholder="Suma v €" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Suma" />
        <VrCompanySelect
          scope={scope}
          value={activeCategory}
          onChange={setCategory}
          label={direction === "expense" ? "Dodávateľ / firma" : "Od koho / firma"}
        />

        <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 text-sm">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Pravidelný mesačne
        </label>
        <Input
          className="sm:col-span-2 lg:col-span-4"
          placeholder="Názov položky (napr. nájom priestorov, internet, poistenie…)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Názov položky"
        />
        <Button onClick={submit} disabled={create.isPending || update.isPending} className="bg-vr text-vr-foreground hover:bg-vr/90">
          <Plus className="mr-1 h-4 w-4" /> {editingId ? "Uložiť zmeny" : "Zapísať"}
        </Button>
      </div>

      {/* Zoznamy */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <h3 className="mb-1 text-sm font-semibold">Výdaje mesiaca</h3>
          {renderList(expenses, "expense")}
        </section>
        <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <h3 className="mb-1 text-sm font-semibold">Príjmy a vklady konateľa</h3>
          {renderList(incomes, "income")}
        </section>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Výdaje podľa firmy / dodávateľa</h3>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {byCategory.length === 0 && <li className="text-muted-foreground">—</li>}
          {byCategory.map(([c, v]) => (
            <li key={c} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-3 py-1.5">
              <span className="truncate">{vrCatLabel("expense", c)}</span>
              <span className="shrink-0 font-medium tabular-nums">{eur(v)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Príjmy podľa firmy / zdroja</h3>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {byIncomeCategory.length === 0 && <li className="text-muted-foreground">—</li>}
          {byIncomeCategory.map(([c, v]) => (
            <li key={c} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-3 py-1.5">
              <span className="truncate">{vrCatLabel("income", c)}</span>
              <span className="shrink-0 font-medium tabular-nums">{eur(v)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
