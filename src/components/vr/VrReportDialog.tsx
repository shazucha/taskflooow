// PDF report + CSV export so súhrnmi transakcií za zvolený časový interval (tlač → Uložiť ako PDF).
import { useMemo, useState } from "react";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useProfiles } from "@/lib/queries";
import { eur, useVrContributionsRange, useVrFinanceRange } from "@/lib/vrFinanceApi";
import { vrCatLabel } from "@/lib/vrCategories";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type VrReportScope = "finance" | "partners";
type ReportMode = "finance" | "partners" | "both";

// scope: predvolený režim reportu podľa záložky, používateľ ho vie prepnúť
export function VrReportDialog({ scope = "finance" }: { scope?: VrReportScope }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReportMode>(scope);
  const showFinance = mode === "finance" || mode === "both";
  const showPartners = mode === "partners" || mode === "both";

  const now = new Date();
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const valid = !!from && !!to && from <= to;
  const { data: finance = [], isLoading: l1 } = useVrFinanceRange(from, to, open && valid && showFinance);
  const { data: contributions = [], isLoading: l2 } = useVrContributionsRange(from, to, open && valid && showPartners);
  const { data: profiles = [] } = useProfiles();

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  const stats = useMemo(() => {
    const expenses = finance.filter((r) => r.direction === "expense");
    const incomes = finance.filter((r) => r.direction === "income");
    const sum = (a: { amount: number }[]) => a.reduce((s, r) => s + Number(r.amount), 0);
    const byCat = (a: typeof finance, kind: "expense" | "income") => {
      const m = new Map<string, number>();
      for (const r of a) {
        const k = vrCatLabel(kind, r.category);
        m.set(k, (m.get(k) ?? 0) + Number(r.amount));
      }
      return [...m.entries()].sort((x, y) => y[1] - x[1]);
    };
    const byPartner = new Map<string, number>();
    for (const c of contributions) {
      byPartner.set(c.partner_id, (byPartner.get(c.partner_id) ?? 0) + Number(c.amount));
    }
    // Fixné náklady + zdroj úhrady (pôžička konateľa vs. účet firmy).
    const loans = finance.filter((r) => r.direction === "loan");
    const fixed = expenses
      .filter((r) => r.recurring)
      .map((r) => {
        const match = loans.find(
          (l) =>
            l.title.toLowerCase().startsWith(`${r.title.trim().toLowerCase()} — hradené konateľom`) &&
            Number(l.amount) === Number(r.amount)
        );
        return { rec: r, paidBy: match?.partner_id ?? null, byDirector: !!match };
      });
    const fixedByDirector = fixed.filter((f) => f.byDirector).reduce((s, f) => s + Number(f.rec.amount), 0);
    const fixedTotal = fixed.reduce((s, f) => s + Number(f.rec.amount), 0);
    return {
      expenses,
      incomes,
      totalExp: sum(expenses),
      totalInc: sum(incomes),
      totalContrib: sum(contributions),
      expByCat: byCat(expenses, "expense"),
      incByCat: byCat(incomes, "income"),
      partnerRows: [...byPartner.entries()].sort((a, b) => b[1] - a[1]),
      fixed,
      fixedByDirector,
      fixedByCompany: fixedTotal - fixedByDirector,
      fixedTotal,
    };
  }, [finance, contributions]);

  const dirLabel = (d: string) =>
    d === "expense" ? "Výdaj" : d === "income" ? "Príjem" : d === "loan" ? "Pôžička konateľa" : "Splátka konateľovi";

  const srcOf = (id: string, direction: string) =>
    direction === "expense"
      ? stats.fixed.find((f) => f.rec.id === id)?.byDirector
        ? "Z vkladu konateľa"
        : "Z účtu firmy"
      : "—";

  const hasData = (showFinance && finance.length > 0) || (showPartners && contributions.length > 0);

  function generate() {
    if (!valid) return toast.error("Zadaj platný časový interval.");
    if (!hasData) return toast.error("V zvolenom období nie sú žiadne záznamy.");

    const rowsTable = (title: string, head: string[], body: string[][], total?: number) => `
      <h3>${esc(title)}</h3>
      <table>
        <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${body
            .map((r) => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 ? "num" : ""}">${c}</td>`).join("")}</tr>`)
            .join("")}
          ${
            total !== undefined
              ? `<tr class="total"><td colspan="${head.length - 1}">Spolu</td><td class="num">${esc(eur(total))}</td></tr>`
              : ""
          }
        </tbody>
      </table>`;

    const financeSection = !showFinance
      ? ""
      : `
  <section class="sec sec-finance">
    <h2><span class="dot"></span>Výdaje a príjmy</h2>
    <div class="cards">
      <div class="card"><span>Výdaje</span><strong>${esc(eur(stats.totalExp))}</strong></div>
      <div class="card"><span>Príjmy a vklady</span><strong>${esc(eur(stats.totalInc))}</strong></div>
      <div class="card"><span>Bilancia</span><strong>${esc(eur(stats.totalInc - stats.totalExp))}</strong></div>
    </div>
    ${
      stats.expByCat.length
        ? rowsTable("Výdaje podľa firmy / dodávateľa", ["Firma", "Suma"], stats.expByCat.map(([k, v]) => [esc(k), esc(eur(v))]), stats.totalExp)
        : ""
    }
    ${
      stats.incByCat.length
        ? rowsTable("Príjmy podľa zdroja", ["Zdroj", "Suma"], stats.incByCat.map(([k, v]) => [esc(k), esc(eur(v))]), stats.totalInc)
        : ""
    }
    ${
      stats.fixed.length
        ? rowsTable(
            "Fixné náklady — zdroj úhrady",
            ["Dátum", "Názov", "Zdroj úhrady", "Suma"],
            stats.fixed.map(({ rec, paidBy, byDirector }) => [
              esc(rec.occurred_on),
              esc(rec.title),
              byDirector
                ? esc(`Z vkladu konateľa (${paidBy ? nameOf(paidBy) : "nezadaný"}) — pôžička firme`)
                : "Z účtu firmy",
              esc(eur(Number(rec.amount))),
            ]),
            stats.fixedTotal
          ) +
          `<p class="sub">Z vkladu konateľa: <strong>${esc(eur(stats.fixedByDirector))}</strong> · Z účtu firmy: <strong>${esc(eur(stats.fixedByCompany))}</strong></p>`
        : ""
    }
    ${
      finance.length
        ? rowsTable(
            "Zoznam transakcií",
            ["Dátum", "Typ", "Názov", "Firma", "Zdroj úhrady", "Suma"],
            finance.map((r) => [
              esc(r.occurred_on),
              dirLabel(r.direction),
              esc(r.title),
              esc(vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category)),
              esc(srcOf(r.id, r.direction)),
              esc(eur(Number(r.amount))),
            ])
          )
        : `<p class="sub">Žiadne transakcie v zvolenom období.</p>`
    }
  </section>`;

    const partnersSection = !showPartners
      ? ""
      : `
  <section class="sec sec-partners ${showFinance ? "pagebreak" : ""}">
    <h2><span class="dot"></span>Úhrady spoločníkov</h2>
    <div class="cards">
      <div class="card"><span>Úhrady spoločníkov</span><strong>${esc(eur(stats.totalContrib))}</strong></div>
      <div class="card"><span>Počet záznamov</span><strong>${contributions.length}</strong></div>
    </div>
    ${
      stats.partnerRows.length
        ? rowsTable(
            "Súhrn podľa spoločníka",
            ["Spoločník", "Suma"],
            stats.partnerRows.map(([id, v]) => [esc(nameOf(id)), esc(eur(v))]),
            stats.totalContrib
          )
        : ""
    }
    ${
      contributions.length
        ? rowsTable(
            "Detail úhrad",
            ["Dátum", "Spoločník", "Účel", "Firma", "Suma"],
            contributions.map((c) => [
              esc(c.paid_on),
              esc(nameOf(c.partner_id)),
              esc(c.purpose),
              esc(vrCatLabel("contribution", c.category)),
              esc(eur(Number(c.amount))),
            ])
          )
        : `<p class="sub">Žiadne úhrady spoločníkov v zvolenom období.</p>`
    }
  </section>`;

    const headline =
      mode === "both" ? "finančný report" : mode === "partners" ? "úhrady spoločníkov" : "výdaje a príjmy";

    const html = `<!doctype html>
<html lang="sk"><head><meta charset="utf-8">
<title>VR Liptov — ${esc(headline)} ${esc(from)} – ${esc(to)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; margin: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
  h3 { font-size: 12px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .sub { color: #666; font-size: 11px; margin: 8px 0 0; }
  .sec { border: 1px solid #e5e5e5; border-radius: 12px; padding: 14px 16px; margin-top: 18px; break-inside: auto; }
  .sec h2 .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .sec-finance { border-left: 4px solid #0369a1; background: #f6fbfe; }
  .sec-finance h2 { color: #0369a1; }
  .sec-finance .dot { background: #0369a1; }
  .sec-partners { border-left: 4px solid #7c3aed; background: #faf7ff; }
  .sec-partners h2 { color: #7c3aed; }
  .sec-partners .dot { background: #7c3aed; }
  .pagebreak { break-before: page; page-break-before: always; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; }
  .card { flex: 1 1 150px; border: 1px solid #e5e5e5; background: #fff; border-radius: 10px; padding: 10px 12px; }
  .card span { display: block; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .card strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; background: #fff; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border-bottom: 1px solid #eee; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td.num, th:last-child { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: 700; border-top: 2px solid #ccc; }
  footer { margin-top: 24px; font-size: 10px; color: #888; }
  @page { margin: 14mm; }
</style></head>
<body>
  <h1>VR Liptov — ${esc(headline)}</h1>
  <div class="sub">Obdobie: ${esc(from)} – ${esc(to)} · vygenerované ${esc(new Date().toLocaleString("sk-SK"))}</div>
  ${financeSection}
  ${partnersSection}
  <footer>VR Liptov · TaskFlow — automaticky generovaný report</footer>
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return toast.error("Prehliadač zablokoval nové okno. Povoľ vyskakovacie okná.");
    w.document.write(html);
    w.document.close();
  }

  // CSV s rovnakou štruktúrou ako PDF (sekcie oddelené, bez miešania dát)
  function exportCsv() {
    if (!valid) return toast.error("Zadaj platný časový interval.");
    if (!hasData) return toast.error("V zvolenom období nie sú žiadne záznamy.");

    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: string[] = [];
    const push = (arr: (string | number)[]) => lines.push(arr.map(q).join(";"));

    push([`VR Liptov — report ${from} – ${to}`]);
    lines.push("");

    if (showFinance) {
      push(["SEKCIA: VÝDAJE A PRÍJMY"]);
      push(["Výdaje spolu", stats.totalExp.toFixed(2)]);
      push(["Príjmy a vklady spolu", stats.totalInc.toFixed(2)]);
      push(["Bilancia", (stats.totalInc - stats.totalExp).toFixed(2)]);
      lines.push("");
      push(["Fixné náklady — zdroj úhrady"]);
      push(["Dátum", "Názov", "Zdroj úhrady", "Suma"]);
      for (const { rec, paidBy, byDirector } of stats.fixed) {
        push([
          rec.occurred_on,
          rec.title,
          byDirector ? `Z vkladu konateľa (${paidBy ? nameOf(paidBy) : "nezadaný"}) — pôžička firme` : "Z účtu firmy",
          Number(rec.amount).toFixed(2),
        ]);
      }
      lines.push("");
      push(["Zoznam transakcií"]);
      push(["Dátum", "Typ", "Názov", "Firma", "Zdroj úhrady", "Suma"]);
      for (const r of finance) {
        push([
          r.occurred_on,
          dirLabel(r.direction),
          r.title,
          vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category),
          srcOf(r.id, r.direction),
          Number(r.amount).toFixed(2),
        ]);
      }
      lines.push("");
    }

    if (showPartners) {
      push(["SEKCIA: ÚHRADY SPOLOČNÍKOV"]);
      push(["Úhrady spolu", stats.totalContrib.toFixed(2)]);
      lines.push("");
      push(["Súhrn podľa spoločníka"]);
      push(["Spoločník", "Suma"]);
      for (const [id, v] of stats.partnerRows) push([nameOf(id), v.toFixed(2)]);
      lines.push("");
      push(["Detail úhrad"]);
      push(["Dátum", "Spoločník", "Účel", "Firma", "Suma"]);
      for (const c of contributions) {
        push([c.paid_on, nameOf(c.partner_id), c.purpose, vrCatLabel("contribution", c.category), Number(c.amount).toFixed(2)]);
      }
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vr-liptov-${mode}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV export stiahnutý.");
  }

  const modes: { id: ReportMode; label: string }[] = [
    { id: "finance", label: "Výdaje a príjmy" },
    { id: "partners", label: "Spoločníci" },
    { id: "both", label: "Obe sekcie" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="mr-1 h-4 w-4" /> PDF report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report za obdobie</DialogTitle>
          <DialogDescription>
            Vyber obsah reportu a obdobie. PDF sa otvorí v tlačovom okne — zvoľ „Uložiť ako PDF“.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label>Obsah reportu</Label>
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={mode === m.id ? "default" : "outline"}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="vr-report-from">Od</Label>
            <Input id="vr-report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vr-report-to">Do</Label>
            <Input id="vr-report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {!valid && <p className="text-xs text-destructive">Dátum „Od“ musí byť skôr ako „Do“.</p>}
        {valid && (
          <p className="text-xs text-muted-foreground">
            {l1 || l2
              ? "Načítavam záznamy…"
              : [
                  showFinance ? `${finance.length} transakcií` : null,
                  showPartners ? `${contributions.length} úhrad spoločníkov` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={generate} disabled={!valid || l1 || l2}>
            <FileText className="mr-1 h-4 w-4" /> Vygenerovať PDF
          </Button>
          <Button className="flex-1" variant="outline" onClick={exportCsv} disabled={!valid || l1 || l2}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
