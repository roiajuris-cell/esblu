begin;

-- =============================================================================
-- Esblu — oprava company_invites_accepted_consistency_check (blokoval
-- auth.admin.deleteUser() pre admin/employee, ktorý niekedy prijal pozvánku)
-- =============================================================================
-- Root cause (potvrdený): public.company_invites.accepted_by má
-- `on delete set null` (z 20260814130000, pôvodne pre presne tento účel —
-- aby zrušenie vlastného účtu nebolo blokované FK na auth.users), ALE
-- existujúci CHECK constraint `company_invites_accepted_consistency_check`
-- pri `status = 'accepted'` vyžadoval `accepted_by IS NOT NULL`. Keď
-- Postgres pri `auth.admin.deleteUser()` cascadne nastavil `accepted_by`
-- na NULL (ON DELETE SET NULL), ten istý UPDATE by porušil tento CHECK —
-- Postgres preto celý DELETE zamietol. FK a CHECK si teda vzájomne
-- odporovali a v praxi blokovali presne to, čo `on delete set null` malo
-- umožniť.
--
-- Oprava: CHECK sa mení tak, aby pri `status = 'accepted'` vyžadoval iba
-- `accepted_at IS NOT NULL` (skutočný dôkaz "kedy bola prijatá" — časový
-- údaj sa NIKDY nemaže/nenuluje) a `accepted_by` mohol byť NULL (dôsledok
-- ON DELETE SET NULL po zrušení účtu toho, kto pozvánku prijal). Vetva pre
-- `status <> 'accepted'` (accepted_at aj accepted_by musia byť NULL)
-- zostáva bezo zmeny.
--
-- Nič iné sa touto migráciou nemení — žiadny iný constraint, stĺpec, RLS,
-- RPC ani index na company_invites.
-- =============================================================================

alter table public.company_invites
  drop constraint if exists company_invites_accepted_consistency_check;

alter table public.company_invites
  add constraint company_invites_accepted_consistency_check
  check (
    (
      status = 'accepted'
      and accepted_at is not null
    )
    or
    (
      status <> 'accepted'
      and accepted_at is null
      and accepted_by is null
    )
  );

commit;
