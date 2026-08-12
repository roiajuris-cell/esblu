> ⚠️ **THIS FILE IS DOCUMENTATION ONLY.**
> **DO NOT RUN THIS FILE AS A DATABASE MIGRATION.**
> **DO NOT MOVE THIS FILE INTO `supabase/migrations/`.**
>
> Toto je snapshot (dokumentačný baseline) živej produkčnej Supabase schémy
> projektu Esblu k dátumu **2026-08-12**, vytvorený ručným read-only auditom
> cez Supabase SQL Editor (samostatné `SELECT` dotazy nad `information_schema`,
> `pg_catalog`, `pg_policies`, `storage.buckets` a pod.). Súbor neobsahuje
> žiadny spustiteľný DDL/DML skript a nie je súčasťou histórie migrácií
> Supabase CLI. Slúži výhradne ako referenčná dokumentácia pre ďalší vývoj
> (napr. AI Inbox / `documents` modul), aby sa nové migrácie nepísali naslepo.

# Esblu — Supabase schema baseline (snapshot k 2026-08-12)

Zdroj: manuálny read-only audit vykonaný priamo v Supabase SQL Editore.
Zaznamenané sú iba **potvrdené** zistenia z výsledkov dotazov v tejto
konverzácii. Kde audit nepokryl všetky stĺpce/objekty, je to v texte
výslovne označené — nedopĺňajú sa žiadne nepotvrdené predpoklady.

---

## 1. Public tabuľky a stĺpce

### `ai_evidence`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| user_id | uuid | NOT NULL | — |
| vehicle_id | uuid | NULL | — |
| spz | text | NULL | — |
| document_type | text | NULL | — |
| movement_type | text | NULL | — |
| supplier | text | NULL | — |
| document_number | text | NULL | — |
| material | text | NULL | — |
| quantity | numeric | NULL | — |
| unit | text | NULL | — |
| brutto | numeric | NULL | — |
| tara | numeric | NULL | — |
| netto | numeric | NULL | — |
| construction_site | text | NULL | — |
| customer | text | NULL | — |
| document_date | date | NULL | — |
| document_time | text | NULL | — |
| photo_url | text | NULL | — |
| raw_text | text | NULL | — |
| created_at | timestamptz | NULL | `now()` |
| material_original | text | NULL | — |
| material_category | text | NULL | — |
| document_language | text | NULL | — |
| review_status | text | NULL | `'pending'` |
| confidence_score | numeric | NULL | — |
| source_location | text | NULL | — |
| destination_location | text | NULL | — |

### `inventory_items`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| name | text | NULL | — |
| category | text | NULL | — |
| quantity | numeric | NULL | — |
| unit | text | NULL | — |
| min_quantity | numeric | NULL | — |
| location | text | NULL | — |
| notes | text | NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |
| user_id | uuid | NULL | — |

### `inventory_photos`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| inventory_item_id | uuid | NOT NULL | — |
| user_id | uuid | NOT NULL | — |
| file_path | text | NOT NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |

### `machine_photos`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| user_id | uuid | NULL | — |
| machine_id | uuid | NULL | — |
| file_path | text | NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |

### `machine_services`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| machine_id | uuid | NULL | — |
| service_date | date | NULL | — |
| mileage | bigint | NULL | — |
| title | text | NULL | — |
| description | text | NULL | — |
| cost | numeric | NULL | — |
| technician | text | NULL | — |
| next_service_date | date | NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |
| user_id | uuid | NULL | — |

### `machines`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| name | text | NULL | — |
| category | text | NULL | — |
| manufacturer | text | NULL | — |
| model | text | NULL | — |
| serial_number | text | NULL | — |
| year | bigint | NULL | — |
| purchase_date | date | NULL | — |
| status | text | NULL | — |
| notes | text | NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |
| user_id | uuid | NULL | — |

### `plan_limits`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| plan | text | NOT NULL | — |
| ai_evidence | integer | NULL | — |
| vehicles | integer | NULL | — |
| inventory_items | integer | NULL | — |
| machines | integer | NULL | — |

### `settings`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| company_name | text | NULL | — |
| created_at | timestamptz | NOT NULL | `now()` |
| user_id | uuid | NULL | — |
| logo_path | text | NULL | — |
| plan | text | NOT NULL | `'free'` |

### `vehicle_services`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| vehicle_id | uuid | NOT NULL | — |
| service_date | date | NULL | — |
| mileage | bigint | NULL | — |
| title | text | NULL | — |
| description | text | NULL | — |
| cost | numeric | NULL | — |
| technician | text | NULL | — |
| next_service_date | date | NULL | — |
| created_at | timestamptz | NULL | `now()` |
| user_id | uuid | NULL | — |

