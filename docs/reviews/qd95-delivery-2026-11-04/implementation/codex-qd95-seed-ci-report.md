# Báo cáo triển khai BE — CI, self-service, một vai, seed hợp nhất

Ngày 04/11/2026. Repo BE: `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
Đầu vào thực tế: `dev` tại `ef3f3759` (commit tài liệu xuất hiện trong lúc đọc; trước đó là `d7b8fe8d`).
Giữ nguyên tài liệu nghiệp vụ tại Docs; chưa sửa/commit repo Docs. Không push, merge, PR, deploy, SSH hay kết nối database dùng chung.
Không chạy reset thật, không đặt biến consent Prisma. Các kết quả dưới đây là local; không thay bằng chứng Actions/DB thật.

## 1. ci-integration-shards

Nhánh: `feat/ci-integration-shards`, từ `dev`.

| Commit                      | Message                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `e2331f6e`                  | ci-integration-shards: Task 1 — tách select, ba shard và in-band      |
| `cfea4eae`                  | ci-integration-shards: Task 2 — giảm phút Actions theo lựa chọn Owner |
| `f7156cc` (nhánh thử riêng) | ci-integration-shards: Task 3 — chuẩn bị nhánh thử deploy gate đỏ     |

- Task 1–2: đã implement. Có job chọn suite không cài dependency, 3 shard, job in-band, tên artifact riêng; deploy đợi cả hai; OD-CI2/3/4/5 đã áp dụng.
- Task 3: chỉ chuẩn bị nhánh cục bộ `ci-trial/deploy-gate`; có test cố ý đỏ và probe, chưa push, chưa có run đỏ/xanh. Dùng `workflow_dispatch` trên nhánh thử để e2e cũng chạy và `select` chọn ALL. Nhánh chính không chứa probe/test đỏ.
- Task 4: **chờ số đo** ít nhất hai run `main`; giữ timeout 70 phút. Không nhận mục tiêu 20 phút là đã đạt.

Kiểm tra thật:

| Lệnh                                                     | Kết quả                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm test:scripts` cuối, ngoài sandbox, mock Docker/SSH | PASS: 275 tests, 273 pass, 2 skip, 0 fail (`ci-scripts-final.log`) |
| `node --test scripts/verify/check-script-order.test.mjs` | PASS: 4 tests                                                      |
| Đổi tạm matrix thành `[1, 2]`                            | FAIL đúng assertion expected `[1, 2, 3]`; đã hoàn lại bytes        |
| `pnpm rules:format`                                      | PASS ở Task 1 và Task 2                                            |
| `pnpm exec prettier --check .github/workflows/*.yml`     | PASS                                                               |
| `pnpm rules:check`                                       | PASS: 419 files, 3434 links, 0 errors                              |

Lần chạy script trong sandbox: 211 pass, 62 fail, 2 skip; nhiều lỗi `mkdir /c/Users/Asus: Permission denied` ở mock wrapper. Chạy ngoài sandbox đã hết lỗi quyền. Một lượt ngoài sandbox đọc assertion CI cũ trước khi file sửa, 272 pass/1 fail/2 skip; lượt cuối ở trên đã xanh. PowerShell chặn `pnpm.ps1`; dùng `pnpm.cmd`, không thay execution policy.

Test integration cố ý đỏ chỉ viết ở nhánh thử: `test/integration/platform/ci-deploy-gate.integration-spec.ts`, chưa chạy.

Lệch Files: Task 2 cập nhật assertion test cấu trúc cùng điều kiện `run`; spec lịch sử `be-test-architecture-redesign` chỉ thêm ghi chú trong `Changes and acceptance`. Test cũ kiểm provision bằng cắt từ job integration tới cuối file → test mới kiểm riêng từng job integration và mẫu số shard.

Chưa chạy `pnpm check`, integration, e2e — chờ phiên review.

## 2. qd95-self-service-every-role

Nhánh: `feat/qd95-self-service-every-role`, từ tip CI Task 2.

