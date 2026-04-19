import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateProject, useCurrentUserId } from "@/lib/queries";
import { toast } from "sonner";
import { PROJECT_CATEGORIES, type ProjectCategory } from "@/lib/types";

const colors = ["#3b82f6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const currencies = ["EUR", "USD", "CZK"];

export function NewProjectDialog() {
  const create = useCreateProject();
  const currentUserId = useCurrentUserId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [clientSince, setClientSince] = useState(""); // YYYY-MM
  const [category, setCategory] = useState<ProjectCategory | "">("");

  const submit = async () => {
    if (!name.trim() || !currentUserId) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        color,
        owner_id: currentUserId,
        monthly_price: monthlyPrice ? Number(monthlyPrice) : null,
        currency,
        client_since: clientSince ? `${clientSince}-01` : null,
        category: category || null,
      });
      setOpen(false);
      setName(""); setDescription(""); setColor(colors[0]);
      setMonthlyPrice(""); setCurrency("EUR"); setClientSince(""); setCategory("");
      toast.success("Projekt vytvorený");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa vytvoriť projekt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
          <Plus className="h-4 w-4" /> Nový
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nový projekt</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pname">Názov</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdesc">Popis</Label>
            <Textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pcat">Kategória</Label>
            <select
              id="pcat"
              value={category}
              onChange={(e) => setCategory(e.target.value as ProjectCategory | "")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Bez kategórie</option>
              {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pprice">Mesačná cena</Label>
              <Input
                id="pprice"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="napr. 500"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pcur">Mena</Label>
              <select
                id="pcur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="psince">Klient od (mesiac)</Label>
            <Input
              id="psince"
              type="month"
              value={clientSince}
              onChange={(e) => setClientSince(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Farba</Label>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full ring-offset-2 transition-all"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Vytváram..." : "Vytvoriť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
