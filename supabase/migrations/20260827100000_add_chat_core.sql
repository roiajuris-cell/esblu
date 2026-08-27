begin;

-- =============================================================================
-- Esblu — Interný firemný chat (V1): jadro (tabuľky, RLS, triggery, RPC)
-- =============================================================================
-- Kontext a rozhodnutia (plný audit a schválený plán predchádzali tejto
-- migrácii, nie je opakovaný tu v plnom rozsahu):
--   - Firemný spoločný kanál (type='company', presne 1 na firmu) + súkromné
--     1:1 konverzácie (type='direct', presne 1 na dvojicu používateľov v tej
--     istej firme) — jedna tabuľka `chat_conversations` pre oba typy.
--   - Prístup k firemnému kanálu je odvodený VÝHRADNE z aktívneho company
--     membershipu (`company_id = esblu_my_active_company_id()`), presne ako
--     vehicles/machines/documents a pod. — ŽIADNA samostatná "add member to
--     channel" bootstrap logika nie je potrebná: nový člen (po prijatí
--     pozvánky, `esblu_accept_company_invite`) vidí firemný kanál okamžite,
--     rovnako ako okamžite vidí vozidlá/stroje/dokumenty firmy.
--   - Prístup k 1:1 konverzácii je odvodený VÝHRADNE z explicitných riadkov
--     v `chat_conversation_members` (iba 2 riadky na konverzáciu) — na
--     rozdiel od firemného kanála tu `company_id` sám osebe nestačí (nesmie
--     vidieť každý člen firmy, iba dvaja konkrétni účastníci).
--   - `chat_conversation_members` slúži DVOJAKO: (a) ACL pre 1:1 konverzácie,
--     (b) úložisko `last_read_at` pointera pre unread stav OBOCH typov
--     konverzácií (aj firemný kanál — riadok sa lenivo vytvorí/aktualizuje
--     pri prvom prečítaní cez `esblu_mark_conversation_read`).
--   - Žiadny priamy klientský INSERT/UPDATE na `chat_conversations` ani
--     `chat_conversation_members` ani `chat_message_references` — iba cez
--     SECURITY DEFINER RPC nižšie (rovnaký vzor ako `company_invites`,
--     `company_dpa_acceptances`). `chat_messages`/`chat_attachments` majú
--     priame INSERT/UPDATE policies (bežný chat flow, rovnaký vzor ako
--     `documents`/`document_attachments`).
--   - `author_id` na `chat_messages` je `ON DELETE SET NULL` (nie CASCADE) —
--     správy vo FIREMNOM kanáli prežijú zrušenie autorovho účtu, rovnaký
--     princíp ako `document_review_log.user_id`. Zobrazí sa ako "bývalý
--     člen".
--   - 1:1 konverzácie majú ROVNAKÝ princíp ako firemný kanál — história
--     PREŽÍVA zrušenie účtu ktoréhokoľvek účastníka (revidované rozhodnutie,
--     nahrádza pôvodný CASCADE návrh): `chat_conversations.direct_user_low/
--     direct_user_high` sú `ON DELETE SET NULL` na `auth.users` (nie
--     CASCADE). Zrušenie účtu teda: (a) vynuluje príslušný slot
--     direct_user_low/high (historický záznam "kto boli tí dvaja" sa čiastočne
--     stráca, ale konverzácia ostáva identifikovateľná pre zostávajúceho
--     účastníka cez jeho vlastný `chat_conversation_members` riadok), (b)
--     cez `chat_conversation_members.user_id on delete cascade` zmaže IBA
--     ACL/read-pointer riadok zrušeného používateľa (ten už nemá — a ani
--     nemôže mať, keďže auth.uid() preň viac neexistuje — žiadny prístup),
--     (c) `chat_messages.author_id on delete set null` (pozri vyššie) necháva
--     samotné správy a ich obsah nedotknuté, autor sa zobrazí ako "bývalý
--     člen" — identicky pre firemný kanál AJ 1:1. Zostávajúci účastník tak
--     vidí celú históriu presne tak, ako keby žiadny odchod nenastal.
--     `chat_conversations_direct_users_check` nižšie preto pripúšťa, aby
--     `direct_user_low`/`direct_user_high` boli po vytvorení (nie však pri
--     ňom — to vynucuje výhradne RPC) jednotlivo NULL; stále zakazuje, aby
--     boli rovnaké, keď sú obe vyplnené (ochrana pred dátovou korupciou).
--     Fyzické zmazanie CELEJ konverzácie/histórie nastáva VÝHRADNE cez
--     zrušenie firmy (`esblu_owner_delete_company`, explicitný DELETE podľa
--     company_id, bod 12 nižšie), nikdy cez zrušenie jednotlivého účtu.
--   - Entity reference (bod "Pripojiť z Esblu") NEUKLADÁ snapshot citlivých
--     dát — iba `entity_type` + `entity_id` (bez FK, polymorfné, rovnaký
--     vzor ako `document_review_log.document_ref`). Zobrazenie karty v UI
--     vždy robí ŽIVÝ SELECT cez bežné RLS prihláseného používateľa — ak
--     neskôr príde o prístup (alebo je objekt zmazaný), karta to correctně
--     odzrkadlí, nikdy neobíde pôvodné oprávnenia.
--   - DPA gate (`esblu_require_company_dpa_current`, 20260816090000) sa
--     pridáva na `chat_messages` a `chat_attachments` (skutočný nový OBSAH
--     s možnými osobnými údajmi tretích strán) — ale ZÁMERNE NIE na
--     `chat_conversations`/`chat_conversation_members`/
--     `chat_message_references` (čisto štrukturálne/relačné riadky bez
--     vlastného obsahu), presne rovnaká logika ako vynechanie
--     `document_links`/`document_review_log` z DPA gate v 20260816090000.
--   - V1 VEDOME NEOBSAHUJE: owner/admin moderáciu cudzích správ, rate
--     limiting, read-receipty na úrovni jednotlivých správ, thread/reply,
--     reakcie, presence/"píše...", push notifikácie (iba pripravená
--     architektúra — pozri komentáre pri RPC nižšie). Schéma nič z toho do
--     budúcna neblokuje.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. chat_conversations
-- -----------------------------------------------------------------------------

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,

  type text not null,

  -- Iba pre type='direct': normalizovaná (least/greatest) dvojica
  -- účastníkov — deterministický spôsob, ako zabrániť duplicitným 1:1
  -- konverzáciám medzi tou istou dvojicou (partial unique index nižšie).
  -- ON DELETE SET NULL — pozri hlavičkový komentár vyššie: história 1:1
  -- konverzácie prežíva zrušenie účtu ktoréhokoľvek účastníka, rovnako ako
  -- vo firemnom kanáli. Unique index nižšie NULL hodnoty navzájom
  -- nekoliduje (Postgres NULL <> NULL v unique indexe), takže osirenutý
  -- slot nebráni ničomu.
  direct_user_low uuid null references auth.users(id) on delete set null,
  direct_user_high uuid null references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  -- Audit údaj (kto kanál/konverzáciu založil), NIE autorizačný. ON DELETE
  -- SET NULL — založenie firemného kanála má prežiť zrušenie účtu zakladateľa.
  created_by uuid null references auth.users(id) on delete set null,

  constraint chat_conversations_type_check check (type in ('company', 'direct')),
  -- Vytvorenie (oba non-null a rôzne) vynucuje výhradne
  -- esblu_get_or_create_direct_conversation() nižšie — tento CHECK iba
  -- chráni pred dátovou korupciou v ĽUBOVOĽNOM stave riadku (aj po tom, čo
  -- ON DELETE SET NULL vyššie jeden alebo oba sloty vynuluje pri zrušení
  -- účtu účastníka): type='company' nesmie mať vyplnený ani jeden slot;
  -- type='direct' nesmie mať OBA sloty rovnaké, ak sú OBA vyplnené (jeden
  -- alebo oba NULL — napr. po odchode účastníka — sú v poriadku).
  constraint chat_conversations_direct_users_check check (
    (
      type = 'direct'
      and (
        direct_user_low is null
        or direct_user_high is null
        or direct_user_low <> direct_user_high
      )
    )
    or (
      type = 'company'
      and direct_user_low is null
      and direct_user_high is null
    )
  )
);

