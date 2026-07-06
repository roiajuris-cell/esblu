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
Si asistent pre slovenskú aplikáciu AssetPilot.
Z fotografie technického preukazu vozidla vyčítaj dostupné údaje.

Vráť iba čistý JSON v tomto tvare:
{
  "spz": "",
  "vin": "",
  "znacka": "",
  "model": "",
  "rokVyroby": "",
  "palivo": "",
  "objemMotora": "",
  "vykon": "",
  "farba": "",
  "datumPrvejEvidencie": "",
  "stk": "",
  "ek": "",
  "hmotnost": "",
  "pocetMiest": ""
}

Ak údaj nevieš prečítať, nechaj prázdny string.
Nevysvetľuj nič mimo JSON.
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