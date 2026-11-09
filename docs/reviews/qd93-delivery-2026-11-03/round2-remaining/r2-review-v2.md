# r2 review v2 — Việc 2 `6f6058aa` (dashboard-request-queues-wiring)

Skills read: `code-review-and-quality` (five-axis review), `security-and-hardening` (authz/IDOR, SQL; read-only count paths).
Verification mapping: no test runs allowed by brief → evidence = reading code/diff, `git show`, `rg`.
Worktree `BE-qd93-audit2` @ `7102293e`, base `30d14ac4`. No later commit touches these files.

## Which dashboards does the spec target — and was that what was wired?

- Spec + FE finding `API-DOC-F06` (roles/manager.md:16, roles/employee.md:11, tools/annotations/dashboards.md:13): Employee
  `sections.requests` (= `meAccessRequestList?view=open`) and Manager `sections.needApprovals` (= `needDecisionList`). Super
  Admin / IT Admin pages explicitly out of scope.
- Code wires exactly these two. Correct.
- **Gemini report is false** (report lines 24, 45–52): `approverCount`, `heldBySuperAdminCount`, `queueCount`,
  `waitingUnderControlCount`, `AccessRequestQueueReadApi`, `SuperAdminDashboardService` changes — none exist anywhere in
  `src`/`test` (`rg` = 0 hits); `super-admin/` untouched in 30d14ac4..7102293e. The report describes invented work; the code
  does not contain it (no scope creep in code).

## Findings

### High (report integrity, no code defect)
- H1 `NOTE MD/gemini-qd93-remaining-report.md:24,45-52` — claims Super Admin fields that do not exist. Fix: rewrite the Việc 2
  entry: "Employee `requests` + Manager `needApprovals` now COUNTED via `RequestsDashboardApi`; Super Admin with EMPLOYEE gets
  `NOT_AVAILABLE NO_DATA_SOURCE`; enum loses REQUEST_QUEUE_NOT_DELIVERED". Verified by reading.

### Medium
- M1 Wire contract text stale → FE told the wrong thing (spec: "module card và comment … sửa câu 'not delivered yet'"; consistency
  note to be in OpenAPI description). Verified:
  - `src/modules/dashboards/employee/employee-dashboard.controller.ts:29` (openapi.json:72788) "the requests of the caller, which
    say they are not available yet instead of a number".
  - `src/modules/dashboards/manager/manager-dashboard.controller.ts:29` (openapi.json:72918) "the need decisions waiting … say
    they are not available yet".
  - `src/modules/dashboards/employee/employee-dashboard.dto.ts:17` (openapi.json:95747) "…waiting and their results; the list of
    them is not delivered yet" — also wrong now: the count is open-only (Owner decision 2), and NO_DATA_SOURCE for Super Admin
    is undocumented.
  - `src/modules/dashboards/manager/manager-dashboard.dto.ts:13` (openapi.json:95856) "the queue is not delivered yet".
  Fix: rewrite the 4 texts (employee: "requests the caller sent that are not over, as meAccessRequestList?view=open counts them;
  NOT_AVAILABLE NO_DATA_SOURCE for a Super Admin; results via view=ended; read separately from the list"); manager: "need steps
  given to the caller now, as needDecisionList counts them"), then `pnpm openapi:export`.
- M2 Tests do not discriminate the filters (task asked "0 and >0"; spec matrix asks much more). Verified by reading
  `test/integration/requests/requests-dashboard-facts.integration-spec.ts`:
  - E1 only has 2 open requests; no ended/rejected/withdrawn/draft request and no on-behalf request for E1 (matrix row 1). A facade
    using `statesOf(undefined, …)` (all sent states) or dropping the requester condition for on-behalf would still pass. Same in
    `dashboards-http.integration-spec.ts:154-157` (e1 has one open request, nothing ended).
  - `needDecisionsHeldBy` >0 case (:98-105) has no setup of its own: it relies on the requests sent in the previous `describe`
    (order coupling) and asserts only `> 0`. No own-request, decided step, handed-over step or group step (matrix row 2), so
    dropping `notOwn`/`state`/`routingRow` would not be caught by this file.
  Fix: in `beforeAll`, give E1 one each of open, COMPLETED/REJECTED/WITHDRAWN, a draft, and a request a head sends on E1's behalf;
  assert exact numbers (open = n) and equality with `view=open` *and* inequality with no-view total. For H1: own request, a decided
  step, a step handed to another person, a group step; assert exact count.

### Low (verified by reading)
- L1 `src/modules/requests/need-decision-queue/need-decision-queue.repo.ts:67-71` — `pageOpenOf`'s JSDoc ("One page … share one
  snapshot") now sits above `countOpenOf`, followed by a second JSDoc; `pageOpenOf` lost its doc. Move `countOpenOf` below.
- L2 same file `:95` — `openWhere` is `export`ed but used only in-file. Drop `export`.
- L3 `src/modules/requests/public/requests-dashboard.api.ts:25` — `!actor.roles ||` dead guard (`roles` is a required
  `readonly string[]`). Remove.
- L4 `src/modules/dashboards/employee/employee-dashboard.service.ts:19-23` and `manager/manager-dashboard.service.ts:33-38` — class
  JSDoc still says the requests / need decisions "have no source yet / not delivered". Spec required fixing these.
- L5 `src/modules/requests/requests.module.ts:1` — new import placed before `@nestjs/common`, unlike the file's grouping (no lint
  rule enforces it). Cosmetic.
