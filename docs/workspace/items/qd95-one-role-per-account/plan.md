# Plan: qd95-one-role-per-account

- [Spec](spec.md); revision đầu vào: Docs `0125072` + `QĐ-95` (thay pin khi Owner commit), BE `d7b8fe8d`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (04/11/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `docs/rules/{database-business,api-contract,module-structure,operational-commands}.md`, `test/README.md` (database test
riêng, `TEST_DATABASE_ADMIN_URL`), `src/modules/identity-access/README.md`, `identity-access/{accounts,access,recovery,public}/**`,
migration `20261102082906_identity_direct_roles` và `20261103160000_identity_drop_approval_role_holders`, `src/cli/demo-dataset/**`,
mục _Owner decisions_ của spec (mọi mục đã đóng 04/11/2026). Kiểm `qd95-self-service-every-role` đã merge. Lập bảng **test cũ →
test mới** (cuối file) trước khi xóa test tổ hợp vai: thay test của tính năng bị bỏ là được, không làm yếu hành vi giữ lại.

Mỗi task sửa harness và test mà hợp đồng của nó đổi, để cây test build được (`tsconfig.json` gồm `test/`) và **CI xanh sau từng
task**: route mới có trước khi demo chuyển sang nó (Task 2 → Task 3), route cũ chỉ bỏ khi không còn người gọi (Task 4), chỉ mục DB
là bước cuối (Task 6) khi mọi đường ghi đã một vai.

- Quick set = `pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check && pnpm rules:check && pnpm test:gates`.
- Hợp đồng HTTP đổi (Task 1, 2, 4) thêm `pnpm test:http && pnpm openapi:export && pnpm arch:routes && pnpm arch:docs:check &&
pnpm test:e2e`.
- Integration theo file: `pnpm test:integration -- <file…>`; full suite (integration, `:serial`, `:timing`, e2e) một lần cuối do
  Owner duyệt.

## Tasks

### Phase A — đường ghi một vai, route đổi vai (route cũ còn chạy)

### Task 1: tạo tài khoản `role?` (mặc định `EMPLOYEE`); bỏ `/me.selfServiceOnly`

Hai đổi chạm cùng các dòng test (tài khoản tạo qua API không vai, khẳng định `roles: []`/`selfServiceOnly: true`) nên đi cùng task.

- Files:
  - Source: `identity-access/accounts/account-management.dto.ts:14-18`, `accounts/app-users/account-invitation.service.ts`
    (một vai; bỏ `validateRoleSet`), `accounts/app-users/account-administration.policy.ts` (+ spec: bỏ `validateRoleSet`,
    `forbiddenPairInSet`), `accounts/app-users/app-users.controller.ts` (OpenAPI của `appUserCreate`), `access/me.service.ts:23,54`
    (+ `me.service.spec.ts:83-88`), `access/me.dto.ts:27`.
  - Harness/test: `test/support/api-accounts.ts:52-64`, `test/support/builders/account.builder.ts` (`AccountSpec.role`),
    `test/support/request-harness.ts:153,159`, `test/support/department-harness.ts:198,205`, mọi chỗ gọi `createActivatedAccount(`,
    `accountMadeThroughTheApi(`, `.staff(` mà `pnpm typecheck` báo; `test/e2e/auth-session.e2e-spec.ts:108`,
    `test/e2e/mobile-channel-smoke.e2e-spec.ts:69-72`; `test/integration/identity-access/mobile-session-roles.integration-spec.ts:30,304,327,330,337-352`,
    `test/integration/organization/department-manager-http.integration-spec.ts:81-110`,
    `test/integration/organization/employee-manual-http.integration-spec.ts:626`,
    `test/integration/identity-access/auth-http.integration-spec.ts:96`, `account-roles-http.integration-spec.ts:50`,
    `account-creation-http.integration-spec.ts`.
- Depends on: `qd95-self-service-every-role` merge.
- Acceptance: dòng `US-01-01` AC-23 và `/me` của test matrix; không còn tài khoản tạo qua API mà không có vai.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff chỉ `appUserCreate`, `meGet`); `pnpm test:integration --
test/integration/identity-access/account-creation-http.integration-spec.ts test/integration/identity-access/mobile-session-roles.integration-spec.ts
test/integration/organization/department-manager-http.integration-spec.ts` và các file typecheck đã báo; `pnpm test:e2e`.

