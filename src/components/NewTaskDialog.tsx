import { useState } from "react";
import { Plus } from "lucide-react";
import type { Priority } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCreateTask, useCurrentUserId, useProfiles, useProjects } from "@/lib/queries";
import { toast } from "sonner";

interface Props {
  defaultProjectId?: string;
  trigger?: React.ReactNode;
}

export function NewTaskDialog({ defaultProjectId, trigger }: Props) {
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const create = useCreateTask();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [watcherIds, setWatcherIds] = useState<string[]>([]);

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setProjectId(defaultProjectId ?? ""); setAssigneeId(""); setDueDate("");
    setWatcherIds([]);
  };

  const effectiveAssignee = assigneeId || currentUserId || "";
  const availableWatchers = profiles.filter(
    (p) => p.id !== currentUserId && p.id !== effectiveAssignee
  );
  const toggleWatcher = (id: string) =>
    setWatcherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!title.trim() || !currentUserId) return;
    try {
      await create.mutateAsync({
        task: {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: "todo",
          project_id: projectId || null,
          assignee_id: assigneeId || currentUserId,
          created_by: currentUserId,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        },
        watcherIds: watcherIds.filter((id) => id !== currentUserId && id !== effectiveAssignee),
      });
      setOpen(false);
      reset();
      toast.success("Úloha vytvorená");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa vytvoriť úlohu");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-1.5 rounded-full shadow-md">
            <Plus className="h-4 w-4" /> Nová úloha
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nová úloha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Názov</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Čo treba spraviť?" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Popis</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Voliteľné" />
          </div>
          <div className="space-y-1.5">
            <Label>Priorita</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                const meta = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all",
                      active
                        ? `${meta.soft} ${meta.text} border-transparent ring-2 ${meta.ring}`
                        : "bg-surface-muted text-muted-foreground border-transparent hover:text-foreground"
                    )}
                  >
                    <span className={cn("priority-dot", meta.dot)} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Projekt</Label>
              <Select value={projectId || "none"} onValueChange={(v) => setProjectId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Bez projektu" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez projektu</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Termín</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Priradiť</Label>
            <Select value={assigneeId || currentUserId || ""} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Vyber člena tímu" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email}{p.id === currentUserId ? " (ja)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span>Komu sa zobrazí</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Default: ty + priradený
              </span>
            </Label>
            {availableWatchers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Žiadni ďalší členovia.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {availableWatchers.map((p) => {
                  const active = watcherIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleWatcher(p.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {active && "✓ "}
                      {p.full_name ?? p.email}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Vytváram..." : "Vytvoriť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
