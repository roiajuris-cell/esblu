# GDPR – Mapa osobných a firemných údajov (Data Map)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ (controller):** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Kontakt:** info@esblu.com (všeobecný), privacy@esblu.com (žiadosti týkajúce sa ochrany osobných údajov)
**Sídlo/registrácia (IČO, DIČ, IČ DPH, presná adresa):** `TODO` – zatiaľ nie je k dispozícii, doplniť pred spustením produkcie
**Dokument slúži na:** interný záznam pre potreby GDPR compliance pred produkčným spustením. Nie je určený na verejné zverejnenie.
**Verzia:** 1.0
**Dátum:** 2026-08-15

---

## 1. Účel dokumentu

Tento dokument je štruktúrovaný inventár všetkých kategórií osobných a firemných údajov, ktoré aplikácia Esblu (B2B SaaS na správu firemného majetku – vozidlá, stroje, sklad, dokumenty) spracúva. Slúži ako podklad pre záznam o spracovateľských činnostiach (`gdpr-processing-register.md`), politiku uchovávania (`gdpr-retention-policy.md`) a ďalšie compliance dokumenty.

Technologický základ aplikácie: **Next.js 16** (frontend/backend) + **Supabase** (Postgres databáza, Auth, Storage).

---

## 2. Typológia dotknutých osôb (data subjects)

V rámci Esblu rozlišujeme dva principiálne odlišné typy dotknutých osôb:

| Typ | Popis |
|---|---|
| **A – Držiteľ účtu Esblu** | Fyzická osoba, ktorá má vytvorený účet v Esblu (auth.users), je členom firmy (`company_members`) ako owner/admin/employee, alebo bola pozvaná (`company_invites`). |
| **B – Tretia osoba spomenutá v obsahu firmy** | Fyzická osoba, ktorej údaje sa môžu nachádzať v obsahu, ktorý firma do Esblu nahrala – napr. meno na technickom preukaze vozidla, meno technika v servisnom zázname, meno zákazníka/dodávateľa na faktúre, meno na dodacom liste. Esblu je vo vzťahu k týmto údajom **spracovateľ v mene firmy (zákazníka)**, resp. firma je voči nim samostatným prevádzkovateľom – Esblu poskytuje len technickú infraštruktúru. |

Toto rozlíšenie je dôležité najmä pre `gdpr-processing-register.md` (právny základ, zodpovednosť) a pre komunikáciu s firmami-zákazníkmi (v budúcnosti môže byť potrebná spracovateľská zmluva/DPA medzi Esblu a firmami – `LEGAL_DECISION_REQUIRED`).

---

## 3. Inventár dátových kategórií

### 3.1 Autentifikačné a session údaje

| Kategória údajov | Zdrojová tabuľka / úložisko | Typ dotknutej osoby | Poznámky k citlivosti |
|---|---|---|---|
| E-mailová adresa (prihlasovacia) | `auth.users` (Supabase Auth, spravované Supabase) | A | Identifikačný údaj, priamo identifikuje osobu |
| Hash hesla | `auth.users` (Supabase Auth) | A | Nikdy sa neukladá v plain texte; správu vykonáva Supabase Auth |
| Session token | localStorage prehliadača, kľúč `sb-<project-ref>-auth-token` | A | **NIE cookies** – potvrdené auditom kódu: aplikácia používa čistý `@supabase/supabase-js` klient, nikde v kóde nie je `@supabase/ssr` ani cookie-handling kód. Token je len v localStorage prehliadača používateľa. |

### 3.2 Účtové a firemné údaje

