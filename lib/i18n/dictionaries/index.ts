import type { Locale } from "../locales";
import sk from "./sk";
import de from "./de";
import en from "./en";

export const dictionaries: Record<Locale, typeof sk> = { sk, de, en };
