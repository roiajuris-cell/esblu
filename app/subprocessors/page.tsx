import type { Metadata } from "next";
import { SubprocessorsPageClient } from "./SubprocessorsPageClient";

export const metadata: Metadata = {
  title: "Zoznam sprostredkovateľov (subprocessors) | Esblu",
  description:
    "Aktuálny zoznam externých dodávateľov, ktorí sa podieľajú na spracúvaní údajov v Esblu.",
};

export default function SubprocessorsPage() {
  return <SubprocessorsPageClient />;
}
