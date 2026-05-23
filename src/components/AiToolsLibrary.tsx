import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
  useAiTools,
  useCreateAiTool,
  useCurrentUserId,
  useDeleteAiTool,
  useProfiles,
  useUpdateAiTool,
} from "@/lib/queries";
import {
  AI_TOOL_CATEGORIES,
  AI_TOOL_CATEGORY_LABEL,
  getAiToolCategoryLabel,
  type AiTool,
  type AiToolCategory,
} from "@/lib/types";
import { cn, formatMaterialDate } from "@/lib/utils";

type FilterKey = AiToolCategory | "all";

const SECTION_KEYS = [
  "what",
  "uses",
  "features",
  "howto",
  "scenarios",
  "limits",
  "prompts",
  "examples",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABEL: Record<SectionKey, string> = {
  what: "Čo to je?",
  uses: "Čo s tým viem robiť?",
  features: "Hlavné funkcie a schopnosti",
  howto: "Ako to používať krok za krokom",
  scenarios: "Kedy je to vhodný nástroj",
  limits: "Na čo si dávať pozor",
  prompts: "Tipy pre lepšie otázky (prompty)",
  examples: "Príklady z praxe",
};

const SECTION_HINT: Record<SectionKey, string> = {
  what: "Základný popis",
  uses: "Hlavné použitia",
  features: "Kľúčové funkcie",
  howto: "Postup krok za krokom",
  scenarios: "Typické scenáre použitia",
  limits: "Limity + riziká",
  prompts: "Príklady promptov",
  examples: "Use-cases z firmy",
};

type Sections = Record<SectionKey, string>;
const EMPTY_SECTIONS: Sections = {
  what: "", uses: "", features: "", howto: "",
  scenarios: "", limits: "", prompts: "", examples: "",
};

function parseSections(raw: string | null | undefined): Sections {
  if (!raw) return { ...EMPTY_SECTIONS };
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && parsed.__v === "ai-tool-sections") {
        const out: Sections = { ...EMPTY_SECTIONS };
        for (const k of SECTION_KEYS) {
          if (typeof parsed[k] === "string") out[k] = parsed[k];
        }
        return out;
      }
    } catch {
      // fallthrough to legacy
    }
  }
  return { ...EMPTY_SECTIONS, what: raw };
}

