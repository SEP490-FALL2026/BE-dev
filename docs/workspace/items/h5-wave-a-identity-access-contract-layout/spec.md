# Spec: identity-access Wave A — contract layout, error ownership và HTTP mapper (H5.0 → H5.4)

- Phụ trách: AI theo giao việc Owner (Prompt 18, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 4, 7, 9.3 (H5.0 → H5.4), finding F-24, F-25, A4-16, A4-19; quyết định E5 = A, E6 = A, E7 = B chỉ áp cho Wave B.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `ac3eb92` (`dev` = `origin/dev`,
  Wave 3). ADR-0011 (phiên nội bộ) và ADR-0012 (thư tài khoản) vẫn `Proposed`; lát này không đổi chúng.
- Nhóm roadmap: enabler refactor của `identity-access` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng: login, refresh, logout, quên/đặt lại/đổi mật khẩu, lời mời, quản trị tài khoản, chuyển giao
Super Admin, approval role, `/me` và recovery giữ nguyên route, operationId, quyền, request/response, status/code/message/
details, Audit Trail, transaction, khóa và giá trị database; `openapi.json` byte-identical. Kết quả kỹ thuật: mỗi DTO, lớp
lỗi, mapper HTTP và policy của `identity-access` có một chủ rõ ràng (capability hoặc folder dùng chung có ít nhất hai
capability consumer), không còn folder `errors/` gom lỗi của nhiều capability, controller không còn mapping lỗi inline, và
ledger kiến trúc co đúng phần đã gỡ.

## Primary Story/AC

| Story | AC                                                                                                          | Coverage | Phần còn lại thuộc                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| —     | F-24 (phần `identity-access`), A4-19, H5.0 → H5.4 của audit H4.0, `CP0-04`; F-25 chỉ phần policy dùng chung | n/a      | F-25 (chu trình auth ↔ accounts), A4-16, A4-20, A4-21, F-19 — Identity Access Wave B (H5.5 → H5.7) |

## Supporting references

- Audit H4.0: mục 4 (lỗi và mapper của identity-access ở bảy chỗ), 5 (đồ thị nội module), 7 (gate), 9.3, 12 (E5–E7);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) F-24, F-25.
- [Foundation audit 18/10/2026](../../../reviews/be-foundation-audit-2026-10-18/README.md) mục 4.4 (vị trí đích ban đầu;
  layout phẳng trong capability theo rule hiện hành thay cho folder con `dto/`, `errors/`).
- [CP-0A](../../../reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md) `CP0-04` (chú thích logout).
- [Module structure](../../../rules/module-structure.md), [API contract](../../../rules/api-contract.md),
  [security](../../../rules/security-jobs.md); [Wave 3](../h4-wave3-department-and-root-contracts/spec.md) (mẫu layout
  phẳng theo capability, `mappers/` dùng chung).
- `US-01-01`, `US-01-03`, `US-01-09`, `US-01-10` chỉ để truy vết hành vi phải giữ.

## Explicit out of scope

- H5.5 → H5.7: phá chu trình auth ↔ accounts, bề mặt `SessionRepo`/`ApprovalRoleRepo`/credential, tách `AccountRepo`
  (E5), `SessionRepo` cho recovery (E6), folder `recovery/` (E7), dọn export facade.
- AUTH.1/F-18, AUTH.2/F-31, `CP0-05` → `CP0-10`, recovery/OpenAPI hardening; H6, H7, H8, ROOT.1, G3 → G10.
- Đổi status/code/message/details, auth/session behavior, migration, Prisma schema, dependency; Docs nghiệp vụ, FE/Mobile/AI.

## Dependencies and blockers

Wave 3 (`ac3eb92`) trên `dev`. Ràng buộc kế thừa từ gate: trong cùng module, capability khác chỉ được import
`*.service.ts`/`*.types.ts` (trừ password hasher); file `*.errors.ts`, `*.http-errors.ts`, policy của một capability là
private; folder `dto/`, `errors/`, `mappers/`, `policies/` ở root module là dùng chung; ledger chỉ co lại. Hệ quả: lỗi
một capability ném đi về capability đó; mapper hay policy mà controller/service của từ hai capability dùng phải ở folder dùng
chung. Không blocker.

