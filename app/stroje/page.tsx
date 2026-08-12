"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  PLAN_LIMIT_MESSAGE,
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import BackLink from "@/app/components/BackLink";

export default function StrojePage() {
  const [userId, setUserId] = useState("");
  const [machines, setMachines] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingMachineId, setDeletingMachineId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveInProgressRef = useRef(false);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("machines");
  const isMachineCreationUnavailable = planUsageLoading || isPlanLimited;

  const emptyMachine = {
    name: "",
    category: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    year: "",
    purchase_date: "",
    status: "",
    notes: "",
  };

  const [machine, setMachine] = useState(emptyMachine);

  useEffect(() => {
    checkUser();
  }, []);

  function photoUrl(path: string) {
    const { data } = supabase.storage
      .from("machine-photos")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    setUserId(session.user.id);
    loadMachines(session.user.id);
  }

  async function loadMachines(currentUserId: string = userId) {
    if (!currentUserId) return;

    const { data: machinesData, error } = await supabase
      .from("machines")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Chyba pri načítaní strojov: " + error.message);
      return;
    }

    const machineIds = (machinesData || []).map((m) => m.id);

    let photosData: any[] = [];

    if (machineIds.length > 0) {
      const { data } = await supabase
        .from("machine_photos")
        .select("*")
        .in("machine_id", machineIds)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      photosData = data || [];
    }

    const machinesWithPhotos = (machinesData || []).map((item) => {
      const firstPhoto = photosData.find(
        (photo) => photo.machine_id === item.id
      );

      return {
        ...item,
        first_photo_url: firstPhoto ? photoUrl(firstPhoto.file_path) : null,
      };
    });

    setMachines(machinesWithPhotos);
  }

  function updateMachine(key: string, value: string) {
    setMachine((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveMachine() {
    if (saveInProgressRef.current) return;

    if (!machine.name) {
      alert("Vyplň názov stroja.");
      return;
    }

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);

    const payload = {
      user_id: userId,
      name: machine.name || null,
      category: machine.category || null,
      manufacturer: machine.manufacturer || null,
      model: machine.model || null,
      serial_number: machine.serial_number || null,
      year: machine.year ? Number(machine.year) : null,
      purchase_date: machine.purchase_date || null,
      status: machine.status || null,
      notes: machine.notes || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("machines")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId);

        if (error) throw error;

        setMachine(emptyMachine);
        setEditingId(null);
        setShowForm(false);
        await loadMachines();
        return;
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        alert(PLAN_LIMIT_MESSAGE);
        return;
      }

      const { error } = await supabase.from("machines").insert(payload);
      if (error) throw error;

      setMachine(emptyMachine);
      setEditingId(null);
      setShowForm(false);
      await Promise.all([loadMachines(), refreshPlanUsage()]);
    } catch (saveError: unknown) {
      if (isPlanLimitReachedError(saveError, "machines")) {
        alert(PLAN_LIMIT_MESSAGE);
        await refreshPlanUsage();
      } else {
        const message =
          saveError instanceof Error ? saveError.message : "Neznáma chyba.";
        alert("Chyba pri ukladaní stroja: " + message);
      }
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  function editMachine(item: any) {
    setEditingId(item.id);
    setShowForm(true);

    setMachine({
      name: item.name || "",
      category: item.category || "",
      manufacturer: item.manufacturer || "",
      model: item.model || "",
      serial_number: item.serial_number || "",
      year: item.year || "",
      purchase_date: item.purchase_date || "",
      status: item.status || "",
      notes: item.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteMachine(machineId: string) {
    if (deletingMachineId) return;

    const confirmed = confirm("Naozaj chceš vymazať tento stroj?");
    if (!confirmed) return;

    setDeletingMachineId(machineId);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Nie ste prihlásený. Prihláste sa a skúste to znova.");
      }

      const { data: machinePhotos, error: photosError } = await supabase
        .from("machine_photos")
        .select("id, file_path")
        .eq("machine_id", machineId)
        .eq("user_id", user.id);

      if (photosError) throw photosError;

      const photoPaths = Array.from(
        new Set(
          (machinePhotos || [])
            .map((photo) => photo.file_path)
            .filter((path): path is string => Boolean(path))
        )
      );

      let { data: deletedMachines, error: deleteMachineError } = await supabase
          .from("machines")
          .delete()
          .eq("id", machineId)
          .eq("user_id", user.id)
          .select("id");

      // Pri RESTRICT foreign key najprv bezpečne odstránime DB riadky fotiek
      // a rovnaký presný delete stroja zopakujeme. Bez tejto vetvy by stroj
      // zostal v databáze po už odstránených súboroch zo Storage.
      if (deleteMachineError?.code === "23503") {
        const { error: restrictedPhotosError } = await supabase
          .from("machine_photos")
          .delete()
          .eq("machine_id", machineId)
          .eq("user_id", user.id)
          .select("id");

        if (restrictedPhotosError) throw restrictedPhotosError;

        const retryResult = await supabase
          .from("machines")
          .delete()
          .eq("id", machineId)
          .eq("user_id", user.id)
          .select("id");

        deletedMachines = retryResult.data;
        deleteMachineError = retryResult.error;
      }

      if (deleteMachineError) throw deleteMachineError;

      if (deletedMachines?.length !== 1) {
        throw new Error(
          "Stroj sa v databáze nevymazal. Záznam neexistuje alebo na jeho vymazanie nemáte oprávnenie."
        );
      }

      // Ak databáza nemá ON DELETE CASCADE, odstránime riadky fotografií
      // explicitne. Pri existujúcom cascade bude tento delete bezpečne prázdny.
      const { error: deletePhotosError } = await supabase
        .from("machine_photos")
        .delete()
        .eq("machine_id", machineId)
        .eq("user_id", user.id)
        .select("id");

      if (deletePhotosError) throw deletePhotosError;

      const { data: remainingPhotos, error: verifyPhotosError } = await supabase
        .from("machine_photos")
        .select("id")
        .eq("machine_id", machineId)
        .eq("user_id", user.id);

      if (verifyPhotosError) throw verifyPhotosError;

      if ((remainingPhotos || []).length > 0) {
        throw new Error(
          "Stroj bol vymazaný, ale databázové záznamy fotografií sa nepodarilo odstrániť."
        );
      }

      // UI obnovíme až po potvrdenom vymazaní databázových záznamov.
      await Promise.all([
        loadMachines(user.id),
        refreshPlanUsage(),
      ]);

      // Storage čistíme až nakoniec. Jeho chyba nesmie zakryť úspešný DB delete.
      if (photoPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("machine-photos")
          .remove(photoPaths);

        if (storageError) {
          console.error(
            "Stroj bol vymazaný, ale fotografie sa nepodarilo odstrániť zo Storage:",
            storageError
          );
          alert(
            "Stroj bol vymazaný, ale niektoré súbory fotografií sa nepodarilo odstrániť z úložiska."
          );
        }
      }
    } catch (deleteError: unknown) {
      console.error("Chyba pri mazaní stroja:", deleteError);
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : typeof deleteError === "object" &&
              deleteError !== null &&
              "message" in deleteError
            ? String(deleteError.message)
            : "Neznáma chyba.";
      alert("Chyba pri mazaní stroja: " + message);
    } finally {
      setDeletingMachineId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setMachine(emptyMachine);
    setShowForm(false);
  }

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <BackLink href="/" label="Hlavné menu" className="mb-4" />

      <div className="flex items-center gap-4">
  <img
    src="/images/excavator.png"
    alt="Stroje"
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-white drop-shadow-lg">Stroje</h1>
</div>

      <p className="mt-4 text-white/80">
        Evidencia firemných strojov a techniky.
      </p>

      {!planUsageLoading && isPlanLimited && (
        <PlanLimitNotice
          resource="machines"
          usage={planUsage}
          limit={planLimit}
          className="mt-6"
        />
      )}

      <button
        onClick={() => {
          setShowForm(!showForm);
          setEditingId(null);
          setMachine(emptyMachine);
        }}
        disabled={isMachineCreationUnavailable}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        ➕ Pridať stroj
      </button>

      {showForm && (
        <div className="mt-8 rounded-2xl bg-white/45 border border-white/20 backdrop-blur-xl p-6 shadow-lg">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? "Upraviť stroj" : "Pridať nový stroj"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              placeholder="Názov stroja"
              className="rounded-xl border p-3"
              value={machine.name}
              onChange={(e) => updateMachine("name", e.target.value)}
            />

            <input
              placeholder="Kategória"
              className="rounded-xl border p-3"
              value={machine.category}
              onChange={(e) => updateMachine("category", e.target.value)}
            />

            <input
              placeholder="Výrobca"
              className="rounded-xl border p-3"
              value={machine.manufacturer}
              onChange={(e) => updateMachine("manufacturer", e.target.value)}
            />

            <input
              placeholder="Model"
              className="rounded-xl border p-3"
              value={machine.model}
              onChange={(e) => updateMachine("model", e.target.value)}
            />

            <input
              placeholder="Sériové číslo"
              className="rounded-xl border p-3"
              value={machine.serial_number}
              onChange={(e) => updateMachine("serial_number", e.target.value)}
            />

            <input
              type="number"
              placeholder="Rok výroby"
              className="rounded-xl border p-3"
              value={machine.year}
              onChange={(e) => updateMachine("year", e.target.value)}
            />

            <input
              type="date"
              className="rounded-xl border p-3"
              value={machine.purchase_date}
              onChange={(e) => updateMachine("purchase_date", e.target.value)}
            />

            <input
              placeholder="Stav / status"
              className="rounded-xl border p-3"
              value={machine.status}
              onChange={(e) => updateMachine("status", e.target.value)}
            />
          </div>

          <textarea
            placeholder="Poznámky"
            className="mt-4 w-full rounded-xl border p-3"
            value={machine.notes}
            onChange={(e) => updateMachine("notes", e.target.value)}
          />

          <div className="mt-5 flex gap-3">
            <button
              onClick={saveMachine}
              disabled={
                isSaving || (!editingId && isMachineCreationUnavailable)
              }
              className="rounded-xl bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isSaving
                ? "Ukladám..."
                : editingId
                ? "💾 Uložiť zmeny"
                : "💾 Uložiť stroj"}
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
  Uložené stroje
</h2>

        {machines.length === 0 ? (
          <div className="rounded-2xl border border-white/20 bg-white/45 p-6 shadow-lg backdrop-blur-xl">
            <p className="font-medium text-white/90 drop-shadow">
  Zatiaľ nie je uložený žiadny stroj.
</p>
          </div>
          ) : (
         <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {machines.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-white/20 bg-white/45 backdrop-blur-xl shadow-lg"
              >
                {item.first_photo_url ? (
                  <img
                    src={item.first_photo_url}
                    alt={item.name || "Fotografia stroja"}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 w-full items-center justify-center bg-slate-200 text-slate-500">
                    Bez fotografie
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-2xl font-bold">
                    {item.name || "Bez názvu"}
                  </h3>

                  <p className="mt-2 text-slate-600">
                    Kategória: {item.category || "—"}
                  </p>
                  <p className="text-slate-600">
                    Výrobca: {item.manufacturer || "—"}
                  </p>
                  <p className="text-slate-600">
                    Model: {item.model || "—"}
                  </p>
                  <p className="text-slate-600">
                    Sériové číslo: {item.serial_number || "—"}
                  </p>
                  <p className="text-slate-600">
                    Rok výroby: {item.year || "—"}
                  </p>
                  <p className="text-slate-600">
                    Stav: {item.status || "—"}
                  </p>

                  <div className="mt-5 flex gap-3">
                    <Link
                      href={`/stroje/${item.id}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                    >
                      Detail
                    </Link>

                    <button
                      onClick={() => editMachine(item)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Upraviť
                    </button>

                    <button
                      onClick={() => deleteMachine(item.id)}
                      disabled={deletingMachineId !== null}
                      className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {deletingMachineId === item.id
                        ? "Mažem..."
                        : "Vymazať"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
