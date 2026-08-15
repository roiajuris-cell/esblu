# GDPR Launch Checklist – Esblu / AssetPilot

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15

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
| **Company-level DPA acceptance (owner/authorized representative prijíma aktuálnu verziu DPA ZA FIRMU)** | **`LEGAL_DECISION_REQUIRED` — LAUNCH BLOCKER** | Bežný employee osobne DPA akceptovať nemusí, ale appka dnes NEMÁ žiadny mechanizmus, ktorý by dokázateľne zaznamenal, že owner/oprávnený zástupca firmy AKTUÁLNU verziu DPA prijal za celú firmu (analogicky `user_legal_acceptances`, ale na úrovni `company_id`, nie `user_id`). Bez tohto záznamu Esblu nevie preukázať uzavretie spracovateľskej zmluvy podľa čl. 28 voči žiadnej firme. Návrh (nateraz NEIMPLEMENTOVANÝ, iba návrh — **pripravený ako NASLEDUJÚCI POVINNÝ implementačný krok**): tabuľka `company_dpa_acceptances (company_id, dpa_version, accepted_at, accepted_by user_id, acceptance_method)` s rovnakým append-only/SECURITY DEFINER RPC vzorom ako `user_legal_acceptances`, zápis vyhradený pre aktívneho owner/admina danej firmy. **Rozhodujúci moment NIE JE "platený" alebo "verejný" launch — je to okamih, keď REÁLNA firma (aj v bezplatnej testovacej fáze) nahrá do Esblu osobné údaje TRETÍCH OSÔB (zamestnancov, zákazníkov, dodávateľov), pretože práve vtedy Esblu reálne vystupuje ako processor voči tejto firme podľa čl. 28.** Musí byť implementované a nasadené PRED týmto okamihom, nie iba pred budúcim plateným spustením — testovanie interným/vlastným účtom bez reálnych údajov tretích osôb túto podmienku nezakladá. |

---

## 2. Databáza / technické opatrenia (DB/technical)

| Položka | Stav | Poznámka |
|---|---|---|
| Multi-tenant štruktúra (`companies`, `company_members`) je navrhnutá a implementovaná | DONE | Potvrdené kódom |
| RLS (Row Level Security) politiky zabraňujúce cross-tenant prístupu k dátam | `NEEDS FOUNDER INPUT` | Tento audit sa nezameral na explicitnú verifikáciu RLS politík na produkčnej databáze – nutné samostatne overiť/otestovať pred spustením (kľúčové pre prevenciu breach scenárov popísaných v `data-breach-procedure.md`) |
| Hashovanie hesiel | DONE | Zabezpečuje Supabase Auth automaticky |
| Hashovanie pozývacích tokenov (SHA-256, jednorazové) | DONE | Potvrdené v `company_invites` |
| Žiadne explicitné pole rodného čísla v schéme | DONE | Potvrdené auditom schémy – no pozri reziduálne riziko v `gdpr-data-map.md` (OCR text/obrázky môžu rodné číslo obsahovať náhodne) |
| Mechanizmus na detekciu/redakciu citlivých údajov (napr. rodné číslo) v OCR výstupe | `LEGAL_DECISION_REQUIRED` | Neexistuje – zvážiť, či je pred spustením nutný, alebo je akceptovateľné riziko so zdokumentovaným zdôvodnením |
| Cascade delete / anonymizácia pri vymazaní účtu/firmy zmapovaná a otestovaná | `LEGAL_DECISION_REQUIRED` | Pozri `gdpr-retention-policy.md`, bod 2.11 – DB-level ON DELETE pravidlá neboli v rámci tohto auditu overené |
| Server-side cleanup orphaned Storage súborov | `LEGAL_DECISION_REQUIRED` | Neimplementované – pozri `gdpr-retention-policy.md`, bod 2.8 |
| Automatizovaná retenčná politika (akákoľvek) | `LEGAL_DECISION_REQUIRED` | Neimplementovaná – pozri `gdpr-retention-policy.md` |

---

## 3. Bezpečnosť (Security)

| Položka | Stav | Poznámka |
|---|---|---|
| Žiadne API kľúče/secrets commitnuté v repozitári | `NEEDS FOUNDER INPUT` | Nebolo súčasťou tohto auditu – odporúča sa samostatná kontrola (napr. git history scan) pred spustením |
| `OPENAI_API_KEY` a iné secrets sú len server-side, nie exponované klientovi | `NEEDS FOUNDER INPUT` | Odporúča sa explicitne overiť, že žiadny API kľúč nie je v client-side kóde/bundle |
| Postup pri úniku dát (breach procedure) zdokumentovaný | DONE | `data-breach-procedure.md` vytvorený týmto balíkom |
| Dedikovaný bezpečnostný tím/proces | `NEEDS FOUNDER INPUT` (vedomá medzera) | Neexistuje – zakladateľ je jediná zodpovedná osoba, zdokumentované transparentne v `data-breach-procedure.md` |
| 2FA/MFA pre administrátorský prístup k Supabase/Vercel dashboardom | `NEEDS FOUNDER INPUT` | Neoverené v rámci tohto auditu, odporúča sa zapnúť ak ešte nie je |

