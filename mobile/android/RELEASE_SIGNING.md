# Esblu Android — Release Signing (Google Play príprava)

Tento dokument je bezpečne trackovaný v Gite (obsahuje iba postup, žiadne
heslá/kľúče). Súvisiace súbory:

- `app/build.gradle` — číta `app/keystore.properties` (negitovaný) a z neho
  zostavuje `signingConfigs.release`.
- `app/keystore.properties.example` — šablóna bez hesiel (trackovaná).
- `app/keystore.properties` — skutočný súbor s heslami, **nikdy necommitovať**
  (je v `.gitignore`).
- `.gitignore` — `*.jks`, `*.keystore`, `app/keystore.properties` sú
  natvrdo ignorované.

## 1. Vytvorenie release keystore (urobiť RUČNE, LOKÁLNE)

Toto Claude/agent zámerne nevykonáva automaticky — release kľúč je
kritický, nezvratne stratiteľný artefakt (ak sa stratí a appka nepoužíva
Play App Signing, verziu appky už nikdy nepôjde aktualizovať pod tým istým
`applicationId`) a heslo si musíš zvoliť a bezpečne uložiť sám.

Otvor terminál (napr. PowerShell) **mimo git repozitára** — napríklad vo
vlastnom bezpečnom priečinku na kľúče, nie v `C:\Users\roiaj\assetpilot` — a spusti:

```powershell
keytool -genkeypair -v -keystore esblu-release.jks -alias esblu -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` je súčasťou JDK (dodáva sa aj s Android Studio — ak `keytool`
nie je v PATH, nájdeš ho zvyčajne v
`C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`).

Program sa ťa interaktívne opýta:
- **heslo ku keystore** (storePassword) — zvoľ silné heslo, ulož si ho
  bezpečne (napr. do správcu hesiel),
- **heslo ku kľúču** (keyPassword) — môžeš dať Enter, aby bolo rovnaké ako
  vyššie, alebo zvoliť iné,
- meno/organizáciu/mesto/krajinu (CN/OU/O/L/ST/C) — nie sú tajné, môžu byť
  napr. "Esblu", "SK" atď., nie sú bezpečnostne kritické.

**Alternatíva (GUI):** v Android Studio: `Build → Generate Signed Bundle /
APK… → Android App Bundle → Create new…` — rovnaký výsledok, iba
formulárom namiesto príkazového riadku.

### Dôležité upozornenie

- Zálohuj `esblu-release.jks` na bezpečné miesto (napr. šifrovaný cloud
  backup) — strata = strata schopnosti aktualizovať appku pod rovnakým
  podpisom (pokiaľ nepoužívaš Play App Signing s možnosťou "Request upload
  key reset").
- Heslá si zapamätaj/ulož mimo tohto repozitára a mimo akéhokoľvek chatu
  alebo reportu.

## 2. Vyplnenie `app/keystore.properties`

Skopíruj `app/keystore.properties.example` na `app/keystore.properties` a
vyplň:

```
storeFile=<absolútna cesta k esblu-release.jks>
storePassword=<heslo ku keystore>
keyAlias=esblu
keyPassword=<heslo ku kľúču>
```

Súbor je už v `.gitignore` — `git status` by ho po vytvorení nemal
zobraziť ako sledovaný.

## 3. Zistenie SHA-256 fingerprintu (pre `assetlinks.json`)

```powershell
keytool -list -v -keystore esblu-release.jks -alias esblu
```

Hľadaj riadok `SHA256:` — hodnota vo formáte `AA:BB:CC:...` sa presne v
tomto tvare vloží do `sha256_cert_fingerprints` v
`https://esblu.com/.well-known/assetlinks.json` (pozri
`mobile/android/APP_LINKS_ASSETLINKS_TODO.md` pre plný postup vytvorenia
tohto súboru — je posledný krok, ktorý závisí od tohto keystore).

## 4. Build podpísaného release AAB

Po vyplnení `app/keystore.properties`:

```powershell
cd mobile
npm run build          # Next.js static export do mobile/out
npx cap sync android    # skopíruje out/ do android/app/src/main/assets/public
cd android
./gradlew bundleRelease  # (Windows: gradlew.bat bundleRelease)
```

Výstup: `mobile/android/app/build/outputs/bundle/release/app-release.aab`
— podpísaný podľa `app/keystore.properties`.

## 5. Poznámka k Google Play App Signing

Ak pri prvom nahratí do Play Console zapneš (predvolené a odporúčané) **Play
App Signing**, Google si vygeneruje VLASTNÝ podpisový certifikát pre
distribúciu (upload key vyššie sa používa iba na overenie, že AAB
nahrávaš ty). V takom prípade bude treba do `assetlinks.json` doplniť AJ
SHA-256 z Play Console (`Release → Setup → App integrity → App signing
key certificate`), nie iba lokálny upload-key fingerprint — pozri
`APP_LINKS_ASSETLINKS_TODO.md`, bod 5.
