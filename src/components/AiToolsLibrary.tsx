import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
  type AiTool,
  type AiToolCategory,
} from "@/lib/types";
import { cn, formatMaterialDate } from "@/lib/utils";

type FilterKey = AiToolCategory | "all";

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
  description: string;
  category: AiToolCategory;
  image_url: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  url: "",
  description: "",
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

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filters: FilterKey[] = useMemo(() => {
    const used = new Set<AiToolCategory>();
    for (const t of tools) used.add(t.category);
    return ["all", ...AI_TOOL_CATEGORIES.filter((c) => used.has(c) || c === "ine")];
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
        description: form.description.trim() || null,
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
          description: form.description.trim() || null,
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
      description: t.description ?? "",
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
      <div className="mt-3 flex gap-1.5 overflow-x-auto rounded-xl bg-surface-muted p-1">
        {filters.map((f) => {
          const label = f === "all" ? "Všetko" : AI_TOOL_CATEGORY_LABEL[f];
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
                      {AI_TOOL_CATEGORY_LABEL[t.category]}
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
        <DialogContent className="max-w-lg">
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
                      {AI_TOOL_CATEGORY_LABEL[openTool.category]} · {hostOf(openTool.url)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <a
                href={openTool.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm font-medium hover:text-primary"
              >
                <span className="truncate">{openTool.url}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>

              {openTool.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">
                  {openTool.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Žiadny popis. Klikni na „Upraviť" a doplň ho.
                </p>
              )}

              <div className="text-[11px] text-muted-foreground">
                {openTool.created_by
                  ? `Pridal ${profileById.get(openTool.created_by)?.full_name ?? "—"}`
                  : ""}
                {` · ${formatMaterialDate(openTool.created_at) ?? ""}`}
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
              <ToolForm form={form} setForm={setForm} />
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nový AI nástroj</DialogTitle>
            <DialogDescription>Pridaj odkaz, popis a kategóriu.</DialogDescription>
          </DialogHeader>
          <ToolForm form={form} setForm={setForm} />
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
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
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
        <Select
          value={form.category}
          onValueChange={(v) => setForm({ ...form, category: v as AiToolCategory })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_TOOL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {AI_TOOL_CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Popis / poznámky
        </label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Na čo nástroj slúži, tipy, prihlasovacie info…"
          rows={5}
        />
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