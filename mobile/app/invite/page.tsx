"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import InviteView from "@/app/invite/InviteView";

// -----------------------------------------------------------------------------
// Tenký MOBILE route wrapper pre statickú invite routu /invite?token=...
// Web ekvivalent (dynamická routa /invite/[token]) je v
// app/invite/[token]/page.tsx a volá useParams(). Dynamická App Router routa
// /invite/[token] nie je kompatibilná s `next build` output: "export" (bez
// generateStaticParams() enumerujúcej každý token vopred, čo pri invite
// tokenoch nedáva zmysel — pozri lib/entity-links.ts pre rovnaký princíp pri
// /vozidla/detail?id=...). Tento súbor preto volá VÝHRADNE useSearchParams()
// — presne jeden hook, unconditionally, žiadna podmienená voľba hooku podľa
// prostredia (Rules of Hooks). Business logika, Supabase queries a JSX sú
// 100% zdieľané cez @/app/invite/InviteView.tsx.
//
// Next.js vyžaduje pri static exporte, aby useSearchParams() bol obalený v
// <Suspense> hranici — inak build zlyhá s
// "useSearchParams() should be wrapped in a suspense boundary".
//
// Chýbajúci/prázdny ?token= je bezpečne ošetrený v InviteView (token === ""
// → state "invalid" hneď pri prvom rendri, žiadny RPC call s prázdnym
// tokenom).
// -----------------------------------------------------------------------------
function InviteMobileRoute() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  return <InviteView token={token} />;
}

export default function InviteMobilePage() {
  return (
    <Suspense fallback={null}>
      <InviteMobileRoute />
    </Suspense>
  );
}
