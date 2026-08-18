# GDPR Launch Checklist – Esblu / AssetPilot

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15 (aktualizované 2026-08-16 a 2026-08-18 — pozri revízne poznámky nižšie)

---

## Revízia 2026-08-18

Zmluvný rámec DPA pre všetkých štyroch hlavných subprocessorov (Supabase, Vercel, OpenAI, Namecheap Private Email) bol overený zakladateľom priamo na skutočných účtoch — podrobný záznam je v `gdpr-subprocessors.md`, sekcia "Register overenia subprocessorov — 2026-08-18". Sekcia 4 nižšie je aktualizovaná zodpovedajúco.

**Dôležité:** "DPA zmluvne začlenená" znamená, že DPA je súčasťou štandardných zmluvných podmienok poskytovateľa a platí automaticky používaním služby — **nejde** o samostatne vyjednaný/podpísaný DPA dokument medzi Esblu a poskytovateľom. Táto revízia takýto samostatný dokument nezistila ani netvrdí, že existuje.

Nerieši sa ňou samostatná, predtým zaznamenaná diskrepancia — Namecheap Private Email chýba vo VEREJNÝCH dokumentoch (`/subprocessors`, Privacy Policy) — tá zostáva otvorená (pozri sekciu 4 nižšie), keďže si vyžaduje schválenie zmeny verejných právnych textov, čo je mimo rozsahu tejto revízie.

Táto revízia nemení žiadny verejný právny text ani appku.

---

## Revízia 2026-08-16

Tento checklist bol pôvodne napísaný 2026-08-15 a odvtedy zaostal za reálnym stavom — viacero položiek označených ako `LEGAL_DECISION_REQUIRED` bolo medzičasom implementovaných alebo potvrdených:

- **Company-level DPA acceptance** — implementované (`company_dpa_acceptances`, migrácia `20260816090000`), predtým vedené ako LAUNCH BLOCKER.
- **Samoobslužné zrušenie účtu/firmy vrátane Storage cleanup** — implementované (`/api/account/delete`, migrácia `20260816100000`).
- **`vehicle_photos`** — pridané (migrácia `20260816110000`), zahrnuté do account-deletion cleanup.
- **Región Supabase** — potvrdené: `eu-central-1` (Frankfurt, EÚ).
- **Región Vercel Functions** — potvrdené: `fra1` (Frankfurt, EÚ).
- **OpenAI účet** — potvrdené nastavenie "Data sharing: Disabled".
- **`info@esblu.com`/`privacy@esblu.com`** — potvrdené: hostované cez Namecheap Private Email, `privacy@` je alias na tú istú schránku.
- **Právne posúdenie:** automatizovaná redakcia rodných čísel v OCR výstupe a dedikovaný monitoring/alerting nástroj (napr. Sentry) sa **nepovažujú za samostatné launch blockery** — GDPR čl. 32 vyžaduje primerané, riziku zodpovedajúce opatrenia, nie konkrétnu technológiu.

Táto revízia mení iba STAV jednotlivých položiek nižšie na základe vyššie uvedených potvrdených faktov a právneho posúdenia — nezavádza žiadny nový technický mechanizmus, nemení appku, DB ani verejné právne texty.

---

## Účel dokumentu

Toto je hlavný ("master") checklist, ktorý má zakladateľ alebo prizvaný právnik použiť na rozhodnutie, či je Esblu pripravené z pohľadu GDPR na produkčné spustenie ("flip the switch to production"). Každá položka je označená stavom:

- **DONE** – potvrdené auditom/kódom, hotové, s uvedeným dôvodom
- **IN PROGRESS** – práve sa buduje v rámci tejto compliance fázy (napr. tento balík dokumentov, legal acceptance model)
- **LEGAL_DECISION_REQUIRED / NEEDS FOUNDER INPUT** – vyžaduje rozhodnutie zakladateľa, prípadne právnika, skôr než sa dá označiť za hotové

---