| Commit     | Message                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `0c9d21ea` | qd95-self-service-every-role: Task 1 — mở đọc cá nhân và chặn Super Admin hoàn trả |
| `3bde5840` | qd95-self-service-every-role: Task 2 — viết ma trận tám tài khoản và kênh mobile   |

Task 1–2 đã implement và viết test; chưa có bằng chứng integration. Ba route đọc mở cho mọi tài khoản, vẫn truy vấn theo người gọi. Super Admin nhận trang riêng và số đếm thay 403/NO_DATA_SOURCE; hoàn trả bị chặn trước đọc tham số và transaction. OpenAPI dashboard mô tả `saasIssueList` với `scope=mine`.

| Lệnh                                       | Kết quả thật                                                 |
| ------------------------------------------ | ------------------------------------------------------------ |
| `pnpm typecheck`                           | PASS ở cả hai task sau sửa lời gọi harness                   |
| `pnpm arch:check`                          | PASS; Task 1: 1643 modules, 8410 dependencies                |
| `pnpm rules:check`                         | PASS: 419 files, 3434 links, 0 errors                        |
| `pnpm test:gates`                          | PASS ở hai task: 16 suites, 327 tests                        |
| Unit employee-dashboard + return-request   | PASS: 2 suites, 8 tests                                      |
| Unit dashboard-section policy              | PASS: 7 tests                                                |
| HTTP my-software                           | PASS: 16 tests                                               |
| HTTP dashboards + my-requests sau sửa test | PASS: 2 suites, 67 tests                                     |
| `pnpm lint` cuối Task 2                    | PASS, exit 0                                                 |
| `pnpm openapi:export`                      | Đã sinh; diff đúng bốn operation của spec, schemas không đổi |

Hai lỗi HTTP khi sửa test (bảng `it.each` rỗng, mock thiếu `proposalNames`) và hai lỗi format trong file integration mới đã sửa; không phải lỗi có sẵn. Các test sau sửa đã chạy lại như bảng trên.

Integration đã viết/sửa nhưng chưa chạy:

- `test/integration/requests/self-service-every-role.integration-spec.ts` (mới).
- `test/integration/identity-access/mobile-session-roles.integration-spec.ts`.
- `test/integration/identity-access/manager-scope.integration-spec.ts`.
- `test/integration/licensing/my-software-http.integration-spec.ts`.
- `test/integration/dashboards/dashboards-http.integration-spec.ts`.
- `test/integration/requests/my-requests.integration-spec.ts`.
- `test/integration/requests/super-admin-cannot-request.integration-spec.ts`.

| Test cũ                                                | Test mới / lý do                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| My software từ chối vai khác EMPLOYEE                  | Từng vai riêng đọc dữ liệu cá nhân; thiếu token vẫn 401               |
| Dashboard employee từ chối vai khác                    | Từng vai đọc overview cá nhân; các dashboard theo vai giữ ma trận 403 |
| Super Admin my-requests 403 / dashboard NO_DATA_SOURCE | Trang riêng 200 / COUNTED 0, không chèn grant EMPLOYEE                |
| Super Admin không gửi Request, thiếu hoàn trả          | Thêm seat của Super Admin; hoàn trả 403, không thêm return/task/audit |

Bổ sung Files bắt buộc: `dashboard-section.policy.spec.ts` đổi vai được kiểm sang IT_ADMIN vì kiểu `DashboardRole` bỏ EMPLOYEE; giữ cả cho phép và từ chối. Suite mới dùng `DashboardHarness` kế thừa `RequestHarness` để dùng lại fixture quyền/báo lỗi/overview, không thêm harness.

Chưa chạy `pnpm check`, integration, e2e — chờ phiên review.

## 3. qd95-one-role-per-account

Branch: `feat/qd95-one-role-per-account`, stacked from self-service. Tasks 1-7 implemented and committed locally. No integration checkpoint or acceptance claimed.