| Kategória údajov | Zdrojová tabuľka / úložisko | Typ dotknutej osoby | Poznámky k citlivosti |
|---|---|---|---|
| Názov firmy | `settings.company_name` | A (nastavuje ju držiteľ účtu) | Nízka citlivosť, firemný údaj |
| Logo firmy | Storage bucket `company-logos` (verejný bucket) | A | Nízka citlivosť; bucket je verejný (public), t.j. logá sú prístupné cez priamu URL bez autentifikácie |
| Plán (free/pro/admin) | `settings.plan` | A | Nízka citlivosť |
| Členstvo vo firme a rola (owner/admin/employee) | `company_members` | A | Stredná citlivosť – odhaľuje pracovný/organizačný vzťah |
| Pozvánkové e-maily | `company_invites.email` (alebo obdobné pole) | A / potenciálne osoba, ktorá ešte nemá účet | Osoba môže byť pozvaná e-mailom skôr, než si vytvorí účet |
| Hashované pozývacie tokeny (SHA-256, jednorazové) | `company_invites` | – (technický údaj) | Tokeny sú hashované, jednorazovo použiteľné – nízke riziko zneužitia |

### 3.3 Prevádzkové/business dáta (majetok firiem)

| Kategória údajov | Zdrojová tabuľka / úložisko | Typ dotknutej osoby | Poznámky k citlivosti |
|---|---|---|---|
| Údaje o vozidlách (SPZ/ŠPZ, VIN, technické údaje zadané používateľom) | `vehicles` | B (SPZ/VIN sa môže viazať na konkrétnu fyzickú osobu – majiteľa vozidla) | SPZ a VIN sú v niektorých výkladoch považované za osobný údaj, ak umožňujú identifikáciu fyzickej osoby (napr. v spojení s evidenciou vozidiel) |
| Servisné záznamy vozidiel (`vehicle_services`) | `vehicle_services` | B (meno technika, dodávateľa) | Môže obsahovať mená fyzických osôb (technik, servisný partner) a sumy |
| Údaje o strojoch (`machines`) a ich servise (`machine_services`) | `machines`, `machine_services` | B | Obdobne ako pri vozidlách – mená technikov, dodávateľov |
| Fotografie strojov | Storage bucket `machine-photos` (verejný bucket) | B (na fotke sa môže objaviť osoba, EČV, miesto) | Verejný bucket – prístupné cez priamu URL |
| Skladové položky (`inventory_items`) a ich fotografie | `inventory_items`, Storage bucket `inventory-photos` (verejný bucket) | B (potenciálne) | Nízka až stredná citlivosť |

### 3.4 Dokumentový/AI-evidenčný modul (najcitlivejšia oblasť)

| Kategória údajov | Zdrojová tabuľka / úložisko | Typ dotknutej osoby | Poznámky k citlivosti |
|---|---|---|---|
| Nahrané dokumenty/fotografie (vážne lístky, dodacie listy, faktúry, účtenky, poistné/PZP doklady, servisné doklady, technický preukaz vozidla) | `documents`, `document_links`, `document_attachments`; Storage buckets `ai-inbox-documents`, `ai-evidence-documents` (**privátne**, prístup cez podpísané URL) | B (dokumenty môžu obsahovať mená, adresy, VIN, SPZ, sumy, názvy dodávateľov/odberateľov, čísla poistných zmlúv) | **Vysoká citlivosť.** Ide o najcitlivejšiu kategóriu údajov v celej aplikácii – dokumenty môžu obsahovať plné meno a adresu fyzickej osoby (napr. technický preukaz vozidla vlastneného fyzickou osobou), čísla poistných zmlúv, obchodné údaje tretích strán. |
| Surový OCR text a extrahované polia z AI spracovania | `ai_evidence.raw_text`, `documents.ai_raw_output`, `documents.extracted_fields` | B | Odvodené z vyššie uvedených dokumentov – rovnaká úroveň citlivosti. Posiela sa a prijíma z OpenAI API (pozri `gdpr-subprocessors.md`). |
| Kontrolný/revízny log dokumentov | `document_review_log` | A (kto a kedy revidoval záznam) | Nízka citlivosť – ide o audit trail používateľských akcií (metadáta, nie obsah dokumentu) |

