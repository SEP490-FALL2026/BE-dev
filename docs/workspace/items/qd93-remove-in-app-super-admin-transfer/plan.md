# Plan: qd93-remove-in-app-super-admin-transfer

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit lúc ghi) — plan dùng `D-S26`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn; chưa có.
- Triển khai: `in-progress` — implemented-local (phase A; full integration/e2e/timing pending phase B). PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, [lệnh vận hành](../../../rules/operational-commands.md),
  [API contract](../../../rules/api-contract.md), [test guide](../../../../test/README.md) và spec này.
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test và integration test **theo file đã sửa**, và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ
  `pnpm test:integration`, `pnpm test:e2e` hoặc `pnpm test:integration:timing`. (Trong plan: unit `pnpm test -- <đường dẫn>`,
  integration `pnpm test:integration -- <file>`, HTTP contract `pnpm test:http -- <file>`; chạy cả thư mục integration là chạy
  hàng loạt — hỏi Owner trước.)
- Thứ tự merge: hạng mục này là W1 và merge **sau** `qd93-remove-hr-basis-org-writes` (lát đó sửa
  `test/integration/identity-access/super-admin-transfer-http.integration-spec.ts` mà Task 2 xóa); không phụ thuộc chức năng
  vào hạng mục `QĐ-93` nào; rebase lên `dev` trước khi mở PR và trước merge.
  `qd93-direct-manager-spending-approver-roles` (W2) merge sau và rebase lên hạng mục này (danh sách file chung ở spec ›
  _Dependencies and blockers_).
