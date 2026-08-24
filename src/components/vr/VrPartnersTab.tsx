// Úhrady spoločníkov na chod firmy — zápis, úprava (aj spoločný vklad) + prehľad.
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { VrEmptyState, VrListSkeleton } from "@/components/vr/VrListStates";
import {
  eur,
  splitEven,
  useDeleteVrContribution,
  useSaveVrContributionGroup,
  useVrContributions,
  type VrPartnerContribution,
  type VrShareMode,
  type VrContribItem,
} from "@/lib/vrFinanceApi";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";
import { VrCategoryManager } from "@/components/vr/VrCategoryManager";
import { VrCompanySelect } from "@/components/vr/VrCompanySelect";
import { VrReportDialog } from "@/components/vr/VrReportDialog";


const todayIso = () => new Date().toISOString().slice(0, 10);

export function VrPartnersTab() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: rows = [], isLoading } = useVrContributions();
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
  // Položkový rozpis (napr. Meta Quest 3 – 571,49 €) + automatický súčet.
  const [items, setItems] = useState<{ name: string; price: string }[]>([]);
  const [category, setCategory] = useState("prevadzka");
  const [filterPartner, setFilterPartner] = useState("all");
  const [search, setSearch] = useState("");

  const [sharedOn, setSharedOn] = useState(false);
  const [partnerId2, setPartnerId2] = useState<string>("");
  const [splitMode, setSplitMode] = useState<Exclude<VrShareMode, "single">>("half");

  const activeCategory = categories.some((c) => c.id === category) ? category : categories[0]?.id ?? "ine";

  const num = (v: string) => Number(String(v ?? "").trim().replace(/\s/g, "").replace(",", "."));
  // Normalizácia položiek – staršie záznamy môžu mať kľúče label/amount.
  const normItems = (arr: unknown): VrContribItem[] =>
    (Array.isArray(arr) ? arr : []).map((raw) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      return {
        name: String(it.name ?? it.label ?? ""),
        price: Number(it.price ?? it.amount ?? 0) || 0,
      };
    });
  const cleanItems: VrContribItem[] = items
    .filter((it) => String(it.name ?? "").trim() && !Number.isNaN(num(it.price)) && num(it.price) !== 0)
    .map((it) => ({ name: String(it.name).trim(), price: num(it.price) }));

  const itemsTotal = cleanItems.reduce((s2, it) => s2 + it.price, 0);
  const hasItems = cleanItems.length > 0;

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

  // Vyhľadávanie podľa názvu firmy alebo účelu úhrady.
  const matchesSearch = (r: VrPartnerContribution) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      vrCatLabel("contribution", r.category).toLowerCase().includes(q) ||
      r.purpose.toLowerCase().includes(q)
    );
  };

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          (filterPartner === "all" || e.rows.some((r) => r.partner_id === filterPartner)) &&
          e.rows.some(matchesSearch)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filterPartner, search]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) => (filterPartner === "all" || r.partner_id === filterPartner) && matchesSearch(r)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filterPartner, search]
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
    setItems([]);
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
    setItems(normItems(first.items).map((it) => ({ name: it.name, price: String(it.price) })));
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
    const raw = hasItems ? String(itemsTotal) : String(amount).trim().replace(",", ".");
    const value = Number(raw);
    const first = partnerId || (userId as string);

    // Validácie
    if (!first) return toast.error("Vyber spoločníka.");
    const purposeText =
      purpose.trim() || (hasItems ? cleanItems.map((it) => it.name).join(", ").slice(0, 200) : "");
    if (!purposeText) return toast.error("Doplň, za čo bola úhrada, alebo pridaj položky.");
    if (!raw || Number.isNaN(value)) return toast.error("Suma musí byť číslo.");
    if (value <= 0) return toast.error("Zadaj sumu väčšiu ako 0.");
    if (value > 1_000_000) return toast.error("Suma je nereálne vysoká.");
    if (!paidOn) return toast.error("Vyber dátum úhrady.");
    if (new Date(paidOn) > new Date()) return toast.error("Dátum nemôže byť v budúcnosti.");
    if (!activeCategory) return toast.error("Vyber firmu / zdroj úhrady.");
    if (sharedOn && !partnerId2) return toast.error("Vyber druhého spoločníka.");
    if (sharedOn && partnerId2 === first) return toast.error("Vyber dvoch rôznych spoločníkov.");

    const partnerIds = sharedOn ? [first, partnerId2] : [first];

    // Kontrola duplicity (mimo práve upravovaného záznamu)
    const dup = rows.some(
      (r) =>
        (editingGroup ? (r.group_id ?? r.id) !== editingGroup : true) &&
        partnerIds.includes(r.partner_id) &&
        r.paid_on === paidOn &&
        r.purpose.trim().toLowerCase() === purposeText.toLowerCase()
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
        purpose: purposeText,
        category: activeCategory,
        items: hasItems ? cleanItems : null,
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <section className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
        <div className="sticky top-0 z-20 -mx-3 mb-3 grid gap-2 border-b border-border/50 bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Úhrady spoločníkov</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 lg:w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-full pl-9 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hľadať firmu alebo účel…"
                aria-label="Hľadať podľa firmy alebo účelu"
              />
            </div>

            <Select value={filterPartner} onValueChange={setFilterPartner}>
              <SelectTrigger className="h-9 w-full text-xs lg:w-[200px]" aria-label="Filter podľa spoločníka">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všetci spoločníci</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{nameOf(p.id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:col-span-2 lg:[&>*]:flex-none">
              <VrCategoryManager scope="contribution" />
              <VrReportDialog scope="partners" />
            </div>
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
            value={hasItems ? itemsTotal.toFixed(2) : amount}
            onChange={(e) => setAmount(e.target.value)}
            readOnly={hasItems}
            aria-label="Suma"
          />
          <VrCompanySelect
            scope="contribution"
            value={activeCategory}
            onChange={setCategory}
            label="Firma / zdroj úhrady"
          />

          <Input
            className="sm:col-span-2 lg:col-span-3"
            placeholder="Za čo bola úhrada (napr. nákup VR headsetu, nájom za august…)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            aria-label="Účel úhrady"
          />
          {/* Položkový rozpis úhrady */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-3 sm:col-span-2 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Položky {activeCategory ? `· ${vrCatLabel("contribution", activeCategory)}` : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setItems((p2) => [...p2, { name: "", price: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Pridať položku
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bez položiek sa zapíše len celková suma. Pridaj položky (napr. Meta Quest 3 – 571,49 €) a suma sa spočíta automaticky.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-9 min-w-0 flex-1 basis-full text-sm sm:basis-0"
                      placeholder="Názov položky"
                      value={it.name}
                      onChange={(ev) =>
                        setItems((p2) => p2.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))
                      }
                      aria-label={`Názov položky ${i + 1}`}
                    />
                    <Input
                      className="h-9 w-28 shrink-0 text-sm sm:w-32"

                      inputMode="decimal"
                      placeholder="0,00 €"
                      value={it.price}
                      onChange={(ev) =>
                        setItems((p2) => p2.map((x, j) => (j === i ? { ...x, price: ev.target.value } : x)))
                      }
                      aria-label={`Cena položky ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Odstrániť položku"
                      onClick={() => setItems((p2) => p2.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {hasItems && (
              <p className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-sm font-semibold">
                <span>Dokopy</span>
                <span className="tabular-nums text-vr">{eur(itemsTotal)}</span>
              </p>
            )}
          </div>

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
          {isLoading && (
            <li>
              <VrListSkeleton rows={3} />
            </li>
          )}
          {!isLoading && filteredEntries.length === 0 && (
            <li>
              <VrEmptyState
                icon={Wallet}
                title={rows.length === 0 ? "Zatiaľ žiadne úhrady" : "Nič nezodpovedá filtru"}
                hint={
                  rows.length === 0
                    ? "Zapíš prvú úhradu vo formulári vyššie — môžeš pridať aj položkový rozpis a spoločný vklad."
                    : "Skús zmeniť hľadaný výraz alebo filter spoločníka."
                }
              />
            </li>
          )}
          {filteredEntries.map((e) => {
            const first = e.rows[0];
            const shared = e.rows.length > 1;
            return (
              <li key={e.key} className="py-3">
                <div className="flex items-start gap-3">
                  {shared ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-vr-soft text-vr">
                      <Users className="h-4 w-4" />
                    </span>
                  ) : (
                    <UserAvatar profile={profiles.find((p) => p.id === first.partner_id)} className="h-9 w-9 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium leading-snug">{first.purpose}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(e.total)}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {new Date(first.paid_on).toLocaleDateString("sk-SK")} · {vrCatLabel("contribution", first.category)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {e.rows.map((r) => (
                        <span
                          key={r.id}
                          className="rounded-full bg-surface-muted/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {nameOf(r.partner_id)} · <span className="tabular-nums">{eur(Number(r.amount))}</span>
                        </span>
                      ))}
                    </div>
                    {normItems(first.items).length > 0 && (
                      <ul className="mt-2 space-y-1 border-l border-border/50 pl-3 text-xs">
                        {normItems(first.items).map((it, i) => (
                          <li key={i} className="flex items-start justify-between gap-3">
                            <span className="min-w-0 break-words text-muted-foreground">{it.name}</span>
                            <span className="shrink-0 tabular-nums">{eur(it.price)}</span>
                          </li>
                        ))}
                        <li className="flex items-center justify-between gap-3 border-t border-border/50 pt-1 font-semibold">
                          <span>Dokopy</span>
                          <span className="tabular-nums">{eur(normItems(first.items).reduce((s3, it) => s3 + it.price, 0))}</span>
                        </li>
                      </ul>
                    )}
                    <div className="mt-1.5 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        aria-label="Upraviť úhradu"
                        onClick={() => startEdit(e)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Upraviť
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                        aria-label="Zmazať úhradu"
                        onClick={() => e.rows.forEach((r) => remove.mutate(r.id))}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Zmazať
                      </Button>
                    </div>
                  </div>
                </div>
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
