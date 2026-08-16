import { verifyRequestUser } from "@/lib/server-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// POST /api/account/delete
//
// Server-side (service_role) samoobslužné zrušenie účtu. Rola a company_id
// prihláseného používateľa sa VŽDY znovu načítajú zo servera (company_members
// podľa auth.uid() z overeného Bearer tokenu) — nikdy sa nepoužívajú
// hodnoty poslané klientom.
//
// Poradie (spoločné pre oba flow, detaily nižšie vo funkciách):
//   1. server-side autorizácia + preflight (verifyRequestUser + znovu-
//      načítanie company_members riadku).
//   2. Storage objekty firmy — vyčítané PRESNE z DB riadkov (storage_bucket +
//      storage_path/file_path/logo_path), zmazané cez Storage API, PRED
//      akoukoľvek DB zmenou (bezpečné zopakovať pri zlyhaní — remove() na už
//      zmazanej ceste nie je chyba).
//   3. DB časť (business tabuľky / company / memberships / settings / legal
//      acceptances) — JEDNA atomická transakcia cez SECURITY DEFINER RPC
//      (public.esblu_owner_delete_company / esblu_member_delete_self,
//      pozri 20260816100000).
//   4. auth.users zmazanie cez Admin API — VÝHRADNE posledný krok.
//   5. Ľahká nezávislá post-verifikácia (company_members riadok + auth
//      užívateľ skutočne zmizli).
//
// Ak ktorýkoľvek krok zlyhá, funkcia vyhodí výnimku → chytené v POST() →
// klientovi ide zrozumiteľná chyba (nikdy "success"), server-side log
// obsahuje Postgres error code/message (bez akýchkoľvek secretov).
// =============================================================================

type StorageTarget = { bucket: string; path: string };

async function collectOwnerStorageTargets(
  admin: SupabaseClient,
  companyId: string,
  ownerUserId: string
): Promise<StorageTarget[]> {
  const targets: StorageTarget[] = [];

  const [
    documentsRes,
    attachmentsRes,
    aiEvidenceRes,
    machinePhotosRes,
    inventoryPhotosRes,
    settingsRes,
  ] = await Promise.all([
    admin
      .from("documents")
      .select("storage_bucket, storage_path")
      .eq("company_id", companyId),
    admin
      .from("document_attachments")
      .select("storage_bucket, storage_path")
      .eq("company_id", companyId),
    admin
      .from("ai_evidence")
      .select("photo_url")
      .eq("company_id", companyId)
      .not("photo_url", "is", null),
    admin
      .from("machine_photos")
      .select("file_path")
      .eq("company_id", companyId)
      .not("file_path", "is", null),
    admin
      .from("inventory_photos")
      .select("file_path")
      .eq("company_id", companyId)
      .not("file_path", "is", null),
    admin
      .from("settings")
      .select("logo_path")
      .eq("user_id", ownerUserId)
      .not("logo_path", "is", null),
  ]);

  for (const [label, res] of [
    ["documents", documentsRes],
    ["document_attachments", attachmentsRes],
    ["ai_evidence", aiEvidenceRes],
    ["machine_photos", machinePhotosRes],
    ["inventory_photos", inventoryPhotosRes],
    ["settings", settingsRes],
  ] as const) {
    if (res.error) {
      throw new Error(
        `ESBLU_STORAGE_LOOKUP_FAILED:${label}:${res.error.code ?? ""}:${res.error.message}`
      );
    }
  }

  for (const row of documentsRes.data ?? []) {
    if (row.storage_bucket && row.storage_path) {
      targets.push({ bucket: row.storage_bucket, path: row.storage_path });
    }
  }

  for (const row of attachmentsRes.data ?? []) {
    if (row.storage_bucket && row.storage_path) {
      targets.push({ bucket: row.storage_bucket, path: row.storage_path });
    }
  }

  for (const row of aiEvidenceRes.data ?? []) {
    if (row.photo_url) {
      targets.push({ bucket: "ai-evidence-documents", path: row.photo_url });
    }
  }

  for (const row of machinePhotosRes.data ?? []) {
    if (row.file_path) {
      targets.push({ bucket: "machine-photos", path: row.file_path });
    }
  }

  for (const row of inventoryPhotosRes.data ?? []) {
    if (row.file_path) {
      targets.push({ bucket: "inventory-photos", path: row.file_path });
    }
  }

  for (const row of settingsRes.data ?? []) {
    if (row.logo_path) {
      targets.push({ bucket: "company-logos", path: row.logo_path });
    }
  }

  return targets;
}

async function collectMemberOwnStorageTargets(
  admin: SupabaseClient,
  userId: string
): Promise<StorageTarget[]> {
  // Admin/employee flow NIKDY nemaže firemné dáta/Storage — jediný Storage
  // objekt, ktorý mu môže patriť VÝHRADNE osobne, je jeho vlastný nahraný
  // logo súbor v jeho vlastnom (typicky prázdnom) settings riadku.
  const { data, error } = await admin
    .from("settings")
    .select("logo_path")
    .eq("user_id", userId)
    .not("logo_path", "is", null);

  if (error) {
    throw new Error(
      `ESBLU_STORAGE_LOOKUP_FAILED:settings:${error.code ?? ""}:${error.message}`
    );
  }

  return (data ?? [])
    .filter((row) => row.logo_path)
    .map((row) => ({ bucket: "company-logos", path: row.logo_path as string }));
}

