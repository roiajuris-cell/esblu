"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// -----------------------------------------------------------------------------
// Zdieľaný detail skladovej položky — pozri obdobný komentár v
// app/vozidla/VehicleDetailView.tsx. Web wrapper: app/sklad/[id]/page.tsx
// (useParams). Mobile wrapper: mobile/app/sklad/detail/page.tsx
// (useSearchParams).
// -----------------------------------------------------------------------------
export default function InventoryItemDetailView({
  entityId,
}: {
  entityId: string;
}) {
  const itemId = entityId;
  const { t } = useLocale();

  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    loadItem();
  }, []);

  async function loadItem() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (!error) setItem(data);
  }

  if (!item) {
    return <div className="p-10">{t("common.buttons.loading")}</div>;
  }

  const lowStock =
    item.min_quantity !== null &&
    item.min_quantity !== undefined &&
    Number(item.quantity || 0) <= Number(item.min_quantity);

  return (
    <main className="app-shell-bg min-h-screen p-10">
      <BackLink href="/sklad" label={t("nav.inventory")} className="mb-4" />

      <h1 className="text-4xl font-bold">📦 {item.name}</h1>

      {lowStock && (
        <div className="badge-warning mt-6 rounded-xl p-4 font-bold">
          {t("inventory.detail.lowStockBadge")}
        </div>
      )}

      <div className="surface-card mt-8 p-8">
        <div className="grid grid-cols-2 gap-5">
          <p><b>{t("inventory.list.categoryLabel")}:</b> {item.category || "—"}</p>
          <p><b>{t("inventory.list.quantityLabel")}:</b> {item.quantity ?? 0} {item.unit || ""}</p>
          <p><b>{t("inventory.detail.minQuantityLabel")}:</b> {item.min_quantity ?? "—"} {item.unit || ""}</p>
          <p><b>{t("inventory.list.locationLabel")}:</b> {item.location || "—"}</p>
        </div>

        {item.notes && (
          <div className="mt-6 rounded-xl bg-surface-2 p-4">
            <b>{t("inventory.list.notesLabel")}</b>
            <p className="mt-2">{item.notes}</p>
          </div>
        )}
      </div>
    </main>
  );
}