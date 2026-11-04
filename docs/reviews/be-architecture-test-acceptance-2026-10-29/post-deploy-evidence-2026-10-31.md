# Post-deploy checkpoint — 31/10/2026

## Source and CI/CD

Production SHA: `c14c06a36c6cfa6158bddd0a09b11e210df2605d`, branch main.

- [CI 41191829114](https://github.com/WDP301-FA26-GR8/BE/actions/runs/41191829114): quality, HTTP contract,
  integration and E2E smoke success. Integration job 34:11 (parallel 30:27, timing 0:56, serial 1:15).
- [CD 41194738633](https://github.com/WDP301-FA26-GR8/BE/actions/runs/41194738633): build/push and SSH deploy success;
  image `ghcr.io/wdp301-fa26-gr8/be:c14c06a36c6cfa6158bddd0a09b11e210df2605d` live/ready, attempt `41194738633-1`.
- Both runs are workflow_dispatch, not newly triggered by this verification. CI's deploy job skipped; separate CD
  deployed. No claim of an A/B deploy-gate trial or nightly execution.
- SSH confirmed API running that exact image, restart 0, OOM false. Source was read from a GitHub snapshot of the
  deployed commit; current local WIP is a different work package and was preserved.

## H7-SEQ: live permission verification complete

CD logged `ops:db-roles reconcile: DONE`, `findings: none`. A separate read-only CLI `db-roles verify --json`, using
the same pinned image and Compose migrate service/deploy role, returned:

```json
{
  "command": "verify",
  "outcome": "CONSISTENT",
  "database": "software_license_management",
  "deployRole": "slm_deploy",
  "runtimeRole": "slm_runtime",
  "createdRoles": [],
  "databaseOwnerChanged": false,
  "transferredObjects": 0,
  "findings": []
}
```

The policy in that commit grants SELECT/UPDATE to exactly personnel_notice_seq and saas_issue_seq; default sequences
remain USAGE-only. The verifier checks the effective matrix, not only database connectivity. No manual GRANT,
reconcile write, new personnel notice/SaaS issue, reset or bootstrap was performed by this checkpoint. Application
path tests were already in CI; manual shared-server flow testing remains FE-owned.

## Seed connection investigation: still open

- Original wrapper plan failed before dataset processing with `The API at --api-url cannot be reached`.
  Report: `/opt/slm/backend/demo-dataset/20261031T112924Z-shared-demo-v1-plan.txt`.
- Same Compose-network probe: `http://slm-api:4000/api/v1/health/live` 200 in 2169 ms; port 3000 ECONNREFUSED in 10 ms.
  Existing port 4000 is correct. API restart/OOM remain zero. A resource sample is not proof of conditions at the failure.
- A temporary copy of the wrapper added a fetch preload recording only phase, response status, allowlisted error
  code/class and elapsed time. No body/header/token/password, no timeout/retry change; production wrapper/config/image
  unchanged. This instrumented plan returned 0 with **24 existing dataset steps**. Login and identity read both 200;
  report `/opt/slm/backend/demo-dataset/20261031T113547Z-shared-demo-v1-plan.txt`.
- This was diagnostic instrumentation, not retry-until-green evidence of a fix. The failing cause was not captured;
  the prior `database connection was retired` failure was not reproduced. Do not call the seed connection issue fixed,
  infer overload/incorrect port, or claim apply idempotency exit 2 from a plan result.
- Plan creates/ends auth sessions and related audit records; it does not create/update dataset business records.
  No apply or destructive operation was run. Existing reports are retained as operator evidence.

## Acceptance and documentation

- Owner chose **40 minutes** for integration with a monitored exception to the p95 + 50% default. Workflow and per-test
  timeouts unchanged; P7/P8 remain waived. This closes the timeout-choice question, not an assertion of p95 compliance.
- ADR-0019: Owner first requested the summary, then explicitly accepted on 31/10/2026 (“ADR-0019 thì tui accept nha”).
  ADR status is now Accepted. The [Owner worksheet](owner-adr0019-o7-2026-10-31.md) keeps the 10 route traces pending:
  human O7 completion is not inferred from acceptance of the architecture.
- Docs API-Integration is regenerated from this deployed snapshot, OpenAPI SHA-256
  `9897d374545fac8c0598fe39cade8dd265ed3c279a073978f18ae0f2e57802fd`, 287 operations, 3811 explained field rows.
  Generator now supports the F01 uniqueItems/minProperties constraints and root-body rules; focused red/green and all
  44 generator tests passed. Client regeneration/manual QA in FE are not performed here.

## Resource ledger

Owned one-off containers: `slm-p10-h7-verify-20261031`, `slm-p10-api-probe-20261031`, wrapper help/plan containers
`slm-production-api-run-e214a2392f17`, `slm-production-api-run-1f0e7a23c824`, `slm-production-api-run-efe344e331c3`,
`slm-production-api-run-bf0a607bd2a2`, all invoked with --rm. Exact final absence is checked during cleanup.
Temporary diagnostic directory: `/opt/slm/backend/.tmp-seed-diagnostic-p10-20261031` (two non-secret files only).
Local snapshot directory: workspace `.tmp-postdeploy-c14c06a-20261031`. Cleanup results go into the prompt handoff.
No real env, password, key or token was read/printed by the reviewer; the existing wrapper loads its private config
internally for the explicitly authorized plan command.

Final cleanup checked: all six owned one-off container names absent; VPS diagnostic directory and its two files removed;
local snapshot directory removed after exact path/reparse checks. The two operator reports remain as intentional evidence.
Final local checks: 44 generator tests, canonical render parity/coverage/links pass; BE rules 325 files / 2793 links /
0 errors, rules:format and scoped formatting/syntax/diff checks pass. No full BE source suite rerun for these documentation
changes, and no result attributed to the unrelated current source WIP.
