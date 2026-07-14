export type NormalizedWeightUnit = "kg" | "t";

export function normalizeWeightUnit(value: unknown): NormalizedWeightUnit | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\s]/g, "");

  if (
    ["kg", "kilogram", "kilogramy", "kilogramov", "kilograms"].includes(
      normalized
    )
  ) {
    return "kg";
  }

  if (
    [
      "t",
      "tona",
      "tony",
      "ton",
      "tonach",
      "tons",
      "tonne",
      "tonnes",
    ].includes(normalized)
  ) {
    return "t";
  }

  return null;
}
