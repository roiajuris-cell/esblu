# Esblu — GDPR + Legal Readiness: Compliance revízia pred produkciou

Dátum: 15. augusta 2026
Status: **NÁVRH NA SCHVÁLENIE — nič z tejto fázy nebolo commitnuté, pushnuté,
nasadené ani aplikované do produkčnej databázy.** Všetky súbory nižšie
existujú lokálne v repozitári a čakajú na tvoje schválenie.

---

## 0. Ako čítať tento dokument

Toto je súhrnný report. Detaily sú v samostatných dokumentoch v `docs/` a v
novom/upravenom kóde v repozitári — tento report ich prepája a vysvetľuje,
čo je hotové, čo treba rozhodnúť a čo zostáva na teba alebo právnika.

Legenda stavov:
- **HOTOVO** — implementované a pripravené na nasadenie po tvojom schválení.
- **LEGAL_DECISION_REQUIRED** — technicky pripravené, ale obsahuje
  rozhodnutie/hodnotu, ktorú musíš doplniť ty alebo potvrdiť právnik.
- **MIMO ROZSAHU** — vedome nerobené v tejto fáze, dôvod uvedený.

---

## 1. Osobné údaje — čo Esblu spracúva

Plný rozpis: `docs/gdpr-data-map.md`.

Skrátene: prihlasovací e-mail a heslo (cez Supabase Auth), názov/logo firmy,
členstvo vo firme (owner/admin/employee), e-maily pozvaní, dáta vo vozidlách/
strojoch/sklade/AI evidencii, nahraté fotografie a dokumenty (vrátane ich AI
rozpoznaného obsahu), technické prihlasovacie/bezpečnostné dáta. **Žiadne**
cookies, **žiadna** analytika/telemetria, **žiadne** IP logovanie na
aplikačnej úrovni bolo nájdené v kóde.

Reziduálne riziko: naskenovaný dokument môže náhodne obsahovať citlivejší
údaj (napr. rodné číslo na doklade), keďže appka OCR výstup nefiltruje/
neredaguje. Netýka sa to bežného chodu appky, ale je to zaznamenané ako
známe reziduálne riziko.

## 2. Dodávatelia / subprocessors

Plný rozpis: `docs/gdpr-subprocessors.md`, verejná stránka `/subprocessors`.

| Dodávateľ | Účel | Status |
|---|---|---|
| Supabase | DB, Auth, Storage | HOTOVO (funkčne), región **LEGAL_DECISION_REQUIRED** — over v Supabase dashboarde |
| OpenAI | AI extrakcia údajov z dokumentov | HOTOVO (funkčne, `store:false`), presná lokalita spracovania a DPA/SCC status **LEGAL_DECISION_REQUIRED** |
| Vercel | Hosting | HOTOVO (funkčne), región **LEGAL_DECISION_REQUIRED** |

**Dôležitý nález**: pôvodná (dosiaľ živá) Ochrana osobných údajov uvádzala
aj **Resend** a **Namecheap Private Email** ako dodávateľov. V kóde sa
nenašla žiadna stopa po ich reálnom použití — všetka e-mailová komunikácia
(potvrdenie registrácie, reset hesla) ide výhradne cez vstavaný e-mailový
systém Supabase Auth. Opravil som text na `/ochrana-osobnych-udajov` a
`/subprocessors` tak, aby zodpovedal reálnemu stavu, a explicitne som
uviedol dôvod opravy priamo na stránke `/subprocessors`.

`LEGAL_DECISION_REQUIRED`: potvrď, že Resend/Namecheap sa naozaj nepoužívajú
(napr. ani manuálne mimo appky). Ak sa predsa používajú, treba ich vrátiť do
zoznamu s presným popisom, na čo presne slúžia.

## 3. Nové/upravené právne dokumenty

Všetky používajú spoločný `PublicLegalLayout`/`LegalSection` (existujúci
komponent), sú dostupné aj bez prihlásenia, prelinkované navzájom a
z footer/login/Nastavenia.

