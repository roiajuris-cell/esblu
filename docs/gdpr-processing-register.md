# Záznam o spracovateľských činnostiach (Record of Processing Activities – Art. 30 GDPR)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Kontakt:** info@esblu.com / privacy@esblu.com
**Sídlo, IČO, DIČ, IČ DPH:** `TODO` – doplniť pred spustením produkcie
**Zodpovedná osoba/DPO:** neustanovená – `LEGAL_DECISION_REQUIRED` (posúdiť povinnosť podľa Art. 37 GDPR, pozri `gdpr-launch-checklist.md`)
**Verzia:** 1.0
**Dátum:** 2026-08-15

---

## Úvod

Tento dokument je interným záznamom o spracovateľských činnostiach vedeným v zmysle čl. 30 GDPR. Pre každú samostatnú spracovateľskú činnosť je uvedený účel, kategórie dotknutých údajov, kategórie dotknutých osôb, právny základ, príjemcovia/sprostredkovatelia, informácie o cezhraničnom prenose a doba uchovávania.

Právne základy sa uvádzajú presne podľa charakteru spracovania – **súhlas (consent) sa uvádza ako právny základ výlučne pri činnostiach, ktoré sú skutočne dobrovoľné** (napr. hypotetický budúci marketingový newsletter). Pre základnú funkčnosť účtu a služby sa ako právny základ uvádza **plnenie zmluvy** (čl. 6 ods. 1 písm. b) GDPR), pre bezpečnosť/prevenciu podvodov/zlepšovanie služby **oprávnený záujem** (čl. 6 ods. 1 písm. f) GDPR) a tam, kde je to relevantné, **zákonná povinnosť** (čl. 6 ods. 1 písm. c) GDPR, napr. účtovné/daňové predpisy).

---

## 1. Registrácia a autentifikácia používateľského účtu

| | |
|---|---|
| **Účel** | Vytvorenie a správa používateľského účtu, prihlasovanie, overenie identity, správa relácie (session) |
| **Kategórie údajov** | E-mailová adresa, hash hesla, session token (localStorage) |
| **Kategórie dotknutých osôb** | Typ A – držitelia účtu Esblu |
| **Právny základ** | Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR) – vytvorenie účtu je nevyhnutným predpokladom poskytovania služby. Bezpečnostné aspekty autentifikácie (napr. ochrana pred neoprávneným prístupom) opierame doplnkovo o oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR). |
| **Príjemcovia / sprostredkovatelia** | Supabase (Auth) – spracúva e-mail, hash hesla a session mechanizmus v mene prevádzkovateľa |
| **Cezhraničný prenos** | `TODO` – závisí od regiónu Supabase projektu (EÚ vs. US), potrebné potvrdiť u zakladateľa. Pozri `gdpr-subprocessors.md`. |
| **Doba uchovávania** | Neurčito, kým je účet aktívny – žiadna automatizovaná politika uchovávania nie je implementovaná. Pozri `gdpr-retention-policy.md`. |

---

## 2. Členstvo vo firme a pozývanie členov

| | |
|---|---|
| **Účel** | Priradenie používateľa k firme (multi-tenant model), správa rolí (owner/admin/employee), pozývanie nových členov do firmy prostredníctvom tokenového invite flow |
| **Kategórie údajov** | Firemná príslušnosť, rola, e-mailová adresa pozývanej osoby, hashovaný (SHA-256) jednorazový pozývací token |
| **Kategórie dotknutých osôb** | Typ A – existujúci aj potenciálni (pozvaní) členovia firmy |
| **Právny základ** | Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR) – funkcionalita tímovej spolupráce je súčasťou objednanej služby. Voči pozvanej osobe, ktorá ešte nemá účet: oprávnený záujem prevádzkovateľa firmy/Esblu na umožnenie prístupu k pracovnému nástroju (čl. 6 ods. 1 písm. f) GDPR). |
| **Príjemcovia / sprostredkovatelia** | Supabase (Postgres DB); doručenie pozývacieho e-mailu – pozri bod 6 nižšie a `gdpr-subprocessors.md` (diskrepancia Resend/Namecheap) |
| **Cezhraničný prenos** | `TODO` – závislé od regiónu Supabase |
| **Doba uchovávania** | Neurčito až do zániku/vymazania firmy alebo účtu – bez automatickej retencie. Pozri `gdpr-retention-policy.md` k téme expirovaných/nevyužitých pozvánok. |

