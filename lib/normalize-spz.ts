export function normalizeSpz(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

  return normalized || null;
}