| Stránka | Stav | Poznámka |
|---|---|---|
| `/ochrana-osobnych-udajov` | **upravená** (v1.0 → v1.1) | Opravená sekcia E (Resend/Namecheap), doplnené odkazy na /cookies, /dpa, /subprocessors, explicitnejšia formulácia práv a "žiadne automatizované rozhodovanie" |
| `/podmienky-pouzivania` | beze zmeny (v1.0) | Obsahovo už spĺňala požiadavky (primeraná, nie absolútna zodpovednosť; žiadna vymyslená jurisdikčná doložka) |
| `/cookies` | **nová** | Záver: Esblu nepoužíva cookies, iba nevyhnutné localStorage pre reláciu → žiadny cookie banner nie je potrebný |
| `/dpa` | **nová** | Zmluva o spracúvaní osobných údajov podľa čl. 28 pre firemných zákazníkov |
| `/subprocessors` | **nová** | Tabuľka dodávateľov s odkazmi na ich vlastné privacy/DPA stránky |

Zdrojom pravdy pre identitu a verzie je nový `lib/legal-config.ts` —
žiadna stránka/komponent už nemá natvrdo vpísanú identitu prevádzkovateľa.

`LEGAL_DECISION_REQUIRED` polia v `lib/legal-config.ts` (zámerne `null`,
nič nebolo vymyslené): registrovaná/kontaktná adresa, IČO, DIČ, IČ DPH,
presný právny status (živnostník vs. fyzická osoba bez živnosti).

## 4. Databázový model pre acceptance (pripravené, NEAPLIKOVANÉ)

Súbor: `supabase/migrations/20260815100000_add_legal_acceptance.sql`.

- `legal_documents` — append-only zoznam publikovaných verzií (type, version,
  effective_at, required). Verejne čitateľné (žiadne osobné údaje).
- `user_legal_acceptances` — kto/akú verziu/kedy/akou metódou akceptoval.
  **Žiadny priamy INSERT/UPDATE/DELETE grant pre bežného používateľa** —
  jediná zapisovacia cesta je `esblu_accept_legal_document()`
  (SECURITY DEFINER), ktorá:
  - vyžaduje platnú reláciu (`auth.uid()` nie null),
  - overí, že verzia naozaj existuje medzi publikovanými dokumentmi,
  - sama nastaví `accepted_at = now()` — klient ho nemôže poslať vlastný,
  - je idempotentná (opakované volanie tej istej verzie nič nepokazí).
- `esblu_get_my_pending_required_acceptances()` — read-only funkcia, ktorú
  používa blokujúci modal (viď nižšie), aby zistila, čo ešte treba potvrdiť.

Táto migrácia **nebola spustená voči produkčnej DB** — čaká na tvoje
schválenie a manuálne spustenie (alebo cez tvoj bežný deployment proces).

## 5. Acceptance flow — noví aj existujúci používatelia

### Nová registrácia (`app/login/page.tsx`)

Predtým: jedna implicitná veta "Registráciou potvrdzujete...". Teraz: **dva
samostatné povinné checkboxy** — "Súhlasím s Podmienkami používania" a
"Potvrdzujem, že som sa oboznámil/a so Zásadami ochrany osobných údajov" —
tlačidlo "Vytvoriť účet" je do ich odškrtnutia neaktívne. Ak session príde
okamžite (potvrdenie e-mailu vypnuté), acceptance sa zapíše ihneď po
registrácii. Ak treba čakať na potvrdenie e-mailu, acceptance sa dopíše
automaticky pri prvom prihlásení cez blokujúci modal nižšie (fail-safe,
nespolieha sa iba na jeden moment zápisu).

Marketingový súhlas: appka dnes žiadny marketing/consent flow nemá, takže
nebol pridávaný žiadny "checkbox navyše" — ak v budúcnosti pribudne, musí
byť samostatný, default OFF, mimo tejto povinnej dvojice (zdokumentované v
komentároch v `lib/legal-config.ts`).

### Existujúci používatelia — blokujúci modal (`app/components/LegalAcceptanceGate.tsx`)

Nová komponenta zapojená do `app/layout.tsx`, obaľuje celú appku:

- Pri KAŽDOM prihlásenom používateľovi (owner, admin AJ employee — nielen
  owner) na KAŽDEJ neverejnej stránke skontroluje
  `esblu_get_my_pending_required_acceptances()`.
- Ak vráti nevybavené required dokumenty, zobrazí blokujúci modal (nedá sa
  zavrieť inak než odsúhlasením alebo odhlásením) s checkboxami pre presne
  tie dokumenty, ktoré chýbajú.
- Po odsúhlasení zapíše acceptance cez RPC a modal zmizne — nabudúce sa už
  nezobrazí, pokiaľ nepribudne nová required verzia.
- Vynechané zámerne: `/login`, `/invite/*`, `/onboarding/*`, `/reset-hesla`
  a všetky verejné právne stránky — aby nový/pozvaný používateľ nebol
  blokovaný skôr, než sa vôbec dostane do appky, a aby si mohol dokumenty
  prečítať bez prihlásenia.
- Ak RPC z akéhokoľvek dôvodu (napr. migrácia ešte nie je aplikovaná)
  zlyhá/nevráti nič, appka sa správa, akoby nebolo treba nič potvrdiť —
  **neblokuje appku naslepo**, presne ako si žiadal.

## 6. Nastavenia → Súkromie a dáta (`app/nastavenia/page.tsx`)

Nová sekcia dopĺňa existujúcu "Právne informácie" (teraz s odkazmi na
všetkých 5 dokumentov, nie iba 2):

- Zoznam vlastných acceptance záznamov (dokument, verzia, presný čas
  potvrdenia) — číta priamo z `user_legal_acceptances` cez RLS (vidí iba
  vlastné riadky).
- Tlačidlá "Požiadať o export mojich údajov" a "Požiadať o opravu mojich
  údajov" — cez `mailto:` na `privacy@esblu.com` s predvyplnenou správou
  (rovnaký vzor ako existujúci feedback formulár v tom istom súbore).
- **Vymazanie účtu je zámerne rozdelené podľa role**:
  - Employee/admin: "Požiadať o vymazanie môjho účtu" — text explicitne
    hovorí, že sa vymaže iba osobná identita/členstvo, NIE firemné dáta.
  - Owner: "Požiadať o ukončenie firemného účtu" — samostatný proces,
    vizuálne odlíšený, s explicitným varovaním, že ide o nezvratnú operáciu
    dotýkajúcu sa VŠETKÝCH členov firmy.

`LEGAL_DECISION_REQUIRED`/pripravené na neskôr: export/oprava/vymazanie sa
dnes vybavujú manuálne (e-mailom), appka nemá automatizovaný self-service
export ani automatické mazanie. Pri väčšom počte žiadostí to bude treba
zautomatizovať — mimo rozsahu tejto fázy.

## 7. Cookies — audit a záver

`docs/gdpr-data-map.md` + nová stránka `/cookies`. Kód neobsahuje žiadne
cookies, žiadnu analytiku, žiadne sledovacie skripty. Jediné úložisko v
prehliadači je `localStorage` kľúč Supabase Auth SDK (nevyhnutný pre
fungovanie prihlásenia). **Záver: cookie lišta sa nezavádza** — bola by bez
reálneho účelu. Ak sa v budúcnosti pridá čo i len voliteľná analytika, treba
pred jej nasadením doplniť súhlasový nástroj (blokovanie pred súhlasom,
rovnako jednoduché prijatie/odmietnutie, odvolateľnosť).

## 8. AI spracovanie dokumentov (`/api/scan-document` a súvisiace)

- Overená autentifikácia PRED odoslaním obsahu do OpenAI.
- Odosiela sa iba samotný obsah dokumentu (base64), nie extra osobné údaje.
- `store: false` na všetkých volaniach — model nežiada perzistenciu na
  strane OpenAI.
- AI výstup sa vždy pred uložením ručne overuje používateľom — appka ho
  nepoužíva na automatizované rozhodovanie s právnym účinkom.
- Zapracované do Privacy Policy (sekcia F) aj do zoznamu subprocessors.