### Task 2: `PUT /api/v1/app-users/{id}/role` và seam harness trong tiến trình

- Files:
  - Source: `accounts/app-users/app-users.controller.ts` (`@Put('app-users/:id/role')`, `appUserChangeRole`, ví dụ lỗi),
    `account-management.dto.ts` (`changeRoleBodySchema`), `accounts/app-users/account-status.service.ts` (`changeRole`, khóa ba
    bước cho mọi vai), `accounts/account.http-errors.ts` (ví dụ), `app-users.controller.spec.ts`, `account-status.service` unit nếu có.
  - Hợp đồng: `openapi.json`, `docs/generated/routes.md` (`pnpm arch:routes`), `test/support/openapi-example-manifest.ts`
    (`appUserChangeRole: 'ROLE.CHANGED'`), `test/support/openapi-example-route-codes-identity-access.ts` (mã 404/409/422 của spec),
    `test/support/api-coverage-manifest.ts` (`PUT /api/v1/app-users/{id}/role`).
  - Harness: `test/support/builders/account.builder.ts:140-175` (`changeRoleTo`, `setSpendingApprover`, `clearSpendingApprover`),
    `organization.builder.ts`, `department-harness.ts`, `handover-harness.ts`, `request-harness.ts:180-191`, 13 spec gọi chúng (grep
    `ensureManagerGrant|setSpendingApprover|clearSpendingApprover`), `test/integration/requests/spend-reviewer-separation.integration-spec.ts:38-51`.
  - Test mới: `test/integration/identity-access/account-role-change.integration-spec.ts` (đổi vai, từ chối, đồng thời, bước đang chờ).
- Depends on: Task 1.
- Acceptance: dòng `US-01-01` AC-24/AC-4, idempotent, AC-7, AC-13/AC-14, AC-17, AC-18, AC-21; `US-01-03` AC-1, AC-3, AC-6/AC-12/AC-13,
  AC-10, AC-11; đồng thời cùng tài khoản; một audit `ROLE.CHANGED`; người nghe `requests`/`budgets`/`licensing` như trước.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff chỉ thêm `appUserChangeRole`); `pnpm arch:routes`;
  `pnpm test:integration -- test/integration/identity-access/account-role-change.integration-spec.ts
test/integration/requests/spend-reviewer-separation.integration-spec.ts` + 13 spec của harness; `pnpm test:e2e`.

### Checkpoint A

Quick set + `pnpm test:http` + integration các file đổi xanh; `pnpm test:e2e` xanh; tự review diff theo spec.

### Phase B — dataset demo một vai

### Task 3: hợp đồng tài khoản demo `initialRole`/`finalRole`, bước demo dùng `PUT`, fixture `shared-demo-v2`

- Files: `src/modules/identity-access/public/identity-access.types.ts:182,190-197`, `local-demo-account.api.ts` (+ spec, dòng
  80-83), `src/modules/installation/public/demo-accounts.types.ts`, `demo-accounts.api.ts` (+ spec), `dev-seed.api.ts` (+ spec),
  `dev-seed.types.ts`; `src/cli/demo-dataset/steps/organization.steps.ts`, `fixture/demo-fixture.types.ts`,
  `fixture/shared-demo-v2.ts`, `fixture/shared-demo-v2-sales-marketing.ts` (mới), xóa `fixture/shared-demo-v1*.ts`,
  `demo-dataset-steps.ts`, `demo-dataset.arguments.ts` (+ spec), các spec unit nêu `shared-demo-v1`,
  `src/infrastructure/database/session-advisory-lock.spec.ts:34`, `test/integration/installation/demo-dataset*.integration-spec.ts`,
  `scripts/verify/demo-dataset*.test.mjs`, `.env.demo-dataset.example`, `.env.demo-dataset-local.example`,
  `docs/guides/demo-dataset.md:17-18,113`.
- Depends on: Task 2 (route `PUT`).
- Acceptance: dòng "Demo (Task 3)" và "Demo (Task 3, dừng giữa chừng)" của test matrix; `dev:seed` integration vẫn xanh.
- Verify: quick set; `pnpm test:scripts`; `pnpm test:integration -- test/integration/installation`.

