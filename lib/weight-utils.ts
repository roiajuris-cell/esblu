import {
  normalizeWeightUnit,
  type NormalizedWeightUnit,
} from "@/lib/normalize-weight-unit";

export type WeightFields = {
  quantity?: unknown;
  brutto?: unknown;
  tara?: unknown;
  netto?: unknown;
  unit?: unknown;
};

export type ValidatedWeightFields = {
  quantity: number | null;
  brutto: number | null;
  tara: number | null;
  netto: number | null;
  unit: NormalizedWeightUnit | null;
  invalidFields: Array<"quantity" | "brutto" | "tara" | "netto">;
  hasMathMismatch: boolean;
  isUnitMissing: boolean;
  needsReview: boolean;
};

const WEIGHT_FIELD_NAMES = ["quantity", "brutto", "tara", "netto"] as const;

function hasProvidedValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Parses only unambiguous, non-negative weight values.
 * A lone separator followed by exactly three digits (for example "1,000") is
 * rejected because it could mean either one thousand or one decimal value.
 */
export function parseWeightValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(compact)) return null;

  const separatorMatch = compact.match(/[.,]/g);
  if (separatorMatch?.length === 1) {
    const [integerPart, fractionPart] = compact.split(/[.,]/);
    const hadGroupedWhitespace = /\d[\s\u00a0\u202f]+\d/.test(trimmed);

    if (
      !hadGroupedWhitespace &&
      integerPart.length <= 3 &&
      fractionPart.length === 3
    ) {
      return null;
    }
  }

  const parsed = Number(compact.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getEffectiveNetto(record: {
  netto?: unknown;
  quantity?: unknown;
}): number | null {
  return parseWeightValue(record.netto) ?? parseWeightValue(record.quantity);
}

export function convertWeightToTons(
  value: unknown,
  unit: unknown
): number | null {
  const parsedValue = parseWeightValue(value);
  if (parsedValue === null) return null;

  const normalizedUnit = normalizeWeightUnit(unit);
  if (normalizedUnit === "kg") return parsedValue / 1000;
  if (normalizedUnit === "t") return parsedValue;
  return null;
}

export function normalizeAndValidateWeights(
  input: WeightFields
): ValidatedWeightFields {
  const parsed = {
    quantity: parseWeightValue(input.quantity),
    brutto: parseWeightValue(input.brutto),
    tara: parseWeightValue(input.tara),
    netto: parseWeightValue(input.netto),
  };

  const invalidFields = WEIGHT_FIELD_NAMES.filter(
    (field) => hasProvidedValue(input[field]) && parsed[field] === null
  );
  const unit = normalizeWeightUnit(input.unit);
  const hasAnyWeight = WEIGHT_FIELD_NAMES.some(
    (field) => parsed[field] !== null
  );
  const isUnitMissing = hasAnyWeight && unit === null;

  let hasMathMismatch = false;
  if (parsed.brutto !== null && parsed.tara !== null) {
    if (parsed.brutto < parsed.tara) {
      hasMathMismatch = true;
    } else if (parsed.netto !== null) {
      const expectedNetto = parsed.brutto - parsed.tara;
      const minimumTolerance = unit === "kg" ? 1 : 0.01;
      const tolerance = Math.max(minimumTolerance, expectedNetto * 0.001);
      hasMathMismatch = Math.abs(expectedNetto - parsed.netto) > tolerance;
    }
  }

  return {
    ...parsed,
    unit,
    invalidFields: [...invalidFields],
    hasMathMismatch,
    isUnitMissing,
    needsReview:
      invalidFields.length > 0 || hasMathMismatch || isUnitMissing,
  };
}
