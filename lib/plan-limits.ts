export type Plan = "free" | "pro" | "admin";

export type PlanResource =
  | "ai_evidence"
  | "vehicles"
  | "inventory_items"
  | "machines";

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  ai_evidence: "AI evidencia",
  vehicles: "Vozidlá",
  inventory_items: "Sklad",
  machines: "Stroje",
};

export const PLAN_LIMIT_MESSAGE =
  "Dosiahli ste limit bezplatnej verzie. Platená verzia Esblu sa pripravuje.";

/**
 * Fallback used only while rendering the free-plan UX if plan_limits cannot be
 * loaded. The database plan_limits table and its trigger are authoritative.
 */
export const FREE_PLAN_UX_FALLBACK_LIMITS: Record<PlanResource, number> = {
  ai_evidence: 5,
  vehicles: 2,
  inventory_items: 5,
  machines: 2,
};

const PLAN_LIMIT_ERROR_PREFIX = "PLAN_LIMIT_REACHED:";

const planResources = new Set<PlanResource>([
  "ai_evidence",
  "vehicles",
  "inventory_items",
  "machines",
]);

export function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "pro" || value === "admin";
}

export function isPlanResource(value: unknown): value is PlanResource {
  return typeof value === "string" && planResources.has(value as PlanResource);
}

export function isPlanUsageLimited(
  usage: number,
  limit: number | null
): boolean {
  return limit !== null && usage >= limit;
}

function getErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (typeof error !== "object" || error === null) return "";

  const errorRecord = error as Record<string, unknown>;
  return [errorRecord.message, errorRecord.details, errorRecord.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function getPlanLimitResourceFromError(
  error: unknown
): PlanResource | null {
  const errorText = getErrorText(error);
  const prefixIndex = errorText.indexOf(PLAN_LIMIT_ERROR_PREFIX);

  if (prefixIndex < 0) return null;

  const valueAfterPrefix = errorText.slice(
    prefixIndex + PLAN_LIMIT_ERROR_PREFIX.length
  );
  const resource = valueAfterPrefix.match(/^[a-z_]+/)?.[0];

  return isPlanResource(resource) ? resource : null;
}

export function isPlanLimitReachedError(
  error: unknown,
  resource?: PlanResource
): boolean {
  const errorResource = getPlanLimitResourceFromError(error);

  if (!errorResource) return false;
  return resource ? errorResource === resource : true;
}