### Checkpoint B

Quick set + `pnpm test:scripts` + integration `installation` xanh.

### Phase C — bỏ route cũ, recovery

### Task 4: bỏ gán/thu hồi vai; người gọi HTTP và SQL test chuyển sang một vai

- Files: `app-users.controller.ts` (bỏ hai route), `account-status.service.ts` (bỏ `grantRole`/`revokeRole`),
  `account-administration.policy.ts` (+ spec: bỏ `FORBIDDEN_WITH`, `conflictingRoles`, `forbidsCombination`), `account.errors.ts`,
  `account.http-errors.ts` (+ spec), `app-users/account-constraints.errors.ts`, `account-management.dto.ts`, `openapi.json`,
  `docs/generated/routes.md`, `test/support/openapi-example-manifest.ts:68,72`, `openapi-example-route-codes-identity-access.ts:26,56`,
  `api-coverage-manifest.ts:307-308`, `test/support/api-collection-registry.ts:124-125` (`ROLE_GRANTS`), `reassignment-harness.ts:158-166`
  và mọi file liệt kê ở spec (mục Harness, Task 4: người gọi HTTP và SQL), `super-admin-recovery-harness.ts:154-165`.
- Depends on: Task 3 (demo không còn gọi route cũ).
- Acceptance: dòng `US-01-01` AC-2/AC-12/AC-16 (phần route cũ 404); grep của spec rỗng (trừ test migration và đường đã thiết kế);
  gate registry xanh với `maxItems` 6.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff chỉ bỏ `appUserGrantRole`, `appUserRevokeRole`);
  `pnpm arch:routes`; `pnpm test:integration --` các file đã sửa; `pnpm test:e2e`.

### Task 5: `ops:recover` một vai

- Files: `identity-access/recovery/successor-enrolment.service.ts`, `recovery/role-handover.service.ts` (+ unit spec mới cho thứ
  tự bốn bước và mapping 23514 → `HEADS_DEPARTMENT`), `src/cli/recover/recover.arguments.ts:29`, `recover.command.ts:18`, test
  CLI recovery (`test/integration/identity-access/recovery-cli.integration-spec.ts`, `super-admin-recovery-role.integration-spec.ts`).
- Depends on: Task 4.
- Acceptance: các dòng `US-01-09` của test matrix.
- Verify: quick set; `pnpm test:integration -- test/integration/identity-access/recovery-cli.integration-spec.ts
test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`.

### Checkpoint C

Quick set + `pnpm test:http` + `pnpm test:e2e` + integration các file đổi xanh; grep của spec đã xử lý.

### Phase D — chỉ mục DB, tài liệu

### Task 6: migration `<ts>_identity_one_role_per_account`

- Files: `prisma/migrations/<ts>_identity_one_role_per_account/migration.sql`, `prisma/models/identity-access.prisma` (chú thích
  chỉ mục), `test/integration/identity-access/one-role-per-account-migration.integration-spec.ts` (mới, mẫu
  `drop-approval-role-holders-migration.integration-spec.ts` với `test/support/migration-history.ts`), `src/modules/identity-access/README.md`
  (xử lý migration lỗi).
- Depends on: Checkpoint C.
- Acceptance: dòng Migration và `US-01-01` AC-2/AC-12 (SQL ⟹ unique violation) của test matrix.
- Verify: `pnpm prisma:validate`; quick set; `pnpm test:integration -- test/integration/identity-access test/integration/installation`.

### Task 7: tài liệu và dọn

- Files: `src/modules/identity-access/README.md`, `docs/rules/operational-commands.md:29-30`, ghi chú _superseded_ trong
  `qd93-direct-manager-spending-approver-roles`, `qd93-remove-in-app-super-admin-transfer`, `shared-demo-dataset` (spec), roadmap,
  plan (bảng test cũ → mới, bằng chứng).
- Depends on: Task 6.
- Acceptance: không còn tham chiếu route/lỗi đã bỏ; bảng test cũ → mới đầy đủ; danh sách đổi hợp đồng cho FE/mobile.
- Verify: `pnpm rules:check`, `pnpm rules:format`, `pnpm arch:docs:check`.

