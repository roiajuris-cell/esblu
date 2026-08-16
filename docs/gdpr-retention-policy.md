# Politika uchovávania údajov (Retention Policy)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15 (aktualizované 2026-08-16 — pozri revíznu poznámku nižšie)

---

## Revízia 2026-08-16

Aktualizácia podľa reálneho stavu implementácie a následného právneho posúdenia:

- Doplnená sekcia 2.12 (`document_review_log`) — nový nález, dovtedy tento dokument tabuľku vôbec nespomínal.
- Sekcie 2.1, 2.2, 2.3, 2.4, 2.11 doplnené o skutočný implementovaný stav account/company deletion flow (`/api/account/delete`, `esblu_owner_delete_company`, `esblu_member_delete_self`, migrácia `20260816100000`) — predtým označené ako `LEGAL_DECISION_REQUIRED`/neoverené, dnes reálne funkčné.
- Sekcia 2.5 doplnená o výsledok následného právneho posúdenia: automatizovaná redakcia/detekcia rodného čísla v OCR výstupe sa **nepovažuje za samostatne vyžadovanú konkrétnu technológiu** — čl. 32 GDPR vyžaduje primerané opatrenia zodpovedajúce riziku, nie mandátny nástroj. Zostáva vedomé, zdokumentované rizikové rozhodnutie.
- Sekcia 2.6 doplnená o potvrdené nastavenie OpenAI účtu „Data sharing: Disabled" (2026-08-16).
- Sekcia 2.7 doplnená o `vehicle-photos` bucket (predtým chýbal v zozname).
- Sekcie 2.9 a 2.10 doplnené o potvrdené regióny (Vercel Functions `fra1`, Supabase `eu-central-1`) — retenčné lehoty samotné (logy/zálohy) zostávajú TODO.
- Sekcia 3 (súhrnná tabuľka) aktualizovaná zodpovedajúco.
- Žiadny nový automatizovaný retenčný mechanizmus, cron job ani redakčný nástroj nebol týmto zavedený — ide výhradne o zosúladenie dokumentácie s reálnym stavom kódu/infraštruktúry a s novým právnym posúdením.

---

## 1. Súčasný stav (úprimné priznanie)

**K dnešnému dňu (2026-08-15) v Esblu neexistuje žiadna automatizovaná politika uchovávania ani mazania údajov.** Potvrdené auditom kódu a infraštruktúry: v repozitári sa nenachádza žiadny cron job, žiadna Supabase Edge Function ani žiadne použitie `pg_cron`. Všetky dáta sa v praxi uchovávajú **neurčito (indefinitely)**, kým nie sú manuálne vymazané (napr. používateľom cez appku, alebo priamym administratívnym zásahom).

Toto je **známa medzera (known gap)** v súlade s princípom minimalizácie údajov a obmedzenia uloženia podľa čl. 5 ods. 1 písm. e) GDPR ("storage limitation"). Účelom tohto dokumentu je (a) transparentne zdokumentovať súčasný stav a (b) navrhnúť kritériá uchovávania pre jednotlivé kategórie údajov, ktoré by mali byť implementované pred alebo čoskoro po spustení produkcie.

**Dôležité:** tento dokument zámerne **nevymýšľa konkrétne číselné retenčné lehoty** (napr. "vymazať po 90 dňoch") tam, kde takéto rozhodnutie ešte nebolo urobené. Namiesto toho navrhuje **kritériá**, na základe ktorých má zakladateľ/právnik rozhodnúť o konkrétnych lehotách – tieto miesta sú označené `LEGAL_DECISION_REQUIRED`.

---

## 2. Navrhované kritériá uchovávania podľa kategórie údajov

### 2.1 Autentifikačné a účtové údaje (`auth.users`, `settings`)

