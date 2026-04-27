import { useState } from "react";
import { Clock, Eye, EyeOff, FileText, Plus, Trash2, Video, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

  const [unitType, setUnitType] = useState<"piece" | "hourly">("piece");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");

  const reset = () => {
    setTitle(""); setDescription(""); setPrice(""); setHours("");
    setUnitType("piece");
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    if (unitType === "hourly" && !hours) {
      toast.error("Pri hodinovej položke vyplň hodiny");
      return;
    }
    try {
      await create.mutateAsync({
        title: t,
        description: description.trim() || null,
        unit_price: price ? Number(price) : 0,
        default_hours: hours ? Number(hours) : null,
        unit_type: unitType,
        note: null,
        position: items.length,
      });
      reset();
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
        Globálny cenník — predpripravené položky pre bonusy v projektoch.
        <br />
        <strong>Per ks</strong> = fixná cena (napr. „1× video = 180 €"),
        <strong> Hodinová</strong> = cena = hodiny × hodinovka projektu.
      </p>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Načítavam...</p>
        ) : items.length === 0 ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            Zatiaľ žiadne položky.
          </p>
        ) : (
          items.map((it) => {
            const isHourly = it.unit_type === "hourly";
            const Icon = isHourly ? Clock : it.title.toLowerCase().includes("video") ? Video : FileText;
            return (
              <div
                key={it.id}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-3 transition",
                  it.active ? "border-border bg-surface-muted/40" : "border-border/40 bg-surface-muted/20 opacity-60"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  isHourly ? "bg-primary-soft text-primary" : "bg-success/15 text-success"
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm font-semibold", !it.active && "line-through")}>
                      {it.title}
                      {isHourly && it.default_hours != null && (
                        <span className="ml-1 text-muted-foreground">({it.default_hours}h)</span>
                      )}
                    </p>
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums text-success">
                      +{fmtEur(it.unit_price)} <span className="font-normal text-muted-foreground">/ {isHourly ? "h-balík" : "ks"}</span>
                    </span>
                  </div>
                  {it.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{it.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => update.mutate({ id: it.id, patch: { active: !it.active } })}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    aria-label={it.active ? "Skryť" : "Zobraziť"}
                  >
                    {it.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Odstrániť „${it.title}"?`)) remove.mutate(it.id);
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Zmazať"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-surface-muted/60 p-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1">
          <button
            type="button"
            onClick={() => setUnitType("piece")}
            className={cn(
              "rounded-md py-1.5 text-xs font-semibold transition",
              unitType === "piece" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Per ks (fixná cena)
          </button>
          <button
            type="button"
            onClick={() => setUnitType("hourly")}
            className={cn(
              "rounded-md py-1.5 text-xs font-semibold transition",
              unitType === "hourly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Hodinová
          </button>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sc-title" className="text-xs">Názov</Label>
          <Input
            id="sc-title"
            placeholder={unitType === "piece" ? "Napr. 1× video 30–40 sekúnd" : "Napr. Video & foto produkcia extra (2h)"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="sc-desc" className="text-xs">Popis (voliteľné)</Label>
          <Textarea
            id="sc-desc"
            rows={2}
            placeholder="Krátky popis služby zobrazený pod názvom"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={cn("grid gap-2", unitType === "hourly" ? "grid-cols-2" : "grid-cols-1")}>
          <div className="space-y-1">
            <Label htmlFor="sc-price" className="text-xs">
              Cena ({unitType === "hourly" ? "balík €" : "€ / ks"})
            </Label>
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
          {unitType === "hourly" && (
            <div className="space-y-1">
              <Label htmlFor="sc-hours" className="text-xs">Default hodín</Label>
              <Input
                id="sc-hours"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.25"
                placeholder="napr. 2"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-1.5 pt-1">
          <Button size="sm" variant="ghost" onClick={reset} disabled={!title && !price && !hours && !description}>
            Vyčistiť
          </Button>
          <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? "Pridávam..." : "Pridať položku"}
          </Button>
        </div>
      </div>
    </section>
  );
}