comment on table public.chat_conversations is
  'Firemný spoločný kanál (type=company, max 1 na firmu) alebo súkromná 1:1 '
  'konverzácia (type=direct, max 1 na dvojicu používateľov v tej istej '
  'firme). Prístup k company kanálu = company_id rovnosť (rovnako ako '
  'vehicles/machines); prístup k direct konverzácii = explicitný riadok v '
  'chat_conversation_members. Žiadny priamy klientský INSERT — iba cez '
  'esblu_ensure_company_chat_channel() / esblu_get_or_create_direct_conversation().';

-- Presne 1 firemný kanál na firmu.
create unique index chat_conversations_one_company_channel_idx
  on public.chat_conversations (company_id)
  where type = 'company';

-- Presne 1 direct konverzácia na normalizovanú dvojicu v rámci firmy —
-- zabraňuje duplicitným 1:1 konverzáciám (zadanie, bod 3).
create unique index chat_conversations_direct_pair_idx
  on public.chat_conversations (company_id, direct_user_low, direct_user_high)
  where type = 'direct';

create index chat_conversations_company_id_idx
  on public.chat_conversations (company_id);

alter table public.chat_conversations enable row level security;

revoke all on public.chat_conversations from public, anon, authenticated;
grant select on public.chat_conversations to authenticated;

-- SELECT: company kanál = ktokoľvek aktívny v tej istej firme; direct
-- konverzácia = iba jej dvaja explicitní členovia (chat_conversation_members).
-- Žiadna self-rekurzia: subquery nižšie filtruje chat_conversation_members
-- iba na `user_id = auth.uid()`, presne ako company_members_select_own vzor.
create policy chat_conversations_select_member
  on public.chat_conversations
  for select
  to authenticated
  using (
    (type = 'company' and company_id = public.esblu_my_active_company_id())
    or (
      type = 'direct'
      and exists (
        select 1
        from public.chat_conversation_members m
        where m.conversation_id = chat_conversations.id
          and m.user_id = auth.uid()
      )
    )
  );

