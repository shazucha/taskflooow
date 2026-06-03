import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Wrench,
  Youtube,
  X,
} from "lucide-react";
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
  useCurrentUserId,
  useProfiles,
  useWorkTools,
  useCreateWorkTool,
  useUpdateWorkTool,
  useDeleteWorkTool,
  useReorderWorkTools,
} from "@/lib/queries";
import type { WorkTool, WorkToolGuide } from "@/lib/types";
import { cn, formatMaterialDate } from "@/lib/utils";
import { ImageUploadField } from "@/components/ImageUploadField";

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
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function prettyCategory(slug: string): string {
  if (slug === "ine") return "Iné";
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type FormState = {
  name: string;
  url: string;
  email: string;
  password: string;
  description: string;
  category: string;
  image_url: string;
  guides: WorkToolGuide[];
};

const EMPTY_FORM: FormState = {
  name: "",
  url: "",
  email: "",
  password: "",
  description: "",
  category: "ine",
  image_url: "",
  guides: [],
};

export function WorkToolsLibrary() {
  const currentUserId = useCurrentUserId();
  const { data: tools = [], isLoading } = useWorkTools();
  const { data: profiles = [] } = useProfiles();
  const create = useCreateWorkTool();
  const update = useUpdateWorkTool();
  const remove = useDeleteWorkTool();
  const reorder = useReorderWorkTools();

  const [filter, setFilter] = useState<string>("all");
  const [openTool, setOpenTool] = useState<WorkTool | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dragId, setDragId] = useState<string | null>(null);
  const [extraCats, setExtraCats] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("worktools:extraCategories");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("worktools:extraCategories", JSON.stringify(extraCats));
    } catch {/* */}
  }, [extraCats]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const categories = useMemo(() => {
    const s = new Set<string>(["ine"]);
    for (const t of tools) s.add(t.category);
    for (const c of extraCats) s.add(c);
    return Array.from(s);
  }, [tools, extraCats]);

  const filters = useMemo(() => ["all", ...categories], [categories]);
  const countByFilter = (f: string) =>
    f === "all" ? tools.length : tools.filter((t) => t.category === f).length;

  const addCategoryFromFilter = () => {
    const slug = slugify(newCatInput);
    if (!slug) {
      toast.error("Zadaj názov kategórie");
      return;
    }
    setExtraCats((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setFilter(slug);
    setNewCatInput("");
    setNewCatOpen(false);
  };

  const visible = useMemo(
    () => (filter === "all" ? tools : tools.filter((t) => t.category === filter)),
    [tools, filter],
  );

  const submitCreate = async () => {
    if (!currentUserId) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Zadaj názov nástroja");
      return;
    }
    const normalizedUrl = form.url.trim() ? normalizeUrl(form.url) : null;
    if (form.url.trim() && !normalizedUrl) {
      toast.error("Neplatný URL odkaz");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        url: normalizedUrl,
        email: form.email.trim() || null,
        password: form.password.trim() || null,
        description: form.description.trim() || null,
        category: form.category || "ine",
        image_url: form.image_url.trim() || null,
        guides: form.guides,
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
    if (!name) {
      toast.error("Zadaj názov nástroja");
      return;
    }
    const normalizedUrl = form.url.trim() ? normalizeUrl(form.url) : null;
    if (form.url.trim() && !normalizedUrl) {
      toast.error("Neplatný URL odkaz");
      return;
    }
    try {
      const updated = await update.mutateAsync({
        id: openTool.id,
        patch: {
          name,
          url: normalizedUrl,
          email: form.email.trim() || null,
          password: form.password.trim() || null,
          description: form.description.trim() || null,
          category: form.category || "ine",
          image_url: form.image_url.trim() || null,
          guides: form.guides,
        },
      });
      setOpenTool(updated);
      setEditMode(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const startEdit = (t: WorkTool) => {
    setForm({
      name: t.name,
      url: t.url ?? "",
      email: t.email ?? "",
      password: t.password ?? "",
      description: t.description ?? "",
      category: t.category,
      image_url: t.image_url ?? "",
      guides: t.guides ?? [],
    });
    setEditMode(true);
  };

  const handleDelete = async (t: WorkTool) => {
    if (!confirm(`Naozaj odstrániť nástroj „${t.name}"?`)) return;
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
          Tímová knižnica pracovných nástrojov – ulož si prihlasovacie údaje, odkazy aj video návody.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY_FORM, category: filter === "all" ? "ine" : filter });
            setAddOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Pridať nástroj
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-surface-muted p-1.5">
        {filters.map((f) => {
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
            <Wrench className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Zatiaľ tu nie sú žiadne pracovné nástroje. Pridaj prvý.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragId && dragId !== t.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragId || dragId === t.id) return;
                  const ids = visible.map((x) => x.id);
                  const from = ids.indexOf(dragId);
                  const to = ids.indexOf(t.id);
                  if (from < 0 || to < 0) return;
                  const next = [...visible];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  const slots = visible
                    .map((it, idx) => it.position ?? idx + 1)
                    .slice()
                    .sort((a, b) => a - b);
                  const payload = next.map((it, idx) => ({ id: it.id, position: slots[idx] }));
                  reorder.mutate(payload);
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => {
                  setEditMode(false);
                  setOpenTool(t);
                }}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md cursor-grab active:cursor-grabbing",
                  dragId === t.id && "opacity-50",
                )}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-muted">
                  {t.image_url ? (
                    <img
                      src={t.image_url}
                      alt={t.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Wrench className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="text-sm font-semibold leading-snug break-words">{t.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {prettyCategory(t.category)}
                    {t.guides?.length > 0 && ` · ${t.guides.length} návodov`}
                  </span>
                </div>
              </button>
            ))}
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
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          {openTool && !editMode && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 pr-8">
                  {openTool.image_url ? (
                    <img src={openTool.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <Wrench className="h-10 w-10 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="break-words text-left leading-snug">{openTool.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {prettyCategory(openTool.category)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <ToolView tool={openTool} />

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
              <ToolForm form={form} setForm={setForm} tools={tools} extraCats={extraCats} />
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
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pridať pracovný nástroj</DialogTitle>
            <DialogDescription className="text-xs">
              Napríklad Higgsfield, Midjourney a podobne. Môžeš pridať aj heslo a video návody.
            </DialogDescription>
          </DialogHeader>
          <ToolForm form={form} setForm={setForm} tools={tools} extraCats={extraCats} />
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

function ToolView({ tool }: { tool: WorkTool }) {
  const [showPassword, setShowPassword] = useState(false);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} skopírované`);
    } catch {
      toast.error("Kopírovanie zlyhalo");
    }
  };

  return (
    <div className="space-y-4">
      {tool.url && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Odkaz
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2">
            <a
              href={tool.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-1 items-center gap-1.5 truncate text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{hostOf(tool.url)}</span>
            </a>
            <button
              type="button"
              onClick={() => copy(tool.url!, "URL")}
              className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
              title="Skopírovať URL"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tool.password && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prihlasovacie údaje / heslo
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="flex-1 truncate font-mono text-sm">
              {showPassword ? tool.password : "•".repeat(Math.min(12, tool.password.length))}
            </code>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
              title={showPassword ? "Skryť" : "Zobraziť"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => copy(tool.password!, "Heslo")}
              className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
              title="Skopírovať"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tool.description && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Popis
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-sm">
            {tool.description}
          </p>
        </div>
      )}

      {tool.guides && tool.guides.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Návody / videá
          </div>
          <ul className="space-y-1.5">
            {tool.guides.map((g, i) => (
              <li key={i}>
                <a
                  href={g.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2 text-sm hover:border-primary hover:text-primary"
                >
                  <Youtube className="h-4 w-4 shrink-0 text-red-600" />
                  <span className="flex-1 truncate">{g.label?.trim() || hostOf(g.url)}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ToolForm({
  form,
  setForm,
  tools,
  extraCats,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  tools: WorkTool[];
  extraCats: string[];
}) {
  const allCats = useMemo(() => {
    const s = new Set<string>(["ine"]);
    for (const t of tools) s.add(t.category);
    for (const c of extraCats) s.add(c);
    if (form.category) s.add(form.category);
    return Array.from(s);
  }, [tools, extraCats, form.category]);

  const [newGuideUrl, setNewGuideUrl] = useState("");
  const [newGuideLabel, setNewGuideLabel] = useState("");
  const [newCatInput, setNewCatInput] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const addGuide = () => {
    const url = normalizeUrl(newGuideUrl);
    if (!url) {
      toast.error("Zadaj platný URL odkaz");
      return;
    }
    setForm((f) => ({
      ...f,
      guides: [...f.guides, { url, label: newGuideLabel.trim() || null }],
    }));
    setNewGuideUrl("");
    setNewGuideLabel("");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Názov *</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Napr. Higgsfield"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          URL odkaz (voliteľné)
        </label>
        <Input
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="https://higgsfield.ai"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Prihlasovacie údaje / heslo (voliteľné)
        </label>
        <div className="relative">
          <Input
            type={showPass ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="email + heslo, API kľúč, atď."
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Popis (voliteľné)
        </label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          placeholder="Na čo nástroj slúži…"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Kategória</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {allCats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((f) => ({ ...f, category: c }))}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                form.category === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {prettyCategory(c)}
            </button>
          ))}
          {showNewCat ? (
            <span className="flex items-center gap-1">
              <Input
                autoFocus
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const s = slugify(newCatInput);
                    if (s) {
                      setForm((f) => ({ ...f, category: s }));
                      setNewCatInput("");
                      setShowNewCat(false);
                    }
                  }
                }}
                placeholder="Nová kategória"
                className="h-7 w-40 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const s = slugify(newCatInput);
                  if (s) {
                    setForm((f) => ({ ...f, category: s }));
                    setNewCatInput("");
                    setShowNewCat(false);
                  }
                }}
              >
                OK
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewCat(true)}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Nová
            </button>
          )}
        </div>
      </div>

      <ImageUploadField
        value={form.image_url}
        onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
      />

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
          Návody / video odkazy
        </label>
        {form.guides.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {form.guides.map((g, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-2"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={g.label ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      guides: f.guides.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value || null } : x,
                      ),
                    }))
                  }
                  placeholder="Názov (voliteľné)"
                  className="h-7 px-2 text-xs"
                />
                <a
                  href={g.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-[11px] text-muted-foreground hover:text-primary"
                  title={g.url}
                >
                  {hostOf(g.url)}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      guides: f.guides.filter((_, idx) => idx !== i),
                    }))
                  }
                  className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-destructive"
                  aria-label="Odstrániť"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newGuideUrl}
            onChange={(e) => setNewGuideUrl(e.target.value)}
            placeholder="https://youtube.com/…"
            className="sm:flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGuide();
              }
            }}
          />
          <Input
            value={newGuideLabel}
            onChange={(e) => setNewGuideLabel(e.target.value)}
            placeholder="Názov návodu (voliteľné)"
            className="sm:w-56"
          />
          <Button type="button" variant="outline" size="sm" onClick={addGuide}>
            <Plus className="mr-1 h-4 w-4" /> Pridať
          </Button>
        </div>
      </div>
    </div>
  );
}