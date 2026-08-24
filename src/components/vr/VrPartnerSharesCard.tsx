// Podiely spoločníkov.
// 1) Náklady = úhrady spoločníkov na zriadenie a chod prevádzky VR Liptov (len tie tvoria podiel na nákladoch).
// 2) Vklady = nepeňažné vklady prevedené z inej firmy (podiel na projektoch, očistený o daň a dividendu).
//    Vklady NIE SÚ náklad — evidujú sa samostatne a do podielu na nákladoch sa nezapočítavajú.
import { useMemo } from "react";
import { PieChart } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useProfiles } from "@/lib/queries";
import { eur, useVrContributions, useVrDeposits } from "@/lib/vrFinanceApi";
import { VrListSkeleton } from "@/components/vr/VrListStates";

function group(entries: { uid: string; value: number }[]) {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.uid, (m.get(e.uid) ?? 0) + e.value);
  const rows = [...m.entries()]
    .map(([uid, sum]) => ({ uid, sum }))
    .filter((r) => r.sum !== 0)
    .sort((a, b) => b.sum - a.sum);
  return { rows, total: rows.reduce((s, r) => s + r.sum, 0) };
}

export function VrPartnerSharesCard() {
  const { data: profiles = [] } = useProfiles();
  const { data: contribs = [], isLoading: l1 } = useVrContributions();
  const { data: deposits = [], isLoading: l2 } = useVrDeposits();
  const loading = l1 || l2;

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  const costs = useMemo(
    () => group(contribs.map((r) => ({ uid: r.partner_id, value: Number(r.amount) || 0 }))),
    [contribs]
  );
  const dep = useMemo(
    () => group(deposits.map((d) => ({ uid: d.partner_id, value: Number(d.amount) || 0 }))),
    [deposits]
  );

  const fair = costs.rows.length ? costs.total / costs.rows.length : 0;

  return (
    <section className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <PieChart className="h-4 w-4 text-vr" /> Podiel na nákladoch
        </h2>
        <span className="rounded-full bg-vr-soft px-3 py-1 text-sm font-semibold tabular-nums text-vr">
          {eur(costs.total)}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Počítajú sa iba úhrady spoločníkov — náklady vynaložené na zriadenie a chod prevádzky
        VR Liptov. Rovným dielom by na každého pripadlo{" "}
        <strong className="tabular-nums">{eur(fair)}</strong>.
      </p>

      {loading && <VrListSkeleton rows={2} />}

      {!loading && costs.rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          Zatiaľ žiadne úhrady spoločníkov.
        </p>
      )}

      <ul className="space-y-3">
        {costs.rows.map((r) => {
          const pct = costs.total ? (r.sum / costs.total) * 100 : 0;
          const diff = r.sum - fair;
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
                    Úhrady <span className="font-medium tabular-nums">{eur(r.sum)}</span>
                    {costs.rows.length > 1 && (
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

      {/* Vklady — samostatne, nie sú náklad prevádzky */}
      {!loading && dep.rows.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-surface-muted/30 p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vklady do projektu (mimo nákladov)
            </h3>
            <span className="text-sm font-semibold tabular-nums">{eur(dep.total)}</span>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            Nepeňažný vklad prevedený z podielu na iných projektoch — očistený o daň a dividendu.
            Do podielu na nákladoch prevádzky sa nezapočítava.
          </p>
          <ul className="space-y-1">
            {dep.rows.map((r) => (
              <li key={r.uid} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">{nameOf(r.uid)}</span>
                <span className="shrink-0 font-medium tabular-nums">{eur(r.sum)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
