# Zoznam sprostredkovateľov (Subprocessors)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15 (aktualizované 2026-08-16 a 2026-08-18 — pozri revízne poznámky nižšie)

---

## Revízia 2026-08-18

**Rozsah tejto revízie:** overenie zmluvného rámca DPA a doplňujúcich prevádzkových parametrov (región/plán/nastavenia) pre štyroch hlavných subprocessorov, na základe priameho overenia zakladateľom na skutočných účtoch. Podrobný záznam pre každého subprocessora je v novej sekcii "Register overenia subprocessorov — 2026-08-18" nižšie.

- **Supabase** — DPA zmluvne začlenená do štandardných podmienok Supabase (nie samostatne podpísaný dokument). Región `eu-central-1` (Frankfurt, EÚ) opätovne potvrdený.
- **Vercel** — DPA pre plán Pro/Enterprise zmluvne začlenená (Esblu beží na pláne **Pro**). Región Functions `fra1` (Frankfurt, EÚ) opätovne potvrdený. Novo potvrdené: **AI/model improvement opt-in je vypnutý**.
- **OpenAI** — DPA v rámci OpenAI Services Agreement, zmluvne začlenená. Novo potvrdené účtové nastavenia: **Sharing = Disabled (všetko)**, **API call logging = Enabled per call**. Appka navyše nezávisle posiela `store: false` pri každom volaní (appková poistka nad rámec účtového nastavenia, nezávislá od Sharing/logging nastavení).
- **Namecheap Private Email** — DPA začlenená do Namecheap zmluvného rámca (nie samostatne podpísaný dokument). Rozsah použitia (`info@esblu.com` + alias `privacy@esblu.com`) potvrdený zhodne s revíziou 2026-08-16.

**Dôležité terminologické rozlíšenie (platí pre všetky štyri položky vyššie):** "DPA zmluvne začlenená/platná" znamená, že spracovateľská zmluva (Data Processing Addendum) je súčasťou štandardných zmluvných podmienok poskytovateľa a aplikuje sa automaticky používaním služby (bežná a pre čl. 28 GDPR dostatočná prax pri SaaS poskytovateľoch tohto typu) — **NEJDE** o samostatne vyjednaný/podpísaný DPA dokument medzi Esblu a poskytovateľom s vlastným dátumom podpisu. Žiadny takýto samostatný podpísaný dokument nebol touto revíziou zistený ani sa nepredpokladá.

Touto revíziou sa nemenia žiadne verejné dokumenty (`/subprocessors`, Privacy Policy) ani appka — iba tento interný podklad. Nerieši sa ňou ani predtým zaznamenaná diskrepancia (Namecheap chýba vo verejných dokumentoch — pozri revíziu 2026-08-16 nižšie, stav zostáva nezmenený, `gdpr-launch-checklist.md` sekcia 4).

---

## Revízia 2026-08-16

- Región Supabase potvrdený: **eu-central-1 (Frankfurt, EÚ)**.
- Región Vercel Functions potvrdený: **fra1 (Frankfurt, EÚ)**.
- Nastavenie OpenAI účtu potvrdené: **"Data sharing: Disabled"**.
- **Namecheap Private Email potvrdený ako reálny subprocessor** — hostuje schránky `info@esblu.com` a `privacy@esblu.com` (`privacy@` je explicitný alias na tú istú schránku). Toto MENÍ povahu predtým zaznamenanej diskrepancie (pozri nižšie) — Namecheap sa NEPOUŽÍVA appkou na odosielanie transakčných e-mailov (to potvrdenie z predchádzajúcej verzie zostáva v platnosti), ale REÁLNE prijíma prichádzajúcu poštu od používateľov/tretích osôb (napr. žiadosti o výkon práv dotknutých osôb na `privacy@esblu.com`) — ide teda o skutočného príjemcu osobných údajov, mimo appky, ktorý doteraz nebol v žiadnom verejnom dokumente (`/subprocessors`, Privacy Policy) uvedený vôbec.
- Formálna akceptácia DPA na účtoch Supabase/Vercel/OpenAI zostáva neoverená (nebola súčasťou potvrdených faktov tejto revízie).
- Touto revíziou sa nemenia žiadne verejné dokumenty (`/subprocessors`, Privacy Policy) ani appka — iba tento interný podklad.