## Ownership: module, data, API

Không đổi bảng, provider graph, transaction, repo ownership hay facade (`IdentityAccessModule`,
`IdentityAccessFacadeModule`, `RecoveryModule` giữ nguyên). Không thêm Nest submodule, barrel hay re-export tương thích.

### H5.0 — characterization

| Hạng mục         | Trước (`ac3eb92`)                                                                       | Sau                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test mapping     | `account.http-errors.spec.ts` (503 + fallback), `me.controller.spec.ts` (`GET /me` 503) | test theo route cho mọi controller của module: auth (6 route), `/me` (đổi mật khẩu), app-users (9 route), chuyển giao Super Admin, approval roles (2 route) — 109 test mới, xanh trên code cũ |
| Chú thích logout | `session.service.ts` nói token _đã thu hồi hoặc hết hạn_ là no-op                       | nói đúng hành vi: chỉ trạng thái **session** được xét; refresh token đã dùng/hết hạn của session còn mở vẫn kết thúc session đó (`CP0-04`, chỉ chú thích)                                     |

### H5.1 — DTO

| DTO                               | Trước  | Sau                                    | Consumer                                                                                        |
| --------------------------------- | ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `approval-role.dto.ts`            | `dto/` | `approval-roles/approval-role.dto.ts`  | `approval-roles.controller.ts`                                                                  |
| `me.dto.ts`                       | `dto/` | `access/me.dto.ts`                     | `me.controller.ts`                                                                              |
| `super-admin-transfer.dto.ts`     | `dto/` | `accounts/super-admin-transfer.dto.ts` | `super-admin-transfers.controller.ts`                                                           |
| `auth.dto.ts` (giữ)               | `dto/` | `dto/`                                 | `auth/auth.controller.ts` (+ spec), `access/me.controller.ts` (đổi mật khẩu) — hai capability   |
| `account-management.dto.ts` (giữ) | `dto/` | `dto/`                                 | `accounts/app-users.controller.ts`, `auth/auth.controller.ts` (redeem lời mời) — hai capability |

Ba DTO chuyển nguyên byte (SHA-256 trùng); capability chỉ có một file DTO nên để phẳng, không tạo folder con.

### H5.2 — lỗi và dịch lỗi database

| Hạng mục                         | Trước                                                 | Sau                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lỗi auth (6 lớp)                 | `errors/identity-access.errors.ts`                    | `auth/auth.errors.ts`: `InvalidCredentials`, `LoginTemporarilyBlocked`, `SessionInvalid`, `CurrentPasswordInvalid`, `AccountNoLongerUsable`, `PasswordResetInvalid` — chỉ `auth/` ném |
| Lỗi account (16 lớp)             | `errors/identity-access.errors.ts`                    | `accounts/account.errors.ts` — chỉ `accounts/` ném                                                                                                                                    |
| `SuperAdminTransferRefusedError` | khai trong `super-admin-transfer.service.ts` (ledger) | `accounts/account.errors.ts`, cùng type `SuperAdminTransferProblem`                                                                                                                   |
| `translateAccountWriteError`     | trong tệp lỗi chung, cạnh 22 lớp                      | `accounts/account-constraints.ts` cạnh `account.repo.ts` (nguyên văn); không vào repo vì repo đang ở cap 411 dòng (H5.7 tách repo theo E5)                                            |
| `PasswordPolicyError`            | root `identity-access.errors.ts`                      | giữ: lỗi public mà `installation-cli.ts` bắt; auth và accounts cùng ném                                                                                                               |
| Lỗi approval role                | `approval-role.errors.ts` (lớp + mapper HTTP)         | chỉ lớp và type (mapper ở H5.3)                                                                                                                                                       |
| `errors/`                        | 1 file, 22 lớp + adapter DB                           | không còn                                                                                                                                                                             |

