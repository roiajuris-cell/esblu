"use client";

import { useParams } from "next/navigation";
import VehicleDetailView from "@/app/vozidla/VehicleDetailView";

// -----------------------------------------------------------------------------
// Tenký WEB route wrapper (App Router dynamická routa /vozidla/[id]).
// Business logika, Supabase queries a JSX žijú v
// @/app/vozidla/VehicleDetailView.tsx (zdieľané s mobile buildom, pozri
// mobile/app/vozidla/detail/page.tsx). Tento súbor volá VÝHRADNE useParams()
// — presne jeden hook, unconditionally — a odovzdáva výsledok ako obyčajný
// `entityId` prop. Web routing (/vozidla/[id]) sa touto zmenou NEMENÍ.
// -----------------------------------------------------------------------------
export default function VehicleDetailPage() {
  const { id } = useParams();
  return <VehicleDetailView entityId={String(id)} />;
}
