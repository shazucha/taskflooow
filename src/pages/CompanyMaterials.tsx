import { useState, useEffect, useMemo } from "react";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Figma,
  FolderOpen,
  Github,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Link as LinkIcon,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Youtube,
  GripVertical,
  Pencil,
  X,
  BookOpen,
  Wrench,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiToolsLibrary } from "@/components/AiToolsLibrary";
import { GuidesLibrary } from "@/components/GuidesLibrary";
import { WorkToolsLibrary } from "@/components/WorkToolsLibrary";
import { toast } from "sonner";
import {
  useCompanyMaterials,
  useCreateCompanyMaterial,
  useCurrentUserId,
  useDeleteCompanyMaterial,
  useProfiles,
  useReorderCompanyMaterials,
  useUpdateCompanyMaterial,
} from "@/lib/queries";
import { cn, formatMaterialDate } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CompanyMaterial } from "@/lib/types";

// Farebné označenia materiálov + ich význam (zobrazené aj v legende).
const COLOR_OPTIONS = [
  { key: "red", label: "Google Ads", dot: "bg-red-500", ring: "ring-red-500" },
  { key: "blue", label: "Facebook", dot: "bg-blue-500", ring: "ring-blue-500" },
  { key: "green", label: "Prompty", dot: "bg-green-500", ring: "ring-green-500" },
  { key: "orange", label: "Webstránky", dot: "bg-orange-500", ring: "ring-orange-500" },
] as const;
type ColorKey = (typeof COLOR_OPTIONS)[number]["key"];

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "h-5 w-5 rounded-full border border-dashed border-muted-foreground/50 transition",
          !value && "ring-2 ring-offset-1 ring-foreground/40",
        )}
        title="Bez označenia"
        aria-label="Bez označenia"
      />
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={cn(
            "h-5 w-5 rounded-full transition",
            c.dot,
            value === c.key && "ring-2 ring-offset-1",
            value === c.key && c.ring,
          )}
          title={c.label}
          aria-label={c.label}
        />
      ))}
    </div>
  );
}

function slugifySubcategory(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function prettySubcategory(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SubcategoryPicker({
  value,
  onChange,
  existing,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  existing: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const opts = Array.from(new Set([...(value ? [value] : []), ...existing])).filter(Boolean);
  return (
    <div className="space-y-2">
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => {
          if (v === "__new__") {
            setInput("");
            setAdding(true);
            return;
          }
          if (v === "__none__") {
            onChange(null);
            return;
          }
          onChange(v);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Bez podkategórie" />
        </SelectTrigger>
        <SelectContent className="max-h-[260px]">
          <SelectItem value="__none__">Bez podkategórie</SelectItem>
          {opts.map((s) => (
            <SelectItem key={s} value={s}>
              {prettySubcategory(s)}
            </SelectItem>
          ))}
          <SelectItem value="__new__">+ Pridať vlastnú podkategóriu…</SelectItem>
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Názov podkategórie (napr. Newsletter)"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const slug = slugifySubcategory(input);
                if (slug) {
                  onChange(slug);
                  setAdding(false);
                }
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const slug = slugifySubcategory(input);
              if (!slug) {
                toast.error("Zadaj názov podkategórie");
                return;
              }
              onChange(slug);
              setAdding(false);
            }}
          >
            Použiť
          </Button>
        </div>
      )}
    </div>
  );
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

type MaterialKind =
  | "drive"
  | "docs"
  | "figma"
  | "github"
  | "youtube"
  | "notion"
  | "dropbox"
  | "image"
  | "pdf"
  | "mail"
  | "web";

function detectKind(url: string): MaterialKind {
  const h = hostOf(url).toLowerCase();
  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
  })();

  if (h.includes("drive.google") || h.includes("docs.google")) {
    if (h.includes("docs.google") || path.includes("/document/") || path.includes("/spreadsheets/") || path.includes("/presentation/"))
      return "docs";
    return "drive";
  }
  if (h.includes("figma.com")) return "figma";
  if (h.includes("github.com") || h.includes("gitlab.com") || h.includes("bitbucket.org")) return "github";
  if (h.includes("youtube.com") || h.includes("youtu.be") || h.includes("vimeo.com")) return "youtube";
  if (h.includes("notion.so") || h.includes("notion.site")) return "notion";
  if (h.includes("dropbox.com")) return "dropbox";
  if (path.match(/\.(png|jpe?g|gif|webp|svg|avif|heic)$/)) return "image";
  if (path.endsWith(".pdf")) return "pdf";
  if (url.startsWith("mailto:")) return "mail";
  return "web";
}

