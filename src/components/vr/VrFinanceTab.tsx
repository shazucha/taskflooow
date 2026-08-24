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
  useVrLoans,
  type VrFinanceDirection,
  type VrRevenueKind,
} from "@/lib/vrFinanceApi";
import { useProfiles } from "@/lib/queries";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";
import { VrCompanySelect } from "@/components/vr/VrCompanySelect";
import { VrReportDialog } from "@/components/vr/VrReportDialog";
import { VrLoanSettleDialog } from "@/components/vr/VrLoanSettleDialog";


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
  const [partnerId, setPartnerId] = useState<string>("");        // konateľ pri pôžičke
  const [revenueKind, setRevenueKind] = useState<VrRevenueKind>("vr");
  const [fromDirector, setFromDirector] = useState(false);       // výdaj hradený z peňazí konateľa
  const { data: profiles = [] } = useProfiles();
  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? "Nezadaný konateľ";
  const isLoan = direction === "loan" || direction === "loan_repay";
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
  const loanRows = visibleRows.filter((r) => r.direction === "loan" || r.direction === "loan_repay");
  const sum = (arr: typeof rows) => arr.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = sum(expenses);
  const totalInc = sum(incomes);
  const balance = totalInc - totalExp;

  // Breakeven: fixné (pravidelné) náklady vs. tržby mesiaca.
  const fixedCosts = expenses.filter((r) => r.recurring).reduce((s2, r) => s2 + Number(r.amount), 0);
  const toBreakeven = Math.max(0, fixedCosts - totalInc);
  const SESSION_PRICE = 30;
  const sessionsNeeded = Math.ceil(toBreakeven / SESSION_PRICE);

  // Pôžičky konateľa naprieč mesiacmi (záväzok firmy = mínus).
  const { data: allLoans = [] } = useVrLoans();
  const loanTotal = allLoans.reduce(
    (s, r) => s + (r.direction === "loan" ? Number(r.amount) : -Number(r.amount)),
    0
  );
  const loanByMonth = useMemo(() => {
    const m = new Map<string, { lent: number; repaid: number }>();
    for (const r of allLoans) {
      const k = r.month_key;
      const e = m.get(k) ?? { lent: 0, repaid: 0 };
      if (r.direction === "loan") e.lent += Number(r.amount);
      else e.repaid += Number(r.amount);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [allLoans]);
  const monthLabel = (k: string) => {
    const [y, mm] = k.split("-");
    return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
  };



  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of expenses) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  // Tržby podľa druhu činnosti
  const revVr = incomes.filter((r) => (r.revenue_kind ?? "vr") === "vr").reduce((s2, r) => s2 + Number(r.amount), 0);
  const revOther = incomes.filter((r) => r.revenue_kind === "other").reduce((s2, r) => s2 + Number(r.amount), 0);

  // Dlh podľa konateľa (naprieč mesiacmi)
  const loanByPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allLoans) {
      const k = r.partner_id ?? "";
      m.set(k, (m.get(k) ?? 0) + (r.direction === "loan" ? Number(r.amount) : -Number(r.amount)));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allLoans]);

  const byIncomeCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of incomes) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [incomes]);

  // Hromadné vygenerovanie pravidelných mesačných nákladov (nájom + kredity), hradené konateľom.
  async function generateFixedMonth() {
    const pid = partnerId || profiles[0]?.id;
    if (!pid) return toast.error("Najprv vyber konateľa.");
    const day = `${monthKey}-05`;
    const items = [
      { title: "Nájom priestorov", amount: 350, category: "najom" },
      { title: "Kredity HeroZoneVR a iní poskytovatelia", amount: 250, category: "software" },
    ];
    let added = 0;
    try {
      for (const it of items) {
        const exists = rows.some(
          (r) => r.direction === "expense" && r.title.trim().toLowerCase() === it.title.toLowerCase()
        );
        if (exists) continue;
        const base = {
          month_key: monthKey,
          occurred_on: day,
          amount: it.amount,
          category: it.category,
          recurring: true,
          note: null,
          revenue_kind: null,
        };
        await create.mutateAsync({ ...base, direction: "expense" as VrFinanceDirection, title: it.title, partner_id: null });
        await create.mutateAsync({
          ...base,
          direction: "loan" as VrFinanceDirection,
          title: `${it.title} — hradené konateľom`,
          partner_id: pid,
        });
        added++;
      }
      toast.success(added ? `Pridané fixné náklady (${added}).` : "Fixné náklady už v tomto mesiaci existujú.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Rýchle šablóny pre fixné mesačné náklady hradené konateľom.
  function applyTemplate(kind: "najom" | "kredity") {
    setDirection("expense");
    setFromDirector(true);
    setRecurring(true);
    if (kind === "najom") {
      setTitle("Nájom priestorov");
      setAmount("350");
      setCategory("najom");
    } else {
      setTitle("Kredity HeroZoneVR a iní poskytovatelia");
      setAmount("250");
      setCategory("software");
    }
    if (!partnerId) setPartnerId(profiles[0]?.id ?? "");
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setRecurring(false);
    setFromDirector(false);
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
    setPartnerId(r.partner_id ?? "");
    setRevenueKind((r.revenue_kind as VrRevenueKind) ?? "vr");
    setFromDirector(false);
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
    if (isLoan && !partnerId) return toast.error("Vyber konateľa.");
    if (fromDirector && direction === "expense" && !partnerId)
      return toast.error("Vyber konateľa, z ktorého peňazí bol výdaj hradený.");

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
      partner_id: isLoan ? partnerId || null : null,
      revenue_kind: direction === "income" ? revenueKind : null,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, patch: payload });
        toast.success("Záznam upravený.");
      } else {
        await create.mutateAsync(payload);
        // Výdaj hradený konateľom → automaticky aj pôžička firme (dlh).
        if (fromDirector && direction === "expense") {
          await create.mutateAsync({
            ...payload,
            direction: "loan" as VrFinanceDirection,
            title: `${title.trim()} — hradené konateľom`,
            partner_id: partnerId,
            revenue_kind: null,
          });
        }
        toast.success(direction === "expense" ? "Výdaj zapísaný." : "Príjem zapísaný.");
      }
      resetForm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const head = "Dátum;Typ;Názov;Firma;Pravidelný;Suma\n";
    const body = visibleRows
      .map((r) =>
        [
          r.occurred_on,
          r.direction === "expense"
            ? "Výdaj"
            : r.direction === "income"
            ? "Príjem"
            : r.direction === "loan"
            ? "Pôžička konateľa"
            : "Splátka konateľovi",
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-[220px] pl-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hľadať firmu alebo položku…"
              aria-label="Hľadať podľa firmy alebo názvu položky"
            />
          </div>
          <VrCategoryManager scope={scope} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={visibleRows.length === 0}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
          <VrReportDialog />
        </div>

      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Výdaje</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-priority-high">{eur(totalExp)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Príjmy (tržby)</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-priority-low">{eur(totalInc)}</p>
        </div>
        <div className="rounded-2xl border border-vr/30 bg-vr-soft/50 p-4">
          <p className="text-xs text-muted-foreground">Bilancia mesiaca</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", balance < 0 ? "text-priority-high" : "text-vr")}>
            {eur(balance)}
          </p>
      </div>

      {/* Breakeven — koľko treba zarobiť na pokrytie fixných nákladov */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Fixné náklady mesiaca</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{eur(fixedCosts)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Do pokrytia nákladov chýba</p>
          <p className={cn("mt-1 text-lg font-bold tabular-nums", toBreakeven > 0 ? "text-priority-high" : "text-priority-low")}>
            {toBreakeven > 0 ? eur(toBreakeven) : "Pokryté ✓"}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Potrebné sessions (á 30 €)</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{sessionsNeeded}</p>
        </div>
      </div>
        <div className="rounded-2xl border border-priority-high/30 bg-priority-high-soft/40 p-4">
          <p className="text-xs text-muted-foreground">Dlh voči konateľovi (nesplatené)</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-priority-high">{eur(-loanTotal)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Pôžička firme — konateľ si ju nárokuje späť</p>
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
            <SelectItem value="income">Príjem / tržba</SelectItem>
            <SelectItem value="loan">Pôžička konateľa firme (dlh −)</SelectItem>
            <SelectItem value="loan_repay">Splátka konateľovi (zníženie dlhu)</SelectItem>
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
        {isLoan && (
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger aria-label="Konateľ">
              <SelectValue placeholder="Konateľ (kto požičal)" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {direction === "income" && (
          <Select value={revenueKind} onValueChange={(v) => setRevenueKind(v as VrRevenueKind)}>
            <SelectTrigger aria-label="Druh tržby"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vr">Tržba — VR herňa (sessions)</SelectItem>
              <SelectItem value="other">Tržba — iná činnosť</SelectItem>
            </SelectContent>
          </Select>
        )}
        {direction === "expense" && (
          <div className="grid gap-2 sm:col-span-2 lg:col-span-5 lg:grid-cols-[auto_1fr]">
            <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={fromDirector}
                onChange={(e) => setFromDirector(e.target.checked)}
                className="h-4 w-4 accent-current"
              />
              Hradené z peňazí konateľa (pridá aj pôžičku)
            </label>
            {fromDirector && (
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger aria-label="Konateľ, ktorý platil">
                  <SelectValue placeholder="Ktorý konateľ platil?" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        {direction === "expense" && !editingId && (
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("najom")}>
              Nájom 350 € / mesiac
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("kredity")}>
              Kredity (HeroZoneVR a i.) 250 €
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={generateFixedMonth} disabled={create.isPending}>
              Vygenerovať fixné náklady mesiaca (600 €)
            </Button>
          </div>
        )}
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
          <h3 className="mb-1 text-sm font-semibold">Príjmy (tržby)</h3>
          {renderList(incomes, "income")}
        </section>
      </div>

      {/* Pôžičky konateľa */}
      <section className="rounded-2xl border border-priority-high/25 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-1 text-sm font-semibold">Pôžičky konateľa v mesiaci</h3>
        <ul className="divide-y divide-border/50">
          {loanRows.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">Žiadne pôžičky ani splátky v tomto mesiaci.</li>
          )}
          {loanRows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(r.occurred_on).toLocaleDateString("sk-SK")} ·{" "}
                  {r.direction === "loan" ? "pôžička firme" : "splátka konateľovi"} · {nameOf(r.partner_id)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  r.direction === "loan" ? "text-priority-high" : "text-priority-low"
                )}
              >
                {r.direction === "loan" ? "−" : "+"}
                {eur(Number(r.amount))}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"
                aria-label="Upraviť pôžičku" onClick={() => startEdit(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Zmazať pôžičku" onClick={() => remove.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prehľad dlhu po mesiacoch
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Mesiac</th>
                <th className="py-1.5 text-right font-medium">Požičané</th>
                <th className="py-1.5 text-right font-medium">Splatené</th>
                <th className="py-1.5 text-right font-medium">Zostatok mesiaca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loanByMonth.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Zatiaľ žiadne pôžičky.</td></tr>
              )}
              {loanByMonth.map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5">{monthLabel(k)}</td>
                  <td className="py-1.5 text-right tabular-nums text-priority-high">{eur(v.lent)}</td>
                  <td className="py-1.5 text-right tabular-nums text-priority-low">{eur(v.repaid)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{eur(-(v.lent - v.repaid))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="py-2 text-xs font-semibold uppercase text-muted-foreground">Celkový dlh</td>
                <td colSpan={3} className="py-2 text-right text-base font-bold tabular-nums text-priority-high">
                  {eur(-loanTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>


      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Tržby — VR herňa</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-vr">{eur(revVr)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">Tržby — iná činnosť</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-priority-low">{eur(revOther)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dlh podľa konateľa</h3>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {loanByPartner.length === 0 && <li className="text-muted-foreground">—</li>}
          {loanByPartner.map(([pid, v]) => (
            <li key={pid || "none"} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-3 py-1.5">
              <span className="truncate">{nameOf(pid || null)}</span>
              <span className={cn("shrink-0 font-medium tabular-nums", v > 0.005 ? "text-priority-high" : "text-priority-low")}>
                {v > 0.005 ? eur(-v) : "Vyrovnané ✓"}
              </span>
              <VrLoanSettleDialog
                partnerId={pid || null}
                partnerName={nameOf(pid || null)}
                outstanding={Math.max(0, v)}
              />
            </li>
          ))}
        </ul>
      </section>

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