-- Zámerne žiadna INSERT/UPDATE/DELETE policy — zápis výhradne cez SECURITY
-- DEFINER RPC nižšie (esblu_ensure_company_chat_channel,
-- esblu_get_or_create_direct_conversation), rovnaký vzor ako company_invites.


-- -----------------------------------------------------------------------------
-- 2. chat_conversation_members
-- -----------------------------------------------------------------------------

create table public.chat_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- NULL = "nikdy neprečítané". Zapisuje sa výhradne cez
  -- esblu_mark_conversation_read() (upsert), nikdy priamym klientským UPDATE.
  last_read_at timestamptz null,
  joined_at timestamptz not null default now(),

  constraint chat_conversation_members_unique unique (conversation_id, user_id)
);

comment on table public.chat_conversation_members is
  'Dvojaký účel: (a) ACL pre direct (1:1) konverzácie — iba členovia tu '
  'uvedení vidia danú konverzáciu; (b) úložisko last_read_at pointera pre '
  'unread stav OBOCH typov konverzácií (aj company kanál). Riadok sa pre '
  'company kanál vytvára LENIVO, pri prvom volaní '
  'esblu_mark_conversation_read() daným používateľom — dovtedy sa firemný '
  'kanál považuje za "nikdy neprečítaný" (všetky správy unread), čo je '
  'správny default. Žiadny priamy klientský INSERT/UPDATE — iba cez RPC.';

create index chat_conversation_members_user_id_idx
  on public.chat_conversation_members (user_id);

create index chat_conversation_members_company_id_idx
  on public.chat_conversation_members (company_id);

alter table public.chat_conversation_members enable row level security;

revoke all on public.chat_conversation_members from public, anon, authenticated;
grant select on public.chat_conversation_members to authenticated;

-- Iba VLASTNÉ riadky (nie riadky spoluúčastníkov 1:1 konverzácie) — identita
-- druhej strany v direct konverzácii sa berie z
-- chat_conversations.direct_user_low/high (viditeľné cez policy vyššie),
-- nie z tejto tabuľky. Bez self-rekurzie, rovnaký vzor ako
-- company_members_select_own.
create policy chat_conversation_members_select_own
  on public.chat_conversation_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- Zámerne žiadna INSERT/UPDATE/DELETE policy — výhradne cez
-- esblu_get_or_create_direct_conversation() (2 riadky pri vytvorení direct
-- konverzácie) a esblu_mark_conversation_read() (upsert last_read_at).


-- -----------------------------------------------------------------------------
-- 3. chat_messages
-- -----------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,

  -- Audit/autorský údaj. ON DELETE SET NULL — správa PREŽIJE zrušenie
  -- autorovho účtu, rovnaký princíp ako document_review_log.user_id.
  -- Platí ROVNAKO pre firemný kanál AJ 1:1 konverzácie (pozri hlavičku
  -- migrácie — chat_conversations.direct_user_low/high je od revízie tiež
  -- ON DELETE SET NULL, nie CASCADE, takže samotná konverzácia ani jej
  -- správy pri zrušení účtu účastníka nezanikajú).
  author_id uuid null references auth.users(id) on delete set null,

  -- Zámerne BEZ "body <> '' OR má prílohu" CHECK: príloha sa do
  -- chat_attachments vkladá AŽ PO úspešnom INSERTe správy (rovnaký
  -- dvojkrokový vzor ako documents → document_attachments), takže by v
  -- momente INSERTu správy vždy zlyhala. Frontend vynucuje "aspoň text alebo
  -- príloha" pred odoslaním; DB iba zakazuje NULL.
  body text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  edited_at timestamptz null,
  -- Soft delete (rovnaký vzor ako documents.deleted_at). Mazanie ide priamo
  -- cez klientský UPDATE gatovaný chat_messages_update_own policy nižšie
  -- (žiadna samostatná RPC nie je potrebná) — appka pri zmazaní navyše
  -- vyprázdni body, takže pôvodný text sa neponecháva čitateľný v DB.
  deleted_at timestamptz null
);

comment on table public.chat_messages is
  'Textové správy firemného chatu (company aj direct konverzácie). '
  'company_id je denormalizovaný (aj keď je odvoditeľný cez '
  'conversation_id → chat_conversations.company_id) — rýchly, priamy RLS '
  'guard bez JOIN, rovnaký vzor ako document_attachments.company_id. '
  'author_id sa vynucuje triggerom auth.uid() (WITH CHECK), nikdy z '
  'klienta. Soft delete cez deleted_at — frontend zobrazí "Správa bola '
  'odstránená" namiesto pôvodného obsahu.';

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at desc);

create index chat_messages_company_id_idx
  on public.chat_messages (company_id);

alter table public.chat_messages enable row level security;

revoke all on public.chat_messages from public, anon, authenticated;
grant select, insert, update on public.chat_messages to authenticated;

-- SELECT: company_id guard (rýchly, indexovaný pre "moja firma") + rozlíšenie
-- company/direct viditeľnosti.
create policy chat_messages_select_company
  on public.chat_messages
  for select
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and (
      exists (
        select 1
        from public.chat_conversations c
        where c.id = chat_messages.conversation_id
          and c.type = 'company'
      )
      or exists (
        select 1
        from public.chat_conversation_members m
        where m.conversation_id = chat_messages.conversation_id
          and m.user_id = auth.uid()
      )
    )
  );

