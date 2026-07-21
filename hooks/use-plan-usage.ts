"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FREE_PLAN_UX_FALLBACK_LIMITS,
  isPlan,
  isPlanUsageLimited,
  type Plan,
  type PlanResource,
} from "@/lib/plan-limits";
import { supabase } from "@/lib/supabase";

export type PlanUsageSnapshot = {
  plan: Plan;
  usage: number;
  limit: number | null;
  isLimited: boolean;
};

export type PlanUsageResult = PlanUsageSnapshot & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PlanUsageSnapshot | null>;
};

function getFallbackLimit(plan: Plan, resource: PlanResource): number | null {
  return plan === "free" ? FREE_PLAN_UX_FALLBACK_LIMITS[resource] : null;
}

function getLimitValue(
  row: Record<string, unknown> | null,
  plan: Plan,
  resource: PlanResource
): number | null {
  const value = row?.[resource];

  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return getFallbackLimit(plan, resource);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Nepodarilo sa načítať plán a využitie limitu.";
}

export function usePlanUsage(resource: PlanResource): PlanUsageResult {
  const [plan, setPlan] = useState<Plan>("free");
  const [usage, setUsage] = useState(0);
  const [limit, setLimit] = useState<number | null>(
    FREE_PLAN_UX_FALLBACK_LIMITS[resource]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) throw new Error("Používateľ nie je prihlásený.");

      const [settingsResult, usageResult] = await Promise.all([
        supabase
          .from("settings")
          .select("plan")
          .eq("user_id", session.user.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from(resource)
          .select("id", { count: "exact", head: true })
          .eq("user_id", session.user.id),
      ]);

      if (settingsResult.error) throw settingsResult.error;
      if (usageResult.error) throw usageResult.error;

      const loadedPlan = isPlan(settingsResult.data?.plan)
        ? settingsResult.data.plan
        : "free";

      const limitsResult = await supabase
        .from("plan_limits")
        .select(resource)
        .eq("plan", loadedPlan)
        .single();

      const loadedLimit = limitsResult.error
        ? getFallbackLimit(loadedPlan, resource)
        : getLimitValue(
            limitsResult.data as Record<string, unknown> | null,
            loadedPlan,
            resource
          );
      const loadedUsage = usageResult.count ?? 0;
      const snapshot: PlanUsageSnapshot = {
        plan: loadedPlan,
        usage: loadedUsage,
        limit: loadedLimit,
        isLimited: isPlanUsageLimited(loadedUsage, loadedLimit),
      };

      if (requestId !== requestIdRef.current) return null;

      setPlan(loadedPlan);
      setUsage(loadedUsage);
      setLimit(loadedLimit);

      if (limitsResult.error) {
        setError(
          "Limity sa nepodarilo načítať z databázy; zobrazuje sa iba orientačný UX fallback."
        );
      }

      return snapshot;
    } catch (loadError: unknown) {
      if (requestId !== requestIdRef.current) return null;

      setPlan("free");
      setUsage(0);
      setLimit(FREE_PLAN_UX_FALLBACK_LIMITS[resource]);
      setError(getErrorMessage(loadError));
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [resource]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const isLimited = useMemo(
    () => isPlanUsageLimited(usage, limit),
    [limit, usage]
  );

  return {
    plan,
    usage,
    limit,
    isLimited,
    loading,
    error,
    refresh,
  };
}