| Commit   | Message                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| 3b3829ab | qd95-one-role-per-account: Task 1 — tạo một vai và bỏ selfServiceOnly                   |
| c824c179 | qd95-one-role-per-account: Task 2 — thêm thay vai nguyên tử và seam fixture             |
| 8680b797 | qd95-one-role-per-account: Task 3 — demo một vai và fixture shared-demo-v2              |
| 50f2b251 | qd95-one-role-per-account: Task 4 — remove additive role endpoints and migrate fixtures |
| 634c4c6c | qd95-one-role-per-account: Task 5 — preserve one role during recovery                   |
| 21de9ff7 | qd95-one-role-per-account: Task 6 — guard existing data and enforce one effective role  |
| b513595e | qd95-one-role-per-account: Task 7 — document role contract and review handoff           |

| Task | Actual quick-check results                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | typecheck/arch/rules pass; unit 70; HTTP 14; gates 327 pass. Initial lint failed obsolete suppression, fixed in Task 2.                                                                                               |
| 2    | typecheck/lint/arch/rules pass; unit 59; HTTP 20; gates 327 pass; export/routes generated (313 operations).                                                                                                           |
| 3    | unit 113 across 14 suites, then fixture/local API 12 passed; gates 327 passed. Full scripts failed LF template expectations; corrected templates and targeted 2 tests passed. Later Task 4 checks cover the type fix. |
| 4    | typecheck/lint/arch/rules pass; unit 62 / 4 suites; HTTP 23 / 2 suites; gates 327 pass; export/routes generated (311 operations).                                                                                     |
| 5    | typecheck/lint/arch/rules pass; unit 26 / 2 suites; gates 327 pass.                                                                                                                                                   |
| 6    | prisma:validate, typecheck/lint/arch/rules pass; gates 327 pass. No unit file changed; migration test written only.                                                                                                   |
| 7    | rules:check, rules:format, arch:docs:check pass. Initial format warning on added historical notes corrected.                                                                                                          |

Scope resolutions/deviations:

- Owner explicitly approved adding src/cli/dev-seed/dev-seed-report.ts and .spec.ts to Task 3 for initialRole. Original scope stop resolved.
- Task 1 reduced an existing function enough to make one suppression obsolete. Task 2 removed that suppression and reduced lint debt ceilings (51 to 50, total 107 to 106); no gate weakened.
- Fixture signature migration and remaining Manager seam rename completed in Task 4. Generic inserted account fixtures now default EMPLOYEE; constraint tests deliberately opt out with role:null.
- Task 3 local-demo role membership type error fixed with .some in Task 4. Task 3 full script suite was not green at its commit; targeted template fixes passed, and subsequent unified seed Task 1 full script suite passed.
- No shared database, real migration or reset was run. The migration guard and all SQL constraints remain pending real PostgreSQL review.

| Old test/fixture                                            | Replacement                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| roles array creation / validateRoleSet / forbiddenPairInSet | single role DTO, default EMPLOYEE, unknown roles field rejected                             |
| selfServiceOnly                                             | property absent; roles and managerScope retained                                            |
| combined IT_ADMIN + EMPLOYEE or MANAGER + IT_ADMIN          | separate single-role accounts; retained self-service and manager-scope checks               |
| POST/DELETE grant/revoke and additive-role history          | atomic PUT, no-op/history/audit/concurrency tests, removed routes 404                       |
| SQL allowed role combinations                               | one-role-per-account unique violation; revoke before replacement                            |
| zero-role last revoke / recovery preparation                | EMPLOYEE, with exact before/after recovery roles and audits                                 |
| shared-demo-v1                                              | v2, 23 people / 21 accounts, separate DS1-ITOH Manager, initialRole/finalRole resume checks |

Integration/e2e files written/updated but NOT RUN:

