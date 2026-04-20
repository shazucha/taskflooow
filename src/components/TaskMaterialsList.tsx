import { useState } from "react";
import { ExternalLink, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useCreateTaskMaterial,
  useCurrentUserId,
  useDeleteTaskMaterial,
  useTaskMaterials,
} from "@/lib/queries";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  taskCreatorId: string;
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

export function TaskMaterialsList({ taskId, taskCreatorId }: Props) {
  const currentUserId = useCurrentUserId();
  const { data: materials = [] } = useTaskMaterials(taskId);
  const create = useCreateTaskMaterial();
  const remove = useDeleteTaskMaterial(taskId);

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (!currentUserId) return;
    const normalized = normalizeUrl(url);
    if (!normalized) {
      toast.error("Zadaj platný odkaz");
      return;
    }
    try {
      await create.mutateAsync({
        task_id: taskId,
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <LinkIcon className="h-3.5 w-3.5" /> Materiály
        </span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Pridať odkaz
          </button>
        )}
      </div>

      {materials.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Žiadne materiály.</p>
      )}

      {materials.length > 0 && (
        <ul className="space-y-1.5">
          {materials.map((m) => {
            const canDelete = m.created_by === currentUserId || taskCreatorId === currentUserId;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5"
              >
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex flex-1 min-w-0 items-center gap-1.5 text-sm hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {m.label || hostOf(m.url)}
                  </span>
                  {m.label && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      · {hostOf(m.url)}
                    </span>
                  )}
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
        <div className="space-y-1.5 rounded-lg border border-border bg-background p-2">
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