- L6 `test/integration/dashboards/dashboards-http.integration-spec.ts:137,197` — comments still "the requests have no list yet" /
  "the need queue say they have no source".
- L7 `src/modules/dashboards/section/dashboard-section.policy.spec.ts` — matrix row "Lý do thiếu nguồn" planned a unit check; not
  added (typecheck covers removal of the literal). Optional.
- L8 `docs/workspace/items/dashboard-request-queues-wiring/{spec,plan}.md` not updated: plan "Triển khai: not-started", evidence
  column "planned", DoD unchecked, no assignee. DoD requires spec/plan to reflect the implementation.
- Info: Docs FE pages (`roles/employee.md:11`, `roles/manager.md:16`, `tools/annotations/dashboards.md:13,17,21`,
  `changes/CHANGELOG.md:211` F06) and `a10-*` specs still say NOT_AVAILABLE — to update when this ships (not a BE defect).

## Checked and correct
- `openRequestsSentBy` = `MyRequestsRepo.countOf({requesterEmployeeId, states: statesOf('open', undefined)})` with the same
  `whereOf` as `pageOf` used by `MyRequestsService.list` (no type/from/to): own requests only, no draft, on-behalf excluded,
  AWAITING_IT_CLOSE included. `mayRequest` reused (not copied) → null → `NO_DATA_SOURCE` for Super Admin, matching the list's
  refusal.
- `needDecisionsHeldBy` = `countOpenOf(employeeId)` → `openWhere` shared with `pageOpenOf` (NEED, PENDING, assignee = caller,
  HELD_ROUTING_ROWS, notOwn), no type filter = `needDecisionList` without `type`. Per-assignee, not per-department — same as the
  list (spec-conformant).
- One `count` per page, no row reads, no N+1; parallel with existing reads via `Promise.all`.
- Authz unchanged: `assertHoldsRole` EMPLOYEE / MANAGER + headed department still run first; facade takes the caller's own
  `employeeId` from the principal (no parameter → no IDOR).
- `REQUEST_QUEUE_NOT_DELIVERED`: gone from `MISSING_SOURCE_REASONS`, all 28 enum copies in openapi.json, src and tests (only
  historical docs/specs mention it). HTTP spec answers updated.
- Module wiring: provider + export in `RequestsModule`, `DashboardsModule` imports it, T7→T5 edge, module-graph regenerated (65
  edges), `PUBLIC_CONTRACT_EXPORTS` entry, both module cards updated. No new operation → no manifest change needed.
- Super Admin integration case: SUPER_ADMIN+EMPLOYEE is not a forbidden combination in `role_grants_forbid_combination`; the grant
  is removed in `finally`.