- Migration: thư mục mới lấy timestamp UTC thật lúc tạo; trước merge đặt lại timestamp sau migration mới nhất trên `dev`.
  KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng nên gate
  `test/gates/migration-order.gate-spec.ts` vẫn xanh); Owner thêm vào danh sách khi phát hành. `<ts>` trong plan theo quy tắc
  này.
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
  `{ provide: APPROVAL_ROLE_HOLDINGS, … }` ở dòng 83-85 — grep lại trước khi gỡ:
  `grep -rn "SuccessorEligibility\|APPROVAL_ROLE_HOLDINGS" src`), `test/gates/module-graph.gate-spec.ts` (bỏ hai tên khỏi
  `DECLARED_FOR_API_AND_RECOVERY`), `accounts/account.errors.ts`, `accounts/account.http-errors.ts` (gỡ
  `SUPER_ADMIN_TRANSFER.*`, `SuperAdminTransferProblem`, đổi `message` của `SUPER_ADMIN_TRANSFER_ONLY`); xóa
  `test/http/identity-access/super-admin-transfer.http-spec.ts`,
  `test/integration/identity-access/super-admin-transfer-http.integration-spec.ts`; thêm
  `test/integration/identity-access/super-admin-transfer-removed.integration-spec.ts`; sửa
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-identity-access.ts`, `test/http/platform/openapi-presentation.http-spec.ts:254`
  (`toHaveLength(306)` → số trên `dev` lúc rebase − 1, tức 305; theo thứ tự merge của gói, từ 306 ở `1a77ffe8`:
  `qd93-remove-hr-basis-org-writes` 306 → `qd93-remove-in-app-super-admin-transfer` 305 (−1) →
  `qd93-parameter-labels-dashboard-queues` 305 → `qd93-direct-manager-spending-approver-roles` 305 →
  `qd93-remove-department-projects` phase 1 301 (−4) → `qd93-remove-fallback-substitute-approvers` phase A 299 (−2) →
  `qd93-unplaced-employee-first-placement` 300 (+1) → `qd93-code-format-xlsx-employee-import` 300 →
  `employee-directory-read` 302 (+2) → `qd93-budget-record-attachments` 312 (+10) → `dashboard-request-queues-wiring` 312;
  mỗi lát đổi số này trên nhánh của mình bằng số trên `dev` lúc rebase cộng/trừ phần của mình (thứ tự đổi thì số trung gian
  đổi theo)).
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

| Lệnh / kiểm tra AC                                                                                                                                                                              | Revision / môi trường                                                                                          | Kết quả thực chạy                                                                        | Giới hạn / việc còn lại                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:integration -- test/integration/identity-access/{super-admin-recovery-role,recovery-cli,super-admin-transfer-removed,account-roles-http,role-grant-constraints}.integration-spec.ts` | nhánh `feat/qd93-remove-in-app-super-admin-transfer` (cây sạch sau `57754e43`), PostgreSQL local `slm-test-db` | 5 suite, 51 test xanh; Task 1/2/3 đỏ trước (đã chạy), xanh sau                           | không chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:integration:timing` — phase B |
| `pnpm test:http`                                                                                                                                                                                | như trên                                                                                                       | 57 suite, 1447 test xanh (inventory 305 operation)                                       | —                                                                                                     |
| `pnpm test:gates -- test/gates/module-graph.gate-spec.ts`, `migration-order.gate-spec.ts`; `pnpm arch:check`; `pnpm arch:docs:check`; `pnpm prisma:validate`                                    | như trên                                                                                                       | 37/37, 6/6; không vi phạm; khớp; schema hợp lệ                                           | —                                                                                                     |
| `pnpm test -- src/modules/identity-access src/cli/recover`                                                                                                                                      | như trên                                                                                                       | xanh (191 test module; 33 test recovery + CLI ở Task 1)                                  | —                                                                                                     |
| `pnpm openapi:export`                                                                                                                                                                           | như trên                                                                                                       | không drift (305 operation)                                                              | —                                                                                                     |
| `pnpm check`                                                                                                                                                                                    | như trên                                                                                                       | xem nhật ký `A-qd93-remove-in-app-super-admin-transfer-implement.md` (mã thoát ghi ở đó) | CI GitHub chưa chạy                                                                                   |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

## Verification evidence (phase A, 02/11/2026) — verifier

Verifier độc lập (không phải implementer), revision `89202039`, cây sạch, so với cha `164f6e67`; PostgreSQL local
`slm-test-db` (127.0.0.1:55432); biến `TEST_DATABASE_*` chỉ đặt inline cho lệnh integration theo file, không export khi
`pnpm check`.

| Command                                                                                                                                                                                         | Result (real exit/counts)                                                                                                                                          | Notes                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                                                                    | exit 0; unit 327 suite / 4 444 test; gates 16 suite / 326 test; `test:scripts` 274 test, 272 pass, 0 fail, 2 skipped (symlink/POSIX mode trên Windows); build xanh | log `NOTE MD/qd93-logs/A-transfer-verify-check.log`                        |
| `pnpm rules:check`                                                                                                                                                                              | exit 0; 411 file, 3 340 link, 0 lỗi                                                                                                                                | chạy riêng ngoài `pnpm check`                                              |
| `pnpm test:integration -- test/integration/identity-access/{super-admin-recovery-role,recovery-cli,super-admin-transfer-removed,account-roles-http,role-grant-constraints}.integration-spec.ts` | exit 0; 5 suite / 51 test xanh                                                                                                                                     | theo file (`D-S26`)                                                        |
| `pnpm test:http -- test/http/platform`                                                                                                                                                          | exit 0; 12 suite / 188 test xanh                                                                                                                                   | gồm inventory/OpenAPI (305 operation); không chạy toàn bộ `pnpm test:http` |
| `git diff 164f6e67...HEAD -- scripts/verify/merged-migrations.txt`                                                                                                                              | 0 dòng                                                                                                                                                             | không sửa, đúng spec › _Migration_                                         |
| `pnpm test:integration` (toàn bộ), `pnpm test:e2e`, `pnpm test:integration:timing`                                                                                                              | deferred to phase B — not run                                                                                                                                      | cần Owner đồng ý (`D-S26`)                                                 |

Migration `20261102043614_identity_app_user_employee_immutable`: hàm `app_users_reject_employee_change` + trigger
`app_users_employee_immutable` `BEFORE UPDATE OF "employee_id"`, `IS DISTINCT FROM` ⟹ `23514` (ghi lại cùng giá trị vẫn
được), ghi chú rollback `DROP TRIGGER`/`DROP FUNCTION` — khớp OD-2 và spec › _Migration_; xếp sau `20261101000200` (mới nhất
trên cha).

Trạng thái task:

| Task | Trạng thái | Bằng chứng                                                                                                                                                                                                                                           |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | done       | `66eca12f`: gỡ `HOLDER_STILL_USABLE`, thêm `APPROVER_IS_HOLDER`, `SuccessorEnrolment.requireReady`, `SUCCESSOR_NOT_FOUND_ACCOUNT` trước phiếu, `--help`; đủ 6 ca plan đặt tên                                                                        |
| 2    | done       | `cb0dd725`: xóa 4 file `super-admin-transfers/`, gỡ hai provider chết khỏi `IdentityAccessModule` (giữ ở module CLI), gate `module-graph`, manifest, `openapi-presentation` 305; xóa spec HTTP + integration cũ, thêm `super-admin-transfer-removed` |
| 3    | done       | `a9dd573d`: migration OD-2, `role-grant-constraints` (23514), hồi quy AC-16 ở `super-admin-recovery-role`                                                                                                                                            |
| 4    | done       | `57754e43`: `operational-commands.md`, README, module README, ghi chú _superseded_ ở `us-01-09-super-admin-transfer-recovery`; không runbook `docs/guides/` nào nhắc `transfer-role`                                                                 |

Độ phủ theo AC (file dưới `test/integration/identity-access/`):

| AC                                            | Kết luận                        | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-09 AC-1                                 | covered                         | `super-admin-recovery-role…:176`; từ chối `:254`, `:263`, `:277`; unit `recovery-procedure.policy.spec.ts`                                                                                                                                                                                                                                                                                                                                                       |
| US-01-09 AC-2                                 | covered                         | `super-admin-recovery-role…:176` (token cũ 403, người nhận 200)                                                                                                                                                                                                                                                                                                                                                                                                  |
| US-01-09 AC-4 (nguyên tử)                     | **NOT covered — trong scope**   | spec.md:53 giữ AC-4 "chạy lại với ca có kế hoạch"; AC nay nói về lệnh vận hành. Ca bị xóa (`super-admin-transfer-http…:236`) chỉ thử service HTTP đã gỡ; `RoleHandover.move` (đường duy nhất còn lại) chưa từng có ca lỗi giữa thu hồi và cấp. Cần thêm ở `super-admin-recovery-role…`: spy `RoleGrantService.grantRole` ném lỗi một lần trong ca có kế hoạch ⟹ lệnh lỗi, `holders()` = `[S1]`, không audit `SUPER_ADMIN.TRANSFERRED_*`, phiếu không `COMPLETED` |
| US-01-09 AC-5                                 | covered (yếu hơn bản cũ)        | `super-admin-recovery-role…:291` — một vòng `Promise.all`, không ép chồng khóa, không kiểm deadlock như ca cũ (ba vòng, giữ `FOR UPDATE`)                                                                                                                                                                                                                                                                                                                        |
| US-01-09 AC-6                                 | covered                         | `super-admin-transfer-removed…:44` (6 người gọi 404, vai/audit không đổi); `test:http` platform (inventory 305)                                                                                                                                                                                                                                                                                                                                                  |
| US-01-09 AC-7, US-01-01 AC-13                 | covered                         | `account-roles-http…:80`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| US-01-09 AC-8                                 | covered ghép; vế route obsolete | vế route obsolete (spec.md:111, OD-1) — thay bằng 404 ở `super-admin-transfer-removed…:44`; vai không trống khi người giữ nghỉ: `super-admin-recovery-role…:307`, `:438`; role-grants từ chối `SUPER_ADMIN`: `account-roles-http…:80` (người giữ còn dùng được). Biến thể người giữ đã nghỉ (401) không còn test riêng — Low                                                                                                                                     |
| US-01-09 AC-12 (H1)                           | covered                         | `super-admin-recovery-role…:162`, `:206`, `:220`; hai giai đoạn `:307`                                                                                                                                                                                                                                                                                                                                                                                           |
| US-01-09 AC-13                                | covered                         | `super-admin-recovery-role…:26`, `:263`, `:277`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| US-01-09 AC-16                                | covered                         | `role-grant-constraints…:114` (23514); `super-admin-recovery-role…:493`, `:55`                                                                                                                                                                                                                                                                                                                                                                                   |
| Gác CSDL `role_grants_super_admin_exclusions` | một nửa mất                     | nửa trưởng phòng: `role-grant-constraints…:96`. Nửa người giữ vai duyệt (`approval_role_holders`, migration `20261016190000_super_admin_exclusions`) không còn test nào — ngoài AC hạng mục (AC-3 → `qd93-direct-manager-spending-approver-roles`), hạng mục đó cần phủ lại                                                                                                                                                                                      |
| Provider chết                                 | covered                         | gate `module-graph` (trong `pnpm check`), `recovery-cli…` xanh                                                                                                                                                                                                                                                                                                                                                                                                   |

Kết luận verifier: PARTIAL — mọi lệnh xanh, 4/4 task xong, nhưng AC-4 (nguyên tử của `transfer-role`) trong scope và chưa
có test.