- `test/e2e/auth-session.e2e-spec.ts`
- `test/e2e/free-request.e2e-spec.ts`
- `test/e2e/mobile-approver-journey.e2e-spec.ts`
- `test/e2e/mobile-channel-smoke.e2e-spec.ts`
- `test/e2e/paid-request-to-seat.e2e-spec.ts`
- `test/integration/_serial/database-roles-upgrade-rehearsal.integration-spec.ts`
- `test/integration/_serial/database-runtime-role-app.integration-spec.ts`
- `test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`
- `test/integration/budgets/spend-commitments.integration-spec.ts`
- `test/integration/catalog/application-http.integration-spec.ts`
- `test/integration/catalog/application-owners-http.integration-spec.ts`
- `test/integration/catalog/application-retirement-http.integration-spec.ts`
- `test/integration/catalog/document-http.integration-spec.ts`
- `test/integration/catalog/functional-group-http.integration-spec.ts`
- `test/integration/catalog/plan-http.integration-spec.ts`
- `test/integration/catalog/plan-terms-http.integration-spec.ts`
- `test/integration/catalog/reporting-currency-application.integration-spec.ts`
- `test/integration/catalog/seat-baseline-contracts.integration-spec.ts`
- `test/integration/catalog/seat-guards-http.integration-spec.ts`
- `test/integration/catalog/vendor-dictionary-http.integration-spec.ts`
- `test/integration/catalog/vendor-tax-profile-http.integration-spec.ts`
- `test/integration/dashboards/dashboards-http.integration-spec.ts`
- `test/integration/data-import/employee-import-preview-http.integration-spec.ts`
- `test/integration/finance/exchange-rates-http.integration-spec.ts`
- `test/integration/identity-access/account-concurrency.integration-spec.ts`
- `test/integration/identity-access/account-creation-http.integration-spec.ts`
- `test/integration/identity-access/account-invitation-constraints.integration-spec.ts`
- `test/integration/identity-access/account-list-and-redeem.integration-spec.ts`
- `test/integration/identity-access/account-lock-http.integration-spec.ts`
- `test/integration/identity-access/account-role-change.integration-spec.ts`
- `test/integration/identity-access/account-roles-http.integration-spec.ts`
- `test/integration/identity-access/auth-http.integration-spec.ts`
- `test/integration/identity-access/direct-approval-roles-concurrency.integration-spec.ts`
- `test/integration/identity-access/direct-approval-roles-transfer-concurrency.integration-spec.ts`
- `test/integration/identity-access/direct-approval-roles.integration-spec.ts`
- `test/integration/identity-access/manager-scope.integration-spec.ts`
- `test/integration/identity-access/mobile-session-roles.integration-spec.ts`
- `test/integration/identity-access/one-role-per-account-migration.integration-spec.ts`
- `test/integration/identity-access/password-change-http.integration-spec.ts`
- `test/integration/identity-access/query-count-harness.integration-spec.ts`
- `test/integration/identity-access/recovery-cli.integration-spec.ts`
- `test/integration/identity-access/role-grant-constraints.integration-spec.ts`
- `test/integration/identity-access/step-sla-finance-question.integration-spec.ts`
- `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`
- `test/integration/identity-access/super-admin-transfer-removed.integration-spec.ts`
- `test/integration/identity-access/worker-mail-loop.integration-spec.ts`
- `test/integration/installation/demo-dataset-calendar.integration-spec.ts`
- `test/integration/installation/demo-dataset-rerun.integration-spec.ts`
- `test/integration/installation/demo-dataset.integration-spec.ts`
- `test/integration/licensing/assignment-owner-department-guard.integration-spec.ts`
- `test/integration/licensing/department-tools-http.integration-spec.ts`
- `test/integration/licensing/license-key-http.integration-spec.ts`
- `test/integration/licensing/license-key-reveal-quota.integration-spec.ts`
- `test/integration/licensing/my-software-http.integration-spec.ts`
- `test/integration/licensing/provisioning-decision-http.integration-spec.ts`
- `test/integration/licensing/provisioning-department-and-role.integration-spec.ts`
- `test/integration/licensing/provisioning-failure-http.integration-spec.ts`
- `test/integration/licensing/provisioning-grant-http.integration-spec.ts`
- `test/integration/licensing/provisioning-queue-http.integration-spec.ts`
- `test/integration/licensing/provisioning-revocation-complete.integration-spec.ts`
- `test/integration/licensing/provisioning-revocation-open.integration-spec.ts`
- `test/integration/licensing/return-request-conditions.integration-spec.ts`
- `test/integration/notifications/mobile-inbox-isolation.integration-spec.ts`
- `test/integration/onboarding/onboarding-http.integration-spec.ts`
- `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`
- `test/integration/organization/cost-centers-http.integration-spec.ts`
- `test/integration/organization/department-manager-http.integration-spec.ts`
- `test/integration/organization/employee-directory.integration-spec.ts`
- `test/integration/organization/employee-manual-http.integration-spec.ts`
- `test/integration/organization/first-placement-lean.integration-spec.ts`
- `test/integration/organization/organization-concurrency.integration-spec.ts`
- `test/integration/organization/organization-identity-read-contracts.integration-spec.ts`
- `test/integration/personnel/offboarding-unplaced.integration-spec.ts`
- `test/integration/personnel/role-duties.integration-spec.ts`
- `test/integration/requests/access-request-control-gate.integration-spec.ts`
- `test/integration/requests/access-request-internal-path.integration-spec.ts`
- `test/integration/requests/access-request-internal-registration.integration-spec.ts`
- `test/integration/requests/access-request-new-software.integration-spec.ts`
- `test/integration/requests/access-request-withdrawal.integration-spec.ts`
- `test/integration/requests/assessment-queue.integration-spec.ts`
- `test/integration/requests/beneficiary-transferred-closure.integration-spec.ts`
- `test/integration/requests/controlled-wait.integration-spec.ts`
- `test/integration/requests/group-request-grant.integration-spec.ts`
- `test/integration/requests/leaver-request-closure.integration-spec.ts`
- `test/integration/requests/mobile-employee-requests.integration-spec.ts`
- `test/integration/requests/mobile-need-decision.integration-spec.ts`
- `test/integration/requests/my-requests-read.integration-spec.ts`
- `test/integration/requests/my-requests.integration-spec.ts`
- `test/integration/requests/need-decision-queue.integration-spec.ts`
- `test/integration/requests/request-outcome-listeners.integration-spec.ts`
- `test/integration/requests/request-status-notifications.integration-spec.ts`
- `test/integration/requests/request-timings.integration-spec.ts`
- `test/integration/requests/requests-dashboard-facts.integration-spec.ts`
- `test/integration/requests/return-request.integration-spec.ts`
- `test/integration/requests/saas-issue-handling.integration-spec.ts`
- `test/integration/requests/saas-issue-submit.integration-spec.ts`
- `test/integration/requests/self-service-every-role.integration-spec.ts`
- `test/integration/requests/service-account-request.integration-spec.ts`
- `test/integration/requests/spend-approver-revoke-race.integration-spec.ts`
- `test/integration/requests/spend-delegated-requests.integration-spec.ts`
- `test/integration/requests/spend-reviewer-separation.integration-spec.ts`
- `test/integration/requests/spending-approver-grant-blockers.integration-spec.ts`
- `test/integration/requests/spending-approver-party-concurrency.integration-spec.ts`
- `test/integration/requests/step-reassignment.integration-spec.ts`

