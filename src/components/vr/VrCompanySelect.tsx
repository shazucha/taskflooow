// Výber firmy/dodávateľa s možnosťou pridať novú priamo z formulára.
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useVrCategories, useVrCategoryActions, type VrCatScope } from "@/lib/vrCategories";

interface Props {
  scope: VrCatScope;
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}

export function VrCompanySelect({ scope, value, onChange, label, className }: Props) {
  const categories = useVrCategories(scope);
  const { add } = useVrCategoryActions(scope);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  async function commit() {
    const name = draft.trim();
    if (!name) return;
    try {
      const created = await add.mutateAsync(name);
      if (created?.key) onChange(created.key);
      setDraft("");
      setAdding(false);
      toast.success("Firma pridaná.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (adding) {
    return (
      <div className={`flex items-center gap-1 ${className ?? ""}`}>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="Názov novej firmy…"
          aria-label="Nová firma"
        />
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Uložiť firmu" onClick={commit} disabled={add.isPending}>
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label="Zrušiť" onClick={() => setAdding(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="min-w-0 flex-1">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0"
        aria-label="Pridať novú firmu"
        title="Pridať novú firmu"
        onClick={() => setAdding(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
