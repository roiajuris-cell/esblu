# Bezpečnostný súhrn (čl. 32 GDPR) — Esblu

Dátum: 15. augusta 2026

Tento dokument zhŕňa technické a organizačné bezpečnostné opatrenia
aplikované v Esblu ku dnešnému dňu, na základe opakovaných bezpečnostných
auditov vykonaných v priebehu vývoja (RLS, Storage, autentifikácia, AI
endpointy, logovanie, IDOR analýza — viď história zmien v `supabase/migrations`).
Účelom je poskytnúť aktuálny (nie pôvodný, dnes už z veľkej časti opravený)
stav pred rozhodnutím o produkčnom spustení.

## 1. Autentifikácia a relácie

- Autentifikácia beží cez Supabase Auth (e-mail + heslo). Heslá nie sú v
  aplikácii nikdy spracúvané v čitateľnej podobe.
- Relácia sa udržiava cez `localStorage` (kľúč `sb-<project-ref>-auth-token`),
  nie cez cookies — nie je teda vystavená CSRF útoku typickému pre
  cookie-session modely; zostáva však vystavená XSS, ak by sa doň dostal
  škodlivý skript (bežné riziko každej SPA s token-in-storage modelom).
- Zmena hesla vyžaduje aktuálnu reláciu (Supabase `updateUser`), obnova
  hesla ide cez e-mailový reset link (Supabase `resetPasswordForEmail`).

## 2. Autorizácia — Row Level Security (RLS)

- Multi-tenant model (`companies`, `company_members`) je od zavedenia
  company-based RLS (migrácie `20260814xxxxxx`) navrhnutý tak, že prístup k
  firemným dátam (vozidlá, stroje, sklad, dokumenty, AI evidencia) sa
  odvodzuje výhradne z `auth.uid()` cez vlastný aktívny `company_members`
  riadok volajúceho — nikdy z klientom posielaného `company_id`.
- Rolové obmedzenia (owner/admin/employee) sú vynucované na úrovni RLS
  policies a SECURITY DEFINER RPC funkcií (napr. `esblu_create_company_invite`
  vyžaduje aktívneho owner/admina), nielen na frontende — frontendové
  skrývanie tlačidiel je iba UX vrstva, nie bezpečnostná hranica.
- Predchádzajúci nález (RLS rekurzia pri prvej verzii `company_members`
  policies) bol identifikovaný a opravený v tej istej fáze zavedenia.
- Vlastníctvo firmy (`companies.owner_id`) je autoritatívny, FK-chránený
  zdroj pravdy o tom, kto je owner — nie meniteľné pole `company_members.role`
  — po náleze regresie v `esblu_get_company_profile` (migrácie
  `20260814180000`/`190000`).

## 3. Storage (Supabase Storage)

- 5 bucketov: `machine-photos`, `inventory-photos`, `company-logos`
  (verejné, iba pre neškodlivý branding/fotoobsah bez prístupových tokenov),
  `ai-inbox-documents`, `ai-evidence-documents` (privátne, prístup výhradne
  cez dočasne platné podpísané URL).
- Storage policies boli sprísnené (migrácia hardeningu Storage z
  predchádzajúcej fázy) tak, aby zápis/mazanie súborov vyžadoval zhodu
  vlastníka/firmy, nie iba prihlásenie.
- Predtým nájdený gap (chýbajúce vlastnícke obmedzenie pri
  `machine-photos`/`company-logos`) bol opravený — zápis loga je dnes
  obmedzený na owner/admin.
- Odstránené predchádzajúce console logovanie podpísaných URL adries (mohlo
  neúmyselne unikať do logov nasadenia).

## 4. AI spracovanie dokumentov (`/api/scan-document` a súvisiace endpointy)

- Endpointy vyžadujú platnú reláciu PRED odoslaním čohokoľvek do OpenAI API
  (auth-first pattern).
- Do OpenAI sa odosiela iba samotný obsah dokumentu/fotografie (base64
  `data:` URL), nie ďalšie metadáta o používateľovi nad rámec potreby.
- Volania OpenAI používajú `store: false` — model explicitne nežiada
  perzistentné uloženie obsahu na strane OpenAI.
