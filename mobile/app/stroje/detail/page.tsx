"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MachineDetailView from "@/app/stroje/MachineDetailView";

// -----------------------------------------------------------------------------
// Tenký MOBILE route wrapper pre statickú detail routu /stroje/detail?id=...
// Pozri obdobný komentár v mobile/app/vozidla/detail/page.tsx. Web ekvivalent:
// app/stroje/[id]/page.tsx (useParams). Business logika je 100% zdieľaná cez
// @/app/stroje/MachineDetailView.tsx.
// -----------------------------------------------------------------------------
function MachineDetailMobileRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  return <MachineDetailView entityId={id} />;
}

export default function MachineDetailMobilePage() {
  return (
    <Suspense fallback={null}>
      <MachineDetailMobileRoute />
    </Suspense>
  );
}