**Reziduálne riziko – rodné číslo:** V databázovej schéme neexistuje žiadne explicitné pole pre rodné číslo. Nie je navrhnuté, zbierané ani vyžadované žiadnym formulárom. **Napriek tomu existuje reziduálne riziko**, že surový OCR text (`ai_evidence.raw_text`) alebo samotný obrázok nahraného dokumentu môže **náhodne obsahovať rodné číslo**, ak ho oskenovaný dokument obsahuje (napr. staršie typy technického preukazu, poistné doklady, alebo iný dokument, ktorý používateľ nahrá) – keďže neexistuje žiadny mechanizmus na detekciu, maskovanie alebo redakciu takýchto údajov pred uložením alebo pred odoslaním do OpenAI API. Toto je potrebné zohľadniť ako identifikované, no dosiaľ netechnicky ošetrené riziko (pozri aj `data-breach-procedure.md` a `gdpr-launch-checklist.md`).

### 3.5 Údaje, ktoré Esblu NEZBIERA (potvrdené auditom kódu)

| Kategória | Stav |
|---|---|
| IP adresy | Nezbierajú sa a nelogujú sa nikde v kóde (potvrdené auditom) |
| User-agent / fingerprinting | Nezbiera sa |
| Analytika / telemetria (Google Analytics, PostHog, Mixpanel, Plausible a pod.) | Žiadna – nulový výskyt v celom kóde ani v `package.json` (overené vyhľadávaním výrazov gtag/posthog/mixpanel/plausible/sentry a pod.) |
| Monitoring chýb/crash reporting (napr. Sentry) | Nie je integrovaný |
| Cookies (akékoľvek – trackovacie aj funkčné) | **Nepoužívajú sa žiadne cookies.** Potvrdené auditom – nikde v kóde sa nenachádza `document.cookie` ani žiadna cookie knižnica. Jediné client-side úložisko je localStorage session token Supabase Auth SDK (bod 3.1), ktorý je nevyhnutný na fungovanie služby (obdobné výnimke "nevyhnutne potrebné" cookies podľa ePrivacy smernice). Samostatná Cookie Policy stránka (`/cookies`) sa vytvára oddelene mimo tejto sady dokumentov. |

### 3.6 Logovanie v kóde

`console.error` / `console.log` sa vyskytujú na niekoľkých miestach v kóde. Podľa predchádzajúcich dedikovaných code auditov logujú prevažne chybové objekty (error objects), nie surový obsah nahraných osobných dokumentov. Debug logy sú z väčšej časti podmienené `NODE_ENV`. Tieto logy nie sú perzistentne ukladané aplikáciou samotnou – ich životnosť sa riadi ephemeral logmi hostingovej platformy (Vercel) – pozri `gdpr-retention-policy.md`.

---

## 4. Zhrnutie – kde sú "najhorúcejšie" dáta

1. **Dokumentový/AI-evidenčný modul** (`documents`, `ai_evidence`, súkromné Storage buckets) – najvyššia citlivosť, obsahuje potenciálne osobné údaje tretích strán vrátane reziduálneho rizika rodného čísla.
2. **Auth údaje** (`auth.users`) – spravované plne Supabase Auth, štandardná úroveň citlivosti pre SaaS.
3. **Vozidlá/stroje/sklad** – stredná citlivosť, hlavne firemné dáta s príležitostným presahom do osobných údajov (SPZ, VIN, mená technikov).
4. **Účtové/firemné metadáta** – nízka citlivosť.

---

## 5. Súvisiace dokumenty

- `gdpr-processing-register.md` – záznam o spracovateľských činnostiach (Art. 30 GDPR)
- `gdpr-subprocessors.md` – zoznam sprostredkovateľov (subprocessorov)
- `gdpr-retention-policy.md` – politika uchovávania údajov
- `data-breach-procedure.md` – postup pri úniku osobných údajov
- `gdpr-launch-checklist.md` – checklist pripravenosti na produkčné spustenie
