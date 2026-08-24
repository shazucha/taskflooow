// Úhrady spoločníkov na chod firmy — zápis, úprava (aj spoločný vklad) + prehľad.
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import {
  eur,
  splitEven,
  useDeleteVrContribution,
  useSaveVrContributionGroup,
  useVrContributions,
  type VrPartnerContribution,
  type VrShareMode,
} from "@/lib/vrFinanceApi";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";

const todayIso = () => new Date().toISOString().slice(0, 10);

export function VrPartnersTab() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: rows = [] } = useVrContributions();
  const save = useSaveVrContributionGroup();
  const remove = useDeleteVrContribution();
  const categories = useVrCategories("contribution");

  const [editingGroup, setEditingGroup] = useState<string | null>(null); // group_id alebo id riadku
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null); // len ak išlo o spoločný vklad
  const [partnerId, setPartnerId] = useState<string>("");
  const [paidOn, setPaidOn] = useState(todayIso);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("prevadzka");
  const [filterPartner, setFilterPartner] = useState("all");
  const [sharedOn, setSharedOn] = useState(false);
  const [partnerId2, setPartnerId2] = useState<string>("");
  const [splitMode, setSplitMode] = useState<Exclude<VrShareMode, "single">>("half");

  const activeCategory = categories.some((c) => c.id === category) ? category : categories[0]?.id ?? "ine";

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name?.trim() || p?.email || "Spoločník";
  };

  // Zoskupenie: spoločné vklady sa v zozname zobrazia ako jeden riadok.
  interface Entry {
    key: string;
    groupId: string | null;
    rows: VrPartnerContribution[];
    total: number;
  }
  const entries: Entry[] = useMemo(() => {
    const groups = new Map<string, VrPartnerContribution[]>();
    const out: Entry[] = [];
    for (const r of rows) {
      if (r.group_id) {
        groups.set(r.group_id, [...(groups.get(r.group_id) ?? []), r]);
      } else {
        out.push({ key: r.id, groupId: null, rows: [r], total: Number(r.amount) });
      }
    }
    for (const [gid, list] of groups) {
      const total =
        list[0]?.share_mode === "each"
          ? Number(list[0].total_amount ?? list[0].amount)
          : list.reduce((s, r) => s + Number(r.amount), 0);
      out.push({ key: gid, groupId: gid, rows: list, total });
    }
    return out.sort((a, b) => (a.rows[0].paid_on < b.rows[0].paid_on ? 1 : -1));
  }, [rows]);

  const filteredEntries = useMemo(
    () =>
      filterPartner === "all"
        ? entries
        : entries.filter((e) => e.rows.some((r) => r.partner_id === filterPartner)),
    [entries, filterPartner]
  );

  const filteredRows = useMemo(
    () => (filterPartner === "all" ? rows : rows.filter((r) => r.partner_id === filterPartner)),
    [rows, filterPartner]
  );

  // Súhrny počítame vždy z jednotlivých riadkov => spoločný vklad je korektne rozpočítaný.
  const total = filteredRows.reduce((s, r) => s + Number(r.amount), 0);

  const byPartner = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.partner_id, (m.get(r.partner_id) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRows) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  function resetForm() {
    setEditingGroup(null);
    setEditingIds([]);
    setEditingGroupId(null);
    setAmount("");
    setPurpose("");
    setSharedOn(false);
    setPartnerId2("");
    setSplitMode("half");
    setPaidOn(todayIso());
  }

  function startEdit(e: Entry) {
    const first = e.rows[0];
    setEditingGroup(e.groupId ?? first.id);
    setEditingIds(e.rows.map((r) => r.id));
    setEditingGroupId(e.groupId);
    setPartnerId(first.partner_id);
    setPaidOn(first.paid_on);
    setCategory(first.category);
    setPurpose(first.purpose);
    if (e.rows.length > 1) {
      setSharedOn(true);
      setPartnerId2(e.rows[1].partner_id);
      setSplitMode(first.share_mode === "each" ? "each" : "half");
      setAmount(String(e.total));
    } else {
      setSharedOn(false);
      setPartnerId2("");
      setAmount(String(Number(first.amount)));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const raw = String(amount).trim().replace(",", ".");
    const value = Number(raw);
    const first = partnerId || (userId as string);

    // Validácie
    if (!first) return toast.error("Vyber spoločníka.");
    if (!purpose.trim()) return toast.error("Doplň, za čo bola úhrada.");
    if (!raw || Number.isNaN(value)) return toast.error("Suma musí byť číslo.");
    if (value <= 0) return toast.error("Zadaj sumu väčšiu ako 0.");
    if (value > 1_000_000) return toast.error("Suma je nereálne vysoká.");
    if (!paidOn) return toast.error("Vyber dátum úhrady.");
    if (new Date(paidOn) > new Date()) return toast.error("Dátum nemôže byť v budúcnosti.");
    if (!activeCategory) return toast.error("Vyber kategóriu.");
    if (sharedOn && !partnerId2) return toast.error("Vyber druhého spoločníka.");
    if (sharedOn && partnerId2 === first) return toast.error("Vyber dvoch rôznych spoločníkov.");

    const partnerIds = sharedOn ? [first, partnerId2] : [first];

    // Kontrola duplicity (mimo práve upravovaného záznamu)
    const dup = rows.some(
      (r) =>
        (editingGroup ? (r.group_id ?? r.id) !== editingGroup : true) &&
        partnerIds.includes(r.partner_id) &&
        r.paid_on === paidOn &&
        r.purpose.trim().toLowerCase() === purpose.trim().toLowerCase()
    );
    if (dup) return toast.error("Rovnaká úhrada už je zapísaná.");

    try {
      await save.mutateAsync({
        groupId: sharedOn ? editingGroupId : null,
        existingIds: editingGroup ? editingIds : [],
        partnerIds,
        paid_on: paidOn,
        total: value,
        shareMode: sharedOn ? splitMode : "single",
        purpose: purpose.trim(),
        category: activeCategory,
        note: sharedOn ? `Spoločná úhrada: ${partnerIds.map(nameOf).join(" + ")}` : null,
      });
      toast.success(editingGroup ? "Úhrada upravená." : sharedOn ? "Spoločná úhrada zapísaná." : "Úhrada zapísaná.");
      resetForm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const previewSplit =
    sharedOn && splitMode === "half" && Number(String(amount).replace(",", "."))
      ? splitEven(Number(String(amount).replace(",", ".")), 2)
      : null;

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

        {/* Formulár zápisu / úpravy */}
        <div className="grid gap-2 rounded-xl border border-border/50 bg-surface-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {editingGroup && (
            <p className="flex items-center justify-between gap-2 rounded-md bg-vr-soft/60 px-3 py-1.5 text-xs sm:col-span-2 lg:col-span-4">
              Upravuješ existujúcu úhradu.
              <Button variant="ghost" size="sm" className="h-7" onClick={resetForm}>
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
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Dátum úhrady" />
          <Input
            inputMode="decimal"
            placeholder="Suma v € (celková)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Suma"
          />
          <Select value={activeCategory} onValueChange={setCategory}>
            <SelectTrigger aria-label="Firma / zdroj úhrady"><SelectValue placeholder="Firma / zdroj" /></SelectTrigger>
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
              {previewSplit && (
                <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                  Rozpočítanie: {nameOf(partnerId || (userId as string))} {eur(previewSplit[0])} ·{" "}
                  {partnerId2 ? nameOf(partnerId2) : "druhý spoločník"} {eur(previewSplit[1])}
                </p>
              )}
            </>
          )}
          <Button onClick={submit} disabled={save.isPending} className="bg-vr text-vr-foreground hover:bg-vr/90">
            <Plus className="mr-1 h-4 w-4" /> {editingGroup ? "Uložiť zmeny" : "Zapísať"}
          </Button>
        </div>

        {/* Zoznam */}
        <ul className="mt-3 divide-y divide-border/50">
          {filteredEntries.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">Zatiaľ žiadne úhrady.</li>
          )}
          {filteredEntries.map((e) => {
            const first = e.rows[0];
            const shared = e.rows.length > 1;
            return (
              <li key={e.key} className="flex items-center gap-3 py-2.5">
                {shared ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vr-soft text-vr">
                    <Users className="h-4 w-4" />
                  </span>
                ) : (
                  <UserAvatar profile={profiles.find((p) => p.id === first.partner_id)} className="h-8 w-8 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{first.purpose}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.rows.map((r) => `${nameOf(r.partner_id)} ${eur(Number(r.amount))}`).join(" + ")} ·{" "}
                    {new Date(first.paid_on).toLocaleDateString("sk-SK")} · {vrCatLabel("contribution", first.category)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(e.total)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label="Upraviť úhradu"
                  onClick={() => startEdit(e)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Zmazať úhradu"
                  onClick={() => e.rows.forEach((r) => remove.mutate(r.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Prehľad */}
      <aside className="grid gap-4">
        <div className="rounded-2xl border border-vr/30 bg-vr-soft/50 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="h-4 w-4" /> Spolu vynaložené
          </p>
          <p className="mt-1 text-2xl font-bold text-vr tabular-nums">{eur(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{filteredRows.length} zápisov</p>
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Podľa firmy / zdroja</h3>
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
