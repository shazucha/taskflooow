import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Bell,
  BellOff,
  ExternalLink,
  FileText,
  Figma,
  Github,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Link as LinkIcon,
  Mail,
  Plus,
  Trash2,
  Youtube,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useCreateProjectMaterial,
  useCurrentUserId,
  useDeleteProjectMaterial,
  useMarkMaterialViewed,
  useProjectMaterials,
  useReorderProjectMaterials,
  useUpdateProjectMaterial,
  useViewedMaterialIds,
} from "@/lib/queries";
import { cn, formatMaterialDate, parseMaterialTimestamp } from "@/lib/utils";
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
import type { ProjectMaterial } from "@/lib/types";

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

// Farebné označenia (zhodné s firemnými materiálmi, aby bol jednotný význam).
const COLOR_OPTIONS = [
  { key: "red", label: "Google Ads", dot: "bg-red-500", ring: "ring-red-500" },
  { key: "blue", label: "Facebook", dot: "bg-blue-500", ring: "ring-blue-500" },
  { key: "green", label: "Prompty", dot: "bg-green-500", ring: "ring-green-500" },
  { key: "orange", label: "Webstránky", dot: "bg-orange-500", ring: "ring-orange-500" },
] as const;

function MaterialColorPicker({
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
          "h-4 w-4 rounded-full border border-dashed border-muted-foreground/50 transition",
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
            "h-4 w-4 rounded-full transition",
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

/** Pulzujúca červená bodka (tlkot srdca) pre nevidené novinky. */
function NoviceBadge({ title }: { title: string }) {
  return (
    <span
      className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center"
      title={title}
      aria-label={title}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 animate-heartbeat rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
    </span>
  );
}

/** Riadok materiálu s podporou drag & drop (cez @dnd-kit). */
function SortableMaterialRow({
  material,
  dndEnabled,
  showNovice,
  canDelete,
  onOpen,
  onToggleNovice,
  onDelete,
}: {
  material: ProjectMaterial;
  dndEnabled: boolean;
  showNovice: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onToggleNovice: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: material.id, disabled: !dndEnabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const kind = detectKind(material.url);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const dateText = formatMaterialDate(material.created_at);
  const colorMeta = material.color
    ? COLOR_OPTIONS.find((c) => c.key === material.color)
    : null;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 transition",
        showNovice && "ring-1 ring-red-500/40 bg-red-500/5",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      {dndEnabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Presunúť"
          title="Presunúť"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      {showNovice && <NoviceBadge title="Novinka – ešte si tento materiál neotvoril" />}
      {colorMeta && (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", colorMeta.dot)}
          title={colorMeta.label}
        />
      )}
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background",
          meta.cls,
        )}
        title={meta.label}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <a
        href={material.url}
        target="_blank"
        rel="noreferrer noopener"
        onClick={onOpen}
        className="flex flex-1 min-w-0 flex-col text-sm hover:text-primary"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate">{material.label || hostOf(material.url)}</span>
          {material.label && (
            <span className="truncate text-[11px] text-muted-foreground">
              · {hostOf(material.url)}
            </span>
          )}
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
        </span>
        {dateText && (
          <span className="text-[10px] text-muted-foreground">{dateText}</span>
        )}
      </a>
      <button
        type="button"
        onClick={onToggleNovice}
        className={cn(
          "text-muted-foreground hover:text-foreground",
          material.is_highlighted && "text-red-500 hover:text-red-600",
        )}
        aria-label={material.is_highlighted ? "Zrušiť označenie novinky" : "Označiť ako novinku"}
        title={material.is_highlighted ? "Zrušiť novinku" : "Označiť ako novinku"}
      >
        {material.is_highlighted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Odstrániť"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

export function ProjectMaterialsCard({ projectId }: { projectId: string }) {
  const currentUserId = useCurrentUserId();
  const { data: materials = [] } = useProjectMaterials(projectId);
  const create = useCreateProjectMaterial();
  const remove = useDeleteProjectMaterial(projectId);
  const updateMaterial = useUpdateProjectMaterial(projectId);
  const markViewed = useMarkMaterialViewed();
  const viewedIds = useViewedMaterialIds();

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [isNovice, setIsNovice] = useState(false);
  const PREVIEW_COUNT = 3;
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"manual" | "newest" | "oldest" | "az" | "za">("manual");
  const reorder = useReorderProjectMaterials(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedMaterials = useMemo(() => {
    const arr = [...materials];
    switch (sortBy) {
      case "manual":
        return arr.sort((a, b) => {
          const pa = a.position ?? Number.MAX_SAFE_INTEGER;
          const pb = b.position ?? Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return (parseMaterialTimestamp(a.created_at) ?? 0) - (parseMaterialTimestamp(b.created_at) ?? 0);
        });
      case "newest":
        return arr.sort((a, b) => (parseMaterialTimestamp(b.created_at) ?? 0) - (parseMaterialTimestamp(a.created_at) ?? 0));
      case "oldest":
        return arr.sort((a, b) => (parseMaterialTimestamp(a.created_at) ?? 0) - (parseMaterialTimestamp(b.created_at) ?? 0));
      case "az":
        return arr.sort((a, b) => (a.label || hostOf(a.url)).localeCompare(b.label || hostOf(b.url), "sk"));
      case "za":
        return arr.sort((a, b) => (b.label || hostOf(b.url)).localeCompare(a.label || hostOf(b.url), "sk"));
      default:
        return arr;
    }
  }, [materials, sortBy]);

  const hasMore = sortedMaterials.length > PREVIEW_COUNT;
  const visible = expanded || !hasMore ? sortedMaterials : sortedMaterials.slice(0, PREVIEW_COUNT);
  const dndEnabled = sortBy === "manual";

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fullIds = sortedMaterials.map((m) => m.id);
    const oldIdx = fullIds.indexOf(String(active.id));
    const newIdx = fullIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(fullIds, oldIdx, newIdx);
    const updates = reordered.map((id, idx) => ({ id, position: idx + 1 }));
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
        project_id: projectId,
        url: normalized,
        label: label.trim() || null,
        created_by: currentUserId,
        color,
        is_highlighted: isNovice,
      });
      setUrl("");
      setLabel("");
      setColor(null);
      setIsNovice(false);
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary"
          aria-expanded={expanded}
          title={expanded ? "Zbaliť" : "Rozbaliť"}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </span>
          Materiály
          {materials.length > 0 && (
            <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {materials.length}
            </span>
          )}
          {materials.length > 0 && (
            expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {!adding && (
          <div className="flex items-center gap-2">
            {materials.length > 1 && (
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none rounded-md bg-surface-muted py-1 pl-2 pr-6 text-[11px] font-medium text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="newest">Najnovšie</option>
                  <option value="oldest">Najstaršie</option>
                  <option value="az">A – Z</option>
                  <option value="za">Z – A</option>
                  <option value="manual">Vlastné poradie</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Pridať odkaz
            </button>
          </div>
        )}
      </div>

      {materials.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          Žiadne materiály. Pridaj odkaz na Google Drive, Figma, GitHub a podobne.
        </p>
      )}

      {materials.length > 0 && (
        <ul className="space-y-1.5">
          {visible.map((m) => {
            const kind = detectKind(m.url);
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const canDelete = m.created_by === currentUserId;
            const dateText = formatMaterialDate(m.created_at);
            const showNovice = m.is_highlighted && !viewedIds.has(m.id);
            const colorMeta = m.color
              ? COLOR_OPTIONS.find((c) => c.key === m.color)
              : null;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 transition",
                  showNovice && "ring-1 ring-red-500/40 bg-red-500/5",
                )}
              >
                {showNovice && <NoviceBadge title="Novinka – ešte si tento materiál neotvoril" />}
                {colorMeta && (
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", colorMeta.dot)}
                    title={colorMeta.label}
                  />
                )}
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background",
                    meta.cls,
                  )}
                  title={meta.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => {
                    if (currentUserId && !viewedIds.has(m.id)) {
                      markViewed.mutate({ material_id: m.id, material_type: "project" });
                    }
                  }}
                  className="flex flex-1 min-w-0 flex-col text-sm hover:text-primary"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="truncate">{m.label || hostOf(m.url)}</span>
                    {m.label && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        · {hostOf(m.url)}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </span>
                  {dateText && (
                    <span className="text-[10px] text-muted-foreground">
                      {dateText}
                    </span>
                  )}
                </a>
                <button
                    type="button"
                    onClick={() =>
                      updateMaterial.mutate({
                        id: m.id,
                        patch: { is_highlighted: !m.is_highlighted },
                      })
                    }
                    className={cn(
                      "text-muted-foreground hover:text-foreground",
                      m.is_highlighted && "text-red-500 hover:text-red-600",
                    )}
                    aria-label={m.is_highlighted ? "Zrušiť označenie novinky" : "Označiť ako novinku"}
                    title={m.is_highlighted ? "Zrušiť novinku" : "Označiť ako novinku"}
                  >
                    {m.is_highlighted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(m.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Odstrániť"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Zbaliť
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Zobraziť všetky ({materials.length})
            </>
          )}
        </button>
      )}

      {adding && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-background p-2">
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
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Farba:</span>
              <MaterialColorPicker value={color} onChange={setColor} />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={isNovice}
                onChange={(e) => setIsNovice(e.target.checked)}
                className="h-3.5 w-3.5 accent-red-500"
              />
              Označiť ako novinku
            </label>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
                setColor(null);
                setIsNovice(false);
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
      )}
    </div>
  );
}
