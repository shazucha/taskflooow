// PDF report so súhrnmi transakcií za zvolený časový interval (tlač → Uložiť ako PDF).
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
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

export function VrReportDialog() {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [from, setFrom] = useState(() => iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const valid = !!from && !!to && from <= to;
  const { data: finance = [], isLoading: l1 } = useVrFinanceRange(from, to, open && valid);
  const { data: contributions = [], isLoading: l2 } = useVrContributionsRange(from, to, open && valid);
  const { data: profiles = [] } = useProfiles();

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  const stats = useMemo(() => {
    const expenses = finance.filter((r) => r.direction === "expense");
    const incomes = finance.filter((r) => r.direction === "income");
    const sum = (a: { amount: number }[]) => a.reduce((s, r) => s + Number(r.amount), 0);
    const byCat = (a: typeof finance, scope: "expense" | "income") => {
      const m = new Map<string, number>();
      for (const r of a) {
        const k = vrCatLabel(scope, r.category);
        m.set(k, (m.get(k) ?? 0) + Number(r.amount));
      }
      return [...m.entries()].sort((x, y) => y[1] - x[1]);
    };
    const byPartner = new Map<string, number>();
    for (const c of contributions) {
      byPartner.set(c.partner_id, (byPartner.get(c.partner_id) ?? 0) + Number(c.amount));
    }
    return {
      expenses,
      incomes,
      totalExp: sum(expenses),
      totalInc: sum(incomes),
      totalContrib: sum(contributions),
      expByCat: byCat(expenses, "expense"),
      incByCat: byCat(incomes, "income"),
      partnerRows: [...byPartner.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [finance, contributions]);

  function generate() {
    if (!valid) return toast.error("Zadaj platný časový interval.");
    if (finance.length === 0 && contributions.length === 0) {
      return toast.error("V zvolenom období nie sú žiadne záznamy.");
    }

    const rowsTable = (
      title: string,
      head: string[],
      body: string[][],
      total?: number
    ) => `
      <h2>${esc(title)}</h2>
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

    const html = `<!doctype html>
<html lang="sk"><head><meta charset="utf-8">
<title>VR Liptov — finančný report ${esc(from)} – ${esc(to)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; margin: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 22px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 14px; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; }
  .card { flex: 1 1 150px; border: 1px solid #e5e5e5; border-radius: 10px; padding: 10px 12px; }
  .card span { display: block; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .card strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #eee; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f7f7f7; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td.num, th:last-child { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: 700; border-top: 2px solid #ccc; }
  footer { margin-top: 24px; font-size: 10px; color: #888; }
  @page { margin: 14mm; }
</style></head>
<body>
  <h1>VR Liptov — finančný report</h1>
  <div class="sub">Obdobie: ${esc(from)} – ${esc(to)} · vygenerované ${esc(new Date().toLocaleString("sk-SK"))}</div>

  <div class="cards">
    <div class="card"><span>Výdaje</span><strong>${esc(eur(stats.totalExp))}</strong></div>
    <div class="card"><span>Príjmy a vklady</span><strong>${esc(eur(stats.totalInc))}</strong></div>
    <div class="card"><span>Bilancia</span><strong>${esc(eur(stats.totalInc - stats.totalExp))}</strong></div>
    <div class="card"><span>Úhrady spoločníkov</span><strong>${esc(eur(stats.totalContrib))}</strong></div>
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
    stats.partnerRows.length
      ? rowsTable(
          "Úhrady spoločníkov — súhrn",
          ["Spoločník", "Suma"],
          stats.partnerRows.map(([id, v]) => [esc(nameOf(id)), esc(eur(v))]),
          stats.totalContrib
        )
      : ""
  }
  ${
    finance.length
      ? rowsTable(
          "Zoznam transakcií",
          ["Dátum", "Typ", "Názov", "Firma", "Suma"],
          finance.map((r) => [
            esc(r.occurred_on),
            r.direction === "expense" ? "Výdaj" : "Príjem",
            esc(r.title),
            esc(vrCatLabel(r.direction === "expense" ? "expense" : "income", r.category)),
            esc(eur(Number(r.amount))),
          ])
        )
      : ""
  }
  ${
    contributions.length
      ? rowsTable(
          "Úhrady spoločníkov — detail",
          ["Dátum", "Spoločník", "Účel", "Firma", "Suma"],
          contributions.map((c) => [
            esc(c.paid_on),
            esc(nameOf(c.partner_id)),
            esc(c.purpose),
            esc(vrCatLabel("contribution", c.category)),
            esc(eur(Number(c.amount))),
          ])
        )
      : ""
  }

  <footer>VR Liptov · TaskFlow — automaticky generovaný report</footer>
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return toast.error("Prehliadač zablokoval nové okno. Povoľ vyskakovacie okná.");
    w.document.write(html);
    w.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="mr-1 h-4 w-4" /> PDF report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PDF report za obdobie</DialogTitle>
          <DialogDescription>
            Súhrny výdajov, príjmov a úhrad spoločníkov. Otvorí sa tlačové okno — zvoľ „Uložiť ako PDF“.
          </DialogDescription>
        </DialogHeader>

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
              : `Nájdené: ${finance.length} transakcií, ${contributions.length} úhrad spoločníkov.`}
          </p>
        )}

        <Button onClick={generate} disabled={!valid || l1 || l2}>
          <FileText className="mr-1 h-4 w-4" /> Vygenerovať PDF
        </Button>
      </DialogContent>
    </Dialog>
  );
}
