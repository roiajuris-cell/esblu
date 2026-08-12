"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  PLAN_LIMIT_MESSAGE,
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import { normalizeSpz } from "@/lib/normalize-spz";
import VehicleCard from "../components/VehicleCard";
import BackLink from "../components/BackLink";

type RegistrationSide = "front" | "back";

type RegistrationData = {
  spz: string | null;
  vin: string | null;
  znacka: string | null;
  model: string | null;
  datumPrvejEvidencie: string | null;
  rokVyroby: string | null;
  kategoriaVozidla: string | null;
  druhVozidla: string | null;
  palivo: string | null;
  objemMotora: string | null;
  vykon: string | null;
  farba: string | null;
  prevadzkovaHmotnost: string | null;
  najvacsiaPripustnaCelkovaHmotnost: string | null;
  pocetMiest: string | null;
  cisloTechnickehoPreukazu: string | null;
};

const vehicleFieldMappings = [
  { source: "spz", target: "spz", label: "ŠPZ" },
  { source: "vin", target: "vin", label: "VIN" },
  { source: "znacka", target: "znacka", label: "Značka" },
  { source: "model", target: "model", label: "Model" },
  {
    source: "datumPrvejEvidencie",
    target: "datumPrvejEvidencie",
    label: "Dátum prvej evidencie",
  },
  { source: "rokVyroby", target: "rokVyroby", label: "Rok výroby" },
  { source: "palivo", target: "palivo", label: "Palivo" },
  {
    source: "objemMotora",
    target: "objemMotora",
    label: "Objem motora",
  },
  { source: "vykon", target: "vykon", label: "Výkon" },
  { source: "farba", target: "farba", label: "Farba" },
  {
    source: "prevadzkovaHmotnost",
    target: "hmotnost",
    label: "Prevádzková hmotnosť",
  },
  { source: "pocetMiest", target: "pocetMiest", label: "Počet miest" },
] as const;