Chưa chạy `pnpm check`, integration, e2e — chờ phiên review.

## 4. unified-seed-reset

Branch: `feat/unified-seed-reset`, from one-role Task 7 (`b513595e`). Tasks 1-8 implemented and committed locally. Final BE working tree is clean: git status --short empty; git diff and git diff --cached both exit 0. No acceptance or integration checkpoint claimed.

| Commit   | Message                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| 2e46c71c | unified-seed-reset: Task 1 — replace demo command with seed and split fixture        |
| f1b046cd | unified-seed-reset: Task 2 — check seed state and bootstrap under apply lock         |
| 048f3623 | unified-seed-reset: Task 3 — support all-year seed and next-year budgets             |
| 468e0183 | unified-seed-reset: Task 4 — audit fixture and document every demo record            |
| 82f56dc3 | unified-seed-reset: Task 5 — remove obsolete local seed command and graph            |
| d8943914 | unified-seed-reset: Task 6 — add guarded local reset and seed wrapper                |
| de6393e0 | unified-seed-reset: Task 7 — add VPS reseed workflow and backup retention            |
| a5494906 | unified-seed-reset: Task 2 — complete runtime apply and empty database race coverage |
| 5e42e186 | unified-seed-reset: Task 8 — document local and VPS seed operations                  |

