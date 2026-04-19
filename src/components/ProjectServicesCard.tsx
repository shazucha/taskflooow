import { useState } from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useCreateProjectWork,
  useDeleteProjectWork,
  useProjectWorks,
} from "@/lib/queries";
import { NewTaskDialog } from "./NewTaskDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

export function ProjectServicesCard({ projectId }: Props) {
  const { data: services = [], isLoading } = useProjectWorks(projectId);
  const create = useCreateProjectWork();
  const remove = useDeleteProjectWork(projectId);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        project_id: projectId,
        title: title.trim(),
        price: null,
        note: note.trim() || null,
      });
      setTitle("");
      setNote("");
      setAdding(false);
      toast.success("Služba pridaná");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  const onServiceClick = (name: string) => {
    setTaskTitle(name);
    setTaskOpen(true);
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4" /> Služby pre klienta
        </h2>
        {!adding && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Pridať
          </Button>
        )}
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground">
        Klikni na službu → vytvorí úlohu s daným názvom v tomto projekte.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam...</p>
      ) : services.length === 0 && !adding ? (
        <p className="rounded-xl bg-surface-muted p-4 text-center text-xs text-muted-foreground">
          Zatiaľ žiadne služby. Klikni „Pridať".
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <div
              key={s.id}
              className="group inline-flex items-stretch overflow-hidden rounded-full border border-border bg-surface-muted text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5"
            >
              <button
                type="button"
                onClick={() => onServiceClick(s.title)}
                title={s.note ?? `Vytvoriť úlohu: ${s.title}`}
                className="px-3 py-1.5 text-foreground transition hover:text-primary"
              >
                {s.title}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Odstrániť službu "${s.title}"?`)) {
                    remove.mutate(s.id);
                  }
                }}
                className="flex items-center justify-center border-l border-border/60 px-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                aria-label="Odstrániť"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3">
          <div className="space-y-1">
            <Label htmlFor="svc-title" className="text-xs">Názov služby</Label>
            <Input
              id="svc-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. Príspevky na FB, Google Ads, Newsletter…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setTitle(""); setNote(""); }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="svc-note" className="text-xs">Poznámka (voliteľné)</Label>
            <Textarea
              id="svc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Detail služby"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setAdding(false); setTitle(""); setNote(""); }}
            >
              Zrušiť
            </Button>
            <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Pridávam..." : "Pridať"}
            </Button>
          </div>
        </div>
      )}

      <NewTaskDialog
        hideTrigger
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultProjectId={projectId}
        defaultTitle={taskTitle}
      />
    </div>
  );
}