### `vehicles`
| Stĺpec | Typ | Null | Default |
|---|---|---|---|
| id | uuid | NOT NULL | `gen_random_uuid()` |
| spz | text | NOT NULL | — |
| vin | text | NULL | — |
| znacka | text | NULL | — |
| model | text | NULL | — |
| rok_vyroby | bigint | NULL | — |
| palivo | text | NULL | — |

> ⚠️ **Neúplný zoznam — vedomé obmedzenie zdroja.** Manuálny audit `vehicles`
> sa v tejto konverzácii skončil pri stĺpci `palivo`. Zvyšné stĺpce, o ktorých
> vieme z aplikačného kódu (napr. `objem`, `vykon`, `farba`, `hmotnost`,
> `pocet_miest`, `datum_prvej_evidencie`, `stk`, `ek`), **tu nie sú uvedené**,
> pretože neboli potvrdené priamo z výsledku DB auditu. Nedopĺňajú sa ako
> "potvrdené z DB" — pred ďalším použitím tejto tabuľky v migráciách treba
> zvyšok stĺpcov `vehicles` doauditovať rovnakým spôsobom.

---

## 2. Constraints

**Primary keys (potvrdené):**
- `ai_evidence_pkey` — PRIMARY KEY (`id`)
- `invetory_items_pkey` — PRIMARY KEY (`id`) *(názov constraintu má preklep `invetory_` — zapísané presne tak, ako bolo potvrdené v audite)*
- `inventory_photos_pkey` — PRIMARY KEY (`id`)
- `machine_photos_pkey` — PRIMARY KEY (`id`)
- `machine_services_pkey` — PRIMARY KEY (`id`)
- `machines_pkey` — PRIMARY KEY (`id`)
- `plan_limits_pkey` — PRIMARY KEY (`plan`)
- `settings_pkey` — PRIMARY KEY (`id`)
- `settings_user_id_key` — UNIQUE (`user_id`)
- `vehicle_services_pkey` — PRIMARY KEY (`id`)
- `vehicles_pkey` — PRIMARY KEY (`id`)

**Foreign keys (potvrdené):**
- `inventory_photos.inventory_item_id` → `inventory_items.id` — `ON DELETE CASCADE`
- `inventory_photos.user_id` → `auth.users.id` — `ON DELETE CASCADE`

**Check constraints (potvrdené):**
- `plan_limits`: `plan in ('free','pro','admin')`
- `plan_limits`: hodnoty `ai_evidence` / `vehicles` / `inventory_items` / `machines` musia byť `NULL` alebo `>= 0`
- `settings`: `plan in ('free','pro','admin')`

### ⚠️ Dôležité zistenie — chýbajúce FK väzby

V audite sa **NENAŠLI** foreign key constrainty pre:
- `vehicle_services.vehicle_id` → `vehicles.id`
- `machine_services.machine_id` → `machines.id`
- `machine_photos.machine_id` → `machines.id`
- `ai_evidence.vehicle_id` → `vehicles.id`
- ani `user_id` → `auth.users.id` na väčšine business tabuliek (okrem potvrdenej `inventory_photos.user_id`)

Referenčná integrita medzi týmito tabuľkami je dnes vynucovaná **iba na
aplikačnej úrovni** (kód), nie databázou.

---

## 3. Indexy

Potvrdené sú iba:
- indexy patriace k vyššie uvedeným PRIMARY KEY constraintom,
- `settings_user_id_key` (unique index).

Žiadne ďalšie potvrdené indexy na `user_id`, `vehicle_id`, `machine_id`,
`spz` alebo `service_date` neboli v audite nájdené. Pri raste objemu dát
(najmä `ai_evidence`, `vehicle_services`, `machine_services`) to je
potenciálne výkonnostné riziko pri filtrovaní podľa `user_id`/`vehicle_id`.

---

## 4. RLS stav

RLS **enabled = true**, **forced = false** na všetkých nasledujúcich
tabuľkách:
- `ai_evidence`
- `inventory_items`
- `inventory_photos`
- `machine_photos`
- `machine_services`
- `machines`
- `plan_limits`
- `settings`
- `vehicle_services`
- `vehicles`

---

## 5. RLS policies

### `ai_evidence`
- **Users can manage own ai evidence** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `inventory_items`
- **Users can manage own inventory items** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `inventory_photos`
- SELECT — vlastné riadky, `auth.uid() = user_id`
- INSERT — vlastné riadky, WITH CHECK `auth.uid() = user_id`
- DELETE — vlastné riadky, `auth.uid() = user_id`
- **UPDATE policy sa nenašla**

