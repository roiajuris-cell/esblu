import type { Metadata } from "next";
import {
  LegalSection,
  PublicLegalLayout,
} from "@/app/components/PublicLegalLayout";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Zoznam sprostredkovateľov (subprocessors) | Esblu",
  description:
    "Aktuálny zoznam externých dodávateľov, ktorí sa podieľajú na spracúvaní údajov v Esblu.",
};

const linkClass =
  "font-semibold text-accent-cyan underline decoration-accent-cyan/40 underline-offset-4 hover:decoration-accent-cyan";

export default function SubprocessorsPage() {
  return (
    <PublicLegalLayout
      title="Zoznam sprostredkovateľov (subprocessors)"
      updatedAt="16. augusta 2026"
    >
      <p>
        Tento zoznam uvádza externých dodávateľov (sprostredkovateľov a
        ďalšie osoby zapojené do spracúvania), ktorých Esblu aktuálne
        využíva. Zoznam sa môže meniť — pri podstatnej zmene, ktorá sa týka
        spracúvania osobných údajov nahratých vašou firmou, vás môžeme
        vopred informovať spôsobom dohodnutým v{" "}
        <a href="/dpa" className={linkClass}>
          DPA
        </a>
        .
      </p>

      <LegalSection title="Aktuálni dodávatelia">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-subtle text-left">
                <th className="py-2 pr-4 font-semibold">Dodávateľ</th>
                <th className="py-2 pr-4 font-semibold">Účel</th>
                <th className="py-2 pr-4 font-semibold">Kategórie údajov</th>
                <th className="py-2 pr-4 font-semibold">Lokalita</th>
                <th className="py-2 font-semibold">Dokumentácia</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-subtle align-top">
                <td className="py-2 pr-4 font-semibold">Supabase</td>
                <td className="py-2 pr-4">
                  Databáza, autentifikácia, úložisko súborov (fotografie,
                  dokumenty)
                </td>
                <td className="py-2 pr-4">
                  Všetky údaje spracúvané v aplikácii
                </td>
                <td className="py-2 pr-4">
                  TODO — región Supabase projektu treba potvrdiť (EÚ/US)
                </td>
                <td className="py-2">
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    supabase.com/privacy
                  </a>
                </td>
              </tr>
              <tr className="border-b border-subtle align-top">
                <td className="py-2 pr-4 font-semibold">OpenAI</td>
                <td className="py-2 pr-4">
                  AI rozpoznávanie údajov z nahraných dokumentov a fotografií
                </td>
                <td className="py-2 pr-4">
                  Obsah nahraného dokumentu/fotografie odoslaný na
                  spracovanie
                </td>
                <td className="py-2 pr-4">
                  TODO — potvrdiť spracovateľskú lokalitu podľa OpenAI API
                  nastavenia účtu
                </td>
                <td className="py-2">
                  <a
                    href="https://openai.com/enterprise-privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    openai.com/enterprise-privacy
                  </a>
                </td>
              </tr>
              <tr className="border-b border-subtle align-top">
                <td className="py-2 pr-4 font-semibold">Vercel</td>
                <td className="py-2 pr-4">Hosting a prevádzka aplikácie</td>
                <td className="py-2 pr-4">
                  Technické dáta spojenia potrebné na doručenie aplikácie
                </td>
                <td className="py-2 pr-4">TODO — potvrdiť región nasadenia</td>
                <td className="py-2">
                  <a
                    href="https://vercel.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    vercel.com/legal/privacy-policy
                  </a>
                </td>
              </tr>
              <tr className="border-b border-subtle align-top">
                <td className="py-2 pr-4 font-semibold">
                  Namecheap (Private Email)
                </td>
                <td className="py-2 pr-4">
                  Hosting firemnej e-mailovej komunikácie (schránky
                  info@esblu.com a privacy@esblu.com — privacy@esblu.com je
                  alias smerujúci do tej istej schránky) a prijímanie
                  e-mailových správ od používateľov, vrátane žiadostí
                  týkajúcich sa osobných údajov
                </td>
                <td className="py-2 pr-4">
                  E-mailová adresa odosielateľa, obsah správy a prípadné
                  prílohy
                </td>
                <td className="py-2 pr-4">
                  USA (servery Namecheapu sú primárne v USA) — presná
                  lokalita konkrétnej schránky nepotvrdená. Namecheap DPA
                  obsahuje štandardné zmluvné doložky (SCC vrátane UK
                  Addendum) ako mechanizmus medzinárodného prenosu.
                </td>
                <td className="py-2">
                  <a
                    href="https://www.namecheap.com/legal/universal/data-processing-addendum/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    namecheap.com/legal/.../data-processing-addendum
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="E-mailová komunikácia — história a aktuálny stav">
        <p>
          Predchádzajúca verzia Zásad ochrany osobných údajov (verzia 1.0)
          uvádzala medzi dodávateľmi aj Resend a Namecheap Private Email s
          opisom „odosielanie vybraných e-mailov&ldquo;. Podrobná kontrola
          aplikácie toto overila voči realite:
        </p>
        <p>
          <strong>Resend</strong> nie je aplikáciou nikde použitý — Esblu
          neprevádzkuje vlastnú odosielaciu e-mailovú infraštruktúru,
          transakčné e-maily súvisiace s účtom (potvrdenie registrácie,
          obnova hesla) odosiela výhradne vstavaný e-mailový systém Supabase
          Auth. Resend preto v tabuľke vyššie nie je uvedený.
        </p>
        <p>
          <strong>Namecheap Private Email</strong> sa reálne používa, ale
          inak, než pôvodný text opisoval: nejde o odosielaciu
          infraštruktúru aplikácie, ale o hosting schránok info@esblu.com a
          privacy@esblu.com, na ktoré nás môžete priamo kontaktovať (napr.
          so žiadosťou týkajúcou sa osobných údajov). Namecheap preto teraz
          figuruje v tabuľke vyššie s presným, overeným popisom svojej
          úlohy.
        </p>
      </LegalSection>

      <LegalSection title="Zmeny zoznamu">
        <p>
          Aktuálna verzia tohto zoznamu platí od {legalConfig.effectiveDate}.
          Zoznam môžeme aktualizovať pri zmene technickej infraštruktúry
          Esblu.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
