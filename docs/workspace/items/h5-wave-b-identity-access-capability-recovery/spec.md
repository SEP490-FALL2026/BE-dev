# Spec: identity-access Wave B — capability surface, session ownership của recovery và repo theo aggregate (H5.5 → H5.7)

- Phụ trách: AI theo giao việc Owner (Prompt 19, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md),
  mục 5, 7, 9.3 (H5.5 → H5.7), finding F-19, F-25, A4-16, A4-20, A4-21; quyết định E5 = A (tách `AccountRepo` theo
  aggregate), E6 = A (`SessionRepo` khai trong `RecoveryModule`), E7 = B (implementation recovery vào `recovery/`, entry
  ghép giữ ở root). Hardening test `CP0-05` → `CP0-08` theo
  [CP-0A](../../../reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `19cf3b1` (`dev` = `origin/dev`,
  Wave A). ADR-0011 (phiên nội bộ) và ADR-0012 (thư tài khoản) vẫn `Proposed`; lát này không đổi chúng.
- Nhóm roadmap: enabler refactor của `identity-access` trước G3 — chỉ là planning container.
- [Kế hoạch](plan.md).

## Business outcome

Không đổi hành vi người dùng hay vận hành: login, refresh, logout, quên/đặt lại/đổi mật khẩu, lời mời và kích hoạt, khóa/
mở khóa có lý do, vai, chuyển giao Super Admin, approval role, `/me` và lệnh `ops:recover` giữ nguyên route, operationId,
quyền, request/response, status/code/message/details, Audit Trail, transaction, thứ tự khóa, lý do thu hồi và giá trị
database; `openapi.json` byte-identical; giao diện CLI không đổi. Kết quả kỹ thuật: mỗi capability của `identity-access`
chỉ dùng contract service của capability khác (không repo, hasher hay helper riêng), không còn chu trình auth ↔ accounts
hay accounts ↔ approval-roles, mỗi bảng có đúng một repo ghi, lệnh khôi phục không tự ghi `auth_sessions`, và ledger kiến
trúc của module về 0.

## Primary Story/AC

| Story | AC                                                                                                          | Coverage | Phần còn lại thuộc                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| —     | H5.5 → H5.7 của audit H4.0; F-19, F-25, A4-16 và A4-21 (phần `identity-access`), A4-20; `CP0-05` → `CP0-08` | n/a      | AUTH.1/F-18, AUTH.2/F-31, `CP0-09`/`CP0-10` (OpenAPI hardening); H6, H7, H8, ROOT.1; G3 (E4 của `organization`) |

## Supporting references

- Audit H4.0: mục 5 (đồ thị nội module, 21 cạnh), 7 (gate), 9.3, 12 (E5–E7);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) F-19, F-25.
- [Wave A](../h5-wave-a-identity-access-contract-layout/spec.md) (layout DTO/lỗi/mapper/policy, `19cf3b1`).
- [Spec nền](../foundation-org-identity-boundary/spec.md) (giao thức khóa), [lát 1a](../us-01-bootstrap-login-session/spec.md),
  [lát 1b](../us-01-account-invitation-activation/spec.md), [lát 1c](../us-01-password-self-service/spec.md),
  [US-01-09](../us-01-09-super-admin-transfer-recovery/spec.md), [H3b/R-2](../h3b-r2-lock-unlock-reason/spec.md),
  [H3c](../h3c-forgot-password-during-recovery/spec.md) — chỉ để truy vết hành vi phải giữ.
- [Module structure](../../../rules/module-structure.md), [security](../../../rules/security-jobs.md).

## Explicit out of scope

- AUTH.1/F-18, AUTH.2/F-31, `OPENAPI-HARDEN.1`/`CP0-09`/`CP0-10`, behavior hay contract bảo mật mới.
- H6, H7 (role PostgreSQL — hoãn tới chuẩn bị staging/production hoặc Owner giao rõ), H8, ROOT.1, G3 → G10; refactor
  module khác, CI/deploy, nâng dependency.
- Đổi status/code/message/details, enum, migration, Prisma schema; Docs nghiệp vụ, FE/Mobile/AI.

## Dependencies and blockers

