import { verifyRequestUser } from "@/lib/server-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// -----------------------------------------------------------------------------
// GET /api/account/preflight
//
// Read-only. Vracia aktívnu rolu prihláseného používateľa a — iba pre
// ownera — počet OSTATNÝCH aktívnych členov firmy, ktorí by zrušením
// ownerovho účtu stratili prístup. Slúži výhradne na to, aby confirmation
// modal v Nastaveniach mohol pred finálnym potvrdením zobraziť presné
// číslo (požiadavka: "zobraz počet ostatných členov firmy, ktorí stratia
// prístup" PRED finálnym zmazaním). Nič nemaže ani nemení.
//
// company_id/rola sa vždy odvodzujú zo servera (company_members podľa
// auth.uid() z overeného Bearer tokenu) — nikdy sa neprijímajú od klienta.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
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
        "account/preflight: načítanie membershipu zlyhalo:",
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

    let otherActiveMembersCount = 0;

    if (membership.role === "owner") {
      const { count, error: countError } = await admin
        .from("company_members")
        .select("id", { count: "exact", head: true })
        .eq("company_id", membership.company_id)
        .eq("status", "active")
        .neq("user_id", user.id);

      if (countError) {
        console.error(
          "account/preflight: počítanie ostatných členov zlyhalo:",
          countError.code,
          countError.message
        );
        return Response.json(
          { error: "Nepodarilo sa načítať počet ostatných členov firmy." },
          { status: 500 }
        );
      }

      otherActiveMembersCount = count ?? 0;
    }

    return Response.json({
      role: membership.role,
      otherActiveMembersCount,
    });
  } catch (error) {
    console.error(
      "account/preflight: neočakávaná chyba:",
      error instanceof Error ? error.message : error
    );
    return Response.json(
      { error: "Nepodarilo sa pripraviť zrušenie účtu. Skús to prosím znova." },
      { status: 500 }
    );
  }
}
