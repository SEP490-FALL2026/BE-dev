# Plan: identity-access Wave A — contract layout, error ownership và HTTP mapper (H5.0 → H5.4)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `ac3eb92`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.3, Prompt 18).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `ac3eb92`). Revision:
  commit `19cf3b1` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa có
  bằng chứng.

## Before coding

Preflight: `dev` = `origin/dev` = `ac3eb925b3d6b22217ce4081697dcc80428a71c2`, ahead/behind `0/0`, cây sạch; `ac3eb92`
chứa Wave 3 (root `organization` 6 file/0 controller); `openapi.json` `14fd428b…`; tracker ngoài repo `prettier --check`
sạch; Docs `9416fe0`.

Inventory (đọc trực tiếp, không subagent):

- DTO root `dto/`: `approval-role`, `me`, `super-admin-transfer` mỗi file một controller dùng; `auth.dto` (auth +
  `/me`), `account-management.dto` (app-users + redeem lời mời của auth controller) có hai capability.
- Lỗi: `errors/identity-access.errors.ts` 22 lớp + `translateAccountWriteError`; lớp auth chỉ file trong `auth/` import,
  lớp account chỉ file trong `accounts/` import (thêm `account.http-errors.ts` map cả hai); `SuperAdminTransferRefusedError`
  khai trong service; `approval-role.errors.ts` chứa mapper HTTP; root `identity-access.errors.ts` có `PasswordPolicyError`
  (bắt bởi `installation-cli.ts`).
- Mapping HTTP: `toAccountApiException` 21 nhánh dùng bởi app-users (9 route), chuyển giao, `/me` (đổi mật khẩu,
  re-export `toUnavailableApiException` cho `GET /me`), auth (đặt lại, redeem); auth controller map inline cho login,
  refresh, logout, yêu cầu đặt lại; controller chuyển giao có `toTransferApiException` cục bộ.
- `accounts/account-policy.ts`: `employeeHasNotLeft` (5 area), `isActionLinkRedeemable`/`ActionLinkState` (root,
  accounts), `resolveEffectiveRoles` (chỉ access), `canReceiveResetMail` (chỉ auth), 8 symbol chỉ accounts.
- Ledger H5 liên quan: `crossCapabilityImports` 31 (21 cũ + 10 của GATE.1), `errorClassesOutsideErrorFiles` 1 mục H5,
  `httpMappingInErrorFiles` 1 mục H5; root 10 file/0 controller.
- Route: 20 operation (tag `auth`, `me`, `app-users`, `approval-roles`, `super-admin-transfers`); operationId, status,
  security, schema chụp vào inventory tạm để so cuối lượt; 61 schema.

Baseline trên code chưa sửa: unit `identity-access` + ba gate 13 suite/148 test; e2e auth-unavailable, approval-roles,
super-admin-transfer, api-inventory, app, rate-limit 6 suite/77 test; integration auth-http, account-management-http,
account-list-and-redeem, password-self-service (4), approval-roles-http, super-admin-transfer-http, me-unavailable,
super-admin-recovery, recovery-cli, auth-concurrency 13 suite/190 test (90 s, container xóa, 0 DB sót).

## Tasks

### Task 1: Phase 0 — H5.0 characterization và `CP0-04`

- Files: `auth/auth.controller.spec.ts`, `access/me.controller.spec.ts`, `accounts/app-users.controller.spec.ts`,
  `accounts/super-admin-transfers.controller.spec.ts`, `approval-roles/approval-roles.controller.spec.ts`;
  chú thích `auth/session.service.ts`.
