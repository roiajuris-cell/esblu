"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import BackLink from "@/app/components/BackLink";
import { getMyActiveMembership } from "@/lib/company";
import { useCompanyDpaLegalHold } from "@/app/components/CompanyDpaGate";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { machineDetailHref } from "@/lib/entity-links";

export default function StrojePage() {
  const { t } = useLocale();
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
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
  const { legalHold } = useCompanyDpaLegalHold();
  const isMachineCreationUnavailable =
    planUsageLoading || isPlanLimited || legalHold;

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

    const membership = await getMyActiveMembership();

    if (!membership) {
      setCompanyId("");
      setMachines([]);
      return;
    }

    setCompanyId(membership.company_id);
    loadMachines(membership.company_id);
  }

  async function loadMachines(currentCompanyId: string = companyId) {
    if (!currentCompanyId) return;

    const { data: machinesData, error } = await supabase
      .from("machines")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false });

    if (error) {
      alert(t("machines.errors.loadFailedPrefix", { message: error.message }));
      return;
    }

    const machineIds = (machinesData || []).map((m) => m.id);

    let photosData: any[] = [];

    if (machineIds.length > 0) {
      const { data } = await supabase
        .from("machine_photos")
        .select("*")
        .in("machine_id", machineIds)
        .eq("company_id", currentCompanyId)
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
      alert(t("machines.errors.nameRequired"));
      return;
    }

    if (!userId) {
      alert(t("inbox.errors.notLoggedIn"));
      return;
    }

    if (!editingId && legalHold) {
      alert(t("common.legalHoldMessage"));
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
          .eq("company_id", companyId);

        if (error) throw error;

        setMachine(emptyMachine);
        setEditingId(null);
        setShowForm(false);
        await loadMachines();
        return;
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        alert(t("common.planLimitMessage"));
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
        alert(t("common.planLimitMessage"));
        await refreshPlanUsage();
      } else {
        const message =
          saveError instanceof Error
            ? saveError.message
            : t("vehicles.errors.unknownError");
        alert(t("machines.errors.saveFailedPrefix", { message }));
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

    const confirmed = confirm(t("machines.errors.deleteConfirm"));
    if (!confirmed) return;

    setDeletingMachineId(machineId);

    try {
      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error(t("vehicles.errors.notLoggedInFormal"));
      }

      const activeCompanyId = membership.company_id;

      const { data: machinePhotos, error: photosError } = await supabase
        .from("machine_photos")
        .select("id, file_path")
        .eq("machine_id", machineId)
        .eq("company_id", activeCompanyId);

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
          .eq("company_id", activeCompanyId)
          .select("id");

      // Pri RESTRICT foreign key najprv bezpečne odstránime DB riadky fotiek
      // a rovnaký presný delete stroja zopakujeme. Bez tejto vetvy by stroj
      // zostal v databáze po už odstránených súboroch zo Storage.
      if (deleteMachineError?.code === "23503") {
        const { error: restrictedPhotosError } = await supabase
          .from("machine_photos")
          .delete()
          .eq("machine_id", machineId)
          .eq("company_id", activeCompanyId)
          .select("id");

        if (restrictedPhotosError) throw restrictedPhotosError;

        const retryResult = await supabase
          .from("machines")
          .delete()
          .eq("id", machineId)
          .eq("company_id", activeCompanyId)
          .select("id");

        deletedMachines = retryResult.data;
        deleteMachineError = retryResult.error;
      }

      if (deleteMachineError) throw deleteMachineError;

      if (deletedMachines?.length !== 1) {
        throw new Error(t("machines.errors.deleteDbMismatch"));
      }

      // Ak databáza nemá ON DELETE CASCADE, odstránime riadky fotografií
      // explicitne. Pri existujúcom cascade bude tento delete bezpečne prázdny.
      const { error: deletePhotosError } = await supabase
        .from("machine_photos")
        .delete()
        .eq("machine_id", machineId)
        .eq("company_id", activeCompanyId)
        .select("id");

      if (deletePhotosError) throw deletePhotosError;

      const { data: remainingPhotos, error: verifyPhotosError } = await supabase
        .from("machine_photos")
        .select("id")
        .eq("machine_id", machineId)
        .eq("company_id", activeCompanyId);

      if (verifyPhotosError) throw verifyPhotosError;

      if ((remainingPhotos || []).length > 0) {
        throw new Error(t("machines.errors.photosCleanupFailed"));
      }

      // UI obnovíme až po potvrdenom vymazaní databázových záznamov.
      await Promise.all([
        loadMachines(activeCompanyId),
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
          alert(t("machines.errors.photosStorageDeleteFailed"));
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
            : t("vehicles.errors.unknownError");
      alert(t("machines.errors.deleteFailedPrefix", { message }));
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
    <main className="app-shell-bg min-h-screen p-4 sm:p-6 lg:p-10">
      <BackLink href="/" label={t("inbox.backToMenu")} className="mb-4" />

      <div className="flex items-center gap-4">
  <img
    src="/images/excavator.png"
    alt={t("nav.machines")}
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-primary">{t("nav.machines")}</h1>
</div>

      <p className="mt-4 text-secondary">
        {t("machines.list.subtitle")}
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
        {t("machines.list.addMachine")}
      </button>

      {legalHold && (
        <p className="mt-3 text-sm text-amber-400">{t("common.legalHoldMessage")}</p>
      )}

      {showForm && (
        <div className="mt-8 rounded-2xl bg-surface-1 border border-subtle backdrop-blur-xl p-6 shadow-lg">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? t("machines.list.editMachineTitle") : t("machines.list.addMachineTitle")}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              placeholder={t("machines.list.namePlaceholder")}
              className="rounded-xl border p-3"
              value={machine.name}
              onChange={(e) => updateMachine("name", e.target.value)}
            />

            <input
              placeholder={t("machines.list.categoryPlaceholder")}
              className="rounded-xl border p-3"
              value={machine.category}
              onChange={(e) => updateMachine("category", e.target.value)}
            />

            <input
              placeholder={t("machines.list.manufacturerPlaceholder")}
              className="rounded-xl border p-3"
              value={machine.manufacturer}
              onChange={(e) => updateMachine("manufacturer", e.target.value)}
            />

            <input
              placeholder={t("machines.list.modelPlaceholder")}
              className="rounded-xl border p-3"
              value={machine.model}
              onChange={(e) => updateMachine("model", e.target.value)}
            />

            <input
              placeholder={t("machines.list.serialNumberPlaceholder")}
              className="rounded-xl border p-3"
              value={machine.serial_number}
              onChange={(e) => updateMachine("serial_number", e.target.value)}
            />

            <input
              type="number"
              placeholder={t("inbox.fields.rokVyroby")}
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
              placeholder={t("machines.list.statusPlaceholder")}
              className="rounded-xl border p-3"
              value={machine.status}
              onChange={(e) => updateMachine("status", e.target.value)}
            />
          </div>

          <textarea
            placeholder={t("machines.list.notesPlaceholder")}
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
                ? t("common.buttons.saving")
                : editingId
                ? t("vehicles.forms.saveChanges")
                : t("machines.list.saveMachine")}
            </button>

            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-surface-2 px-6 py-3 text-primary hover:bg-surface-hover"
              >
                {t("vehicles.forms.cancelEdit")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-2xl font-bold text-primary">
  {t("machines.list.savedMachinesTitle")}
</h2>

        {machines.length === 0 ? (
          <div className="rounded-2xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
            <p className="font-medium text-secondary">
  {t("machines.list.noneYet")}
</p>
          </div>
          ) : (
         <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {machines.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-subtle bg-surface-1 backdrop-blur-xl shadow-lg"
              >
                {item.first_photo_url ? (
                  <img
                    src={item.first_photo_url}
                    alt={item.name || t("machines.photoAlt")}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 w-full items-center justify-center bg-surface-2 text-muted-esblu">
                    {t("machines.list.noPhoto")}
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-2xl font-bold">
                    {item.name || t("dashboard.noName")}
                  </h3>

                  <p className="mt-2 text-secondary">
                    {t("machines.list.categoryLabel")}: {item.category || "—"}
                  </p>
                  <p className="text-secondary">
                    {t("machines.list.manufacturerLabel")}: {item.manufacturer || "—"}
                  </p>
                  <p className="text-secondary">
                    {t("machines.list.modelLabel")}: {item.model || "—"}
                  </p>
                  <p className="text-secondary">
                    {t("machines.list.serialNumberLabel")}: {item.serial_number || "—"}
                  </p>
                  <p className="text-secondary">
                    {t("inbox.fields.rokVyroby")}: {item.year || "—"}
                  </p>
                  <p className="text-secondary">
                    {t("machines.list.statusLabel")}: {item.status || "—"}
                  </p>

                  <div className="mt-5 flex gap-3">
                    <Link
                      href={machineDetailHref(item.id)}
                      className="btn-secondary px-4 py-2"
                    >
                      {t("machines.list.detailLink")}
                    </Link>

                    <button
                      onClick={() => editMachine(item)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      {t("common.buttons.edit")}
                    </button>

                    <button
                      onClick={() => deleteMachine(item.id)}
                      disabled={deletingMachineId !== null}
                      className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {deletingMachineId === item.id
                        ? t("inbox.deleting")
                        : t("common.buttons.delete")}
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
