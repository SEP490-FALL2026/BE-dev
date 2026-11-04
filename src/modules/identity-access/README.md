# identity-access

Mục đích: tài khoản đăng nhập (tách khỏi hồ sơ nhân sự), vai trò (một grant `SPENDING_APPROVER` duy nhất là vai phê duyệt;
không còn approver dự phòng hay người thay thế, QĐ-93c), phiên và token, mật khẩu, chuyển và khôi phục Super Admin. Story
chính: US-01-01 (quản trị tài khoản, đăng nhập), US-01-02 (vai trò suy ra), US-01-03 (vai trò phê duyệt), US-01-09 (chuyển,
khôi phục Super Admin), US-01-10 (phiên, mật khẩu).

Tầng: T2 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications, organization (cạnh cùng tầng
duy nhất được phép). Được dùng bởi: budgets, catalog, installation, licensing, onboarding, personnel, requests
([module-graph](../../../docs/generated/module-graph.md)); guard xác thực của `infrastructure/security` qua token
`ACCESS_TOKEN_VERIFIER` mà `IdentityAccessModule` export.

## Public API (`public/`)

- `IdentityAccessApi` ([public/identity-access.api.ts](public/identity-access.api.ts)):
  - `prepareCredential` — kiểm chính sách và băm mật khẩu; gọi trước khi mở transaction.
  - `createBootstrapSuperAdmin` — chỉ cho lệnh cài đặt (FR-9.8).
  - `isActionLinkUsable` — worker hỏi trước khi gửi mail có link.
  - `inspectEmployeeAccount` — tài khoản của nhân viên: có không, dùng được không, vai trò gì (khóa `FOR SHARE`); thân hàm ở
    `accounts/account-record.service.ts`, facade và `employee-accounts.listener.ts` cùng gọi nó.
  - `markEmployeeLeft` — ghi ngày người rời đi lên tài khoản của họ.
  - `findUsableItAdminEmployeeIds`, `findUsableFinanceEmployeeId`, `countUsableItAdminsExcept`, `getSuperAdminHolder`,
    `listRoleHoldersAmong` — ai đang giữ vai trò nào.
  - `getSpendingApproverEmployeeId(tx?, { forShare? })` — ai giữ vai Người duyệt chi (grant còn hiệu lực); với `forShare` khóa
    dòng grant tới hết transaction để mở bước chi và thu hồi vai lần lượt (M6). `lockSpendingApproverAmong` — khóa tài khoản
    `FOR SHARE` rồi nói ai trong danh sách giữ vai. Không còn `getApprovalRoleHolders`, `everHeldSpendingApproverAmong`, không còn
    route `/approval-roles`.
  - `findAccountIdOfEmployee`, `findLoginEmailOfEmployee`, `employeeIdsOfAccounts` — ánh xạ tài khoản ↔ nhân viên.
- `RequestPartyEligibilityApi` (`public/request-party-eligibility.api.ts`) — hợp đồng chung D-S21: Người duyệt chi không bao giờ là
  bên của Request (người gửi, người được cấp, người chịu trách nhiệm); `assertEligible` (khóa rồi phán, ném
  `REQUEST_PARTY.INELIGIBLE` 422), `blockOf` (không khóa), `ineligibleAmong` (lọc danh sách chọn, lý do từng dòng nhóm). Phán định thuần
  ở `request-party/request-party.policy.ts`.
- `HolderRecoveryApi`, `RoleTransferRecoveryApi` (`public/holder-recovery.api.ts`, `role-transfer-recovery.api.ts`) —
  khôi phục và đổi người giữ vai Super Admin (ca có kế hoạch lẫn khẩn cấp), chỉ lệnh `pnpm ops:recover` (qua
  `identity-access-recovery-cli.module.ts`).
- `IdentityAccessInspectionApi` — chỉ `pnpm ops:inspect`; `LocalDemoAccountApi` — chỉ `pnpm dev:seed` và
  `pnpm ops:demo-dataset` (qua `DemoAccountsApi` của installation).
- Type/lỗi: `identity-access.types.ts`, `identity-access.errors.ts`, `recovery.types.ts`, `recovery.errors.ts`.

## Bảng sở hữu

- `app_users`, `password_credentials`, `role_grants`, `auth_sessions`, `refresh_tokens`, `login_throttles`,
  `account_action_tokens`, `recovery_tickets`; bảng `approval_role_holders` đã gỡ (migration `…_identity_drop_approval_role_holders`,
  QĐ-93c; chỉ `migration-preflight.repo.ts` còn đọc nó, khi có, cho DB cũ)
  ([prisma/models/identity-access.prisma](../../../prisma/models/identity-access.prisma)).

## Extension point

- Mở: `ApprovalRoleChangeListeners` (`identity-access.approval-role-change-listeners`,
  [public/identity-access.extension-points.ts](public/identity-access.extension-points.ts)), phát từ
  `accounts/role-grant.service.ts` (cấp/thu hồi/chuyển `SPENDING_APPROVER`) — bên đăng ký: requests
  `reassignment/approval-role.listener.ts`, budgets `budget/spending-approver-wait.listener.ts` và licensing
  `subscription-renewal/spending-approver-wait.listener.ts` (báo Super Admin một lần mỗi đoạn chờ).
