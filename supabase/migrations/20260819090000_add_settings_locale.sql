begin;

-- =============================================================================
-- Esblu — viacjazyčné rozhranie (SK/DE/EN): uloženie preferovaného jazyka
-- prihláseného používateľa do public.settings.
-- =============================================================================
-- Kontext: appka dostáva plnohodnotnú i18n podporu (sk/de/en). Nepriradenému
-- návštevníkovi sa jazyk ukladá iba na klientovi (cookie), ale prihlásený
-- používateľ má mať preferovaný jazyk zachovaný naprieč zariadeniami/
-- prehliadačmi — na to potrebuje appka jedno miesto v DB. public.settings
-- už dnes existuje presne na tento účel (jeden riadok na používateľa,
-- 1:1 s auth.users cez UNIQUE (user_id), RLS "Users can manage own settings"
-- — auth.uid() = user_id, pre VŠETKY role rovnako, nie iba owner/admin).
-- Táto migrácia je preto čisto ADITÍVNA:
--   - pridáva jeden nullable stĺpec settings.locale (NULL = zatiaľ
--     nezvolené, appka použije klientský/cookie fallback na "sk"),
--   - pridáva CHECK constraint obmedzujúci hodnotu na presne tri podporované
--     jazyky, aby appka nikdy nedostala neplatnú hodnotu z priameho SQL
--     zápisu (klient aj tak posiela iba tieto tri hodnoty),
--   - NEMENÍ žiadny existujúci stĺpec, RLS policy, trigger ani inú tabuľku.
-- settings NIE JE súčasťou company-based RLS refaktoru (20260814160000
-- explicitne uvádza "NEMENÍ: ... settings ...") — zostáva rýdzo per-user
-- tabuľka, čo je pre osobnú jazykovú preferenciu presne správne miesto
-- (jazyk UI je vlastnosť človeka, nie firmy).
-- =============================================================================

alter table public.settings
  add column if not exists locale text null;

alter table public.settings
  drop constraint if exists settings_locale_check;

alter table public.settings
  add constraint settings_locale_check check (
    locale is null or locale in ('sk', 'de', 'en')
  );

comment on column public.settings.locale is
  'Preferovaný jazyk UI prihláseného používateľa (sk/de/en). NULL = zatiaľ '
  'nezvolené, appka použije klientský cookie fallback (predvolene sk). '
  'Nastavuje sa výhradne z appky (jazykový prepínač), nikdy priamo z AI '
  'extrakcie ani z iného automatizovaného procesu.';

commit;
