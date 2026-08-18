"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";
import {
  createCompanyInvite,
  getCreateInviteErrorMessage,
  isOwnerOrAdmin,
  listMyCompanyInvites,
  listMyCompanyMembers,
  type CompanyInviteRole,
  type CompanyInviteRow,
  type CompanyMemberRole,
  type CompanyMemberRow,
} from "@/lib/company";
import {
  listMyLegalAcceptances,
  type MyLegalAcceptanceRow,
} from "@/lib/legal-acceptance";
import { legalConfig } from "@/lib/legal-config";
import {
  ACCOUNT_DELETION_CONFIRM_PHRASE,
  deleteMyAccount,
  fetchAccountDeletionPreflight,
  isPartialAccountDeletionError,
  stripPartialAccountDeletionMarker,
  type AccountDeletionPreflight,
} from "@/lib/account-deletion";

const MEMBER_ROLE_LABELS: Record<string, string> = {
  owner: "Majiteľ",
  admin: "Plný prístup",
  employee: "Zamestnanec",
};

const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: "Čaká na prijatie",
  accepted: "Prijatá",
  revoked: "Zrušená",
  expired: "Vypršala",
};

const feedbackSubject = "Spätná väzba k Esblu";
const feedbackBody = `Dobrý deň,

používam testovaciu verziu Esblu a chcem poslať spätnú väzbu.

Čo som robil:

Čo sa stalo alebo čo mi chýba:

Zariadenie alebo prehliadač:

Ďakujem.`;
const feedbackMailto = `mailto:info@esblu.com?subject=${encodeURIComponent(
  feedbackSubject
)}&body=${encodeURIComponent(feedbackBody)}`;

const DOC_TYPE_LABELS: Record<string, string> = {
  terms: "Podmienky používania",
  privacy_policy: "Zásady ochrany osobných údajov",
  dpa: "Zmluva o spracúvaní osobných údajov (DPA)",
  cookie_policy: "Cookies",
};

