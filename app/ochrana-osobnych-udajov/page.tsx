import type { Metadata } from "next";
import {
  LegalSection,
  PublicLegalLayout,
} from "@/app/components/PublicLegalLayout";

export const metadata: Metadata = {
  title: "Zásady ochrany osobných údajov | Esblu",
  description: "Informácie o spracúvaní osobných údajov v službe Esblu.",
};

const emailLinkClass =
  "break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4";

export default function PrivacyPolicyPage() {
  return (
    <PublicLegalLayout
      title="Zásady ochrany osobných údajov"
      updatedAt="21. júla 2026"
    >
      <p>
        Tieto zásady vysvetľujú, aké osobné údaje môže Esblu spracúvať,
        prečo ich potrebuje a aké práva majú používatelia bezplatnej
        testovacej verzie.
      </p>

      <LegalSection title="A. Prevádzkovateľ">
        <p>
          Prevádzkovateľom služby Esblu je Jaroslav Juriš, Slovenská
          republika. Vo veciach ochrany osobných údajov nás môžete kontaktovať
          na adrese{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="B. Aké údaje spracúvame">
        <p>Podľa toho, ktoré funkcie používate, môžeme spracúvať najmä:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>registračný a prihlasovací e-mail,</li>
          <li>názov účtu alebo firmy a firemné logo,</li>
          <li>
            údaje vložené do modulov AI evidencia, Vozidlá, Stroje a Sklad,
          </li>
          <li>
            fotografie a dokumenty odovzdané na AI spracovanie a údaje z nich
            rozpoznané,
          </li>
          <li>
            technické údaje potrebné na prihlásenie, bezpečnosť a fungovanie
            služby.
          </li>
        </ul>
        <p>
          Heslá nespracúvame v čitateľnej podobe. Prihlásenie zabezpečuje
          použitá autentifikačná služba.
        </p>
      </LegalSection>

      <LegalSection title="C. Na aké účely údaje používame">
        <p>Údaje používame na:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>vytvorenie účtu, prihlásenie a správu používateľského účtu,</li>
          <li>poskytovanie a zlepšovanie funkcií Esblu,</li>
          <li>uloženie a zobrazenie evidencie vytvorenej používateľom,</li>
          <li>AI rozpoznanie údajov z nahraných dokumentov a fotografií,</li>
          <li>ochranu služby, riešenie chýb a komunikáciu s používateľom,</li>
          <li>plnenie zákonných povinností, ak sa na nás vzťahujú.</li>
        </ul>
      </LegalSection>

      <LegalSection title="D. Právne základy spracúvania">
        <p>
          Údaje spracúvame najmä preto, aby sme mohli na žiadosť používateľa
          vytvoriť účet a poskytovať službu. V potrebnom rozsahu môže byť
          základom aj náš oprávnený záujem na bezpečnej prevádzke, odhaľovaní
          zneužitia a zlepšovaní služby, plnenie zákonnej povinnosti alebo
          súhlas, ak si ho konkrétne spracúvanie vyžaduje. Súhlas možno
          kedykoľvek odvolať bez vplyvu na zákonnosť predchádzajúceho
          spracúvania.
        </p>
      </LegalSection>

      <LegalSection title="E. Dodávatelia a prenos údajov">
        <p>
          Na prevádzku Esblu využívame podľa použitej funkcie služby Supabase
          (databáza, autentifikácia a úložisko), Vercel (prevádzka aplikácie),
          OpenAI (AI spracovanie), Resend (odosielanie vybraných e-mailov) a
          Namecheap Private Email (e-mailová komunikácia). Každý dodávateľ
          dostáva iba údaje potrebné pre príslušnú funkciu.
        </p>
        <p>
          Rozsah spracúvania a miesto spracúvania závisia od konkrétnej služby
          a jej aktuálneho nastavenia. Ak sa údaje prenášajú mimo Európskeho
          hospodárskeho priestoru, majú sa použiť primerané právne mechanizmy
          a ochranné opatrenia podľa platných pravidiel.
        </p>
      </LegalSection>

      <LegalSection title="F. AI spracovanie dokumentov">
        <p>
          Dokumenty a fotografie, ktoré používateľ odošle na AI načítanie, sa
          spracujú s cieľom rozpoznať údaje a predvyplniť evidenciu. AI môže
          údaje prečítať nepresne, neúplne alebo nesprávne. Používateľ musí
          výsledok pred uložením a ďalším použitím skontrolovať.
        </p>
        <p>
          Esblu nepoužíva rozpoznaný výsledok na automatické rozhodovanie s
          právnymi alebo obdobne významnými účinkami voči používateľovi.
        </p>
      </LegalSection>

      <LegalSection title="G. Zodpovednosť používateľa za vložené údaje">
        <p>
          Používateľ má do Esblu vkladať iba údaje a dokumenty, ktoré je
          oprávnený spracúvať. Ak obsahujú údaje iných osôb, používateľ
          zodpovedá za existenciu primeraného právneho základu, splnenie
          informačných povinností a správnosť vložených údajov.
        </p>
      </LegalSection>

      <LegalSection title="H. Ako dlho údaje uchovávame">
        <p>
          Údaje uchovávame počas existencie účtu a podľa potreby počas
          používania služby. Po zrušení účtu alebo vybavení žiadosti ich môžeme
          primeraný čas uchovať, ak je to potrebné na technické dokončenie
          vymazania, ochranu právnych nárokov, bezpečnosť alebo splnenie
          zákonnej povinnosti. Konkrétna doba závisí od druhu údajov a účelu.
        </p>
      </LegalSection>

      <LegalSection title="I. Vaše práva">
        <p>
          Za podmienok stanovených právnymi predpismi môžete žiadať prístup k
          údajom, ich opravu, vymazanie, obmedzenie spracúvania a prenosnosť.
          Môžete namietať proti spracúvaniu založenému na oprávnenom záujme a
          odvolať súhlas, ak sa spracúvanie opiera o súhlas.
        </p>
        <p>
          Žiadosť pošlite na{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          . Pred vybavením môžeme primerane overiť vašu totožnosť. Ak sa
          domnievate, že boli porušené vaše práva, môžete podať návrh alebo
          sťažnosť na Úrad na ochranu osobných údajov Slovenskej republiky.
        </p>
      </LegalSection>

      <LegalSection title="J. Bezpečnosť">
        <p>
          Používame primerané technické a organizačné opatrenia na ochranu
          údajov, napríklad riadenie prístupu, oddelenie údajov používateľov a
          zabezpečený prenos. Žiadny systém však nemožno považovať za úplne
          bezpečný. Používateľ má chrániť svoje prihlasovacie údaje a oznámiť
          nám podozrenie na zneužitie účtu.
        </p>
      </LegalSection>

      <LegalSection title="K. Zmeny týchto zásad">
        <p>
          Tieto zásady môžeme meniť, keď sa zmenia funkcie Esblu, používaní
          dodávatelia alebo právne požiadavky. Aktuálna verzia bude zverejnená
          na tejto stránke s dátumom poslednej aktualizácie. Pri podstatnej
          zmene môžeme používateľov upozorniť aj vhodným spôsobom v aplikácii
          alebo e-mailom.
        </p>
      </LegalSection>

      <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5 font-semibold text-blue-950">
        Tento dokument opisuje aktuálne fungovanie bezplatnej testovacej
        verzie Esblu. Pred spustením platenej verzie môže byť aktualizovaný.
      </aside>
    </PublicLegalLayout>
  );
}
