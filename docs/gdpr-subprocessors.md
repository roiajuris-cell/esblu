# Zoznam sprostredkovateľov (Subprocessors)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15

---

## Úvod

Tento dokument obsahuje zoznam všetkých sprostredkovateľov (subprocessors) a tretích strán, ktoré majú v rámci prevádzky Esblu prístup k osobným alebo firemným údajom, identifikovaných na základe auditu zdrojového kódu (`package.json`, premenné prostredia, skutočné volania API). Zoznam slúži ako interný podklad pre verejný zoznam subprocessorov (súčasť Privacy Policy) a pre posúdenie cezhraničných prenosov údajov.

---

## Tabuľka sprostredkovateľov

| Subprocessor | Účel | Kategórie prijímaných údajov | Miesto spracovania | Stav DPA/SCC | Odkaz na dokumentáciu |
|---|---|---|---|---|---|
| **Supabase** (Postgres DB, Auth, Storage) | Hlavná databázová, autentifikačná a úložisková infraštruktúra – hostuje prakticky všetky dáta aplikácie | Všetky kategórie údajov opísané v `gdpr-data-map.md` – autentifikačné údaje, firemné dáta, business dáta, dokumenty, fotografie | `TODO` – región Supabase projektu nie je potvrdený (EÚ vs. US); nutné overiť v Supabase project settings | `TODO` – potrebné overiť, či je akceptovaná Supabase DPA (Supabase ponúka štandardnú DPA vrátane SCC pri EÚ zákazníkoch) | https://supabase.com/privacy · https://supabase.com/legal/dpa · https://supabase.com/security |
| **OpenAI API** (`openai` npm balík, `OPENAI_API_KEY`) | OCR a extrakcia štruktúrovaných údajov z nahraných dokumentov/fotografií (endpointy `/api/scan-document`, `/api/scan-vehicle-doc`, `/api/scan-vehicle-registration`) | Base64-kódované obrázky nahraných dokumentov (potenciálne obsahujúce osobné údaje tretích strán – mená, adresy, VIN, SPZ, sumy, čísla poistiek) | Spracovanie prebieha na infraštruktúre OpenAI, predpoklad mimo EÚ (presná lokalita: `TODO`) | `TODO` – nutné, aby zakladateľ potvrdil, či je akceptovaná OpenAI DPA/SCC a aký je status API-tier data-use/training opt-out na konkrétnom OpenAI účte. **Poznámka:** volania API v kóde explicitne používajú `store: false` (žiadna požiadavka na perzistentné uloženie na strane OpenAI). Podľa verejne publikovanej politiky OpenAI API (odlišnej od spotrebiteľského ChatGPT produktu) sa dáta z API predvolene netrénujú, no toto tvrdenie musí zakladateľ overiť voči skutočným podmienkam svojho OpenAI účtu, nie brať ako automaticky platné. | https://openai.com/enterprise-privacy/ · https://openai.com/policies/data-processing-addendum/ · https://trust.openai.com/ |
| **Vercel** (hosting) | Hosting Next.js aplikácie (frontend + serverless/API funkcie) | Prevádzkové dáta v rámci hostingu – HTTP requesty, ephemeral function logy (bez konfiguračného `vercel.json` v repozitári – zodpovedá defaultnému zero-config nasadeniu) | `TODO` – región nasadenia (Vercel edge/region konfigurácia) neoverený | `TODO` – nutné overiť akceptáciu Vercel DPA | https://vercel.com/legal/privacy-policy · https://vercel.com/legal/dpa |
| **Resend** ("odosielanie vybraných e-mailov") | Uvedené vo verejnej Privacy Policy ako subprocessor, **ale nepoužité v kóde** | – | – | **UNCONFIRMED — LEGAL_DECISION_REQUIRED, pozri poznámku nižšie** | https://resend.com/legal/privacy-policy |
| **Namecheap Private Email** | Uvedené vo verejnej Privacy Policy ako subprocessor, **ale nepoužité v kóde** | – | – | **UNCONFIRMED — LEGAL_DECISION_REQUIRED, pozri poznámku nižšie** | https://www.namecheap.com/legal/privacy-policy/ |

---

## Dôležitá poznámka – diskrepancia Resend / Namecheap Private Email

Kompletný audit zdrojového kódu (vrátane `package.json` a `package-lock.json`) nenašiel **žiadnu** stopu po použití Resend, SendGrid, Nodemailer, SMTP klientovi ani akejkoľvek inej vlastnej e-mailovej integrácii v aplikácii. Aplikácia negeneruje žiadnu vlastnú transakčnú e-mailovú komunikáciu.

Jediné dve akcie, ktoré v aplikácii spúšťajú odoslanie e-mailu, sú:
1. Potvrdenie registrácie – `supabase.auth.signUp()`
2. Reset hesla – `supabase.auth.resetPasswordForEmail()`

Obe prebiehajú **výlučne cez vstavaný e-mailový systém Supabase Auth**.

Napriek tomu existujúca, už publikovaná Privacy Policy stránka (`app/ochrana-osobnych-udajov/page.tsx`) explicitne uvádza ako subprocessorov aj **"Resend (odosielanie vybraných e-mailov)"** a **"Namecheap Private Email"**.

Možné vysvetlenia:
- (a) Privacy Policy opisuje plánovanú/budúcu infraštruktúru, ktorá ešte nie je implementovaná;
- (b) Resend/Namecheap sa reálne používajú, ale mimo aplikácie – manuálne (napr. zakladateľ manuálne posiela pozývacie e-maily alebo inú komunikáciu cez tieto služby mimo kódu);
- (c) text politiky je jednoducho nepresný a nezodpovedá realite.

**`LEGAL_DECISION_REQUIRED`**: Pred spustením produkcie musí zakladateľ:
1. Overiť skutočné používanie Resend a/alebo Namecheap Private Email (aj mimo aplikačného kódu – napr. na manuálne odosielanie e-mailov, doménovú e-mailovú schránku info@esblu.com/privacy@esblu.com a pod.), **a následne**
2. buď opraviť Privacy Policy a zoznam subprocessorov tak, aby zodpovedali realite (odstrániť, ak sa nepoužívajú), **alebo**
3. implementovať popísanú e-mailovú infraštruktúru tak, aby zodpovedala politike.

Do vyjasnenia tejto diskrepancie sa Resend a Namecheap Private Email v tomto zozname vedú so stavom **UNCONFIRMED**.

---

## Poznámka k cezhraničným prenosom

Pokým nebudú potvrdené regióny spracovania Supabase a presná lokalita spracovania OpenAI API, nie je možné s istotou určiť, či dochádza k prenosu osobných údajov mimo EÚ/EHP a či je potrebné sa oprieť o štandardné zmluvné doložky (SCC) alebo iný mechanizmus podľa kapitoly V. GDPR. Toto je označené ako `TODO` naprieč týmto dokumentom a musí byť vyriešené pred spustením produkcie – pozri `gdpr-launch-checklist.md`.

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
- `gdpr-launch-checklist.md`
