import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";

type Props = {
  car: any;
  onDelete: (id: string) => void;
  onEdit: (car: any) => void;
  // Employee nesmie podľa RLS upraviť ani zmazať vozidlo (vehicles_update_
  // owner_admin / vehicles_delete_owner_admin, 20260814160000) — tlačidlá sa
  // preto pre employee vôbec nezobrazujú, namiesto toho, aby po kliknutí
  // vždy skončili chybou z RLS. Default true, aby sa správanie nezmenilo
  // nikde, odkiaľ by sa táto prop nepreposlala.
  canManage?: boolean;
};

export default function VehicleCard({
  car,
  onDelete,
  onEdit,
  canManage = true,
}: Props) {
  const { t } = useLocale();

  return (
    <div className="surface-card surface-card-hover p-5">
      {/* Zámerne ponechané ako biela/čierna "fyzická" ŠPZ tabuľka (aj v
          tmavom dizajne) — čitateľný, rozpoznateľný skutočný objekt, nie
          pozostatok svetlého motívu. */}
      <div className="mb-4 inline-block rounded-lg border-2 border-slate-900 bg-white px-5 py-2 text-2xl font-bold tracking-widest text-slate-900">
        {car.spz || t("inbox.withoutSpzGroup")}
      </div>

      <h3 className="text-2xl font-bold text-primary">
        {car.znacka} {car.model}
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-secondary">
        <p><b className="text-primary">{t("inbox.fields.vin")}:</b> {car.vin}</p>
        <p><b className="text-primary">{t("inbox.fields.palivo")}:</b> {car.palivo}</p>
        <p><b className="text-primary">{t("inbox.fields.vykon")}:</b> {car.vykon}</p>
        <p><b className="text-primary">{t("vehicles.fields.stk")}:</b> {car.stk || t("common.misc.notFilled")}</p>
        <p><b className="text-primary">{t("vehicles.fields.ek")}:</b> {car.ek || t("common.misc.notFilled")}</p>
      </div>

      <div className="mt-5 flex gap-3">
        <Link
          href={`/vozidla/${car.id}`}
          className="btn-secondary px-4 py-2"
        >
          {t("common.buttons.detail")}
        </Link>

        {canManage && (
          <button
            onClick={() => onEdit(car)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t("common.buttons.edit")}
          </button>
        )}

        {canManage && (
          <button
            onClick={() => onDelete(car.id)}
            className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            {t("common.buttons.delete")}
          </button>
        )}
      </div>
    </div>
  );
}