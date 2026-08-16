# Zoznam sprostredkovateľov (Subprocessors)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15 (aktualizované 2026-08-16 — pozri revíznu poznámku nižšie)

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
| **Supabase** (Postgres DB, Auth, Storage) | Hlavná databázová, autentifikačná a úložisková infraštruktúra – hostuje prakticky všetky dáta aplikácie | Všetky kategórie údajov opísané v `gdpr-data-map.md` – autentifikačné údaje, firemné dáta, business dáta, dokumenty, fotografie | **eu-central-1 (Frankfurt, EÚ) — potvrdené 2026-08-16.** Vlastní subprocessori Supabase (AWS, Cloudflare, GitHub) sú US subjekty bez ohľadu na zvolený región projektu. | Supabase **nie je** DPF certifikovaný — spolieha sa na SCC + UK addendum. Formálna akceptácia Supabase DPA na účte `TODO` – zatiaľ neoverené. | https://supabase.com/privacy · https://supabase.com/legal/dpa · https://supabase.com/security |
| **OpenAI API** (`openai` npm balík, `OPENAI_API_KEY`) | OCR a extrakcia štruktúrovaných údajov z nahraných dokumentov/fotografií (endpointy `/api/scan-document`, `/api/scan-vehicle-doc`, `/api/scan-vehicle-registration`) | Base64-kódované obrázky nahraných dokumentov (potenciálne obsahujúce osobné údaje tretích strán – mená, adresy, VIN, SPZ, sumy, čísla poistiek) | Spracovanie prebieha na infraštruktúre OpenAI, predpoklad mimo EÚ (presná lokalita spracovania stále `TODO`) | Volania API používajú `store: false` A na účte je potvrdené nastavenie **"Data sharing: Disabled" (potvrdené 2026-08-16)** — dvojitá poistka proti použitiu dát na trénovanie/zlepšovanie modelov. OpenAI je DPF certifikovaný + SCC ako záložný mechanizmus. Formálna akceptácia OpenAI DPA na účte `TODO` – zatiaľ neoverené. | https://openai.com/enterprise-privacy/ · https://openai.com/policies/data-processing-addendum/ · https://trust.openai.com/ |
| **Vercel** (hosting) | Hosting Next.js aplikácie (frontend + serverless/API funkcie) | Prevádzkové dáta v rámci hostingu – HTTP requesty, ephemeral function logy (bez konfiguračného `vercel.json` v repozitári – zodpovedá defaultnému zero-config nasadeniu) | **fra1 (Frankfurt, EÚ) — potvrdené 2026-08-16.** | Vercel je DPF certifikovaný + ponúka SCC/UK Addendum ako alternatívu. Formálna akceptácia Vercel DPA na účte `TODO` – zatiaľ neoverené. | https://vercel.com/legal/privacy-policy · https://vercel.com/legal/dpa |
| **Resend** ("odosielanie vybraných e-mailov") | Uvedené v predchádzajúcej verejnej Privacy Policy (v1.0) ako subprocessor, **ale potvrdené nepoužité v kóde** | – | – | **Potvrdené nepoužívané** – aktuálny `/subprocessors` ho už neuvádza v tabuľke, iba v historickej poznámke o vyriešenej diskrepancii | https://resend.com/legal/privacy-policy |
| **Namecheap Private Email** | **Potvrdené 2026-08-16: reálne hostuje schránky `info@esblu.com` a `privacy@esblu.com`** (`privacy@` je explicitný alias na tú istú schránku). Príjem prichádzajúcej pošty od používateľov/tretích osôb (napr. žiadosti dotknutých osôb, support požiadavky) – NIE odosielanie appkou generovaných e-mailov (to zostáva výhradne cez Supabase Auth). | Obsah prichádzajúcich e-mailov na tieto adresy – môže zahŕňať osobné údaje odosielateľa aj obsah žiadosti | Neznáme – mimo dosahu kódového auditu, treba overiť priamo v Namecheap nastaveniach | Neznáme – treba overiť Namecheap DPA/SCC status | https://www.namecheap.com/legal/privacy-policy/ |