## 1. Právne dokumenty (Legal documents)

| Položka | Stav | Poznámka |
|---|---|---|
| Verejná Privacy Policy (Ochrana osobných údajov) existuje | DONE | Existuje na `/ochrana-osobnych-udajov` – **ale obsahuje diskrepanciu (Resend/Namecheap), ktorú treba opraviť pred spustením** |
| Verejné Obchodné podmienky (Terms of Service) existujú a sú aktuálne | `NEEDS FOUNDER INPUT` | Overiť, či existujú, sú aktuálne a zodpovedajú skutočnej funkcionalite |
| Cookie Policy stránka (`/cookies`) | IN PROGRESS | Buduje sa oddelene mimo tento balík dokumentov; obsahovo odôvodnená, keďže Esblu nepoužíva žiadne cookies (viď bod 6) |
| Interné compliance dokumenty (data map, processing register, subprocessors, retention, breach procedure, tento checklist) | DONE | Vytvorené týmto balíkom dokumentov (`docs/gdpr-*.md`, `docs/data-breach-procedure.md`) |
| Legal acceptance model (súhlas so zmluvnými podmienkami a potvrdenie oboznámenia s Privacy Policy) | IN PROGRESS | Buduje sa oddelene – tabuľky `legal_documents` a `user_legal_acceptances`; existujúci používatelia dostanú blokujúci modal po ďalšom prihlásení, ak nemajú akceptovanú aktuálnu verziu |
| Právne posúdenie Terms/DPA právnikom | `LEGAL_DECISION_REQUIRED` | Nie je potvrdené, či Terms/DPA prešli právnou kontrolou |
| Zmluva/DPA medzi Esblu a firmami-zákazníkmi (spracovateľská zmluva vo vzťahu k dátam typu B – tretie osoby v dokumentoch) | DONE (dokument) | Text DPA je publikovaný na `/dpa`. Osobná acceptance jednotlivým používateľom (owner/admin/employee) sa nevyžaduje — DPA je B2B dokument medzi Esblu a firmou, nie osobný súhlas zamestnanca. |
| **Company-level DPA acceptance (owner/authorized representative prijíma aktuálnu verziu DPA ZA FIRMU)** | **DONE (implementované 2026-08-16)** | Tabuľka `company_dpa_acceptances` (append-only, SECURITY DEFINER RPC `esblu_accept_company_dpa`, presne rola `owner`) — pozri `supabase/migrations/20260816090000_add_company_dpa_acceptance.sql`. DB-level enforcement (BEFORE INSERT trigger `esblu_require_company_dpa_current`, fail-closed) blokuje vytvorenie nových záznamov v `ai_evidence`/`documents`/`vehicles`/`machines`/`inventory_items` a súvisiacich tabuľkách, kým firma nemá akceptovanú aktuálnu DPA verziu — presne rieši pôvodne popísaný launch blocker (rozhodujúci moment = nahratie osobných údajov tretích osôb, nie platený/verejný launch). |

---

## 2. Databáza / technické opatrenia (DB/technical)

