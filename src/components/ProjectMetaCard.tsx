import { useState } from "react";
import { Plus, Trash2, Wallet, CalendarDays, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Project } from "@/lib/types";
import {
  useCreateProjectWork,
  useDeleteProjectWork,
  useProjectWorks,
} from "@/lib/queries";

function monthsSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
}

function fmtMoney(n: number | null, cur: string | null) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("sk-SK", { style: "currency", currency: cur ?? "EUR" }).format(n);
  } catch {
    return `${n} ${cur ?? ""}`.trim();
  }
}

function fmtMonth(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}

export function ProjectMetaCard({ project }: { project: Project }) {
  const { data: works = [] } = useProjectWorks(project.id);
  const createWork = useCreateProjectWork();
  const delWork = useDeleteProjectWork(project.id);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");

  const months = monthsSince(project.client_since);
  const totalWorks = works.reduce((s, w) => s + (w.price ?? 0), 0);
  const monthlyTotal = (project.monthly_price ?? 0) * (months ?? 0);
  const billedTotal = monthlyTotal + totalWorks;

  const addWork = async () => {
    if (!title.trim()) return;
    try {
      await createWork.mutateAsync({
        project_id: project.id,
        title: title.trim(),
        price: price ? Number(price) : null,
        note: null,
      });
      setTitle("");
      setPrice("");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať prácu");
    }
  };

  return (
    <div className="card-elevated p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-muted p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Mesačne
          </div>
          <div className="mt-1 text-lg font-bold">
            {fmtMoney(project.monthly_price, project.currency)}
          </div>
        </div>
        <div className="rounded-xl bg-surface-muted p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Spolupráca
          </div>
          <div className="mt-1 text-lg font-bold">
            {months != null ? `${months} mes.` : "—"}
          </div>
          {project.client_since && (
            <div className="text-xs text-muted-foreground">od {fmtMonth(project.client_since)}</div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Jednotlivé práce</h3>
          {works.length > 0 && (
            <span className="text-xs text-muted-foreground">
              spolu {fmtMoney(totalWorks, project.currency)}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {works.length === 0 ? (
            <p className="text-xs text-muted-foreground">Zatiaľ žiadne práce.</p>
          ) : (
            works.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
                <span className="flex-1 truncate text-sm">{w.title}</span>
                <span className="text-sm font-medium tabular-nums">
                  {fmtMoney(w.price, project.currency)}
                </span>
                <button
                  onClick={() => delWork.mutate(w.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Zmazať"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_100px_auto] gap-2">
          <div>
            <Label htmlFor="wtitle" className="sr-only">Názov</Label>
            <Input
              id="wtitle"
              placeholder="Napr. Logo redizajn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="wprice" className="sr-only">Cena</Label>
            <Input
              id="wprice"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Cena"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button size="icon" onClick={addWork} disabled={!title.trim() || createWork.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
