import { useEffect, useState } from "react";
import { Sparkles, Plus, Trash2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sk } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useIsAppAdmin } from "@/lib/queries";
import { toast } from "sonner";

interface ChangelogEntry {
  id: string;
  entry_date: string;
  items: string[];
}

export function AppChangelogCard() {
  const isAdmin = useIsAppAdmin();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_changelog")
      .select("id, entry_date, items")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setEntries((data ?? []).map((e) => ({ ...e, items: Array.isArray(e.items) ? (e.items as string[]) : [] })));
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    const items = text
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
    if (items.length === 0) {
      toast.error("Pridaj aspoň jednu odrážku");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("app_changelog").insert({ entry_date: date, items });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Novinka pridaná");
    setText("");
    setAdding(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Zmazať tento záznam?")) return;
    const { error } = await supabase.from("app_changelog").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <section className="card-elevated mt-4 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Novinky aplikácie</p>
          <p className="text-xs text-muted-foreground">Zoznam zmien a vylepšení.</p>
        </div>
        {isAdmin && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Pridať
          </Button>
        )}
      </div>

      {adding && isAdmin && (
        <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-auto"
            />
            <Button size="icon" variant="ghost" className="ml-auto h-8 w-8" onClick={() => { setAdding(false); setText(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Každý riadok = jedna odrážka\nNapr.\nOprava notifikácií\nNová sekcia v profile"}
            rows={5}
          />
          <Button size="sm" onClick={save} disabled={saving} className="w-full">
            {saving ? "Ukladám..." : "Uložiť novinku"}
          </Button>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {loading && <p className="text-xs text-muted-foreground">Načítavam...</p>}
        {!loading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground">Zatiaľ žiadne novinky.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                {format(parseISO(e.entry_date), "d. MMMM yyyy", { locale: sk })}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Zmazať"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {e.items.map((it, i) => (
                <li key={i} className="text-foreground/90">{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}