| Položka | Stav | Poznámka |
|---|---|---|
| Multi-tenant štruktúra (`companies`, `company_members`) je navrhnutá a implementovaná | DONE | Potvrdené kódom |
| RLS (Row Level Security) politiky zabraňujúce cross-tenant prístupu k dátam | `NEEDS FOUNDER INPUT` | Tento audit sa nezameral na explicitnú verifikáciu RLS politík na produkčnej databáze – nutné samostatne overiť/otestovať pred spustením (kľúčové pre prevenciu breach scenárov popísaných v `data-breach-procedure.md`) |
| Hashovanie hesiel | DONE | Zabezpečuje Supabase Auth automaticky |
| Hashovanie pozývacích tokenov (SHA-256, jednorazové) | DONE | Potvrdené v `company_invites` |
| Žiadne explicitné pole rodného čísla v schéme | DONE | Potvrdené auditom schémy – no pozri reziduálne riziko v `gdpr-data-map.md` (OCR text/obrázky môžu rodné číslo obsahovať náhodne) |
| Mechanizmus na detekciu/redakciu citlivých údajov (napr. rodné číslo) v OCR výstupe | **Rozhodnuté (2026-08-16) — nevyžaduje sa samostatný nástroj** | Právne posúdenie: GDPR čl. 32 vyžaduje primerané, riziku zodpovedajúce opatrenia, nie konkrétnu technológiu. Akceptovateľné riziko so zdokumentovaným zdôvodnením – pozri `gdpr-retention-policy.md`, bod 2.5. Priebežne prehodnocovať pri raste rozsahu spracovania. |
| Cascade delete / anonymizácia pri vymazaní účtu/firmy zmapovaná a otestovaná | **DONE (implementované 2026-08-16)** | `esblu_owner_delete_company`/`esblu_member_delete_self` – presné poradie mazania po tabuľkách je vypísané priamo v `supabase/migrations/20260816100000_add_account_self_deletion.sql`. Pozri `gdpr-retention-policy.md`, bod 2.11. Automatizované testy neboli spúšťané v rámci tohto auditu — funkčnosť je overená čítaním kódu, nie end-to-end testom. |
| Server-side cleanup orphaned Storage súborov | `LEGAL_DECISION_REQUIRED` | Naďalej neimplementované – pozri `gdpr-retention-policy.md`, bod 2.8. Mimo rozsahu tejto revízie (iba dokumentácia, žiadny nový cron/job). |
| Automatizovaná retenčná politika (akákoľvek) | `LEGAL_DECISION_REQUIRED` | Naďalej neimplementovaná – pozri `gdpr-retention-policy.md`. Mimo rozsahu tejto revízie. |
| Retencia `document_review_log` | `LEGAL_DECISION_REQUIRED` | Nový nález (2026-08-16) – pozri `gdpr-retention-policy.md`, bod 2.12 |

---

## 3. Bezpečnosť (Security)

| Položka | Stav | Poznámka |
|---|---|---|
| Žiadne API kľúče/secrets commitnuté v repozitári | `NEEDS FOUNDER INPUT` | Nebolo súčasťou tohto auditu – odporúča sa samostatná kontrola (napr. git history scan) pred spustením |
| `OPENAI_API_KEY` a iné secrets sú len server-side, nie exponované klientovi | `NEEDS FOUNDER INPUT` | Odporúča sa explicitne overiť, že žiadny API kľúč nie je v client-side kóde/bundle |
| Postup pri úniku dát (breach procedure) zdokumentovaný | DONE | `data-breach-procedure.md` – aktualizovaný 2026-08-16 o detekčné kanály (sekcia 2a) a subprocessor incident postup (sekcia 9) |
| Dedikovaný bezpečnostný tím/proces | **RISK ACCEPTED (2026-08-16)** | Neexistuje – zakladateľ je jediná zodpovedná osoba. Právne posúdenie: absencia dedikovaného monitoring/alerting nástroja (napr. Sentry) nie je sama osebe launch blocker – GDPR čl. 32 vyžaduje primerané opatrenia zodpovedajúce riziku, nie konkrétny nástroj. Zdokumentované transparentne v `data-breach-procedure.md`, sekcia 2a, s výslovnou poznámkou o priebežnom prehodnocovaní pri raste rozsahu. |
| 2FA/MFA pre administrátorský prístup k Supabase/Vercel dashboardom | `NEEDS FOUNDER INPUT` | Neoverené v rámci tohto auditu, odporúča sa zapnúť ak ešte nie je |

---

## 4. Subprocessors

