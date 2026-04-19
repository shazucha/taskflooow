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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useCreateTask, useCurrentUserId, useProfiles, useProjects } from "@/lib/queries";
import { toast } from "sonner";
import { UserAvatar } from "./UserAvatar";

const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

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
  // Pole vybraných používateľov. PRVÝ v poradí = hlavný zodpovedný (assignee),
  // ostatní = spolupracovníci (watchers). Default: aktuálny používateľ.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    currentUserId ? [currentUserId] : []
  );
  const [dueDate, setDueDate] = useState<string>("");
  const [dueTime, setDueTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setProjectId(defaultProjectId ?? "");
    setSelectedUserIds(currentUserId ? [currentUserId] : []);
    setDueDate(""); setDueTime(""); setEndTime("");
  };

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = async () => {
    if (!title.trim() || !currentUserId) return;
    try {
      let due_date: string | null = null;
      let due_end: string | null = null;
      if (dueDate) {
        const start = new Date(`${dueDate}T${dueTime || "00:00"}:00`);
        due_date = start.toISOString();
        if (dueTime && endTime) {
          const end = new Date(`${dueDate}T${endTime}:00`);
          if (end.getTime() > start.getTime()) due_end = end.toISOString();
        }
      }
      // Hlavný zodpovedný = prvý vybraný, fallback aktuálny používateľ
      const assignee = selectedUserIds[0] ?? currentUserId;
      const watchers = selectedUserIds.slice(1).filter((id) => id !== assignee);
      await create.mutateAsync({
        task: {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: "todo",
          project_id: projectId || null,
          assignee_id: assignee,
          created_by: currentUserId,
          due_date,
          due_end,
        },
        watcherIds: watchers,
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
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                if (!e.target.value) {
                  setDueTime("");
                  setEndTime("");
                }
              }}
            />
            {dueDate && (
              <>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => { setDueTime(""); setEndTime(""); }}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                      !dueTime
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Celý deň
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!dueTime) setDueTime("09:00"); }}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                      dueTime
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Konkrétny čas
                  </button>
                </div>
                {dueTime && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Začiatok</Label>
                      <Select
                        value={dueTime}
                        onValueChange={(v) => {
                          setDueTime(v);
                          if (endTime && endTime <= v) setEndTime("");
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {HALF_HOUR_SLOTS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Koniec</Label>
                      <Select value={endTime || "none"} onValueChange={(v) => setEndTime(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="none">— bez konca —</SelectItem>
                          {HALF_HOUR_SLOTS.filter((s) => s > dueTime).map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span>Komu úloha patrí</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                1. zaškrtnutý = hlavný
              </span>
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Môžeš vybrať viac ľudí. Prvý zaškrtnutý je hlavný zodpovedný, ostatní spolupracujú.
            </p>
            <div className="space-y-1 rounded-xl border border-border/60 p-1">
              {profiles.map((p) => {
                const idx = selectedUserIds.indexOf(p.id);
                const active = idx !== -1;
                const isPrimary = idx === 0;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition",
                      active ? "bg-primary/10" : "hover:bg-surface-muted"
                    )}
                  >
                    <Checkbox
                      checked={active}
                      onCheckedChange={() => toggleUser(p.id)}
                    />
                    <UserAvatar profile={p} size="sm" />
                    <span className="flex-1 truncate text-sm">
                      {p.full_name ?? p.email}
                      {p.id === currentUserId && (
                        <span className="ml-1 text-xs text-muted-foreground">(ja)</span>
                      )}
                    </span>
                    {isPrimary && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                        Hlavný
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
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
