// Mesačné výdaje a príjmy (vrátane vkladov konateľa).
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCw, Repeat, Search, Trash2, X } from "lucide-react";
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
  useVrFixedCosts,
  type VrFixedCost,
  type VrFinanceDirection,
  type VrRevenueKind,
} from "@/lib/vrFinanceApi";
import { useProfiles } from "@/lib/queries";
import { VrEmptyState, VrListSkeleton } from "@/components/vr/VrListStates";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";
import { VrCompanySelect } from "@/components/vr/VrCompanySelect";
import { VrFixedCostsManager } from "@/components/vr/VrFixedCostsManager";
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
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const monthKey = monthKeyOf(cursor);
  const { data: rows = [], isLoading } = useVrFinanceRecords(monthKey);
  const create = useCreateVrFinanceRecord();
  const remove = useDeleteVrFinanceRecord();
  const update = useUpdateVrFinanceRecord();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null); // spárovaná pôžička konateľa
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
  const { data: fixedTemplates = [] } = useVrFixedCosts();
  const { data: profiles = [] } = useProfiles();
  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? "Nezadaný konateľ";
  const isLoan = direction === "loan" || direction === "loan_repay";
  const scope = direction === "expense" ? "expense" : "income";
  const categories = useVrCategories(scope);

  const catValid = categories.some((c) => c.id === category);
  const activeCategory = catValid ? category : categories[0]?.id ?? "ine";

  // Rýchle filtre: obdobie v rámci mesiaca + typ záznamu.
  type PeriodFilter = "all" | "last7" | "h1" | "h2";
  type TypeFilter = "all" | "expense" | "income" | "loan";
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Vyhľadávanie podľa firmy/dodávateľa alebo názvu položky + obdobie.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from7 = new Date();
    from7.setDate(from7.getDate() - 7);
    return rows.filter((r) => {
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category).toLowerCase().includes(q)
      )
        return false;
      const d = new Date(r.occurred_on);
      if (period === "last7" && d < from7) return false;
      if (period === "h1" && d.getDate() > 15) return false;
      if (period === "h2" && d.getDate() <= 15) return false;
      return true;
    });
  }, [rows, search, period]);

  const expenses = visibleRows.filter((r) => r.direction === "expense");
  const incomes = visibleRows.filter((r) => r.direction === "income");
  const loanRows = visibleRows.filter((r) => r.direction === "loan" || r.direction === "loan_repay");
  const filtersActive = period !== "all" || typeFilter !== "all" || search.trim() !== "";

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

  // Fixné (pravidelné) náklady mesiaca + zdroj úhrady (firma vs. konateľ).
  // Výdaj považujeme za hradený konateľom, ak v tom istom mesiaci existuje pôžička
  // s názvom "<názov výdaja> — hradené konateľom" a rovnakou sumou.
  const fixedBreakdown = useMemo(() => {
    const monthLoans = rows.filter((r) => r.direction === "loan");
    return expenses
      .filter((r) => r.recurring)
      .map((r) => {
        const match = monthLoans.find(
          (l) =>
            l.title.toLowerCase().startsWith(`${r.title.trim().toLowerCase()} — hradené konateľom`) &&
            Number(l.amount) === Number(r.amount)
        );
        return { rec: r, paidBy: match?.partner_id ?? null, byDirector: !!match };
      });
  }, [rows, expenses]);

  const fixedByDirector = fixedBreakdown
    .filter((f) => f.byDirector)
    .reduce((s2, f) => s2 + Number(f.rec.amount), 0);
  const fixedByCompany = fixedCosts - fixedByDirector;


  // Dlh podľa konateľa (naprieč mesiacmi)
  const loanByPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allLoans) {
      const k = r.partner_id ?? "";
      m.set(k, (m.get(k) ?? 0) + (r.direction === "loan" ? Number(r.amount) : -Number(r.amount)));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allLoans]);

  // Transakcie tvoriace dlh konkrétneho konateľa (vklad vs. výdaj hradený konateľom).
  const loanTxByPartner = useMemo(() => {
    const m = new Map<string, typeof allLoans>();
    for (const r of allLoans) {
      const k = r.partner_id ?? "";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    for (const [k, list] of m) m.set(k, [...list].sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)));
    return m;
  }, [allLoans]);

  const [openPartner, setOpenPartner] = useState<string | null>(null);
  const [recalcAt, setRecalcAt] = useState<Date | null>(null);

  // Jedným klikom znovu načíta všetky záznamy a prepočíta dlh (po editáciách).
  async function recalcLoans() {
    await qc.invalidateQueries({ queryKey: ["vr_finance_records"] });
    await qc.invalidateQueries({ queryKey: ["vr_loans"] });
    setRecalcAt(new Date());
    toast.success("Dlh podľa konateľa prepočítaný.");
  }

  // Skok na konkrétny záznam (prepne mesiac a vyhľadá ho).
  function jumpToRecord(r: (typeof allLoans)[number]) {
    const [y, mm] = r.month_key.split("-");
    setCursor(new Date(Number(y), Number(mm) - 1, 1));
    setSearch(r.title);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  const byIncomeCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of incomes) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [incomes]);

  // Hromadné vygenerovanie aktívnych šablón fixných nákladov do aktuálneho mesiaca.
  async function generateFixedMonth() {
    const items = fixedTemplates.filter((c) => c.active);
    if (!items.length) return toast.error("Najprv si pridaj šablóny fixných nákladov.");
    const pid = partnerId || profiles[0]?.id;
    if (items.some((c) => c.from_director) && !pid) return toast.error("Najprv vyber konateľa.");

    let added = 0;
    try {
      for (const it of items) {
        const exists = rows.some(
          (r) => r.direction === "expense" && r.title.trim().toLowerCase() === it.title.trim().toLowerCase()
        );
        if (exists) continue;
        const base = {
          month_key: monthKey,
          occurred_on: `${monthKey}-${String(it.day_of_month).padStart(2, "0")}`,
          amount: Number(it.amount),
          category: it.category,
          recurring: true,
          note: null,
          revenue_kind: null,
        };
        await create.mutateAsync({ ...base, direction: "expense" as VrFinanceDirection, title: it.title, partner_id: null });
        if (it.from_director) {
          await create.mutateAsync({
            ...base,
            direction: "loan" as VrFinanceDirection,
            title: `${it.title} — hradené konateľom`,
            partner_id: pid,
          });
        }
        added++;
      }
      toast.success(added ? `Pridané fixné náklady (${added}).` : "Fixné náklady už v tomto mesiaci existujú.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Predvyplnenie formulára zo šablóny.
  function applyTemplate(c: VrFixedCost) {
    setDirection("expense");
    setFromDirector(c.from_director);
    setRecurring(true);
    setTitle(c.title);
    setAmount(String(c.amount));
    setCategory(c.category);
    setOccurredOn(`${monthKey}-${String(c.day_of_month).padStart(2, "0")}`);
    if (c.from_director && !partnerId) setPartnerId(profiles[0]?.id ?? "");
  }




  function resetForm() {
    setEditingId(null);
    setEditingLoanId(null);
    setTitle("");
    setAmount("");
    setRecurring(false);
    setFromDirector(false);
    setOccurredOn(new Date().toISOString().slice(0, 10));
  }

  // Nájde spárovanú pôžičku konateľa k výdaju (hradené z jeho peňazí).
  function findLoanFor(r: (typeof rows)[number]) {
    return rows.find(
      (l) =>
        l.direction === "loan" &&
        Number(l.amount) === Number(r.amount) &&
        l.title.toLowerCase().startsWith(`${r.title.trim().toLowerCase()} — hradené konateľom`)
    );
  }

  function startEdit(r: (typeof rows)[number]) {
    setEditingId(r.id);
    setDirection(r.direction);
    setTitle(r.title);
    setAmount(String(Number(r.amount)));
    setCategory(r.category);
    setOccurredOn(r.occurred_on);
    setRecurring(r.recurring);
    setRevenueKind((r.revenue_kind as VrRevenueKind) ?? "vr");
    const paired = r.direction === "expense" ? findLoanFor(r) : undefined;
    setEditingLoanId(paired?.id ?? null);
    setFromDirector(!!paired);
    setPartnerId(paired?.partner_id ?? r.partner_id ?? "");
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

    const loanPayload = {
      ...payload,
      direction: "loan" as VrFinanceDirection,
      title: `${title.trim()} — hradené konateľom`,
      partner_id: partnerId,
      revenue_kind: null,
      recurring: false,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, patch: payload });
        // Synchronizácia spárovanej pôžičky konateľa.
        if (direction === "expense" && fromDirector) {
          if (editingLoanId) await update.mutateAsync({ id: editingLoanId, patch: loanPayload });
          else await create.mutateAsync(loanPayload);
        } else if (editingLoanId) {
          await remove.mutateAsync(editingLoanId);
        }
        toast.success("Záznam upravený.");
      } else {
        await create.mutateAsync(payload);
        // Výdaj hradený konateľom → automaticky aj pôžička firme (dlh).
        if (fromDirector && direction === "expense") {
          await create.mutateAsync(loanPayload);
        }
        toast.success(direction === "expense" ? "Výdaj zapísaný." : "Príjem zapísaný.");
      }

      resetForm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Zdroj úhrady výdaja (firma vs. vklad konateľa) — podľa spárovanej pôžičky.
  function sourceOf(r: (typeof rows)[number]) {
    if (r.direction !== "expense") return "";
    const l = findLoanFor(r);
    return l ? `Z vkladu konateľa (${nameOf(l.partner_id)})` : "Z účtu firmy";
  }

  function exportCsv() {
    const head = "Dátum;Typ;Názov;Firma;Pravidelný;Zdroj úhrady;Suma\n";
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
          `"${sourceOf(r)}"`,
          String(Number(r.amount).toFixed(2)).replace(".", ","),
        ].join(";")
      )
      .join("\n");
    const fixedBlock =
      "\n\nFIXNÉ NÁKLADY — ZDROJ ÚHRADY\nDátum;Názov;Zdroj úhrady;Suma\n" +
      fixedBreakdown
        .map(({ rec, paidBy, byDirector }) =>
          [
            rec.occurred_on,
            `"${rec.title.replace(/"/g, '""')}"`,
            byDirector ? `"Z vkladu konateľa (${nameOf(paidBy)}) — pôžička"` : "Z účtu firmy",
            String(Number(rec.amount).toFixed(2)).replace(".", ","),
          ].join(";")
        )
        .join("\n") +
      `\nSpolu z vkladu konateľa;;;${fixedByDirector.toFixed(2).replace(".", ",")}` +
      `\nSpolu z účtu firmy;;;${fixedByCompany.toFixed(2).replace(".", ",")}`;
    const url = URL.createObjectURL(
      new Blob([head + body + fixedBlock], { type: "text/csv;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `vr-liptov-financie-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  const renderList = (list: typeof rows, kind: VrFinanceDirection) => (
    <ul className="divide-y divide-border/50">
      {isLoading && (
        <li>
          <VrListSkeleton rows={3} />
        </li>
      )}
      {!isLoading && list.length === 0 && (
        <li>
          <VrEmptyState
            icon={kind === "expense" ? ArrowDownRight : ArrowUpRight}
            title={kind === "expense" ? "Žiadne výdaje v tomto mesiaci" : "Žiadne príjmy ani vklady"}
            hint={
              kind === "expense"
                ? "Pridaj výdaj vo formulári vyššie alebo vygeneruj pravidelné (fixné) náklady."
                : "Zapíš tržby z VR herne, inú činnosť alebo vklad konateľa."
            }
          />
        </li>
      )}
      {list.map((r) => (
        <li key={r.id} className="flex items-start gap-3 py-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              kind === "expense" ? "bg-priority-high-soft text-priority-high" : "bg-priority-low-soft text-priority-low"
            )}
          >
            {kind === "expense" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium leading-snug">
                {r.title}
                {r.recurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Pravidelný" />}
              </p>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(Number(r.amount))}</span>
            </div>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {new Date(r.occurred_on).toLocaleDateString("sk-SK")} · {vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category)}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                aria-label="Upraviť položku"
                onClick={() => startEdit(r)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" /> Upraviť
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                aria-label="Zmazať položku"
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Zmazať
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );


  return (
    <div className="grid gap-4">
      {/* Hlavička mesiaca + súhrn */}
      <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="sticky top-0 z-20 -mx-3 grid gap-2 border-b border-border/50 bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Predchádzajúci mesiac"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="flex-1 text-center text-sm font-semibold tracking-tight sm:text-base lg:min-w-[150px] lg:flex-none">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </h2>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Nasledujúci mesiac"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-end">
            <div className="relative min-w-0 sm:col-span-2 lg:w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-full pl-9 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hľadať firmu alebo položku…"
                aria-label="Hľadať podľa firmy alebo názvu položky"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:col-span-2 lg:[&>*]:flex-none">
              <VrCategoryManager scope={scope} />
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={visibleRows.length === 0}>
                <Download className="mr-1 h-4 w-4" /> Export CSV
              </Button>
              <VrReportDialog />
            </div>
          </div>
        </div>


        {/* Rýchle filtre — obdobie a typ */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {([
            ["all", "Celý mesiac"],
            ["last7", "Posledných 7 dní"],
            ["h1", "1. – 15."],
            ["h2", "16. – koniec"],
          ] as [PeriodFilter, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                period === id
                  ? "border-vr/40 bg-vr-soft text-vr"
                  : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 hidden w-px shrink-0 bg-border/60 sm:block" aria-hidden />
          {([
            ["all", "Všetko"],
            ["expense", "Výdaje"],
            ["income", "Príjmy"],
            ["loan", "Pôžičky"],
          ] as [TypeFilter, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTypeFilter(id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                typeFilter === id
                  ? "border-vr/40 bg-vr-soft text-vr"
                  : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setPeriod("all");
                setTypeFilter("all");
                setSearch("");
              }}
              className="shrink-0 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 inline h-3 w-3" /> Zrušiť filtre
            </button>
          )}
        </div>
      </div>


      {/* Hlavné sumáre mesiaca */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Výdaje</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-priority-high sm:text-xl">{eur(totalExp)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Príjmy (tržby)</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-priority-low sm:text-xl">{eur(totalInc)}</p>
        </div>
        <div className="rounded-2xl border border-vr/30 bg-vr-soft/50 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Bilancia mesiaca</p>
          <p className={cn("mt-1 text-lg font-bold tabular-nums sm:text-xl", balance < 0 ? "text-priority-high" : "text-vr")}>
            {eur(balance)}
          </p>
        </div>
        <div className="rounded-2xl border border-priority-high/30 bg-priority-high-soft/40 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Dlh voči konateľovi</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-priority-high sm:text-xl">{eur(-loanTotal)}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
            Pôžička firme — konateľ si ju nárokuje späť
          </p>
        </div>
      </div>

      {/* Breakeven — koľko treba zarobiť na pokrytie fixných nákladov */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <div className="col-span-2 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4 lg:col-span-1">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Fixné náklady mesiaca</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{eur(fixedCosts)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Konateľ {eur(fixedByDirector)} · Firma {eur(fixedByCompany)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Do pokrytia chýba</p>
          <p className={cn("mt-1 text-lg font-bold tabular-nums", toBreakeven > 0 ? "text-priority-high" : "text-priority-low")}>
            {toBreakeven > 0 ? eur(toBreakeven) : "Pokryté ✓"}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Potrebné sessions (á 30 €)</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{sessionsNeeded}</p>
        </div>
      </div>

      {/* Sumár fixných nákladov so zdrojom úhrady */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-2 text-sm font-semibold">Fixné náklady — zdroj úhrady</h3>
        <ul className="divide-y divide-border/50">
          {fixedBreakdown.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">
              Žiadne pravidelné (fixné) náklady v tomto mesiaci.
            </li>
          )}
          {fixedBreakdown.map(({ rec, paidBy, byDirector }) => (
            <li key={rec.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium leading-snug">{rec.title}</p>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(Number(rec.amount))}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(rec.occurred_on).toLocaleDateString("sk-SK")} · {vrCatLabel("expense", rec.category)}
              </p>
              <span
                className={cn(
                  "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                  byDirector ? "bg-priority-high-soft text-priority-high" : "bg-muted text-muted-foreground"
                )}
              >
                {byDirector ? `Z vkladu konateľa${paidBy ? ` · ${nameOf(paidBy)}` : ""}` : "Z účtu firmy"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex flex-wrap justify-end gap-4 border-t border-border/50 pt-2 text-xs">
          <span className="text-muted-foreground">
            Z vkladu konateľa: <strong className="tabular-nums text-priority-high">{eur(fixedByDirector)}</strong>
          </span>
          <span className="text-muted-foreground">
            Z účtu firmy: <strong className="tabular-nums text-foreground">{eur(fixedByCompany)}</strong>
          </span>
          <span className="text-muted-foreground">
            Spolu: <strong className="tabular-nums text-foreground">{eur(fixedCosts)}</strong>
          </span>
        </div>
      </section>


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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
            {fixedTemplates.filter((c) => c.active).map((c) => (
              <Button key={c.id} type="button" variant="outline" size="sm" onClick={() => applyTemplate(c)}>
                {c.title} {eur(Number(c.amount))}
              </Button>
            ))}
            {fixedTemplates.some((c) => c.active) && (
              <Button type="button" variant="outline" size="sm" onClick={generateFixedMonth} disabled={create.isPending}>
                Vygenerovať fixné náklady mesiaca (
                {eur(fixedTemplates.filter((c) => c.active).reduce((s2, c) => s2 + Number(c.amount), 0))})
              </Button>
            )}
            <VrFixedCostsManager />
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

      {/* Prázdny stav mesiaca */}
      {rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-center sm:p-8">
          <p className="text-sm font-semibold">Za {MONTHS[cursor.getMonth()].toLowerCase()} zatiaľ nič nie je zapísané</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Zapíš prvý výdaj alebo tržbu vo formulári vyššie. Výdaj hradený z peňazí konateľa sa automaticky
            zaznamená aj ako pôžička firme.
          </p>
        </section>
      ) : visibleRows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-center sm:p-8">
          <p className="text-sm font-semibold">Filtrom nič nezodpovedá</p>
          <p className="mt-1 text-xs text-muted-foreground">Skús zmeniť obdobie, typ alebo vyhľadávanie.</p>
        </section>
      ) : (
        <div className={cn("grid gap-4", typeFilter === "all" && "lg:grid-cols-2")}>
          {(typeFilter === "all" || typeFilter === "expense") && (
            <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
              <h3 className="mb-1 text-sm font-semibold">Výdaje mesiaca</h3>
              {renderList(expenses, "expense")}
            </section>
          )}
          {(typeFilter === "all" || typeFilter === "income") && (
            <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
              <h3 className="mb-1 text-sm font-semibold">Príjmy (tržby)</h3>
              {renderList(incomes, "income")}
            </section>
          )}
        </div>
      )}


      {/* Pôžičky konateľa */}
      <section className="rounded-2xl border border-priority-high/25 bg-card/60 p-3 sm:p-4">
        <h3 className="mb-1 text-sm font-semibold">Pôžičky konateľa v mesiaci</h3>
        <ul className="divide-y divide-border/50">
          {loanRows.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">Žiadne pôžičky ani splátky v tomto mesiaci.</li>
          )}
          {loanRows.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium leading-snug">{r.title}</p>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    r.direction === "loan" ? "text-priority-high" : "text-priority-low"
                  )}
                >
                  {r.direction === "loan" ? "−" : "+"}
                  {eur(Number(r.amount))}
                </span>
              </div>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {new Date(r.occurred_on).toLocaleDateString("sk-SK")} ·{" "}
                {r.direction === "loan" ? "pôžička firme" : "splátka konateľovi"} · {nameOf(r.partner_id)}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
                  aria-label="Upraviť pôžičku" onClick={() => startEdit(r)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Upraviť
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                  aria-label="Zmazať pôžičku" onClick={() => remove.mutate(r.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Zmazať
                </Button>
              </div>
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dlh podľa konateľa</h3>
          <div className="flex items-center gap-2">
            {recalcAt && (
              <span className="text-[11px] text-muted-foreground">
                Prepočítané {recalcAt.toLocaleTimeString("sk-SK")}
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={recalcLoans}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Prepočítať dlh
            </Button>
          </div>
        </div>
        <ul className="grid gap-1.5 text-sm">
          {loanByPartner.length === 0 && <li className="text-muted-foreground">—</li>}
          {loanByPartner.map(([pid, v]) => (
            <li key={pid || "none"} className="rounded-xl bg-surface-muted/50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => setOpenPartner(openPartner === (pid || "none") ? null : pid || "none")}
                  aria-expanded={openPartner === (pid || "none")}
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform", openPartner === (pid || "none") && "rotate-90")}
                  />
                  <span className="truncate">{nameOf(pid || null)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({(loanTxByPartner.get(pid) ?? []).length})
                  </span>
                </button>
                <span className={cn("shrink-0 font-semibold tabular-nums", v > 0.005 ? "text-priority-high" : "text-priority-low")}>
                  {v > 0.005 ? eur(-v) : "Vyrovnané ✓"}
                </span>
                <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">
                  <VrLoanSettleDialog
                    partnerId={pid || null}
                    partnerName={nameOf(pid || null)}
                    outstanding={Math.max(0, v)}
                  />
                </div>
              </div>

              {openPartner === (pid || "none") && (
                <ul className="mt-1.5 divide-y divide-border/50 border-t border-border/50 pt-1">
                  {(loanTxByPartner.get(pid) ?? []).map((t) => {
                    const fromExpense = t.title.toLowerCase().includes("— hradené konateľom");
                    return (
                      <li key={t.id} className="py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 break-words text-left underline-offset-2 hover:underline"
                            onClick={() => jumpToRecord(t)}
                            title="Zobraziť záznam"
                          >
                            {t.title}
                          </button>
                          <span
                            className={cn(
                              "shrink-0 font-semibold tabular-nums",
                              t.direction === "loan" ? "text-priority-high" : "text-priority-low"
                            )}
                          >
                            {t.direction === "loan" ? "−" : "+"}
                            {eur(Number(t.amount))}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              t.direction === "loan_repay"
                                ? "bg-priority-low-soft text-priority-low"
                                : fromExpense
                                ? "bg-priority-high-soft text-priority-high"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {t.direction === "loan_repay" ? "Splátka" : fromExpense ? "Výdaj" : "Vklad"}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(t.occurred_on).toLocaleDateString("sk-SK")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

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
