// Podiely spoločníkov — presný výpočet: úhrady + vklady, celkovo aj po projektoch.
// Pri každom projekte vidno celkovú cenu a koľko z nej reálne dal ktorý spoločník.
import { useMemo, useState } from "react";
import { ChevronDown, PieChart } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useProfiles } from "@/lib/queries";
import { eur, useVrContributions, useVrDeposits } from "@/lib/vrFinanceApi";
import { VrListSkeleton } from "@/components/vr/VrListStates";

interface Row {
  uid: string;
  pay: number;
  dep: number;
  sum: number;
}

const NO_PROJECT = "__none__";

function buildRows(entries: { uid: string; key: "pay" | "dep"; value: number }[]) {
  const m = new Map<string, { pay: number; dep: number }>();
  for (const e of entries) {
    const cur = m.get(e.uid) ?? { pay: 0, dep: 0 };
    cur[e.key] += e.value;
    m.set(e.uid, cur);
  }
  const list: Row[] = [...m.entries()]
    .map(([uid, v]) => ({ uid, ...v, sum: v.pay + v.dep }))
    .filter((r) => r.sum !== 0)
    .sort((a, b) => b.sum - a.sum);
  return { rows: list, total: list.reduce((s, r) => s + r.sum, 0) };
}

export function VrPartnerSharesCard() {
  const { data: profiles = [] } = useProfiles();
  const { data: contribs = [], isLoading: l1 } = useVrContributions();
  const { data: deposits = [], isLoading: l2 } = useVrDeposits();
  const [open, setOpen] = useState<string | null>(null);

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  // Všetky príspevky zjednotené na jeden tvar { projekt, spoločník, typ, suma }.
  const flat = useMemo(
    () => [
      ...contribs.map((r) => ({
        project: (r.project ?? "").trim() || NO_PROJECT,
        uid: r.partner_id,
        key: "pay" as const,
        value: Number(r.amount) || 0,
      })),
      ...deposits.map((d) => ({
        project: (d.source ?? "").trim() || NO_PROJECT,
        uid: d.partner_id,
        key: "dep" as const,
        value: Number(d.amount) || 0,
      })),
    ],
    [contribs, deposits]
  );

  const overall = useMemo(() => buildRows(flat), [flat]);

  const projects = useMemo(() => {
    const m = new Map<string, typeof flat>();
    for (const e of flat) m.set(e.project, [...(m.get(e.project) ?? []), e]);
    return [...m.entries()]
      .map(([project, list]) => ({ project, ...buildRows(list) }))
      .filter((p) => p.total !== 0)
      .sort((a, b) => {
        if (a.project === NO_PROJECT) return 1;
        if (b.project === NO_PROJECT) return -1;
        return b.total - a.total;
      });
  }, [flat]);

  const loading = l1 || l2;
  const fair = overall.rows.length ? overall.total / overall.rows.length : 0;

  const renderRows = (rows: Row[], total: number, showFair: boolean) => (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = total ? (r.sum / total) * 100 : 0;
        const diff = r.sum - (rows.length ? total / rows.length : 0);
        return (
          <li key={r.uid} className="min-w-0">
            <div className="flex items-center gap-3">
              <UserAvatar profile={profiles.find((p) => p.id === r.uid)} className="h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{nameOf(r.uid)}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-vr">
                    {pct.toFixed(1)} %
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-vr" style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Spolu <span className="font-medium tabular-nums">{eur(r.sum)}</span> · úhrady{" "}
                  <span className="tabular-nums">{eur(r.pay)}</span> · vklady{" "}
                  <span className="tabular-nums">{eur(r.dep)}</span>
                  {showFair && rows.length > 1 && (
                    <>
                      {" · "}
                      <span className={diff >= 0 ? "text-vr" : "text-destructive"}>
                        {diff >= 0 ? "+" : "−"}
                        {eur(Math.abs(diff))} oproti rovnému dielu
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <PieChart className="h-4 w-4 text-vr" /> Podiely spoločníkov
        </h2>
        <span className="rounded-full bg-vr-soft px-3 py-1 text-sm font-semibold tabular-nums text-vr">
          {eur(overall.total)}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Do podielu sa počítajú úhrady spoločníkov aj ich vklady. Rovným dielom by na
        každého pripadlo <strong className="tabular-nums">{eur(fair)}</strong>.
      </p>

      {loading && <VrListSkeleton rows={2} />}

      {!loading && overall.rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          Zatiaľ žiadne úhrady ani vklady.
        </p>
      )}

      {!loading && overall.rows.length > 0 && renderRows(overall.rows, overall.total, true)}

      {/* Rozpad podielov po projektoch */}
      {!loading && projects.length > 0 && (
        <div className="mt-4 border-t border-border/50 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Podiely po projektoch
          </h3>
          <ul className="space-y-2">
            {projects.map((p) => {
              const label = p.project === NO_PROJECT ? "Bez projektu" : p.project;
              const isOpen = open === p.project;
              return (
                <li key={p.project} className="rounded-xl border border-border/50 bg-surface-muted/30">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.project)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-vr">
                      {eur(p.total)}
                    </span>
                  </button>
                  {isOpen && <div className="px-3 pb-3">{renderRows(p.rows, p.total, false)}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