create policy chat_messages_insert_member
  on public.chat_messages
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and author_id = auth.uid()
    and (
      exists (
        select 1
        from public.chat_conversations c
        where c.id = conversation_id
          and c.type = 'company'
          and c.company_id = public.esblu_my_active_company_id()
      )
      or exists (
        select 1
        from public.chat_conversation_members m
        where m.conversation_id = conversation_id
          and m.user_id = auth.uid()
      )
    )
  );

-- UPDATE: iba VLASTNÁ, ešte nezmazaná správa (editácia AJ soft-delete idú
-- cez tento istý UPDATE mechanizmus). Žiadna owner/admin moderácia v V1
-- (schválené rozhodnutie) — autor je jediný, kto smie upraviť/zmazať.
create policy chat_messages_update_own
  on public.chat_messages
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and author_id = auth.uid()
    and deleted_at is null
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and author_id = auth.uid()
  );

-- Zámerne žiadna DELETE policy — mazanie je vždy soft (UPDATE deleted_at),
-- nikdy fyzický DELETE z klienta.

create trigger esblu_assign_company_id_before_insert
before insert on public.chat_messages
for each row execute function public.esblu_assign_company_id();

create trigger esblu_lock_company_id_before_update
before update on public.chat_messages
for each row execute function public.esblu_lock_company_id_on_update();

-- DPA gate — chat správa je nový substantívny obsah, ktorý môže obsahovať
-- osobné údaje tretích strán (rovnaká kategória ako documents/ai_evidence).
create trigger esblu_require_company_dpa_before_insert
before insert on public.chat_messages
for each row execute function public.esblu_require_company_dpa_current();


-- -----------------------------------------------------------------------------
-- 4. chat_attachments
-- -----------------------------------------------------------------------------

create table public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,

  storage_bucket text not null default 'chat-attachments',
  storage_path text not null,
  original_filename text null,
  mime_type text not null,
  file_size bigint not null,

  created_at timestamptz not null default now(),

  constraint chat_attachments_file_size_check check (
    file_size > 0 and file_size <= 15728640
  ),
  constraint chat_attachments_storage_location_unique unique (storage_bucket, storage_path)
);

comment on table public.chat_attachments is
  'Príloha (obrázok/dokument) k chat správe. Storage objekt je v privátnom '
  'bucket-e chat-attachments, cesta {company_id}/{conversation_id}/'
  '{message_id}/{generated_filename} — pozri 20260827110000. original_filename '
  'je iba metadata na zobrazenie, nikdy súčasť Storage cesty. file_size limit '
  '15 MB zrkadlí bucket-level file_size_limit (20260827110000).';

create index chat_attachments_message_id_idx
  on public.chat_attachments (message_id);

create index chat_attachments_company_id_idx
  on public.chat_attachments (company_id);

alter table public.chat_attachments enable row level security;

revoke all on public.chat_attachments from public, anon, authenticated;
grant select, insert on public.chat_attachments to authenticated;

create policy chat_attachments_select_company
  on public.chat_attachments
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

-- INSERT: iba k VLASTNEJ, ešte nezmazanej správe — zabraňuje "podhodenie"
-- prílohy do cudzej správy.
create policy chat_attachments_insert_own_message
  on public.chat_attachments
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and exists (
      select 1
      from public.chat_messages m
      where m.id = chat_attachments.message_id
        and m.author_id = auth.uid()
        and m.company_id = public.esblu_my_active_company_id()
        and m.deleted_at is null
    )
  );

-- Zámerne žiadna UPDATE/DELETE policy v V1 — zmazaná správa (deleted_at)
-- jednoducho prestane zobrazovať svoje prílohy vo frontende; fyzický
-- Storage/DB cleanup je budúci retention mechanizmus (mimo V1, pozri
-- hlavičkový komentár k celej migrácii).

create trigger esblu_assign_company_id_before_insert
before insert on public.chat_attachments
for each row execute function public.esblu_assign_company_id();

create trigger esblu_require_company_dpa_before_insert
before insert on public.chat_attachments
for each row execute function public.esblu_require_company_dpa_current();


-- -----------------------------------------------------------------------------
-- 5. chat_message_references ("Pripojiť z Esblu")
-- -----------------------------------------------------------------------------

create table public.chat_message_references (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,

  entity_type text not null,
  -- ZÁMERNE bez FK (polymorfné, rovnaký vzor ako
  -- document_review_log.document_ref) — cieľová tabuľka sa líši podľa
  -- entity_type. Integrita (existencia + company_id zhoda) sa vynucuje
  -- VÝHRADNE v esblu_attach_chat_message_reference() pri vytvorení, nie
  -- FK-om. Zobrazenie karty v UI robí VŽDY živý SELECT cez bežné RLS —
  -- žiadny snapshot dát tu nie je uložený (zadanie, bod 7).
  entity_id uuid not null,

  created_at timestamptz not null default now(),

  constraint chat_message_references_entity_type_check check (
    entity_type in (
      'vehicle', 'machine', 'inventory_item', 'document',
      'vehicle_service', 'machine_service'
    )
  )
);