---

## 3. Evidencia vozidiel, strojov a skladových položiek

| | |
|---|---|
| **Účel** | Umožniť firmám evidovať a spravovať svoj majetok – vozidlá, stroje, skladové položky vrátane servisných záznamov a fotografií |
| **Kategórie údajov** | SPZ/ŠPZ, VIN, technické údaje vozidiel, údaje o strojoch, servisné záznamy (mená technikov, dodávatelia, náklady, dátumy), skladové položky, fotografie strojov a skladových položiek |
| **Kategórie dotknutých osôb** | Typ B – najmä tretie osoby spomenuté v obsahu (majitelia vozidiel, technici, dodávatelia); okrajovo typ A (kto záznam vytvoril/upravil) |
| **Právny základ** | Plnenie zmluvy medzi Esblu a firmou-zákazníkom (čl. 6 ods. 1 písm. b) GDPR) – ide o jadrovú funkcionalitu služby. Vo vzťahu k tretím osobám (typ B) je právnym základom spracovania primárne vzťah medzi firmou (ako prevádzkovateľom týchto údajov) a danou treťou osobou; Esblu vystupuje voči firme ako poskytovateľ technickej infraštruktúry (fakticky v pozícii sprostredkovateľa vo vzťahu k údajom tretích strán – `LEGAL_DECISION_REQUIRED`: formalizovať touto optikou aj zmluvný vzťah s firmami, napr. DPA medzi Esblu a zákazníkmi). |
| **Príjemcovia / sprostredkovatelia** | Supabase (Postgres DB, Storage pre fotografie) |
| **Cezhraničný prenos** | `TODO` – závislé od regiónu Supabase |
| **Doba uchovávania** | Neurčito, kým je záznam/firma/účet aktívny – bez automatickej retenčnej politiky; vymazanie závisí aj od FK (foreign key) väzieb v databáze. Pozri `gdpr-retention-policy.md`. |

---

## 4. AI-asistované spracovanie dokumentov (OCR/extrakcia údajov)

| | |
|---|---|
| **Účel** | Automatické rozpoznanie textu a extrakcia štruktúrovaných polí z nahraných fotografií/dokumentov (vážne lístky, dodacie listy, faktúry, účtenky, poistné/PZP doklady, servisné doklady, technický preukaz vozidla) prostredníctvom OpenAI API, s následnou kontrolou/opravou/uložením zo strany používateľa |
| **Kategórie údajov** | Obsah nahraných dokumentov/fotografií vrátane potenciálnych osobných údajov (mená, adresy, VIN, SPZ, sumy, čísla poistných zmlúv, názvy stavenísk); surový OCR výstup a extrahované polia (`ai_evidence.raw_text`, `documents.ai_raw_output`, `documents.extracted_fields`) |
| **Kategórie dotknutých osôb** | Typ B (predovšetkým), okrajovo typ A (kto dokument nahral/skontroloval) |
| **Právny základ** | Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR) – automatizovaná extrakcia dát je objednanou/jadrovou funkciou služby, ktorú si firma-zákazník aktívne zvolí použitím tejto funkcie aplikácie. |
| **Príjemcovia / sprostredkovatelia** | OpenAI API (prijíma base64-kódované obrázky dokumentov na účel OCR/extrakcie; API volania používajú explicitne `store: false`, teda bez požiadavky na perzistentné uloženie na strane OpenAI) |
| **Cezhraničný prenos** | Spracovanie u OpenAI prebieha mimo EÚ (predpoklad, presné umiestnenie spracovania a status DPA/SCC: `TODO`, pozri `gdpr-subprocessors.md`) |
| **Doba uchovávania** | Extrahované/uložené dáta: neurčito v Esblu databáze, kým je záznam aktívny (bez automatickej retencie). Dáta zaslané do OpenAI API: `store: false` znamená, že OpenAI by ich nemal perzistentne uchovávať nad rámec spracovania požiadavky – presné zmluvné/politické potvrdenie zo strany OpenAI: `TODO`. |

---

## 5. Uloženie nahraných dokumentov a fotografií (Storage)

