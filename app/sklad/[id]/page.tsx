"use client";

import { useParams } from "next/navigation";
import InventoryItemDetailView from "@/app/sklad/InventoryItemDetailView";

// -----------------------------------------------------------------------------
// Tenký WEB route wrapper (App Router dynamická routa /sklad/[id]).
// Business logika, Supabase queries a JSX žijú v
// @/app/sklad/InventoryItemDetailView.tsx (zdieľané s mobile buildom, pozri
// mobile/app/sklad/detail/page.tsx). Tento súbor volá VÝHRADNE useParams() —
// presne jeden hook, unconditionally — a odovzdáva výsledok ako obyčajný
// `entityId` prop. Web routing (/sklad/[id]) sa touto zmenou NEMENÍ.
// -----------------------------------------------------------------------------
export default function InventoryItemDetailPage() {
  const { id } = useParams();
  return <InventoryItemDetailView entityId={String(id)} />;
}