| Položka | Stav | Poznámka |
|---|---|---|
| Zoznam subprocessorov identifikovaný z kódu | DONE | `gdpr-subprocessors.md` – Supabase, OpenAI, Vercel potvrdené |
| Región Supabase projektu (EÚ vs. US) potvrdený | **DONE (2026-08-16)** | Potvrdené: `eu-central-1` (Frankfurt, EÚ) |
| Supabase DPA zmluvný rámec overený | **OVERENÉ (2026-08-18)** | DPA zmluvne začlenená do štandardných podmienok Supabase — nie samostatne podpísaný dokument (pozri terminologické rozlíšenie v revízii vyššie). Supabase nie je DPF certifikovaný, spolieha sa na SCC + UK addendum. Región `eu-central-1` (Frankfurt, EÚ) opätovne potvrdený. Detail: `gdpr-subprocessors.md`. |
| OpenAI DPA zmluvný rámec a data-use/training opt-out status potvrdený na skutočnom účte | **OVERENÉ (2026-08-18)** | DPA v rámci OpenAI Services Agreement, zmluvne začlenená. Účet: Sharing = Disabled (všetko), API call logging = Enabled per call; appka navyše posiela `store: false` pri každom volaní. Detail: `gdpr-subprocessors.md`. |
| Vercel DPA zmluvný rámec akceptovaná, región nasadenia overený | **OVERENÉ (2026-08-18)** | DPA pre plán Pro/Enterprise zmluvne začlenená (Esblu na pláne Pro). Región Functions `fra1` (Frankfurt, EÚ) opätovne potvrdený. Novo potvrdené: AI/model improvement opt-in vypnutý. Detail: `gdpr-subprocessors.md`. |
| Namecheap Private Email DPA zmluvný rámec overený | **OVERENÉ (2026-08-18)** | DPA začlenená do Namecheap zmluvného rámca — nie samostatne podpísaný dokument. Mechanizmus medzinárodných prenosov zostáva neoverený. Toto je NEZÁVISLÉ od riadku nižšie (chýbanie vo verejných dokumentoch) — tá diskrepancia zostáva otvorená. Detail: `gdpr-subprocessors.md`. |
| **Namecheap Private Email chýba vo verejných dokumentoch** | `LEGAL_DECISION_REQUIRED` — **stav nezmenený od 2026-08-16, Resend položka odstránená ako zastaraná (2026-08-18)** | Potvrdené, že `info@`/`privacy@esblu.com` SÚ reálne hostované cez Namecheap Private Email — ide o REÁLNEHO subprocessora prijímajúceho osobné údaje, ktorý dnes v žiadnom verejnom dokumente (`/subprocessors`, Privacy Policy) nie je uvedený vôbec. DPA zmluvný rámec Namecheapu bol medzičasom overený (riadok vyššie), ale to NERIEŠI túto diskrepanciu — tá sa týka výhradne chýbania vo verejných textoch, nie zmluvného vzťahu s Namecheapom. Vyžaduje samostatné rozhodnutie a explicitné schválenie zmeny verejných právnych textov/`/subprocessors` stránky – **mimo rozsahu internej dokumentačnej revízie**. (Pôvodne táto položka viedla aj samostatnú Resend diskrepanciu — audit 2026-08-18 potvrdil, že Resend sa v kóde/`package.json`/env premenných Esblu nikde nenachádza a je nepoužívané už od predchádzajúcej revízie 2026-08-16; ako aktuálna/otvorená položka je preto odstránená, plné znenie pôvodného zistenia zostáva zdokumentované v `gdpr-subprocessors.md`.) |
| Verejný zoznam subprocessorov (v Privacy Policy) zodpovedá internému zoznamu | `LEGAL_DECISION_REQUIRED` | Závisí od vyriešenia predchádzajúceho bodu (doplnenie Namecheap do verejných dokumentov) |

---

## 5. Práva dotknutých osôb (Data subject rights)

