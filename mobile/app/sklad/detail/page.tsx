"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import InventoryItemDetailView from "@/app/sklad/InventoryItemDetailView";

// -----------------------------------------------------------------------------
// Tenký MOBILE route wrapper pre statickú detail routu /sklad/detail?id=...
// Pozri obdobný komentár v mobile/app/vozidla/detail/page.tsx. Web ekvivalent:
// app/sklad/[id]/page.tsx (useParams). Business logika je 100% zdieľaná cez
// @/app/sklad/InventoryItemDetailView.tsx.
// -----------------------------------------------------------------------------
function InventoryItemDetailMobileRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  return <InventoryItemDetailView entityId={id} />;
}

export default function InventoryItemDetailMobilePage() {
  return (
    <Suspense fallback={null}>
      <InventoryItemDetailMobileRoute />
    </Suspense>
  );
}
