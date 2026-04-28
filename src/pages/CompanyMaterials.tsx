import { useState } from "react";
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
  Trash2,
  Youtube,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useCompanyMaterials,
  useCreateCompanyMaterial,
  useCurrentUserId,
  useDeleteCompanyMaterial,
  useProfiles,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

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

export default function CompanyMaterials() {
  const currentUserId = useCurrentUserId();
  const { data: materials = [] } = useCompanyMaterials();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateCompanyMaterial();
  const remove = useDeleteCompanyMaterial();

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

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
      });
      setUrl("");
      setLabel("");
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
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Pridať
          </Button>
        )}
      </header>

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
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
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

      <div className="mt-5">
        {materials.length === 0 && !adding ? (
          <div className="rounded-2xl bg-surface-muted p-8 text-center">
            <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Zatiaľ žiadne firemné materiály. Pridaj prvý odkaz.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => {
              const kind = detectKind(m.url);
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const canDelete = m.created_by === currentUserId;
              const author = m.created_by ? profileById.get(m.created_by) : null;
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
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
                    href={m.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex flex-1 min-w-0 flex-col text-sm hover:text-primary"
                  >
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      <span className="truncate">{m.label || hostOf(m.url)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {m.label ? `${hostOf(m.url)}` : meta.label}
                      {author?.full_name ? ` · pridal ${author.full_name}` : ""}
                    </span>
                  </a>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm("Naozaj odstrániť tento materiál?")) return;
                        remove.mutate(m.id);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Odstrániť"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}