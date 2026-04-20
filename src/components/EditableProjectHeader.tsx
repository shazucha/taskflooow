import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Project } from "@/lib/types";
import { useUpdateProject } from "@/lib/queries";

interface Props {
  project: Project;
  canEdit: boolean;
}

export function EditableProjectHeader({ project, canEdit }: Props) {
  const update = useUpdateProject();
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setName(project.name), [project.name]);
  useEffect(() => setDesc(project.description ?? ""), [project.description]);
  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { if (editingDesc) descRef.current?.focus(); }, [editingDesc]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      setEditingName(false);
      setName(project.name);
      return;
    }
    try {
      await update.mutateAsync({ id: project.id, patch: { name: trimmed } });
      toast.success("Názov uložený");
      setEditingName(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  const saveDesc = async () => {
    const trimmed = desc.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if (next === (project.description ?? null)) {
      setEditingDesc(false);
      return;
    }
    try {
      await update.mutateAsync({ id: project.id, patch: { description: next } });
      toast.success("Popis uložený");
      setEditingDesc(false);
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa uložiť");
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: project.color ?? "#3b82f6" }} />
        {editingName ? (
          <div className="flex flex-1 items-center gap-1">
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") { setEditingName(false); setName(project.name); }
              }}
              className="h-9 text-xl font-bold"
            />
            <Button size="icon" variant="ghost" onClick={saveName} disabled={update.isPending}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { setEditingName(false); setName(project.name); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h1 className="truncate text-2xl font-bold tracking-tight">{project.name}</h1>
            {canEdit && (
              <button
                onClick={() => setEditingName(true)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Upraviť názov"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-1">
        {editingDesc ? (
          <div className="space-y-2">
            <Textarea
              ref={descRef}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Popis projektu"
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={saveDesc} disabled={update.isPending}>Uložiť</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingDesc(false); setDesc(project.description ?? ""); }}>
                Zrušiť
              </Button>
            </div>
          </div>
        ) : project.description ? (
          <div className="group flex items-start gap-1.5">
            <p className="text-sm text-muted-foreground">{project.description}</p>
            {canEdit && (
              <button
                onClick={() => setEditingDesc(true)}
                className="mt-0.5 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
                aria-label="Upraviť popis"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : canEdit ? (
          <button
            onClick={() => setEditingDesc(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            + Pridať popis
          </button>
        ) : null}
      </div>
    </div>
  );
}
