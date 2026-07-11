import OpenAI from "openai";

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

Najprv urči typ dokumentu.

Možnosti:
- dodací list
- vážny lístok
- faktúra
- bloček
- servisný doklad
- technický preukaz
- iný dokument

Potom dokument analyzuj podľa jeho typu.

PRAVIDLÁ:

Ak ide o vážny lístok:
- supplier = firma, ktorá vážila materiál
- customer = zákazník (Kunde)
- constructionSite = Herkunft, Baustelle alebo miesto pôvodu materiálu
- material = druh materiálu
- brutto = brutto hmotnosť
- tara = tara
- netto = netto
- documentDate = dátum váženia
- documentTime = čas váženia
- materialOriginal = presný názov materiálu tak, ako je uvedený na doklade
- materialCategory = jednotná kategória materiálu
- documentLanguage = jazyk dokladu
- confidenceScore = istota rozpoznania od 0 do 1
- sourceLocation = miesto, odkiaľ materiál pochádza
- destinationLocation = miesto, kam materiál smeruje
- reviewStatus = stav kontroly údajov

materialCategory musí byť jedna z hodnôt:
- piesok
- kamenivo
- asfalt
- stavebný odpad
- zemina
- betón
- iné

documentLanguage musí byť jedna z hodnôt:
- sk
- cs
- de
- en
- iné

reviewStatus musí byť jedna z hodnôt:
- confirmed
- needs_review
- pending

Ak je neistá ŠPZ, smer pohybu, materiál alebo netto, nastav reviewStatus na "needs_review".

Pri kategorizácii materiálu zachovaj presný názov v materialOriginal.

Príklady kategorizácie:
- Sand, Füllsand, Písek, Piesok -> piesok
- Splitt, Kies, Schotter, Kamenivo, Štrk -> kamenivo
- Asphalt, AC8, AC32, Asphaltaufbruch -> asfalt
- Bauschutt, Recyclingmaterial, Stavebný odpad -> stavebný odpad
- Erde, Boden, Zemina -> zemina
- Beton, Concrete, Betón -> betón
Ak ide o dodací list:
- supplier = dodávateľ
- customer = odberateľ
- constructionSite = miesto dodania alebo stavba
- material = názov materiálu
- quantity = množstvo
- unit = jednotka

Ak ide o faktúru:
- supplier = dodávateľ
- customer = odberateľ
- documentNumber = číslo faktúry
- documentDate = dátum vystavenia

Vždy hľadaj údaje podľa významu, nie iba podľa názvu poľa.

Ak existuje viac možností, vyber tú najpravdepodobnejšiu.

Ak údaj nenájdeš, nechaj prázdny string.

Dátum vždy vráť vo formáte YYYY-MM-DD.

Čísla vracaj bez jednotiek.

Vráť iba čistý JSON.

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


movementType:
- "dovoz" ak ide o privezený materiál
- "vyvoz" ak ide o odvezený odpad alebo materiál
- "" ak sa nedá určiť

Dátum vráť vo formáte YYYY-MM-DD, ak ho vieš rozpoznať.
Hmotnosti vráť ako číslo bez jednotky, napríklad 5.72.
Ak údaj nevieš nájsť, nechaj prázdny string.
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