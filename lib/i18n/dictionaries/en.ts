// Esblu i18n — English translation. Structure MUST exactly match sk.ts
// (`satisfies typeof sk` below enforces this at the TypeScript level).
import sk from "./sk";

const en = {
  common: {
    appName: "Esblu",
    buttons: {
      save: "Save",
      saveChanges: "Save changes",
      cancel: "Cancel",
      close: "Close",
      back: "Back",
      continue: "Continue",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      add: "Add",
      login: "Log in",
      logout: "Log out",
      send: "Send",
      retry: "Try again",
      loading: "Loading...",
      saving: "Saving...",
    },
    roles: {
      owner: "Owner",
      admin: "Full access",
      employee: "Employee",
    },
    misc: {
      yes: "Yes",
      no: "No",
      unknown: "Unknown",
      notFilled: "not filled in",
      loadingPage: "Loading...",
    },
    legalLinks: {
      privacy: "Privacy Policy",
      terms: "Terms of Use",
      cookies: "Cookies",
      dpa: "DPA (processing for companies)",
      subprocessors: "Subprocessors",
      contact: "Contact",
    },
  },

  nav: {
    dashboard: "Dashboard",
    inbox: "Inbox",
    vehicles: "Vehicles",
    machines: "Machines",
    inventory: "Inventory",
    settings: "Settings",
    logout: "Log out",
    language: "Language",
  },

  landing: {
    nav: {
      features: "Features",
      freePlan: "Free plan",
      contact: "Contact",
      login: "Log in",
    },
    hero: {
      badge: "Free trial",
      title:
        "Company records for documents, vehicles, machines and inventory in one place.",
      subtitle:
        "Esblu helps construction and service companies process documents with AI, keep track of their equipment, and keep company data clearly organized.",
      ctaPrimary: "Request beta access",
      ctaSecondary: "Log in",
      betaNotice:
        "Esblu is currently in closed beta — new registrations are only available to approved testers.",
      cardKicker: "Company records",
      cardTitle: "Everything important, at a glance",
      cardAiNote: "Less manual retyping of documents",
      moduleInboxDesc: "Documents",
      moduleVehiclesDesc: "Technical data",
      moduleMachinesDesc: "Company equipment",
      moduleInventoryDesc: "Items and quantities",
    },
    features: {
      kicker: "One app, four workspaces",
      title: "What Esblu can do",
      subtitle:
        "The core company records are in one place and available under your own user account.",
      inboxTitle: "Inbox",
      inboxDesc:
        "Photograph or upload a supported document and Esblu will try to automatically read the available data from it. You always review and confirm the result before it is saved.",
      inboxExample1: "weigh tickets",
      inboxExample2: "delivery notes",
      inboxExample3: "vehicle registration certificate",
      vehiclesTitle: "Vehicles",
      vehiclesDesc:
        "Records of vehicles, technical data, documents, photos and service history.",
      machinesTitle: "Machines",
      machinesDesc:
        "Overview of company machines and equipment, including basic data and photos.",
      inventoryTitle: "Inventory",
      inventoryDesc: "Simple tracking of inventory items, quantities and photos.",
    },
    ai: {
      kicker: "AI processing",
      title: "Less manual retyping of documents",
      description:
        "For supported documents, Esblu can automatically recognize some of the available data, such as document number, date, license plate, material, weight, supplier or customer. The scope of recognized data depends on the type and quality of the document.",
      transparencyTitle: "AI transparency",
      point1: "Esblu uses AI to assist with document processing.",
      point2: "AI can make mistakes.",
      point3: "The user reviews and confirms the data before it is finally saved.",
      point4:
        "Esblu does not use this feature for autonomous decisions with legal or similarly significant effects.",
      warning:
        "AI output may contain errors. The user must review all data before saving or further use.",
      privacyLink: "Privacy Policy →",
      termsLink: "Terms of Use →",
      step1: "Upload or photograph the document.",
      step2: "Review the recognized data.",
      step3: "Save the document to your records or export it.",
    },
    audience: {
      kicker: "Practical record-keeping",
      title: "Who Esblu is for",
      description:
        "Esblu is designed mainly for smaller construction, excavation, service, transport and technical companies that today keep records on paper, in reports, photos or spreadsheets.",
      example1: "construction companies",
      example2: "excavation and fiber-optic network companies",
      example3: "service companies",
      example4: "smaller transport companies",
      example5: "companies with their own vehicles, machines or inventory",
    },
    freePlan: {
      kicker: "Start for free",
      title: "Try Esblu for free",
      badge: "Free trial",
      price: "€0",
      priceNote: "no payment card required",
      item1: "5 documents in the Inbox",
      item2: "2 vehicles",
      item3: "2 machines",
      item4: "5 inventory items",
      item5: "1 user account",
      item6: "export of available data",
      cta: "Request beta access",
      note: "A paid plan with higher limits is in preparation. Esblu is currently in closed beta — new users gain access after individual approval; registering for the free version does not guarantee a specific price or feature set for the future paid version.",
    },
    security: {
      kicker: "Trust and security",
      title: "Your company data stays separated",
      description:
        "User account data is separated within the application using access rules. Transmission between your device and the service is encrypted. However, no online system can be described as absolutely secure.",
      point1: "Users log in with their own account.",
      point2: "Individual users should not have access to other accounts' data.",
      point3:
        "Users should keep important original documents and their own backups themselves.",
    },
    finalCta: {
      title: "See if Esblu can simplify your company records.",
      description:
        "Esblu is currently in closed beta. Write to us and we'll be happy to open free access for you once approved.",
      ctaPrimary: "Request beta access",
      ctaSecondary: "I already have an account",
    },
    footer: {
      tagline: "Free trial",
      privacy: "Privacy Policy",
      terms: "Terms of Use",
      cookies: "Cookies",
      dpa: "DPA",
      subprocessors: "Subprocessors",
      contact: "Contact",
      login: "Log in",
      copyright: "© {{year}} Esblu",
    },
  },

  auth: {
    login: {
      title: "Log in",
      registerTitle: "Register a company",
      subtitleLogin: "Log in to Esblu.",
      subtitleRegister: "Create a new account for your company.",
      email: "Email",
      password: "Password",
      confirmPasswordPlaceholder: "Confirm password",
      submitLogin: "Log in",
      submitRegister: "Create account",
      working: "Working...",
      switchToRegister: "Don't have an account? Register a company",
      switchToLogin: "Already have an account? Log in",
      forgotPassword: "Forgot your password?",
      sendingResetLink: "Sending link...",
      accountDeletedShort: "The account has been deleted.",
      accountDeletedNotice:
        "Your account has been successfully deleted. You can register again at any time if you change your mind.",
      accountDeletedPartialNotice:
        "Deleting the account could not be fully completed. You have been logged out for security reasons — please contact our support at info@esblu.com, we will verify and complete the deletion.",
      agreeTermsPrefix: "I agree to the",
      agreeTermsLink: "Terms of Use",
      agreePrivacyPrefix: "I confirm that I have read the",
      agreePrivacyLink: "Privacy Policy",
      accountCreatedImmediate: "Your account has been created. You are now logged in.",
      accountCreatedPendingConfirm:
        "Registration was successful. Please check your email and confirm your registration.",
      validationInvalidEmail: "Enter a valid email address.",
      validationMissingPassword: "Enter a password.",
      validationPasswordTooShort: "The password must be at least 8 characters long.",
      validationPasswordMismatch: "The passwords do not match.",
      validationMustAgreeLegal:
        "Before registering, you must agree to the Terms of Use and confirm that you have read the Privacy Policy.",
      loginFailed: "Login failed. Check your email and password.",
      registrationFailedPrefix: "Registration failed: ",
    },
    closedBeta: {
      message:
        "Esblu is currently in closed beta. Registration is only available to approved beta testers. If you're interested, write to us at info@esblu.com.",
      registerNotice:
        "Esblu is currently in closed beta. Registering a new company is only available to approved beta testers. If you have been approved, continue below — otherwise contact us at info@esblu.com.",
    },
    resetPassword: {
      title: "Reset password",
      requestTitle: "Forgot password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      submit: "Send reset link",
      submitNew: "Set new password",
      success:
        "A link to set a new password has been sent. Please also check your spam folder.",
      requestFailedPrefix: "The password reset email could not be sent: ",
      validationInvalidEmail: "Enter a valid email address first.",
    },
  },

  invite: {
    title: "Company invitation",
    loading: "Loading invitation...",
    invalidTitle: "This invitation is not valid",
    invalidDescription:
      "This invitation link is invalid, has already been used, or has expired. Ask the company owner for a new invitation.",
    goToLogin: "Go to login",
    acceptedTitle: "Invitation accepted",
    acceptedRedirecting: "Redirecting you to the app...",
    invitedWithRole: "You have been invited with the following access:",
    forEmail: "This invitation is intended for the email address:",
    loggedInAs: "You are logged in as",
    acceptButton: "Accept invitation",
    acceptingButton: "Accepting invitation...",
    signOutAndSwitch: "Log out and sign in with a different account",
    awaitingEmailConfirmation:
      "Please check your email and confirm your registration. Then return to this link and log in.",
    tabRegister: "Create account",
    tabLogin: "I already have an account",
    emailPlaceholder: "Email the invitation was sent to",
    passwordPlaceholder: "Password",
    confirmPasswordPlaceholder: "Confirm password",
    submitRegister: "Create account and accept invitation",
    submitLogin: "Log in and accept invitation",
    working: "Working...",
    validationInvalidEmail: "Enter a valid email address.",
    validationPasswordTooShort: "The password must be at least 8 characters long.",
    validationPasswordMismatch: "The passwords do not match.",
    validationMissingPassword: "Enter a password.",
    registrationFailedPrefix: "Registration failed: ",
    loginFailed: "Login failed. Check your password.",
  },

  legalGate: {
    title: "Updated legal documents",
    description:
      "To continue using Esblu, please confirm the following current documents. This confirmation is only needed once and is tied to your account.",
    agreeTermsPrefix: "I agree to the",
    agreeTermsLink: "Terms of Use",
    termsVersionSuffix: "(version {{version}}).",
    agreePrivacyPrefix: "I confirm that I have read the",
    agreePrivacyLink: "Privacy Policy",
    privacyVersionSuffix: "(version {{version}}).",
    submitError: "The confirmation could not be saved. Please try again.",
    confirmButton: "Confirm and continue",
    saving: "Saving...",
    logout: "Log out",
  },

  footer: {
    contact: "Contact",
  },

  settings: {
    language: {
      title: "Application language",
      description:
        "The selected language is saved to your account and will also be used the next time you log in, or on another device.",
    },
  },

  legal: {
    updatedAtPrefix: "Last updated:",
    backToLogin: "Back to login",
    titles: {
      terms: "Terms of Use",
      privacy: "Privacy Policy",
      cookies: "Cookies",
      dpa: "DPA",
      subprocessors: "Subprocessors",
      contact: "Contact",
    },
    subprocessors: {
      introPart1:
        "This list sets out the external providers (processors and other persons involved in processing) that Esblu currently uses. The list may change — in the event of a material change affecting the processing of personal data uploaded by your company, we may notify you in advance in the manner agreed in the",
      introDpaLink: "DPA",
      sectionVendorsTitle: "Current providers",
      tableHeaderVendor: "Provider",
      tableHeaderPurpose: "Purpose",
      tableHeaderDataCategories: "Data categories",
      tableHeaderLocation: "Location",
      tableHeaderDocs: "Documentation",
      supabasePurpose:
        "Database, authentication, file storage (photos, documents)",
      supabaseDataCategories: "All data processed within the application",
      supabaseLocation:
        "TODO — the region of the Supabase project still needs to be confirmed (EU/US)",
      openaiPurpose:
        "AI recognition of data from uploaded documents and photos",
      openaiDataCategories:
        "Content of the document/photo submitted for processing",
      openaiLocation:
        "TODO — processing location to be confirmed based on the OpenAI API account configuration",
      vercelPurpose: "Hosting and operation of the application",
      vercelDataCategories:
        "Technical connection data required to deliver the application",
      vercelLocation: "TODO — deployment region to be confirmed",
      namecheapPurpose:
        "Hosting of business email communication (the info@esblu.com and privacy@esblu.com mailboxes — privacy@esblu.com is an alias pointing to the same mailbox) and receipt of email messages from users, including requests concerning personal data",
      namecheapDataCategories:
        "Sender's email address, message content, and any attachments",
      namecheapLocation:
        "USA (Namecheap's servers are primarily located in the USA) — the exact location of the specific mailbox is not confirmed. Namecheap's DPA includes standard contractual clauses (SCCs, including the UK Addendum) as an international transfer mechanism.",
      sectionEmailHistoryTitle:
        "Email communication — history and current status",
      emailHistoryPara1:
        "The previous version of the Privacy Policy (version 1.0) also listed Resend and Namecheap Private Email among the providers, described as \"sending selected emails.\" A detailed review of the application verified this against reality:",
      emailHistoryResendLabel: "Resend",
      emailHistoryResendText:
        "is not used anywhere in the application — Esblu does not operate its own outbound email infrastructure; account-related transactional emails (registration confirmation, password recovery) are sent exclusively by Supabase Auth's built-in email system. Resend is therefore not listed in the table above.",
      emailHistoryNamecheapLabel: "Namecheap Private Email",
      emailHistoryNamecheapText:
        "is actually used, but differently than the original text described: it is not the application's outbound email infrastructure, but rather the hosting of the info@esblu.com and privacy@esblu.com mailboxes, which you can use to contact us directly (e.g., with a request concerning personal data). Namecheap is therefore now listed in the table above with an accurate, verified description of its role.",
      sectionChangesTitle: "Changes to this list",
      changesText:
        "The current version of this list has been in effect since {{date}}. We may update the list when the technical infrastructure of Esblu changes.",
    },
    contactPage: {
      intro:
        "Esblu is a free trial version of a business record-keeping service. The controller is Jaroslav Juriš, Slovak Republic.",
      generalTitle: "General questions and support",
      generalText: "Write to us at",
      privacyTitle: "Privacy",
      privacyText:
        "Please send requests and questions concerning personal data to",
      supportNote:
        "When requesting support, please describe the problem as precisely as possible. Do not send your password or other login credentials by email.",
    },
  },
} satisfies typeof sk;

export default en;
