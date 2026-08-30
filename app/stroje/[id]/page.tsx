"use client";

import { useParams } from "next/navigation";
import MachineDetailView from "@/app/stroje/MachineDetailView";

// -----------------------------------------------------------------------------
// Tenký WEB route wrapper (App Router dynamická routa /stroje/[id]).
// Business logika, Supabase queries a JSX žijú v
// @/app/stroje/MachineDetailView.tsx (zdieľané s mobile buildom, pozri
// mobile/app/stroje/detail/page.tsx). Tento súbor volá VÝHRADNE useParams()
// — presne jeden hook, unconditionally — a odovzdáva výsledok ako obyčajný
// `entityId` prop. Web routing (/stroje/[id]) sa touto zmenou NEMENÍ.
// -----------------------------------------------------------------------------
export default function MachineDetailPage() {
  const { id } = useParams();
  return <MachineDetailView entityId={String(id)} />;
}
