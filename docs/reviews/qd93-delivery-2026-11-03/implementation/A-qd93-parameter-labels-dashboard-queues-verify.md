# Verify phase A — qd93-parameter-labels-dashboard-queues (02/11/2026)

Skill preflight: superpowers:verification-before-completion (verification), code-review-and-quality (review/domain);
process = verifier workflow given by caller (closest equivalent: code-review-and-quality review process).

Repo: BE `feat/qd93-parameter-labels-dashboard-queues`, verified on 8d9bab06 (diff 7daf6856...HEAD), evidence commit 10e4a56d.

## Verdict: PASS (phase A), with Task 3 partial (roadmap row/PR description not done — handoff items)

## Commands (real)

| Command | Exit | Counts | Log |
| --- | --- | --- | --- |
| pnpm check | 0 | unit 327/4451; gates 16/326; scripts 274 (272 pass, 2 skip, ~640 s); discovery ok; build ok | A-...-verify-check.txt |
| pnpm rules:check | 0 | 411 files, 3340 links, 0 errors | A-...-verify-rules.txt |
| pnpm openapi:export | 0 | no diff | A-...-verify-openapi.txt |
| pnpm test:http -- operating-parameters + openapi-dialect/api-inventory/openapi-export/openapi-presentation/openapi-read-wording | 0 | 6 suites / 75 tests | A-...-verify-http.txt |
| test:integration per file: operating-parameters-http / reporting-currency-http / reporting-currency-integrity | 0 each | 27 / 6 / 9 | A-...-verify-integration.txt |
| test:integration per file outside folder: catalog-subscription-read-model / organization-identity-read-contracts / step-congestion | 0 each | 4 / 11 / 11 | same |
| Mutation: unitLabel -> definition.unit in public/operating-parameters.api.ts, integration HTTP | 1 (expected) | 2 failed / 25 passed; file restored | A-...-verify-mutation.txt |
| full test:integration / test:e2e / timing | not run | deferred to phase B | — |

Outside-folder integration specs found by grep (`/operating-parameters`, `OperatingParametersApi`):
catalog-subscription-read-model (imports OperatingParametersApi), organization-identity-read-contracts (history route),
step-congestion (PUT BACKLOG_ALERT_THRESHOLD). No e2e spec references the routes.

## Tasks

- Task 1 done (9f720744).
- Task 2 done (cf33c7b1): DTO discriminatedUnion -> OpenAPI oneOf (3 shapes, options maxItems 10), ParameterView/toWire 4 fields,
  exception itemProperties + businessMaximum 20, nested key + object-literal event (LD-17, date 2026-11-02, ownerDecision), LD-17 row.
- Task 3 partial (799da96f, 8d9bab06): module card done; roadmap row (docs/roadmap.md:302) still `not-started` / "Chưa có PR";
  PR description to FE not written (no PR yet). DoD "Spec/plan/roadmap phản ánh implementation cuối" not met for roadmap.

## AC coverage

All 9 test-matrix rows covered (see plan.md evidence table): unit policy spec :136/:140/:153/:181/:244/:257/:271; integration
:124/:206/:375; http :52/:158/:194; gate api-collection-contract green.

## Scope

No change to dashboards/requests; sibling `dashboard-request-queues-wiring` untouched; spec explicitly keeps only part (a).
DOCUMENT_MAX_SIZE_MB description unchanged (pinned by test :271). No migration.

## Registry / ledger rule (docs/rules/api-contract.md, Mảng lồng)

Entry is exact key `operationId#path`, bounded with positive maxItems 10 = schema maxItems (gate equality), exact source
(ENUM_OPTIONS_MAX enforced by response schema `.max()` + unit spec), removeWhen triggers on first change of source. Event
satisfies eventHygiene (gate green). Complies.

## Other findings (non-blocking)

- Low: docs/roadmap.md:302 row not updated (status/evidence) — Task 3 / DoD.
- Nit: test/support/api-collection-registry-exceptions.ts:81 `removeWhen` still names `parameter-definitions.ts` (old file
  name) while businessMaximum.source was corrected to `parameter-definitions.policy.ts`.
- FYI: nested entry carries `findings: ['LD-17']` on a `bounded` entry and the LD ledger row is "Info" (not a defect) —
  forced by eventHygiene `^LD-\d+$`; spec-approved.
- FYI: review README "Còn mở" paragraph and the 104-array inventory count in docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md
  not updated for LD-17/new nested array (historical snapshot; spec only asked for the table row).
- Optional: integration :124 checks full labels for 5 of 20 items; full table pinned only at unit level (:181).
