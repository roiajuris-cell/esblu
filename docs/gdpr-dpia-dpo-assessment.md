# Posúdenie potreby DPIA a DPO — Esblu

Dátum: 15. augusta 2026
Autor: interné technické posúdenie (nie právne stanovisko — pozri záver)

Tento dokument posudzuje, či reálne fungovanie Esblu (na základe skutočného
dátového modelu a funkcií, nie predpokladov) zakladá povinnosť vykonať
Posúdenie vplyvu na ochranu osobných údajov (DPIA, čl. 35 GDPR) alebo
vymenovať zodpovednú osobu (DPO, čl. 37 GDPR).

## 1. DPIA (čl. 35 GDPR)

DPIA je povinná, ak spracúvanie "pravdepodobne povedie k vysokému riziku pre
práva a slobody fyzických osôb", najmä pri: systematickom rozsiahlom
profilovaní s právnymi účinkami, rozsiahlom spracúvaní osobitných kategórií
údajov, alebo systematickom rozsiahlom monitorovaní verejne prístupných
priestorov.

Posúdenie voči kritériám WP248 (9 kritérií, orientačne 2+ zakladá odporúčanie
DPIA):

| Kritérium | Platí pre Esblu? | Odôvodnenie |
|---|---|---|
| Hodnotenie/skórovanie osôb | Nie | AI iba extrahuje údaje z dokumentov (OCR-podobná funkcia), negeneruje skóre ani hodnotenie správania osôb. |
| Automatizované rozhodovanie s právnym/podobným účinkom | Nie | Explicitne vylúčené — AI výstup si používateľ vždy sám overí a potvrdí pred uložením (pozri `/ochrana-osobnych-udajov` sekcia F, I). |
| Systematické monitorovanie | Nie | Esblu nemá analytiku, sledovanie správania ani cookies (potvrdené auditom kódu). |
| Osobitné kategórie údajov (čl. 9) vo veľkom rozsahu | Nepravdepodobné, ale nie vylúčené | Schéma neobsahuje pole na osobitné kategórie. Reziduálne riziko: naskenovaný dokument môže náhodne obsahovať citlivý údaj (napr. zdravotné potvrdenie priložené k servisnému záznamu) — ide o výnimočný, nie systematický prípad, a nie o "vo veľkom rozsahu" spracúvanie v zmysle kritéria. |
| Údaje spracúvané vo veľkom rozsahu | Zatiaľ nie | Esblu je v štádiu bezplatnej testovacej verzie s malým počtom firiem/používateľov. Ak by sa počet firemných zákazníkov a objem nahrávaných dokumentov výrazne zväčšil, toto kritérium treba prehodnotiť. |
| Spájanie/kombinovanie datasetov | Nie | Dáta jednej firmy sa nekombinujú s dátami iných firiem ani s externými datasetmi. |
| Údaje o zraniteľných osobách | Nepravdepodobné | Cieľová skupina sú firmy spravujúce vozidlá/stroje/sklad, nie priamo zraniteľné osoby (deti a pod.). |
| Inovatívne použitie / nové technológie | Čiastočne | Použitie AI (OpenAI) na extrakciu údajov z dokumentov je "nová technológia", ale ide o bežné, dobre pochopené použitie (OCR/extrakcia), nie experimentálne profilovanie. |
| Bránenie uplatneniu práva/služby | Nie | Neexistuje scenár, kde by spracúvanie bránilo osobe uplatniť právo alebo zmluvu s treťou stranou. |

**Záver**: Pri súčasnom rozsahu a spôsobe fungovania Esblu (malý počet
zákazníkov, žiadne profilovanie, žiadne automatizované rozhodovanie,
žiadne osobitné kategórie údajov ako hlavný účel) naplní **najviac 1
kritérium** (čiastočne "inovatívna technológia"), čo je pod orientačným
prahom pre povinnú DPIA. **Formálna DPIA sa v tejto fáze nevyžaduje.**

Toto posúdenie treba **prehodnotiť**, ak nastane ktorákoľvek z týchto zmien:
- Esblu prejde na plnú produkčnú prevádzku s výrazne väčším počtom firiem
  a objemom nahrávaných dokumentov ("veľký rozsah" prestane byť sporné),
- pribudne funkcia automatizovaného rozhodovania alebo skórovania osôb,
- pribudne spracúvanie osobitných kategórií údajov ako zámerná funkcia
  (nie iba reziduálne riziko),
- pribudne systematické sledovanie správania používateľov (analytika,
  profilovanie).

`LEGAL_DECISION_REQUIRED`: toto je technické posúdenie, nie právne
stanovisko — pred produkčným spustením platenej verzie odporúčame potvrdenie
právnikom, najmä ohľadne hraníc "veľkého rozsahu" pri raste zákazníckej
základne.

## 2. DPO (čl. 37 GDPR)

DPO je povinný pri: (a) spracúvaní orgánom verejnej moci, (b) hlavnej
činnosti pozostávajúcej zo systematického rozsiahleho monitorovania osôb,
alebo (c) hlavnej činnosti pozostávajúcej z rozsiahleho spracúvania
osobitných kategórií údajov alebo údajov o trestných deliktoch.

| Podmienka | Platí pre Esblu? |
|---|---|
| Orgán verejnej moci | Nie — súkromný poskytovateľ SaaS. |
| Hlavná činnosť = systematické rozsiahle monitorovanie | Nie — hlavná činnosť je evidencia vozidiel/strojov/skladu/dokumentov, nie monitorovanie osôb. |
| Hlavná činnosť = rozsiahle spracúvanie osobitných kategórií | Nie — pozri DPIA tabuľku vyššie. |

**Záver**: Menovanie DPO sa **nevyžaduje**. Prevádzkovateľ (Jaroslav Juriš)
zostáva sám kontaktným bodom pre otázky ochrany osobných údajov
(`privacy@esblu.com`), čo je pri tomto rozsahu činnosti dostatočné a bežné.

Toto sa môže zmeniť, ak sa naplní niektorá z podmienok vyššie (napr. rast na
rozsah, kde by AI-spracovanie dokumentov s citlivými údajmi tvorilo hlavnú
a rozsiahlu činnosť).

## 3. Zhrnutie pre launch checklist

- DPIA: nevyžaduje sa pri súčasnom rozsahu — `DONE (posúdené, prehodnotiť pri raste)`.
- DPO: nevyžaduje sa — `DONE (posúdené)`.
- Odporúčanie: zaznamenať toto posúdenie s dátumom a pri každom väčšom
  produktovom raste (nový modul, výrazný nárast zákazníkov, nová AI funkcia)
  ho prehodnotiť nanovo, nie iba raz na začiatku.
