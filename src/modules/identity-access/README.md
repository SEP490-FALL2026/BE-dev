# identity-access

Mục đích: tài khoản đăng nhập (tách khỏi hồ sơ nhân sự), vai trò, phiên và token, mật khẩu, vai trò phê duyệt, chuyển
và khôi phục Super Admin. Story chính: US-01-01 (quản trị tài khoản, đăng nhập), US-01-02 (vai trò suy ra), US-01-03
(vai trò phê duyệt), US-01-09 (chuyển, khôi phục Super Admin), US-01-10 (phiên, mật khẩu).

Tầng: T2 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, notifications, organization (cạnh cùng tầng
duy nhất được phép). Được dùng bởi: budgets, catalog, installation, licensing, onboarding, personnel, requests
([module-graph](../../../docs/generated/module-graph.md)); guard xác thực của `infrastructure/security` qua token
`ACCESS_TOKEN_VERIFIER` mà `IdentityAccessModule` export.

## Public API (`public/`)

- `IdentityAccessApi` ([public/identity-access.api.ts](public/identity-access.api.ts)):
  - `prepareCredential` — kiểm chính sách và băm mật khẩu; gọi trước khi mở transaction.
  - `createBootstrapSuperAdmin` — chỉ cho lệnh cài đặt (FR-9.8).
  - `isActionLinkUsable` — worker hỏi trước khi gửi mail có link.
  - `inspectEmployeeAccount` — tài khoản của nhân viên: có không, dùng được không, vai trò gì (khóa `FOR SHARE`).
  - `markEmployeeLeft` — ghi ngày người rời đi lên tài khoản của họ.
  - `findUsableItAdminEmployeeIds`, `findUsableFinanceEmployeeId`, `countUsableItAdminsExcept`, `getSuperAdminHolder`,
    `listRoleHoldersAmong` — ai đang giữ vai trò nào.
  - `getApprovalRoleHolders` — ai giữ ba vai trò phê duyệt (định tuyến bước của Request).
  - `findAccountIdOfEmployee`, `findLoginEmailOfEmployee`, `employeeIdsOfAccounts` — ánh xạ tài khoản ↔ nhân viên.
- `HolderRecoveryApi`, `RoleTransferRecoveryApi` (`public/holder-recovery.api.ts`, `role-transfer-recovery.api.ts`) —
  khôi phục Super Admin, chỉ lệnh `pnpm ops:recover` (qua `recovery.module.ts`).
- `IdentityAccessInspectionApi` — chỉ `pnpm ops:inspect`; `LocalDemoAccountApi` — chỉ `pnpm dev:seed` và
  `pnpm ops:demo-dataset` (qua `DemoAccountsApi` của installation).
- Type/lỗi: `identity-access.types.ts`, `identity-access.errors.ts`, `recovery.types.ts`, `recovery.errors.ts`.

## Bảng sở hữu

- `app_users`, `password_credentials`, `role_grants`, `auth_sessions`, `refresh_tokens`, `login_throttles`,
  `account_action_tokens`, `approval_role_holders`, `recovery_tickets`
  ([prisma/models/identity-access.prisma](../../../prisma/models/identity-access.prisma)).

## Extension point

- Mở: `ApprovalRoleChangeListeners` (`identity-access.approval-role-change-listeners`,
  [public/identity-access.extension-points.ts](public/identity-access.extension-points.ts)), phát từ
  `accounts/role-grant.service.ts` và `approval-roles/approval-role.service.ts` — bên đăng ký: requests
  `reassignment/approval-role.listener.ts`.
- Đăng ký vào: `organization.employee-accounts` (`EmployeeAccountsHook`) — `accounts/employee-accounts.listener.ts`.
- Token DI nội bộ, không phải point liên module: `ACCOUNT_SESSIONS` (`account-sessions.extension-points.ts`),
  `APPROVAL_ROLE_HOLDINGS` (`accounts/account.types.ts`); gate `test/gates/module-graph.gate-spec.ts` ghim chúng.

## Capability → file chính

- `auth/` — `auth.controller.ts` (`/auth/login`, `refresh`, `logout`, `password-reset-requests`, `password-resets`,
  `invitations/redeem`; đều `@Public`) → `login.service.ts`, `session.service.ts`, `password-reset*.service.ts`,
  `invitation-redemption.service.ts` (ở `accounts/`); `login-throttle.service.ts`, `token.service.ts`.
- `access/` — `me.controller.ts` (`GET /me`, `POST /me/password`) → `me.service.ts`;
  `jwt-access-token-verifier.service.ts`; `effective-roles.policy.ts` (vai trò suy ra, ví dụ MANAGER khi đang làm trưởng
  phòng).
- `accounts/` — `app-users/app-users.controller.ts` (`/app-users*`, `/account-candidates`) →
  `account-invitation.service.ts`, `account-status.service.ts`, `account-query.service.ts`,
  `account-administration.policy.ts`; `super-admin-transfers/` (`POST /super-admin-transfers`); `role-grant.service.ts`,
  `action-link.service.ts`.
- `approval-roles/` — `approval-roles.controller.ts` (`GET /approval-roles`, `PUT /approval-roles/{role}`) →
  `approval-role.service.ts`. `recovery/` — các bước của `pnpm ops:recover` (không có controller).
- Nest: `identity-access.module.ts` (API: controller, JWT), `identity-access-facade.module.ts` (facade, mọi graph),
  `recovery.module.ts`, `identity-access-inspection-facade.module.ts`, `identity-access-local-seed-facade.module.ts`.

## Bất biến quan trọng

- Tối đa một grant `SUPER_ADMIN` còn hiệu lực (index `role_grants_one_super_admin`); `SUPER_ADMIN` không đi cùng
  IT_ADMIN hay FINANCE trên một tài khoản, không trao cho trưởng phòng hay người giữ vai trò phê duyệt (trigger).
- `SUPER_ADMIN` chỉ đổi chủ qua `POST /super-admin-transfers` hoặc `pnpm ops:recover`; route grant/revoke từ chối nó.
- Thứ tự khóa: nhân viên → tài khoản (`FOR SHARE`) → ticket khôi phục; băm mật khẩu trước khi mở transaction.
- Chỉ lưu SHA-256 của refresh token và của token trong link; JWT chỉ nhận HS256 (`algorithms` ghim khi verify).
- Đăng nhập sai vì lý do gì cũng cùng một câu trả lời (US-01-01 AC-10); không ai tự đổi tài khoản của mình (AC-13).

## Test

- Unit: `src/modules/identity-access/**/*.spec.ts`; HTTP: `test/http/identity-access/`; integration:
  `test/integration/identity-access/`.
