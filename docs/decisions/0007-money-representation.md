# ADR-0007: Store money as integer minor units with a frozen reporting snapshot

> Retained technical decision only. Old work-package IDs and implementation notes below
> are historical; they do not require rebuilding the removed plans. No money schema or
> implementation exists in the reset baseline. Start new work from the current US.

## Status

**Accepted** — 2026-10-03, by the project Owner (revision 2 decision text unchanged; only this _Status_ section was updated on acceptance). Closes `LR-11` of Docs `ERD/logical/LOGICAL-ERD-S0.md` (v0.4). **Accepted is not implemented:** no code or migration implements it yet (work package WP-05); the only money-related object in the database is `currencies.minor_unit`. The worked examples below were checked with an independent exact computation (Python `decimal`, 2026-10-03) — that is a check of the design examples, **not** of `core/money`, which does not exist yet.

This is a technical decision inside business rules already fixed by BRD `ADR-03`, `FR-1.6`, `FR-5.6`, `INV-04` and `US-04-05`. Two points that a Finance user can observe were put to the Owner on 2026-10-03 and answered in that design session; they are now recorded in the Docs decision log as `QĐ-42a` and `QĐ-42b` (**Owner decisions, not confirmed by the supervisor/GVHD**). The related lock on changing the reporting currency once rates or snapshots exist is `QĐ-42c` (implemented in WP-02):

| Point                                    | Owner's choice (2026-10-03)                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Rounding of an exact half                | away from zero (`508.5 → 509`, `−508.5 → −509`)                                |
| Rate date of a subscription's unit price | always the date the price is recorded, including back-filled/bootstrap entries |

## Date

2026-10-03

**Implementation annotation (20/10/2026, `g3-money-and-exchange-rates`):** `src/core/money` (parse/format, `ScaledRate`, `convertToReporting`, worked examples M1–M18 as unit tests), the tables `currencies` and `exchange_rates` (migration `20261020100000_finance_money_and_exchange_rates`) and the facade `FinanceService` (`parseMoney`, `snapshotMoney`) are implemented and `verified` locally. Money columns on subscriptions and the frozen snapshot stored with them are not yet: they arrive with `g3-subscription-purchase`. Accepted is still not Owner-reviewed implementation.

**Implementation annotation after restore:** the status description of `currencies.minor_unit` above refers to the pre-restore S0 database/schema, not the current checked-out foundation schema. No live database was inspected in this documentation audit. WP-02/WP-05 and `core/money` are future work; prior acceptance does not establish current implementation. Inspect migration history before applying any new schema to an existing environment.

## Context

BRD `ADR-03`: every money value carries its original amount and currency, the exchange rate and its date, and the amount converted to the organization's reporting currency, frozen when recorded and never recomputed on read (`US-04-05` AC-1, AC-2). Floating point is forbidden. The Logical ERD requires only _exact amount + currency + conversion snapshot_ and leaves the physical unit open (`LR-11`).

At the time of the decision (2026-10-03) the repository disagreed with itself. _Annotation after the audit of the same date:_ `ARCHITECTURE.md` §8 and the guide now follow this ADR; Docs `DAC_TA…` §4 and the prototype were not re-checked.

| Place                                                        | Says                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `ARCHITECTURE.md` §8 (uncommitted edit of 2026-10-02)        | not decided; proposal `*_amount_minor BIGINT`, string      |
| `docs/guides/kien-truc-backend-va-cach-viet-code.md` (table) | "`Decimal` in DB, string on the wire"                      |
| Docs `Research-AI/DAC_TA_VA_KE_HOACH_TICH_HOP_MF3_MF6.md` §4 | header says `Decimal`; statement rows `amountMinor BIGINT` |
| Prototype `discovery/csv.mjs` (MF-6, tests `DC-00`→`DC-12`)  | parses CSV amounts into integer minor units                |

## Decision

### 1. Domains