| | |
|---|---|
| **Účel** | Perzistentné úložisko súborov (fotografie strojov/skladu/loga firiem vo verejných bucketoch; dokumenty a AI evidencia v privátnych bucketoch s prístupom cez podpísané URL) |
| **Kategórie údajov** | Binárny obsah súborov – fotografie a dokumenty; nepriamo všetky kategórie údajov opísané v `gdpr-data-map.md`, bod 3.3–3.4 |
| **Kategórie dotknutých osôb** | Typ A aj B |
| **Právny základ** | Plnenie zmluvy (čl. 6 ods. 1 písm. b) GDPR) |
| **Príjemcovia / sprostredkovatelia** | Supabase Storage. Verejné buckety (`machine-photos`, `inventory-photos`, `company-logos`) sú prístupné cez priamu URL bez autentifikácie. Privátne buckety (`ai-inbox-documents`, `ai-evidence-documents`) vyžadujú podpísané (signed) URL. |
| **Cezhraničný prenos** | `TODO` – závislé od regiónu Supabase Storage |
| **Doba uchovávania** | Neurčito, kým je súbor/záznam/účet aktívny – bez automatickej retenčnej politiky. Orphaned súbory z neúspešných uploadov: pozri `gdpr-retention-policy.md`. |

---

## 6. Zákaznícka podpora a e-mailová komunikácia

| | |
|---|---|
| **Účel** | Odpovedanie na dopyty zaslané na info@esblu.com / privacy@esblu.com; systémové e-maily generované Supabase Auth (potvrdenie registrácie, reset hesla) |
| **Kategórie údajov** | E-mailová adresa, obsah komunikácie |
| **Kategórie dotknutých osôb** | Typ A |
| **Právny základ** | Plnenie zmluvy / predzmluvné vzťahy (čl. 6 ods. 1 písm. b) GDPR) pre systémové e-maily týkajúce sa účtu; oprávnený záujem (čl. 6 ods. 1 písm. f) GDPR) pre všeobecnú podporu/komunikáciu |
| **Príjemcovia / sprostredkovatelia** | Systémové e-maily (potvrdenie registrácie – `supabase.auth.signUp()`, reset hesla – `supabase.auth.resetPasswordForEmail()`) sú odosielané **výlučne cez vstavaný e-mailový systém Supabase Auth** – v kóde neexistuje žiadna vlastná integrácia Resend/SendGrid/Nodemailer/SMTP. **DISKREPANCIA:** existujúca zverejnená Privacy Policy (`app/ochrana-osobnych-udajov/page.tsx`) uvádza ako subprocessorov aj "Resend (odosielanie vybraných e-mailov)" a "Namecheap Private Email", no v kóde ani v `package-lock.json` sa nenachádza žiadna stopa po ich použití. `LEGAL_DECISION_REQUIRED` – pozri `gdpr-subprocessors.md`, bod o diskrepancii, a `gdpr-launch-checklist.md`. |
| **Cezhraničný prenos** | `TODO` (viď vyššie diskrepancia – kým sa nevyjasní skutočné použitie Resend/Namecheap, cezhraničný prenos e-mailovej komunikácie mimo Supabase Auth nie je možné s istotou posúdiť) |
| **Doba uchovávania** | Neurčito – žiadna automatická retencia e-mailovej komunikácie. Pozri `gdpr-retention-policy.md`. |

---

## Zhrnutie – prehľadová tabuľka

| # | Činnosť | Právny základ | Hlavný sprostredkovateľ |
|---|---|---|---|
| 1 | Registrácia a autentifikácia | Plnenie zmluvy | Supabase |
| 2 | Členstvo vo firme a pozývanie | Plnenie zmluvy | Supabase |
| 3 | Evidencia vozidiel/strojov/skladu | Plnenie zmluvy | Supabase |
| 4 | AI extrakcia dokumentov | Plnenie zmluvy | Supabase, OpenAI |
| 5 | Storage dokumentov/fotografií | Plnenie zmluvy | Supabase |
| 6 | Zákaznícka podpora / e-maily | Plnenie zmluvy / oprávnený záujem | Supabase Auth (systémové); Resend/Namecheap `LEGAL_DECISION_REQUIRED` |

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-subprocessors.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
