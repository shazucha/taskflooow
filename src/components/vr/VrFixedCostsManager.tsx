// Správa šablón fixných (pravidelných) mesačných nákladov — uložené v Supabase.
import { useState } from "react";
import { Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { eur, useDeleteVrFixedCost, useSaveVrFixedCost, useVrFixedCosts, type VrFixedCost } from "@/lib/vrFinanceApi";
import { useVrCategories, vrCatLabel } from "@/lib/vrCategories";

const EMPTY = {
  title: "",
  amount: "",
  category: "prevadzka",
  from_director: false,
  active: true,
  day_of_month: 5,
};

export function VrFixedCostsManager() {
  const { data: costs = [] } = useVrFixedCosts();
  const cats = useVrCategories("expense");
  const save = useSaveVrFixedCost();
  const remove = useDeleteVrFixedCost();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  function startEdit(c: VrFixedCost) {
    setEditId(c.id);
    setForm({
      title: c.title,
      amount: String(c.amount),
      category: c.category,
      from_director: c.from_director,
      active: c.active,
      day_of_month: c.day_of_month,
    });
  }

  async function handleSave() {
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.title.trim() || !amount) return toast.error("Vyplň názov a sumu.");
    try {
      await save.mutateAsync({
        id: editId ?? undefined,
        title: form.title.trim(),
        amount,
        category: form.category,
        from_director: form.from_director,
        active: form.active,
        day_of_month: Number(form.day_of_month) || 5,
        position: editId ? undefined : (costs.length + 1) * 10,
      });
      setEditId(null);
      setForm({ ...EMPTY });
      toast.success("Šablóna uložená.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-4 w-4" /> Fixné náklady
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Šablóny fixných nákladov</DialogTitle>
          <DialogDescription>
            Pravidelné mesačné platby (nájom, internet…). Aktívne šablóny sa použijú pri generovaní mesiaca.
            Jednorazové výdavky sem nedávaj.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {costs.length === 0 && (
            <p className="text-sm text-muted-foreground">Zatiaľ žiadne šablóny — pridaj prvú nižšie.</p>
          )}
          {costs.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Switch
                checked={c.active}
                onCheckedChange={(v) => save.mutate({ id: c.id, active: v })}
                aria-label="Aktívna šablóna"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {vrCatLabel("expense", c.category)} · {c.day_of_month}. deň
                  {c.from_director ? " · hradené konateľom" : " · z účtu firmy"}
                </p>
              </div>
              <span className="whitespace-nowrap font-semibold">{eur(Number(c.amount))}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove.mutate(c.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">{editId ? "Upraviť šablónu" : "Nová šablóna"}</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              className="sm:col-span-2"
              placeholder="Názov (napr. Nájom priestorov)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Suma €"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              type="number"
              min={1}
              max={28}
              placeholder="Deň"
              value={form.day_of_month}
              onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
            />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="sm:col-span-2">
                <SelectValue placeholder="Kategória" />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="fc-director"
                checked={form.from_director}
                onCheckedChange={(v) => setForm({ ...form, from_director: v })}
              />
              <Label htmlFor="fc-director" className="text-sm">Hradené z peňazí konateľa</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending}>
              <Plus className="mr-1.5 h-4 w-4" /> {editId ? "Uložiť zmeny" : "Pridať šablónu"}
            </Button>
            {editId && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setEditId(null); setForm({ ...EMPTY }); }}>
                <X className="mr-1.5 h-4 w-4" /> Zrušiť
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
