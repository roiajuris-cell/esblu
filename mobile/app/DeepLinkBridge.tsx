"use client";

import { useEffect, useRef } from "react";
import { App, type URLOpenListenerEvent } from "@capacitor/app";

// -----------------------------------------------------------------------------
// DeepLinkBridge — JEDINÝ mobile-only bridge medzi Android App Links (HTTPS
// intenty na https://esblu.com/...) a lokálnym Capacitor static bundlom.
// Mountuje sa VÝHRADNE cez mobile/app/layout.tsx (pozri tam) — nikdy sa
// neimportuje ani nemountuje z koreňového (web) app/layout.tsx, takže webový
// build/bundle sa touto zmenou vôbec nedotýka (@capacitor/app tam nikdy
// nebeží ani sa nenačíta).
//
// PRINCÍP:
// 1. Cold start: App.getLaunchUrl() vráti URL, ktorou bola appka spustená
//    (Android Intent.data z App Link, ak appka nebežala).
// 2. Foreground/background: App.addListener("appUrlOpen", ...) chytí URL,
//    keď appka už beží a používateľ klikne na App Link odkaz znova.
// 3. Oba prípady sa spracujú TOU ISTOU funkciou resolveEsbluDeepLink() —
//    prísny allowlist (https + esblu.com + presne 4 cesty, pozri
//    AUTH CALLBACK BEZPEČNOSTNÁ OPRAVA 2026-08-31 nižšie), nikdy
//    "otvor čokoľvek z esblu.com".
// 4. Skutočná navigácia je VŽDY window.location.replace(target), NIE
//    Next.js router.push()/replace(). Dôvod (kritické pre requirement 5):
//    Supabase auth (implicit flow, detectSessionInUrl) parsuje
//    window.location.href PRESNE RAZ, pri inicializácii GoTrueClient
//    modulu (lib/supabase.ts, `export const supabase = createClient(...)`
//    beží raz pri prvom importe). Next.js router.push() je iba klientská
//    SPA navigácia (mení history/DOM, NEreloaduje dokument) — Supabase
//    klient, ktorý sa inicializoval ešte na pôvodnej cold-start URL bez
//    hashu, by #access_token=... pridaný takouto SPA navigáciou NIKDY
//    nezachytil. window.location.replace() naopak vyvolá skutočné znovu-
//    načítanie WebView dokumentu na cieľovú lokálnu statickú stránku i S
//    hashom OD ZAČIATKU — presne tak, ako keď web používateľ v prehliadači
//    klikne na e-mailový odkaz (plná navigácia, nie SPA). Tento vzor
//    (window.location.href/replace na lokálnu statickú cestu) je už dnes
//    zavedený v tomto projekte, napr. app/components/CompanyDpaGate.tsx a
//    viacero app/*/page.tsx súborov pri session-expired presmerovaní na
//    "/login" — DeepLinkBridge iba rozširuje ten istý overený vzor.
// 5. Duplicitné spracovanie tej istej launch URL: `window.location.replace()`
//    spôsobí PLNÉ znovunačítanie WebView dokumentu → tento komponent sa
//    remountne odznova → App.getLaunchUrl() môže (podľa Capacitor
//    dokumentácie) vrátiť TÚ ISTÚ URL znova, keďže Android Activity sa
//    nereštartuje, iba WebView dokument. Ochrana: PRED navigáciou sa
//    vypočítaný cieľ porovná s aktuálnym window.location (pathname+search+
//    hash, s normalizovanou ".html" príponou — pozri isAlreadyOnTarget
//    nižšie) — ak sa už na cieli nachádzame, nič sa nerobí (žiadna
//    nekonečná slučka). Pre "appUrlOpen" event (bez reloadu medzi
//    duplicitami) navyše in-memory Set spracovaných raw URL v rámci tejto
//    JS session.
// 6. Cieľové cesty majú EXPLICITNÚ ".html" príponu (/invite.html, nie
//    /invite) — nie kozmetika, ale nutnosť. Capacitor Android
//    (WebViewLocalServer.java, html5mode=true — default, nikde v
//    mobile/capacitor.config.ts neprepísaný) pri KAŽDOM document-level
//    requeste na cestu, ktorej posledný path segment neobsahuje bodku,
//    VŽDY servíruje index.html — nikdy sa nepokúsi o "<cesta>.html", aj
//    keby existovala. Bez tejto prípony by window.location.replace(
//    "/invite?token=...") nikdy nenačítal skutočný invite.html a namiesto
//    neho by sa vždy ticho zobrazil root bundle (Home/PublicLandingPage) —
//    presne toto bolo potvrdenou príčinou bugu "/invite → landing page"
//    (Android real-device test, pm clear scenár). Next.js static export
//    produkuje presne "<route>.html" súbory (mobile/out/invite.html,
//    mobile/out/reset-hesla.html, mobile/out/onboarding/company.html) —
//    explicitná ".html" prípona v cieli preto vždy zodpovedá reálnemu
//    súboru na disku. Web (dynamická /invite/[token] routa, normálny
//    prehliadač, žiadny WebViewLocalServer) touto zmenou nie je nijako
//    dotknutý.
//
// BEZPEČNOSŤ (pozri aj resolveEsbluDeepLink nižšie):
// - žiadny eval, žiadne dynamické načítanie externej URL
// - token sa NIKDY nelogguje, hash fragment sa NIKDY nelogguje — console.*
//   volania nižšie logujú výhradne rozpoznanú BAZOVÚ cestu (napr.
//   "/reset-hesla.html"), nikdy query/hash/token
// -----------------------------------------------------------------------------