- Đăng ký vào: `organization.employee-accounts` (`EmployeeAccountsHook`) — `accounts/employee-accounts.listener.ts`.
- Token DI nội bộ, không phải point liên module: `ACCOUNT_SESSIONS` (`accounts/account-sessions.types.ts`),
  `APPROVAL_ROLE_HOLDINGS` (`accounts/account.types.ts`); gate `test/gates/module-graph.gate-spec.ts` ghim chúng.

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module identity-access`, gate `capability-graph`). Từ thấp lên cao: `credentials` →
`accounts` → `approval-roles` (chỉ `approval-role-facts.service.ts`, đọc grant), `request-party` (đọc qua `accounts/`),
`recovery` → `auth` → `access`. Thứ gì `accounts/` và `recovery/` cùng cần thì ở `accounts/`
(ví dụ `account-sessions.types.ts`), không đặt ở `auth/` vì `auth/` đứng trên cả hai.

## Capability → file chính

- `auth/` — `auth.controller.ts` (`/auth/login`, `refresh`, `logout`, `password-reset-requests`, `password-resets`,
  `invitations/redeem`; đều `@Public`) → `login.service.ts`, `session.service.ts`, `password-reset*.service.ts`,
  `invitation-redemption.service.ts` (ở `accounts/`); `login-throttle.service.ts`, `token.service.ts`.
- `access/` — `me.controller.ts` (`GET /me`, `POST /me/password`) → `me.service.ts`;
  `jwt-access-token-verifier.service.ts`; `effective-roles.policy.ts` authorizes direct grants with manager scope limited to the departments currently headed. `/me` returns the direct `roles` array and nullable `managerScope`.
- `accounts/` — `app-users/app-users.controller.ts` (`/app-users*`, `/account-candidates`) →
  `account-invitation.service.ts`, `account-status.service.ts`, `account-query.service.ts`,
  `account-administration.policy.ts`; `role-grant.service.ts`, `action-link.service.ts`. Không còn route đổi người giữ vai
  Super Admin trong ứng dụng (QĐ-93e).
- `credentials/` — mật khẩu của tài khoản: `credential.service.ts`, `credential.repo.ts`, `password-hasher.service.ts` (Argon2id),
  `password.policy.ts`; không import capability nào, `accounts/`, `auth/` và `recovery/` import nó (tách khỏi `accounts/` để thư
  mục đó dưới trần 25 file sau khi `mappers/`, `dto/`, `policies/` được dời vào).
- `approval-roles/` — chỉ còn `approval-role-facts.service.ts` (dữ kiện vai của grant cho kiểm tra khi cấp); không controller,
  `GET`/`PUT /approval-roles` trả 404 (QĐ-93c). `request-party/` — `request-party.policy.ts` (thuần) và
  `request-party-eligibility.service.ts`; service tiêm `accounts/`, không tiêm `IdentityAccessApi`. `recovery/` — các bước của `pnpm ops:recover` (không có controller).
- Nest: `identity-access.module.ts` (API: controller, JWT), `identity-access-facade.module.ts` (facade, mọi graph),
  `identity-access-recovery-cli.module.ts`, `identity-access-inspection-facade.module.ts`, `identity-access-local-seed-facade.module.ts`.

## Bất biến quan trọng

- Mỗi tài khoản có đúng một grant hiệu lực; index `role_grants_one_role_per_account` chặn grant thứ hai. Lịch sử thu hồi được giữ.
  Tối đa một người giữ mỗi vai `SUPER_ADMIN`, `FINANCE`, `SPENDING_APPROVER` trong tổ chức; các guard trưởng phòng giữ nguyên.
- Tạo tài khoản nhận `role?` (mặc định `EMPLOYEE`), từ chối trường `roles`. Đổi vai bằng `PUT /app-users/{id}/role`, trả `ROLE.CHANGED`;
  đổi cùng vai là no-op. Hai route POST/DELETE `role-grants` đã bỏ (404), các mã lỗi tổ hợp vai/đã cấp/chưa cấp đã bỏ.
- `/me.roles` vẫn là mảng, hiện có một phần tử; `/me.selfServiceOnly` đã bỏ. `MANAGER` chỉ có phạm vi ở phòng đang đứng đầu.
- `SUPER_ADMIN` chỉ đổi chủ bằng `pnpm ops:recover transfer-role`; route đổi vai từ chối nó. Recovery chuẩn bị người nhận với
  `EMPLOYEE`; hoàn tất thay người nhận thành `SUPER_ADMIN` và người cũ thành `EMPLOYEE`, audit before/after đúng vai. Tài khoản gắn đúng một
  người: trigger `app_users_employee_immutable` từ chối đổi `employee_id`.
- Thứ tự khóa: nhân viên → tài khoản (`FOR SHARE`) → ticket khôi phục; băm mật khẩu trước khi mở transaction.
- Chỉ lưu SHA-256 của refresh token và của token trong link; JWT chỉ nhận HS256 (`algorithms` ghim khi verify).
- Đăng nhập sai vì lý do gì cũng cùng một câu trả lời (US-01-01 AC-10); không ai tự đổi tài khoản của mình (AC-13).

## Test

- Unit: `src/modules/identity-access/**/*.spec.ts`; HTTP: `test/http/identity-access/`; integration:
  `test/integration/identity-access/`.

`MANAGER` and `SPENDING_APPROVER` are direct grants; the latter is unique and cannot be a department head. Account listing can filter department membership on a date.

## Migration QD-95

`20261104120000_identity_one_role_per_account` refuses accounts with `MULTIPLE_ROLES` or `NO_ROLE`, listing employee codes before any schema change. It does not backfill or repair data. Rebuild the database and seed again as instructed by the Owner. A failed `migrate deploy` leaves a failed Prisma history row: after correcting/rebuilding data, the Owner runs `prisma migrate resolve --rolled-back 20261104120000_identity_one_role_per_account` before retrying deployment.

The partial unique index limits effective grants to one per account; all application creation and replacement paths supply that role. Historical revoked grants remain.
