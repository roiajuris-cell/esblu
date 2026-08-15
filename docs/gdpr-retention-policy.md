# Politika uchovávania údajov (Retention Policy)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15

---

## 1. Súčasný stav (úprimné priznanie)

**K dnešnému dňu (2026-08-15) v Esblu neexistuje žiadna automatizovaná politika uchovávania ani mazania údajov.** Potvrdené auditom kódu a infraštruktúry: v repozitári sa nenachádza žiadny cron job, žiadna Supabase Edge Function ani žiadne použitie `pg_cron`. Všetky dáta sa v praxi uchovávajú **neurčito (indefinitely)**, kým nie sú manuálne vymazané (napr. používateľom cez appku, alebo priamym administratívnym zásahom).

Toto je **známa medzera (known gap)** v súlade s princípom minimalizácie údajov a obmedzenia uloženia podľa čl. 5 ods. 1 písm. e) GDPR ("storage limitation"). Účelom tohto dokumentu je (a) transparentne zdokumentovať súčasný stav a (b) navrhnúť kritériá uchovávania pre jednotlivé kategórie údajov, ktoré by mali byť implementované pred alebo čoskoro po spustení produkcie.

**Dôležité:** tento dokument zámerne **nevymýšľa konkrétne číselné retenčné lehoty** (napr. "vymazať po 90 dňoch") tam, kde takéto rozhodnutie ešte nebolo urobené. Namiesto toho navrhuje **kritériá**, na základe ktorých má zakladateľ/právnik rozhodnúť o konkrétnych lehotách – tieto miesta sú označené `LEGAL_DECISION_REQUIRED`.

---

## 2. Navrhované kritériá uchovávania podľa kategórie údajov

### 2.1 Autentifikačné a účtové údaje (`auth.users`, `settings`)

- **Kritérium:** Uchovávať po celú dobu, kým je používateľský účet aktívny.
- **Po zrušení účtu:** `LEGAL_DECISION_REQUIRED` – rozhodnúť, či sa účet maže okamžite, po lehote na "cool-off" (napr. možnosť obnovy), alebo sa anonymizuje. Konkrétna lehota (počet dní) nie je stanovená a musí byť doplnená.

### 2.2 Firemné/organizačné údaje (`companies`, `company_members`)

- **Kritérium:** Uchovávať, kým je firemný účet aktívny (má aspoň jedného člena a aktívny plán/používanie).
- **Po zrušení firmy:** `LEGAL_DECISION_REQUIRED` – rozhodnúť o lehote pred trvalým vymazaním vs. anonymizáciou; zohľadniť aj závislosti (FK constraints) na vozidlá/stroje/sklad/dokumenty patriace danej firme.

### 2.3 Pozvánky (`company_invites`) – čakajúce a expirované

- **Kritérium (navrhované, nie záväzné):** Pozvánky, ktoré expirovali alebo boli zamietnuté, nemajú žiadny funkčný dôvod na uchovávanie po expirácii mimo krátkodobého auditného účelu (napr. dohľadanie, kto koho pozval, pri riešení sporu).
- **Konkrétna lehota, po ktorej sa expirované/nevyužité pozvánky (vrátane hashovaného tokenu) fyzicky vymažú z `company_invites`:** `LEGAL_DECISION_REQUIRED` – nie je stanovená žiadna konkrétna lehota (napr. "30 dní po expirácii"), zakladateľ musí rozhodnúť.
- **Poznámka:** Tokeny sú hashované (SHA-256) a jednorazové, čo znižuje riziko aj pri dlhšom uchovávaní, no princíp minimalizácie odporúča ich časom odstrániť.

### 2.4 Vozidlá, stroje, sklad, servisné záznamy (`vehicles`, `machines`, `inventory_items` a súvisiace)

- **Kritérium:** Uchovávať, kým je firemný účet aktívny a kým si firma dané záznamy sama nevymaže.
- **Pri žiadosti o vymazanie:** vymazanie musí prebehnúť tak, aby to bezpečne umožnili existujúce FK (foreign key) väzby v databáze (napr. servisné záznamy viazané na vozidlo, fotografie viazané na stroj). Ak vymazanie nadradeného záznamu naráža na FK obmedzenia, je potrebné vymazať alebo odviazať závislé záznamy v správnom poradí.
- **Konkrétna maximálna doba uchovávania (ak firma záznam sama nevymaže):** `LEGAL_DECISION_REQUIRED` – momentálne žiadna, dáta zostávajú neurčito.

### 2.5 Dokumenty a AI evidencia (`documents`, `ai_evidence`, Storage buckety `ai-inbox-documents`, `ai-evidence-documents`)

- **Kritérium:** Toto je najcitlivejšia kategória údajov (pozri `gdpr-data-map.md`) – mala by mať najprísnejšie a najskôr implementované retenčné pravidlá.
- Uchovávať, kým je firemný účet aktívny a záznam nebol používateľom vymazaný.
- **Konkrétna maximálna retenčná lehota (napr. automatické vymazanie po N rokoch nečinnosti alebo po N dňoch od nahratia, ak nie je priradené k trvalému záznamu):** `LEGAL_DECISION_REQUIRED` – žiadna číselná hodnota nie je momentálne stanovená ani implementovaná.
- **Reziduálne riziko rodného čísla** (pozri `gdpr-data-map.md`, bod 3.4) zvyšuje dôležitosť skorého zavedenia retenčnej politiky a/alebo mechanizmu na detekciu/redakciu citlivých údajov v dokumentoch.

### 2.6 Surový OCR text a extrahované polia zasielané do OpenAI API

