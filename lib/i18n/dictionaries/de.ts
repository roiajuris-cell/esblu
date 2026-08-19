// Esblu i18n — nemecký preklad. Štruktúra MUSÍ presne zodpovedať sk.ts
// (`satisfies typeof sk` nižšie to vynucuje na úrovni TypeScriptu).
import sk from "./sk";

const de = {
  common: {
    appName: "Esblu",
    buttons: {
      save: "Speichern",
      saveChanges: "Änderungen speichern",
      cancel: "Abbrechen",
      close: "Schließen",
      back: "Zurück",
      continue: "Weiter",
      confirm: "Bestätigen",
      delete: "Löschen",
      edit: "Bearbeiten",
      add: "Hinzufügen",
      login: "Anmelden",
      logout: "Abmelden",
      send: "Senden",
      retry: "Erneut versuchen",
      loading: "Wird geladen...",
      saving: "Wird gespeichert...",
    },
    roles: {
      owner: "Inhaber",
      admin: "Vollzugriff",
      employee: "Mitarbeiter",
    },
    misc: {
      yes: "Ja",
      no: "Nein",
      unknown: "Unbekannt",
      notFilled: "nicht angegeben",
      loadingPage: "Wird geladen...",
    },
    legalLinks: {
      privacy: "Datenschutz",
      terms: "Nutzungsbedingungen",
      cookies: "Cookies",
      dpa: "AVV (Auftragsverarbeitung für Firmen)",
      subprocessors: "Unterauftragsverarbeiter",
      contact: "Kontakt",
    },
  },

  nav: {
    dashboard: "Übersicht",
    inbox: "Posteingang",
    vehicles: "Fahrzeuge",
    machines: "Maschinen",
    inventory: "Lager",
    settings: "Einstellungen",
    logout: "Abmelden",
    language: "Sprache",
  },

  landing: {
    nav: {
      features: "Funktionen",
      freePlan: "Kostenloser Plan",
      contact: "Kontakt",
      login: "Anmelden",
    },
    hero: {
      badge: "Kostenlose Testversion",
      title:
        "Firmenverwaltung für Dokumente, Fahrzeuge, Maschinen und Lager an einem Ort.",
      subtitle:
        "Esblu hilft Bau- und Servicefirmen, Dokumente mit KI zu verarbeiten, Technik zu erfassen und Unternehmensdaten übersichtlich zu organisieren.",
      ctaPrimary: "Beta-Zugang anfragen",
      ctaSecondary: "Anmelden",
      betaNotice:
        "Esblu befindet sich derzeit in einer geschlossenen Betaphase — eine Neuregistrierung ist nur für freigegebene Tester möglich.",
      cardKicker: "Firmenverwaltung",
      cardTitle: "Alles Wichtige im Überblick",
      cardAiNote: "Weniger manuelles Abtippen von Dokumenten",
      moduleInboxDesc: "Dokumente",
      moduleVehiclesDesc: "Technische Daten",
      moduleMachinesDesc: "Firmentechnik",
      moduleInventoryDesc: "Artikel und Mengen",
    },
    features: {
      kicker: "Eine Anwendung, vier Bereiche",
      title: "Das kann Esblu",
      subtitle:
        "Die wichtigsten Firmenverwaltungen sind an einem Ort und über ein eigenes Benutzerkonto zugänglich.",
      inboxTitle: "Posteingang",
      inboxDesc:
        "Sie fotografieren oder laden ein unterstütztes Dokument hoch, und Esblu versucht, die verfügbaren Daten automatisch zu erkennen. Das Ergebnis prüfen und bestätigen Sie vor dem Speichern immer selbst.",
      inboxExample1: "Wiegescheine",
      inboxExample2: "Lieferscheine",
      inboxExample3: "Fahrzeugschein",
      vehiclesTitle: "Fahrzeuge",
      vehiclesDesc:
        "Erfassung von Fahrzeugen, technischen Daten, Dokumenten, Fotos und Serviceeinträgen.",
      machinesTitle: "Maschinen",
      machinesDesc:
        "Übersicht über Firmenmaschinen und -technik inklusive Grunddaten und Fotos.",
      inventoryTitle: "Lager",
      inventoryDesc: "Einfache Erfassung von Lagerartikeln, Mengen und Fotos.",
    },
    ai: {
      kicker: "KI-Verarbeitung",
      title: "Weniger manuelles Abtippen von Dokumenten",
      description:
        "Esblu kann bei unterstützten Dokumenten automatisch einige verfügbare Daten erkennen, z. B. Dokumentnummer, Datum, Kennzeichen, Material, Gewicht, Lieferant oder Kunde. Der Umfang der erkannten Daten hängt von Art und Qualität des Dokuments ab.",
      transparencyTitle: "KI-Transparenz",
      point1: "Esblu nutzt KI zur unterstützten Verarbeitung von Dokumenten.",
      point2: "Die KI kann Fehler machen.",
      point3:
        "Der Nutzer prüft und bestätigt die Daten vor der endgültigen Speicherung.",
      point4:
        "Esblu nutzt diese Funktion nicht für autonome Entscheidungen mit rechtlicher oder ähnlich bedeutender Wirkung.",
      warning:
        "Die KI-Ausgabe kann Fehler enthalten. Der Nutzer muss alle Daten vor dem Speichern oder der weiteren Verwendung prüfen.",
      privacyLink: "Datenschutzerklärung →",
      termsLink: "Nutzungsbedingungen →",
      step1: "Dokument hochladen oder fotografieren.",
      step2: "Erkannte Daten überprüfen.",
      step3: "Dokument in der Verwaltung speichern oder exportieren.",
    },
    audience: {
      kicker: "Praktische Verwaltung",
      title: "Für wen ist Esblu gedacht",
      description:
        "Esblu richtet sich vor allem an kleinere Bau-, Tiefbau-, Service-, Transport- und Technikfirmen, die Dokumente heute in Papierform, E-Mails, Fotos oder Tabellen erfassen.",
      example1: "Baufirmen",
      example2: "Firmen für Erdarbeiten und Glasfasernetze",
      example3: "Servicefirmen",
      example4: "kleinere Transportunternehmen",
      example5: "Firmen mit eigenen Fahrzeugen, Maschinen oder Lager",
    },
    freePlan: {
      kicker: "Kostenlos starten",
      title: "Testen Sie Esblu kostenlos",
      badge: "Kostenlose Testversion",
      price: "0 €",
      priceNote: "ohne Zahlungskarte",
      item1: "5 Dokumente im Posteingang",
      item2: "2 Fahrzeuge",
      item3: "2 Maschinen",
      item4: "5 Lagerartikel",
      item5: "1 Benutzerkonto",
      item6: "Export der verfügbaren Daten",
      cta: "Beta-Zugang anfragen",
      note: "Eine kostenpflichtige Version mit höheren Limits ist in Vorbereitung. Esblu befindet sich derzeit in einer geschlossenen Betaphase — neue Nutzer erhalten nach individueller Freigabe Zugang; die Registrierung für die kostenlose Version garantiert keinen bestimmten Preis oder Funktionsumfang der künftigen kostenpflichtigen Version.",
    },
    security: {
      kicker: "Vertrauen und Sicherheit",
      title: "Ihre Firmendaten bleiben getrennt",
      description:
        "Daten von Benutzerkonten werden in der Anwendung durch Zugriffsregeln getrennt. Die Übertragung zwischen Gerät und Dienst erfolgt verschlüsselt. Kein Online-System kann jedoch als absolut sicher bezeichnet werden.",
      point1: "Der Nutzer meldet sich mit seinem eigenen Konto an.",
      point2:
        "Einzelne Nutzer sollen keinen Zugriff auf die Daten anderer Konten haben.",
      point3:
        "Wichtige Originaldokumente und eigene Sicherungskopien sollte der Nutzer selbst aufbewahren.",
    },
    finalCta: {
      title: "Testen Sie, ob Esblu Ihre Firmenverwaltung vereinfacht.",
      description:
        "Esblu befindet sich derzeit in einer geschlossenen Betaphase. Schreiben Sie uns, und wir öffnen Ihnen nach Freigabe gerne kostenlosen Zugang.",
      ctaPrimary: "Beta-Zugang anfragen",
      ctaSecondary: "Ich habe bereits ein Konto",
    },
    footer: {
      tagline: "Kostenlose Testversion",
      privacy: "Datenschutz",
      terms: "Nutzungsbedingungen",
      cookies: "Cookies",
      dpa: "AVV",
      subprocessors: "Unterauftragsverarbeiter",
      contact: "Kontakt",
      login: "Anmeldung",
      copyright: "© {{year}} Esblu",
    },
  },

  auth: {
    login: {
      title: "Anmeldung",
      registerTitle: "Firma registrieren",
      subtitleLogin: "Melden Sie sich bei Esblu an.",
      subtitleRegister: "Erstellen Sie ein neues Konto für Ihre Firma.",
      email: "E-Mail",
      password: "Passwort",
      confirmPasswordPlaceholder: "Passwort bestätigen",
      submitLogin: "Anmelden",
      submitRegister: "Konto erstellen",
      working: "Wird bearbeitet...",
      switchToRegister: "Kein Konto? Firma registrieren",
      switchToLogin: "Bereits ein Konto? Anmelden",
      forgotPassword: "Passwort vergessen?",
      sendingResetLink: "Link wird gesendet...",
      accountDeletedShort: "Das Konto wurde gelöscht.",
      accountDeletedNotice:
        "Ihr Konto wurde erfolgreich gelöscht. Sie können sich jederzeit wieder registrieren, falls Sie es sich anders überlegen.",
      accountDeletedPartialNotice:
        "Die Löschung des Kontos konnte nicht vollständig abgeschlossen werden. Sie wurden aus Sicherheitsgründen abgemeldet — kontaktieren Sie bitte unseren Support unter info@esblu.com, wir prüfen und schließen die Löschung ab.",
      agreeTermsPrefix: "Ich stimme den",
      agreeTermsLink: "Nutzungsbedingungen",
      agreePrivacyPrefix: "Ich bestätige, die",
      agreePrivacyLink: "Datenschutzerklärung",
      accountCreatedImmediate: "Das Konto wurde erstellt. Sie sind jetzt angemeldet.",
      accountCreatedPendingConfirm:
        "Die Registrierung war erfolgreich. Bitte prüfen Sie Ihre E-Mail und bestätigen Sie die Registrierung.",
      validationInvalidEmail: "Geben Sie eine gültige E-Mail-Adresse ein.",
      validationMissingPassword: "Geben Sie ein Passwort ein.",
      validationPasswordTooShort: "Das Passwort muss mindestens 8 Zeichen haben.",
      validationPasswordMismatch: "Die Passwörter stimmen nicht überein.",
      validationMustAgreeLegal:
        "Vor der Registrierung müssen Sie den Nutzungsbedingungen zustimmen und bestätigen, dass Sie die Datenschutzerklärung gelesen haben.",
      loginFailed: "Die Anmeldung ist fehlgeschlagen. Überprüfen Sie E-Mail und Passwort.",
      registrationFailedPrefix: "Die Registrierung ist fehlgeschlagen: ",
    },
    closedBeta: {
      message:
        "Esblu befindet sich derzeit in einer geschlossenen Betaphase. Die Registrierung ist nur für freigegebene Beta-Tester möglich. Bei Interesse schreiben Sie uns an info@esblu.com.",
      registerNotice:
        "Esblu befindet sich derzeit in einer geschlossenen Betaphase. Die Registrierung einer neuen Firma ist nur für freigegebene Beta-Tester möglich. Wenn Sie freigegeben wurden, fahren Sie unten fort — andernfalls kontaktieren Sie uns unter info@esblu.com.",
    },
    resetPassword: {
      title: "Passwort zurücksetzen",
      requestTitle: "Passwort vergessen",
      newPassword: "Neues Passwort",
      confirmPassword: "Neues Passwort bestätigen",
      submit: "Link zum Zurücksetzen senden",
      submitNew: "Neues Passwort festlegen",
      success:
        "Der Link zum Zurücksetzen des Passworts wurde gesendet. Prüfen Sie auch den Spam-Ordner.",
      requestFailedPrefix: "Der Link zum Zurücksetzen konnte nicht gesendet werden: ",
      validationInvalidEmail: "Geben Sie zuerst eine gültige E-Mail-Adresse ein.",
    },
  },

  invite: {
    title: "Firmeneinladung",
    loading: "Einladung wird geladen...",
    invalidTitle: "Die Einladung ist nicht gültig",
    invalidDescription:
      "Dieser Einladungslink ist ungültig, wurde bereits verwendet oder ist abgelaufen. Bitten Sie den Firmeninhaber um eine neue Einladung.",
    goToLogin: "Zur Anmeldung",
    acceptedTitle: "Die Einladung wurde angenommen",
    acceptedRedirecting: "Sie werden zur Anwendung weitergeleitet...",
    invitedWithRole: "Sie wurden mit folgendem Zugriff eingeladen:",
    forEmail: "Diese Einladung ist für die E-Mail-Adresse bestimmt:",
    loggedInAs: "Sie sind angemeldet als",
    acceptButton: "Einladung annehmen",
    acceptingButton: "Einladung wird angenommen...",
    signOutAndSwitch: "Abmelden und mit anderem Konto anmelden",
    awaitingEmailConfirmation:
      "Bitte prüfen Sie Ihre E-Mail und bestätigen Sie die Registrierung. Kehren Sie danach zu diesem Link zurück und melden Sie sich an.",
    tabRegister: "Konto erstellen",
    tabLogin: "Ich habe bereits ein Konto",
    emailPlaceholder: "E-Mail-Adresse, an die die Einladung gesendet wurde",
    passwordPlaceholder: "Passwort",
    confirmPasswordPlaceholder: "Passwort bestätigen",
    submitRegister: "Konto erstellen und Einladung annehmen",
    submitLogin: "Anmelden und Einladung annehmen",
    working: "Wird bearbeitet...",
    validationInvalidEmail: "Geben Sie eine gültige E-Mail-Adresse ein.",
    validationPasswordTooShort: "Das Passwort muss mindestens 8 Zeichen haben.",
    validationPasswordMismatch: "Die Passwörter stimmen nicht überein.",
    validationMissingPassword: "Geben Sie ein Passwort ein.",
    registrationFailedPrefix: "Die Registrierung ist fehlgeschlagen: ",
    loginFailed: "Die Anmeldung ist fehlgeschlagen. Überprüfen Sie Ihr Passwort.",
  },

  legalGate: {
    title: "Aktualisierte rechtliche Dokumente",
    description:
      "Um Esblu weiter nutzen zu können, bestätigen Sie bitte die folgenden aktuellen Dokumente. Diese Bestätigung ist nur einmal erforderlich und ist an Ihr Konto gebunden.",
    agreeTermsPrefix: "Ich stimme den",
    agreeTermsLink: "Nutzungsbedingungen",
    termsVersionSuffix: "zu (Version {{version}}).",
    agreePrivacyPrefix: "Ich bestätige, die",
    agreePrivacyLink: "Datenschutzerklärung",
    privacyVersionSuffix: "gelesen zu haben (Version {{version}}).",
    submitError: "Die Bestätigung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    confirmButton: "Bestätigen und fortfahren",
    saving: "Wird gespeichert...",
    logout: "Abmelden",
  },

  footer: {
    contact: "Kontakt",
  },

  settings: {
    language: {
      title: "Sprache der Anwendung",
      description:
        "Die gewählte Sprache wird in Ihrem Konto gespeichert und auch bei der nächsten Anmeldung oder auf einem anderen Gerät verwendet.",
    },
  },

  legal: {
    updatedAtPrefix: "Letzte Aktualisierung:",
    backToLogin: "Zurück zur Anmeldung",
    titles: {
      terms: "Nutzungsbedingungen",
      privacy: "Datenschutz",
      cookies: "Cookies",
      dpa: "AVV",
      subprocessors: "Unterauftragsverarbeiter",
      contact: "Kontakt",
    },
    subprocessors: {
      introPart1:
        "Diese Liste enthält externe Dienstleister (Auftragsverarbeiter und weitere an der Verarbeitung beteiligte Personen), die Esblu derzeit einsetzt. Die Liste kann sich ändern — bei einer wesentlichen Änderung, die die Verarbeitung von durch Ihr Unternehmen hochgeladenen personenbezogenen Daten betrifft, können wir Sie vorab auf die im",
      introDpaLink: "AVV",
      sectionVendorsTitle: "Aktuelle Dienstleister",
      tableHeaderVendor: "Dienstleister",
      tableHeaderPurpose: "Zweck",
      tableHeaderDataCategories: "Datenkategorien",
      tableHeaderLocation: "Standort",
      tableHeaderDocs: "Dokumentation",
      supabasePurpose:
        "Datenbank, Authentifizierung, Dateispeicher (Fotos, Dokumente)",
      supabaseDataCategories: "Alle in der Anwendung verarbeiteten Daten",
      supabaseLocation:
        "TODO — Region des Supabase-Projekts muss noch bestätigt werden (EU/US)",
      openaiPurpose:
        "KI-Erkennung von Daten aus hochgeladenen Dokumenten und Fotos",
      openaiDataCategories:
        "Inhalt des zur Verarbeitung übermittelten Dokuments/Fotos",
      openaiLocation:
        "TODO — Verarbeitungsstandort gemäß OpenAI-API-Kontoeinstellung noch zu bestätigen",
      vercelPurpose: "Hosting und Betrieb der Anwendung",
      vercelDataCategories:
        "Für die Bereitstellung der Anwendung erforderliche technische Verbindungsdaten",
      vercelLocation: "TODO — Einsatzregion noch zu bestätigen",
      namecheapPurpose:
        "Hosting der geschäftlichen E-Mail-Kommunikation (Postfächer info@esblu.com und privacy@esblu.com — privacy@esblu.com ist ein Alias, das auf dasselbe Postfach verweist) und Empfang von E-Mail-Nachrichten von Nutzern, einschließlich Anliegen zu personenbezogenen Daten",
      namecheapDataCategories:
        "E-Mail-Adresse des Absenders, Inhalt der Nachricht und etwaige Anhänge",
      namecheapLocation:
        "USA (die Server von Namecheap befinden sich hauptsächlich in den USA) — der genaue Standort des konkreten Postfachs ist nicht bestätigt. Der Namecheap-AVV enthält Standardvertragsklauseln (SCC einschließlich UK Addendum) als Mechanismus für internationale Übermittlungen.",
      sectionEmailHistoryTitle:
        "E-Mail-Kommunikation — Historie und aktueller Stand",
      emailHistoryPara1:
        "Die vorherige Version der Datenschutzerklärung (Version 1.0) führte unter den Dienstleistern auch Resend und Namecheap Private Email mit der Beschreibung „Versand ausgewählter E-Mails“ auf. Eine detaillierte Prüfung der Anwendung hat dies mit der Realität abgeglichen:",
      emailHistoryResendLabel: "Resend",
      emailHistoryResendText:
        "wird von der Anwendung nirgends eingesetzt — Esblu betreibt keine eigene E-Mail-Versandinfrastruktur; kontobezogene Transaktions-E-Mails (Registrierungsbestätigung, Passwort-Wiederherstellung) werden ausschließlich vom integrierten E-Mail-System von Supabase Auth versendet. Resend wird daher in der obigen Tabelle nicht aufgeführt.",
      emailHistoryNamecheapLabel: "Namecheap Private Email",
      emailHistoryNamecheapText:
        "wird tatsächlich genutzt, jedoch anders als im ursprünglichen Text beschrieben: Es handelt sich nicht um die Versandinfrastruktur der Anwendung, sondern um das Hosting der Postfächer info@esblu.com und privacy@esblu.com, über die Sie uns direkt kontaktieren können (z. B. mit einem Anliegen zu personenbezogenen Daten). Namecheap ist daher jetzt mit einer präzisen, verifizierten Beschreibung seiner Rolle in der obigen Tabelle aufgeführt.",
      sectionChangesTitle: "Änderungen der Liste",
      changesText:
        "Die aktuelle Version dieser Liste gilt seit dem {{date}}. Wir können die Liste bei Änderungen der technischen Infrastruktur von Esblu aktualisieren.",
    },
    contactPage: {
      intro:
        "Esblu ist eine kostenlose Testversion eines Dienstes zur Firmenerfassung. Verantwortlicher ist Jaroslav Juriš, Slowakische Republik.",
      generalTitle: "Allgemeine Fragen und Support",
      generalText: "Schreiben Sie uns an",
      privacyTitle: "Datenschutz",
      privacyText:
        "Anfragen und Fragen zu personenbezogenen Daten senden Sie bitte an",
      supportNote:
        "Beschreiben Sie bei einer Support-Anfrage das Problem so genau wie möglich. Senden Sie kein Passwort und keine anderen Zugangsdaten per E-Mail.",
    },
  },
} satisfies typeof sk;

export default de;
