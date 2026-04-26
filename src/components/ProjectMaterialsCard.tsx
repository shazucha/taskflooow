import { useState } from "react";
import {
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useCreateProjectMaterial,
  useCurrentUserId,
  useDeleteProjectMaterial,
  useProjectMaterials,
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

export function ProjectMaterialsCard({ projectId }: { projectId: string }) {
  const currentUserId = useCurrentUserId();
  const { data: materials = [] } = useProjectMaterials(projectId);
  const create = useCreateProjectMaterial();
  const remove = useDeleteProjectMaterial(projectId);

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
        project_id: projectId,
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

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-4 w-4" />
          </span>
          Materiály
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Pridať odkaz
          </button>
        )}
      </div>

      {materials.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          Žiadne materiály. Pridaj odkaz na Google Drive, Figma, GitHub a podobne.
        </p>
      )}

      {materials.length > 0 && (
        <ul className="space-y-1.5">
          {materials.map((m) => {
            const kind = detectKind(m.url);
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const canDelete = m.created_by === currentUserId;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5"
              >
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
                  className="flex flex-1 min-w-0 items-center gap-1.5 text-sm hover:text-primary"
                >
                  <span className="truncate">{m.label || hostOf(m.url)}</span>
                  {m.label && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      · {hostOf(m.url)}
                    </span>
                  )}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
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
    </div>
  );
}