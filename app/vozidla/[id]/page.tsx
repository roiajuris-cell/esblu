"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";
import {
  getMyActiveMembership,
  type CompanyMemberRole,
} from "@/lib/company";

export default function VehicleDetailPage() {
  const { id } = useParams();
  const vehicleId = String(id);

  const [vehicle, setVehicle] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [role, setRole] = useState<CompanyMemberRole | null>(null);

  const emptyService = {
    service_date: "",
    mileage: "",
    title: "",
    description: "",
    cost: "",
    technician: "",
    next_service_date: "",
  };

  const [service, setService] = useState(emptyService);

  useEffect(() => {
    loadVehicle();
    loadServices();
    loadMembership();
  }, []);

  async function loadMembership() {
    const membership = await getMyActiveMembership();
    setRole(membership?.role ?? null);
  }

  async function loadVehicle() {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (!error) setVehicle(data);
  }

  async function loadServices() {
    const { data, error } = await supabase
      .from("vehicle_services")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("service_date", { ascending: false });

    if (!error) setServices(data || []);
  }

  function updateService(key: string, value: string) {
    setService((prev) => ({ ...prev, [key]: value }));
  }

  function startEditService(item: any) {
    setEditingServiceId(item.id);
    setShowForm(true);

    setService({
      service_date: item.service_date || "",
      mileage: item.mileage || "",
      title: item.title || "",
      description: item.description || "",
      cost: item.cost || "",
      technician: item.technician || "",
      next_service_date: item.next_service_date || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelServiceEdit() {
    setEditingServiceId(null);
    setService(emptyService);
    setShowForm(false);
  }

  async function saveService() {
    if (!service.service_date || !service.title) {
      alert("Vyplň dátum servisu a názov servisu.");
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsSaving(false);
      alert("Na uloženie servisného záznamu musíte byť prihlásený.");
      return;
    }

    const payload = {
      user_id: user.id,
      vehicle_id: vehicleId,
      service_date: service.service_date,
      mileage: service.mileage ? Number(service.mileage) : null,
      title: service.title,
      description: service.description || null,
      cost: service.cost ? Number(service.cost) : null,
      technician: service.technician || null,
      next_service_date: service.next_service_date || null,
    };

    const { error } = editingServiceId
      ? await supabase
          .from("vehicle_services")
          .update(payload)
          .eq("id", editingServiceId)
      : await supabase.from("vehicle_services").insert(payload);

    setIsSaving(false);

    if (error) {
      alert("Chyba pri ukladaní servisu: " + error.message);
      return;
    }

    setService(emptyService);
    setEditingServiceId(null);
    setShowForm(false);
    loadServices();
  }

  async function deleteService(serviceId: string) {
    const confirmed = confirm("Naozaj chceš vymazať tento servis?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("vehicle_services")
      .delete()
      .eq("id", serviceId);

    if (error) {
      alert("Chyba pri mazaní servisu: " + error.message);
      return;
    }

    loadServices();
  }

  if (!vehicle) {
    return <div className="p-10">Načítavam...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <BackLink href="/vozidla" label="Vozidlá" className="mb-4" />

      <h1 className="text-4xl font-bold">
        {vehicle.znacka} {vehicle.model}
      </h1>

      <div className="mt-8 rounded-2xl bg-white p-8 shadow">
        <div className="grid grid-cols-2 gap-5">
          <p><b>ŠPZ:</b> {vehicle.spz}</p>
          <p><b>VIN:</b> {vehicle.vin}</p>
          <p><b>Rok výroby:</b> {vehicle.rok_vyroby}</p>
          <p><b>Palivo:</b> {vehicle.palivo}</p>
          <p><b>Výkon:</b> {vehicle.vykon}</p>
          <p><b>Objem:</b> {vehicle.objem}</p>
          <p><b>Farba:</b> {vehicle.farba}</p>
          <p><b>Hmotnosť:</b> {vehicle.hmotnost}</p>
          <p><b>Počet miest:</b> {vehicle.pocet_miest}</p>
          <p><b>STK:</b> {vehicle.stk || "nedoplnené"}</p>
          <p><b>EK:</b> {vehicle.ek || "nedoplnené"}</p>
        </div>
      </div>

      <div className="mt-10 rounded-2xl bg-white p-8 shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">História servisov</h2>

          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingServiceId(null);
              setService(emptyService);
            }}
            className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
          >
            ➕ Pridať servis
          </button>
        </div>

        {showForm && (
          <div className="mt-6 rounded-2xl border bg-slate-50 p-6">
            <h3 className="mb-4 text-xl font-bold">
              {editingServiceId ? "Upraviť servis" : "Pridať servis"}
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                type="date"
                className="rounded-xl border p-3"
                value={service.service_date}
                onChange={(e) => updateService("service_date", e.target.value)}
              />

              <input
                type="number"
                placeholder="Stav km"
                className="rounded-xl border p-3"
                value={service.mileage}
                onChange={(e) => updateService("mileage", e.target.value)}
              />

              <input
                placeholder="Názov servisu"
                className="rounded-xl border p-3"
                value={service.title}
                onChange={(e) => updateService("title", e.target.value)}
              />

              <input
                type="number"
                placeholder="Cena €"
                className="rounded-xl border p-3"
                value={service.cost}
                onChange={(e) => updateService("cost", e.target.value)}
              />

              <input
                placeholder="Servisoval"
                className="rounded-xl border p-3"
                value={service.technician}
                onChange={(e) => updateService("technician", e.target.value)}
              />

              <input
                type="date"
                className="rounded-xl border p-3"
                value={service.next_service_date}
                onChange={(e) =>
                  updateService("next_service_date", e.target.value)
                }
              />
            </div>

            <textarea
              placeholder="Popis servisu"
              className="mt-4 w-full rounded-xl border p-3"
              value={service.description}
              onChange={(e) => updateService("description", e.target.value)}
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={saveService}
                disabled={isSaving}
                className="rounded-xl bg-green-600 px-5 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
              >
                {isSaving
                  ? "Ukladám..."
                  : editingServiceId
                  ? "💾 Uložiť zmeny"
                  : "💾 Uložiť servis"}
              </button>

              {editingServiceId && (
                <button
                  onClick={cancelServiceEdit}
                  className="rounded-xl bg-slate-300 px-5 py-3 text-slate-900 hover:bg-slate-400"
                >
                  Zrušiť úpravu
                </button>
              )}
            </div>
          </div>
        )}

        {services.length === 0 ? (
          <p className="mt-6 text-slate-500">
            Zatiaľ nebol pridaný žiadny servis.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {services.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border bg-slate-50 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      🔧 {item.title}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      📅 {item.service_date}
                    </p>
                  </div>

                  <div className="rounded-xl bg-green-100 px-4 py-2 text-lg font-bold text-green-700">
                    {item.cost ? `${item.cost} €` : "Cena neuvedená"}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Stav km</p>
                    <p className="text-lg font-bold">
                      {item.mileage ? `${item.mileage} km` : "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Servisoval</p>
                    <p className="text-lg font-bold">
                      {item.technician || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Ďalší servis</p>
                    <p className="text-lg font-bold">
                      {item.next_service_date || "—"}
                    </p>
                  </div>
                </div>

                {item.description && (
                  <p className="mt-5 rounded-xl bg-white p-4 text-slate-700">
                    {item.description}
                  </p>
                )}

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => startEditService(item)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    ✏️ Upraviť
                  </button>

                  {role !== "employee" && (
                    <button
                      onClick={() => deleteService(item.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      🗑 Vymazať
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