- **Kritérium:** Uchovávať po celú dobu, kým je používateľský účet aktívny.
- **Po zrušení účtu — AKTUÁLNY STAV (implementované, potvrdené 2026-08-16):** Samoobslužné zrušenie účtu (`POST /api/account/delete`, DB strana `supabase/migrations/20260816100000_add_account_self_deletion.sql`) vykonáva **okamžité, nevratné** vymazanie — žiadna "cool-off" lehota na obnovu nie je implementovaná. Owner potvrdzuje presnou frázou ("ZRUŠIŤ FIRMU"); poradie krokov je Storage cleanup → atomická DB transakcia (`esblu_owner_delete_company`/`esblu_member_delete_self`) → `auth.users` cez Admin API → nezávislá post-verifikácia. Zavedenie cool-off lehoty pred trvalým vymazaním zostáva voliteľným budúcim vylepšením (nie je implementované ani touto revíziou), nie je to však blokujúca medzera — okamžité vymazanie na explicitnú, potvrdenú žiadosť používateľa je v súlade s čl. 17 GDPR.

### 2.2 Firemné/organizačné údaje (`companies`, `company_members`)

- **Kritérium:** Uchovávať, kým je firemný účet aktívny (má aspoň jedného člena a aktívny plán/používanie).
- **Po zrušení firmy — AKTUÁLNY STAV (implementované, potvrdené 2026-08-16):** Owner zrušenie účtu spustí `esblu_owner_delete_company`, ktorá atomicky zmaže CELÚ firmu — všetky business tabuľky (`documents`, `document_attachments`, `document_links`, `document_review_log`, `ai_evidence`, `vehicles`, `vehicle_services`, `machines`, `machine_services`, `machine_photos`, `inventory_items`, `inventory_photos`), `company_invites`, `company_dpa_acceptances`, všetky `company_members` (owner aj ostatní členovia), samotný `companies` riadok a ownerove vlastné `settings`/`user_legal_acceptances`. Poradie mazania rešpektuje FK závislosti (child pred parent). Ostatní členovia firmy nestrácajú vlastný `auth.users` účet, iba membership a prístup k firemným dátam.

### 2.3 Pozvánky (`company_invites`) – čakajúce a expirované

- **Kritérium (navrhované, nie záväzné):** Pozvánky, ktoré expirovali alebo boli zamietnuté, nemajú žiadny funkčný dôvod na uchovávanie po expirácii mimo krátkodobého auditného účelu (napr. dohľadanie, kto koho pozval, pri riešení sporu).
- **AKTUÁLNY STAV:** Pri zrušení CELEJ firmy (`esblu_owner_delete_company`) sa všetky `company_invites` danej firmy zmažú (explicitný `DELETE` v tej istej atomickej transakcii) — tento prípad je vyriešený. Zostáva otvorená iba užšia otázka: pozvánka, ktorá expirovala alebo bola zamietnutá, ale firma naďalej aktívne existuje — taká pozvánka dnes zostáva v `company_invites` neobmedzene, bez samostatného cleanup mechanizmu.
- **Konkrétna lehota, po ktorej sa takéto "visiace" expirované/nevyužité pozvánky (vrátane hashovaného tokenu) fyzicky vymažú z `company_invites` v rámci AKTÍVNEJ firmy:** `LEGAL_DECISION_REQUIRED` – nie je stanovená žiadna konkrétna lehota (napr. "30 dní po expirácii"). Táto revízia žiadny cleanup job nezavádza (mimo rozsahu zadania).
- **Poznámka:** Tokeny sú hashované (SHA-256) a jednorazové, čo znižuje riziko aj pri dlhšom uchovávaní, no princíp minimalizácie odporúča ich časom odstrániť.

### 2.4 Vozidlá, stroje, sklad, servisné záznamy (`vehicles`, `machines`, `inventory_items` a súvisiace)

- **Kritérium:** Uchovávať, kým je firemný účet aktívny a kým si firma dané záznamy sama nevymaže.
- **AKTUÁLNY STAV (implementované, potvrdené 2026-08-16):** Pri zrušení CELEJ firmy sa všetky tieto tabuľky (vrátane `vehicle_services`, `machine_services`, `machine_photos`, `inventory_photos`) zmažú atomicky cez `esblu_owner_delete_company`, v poradí rešpektujúcom FK závislosti. Individuálne mazanie jednotlivého záznamu (napr. jedno vozidlo) appka rieši vlastnou UI/API logikou vrátane cleanupu priradených fotografií v Storage.
- **Konkrétna maximálna doba uchovávania (ak firma záznam sama nevymaže a firma naďalej aktívne existuje):** `LEGAL_DECISION_REQUIRED` – momentálne žiadna, dáta zostávajú neurčito, kým firma existuje.

