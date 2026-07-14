import OpenAI from "openai";
import { normalizeSpz } from "@/lib/normalize-spz";
import { normalizeWeightUnit } from "@/lib/normalize-weight-unit";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json(
        { success: false, error: "Nebola nahraná žiadna fotka." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Si AI asistent pre stavebnú firmu.

Analyzuj fotografiu dokumentu a vráť iba jeden platný JSON objekt.
Nevracaj markdown, vysvetlenia ani text pred alebo za JSON objektom.

Najprv urči typ dokumentu.

Povolené hodnoty documentType:
- dodací list
- vážny lístok
- faktúra
- bloček
- servisný doklad
- technický preukaz
- iný dokument

Dokument môže byť v slovenčine, češtine, nemčine alebo angličtine.
Údaje určuj podľa významu, rozloženia dokumentu, označení polí a súvislostí.

HLAVNÉ PRAVIDLO PRE DODÁVATEĽA:

supplier je vždy firma, ktorá je uvedená v hlavičke dokumentu a dokument vystavila.

Za hlavičku dokumentu považuj najmä:
- názov firmy alebo logo v hornej časti dokumentu,
- adresu a kontaktné údaje vystavujúcej firmy,
- názov vážnice, skládky, recyklačného centra, výrobne alebo prevádzky.

Firma v hlavičke zostáva supplier pri dovoze aj pri vývoze.
Nikdy neprehadzuj supplier a customer podľa movementType.

Pri vážnom lístku nepoužívaj automaticky ako supplier firmu uvedenú v poli
Kunde, Customer, Auftraggeber, zákazník alebo odberateľ.

HLAVNÉ PRAVIDLO PRE ZÁKAZNÍKA:

customer je firma alebo osoba výslovne uvedená ako zákazník, objednávateľ
alebo odberateľ.

Hľadaj najmä označenia:
- Kunde
- Kundenname
- Kundennummer
- Customer
- Client
- Auftraggeber
- Rechnungsempfänger
- zákazník
- odberateľ
- odběratel

Kundennummer môže byť iba číslo zákazníka. Ak je pri ňom alebo v rovnakej
sekcii uvedený názov firmy, do customer vlož názov firmy, nie samotné číslo.

Ak zákazník nie je jednoznačne uvedený:
- customer nechaj ako prázdny string,
- zákazníka nevymýšľaj podľa ŠPZ, vodiča, stavby, adresy alebo smeru pohybu,
- reviewStatus nastav na "needs_review".

Ak firmu v hlavičke nie je možné jednoznačne určiť:
- supplier nechaj ako prázdny string,
- reviewStatus nastav na "needs_review".

Dopravca, vodič, vlastník vozidla a stavba nie sú automaticky supplier ani customer.

Príklad:
Ak je v hlavičke dokumentu uvedené:
BRZ Odenwald Bauschutt-Recycling-Zentrum

a v poli Kunde je uvedené:
Klenk & Sohn GmbH

výsledok musí byť:
supplier = BRZ Odenwald Bauschutt-Recycling-Zentrum
customer = Klenk & Sohn GmbH

PRAVIDLÁ PRE VÁŽNY LÍSTOK:

- supplier = firma uvedená v hlavičke dokumentu
- customer = výslovne označený zákazník alebo objednávateľ
- constructionSite = stavba, Baustelle, Bauvorhaben, Herkunft alebo uvedené miesto stavby
- material = čitateľný názov materiálu
- materialOriginal = presný názov materiálu tak, ako je uvedený na dokumente
- materialCategory = jednotná kategória materiálu
- brutto = brutto hmotnosť
- tara = tara hmotnosť
- netto = netto hmotnosť
- unit = spoločná jednotka uvedená pri brutto, tara alebo netto; vráť "kg" alebo "t" iba vtedy, keď je na dokumente jasne čitateľná
- documentDate = dátum váženia
- documentTime = čas váženia
- documentLanguage = jazyk dokumentu
- sourceLocation = miesto, odkiaľ materiál pochádza, iba ak je to jednoznačné
- destinationLocation = miesto, kam materiál smeruje, iba ak je to jednoznačné
- confidenceScore = celková istota rozpoznania od 0 do 1
- reviewStatus = stav kontroly výsledku

PRAVIDLÁ PRE DODACÍ LIST:

- supplier = firma uvedená v hlavičke dokumentu
- customer = výslovne označený odberateľ alebo zákazník
- constructionSite = miesto dodania alebo stavba
- material = názov materiálu
- materialOriginal = presný názov materiálu na dokumente
- quantity = množstvo
- unit = jednotka uvedená pri quantity; vráť "kg" alebo "t" iba vtedy, keď je na dokumente jasne čitateľná
- documentNumber = číslo dodacieho listu
- documentDate = dátum dokumentu

PRAVIDLÁ PRE FAKTÚRU:

- supplier = firma uvedená v hlavičke faktúry, ktorá faktúru vystavila
- customer = odberateľ alebo zákazník uvedený vo fakturačných údajoch
- documentNumber = číslo faktúry
- documentDate = dátum vystavenia

MATERIAL CATEGORY:

materialCategory musí byť presne jedna z hodnôt:
- piesok
- kamenivo
- asfalt
- stavebný odpad
- zemina
- betón
- iné

Príklady:
- Sand, Füllsand, Písek, Piesok -> piesok
- Splitt, Kies, Schotter, Kamenivo, Štrk -> kamenivo
- Asphalt, AC8, AC 8, AC32, AC 32, Asphaltaufbruch -> asfalt
- Bauschutt, Recyclingmaterial, Stavebný odpad -> stavebný odpad
- Erde, Boden, Aushub, Zemina -> zemina
- Beton, Concrete, Betón -> betón

V materialOriginal vždy zachovaj pôvodné presné označenie z dokumentu.

JAZYK DOKUMENTU:

documentLanguage musí byť presne jedna z hodnôt:
- sk
- cs
- de
- en
- iné
PRAVIDLÁ PRE ŠPZ:

spz = evidenčné číslo vozidla uvedené na dokumente.

ŠPZ hľadaj dôkladne v celom dokumente, najmä pri označeniach:
- Kennzeichen
- Kfz-Kennzeichen
- KFZ
- Fahrzeug
- LKW
- amtliches Kennzeichen
- SPZ
- EČV
- registračné číslo
- vehicle registration

ŠPZ môže obsahovať písmená, čísla, medzery alebo pomlčky.

Pri čítaní ŠPZ:
- odstráň medzery a pomlčky,
- všetky písmená vráť veľkými písmenami,
- zachovaj poradie znakov,
- výsledok vráť napríklad ako AW711 alebo CA123AB.

Dávaj pozor na zámenu podobných znakov:
- O a 0
- I a 1
- B a 8
- S a 5
- Z a 2
- G a 6

Pri rozhodovaní použi kontext formátu registračnej značky, ale znaky nevymýšľaj.

Ak nie je možné všetky znaky ŠPZ jednoznačne prečítať:
- nevymýšľaj ani nedopĺňaj žiadny znak,
- spz nechaj ako prázdny string,
- reviewStatus nastav na "needs_review",
- confidenceScore zníž.

spz nechaj prázdne iba vtedy, ak na dokumente nie je možné spoľahlivo rozpoznať žiadnu registračnú značku.

Nezamieňaj ŠPZ s:
- číslom dokladu,
- zákazníckym číslom,
- číslom objednávky,
- číslom váženia,
- identifikačným číslom vozidla VIN.
SMER POHYBU:

movementType musí byť presne:
- "dovoz" pri materiáli privážanom na stavbu
- "vývoz" pri materiáli alebo odpade odvážanom zo stavby
- "" ak sa smer nedá spoľahlivo určiť

MovementType nikdy nepoužívaj na určenie alebo prehadzovanie supplier a customer.

REVIEW STATUS:

reviewStatus musí byť presne jedna z hodnôt:
- confirmed
- needs_review
- pending

Nastav "needs_review", ak je neistý aspoň jeden z údajov:
- spz
- supplier
- customer, ak by mal byť na dokumente uvedený
- movementType
- material alebo materialCategory
- brutto, tara alebo netto
- documentDate

Nastav "confirmed" iba vtedy, ak sú hlavné údaje jasne čitateľné a navzájom logicky súhlasia.

KONTROLA HMOTNOSTÍ:

Ak sú uvedené brutto, tara a netto, skontroluj:
netto = brutto - tara

Ak výpočet nesedí s primeranou toleranciou zaokrúhlenia:
- zachovaj hodnoty presne podľa dokumentu,
- reviewStatus nastav na "needs_review",
- confidenceScore zníž.

Ak je netto uvedené priamo na dokumente, uprednostni vytlačenú hodnotu pred vlastným výpočtom, ale nesúlad označ cez needs_review.

VŠEOBECNÉ PRAVIDLÁ:

- Dátum vždy vráť vo formáte YYYY-MM-DD.
- Čas vráť vo formáte HH:MM, ak je čitateľný.
- Čísla vracaj bez jednotiek.
- Ak je pri brutto, tara, netto alebo quantity jasne uvedená jednotka, vždy ju vráť v samostatnom poli unit.
- unit normalizuj na "kg" alebo "t". Ak jednotka nie je čitateľná alebo uvedená, nechaj unit prázdne a nevymýšľaj ju.
- Pri desatinných číslach použi bodku, napríklad 6.66.
- Hmotnosti neprepočítavaj medzi kg a tonami, ak jednotka nie je jednoznačná.
- Ak údaj nenájdeš, vráť prázdny string.
- Nevymýšľaj chýbajúce údaje.
- rawText má obsahovať čo najvernejší prepis dôležitého textu dokumentu.

Pred vrátením výsledku vykonaj záverečnú kontrolu:
1. supplier zodpovedá firme v hlavičke dokumentu,
2. customer zodpovedá výslovne označenému zákazníkovi,
3. supplier a customer neboli prehodené podľa dovozu alebo vývozu,
4. brutto, tara a netto sú logicky skontrolované,
5. neisté údaje sú prázdne a reviewStatus je needs_review.

Vráť iba čistý JSON v presne tejto štruktúre:

{
  "documentType": "",
  "movementType": "",
  "spz": "",
  "supplier": "",
  "customer": "",
  "constructionSite": "",
  "documentNumber": "",
  "material": "",
  "materialOriginal": "",
  "materialCategory": "",
  "documentLanguage": "",
  "confidenceScore": "",
  "sourceLocation": "",
  "destinationLocation": "",
  "reviewStatus": "",
  "quantity": "",
  "unit": "",
  "brutto": "",
  "tara": "",
  "netto": "",
  "documentDate": "",
  "documentTime": "",
  "rawText": ""
}
`
              
            },
            {
              type: "input_image",
              image_url: `data:${file.type};base64,${base64Image}`,
  detail: "high",
},
          ],
        },
      ],
    });

  const text = response.output_text;
const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
const vehicleData = JSON.parse(cleaned);
vehicleData.spz = normalizeSpz(vehicleData.spz);
vehicleData.unit = normalizeWeightUnit(vehicleData.unit);
if (!vehicleData.spz) {
  const spzResponse = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Najprv dokument mentálne otoč do správnej orientácie, aby bol text vodorovne čitateľný.

Nájdi iba evidenčné číslo vozidla.

Na tomto type dokumentu ho hľadaj prednostne v poli označenom:
"Fahrzeug-Nr./Pol. Kennzeichen / Anlieferer"

Prečítaj hodnotu vytlačenú priamo pri tomto označení.

Nevytváraj ŠPZ z iných čísel na dokumente.
Nezamieňaj ju s:
- Lieferschein Nr.
- Kunden Nr.
- Baustelle Nr.
- AVV-Nr.
- telefónnym číslom
- PSČ
- dátumom
- číslom dokladu

Ak nevidíš celú ŠPZ jednoznačne, nič nehádaj.

Vráť iba čistý JSON:
{
  "spz": "",
  "evidenceText": "",
  "confidence": 0
}

spz:
- odstráň medzery a pomlčky,
- použi veľké písmená.

evidenceText:
- prepíš presne text ŠPZ tak, ako ho vidíš na dokumente.

confidence:
- číslo od 0 do 1,
- hodnotu nad 0.98 použi iba pri úplne jasnom prečítaní.


Ak ŠPZ nie je možné prečítať, nechaj prázdny string.
`,
          },
          {
            type: "input_image",
            image_url: `data:${file.type};base64,${base64Image}`,
            detail: "high",
          },
        ],
      },
    ],
  });

  try {
    const spzCleaned = spzResponse.output_text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const spzData = JSON.parse(spzCleaned);

    const normalizedFallbackSpz = normalizeSpz(spzData.spz);

    if (normalizedFallbackSpz) {
      vehicleData.spz = normalizedFallbackSpz;

      vehicleData.reviewStatus = "needs_review";
    }
  } catch (spzError) {
    console.error("SPZ FALLBACK ERROR:", spzError);
  }
}
vehicleData.spz = normalizeSpz(vehicleData.spz);
return Response.json({
  success: true,
  data: vehicleData,
});
  } catch (error) {
    console.error("OPENAI ERROR:", error);

    return Response.json(
      {
        success: false,
        error: "AI spracovanie zlyhalo.",
      },
      {
        status: 500,
      }
    );
  }
}