| Kind                                                                                      | Database                                                                                                                                                                                          | TypeScript (`src/core/money`)                           | Wire (JSON)                                                                                                                       | Allowed values                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Money** (entered amount, unit price, later: charge, invoice amount, budget, allocation) | `<name>_amount_minor BIGINT` + `<name>_currency CHAR(3)` FK `currencies`                                                                                                                          | `Money { amountMinor: bigint; currency: CurrencyCode }` | `{ "amount": "1200.00", "currency": "USD" }`                                                                                      | `\|amountMinor\| ≤ 10^15`; sign per field: S0 fields (`unit_price`) are `≥ 0`; negatives only where a later slice allows refunds (S1 statement rows) |
| **Conversion snapshot** (frozen at write)                                                 | `<name>_rate NUMERIC(20,10)`, `<name>_rate_date DATE`, `<name>_rate_source` enum, `<name>_reporting_amount_minor BIGINT`, `<name>_reporting_currency CHAR(3)`, optional `<name>_exchange_rate_id` | `ConversionSnapshot`                                    | `{ "rate": "25000", "rateDate": "2026-09-01", "rateSource": "MANUAL", "reporting": { "amount": "30000000", "currency": "VND" } }` | `\|reportingMinor\| ≤ 10^18`; `rate_source ∈ {PUBLIC, MANUAL, SAME_CURRENCY}`                                                                        |
| **Exchange rate** (`exchange_rates.rate` and the snapshot's `rate`)                       | `NUMERIC(20,10)`, `CHECK (rate > 0)`                                                                                                                                                              | `ScaledRate` = `bigint` holding `rate × 10^10`          | decimal string, no exponent (`"25000"`, `"0.0000384615"`)                                                                         | `0 < rate < 10^10`; at most 10 fractional digits                                                                                                     |
| **Quantity** (seats)                                                                      | `INTEGER CHECK (≥ 0)`                                                                                                                                                                             | `number` (safe integer)                                 | JSON integer                                                                                                                      | `0 … 2^31−1`                                                                                                                                         |
| **Aggregates** (sums in reports)                                                          | not stored; computed as `numeric` in SQL                                                                                                                                                          | `bigint`                                                | same Money wire shape                                                                                                             | never across currencies                                                                                                                              |

- **Wire money is a decimal string in major units** — field name `amount`, never `amountMinor`. Output always has exactly the currency's minor digits (`"1200.00"` USD, `"30000000"` VND). Input accepts `^-?\d{1,16}(\.\d+)?$`: fewer fractional digits are padded (`"1200"` → `"1200.00"`), **more** fractional digits than the currency allows ⟹ `422 MONEY_SCALE_EXCEEDED` (never silently rounded); exponent, thousands separators, leading `+`, JSON numbers ⟹ `422 VALIDATION_ERROR`. The OpenAPI description of every money field says _"decimal string in major units of `currency`"_.
- Amount and currency come together, otherwise `422 MONEY_INCOMPLETE` (`US-04-05` AC-3); unknown currency ⟹ `422 CURRENCY_NOT_SUPPORTED`; over the bound ⟹ `422 MONEY_OUT_OF_RANGE`.
- **Rate input:** more than 10 fractional digits ⟹ `422 RATE_SCALE_EXCEEDED` (no rounding — Finance re-enters at 10 digits); `≤ 0` or `≥ 10^10` ⟹ `422 RATE_OUT_OF_RANGE`. Known limit: a rate below `10^−4` keeps only about six significant digits at scale 10 (only relevant if the reporting currency is "stronger" than the source currency, e.g. VND → USD); accepted for S0 because the configured reporting currency is VND by default (`LR-07`).
- **Unit price** is Money per seat per billing cycle, as invoiced by the vendor, so it is expressible in the currency's minor unit. Sub-minor prices (per-token API rates, `G5` consumption detail) are out of scope (BRD 3.2); if ever needed they get a separate type through a new ADR.

### 2. Conversion and rounding

```text
Δ           = minor(to) − minor(from)
numerator   = amountMinor × rateScaled × 10^max(Δ, 0)
denominator = 10^10 × 10^max(−Δ, 0)
reportingMinor = roundHalfAwayFromZero(numerator / denominator)
```

- Exact integer arithmetic with `bigint`; `rateScaled` is parsed from the decimal string (`"25431.5"` → `254315000000000n`). No floating point, no `decimal.js` precision setting.
- **Rounding:** the result is the **nearest** integer; only an exact half (`2·|remainder| = denominator`) moves away from zero. `254.4999 → 254`, `508.5 → 509`, `−508.5 → −509`, `−254.4999 → −254`.
- **Once, at write time.** Never re-rounded or re-converted on read; reports sum stored rounded values.
- **Same currency as the reporting currency:** `rate = 1`, `rate_source = SAME_CURRENCY`, `rate_date` = the record's rate date. Adds one value to the logical domain _Ảnh chụp quy đổi_ — to be recorded in the Logical ERD when this ADR is accepted.
- **Rate date (Owner, 2026-10-03):** the date, in the organization's time zone, on which the money value is **recorded or last changed**:

  | Case                                                                                 | Rate date                                                                                                                             |
  | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
  | IT records a new subscription price                                                  | today                                                                                                                                 |
  | IT changes the price later                                                           | the day of the change (new snapshot; the old value stays in the audit row)                                                            |
  | Back-filled/bootstrap subscription that started in the past                          | the day it is recorded — **not** its start date                                                                                       |
  | Subscription saved as `DRAFT` because no rate exists for that date (`US-04-05` AC-5) | the original recording day; activation needs a rate **of that day**; changing the price on the draft moves the date to the change day |
  | No rate for that date and pair                                                       | `DRAFT`, `missing_financial_data = true`, no provisional converted value; never "latest available rate"                               |

  Other entities (invoice, charge, budget) choose their own recognition date in their slice; this ADR does not decide them.

- Different currencies are never summed.

### 3. No path through `Number`

- Prisma `BigInt` → `bigint` and `Decimal` → string conversion happen only in mappers through `core/money`; `toNumber()`, `Number()`, `parseFloat`, `+value` and `Math.*` are forbidden on money and rates (review checklist item; an ESLint `no-restricted-syntax` rule scoped to `src/core/money` and money mappers is part of WP-05).
- Raw SQL sums return `numeric`; read them as text (`::text`) and parse with `core/money`.
- `JSON.stringify` throws on `bigint`, so a forgotten mapper fails loudly in tests instead of leaking a lossy number.
- CSV/import parsers read amounts as strings and call `parseDecimalAmount`; no intermediate number.

### 4. Code placement

`src/core/money/` (framework-free): `CurrencyCode`, `Money`, `ScaledRate`, `parseDecimalAmount`, `formatAmount`, `parseRate`, `formatRate`, `convert(money, rate, toCurrency, minorUnits)`. Nothing else does money arithmetic.

### 5. Not decided here (belongs to C7 and later slices)

- How a share is represented (integer percent, basis points or a fraction) and how an amount is split into shares (`US-04-08`, `INV-03`). The only invariant this ADR imposes: **the parts of a split amount sum exactly to the whole in minor units.** The method (e.g. largest remainder) is chosen with the C7 design. Note that 1/3 is not representable in basis points (`3333 + 3333 + 3334 = 10000`), so a C7 example must use shares the chosen type can express.
- The recognition date of invoices, charges and budgets.
- A public exchange-rate source (`TE-08`); S0 uses only `MANUAL`.

## Worked examples (become unit tests of WP-05; checked independently 2026-10-03)

| #   | Input                                                                            | Expected                                                                                                                                          |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 1,200.00 USD, rate 25,000 VND/USD on 2026-09-01, reporting VND (`US-04-05` AC-1) | stored `120000` USD; reporting `30000000` VND; wire `"1200.00"` / `"30000000"`                                                                    |
| M2  | the same record after a 26,000 rate is entered for 2026-10-01 (AC-2)             | reporting still `30000000`                                                                                                                        |
| M3  | 19.99 USD × 25,431.5                                                             | exact `508375.685` ⟹ `508376` (nearest; not a tie)                                                                                                |
| M4  | 0.01 USD × 25,449.99                                                             | exact `254.4999` ⟹ `254` (nearest; **not** away from zero)                                                                                        |
| M5  | 0.02 USD × 25,425 (exact half)                                                   | `508.5` ⟹ `509`                                                                                                                                   |
| M6  | −0.02 USD × 25,425 (negative tie — only reachable from S1 refunds)               | `−508.5` ⟹ `−509`                                                                                                                                 |
| M7  | −0.01 USD × 25,449.99                                                            | `−254.4999` ⟹ `−254`                                                                                                                              |
| M8  | 9,999,999,999.99 USD × 26,000.1234567891                                         | exact `260001234567630.998765432109` ⟹ `260001234567631`                                                                                          |
| M9  | 9,999,999,999.99 USD × 50 (tie at large magnitude)                               | `499999999999.5` ⟹ `500000000000`                                                                                                                 |
| M10 | amount input `"12.345"` USD · `"1200.5"` VND                                     | `422 MONEY_SCALE_EXCEEDED`                                                                                                                        |
| M11 | amount input `"1200"` USD                                                        | accepted; wire `"1200.00"`                                                                                                                        |
| M12 | amount input JSON number `1200` · `"1.2e3"` · `"1,200.00"`                       | `422 VALIDATION_ERROR`                                                                                                                            |
| M13 | amount without currency, or currency without amount                              | `422 MONEY_INCOMPLETE`                                                                                                                            |
| M14 | `10^15 + 1` minor units; or a conversion whose result exceeds `10^18`            | `422 MONEY_OUT_OF_RANGE`                                                                                                                          |
| M15 | rate `"25000.12345678901"` (11 decimals) · `"0"` · `"10000000000"`               | `422 RATE_SCALE_EXCEEDED` · `422 RATE_OUT_OF_RANGE` · `422 RATE_OUT_OF_RANGE`                                                                     |
| M16 | USD price recorded 2026-10-01, no USD→VND rate for 2026-10-01 (AC-5)             | `DRAFT`, `missing_financial_data = true`, no reporting amount; a rate entered for 2026-10-02 does **not** complete it; a rate for 2026-10-01 does |
| M17 | subscription started 2025-01-01 recorded on 2026-10-01                           | snapshot uses the 2026-10-01 rate                                                                                                                 |
| M18 | property: 10,000 random amounts and rates within bounds (fixed seed)             | `convert` equals a reference exact-rational implementation                                                                                        |

## Alternatives considered

- **`NUMERIC(19,4)` (Prisma `Decimal`) for amounts.** Exact and readable in SQL, but the scale is per column rather than per currency (`"12.345" USD` storable), Prisma `Decimal` objects are easy to `Number()` by accident, and the MF-6 prototype already uses minor units. Rejected for amounts; kept for rates where a fixed scale fits.
- **Wire as minor units (`{ "amountMinor": "120000" }`).** Unambiguous, but pushes the minor-unit table to the FE (and `Intl`/CLDR digits differ from ISO 4217 for some currencies) and invites ×100 bugs. Rejected.
- **JSON numbers on the wire.** Lose precision above 2^53 and invite float arithmetic. Rejected.
- **Banker's rounding (half-even).** Rejected by the Owner on 2026-10-03: Finance cross-checks single records in spreadsheets whose `ROUND` breaks ties away from zero.
- **Rate of the subscription's start date for back-filled records.** Rejected by the Owner on 2026-10-03: needs historical rates and one more field; S0 follows `US-04-05` AC-1 wording.

## Consequences

- WP-06 can define `subscriptions` and `exchange_rates`; `C-09` (all-or-none money set) becomes a single-row `CHECK`.
- `ARCHITECTURE.md` §8 and `docs/guides/kien-truc-backend-va-cach-viet-code.md` are corrected in the change that accepts this ADR. The Docs owner updates `DAC_TA_VA_KE_HOACH_TICH_HOP_MF3_MF6.md` §4, Logical ERD `LR-11` and the snapshot domain (`SAME_CURRENCY`).
- A subscription keeps one current price; earlier prices are visible in the audit trail, not as a price history table. Reports that need price history over time are C7 design.
- The FE shows wire strings with `Intl.NumberFormat` and sends strings back; it never sums money.
