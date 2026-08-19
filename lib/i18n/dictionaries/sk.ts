// Esblu i18n — zdrojový (slovenský) slovník. DE/EN slovníky (de.ts, en.ts)
// musia štrukturálne zodpovedať presne tomuto tvaru — `satisfies Dictionary`
// pri ich definícii to vynúti na úrovni TypeScriptu (chýbajúci/naviac kľúč =
// chyba pri builde, nie tichá medzera za behu).
import type { Dictionary } from "../dictionary-types";

const sk = {
  common: {
    appName: "Esblu",
    buttons: {
      save: "Uložiť",
      saveChanges: "Uložiť zmeny",
      cancel: "Zrušiť",
      close: "Zavrieť",
      back: "Späť",
      continue: "Pokračovať",
      confirm: "Potvrdiť",
      delete: "Vymazať",
      edit: "Upraviť",
      add: "Pridať",
      login: "Prihlásiť sa",
      logout: "Odhlásiť sa",
      send: "Odoslať",
      retry: "Skúsiť znova",
      loading: "Načítavam...",
      saving: "Ukladám...",
    },
    roles: {
      owner: "Majiteľ",
      admin: "Plný prístup",
      employee: "Zamestnanec",
    },
    misc: {
      yes: "Áno",
      no: "Nie",
      unknown: "Neznáme",
      notFilled: "nedoplnené",
      loadingPage: "Načítavam...",
    },
    legalLinks: {
      privacy: "Ochrana osobných údajov",
      terms: "Podmienky používania",
      cookies: "Cookies",
      dpa: "DPA (spracúvanie pre firmy)",
      subprocessors: "Sprostredkovatelia",
      contact: "Kontakt",
    },
  },

  nav: {
    dashboard: "Nástenka",
    inbox: "Inbox",
    vehicles: "Vozidlá",
    machines: "Stroje",
    inventory: "Sklad",
    settings: "Nastavenia",
    logout: "Odhlásiť sa",
    language: "Jazyk",
  },

  landing: {
    nav: {
      features: "Funkcie",
      freePlan: "Bezplatný plán",
      contact: "Kontakt",
      login: "Prihlásiť sa",
    },
    hero: {
      badge: "Bezplatná testovacia verzia",
      title:
        "Firemná evidencia dokumentov, vozidiel, strojov a skladu na jednom mieste.",
      subtitle:
        "Esblu pomáha stavebným a servisným firmám spracovať dokumenty pomocou AI, evidovať techniku a udržať firemné údaje prehľadne usporiadané.",
      ctaPrimary: "Požiadať o beta prístup",
      ctaSecondary: "Prihlásiť sa",
      betaNotice:
        "Esblu je momentálne v uzavretej beta verzii — nová registrácia je dostupná iba pre schválených testerov.",
      cardKicker: "Firemná evidencia",
      cardTitle: "Všetko dôležité prehľadne",
      cardAiNote: "Menej ručného prepisovania dokumentov",
      moduleInboxDesc: "Dokumenty",
      moduleVehiclesDesc: "Technické údaje",
      moduleMachinesDesc: "Firemná technika",
      moduleInventoryDesc: "Položky a množstvo",
    },
    features: {
      kicker: "Jedna aplikácia, štyri prehľady",
      title: "Čo Esblu dokáže",
      subtitle:
        "Základné firemné evidencie sú na jednom mieste a dostupné pod vlastným používateľským účtom.",
      inboxTitle: "Inbox",
      inboxDesc:
        "Odfotíte alebo nahráte podporovaný dokument a Esblu sa z neho pokúsi automaticky načítať dostupné údaje. Výsledok pred uložením vždy skontrolujete a potvrdíte.",
      inboxExample1: "vážne lístky",
      inboxExample2: "dodacie listy",
      inboxExample3: "technický preukaz",
      vehiclesTitle: "Vozidlá",
      vehiclesDesc:
        "Evidencia vozidiel, technických údajov, dokumentov, fotografií a servisných záznamov.",
      machinesTitle: "Stroje",
      machinesDesc:
        "Prehľad firemných strojov a techniky vrátane základných údajov a fotografií.",
      inventoryTitle: "Sklad",
      inventoryDesc:
        "Jednoduchá evidencia skladových položiek, množstva a fotografií.",
    },
    ai: {
      kicker: "AI spracovanie",
      title: "Menej ručného prepisovania dokumentov",
      description:
        "Esblu dokáže pri podporovaných dokumentoch automaticky rozpoznať niektoré dostupné údaje, napríklad číslo dokumentu, dátum, SPZ, materiál, hmotnosť, dodávateľa alebo zákazníka. Rozsah rozpoznaných údajov závisí od typu a kvality dokumentu.",
      transparencyTitle: "AI transparentnosť",
      point1: "Esblu používa AI na asistované spracovanie dokumentov.",
      point2: "AI môže urobiť chybu.",
      point3: "Používateľ údaje pred finálnym uložením kontroluje a potvrdzuje.",
      point4:
        "Esblu nepoužíva túto funkciu na autonómne rozhodovanie s právnymi alebo obdobne významnými účinkami.",
      warning:
        "AI výstup môže obsahovať chyby. Používateľ musí všetky údaje pred uložením alebo ďalším použitím skontrolovať.",
      privacyLink: "Zásady ochrany osobných údajov →",
      termsLink: "Podmienky používania →",
      step1: "Nahrajte alebo odfoťte dokument.",
      step2: "Skontrolujte rozpoznané údaje.",
      step3: "Uložte dokument do evidencie alebo ho exportujte.",
    },
    audience: {
      kicker: "Praktická evidencia",
      title: "Pre koho je Esblu určené",
      description:
        "Esblu je určené najmä pre menšie stavebné, výkopové, servisné, dopravné a technické firmy, ktoré dnes evidujú dokumenty v papieroch, správach, fotografiách alebo tabuľkách.",
      example1: "stavebné firmy",
      example2: "firmy vykonávajúce výkopy a optické siete",
      example3: "servisné firmy",
      example4: "menšie dopravné firmy",
      example5: "firmy s vlastnými vozidlami, strojmi alebo skladom",
    },
    freePlan: {
      kicker: "Začnite bez platby",
      title: "Vyskúšajte Esblu zdarma",
      badge: "Bezplatná testovacia verzia",
      price: "0 €",
      priceNote: "bez platobnej karty",
      item1: "5 dokumentov v Inboxe",
      item2: "2 vozidlá",
      item3: "2 stroje",
      item4: "5 skladových položiek",
      item5: "1 používateľský účet",
      item6: "export dostupných údajov",
      cta: "Požiadať o beta prístup",
      note: "Platená verzia s vyššími limitmi sa pripravuje. Esblu je momentálne v uzavretej beta verzii — noví používatelia sa do nej dostanú po individuálnom schválení, registrácia do bezplatnej verzie nezaručuje konkrétnu cenu ani funkcie budúcej platenej verzie.",
    },
    security: {
      kicker: "Dôvera a bezpečnosť",
      title: "Vaše firemné údaje zostávajú oddelené",
      description:
        "Údaje používateľských účtov sú v aplikácii oddelené pomocou prístupových pravidiel. Prenos medzi zariadením a službou prebieha šifrovane. Žiadny online systém však nemožno označiť za absolútne bezpečný.",
      point1: "Používateľ sa prihlasuje vlastným účtom.",
      point2: "Jednotliví používatelia nemajú mať prístup k údajom iných účtov.",
      point3:
        "Dôležité originály dokumentov a vlastné zálohy si má používateľ ponechať.",
    },
    finalCta: {
      title: "Vyskúšajte, či vám Esblu zjednoduší firemnú evidenciu.",
      description:
        "Esblu je momentálne v uzavretej beta verzii. Napíšte nám a po schválení vám radi otvoríme prístup zdarma.",
      ctaPrimary: "Požiadať o beta prístup",
      ctaSecondary: "Už mám účet",
    },
    footer: {
      tagline: "Bezplatná testovacia verzia",
      privacy: "Ochrana osobných údajov",
      terms: "Podmienky používania",
      cookies: "Cookies",
      dpa: "DPA",
      subprocessors: "Sprostredkovatelia",
      contact: "Kontakt",
      login: "Prihlásenie",
      copyright: "© {{year}} Esblu",
    },
  },

  auth: {
    login: {
      title: "Prihlásenie",
      registerTitle: "Registrácia firmy",
      subtitleLogin: "Prihlás sa do aplikácie Esblu.",
      subtitleRegister: "Vytvor nový účet pre svoju firmu.",
      email: "E-mail",
      password: "Heslo",
      confirmPasswordPlaceholder: "Potvrdenie hesla",
      submitLogin: "Prihlásiť sa",
      submitRegister: "Vytvoriť účet",
      working: "Pracujem...",
      switchToRegister: "Nemáš účet? Registrovať firmu",
      switchToLogin: "Už máš účet? Prihlásiť sa",
      forgotPassword: "Zabudol si heslo?",
      sendingResetLink: "Odosielam odkaz...",
      accountDeletedShort: "Účet bol zrušený.",
      accountDeletedNotice:
        "Váš účet bol úspešne zrušený. Ak si to rozmyslíte, môžete sa kedykoľvek zaregistrovať znova.",
      accountDeletedPartialNotice:
        "Zrušenie účtu sa nepodarilo úplne dokončiť. Odhlásili sme ťa z bezpečnostných dôvodov — kontaktuj prosím podporu na info@esblu.com, overíme a dokončíme zrušenie účtu.",
      agreeTermsPrefix: "Súhlasím s",
      agreeTermsLink: "Podmienkami používania",
      agreePrivacyPrefix: "Potvrdzujem, že som sa oboznámil/a so",
      agreePrivacyLink: "Zásadami ochrany osobných údajov",
      accountCreatedImmediate: "Účet bol vytvorený. Teraz si prihlásený.",
      accountCreatedPendingConfirm:
        "Registrácia prebehla úspešne. Skontroluj svoj e-mail a potvrď registráciu.",
      validationInvalidEmail: "Zadaj platnú e-mailovú adresu.",
      validationMissingPassword: "Zadaj heslo.",
      validationPasswordTooShort: "Heslo musí mať minimálne 8 znakov.",
      validationPasswordMismatch: "Heslá sa nezhodujú.",
      validationMustAgreeLegal:
        "Pred registráciou musíš súhlasiť s Podmienkami používania a potvrdiť oboznámenie sa so Zásadami ochrany osobných údajov.",
      loginFailed: "Prihlásenie sa nepodarilo. Skontroluj e-mail a heslo.",
      registrationFailedPrefix: "Registrácia sa nepodarila: ",
    },
    closedBeta: {
      message:
        "Esblu je momentálne v uzavretej beta verzii. Registrácia je dostupná iba pre schválených beta testerov. Ak máte záujem, napíšte nám na info@esblu.com.",
      registerNotice:
        "Esblu je momentálne v uzavretej beta verzii. Registrácia novej firmy je dostupná iba pre schválených beta testerov. Ak máte schválený prístup, pokračujte nižšie — inak nás kontaktujte na info@esblu.com.",
    },
    resetPassword: {
      title: "Obnovenie hesla",
      requestTitle: "Zabudnuté heslo",
      newPassword: "Nové heslo",
      confirmPassword: "Potvrďte nové heslo",
      submit: "Odoslať odkaz na obnovenie",
      submitNew: "Nastaviť nové heslo",
      success:
        "Odkaz na vytvorenie nového hesla bol odoslaný. Skontroluj aj priečinok Spam.",
      requestFailedPrefix: "E-mail na obnovu hesla sa nepodarilo odoslať: ",
      validationInvalidEmail: "Najprv zadaj platnú e-mailovú adresu.",
    },
  },

  invite: {
    title: "Pozvánka do firmy",
    loading: "Načítavam pozvánku...",
    invalidTitle: "Pozvánka nie je platná",
    invalidDescription:
      "Tento odkaz na pozvánku je neplatný, bol už použitý, alebo jeho platnosť vypršala. Požiadajte majiteľa firmy o novú pozvánku.",
    goToLogin: "Prejsť na prihlásenie",
    acceptedTitle: "Pozvánka bola prijatá",
    acceptedRedirecting: "Presmerúvam ťa do aplikácie...",
    invitedWithRole: "Boli ste pozvaní s prístupom typu",
    forEmail: "Táto pozvánka je určená pre e-mail v tvare",
    loggedInAs: "Si prihlásený ako",
    acceptButton: "Prijať pozvánku",
    acceptingButton: "Prijímam pozvánku...",
    signOutAndSwitch: "Odhlásiť sa a prihlásiť iným účtom",
    awaitingEmailConfirmation:
      "Skontroluj svoj e-mail a potvrď registráciu. Následne sa vráť na tento odkaz a prihlás sa.",
    tabRegister: "Vytvoriť účet",
    tabLogin: "Už mám účet",
    emailPlaceholder: "E-mail, na ktorý bola pozvánka odoslaná",
    passwordPlaceholder: "Heslo",
    confirmPasswordPlaceholder: "Potvrdenie hesla",
    submitRegister: "Vytvoriť účet a prijať pozvánku",
    submitLogin: "Prihlásiť sa a prijať pozvánku",
    working: "Pracujem...",
    validationInvalidEmail: "Zadaj platnú e-mailovú adresu.",
    validationPasswordTooShort: "Heslo musí mať minimálne 8 znakov.",
    validationPasswordMismatch: "Heslá sa nezhodujú.",
    validationMissingPassword: "Zadajte heslo.",
    registrationFailedPrefix: "Registrácia sa nepodarila: ",
    loginFailed: "Prihlásenie sa nepodarilo. Skontroluj heslo.",
  },

  legalGate: {
    title: "Aktualizované právne dokumenty",
    description:
      "Aby ste mohli pokračovať v používaní Esblu, potvrďte prosím nasledujúce aktuálne dokumenty. Toto potvrdenie je potrebné iba raz a je viazané na váš účet.",
    agreeTermsPrefix: "Súhlasím s",
    agreeTermsLink: "Podmienkami používania",
    termsVersionSuffix: "(verzia {{version}}).",
    agreePrivacyPrefix: "Potvrdzujem, že som sa oboznámil/a so",
    agreePrivacyLink: "Zásadami ochrany osobných údajov",
    privacyVersionSuffix: "(verzia {{version}}).",
    submitError: "Potvrdenie sa nepodarilo uložiť. Skús to prosím znova.",
    confirmButton: "Potvrdiť a pokračovať",
    saving: "Ukladám...",
    logout: "Odhlásiť sa",
  },

  footer: {
    contact: "Kontakt",
  },

  settings: {
    language: {
      title: "Jazyk aplikácie",
      description:
        "Zvolený jazyk sa uloží do vášho účtu a použije sa aj pri ďalšom prihlásení, prípadne na inom zariadení.",
    },
  },

  legal: {
    updatedAtPrefix: "Posledná aktualizácia:",
    backToLogin: "Späť na prihlásenie",
    titles: {
      terms: "Podmienky používania",
      privacy: "Ochrana osobných údajov",
      cookies: "Cookies",
      dpa: "DPA",
      subprocessors: "Sprostredkovatelia",
      contact: "Kontakt",
    },
    subprocessors: {
      introPart1:
        "Tento zoznam uvádza externých dodávateľov (sprostredkovateľov a ďalšie osoby zapojené do spracúvania), ktorých Esblu aktuálne využíva. Zoznam sa môže meniť — pri podstatnej zmene, ktorá sa týka spracúvania osobných údajov nahratých vašou firmou, vás môžeme vopred informovať spôsobom dohodnutým v",
      introDpaLink: "DPA",
      sectionVendorsTitle: "Aktuálni dodávatelia",
      tableHeaderVendor: "Dodávateľ",
      tableHeaderPurpose: "Účel",
      tableHeaderDataCategories: "Kategórie údajov",
      tableHeaderLocation: "Lokalita",
      tableHeaderDocs: "Dokumentácia",
      supabasePurpose:
        "Databáza, autentifikácia, úložisko súborov (fotografie, dokumenty)",
      supabaseDataCategories: "Všetky údaje spracúvané v aplikácii",
      supabaseLocation: "TODO — región Supabase projektu treba potvrdiť (EÚ/US)",
      openaiPurpose: "AI rozpoznávanie údajov z nahraných dokumentov a fotografií",
      openaiDataCategories:
        "Obsah nahraného dokumentu/fotografie odoslaný na spracovanie",
      openaiLocation:
        "TODO — potvrdiť spracovateľskú lokalitu podľa OpenAI API nastavenia účtu",
      vercelPurpose: "Hosting a prevádzka aplikácie",
      vercelDataCategories:
        "Technické dáta spojenia potrebné na doručenie aplikácie",
      vercelLocation: "TODO — potvrdiť región nasadenia",
      namecheapPurpose:
        "Hosting firemnej e-mailovej komunikácie (schránky info@esblu.com a privacy@esblu.com — privacy@esblu.com je alias smerujúci do tej istej schránky) a prijímanie e-mailových správ od používateľov, vrátane žiadostí týkajúcich sa osobných údajov",
      namecheapDataCategories:
        "E-mailová adresa odosielateľa, obsah správy a prípadné prílohy",
      namecheapLocation:
        "USA (servery Namecheapu sú primárne v USA) — presná lokalita konkrétnej schránky nepotvrdená. Namecheap DPA obsahuje štandardné zmluvné doložky (SCC vrátane UK Addendum) ako mechanizmus medzinárodného prenosu.",
      sectionEmailHistoryTitle:
        "E-mailová komunikácia — história a aktuálny stav",
      emailHistoryPara1:
        "Predchádzajúca verzia Zásad ochrany osobných údajov (verzia 1.0) uvádzala medzi dodávateľmi aj Resend a Namecheap Private Email s opisom „odosielanie vybraných e-mailov“. Podrobná kontrola aplikácie toto overila voči realite:",
      emailHistoryResendLabel: "Resend",
      emailHistoryResendText:
        "nie je aplikáciou nikde použitý — Esblu neprevádzkuje vlastnú odosielaciu e-mailovú infraštruktúru, transakčné e-maily súvisiace s účtom (potvrdenie registrácie, obnova hesla) odosiela výhradne vstavaný e-mailový systém Supabase Auth. Resend preto v tabuľke vyššie nie je uvedený.",
      emailHistoryNamecheapLabel: "Namecheap Private Email",
      emailHistoryNamecheapText:
        "sa reálne používa, ale inak, než pôvodný text opisoval: nejde o odosielaciu infraštruktúru aplikácie, ale o hosting schránok info@esblu.com a privacy@esblu.com, na ktoré nás môžete priamo kontaktovať (napr. so žiadosťou týkajúcou sa osobných údajov). Namecheap preto teraz figuruje v tabuľke vyššie s presným, overeným popisom svojej úlohy.",
      sectionChangesTitle: "Zmeny zoznamu",
      changesText:
        "Aktuálna verzia tohto zoznamu platí od {{date}}. Zoznam môžeme aktualizovať pri zmene technickej infraštruktúry Esblu.",
    },
    contactPage: {
      intro:
        "Esblu je bezplatná testovacia verzia služby na firemnú evidenciu. Prevádzkovateľom je Jaroslav Juriš, Slovenská republika.",
      generalTitle: "Všeobecné otázky a podpora",
      generalText: "Napíšte nám na",
      privacyTitle: "Ochrana osobných údajov",
      privacyText: "Žiadosti a otázky týkajúce sa osobných údajov pošlite na",
      supportNote:
        "Pri žiadosti o podporu opíšte problém čo najpresnejšie. Do e-mailu neposielajte heslo ani iné prihlasovacie údaje.",
    },
  },
} satisfies Dictionary;

export default sk;
