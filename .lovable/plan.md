## Cieľ
Umožniť editáciu "Náplne predplatného" pre konkrétny mesiac tak, aby zmeny **neovplyvnili ostatné mesiace** ani globálnu šablónu.

## Model: Šablóna + mesačný snapshot

- **Šablóna** (`project_recurring_works`) zostáva — definuje default pre nové mesiace.
- **Mesačný snapshot** (nová tabuľka `project_monthly_works`) — keď používateľ prvýkrát v danom mesiaci niečo zmení (pridá/edituje/zmaže/preusporiada), automaticky sa skopírujú položky šablóny do tohto mesiaca a ďalej sa edituje len snapshot.
- Ak snapshot pre mesiac neexistuje → karta zobrazuje šablónu (ako doteraz).
- Ak existuje → karta zobrazuje snapshot mesiaca.

## Nové funkcie v UI karty

1. **Indikátor stavu mesiaca**:
   - Badge "Šablóna" (default) alebo "Upravené pre {mesiac}" (snapshot existuje).
2. **Inline editácia položky** (ceruzka) — názov + poznámka, len v rámci mesiaca.
3. **Tlačidlo "Resetovať mesiac na šablónu"** — zmaže snapshot, vráti default.
4. **Tlačidlo "Uložiť ako novú šablónu"** (admin/owner) — prepíše `project_recurring_works` aktuálnym snapshotom, nech sa zmena prejaví v ďalších mesiacoch.
5. Existujúce: pridať / zmazať / drag-reorder / checkbox hotovo — všetko funguje per mesiac.

## Schéma (migrácia)

```sql
create table public.project_monthly_works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  month_key text not null,                 -- 'YYYY-MM'
  title text not null,
  note text,
  position int not null default 0,
  source_work_id uuid references project_recurring_works(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, month_key, id)
);
create index on project_monthly_works (project_id, month_key, position);
-- RLS: rovnaké pravidlá ako project_recurring_works (member/owner/admin)
```

**Completions**: `project_recurring_work_completions` zostáva. Pridáme nullable `monthly_work_id uuid` referenciu na `project_monthly_works`. Pri snapshote sa existujúce completions premapujú cez `source_work_id → monthly_work.id`. Pri zobrazení karta používa buď `work_id` (template) alebo `monthly_work_id` (snapshot) podľa toho, čo má mesiac.

## Logika materializácie (frontend mutácia)

Pomocná funkcia `ensureMonthSnapshot(projectId, monthKey)`:
1. Skontroluj či `project_monthly_works` má riadky pre (project, month).
2. Ak nie → INSERT všetkých riadkov zo šablóny s `source_work_id`.
3. Vráť snapshot riadky.

Volá sa pred každou edit operáciou (add/edit/delete/reorder/toggle) v mesiaci. Pred prvou edit operáciou je karta read-from-template.

## Súbory

- `migrations/20260516_project_monthly_works.sql` (nová)
- `src/lib/types.ts` — pridať `ProjectMonthlyWork`
- `src/lib/queries.ts` — nové hooky: `useProjectMonthlyWorks(projectId, monthKey)`, `useEnsureMonthSnapshot`, `useUpdateMonthlyWork`, `useResetMonthSnapshot`, `useSaveSnapshotAsTemplate`. Upraviť toggle/create/delete/reorder aby pracovali s monthly verziou.
- `src/components/MonthlyDeliverablesCard.tsx` — refactor: zobrazovať buď template alebo snapshot, pridať edit/reset/save-as-template tlačidlá, indikátor.

## Akceptačné kritériá

- Pridanie položky vo februári sa neobjaví v marci.
- Zmazanie položky v marci nezruší ju vo februári ani v šablóne.
- Resetovať mesiac vráti default zo šablóny.
- "Uložiť ako šablóna" prepíše default pre budúce mesiace, neovplyvní existujúce snapshoty.
- Doterajšie completions zostanú viditeľné.