### `machine_photos`
- **Users can manage own machine photos** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `machine_services`
- **Users can manage own machine services** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `machines`
- **Users can manage own machines** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `plan_limits`
- **esblu_authenticated_plan_limits_select** — `SELECT`
  role: `authenticated`
  USING `true`

### `settings`
- **Users can manage own settings** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `vehicle_services`
- **Users can manage own vehicle services** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

### `vehicles`
- **Users can manage own vehicles** — `ALL`
  USING `auth.uid() = user_id`
  WITH CHECK `auth.uid() = user_id`

> **Poznámka k rolám:** väčšina policies mala v audite rolu `{public}`,
> nie explicitne `{authenticated}` (samotné RLS aj tak vyžaduje `auth.uid()`,
> takže neautentifikovaný request s `auth.uid() = null` cez tieto policies
> neprejde, ale rola nie je explicitne obmedzená na `authenticated`).
> `plan_limits` je jediná tabuľka s explicitne `authenticated` rolou.

---

## 6. Triggers

**Potvrdené:**

| Tabuľka | Timing | Trigger | Funkcia |
|---|---|---|---|
| `auth.users` | AFTER INSERT | `esblu_create_settings_after_auth_user_insert` | `esblu_create_settings_for_new_user()` |
| `public.ai_evidence` | BEFORE INSERT | `esblu_plan_limit_before_insert` | `esblu_enforce_plan_limit()` |
| `public.inventory_items` | BEFORE INSERT | (rovnaký trigger/funkcia) | `esblu_enforce_plan_limit()` |
| `public.machines` | BEFORE INSERT | (rovnaký trigger/funkcia) | `esblu_enforce_plan_limit()` |
| `public.vehicles` | BEFORE INSERT | (rovnaký trigger/funkcia) | `esblu_enforce_plan_limit()` |

---

## 7. Funkcie

### `esblu_create_settings_for_new_user()`
- `SECURITY DEFINER`
- `search_path = pg_catalog, public`
- Po `INSERT` do `auth.users` vloží riadok `settings(user_id, plan='free')`.
- `ON CONFLICT (user_id) DO NOTHING`.

### `esblu_enforce_plan_limit()`
- `SECURITY DEFINER`
- `search_path = pg_catalog, public, auth`
- Kontroluje, že `new.user_id` nie je `NULL`.
- Kontroluje `auth.uid()` oproti `new.user_id` (odmietne mismatch).
- `service_role` / `postgres` / `supabase_admin` / `supabase_auth_admin`
  majú privilegovaný bypass tejto kontroly.
- Podporuje **iba** tieto tabuľky (whitelist):
  - `ai_evidence`
  - `vehicles`
  - `inventory_items`
  - `machines`
- Používa transakčný advisory lock na kombináciu `user_id + tabuľka`
  (serializuje súbežné inserty).
- Načíta `settings.plan` pre daného usera.
- Načíta príslušný limit z `plan_limits` pre daný `plan` a tabuľku.
- `NULL` limit = neobmedzené.
- Spočíta aktuálny počet riadkov daného usera v danej tabuľke.
- Pri dosiahnutí/prekročení limitu vyhodí výnimku `PLAN_LIMIT_REACHED:<tabuľka>`.

> ⚠️ **Dôležité pre budúci `documents` modul:** whitelist tabuliek v
> `esblu_enforce_plan_limit()` je natvrdo zakódovaný (`tg_table_name not in
> (...)` vyhadzuje `PLAN_LIMIT_UNSUPPORTED_RESOURCE`). Nová tabuľka
> `documents` (alebo akákoľvek ďalšia budúca tabuľka) **nebude mať plan
> limit vynútený automaticky** — vyžaduje to vedomé, samostatné rozšírenie
> tejto funkcie (a zodpovedajúceho stĺpca v `plan_limits`) v novej migrácii.

---

## 8. Storage buckets

| Bucket | `public` |
|---|---|
| `ai-evidence-documents` | `false` |
| `company-logos` | `true` |
| `inventory-photos` | `true` |
| `machine-photos` | `true` |

---

## 9. Storage policies

### `ai-evidence-documents`
- SELECT — iba `authenticated`, obmedzené na bucket + prvý priečinok cesty = `auth.uid()`
- INSERT — iba `authenticated`, obmedzené na bucket + prvý priečinok cesty = `auth.uid()`
- DELETE — iba `authenticated`, obmedzené na bucket + prvý priečinok cesty = `auth.uid()`

