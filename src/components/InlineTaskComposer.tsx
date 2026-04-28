import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PRIORITY_META, type Priority } from "@/lib/types";
import { UserAvatar } from "./UserAvatar";
import { useCreateTask, useCurrentUserId, useProfiles } from "@/lib/queries";

const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

interface Props {
  projectId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM optional start time */
  time?: string;
  /** HH:MM optional end time */
  endTime?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function InlineTaskComposer({
  projectId,
  date,
  time,
  endTime,
  onClose,
  onCreated,
}: Props) {
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const create = useCreateTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(date);
  const [dueTime, setDueTime] = useState(time ?? "");
  const [endTimeState, setEndTimeState] = useState(endTime ?? "");

  // Re-sync when calendar passes new prefill
  useEffect(() => {
    setDueDate(date);
    setDueTime(time ?? "");
    setEndTimeState(endTime ?? "");
  }, [date, time, endTime]);

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = async () => {
    if (!title.trim() || !currentUserId) return;
    if (selectedUserIds.length === 0) {
      toast.error("Vyber aspoň jedného riešiteľa");
      return;
    }
    try {
      let due_date: string | null = null;
      let due_end: string | null = null;
      if (dueDate) {
        const start = new Date(`${dueDate}T${dueTime || "00:00"}:00`);
        due_date = start.toISOString();
        if (dueTime) {
          if (endTimeState && endTimeState > dueTime) {
            const end = new Date(`${dueDate}T${endTimeState}:00`);
            due_end = end.toISOString();
          } else {
            due_end = new Date(start.getTime() + 30 * 60 * 1000).toISOString();
          }
        }
      }

      // Každý zaškrtnutý dostane vlastnú kópiu úlohy (vlastný assignee_id).
      const uniqueAssignees = Array.from(new Set(selectedUserIds));
      for (const assigneeId of uniqueAssignees) {
        await create.mutateAsync({
          task: {
            title: title.trim(),
            description: description.trim() || null,
            priority,
            status: "todo",
            project_id: projectId,
            assignee_id: assigneeId,
            created_by: currentUserId,
            due_date,
            due_end,
            series_id: null,
          },
          watcherIds: [],
        });
      }
      toast.success(
        uniqueAssignees.length > 1
          ? `Vytvorených ${uniqueAssignees.length} úloh (po jednej pre každého riešiteľa)`
          : "Úloha vytvorená"
      );
      onCreated?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nepodarilo sa vytvoriť úlohu";
      toast.error(msg);
    }
  };

  // Friendly localized date label
  const dateLabel = (() => {
    if (!dueDate) return "";
    const d = new Date(`${dueDate}T00:00:00`);
    return d.toLocaleDateString("sk-SK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  return (
    <div className="mt-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Nová úloha
          </p>
          <p className="truncate text-sm font-semibold capitalize">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          aria-label="Zavrieť"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="inl-title" className="text-xs">Názov</Label>
          <Input
            id="inl-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Čo treba spraviť?"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inl-desc" className="text-xs">Popis</Label>
          <Textarea
            id="inl-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Voliteľné"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Priorita</Label>
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
                    "flex items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-semibold transition-all",
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Dátum</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                if (!e.target.value) {
                  setDueTime("");
                  setEndTimeState("");
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Začiatok</Label>
            <Select
              value={dueTime || "none"}
              onValueChange={(v) => {
                const nv = v === "none" ? "" : v;
                setDueTime(nv);
                if (!nv) setEndTimeState("");
                else if (endTimeState && endTimeState <= nv) setEndTimeState("");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Celý deň" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">— celý deň —</SelectItem>
                {HALF_HOUR_SLOTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Koniec</Label>
            <Select
              value={endTimeState || "none"}
              onValueChange={(v) => setEndTimeState(v === "none" ? "" : v)}
              disabled={!dueTime}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">— bez konca —</SelectItem>
                {HALF_HOUR_SLOTS.filter((s) => !dueTime || s > dueTime).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Riešitelia</Label>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-card p-1">
            {profiles.map((p) => {
              const idx = selectedUserIds.indexOf(p.id);
              const active = idx !== -1;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition",
                    active ? "bg-primary/10" : "hover:bg-surface-muted"
                  )}
                >
                  <Checkbox checked={active} onCheckedChange={() => toggleUser(p.id)} />
                  <UserAvatar profile={p} size="sm" />
                  <span className="flex-1 truncate text-sm">
                    {p.full_name ?? p.email}
                    {p.id === currentUserId && (
                      <span className="ml-1 text-xs text-muted-foreground">(ja)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Zrušiť</Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? "Vytváram..." : "Vytvoriť úlohu"}
          </Button>
        </div>
      </div>
    </div>
  );
}