| Task | Status and actual verification                                                                                                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Command/graph renamed seed; old wrappers/templates removed; v2 split by capability. typecheck/lint/arch/rules passed; seed unit 81 / 10 suites, gates 327 / 16 suites. Build passed; seed-cli exists, demo-dataset-cli absent. Scripts: 253 total / 251 pass / 2 skip / 0 fail, exit 0.                                                                                     |
| 2    | check protocol, password preflight, lock before state, optional EMPTY bootstrap, runtime-safe inspection and audit field projection. Unit 74 / 7 suites passed; typecheck/lint/arch/rules and gates 327 passed after Owner-approved wrapper.                                                                                                                                |
| 3    | All-year calendar and shared paid-request spend date; next-year budgets for ENG/MKT/SAL. Calendar/run unit 22 / 2 suites passed; typecheck/arch/rules/gates passed, focused lint passed. Final full lint covers the resulting tree.                                                                                                                                         |
| 4    | Every fixture record audited in plan; README account/record tables; R2 planLine 2 fixed. Fixture unit 5 passed; typecheck/arch/rules/gates passed. An overlapping lint invocation saw removed suppression config while still scanning retired dev-seed files and failed; not labeled a pre-existing failure.                                                                |
| 5    | dev-seed command/graph/API/types/tests and local-only organization helper removed; toBrief preserved in new mapper. Build passed (9 aliases, dev-seed-cli absent); typecheck/arch/rules/gates 324 passed. Lint caught an unused DepartmentStatus import, corrected and amended Task 5; focused and subsequent full lint passed.                                             |
| 6    | Guarded local wrapper, host classifier, env template and cleanup. Targeted script tests 35 passed. Gates 325 passed. Full scripts: 288 total / 286 pass / 2 skip / 0 fail, exit 0. Final lint/typecheck/arch/rules pass. Real local reset waiting Owner.                                                                                                                    |
| 7    | VPS lock/protocol/check/backup/confirmed recreation/provision/migrate/reconcile/ready/apply, report and failure recovery; per-kind retention. bash -n passed. Targeted fake-Docker/retention 19 passed, including rerun after final wrapper edits. Full scripts: 297 total / 295 pass / 2 skip / 0 fail, exit 0. Quick checks/gates 325 passed. Real VPS run waiting Owner. |
| 8    | Local/VPS guide, old-image one-time rebuild runbook, reset rules and module/docs handoff complete. rules:check: 420 files / 3446 links / 0 errors; rules:format passed. Final scoped unit: 145 / 15 suites; gates 325 / 16 suites; typecheck/arch pass. Final full lint passed (exit 0).                                                                                    |
| 9    | NOT STARTED: plan requires Owner to seed VPS first. Docs repo remains unchanged/read-only; no Docs commit.                                                                                                                                                                                                                                                                  |

Final scoped command evidence (raw logs not kept in the repo):

