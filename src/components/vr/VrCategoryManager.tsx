// Dialóg na správu kategórií/typov (pridanie, premenovanie, zmazanie).
import { useState } from "react";
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
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
import { toast } from "sonner";
import {
  VR_SCOPE_LABEL,
  addVrCategory,
  isCustomVrCategory,
  removeVrCategory,
  renameVrCategory,
  useVrCategories,
  type VrCatScope,
} from "@/lib/vrCategories";

export function VrCategoryManager({ scope }: { scope: VrCatScope }) {
  const categories = useVrCategories(scope);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  function add() {
    if (!draft.trim()) return;
    const created = addVrCategory(scope, draft);
    if (!created) return toast.error("Taká kategória už existuje.");
    setDraft("");
    toast.success("Kategória pridaná.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Spravovať: ${VR_SCOPE_LABEL[scope]}`}>
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Kategórie</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{VR_SCOPE_LABEL[scope]}</DialogTitle>
          <DialogDescription>Pridaj, premenuj alebo zmaž kategórie použité vo formulároch a sumároch.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nová kategória…"
            aria-label="Nová kategória"
          />
          <Button onClick={add} className="bg-vr text-vr-foreground hover:bg-vr/90">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ul className="mt-1 max-h-[320px] space-y-1 overflow-y-auto">
          {categories.map((c) => (
            <li key={`${c.id}-${c.label}`} className="flex items-center gap-2 rounded-lg bg-surface-muted/50 px-3 py-1.5">
              {editId === c.id ? (
                <>
                  <Input
                    className="h-8"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    aria-label="Nový názov kategórie"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Uložiť názov"
                    onClick={() => {
                      renameVrCategory(scope, c.id, editLabel);
                      setEditId(null);
                    }}
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
                      setEditId(c.id);
                      setEditLabel(c.label);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {isCustomVrCategory(scope, c.id) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Zmazať ${c.label}`}
                      onClick={() => removeVrCategory(scope, c.id)}
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
