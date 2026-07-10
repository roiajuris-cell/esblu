"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import VehicleCard from "../components/VehicleCard";

export default function VozidlaPage() {
  const [userId, setUserId] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    setUserId(session.user.id);
    loadVehicles(session.user.id);
  }

  async function loadVehicles(currentUserId: string = userId) {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("user_id", currentUserId)
      .order("znacka", { ascending: true });

    if (error) {
      alert("Chyba pri načítaní vozidiel: " + error.message);
      return;
    }

    setVehicles(data || []);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImagePreview(URL.createObjectURL(file));
    setVehicle(null);
    setEditingId(null);
  }

  function updateVehicle(key: string, value: string) {
    setVehicle((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleAiProcess() {
    if (!selectedFile) {
      alert("Najprv nahraj fotku technického preukazu.");
      return;
    }

    setIsProcessing(true);
    setVehicle(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch("/api/scan-vehicle-doc", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      setVehicle({
        ...data.data,
        stk: "",
        ek: "",
      });
    } else {
      alert(data.error || "AI spracovanie zlyhalo.");
    }

    setIsProcessing(false);
  }

  function vehiclePayload() {
    return {
      user_id: userId,
      spz: vehicle.spz || null,
      vin: vehicle.vin || null,
      znacka: vehicle.znacka || null,
      model: vehicle.model || null,
      rok_vyroby: vehicle.rokVyroby ? Number(vehicle.rokVyroby) : null,
      palivo: vehicle.palivo || null,
      objem: vehicle.objemMotora ? Number(vehicle.objemMotora) : null,
      vykon: vehicle.vykon || null,
      farba: vehicle.farba || null,
      hmotnost: vehicle.hmotnost
        ? Number(String(vehicle.hmotnost).replace(" kg", ""))
        : null,
      pocet_miest: vehicle.pocetMiest ? Number(vehicle.pocetMiest) : null,
      datum_prvej_evidencie: vehicle.datumPrvejEvidencie || null,
      stk: vehicle.stk || null,
      ek: vehicle.ek || null,
    };
  }

  async function handleSaveVehicle() {
    if (!vehicle) return;

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setIsSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("vehicles")
        .update(vehiclePayload())
        .eq("id", editingId)
        .eq("user_id", userId);

      setIsSaving(false);

      if (error) {
        alert("Chyba pri úprave: " + error.message);
        return;
      }

      alert("Vozidlo bolo upravené.");
      setEditingId(null);
      setVehicle(null);
      setImagePreview(null);
      setSelectedFile(null);
      loadVehicles();
      return;
    }

    const { error } = await supabase.from("vehicles").insert(vehiclePayload());

    setIsSaving(false);

    if (error) {
      alert("Chyba pri ukladaní: " + error.message);
      return;
    }

    alert("Vozidlo bolo uložené.");
    setVehicle(null);
    setImagePreview(null);
    setSelectedFile(null);
    loadVehicles();
  }

  function handleEdit(car: any) {
    setEditingId(car.id);
    setImagePreview(null);
    setSelectedFile(null);

    setVehicle({
      spz: car.spz || "",
      vin: car.vin || "",
      znacka: car.znacka || "",
      model: car.model || "",
      rokVyroby: car.rok_vyroby || "",
      palivo: car.palivo || "",
      objemMotora: car.objem || "",
      vykon: car.vykon || "",
      farba: car.farba || "",
      hmotnost: car.hmotnost || "",
      pocetMiest: car.pocet_miest || "",
      datumPrvejEvidencie: car.datum_prvej_evidencie || "",
      stk: car.stk || "",
      ek: car.ek || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteVehicle(id: string) {
    const confirmed = confirm("Naozaj chceš vymazať toto vozidlo?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      alert("Chyba pri mazaní: " + error.message);
      return;
    }

    loadVehicles();
  }

  function cancelEdit() {
    setEditingId(null);
    setVehicle(null);
  }

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <div className="flex items-center gap-4">
  <img
    src="/images/van.png"
    alt="Vozidlá"
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-white drop-shadow-lg">Vozidlá</h1>
</div>

      <p className="mt-4 text-white/80">
        Evidencia firemných vozidiel.
      </p>

      <div className="mt-8">
        <label className="cursor-pointer rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
          📷 Odfotiť technický preukaz
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {imagePreview && (
        <div className="mt-8 rounded-2xl bg-white/45 border border-white/20 backdrop-blur-xl p-6 shadow-lg">
          <h2 className="mb-4 text-2xl font-bold">
            Náhľad technického preukazu
          </h2>

          <img
            src={imagePreview}
            alt="Nahratý technický preukaz"
            className="max-w-xl rounded-xl border"
          />

          <button
            onClick={handleAiProcess}
            disabled={isProcessing}
            className="mt-6 rounded-xl bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
          >
            {isProcessing ? "Spracovávam..." : "🤖 Spracovať cez AI"}
          </button>
        </div>
      )}

      {vehicle && (
        <div className="mt-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? "Upraviť vozidlo" : "Skontrolujte údaje vozidla"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ["ŠPZ", "spz"],
              ["VIN", "vin"],
              ["Značka", "znacka"],
              ["Model", "model"],
              ["Rok výroby", "rokVyroby"],
              ["Palivo", "palivo"],
              ["Objem motora", "objemMotora"],
              ["Výkon", "vykon"],
              ["Farba", "farba"],
              ["Dátum prvej evidencie", "datumPrvejEvidencie"],
              ["Hmotnosť", "hmotnost"],
              ["Počet miest", "pocetMiest"],
            ].map(([label, key]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-slate-600">
                  {label}
                </span>
                <input
                  className="mt-1 w-full rounded-xl border p-3"
                  value={vehicle?.[key] || ""}
                  onChange={(e) => updateVehicle(key, e.target.value)}
                />
              </label>
            ))}

            <label className="block">
              <span className="text-sm font-medium text-slate-600">
                STK platí do
              </span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                type="date"
                value={vehicle.stk || ""}
                onChange={(e) => updateVehicle("stk", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-600">
                EK platí do
              </span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                type="date"
                value={vehicle.ek || ""}
                onChange={(e) => updateVehicle("ek", e.target.value)}
              />
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveVehicle}
              disabled={isSaving}
              className="rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isSaving
                ? "Ukladám..."
                : editingId
                ? "💾 Uložiť zmeny"
                : "💾 Uložiť vozidlo"}
            </button>

            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-slate-300 px-6 py-3 text-slate-900 hover:bg-slate-400"
              >
                Zrušiť úpravu
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
  Uložené vozidlá
</h2>

        {vehicles.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Zatiaľ nie je uložené žiadne vozidlo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {vehicles.map((car) => (
              <VehicleCard
                key={car.id}
                car={car}
                onDelete={handleDeleteVehicle}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}