---

## Úvod

Tento dokument obsahuje zoznam všetkých sprostredkovateľov (subprocessors) a tretích strán, ktoré majú v rámci prevádzky Esblu prístup k osobným alebo firemným údajom, identifikovaných na základe auditu zdrojového kódu (`package.json`, premenné prostredia, skutočné volania API). Zoznam slúži ako interný podklad pre verejný zoznam subprocessorov (súčasť Privacy Policy) a pre posúdenie cezhraničných prenosov údajov.

---

## Tabuľka sprostredkovateľov

| Subprocessor | Účel | Kategórie prijímaných údajov | Miesto spracovania | Stav DPA/SCC | Odkaz na dokumentáciu |
|---|---|---|---|---|---|
| **Supabase** (Postgres DB, Auth, Storage) | Hlavná databázová, autentifikačná a úložisková infraštruktúra – hostuje prakticky všetky dáta aplikácie | Všetky kategórie údajov opísané v `gdpr-data-map.md` – autentifikačné údaje, firemné dáta, business dáta, dokumenty, fotografie | **eu-central-1 (Frankfurt, EÚ) — potvrdené 2026-08-16, opätovne 2026-08-18.** Vlastní subprocessori Supabase (AWS, Cloudflare, GitHub) sú US subjekty bez ohľadu na zvolený región projektu. | **OVERENÉ 2026-08-18: DPA zmluvne začlenená** do štandardných podmienok Supabase (nie samostatne podpísaný dokument — pozri register nižšie). Supabase **nie je** DPF certifikovaný — spolieha sa na SCC + UK addendum. | https://supabase.com/privacy · https://supabase.com/legal/dpa · https://supabase.com/security |
| **OpenAI API** (`openai` npm balík, `OPENAI_API_KEY`) | OCR a extrakcia štruktúrovaných údajov z nahraných dokumentov/fotografií (endpointy `/api/scan-document`, `/api/scan-vehicle-doc`, `/api/scan-vehicle-registration`) | Base64-kódované obrázky nahraných dokumentov (potenciálne obsahujúce osobné údaje tretích strán – mená, adresy, VIN, SPZ, sumy, čísla poistiek) | Spracovanie prebieha na infraštruktúre OpenAI, predpoklad mimo EÚ (presná lokalita spracovania stále `TODO`) | **OVERENÉ 2026-08-18: DPA v rámci OpenAI Services Agreement**, zmluvne začlenená (nie samostatne podpísaný dokument). Účet: Sharing = Disabled (všetko), API call logging = Enabled per call. Appka navyše posiela `store: false` pri každom volaní — dvojitá poistka proti použitiu dát na trénovanie/zlepšovanie modelov. OpenAI je DPF certifikovaný + SCC ako záložný mechanizmus. | https://openai.com/enterprise-privacy/ · https://openai.com/policies/data-processing-addendum/ · https://trust.openai.com/ |
| **Vercel** (hosting) | Hosting Next.js aplikácie (frontend + serverless/API funkcie) | Prevádzkové dáta v rámci hostingu – HTTP requesty, ephemeral function logy (bez konfiguračného `vercel.json` v repozitári – zodpovedá defaultnému zero-config nasadeniu) | **fra1 (Frankfurt, EÚ) — potvrdené 2026-08-16, opätovne 2026-08-18.** | **OVERENÉ 2026-08-18: DPA pre plán Pro/Enterprise zmluvne začlenená** (Esblu na pláne Pro; nie samostatne podpísaný dokument). AI/model improvement opt-in potvrdený vypnutý. Vercel je DPF certifikovaný + ponúka SCC/UK Addendum ako alternatívu. | https://vercel.com/legal/privacy-policy · https://vercel.com/legal/dpa |
| **Resend** ("odosielanie vybraných e-mailov") | Uvedené v predchádzajúcej verejnej Privacy Policy (v1.0) ako subprocessor, **ale potvrdené nepoužité v kóde** | – | – | **Potvrdené nepoužívané** – aktuálny `/subprocessors` ho už neuvádza v tabuľke, iba v historickej poznámke o vyriešenej diskrepancii | https://resend.com/legal/privacy-policy |
| **Namecheap Private Email** | **Potvrdené 2026-08-16: reálne hostuje schránky `info@esblu.com` a `privacy@esblu.com`** (`privacy@` je explicitný alias na tú istú schránku). Príjem prichádzajúcej pošty od používateľov/tretích osôb (napr. žiadosti dotknutých osôb, support požiadavky) – NIE odosielanie appkou generovaných e-mailov (to zostáva výhradne cez Supabase Auth). | Obsah prichádzajúcich e-mailov na tieto adresy – môže zahŕňať osobné údaje odosielateľa aj obsah žiadosti | Neznáme – mimo dosahu kódového auditu, treba overiť priamo v Namecheap nastaveniach | **OVERENÉ 2026-08-18: DPA začlenená do Namecheap zmluvného rámca** (nie samostatne podpísaný dokument). Región/transfer mechanizmus zostáva neoverený. | https://www.namecheap.com/legal/privacy-policy/ |

