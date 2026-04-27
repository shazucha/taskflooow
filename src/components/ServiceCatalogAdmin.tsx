import { useState } from "react";
import { Plus, Trash2, Wallet, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useCreateServiceCatalogItem,
  useDeleteServiceCatalogItem,
  useServiceCatalog,
  useUpdateServiceCatalogItem,
} from "@/lib/queries";

function fmtEur(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n);
}

export function ServiceCatalogAdmin() {
  const { data: items = [], isLoading } = useServiceCatalog(true);
  const create = useCreateServiceCatalogItem();
  const update = useUpdateServiceCatalogItem();
  const remove = useDeleteServiceCatalogItem();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    try {
      await create.mutateAsync({
        title: t,
        unit_price: price ? Number(price) : 0,
        default_hours: hours ? Number(hours) : null,
        note: null,
        position: items.length,
      });
      setTitle(""); setPrice(""); setHours("");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa pridať");
    }
  };

  return (
    <section className="card-elevated mt-4 p-4">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
        <Wallet className="h-4 w-4" /> Cenník extra služieb
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Globálny cenník — predpripravené položky pre bonusy v projektoch. Cena per ks
        sa dá v rámci projektu prepísať.
      </p>

      <div className="mt-3 space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Načítavam...</p>
        ) : items.length === 0 ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            Zatiaľ žiadne položky.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2"
            >
              <span className={`flex-1 truncate text-sm ${it.active ? "" : "text-muted-foreground line-through"}`}>
                {it.title}
              </span>
              <span className="text-sm font-medium tabular-nums">{fmtEur(it.unit_price)}</span>
              {it.default_hours != null && (
                <span className="text-[11px] text-muted-foreground">{it.default_hours}h</span>
              )}
              <button
                onClick={() =>
                  update.mutate({ id: it.id, patch: { active: !it.active } })
                }
                className="text-muted-foreground hover:text-foreground"
                aria-label={it.active ? "Skryť" : "Zobraziť"}
              >
                {it.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Odstrániť „${it.title}"?`)) remove.mutate(it.id);
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Zmazať"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_90px_70px_auto] gap-2">
        <div>
          <Label htmlFor="sc-title" className="sr-only">Názov</Label>
          <Input
            id="sc-title"
            placeholder="Napr. 1× video 30–40s"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="sc-price" className="sr-only">Cena</Label>
          <Input
            id="sc-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="€"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="sc-hours" className="sr-only">Hodiny</Label>
          <Input
            id="sc-hours"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.25"
            placeholder="h"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <Button size="icon" onClick={submit} disabled={!title.trim() || create.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}