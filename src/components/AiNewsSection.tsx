import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";

// Sekcia AI noviniek — číta z tabuľky ai_news, ktorú denne plní cron + edge funkcia.
type AiNews = {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string;
};

export default function AiNewsSection() {
  const [items, setItems] = useState<AiNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("ai_news")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(60);
    setItems((data as AiNews[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("ai_news_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_news" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const sources = ["all", ...Array.from(new Set(items.map((i) => i.source)))];
  const visible = source === "all" ? items : items.filter((i) => i.source === source);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={source === s ? "default" : "outline"}
            className="h-8 rounded-full text-xs"
            onClick={() => setSource(s)}
          >
            {s === "all" ? "Všetko" : s}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1.5 text-xs" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Obnoviť
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítavam novinky…</p>}

      {!loading && visible.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Newspaper className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Zatiaľ tu nie sú žiadne novinky. Spusti SQL migráciu a nasaď funkciu <code>ai-news-fetch</code>.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((n) => (
          <Card key={n.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px]">{n.source}</Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(n.published_at).toLocaleDateString("sk-SK")}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
            {n.summary && (
              <p className="line-clamp-3 text-xs text-muted-foreground">{n.summary}</p>
            )}
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Čítať <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