---

## Register overenia subprocessorov — 2026-08-18

Podrobný záznam pre každého zo štyroch hlavných subprocessorov, overený priamo zakladateľom na skutočných účtoch dňa **2026-08-18**. Dopĺňa (nenahrádza) súhrnnú tabuľku vyššie.

### Supabase

- **Účel:** hlavná databázová (PostgreSQL), autentifikačná (Auth) a úložisková (Storage) infraštruktúra appky.
- **Kategórie údajov:** autentifikačné údaje (e-mail, hash hesla); firemné/business dáta (vozidlá, stroje, sklad, dokumenty, AI evidencia); nahraté fotografie/dokumenty (Storage); hashované pozývacie tokeny.
- **Kategórie dotknutých osôb:** registrovaní používatelia Esblu (owner/admin/employee); tretie osoby, ktorých údaje môžu byť obsiahnuté v nahraných dokumentoch/fotografiách (napr. vodiči, zákazníci, dodávatelia uvedení na dokladoch).
- **DPA/zmluvný rámec:** DPA zmluvne začlenená do štandardných zmluvných podmienok Supabase — aplikuje sa automaticky používaním služby. Nie samostatne vyjednaný/podpísaný dokument.
- **Mechanizmus medzinárodných prenosov:** región projektu `eu-central-1` (Frankfurt, EÚ) — primárne spracovanie v EÚ. Vlastní sub-subprocessori Supabase (AWS, Cloudflare, GitHub) sú US subjekty → SCC + UK addendum (Supabase nie je DPF certifikovaný).
- **Stav:** OVERENÉ
- **Dátum overenia:** 2026-08-18
- **Poznámka k revalidácii:** overiť znova pri zmene regiónu/plánu Supabase projektu alebo pri aktualizácii DPA textu zo strany Supabase; odporúčaná frekvencia minimálne raz ročne alebo pri akejkoľvek zmene.

### Vercel

- **Účel:** hosting, deployment a runtime prostredie Next.js aplikácie (frontend + serverless/API funkcie).
- **Kategórie údajov:** prevádzkové dáta v rámci hostingu — HTTP requesty, ephemeral function logy. Appka neposiela Vercelu žiadne obsahové (business) dáta nad rámec bežného request/response cyklu.
- **Kategórie dotknutých osôb:** registrovaní používatelia appky, nepriamo cez HTTP prevádzku; žiadne priame ukladanie osobných údajov tretích osôb Vercelom.
- **DPA/zmluvný rámec:** DPA pre plán **Pro/Enterprise** zmluvne začlenená do štandardných podmienok Vercelu (Esblu beží na pláne **Pro**). Nie samostatne podpísaný dokument.
- **Mechanizmus medzinárodných prenosov:** región Functions `fra1` (Frankfurt, EÚ) — primárne spracovanie v EÚ. Vercel je DPF certifikovaný, so SCC/UK Addendum ako záložným mechanizmom.
- **Doplnkovo overené:** AI/model improvement opt-in je **vypnutý** — Vercel nesmie používať dáta appky na trénovanie/zlepšovanie vlastných AI funkcií.
- **Stav:** OVERENÉ
- **Dátum overenia:** 2026-08-18
- **Poznámka k revalidácii:** overiť znova pri zmene plánu (Pro → iný), zmene regiónu Functions, alebo ak Vercel zmení AI opt-in nastavenie či DPA text.

