# Android App Links — `assetlinks.json` TODO

Tento súbor je zámerne **mimo `public/`** (nikdy sa neservíruje, nie je súčasťou
žiadneho buildu) — je to iba príprava/dokumentácia pre krok, ktorý sa dá
bezpečne dokončiť až po vytvorení release keystore. Pozri finálny report
(MOBILE AUTH + DEEP LINKS), sekcia 7 pre plný kontext.

## Prečo to ešte nejde dokončiť

Digital Asset Links verifikácia (`android:autoVerify="true"` v
`mobile/android/app/src/main/AndroidManifest.xml`) vyžaduje, aby
`https://esblu.com/.well-known/assetlinks.json` obsahoval **SHA-256
fingerprint podpisového certifikátu**, ktorým bude appka podpísaná pri
distribúcii (release keystore). Tento keystore ešte neexistuje. Publikovanie
`assetlinks.json` s vymysleným/placeholder fingerprintom by:
- neprešlo Android verifikáciou aj tak (fingerprint sa musí presne zhodovať),
- a bolo by to nepravdivá produkčná konfigurácia na verejnej doméne —
  vyslovene zakázané zadaním tejto úlohy.

## Čo urobiť, keď bude release keystore hotový

1. Vygeneruj/over release keystore (napr. `keytool -genkeypair ...` alebo cez
   Android Studio "Generate Signed Bundle / APK").
2. Zisti SHA-256 fingerprint certifikátu:
   ```
   keytool -list -v -keystore <cesta-ku-keystore> -alias <alias>
   ```
   (hodnota za `SHA256:`, formát `AA:BB:CC:...` — pre assetlinks.json sa píše
   presne v tomto dvojbodkovom hex formáte).
3. Vytvor `public/.well-known/assetlinks.json` (v koreňovom web projekte,
   nie v `mobile/` — servíruje ho web/Vercel deployment na
   `https://esblu.com/.well-known/assetlinks.json`) s obsahom:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.esblu.app",
         "sha256_cert_fingerprints": [
           "REPLACE_WITH_RELEASE_SHA256_FINGERPRINT"
         ]
       }
     }
   ]
   ```
4. Over, že Next.js web build servíruje tento súbor s `Content-Type:
   application/json` (statický súbor v `public/.well-known/` by mal fungovať
   bez ďalšej konfigurácie — over po deployi cez
   `curl -I https://esblu.com/.well-known/assetlinks.json`).
5. Ak appka niekedy dostane samostatný **debug** keystore fingerprint na
   testovanie App Links pred release buildom, pridaj ho ako ĎALŠÍ prvok v
   poli `sha256_cert_fingerprints` (nie namiesto release fingerprintu).
6. Po nasadení over Digital Asset Links štatút priamo cez Google-ov nástroj:
   ```
   https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://esblu.com&relation=delegate_permission/common.handle_all_urls
   ```
   alebo cez `adb shell dumpsys package d` po nainštalovaní appky (sekcia
   "Verification link handling" ukáže, či `esblu.com` prešiel na "verified").

## JS-side routing — už implementované

`@capacitor/app` (`App.getLaunchUrl()` pre cold start, `App.addListener(
'appUrlOpen', ...)` pre foreground/background) je zapojené v
`mobile/app/DeepLinkBridge.tsx`, mountovanom cez `mobile/app/layout.tsx`.
Tento súbor (`assetlinks.json`) je teda JEDINÝ zostávajúci blokujúci krok
pre plne overené App Links — bez neho appka funguje ako bezpečný fallback
(odkaz sa otvorí vo web prehliadači), ale Android ju automaticky nenavrhne
ako predvoleného handlera.