function serializeSections(s: Sections): string | null {
  const hasAny = SECTION_KEYS.some((k) => s[k].trim().length > 0);
  if (!hasAny) return null;
  const payload: Record<string, string> = { __v: "ai-tool-sections" };
  for (const k of SECTION_KEYS) payload[k] = s[k].trim();
  return JSON.stringify(payload);
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=128`;
  } catch {
    return null;
  }
}

type FormState = {
  name: string;
  url: string;
  sections: Sections;
  category: AiToolCategory;
  image_url: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  url: "",
  sections: { ...EMPTY_SECTIONS },
  category: "ine",
  image_url: "",
};

export function AiToolsLibrary() {
  const currentUserId = useCurrentUserId();
  const { data: tools = [], isLoading } = useAiTools();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateAiTool();
  const update = useUpdateAiTool();
  const remove = useDeleteAiTool();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [openTool, setOpenTool] = useState<AiTool | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filters: FilterKey[] = useMemo(() => {
    const used = new Set<string>();
    for (const t of tools) used.add(t.category);
    const presets = AI_TOOL_CATEGORIES.filter((c) => used.has(c) || c === "ine" || c === "ai-agenti");
    const custom = [...used].filter((c) => !(AI_TOOL_CATEGORIES as readonly string[]).includes(c));
    return ["all", ...presets, ...custom];
  }, [tools]);

  const countByFilter = (f: FilterKey) =>
    f === "all" ? tools.length : tools.filter((t) => t.category === f).length;

  const visible = useMemo(
    () => (filter === "all" ? tools : tools.filter((t) => t.category === filter)),
    [tools, filter]
  );

  const submitCreate = async () => {
    if (!currentUserId) return;
    const name = form.name.trim();
    const normalized = normalizeUrl(form.url);
    if (!name) {
      toast.error("Zadaj názov nástroja");
      return;
    }
    if (!normalized) {
      toast.error("Zadaj platný odkaz");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        url: normalized,
        description: serializeSections(form.sections),
        category: form.category,
        image_url: form.image_url.trim() || null,
        created_by: currentUserId,
      });
      setForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const submitUpdate = async () => {
    if (!openTool) return;
    const name = form.name.trim();
    const normalized = normalizeUrl(form.url);
    if (!name || !normalized) {
      toast.error("Vyplň názov a platný odkaz");
      return;
    }
    try {
      const updated = await update.mutateAsync({
        id: openTool.id,
        patch: {
          name,
          url: normalized,
          description: serializeSections(form.sections),
          category: form.category,
          image_url: form.image_url.trim() || null,
        },
      });
      setOpenTool(updated);
      setEditMode(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const startEdit = (t: AiTool) => {
    setForm({
      name: t.name,
      url: t.url,
      sections: parseSections(t.description),
      category: t.category,
      image_url: t.image_url ?? "",
    });
    setEditMode(true);
  };

  const handleDelete = async (t: AiTool) => {
    if (!confirm(`Naozaj odstrániť „${t.name}"?`)) return;
    try {
      await remove.mutateAsync(t.id);
      setOpenTool(null);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa odstrániť");
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tímová knižnica AI nástrojov – klikni na kartu pre detail.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY_FORM, category: filter === "all" ? "ine" : (filter as AiToolCategory) });
            setAddOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Pridať nástroj
        </Button>
      </div>

      {/* Filter chips */}
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
                className="shrink-1 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                title="Zobraziť viac kategórií"
              >
                <span>+{filters.length - 6} ďalších</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            );
          }
          const label = f === "all" ? "Všetko" : getAiToolCategoryLabel(f);
          const count = countByFilter(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                filter === f
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
        {filtersExpanded && (
          <button
            type="button"
            onClick={() => setFiltersExpanded(false)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Menej
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl bg-surface-muted p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne AI nástroje. Pridaj prvý.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((t) => {
              const img = t.image_url || faviconFor(t.url);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEditMode(false);
                    setOpenTool(t);
                  }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-24 items-center justify-center overflow-hidden bg-surface-muted">
                    {img ? (
                      <img
                        src={img}
                        alt={t.name}
                        className="h-12 w-12 object-contain transition-transform group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="line-clamp-1 text-sm font-semibold">{t.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {getAiToolCategoryLabel(t.category)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail / Edit dialog */}
      <Dialog
        open={!!openTool}
        onOpenChange={(o) => {
          if (!o) {
            setOpenTool(null);
            setEditMode(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {openTool && !editMode && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const img = openTool.image_url || faviconFor(openTool.url);
                    return img ? (
                      <img src={img} alt="" className="h-10 w-10 rounded-lg object-contain" />
                    ) : (
                      <Sparkles className="h-10 w-10 text-muted-foreground" />
                    );
                  })()}
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{openTool.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {getAiToolCategoryLabel(openTool.category)} · {hostOf(openTool.url)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
              <a
                href={openTool.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm font-medium hover:text-primary"
              >
                <span className="truncate">{openTool.url}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>

              <SectionsView sections={parseSections(openTool.description)} />

              <div className="text-[11px] text-muted-foreground">
                {openTool.created_by
                  ? `Pridal ${profileById.get(openTool.created_by)?.full_name ?? "—"}`
                  : ""}
                {` · ${formatMaterialDate(openTool.created_at) ?? ""}`}
              </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {openTool.created_by === currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(openTool)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Odstrániť
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => startEdit(openTool)}>
                  <Pencil className="mr-1 h-4 w-4" /> Upraviť
                </Button>
              </DialogFooter>
            </>
          )}

          {openTool && editMode && (
            <>
              <DialogHeader>
                <DialogTitle>Upraviť nástroj</DialogTitle>
              </DialogHeader>
              <ToolForm form={form} setForm={setForm} tools={tools} />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                  Zrušiť
                </Button>
                <Button size="sm" onClick={submitUpdate} disabled={update.isPending}>
                  {update.isPending ? "Ukladám…" : "Uložiť"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nový AI nástroj</DialogTitle>
            <DialogDescription>Pridaj odkaz, popis a kategóriu.</DialogDescription>
          </DialogHeader>
          <ToolForm form={form} setForm={setForm} tools={tools} />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              Zrušiť
            </Button>
            <Button size="sm" onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? "Pridávam…" : "Pridať"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolForm({
  form,
  setForm,
  tools,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  tools: AiTool[];
}) {
  const [customCatOpen, setCustomCatOpen] = useState(false);
  const [customCatInput, setCustomCatInput] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Názov</label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="napr. OpusClip"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Odkaz</label>
        <Input
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://www.opus.pro/"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Kategória</label>
        {(() => {
          const usedCustom: string[] = Array.from(
            new Set<string>(
              tools
                .map((t) => String(t.category))
                .filter((c) => !(AI_TOOL_CATEGORIES as readonly string[]).includes(c))
            )
          );
          return (
            <>
              <Select
                value={form.category}
                onValueChange={(v) => {
                  if (v === "__new__") {
                    setCustomCatInput("");
                    setCustomCatOpen(true);
                    return;
                  }
                  setForm({ ...form, category: v as AiToolCategory });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {AI_TOOL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {AI_TOOL_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                  {usedCustom.map((c) => (
                    <SelectItem key={c} value={c}>
                      {getAiToolCategoryLabel(c)}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Pridať vlastnú kategóriu…</SelectItem>
                </SelectContent>
              </Select>
              {customCatOpen && (
                <div className="mt-2 flex gap-2">
                  <Input
                    autoFocus
                    value={customCatInput}
                    onChange={(e) => setCustomCatInput(e.target.value)}
                    placeholder="Názov novej kategórie (napr. Hudba)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const slug = customCatInput
                          .trim()
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, "");
                        if (slug) {
                          setForm({ ...form, category: slug });
                          setCustomCatOpen(false);
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const slug = customCatInput
                        .trim()
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "");
                      if (!slug) {
                        toast.error("Zadaj názov kategórie");
                        return;
                      }
                      setForm({ ...form, category: slug });
                      setCustomCatOpen(false);
                    }}
                  >
                    Použiť
                  </Button>
                </div>
              )}
            </>
          );
        })()}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Štruktúrované sekcie
        </p>
        {SECTION_KEYS.map((k) => (
          <div key={k}>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              {SECTION_LABEL[k]}{" "}
              <span className="font-normal text-muted-foreground">— {SECTION_HINT[k]}</span>
            </label>
            <Textarea
              value={form.sections[k]}
              onChange={(e) =>
                setForm({ ...form, sections: { ...form.sections, [k]: e.target.value } })
              }
              placeholder={SECTION_HINT[k]}
              rows={3}
            />
          </div>
        ))}
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Obrázok (URL, voliteľné)
        </label>
        <Input
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          placeholder="https://…/logo.png"
        />
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
              <span className="mr-2 text-muted-foreground transition group-open:rotate-90 inline-block">›</span>
              {SECTION_LABEL[k]}
            </summary>
            <RichText text={sections[k]} />
          </details>
        );
      })}
    </div>
  );
}

// Render plain text, ale rozozná číslované (1. 2)) a nečíslované (- * • –) zoznamy.
function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  type Block =
    | { type: "ul"; items: string[] }
    | { type: "ol"; items: string[]; start: number }
    | { type: "p"; lines: string[] };
  const blocks: Block[] = [];
  const bulletRe = /^\s*([-*•–])\s+(.*)$/;
  const numRe = /^\s*(\d+)[.)]\s+(.*)$/;
  for (const raw of lines) {
    const b = raw.match(bulletRe);
    const n = raw.match(numRe);
    const last = blocks[blocks.length - 1];
    if (b) {
      if (last && last.type === "ul") last.items.push(b[2]);
      else blocks.push({ type: "ul", items: [b[2]] });
    } else if (n) {
      if (last && last.type === "ol") last.items.push(n[2]);
      else blocks.push({ type: "ol", items: [n[2]], start: parseInt(n[1], 10) || 1 });
    } else {
      if (last && last.type === "p") last.lines.push(raw);
      else blocks.push({ type: "p", lines: [raw] });
    }
  }
  return (
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground/90 break-words">
      {blocks.map((b, i) => {
        if (b.type === "ul")
          return (
            <ul key={i} className="ml-5 list-disc space-y-1">
              {b.items.map((it, j) => (
                <li key={j} className="whitespace-pre-wrap">{it}</li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i} start={b.start} className="ml-5 list-decimal space-y-1">
              {b.items.map((it, j) => (
                <li key={j} className="whitespace-pre-wrap">{it}</li>
              ))}
            </ol>
          );
        const content = b.lines.join("\n").replace(/^\n+|\n+$/g, "");
        if (!content) return null;
        return (
          <p key={i} className="whitespace-pre-wrap">{content}</p>
        );
      })}
    </div>
  );
}