---

## 4. Subprocessors

| Položka | Stav | Poznámka |
|---|---|---|
| Zoznam subprocessorov identifikovaný z kódu | DONE | `gdpr-subprocessors.md` – Supabase, OpenAI, Vercel potvrdené |
| Región Supabase projektu (EÚ vs. US) potvrdený | `LEGAL_DECISION_REQUIRED` | TODO naprieč všetkými dokumentmi – zásadné pre posúdenie cezhraničného prenosu |
| Supabase DPA/SCC akceptovaná | `LEGAL_DECISION_REQUIRED` | TODO |
| OpenAI DPA/SCC a data-use/training opt-out status potvrdený na skutočnom účte | `LEGAL_DECISION_REQUIRED` | TODO – `store: false` je nastavené v kóde, ale zmluvný/politický status treba overiť samostatne |
| Vercel DPA akceptovaná, región nasadenia overený | `LEGAL_DECISION_REQUIRED` | TODO |
| **Resend / Namecheap Private Email diskrepancia vyriešená** | `LEGAL_DECISION_REQUIRED` | **Kriticky dôležité pred spustením** – verejná Privacy Policy uvádza tieto subprocessory, ale kód ich nepoužíva. Musí sa buď opraviť Privacy Policy, alebo implementovať zodpovedajúca infraštruktúra. Pozri `gdpr-subprocessors.md`. |
| Verejný zoznam subprocessorov (v Privacy Policy) zodpovedá internému zoznamu | `LEGAL_DECISION_REQUIRED` | Závisí od vyriešenia predchádzajúceho bodu |

---

## 5. Práva dotknutých osôb (Data subject rights)

| Položka | Stav | Poznámka |
|---|---|---|
| Kontaktný kanál pre žiadosti o výkon práv (prístup, oprava, vymazanie, prenosnosť, námietka) | DONE | privacy@esblu.com existuje ako dedikovaný kontakt |
| Zdokumentovaný interný proces spracovania takejto žiadosti (kto, ako, do akej lehoty – zákonná lehota je spravidla 1 mesiac) | `NEEDS FOUNDER INPUT` | Nebol identifikovaný formálny interný proces/postup – odporúča sa vytvoriť jednoduchý postup (aj mimo tohto dokumentu) |
| Technická schopnosť vyexportovať dáta jedného používateľa/firmy (data portability) | `NEEDS FOUNDER INPUT` | Neoverené, či existuje nástroj/skript na export – v súčasnosti pravdepodobne manuálny SQL dotaz |
| Technická schopnosť vymazať dáta jedného používateľa/firmy vrátane súvisiacich záznamov | `LEGAL_DECISION_REQUIRED` | Súvisí s bodom cascade delete vyššie (sekcia 2) |

---

## 6. Retencia (Retention)

| Položka | Stav | Poznámka |
|---|---|---|
| Politika uchovávania zdokumentovaná (aj keď zatiaľ neimplementovaná) | DONE | `gdpr-retention-policy.md` vytvorený týmto balíkom |
| Automatizovaná retencia implementovaná | `LEGAL_DECISION_REQUIRED` | Neimplementovaná – vedomá medzera, pozri retention policy dokument |
| Retencia Vercel function logov overená | `LEGAL_DECISION_REQUIRED` | TODO |
| Retencia Supabase záloh overená | `LEGAL_DECISION_REQUIRED` | TODO |

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

## Prioritný zoznam pred spustením (odporúčané poradie riešenia)

1. **Vyriešiť Resend/Namecheap diskrepanciu** vo verejnej Privacy Policy (rýchle, ale kriticky viditeľné navonok)
2. **Overiť RLS politiky** proti cross-tenant úniku dát (najvyššie bezpečnostné riziko)
3. **Potvrdiť región Supabase a status OpenAI/Supabase/Vercel DPA** (nutné pre presné vyjadrenia o cezhraničnom prenose v Privacy Policy)
4. **Doplniť registračné údaje spoločnosti** (IČO, DIČ, adresa) všade, kde sú momentálne TODO
5. **Posúdiť potrebu DPIA** (vzhľadom na citlivosť dokumentového modulu)
6. Dokončiť legal acceptance model (IN PROGRESS)
7. Dokončiť a publikovať Cookie Policy stránku (IN PROGRESS)
8. Zvážiť implementáciu aspoň základnej retenčnej politiky pre najcitlivejšie dáta (dokumenty/AI evidencia)
9. Zabezpečiť právnu kontrolu Terms/DPA a tohto checklistu ako celku
10. **Implementovať company-level DPA acceptance** (owner/oprávnený zástupca prijíma aktuálnu verziu DPA za firmu) — **povinné PRED tým, než ktorákoľvek reálna firma (aj v bezplatnej testovacej fáze) nahrá do Esblu osobné údaje tretích osôb**; nezávisí od toho, či ide o platenú alebo bezplatnú verziu — pripravené ako nasledujúci povinný implementačný krok

---

## Súvisiace dokumenty

- `gdpr-data-map.md`
- `gdpr-processing-register.md`
- `gdpr-subprocessors.md`
- `gdpr-retention-policy.md`
- `data-breach-procedure.md`