`LEGAL_DECISION_REQUIRED`: presná spracovateľská lokalita a DPA/SCC status
podľa aktuálneho OpenAI API účtu (nie ChatGPT konzumentský produkt) treba
potvrdiť priamo v OpenAI účtovom nastavení, nie odhadovať z kódu.

## 9. Retencia dát

Plný rozpis: `docs/gdpr-retention-policy.md`. Súčasný stav: **žiadna
automatizovaná retencia neexistuje** (žiadny cron/scheduled cleanup v
repozitári) — dáta sa uchovávajú, kým existuje účet/firma alebo kým nie sú
manuálne vymazané. Dokument navrhuje kritériá retencie pre každú kategóriu
(auth, pozvánky, dokumenty, zálohy, orphan Storage súbory), ale konkrétne
číselné lehoty su označené `LEGAL_DECISION_REQUIRED` — neboli vymýšľané.

## 10. Práva dotknutých osôb

Zjednotené na dvoch miestach: verejná `/ochrana-osobnych-udajov` (sekcia I)
a `Nastavenia → Súkromie a dáta` (sekcia 6 vyššie). Zahŕňa prístup, opravu,
výmaz, obmedzenie, prenosnosť, námietku, odvolanie súhlasu a právo na
sťažnosť na Úrad na ochranu osobných údajov SR (s priamym odkazom).

## 11. Zoznam migrácií pripravených touto fázou

Iba **jedna** nová migrácia, nič nebolo aplikované:

- `supabase/migrations/20260815100000_add_legal_acceptance.sql` — vytvára
  `legal_documents`, `user_legal_acceptances`, RLS policies, 2 SECURITY
  DEFINER RPC funkcie, a seeduje 4 počiatočné verzie dokumentov (terms 1.0,
  privacy_policy 1.1, dpa 1.0, cookie_policy 1.0).

Žiadne existujúce tabuľky sa touto migráciou nemenia ani nemažú.

## 12. Bezpečnostný súhrn a DPIA/DPO

- `docs/gdpr-security-summary.md` — zhŕňa aktuálny (už z veľkej časti
  hardenovaný v predchádzajúcich kolách vývoja) bezpečnostný stav a
  zostávajúce riziká (región Supabase, XSS-voči-localStorage povrch,
  rate-limiting, zálohy).
- `docs/gdpr-dpia-dpo-assessment.md` — záver: pri súčasnom rozsahu Esblu sa
  **nevyžaduje** formálna DPIA ani menovanie DPO; treba prehodnotiť pri
  výraznom raste alebo pridaní profilovania/osobitných kategórií údajov.

## 13. Incident/breach readiness

`docs/data-breach-procedure.md` — praktický postup pre solo-founder
prevádzku (nie enterprise SOC): čo je incident, ako logovať, ako posúdiť
riziko, kedy oznámiť Úradu na ochranu osobných údajov SR (do 72 hodín, ak
nejde o nepravdepodobné riziko) a kedy priamo dotknutým osobám (pri vysokom
riziku). Zámerne **nepredurčuje** "incident = vždy nahlásiť" — to je vždy
posúdenie prípad od prípadu.

## 14. Interné compliance dokumenty (kompletný zoznam)

Všetky v `docs/`:

1. `gdpr-data-map.md` — mapa osobných údajov
2. `gdpr-processing-register.md` — register spracovateľských činností (čl. 30)
3. `gdpr-subprocessors.md` — interný zoznam dodávateľov
4. `gdpr-retention-policy.md` — retenčná politika
5. `data-breach-procedure.md` — postup pri incidente
6. `gdpr-launch-checklist.md` — launch checklist
7. `gdpr-dpia-dpo-assessment.md` — DPIA/DPO posúdenie
8. `gdpr-security-summary.md` — bezpečnostný súhrn
9. `gdpr-compliance-review-2026-08-15.md` — tento dokument

## 15. Kompletný zoznam `LEGAL_DECISION_REQUIRED` / čo potrebujem od teba

