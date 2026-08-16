# Postup pri úniku/incidente osobných údajov (Data Breach Procedure)

**Projekt:** Esblu / AssetPilot
**Prevádzkovateľ:** Jaroslav Juriš, fyzická osoba, Slovenská republika
**Verzia:** 1.0
**Dátum:** 2026-08-15 (aktualizované 2026-08-16 — pozri revíznu poznámku nižšie)

---

## Revízia 2026-08-16

- Doplnená nová sekcia 2a — popis reálnych detekčných kanálov incidentu a právne zdôvodnenie, prečo absencia dedikovaného monitoring/alerting SaaS nástroja (napr. Sentry) nie je sama osebe launch blocker: GDPR čl. 32 vyžaduje primerané opatrenia zodpovedajúce riziku, nie konkrétnu technológiu. Toto je zdokumentované vedomé rozhodnutie, priebežne prehodnocovateľné pri raste rozsahu spracovania.
- Doplnená nová sekcia 9 — konkrétny procesný postup pri incidente na strane subprocessora (Supabase/Vercel/OpenAI), predtým bol k dispozícii iba kontaktný zoznam.
- Doplnené potvrdené regióny infraštruktúry (Supabase `eu-central-1`, Vercel Functions `fra1`) do sekcie 9.
- Žiadny nový monitoring nástroj ani automatizovaný detekčný mechanizmus nebol touto revíziou implementovaný — ide výhradne o zosúladenie dokumentácie s reálnym stavom a s novým právnym posúdením.

---

## 1. Účel dokumentu

Tento dokument je praktickým interným postupom pre riešenie bezpečnostných incidentov týkajúcich sa osobných údajov v Esblu. Je napísaný pre realitu **jednoosobového zakladateľa bez dedikovaného bezpečnostného tímu** – nejde o enterprise SOC playbook, ale o použiteľný, konkrétny postup, ktorý dokáže vykonať jedna osoba.

**Dôležité upozornenie na úvod:** Tento dokument **vopred nerozhoduje**, že "každý incident = automatické oznámenie" úradu alebo dotknutým osobám. GDPR vyžaduje **posúdenie rizika** v každom konkrétnom prípade (pozri bod 5). Povinnosť oznámiť incident vzniká len za podmienok popísaných nižšie – nie automaticky pri akomkoľvek bezpečnostnom incidente.

---

## 2. Čo sa považuje za "personal data incident" (breach)

Podľa čl. 4 bod 12 GDPR je porušením ochrany osobných údajov akékoľvek porušenie bezpečnosti, ktoré vedie k **náhodnému alebo nezákonnému zničeniu, strate, zmene, neoprávnenému poskytnutiu alebo prístupu** k prenášaným, uchovávaným alebo inak spracúvaným osobným údajom.

### Konkrétne príklady relevantné pre Esblu:

- **Nesprávne nastavené Storage/RLS (Row Level Security) politiky** umožňujúce jednej firme vidieť alebo sťahovať dokumenty/fotografie inej firmy (cross-tenant data leak) – napr. chyba v RLS politike na tabuľke `documents` alebo v prístupových pravidlách Storage bucketov `ai-inbox-documents`/`ai-evidence-documents`.
- **Únik API kľúča** – napr. `OPENAI_API_KEY` alebo Supabase `service_role` kľúč omylom commitnutý do verejného Git repozitára, zalogovaný do verejne prístupného logu, alebo exponovaný na strane klienta namiesto servera.
- **Kompromitovaný používateľský účet** – napr. útočník získa prístup k účtu cez uniknuté/slabé heslo alebo cez phishing a získa tak prístup k dátam firmy.
- **Kompromitovaný Supabase alebo Vercel administrátorský prístup** (napr. únik prístupových údajov k samotnému Supabase/Vercel dashboardu zakladateľa).
- **Nesprávne verejný Storage bucket** – napr. bucket, ktorý mal byť privátny, bol omylom nastavený ako verejný (public), a tak boli dokumenty prístupné bez autentifikácie komukoľvek s URL.
- **Strata/zničenie dát** bez zálohy – napr. omylom vykonaný `DELETE`/`DROP` príkaz bez možnosti obnovy.
- **Chyba v kóde API endpointu**, ktorá vráti dáta patriace inému používateľovi/firme (napr. chýbajúci filter podľa `company_id` v query).
- **Neúmyselné odoslanie citlivých dát tretej strane** – napr. nesprávne adresovaný e-mail s prílohou obsahujúcou osobné údaje.

