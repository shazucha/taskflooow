// Úhrady spoločníkov na chod firmy — zápis + prehľad.
import { useMemo, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import {
  eur,
  useCreateVrContribution,
  useDeleteVrContribution,
  useVrContributions,
} from "@/lib/vrFinanceApi";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";

export function VrPartnersTab() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: rows = [] } = useVrContributions();
  const create = useCreateVrContribution();
  const remove = useDeleteVrContribution();

  const [partnerId, setPartnerId] = useState<string>("");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("prevadzka");
  const [filterPartner, setFilterPartner] = useState("all");
  // Spoločný vklad páru (napr. Stanley + Lenka)
  const [sharedOn, setSharedOn] = useState(false);
  const [partnerId2, setPartnerId2] = useState<string>("");
  const [splitMode, setSplitMode] = useState<"half" | "each">("half");
  const categories = useVrCategories("contribution");

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  const filtered = useMemo(
    () => (filterPartner === "all" ? rows : rows.filter((r) => r.partner_id === filterPartner)),
    [rows, filterPartner]
  );

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  // Súhrn podľa spoločníka a podľa kategórie
  const byPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.partner_id, (m.get(r.partner_id) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  async function submit() {
    const value = Number(String(amount).replace(",", "."));
    const first = partnerId || (userId as string);
    if (!first) return;
    if (!purpose.trim()) return toast.error("Doplň, za čo bola úhrada.");
    if (!value || value <= 0) return toast.error("Zadaj sumu väčšiu ako 0.");
    if (sharedOn && !partnerId2) return toast.error("Vyber druhého spoločníka.");
    if (sharedOn && partnerId2 === first) return toast.error("Vyber dvoch rôznych spoločníkov.");

    // Spoločný vklad: buď sa suma rozdelí na polovicu, alebo sa zapíše každému celá.
    const targets = sharedOn ? [first, partnerId2] : [first];
    const perPerson = sharedOn && splitMode === "half" ? Math.round((value / 2) * 100) / 100 : value;
    const suffix = sharedOn ? " (spoločný vklad)" : "";

    try {
      for (const pid of targets) {
        await create.mutateAsync({
          partner_id: pid,
          paid_on: paidOn,
          amount: perPerson,
          purpose: purpose.trim() + suffix,
          category,
          note: sharedOn ? `Spoločná úhrada: ${targets.map(nameOf).join(" + ")}` : null,
        });
      }
      setAmount("");
      setPurpose("");
      toast.success(sharedOn ? "Spoločná úhrada zapísaná pre 2 osoby." : "Úhrada zapísaná.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold sm:text-base">Úhrady spoločníkov</h2>
          <div className="flex items-center gap-2">
          <VrCategoryManager scope="contribution" />
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Filter podľa spoločníka">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetci spoločníci</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{nameOf(p.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>

        {/* Formulár zápisu */}
        <div className="grid gap-2 rounded-xl border border-border/50 bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={partnerId || userId || ""} onValueChange={setPartnerId}>
            <SelectTrigger aria-label="Spoločník"><SelectValue placeholder="Spoločník" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{nameOf(p.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Dátum úhrady" />
          <Input
            inputMode="decimal"
            placeholder="Suma v €"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Suma"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Kategória"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="sm:col-span-2 lg:col-span-3"
            placeholder="Za čo bola úhrada (napr. nákup VR headsetu, nájom za august…)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            aria-label="Účel úhrady"
          />
          <label className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm sm:col-span-2 lg:col-span-2">
            <input
              type="checkbox"
              checked={sharedOn}
              onChange={(e) => setSharedOn(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
            Spoločný vklad (2 osoby)
          </label>
          {sharedOn && (
            <>
              <Select value={partnerId2} onValueChange={setPartnerId2}>
                <SelectTrigger aria-label="Druhý spoločník"><SelectValue placeholder="Druhý spoločník" /></SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((p) => p.id !== (partnerId || userId))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>{nameOf(p.id)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={splitMode} onValueChange={(v) => setSplitMode(v as "half" | "each")}>
                <SelectTrigger aria-label="Rozdelenie sumy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="half">Rozdeliť sumu na polovicu</SelectItem>
                  <SelectItem value="each">Celá suma každému</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button onClick={submit} disabled={create.isPending} className="bg-vr text-vr-foreground hover:bg-vr/90">
            <Plus className="mr-1 h-4 w-4" /> Zapísať
          </Button>
        </div>

        {/* Zoznam */}
        <ul className="mt-3 divide-y divide-border/50">
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">Zatiaľ žiadne úhrady.</li>
          )}
          {filtered.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <UserAvatar profile={profiles.find((p) => p.id === r.partner_id)} className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.purpose}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {nameOf(r.partner_id)} · {new Date(r.paid_on).toLocaleDateString("sk-SK")} · {vrCatLabel("contribution", r.category)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(Number(r.amount))}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Zmazať úhradu"
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Prehľad */}
      <aside className="grid gap-4">
        <div className="rounded-2xl border border-vr/30 bg-vr-soft/50 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="h-4 w-4" /> Spolu vynaložené
          </p>
          <p className="mt-1 text-2xl font-bold text-vr tabular-nums">{eur(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{filtered.length} zápisov</p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Podľa spoločníka</h3>
          <ul className="space-y-1.5 text-sm">
            {byPartner.length === 0 && <li className="text-muted-foreground">—</li>}
            {byPartner.map(([uid, sum]) => (
              <li key={uid} className="flex items-center justify-between gap-2">
                <span className="truncate">{nameOf(uid)}</span>
                <span className="shrink-0 font-medium tabular-nums">{eur(sum)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Podľa kategórie</h3>
          <ul className="space-y-1.5 text-sm">
            {byCategory.length === 0 && <li className="text-muted-foreground">—</li>}
            {byCategory.map(([c, sum]) => (
              <li key={c} className="flex items-center justify-between gap-2">
                <span className="truncate">{vrCatLabel("contribution", c)}</span>
                <span className="shrink-0 font-medium tabular-nums">{eur(sum)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
