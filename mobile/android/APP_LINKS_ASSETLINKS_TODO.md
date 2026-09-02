# Android App Links — `assetlinks.json`

## Stav (DOPLNENIE PRODUKČNÉHO assetlinks.json, aktualizované)

**Hotovo.** `public/.well-known/assetlinks.json` existuje a obsahuje
skutočný SHA-256 fingerprint upload/release certifikátu (nie placeholder).
Servíruje ho priamo Next.js ako statický súbor z `public/` — žiadna ďalšia
Vercel/next.config konfigurácia nebola potrebná (over produkčne cez
`curl -I https://esblu.com/.well-known/assetlinks.json`).

Zostávajúci krok je iba bod 5 nižšie (doplnenie Play App Signing
fingerprintu) — až po aktivácii Play App Signing v Play Console.

## Referenčný postup (pre budúcu úpravu, napr. Play App Signing fingerprint)

1. Zisti SHA-256 fingerprint certifikátu:
   ```
   keytool -list -v -keystore <cesta-ku-keystore> -alias <alias>
   ```
   (hodnota za `SHA256:`, formát `AA:BB:CC:...` — pre assetlinks.json sa píše
   presne v tomto dvojbodkovom hex formáte). Pre Play App Signing certifikát
   nájdeš rovnaký formát priamo v Play Console (Release → Setup → App
   integrity → App signing key certificate).
2. Aktuálny obsah `public/.well-known/assetlinks.json`:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.esblu.app",
         "sha256_cert_fingerprints": [
           "D0:D0:81:55:01:54:6E:CF:F7:91:74:57:53:DB:F6:43:92:B7:D8:DA:F6:3A:DA:A5:77:0B:E0:0A:90:F6:A2:FC"
         ]
       }
     }
   ]
   ```
3. Over, že Next.js web build servíruje tento súbor s `Content-Type:
   application/json` (statický súbor v `public/.well-known/` funguje bez
   ďalšej konfigurácie — over po deployi cez
   `curl -I https://esblu.com/.well-known/assetlinks.json`).
4. Ak appka niekedy dostane samostatný **debug** keystore fingerprint na
   testovanie App Links pred release buildom, pridaj ho ako ĎALŠÍ prvok v
   poli `sha256_cert_fingerprints` (nie namiesto release fingerprintu).
5. Po aktivácii **Play App Signing** v Play Console pridaj AJ jeho SHA-256
   (Release → Setup → App integrity → App signing key certificate) ako
   ĎALŠÍ prvok v tom istom poli `sha256_cert_fingerprints` — NIE namiesto
   upload-key fingerprintu vyššie (obidva môžu byť platné súčasne).
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
S `assetlinks.json` už publikovaným (s reálnym fingerprintom) je App Links
reťazec kompletný na strane appky aj domény — zostáva iba produkčné
overenie Digital Asset Links štatútu po nainštalovaní appky (bod 6
vyššie) a neskoršie doplnenie Play App Signing fingerprintu (bod 5).