async function compressRegistrationImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Vybraný súbor nie je obrázok.");
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Fotografiu sa nepodarilo načítať."));
      img.src = imageUrl;
    });

    const maxDimension = 1800;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height)
    );
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Nepodarilo sa pripraviť kompresiu fotografie.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Fotografiu sa nepodarilo skomprimovať."));
          }
        },
        "image/webp",
        0.8
      );
    });

    const baseName = file.name.replace(/\.[^/.]+$/, "") || "technicky-preukaz";

    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function VozidlaPage() {
  const [userId, setUserId] = useState("");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [isPreparingFront, setIsPreparingFront] = useState(false);
  const [isPreparingBack, setIsPreparingBack] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [registrationData, setRegistrationData] =
    useState<RegistrationData | null>(null);
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveInProgressRef = useRef(false);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("vehicles");
  const isNewVehicleBlocked =
    !editingId && (planUsageLoading || isPlanLimited);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
    };
  }, [frontPreview]);

  useEffect(() => {
    return () => {
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [backPreview]);

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

  function clearRegistrationResult() {
    setScanError("");
    setScanMessage("");
    setRegistrationData(null);
  }

  function clearRegistrationImages() {
    setFrontFile(null);
    setFrontPreview(null);
    setBackFile(null);
    setBackPreview(null);
    clearRegistrationResult();
  }

  async function handleRegistrationFileChange(
    side: RegistrationSide,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (isNewVehicleBlocked) {
      setScanError(
        planUsageLoading
          ? "Overujem dostupnosť limitu. Skús to znova o chvíľu."
          : PLAN_LIMIT_MESSAGE
      );
      return;
    }

    const setPreparing =
      side === "front" ? setIsPreparingFront : setIsPreparingBack;
    setPreparing(true);
    clearRegistrationResult();

    try {
      const compressedFile = await compressRegistrationImage(file);
      const previewUrl = URL.createObjectURL(compressedFile);

      if (side === "front") {
        setFrontFile(compressedFile);
        setFrontPreview(previewUrl);
      } else {
        setBackFile(compressedFile);
        setBackPreview(previewUrl);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Fotografiu sa nepodarilo spracovať.";
      setScanError(message);
    } finally {
      setPreparing(false);
    }
  }

  function removeRegistrationImage(side: RegistrationSide) {
    if (side === "front") {
      setFrontFile(null);
      setFrontPreview(null);
    } else {
      setBackFile(null);
      setBackPreview(null);
    }

    clearRegistrationResult();
  }

  function updateVehicle(key: string, value: string) {
    setVehicle((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleAiProcess() {
    if (isNewVehicleBlocked) {
      setScanError(
        planUsageLoading
          ? "Overujem dostupnosť limitu. Skús to znova o chvíľu."
          : PLAN_LIMIT_MESSAGE
      );
      return;
    }

    if (!frontFile) {
      setScanError("Najprv pridaj prednú stranu technického preukazu.");
      return;
    }

    setIsProcessing(true);
    setScanError("");
    setScanMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Na AI načítanie musíš byť prihlásený.");
      }

      const formData = new FormData();
      formData.append("front", frontFile);

      if (backFile) {
        formData.append("back", backFile);
      }

      const response = await fetch("/api/scan-vehicle-registration", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "AI spracovanie zlyhalo.");
      }

      const extractedData = data.data as RegistrationData;
      const extracted: RegistrationData = {
        ...extractedData,
        spz: normalizeSpz(extractedData.spz),
      };
      const currentVehicle = vehicle || {};
      const conflicts = vehicleFieldMappings.filter(({ source, target }) => {
        const extractedValue = extracted[source];
        const currentValue = currentVehicle[target];

        return (
          extractedValue !== null &&
          String(currentValue ?? "").trim() !== "" &&
          String(currentValue).trim().toLocaleLowerCase("sk") !==
            extractedValue.trim().toLocaleLowerCase("sk")
        );
      });

      const overwriteConflicts =
        conflicts.length === 0 ||
        window.confirm(
          `AI našla odlišné hodnoty v poliach: ${conflicts
            .map(({ label }) => label)
            .join(", ")}.\n\nChceš tieto existujúce hodnoty prepísať?`
        );

      setVehicle((current: Record<string, unknown> | null) => {
        const next: Record<string, unknown> = {
          stk: "",
          ek: "",
          ...(current || {}),
        };

        vehicleFieldMappings.forEach(({ source, target }) => {
          const extractedValue = extracted[source];

          if (extractedValue === null) return;

          const hasCurrentValue = String(next[target] ?? "").trim() !== "";

          if (!hasCurrentValue || overwriteConflicts) {
            next[target] = extractedValue;
          }
        });

        return next;
      });

      setRegistrationData(extracted);
      setScanMessage(
        conflicts.length > 0 && !overwriteConflicts
          ? "AI údaje boli načítané. Existujúce odlišné hodnoty zostali zachované. Pred uložením všetko skontroluj."
          : "AI údaje boli načítané. Pred uložením vozidla ich dôkladne skontroluj."
      );
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "AI načítanie technického preukazu zlyhalo."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function vehiclePayload() {
    return {
      user_id: userId,
      spz: normalizeSpz(vehicle.spz),
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
    if (!vehicle || saveInProgressRef.current) return;

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from("vehicles")
          .update(vehiclePayload())
          .eq("id", editingId)
          .eq("user_id", userId);

        if (error) throw error;

        alert("Vozidlo bolo upravené.");
        setEditingId(null);
        setVehicle(null);
        clearRegistrationImages();
        await loadVehicles();
        return;
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        alert(PLAN_LIMIT_MESSAGE);
        return;
      }

      const { error } = await supabase.from("vehicles").insert(vehiclePayload());

      if (error) throw error;

      alert("Vozidlo bolo uložené.");
      setVehicle(null);
      clearRegistrationImages();
      await Promise.all([loadVehicles(), refreshPlanUsage()]);
    } catch (saveError: unknown) {
      if (isPlanLimitReachedError(saveError, "vehicles")) {
        alert(PLAN_LIMIT_MESSAGE);
        await refreshPlanUsage();
      } else {
        const message =
          saveError instanceof Error ? saveError.message : "Neznáma chyba.";
        alert(
          editingId
            ? "Chyba pri úprave: " + message
            : "Chyba pri ukladaní: " + message
        );
      }
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  function handleEdit(car: any) {
    setEditingId(car.id);
    clearRegistrationImages();

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

    await Promise.all([loadVehicles(), refreshPlanUsage()]);
  }

  function cancelEdit() {
    setEditingId(null);
    setVehicle(null);
    clearRegistrationImages();
  }

  const additionalRegistrationFields = registrationData
    ? [
        ["Kategória vozidla", registrationData.kategoriaVozidla],
        ["Druh vozidla", registrationData.druhVozidla],
        [
          "Najväčšia prípustná celková hmotnosť",
          registrationData.najvacsiaPripustnaCelkovaHmotnost,
        ],
        [
          "Číslo technického preukazu",
          registrationData.cisloTechnickehoPreukazu,
        ],
      ].filter(([, value]) => value)
    : [];

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <BackLink href="/" label="Hlavné menu" className="mb-4" />

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

      {!planUsageLoading && isPlanLimited && (
        <PlanLimitNotice
          resource="vehicles"
          usage={planUsage}
          limit={planLimit}
          className="mt-6"
        />
      )}

      <div className="mt-8 rounded-2xl border border-white/20 bg-white/45 p-6 shadow-lg backdrop-blur-xl">
        <h2 className="text-2xl font-bold">Načítať technický preukaz</h2>
        <p className="mt-2 text-sm text-slate-700">
          Fotografie sa použijú iba na AI načítanie a nikam sa trvalo
          neukladajú. Predná strana je povinná, zadná je voliteľná.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white/80 p-5 shadow-sm">
            <h3 className="text-lg font-bold">Predná strana</h3>
            <p className="mt-1 text-sm text-slate-600">Povinná fotografia</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                {isPreparingFront ? "Pripravujem..." : "📷 Odfotiť"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={
                    isProcessing || isPreparingFront || isNewVehicleBlocked
                  }
                  onChange={(event) =>
                    handleRegistrationFileChange("front", event)
                  }
                />
              </label>

              <label className="cursor-pointer rounded-xl border bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
                🖼️ Vybrať z galérie
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={
                    isProcessing || isPreparingFront || isNewVehicleBlocked
                  }
                  onChange={(event) =>
                    handleRegistrationFileChange("front", event)
                  }
                />
              </label>
            </div>

            {frontPreview ? (
              <div className="mt-4">
                <img
                  src={frontPreview}
                  alt="Predná strana technického preukazu"
                  className="h-64 w-full rounded-xl border bg-white object-contain"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Novým výberom fotografiu vymeníš.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRegistrationImage("front")}
                    disabled={isProcessing}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                  >
                    Odstrániť
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Predná strana zatiaľ nie je vybraná.
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white/80 p-5 shadow-sm">
            <h3 className="text-lg font-bold">Zadná strana</h3>
            <p className="mt-1 text-sm text-slate-600">Voliteľná fotografia</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                {isPreparingBack ? "Pripravujem..." : "📷 Odfotiť"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={
                    isProcessing || isPreparingBack || isNewVehicleBlocked
                  }
                  onChange={(event) =>
                    handleRegistrationFileChange("back", event)
                  }
                />
              </label>

              <label className="cursor-pointer rounded-xl border bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50">
                🖼️ Vybrať z galérie
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={
                    isProcessing || isPreparingBack || isNewVehicleBlocked
                  }
                  onChange={(event) =>
                    handleRegistrationFileChange("back", event)
                  }
                />
              </label>
            </div>

            {backPreview ? (
              <div className="mt-4">
                <img
                  src={backPreview}
                  alt="Zadná strana technického preukazu"
                  className="h-64 w-full rounded-xl border bg-white object-contain"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Novým výberom fotografiu vymeníš.
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRegistrationImage("back")}
                    disabled={isProcessing}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                  >
                    Odstrániť
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Zadná strana zatiaľ nie je vybraná.
              </div>
            )}
          </section>
        </div>

        <button
          type="button"
          onClick={handleAiProcess}
          disabled={
            !frontFile ||
            isProcessing ||
            isPreparingFront ||
            isPreparingBack ||
            isNewVehicleBlocked
          }
          className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {isProcessing
            ? "Načítavam údaje..."
            : "🤖 Načítať údaje pomocou AI"}
        </button>

        {scanError && (
          <p className="mt-4 rounded-xl bg-red-100 p-4 text-sm font-medium text-red-700">
            {scanError}
          </p>
        )}

        {scanMessage && (
          <p className="mt-4 rounded-xl bg-green-100 p-4 text-sm font-medium text-green-800">
            {scanMessage}
          </p>
        )}

        {additionalRegistrationFields.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white/80 p-5">
            <h3 className="font-bold">Ďalšie načítané údaje</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tieto údaje zatiaľ nemajú polia v databáze a pri uložení vozidla
              sa neuložia.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {additionalRegistrationFields.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-100 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
              disabled={isSaving || isNewVehicleBlocked}
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
