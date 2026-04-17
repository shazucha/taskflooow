import { useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Priority } from "@/lib/types";
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
import { PRIORITY_META } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  defaultProjectId?: string;
  trigger?: React.ReactNode;
}

export function NewTaskDialog({ defaultProjectId, trigger }: Props) {
  const projects = useApp((s) => s.projects);
  const profiles = useApp((s) => s.profiles);
  const currentUserId = useApp((s) => s.currentUserId);
  const addTask = useApp((s) => s.addTask);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? projects[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(currentUserId);
  const [dueDate, setDueDate] = useState<string>("");

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setAssigneeId(currentUserId); setDueDate("");
  };

  const submit = () => {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status: "todo",
      project_id: projectId || null,
      assignee_id: assigneeId,
      created_by: currentUserId,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    });
    setOpen(false);
    reset();
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
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
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
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={submit} disabled={!title.trim()}>Vytvoriť</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
