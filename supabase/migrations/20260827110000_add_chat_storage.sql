begin;

-- =============================================================================
-- Esblu — Interný firemný chat (V1): Storage bucket + policies
-- =============================================================================
-- Nadväzuje na 20260827100000_add_chat_core.sql (chat_conversations,
-- chat_conversation_members, chat_messages, chat_attachments,
-- chat_message_references).
--
-- Storage path contract (appka, mimo tejto migrácie):
--   {company_id}/{conversation_id}/{message_id}/{generated_filename}
--   - generovaný názov súboru (nie pôvodný) — rovnaký princíp ako
--     ai-inbox-documents (20260812160000): pôvodný názov ostáva iba v
--     public.chat_attachments.original_filename, nikdy súčasť cesty.
--   - bucket je privátny (public = false); náhľad/download iba cez
--     createSignedUrl, nikdy cez verejnú/permanentnú URL.
--
-- Bezpečnostný princíp RLS nižšie: NEDÔVERUJE sa literálnym hodnotám v ceste
-- (company_id/conversation_id v path[1]/path[2] sú iba organizačné/
-- debugovacie, appka ich vypĺňa správne, ale RLS to samo osebe nevynucuje).
-- Skutočná autorizácia sa vždy odvodí AŽ z public.chat_messages riadku
-- zodpovedajúceho message_id v path[3] — presne ten istý vzor viditeľnosti
-- (company kanál vs. direct member), aký používa
-- chat_messages_select_company policy v jadrovej migrácii. Ak by teda niekto
-- poslal Storage request s "vymysleným" company_id/conversation_id v ceste,
-- ale message_id v path[3] neexistuje / nepatrí mu / patrí inej konverzácii,
-- žiadna policy nižšie neprejde.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Bucket chat-attachments
-- -----------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  15728640, -- 15 MB, zhodné s chat_attachments_file_size_check aj ai-inbox-documents
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. storage.objects policies — iba pre bucket chat-attachments
-- -----------------------------------------------------------------------------

-- SELECT: rovnaká viditeľnosť ako chat_messages_select_company v jadrovej
-- migrácii — company kanál = ktokoľvek z aktívnej firmy správy; direct
-- konverzácia = iba jej explicitní členovia.
create policy chat_attachments_select_conversation_member
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id = ((storage.foldername(name))[3])::uuid
        and m.company_id = public.esblu_my_active_company_id()
        and (
          exists (
            select 1
            from public.chat_conversations c
            where c.id = m.conversation_id
              and c.type = 'company'
          )
          or exists (
            select 1
            from public.chat_conversation_members cm
            where cm.conversation_id = m.conversation_id
              and cm.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: iba autor CIEĽOVEJ, ešte nezmazanej správy (message_id z path[3]
-- musí už existovať — appka najprv vytvorí chat_messages riadok, až potom
-- nahráva prílohu naň, rovnaký dvojkrokový vzor ako documents →
-- document_attachments).
create policy chat_attachments_insert_own_message
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_messages m
      where m.id = ((storage.foldername(name))[3])::uuid
        and m.author_id = auth.uid()
        and m.company_id = public.esblu_my_active_company_id()
        and m.deleted_at is null
    )
  );

-- Zámerne žiadna UPDATE/DELETE policy v V1 — rovnaké odôvodnenie ako
-- chýbajúca UPDATE/DELETE policy na public.chat_attachments (jadrová
-- migrácia): fyzický cleanup je budúci retention mechanizmus, mimo V1.

commit;