### OpenAI

- **Účel:** AI-asistované spracovanie (OCR/extrakcia štruktúrovaných údajov) nahraných dokumentov cez OpenAI API (`/api/scan-document`, `/api/scan-vehicle-doc`, `/api/scan-vehicle-registration`).
- **Kategórie údajov:** obsah nahraných dokumentov/fotografií odoslaných na spracovanie — potenciálne mená, adresy, VIN, SPZ, sumy, čísla poistiek a iné údaje tretích osôb obsiahnuté v dokumente.
- **Kategórie dotknutých osôb:** predovšetkým tretie osoby uvedené v spracúvaných dokumentoch (napr. vodiči, zákazníci, dodávatelia, poistení) — nie nutne priamo registrovaní používatelia appky, ktorí dokument iba odosielajú.
- **DPA/zmluvný rámec:** DPA v rámci **OpenAI Services Agreement**, zmluvne začlenená štandardnými podmienkami OpenAI. Nie samostatne podpísaný dokument.
- **Mechanizmus medzinárodných prenosov:** spracovanie primárne mimo EÚ (US). OpenAI je DPF certifikovaný, so SCC ako záložným mechanizmom.
- **Doplnkovo overené účtové nastavenia:** Sharing (zdieľanie dát na trénovanie/zlepšovanie modelov) = **Disabled (všetko)**; API call logging = **Enabled per call** (logovanie jednotlivých API volaní na strane OpenAI, nesúvisí s trénovaním modelov). Appka nezávisle posiela `store: false` pri každom volaní — appková poistka nad rámec účtového nastavenia.
- **Stav:** OVERENÉ
- **Dátum overenia:** 2026-08-18
- **Poznámka k revalidácii:** overiť znova pri zmene účtového nastavenia (Sharing/API logging), zmene použitého modelu/endpointu, alebo pri aktualizácii OpenAI DPA/Services Agreement textu.

### Namecheap Private Email

- **Účel:** hosting e-mailovej schránky `info@esblu.com` (s explicitným aliasom `privacy@esblu.com` na tú istú schránku) — príjem prichádzajúcej pošty od používateľov/tretích osôb (napr. žiadosti o výkon práv dotknutých osôb, support požiadavky). Nepoužíva sa na odosielanie appkou generovaných e-mailov — to zostáva výhradne cez Supabase Auth.
- **Kategórie údajov:** obsah prichádzajúcich e-mailov na tieto adresy — môže zahŕňať osobné údaje odosielateľa aj obsah žiadosti/otázky.
- **Kategórie dotknutých osôb:** odosielatelia e-mailov na `info@`/`privacy@esblu.com` — používatelia appky aj tretie osoby (napr. verejnosť uplatňujúca práva dotknutej osoby).
- **DPA/zmluvný rámec:** DPA začlenená do Namecheap zmluvného rámca (štandardné podmienky poskytovateľa). Nie samostatne podpísaný dokument.
- **Mechanizmus medzinárodných prenosov:** presné miesto spracovania e-mailových dát nebolo touto revíziou nezávisle overené (mimo dosahu kódového auditu) — zostáva `TODO` overiť priamo v Namecheap nastaveniach/dokumentácii.
- **Stav:** OVERENÉ (rozsah použitia a DPA zmluvný rámec); mechanizmus medzinárodných prenosov zostáva neoverený.
- **Dátum overenia:** 2026-08-18
- **Poznámka k revalidácii:** overiť znova pri zmene mailbox providera; doplniť mechanizmus medzinárodných prenosov pri budúcom overení.

---

## Dôležitá poznámka – diskrepancia Resend / Namecheap Private Email (vyriešená, 2026-08-16)