### `machine-photos`
- INSERT — `authenticated`, obmedzené iba podľa `bucket_id`
- DELETE — `authenticated`, obmedzené iba podľa `bucket_id`
- SELECT — `authenticated`, obmedzené na prvý priečinok cesty = `auth.uid()`

### `company-logos`
- INSERT — `authenticated`, prvý priečinok cesty = `auth.uid()`
- UPDATE — `authenticated`, prvý priečinok cesty = `auth.uid()`
- DELETE — `authenticated`, obmedzené iba podľa `bucket_id`

### `inventory-photos`
- INSERT — `authenticated`, prvý priečinok cesty = `auth.uid()`
- SELECT — `authenticated`, prvý priečinok cesty = `auth.uid()`
- UPDATE — `authenticated`, prvý priečinok cesty = `auth.uid()`
- DELETE — `authenticated`, prvý priečinok cesty = `auth.uid()`

### ⚠️ Bezpečnostná poznámka

- `machine-photos`: INSERT a DELETE **nie sú** obmedzené na prvý priečinok
  cesty = `auth.uid()` — sú menej striktne oddelené než SELECT na tom istom
  bucketi (kontrola je iba podľa `bucket_id`, nie podľa vlastníctva cesty).
- `company-logos`: DELETE je rovnako menej striktne oddelené (iba podľa
  `bucket_id`, nie podľa `auth.uid()` v ceste).
- Pre budúci AI Inbox / `documents` modul odporúčame dôsledne používať
  **privátny bucket** + **first-folder `= auth.uid()`** policy na
  SELECT/INSERT/UPDATE/DELETE rovnako, ako je to dnes urobené pri
  `ai-evidence-documents`, a vyhnúť sa vzoru s verejným bucketom alebo
  s DELETE/INSERT obmedzenými iba na `bucket_id`.

---

## 10. Enums

- Potvrdené: **0** vlastných PostgreSQL enum typov v schéme `public`.
- Hodnoty plánu (`free`/`pro`/`admin`) sú riešené cez `text` stĺpec +
  `CHECK` constraint, nie cez natívny enum typ.

---

## 11. Architektúrne poznámky pre Esblu 2.0

- Tento baseline je **dokumentácia**, **NIE migrácia**.
- Súbor je uložený mimo `supabase/migrations/` (v `docs/db/`).
- Nemá sa nikdy spúšťať cez `supabase db push` ani inak aplikovať proti DB.
- **Najväčšie aktuálne DB riziká** identifikované týmto auditom:
  1. Chýbajúce FK väzby (`vehicle_services.vehicle_id`,
     `machine_services.machine_id`, `machine_photos.machine_id`,
     `ai_evidence.vehicle_id`, `user_id → auth.users.id` na väčšine
     business tabuliek) — referenčná integrita je dnes iba aplikačná.
  2. Chýbajúce indexy na `user_id`, `vehicle_id`, `machine_id`, `spz`,
     `service_date` — potenciálny výkonnostný dopad pri raste dát.
  3. Nullable `user_id` na viacerých tabuľkách (`inventory_items`,
     `machine_photos`, `machine_services`, `machines`, `settings`,
     `vehicle_services`) — v kombinácii s RLS (`auth.uid() = user_id`)
     by `NULL` hodnota znamenala, že riadok nie je nikým dosiahnuteľný cez
     bežnú RLS policy, ale stĺpec by mal byť podľa aplikačnej logiky vždy
     vyplnený.
  4. Storage policies s nerovnakou prísnosťou naprieč bucketmi (pozri
     bod 9).
  5. Plan-limit whitelist (`esblu_enforce_plan_limit()`) nepodporuje a
     nebude automaticky podporovať budúcu tabuľku `documents`.
- Pred vytvorením `documents` / `document_links` / `document_review_log`
  sa má pripraviť **samostatná, čisto aditívna migrácia** (nové tabuľky,
  vlastné RLS policies podľa existujúceho vzoru `auth.uid() = user_id`,
  bez zásahu do existujúcich tabuliek).
- Existujúca tabuľka `ai_evidence` sa **zatiaľ nemigruje ani nemaže** —
  zostáva v súčasnej podobe, kým sa vedome nerozhodne o jej budúcnosti
  (ponechanie ako špecializovanej tabuľky vs. neskoršia migrácia na
  všeobecný `documents` model).

---

*Koniec dokumentačného baseline snapshotu k 2026-08-12. Tento súbor
nereprezentuje kompletný, strojovo vygenerovaný `pg_dump` — je to ručne
zostavený zápis potvrdených výsledkov manuálneho SQL auditu vykonaného v
tejto konverzácii. Neobsahuje spustiteľné DDL príkazy.*