- **Kritérium:** Na strane Esblu platí rovnaké pravidlo ako pri bode 2.5 (súčasť tej istej databázovej entity).
- **Na strane OpenAI:** API volania používajú `store: false`, čo znamená, že Esblu si od OpenAI výslovne nevyžiadal perzistentné uloženie. Skutočná retenčná politika OpenAI (napr. krátkodobé bezpečnostné logovanie na strane OpenAI nezávisle od `store: false`) je `TODO` – potrebné overiť voči aktuálnym podmienkam OpenAI API/DPA.

### 2.7 Fotografie (Storage – `machine-photos`, `inventory-photos`, `company-logos`)

- **Kritérium:** Uchovávať, kým je priradený záznam (stroj, skladová položka, firma) aktívny a nebol vymazaný.
- **Konkrétna lehota po vymazaní priradeného záznamu, dokedy môže fotografia ešte zotrvať v Storage (napr. z dôvodu cache/CDN):** `LEGAL_DECISION_REQUIRED`.

### 2.8 Orphaned/nedokončené súbory (zlyhané uploady)

- **Súčasný stav:** Orphaned súbory zo zlyhaných uploadov sa čistia na strane klienta (client-side) v prípade zlyhania uploadu. **Neexistuje žiadny server-side sweep/cleanup job**, ktorý by odchytil zriedkavé prípady, keď aj toto client-side čistenie zlyhá (napr. používateľ zavrie kartu prehliadača uprostred uploadu).
- **Dôsledok:** Môžu existovať osamotené (orphaned) súbory v Storage bucketoch, ktoré nie sú priradené k žiadnemu databázovému záznamu a o ktorých existencii aplikácia "nevie".
- **Odporúčanie:** Implementovať periodický server-side job (napr. Supabase Edge Function na schedule alebo iný cron mechanizmus), ktorý identifikuje a odstráni súbory v Storage bez zodpovedajúceho databázového záznamu staršie ako určitá lehota.
- **Konkrétna lehota a mechanizmus:** `LEGAL_DECISION_REQUIRED` / `TODO` – zatiaľ neimplementované, momentálne najznámejšia praktická medzera v retenčnom modeli.

### 2.9 Logy (server/aplikačné)

- **Súčasný stav:** Aplikácia sama neukladá perzistentné logy. Jediné logovanie sú `console.error`/`console.log` výstupy, ktoré sú zachytávané ephemeral function logmi hostingovej platformy Vercel (Vercel function logs). Žiadny vlastný log management/SIEM systém nie je nasadený.
- **Retenčná lehota logov:** riadi sa výhradne nastaveniami Vercel plánu (Vercel-managed log retention). **`TODO`** – zakladateľ musí overiť konkrétnu retenčnú lehotu podľa aktuálneho Vercel plánu/tarify.

### 2.10 Zálohy (backups)

- **Súčasný stav:** Zálohy databázy sú spravované Supabase (Supabase-managed backups) v rámci zvoleného plánu Supabase projektu. Aplikácia sama žiadne vlastné zálohovanie nerobí.
- **Retenčná lehota záloh:** `TODO` – závisí od konkrétneho Supabase plánu (napr. Free/Pro/Team/Enterprise majú rôzne retenčné okná point-in-time recovery a denných záloh). Zakladateľ musí túto hodnotu overiť priamo v nastaveniach Supabase projektu.
- **Dôsledok pre "právo na vymazanie":** Aj po vymazaní záznamu z produkčnej databázy môžu jeho kópie dočasne pretrvávať v zálohách po dobu retenčného okna Supabase. Toto je štandardná a všeobecne akceptovaná výnimka pri žiadostiach o vymazanie (čl. 17 GDPR), musí však byť transparentne komunikovaná (napr. v Privacy Policy).

### 2.11 Vymazané účty/firmy – následný stav

- **Kritérium:** Po potvrdenom vymazaní účtu alebo firmy by mali byť odstránené/anonymizované aj súvisiace záznamy (vozidlá, stroje, dokumenty, fotografie) v rozsahu, ktorý to FK štruktúra databázy umožňuje.
- **Súčasný stav:** Neexistuje zdokumentovaný ani automatizovaný proces "cascade delete" alebo anonymizácie naprieč všetkými súvisiacimi tabuľkami – `TODO` overiť skutočné DB-level ON DELETE pravidlá (CASCADE/RESTRICT/SET NULL) v Supabase schéme pre všetky relevantné cudzie kľúče.

---

## 3. Zhrnutie – čo je potrebné urobiť pred spustením produkcie

| Oblasť | Stav | Akcia |
|---|---|---|
| Automatizovaná retencia (akákoľvek) | Neimplementovaná | `LEGAL_DECISION_REQUIRED` – zaviesť aspoň základné retenčné mechanizmy pre najcitlivejšie kategórie (dokumenty/AI evidencia) |
| Expirované pozvánky | Neuprataté | `LEGAL_DECISION_REQUIRED` – stanoviť lehotu a implementovať cleanup |
| Orphaned Storage súbory | Bez server-side sweep | `LEGAL_DECISION_REQUIRED` / `TODO` – implementovať periodický cleanup job |
| Retencia Vercel logov | Neoverené | `TODO` – overiť podľa Vercel plánu |
| Retencia Supabase záloh | Neoverené | `TODO` – overiť podľa Supabase plánu |
| Cascade delete/anonymizácia pri vymazaní účtu/firmy | Neoverené/nezdokumentované | `TODO` – zmapovať DB-level ON DELETE pravidlá |

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-subprocessors.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
