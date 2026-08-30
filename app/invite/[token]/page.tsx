"use client";

import { useParams } from "next/navigation";
import InviteView from "@/app/invite/InviteView";

// -----------------------------------------------------------------------------
// Tenký WEB route wrapper (App Router dynamická routa /invite/[token]) —
// URL sa touto zmenou NEMENÍ (existujúce emailRedirectTo odkazy aj priamo
// zdieľané invite linky naďalej fungujú bezo zmeny). Business logika a JSX
// žijú v @/app/invite/InviteView.tsx (zdieľané s mobile buildom, pozri
// mobile/app/invite/page.tsx). Tento súbor volá VÝHRADNE useParams() —
// presne jeden hook, unconditionally — a odovzdáva výsledok ako obyčajný
// `token` prop. Rovnaký vzor ako app/vozidla/[id]/page.tsx.
// -----------------------------------------------------------------------------
export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  return <InviteView token={token} />;
}