1. Presná registrovaná/kontaktná adresa prevádzkovateľa (`lib/legal-config.ts → address`).
2. IČO / DIČ / IČ DPH, ak existuje živnosť — inak potvrdiť, že prevádzkuješ ako fyzická osoba bez živnosti.
3. Potvrdenie/vyvrátenie Resend/Namecheap — reálne sa používajú, alebo bola pôvodná Privacy Policy nepresná?
4. Región Supabase projektu (EÚ/US) — pre presné určenie medzinárodných prenosov.
5. Región nasadenia Vercel.
6. Presná spracovateľská lokalita a DPA/SCC status OpenAI API účtu.
7. Retenčná politika záloh podľa aktuálneho Supabase plánu.
8. Konkrétne číselné retenčné lehoty (napr. koľko dní po vymazaní účtu sa dáta reálne fyzicky odstránia) — dnes iba kritériá, nie čísla.
9. Právna kontrola `/podmienky-pouzivania` a `/dpa` pred spustením platenej verzie (najmä rozhodné právo/jurisdikcia, ktoré bolo zámerne ponechané neuvedené).
10. Potvrdenie záveru DPIA/DPO pri raste/zmene rozsahu.
11. **LAUNCH BLOCKER**: company-level DPA acceptance. Bežný employee nemusí DPA osobne akceptovať, ale appka dnes nemá spôsob, ako dokázateľne zaznamenať, že owner/oprávnený zástupca firmy prijal aktuálnu verziu DPA ZA FIRMU. Rozhodujúci moment NIE JE "platený" alebo "verejný" launch — je to okamih, keď reálna firma (aj počas bezplatného testovania) nahrá do Esblu osobné údaje TRETÍCH OSÔB, pretože vtedy Esblu voči tejto firme reálne vystupuje ako processor podľa čl. 28. Navrhnuté a pripravené ako **nasledujúci povinný implementačný krok** (nateraz NEIMPLEMENTOVANÉ): tabuľka `company_dpa_acceptances` (company_id, dpa_version, accepted_at, accepted_by, acceptance_method) s rovnakým append-only/SECURITY DEFINER vzorom ako `user_legal_acceptances`, zápis vyhradený pre aktívneho owner/admina. Pozri `gdpr-launch-checklist.md` sekcia 1 a prioritný zoznam bod 10.

## 16. Čo je úplne dokončené a pripravené na nasadenie (po tvojom schválení)

- Centrálna legal konfigurácia (`lib/legal-config.ts`).
- 5 verejných právnych stránok (2 upravené, 3 nové), prelinkované.
- DB migrácia pre acceptance model (pripravená, neaplikovaná).
- Blokujúci acceptance flow pre nových aj existujúcich používateľov.
- Rozšírená registrácia s dvoma explicitnými checkboxami.
- Nastavenia → Súkromie a dáta so zobrazením acceptance histórie a žiadosťami o práva.
- UI odkazy (footer, login/register, Nastavenia).
- 9 interných compliance dokumentov.
- Overenie: `tsc --noEmit` bez chýb, `eslint` bez chýb na všetkých novo/upravovaných súboroch (3 nesúvisiace pred-existujúce lint chyby v `app/nastavenia/page.tsx` boli overené ako existujúce už pred touto fázou — nie sú spôsobené touto zmenou a nepatria do jej rozsahu), produkčný build prešiel po kompiláciu (padol iba na sieťovom obmedzení sandboxu pri sťahovaní Google Fonts, nie na chybe v kóde).

## 17. Čo je zámerne mimo rozsahu tejto fázy

- Automatizovaný self-service export/vymazanie dát (dnes manuálne cez e-mail).
- Marketingový consent flow (appka dnes marketing nerobí).
- Podpisový/zmluvný proces pre DPA s firemnými zákazníkmi (dokument je pripravený, formálny akceptačný mechanizmus pre B2B zákazníkov nie).
- Automatizovaná retenčná politika (cron cleanup) — iba navrhnuté kritériá.

---

**Ďalší krok**: keď schváliš obsah (najmä sekciu 15 — doplň, čo vieš), poviem
ti presne, čo treba spustiť (jedna SQL migrácia) a môžeme pokračovať
commitom/pushom podľa tvojho pokynu. Do schválenia sa nič nemení mimo tejto
lokálnej prípravy.