### Checkpoint D

Quick set + `pnpm test:http` + `pnpm test:e2e` + integration các file đổi xanh; Owner duyệt chạy full suite một lần.

## Verification and handoff

| Lệnh / kiểm tra AC                            | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| Quick set (mỗi task)                          | —                     | chưa chạy         | —                       |
| `pnpm test:http`, `pnpm test:e2e`             | —                     | chưa chạy         | —                       |
| Integration theo file đổi                     | —                     | chưa chạy         | —                       |
| Full suite (integration, e2e, timing, serial) | —                     | chưa chạy         | Owner duyệt chạy        |

Bảng test cũ → mới (điền khi implement):

| Test cũ                                           | Hành vi                       | Thay bằng / lý do                                                                                  |
| ------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `validateRoleSet`, `forbiddenPairInSet` unit      | Tạo tài khoản với tập vai     | DTO chỉ nhận `role`, mặc định EMPLOYEE; test từ chối mọi `roles` array; policy từng vai giữ nguyên |
| `/me.selfServiceOnly` unit và assertions HTTP/e2e | Phân biệt tài khoản không vai | Không có thuộc tính trong response; giữ `roles`, `managerScope` và kiểm quyền                      |
| Fixture My software IT_ADMIN + EMPLOYEE           | Tự phục vụ khi có vai thứ hai | Chỉ IT_ADMIN đọc dữ liệu cá nhân theo hạng mục self-service                                        |
| Fixture Manager + IT Admin                        | Hợp quyền của hai vai         | IT Admin riêng và Manager riêng, giữ kiểm có/không phạm vi trưởng phòng                            |

### Bằng chứng Task 1 — 04/11/2026

- Đổi tạo tài khoản sang `role?`, mặc định `EMPLOYEE`, một grant và audit tương ứng; bỏ `/me.selfServiceOnly`.
- Chuyển các lời gọi tạo tài khoản trong fixture sang body mới, giữ response/principal `roles` là mảng.
- `pnpm typecheck`: pass; unit các file đổi: 3 suites / 70 tests pass; `pnpm test:gates`: 16 suites / 327 tests pass; HTTP identity-access: 2 suites / 14 tests pass.
- `pnpm arch:check`, `pnpm rules:check`, `pnpm openapi:export` đã gọi; lint đang chờ kết quả cuối.
- Integration/e2e chỉ sửa, không chạy. Các test gán/thu hồi và helper đổi vai vẫn chuyển tiếp ở Task 2–4 theo plan; chưa xác nhận checkpoint integration.

### Bằng chứng Task 2 — 04/11/2026

- Thêm `PUT /app-users/{id}/role`, message `ROLE.CHANGED`, khóa mọi thay đổi theo approval-role → employee → account, kiểm vai rời/nhận trước ghi, thu hồi trước cấp, một audit before/after. Hai route cũ còn tới Task 4.
- Chuyển seam Manager/Người duyệt chi sang thay vai; Finance reviewer chuyển vai qua seam đó.
- Unit service/controller: 2 suites, 59 tests pass. HTTP route mới + API inventory: 2 suites, 20 tests pass.
- Gates sau giảm trần nợ lint: 16 suites, 327 tests pass. Typecheck pass; route generator ghi 313 operations.
- Integration mới có thay vai, idempotent, hiệu lực request kế tiếp, từ chối, Manager hiện tại/tương lai/kế nhiệm và đua Finance/Người duyệt chi; chỉ viết, chưa chạy.
- Lint Task 1 phát hiện suppression của hàm tạo tài khoản đã thừa sau khi bỏ vòng lặp: gỡ đúng một suppression và giảm trần `max-lines-per-function` 51 → 50, tổng 107 → 106 trong gate (bổ sung Files bắt buộc để giữ gate chặt hơn).
- Lint Task 2 lần đầu có lỗi format và `expect.any(String)` cần kiểu string; đã sửa, đang chạy lại. Không chạy integration/e2e.

### Chốt bằng chứng và điểm dừng

