# Plan: qd93-remove-in-app-super-admin-transfer

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit lúc ghi) — plan dùng `D-S26`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn; chưa có.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, [lệnh vận hành](../../../rules/operational-commands.md),
  [API contract](../../../rules/api-contract.md), [test guide](../../../../test/README.md) và spec này.
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test và integration test **theo file đã sửa**, và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ
  `pnpm test:integration`, `pnpm test:e2e` hoặc `pnpm test:integration:timing`. (Trong plan: unit `pnpm test -- <đường dẫn>`,
  integration `pnpm test:integration -- <file>`, HTTP contract `pnpm test:http -- <file>`; chạy cả thư mục integration là chạy
  hàng loạt — hỏi Owner trước.)
- Thứ tự merge: hạng mục này là W1, không chờ hạng mục `QĐ-93` nào; rebase lên `dev` trước khi mở PR và trước merge.
  `qd93-direct-manager-spending-approver-roles` (W2) merge sau và rebase lên hạng mục này (danh sách file chung ở spec ›
  _Dependencies and blockers_).
- Migration: thư mục mới lấy timestamp UTC thật lúc tạo; trước merge đặt lại timestamp sau migration mới nhất trên `dev` và
  thêm tên thư mục vào `scripts/verify/merged-migrations.txt` (gate `test/gates/migration-order.gate-spec.ts`; danh sách hiện
  dừng ở `20261028110000_budget_version_detached_at`, không sửa lúc thiết kế). `<ts>` trong plan theo quy tắc này.
- Đối chiếu với BE hiện tại: `src/modules/identity-access/accounts/super-admin-transfers/*`,
  `src/modules/identity-access/public/{role-transfer-recovery.api.ts,recovery.errors.ts}`,
  `src/modules/identity-access/recovery/{successor-enrolment.service.ts,recovery-targets.service.ts,recovery-procedure.policy.ts}`,
  `src/modules/identity-access/{identity-access.module.ts,identity-access-recovery-cli.module.ts}`, `src/cli/recover/*`,
  `test/support/super-admin-recovery-harness.ts`, `test/gates/module-graph.gate-spec.ts`.
- OD-1 → OD-3 đã được Owner duyệt 01/11/2026 (spec); plan dưới đây theo đúng các quyết định đó. PostgreSQL riêng theo test
  guide.

## Tasks

### Task 1: ca có kế hoạch của `transfer-role` (test trước)

- Files: `src/modules/identity-access/public/role-transfer-recovery.api.ts` (`holderUsable` ⟹ không giai đoạn 1, không gửi lại lời
  mời), `src/modules/identity-access/recovery/successor-enrolment.service.ts` (method không gửi lời mời, ví dụ `requireReady`),
  `src/modules/identity-access/recovery/recovery-procedure.policy.ts` (`assertSeparation`: `APPROVER_IS_HOLDER`) + spec unit nếu
  có, `src/modules/identity-access/public/recovery.errors.ts` (gỡ `HOLDER_STILL_USABLE`, thêm `APPROVER_IS_HOLDER`; dùng
  `SUCCESSOR_NOT_FOUND_ACCOUNT` có sẵn), `src/cli/recover/recover.arguments.ts` (+ spec: `--help` nói `--holder-email` bắt buộc khi
  có người giữ vai), `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`,
  `test/support/super-admin-recovery-harness.ts`.
- Depends on: none.
- Acceptance: `US-01-09` AC-1, AC-2, AC-5, AC-12 (ca có kế hoạch) theo bảng spec; `HOLDER_STILL_USABLE` gỡ; không có
  `HOLDER_EMAIL_REQUIRED`; ca không dùng được giữ nguyên (hai giai đoạn, gửi lại lời mời).
- Verify: đổi ca hiện có `it('refuses while the holder can still act')` (`super-admin-recovery-role.integration-spec.ts:146-155`,
  người nhận `E-RS0` chưa có tài khoản) thành `it('refuses a successor with no account while the holder can still act, creating nothing')`
  (`SUCCESSOR_NOT_FOUND_ACCOUNT`, không dòng `app_users`/`account_action_tokens`/`recovery_tickets` mới) và thêm
  `it('moves the role while the holder is still usable')`, `it('refuses an invited successor without sending the invitation again')`
  (cả biến thể phiếu `AWAITING_ACTIVATION`), `it('refuses a planned transfer without the holder email')` (`TARGET_NOT_HOLDER`),
  `it('refuses an operator who is the holder')`, `it('refuses an approver who is the holder')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/recovery-cli.integration-spec.ts`; `pnpm test -- src/cli/recover`;
  `pnpm test -- src/modules/identity-access/recovery`.

