import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ExternalLink, FileText, Link as LinkIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCurrentUserId,
  useGuides,
  useCreateGuide,
  useDeleteGuide,
  useProfiles,
  useUpdateGuide,
} from "@/lib/queries";
import type { Guide, GuideAttachment } from "@/lib/types";
import { cn, formatMaterialDate } from "@/lib/utils";

const SECTION_KEYS = ["what", "steps", "tips", "notes"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
const SECTION_LABEL: Record<SectionKey, string> = {
  what: "O čom je tento návod?",
  steps: "Postup krok za krokom",
  tips: "Tipy a triky",
  notes: "Poznámky / na čo si dať pozor",
};
const SECTION_HINT: Record<SectionKey, string> = {
  what: "Krátky úvod",
  steps: "Číslovaný postup (1. 2. 3.)",
  tips: "Užitočné odporúčania",
  notes: "Upozornenia a limity",
};
type Sections = Record<SectionKey, string>;
const EMPTY_SECTIONS: Sections = { what: "", steps: "", tips: "", notes: "" };

function parseSections(raw: string | null | undefined): Sections {
  if (!raw) return { ...EMPTY_SECTIONS };
  const t = raw.trim();
  if (t.startsWith("{")) {
    try {
      const p = JSON.parse(t);
      if (p && typeof p === "object" && p.__v === "guide-sections") {
        const out = { ...EMPTY_SECTIONS };
        for (const k of SECTION_KEYS) if (typeof p[k] === "string") out[k] = p[k];
        return out;
      }
    } catch {/* */}
  }
  return { ...EMPTY_SECTIONS, what: raw };
}

function serializeSections(s: Sections): string | null {
  const any = SECTION_KEYS.some((k) => s[k].trim().length > 0);
  if (!any) return null;
  const payload: Record<string, string> = { __v: "guide-sections" };
  for (const k of SECTION_KEYS) payload[k] = s[k].trim();
  return JSON.stringify(payload);
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const ws = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(ws);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function slugify(raw: string): string {
  return raw.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function prettyCategory(slug: string): string {
  if (slug === "ine") return "Iné";
  return slug.split(/[-_\s]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

type FormState = {
  name: string;
  sections: Sections;
  category: string;
  image_url: string;
  attachments: GuideAttachment[];
};

const EMPTY_FORM: FormState = {
  name: "",
  sections: { ...EMPTY_SECTIONS },
  category: "ine",
  image_url: "",
  attachments: [],
};

export function GuidesLibrary() {
  const currentUserId = useCurrentUserId();
  const { data: guides = [], isLoading } = useGuides();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateGuide();
  const update = useUpdateGuide();
  const remove = useDeleteGuide();

  const [filter, setFilter] = useState<string>("all");
  const [openGuide, setOpenGuide] = useState<Guide | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [extraCats, setExtraCats] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("guides:extraCategories");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch { return []; }
  });
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");

  useEffect(() => {
    try { localStorage.setItem("guides:extraCategories", JSON.stringify(extraCats)); } catch {}
  }, [extraCats]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const categories = useMemo(() => {
    const s = new Set<string>(["ine"]);
    for (const g of guides) s.add(g.category);
    for (const c of extraCats) s.add(c);
    return Array.from(s);
  }, [guides, extraCats]);

  const filters = useMemo(() => ["all", ...categories], [categories]);
  const countByFilter = (f: string) =>
    f === "all" ? guides.length : guides.filter((g) => g.category === f).length;

  const addCategoryFromFilter = () => {
    const slug = slugify(newCatInput);
    if (!slug) { toast.error("Zadaj názov kategórie"); return; }
    setExtraCats((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setFilter(slug);
    setNewCatInput("");
    setNewCatOpen(false);
  };

  const visible = useMemo(
    () => (filter === "all" ? guides : guides.filter((g) => g.category === filter)),
    [guides, filter],
  );

  const submitCreate = async () => {
    if (!currentUserId) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Zadaj názov návodu");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        description: serializeSections(form.sections),
        category: form.category || "ine",
        image_url: form.image_url.trim() || null,
        attachments: form.attachments,
        created_by: currentUserId,
      });
      setForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const submitUpdate = async () => {
    if (!openGuide) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Zadaj názov návodu");
      return;
    }
    try {
      const updated = await update.mutateAsync({
        id: openGuide.id,
        patch: {
          name,
          description: serializeSections(form.sections),
          category: form.category || "ine",
          image_url: form.image_url.trim() || null,
          attachments: form.attachments,
        },
      });
      setOpenGuide(updated);
      setEditMode(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const startEdit = (g: Guide) => {
    setForm({
      name: g.name,
      sections: parseSections(g.description),
      category: g.category,
      image_url: g.image_url ?? "",
      attachments: g.attachments ?? [],
    });
    setEditMode(true);
  };

  const handleDelete = async (g: Guide) => {
    if (!confirm(`Naozaj odstrániť návod „${g.name}"?`)) return;
    try {
      await remove.mutateAsync(g.id);
      setOpenGuide(null);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa odstrániť");
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tímová knižnica návodov – klikni na kartu pre detail aj prílohy.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY_FORM, category: filter === "all" ? "ine" : filter });
            setAddOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Pridať návod
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-surface-muted p-1.5">
        {(filtersExpanded
          ? filters
          : filters.length <= 7
            ? filters
            : filters.slice(0, 6).concat("__expand__")
        ).map((f) => {
          if (f === "__expand__") {
            return (
              <button
                key="__expand__"
                type="button"
                onClick={() => setFiltersExpanded(true)}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <span>+{filters.length - 6} kategórií</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            );
          }
          const label = f === "all" ? "Všetko" : prettyCategory(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                filter === f
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="ml-1 opacity-60">{countByFilter(f)}</span>
            </button>
          );
        })}
        {filtersExpanded && filters.length > 7 && (
          <button
            type="button"
            onClick={() => setFiltersExpanded(false)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Menej
          </button>
        )}
        {newCatOpen ? (
          <span className="flex items-center gap-1">
            <Input
              autoFocus
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addCategoryFromFilter(); }
                if (e.key === "Escape") { setNewCatOpen(false); setNewCatInput(""); }
              }}
              placeholder="Názov kategórie"
              className="h-7 w-40 text-xs"
            />
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={addCategoryFromFilter}>
              OK
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setNewCatOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            title="Pridať novú kategóriu"
          >
            <Plus className="h-3.5 w-3.5" /> Kategória
          </button>
        )}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl bg-surface-muted p-8 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne návody. Pridaj prvý.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { setEditMode(false); setOpenGuide(g); }}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-24 items-center justify-center overflow-hidden bg-surface-muted">
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.name} loading="lazy"
                      className="h-12 w-12 object-contain transition-transform group-hover:scale-110" />
                  ) : (
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-1 text-sm font-semibold">{g.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {prettyCategory(g.category)}
                    {g.attachments?.length > 0 && ` · ${g.attachments.length} príloh`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail / Edit dialog */}
      <Dialog open={!!openGuide} onOpenChange={(o) => { if (!o) { setOpenGuide(null); setEditMode(false); } }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {openGuide && !editMode && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {openGuide.image_url ? (
                    <img src={openGuide.image_url} alt="" className="h-10 w-10 rounded-lg object-contain" />
                  ) : (
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{openGuide.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {prettyCategory(openGuide.category)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <SectionsView
                  sections={parseSections(openGuide.description)}
                  attachments={openGuide.attachments ?? []}
                />

                <div className="text-[11px] text-muted-foreground">
                  {openGuide.created_by
                    ? `Pridal ${profileById.get(openGuide.created_by)?.full_name ?? "—"}`
                    : ""}
                  {` · ${formatMaterialDate(openGuide.created_at) ?? ""}`}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {openGuide.created_by === currentUserId && (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(openGuide)}
                    className="text-destructive hover:text-destructive">
                    <Trash2 className="mr-1 h-4 w-4" /> Odstrániť
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => startEdit(openGuide)}>
                  <Pencil className="mr-1 h-4 w-4" /> Upraviť
                </Button>
              </DialogFooter>
            </>
          )}

          {openGuide && editMode && (
            <>
              <DialogHeader>
                <DialogTitle>Upraviť návod</DialogTitle>
              </DialogHeader>
              <GuideForm form={form} setForm={setForm} guides={guides} extraCats={extraCats} />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Zrušiť</Button>
                <Button size="sm" onClick={submitUpdate} disabled={update.isPending}>
                  {update.isPending ? "Ukladám…" : "Uložiť"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nový návod</DialogTitle>
            <DialogDescription>Pridaj názov, popis, kategóriu a prílohy.</DialogDescription>
          </DialogHeader>
          <GuideForm form={form} setForm={setForm} guides={guides} extraCats={extraCats} />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Zrušiť</Button>
            <Button size="sm" onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? "Pridávam…" : "Pridať"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuideForm({
  form,
  setForm,
  guides,
  extraCats = [],
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  guides: Guide[];
  extraCats?: string[];
}) {
  const [customCatOpen, setCustomCatOpen] = useState(false);
  const [customCatInput, setCustomCatInput] = useState("");
  const [newAttUrl, setNewAttUrl] = useState("");
  const [newAttLabel, setNewAttLabel] = useState("");

  const allCategories = useMemo(() => {
    const s = new Set<string>(["ine"]);
    for (const g of guides) s.add(g.category);
    for (const c of extraCats) s.add(c);
    s.add(form.category || "ine");
    return Array.from(s);
  }, [guides, form.category, extraCats]);

  const addAttachment = () => {
    const normalized = normalizeUrl(newAttUrl);
    if (!normalized) {
      toast.error("Zadaj platný odkaz na prílohu");
      return;
    }
    setForm({
      ...form,
      attachments: [...form.attachments, { url: normalized, label: newAttLabel.trim() || null }],
    });
    setNewAttUrl("");
    setNewAttLabel("");
  };

  const removeAttachment = (i: number) => {
    setForm({ ...form, attachments: form.attachments.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Názov</label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="napr. Ako spustiť Google Ads kampaň" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Kategória</label>
        <Select
          value={form.category}
          onValueChange={(v) => {
            if (v === "__new__") { setCustomCatInput(""); setCustomCatOpen(true); return; }
            setForm({ ...form, category: v });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {allCategories.map((c) => (
              <SelectItem key={c} value={c}>{prettyCategory(c)}</SelectItem>
            ))}
            <SelectItem value="__new__">+ Pridať vlastnú kategóriu…</SelectItem>
          </SelectContent>
        </Select>
        {customCatOpen && (
          <div className="mt-2 flex gap-2">
            <Input autoFocus value={customCatInput} onChange={(e) => setCustomCatInput(e.target.value)}
              placeholder="Názov kategórie"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const slug = slugify(customCatInput);
                  if (slug) { setForm({ ...form, category: slug }); setCustomCatOpen(false); }
                }
              }} />
            <Button type="button" size="sm" onClick={() => {
              const slug = slugify(customCatInput);
              if (!slug) { toast.error("Zadaj názov kategórie"); return; }
              setForm({ ...form, category: slug }); setCustomCatOpen(false);
            }}>Použiť</Button>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Obsah návodu
        </p>
        {SECTION_KEYS.map((k) => (
          <div key={k}>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              {SECTION_LABEL[k]}{" "}
              <span className="font-normal text-muted-foreground">— {SECTION_HINT[k]}</span>
            </label>
            <Textarea
              value={form.sections[k]}
              onChange={(e) => setForm({ ...form, sections: { ...form.sections, [k]: e.target.value } })}
              placeholder={SECTION_HINT[k]} rows={3} />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Prílohy (Google Disk, dokumenty, odkazy)
        </p>
        {form.attachments.length > 0 && (
          <ul className="space-y-1.5">
            {form.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
                <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{a.label?.trim() || hostOf(a.url)}</span>
                  <span className="truncate text-muted-foreground">{a.url}</span>
                </div>
                <button type="button" onClick={() => removeAttachment(i)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-destructive"
                  aria-label="Odstrániť prílohu">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={newAttUrl} onChange={(e) => setNewAttUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="h-8 text-xs sm:flex-1" />
          <Input value={newAttLabel} onChange={(e) => setNewAttLabel(e.target.value)}
            placeholder="Názov (voliteľné)" className="h-8 text-xs sm:w-44" />
          <Button type="button" size="sm" variant="outline" onClick={addAttachment}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Pridať
          </Button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Obrázok / ikona (URL, voliteľné)
        </label>
        <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          placeholder="https://…/icon.png" />
      </div>
    </div>
  );
}

function SectionsView({ sections }: { sections: Sections }) {
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);
  const filled = SECTION_KEYS.filter((k) => sections[k].trim().length > 0);
  if (filled.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Žiadny popis. Klikni na „Upraviť" a doplň jednotlivé sekcie.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {filled.map((k) => {
        const isOpen = openKey === k;
        return (
          <details
            key={k}
            open={isOpen}
            onToggle={(e) => {
              const d = e.currentTarget;
              if (d.open) setOpenKey(k);
              else if (openKey === k) setOpenKey(null);
            }}
            className="group rounded-xl border border-border bg-surface-muted/40 p-3 open:bg-surface-muted/60"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
              <span className="mr-2 inline-block text-muted-foreground transition group-open:rotate-90">›</span>
              {SECTION_LABEL[k]}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {sections[k]}
            </p>
          </details>
        );
      })}
    </div>
  );
}