### 2.5 Dokumenty a AI evidencia (`documents`, `ai_evidence`, Storage buckety `ai-inbox-documents`, `ai-evidence-documents`)

- **Kritérium:** Toto je najcitlivejšia kategória údajov (pozri `gdpr-data-map.md`).
- Uchovávať, kým je firemný účet aktívny a záznam nebol používateľom vymazaný.
- **AKTUÁLNY STAV mazania:** Individuálny delete v appke (Storage + DB); pri zrušení celej firmy cascade cez `esblu_owner_delete_company` vrátane Storage cleanup vykonaného presne podľa DB riadkov (`documents.storage_path`, `document_attachments.storage_path`, `ai_evidence.photo_url`) — potvrdené v `app/api/account/delete/route.ts`.
- **Konkrétna maximálna retenčná lehota (napr. automatické vymazanie po N rokoch nečinnosti alebo po N dňoch od nahratia, ak nie je priradené k trvalému záznamu):** `LEGAL_DECISION_REQUIRED` – žiadna číselná hodnota nie je momentálne stanovená ani implementovaná.
- **Reziduálne riziko rodného čísla** (pozri `gdpr-data-map.md`, bod 3.4) — **právne posúdenie (2026-08-16):** automatizovaná detekcia/redakcia citlivých údajov v OCR výstupe sa **nepovažuje za samostatne vyžadovanú konkrétnu technológiu**. GDPR čl. 32 vyžaduje primerané technické a organizačné opatrenia zodpovedajúce rizikám konkrétneho spracúvania, nie mandátny nástroj či produkt. Aktuálne primerané opatrenia pri tejto kategórii: company-scoped RLS (dokument vidí výhradne vlastná firma), používateľom iniciovaný delete flow s okamžitým Storage cleanup, DPA upravujúca zodpovednosť firmy ako prevádzkovateľa nahrávaných údajov tretích osôb, a AI Evidence princíp (používateľ vždy skontroluje a potvrdí rozpoznaný výsledok pred uložením). Toto zostáva vedomé, zdokumentované rizikové rozhodnutie – nie launch blocker – ktoré treba priebežne prehodnocovať, najmä ak by sa objem/rozsah spracovania zásadne zväčšil. Touto revíziou sa nezavádza žiadny nový redakčný mechanizmus.

### 2.6 Surový OCR text a extrahované polia zasielané do OpenAI API

- **Kritérium:** Na strane Esblu platí rovnaké pravidlo ako pri bode 2.5 (súčasť tej istej databázovej entity).
- **Na strane OpenAI (potvrdené 2026-08-16):** API volania používajú `store: false` A na OpenAI účte, ktorý Esblu používa, je explicitne potvrdené nastavenie **"Data sharing: Disabled"** (platform.openai.com → Settings → Data controls) — dvojitá poistka: appka nežiada perzistentné uloženie obsahu A účet má vypnuté zdieľanie dát na trénovanie/zlepšovanie modelov. Zvyšná otázka krátkodobej bezpečnostnej/abuse-monitoring retencie na strane OpenAI (nezávislej od `store`/data-sharing nastavení) zostáva riadená výhradne OpenAI politikou mimo kontroly Esblu — pozri ich DPA (`docs/gdpr-subprocessors.md`).

### 2.7 Fotografie (Storage – `machine-photos`, `inventory-photos`, `vehicle-photos`, `company-logos`)