/**
 * Preloží externú https://esblu.com URL na lokálnu static-export cestu.
 * Vracia `null`, ak URL nezodpovedá prísne povolenému hostu/protokolu/ceste
 * — volajúci v tom prípade odkaz IGNORUJE (žiadna navigácia, žiadny fallback
 * na "otvor to inak").
 *
 * Exportované samostatne, aby bola táto čisto funkčná (bez Capacitor
 * závislosti) logika ľahko auditovateľná/testovateľná nezávisle od
 * React/Capacitor obalu.
 */
export function resolveEsbluDeepLink(rawUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // Prísny allowlist — presne https a presne esblu.com (žiadny endsWith/
  // includes, ktorý by prepustil napr. "esblu.com.evil.example").
  if (url.protocol !== "https:") {
    return null;
  }

  if (url.hostname !== "esblu.com") {
    return null;
  }

  const inviteMatch = url.pathname.match(/^\/invite\/([^/]+)\/?$/);

  if (inviteMatch) {
    let token: string;

    try {
      token = decodeURIComponent(inviteMatch[1]);
    } catch {
      // Nevalidný percent-encoding v tokene — fail closed, nič sa
      // nenavigujeme.
      return null;
    }

    if (!token) {
      return null;
    }

    // ".html" — pozri bod 6 v komentári na začiatku súboru (Capacitor
    // html5mode fallback na index.html pre extensionless cesty).
    return buildLocalTarget("/invite.html", { token }, url);
  }

  if (url.pathname === "/reset-hesla" || url.pathname === "/reset-hesla/") {
    return buildLocalTarget("/reset-hesla.html", {}, url);
  }

  if (
    url.pathname === "/onboarding/company" ||
    url.pathname === "/onboarding/company/"
  ) {
    return buildLocalTarget("/onboarding/company.html", {}, url);
  }

  // AUTH CALLBACK BEZPEČNOSTNÁ OPRAVA (2026-08-31, RELEASE BLOCKER,
  // TokenHash revízia): nový dedikovaný auth callback
  // (app/auth/callback/page.tsx) — skutočné signup potvrdenie aj reset hesla
  // odkazy (Supabase Email Templates, Dashboard) teraz smerujú SEM, s
  // `?token_hash=...&type=email|recovery` v query stringu (NIE priamo na
  // /onboarding/company alebo /reset-hesla), aby callback vedel explicitne
  // zavolať supabase.auth.verifyOtp({ token_hash, type }) a nezávisle
  // (getUser()) overiť identitu namiesto ticheho ponechania prípadnej
  // existujúcej session iného účtu. `token_hash`/`type` sú bežné query
  // parametre — buildLocalTarget() nižšie ich zachová 1:1 (rovnaký
  // mechanizmus ako pri ostatných cieľoch vyššie), žiadna extra logika
  // potrebná. Rovnaký ".html" dôvod ako pri ostatných cieľoch vyššie —
  // mobile/out/auth/callback.html.
  if (url.pathname === "/auth/callback" || url.pathname === "/auth/callback/") {
    return buildLocalTarget("/auth/callback.html", {}, url);
  }

  // Čokoľvek iné na esblu.com (napr. /vozidla, /login, marketing landing) —
  // zámerne IGNOROVANÉ, nikdy sa neotvára v appke automaticky.
  return null;
}

