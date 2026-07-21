import {
  PLAN_LIMIT_MESSAGE,
  PLAN_RESOURCE_LABELS,
  type PlanResource,
} from "@/lib/plan-limits";

type PlanLimitNoticeProps = {
  resource?: PlanResource;
  usage?: number;
  limit?: number | null;
  className?: string;
};

export default function PlanLimitNotice({
  resource,
  usage,
  limit,
  className = "",
}: PlanLimitNoticeProps) {
  const hasUsage =
    typeof usage === "number" && typeof limit === "number" && limit >= 0;

  return (
    <aside
      role="status"
      className={`rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-amber-950 shadow-sm sm:p-5 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-lg"
        >
          !
        </span>

        <div className="min-w-0">
          <p className="font-bold">
            {resource ? `Limit modulu ${PLAN_RESOURCE_LABELS[resource]}` : "Limit plánu"}
          </p>
          {hasUsage && (
            <p className="mt-1 text-sm font-semibold">
              Využitie: {usage} / {limit}
            </p>
          )}
          <p className="mt-2 text-sm leading-6 sm:text-base">
            {PLAN_LIMIT_MESSAGE}
          </p>
        </div>
      </div>
    </aside>
  );
}