- **Kritérium:** Uchovávať, kým je priradený záznam (vozidlo, stroj, skladová položka, firma) aktívny a nebol vymazaný.
- **AKTUÁLNY STAV:** `vehicle-photos` bucket (zavedený migráciou `20260816110000_add_vehicle_photos_and_registration_type.sql`) je zahrnutý do account-deletion Storage cleanup rovnako ako ostatné buckety (potvrdené v `app/api/account/delete/route.ts`), aj do cleanupu pri mazaní jednotlivého vozidla.
- **Konkrétna lehota po vymazaní priradeného záznamu, dokedy môže fotografia ešte zotrvať v Storage (napr. z dôvodu cache/CDN):** `LEGAL_DECISION_REQUIRED`.

### 2.8 Orphaned/nedokončené súbory (zlyhané uploady)

- **Súčasný stav:** Orphaned súbory zo zlyhaných uploadov sa čistia na strane klienta (client-side) v prípade zlyhania uploadu. **Neexistuje žiadny server-side sweep/cleanup job**, ktorý by odchytil zriedkavé prípady, keď aj toto client-side čistenie zlyhá (napr. používateľ zavrie kartu prehliadača uprostred uploadu).
- **Dôsledok:** Môžu existovať osamotené (orphaned) súbory v Storage bucketoch, ktoré nie sú priradené k žiadnemu databázovému záznamu a o ktorých existencii aplikácia "nevie".
- **Odporúčanie:** Implementovať periodický server-side job (napr. Supabase Edge Function na schedule alebo iný cron mechanizmus), ktorý identifikuje a odstráni súbory v Storage bez zodpovedajúceho databázového záznamu staršie ako určitá lehota.
- **Konkrétna lehota a mechanizmus:** `LEGAL_DECISION_REQUIRED` / `TODO` – zatiaľ neimplementované, momentálne najznámejšia praktická medzera v retenčnom modeli.

### 2.9 Logy (server/aplikačné)

- **Súčasný stav:** Aplikácia sama neukladá perzistentné logy. Jediné logovanie sú `console.error`/`console.log` výstupy, ktoré sú zachytávané ephemeral function logmi hostingovej platformy Vercel (Vercel function logs). Žiadny vlastný log management/SIEM systém nie je nasadený.
- **Región nasadenia (potvrdené 2026-08-16):** Vercel Functions bežia v regióne **fra1 (Frankfurt, EÚ)**.
- **Retenčná lehota logov:** riadi sa výhradne nastaveniami Vercel plánu (Vercel-managed log retention). **`TODO`** – zakladateľ musí overiť konkrétnu retenčnú lehotu podľa aktuálneho Vercel plánu/tarify (samotný región už bol potvrdený, retenčné okno logov nie).

### 2.10 Zálohy (backups)

- **Súčasný stav:** Zálohy databázy sú spravované Supabase (Supabase-managed backups) v rámci zvoleného plánu Supabase projektu. Aplikácia sama žiadne vlastné zálohovanie nerobí.
- **Región projektu (potvrdené 2026-08-16):** Supabase projekt beží v regióne **eu-central-1 (Frankfurt, EÚ)**.
- **Retenčná lehota záloh:** `TODO` – závisí od konkrétneho Supabase plánu (napr. Free/Pro/Team/Enterprise majú rôzne retenčné okná point-in-time recovery a denných záloh). Zakladateľ musí túto hodnotu overiť priamo v nastaveniach Supabase projektu (región už bol potvrdený, retenčné okno záloh nie).
- **Dôsledok pre "právo na vymazanie":** Aj po vymazaní záznamu z produkčnej databázy môžu jeho kópie dočasne pretrvávať v zálohách po dobu retenčného okna Supabase. Toto je štandardná a všeobecne akceptovaná výnimka pri žiadostiach o vymazanie (čl. 17 GDPR), musí však byť transparentne komunikovaná (napr. v Privacy Policy).

### 2.11 Vymazané účty/firmy – následný stav