function buildPrivacyRequestMailto(subject: string, body: string) {
  return `mailto:privacy@esblu.com?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

const exportRequestMailto = buildPrivacyRequestMailto(
  "Žiadosť o export osobných údajov — Esblu",
  `Dobrý deň,

žiadam o export osobných údajov spojených s mojím účtom v Esblu (e-mail účtu: ).

Ďakujem.`
);

const correctionRequestMailto = buildPrivacyRequestMailto(
  "Žiadosť o opravu osobných údajov — Esblu",
  `Dobrý deň,

žiadam o opravu nasledujúcich osobných údajov spojených s mojím účtom v Esblu (e-mail účtu: ):

Nesprávny/neúplný údaj:
Správna hodnota:

Ďakujem.`
);

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

  const [members, setMembers] = useState<CompanyMemberRow[]>([]);
  const [invites, setInvites] = useState<CompanyInviteRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [myRole, setMyRole] = useState<CompanyMemberRole | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyInviteRole>("employee");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const [acceptances, setAcceptances] = useState<MyLegalAcceptanceRow[]>([]);
  const [acceptancesLoading, setAcceptancesLoading] = useState(false);

  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  // Nastaví loadCompanyUsers(), keď ownMembership neexistuje AJ preflight
  // potvrdí orphan:true (auth.users existuje, žiadne aktívne členstvo, nie
  // je owner_id žiadnej firmy) — riadi viditeľnosť sekcie "Zrušiť účet" pre
  // takýto účet (myRole je preň null, takže pôvodné {myRole && (...)}
  // gatovanie by ho inak úplne skrylo).
  const [isOrphanAccount, setIsOrphanAccount] = useState(false);
  const [deletePreflight, setDeletePreflight] =
    useState<AccountDeletionPreflight | null>(null);
  const [deletePreflightLoading, setDeletePreflightLoading] = useState(false);
  const [deletePreflightError, setDeletePreflightError] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  async function loadCompanyUsers(currentUserId: string) {
    setUsersLoading(true);

    try {
      // Vlastný membership riadok je dostupný cez existujúcu RLS policy
      // (company_members_select_own, z 20260814110000) pre KAŽDÚ rolu
      // vrátane employee. Preto sa číta priamo z tabuľky — na rozdiel od
      // esblu_list_my_company_members()/..._invites(), ktoré sú teraz
      // vyhradené iba pre aktívneho owner/admin a employee by pre ne
      // dostal chybu (zámerne, pozri report).
      const { data: ownMembership, error: ownMembershipError } =
        await supabase
          .from("company_members")
          .select("role")
          .eq("user_id", currentUserId)
          .eq("status", "active")
          .maybeSingle();

      if (ownMembershipError) {
        throw ownMembershipError;
      }

      const role = ownMembership?.role ?? null;
      setMyRole(role);

      if (role === "owner" || role === "admin") {
        const [memberRows, inviteRows] = await Promise.all([
          listMyCompanyMembers(),
          listMyCompanyInvites(),
        ]);

        setMembers(memberRows);
        setInvites(inviteRows);
      } else {
        setMembers([]);
        setInvites([]);
      }

      if (role === null) {
        // Žiadne aktívne membership — zisti (server-side, service-role),
        // či ide o bezpečne rozpoznaného "orphan" účet (pozri
        // app/api/account/preflight/route.ts), aby appka vedela ponúknuť
        // samoobslužné zrušenie účtu aj tu. Zámerne "best effort" — pri
        // chybe iba ostane isOrphanAccount=false (sekcia sa jednoducho
        // nezobrazí, nič sa nerozbije).
        try {
          const preflight = await fetchAccountDeletionPreflight();
          setIsOrphanAccount(preflight.orphan === true);
        } catch (preflightError) {
          console.error(
            "Overenie orphan stavu zlyhalo:",
            preflightError
          );
          setIsOrphanAccount(false);
        }
      } else {
        setIsOrphanAccount(false);
      }
    } catch (error) {
      console.error("Načítanie používateľov firmy zlyhalo:", error);
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleCreateInvite() {
    setInviteError("");
    setLastInviteLink("");
    setLinkCopied(false);

    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setInviteError("Zadaj platnú e-mailovú adresu.");
      return;
    }

    setInviteSubmitting(true);

    try {
      const result = await createCompanyInvite(normalizedEmail, inviteRole);
      const inviteLink = `${window.location.origin}/invite/${result.token}`;

      setLastInviteLink(inviteLink);
      setInviteEmail("");

      if (userId) {
        await loadCompanyUsers(userId);
      }
    } catch (error) {
      setInviteError(getCreateInviteErrorMessage(error));
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function copyInviteLink() {
    if (!lastInviteLink) return;

    try {
      await navigator.clipboard.writeText(lastInviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error("Kopírovanie odkazu zlyhalo:", error);
    }
  }

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
    await loadCompanyUsers(session.user.id);
    await loadAcceptances();
  }

  async function loadAcceptances() {
    setAcceptancesLoading(true);
    const rows = await listMyLegalAcceptances();
    setAcceptances(rows);
    setAcceptancesLoading(false);
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

  async function openDeleteAccountModal() {
    setShowDeleteAccountModal(true);
    setDeleteConfirmText("");
    setDeleteError("");
    setDeletePreflightError("");
    setDeletePreflight(null);
    setDeletePreflightLoading(true);

    try {
      const preflight = await fetchAccountDeletionPreflight();
      setDeletePreflight(preflight);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Prípravu na zrušenie účtu sa nepodarilo načítať.";
      setDeletePreflightError(message);
    } finally {
      setDeletePreflightLoading(false);
    }
  }

  function closeDeleteAccountModal() {
    if (deleteSubmitting) {
      return;
    }

    setShowDeleteAccountModal(false);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  async function confirmDeleteAccount() {
    if (!deletePreflight) {
      return;
    }

    if (
      deletePreflight.role === "owner" &&
      deleteConfirmText !== ACCOUNT_DELETION_CONFIRM_PHRASE
    ) {
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError("");

    try {
      await deleteMyAccount(
        deletePreflight.role === "owner" ? deleteConfirmText : undefined
      );

      await supabase.auth.signOut();

      window.location.href = "/login?ucet-zruseny=1";
    } catch (error) {
      // DÔLEŽITÉ: server označí chybu ako `partial: true` (pozri
      // app/api/account/delete/route.ts), keď DB/membership časť je už
      // NEVRATNE zmazaná, ale auth.users účet ostal existovať —
      // v takom prípade sa NESMIE ponechať aktívna session (používateľ by
      // sa mohol ďalej pohybovať v appke s membershipom, ktorý už
      // neexistuje). Vynútime rovnaké odhlásenie + presmerovanie ako pri
      // úspechu, iba s odlíšeným query flagom pre login stránku.
      if (isPartialAccountDeletionError(error)) {
        await supabase.auth.signOut();
        window.location.href = "/login?ucet-zruseny-ciastocne=1";
        return;
      }

      setDeleteSubmitting(false);

      const message =
        error instanceof Error
          ? stripPartialAccountDeletionMarker(error.message)
          : "Zrušenie účtu zlyhalo.";
      setDeleteError(message);
    }
  }

  return (
    <main className="app-shell-bg min-h-screen p-4 sm:p-6 lg:p-10">
      <BackLink href="/" label="Hlavné menu" className="mb-4" />

      <div className="flex items-center gap-4">
        <img
          src="/images/settings.png"
          alt="Nastavenia"
          className="h-20 w-20 object-contain"
        />

        <h1 className="text-4xl font-bold text-primary">
          Nastavenia
        </h1>
      </div>

      <div className="mt-8 max-w-2xl space-y-6">
        {isOwnerOrAdmin(myRole) && (
        <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-primary">
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
              <div className="mb-4 flex min-h-40 items-center justify-center rounded-2xl border border-subtle bg-surface-2 p-4">
                <img
                  src={logoUrl}
                  alt="Firemné logo"
                  className="max-h-36 max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mb-4 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-400 bg-surface-1 p-4 text-center text-secondary">
                Zatiaľ nie je uložené žiadne firemné logo.
              </div>
            )}

            <label className="btn-secondary inline-flex cursor-pointer px-6 py-3 font-semibold">
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

            <p className="mt-3 text-sm text-secondary">
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
        )}

        {myRole && (
          <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
            <h2 className="text-2xl font-bold text-primary">
              Používatelia
            </h2>

            <p className="mt-2 text-sm text-secondary">
              Vaše členstvo:{" "}
              <span className="font-semibold">
                {MEMBER_ROLE_LABELS[myRole] || myRole}
              </span>
            </p>

            {usersLoading ? (
              <p className="mt-4 text-sm text-secondary">Načítavam...</p>
            ) : (
              <>
                {members.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-primary">Členovia</h3>

                    <ul className="mt-3 space-y-2">
                      {members.map((member) => (
                        <li
                          key={member.member_id}
                          className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3"
                        >
                          <span className="text-sm text-primary">
                            {member.email}
                          </span>
                          <span className="text-xs font-semibold text-secondary">
                            {MEMBER_ROLE_LABELS[member.role] || member.role}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(myRole === "owner" || myRole === "admin") && (
                  <>
                    {invites.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-semibold text-primary">
                          Pozvánky
                        </h3>

                        <ul className="mt-3 space-y-2">
                          {invites.map((invite) => (
                            <li
                              key={invite.invite_id}
                              className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3"
                            >
                              <span className="text-sm text-primary">
                                {invite.email}{" "}
                                <span className="text-xs text-muted-esblu">
                                  (
                                  {MEMBER_ROLE_LABELS[invite.role] ||
                                    invite.role}
                                  )
                                </span>
                              </span>
                              <span className="text-xs font-semibold text-secondary">
                                {INVITE_STATUS_LABELS[invite.status] ||
                                  invite.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-6 rounded-2xl border border-dashed border-subtle p-5">
                      <h3 className="font-semibold text-primary">
                        Pozvať používateľa
                      </h3>

                      <div className="mt-4 space-y-3">
                        <input
                          type="email"
                          placeholder="Email"
                          className="w-full rounded-xl border p-3"
                          value={inviteEmail}
                          onChange={(event) =>
                            setInviteEmail(event.target.value)
                          }
                          disabled={inviteSubmitting}
                        />

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <label className="flex flex-1 items-center gap-2 rounded-xl border border-subtle p-3 text-sm">
                            <input
                              type="radio"
                              name="inviteRole"
                              checked={inviteRole === "admin"}
                              onChange={() => setInviteRole("admin")}
                              disabled={inviteSubmitting}
                            />
                            Plný prístup
                          </label>

                          <label className="flex flex-1 items-center gap-2 rounded-xl border border-subtle p-3 text-sm">
                            <input
                              type="radio"
                              name="inviteRole"
                              checked={inviteRole === "employee"}
                              onChange={() => setInviteRole("employee")}
                              disabled={inviteSubmitting}
                            />
                            Zamestnanec
                          </label>
                        </div>
                      </div>

                      {inviteError && (
                        <p className="mt-3 text-sm font-medium text-red-700">
                          {inviteError}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleCreateInvite}
                        disabled={inviteSubmitting}
                        className="mt-4 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        {inviteSubmitting
                          ? "Vytváram..."
                          : "Pozvať používateľa"}
                      </button>

                      {lastInviteLink && (
                        <div className="mt-4 rounded-xl bg-surface-2 p-4">
                          <p className="text-sm font-semibold text-primary">
                            Pozvánka bola vytvorená
                          </p>
                          <p className="mt-2 break-all text-xs text-secondary">
                            {lastInviteLink}
                          </p>
                          <button
                            type="button"
                            onClick={copyInviteLink}
                            className="mt-3 rounded-xl border border-subtle px-4 py-2 text-sm font-semibold text-secondary hover:bg-surface-1"
                          >
                            {linkCopied ? "Skopírované ✓" : "Kopírovať odkaz"}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-primary">
            Zmena hesla
          </h2>

          <p className="mt-2 text-sm text-secondary">
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
            className="btn-secondary mt-8 px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {passwordLoading
              ? "Mením heslo..."
              : "Zmeniť heslo"}
          </button>
        </section>

        <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-primary">
            Spätná väzba
          </h2>

          <p className="mt-2 leading-7 text-secondary">
            Našli ste chybu, niečo vám chýba alebo máte návrh na zlepšenie?
            Napíšte nám. Vaša spätná väzba pomáha zlepšovať testovaciu verziu
            Esblu.
          </p>

          <a
            href={feedbackMailto}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Poslať spätnú väzbu
          </a>

          <p className="mt-3 text-sm leading-6 text-secondary">
            Do správy nevkladajte heslá ani citlivé osobné údaje.
          </p>
        </section>

        <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-primary">
            Právne informácie
          </h2>

          <p className="mt-2 text-sm text-secondary">
            Verejné informácie o pravidlách používania služby a spracúvaní
            osobných údajov.
          </p>

          <nav
            aria-label="Právne a kontaktné informácie"
            className="mt-6 grid gap-3"
          >
            <Link
              href="/ochrana-osobnych-udajov"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Zásady ochrany osobných údajov
            </Link>
            <Link
              href="/podmienky-pouzivania"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Podmienky používania Esblu
            </Link>
            <Link
              href="/cookies"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Cookies
            </Link>
            <Link
              href="/dpa"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Zmluva o spracúvaní osobných údajov (DPA)
            </Link>
            <Link
              href="/subprocessors"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Zoznam sprostredkovateľov
            </Link>
            <Link
              href="/kontakt"
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Kontakt
            </Link>
          </nav>
        </section>

        <section className="rounded-3xl border border-subtle bg-surface-1 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-primary">
            Súkromie a dáta
          </h2>

          <p className="mt-2 text-sm text-secondary">
            Prehľad toho, ktoré verzie právnych dokumentov ste potvrdili, a
            možnosť požiadať o uplatnenie svojich práv k osobným údajom.
          </p>

          <div className="mt-6">
            <h3 className="font-semibold text-primary">
              Vaše potvrdené dokumenty
            </h3>

            {acceptancesLoading ? (
              <p className="mt-3 text-sm text-secondary">Načítavam...</p>
            ) : acceptances.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {acceptances.map((row) => (
                  <li
                    key={`${row.document_type}-${row.version}`}
                    className="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-semibold text-primary">
                      {DOC_TYPE_LABELS[row.document_type] || row.document_type}{" "}
                      <span className="font-normal text-muted-esblu">
                        (verzia {row.version})
                      </span>
                    </span>
                    <span className="text-xs text-muted-esblu">
                      potvrdené{" "}
                      {new Date(row.accepted_at).toLocaleString("sk-SK")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-secondary">
                Zatiaľ nemáme záznam o potvrdení žiadneho dokumentu (alebo
                ešte nebola nasadená databázová funkcia na ich evidenciu).
              </p>
            )}

            <p className="mt-3 text-xs text-muted-esblu">
              Aktuálne platné verzie: Podmienky používania v
              {legalConfig.termsVersion}, Zásady ochrany osobných údajov v
              {legalConfig.privacyPolicyVersion}.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href={exportRequestMailto}
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 text-center font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Požiadať o export mojich údajov
            </a>
            <a
              href={correctionRequestMailto}
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 text-center font-semibold text-blue-700 transition hover:bg-surface-1"
            >
              Požiadať o opravu mojich údajov
            </a>
          </div>

        </section>

        {(myRole || isOrphanAccount) && (
          <section className="rounded-2xl border border-subtle/60 bg-surface-1/60 p-6">
            <h2 className="text-sm font-semibold text-secondary">
              Zrušiť účet
            </h2>

            {myRole === "owner" ? (
              <p className="mt-2 text-sm text-muted-esblu">
                Ako majiteľ firmy môžete natrvalo zrušiť celý firemný účet.
                Ide o nezvratnú akciu — vymaže sa firma aj všetky jej dáta a
                ostatní členovia stratia prístup.
              </p>
            ) : myRole ? (
              <p className="mt-2 text-sm text-muted-esblu">
                Môžete natrvalo zrušiť svoj osobný účet. Firemné dáta
                (vozidlá, stroje, sklad, dokumenty) zostávajú firme — vymaže
                sa iba vaša identita a členstvo.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-esblu">
                Tento účet momentálne nie je členom žiadnej firmy. Môžete
                ho natrvalo zrušiť.
              </p>
            )}

            <button
              type="button"
              onClick={openDeleteAccountModal}
              className="mt-4 rounded-xl border border-red-900/50 px-5 py-2.5 text-sm font-semibold text-red-400/90 transition hover:border-red-700 hover:bg-red-950/30 hover:text-red-300"
            >
              Zrušiť účet
            </button>
          </section>
        )}
      </div>

      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-surface-1 p-5 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-primary">
                {deletePreflight?.role === "owner"
                  ? "Naozaj chcete zrušiť účet?"
                  : "Zrušiť účet?"}
              </h2>

              <button
                type="button"
                onClick={closeDeleteAccountModal}
                disabled={deleteSubmitting}
                className="rounded-xl bg-surface-2 px-4 py-2 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {deletePreflightLoading ? (
              <p className="mt-6 text-sm text-secondary">
                Načítavam...
              </p>
            ) : deletePreflightError ? (
              <p className="mt-6 text-sm font-medium text-red-400">
                {deletePreflightError}
              </p>
            ) : deletePreflight?.role === "owner" ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm leading-6 text-secondary">
                  Táto akcia je <strong>nevratná</strong>. Zrušením vášho
                  owner účtu sa natrvalo zruší celá firma. Odstráni sa:
                </p>

                <ul className="list-disc space-y-1 pl-5 text-sm text-secondary">
                  <li>firma,</li>
                  <li>AI evidencia a dokumenty,</li>
                  <li>vozidlá a servisné záznamy,</li>
                  <li>stroje a servisné záznamy,</li>
                  <li>sklad,</li>
                  <li>uložené fotografie a súbory,</li>
                  <li>pozvánky (invitations),</li>
                  <li>členstvá adminov a zamestnancov.</li>
                </ul>

                <p className="text-sm leading-6 text-secondary">
                  {deletePreflight.otherActiveMembersCount > 0 ? (
                    <>
                      <strong>
                        {deletePreflight.otherActiveMembersCount}{" "}
                        {deletePreflight.otherActiveMembersCount === 1
                          ? "ďalší člen firmy stratí"
                          : "ďalších členov firmy stratí"}
                      </strong>{" "}
                      prístup k tejto firme. Ich prihlasovacie účty sa
                      nezmažú — zaniká iba ich členstvo v tejto firme.
                    </>
                  ) : (
                    "Firma aktuálne nemá žiadnych ďalších členov."
                  )}
                </p>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-primary">
                    Pre potvrdenie napíšte presne: {ACCOUNT_DELETION_CONFIRM_PHRASE}
                  </label>

                  <input
                    type="text"
                    className="w-full rounded-xl border p-3"
                    value={deleteConfirmText}
                    onChange={(event) =>
                      setDeleteConfirmText(event.target.value)
                    }
                    disabled={deleteSubmitting}
                    autoComplete="off"
                  />
                </div>

                {deleteError && (
                  <p className="text-sm font-medium text-red-400">
                    {deleteError}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={deleteSubmitting}
                    className="btn-secondary px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Zrušiť
                  </button>

                  <button
                    type="button"
                    onClick={confirmDeleteAccount}
                    disabled={
                      deleteSubmitting ||
                      deleteConfirmText !== ACCOUNT_DELETION_CONFIRM_PHRASE
                    }
                    className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-500 disabled:opacity-60"
                  >
                    {deleteSubmitting
                      ? "Ruším účet..."
                      : "Natrvalo zrušiť účet"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {deletePreflight?.orphan ? (
                  <p className="text-sm leading-6 text-secondary">
                    Táto akcia je <strong>nevratná</strong>. Tento účet
                    momentálne nie je členom žiadnej firmy — zruší sa iba
                    vaša prihlasovacia identita.
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-secondary">
                    Táto akcia je <strong>nevratná</strong>. Zruší sa vaša
                    osobná identita a členstvo v tejto firme. Firemné
                    dokumenty a dáta (vozidlá, stroje, sklad, AI evidencia),
                    ktoré ste pre firmu vytvorili, jej{" "}
                    <strong>zostávajú</strong> — nič z firemných dát sa
                    nezmaže.
                  </p>
                )}

                {deleteError && (
                  <p className="text-sm font-medium text-red-400">
                    {deleteError}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={deleteSubmitting}
                    className="btn-secondary px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Zrušiť
                  </button>

                  <button
                    type="button"
                    onClick={confirmDeleteAccount}
                    disabled={deleteSubmitting}
                    className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deleteSubmitting ? "Ruším účet..." : "Áno, zrušiť účet"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