Incident nemusí byť výsledkom útoku – **rovnako sem patrí aj vlastná chyba v konfigurácii alebo kóde**, ktorá viedla k vyššie uvedeným následkom.

---

## 2a. Ako sa incident v praxi zachytáva (detekčné kanály)

Esblu k dnešnému dňu nemá nasadený dedikovaný monitoring/alerting SaaS nástroj (napr. Sentry) – toto je **vedomé, zdokumentované rozhodnutie, nie prehliadnutá medzera**. GDPR čl. 32 vyžaduje "primerané" technické a organizačné opatrenia zodpovedajúce rizikám konkrétneho spracúvania, nie konkrétnu technológiu; pri súčasnom rozsahu (jednoosobový zakladateľ, bezplatná testovacia fáza, obmedzený počet firiem) sa nasledovné kanály považujú za primerané:

- **Nahlásenie od zákazníka/používateľa** (napr. cez info@/privacy@esblu.com) – najpravdepodobnejší reálny kanál zistenia.
- **Vlastné zistenie zakladateľa** pri bežnej práci na appke (napr. pri code review, teste, manuálnej kontrole Supabase dashboardu).
- **Notifikácia od subprocessora** (Supabase/Vercel/OpenAI) – pozri sekciu 9 nižšie.
- **Chybové logy** vo Vercel function logoch (ephemeral, ale viditeľné počas bežnej prevádzky/nasadení) — potvrdené, že `console.error` v produkcii nezobrazuje surový obsah dokumentu/obrázka (`gdpr-security-summary.md`, bod 4), iba chybové správy/kódy.

**Toto posúdenie treba priebežne prehodnocovať** – ak by sa rozsah spracúvania alebo počet aktívnych firiem/zákazníkov výrazne zväčšil, primeranosť čisto reaktívnych kanálov sa môže zmeniť a zavedenie aktívneho monitoringu by sa mohlo stať odôvodneným krokom. Toto nie je automatický predpoklad ani touto revíziou zavádzaný záväzok — iba transparentné konštatovanie, kedy by sa malo znovu posúdiť.

---

## 3. Kto posudzuje incident

**V súčasnosti neexistuje žiadny dedikovaný bezpečnostný tím.** Posúdenie incidentu, rozhodovanie o ďalších krokoch a prípadné oznamovanie vykonáva **priamo zakladateľ/prevádzkovateľ (Jaroslav Juriš)** ako jediná zodpovedná osoba. Toto je vedomé konštatovanie skutočného stavu, nie predstieranie neexistujúcej štruktúry.

Ak si posúdenie vyžaduje odbornú pomoc presahujúcu kapacitu zakladateľa (napr. forenzná analýza kompromitácie, právne posúdenie závažnosti), zakladateľ by si mal v danej chvíli zabezpečiť externú pomoc (právnik špecializovaný na GDPR, prípadne bezpečnostný konzultant) – toto nie je vopred zazmluvnené a je na individuálne rozhodnutie v čase incidentu.

---

## 4. Čo zaznamenávať počas incidentu (incident log)

Od momentu zistenia incidentu je potrebné viesť si priebežný záznam (postačuje jednoduchý dokument/poznámka s časovými pečiatkami), ktorý obsahuje minimálne:

1. **Časová os (timeline):**
   - Kedy incident pravdepodobne nastal (ak je možné určiť)
   - Kedy bol incident zistený a kým/čím (napr. nahlásenie zákazníka, vlastné zistenie, monitoring)
   - Kedy sa začalo vyšetrovanie
   - Kedy boli vykonané jednotlivé nápravné/zmierňujúce kroky

2. **Postihnuté systémy/tabuľky/buckety:**
   - Konkrétne databázové tabuľky (napr. `documents`, `ai_evidence`, `vehicles`)
   - Konkrétne Storage buckety (napr. `ai-evidence-documents`)
   - Konkrétne API endpointy alebo časti kódu, ak ide o chybu v aplikácii