- Depends on: none.
- Acceptance: test theo route (gọi method controller với service stub ném lỗi) cho mọi nhánh ở [bảng](#bảng-nhánh-lỗi),
  `ApiException` đi qua, lỗi lạ giữ nguyên, không lộ credential; xanh trên code cũ.
- Verify: Checkpoint 0.

### Task 2: Phase A — H5.1 DTO

- Files: ba DTO (move nguyên byte), ba controller (import).
- Depends on: Task 1.
- Acceptance: `dto/` chỉ còn DTO hai capability dùng; schema/Swagger name không đổi.
- Verify: Checkpoint A.

### Task 3: Phase B — H5.2 lỗi và dịch lỗi database

- Files: `auth/auth.errors.ts`, `accounts/account.errors.ts`, `accounts/account-constraints.ts` (mới); xóa
  `errors/identity-access.errors.ts`; `super-admin-transfer.service.ts`; import trong auth/accounts, spec,
  `test/integration/account-management-http.integration-spec.ts`; `mappers/account.http-errors.ts` (+ spec, move); ledger.
- Depends on: Task 2.
- Acceptance: không lớp lỗi trong service/controller/repo của module; mỗi lỗi một class; không re-export.
- Verify: Checkpoint B.

### Task 4: Phase C — H5.3 mapper HTTP

- Files: `mappers/auth.http-errors.ts` (mới), `mappers/account.http-errors.ts`, `approval-roles/approval-role.http-errors.ts`
  (mới), `approval-role.errors.ts`, bốn controller, ledger.
- Depends on: Task 3.
- Acceptance: controller chỉ gọi mapper; tệp lỗi không còn `ApiException`/`HttpStatus`; characterization giữ nguyên.
- Verify: Checkpoint C.

### Task 5: Phase D — H5.4 policy

- Files: `policies/account-policy.ts`, `access/effective-roles.policy.ts`, `auth/password-reset.policy.ts`,
  `accounts/account-administration.policy.ts` (+ 4 spec); xóa `accounts/account-policy{,.spec}.ts`; 12 file import; ledger.
- Depends on: Task 4.
- Acceptance: không capability nào import `accounts/account-policy.ts`; shared policy chỉ chứa symbol có từ hai area
  consumer; 25 test policy giữ.
- Verify: Checkpoint D.

### Task 6: consolidation

- Files: `ARCHITECTURE.md`, `docs/rules/module-structure.md`, item này, `items/README.md`, `docs/roadmap.md`, metadata
  Wave 3 (`ac3eb92`), comment ledger, tracker ngoài repo.
- Depends on: Task 5.
- Acceptance: tài liệu hiện hành mô tả đúng cây cuối; lịch sử có ngày giữ nguyên; diff cuối đã tự review.
- Verify: full gate một lần trên cây cuối (bảng dưới).

## Bảng nhánh lỗi

Status/code/message/details **không đổi** ở mọi dòng (characterization xanh trước và sau). Cột “Sau” là mapper sở hữu.

| Lỗi                                                                                   | Status / code                                                                                                     | Trước                                  | Sau                                                 | Route tới được                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `InvalidCredentialsError`                                                             | 401 `AUTH.INVALID_CREDENTIALS`                                                                                    | inline `auth.controller`               | `toAuthApiException`                                | `authLogin`                                                                               |
| `LoginTemporarilyBlockedError`                                                        | 429 `AUTH.LOGIN_TEMPORARILY_BLOCKED` + `retryAfterSeconds`                                                        | inline login; `toAccountApiException`  | `toAuthApiException`; `toPasswordApiException`      | `authLogin`; `meChangePassword`                                                           |
| `SessionInvalidError`                                                                 | 401 `AUTH.SESSION_INVALID` (“… Sign in again.”)                                                                   | inline refresh                         | `toAuthApiException`                                | `authRefresh`                                                                             |
| `TransientDatabaseError` ở route auth công khai                                       | 503 `AUTH.UNAVAILABLE`                                                                                            | inline `unavailable()`                 | `toAuthApiException`; `toPasswordResetApiException` | login, refresh, logout, yêu cầu đặt lại, đặt lại                                          |
| Lỗi driver thô ở login/refresh/logout/yêu cầu đặt lại                                 | giữ nguyên → 500                                                                                                  | rethrow                                | `toAuthApiException` trả nguyên                     | bốn route đó                                                                              |
| `CurrentPasswordInvalidError`                                                         | 422 `AUTH.CURRENT_PASSWORD_INVALID`                                                                               | `toAccountApiException`                | `toPasswordApiException`                            | `meChangePassword`                                                                        |
| `AccountNoLongerUsableError`                                                          | 401 `INVALID_ACCESS_TOKEN`                                                                                        | `toAccountApiException`                | `toPasswordApiException`                            | `meChangePassword`                                                                        |
| `PasswordResetInvalidError`                                                           | 400 `AUTH.PASSWORD_RESET_INVALID`                                                                                 | `toAccountApiException`                | `toPasswordApiException`                            | `authResetPassword`                                                                       |
| `PasswordPolicyError`                                                                 | 422 `AUTH.PASSWORD_POLICY_VIOLATION` + `violation`                                                                | `toAccountApiException`                | `toPasswordApiException`                            | `authResetPassword`, `authRedeemInvitation`, `meChangePassword`                           |
| `InvitationInvalidError`                                                              | 400 `AUTH.INVITATION_INVALID`                                                                                     | `toAccountApiException`                | `toAccountApiException`                             | `authRedeemInvitation`                                                                    |
| 15 lỗi account khác + `EmployeeNotFoundError`                                         | 404/409/422 `APP_USER.*`, `ORGANIZATION.EMPLOYEE_NOT_FOUND`                                                       | `toAccountApiException`                | `toAccountApiException`                             | 9 route app-users                                                                         |
| `SuperAdminTransferRefusedError`                                                      | 403 `AUTHORIZATION.FORBIDDEN` (`NOT_HOLDER`), 404 (`SUCCESSOR_NOT_FOUND`), 422 `SUPER_ADMIN_TRANSFER.*` (8 lý do) | hàm cục bộ trong controller            | `toSuperAdminTransferApiException`                  | `superAdminTransfer`                                                                      |
| `ApprovalRoleHolderInvalidError`, `ApprovalRolePairingError`, `EmployeeNotFoundError` | 422 `APPROVAL_ROLE.*`, 404                                                                                        | `approval-role.errors.ts`              | `approval-role.http-errors.ts`                      | `approvalRoleSet` (+ `approvalRoleList` cho outage)                                       |
| Outage (`TransientDatabaseError` hoặc lỗi driver) ở các route còn lại                 | 503 `SERVICE_UNAVAILABLE`                                                                                         | `toUnavailableApiException` qua mapper | như cũ (`GET /me` import thẳng từ `infrastructure`) | app-users, chuyển giao, approval roles, `/me`, redeem, đổi mật khẩu; lỗi driver ở đặt lại |
| `ApiException` / lỗi không nhận diện                                                  | đi qua nguyên vẹn / giữ nguyên → 500 `INTERNAL_SERVER_ERROR`                                                      | mọi mapper                             | mọi mapper                                          | mọi route                                                                                 |

**Reachability.** Mỗi route giữ đúng tập nhánh nó tới được; các cặp (route, lỗi) bị bỏ là cặp service của route không
ném. Bằng chứng thrower (grep import ở `ac3eb92`): sáu lớp auth chỉ được file trong `auth/` import; 16 lớp account chỉ
file trong `accounts/`; `PasswordPolicyError` trong accounts chỉ ở `redeemInvitation` (`account-invitation.service.ts:155`,
`:209`), mà route redeem vẫn dùng đủ cả hai mapper (`toAccountApiException(toPasswordApiException(error))`, đúng hợp
cũ). Do đó app-users và chuyển giao bỏ năm nhánh mật khẩu; đặt lại và đổi mật khẩu bỏ các nhánh account — không cặp nào
tới được.

| Test characterization                               | Số test mới | Nhánh                                                                                                          |
| --------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `auth/auth.controller.spec.ts`                      | 31          | 15 ca có mapping + `ApiException` × 6 route + lỗi lạ × 6 route + lỗi driver thô × 4 route; không lộ credential |
| `access/me.controller.spec.ts`                      | 8           | đổi mật khẩu: 6 nhánh (422, 429, 401, 422 policy, 503 × 2) + `ApiException` + lỗi lạ                           |
| `accounts/app-users.controller.spec.ts`             | 45          | 18 nhánh account trên `lock`; 9 route × (account + outage), × `ApiException`, × lỗi lạ                         |
| `accounts/super-admin-transfers.controller.spec.ts` | 14          | 403, 404, 8 × 422, 503 × 2, `ApiException`, lỗi lạ                                                             |
| `approval-roles/approval-roles.controller.spec.ts`  | 11          | 404, 3 × 422, 422 pairing, 2 route × (503, `ApiException`, lỗi lạ)                                             |

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, Docker 29.1.2, cây làm việc chưa commit trên `ac3eb92`, 19/10/2026.
Integration dùng PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt (`127.0.0.1:55437`), role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.

| Lệnh / kiểm tra                                                                                                                              | Revision / môi trường      | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Chưa chạy / giới hạn |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Baseline (code chưa sửa): unit + gate; e2e 6 suite; integration 13 suite                                                                     | `ac3eb92`                  | 13 suite/148; 6 suite/77; 13 suite/190 (90 s, container xóa, 0 DB sót)                                                                                                                                                                                                                                                                                                                                                                                        | —                    |
| Checkpoint 0: characterization trên code **chưa sửa**                                                                                        | `ac3eb92` + test           | 109/109 test mới xanh; unit `identity-access` 13 suite/201; typecheck, ESLint exit 0                                                                                                                                                                                                                                                                                                                                                                          | —                    |
| Checkpoint A (H5.1): typecheck, unit + ba gate, zero-hit, OpenAPI tạm                                                                        | cây sau Phase A            | exit 0; 16 suite/257; 0 import path cũ trong `src`/`test`; `openapi.json` `14fd428b…`                                                                                                                                                                                                                                                                                                                                                                         | —                    |
| Checkpoint B (H5.2): typecheck, ESLint, unit + ba gate, quét lỗi                                                                             | cây sau Phase B            | exit 0; 16 suite/257; 0 lớp lỗi trong service/controller/repo của module; 0 tên lỗi trùng; 0 import `errors/`                                                                                                                                                                                                                                                                                                                                                 | —                    |
| Checkpoint C (H5.3): typecheck, ESLint, characterization + ba gate, quét mapping                                                             | cây sau Phase C            | exit 0; 16 suite/257; 0 `instanceof`/`ApiException` trong controller; 0 tệp lỗi có `ApiException`/`HttpStatus`                                                                                                                                                                                                                                                                                                                                                | —                    |
| Checkpoint D (H5.4): typecheck, ESLint, unit + ba gate, quét import policy                                                                   | cây sau Phase D            | exit 0; 19 suite/257 (spec policy chia 4, 25 test giữ); 0 import `accounts/account-policy`                                                                                                                                                                                                                                                                                                                                                                    | —                    |
| Quét cuối: move không mất code, zero-hit, ownership                                                                                          | cây cuối                   | mọi dòng code của tệp lỗi, policy (+ spec), mapper cũ có ở tệp đích, trừ ba dòng chủ đích (comment ngăn mục, comment re-export đã bỏ, nhánh 429 gọi helper `loginBlocked` cùng status/code/message/details); 0 import `errors/identity-access.errors`, `accounts/account-policy`, `accounts/account.http-errors`, `dto/{approval-role,me,super-admin-transfer}.dto` trong `src`/`test`/`scripts`; root 10 file/0 controller; `crossCapabilityImports` 31 → 21 | —                    |
| `pnpm check`                                                                                                                                 | cây cuối                   | exit 0: rules 99 tệp/830 link 0 lỗi, format, prisma, lint, typecheck, unit 66 suite/968 test (+6 suite, +109 test so với Wave 3), script 18 + 19, test discovery, build                                                                                                                                                                                                                                                                                       | —                    |
| `pnpm test:e2e`                                                                                                                              | cây cuối                   | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                    |
| `pnpm test:integration` (gồm focused auth, session, `/me`, tài khoản, lời mời, mật khẩu, approval role, chuyển giao, recovery, installation) | cây cuối, PostgreSQL riêng | exit 0; 46 suite/623 test, 266 s; không `42501`; 0 database `slm_*_test` sót; container đã xóa; fallback 500 qua HTTP thật có ca (`super-admin-transfer-http`, lỗi tiêm `disk full`)                                                                                                                                                                                                                                                                          | remote CI chưa chạy  |
| `pnpm openapi:export` + `cmp` + inventory                                                                                                    | cây cuối                   | `openapi.json` byte-identical `14fd428b…` (`cmp` với bản đầu lượt, git không đổi); 60 operation, 61 schema; 20 operation identity-access giữ operationId, status, security, request/response schema                                                                                                                                                                                                                                                           | —                    |
| `pnpm rules:check`, `pnpm rules:format`, Prettier/ESLint, `git diff --check`, tracker `prettier --check`                                     | cây cuối                   | exit 0; Prettier/ESLint sạch; `git diff --check` sạch; tracker sạch                                                                                                                                                                                                                                                                                                                                                                                           | —                    |

**Kiểm soát còn lại / giới hạn:** 21 cạnh `crossCapabilityImports` và chu trình auth ↔ accounts thuộc Wave B (H5.5 →
H5.7); `account.repo.ts` (411) và `recovery.service.ts` (608) vẫn trong ledger kích thước; `ORGANIZATION.EMPLOYEE_NOT_FOUND`
vẫn được map ở hai mapper (account, approval-role) như trước; remote CI, Owner review chưa có.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
