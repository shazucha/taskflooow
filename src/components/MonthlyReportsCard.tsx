import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  useCreateProjectMonthlyReport,
  useCurrentUserId,
  useDeleteProjectMonthlyReport,
  useProjectMonthlyReports,
} from "@/lib/queries";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";
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

async function uploadReportFile(userId: string, projectId: string, file: File): Promise<{ url: string; name: string }> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Súbor je príliš veľký (max 20 MB)");
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  const path = `${userId}/reports/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}

// Posledných 12 mesiacov + 1 budúci (na výber).
function monthOptions(): string[] {
  const out: string[] = [];
  const now = currentMonthKey();
  out.push(shiftMonth(now, 1));
  for (let i = 0; i < 12; i++) out.push(shiftMonth(now, -i));
  return Array.from(new Set(out));
}

export function MonthlyReportsCard({ projectId }: { projectId: string }) {
  const currentUserId = useCurrentUserId();
  const { data: reports = [] } = useProjectMonthlyReports(projectId);
  const create = useCreateProjectMonthlyReport();
  const remove = useDeleteProjectMonthlyReport(projectId);

  const PREVIEW_COUNT = 3;
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => monthOptions(), []);
  const visible = expanded ? reports : reports.slice(0, PREVIEW_COUNT);
  const hasMore = reports.length > PREVIEW_COUNT;

  const resetForm = () => {
    setMonthKey(currentMonthKey());
    setTitle("");
    setUrl("");
    setNote("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!currentUserId) return;
    const normalizedUrl = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !normalizedUrl) {
      toast.error("Neplatný odkaz");
      return;
    }
    let file_url: string | null = null;
    let file_name: string | null = null;
    try {
      if (file) {
        setUploading(true);
        const res = await uploadReportFile(currentUserId, projectId, file);
        file_url = res.url;
        file_name = res.name;
      }
      await create.mutateAsync({
        project_id: projectId,
        month_key: monthKey,
        title: title.trim() || null,
        note: note.trim() || null,
        url: normalizedUrl,
        file_url,
        file_name,
        created_by: currentUserId,
      });
      resetForm();
      setAdding(false);
      setExpanded(true);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť report");
    } finally {
      setUploading(false);
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
            <CalendarRange className="h-4 w-4" />
          </span>
          Mesačné reporty
          {reports.length > 0 && (
            <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {reports.length}
            </span>
          )}
          {reports.length > 0 && (
            expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Pridať report
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-surface-muted/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Mesiac</span>
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Názov (volit.)</span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Napr. Report výkonu kampaní"
                className="h-8"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Odkaz (volit.)</span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="h-8"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Poznámka (volit.)</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Krátky popis…"
              rows={2}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="h-8"
            >
              <Upload className="mr-1 h-3.5 w-3.5" /> Súbor
            </Button>
            {file && (
              <span className="inline-flex items-center gap-1 truncate rounded-md bg-background px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { resetForm(); setAdding(false); }}
                className="h-8"
              >
                Zrušiť
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={submit}
                disabled={uploading || create.isPending}
                className="h-8"
              >
                {uploading ? "Nahrávam…" : "Uložiť"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {reports.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          Žiadne reporty. Pridaj prvý mesačný report (odkaz alebo súbor).
        </p>
      )}

      {reports.length > 0 && (
        <ul className="space-y-1.5">
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 rounded-lg bg-surface-muted px-2.5 py-2"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    {r.title?.trim() || `Report ${formatMonthLabel(r.month_key)}`}
                  </span>
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatMonthLabel(r.month_key)}
                  </span>
                </div>
                {r.note && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.note}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Odkaz
                    </a>
                  )}
                  {r.file_url && (
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[200px] truncate">{r.file_name || "Súbor"}</span>
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Odstrániť tento report?")) remove.mutate(r.id);
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Odstrániť"
                title="Odstrániť"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline",
          )}
        >
          {expanded ? "Zobraziť menej" : `Zobraziť všetky (${reports.length})`}
        </button>
      )}
    </div>
  );
}