type MaterialGroup = "web" | "social" | "docs" | "video";

const VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
];

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "reddit.com",
  "discord.com",
  "discord.gg",
  "t.me",
  "telegram.me",
  "telegram.org",
  "whatsapp.com",
];

function detectGroup(url: string): MaterialGroup {
  const h = hostOf(url).toLowerCase();
  if (VIDEO_HOSTS.some((s) => h === s || h.endsWith(`.${s}`) || h.includes(s))) {
    return "video";
  }
  if (SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`) || h.includes(s))) {
    return "social";
  }
  const kind = detectKind(url);
  if (["docs", "drive", "notion", "dropbox", "pdf", "image", "figma"].includes(kind)) {
    return "docs";
  }
  return "web";
}

// Náhľad (thumbnail) pre video odkazy – YouTube / Vimeo.
function getVideoThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (h === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
    }
    if (h.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://img.youtube.com/vi/${v}/mqdefault.jpg`;
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "shorts" || p === "embed" || p === "live");
      if (i >= 0 && parts[i + 1]) return `https://img.youtube.com/vi/${parts[i + 1]}/mqdefault.jpg`;
    }
    if (h.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
      if (id) return `https://vumbnail.com/${id}.jpg`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const GROUP_LABEL: Record<MaterialGroup | "all", string> = {
  all: "Všetko",
  web: "Webstránky",
  social: "Sociálne siete",
  docs: "Dokumenty",
  video: "Video návody",
};

const KIND_META: Record<MaterialKind, { icon: typeof LinkIcon; label: string; cls: string }> = {
  drive: { icon: HardDrive, label: "Drive", cls: "text-emerald-600" },
  docs: { icon: FileText, label: "Docs", cls: "text-blue-600" },
  figma: { icon: Figma, label: "Figma", cls: "text-fuchsia-600" },
  github: { icon: Github, label: "Git", cls: "text-foreground" },
  youtube: { icon: Youtube, label: "Video", cls: "text-red-600" },
  notion: { icon: FileText, label: "Notion", cls: "text-foreground" },
  dropbox: { icon: HardDrive, label: "Dropbox", cls: "text-sky-600" },
  image: { icon: ImageIcon, label: "Obrázok", cls: "text-amber-600" },
  pdf: { icon: FileText, label: "PDF", cls: "text-red-600" },
  mail: { icon: Mail, label: "Email", cls: "text-muted-foreground" },
  web: { icon: Globe, label: "Web", cls: "text-muted-foreground" },
};

export default function CompanyMaterials() {
  const currentUserId = useCurrentUserId();
  const { data: materials = [] } = useCompanyMaterials();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateCompanyMaterial();
  const remove = useDeleteCompanyMaterial();
  const reorder = useReorderCompanyMaterials();
  const update = useUpdateCompanyMaterial();

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<MaterialGroup | "all">("all");
  const [subFilter, setSubFilter] = useState<string | "all">("all");
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Synchronizujeme lokálne poradie s dátami zo servera.
  useEffect(() => {
    setOrderedIds(materials.map((m) => m.id));
  }, [materials]);

  const orderedMaterials = useMemo(() => {
    if (!orderedIds) return materials;
    const byId = new Map(materials.map((m) => [m.id, m] as const));
    const list: CompanyMaterial[] = [];
    for (const id of orderedIds) {
      const m = byId.get(id);
      if (m) list.push(m);
    }
    // pridáme nové, ktoré ešte nie sú v orderedIds
    for (const m of materials) if (!orderedIds.includes(m.id)) list.push(m);
    return list;
  }, [materials, orderedIds]);

  const visibleMaterials = useMemo(
    () =>
      orderedMaterials.filter((m) => {
        if (filter !== "all" && detectGroup(m.url) !== filter) return false;
        if (subFilter !== "all" && (m.subcategory ?? "") !== subFilter) return false;
        return true;
      }),
    [orderedMaterials, filter, subFilter],
  );

  // Existujúce podkategórie v rámci zvoleného hlavného filtra (na chip-y a do selectu).
  const subcategoriesInScope = useMemo(() => {
    const set = new Set<string>();
    for (const m of orderedMaterials) {
      if (filter !== "all" && detectGroup(m.url) !== filter) continue;
      if (m.subcategory) set.add(m.subcategory);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orderedMaterials, filter]);

  // Resetni filter podkategórie, ak v aktuálnom scope neexistuje.
  useEffect(() => {
    if (subFilter !== "all" && !subcategoriesInScope.includes(subFilter)) {
      setSubFilter("all");
    }
  }, [subcategoriesInScope, subFilter]);

  // Všetky existujúce podkategórie naprieč materiálmi (do formuláru pri pridávaní/úprave).
  const allSubcategories = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) if (m.subcategory) set.add(m.subcategory);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const PREVIEW_LIMIT = 4;
  const canExpand = visibleMaterials.length > PREVIEW_LIMIT;
  const displayedMaterials = showAll ? visibleMaterials : visibleMaterials.slice(0, PREVIEW_LIMIT);

  // Premenovanie podkategórie – hromadná aktualizácia všetkých materiálov.
  const handleRenameSubcategory = async (old: string) => {
    const next = window.prompt("Premenovať podkategóriu:", prettySubcategory(old));
    if (next === null) return;
    const slug = slugifySubcategory(next);
    if (!slug) {
      toast.error("Zadaj platný názov podkategórie");
      return;
    }
    if (slug === old) return;
    const targets = materials.filter((m) => m.subcategory === old);
    try {
      await Promise.all(
        targets.map((m) => update.mutateAsync({ id: m.id, patch: { subcategory: slug } })),
      );
      if (subFilter === old) setSubFilter(slug);
      toast.success("Podkategória premenovaná");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa premenovať");
    }
  };

  // Odstránenie podkategórie – materiálom sa iba zruší priradenie (nezmažú sa).
  const handleDeleteSubcategory = async (old: string) => {
    if (
      !confirm(
        `Odstrániť podkategóriu „${prettySubcategory(old)}"? Materiály ostanú, len sa im zruší priradenie.`,
      )
    )
      return;
    const targets = materials.filter((m) => m.subcategory === old);
    try {
      await Promise.all(
        targets.map((m) => update.mutateAsync({ id: m.id, patch: { subcategory: null } })),
      );
      if (subFilter === old) setSubFilter("all");
      toast.success("Podkategória odstránená");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa odstrániť");
    }
  };

  const counts = useMemo(() => {
    const c: Record<MaterialGroup, number> = { web: 0, social: 0, docs: 0, video: 0 };
    for (const m of orderedMaterials) c[detectGroup(m.url)]++;
    return c;
  }, [orderedMaterials]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Reorder iba v rámci aktuálne viditeľného (filtrovaného) zoznamu
    const visibleIds = visibleMaterials.map((m) => m.id);
    const oldIdx = visibleIds.indexOf(String(active.id));
    const newIdx = visibleIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const newVisible = arrayMove(visibleIds, oldIdx, newIdx);
    // zlúčime späť do celého poradia
    const full = (orderedIds ?? materials.map((m) => m.id)).slice();
    let vi = 0;
    for (let i = 0; i < full.length; i++) {
      if (visibleIds.includes(full[i])) {
        full[i] = newVisible[vi++];
      }
    }
    setOrderedIds(full);
    const updates = full.map((id, idx) => ({ id, position: idx + 1 }));
    reorder.mutate(updates);
  };

  const submit = async () => {
    if (!currentUserId) return;
    const normalized = normalizeUrl(url);
    if (!normalized) {
      toast.error("Zadaj platný odkaz");
      return;
    }
    try {
      await create.mutateAsync({
        url: normalized,
        label: label.trim() || null,
        created_by: currentUserId,
        color,
        subcategory,
      });
      setUrl("");
      setLabel("");
      setColor(null);
      setSubcategory(null);
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="page-container">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Firemné materiály</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zdieľané odkazy pre celý tím – Google Disk, dokumenty, šablóny.
          </p>
        </div>
      </header>

      <Tabs defaultValue="materials" className="mt-4">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:inline-flex sm:h-10 sm:w-auto sm:grid-cols-none">
          <TabsTrigger value="materials" className="w-full justify-start gap-1.5 whitespace-nowrap sm:w-auto sm:justify-center">
            <FolderOpen className="h-4 w-4" /> Materiály
          </TabsTrigger>
          <TabsTrigger value="ai" className="w-full justify-start gap-1.5 whitespace-nowrap sm:w-auto sm:justify-center">
            <Sparkles className="h-4 w-4" /> AI knižnica nástrojov
          </TabsTrigger>
          <TabsTrigger value="guides" className="w-full justify-start gap-1.5 whitespace-nowrap sm:w-auto sm:justify-center">
            <BookOpen className="h-4 w-4" /> Návody
          </TabsTrigger>
          <TabsTrigger value="worktools" className="w-full justify-start gap-1.5 whitespace-nowrap sm:w-auto sm:justify-center">
            <Wrench className="h-4 w-4" /> Pracovné nástroje
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials">
          <div className="mt-3 flex items-center justify-end">
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="mr-1 h-4 w-4" /> Pridať materiál
              </Button>
            )}
          </div>
          {adding && (
        <div className="mt-4 space-y-2 rounded-2xl border border-border bg-card p-3">
          <Input
            value={url}
            placeholder="https://drive.google.com/…"
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <Input
            value={label}
            placeholder="Názov (voliteľné)"
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Farba:</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
                setColor(null);
                setSubcategory(null);
              }}
            >
              Zrušiť
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={create.isPending || !url.trim()}
              className={cn(create.isPending && "opacity-70")}
            >
              {create.isPending ? "Pridávam…" : "Pridať"}
            </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Podkategória:</span>
            <div className="min-w-[200px] flex-1">
              <SubcategoryPicker
                value={subcategory}
                onChange={setSubcategory}
                existing={allSubcategories}
              />
            </div>
          </div>
        </div>
          )}

          <div className="mt-5">
        {/* Legenda farebných označení */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-muted px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Legenda:</span>
          {COLOR_OPTIONS.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
              {c.label}
            </span>
          ))}
        </div>
        {materials.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(["all", "web", "social", "docs", "video"] as const).map((g) => {
              const active = filter === g;
              const count = g === "all" ? orderedMaterials.length : counts[g];
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFilter(g)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-muted text-muted-foreground hover:bg-surface-muted/70",
                  )}
                >
                  {GROUP_LABEL[g]}
                  <span className={cn("ml-1.5 text-[10px] font-bold opacity-70")}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {subcategoriesInScope.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Podkategórie:
            </span>
            <button
              type="button"
              onClick={() => setSubFilter("all")}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                subFilter === "all"
                  ? "bg-foreground text-background"
                  : "bg-surface-muted text-muted-foreground hover:bg-surface-muted/70",
              )}
            >
              Všetky
            </button>
            {subcategoriesInScope.map((s) => {
              const active = subFilter === s;
              const count = orderedMaterials.filter(
                (m) =>
                  (filter === "all" || detectGroup(m.url) === filter) && m.subcategory === s,
              ).length;
              return (
                <span
                  key={s}
                  className={cn(
                    "group inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "bg-surface-muted text-muted-foreground hover:bg-surface-muted/70",
                  )}
                >
                  <button type="button" onClick={() => setSubFilter(s)} className="inline-flex items-center">
                    {prettySubcategory(s)}
                    <span className="ml-1 text-[10px] font-bold opacity-70">{count}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRenameSubcategory(s)}
                    className="ml-1 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-background/20"
                    title="Premenovať podkategóriu"
                    aria-label="Premenovať podkategóriu"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubcategory(s)}
                    className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-background/20"
                    title="Odstrániť podkategóriu"
                    aria-label="Odstrániť podkategóriu"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {materials.length === 0 && !adding ? (
          <div className="rounded-2xl bg-surface-muted p-8 text-center">
            <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Zatiaľ žiadne firemné materiály. Pridaj prvý odkaz.
            </p>
          </div>
        ) : visibleMaterials.length === 0 ? (
          <div className="rounded-2xl bg-surface-muted p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Pre vybranú kategóriu zatiaľ nemáš žiadne materiály.
            </p>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayedMaterials.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {displayedMaterials.map((m) => (
                    <SortableMaterialRow
                      key={m.id}
                      material={m}
                      canDelete={m.created_by === currentUserId}
                      authorName={m.created_by ? profileById.get(m.created_by)?.full_name ?? null : null}
                      onDelete={() => {
                        if (!confirm("Naozaj odstrániť tento materiál?")) return;
                        remove.mutate(m.id);
                      }}
                      onSave={async (patch) => {
                        const normalized = normalizeUrl(patch.url);
                        if (!normalized) {
                          toast.error("Zadaj platný odkaz");
                          throw new Error("invalid url");
                        }
                        await update.mutateAsync({
                          id: m.id,
                          patch: {
                            url: normalized,
                            label: patch.label.trim() || null,
                            color: patch.color,
                            subcategory: patch.subcategory,
                          },
                        });
                      }}
                      existingSubcategories={allSubcategories}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {canExpand && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted"
              >
                {showAll ? "Zobraziť menej" : `Zobraziť viac (${visibleMaterials.length - PREVIEW_LIMIT})`}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
              </button>
            )}
          </>
        )}
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <AiToolsLibrary />
        </TabsContent>

        <TabsContent value="guides">
          <GuidesLibrary />
        </TabsContent>

        <TabsContent value="worktools">
          <WorkToolsLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SortableMaterialRow({
  material,
  canDelete,
  authorName,
  onDelete,
  onSave,
  existingSubcategories,
}: {
  material: CompanyMaterial;
  canDelete: boolean;
  authorName: string | null;
  onDelete: () => void;
  onSave: (patch: {
    url: string;
    label: string;
    color: string | null;
    subcategory: string | null;
  }) => Promise<void>;
  existingSubcategories: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: material.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const kind = detectKind(material.url);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const videoThumb = detectGroup(material.url) === "video" ? getVideoThumbnail(material.url) : null;
  const dateText = formatMaterialDate(material.created_at);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(material.url);
  const [editLabel, setEditLabel] = useState(material.label ?? "");
  const [editColor, setEditColor] = useState<string | null>(material.color ?? null);
  const [editSubcategory, setEditSubcategory] = useState<string | null>(material.subcategory ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEditUrl(material.url);
      setEditLabel(material.label ?? "");
      setEditColor(material.color ?? null);
      setEditSubcategory(material.subcategory ?? null);
    }
  }, [material.url, material.label, material.color, material.subcategory, editing]);

  if (editing) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className="space-y-2 rounded-xl border border-border bg-card p-3"
      >
        <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} autoFocus />
        <Input
          value={editLabel}
          placeholder="Názov (voliteľné)"
          onChange={(e) => setEditLabel(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Farba:</span>
            <ColorPicker value={editColor} onChange={setEditColor} />
          </div>
          <div className="flex gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Zrušiť
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || !editUrl.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  url: editUrl,
                  label: editLabel,
                  color: editColor,
                  subcategory: editSubcategory,
                });
                setEditing(false);
              } catch {
                // toast riešený v onSave
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Ukladám…" : "Uložiť"}
          </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">Podkategória:</span>
          <div className="min-w-[200px] flex-1">
            <SubcategoryPicker
              value={editSubcategory}
              onChange={setEditSubcategory}
              existing={existingSubcategories}
            />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <button
        type="button"
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Presunúť"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {material.color && (
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            COLOR_OPTIONS.find((c) => c.key === material.color)?.dot ?? "bg-muted",
          )}
          title={COLOR_OPTIONS.find((c) => c.key === material.color)?.label ?? ""}
        />
      )}
      {videoThumb ? (
        <a
          href={material.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group relative flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted"
          title={meta.label}
          aria-label="Otvoriť video v novom okne"
        >
          <img
            src={videoThumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:opacity-80"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <Icon className="absolute h-4 w-4 text-white drop-shadow" />
        </a>
      ) : (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted",
            meta.cls,
          )}
          title={meta.label}
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
      <a
        href={material.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-1 min-w-0 flex-col text-sm hover:text-primary"
      >
        <span className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{material.label || hostOf(material.url)}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          {material.subcategory && (
            <span className="ml-1 shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {prettySubcategory(material.subcategory)}
            </span>
          )}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {material.label ? `${hostOf(material.url)}` : meta.label}
          {authorName ? ` · pridal ${authorName}` : ""}
          {dateText ? ` · ${dateText}` : ""}
        </span>
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Upraviť"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Odstrániť"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}