- MIME/veľkostná validácia nahrávaných súborov bola doplnená (predtým
  nedostatočná validácia pri `scan-vehicle-doc`).
- Chybové logy (`console.error`) v produkčnom režime negenerujú výpis
  surového obsahu dokumentu/obrázka — iba chybové správy/kódy.

## 5. Referenčná integrita a orphan dáta

- FK-cascade opravy zabezpečujú, že zmazanie vozidla/stroja korektne
  zmaže/odviaže súvisiace servisné záznamy (`vehicle_services`,
  `machine_services`) namiesto ponechania osirotených záznamov.
- Poradie mazania pri `ai_evidence` bolo opravené tak, aby nezanechávalo
  nekonzistentný stav (napr. zmazaný DB záznam s osireteným súborom v
  Storage, alebo naopak).

## 6. IDOR a API route analýza

- Vykonaná statická IDOR analýza naprieč `app/` a `app/api/` — endpointy
  overujú vlastníctvo/členstvo vo firme pred vrátením alebo úpravou dát,
  nie iba prihlásenie.
- Invite token flow (`company_invites`) používa jednorazové, hashované
  (nie plain-text) tokeny s expiráciou; prijatie pozvánky kontroluje zhodu
  e-mailu a stav pozvánky (pending/accepted/revoked/expired).

## 7. Legal acceptance (táto fáza)

- Nová `user_legal_acceptances` tabuľka je zámerne navrhnutá BEZ priameho
  INSERT/UPDATE/DELETE grantu pre `authenticated` — jediná zapisovacia cesta
  je `esblu_accept_legal_document()` (SECURITY DEFINER), ktorá vynucuje
  `auth.uid()` a `now()` na strane DB, nie na strane klienta. Pozri
  `supabase/migrations/20260815100000_add_legal_acceptance.sql`.

## 8. Známe zostávajúce riziká / odporúčania pred produkciou

Toto NIE JE úplný bezpečnostný certifikát — ide o zhrnutie na základe
statickej analýzy kódu (sandbox nemá prístup k živej produkčnej DB/Storage
konfigurácii, preto niektoré nálezy nemožno overiť inak než manuálne v
Supabase dashboarde):

1. **Región Supabase projektu a skutočný stav RLS/Storage policies v
   produkcii** — treba manuálne overiť priamo v Supabase dashboarde, že
   všetky migrácie z `supabase/migrations/` boli reálne aplikované v tomto
   poradí a bez chyby. `LEGAL_DECISION_REQUIRED` / needs founder input.
2. **XSS povrch** — keďže relácia je v `localStorage`, úspešný XSS útok by
   mohol ukradnúť session token. Odporúčame pred produkciou skontrolovať,
   či appka nikde nevkladá nedôveryhodný HTML obsah cez `dangerouslySetInnerHTML`
   alebo ekvivalent (mimo rozsahu tejto GDPR fázy, odporúčaná samostatná
   kontrola).
3. **Žiadny rate-limiting/brute-force ochrana** nebola v kóde nájdená pre
   prihlasovací endpoint nad rámec toho, čo poskytuje Supabase Auth
   natívne — odporúčame overiť nastavenia Supabase Auth rate-limits.
4. **Zálohy** — retenčná politika záloh závisí od Supabase plánu, nebola
   v kóde konfigurovaná/overiteľná — treba potvrdiť v Supabase nastaveniach.
5. **Incident response** je pripravený ako postup (`docs/data-breach-procedure.md`),
   ale doteraz nebol nikdy reálne testovaný/nacvičený.

## 9. Zhrnutie

Väčšina závažných bezpečnostných nálezov identifikovaných v predchádzajúcich
kolách auditu (RLS rekurzia, chýbajúce vlastnícke Storage policies, chýbajúca
MIME validácia, orphan FK dáta, logovanie signed URL) bola **už opravená**
v priebehu vývoja pred touto GDPR fázou. Zostávajúce položky v sekcii 8 sú
buď mimo rozsahu tejto fázy, alebo vyžadujú manuálne overenie v Supabase
dashboarde (mimo dosahu statickej analýzy kódu v tomto sandboxe).
