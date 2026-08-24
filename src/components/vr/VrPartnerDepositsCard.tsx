// Vklady spoločníkov — napr. podiel z marketingových projektov použitý ako vklad do firmy.
import { useMemo, useState } from "react";
import { Coins, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { VrEmptyState, VrListSkeleton } from "@/components/vr/VrListStates";
import {
  eur,
  useDeleteVrDeposit,
  useSaveVrDeposit,
  useVrDeposits,
  type VrPartnerDeposit,
} from "@/lib/vrFinanceApi";

const todayIso = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => Number(String(v ?? "").trim().replace(/\s/g, "").replace(",", "."));

export function VrPartnerDepositsCard() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: rows = [], isLoading } = useVrDeposits();
  const save = useSaveVrDeposit();
  const remove = useDeleteVrDeposit();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [depositedOn, setDepositedOn] = useState(todayIso);
  const [source, setSource] = useState("");
  const [base, setBase] = useState("");
  const [pct, setPct] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  // Ak je zadaný zárobok projektu a %, suma vkladu sa dopočíta automaticky.
  const computed = useMemo(() => {
    const b = num(base);
    const p = num(pct);
    if (!b || !p || Number.isNaN(b) || Number.isNaN(p)) return null;
    return Math.round(((b * p) / 100) * 100) / 100;
  }, [base, pct]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.partner_id, (m.get(r.partner_id) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function reset() {
    setEditingId(null);
    setSource("");
    setBase("");
    setPct("");
    setAmount("");
    setNote("");
    setDepositedOn(todayIso());
  }

  function startEdit(r: VrPartnerDeposit) {
    setEditingId(r.id);
    setPartnerId(r.partner_id);
    setDepositedOn(r.deposited_on);
    setSource(r.source ?? "");
    setBase(r.base_amount != null ? String(r.base_amount) : "");
    setPct(r.share_pct != null ? String(r.share_pct) : "");
    setAmount(String(Number(r.amount)));
    setNote(r.note ?? "");
  }

  async function submit() {
    const pid = partnerId || (userId as string);
    const value = amount.trim() ? num(amount) : computed ?? NaN;
    if (!pid) return toast.error("Vyber spoločníka.");
    if (!value || Number.isNaN(value) || value <= 0) return toast.error("Zadaj sumu vkladu väčšiu ako 0.");
    if (!depositedOn) return toast.error("Vyber dátum vkladu.");
    try {
      await save.mutateAsync({
        id: editingId ?? undefined,
        partner_id: pid,
        deposited_on: depositedOn,
        amount: value,
        source: source.trim() || null,
        base_amount: num(base) || null,
        share_pct: num(pct) || null,
        note: note.trim() || null,
      });
      toast.success(editingId ? "Vklad upravený." : "Vklad zapísaný.");
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <Coins className="h-4 w-4 text-vr" /> Vklady spoločníkov
        </h2>
        <span className="rounded-full bg-vr-soft px-3 py-1 text-sm font-semibold tabular-nums text-vr">
          {eur(total)}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Peniaze, ktoré spoločník vložil do firmy — napr. podiel z marketingového projektu
        (zárobok projektu × podiel v %).
      </p>

      <div className="grid gap-2 rounded-xl border border-border/50 bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
        {editingId && (
          <p className="flex items-center justify-between gap-2 rounded-md bg-vr-soft/60 px-3 py-1.5 text-xs sm:col-span-2 lg:col-span-4">
            Upravuješ existujúci vklad.
            <Button variant="ghost" size="sm" className="h-7" onClick={reset}>
              <X className="mr-1 h-3.5 w-3.5" /> Zrušiť úpravu
            </Button>
          </p>
        )}
        <Select value={partnerId || userId || ""} onValueChange={setPartnerId}>
          <SelectTrigger aria-label="Spoločník"><SelectValue placeholder="Spoločník" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{nameOf(p.id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={depositedOn}
          onChange={(e) => setDepositedOn(e.target.value)}
          aria-label="Dátum vkladu"
        />
        <Input
          className="sm:col-span-2"
          placeholder="Zdroj (napr. projekt Klient X)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Zdroj vkladu"
        />
        <Input
          inputMode="decimal"
          placeholder="Zárobok projektu € (voliteľné)"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          aria-label="Zárobok projektu"
        />
        <Input
          inputMode="decimal"
          placeholder="Podiel % (napr. 50)"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          aria-label="Podiel v percentách"
        />
        <Input
          inputMode="decimal"
          placeholder={computed ? `Vklad € (výpočet ${computed.toFixed(2)})` : "Vklad v €"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Suma vkladu"
        />
        <Input
          placeholder="Poznámka"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Poznámka"
        />
        {computed != null && !amount.trim() && (
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            Automatický výpočet: {eur(num(base))} × {num(pct)} % = <strong>{eur(computed)}</strong>
          </p>
        )}
        <Button
          onClick={submit}
          disabled={save.isPending}
          className="bg-vr text-vr-foreground hover:bg-vr/90 sm:col-span-2 lg:col-span-1"
        >
          <Plus className="mr-1 h-4 w-4" /> {editingId ? "Uložiť zmeny" : "Zapísať vklad"}
        </Button>
      </div>

      {byPartner.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {byPartner.map(([uid, sum]) => (
            <li key={uid} className="rounded-full bg-surface-muted/70 px-2.5 py-1 text-[11px] text-muted-foreground">
              {nameOf(uid)} · <span className="tabular-nums font-medium">{eur(sum)}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 divide-y divide-border/50">
        {isLoading && <li><VrListSkeleton rows={2} /></li>}
        {!isLoading && rows.length === 0 && (
          <li>
            <VrEmptyState
              icon={Coins}
              title="Zatiaľ žiadne vklady"
              hint="Zapíš prvý vklad spoločníka — napr. 50 % podiel z projektu za 1 000 €."
            />
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-3">
            <UserAvatar profile={profiles.find((p) => p.id === r.partner_id)} className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium leading-snug">
                  {r.source || "Vklad spoločníka"}
                </p>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-vr">{eur(Number(r.amount))}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {new Date(r.deposited_on).toLocaleDateString("sk-SK")} · {nameOf(r.partner_id)}
                {r.base_amount != null && r.share_pct != null
                  ? ` · ${eur(Number(r.base_amount))} × ${Number(r.share_pct)} %`
                  : ""}
              </p>
              {r.note && <p className="mt-1 break-words text-xs text-muted-foreground">{r.note}</p>}
              <div className="mt-1.5 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => startEdit(r)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Upraviť
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(r.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Zmazať
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
