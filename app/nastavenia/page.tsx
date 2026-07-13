"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NastaveniaPage() {
  const [userId, setUserId] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [logoPath, setLogoPath] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  function getLogoPublicUrl(path: string) {
    if (!path) {
      return "";
    }

    const { data } = supabase.storage
      .from("company-logos")
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
    await loadSettings(session.user.id);
  }

  async function loadSettings(currentUserId: string) {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", currentUserId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Chyba pri načítaní nastavení:", error);
      return;
    }

    if (data) {
      const savedLogoPath = data.logo_path || "";

      setCompanyName(data.company_name || "");
      setLogoPath(savedLogoPath);
      setLogoUrl(getLogoPublicUrl(savedLogoPath));
    }
  }

  async function findSettingsRow() {
    return await supabase
      .from("settings")
      .select("id, logo_path")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
  }

  async function saveLogoPathToDatabase(path: string | null) {
    const { data, error: findError } = await findSettingsRow();

    if (findError) {
      throw findError;
    }

    if (data) {
      const { error } = await supabase
        .from("settings")
        .update({
          logo_path: path,
        })
        .eq("id", data.id)
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      return;
    }

    const { error } = await supabase.from("settings").insert({
      user_id: userId,
      company_name: companyName.trim(),
      logo_path: path,
    });

    if (error) {
      throw error;
    }
  }

  async function saveSettings() {
    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setSettingsLoading(true);

    const { data, error: findError } = await findSettingsRow();

    if (findError) {
      setSettingsLoading(false);
      alert("Nastavenia sa nepodarilo načítať.");
      return;
    }

    if (data) {
      const { error } = await supabase
        .from("settings")
        .update({
          company_name: companyName.trim(),
        })
        .eq("id", data.id)
        .eq("user_id", userId);

      if (error) {
        setSettingsLoading(false);
        alert("Nastavenia sa nepodarilo uložiť: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("settings").insert({
        user_id: userId,
        company_name: companyName.trim(),
        logo_path: logoPath || null,
      });

      if (error) {
        setSettingsLoading(false);
        alert("Nastavenia sa nepodarilo uložiť: " + error.message);
        return;
      }
    }

    setSettingsLoading(false);
    alert("Nastavenia boli uložené.");
  }

  async function compressLogo(file: File): Promise<File> {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Obrázok sa nepodarilo načítať."));
        image.src = objectUrl;
      });

      const maxSize = 800;
      const scale = Math.min(
        maxSize / image.width,
        maxSize / image.height,
        1
      );

      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Obrázok sa nepodarilo spracovať.");
      }

      context.drawImage(image, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error("Logo sa nepodarilo skomprimovať."));
            }
          },
          "image/webp",
          0.85
        );
      });

      return new File([blob], "company-logo.webp", {
        type: "image/webp",
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleLogoChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    event.target.value = "";

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      alert("Vyber obrázok vo formáte JPEG, PNG alebo WebP.");
      return;
    }

    setLogoLoading(true);

    let uploadedPath = "";

    try {
      const compressedLogo = await compressLogo(selectedFile);

      if (compressedLogo.size > 2 * 1024 * 1024) {
        throw new Error(
          "Logo je aj po kompresii väčšie než povolené 2 MB."
        );
      }

      uploadedPath = `${userId}/${Date.now()}-company-logo.webp`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(uploadedPath, compressedLogo, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const previousLogoPath = logoPath;

      await saveLogoPathToDatabase(uploadedPath);

      setLogoPath(uploadedPath);
      setLogoUrl(
        getLogoPublicUrl(uploadedPath) + `?v=${Date.now()}`
      );

      if (
        previousLogoPath &&
        previousLogoPath !== uploadedPath
      ) {
        const { error: deleteOldLogoError } =
          await supabase.storage
            .from("company-logos")
            .remove([previousLogoPath]);

        if (deleteOldLogoError) {
          console.error(
            "Staré logo sa nepodarilo vymazať:",
            deleteOldLogoError
          );
        }
      }

      alert("Firemné logo bolo uložené.");
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage
          .from("company-logos")
          .remove([uploadedPath]);
      }

      const message =
        error instanceof Error
          ? error.message
          : "Logo sa nepodarilo uložiť.";

      alert("Logo sa nepodarilo uložiť: " + message);
    } finally {
      setLogoLoading(false);
    }
  }

  async function deleteLogo() {
    if (!userId || !logoPath) {
      return;
    }

    const confirmed = window.confirm(
      "Naozaj chceš vymazať firemné logo?"
    );

    if (!confirmed) {
      return;
    }

    setLogoLoading(true);

    const { error: storageError } = await supabase.storage
      .from("company-logos")
      .remove([logoPath]);

    if (storageError) {
      setLogoLoading(false);
      alert(
        "Logo sa nepodarilo vymazať z úložiska: " +
          storageError.message
      );
      return;
    }

    try {
      await saveLogoPathToDatabase(null);

      setLogoPath("");
      setLogoUrl("");

      alert("Firemné logo bolo vymazané.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Databázový záznam sa nepodarilo upraviť.";

      alert("Logo bolo vymazané, ale nastala chyba: " + message);
    } finally {
      setLogoLoading(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      alert("Nové heslo musí mať minimálne 8 znakov.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("Nové heslá sa nezhodujú.");
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPasswordLoading(false);

    if (error) {
      alert("Heslo sa nepodarilo zmeniť: " + error.message);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");

    alert("Heslo bolo úspešne zmenené.");
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
      style={{
        backgroundImage:
          "url('/images/background-dark.png')",
      }}
    >
      <div className="flex items-center gap-4">
        <img
          src="/images/settings.png"
          alt="Nastavenia"
          className="h-20 w-20 object-contain"
        />

        <h1 className="text-4xl font-bold text-white drop-shadow-lg">
          Nastavenia
        </h1>
      </div>

      <div className="mt-8 max-w-2xl space-y-6">
        <section className="rounded-3xl border border-white/20 bg-white/45 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-slate-900">
            Firma
          </h2>

          <div className="mt-6">
            <label className="mb-2 block font-semibold">
              Názov firmy
            </label>

            <input
              className="w-full rounded-xl border p-3"
              placeholder="Napr. Moja firma s.r.o."
              value={companyName}
              onChange={(event) =>
                setCompanyName(event.target.value)
              }
              disabled={settingsLoading}
            />
          </div>

          <div className="mt-6">
            <label className="mb-2 block font-semibold">
              Firemné logo
            </label>

            {logoUrl ? (
              <div className="mb-4 flex min-h-40 items-center justify-center rounded-2xl border border-white/40 bg-white/80 p-4">
                <img
                  src={logoUrl}
                  alt="Firemné logo"
                  className="max-h-36 max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mb-4 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-400 bg-white/50 p-4 text-center text-slate-600">
                Zatiaľ nie je uložené žiadne firemné logo.
              </div>
            )}

            <label className="inline-flex cursor-pointer rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800">
              {logoLoading
                ? "Spracovávam logo..."
                : logoPath
                  ? "Zmeniť logo"
                  : "Pridať logo"}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleLogoChange}
                disabled={logoLoading}
                className="hidden"
              />
            </label>

            {logoPath && (
              <button
                type="button"
                onClick={deleteLogo}
                disabled={logoLoading}
                className="ml-3 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 disabled:bg-gray-400"
              >
                Vymazať logo
              </button>
            )}

            <p className="mt-3 text-sm text-slate-700">
              Logo sa automaticky zmenší a uloží vo formáte
              WebP. Maximálna povolená veľkosť je 2 MB.
            </p>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={settingsLoading || logoLoading}
            className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {settingsLoading ? "Ukladám..." : "💾 Uložiť"}
          </button>
        </section>

        <section className="rounded-3xl border border-white/20 bg-white/45 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-slate-900">
            Zmena hesla
          </h2>

          <p className="mt-2 text-sm text-slate-700">
            Nové heslo musí mať minimálne 8 znakov.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block font-semibold">
                Nové heslo
              </label>

              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border p-3"
                placeholder="Zadaj nové heslo"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                disabled={passwordLoading}
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold">
                Potvrdenie nového hesla
              </label>

              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border p-3"
                placeholder="Zadaj nové heslo znova"
                value={confirmNewPassword}
                onChange={(event) =>
                  setConfirmNewPassword(event.target.value)
                }
                disabled={passwordLoading}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={changePassword}
            disabled={passwordLoading}
            className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-white hover:bg-slate-800 disabled:bg-gray-400"
          >
            {passwordLoading
              ? "Mením heslo..."
              : "Zmeniť heslo"}
          </button>
        </section>
      </div>
    </main>
  );
}