3. **Rozsah – počet dotknutých používateľov/firiem:**
   - Odhad alebo presné číslo, koľko firiem a koľko individuálnych používateľov mohlo byť zasiahnutých

4. **Kategórie dotknutých údajov** (s odkazom na `gdpr-data-map.md`):
   - Napr. "dokumenty typu technický preukaz vozidla, potenciálne obsahujúce meno a adresu majiteľa"
   - Explicitne uviesť, či existuje podozrenie na únik osobitných kategórií údajov alebo rodného čísla (reziduálne riziko, pozri `gdpr-data-map.md`)

5. **Vykonané kroky na zamedzenie/zmiernenie (containment):**
   - Napr. okamžitá rotácia uniknutého API kľúča, oprava RLS politiky, dočasné vypnutie postihnutého endpointu, force-logout postihnutých používateľov

6. **Príčina (root cause), ak je známa:**
   - Aby sa dalo posúdiť, či je potrebná systémová náprava (napr. code review proces, revízia RLS politík)

---

## 5. Ako posúdiť riziko pre dotknuté osoby

GDPR (recitál 75–76, čl. 33 a čl. 34) vyžaduje posúdenie **závažnosti a pravdepodobnosti** rizika pre práva a slobody fyzických osôb. Nejde o binárne "breach = notify", ale o odstupňované posúdenie.

### Faktory na zváženie:

- **Typ porušenia:** strata dôvernosti (unauthorized access/disclosure) vs. strata integrity (zmena dát) vs. strata dostupnosti (zničenie/strata dát bez zálohy)
- **Povaha a citlivosť údajov:** je väčší rozdiel medzi únikom napr. len názvov firiem/logami (nízka citlivosť) a únikom dokumentov obsahujúcich mená, adresy, čísla poistiek alebo potenciálne rodné číslo (vysoká citlivosť – pozri `gdpr-data-map.md`)
- **Jednoduchosť identifikácie osôb:** dajú sa dotknuté osoby z uniknutých dát ľahko identifikovať?
- **Závažnosť dôsledkov pre dotknuté osoby:** hrozí zneužitie identity, finančná škoda, diskriminácia, reputačná ujma, alebo je dôsledok zanedbateľný?
- **Počet dotknutých osôb:** jedna firma/používateľ vs. naprieč viacerými firmami
- **Kto mal k dátam prístup:** neznámy útočník na verejnom internete (vysoké riziko) vs. iný overený zákazník Esblu, ktorý incident sám nahlásil a dáta nezneužil (nižšie riziko, ale stále relevantné)
- **Boli dáta zašifrované/inak nečitateľné pre neoprávnenú osobu?** (znižuje riziko)

### Orientačný rámec závažnosť × pravdepodobnosť:

| Riziko | Popis | Príklad |
|---|---|---|
| **Nízke / zanedbateľné** | Únik nepravdepodobný, alebo uniknuté dáta majú nízku citlivosť a nízky dosah | Dočasne verejne prístupné firemné logo (aj tak je bucket `company-logos` bežne verejný) |
| **Stredné** | Reálny únik, ale obmedzený rozsah alebo stredná citlivosť | Únik SPZ/VIN jednej firmy inej overenej firme (zákazníkovi Esblu) v dôsledku chyby v RLS |
| **Vysoké** | Rozsiahly únik citlivých dokumentov (mená, adresy, čísla poistiek, potenciálne rodné číslo) voči neznámym tretím stranám alebo verejne na internete | Nesprávne verejný Storage bucket s dokumentmi `ai-evidence-documents`, indexovaný vyhľadávačom |

---

## 6. Oznamovacie povinnosti

### 6.1 Oznámenie dozornému orgánu (čl. 33 GDPR)

- **Príslušný úrad:** Úrad na ochranu osobných údajov Slovenskej republiky (ÚOOÚ SR)
- **Lehota:** do **72 hodín** od momentu, kedy sa prevádzkovateľ o porušení dozvedel ("became aware")
- **Výnimka:** Oznámenie **nie je potrebné**, ak je nepravdepodobné, že porušenie povedie k riziku pre práva a slobody fyzických osôb (na základe posúdenia podľa bodu 5 vyššie)
- Ak sa oznámenie nestihne do 72 hodín, musí byť pripojené odôvodnenie omeškania
- Oznámenie musí obsahovať (podľa čl. 33 ods. 3): povahu porušenia, kategórie a približný počet dotknutých osôb/záznamov, kontaktné údaje (napr. privacy@esblu.com), pravdepodobné následky, prijaté/navrhované opatrenia