comment on table public.chat_message_references is
  'Referencia chat správy na existujúci Esblu objekt ("Pripojiť z Esblu"). '
  'entity_type + entity_id BEZ FK a BEZ snapshot dát — server-side overenie '
  '(existencia + company_id zhoda) robí VÝHRADNE '
  'esblu_attach_chat_message_reference(); UI kartu vždy dorieši živým '
  'SELECT-om cez bežné RLS toho, kto si správu prezerá, takže pri strate '
  'prístupu/zmazaní objektu sa karta korektne prestane zobrazovať/rozlíši, '
  'nikdy neobíde pôvodné oprávnenia.';

create index chat_message_references_message_id_idx
  on public.chat_message_references (message_id);

create index chat_message_references_entity_idx
  on public.chat_message_references (entity_type, entity_id);

alter table public.chat_message_references enable row level security;

revoke all on public.chat_message_references from public, anon, authenticated;
grant select on public.chat_message_references to authenticated;

create policy chat_message_references_select_company
  on public.chat_message_references
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

-- Zámerne žiadna INSERT policy — výhradne cez
-- esblu_attach_chat_message_reference() nižšie (server-side existence +
-- company_id + "referencia iba na vlastnú, nezmazanú správu" kontrola).


-- -----------------------------------------------------------------------------
-- 6. RPC — esblu_ensure_company_chat_channel()
-- -----------------------------------------------------------------------------
-- Idempotentné vytvorenie/nájdenie firemného kanála aktívnej firmy volajúceho.
-- Race-safe cez unique index + EXCEPTION (rovnaký vzor ako
-- esblu_ensure_my_owner_company).

create or replace function public.esblu_ensure_company_chat_channel()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_conversation_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_NO_ACTIVE_COMPANY';
  end if;

  select id into v_conversation_id
  from public.chat_conversations
  where type = 'company' and company_id = v_company_id;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  begin
    insert into public.chat_conversations (company_id, type, created_by)
    values (v_company_id, 'company', v_uid)
    returning id into v_conversation_id;
  exception
    when unique_violation then
      select id into v_conversation_id
      from public.chat_conversations
      where type = 'company' and company_id = v_company_id;
  end;

  return v_conversation_id;
end;
$function$;

comment on function public.esblu_ensure_company_chat_channel() is
  'Idempotentne vráti id firemného kanála aktívnej firmy volajúceho, '
  'založí ho pri prvom volaní. Race-safe (unique index + EXCEPTION). Volané '
  'pri prvom otvorení /chat.';

revoke all on function public.esblu_ensure_company_chat_channel() from public;
grant execute on function public.esblu_ensure_company_chat_channel() to authenticated;


-- -----------------------------------------------------------------------------
-- 7. RPC — esblu_get_or_create_direct_conversation(p_other_user_id)
-- -----------------------------------------------------------------------------

