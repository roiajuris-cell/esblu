import type { Metadata } from "next";
import {
  LegalSection,
  PublicLegalLayout,
} from "@/app/components/PublicLegalLayout";

export const metadata: Metadata = {
  title: "Podmienky používania Esblu",
  description: "Podmienky používania bezplatnej testovacej verzie Esblu.",
};

const emailLinkClass =
  "break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4";

export default function TermsPage() {
  return (
    <PublicLegalLayout
      title="Podmienky používania Esblu"
      updatedAt="21. júla 2026"
    >
      <p>
        Tieto podmienky upravujú používanie služby Esblu, ktorú prevádzkuje
        Jaroslav Juriš v Slovenskej republike. Vytvorením účtu a používaním
        služby používateľ potvrdzuje, že sa s nimi oboznámil.
      </p>

      <LegalSection title="1. Bezplatná testovacia verzia">
        <p>
          Esblu je momentálne poskytované ako bezplatná testovacia verzia.
          Platená verzia sa pripravuje. Používanie testovacej verzie nezakladá
          nárok na budúcu platenú službu, konkrétnu cenu ani zachovanie
          všetkých dnešných funkcií a limitov.
        </p>
        <p>
          Testovaciu verziu, jej funkcie alebo limity môžeme primerane meniť,
          obmedziť alebo ukončiť. Ak je to možné, o podstatnej zmene
          používateľov vopred informujeme.
        </p>
      </LegalSection>

      <LegalSection title="2. Funkcie služby">
        <p>
          Esblu pomáha evidovať firemné dokumenty, vozidlá, stroje a skladové
          položky. Vybrané dokumenty môže načítať pomocou AI a predvyplniť z
          nich údaje. Rozsah funkcií sa počas testovania môže meniť.
        </p>
      </LegalSection>

      <LegalSection title="3. Limity bezplatného plánu">
        <p>Na jeden účet sa vzťahujú tieto maximálne limity:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>AI evidencia: 5 uložených dokumentov,</li>
          <li>Vozidlá: 2 vozidlá,</li>
          <li>Stroje: 2 stroje,</li>
          <li>Sklad: 5 položiek.</li>
        </ul>
        <p>
          Vymazaním záznamu sa príslušný limit spravidla uvoľní. Technické
          ochrany môžu zabrániť vytvoreniu ďalšieho záznamu po dosiahnutí
          limitu.
        </p>
      </LegalSection>

      <LegalSection title="4. Povinnosti používateľa">
        <p>Používateľ je povinný najmä:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>uvádzať pravdivé údaje a chrániť prihlasovacie údaje,</li>
          <li>používať službu v súlade so zákonom a právami iných osôb,</li>
          <li>vkladať iba obsah, ktorý je oprávnený používať a spracúvať,</li>
          <li>
            nepokúšať sa narušiť bezpečnosť, obchádzať limity alebo zneužívať
            službu,
          </li>
          <li>udržiavať vložené údaje primerane aktuálne a správne.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. AI výstupy treba vždy skontrolovať">
        <p>
          AI rozpoznanie môže obsahovať chyby, vynechať údaje alebo ich
          nesprávne priradiť. Výstup je iba pomôcka a nesmie sa považovať za
          overený údaj, odborné stanovisko ani náhradu originálneho dokumentu.
          Používateľ musí každý výsledok pred uložením, rozhodnutím alebo
          ďalším použitím porovnať s originálom a opraviť nepresnosti.
        </p>
      </LegalSection>

      <LegalSection title="6. Dostupnosť, testovanie a zálohy">
        <p>
          Testovacia verzia sa poskytuje „tak, ako je“ a „podľa dostupnosti“.
          Môže obsahovať chyby, výpadky alebo neúplné funkcie. Nezaručujeme
          nepretržitú dostupnosť ani to, že služba bude vhodná na každý účel.
        </p>
        <p>
          Esblu nemá byť jediným úložiskom dôležitých údajov. Používateľ si má
          uchovať originálne dokumenty a vlastné záložné kópie údajov, ktoré
          potrebuje pre podnikanie, zákonné povinnosti alebo riešenie sporov.
        </p>
      </LegalSection>

      <LegalSection title="7. Zodpovednosť">
        <p>
          Za obsah vložený používateľom, kontrolu AI výstupov a spôsob použitia
          údajov zodpovedá používateľ. Prevádzkovateľ zodpovedá v rozsahu,
          ktorý vyžadujú platné právne predpisy. Pri posudzovaní prípadnej
          zodpovednosti sa zohľadní testovacia povaha služby, primeranosť
          bezpečnostných opatrení, možnosť používateľa údaje overiť a zálohovať
          a konkrétne okolnosti vzniku škody. Nič v týchto podmienkach
          nevylučuje zodpovednosť, ktorú nemožno platne vylúčiť alebo obmedziť.
        </p>
      </LegalSection>

      <LegalSection title="8. Obsah používateľa">
        <p>
          Používateľovi zostávajú práva k obsahu, ktorý do Esblu vloží. V
          rozsahu potrebnom na prevádzku služby udeľuje prevádzkovateľovi
          obmedzené, nevýhradné oprávnenie obsah ukladať, technicky spracovať,
          preniesť, zobraziť používateľovi a spracovať zvolenou AI funkciou.
          Toto oprávnenie slúži iba na poskytnutie, zabezpečenie a údržbu Esblu.
        </p>
      </LegalSection>

      <LegalSection title="9. Zrušenie účtu a obmedzenie prístupu">
        <p>
          O zrušenie účtu možno požiadať na{" "}
          <a href="mailto:info@esblu.com" className={emailLinkClass}>
            info@esblu.com
          </a>{" "}
          alebo{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          . Pred žiadosťou odporúčame exportovať alebo zálohovať potrebné
          údaje.
        </p>
        <p>
          Pri závažnom alebo opakovanom porušení týchto podmienok, ohrození
          bezpečnosti alebo protiprávnom používaní môžeme prístup primerane
          obmedziť alebo účet zrušiť. Ak to situácia umožňuje, používateľa
          najprv upozorníme a dáme mu primeranú možnosť nápravy alebo exportu
          údajov.
        </p>
      </LegalSection>

      <LegalSection title="10. Zmeny podmienok">
        <p>
          Podmienky môžeme aktualizovať najmä pri zmene funkcií, obchodného
          modelu alebo právnych požiadaviek. Aktuálna verzia bude dostupná na
          tejto stránke. O podstatných zmenách môžeme informovať aj v aplikácii
          alebo e-mailom.
        </p>
      </LegalSection>

      <LegalSection title="11. Kontakt">
        <p>
          Otázky k používaniu Esblu môžete poslať na{" "}
          <a href="mailto:info@esblu.com" className={emailLinkClass}>
            info@esblu.com
          </a>
          . Otázky o osobných údajoch pošlite na{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          .
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