---

## Dôležitá poznámka – diskrepancia Resend / Namecheap Private Email (vyriešená, 2026-08-16)

Pôvodný nález (2026-08-15): kompletný audit zdrojového kódu (vrátane `package.json` a `package-lock.json`) nenašiel **žiadnu** stopu po použití Resend, SendGrid, Nodemailer, SMTP klientovi ani akejkoľvek inej vlastnej e-mailovej integrácii v aplikácii. Aplikácia negeneruje žiadnu vlastnú transakčnú e-mailovú komunikáciu — jediné dve akcie, ktoré v aplikácii spúšťajú odoslanie e-mailu (potvrdenie registrácie, reset hesla), prebiehajú výlučne cez vstavaný e-mailový systém Supabase Auth. Napriek tomu vtedajšia (v1.0) Privacy Policy uvádzala ako subprocessorov aj Resend a Namecheap Private Email.

**Zistenie po overení (potvrdené zakladateľom, 2026-08-16):**

1. **Resend** – potvrdené NEPOUŽÍVANÉ. Pôvodný text politiky bol v tejto časti nepresný. Vyriešené už v predchádzajúcom kole (verejná Privacy Policy v1.1 a `/subprocessors` stránka Resend neuvádzajú).
2. **Namecheap Private Email** – potvrdené POUŽÍVANÉ, ale INAK, než pôvodný text tvrdil. Pôvodný text ("odosielanie vybraných e-mailov") opisoval odosielaciu funkciu, ktorá v appke neexistuje. Realita: Namecheap Private Email reálne hostuje schránky `info@esblu.com` a `privacy@esblu.com` (kontaktné adresy uvedené v Kontakte, Privacy Policy aj DPA), pričom `privacy@esblu.com` je explicitný alias na tú istú schránku. Ide teda o skutočného **prijímateľa** prichádzajúcej pošty od používateľov (vrátane žiadostí o výkon práv dotknutých osôb), nie o appkou riadenú odosielaciu infraštruktúru.

**Dôsledok:** Diskrepancia sa nezavrela úplným odstránením Namecheapu (ako sa predtým predpokladalo v bode (b)/(c) nižšie), ale opačným smerom – Namecheap je reálny subprocessor, ktorý dnes v žiadnom VEREJNOM dokumente (`/subprocessors`, Privacy Policy §E) nie je uvedený vôbec. Toto je nová položka na `gdpr-launch-checklist.md` (sekcia 4) a vyžaduje samostatné schválenie zmeny verejných právnych textov – **mimo rozsahu tejto internej dokumentačnej revízie**, ktorá appku, DB ani verejné právne texty nemení.

---

## Poznámka k cezhraničným prenosom (aktualizované 2026-08-16)

**Potvrdené regióny:** Supabase projekt beží v `eu-central-1` (Frankfurt, EÚ); Vercel Functions bežia v `fra1` (Frankfurt, EÚ) – oba hlavné subprocessori teda spracúvajú primárne v EÚ. Toto SAMO OSEBE ešte neznamená úplnú absenciu cezhraničného prenosu – vlastní subprocessori Supabase (AWS, Cloudflare, GitHub) sú US subjekty a Supabase aj Vercel sú US spoločnosti (transfer mechanizmus: Supabase SCC, Vercel DPF+SCC).

**OpenAI:** spracovanie prebieha primárne mimo EÚ (US), presná lokalita pre konkrétny účet zostáva `TODO`. Na účte je potvrdené nastavenie "Data sharing: Disabled" (znižuje riziko zneužitia dát na trénovanie, ale nemení otázku cezhraničného prenosu samotného). OpenAI je DPF certifikovaný, so SCC ako záložným mechanizmom.

**Zostávajúce otvorené otázky:** formálna akceptácia DPA na účtoch Supabase/Vercel/OpenAI (regióny sú potvrdené, zmluvný stav DPA nie); presná lokalita spracovania na strane OpenAI. Toto zostáva `TODO` – pozri `gdpr-launch-checklist.md`.

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