Pôvodný nález (2026-08-15): kompletný audit zdrojového kódu (vrátane `package.json` a `package-lock.json`) nenašiel **žiadnu** stopu po použití Resend, SendGrid, Nodemailer, SMTP klientovi ani akejkoľvek inej vlastnej e-mailovej integrácii v aplikácii. Aplikácia negeneruje žiadnu vlastnú transakčnú e-mailovú komunikáciu — jediné dve akcie, ktoré v aplikácii spúšťajú odoslanie e-mailu (potvrdenie registrácie, reset hesla), prebiehajú výlučne cez vstavaný e-mailový systém Supabase Auth. Napriek tomu vtedajšia (v1.0) Privacy Policy uvádzala ako subprocessorov aj Resend a Namecheap Private Email.

**Zistenie po overení (potvrdené zakladateľom, 2026-08-16):**

1. **Resend** – potvrdené NEPOUŽÍVANÉ. Pôvodný text politiky bol v tejto časti nepresný. Vyriešené už v predchádzajúcom kole (verejná Privacy Policy v1.1 a `/subprocessors` stránka Resend neuvádzajú).
2. **Namecheap Private Email** – potvrdené POUŽÍVANÉ, ale INAK, než pôvodný text tvrdil. Pôvodný text ("odosielanie vybraných e-mailov") opisoval odosielaciu funkciu, ktorá v appke neexistuje. Realita: Namecheap Private Email reálne hostuje schránky `info@esblu.com` a `privacy@esblu.com` (kontaktné adresy uvedené v Kontakte, Privacy Policy aj DPA), pričom `privacy@esblu.com` je explicitný alias na tú istú schránku. Ide teda o skutočného **prijímateľa** prichádzajúcej pošty od používateľov (vrátane žiadostí o výkon práv dotknutých osôb), nie o appkou riadenú odosielaciu infraštruktúru.

**Dôsledok:** Diskrepancia sa nezavrela úplným odstránením Namecheapu (ako sa predtým predpokladalo v bode (b)/(c) nižšie), ale opačným smerom – Namecheap je reálny subprocessor, ktorý dnes v žiadnom VEREJNOM dokumente (`/subprocessors`, Privacy Policy §E) nie je uvedený vôbec. Toto je nová položka na `gdpr-launch-checklist.md` (sekcia 4) a vyžaduje samostatné schválenie zmeny verejných právnych textov – **mimo rozsahu tejto internej dokumentačnej revízie**, ktorá appku, DB ani verejné právne texty nemení.

---

## Poznámka k cezhraničným prenosom (aktualizované 2026-08-18)

**Potvrdené regióny:** Supabase projekt beží v `eu-central-1` (Frankfurt, EÚ); Vercel Functions bežia v `fra1` (Frankfurt, EÚ) – oba hlavné subprocessori teda spracúvajú primárne v EÚ. Toto SAMO OSEBE ešte neznamená úplnú absenciu cezhraničného prenosu – vlastní subprocessori Supabase (AWS, Cloudflare, GitHub) sú US subjekty a Supabase aj Vercel sú US spoločnosti (transfer mechanizmus: Supabase SCC, Vercel DPF+SCC).

**OpenAI:** spracovanie prebieha primárne mimo EÚ (US), presná lokalita pre konkrétny účet zostáva `TODO`. Na účte je potvrdené: Sharing = Disabled (všetko), API call logging = Enabled per call (znižuje riziko zneužitia dát na trénovanie, ale nemení otázku cezhraničného prenosu samotného). OpenAI je DPF certifikovaný, so SCC ako záložným mechanizmom.

**Zmluvný rámec DPA (2026-08-18):** pre Supabase, Vercel aj OpenAI je DPA zmluvne začlenená do štandardných podmienok poskytovateľa (pozri "Register overenia subprocessorov — 2026-08-18" vyššie) — nejde o samostatne vyjednané/podpísané dokumenty. Táto forma zmluvného zabezpečenia je pre účely čl. 28 GDPR dostatočná, pokiaľ štandardné podmienky poskytovateľa DPA skutočne obsahujú (čo bolo overené).

**Zostávajúce otvorené otázky:** presná lokalita spracovania na strane OpenAI; mechanizmus medzinárodných prenosov pri Namecheap Private Email. Toto zostáva `TODO` – pozri `gdpr-launch-checklist.md`.

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