### Task 2: gỡ `POST /api/v1/super-admin-transfers` (test trước)

- Files: xóa `src/modules/identity-access/accounts/super-admin-transfers/` (4 file); sửa `identity-access.module.ts` (gỡ
  controller, `SuperAdminTransferService`, và hai provider chết `SuccessorEligibility`,
  `{ provide: APPROVAL_ROLE_HOLDINGS, … }` ở dòng 83-85 — grep lại trước khi gỡ: `grep -rn "SuccessorEligibility\|APPROVAL_ROLE_HOLDINGS" src`),
  `test/gates/module-graph.gate-spec.ts` (bỏ hai tên khỏi `DECLARED_FOR_API_AND_RECOVERY`),
  `accounts/account.errors.ts`, `accounts/account.http-errors.ts` (gỡ `SUPER_ADMIN_TRANSFER.*`, `SuperAdminTransferProblem`, đổi
  `message` của `SUPER_ADMIN_TRANSFER_ONLY`); xóa `test/http/identity-access/super-admin-transfer.http-spec.ts`,
  `test/integration/identity-access/super-admin-transfer-http.integration-spec.ts`; thêm
  `test/integration/identity-access/super-admin-transfer-removed.integration-spec.ts`; sửa `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-identity-access.ts`.
- Depends on: Task 1 (đường thay thế có trước khi gỡ đường cũ).
- Acceptance: `US-01-09` AC-6, AC-7, `US-01-01` AC-13; `successor-eligibility.service.ts` vẫn được
  `IdentityAccessRecoveryCliModule` dùng; `IdentityAccessModule` không còn provider chết. Nhiều file vì gỡ một capability và các
  manifest của nó — thay đổi cơ học, chứng minh bằng inventory + typecheck + gate đồ thị module.
- Verify: ca viết trước `it('answers 404 to the removed transfer route and changes nothing')` đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/super-admin-transfer-removed.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/account-roles-http.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/recovery-cli.integration-spec.ts` (lệnh khôi phục còn đủ provider);
  `pnpm test:gates -- test/gates/module-graph.gate-spec.ts`; `pnpm openapi:export` rồi `pnpm test:http -- test/http/platform`;
  `pnpm check`.

### Task 3: tài khoản gắn đúng một người (`US-01-09` AC-16)

- Files: `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts` (ca hồi quy); migration OD-2
  `prisma/migrations/<ts>_identity_app_user_employee_immutable/migration.sql` (`<ts>` theo quy tắc ở _Before coding_),
  `test/integration/identity-access/role-grant-constraints.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: không route/lệnh đổi `employee_id`; trigger `app_users_employee_immutable` (OD-2) từ chối 23514.
- Verify: `pnpm test:integration -- test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/role-grant-constraints.integration-spec.ts`; `pnpm prisma:validate`;
  `pnpm test:gates -- test/gates/migration-order.gate-spec.ts`.

### Task 4: tài liệu vận hành và module

- Files: `docs/rules/operational-commands.md` (dòng `ops:recover`: ca có kế hoạch, `--holder-email`), runbook khôi phục hiện có
  dưới `docs/guides/` (nếu có mục `transfer-role`), `src/modules/identity-access/README.md`, `docs/generated/routes.md`
  (`pnpm arch:routes`), ghi chú _superseded_ ở spec `us-01-09-super-admin-transfer-recovery`.
- Depends on: Task 2.
- Acceptance: không tài liệu nào còn hướng dẫn chuyển giao trong ứng dụng.
- Verify: `pnpm arch:docs:check`; `pnpm rules:check`; `pnpm rules:format`.

### Checkpoint

`pnpm check`; `pnpm test:http`; integration theo từng file đã sửa/thêm ở Task 1–3
(`super-admin-recovery-role`, `recovery-cli`, `super-admin-transfer-removed`, `account-roles-http`, `role-grant-constraints`
dưới `test/integration/identity-access/`); `pnpm openapi:export` không drift; hỏi Owner có chạy toàn bộ `pnpm test:integration`
và `pnpm test:e2e` trước PR không (`D-S26`); tự review diff theo bảng Primary và test matrix.

## Verification and handoff

Chọn lệnh theo CONTRIBUTING.md và test/README.md, chạy từ gốc BE, trong giới hạn `D-S26`: `pnpm check`, integration theo file,
và — sau khi Owner đồng ý — `pnpm test:integration`, `pnpm test:e2e` (database riêng theo test guide); `pnpm openapi:export`;
chỉ tài liệu dùng `pnpm rules:check` và `pnpm rules:format`.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | thiết kế, chưa implement |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