create or replace function public.esblu_get_or_create_direct_conversation(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_other_company_id uuid;
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  if p_other_user_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_MISSING_USER_ID';
  end if;

  if p_other_user_id = v_uid then
    raise exception using errcode = 'P0001', message = 'ESBLU_CANNOT_MESSAGE_SELF';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_NO_ACTIVE_COMPANY';
  end if;

  -- Druhá strana MUSÍ byť aktívny člen TEJ ISTEJ firmy — nikdy sa nedôveruje
  -- iba tomu, že klient poslal nejaké UUID.
  select cm.company_id into v_other_company_id
  from public.company_members cm
  where cm.user_id = p_other_user_id
    and cm.status = 'active'
  limit 1;

  if v_other_company_id is null or v_other_company_id <> v_company_id then
    raise exception using errcode = '42501', message = 'ESBLU_NOT_SAME_COMPANY';
  end if;

  v_low := least(v_uid, p_other_user_id);
  v_high := greatest(v_uid, p_other_user_id);

  select id into v_conversation_id
  from public.chat_conversations
  where type = 'direct'
    and company_id = v_company_id
    and direct_user_low = v_low
    and direct_user_high = v_high;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  begin
    insert into public.chat_conversations (
      company_id, type, direct_user_low, direct_user_high, created_by
    )
    values (v_company_id, 'direct', v_low, v_high, v_uid)
    returning id into v_conversation_id;

    insert into public.chat_conversation_members (conversation_id, company_id, user_id)
    values
      (v_conversation_id, v_company_id, v_uid),
      (v_conversation_id, v_company_id, p_other_user_id);
  exception
    when unique_violation then
      select id into v_conversation_id
      from public.chat_conversations
      where type = 'direct'
        and company_id = v_company_id
        and direct_user_low = v_low
        and direct_user_high = v_high;
  end;

  return v_conversation_id;
end;
$function$;

comment on function public.esblu_get_or_create_direct_conversation(uuid) is
  'Nájde alebo atomicky vytvorí 1:1 konverzáciu medzi volajúcim a '
  'p_other_user_id — obaja musia byť aktívni členovia TEJ ISTEJ firmy '
  '(overené server-side, nikdy z klienta). Deterministický pár '
  '(least/greatest user_id) + unique index zaručujú, že pre tú istú dvojicu '
  'nikdy nevznikne druhá konverzácia (race-safe cez EXCEPTION).';

revoke all on function public.esblu_get_or_create_direct_conversation(uuid) from public;
grant execute on function public.esblu_get_or_create_direct_conversation(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. RPC — esblu_list_company_members_for_chat()
-- -----------------------------------------------------------------------------
-- NA ROZDIEL od esblu_list_my_company_members() (owner/admin-only, správa
-- používateľov) je toto dostupné VŠETKÝM aktívnym rolám — každý člen firmy
-- potrebuje vedieť, komu môže napísať súkromnú správu. Vracia iba
-- user_id/email/role, nič citlivejšie.

create or replace function public.esblu_list_company_members_for_chat()
returns table (
  user_id uuid,
  email text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select m.user_id, u.email, m.role
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = v_company_id
    and m.status = 'active'
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    u.email;
end;
$function$;

comment on function public.esblu_list_company_members_for_chat() is
  'Zoznam aktívnych členov firmy volajúceho (user_id, email, role) — '
  'dostupné VŠETKÝM rolám (na rozdiel od esblu_list_my_company_members(), '
  'ktorá je owner/admin-only pre správu používateľov). Slúži VÝHRADNE na '
  'výber protistrany pre novú 1:1 konverzáciu v chate.';

revoke all on function public.esblu_list_company_members_for_chat() from public;
grant execute on function public.esblu_list_company_members_for_chat() to authenticated;


-- -----------------------------------------------------------------------------
-- 9. RPC — esblu_mark_conversation_read(p_conversation_id)
-- -----------------------------------------------------------------------------

create or replace function public.esblu_mark_conversation_read(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_allowed boolean;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_NO_ACTIVE_COMPANY';
  end if;

  select exists (
    select 1
    from public.chat_conversations c
    where c.id = p_conversation_id
      and (
        (c.type = 'company' and c.company_id = v_company_id)
        or (
          c.type = 'direct'
          and exists (
            select 1
            from public.chat_conversation_members m
            where m.conversation_id = c.id
              and m.user_id = v_uid
          )
        )
      )
  )
  into v_allowed;

  if not v_allowed then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_CONVERSATION_NOT_FOUND_OR_FORBIDDEN';
  end if;

  insert into public.chat_conversation_members (conversation_id, company_id, user_id, last_read_at)
  values (p_conversation_id, v_company_id, v_uid, now())
  on conflict (conversation_id, user_id)
    do update set last_read_at = excluded.last_read_at;
end;
$function$;

comment on function public.esblu_mark_conversation_read(uuid) is
  'Nastaví last_read_at = now() pre volajúceho na danej konverzácii '
  '(upsert). Pred zápisom overí, že volajúci má na konverzáciu skutočne '
  'prístup (company kanál svojej firmy, alebo je explicitným členom direct '
  'konverzácie) — inak ESBLU_CONVERSATION_NOT_FOUND_OR_FORBIDDEN.';

revoke all on function public.esblu_mark_conversation_read(uuid) from public;
grant execute on function public.esblu_mark_conversation_read(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 10. RPC — esblu_get_my_unread_counts()
-- -----------------------------------------------------------------------------
-- Jedno volanie = unread počty pre VŠETKY moje konverzácie naraz (zadanie,
-- bod 8 — žiadne "načítaj všetky správy pri každom otvorení sidebaru").
-- Korelovaný subquery per-konverzácia využíva
-- chat_messages_conversation_created_idx (range scan), nie plný JOIN+GROUP
-- BY cez celú tabuľku — dôležité pri desaťtisícoch správ.

create or replace function public.esblu_get_my_unread_counts()
returns table (
  conversation_id uuid,
  conversation_type text,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    return;
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  with my_conversations as (
    select c.id, c.type
    from public.chat_conversations c
    where (c.type = 'company' and c.company_id = v_company_id)
       or (
         c.type = 'direct'
         and exists (
           select 1
           from public.chat_conversation_members m
           where m.conversation_id = c.id
             and m.user_id = v_uid
         )
       )
  ),
  read_pointers as (
    select m.conversation_id, m.last_read_at
    from public.chat_conversation_members m
    where m.user_id = v_uid
  )
  select
    mc.id,
    mc.type,
    (
      select count(*)
      from public.chat_messages msg
      where msg.conversation_id = mc.id
        and msg.deleted_at is null
        and msg.author_id is distinct from v_uid
        and msg.created_at > coalesce(rp.last_read_at, 'epoch'::timestamptz)
    )
  from my_conversations mc
  left join read_pointers rp on rp.conversation_id = mc.id;
end;
$function$;

comment on function public.esblu_get_my_unread_counts() is
  'Unread počet pre KAŽDÚ konverzáciu volajúceho v jednom volaní — pre '
  'sidebar badge (súčet) aj per-konverzáciu badge. Nezapočítava vlastné '
  'správy ani soft-zmazané. Chýbajúci last_read_at (nikdy neprečítané) sa '
  'berie ako epoch (všetky správy unread).';

revoke all on function public.esblu_get_my_unread_counts() from public;
grant execute on function public.esblu_get_my_unread_counts() to authenticated;


-- -----------------------------------------------------------------------------
-- 11. RPC — esblu_attach_chat_message_reference(p_message_id, p_entity_type, p_entity_id)
-- -----------------------------------------------------------------------------
-- "Pripojiť z Esblu" — server-side overenie PRED vytvorením referencie
-- (zadanie, bod 6): existencia objektu, príslušnosť k tej istej firme.
-- Keďže SELECT na všetkých 6 podporovaných typov je dnes v Esblu vždy
-- company-wide pre všetky role (žiadna jemnejšia ACL na úrovni jednotlivého
-- vozidla/stroja/položky/dokumentu/servisu neexistuje), je tento
-- "company_id zhoda" test súčasne existence-check AJ permission-check.

create or replace function public.esblu_attach_chat_message_reference(
  p_message_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns public.chat_message_references
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_message_company_id uuid;
  v_message_author_id uuid;
  v_message_deleted_at timestamptz;
  v_entity_ok boolean := false;
  v_row public.chat_message_references;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_NO_ACTIVE_COMPANY';
  end if;

  if p_entity_type not in (
    'vehicle', 'machine', 'inventory_item', 'document',
    'vehicle_service', 'machine_service'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVALID_ENTITY_TYPE:' || coalesce(p_entity_type, '');
  end if;

  select m.company_id, m.author_id, m.deleted_at
  into v_message_company_id, v_message_author_id, v_message_deleted_at
  from public.chat_messages m
  where m.id = p_message_id;

  if v_message_company_id is null then
    raise exception using errcode = 'P0001', message = 'ESBLU_MESSAGE_NOT_FOUND';
  end if;

  if v_message_company_id <> v_company_id or v_message_author_id <> v_uid then
    raise exception using errcode = '42501', message = 'ESBLU_FORBIDDEN_NOT_MESSAGE_AUTHOR';
  end if;

  if v_message_deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'ESBLU_MESSAGE_DELETED';
  end if;

  if p_entity_type = 'vehicle' then
    select exists (
      select 1 from public.vehicles v
      where v.id = p_entity_id and v.company_id = v_company_id
    ) into v_entity_ok;
  elsif p_entity_type = 'machine' then
    select exists (
      select 1 from public.machines mm
      where mm.id = p_entity_id and mm.company_id = v_company_id
    ) into v_entity_ok;
  elsif p_entity_type = 'inventory_item' then
    select exists (
      select 1 from public.inventory_items ii
      where ii.id = p_entity_id and ii.company_id = v_company_id
    ) into v_entity_ok;
  elsif p_entity_type = 'document' then
    select exists (
      select 1 from public.documents d
      where d.id = p_entity_id and d.company_id = v_company_id and d.deleted_at is null
    ) into v_entity_ok;
  elsif p_entity_type = 'vehicle_service' then
    select exists (
      select 1 from public.vehicle_services vs
      where vs.id = p_entity_id and vs.company_id = v_company_id
    ) into v_entity_ok;
  elsif p_entity_type = 'machine_service' then
    select exists (
      select 1 from public.machine_services ms
      where ms.id = p_entity_id and ms.company_id = v_company_id
    ) into v_entity_ok;
  end if;

  if not v_entity_ok then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_ENTITY_NOT_FOUND_OR_FORBIDDEN';
  end if;

  insert into public.chat_message_references (message_id, company_id, entity_type, entity_id)
  values (p_message_id, v_company_id, p_entity_type, p_entity_id)
  returning * into v_row;

  return v_row;
end;
$function$;

comment on function public.esblu_attach_chat_message_reference(uuid, text, uuid) is
  'Server-side overenie PRED vytvorením "Pripojiť z Esblu" referencie: '
  'správa je vlastná a nezmazaná, entity_type je z povoleného zoznamu, '
  'cieľový objekt existuje A patrí do tej istej aktívnej firmy volajúceho. '
  'Nikdy nedôveruje entity_id iba od klienta.';

revoke all on function public.esblu_attach_chat_message_reference(uuid, text, uuid) from public;
grant execute on function public.esblu_attach_chat_message_reference(uuid, text, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 12. esblu_owner_delete_company() — doplnené o chat tabuľky (žiadny orphan
--     / žiadne porušenie ON DELETE RESTRICT pri zrušení firemného účtu).
--     Rovnaké telo ako 20260823090000 (potvrdené repository-wide auditom
--     ako chronologicky najnovšia verzia pred touto migráciou — žiadna
--     migrácia medzi 20260823090000 a touto túto funkciu nepredefinovala),
--     iba pridaný blok pre 5 nových chat tabuliek (child pred parent, pred
--     "companies").
-- -----------------------------------------------------------------------------

create or replace function public.esblu_owner_delete_company(p_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_owner_id_check uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
begin
  if p_owner_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_MISSING_USER_ID';
  end if;

  select cm.company_id into v_company_id
  from public.company_members cm
  where cm.user_id = p_owner_user_id
    and cm.status = 'active'
    and cm.role = 'owner'
  limit 1;

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NOT_ACTIVE_OWNER',
      hint = 'Volajúci nemá aktívny company_members riadok s rolou owner.';
  end if;

  select c.owner_id into v_owner_id_check
  from public.companies c
  where c.id = v_company_id;

  if v_owner_id_check is null or v_owner_id_check <> p_owner_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_OWNER_MISMATCH',
      hint = 'companies.owner_id nesúhlasí s company_members rolou owner pre tohto používateľa — zastavené pred zmazaním, over dáta manuálne.';
  end if;

  -- NOVÉ (20260827100000): chat tabuľky, presné poradie child → parent.
  -- chat_conversations.company_id je ON DELETE RESTRICT na companies
  -- (rovnaký vzor ako vehicle_photos/vehicle_vignettes), takže musí byť
  -- prázdna PRED zmazaním companies riadku nižšie. FK cascade
  -- (conversation_id/message_id) by DB riadky zmazal aj sám, explicitný
  -- DELETE tu je konzistentný so zvyškom funkcie a dáva presný počet do
  -- deleted_counts.
  delete from public.chat_message_references where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('chat_message_references', v_n);

  delete from public.chat_attachments where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('chat_attachments', v_n);

  delete from public.chat_messages where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('chat_messages', v_n);

  delete from public.chat_conversation_members where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('chat_conversation_members', v_n);

  delete from public.chat_conversations where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('chat_conversations', v_n);

  -- Business tabuľky, presné poradie kvôli FK (child pred parent).
  delete from public.document_attachments where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_attachments', v_n);

  delete from public.document_links where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_links', v_n);

  delete from public.document_review_log where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_review_log', v_n);

  delete from public.documents where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('documents', v_n);

  delete from public.inventory_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('inventory_photos', v_n);

  delete from public.inventory_items where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('inventory_items', v_n);

  delete from public.machine_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machine_photos', v_n);

  delete from public.machine_services where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machine_services', v_n);

  delete from public.machines where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machines', v_n);

  delete from public.vehicle_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_photos', v_n);

  delete from public.vehicle_vignettes where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_vignettes', v_n);

  delete from public.vehicle_services where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_services', v_n);

  delete from public.vehicles where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicles', v_n);

  delete from public.ai_evidence where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ai_evidence', v_n);

  -- Firemné/právne záznamy.
  delete from public.company_invites where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_invites', v_n);

  delete from public.company_dpa_acceptances where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_dpa_acceptances', v_n);

  -- Memberships (VŠETCI členovia — owner, admin, employee) + company.
  delete from public.company_members where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_members', v_n);

  delete from public.companies where id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('companies', v_n);

  -- Ownerove vlastné user-scoped záznamy (auth.users sa maže mimo tejto
  -- funkcie, cez Admin API, ako posledný krok v API route).
  delete from public.settings where user_id = p_owner_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('settings', v_n);

  delete from public.user_legal_acceptances where user_id = p_owner_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('user_legal_acceptances', v_n);

  return jsonb_build_object(
    'company_id', v_company_id,
    'deleted_counts', v_counts
  );
end;
$function$;

comment on function public.esblu_owner_delete_company(uuid) is
  'Atomicky zmaže CELÚ firmu (business dáta VRÁTANE chatu od '
  '20260827100000, vehicle_vignettes od 20260823090000, vehicle_photos od '
  '20260816110000, invites, DPA acceptances, všetky memberships, companies '
  'riadok) + ownerov vlastný settings a user_legal_acceptances riadok. '
  'company_id sa odvodí a dvojito overí VÝHRADNE z p_owner_user_id '
  '(company_members rola=owner AND companies.owner_id), nikdy z externého '
  'parametra. Nemaže Storage objekty ani auth.users — to je zodpovednosť '
  'volajúcej server-side API route. Spustiteľné výhradne cez service_role.';

revoke all on function public.esblu_owner_delete_company(uuid) from public;
revoke all on function public.esblu_owner_delete_company(uuid) from anon;
revoke all on function public.esblu_owner_delete_company(uuid) from authenticated;
grant execute on function public.esblu_owner_delete_company(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 13. Realtime publikácia — chat_messages je PRVÁ tabuľka v Esblu, ktorá
--     používa Supabase Realtime (repository-wide audit potvrdil, že doteraz
--     sa nikde v appke nevolá supabase.channel()/postgres_changes).
--     RLS platí aj pre Realtime, takže toto samo osebe nič nesprístupňuje
--     naviac — iba umožňuje klientom prihlásiť sa na odber zmien, ktoré by
--     aj tak videli cez normálny SELECT. Idempotentné (kontrola cez
--     pg_publication_tables pred ALTER PUBLICATION), bezpečné pri
--     opakovanom spustení.
-- -----------------------------------------------------------------------------

do $enable_realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_attachments'
  ) then
    alter publication supabase_realtime add table public.chat_attachments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_message_references'
  ) then
    alter publication supabase_realtime add table public.chat_message_references;
  end if;
exception
  when undefined_object then
    -- Publikácia 'supabase_realtime' v tomto prostredí neexistuje (nemalo by
    -- nastať v štandardnom Supabase projekte, ale fail-safe namiesto pádu
    -- celej migrácie) — Realtime pre chat treba v tom prípade zapnúť ručne
    -- cez Supabase Dashboard → Database → Replication. Zvyšok migrácie
    -- (tabuľky/RLS/RPC) je platný a funkčný aj bez tohto kroku, iba
    -- real-time doručovanie správ bude dovtedy nefunkčné (fallback: appka
    -- si po reconnect/otvorení vždy urobí bežný fetch).
    raise notice 'ESBLU_CHAT: publikácia supabase_realtime neexistuje — zapni Realtime pre chat_messages/chat_attachments/chat_message_references ručne v Supabase Dashboard → Database → Replication.';
end
$enable_realtime$;

commit;
