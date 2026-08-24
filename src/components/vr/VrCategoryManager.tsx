// Dialóg na správu firiem/dodávateľov (Supabase — spoločné pre všetkých).
import { useMemo, useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Search, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { VR_SCOPE_LABEL, useVrCategories, useVrCategoryActions, type VrCatScope } from "@/lib/vrCategories";

export function VrCategoryManager({ scope }: { scope: VrCatScope }) {
  const all = useVrCategories(scope);
  const { add, rename, remove, resetDefaults } = useVrCategoryActions(scope);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.label.toLowerCase().includes(q)) : all;
  }, [all, search]);

  async function handleReset() {
    try {
      await resetDefaults.mutateAsync();
      toast.success("Predvolené firmy obnovené.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }


  async function handleAdd() {
    if (!draft.trim()) return;
    try {
      await add.mutateAsync(draft);
      setDraft("");
      toast.success("Firma pridaná.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRename(rowId: string) {
    try {
      await rename.mutateAsync({ rowId, label: editLabel });
      setEditId(null);
      toast.success("Názov firmy upravený.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRemove(rowId: string) {
    try {
      await remove.mutateAsync(rowId);
      toast.success("Firma odstránená.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Spravovať: ${VR_SCOPE_LABEL[scope]}`}>
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Firmy</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{VR_SCOPE_LABEL[scope]}</DialogTitle>
          <DialogDescription>
            Zoznam firiem/dodávateľov je uložený v databáze a vidia ho všetci členovia firmy.
            Pridaj napríklad názvy spoločností, od ktorých nakupuješ alebo ktorým fakturuješ.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Názov firmy…"
            aria-label="Nová firma"
          />
          <Button onClick={handleAdd} disabled={add.isPending} className="bg-vr text-vr-foreground hover:bg-vr/90">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať firmu…"
            aria-label="Hľadať firmu"
          />
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={resetDefaults.isPending}>
              <RotateCcw className="h-4 w-4" /> Obnoviť predvolené
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Obnoviť predvolené záznamy?</AlertDialogTitle>
              <AlertDialogDescription>
                Doplní chýbajúce predvolené položky a predvoleným vráti pôvodné názvy.
                Tvoje vlastné firmy ani zapísané sumy sa nezmažú.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušiť</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Obnoviť</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>



        <ul className="mt-1 max-h-[320px] space-y-1 overflow-y-auto">
          {categories.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Žiadne firmy — spusti migráciu alebo pridaj vlastnú.
            </li>
          )}
          {categories.map((c) => (
            <li key={c.rowId} className="flex items-center gap-2 rounded-lg bg-surface-muted/50 px-3 py-1.5">
              {editId === c.rowId ? (
                <>
                  <Input
                    className="h-8"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    aria-label="Nový názov firmy"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Uložiť názov firmy"
                    onClick={() => handleRename(c.rowId)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Zrušiť" onClick={() => setEditId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Premenovať ${c.label}`}
                    onClick={() => {
                      setEditId(c.rowId);
                      setEditLabel(c.label);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!c.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Zmazať ${c.label}`}
                      onClick={() => handleRemove(c.rowId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