### 6.2 Oznámenie dotknutým osobám (čl. 34 GDPR)

- **Povinné len vtedy**, ak porušenie pravdepodobne povedie k **VYSOKÉMU riziku** pre práva a slobody dotknutých fyzických osôb
- Oznámenie musí byť zrozumiteľné, jasným a jednoduchým jazykom, musí opísať povahu porušenia a odporúčané kroky pre dotknutú osobu
- **Výnimky z povinnosti** (čl. 34 ods. 3): ak boli dáta chránené tak, že sú nezrozumiteľné pre neoprávnené osoby (napr. silné šifrovanie), ak boli následne prijaté opatrenia eliminujúce vysoké riziko, alebo ak by oznámenie vyžadovalo neprimerané úsilie – v tom prípade postačuje verejné oznámenie/informovanie

### Kto sú "dotknuté osoby" v kontexte Esblu

V závislosti od povahy incidentu môžu byť dotknutými osobami:
- Držitelia účtov Esblu (typ A – napr. pri úniku prihlasovacích údajov)
- Firmy-zákazníci (ako organizácie, aj keď primárne dotknuté osoby sú fyzické osoby v ich mene)
- Tretie osoby spomenuté v dokumentoch nahraných firmami (typ B – napr. majiteľ vozidla na technickom preukaze) – oznámenie im môže byť realisticky vykonateľné len prostredníctvom firmy, ktorá dokument nahrala, keďže Esblu nemá priamy kontakt na tieto osoby

**Praktická poznámka:** ak je vysoké riziko identifikované u údajov typu B (tretie osoby v dokumentoch), primárnym kanálom oznámenia bude pravdepodobne dotknutá firma (zákazník Esblu), ktorá má priamy vzťah k danej tretej osobe – Esblu by mal informovať firmu a dohodnúť sa na ďalšom postupe, keďže firma môže mať voči danej osobe vlastnú (paralelnú) oznamovaciu povinnosť ako prevádzkovateľ.

---

## 7. Zjednodušený postup krok za krokom

1. **Zisti a zaisti** – akonáhle je incident podozrivý, okamžne vykonaj bezprostredné kroky na zastavenie ďalšieho úniku (napr. rotácia kľúča, oprava politiky, dočasné vypnutie funkcie/endpointu).
2. **Zaznamenaj** – začni viesť incident log podľa bodu 4.
3. **Vyšetri rozsah** – zisti, ktoré tabuľky/buckety/endpointy a koľko používateľov/firiem je dotknutých.
4. **Posúď riziko** – použi rámec z bodu 5.
5. **Rozhodni o oznámení ÚOOÚ SR** – ak je riziko čo i len potenciálne, radšej oznámiť do 72 hodín; ak je riziko preukázateľne nepravdepodobné, zdokumentuj odôvodnenie tohto rozhodnutia (pre prípad neskoršej kontroly).
6. **Rozhodni o oznámení dotknutým osobám** – len ak je riziko vysoké.
7. **Náprava** – over, či je príčina definitívne odstránená (nielen dôsledok), zváž systémové zlepšenie (napr. revízia všetkých RLS politík, nie len tej postihnutej).
8. **Zhrnutie a poučenie (post-mortem)** – krátky písomný záznam čo sa stalo, čo sa urobilo, čo sa zmení, aby sa to neopakovalo. Uložiť spolu s incident logom pre prípad budúcej kontroly zo strany ÚOOÚ SR.

---

## 8. Kontaktné údaje relevantné pre incident