Wave A (`19cf3b1`) trên `dev`. Ràng buộc kế thừa từ gate: trong cùng module, capability (gồm root) chỉ import
`*.service.ts`/`*.types.ts` của capability khác, trừ `password-hasher.service.ts`; ledger chỉ co lại; allowlist
(`PUBLIC_CONTRACT_EXPORTS`, `CLI_ENTRY_FILES`) chỉ mở khi contract công khai thật sự đổi. Không blocker.

## Ownership: module, data, API

### Capability graph (file nguồn, không tính `*.module.ts`)

| Cạnh                      | Trước (`19cf3b1`)                                                                      | Sau                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| auth ↔ accounts           | hai chiều: auth → `account.repo`; accounts → `session.repo`, hasher, `password.policy` | một chiều auth → accounts (contract service); accounts dùng port `ACCOUNT_SESSIONS`              |
| accounts ↔ approval-roles | hai chiều: approval-roles → `account.repo`; accounts → `approval-role.repo`            | một chiều approval-roles → accounts; accounts dùng port `APPROVAL_ROLE_HOLDINGS`                 |
| root ↔ auth               | hai chiều: facade/recovery → hasher, `password.policy`, `action-token`                 | không còn cạnh root → auth                                                                       |
| root ↔ accounts           | hai chiều: facade/recovery → `account.repo`, `successor-eligibility`                   | root → accounts chỉ contract service; accounts → root chỉ type/lỗi public — không chu trình file |
| recovery                  | không có folder (`recovery.*` ở root)                                                  | `recovery/` → accounts (contract, port), auth → `recovery/recovery-ticket.service`               |

Hai port khai ở `accounts/account.types.ts` (`interface` + `Symbol`): `ACCOUNT_SESSIONS` (`findPrincipalContext`,
`revokeAllSessions`) do `auth/session-directory.service.ts` hiện thực; `APPROVAL_ROLE_HOLDINGS` (`isSpendingApprover`,
`rolesHeldBy`) do `approval-roles/approval-role-directory.service.ts` hiện thực; bind `useExisting` trong module.

### Provider và export