- **Kritérium:** Po potvrdenom vymazaní účtu alebo firmy by mali byť odstránené/anonymizované aj súvisiace záznamy (vozidlá, stroje, dokumenty, fotografie) v rozsahu, ktorý to FK štruktúra databázy umožňuje.
- **AKTUÁLNY STAV (implementované, potvrdené 2026-08-16):** Cascade delete pri zrušení firmy je zdokumentovaný a implementovaný explicitne v `esblu_owner_delete_company` (SQL funkcia s vypísaným presným poradím mazania naprieč business tabuľkami, nie iba spoliehanie sa na pasívne DB-level ON DELETE pravidlá) — pozri `supabase/migrations/20260816100000_add_account_self_deletion.sql`. FK hardening (tá istá migrácia) navyše zabezpečuje, že zrušenie VLASTNÉHO účtu admina/employeeho (nie celej firmy) firemné dáta nezmaže ani nepoškodí — `user_id`/`invited_by` na company-scoped tabuľkách prežijú ako `NULL` (`ON DELETE SET NULL`, predtým `CASCADE`/`RESTRICT`).

### 2.12 Audit log revíznych akcií (`document_review_log`)

- **Kritérium:** Auditná stopa akcií nad dokumentmi (vytvorenie, úprava poľa, potvrdenie, prepojenie, soft/hard delete) — zámerne navrhnutá tak, aby PREŽILA zmazanie jednotlivého dokumentu alebo jeho pôvodcu (`document_id`/`user_id` sú `ON DELETE SET NULL`, `document_ref` zostáva stabilný identifikátor nezávislý od `document_id`).
- **Súčasný stav:** Žiadna vlastná retenčná lehota nie je stanovená ani implementovaná — log rastie neobmedzene, kým firma existuje. Pri zrušení CELEJ firmy sa celý log zmaže spolu s ostatnými company-scoped dátami (`esblu_owner_delete_company`).
- **Konkrétna maximálna retenčná lehota pre jednotlivé záznamy logu (napr. auto-výmaz po N rokoch od `created_at`):** `LEGAL_DECISION_REQUIRED` – nebolo doteraz posúdené. Vzhľadom na to, že stĺpce `document_snapshot`/`old_value`/`new_value` môžu obsahovať kópie osobných údajov z dokumentu, tento log podlieha rovnakému princípu minimalizácie ako samotné dokumenty (bod 2.5) — nový nález tejto revízie, dovtedy nezdokumentovaný.

---

## 3. Zhrnutie – aktuálny stav pred spustením produkcie

| Oblasť | Stav | Akcia |
|---|---|---|
| Automatizovaná retencia (akákoľvek) | Neimplementovaná (vedomé rozhodnutie) | `LEGAL_DECISION_REQUIRED` pre konkrétne číselné lehoty – risk-based zdôvodnenie pre najcitlivejšiu kategóriu (dokumenty/AI evidencia, bod 2.5) je už zdokumentované, číselná lehota stále chýba |
| Expirované pozvánky (v rámci AKTÍVNEJ firmy) | Neuprataté | `LEGAL_DECISION_REQUIRED` – cascade pri zrušení CELEJ firmy už funguje (bod 2.3), "visiace" pozvánky v aktívnej firme stále bez lehoty |
| `document_review_log` retencia | Bez lehoty | `LEGAL_DECISION_REQUIRED` – nový nález tejto revízie (bod 2.12) |
| Orphaned Storage súbory | Bez server-side sweep | `LEGAL_DECISION_REQUIRED` / `TODO` – implementovať periodický cleanup job (mimo rozsahu tejto revízie – iba dokumentácia) |
| Retencia Vercel logov | Región potvrdený (`fra1`, Frankfurt EÚ), lehota stále TODO | `TODO` – overiť podľa Vercel plánu |
| Retencia Supabase záloh | Región potvrdený (`eu-central-1`, Frankfurt EÚ), lehota stále TODO | `TODO` – overiť podľa Supabase plánu |
| Cascade delete/anonymizácia pri vymazaní účtu/firmy | **DONE — implementované a zdokumentované** | Hotovo (`esblu_owner_delete_company`/`esblu_member_delete_self`, potvrdené 2026-08-16) |
| Detekcia/redakcia citlivých údajov (rodné číslo) v OCR výstupe | **Rozhodnuté — nevyžaduje sa samostatný nástroj** | Risk-based právne posúdenie 2026-08-16 (bod 2.5) – nie launch blocker, priebežne prehodnocovať pri raste rozsahu spracovania |

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-subprocessors.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
