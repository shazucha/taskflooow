import { useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import type { Priority } from "@/lib/types";
import { PRIORITY_META } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useCreateTask, useCurrentUserId, useProfiles } from "@/lib/queries";
import { toast } from "sonner";
import { UserAvatar } from "./UserAvatar";

interface Props {
  projectId: string;
}

// Vráti ISO string pre n-tý deň daného mesiaca; ak mesiac taký deň nemá,
// použije posledný deň mesiaca (napr. 31 vo februári -> 28/29).
function nthDayOfMonth(year: number, monthIdx0: number, day: number): string {
  const lastDay = new Date(year, monthIdx0 + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  const d = new Date(year, monthIdx0, safeDay, 9, 0, 0);
  return d.toISOString();
}

export function RecurringTaskDialog({ projectId }: Props) {
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const create = useCreateTask();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [day, setDay] = useState<number>(1);
  const [months, setMonths] = useState<number>(12);
  const today = new Date();
  const [startMonth, setStartMonth] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    currentUserId ? [currentUserId] : []
  );

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium");
    setDay(1); setMonths(12);
    setStartMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
    setSelectedUserIds(currentUserId ? [currentUserId] : []);
  };

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const preview = useMemo(() => {
    const [yStr, mStr] = startMonth.split("-");
    const y0 = Number(yStr); const m0 = Number(mStr) - 1;
    const dates: string[] = [];
    for (let i = 0; i < months; i++) {
      const y = y0 + Math.floor((m0 + i) / 12);
      const m = (m0 + i) % 12;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const safeDay = Math.min(day, lastDay);
      dates.push(`${safeDay}.${m + 1}.${y}`);
    }
    return dates;
  }, [startMonth, months, day]);

  const submit = async () => {
    if (!title.trim() || !currentUserId || !projectId) return;
    const assignee = selectedUserIds[0] ?? currentUserId;
    const watchers = selectedUserIds.slice(1).filter((id) => id !== assignee);
    const [yStr, mStr] = startMonth.split("-");
    const y0 = Number(yStr); const m0 = Number(mStr) - 1;
    const seriesId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      for (let i = 0; i < months; i++) {
        const y = y0 + Math.floor((m0 + i) / 12);
        const m = (m0 + i) % 12;
        const due_date = nthDayOfMonth(y, m, day);
        await create.mutateAsync({
          task: {
            title: title.trim(),
            description: description.trim() || null,
            priority,
            status: "todo",
            project_id: projectId,
            assignee_id: assignee,
            created_by: currentUserId,
            due_date,
            due_end: null,
            series_id: seriesId,
          },
          watcherIds: watchers,
        });
      }
      toast.success(`Vytvorených ${months} opakovaných úloh`);
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa vytvoriť opakovanú úlohu");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
          <Repeat className="h-4 w-4" /> Opakovaná
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opakovaná úloha (mesačne)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rtitle">Názov</Label>
            <Input id="rtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Napr. Mesačný report" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rdesc">Popis</Label>
            <Textarea id="rdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Voliteľné" />
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

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="rday">Deň v mesiaci</Label>
              <Input
                id="rday"
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rstart">Od mesiaca</Label>
              <Input
                id="rstart"
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rmonths">Počet mesiacov</Label>
              <Input
                id="rmonths"
                type="number"
                min={1}
                max={36}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Math.min(36, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">Náhľad ({preview.length} úloh):</div>
            <div className="mt-1 line-clamp-3">{preview.join(" · ")}</div>
            <div className="mt-1 text-[11px]">
              Ak mesiac nemá daný deň (napr. 31), použije sa posledný deň mesiaca.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Komu úloha patrí</Label>
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
                    <Checkbox checked={active} onCheckedChange={() => toggleUser(p.id)} />
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
            {create.isPending ? "Vytváram..." : `Vytvoriť ${months}×`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
