"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import VehicleDetailView from "@/app/vozidla/VehicleDetailView";

// -----------------------------------------------------------------------------
// Tenký MOBILE route wrapper pre statickú detail routu /vozidla/detail?id=...
// Web ekvivalent (dynamická routa /vozidla/[id]) je v
// app/vozidla/[id]/page.tsx a volá useParams(). Tento súbor volá VÝHRADNE
// useSearchParams() — presne jeden hook, unconditionally, žiadna podmienená
// voľba hooku podľa prostredia (Rules of Hooks). Business logika, Supabase
// queries a JSX sú 100% zdieľané cez @/app/vozidla/VehicleDetailView.tsx.
//
// Next.js vyžaduje pri static exporte, aby useSearchParams() bol obalený v
// <Suspense> hranici — inak build zlyhá s
// "useSearchParams() should be wrapped in a suspense boundary".
// -----------------------------------------------------------------------------
function VehicleDetailMobileRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  return <VehicleDetailView entityId={id} />;
}

export default function VehicleDetailMobilePage() {
  return (
    <Suspense fallback={null}>
      <VehicleDetailMobileRoute />
    </Suspense>
  );
}