Mỗi lỗi một class identity; khớp bằng `instanceof`. `recovery.errors.ts`, `RecoveryArgumentError` (`recovery.arguments.ts`,
helper chỉ chính nó ném) giữ nguyên, thuộc H5.7.

### H5.3 — mapper HTTP

| Mapper                                               | Hàm                                                                                                                     | Consumer                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mappers/auth.http-errors.ts` (dùng chung)           | `toAuthApiException` (login, refresh, logout, yêu cầu đặt lại), `toPasswordResetApiException`, `toPasswordApiException` | `auth/auth.controller.ts`, `access/me.controller.ts` — hai capability                                                                   |
| `mappers/account.http-errors.ts` (dùng chung) + spec | `toAccountApiException` (chỉ lỗi account + `EmployeeNotFoundError`), `toSuperAdminTransferApiException`                 | `accounts/app-users.controller.ts`, `accounts/super-admin-transfers.controller.ts`, `auth/auth.controller.ts` (redeem) — hai capability |
| `approval-roles/approval-role.http-errors.ts`        | `toApprovalRoleApiException` (nguyên văn từ tệp lỗi)                                                                    | `approval-roles.controller.ts`                                                                                                          |

Đã gỡ: mapping inline của `auth.controller.ts` (`unavailable()` và ba khối `instanceof`), `toTransferApiException` trong
controller chuyển giao, re-export `toUnavailableApiException` ở mapper account (`/me` import thẳng từ `infrastructure`).
Mapper account chuyển `accounts/` → `mappers/` ngay ở Phase B: sau khi tách lỗi, file đó map lỗi của hai capability nên
vị trí trong `accounts/` tạo cạnh private mới tới `auth/auth.errors.ts`. Mỗi route dùng đúng các nhánh nó tới được; bảng
nhánh → status/code trước/sau và bằng chứng reachability ở [plan](plan.md#bảng-nhánh-lỗi).

### H5.4 — policy

| Symbol                                                                                                                                                    | Trước                        | Sau                                                                                      | Consumer                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `employeeHasNotLeft`, `ActionLinkState`, `isActionLinkRedeemable`                                                                                         | `accounts/account-policy.ts` | `policies/account-policy.ts` (dùng chung)                                                | access (verifier), accounts (lời mời, truy vấn, repo), approval-roles, auth (login, session, policy đặt lại), root (facade, recovery) |
| `resolveEffectiveRoles`, `DerivedRoleFacts`, `EffectiveRoles`                                                                                             | như trên                     | `access/effective-roles.policy.ts`                                                       | `access/jwt-access-token.verifier.ts`                                                                                                 |
| `canReceiveResetMail`                                                                                                                                     | như trên                     | `auth/password-reset.policy.ts`                                                          | `auth/password-change.service.ts`, `auth/password-reset.service.ts`                                                                   |
| `RequestedRole`, `RoleRequestViolation`, `checkRoleRequest`, `forbidsCombination`, `validateRoleSet`, `isSelfChange`, `stopsLocking`, `accountAuditEvent` | như trên                     | `accounts/account-administration.policy.ts` (đổi tên để không trùng tên file dùng chung) | `account-invitation.service.ts`, `account-status.service.ts`                                                                          |

Code và test chuyển nguyên văn theo dải dòng; spec chia theo cùng chủ (25 test trước và sau).

### Root, folder dùng chung và ledger

| Hạng mục                                      | Trước (`ac3eb92`)              | Sau                                                                                  |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| Root `identity-access`                        | 10 file non-spec, 0 controller | giữ 10/0 (module, facade module, facade, types, lỗi public, `recovery.*` entry CLI)  |
| Folder dùng chung                             | `dto/` (5 DTO), `errors/` (1)  | `dto/` (2), `mappers/` (2), `policies/` (1) — mỗi file có từ hai capability consumer |
| `crossCapabilityImports`                      | 31                             | 21 (−2 cạnh controller → mapper account, −8 cạnh tới `accounts/account-policy.ts`)   |
| `errorClassesOutsideErrorFiles`               | 3                              | 2 (gỡ `SuperAdminTransferRefusedError`; hai lỗi installation thuộc H6)               |
| `httpMappingInErrorFiles`                     | 2                              | 1 (gỡ approval-role; employee-import thuộc H8)                                       |
| `oversizedFiles`, private import/export, root | không đổi                      | không đổi (`account.repo.ts` 411, `recovery.service.ts` 608 dòng giữ nguyên)         |

Không thêm mục ledger, allowlist hay cap. 21 cạnh còn lại (repo/hasher/policy mật khẩu/recovery) và chu trình auth ↔
accounts (auth → `account.repo`, accounts → `session.repo`/hasher/`password.policy`) **chưa** khép — thuộc Wave B.

## Behavior and design

Hành vi phải giữ, theo route: login/refresh/logout/yêu cầu đặt lại chỉ đổi `TransientDatabaseError` thành 503
`AUTH.UNAVAILABLE`, lỗi driver thô vẫn 500; đặt lại mật khẩu: `TransientDatabaseError` → `AUTH.UNAVAILABLE`, lỗi driver →
503 `SERVICE_UNAVAILABLE`; redeem lời mời và đổi mật khẩu: outage → 503 `SERVICE_UNAVAILABLE`; 401 chủ đích
(`AUTH.INVALID_CREDENTIALS`, `AUTH.SESSION_INVALID`, `INVALID_ACCESS_TOKEN` khi tài khoản hết dùng được lúc đổi mật khẩu),
403 `AUTHORIZATION.FORBIDDEN` (người không còn giữ vai khi chuyển giao), 404, 409, 422, 429 kèm `retryAfterSeconds`;
`ApiException` đi qua nguyên vẹn; lỗi không nhận diện được giữ nguyên để filter trả 500. Không câu trả lời lỗi nào chứa
mật khẩu, token hay hash. Ngoài ra không áp dụng: không migration, không đổi transaction, khóa, job hay storage.

## Test matrix

| AC / rủi ro             | Tình huống                                                                                                                 | Cấp test                  | Kết quả mong đợi                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------- |
| Mapping lỗi (H5.0)      | mọi nhánh route × lỗi tới được: 401/403/404/409/422/429/503, `ApiException` đi qua, lỗi lạ giữ nguyên, không lộ credential | unit (characterization)   | xanh trên code cũ và sau mỗi phase        |
| Policy                  | 25 test policy chuyển theo chủ                                                                                             | unit                      | 25/25                                     |
| Hành vi sẵn có          | auth, session, `/me`, quản trị tài khoản, lời mời, mật khẩu, approval role, chuyển giao, recovery, installation            | integration, e2e, unit    | xanh                                      |
| Boundary, ledger, graph | cạnh liên area, lỗi ngoài tệp lỗi, HTTP trong tệp lỗi, trùng tên lỗi, root count, export, provider trùng                   | unit (architecture gates) | xanh, ledger chỉ co lại                   |
| Contract                | 20 operation identity-access; OpenAPI                                                                                      | e2e, export               | `openapi.json` byte-identical `14fd428b…` |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; characterization xanh trên code cũ và vẫn xanh sau mỗi phase.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap/rule phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại; không mục, allowlist hay export mới.
- [x] Phần chưa kiểm chứng ghi rõ ở plan.
- [x] Commit/push: Owner commit/push `19cf3b1` lên `dev` 19/10/2026 (không PR).
- [ ] Owner review.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; implement H5.0 → H5.4 và `verified` local (bằng chứng ở [plan](plan.md)).
  Owner commit/push `19cf3b1` lên `dev` cùng ngày (không PR); chưa Owner review, chưa nghiệm thu.