/**
 * Zostaví lokálnu cieľovú cestu vrátane zachovaného query stringu (z
 * pôvodnej externej URL, zlúčeného s `extraParams` — napr. `token`) A
 * hash fragmentu (Supabase #access_token=..., type=recovery/signup atď.)
 * — hash sa kopíruje 1:1, nikdy sa needituje/needecoduje, presne ako ho
 * poslal Supabase v e-mailovom odkaze.
 *
 * `extraParams` (napr. token) sa vkladá cez URLSearchParams.set(), ktoré
 * hodnotu vždy korektne percent-enkóduje ako JEDEN query parameter — token
 * sa preto nikdy nemôže "rozpadnúť" na ďalšiu cestu ani na iný parameter.
 */
function buildLocalTarget(
  basePath: string,
  extraParams: Record<string, string>,
  sourceUrl: URL
): string {
  const params = new URLSearchParams(sourceUrl.search);

  for (const [key, value] of Object.entries(extraParams)) {
    params.set(key, value);
  }

  const query = params.toString();

  return `${basePath}${query ? `?${query}` : ""}${sourceUrl.hash}`;
}

// Odstráni koncovú ".html" príponu z pathname pred porovnaním — Next.js
// klientský router môže (nie je isté, závisí od verzie/hydratácie) po
// hydratácii cez history.replaceState "vyčistiť" URL v adresnom riadku
// späť na "/invite" (bez ".html"), zatiaľ čo cieľ, ktorý DeepLinkBridge
// počíta, má ".html" vždy explicitne (pozri buildLocalTarget volania v
// resolveEsbluDeepLink). Bez normalizácie by isAlreadyOnTarget() mohol
// nesprávne vrátiť false pri druhom mountnutí (po hard reloade) a znovu
// zavolať window.location.replace() na TEN ISTÝ cieľ — nekonečná (aspoň
// dvojkroková) slučka. Normalizáciou OBOCH strán rovnako je porovnanie
// správne bez ohľadu na to, či prehliadač ".html" v danom momente v
// pathname drží alebo nie.
function stripHtmlExtension(pathname: string): string {
  return pathname.endsWith(".html") ? pathname.slice(0, -".html".length) : pathname;
}

function isAlreadyOnTarget(target: string): boolean {
  const targetUrl = new URL(target, window.location.origin);

  const currentPath = stripHtmlExtension(window.location.pathname);
  const targetPath = stripHtmlExtension(targetUrl.pathname);

  return (
    currentPath === targetPath &&
    window.location.search === targetUrl.search &&
    window.location.hash === targetUrl.hash
  );
}

export default function DeepLinkBridge() {
  // In-memory (nie sessionStorage — zámerne, pozri komentár vyššie: ochrana
  // proti duplicite v RÁMCI JEDNEJ JS session; ochrana proti duplicite NAPRIEČ
  // reloadom rieši isAlreadyOnTarget()) set surových URL, ktoré appUrlOpen
  // event už spracoval počas tejto JS session.
  const processedRawUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    function handleIncomingUrl(rawUrl: string) {
      if (processedRawUrls.current.has(rawUrl)) {
        return;
      }
      processedRawUrls.current.add(rawUrl);

      const target = resolveEsbluDeepLink(rawUrl);

      if (!target) {
        // Zámerne bez logovania obsahu rawUrl (mohol by obsahovať hash s
        // access_token, aj keby ho nespracujeme) — iba neutrálna správa.
        console.info("[deep-link] ignorovaný nerozpoznaný/nepovolený odkaz");
        return;
      }

      if (isAlreadyOnTarget(target)) {
        return;
      }

      // Bazová cesta bez query/hash — bezpečná na zalogovanie, pomáha pri
      // diagnostike bez rizika úniku tokenu/access_token.
      const basePathForLog = target.split(/[?#]/)[0];
      console.info("[deep-link] smerujem na", basePathForLog);

      window.location.replace(target);
    }

    async function handleLaunchUrl() {
      try {
        const launch = await App.getLaunchUrl();
        if (!cancelled && launch?.url) {
          handleIncomingUrl(launch.url);
        }
      } catch (error) {
        console.error("[deep-link] getLaunchUrl zlyhalo:", error);
      }
    }

    void handleLaunchUrl();

    let listenerHandle: { remove: () => void } | undefined;

    App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      if (!cancelled && event?.url) {
        handleIncomingUrl(event.url);
      }
    })
      .then((handle) => {
        if (cancelled) {
          // Komponent sa medzičasom odmountoval skôr, než sa listener
          // stihol zaregistrovať — okamžite ho odregistruj.
          handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch((error) => {
        console.error("[deep-link] addListener(appUrlOpen) zlyhalo:", error);
      });

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, []);

  return null;
}