| Nest module                  | Trước (`19cf3b1`)                                                                                                           | Sau                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityAccessFacadeModule` | provider `AccountRepo`, `PasswordHasher`, `ApprovalRoleRepo`, `SuccessorEligibility`, `RecoveryRepo`, facade; export cả sáu | provider `AppUserRepo`, `CredentialRepo`, `RoleGrantRepo`, `ActionTokenRepo`, `PasswordHasher`, bốn contract, facade; export facade + `AccountDirectoryService`, `RoleGrantService`, `ActionLinkService`, `CredentialService`                                                                                                          |
| `IdentityAccessModule`       | 16 provider (use case, `SessionRepo`, `TokenService`, verifier); export `ACCESS_TOKEN_VERIFIER`                             | 31 provider (thêm `ApprovalRoleRepo`, `ApprovalRoleDirectoryService` + port, `SuccessorEligibility`, `ActionLinkRevocation`, `InvitationMailService`, `InvitationRedemptionService`, bốn service đặt lại mật khẩu, `RecoveryRepo`, `RecoveryTicketService`, `SessionTokenService`, `SessionDirectoryService` + port); export không đổi |
| `RecoveryModule`             | provider và export `RecoveryService`                                                                                        | 16 provider (`SessionRepo`, `SessionDirectoryService` + port, `ApprovalRoleRepo`, `ApprovalRoleDirectoryService` + port, `SuccessorEligibility`, `ActionLinkRevocation`, `RecoveryRepo`, bảy service `recovery/` gồm hai entry); export `HolderRecoveryService`, `RoleTransferRecoveryService`                                         |

E6: provider cả API lẫn lệnh khôi phục cần mà facade không cần được khai ở **cả** `IdentityAccessModule` và
`RecoveryModule` (hai graph khác nhau, mỗi graph một khai báo): `ActionLinkRevocation`, `ApprovalRoleDirectoryService`,
`ApprovalRoleRepo`, `RecoveryRepo`, `SessionDirectoryService`, `SessionRepo`, `SuccessorEligibility`, hai port. Danh sách
chính xác ghim trong `DECLARED_FOR_API_AND_RECOVERY` của [module-graph.spec.ts](../../../../src/module-graph.spec.ts);
`RecoveryCliModule` vào các graph được kiểm, bốn repo aggregate chỉ một khai báo mỗi graph, graph recovery không có
controller hay JWT. Worker và lệnh khởi tạo chỉ còn thấy facade + bốn contract (không còn repo approval role/recovery).

### 21 cạnh `crossCapabilityImports`

| #   | Consumer (trước)                          | Import riêng (trước)                | Thay bằng                                                                                                 | Phase | Test                                                             |
| --- | ----------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| 1   | `access/jwt-access-token.verifier.ts`     | `approval-roles/approval-role.repo` | `approval-roles/approval-role-directory.service` (`isSpendingApprover`)                                   | A     | verifier spec, `auth-http`, e2e guard                            |
| 2   | `access/jwt-access-token.verifier.ts`     | `auth/session.repo`                 | `auth/session-directory.service` (`findPrincipalContext`)                                                 | A     | verifier spec, `auth-http`, `me-unavailable`                     |
| 3   | `access/me.service.ts`                    | `accounts/account.repo`             | `accounts/account-directory.service`                                                                      | A     | `me.controller` spec, `auth-http`                                |
| 4   | `accounts/account-invitation.service.ts`  | `auth/password-hasher.service`      | hasher chuyển về `accounts/`; redeem tách `invitation-redemption.service` dùng `credential.service`       | A     | `account-list-and-redeem`, `account-management-http`             |
| 5   | `accounts/account-invitation.service.ts`  | `auth/password.policy`              | `password.policy` chuyển về `accounts/` sau `credential.service`                                          | A     | `password.policy` spec, redeem integration                       |
| 6   | `accounts/account-status.service.ts`      | `auth/session.repo`                 | port `ACCOUNT_SESSIONS` (`accounts/account.types`)                                                        | A     | `account-management-http` (khóa thu hồi phiên)                   |
| 7   | `accounts/successor-eligibility.ts`       | `approval-roles/approval-role.repo` | port `APPROVAL_ROLE_HOLDINGS`; file đổi tên `successor-eligibility.service.ts`                            | A     | `super-admin-transfer-http`, `super-admin-recovery`              |
| 8   | `approval-roles/approval-role.service.ts` | `accounts/account.repo`             | `account-directory.service`, `role-grant.service`                                                         | A     | `approval-roles-http`                                            |
| 9   | `auth/credential-change.service.ts`       | `accounts/account.repo`             | `credential.service`, `action-link-revocation.service`                                                    | A     | `password-self-service*`                                         |
| 10  | `auth/login.service.ts`                   | `accounts/account.repo`             | `account-directory.service`, `credential.service`                                                         | A     | `auth-http`, `auth-concurrency`                                  |
| 11  | `auth/password-change.service.ts`         | `accounts/account.repo`             | `account-directory.service`, `credential.service`                                                         | A     | `password-self-service-http`                                     |
| 12  | `auth/password-reset.service.ts`          | `accounts/account.repo`             | `account-directory.service`, `action-link.service`, `credential.service` (tách bốn service theo use case) | A     | `password-self-service*`                                         |
| 13  | `auth/session.service.ts`                 | `accounts/account.repo`             | `account-directory.service`                                                                               | A     | `auth-http`, `auth-concurrency`                                  |
| 14  | `auth/password-reset.service.ts`          | root `recovery.repo`                | `recovery/recovery-ticket.service` (`hasWaitingCredentialReset`, `completeForLink`)                       | B     | `super-admin-recovery` (H3c, `CP0-08`), `password-self-service*` |
| 15  | `identity-access.service.ts`              | `accounts/account.repo`             | bốn contract `accounts/`                                                                                  | A     | `installation-*`, facade spec                                    |
| 16  | `identity-access.service.ts`              | `auth/password-hasher.service`      | `credential.service` (`prepareCredential`)                                                                | A     | `installation-minimal-env`, `installation-cli`                   |
| 17  | `identity-access.service.ts`              | `auth/password.policy`              | `credential.service`                                                                                      | A     | như trên                                                         |
| 18  | `recovery.service.ts`                     | `accounts/account.repo`             | `recovery/` dùng `account-directory`, `role-grant`, `action-link`, `credential` service                   | B     | `super-admin-recovery`, `recovery-cli`                           |
| 19  | `recovery.service.ts`                     | `accounts/successor-eligibility`    | `recovery/successor-enrolment.service` → `successor-eligibility.service`                                  | A     | như trên                                                         |
| 20  | `recovery.service.ts`                     | `auth/action-token`                 | `action-link.service` (`issue`)                                                                           | A     | như trên                                                         |
| 21  | `recovery.service.ts`                     | `auth/password-hasher.service`      | `recovery/holder-credential-reset.service` → `credential.service`                                         | A     | như trên                                                         |

Mỗi phase xóa đúng mục đã gỡ: A 19 (mục 19–21: service recovery cũ chuyển sang contract trước khi dời), B 2 (mục 14 cần
`RecoveryTicketService` trong `recovery/`; mục 18 hết khi service recovery dời vào `recovery/` và tách), C 0;
`crossCapabilityImports` cuối là `new Set<string>()`, không mục mới, không đường import vòng qua folder dùng chung.

### `AccountRepo` → repo theo aggregate (E5)

`accounts/account.repo.ts` (411 dòng, 35 method, ghi bốn bảng) bị xóa. Khối method chuyển nguyên văn (script tách theo
dải dòng; 334/336 dòng code có mặt ở tệp đích, hai dòng thiếu là header class cũ).

| Repo mới (bảng ghi duy nhất)                                       | Method                                                                                                                                                                                                                                                                                                                                                        | Contract cho capability khác                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `app-user.repo.ts` `AppUserRepo` (`app_users`)                     | `findAccountByLoginEmail`, `findAccountById`, `lockAppUser`, `readAccount`, `createAppUser`, `findLoginEmail`, `findEmployeeIdsWithAccount`, `findUsableItAdminEmployeeIds`, `readEmailVerificationSource`, `changeLoginEmail`, `findAccountIdByEmployee`, `findAccountRecord`, `listAccountRecords`, `setStatus`, `markActivated`, `lockAndReadAccount` (16) | `AccountDirectoryService` (cùng tên method)                                                      |
| `credential.repo.ts` `CredentialRepo` (`password_credentials`)     | `createCredential`, `replaceCredential` (2)                                                                                                                                                                                                                                                                                                                   | `CredentialService` (thêm policy, hash/verify; `replaceCredential` gắn version hiện hành)        |
| `role-grant.repo.ts` `RoleGrantRepo` (`role_grants`)               | `grantRole`, `findSuperAdminHolderId`, `effectiveRoles`, `effectiveRolesFor`, `grantHistory`, `financeIsHeld`, `revokeRole` (7)                                                                                                                                                                                                                               | `RoleGrantService` (cùng tên method)                                                             |
| `action-token.repo.ts` `ActionTokenRepo` (`account_action_tokens`) | `insertActionToken`, `findUsableTokens`, `countTokensSince`, `revokeTokens`, `findActionTokenOwner`, `findActionTokenHeader`, `lockActionToken`, `consumeToken`, `findActionLink`, `latestToken` (10)                                                                                                                                                         | `ActionLinkService` (`insertActionToken` sau `issue`: sinh token, TTL theo config, chỉ lưu hash) |

Single writer (quét `create/update/upsert/delete` và `INSERT/UPDATE/DELETE` trong module): `app_users`,
`password_credentials`, `role_grants`, `account_action_tokens` mỗi bảng một repo; `auth_sessions`, `refresh_tokens`,
`login_throttles` chỉ `auth/session.repo.ts` (trước: `recovery.repo.ts` cũng ghi `auth_sessions`); `recovery_tickets` chỉ
`recovery/recovery.repo.ts`; `approval_role_holders` chỉ `approval-roles/approval-role.repo.ts`. Capability ngoài
`accounts` không inject repo mới nào.

### `recovery/` (E7) và tách theo use case

| Tệp                                                            | Vai trò                                                                                                    | Dep |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --- |
| `holder-recovery.service.ts` (entry)                           | `resetCredentials`, `unlock` — người giữ vai                                                               | 6   |
| `role-transfer-recovery.service.ts` (entry)                    | `transferRole` — chuyển vai cho người kế nhiệm                                                             | 6   |
| `holder-credential-reset.service.ts`                           | credential tạm không biết + thu hồi link (`SUPERSEDED`), thay credential, thu hồi phiên (`PASSWORD_RESET`) | 3   |
| `recovery-targets.service.ts`                                  | tổ chức, tìm/khóa người giữ, kiểm email trùng, mở lại tài khoản, khóa cho chuyển vai                       | 3   |
| `recovery-links.service.ts`                                    | link còn hiệu lực, gửi link đặt lại, gửi lời mời                                                           | 2   |
| `successor-enrolment.service.ts`                               | tạo tài khoản kế nhiệm, chờ kích hoạt                                                                      | 6   |
| `role-handover.service.ts`                                     | chuyển grant `SUPER_ADMIN`                                                                                 | 3   |
| `recovery-ticket.service.ts`                                   | contract cho auth: ticket `RESET_CREDENTIALS` chờ (H3c), hoàn tất ticket theo link                         | 3   |
| `recovery-procedure.ts`                                        | hàm thuần: ngữ cảnh, tách vai, email mới, cùng phiếu, sự kiện operator (regex nguyên byte)                 | —   |
| `recovery.repo.ts`, `.errors.ts`, `.arguments.ts`, `.types.ts` | chuyển từ root; repo bỏ `revokeSessions`                                                                   | —   |

Root `recovery.service.ts` (608 dòng) bị xóa; `recovery.module.ts` giữ ở root; `src/recovery-cli.ts` gọi hai entry
(`app.get(HolderRecoveryService)`, `app.get(RoleTransferRecoveryService)`), tham số và mã thoát không đổi.
`CLI_ENTRY_FILES` đổi đường dẫn theo nơi ở mới: `recovery.module.ts` + `recovery/{holder-recovery.service,
recovery.arguments, recovery.errors, recovery.types, role-transfer-recovery.service}` (5 → 8 mục tổng: trước đó
`recovery.errors`/`recovery.types` ở root đã thuộc allowlist bề mặt công khai nên không cần liệt kê).

### Ledger, export, kích thước

| Hạng mục                                                                                                             | Trước (`19cf3b1`)                                                                                                   | Sau                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `crossCapabilityImports`                                                                                             | 21                                                                                                                  | 0                                                                                                 |
| `LEGACY_PRIVATE_EXPORTS` (toàn repo)                                                                                 | 11 (5 identity-access: `AccountRepo`, `ApprovalRoleRepo`, `PasswordHasher`, `RecoveryRepo`, `SuccessorEligibility`) | 6 (0 identity-access; còn `organization` E4 ×3, data-import, notifications, operating-parameters) |
| `oversizedFiles`                                                                                                     | 4 (`account.repo.ts` 411, `recovery.service.ts` 608, env-schema, employee-import)                                   | 2 (env-schema 425, `employee-import.service.ts` 545)                                              |
| `PUBLIC_CONTRACT_EXPORTS`                                                                                            | 8                                                                                                                   | 13 (+4 contract `accounts` ở facade; `RecoveryService` → hai entry)                               |
| `errorClassesOutsideErrorFiles`, `httpMappingInErrorFiles`, `httpMappingInServices`, `LEGACY_PRIVATE_MODULE_IMPORTS` | 2, 1, 1, 2 (ngoài identity-access)                                                                                  | không đổi                                                                                         |
| Root `identity-access`                                                                                               | 10 file, 0 controller                                                                                               | 6 file, 0 controller                                                                              |
| File non-spec / dòng của module                                                                                      | 52 / 5 628                                                                                                          | 78 / 6 583                                                                                        |
| Service > 6 dependency                                                                                               | 6 (`password-reset` 10, `recovery` 9, `login` 8, `account-invitation` 7, `password-change` 7, `session` 7)          | 0 (tối đa 6)                                                                                      |
| File lớn nhất                                                                                                        | `recovery.service.ts` 608, `account.repo.ts` 411                                                                    | `app-users.controller.ts` 296, `auth.controller.ts` 240, `app-user.repo.ts` 200                   |

## Behavior and design

Bất biến giữ nguyên (đối chiếu từng method chuyển và characterization):

- **Transaction:** mỗi use case giữ đúng ranh giới `TransactionRunner.run` cũ; contract service nhận `tx` của người gọi và
  truyền đúng client đó xuống repo (không mở giao dịch riêng). Hash mật khẩu chạy trước giao dịch (giao thức khóa, quy tắc 3).
  Đặt lại mật khẩu khi email đã bị chiếm trả kết quả `'invalid'` đã commit (không throw), như cũ.
- **Khóa:** Employee (`FOR SHARE` qua facade organization) → AppUser (`lockAppUser` SHARE/UPDATE hoặc `lockAndReadAccount`)
  → ticket/action token; khóa và đọc là hai câu lệnh; chế độ khóa của từng method giữ nguyên.
- **Thu hồi:** lý do phiên (`LOGOUT`, `REPLAY_DETECTED`, `ACCOUNT_LOCKED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`) và link
  (`SUPERSEDED`, `ACCOUNT_LOCKED`, `CREDENTIAL_CHANGED`) giữ nguyên giá trị và nơi dùng; recovery thu hồi phiên bằng
  `SessionRepo.revokeAllSessions(tx, id, 'PASSWORD_RESET', now)` qua port — cùng câu `updateMany` (`revokedAt IS NULL`),
  cùng giao dịch, cùng thứ tự (link → credential → phiên) như `RecoveryRepo.revokeSessions` đã xóa.
- **Audit:** cùng action, resource, payload và thứ tự; M-18/M-19 `{ reason }` và `after.reason` của khóa/mở khóa
  (`QĐ-81`); sự kiện operator recovery giữ nguyên (`QĐ-81c`, phiếu, M-14 môi trường ticket).
- **H3c:** quên mật khẩu không gửi thư khi có ticket `RESET_CREDENTIALS` đang chờ (PENDING hoặc AWAITING_ACTIVATION, kể cả
  khi link của phiếu đã hết hạn), kiểm trong cùng giao dịch sau khi khóa AppUser — nay qua `RecoveryTicketService`.
- **M-24** approval role `set()` và **M-28** điều kiện người kế nhiệm: cùng truy vấn, nay qua `ApprovalRoleDirectoryService`
  và port `APPROVAL_ROLE_HOLDINGS`.
- **Bảo mật:** không log mật khẩu, hash hay token; Argon2 config, policy version, so sánh dummy (thời gian đều) giữ nguyên;
  chỉ hash của action token được lưu.
- Ngoài ra không áp dụng: không migration, không đổi job, storage, outbox hay wire.

## Test matrix

| AC / rủi ro             | Tình huống                                                                                                    | Cấp test                  | Kết quả mong đợi                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------- |
| `CP0-05`                | thu hồi phiên ghi đúng một `SESSION.REVOKED` cho chính phiên của ca (lọc `resource_id`)                       | integration               | xanh trên code cũ và mới                  |
| `CP0-06`                | race recovery quan sát khóa bằng `pg_blocking_pids` của đúng backend giữ khóa                                 | integration               | như trên                                  |
| `CP0-07`                | mỗi ca tự dọn ticket nó mở (`afterEach`), `beforeEach` khẳng định không còn ticket chờ                        | integration               | như trên                                  |
| `CP0-08`                | H3c chặn khi ticket `RESET_CREDENTIALS` ở `AWAITING_ACTIVATION` và khi link của phiếu PENDING đã hết hạn      | integration (+ mutation)  | như trên; mutant bỏ kiểm tra fail         |
| Hành vi sẵn có          | auth, session, `/me`, tài khoản, lời mời, mật khẩu, approval role, chuyển giao, recovery + CLI, installation  | unit, integration, e2e    | xanh                                      |
| Boundary, ledger, graph | cạnh capability, export, provider trùng mỗi graph, E6 chính xác, recovery graph không controller/JWT, ratchet | unit (architecture gates) | xanh; ledger chỉ co lại                   |
| Contract                | 60 operation; OpenAPI                                                                                         | e2e, export               | `openapi.json` byte-identical `14fd428b…` |

## Definition of Done

- [x] Hạng mục refactor không có primary AC; `CP0-05` → `CP0-08` xanh trên code cũ và vẫn xanh sau mỗi phase.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; e2e + OpenAPI vì chạm controller.
- [x] Spec/plan/roadmap/rule phản ánh implementation cuối; không đổi contract nên không có thông báo FE.
- [x] Legacy ledger chỉ co lại; allowlist chỉ đổi theo contract thật (bốn contract `accounts`, hai entry recovery).
- [x] Phần chưa kiểm chứng ghi rõ ở plan.
- [ ] Owner review và commit/push.

## Changes and acceptance

- 19/10/2026: tạo hạng mục, thiết kế `ready`; implement Phase 0 (`CP0-05` → `CP0-08`) và H5.5 → H5.7, `verified` local
  (bằng chứng ở [plan](plan.md)). Chưa commit, chưa Owner review, chưa nghiệm thu.
