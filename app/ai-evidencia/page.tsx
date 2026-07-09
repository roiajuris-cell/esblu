"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
function Info({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 font-bold text-slate-900">{value || "-"}</p>
    </div>
  );
}
export default function AiEvidenciaPage() {
  const [fileName, setFileName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedSpz, setSelectedSpz] = useState<string | null>(null);

const groupedRecords = records.reduce((groups: any, record: any) => {
  const spz = record.spz?.trim().toUpperCase() || "BEZ ŠPZ";

  if (!groups[spz]) {
    groups[spz] = [];
  }

  groups[spz].push(record);

  return groups;
}, {});
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setError("");
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/scan-vehicle-doc", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "AI spracovanie zlyhalo.");
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || "Nastala neznáma chyba.");
    } finally {
      setIsProcessing(false);
    }
  }

  function updateResult(field: string, value: string) {
    setResult((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  }

  function toNumber(value: any) {
    if (value === "" || value === null || value === undefined) return null;
    return Number(String(value).replace(",", "."));
  }

  async function saveEvidence() {
    if (!result) return;

    setIsSaving(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Nie si prihlásený.");
      }
let vehicleId = null;

if (result.spz) {
  const cleanSpz = result.spz.replace(/\s+/g, "").toLowerCase();

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, spz")
    .eq("user_id", session.user.id);

  const matchedVehicle = vehicles?.find(
    (vehicle) =>
      vehicle.spz?.replace(/\s+/g, "").toLowerCase() === cleanSpz
  );

  vehicleId = matchedVehicle?.id || null;
}
      const { error } = await supabase.from("ai_evidence").insert({
        user_id: session.user.id,
        vehicle_id: vehicleId,
        spz: result.spz || null,
        document_type: result.documentType || null,
        movement_type: result.movementType || null,
        supplier: result.supplier || null,
        document_number: result.documentNumber || null,
        material: result.material || null,
        quantity: toNumber(result.quantity),
        unit: result.unit || null,
        brutto: toNumber(result.brutto),
        tara: toNumber(result.tara),
        netto: toNumber(result.netto),
        construction_site: result.constructionSite || null,
        customer: result.customer || null,
        document_date: result.documentDate || null,
        document_time: result.documentTime || null,
        raw_text: result.rawText || null,
      });

      if (error) throw error;

      alert("Záznam bol uložený do AI evidencie.");
    } catch (err: any) {
      setError(err.message || "Uloženie zlyhalo.");
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteRecord(id: string) {
  if (!confirm("Naozaj chceš vymazať tento záznam?")) return;

  const { error } = await supabase
    .from("ai_evidence")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Vymazanie zlyhalo.");
    return;
  }

  setSelectedRecord(null);
  loadRecords();
}
async function loadRecords() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return;

  const { data, error } = await supabase
    .from("ai_evidence")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (!error && data) {
    setRecords(data);
  }
}useEffect(() => {
  loadRecords();
}, []);
  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-10">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-4xl font-black text-slate-950">🤖 AI EVIDENCIA</h1>

        <p className="mt-3 text-slate-600">
          Odfotíš dokument a aplikácia rozpozná údaje.
        </p>

        <div className="mt-10 rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50 p-6 text-center">
  <span className="text-5xl">📄</span>

  <h2 className="mt-4 text-2xl font-black text-blue-700">
    PRIDAŤ DOKUMENT
  </h2>

  <p className="mt-2 text-sm text-slate-500">
    Odfotiť dokument alebo vybrať obrázok zo zariadenia
  </p>

  <div className="mt-6 grid grid-cols-2 gap-3">
    <label className="cursor-pointer rounded-2xl bg-blue-600 px-4 py-4 font-bold text-white">
      📷 Odfotiť
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </label>

    <label className="cursor-pointer rounded-2xl bg-white px-4 py-4 font-bold text-blue-700 shadow">
      🖼️ Galéria
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </label>
  </div>
</div>

        {fileName && (
          <div className="mt-8 rounded-2xl bg-slate-50 p-5">
            <p className="font-bold text-slate-900">Vybraný dokument:</p>
            <p className="mt-1 text-slate-600">{fileName}</p>

            {isProcessing && (
              <p className="mt-4 font-semibold text-blue-600">
                🤖 AI spracováva dokument...
              </p>
            )}

            {error && (
              <p className="mt-4 font-semibold text-red-600">Chyba: {error}</p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-4 rounded-3xl bg-slate-50 p-6">
            <h2 className="text-2xl font-black text-slate-950">
              Načítané údaje
            </h2>

            {[
              ["documentType", "Typ dokumentu"],
              ["movementType", "Dovoz / vývoz"],
              ["spz", "ŠPZ"],
              ["supplier", "Dodávateľ"],
              ["customer", "Zákazník"],
              ["constructionSite", "Stavba / Herkunft"],
              ["documentNumber", "Číslo dokladu"],
              ["material", "Materiál"],
              ["quantity", "Množstvo"],
              ["unit", "Jednotka"],
              ["brutto", "Brutto"],
              ["tara", "Tara"],
              ["netto", "Netto"],
              ["documentDate", "Dátum"],
              ["documentTime", "Čas"],
            ].map(([field, label]) => (
              <div key={field}>
                <label className="text-sm font-bold text-slate-600">
                  {label}
                </label>
                <input
                  value={result[field] || ""}
                  onChange={(e) => updateResult(field, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
                />
              </div>
            ))}

            <button
              onClick={saveEvidence}
              disabled={isSaving}
              className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
            >
              {isSaving ? "Ukladám..." : "💾 Uložiť do evidencie"}
            </button>
          </div>
        )}{records.length > 0 && (
  <div className="mt-8 rounded-3xl bg-white p-6 shadow-xl">
    <h2 className="text-2xl font-black text-slate-950">
      Uložené doklady
    </h2>

    <div className="mt-5 space-y-3">
      {!selectedSpz &&
  Object.entries(groupedRecords).map(([spz, items]: any) => (
    <div
      key={spz}
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">
            🚛 Vozidlo
          </p>

          <h3 className="mt-2 text-2xl font-black text-slate-950">
            {spz}
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            {items.length} {items.length === 1 ? "doklad" : "dokladov"}
          </p>
        </div>

        <button
          onClick={() => setSelectedSpz(spz)}
          className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white"
        >
          Otvoriť
        </button>
      </div>
    </div>
  ))}

{selectedSpz && (
  <>
    <button
      onClick={() => setSelectedSpz(null)}
      className="mb-4 rounded-2xl bg-slate-200 px-4 py-3 font-bold text-slate-700"
    >
      ← Späť na všetky ŠPZ
    </button>

    <h3 className="mb-4 text-2xl font-black text-slate-950">
      🚛 {selectedSpz}
    </h3>

    <div className="space-y-3">
      {groupedRecords[selectedSpz]?.map((record: any) => (
        <div
          key={record.id}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                📄 {record.document_type || "Doklad"}
              </p>

              <h3 className="mt-2 text-xl font-black text-slate-950">
                {record.spz || "Bez ŠPZ"}
              </h3>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {record.movement_type || "nezaradené"}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>🏗️ {record.construction_site || "Bez stavby"}</p>
            <p>🏢 {record.supplier || "Bez dodávateľa"}</p>
            <p>👤 {record.customer || "Bez zákazníka"}</p>
            <p>📦 {record.material || "Bez materiálu"}</p>
            <p>
              ⚖️{" "}
              {record.netto
                ? `${record.netto} ${record.unit || "t"}`
                : "Bez hmotnosti"}
            </p>
            <p>
              📅 {record.document_date || "Bez dátumu"}{" "}
              {record.document_time || ""}
            </p>
          </div>

          <button
            onClick={() => setSelectedRecord(record)}
            className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
          >
            📄 Otvoriť detail
          </button>
        </div>
      ))}
    </div>
  </>
)}
    </div>
  </div>
)}
{selectedRecord && (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8">

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black">
          📄 Detail dokumentu
        </h2>

        <button
          onClick={() => setSelectedRecord(null)}
          className="rounded-xl bg-slate-100 px-4 py-2"
        >
          ✕
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">

        <Info title="Typ" value={selectedRecord.document_type} />
        <Info title="Pohyb" value={selectedRecord.movement_type} />
        <Info title="SPZ" value={selectedRecord.spz} />
        <Info title="Dodávateľ" value={selectedRecord.supplier} />
        <Info title="Zákazník" value={selectedRecord.customer} />
        <Info title="Stavba" value={selectedRecord.construction_site} />
        <Info title="Materiál" value={selectedRecord.material} />
        <Info title="Brutto" value={selectedRecord.brutto} />
        <Info title="Tara" value={selectedRecord.tara} />
        <Info title="Netto" value={selectedRecord.netto} />
        <Info title="Dátum" value={selectedRecord.document_date} />
        <Info title="Čas" value={selectedRecord.document_time} />

      </div>

      <button
        onClick={() => setSelectedRecord(null)}
        className="mt-8 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white"
      >
        Zavrieť
      </button>
<button
  onClick={() => deleteRecord(selectedRecord.id)}
  className="mt-3 w-full rounded-2xl bg-red-600 py-4 font-bold text-white"
>
  🗑 Vymazať záznam
</button>
    </div>
  </div>
)}
      </div>
    </main>
  );
}