- Interný kontakt (zakladateľ/prevádzkovateľ): info@esblu.com / privacy@esblu.com — obe schránky sú hostované cez **Namecheap Private Email** (potvrdené 2026-08-16); `privacy@esblu.com` je explicitný alias na tú istú schránku ako `info@esblu.com`.
- Úrad na ochranu osobných údajov SR: https://dataprotection.gov.sk
- Supabase support (v prípade podozrenia na incident na strane infraštruktúry): cez Supabase dashboard/support kanál. Projekt beží v regióne **eu-central-1 (Frankfurt, EÚ)** (potvrdené 2026-08-16).
- Vercel support (v prípade podozrenia na incident na strane hostingu): cez Vercel dashboard/support kanál. Functions bežia v regióne **fra1 (Frankfurt, EÚ)** (potvrdené 2026-08-16).
- OpenAI support (v prípade podozrenia na incident týkajúci sa API kľúča/spracovania): cez OpenAI platform dashboard. Na účte je potvrdené nastavenie **"Data sharing: Disabled"** (potvrdené 2026-08-16).
- Namecheap support (v prípade podozrenia na incident týkajúci sa `info@`/`privacy@esblu.com` schránky): cez Namecheap dashboard/support kanál.

---

## 9. Postup pri incidente na strane subprocessora (Supabase / Vercel / OpenAI / Namecheap)

Esblu je pri incidentoch na strane svojich spracovateľov (subprocessors) závislé od toho, čo mu ako zákazníkovi oznámia – nemá priamy technický prístup do ich interných systémov.

**Očakávaný zdroj informácie o incidente na strane subprocessora:**

- **Priame oznámenie od subprocessora** – Supabase, Vercel aj OpenAI majú vo svojich DPA záväzok informovať zákazníka o porušení ochrany osobných údajov, ktoré sa týka jeho dát (bežná povinnosť procesora voči prevádzkovateľovi podľa čl. 28) – spravidla zaslané na kontaktný e-mail účtu alebo cez dashboard. Namecheap nemá voči Esblu DPA vzťah v zmysle spracovania osobných údajov appky (schránka `info@`/`privacy@esblu.com` je mimo appky, prijíma iba prichádzajúcu poštu), ale rovnaký princíp platí analogicky – incident na strane Namecheapu, ktorý by ohrozil tieto schránky, spadá do rovnakého postupu nižšie.
- **Verejný status/security oznam** (status page, security advisory, changelog) – najmä pri rozsiahlejších incidentoch.
- **Nepriame zistenie** (napr. médiá, komunita) – najmenej spoľahlivý, ale nie vylúčený kanál.

**Krok za krokom, keď Esblu zistí (akýmkoľvek z vyššie uvedených kanálov) možný incident na strane subprocessora:**

1. **Over rozsah dotknutia Esblu** – prečítaj oznámenie/advisory, zisti, či sa týka regiónu/produktu, ktorý Esblu reálne používa (Supabase `eu-central-1`/Auth/Storage; Vercel `fra1` Functions; OpenAI API s nastavením `data sharing: disabled`; Namecheap Private Email pre `info@`/`privacy@esblu.com`).
2. **Zaobchádzaj s tým ako s vlastným incidentom od bodu 4 vyššie** (veď incident log, over rozsah, posúď riziko podľa bodu 5) – Esblu je stále prevádzkovateľom voči vlastným používateľom/firmám a jeho 72-hodinová lehota voči ÚOOÚ SR plynie od momentu, keď sa Esblu o incidente dozvedelo, nie od momentu, keď incident na strane subprocessora skutočne nastal.
3. **Ak subprocessor neposkytne dostatok informácií** na posúdenie rizika v primeranom čase, kontaktuj jeho support/security kanál priamo (pozri sekciu 8) a zdokumentuj časovú os pokusov o získanie informácií – to je relevantné pre prípadné odôvodnenie omeškania oznámenia podľa čl. 33 ods. 1.
4. **Ak incident vyžaduje oznámenie ÚOOÚ SR a/alebo dotknutým osobám**, Esblu postupuje rovnako ako pri vlastnom incidente (body 6–8 vyššie) – skutočnosť, že príčina je na strane tretej strany, nezbavuje Esblu ako prevádzkovateľa jeho vlastnej oznamovacej povinnosti.

---

## Súvisiace dokumenty

- `gdpr-data-map.md` – na rýchle overenie, aké údaje sa v postihnutej tabuľke/buckete nachádzajú
- `gdpr-processing-register.md`
- `gdpr-subprocessors.md`
- `gdpr-retention-policy.md`
- `gdpr-launch-checklist.md`