| Položka | Stav | Poznámka |
|---|---|---|
| Kontaktný kanál pre žiadosti o výkon práv (prístup, oprava, vymazanie, prenosnosť, námietka) | DONE | privacy@esblu.com existuje ako dedikovaný kontakt |
| Zdokumentovaný interný proces spracovania takejto žiadosti (kto, ako, do akej lehoty – zákonná lehota je spravidla 1 mesiac) | `NEEDS FOUNDER INPUT` | Nebol identifikovaný formálny interný proces/postup – odporúča sa vytvoriť jednoduchý postup (aj mimo tohto dokumentu) |
| Technická schopnosť vyexportovať dáta jedného používateľa/firmy (data portability) | `NEEDS FOUNDER INPUT` | Neoverené, či existuje nástroj/skript na export – v súčasnosti pravdepodobne manuálny SQL dotaz |
| Technická schopnosť vymazať dáta jedného používateľa/firmy vrátane súvisiacich záznamov | **DONE (2026-08-16)** | `esblu_owner_delete_company`/`esblu_member_delete_self` + `/api/account/delete` – pozri DONE riadok "Cascade delete" v sekcii 2 vyššie |

---

## 6. Retencia (Retention)

| Položka | Stav | Poznámka |
|---|---|---|
| Politika uchovávania zdokumentovaná (aj keď zatiaľ neimplementovaná) | DONE | `gdpr-retention-policy.md` – aktualizovaná 2026-08-16 (doplnené `document_review_log`, invites, deletion flow, regióny) |
| Automatizovaná retencia implementovaná | `LEGAL_DECISION_REQUIRED` | Naďalej neimplementovaná – vedomá medzera, mimo rozsahu tejto revízie, pozri retention policy dokument |
| Retencia Vercel function logov overená | `LEGAL_DECISION_REQUIRED` | Región DONE (`fra1`, Frankfurt EÚ), retenčná lehota samotná stále TODO |
| Retencia Supabase záloh overená | `LEGAL_DECISION_REQUIRED` | Región DONE (`eu-central-1`, Frankfurt EÚ), retenčná lehota samotná stále TODO |

---

## 7. Cookies / tracking

| Položka | Stav | Poznámka |
|---|---|---|
| Žiadne cookies sa nepoužívajú | **DONE** | Potvrdené auditom kódu – nikde sa nenachádza `document.cookie` ani cookie knižnica; jediné client-side úložisko je localStorage session token Supabase Auth SDK (nevyhnutné pre fungovanie služby) |
| Žiadna analytika/telemetria/tracking (Google Analytics, PostHog, Mixpanel, Plausible a pod.) | **DONE** | Potvrdené – nulový výskyt v kóde aj `package.json` |
| Žiadny error/crash monitoring SaaS (napr. Sentry) | **DONE** | Potvrdené – nie je integrovaný |
| Žiadne logovanie IP adries/user-agentov | **DONE** | Potvrdené – nikde v kóde |
| Cookie Policy stránka publikovaná (transparentné zdôvodnenie "prečo nie sú potrebné cookies") | IN PROGRESS | Buduje sa oddelene mimo tento balík, plánovaná na `/cookies` |
| Cookie banner | **DONE (nepotrebný)** | Vzhľadom na nulové použitie cookies a netrackovacieho localStorage (funkčná nutnosť, analogické "strictly necessary" výnimke) sa cookie banner nevyžaduje |

---

## 8. DPIA / DPO

| Položka | Stav | Poznámka |
|---|---|---|
| Posúdenie potreby DPIA (Data Protection Impact Assessment) podľa čl. 35 GDPR | `LEGAL_DECISION_REQUIRED` | Vzhľadom na spracovanie dokumentov obsahujúcich potenciálne citlivé osobné údaje (vrátane reziduálneho rizika rodného čísla) prostredníctvom AI/OCR služby tretej strany (OpenAI) sa odporúča formálne posúdiť, či je DPIA potrebná. Toto posúdenie nebolo v rámci tohto auditu vykonané a **musí byť vykonané zakladateľom/právnikom**, nie predpokladané. |
| Ustanovenie zodpovednej osoby (DPO) podľa čl. 37 GDPR | `LEGAL_DECISION_REQUIRED` | Neposúdené, či sa na Esblu vzťahuje povinnosť ustanoviť DPO (závisí od rozsahu a povahy spracovania, najmä ak by sa spracovanie dokumentov považovalo za "rozsiahle monitorovanie" alebo obsahovalo osobitné kategórie údajov vo väčšom rozsahu) |

