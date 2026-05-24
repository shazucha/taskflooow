import { useState, useEffect, useMemo } from "react";
import {
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AiToolsLibrary } from "@/components/AiToolsLibrary";
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

type MaterialGroup = "web" | "social" | "docs";

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
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
  if (SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`) || h.includes(s))) {
    return "social";
  }
  const kind = detectKind(url);
  if (["docs", "drive", "notion", "dropbox", "pdf", "image", "figma"].includes(kind)) {
    return "docs";
  }
  return "web";
}

const GROUP_LABEL: Record<MaterialGroup | "all", string> = {
  all: "Všetko",
  web: "Webstránky",
  social: "Sociálne siete",
  docs: "Dokumenty",
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
  const [filter, setFilter] = useState<MaterialGroup | "all">("all");
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);

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
    () => (filter === "all" ? orderedMaterials : orderedMaterials.filter((m) => detectGroup(m.url) === filter)),
    [orderedMaterials, filter],
  );

  const counts = useMemo(() => {
    const c: Record<MaterialGroup, number> = { web: 0, social: 0, docs: 0 };
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
      });
      setUrl("");
      setLabel("");
      setColor(null);
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
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="materials" className="gap-1.5">
            <FolderOpen className="h-4 w-4" /> Materiály
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-4 w-4" /> AI knižnica nástrojov
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
            {(["all", "web", "social", "docs"] as const).map((g) => {
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleMaterials.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {visibleMaterials.map((m) => (
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
                        },
                      });
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <AiToolsLibrary />
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
}: {
  material: CompanyMaterial;
  canDelete: boolean;
  authorName: string | null;
  onDelete: () => void;
  onSave: (patch: { url: string; label: string }) => Promise<void>;
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
  const dateText = formatMaterialDate(material.created_at);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(material.url);
  const [editLabel, setEditLabel] = useState(material.label ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEditUrl(material.url);
      setEditLabel(material.label ?? "");
    }
  }, [material.url, material.label, editing]);

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
        <div className="flex justify-end gap-1.5">
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
                await onSave({ url: editUrl, label: editLabel });
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
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted",
          meta.cls,
        )}
        title={meta.label}
      >
        <Icon className="h-4 w-4" />
      </span>
      <a
        href={material.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-1 min-w-0 flex-col text-sm hover:text-primary"
      >
        <span className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{material.label || hostOf(material.url)}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
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