- `pnpm typecheck`: PASS (`seed-final-typecheck.log`).
- `pnpm lint`: PASS, exit 0 on the final tree (`seed-final-lint.log`); focused late-test lint also passed.
- `pnpm arch:check`: PASS, 1634 modules / 8385 dependencies (`seed-final-arch-check.log`).
- `pnpm rules:check`, `pnpm rules:format`: PASS after final documentation updates.
- `pnpm test:gates`: PASS, 16 suites / 325 tests (`seed-final-test-gates.log`).
- `pnpm test -- src/cli/seed ...` with changed installation/audit unit paths: PASS, 15 suites / 145 tests (`seed-final-unit.log`).
- `pnpm test:scripts`: PASS, 297 total / 295 passed / 2 skipped / 0 failed (`seed-task7-scripts.log`). Fake Docker/SSH only.
- `node --test scripts/verify/seed.test.mjs scripts/verify/backup-retention.test.mjs`: PASS, 19 tests after final source edits (`seed-task7-targeted-scripts.log`).
- Build in Tasks 1/5 passed; aliases removed as specified. No build or check was used to connect to a database.

Owner confirmations and spec/plan deviations:

1. KEEP `--allow-bootstrap` according to the spec. Plan Task 2 incorrectly said to remove it; Owner explicitly chose to keep it and requested the discrepancy in this report. The plan parenthesis is corrected; both wrappers pass it, direct EMPTY apply requires it.
2. Owner approved changing ONLY the calendar link target at spec.md:63 outside Changes and acceptance after the folder move. It now targets src/cli/seed/seed-calendar.ts; historical label remains. The redirect guide preserves the old anchor so historical links still resolve.
3. Spec.md:155-156 requested a re-export from public/password.policy.ts; architecture-boundaries.gate-spec.ts:546-552 prohibits every business-module re-export. Owner explicitly approved a pure public wrapper delegating to the existing credential policy. No policy duplication or gate weakening; the initial failing gate and subsequent passing gate are recorded.
4. Necessary companion edits: apply-lock key changed in its owning DemoAccountsApi during Task 1; retired command references in adjacent comments updated in Task 5. Two deleted suppression entries required lowering lint-debt ceilings (complexity 56 to 55, lines 50 to 49, total 106 to 104). No new dependency or raised gate threshold.
5. Final test-matrix audit added a follow-up Task 2 commit after Task 7: production/runtime apply (not only check) and concurrent EMPTY apply. Typecheck and focused lint passed; integration was NOT run. This is a sequencing deviation for test coverage, with no business implementation change.
6. No claim of green CI after every historical task commit: recorded intermediate type/format/fixture/unused-import failures were fixed locally. The final quick results describe the final implementation; full PostgreSQL verification remains for review.

| Old tests/features                     | Replacement                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| demo-dataset unit/integration          | renamed seed tests; current behavior retained in Task 1, then explicit check/bootstrap/calendar tests added              |
| old VPS/local SSH-tunnel wrapper tests | removed with retired wrappers; new local guard/confirmation/cleanup and fake-Docker VPS safety matrices                  |
| dev-seed command/API/local guard tests | removed with that feature per plan; seed bootstrap/one-role/check/fixture and wrapper tests cover the new path           |
| required organization/operator options | fixture organization; operator-reference; check without API credentials; explicit allow-bootstrap                        |
| December apply refusal                 | December plan/apply, both budget years, first-working-day dates and test-only forced branch; cross-year refusal retained |
| R2 off-plan fixture                    | approved planLine 2, checked in fixture tests; R7 remains off-plan                                                       |
| retention of pre-migrate only          | ten newest per kind plus all young pre-migrate/pre-reseed dumps; unknown names untouched                                 |

Integration files written/updated, NOT RUN:

- `test/integration/installation/seed.integration-spec.ts`
- `test/integration/installation/seed-rerun.integration-spec.ts`
- `test/integration/installation/seed-calendar.integration-spec.ts`
- `test/integration/installation/seed-bootstrap.integration-spec.ts`
- `test/integration/_serial/seed-check-runtime.integration-spec.ts` (check including NOT_MIGRATED; apply in production/runtime child with API runtime role)

Owner/review work remaining: full check/integration/e2e; actual local reset/seed; one-time old-image VPS rebuild and seed; then Docs Task 9. No push, merge, PR, deploy, SSH or shared database access occurred. The guide contains Owner-run commands; this session did not execute them.

Chưa chạy `pnpm check`, integration, e2e — chờ phiên review.