---

## 9. Sign-off

| Položka | Stav | Poznámka |
|---|---|---|
| Tento checklist prešiel kontrolou zakladateľa | `NEEDS FOUNDER INPUT` | Čaká na review |
| Tento checklist (alebo aspoň kritické `LEGAL_DECISION_REQUIRED` položky) prešiel kontrolou právnika | `LEGAL_DECISION_REQUIRED` | Neoverené, či bol prizvaný právnik so slovenskou/GDPR špecializáciou |
| Registračné údaje spoločnosti doplnené (IČO, DIČ, IČ DPH, presná adresa) do všetkých dokumentov (interných aj verejných) | `LEGAL_DECISION_REQUIRED` | Momentálne označené ako TODO naprieč všetkými dokumentmi |
| Finálne rozhodnutie o spustení produkcie | `LEGAL_DECISION_REQUIRED` | Odporúča sa vydať len po vyriešení aspoň kritických položiek vyššie (najmä: Resend/Namecheap diskrepancia, región Supabase, RLS overenie, registračné údaje) |

---

## Prioritný zoznam pred spustením (odporúčané poradie riešenia, aktualizované 2026-08-18)

1. **Doplniť Namecheap Private Email do verejnej Privacy Policy a `/subprocessors`** (Resend časť je vyriešená; Namecheap je potvrdený reálny subprocessor s overeným DPA zmluvným rámcom, ale v žiadnom verejnom dokumente chýba — vyžaduje samostatné schválenie zmeny verejných textov, mimo rozsahu internej revízie)
2. **Overiť RLS politiky** proti cross-tenant úniku dát (najvyššie bezpečnostné riziko)
3. ~~Potvrdiť zmluvný rámec DPA Supabase/Vercel/OpenAI/Namecheap na účtoch~~ — **OVERENÉ (2026-08-18)**, pozri sekciu 4 vyššie a `gdpr-subprocessors.md`
4. **Doplniť registračné údaje spoločnosti** (IČO, DIČ, adresa) všade, kde sú momentálne TODO
5. **Posúdiť potrebu DPIA** (vzhľadom na citlivosť dokumentového modulu)
6. Dokončiť legal acceptance model (IN PROGRESS)
7. Dokončiť a publikovať Cookie Policy stránku (IN PROGRESS)
8. Zvážiť implementáciu aspoň základnej retenčnej politiky pre najcitlivejšie dáta (dokumenty/AI evidencia) a pre `document_review_log`
9. Zabezpečiť právnu kontrolu Terms/DPA a tohto checklistu ako celku
10. ~~Implementovať company-level DPA acceptance~~ — **DONE (2026-08-16)**, pozri sekciu 1 vyššie

Vybavené od poslednej verzie checklistu (2026-08-15 → 2026-08-16): company-level DPA acceptance, samoobslužné zrušenie účtu/firmy vrátane Storage cleanup, `vehicle_photos`, potvrdenie regiónov Supabase/Vercel, potvrdenie OpenAI data-sharing nastavenia, potvrdenie Namecheap ako reálneho mailbox hostingu, právne rozhodnutie o redakcii/monitoringu.

Vybavené od poslednej verzie checklistu (2026-08-16 → 2026-08-18): overený zmluvný rámec DPA pre Supabase, Vercel, OpenAI a Namecheap Private Email (podrobne v `gdpr-subprocessors.md`); doplnkovo potvrdené Vercel plán Pro + AI opt-in vypnutý a OpenAI API call logging/Sharing nastavenia. Zostáva otvorená: chýbanie Namecheapu vo verejných dokumentoch (položka 1 vyššie, samostatné rozhodnutie mimo rozsahu tejto revízie).

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-subprocessors.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