async function removeStorageTargets(
  admin: SupabaseClient,
  targets: StorageTarget[]
): Promise<number> {
  const byBucket = new Map<string, string[]>();

  for (const target of targets) {
    const list = byBucket.get(target.bucket) ?? [];
    list.push(target.path);
    byBucket.set(target.bucket, list);
  }

  let removed = 0;

  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { data, error } = await admin.storage.from(bucket).remove(batch);

      if (error) {
        throw new Error(
          `ESBLU_STORAGE_REMOVE_FAILED:${bucket}:${error.message}`
        );
      }

      removed += data?.length ?? batch.length;
    }
  }

  return removed;
}

export async function POST(req: Request) {
  try {
    const { user, error: authError } = await verifyRequestUser(req);

    if (authError || !user) {
      return Response.json({ error: authError }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("role, company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      console.error(
        "account/delete: načítanie membershipu zlyhalo:",
        membershipError.code,
        membershipError.message
      );
      return Response.json(
        { error: "Nepodarilo sa overiť členstvo vo firme." },
        { status: 500 }
      );
    }

    if (!membership) {
      return Response.json(
        { error: "Nemáš aktívne členstvo v žiadnej firme." },
        { status: 404 }
      );
    }

    if (membership.role === "owner") {
      let body: { confirmPhrase?: string } = {};

      try {
        body = await req.json();
      } catch {
        body = {};
      }

      if (body.confirmPhrase !== "ZRUŠIŤ FIRMU") {
        return Response.json(
          { error: "Potvrdzovací text nesedí presne." },
          { status: 400 }
        );
      }

      const storageTargets = await collectOwnerStorageTargets(
        admin,
        membership.company_id,
        user.id
      );

      const storageRemovedCount = await removeStorageTargets(
        admin,
        storageTargets
      );

      const { data: dbSummary, error: rpcError } = await admin.rpc(
        "esblu_owner_delete_company",
        { p_owner_user_id: user.id }
      );

      if (rpcError) {
        console.error(
          "account/delete (owner): esblu_owner_delete_company zlyhalo:",
          rpcError.code,
          rpcError.message,
          rpcError.details,
          rpcError.hint
        );
        return Response.json(
          {
            error:
              "Zrušenie firemného účtu zlyhalo pred dokončením. Skús to prosím znova alebo kontaktuj podporu.",
          },
          { status: 500 }
        );
      }

      const { error: deleteAuthError } =
        await admin.auth.admin.deleteUser(user.id);

      if (deleteAuthError) {
        console.error(
          "account/delete (owner): auth.admin.deleteUser zlyhalo:",
          deleteAuthError.message
        );
        return Response.json(
          {
            error:
              "Firemné dáta boli zmazané, ale samotný prihlasovací účet sa nepodarilo dokončiť zrušiť. Kontaktuj podporu.",
          },
          { status: 500 }
        );
      }

      const { data: verifyUser } = await admin.auth.admin.getUserById(
        user.id
      );

      if (verifyUser?.user) {
        console.error(
          "account/delete (owner): post-verifikácia zlyhala — auth.users stále existuje po deleteUser()."
        );
        return Response.json(
          {
            error:
              "Zrušenie účtu sa nepodarilo úplne overiť. Kontaktuj podporu.",
          },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        role: "owner",
        storageRemovedCount,
        dbSummary,
      });
    }

    // ADMIN / EMPLOYEE flow — firemné dáta sa nedotýkajú.
    const storageTargets = await collectMemberOwnStorageTargets(
      admin,
      user.id
    );

    const storageRemovedCount = await removeStorageTargets(
      admin,
      storageTargets
    );

    const { data: dbSummary, error: rpcError } = await admin.rpc(
      "esblu_member_delete_self",
      { p_user_id: user.id }
    );

    if (rpcError) {
      console.error(
        "account/delete (member): esblu_member_delete_self zlyhalo:",
        rpcError.code,
        rpcError.message,
        rpcError.details,
        rpcError.hint
      );
      return Response.json(
        {
          error:
            "Zrušenie účtu zlyhalo pred dokončením. Skús to prosím znova alebo kontaktuj podporu.",
        },
        { status: 500 }
      );
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
      user.id
    );

    if (deleteAuthError) {
      console.error(
        "account/delete (member): auth.admin.deleteUser zlyhalo:",
        deleteAuthError.message
      );
      return Response.json(
        {
          error:
            "Členstvo bolo zrušené, ale samotný prihlasovací účet sa nepodarilo dokončiť zrušiť. Kontaktuj podporu.",
        },
        { status: 500 }
      );
    }

    const { data: verifyUser } = await admin.auth.admin.getUserById(user.id);

    if (verifyUser?.user) {
      console.error(
        "account/delete (member): post-verifikácia zlyhala — auth.users stále existuje po deleteUser()."
      );
      return Response.json(
        { error: "Zrušenie účtu sa nepodarilo úplne overiť. Kontaktuj podporu." },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      role: membership.role,
      storageRemovedCount,
      dbSummary,
    });
  } catch (error) {
    console.error(
      "account/delete: neočakávaná chyba:",
      error instanceof Error ? error.message : error
    );
    return Response.json(
      {
        error:
          "Zrušenie účtu zlyhalo. Nič sa nepotvrdzuje ako dokončené — skús to prosím znova alebo kontaktuj podporu.",
      },
      { status: 500 }
    );
  }
}