- Lint cuối Task 2: pass, exit 0 (`role-task2-lint-final.log`).
- Task 3 tạm dừng trước mọi sửa: spec yêu cầu đổi `SeedReportItem.role` (`dev-seed.types.ts:46`) thành `initialRole`, nhưng `src/cli/dev-seed/dev-seed-report.ts:29` và spec cạnh nó còn tiêu thụ trường `role`; hai file không thuộc Files của Task 3. Đã hỏi Owner bổ sung Files, chưa tự mở rộng.
- Task 4–7 chưa làm vì phụ thuộc Task 3; chưa có migration một vai và chưa tuyên bố checkpoint integration xanh.

### Bảng thay test trước Task 4

| Test cũ                                                   | Test thay thế                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Policy/lỗi tổ hợp, vai đã có/vai chưa có                  | Bỏ cùng tính năng thêm/bớt vai; DTO một vai, PUT no-op, lịch sử thay vai và route cũ 404 |
| Gán/thu hồi MANAGER và đua grant                          | PUT rời/nhận MANAGER, giữ từ chối trưởng phòng hiện tại/tương lai/kế nhiệm và đồng thời  |
| Gán Người duyệt chi, blocker bên Request, đua Request–vai | PUT thay vai; giữ singleton, tài khoản/nhân viên dùng được, open-work và tính nguyên tử  |
| Thu hồi vai cuối để roles rỗng                            | PUT về EMPLOYEE, vẫn đăng nhập/tự phục vụ; không còn đường để tài khoản không vai        |

### Task 3 — tiếp tục theo xác nhận Owner

- Owner xác nhận trong chat 04/11/2026: bổ sung `src/cli/dev-seed/dev-seed-report.ts` và `dev-seed-report.spec.ts` vào Files; điểm dừng ở trên đã được gỡ.
- Đã đổi hợp đồng demo sang `initialRole`/`finalRole`, giữ một vai ở cả trước/sau bước đổi Người duyệt chi, dùng PUT; fixture v2 có DS1-ITOH và trưởng phòng chỉ MANAGER; đã xóa hai file fixture v1 khỏi source.
- Unit các file đổi lần đầu: 14 suites / 113 tests pass; thêm unit fixture riêng kiểm số người/tài khoản và mọi trưởng phòng.
- Integration demo đã viết ca dừng ở PATCH phòng ngay sau org.accounts, CEO còn EMPLOYEE, chạy tiếp rồi chạy lần ba; thêm kiểm mọi tài khoản demo có đúng một grant. Chưa chạy integration.
- Đã gọi typecheck/lint/arch/rules/gates và script tests; đang thu kết quả cuối, không chạy database thật.

- [ ] AC trong scope có bằng chứng; thay đổi hợp đồng đã báo FE/mobile.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] Giao Owner review; cập nhật roadmap.

### Task 4 evidence

- Removed POST/DELETE role-grants; PUT is the only account role mutation route. Updated callers, SQL fixtures and the collection registry (maxItems remains 6).
- typecheck, lint, arch:check, rules:check passed. Gates: 16 suites / 327 tests; changed unit: 4 suites / 62 tests; HTTP: 2 suites / 23 tests passed. openapi:export and arch:routes completed (311 operations).
- Integration/e2e fixtures updated, not executed. Generic account fixtures now receive EMPLOYEE; deliberate constraint setup opts out with role:null.
- Task 3 final script run exposed LF-only template expectations; corrected both env templates and reran the two affected tests (2 passed). Full script rerun remains for unified-seed task.

### Task 5 evidence

- Successor enrolment grants EMPLOYEE and records it. Role handover revokes old SUPER_ADMIN, revokes all successor grants, grants successor SUPER_ADMIN, then grants old holder EMPLOYEE in one transaction; OUT/IN audit uses captured previous roles. Unnamed 23514 maps to HEADS_DEPARTMENT.
- typecheck, lint (final exit 0), arch:check, rules:check passed. Unit: 2 suites / 26 tests; gates: 16 suites / 327 tests passed.
- Integration tests added for EMPLOYEE enrolment, exact effective grants/audits, future head and Finance refusal, reset-email redemption retaining SUPER_ADMIN; CLI help asserts EMPLOYEE wording. Not executed.
- Old no-role preparation assertion replaced by exactly EMPLOYEE; empty transfer audit on rollback retained.
