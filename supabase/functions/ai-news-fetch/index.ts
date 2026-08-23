// Zber AI noviniek z verejných RSS/Atom zdrojov a uloženie do tabuľky ai_news.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEEDS: { source: string; url: string }[] = [
  { source: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { source: "Anthropic (Claude)", url: "https://www.anthropic.com/rss.xml" },
  { source: "Google / Gemini", url: "https://blog.google/technology/google-deepmind/rss/" },
  { source: "Higgsfield", url: "https://news.google.com/rss/search?q=Higgsfield+AI&hl=sk&gl=SK&ceid=SK:sk" },
  { source: "AI všeobecne", url: "https://news.google.com/rss/search?q=AI+n%C3%A1stroje&hl=sk&gl=SK&ceid=SK:sk" },
];

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseFeed(xml: string, source: string) {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.slice(0, 8).map((b) => {
    const link = tag(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published");
    const parsed = date ? new Date(date) : new Date();
    return {
      source,
      title: tag(b, "title").slice(0, 300),
      url: link,
      summary: (tag(b, "description") || tag(b, "summary")).slice(0, 500) || null,
      published_at: isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    };
  }).filter((r) => r.title && r.url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rows: unknown[] = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "TaskFlow AI News" } });
      if (!res.ok) continue;
      rows.push(...parseFeed(await res.text(), feed.source));
    } catch (_e) {
      // zdroj preskočíme, aby zlyhanie jedného feedu nezhodilo celý beh
    }
  }

  if (rows.length) {
    await supabase.from("ai_news").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
  }

  // upratanie: držíme 60 dní histórie
  const cutoff = new Date(Date.now() - 60 * 864e5).toISOString();
  await supabase.from("ai_news").delete().lt("published_at", cutoff);

  return new Response(JSON.stringify({ inserted: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
