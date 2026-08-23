-- AI Novinky: tabuľka + RLS + automatický zber cez pg_cron
create table if not exists public.ai_news (
  id uuid primary key default gen_random_uuid(),
  source text not null,          -- napr. OpenAI, Anthropic, Google, Higgsfield
  title text not null,
  url text not null unique,
  summary text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select on public.ai_news to authenticated;
grant all on public.ai_news to service_role;

alter table public.ai_news enable row level security;

drop policy if exists "Prihlásení môžu čítať novinky" on public.ai_news;
create policy "Prihlásení môžu čítať novinky"
on public.ai_news for select to authenticated using (true);

create index if not exists ai_news_published_idx on public.ai_news (published_at desc);

-- Realtime
alter table public.ai_news replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.ai_news;
  exception when duplicate_object then null;
  end;
end $$;

-- Mini cron: každý deň o 6:00 zavolá edge funkciu ai-news-fetch
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- POZOR: nahraď <PROJECT_REF> a <SERVICE_ROLE_KEY> vlastnými hodnotami
select cron.unschedule('ai-news-daily') where exists (select 1 from cron.job where jobname = 'ai-news-daily');
select cron.schedule(
  'ai-news-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ai-news-fetch',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
