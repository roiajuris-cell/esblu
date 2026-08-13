begin;

-- =============================================================================
-- Esblu — pridanie document_type "insurance" (PZP / poistná zmluva) do
-- public.documents.
-- =============================================================================
-- Kontext: AI Inbox save flow sa rozširuje o ukladanie ďalších typov
-- dokumentov (bloček, faktúra, PZP/poistná zmluva, servisný doklad, iné) do
-- už existujúceho all-purpose modelu public.documents / public.document_links
-- (pozri 20260812150000_add_ai_inbox_core_tables.sql). documents.document_type
-- dosiaľ povoľoval iba 'weigh_ticket', 'delivery_note', 'invoice', 'receipt',
-- 'service_document', 'other' — chýba 'insurance' pre poistné dokumenty,
-- ktoré /api/scan-document od tejto zmeny vie rozpoznať a extrahovať
-- (insuranceFields).
--
-- Táto migrácia je čisto ADITÍVNA:
--   - jediná zmena je CHECK constraint na public.documents.document_type,
--     rozšírený o novú povolenú hodnotu 'insurance',
--   - NEMENÍ žiadny stĺpec, index, RLS policy, trigger ani inú tabuľku,
--   - NEMENÍ ai_evidence, jej Storage bucket ani vážny lístok / dodací list
--     flow (ten zostáva na ai_evidence, bezo zmeny),
--   - rozšírenie povolenej množiny hodnôt je vždy spätne kompatibilné:
--     existujúce riadky spĺňajúce starý (užší) constraint automaticky
--     spĺňajú aj nový (širší) constraint, takže migrácia nemôže zlyhať na
--     existujúcich dátach a nič nemaže ani neprepisuje.
-- =============================================================================

alter table public.documents
  drop constraint if exists documents_document_type_check;

alter table public.documents
  add constraint documents_document_type_check check (
    document_type in (
      'weigh_ticket',
      'delivery_note',
      'invoice',
      'receipt',
      'insurance',
      'service_document',
      'other'
    )
  );

commit;
