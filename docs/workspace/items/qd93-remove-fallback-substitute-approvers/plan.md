# Plan: qd93-remove-fallback-substitute-approvers

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8` (+ `qd93-direct-manager-spending-approver-roles` và
  `qd93-remove-department-projects` phase 1 đã `merged-dev` — ghi revision thật khi bắt đầu).
- Bổ sung sau pin: `D-S17`…`D-S26` (Docs chưa commit) — Owner 01/11/2026; plan này áp `D-S20`…`D-S23`, `D-S26`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: audit độc lập 01/11/2026 và review
  vòng 2 02/11/2026 đã xử lý (spec › `## Changes and acceptance`).
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, [module structure](../../../rules/module-structure.md),
  [API contract](../../../rules/api-contract.md) (`OPENAPI-EXAMPLE.1`), [database](../../../rules/database-business.md) (`DB-15`),
  [lệnh vận hành](../../../rules/operational-commands.md), [test guide](../../../../test/README.md), spec này và spec của
  [hạng mục đi trước](../qd93-direct-manager-spending-approver-roles/spec.md).
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test và integration test **theo file đã sửa**, và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ
  `pnpm test:integration`, `pnpm test:e2e` hoặc `pnpm test:integration:timing`.
- **Phụ thuộc theo thứ tự merge:** W3 — bắt đầu khi `qd93-direct-manager-spending-approver-roles` và
  `qd93-remove-department-projects` phase 1 đã `merged-dev`; rebase trên `dev` trước khi merge; Phase A **ship cùng bản phát hành**
  với roles. `qd93-unplaced-employee-first-placement` merge sau Phase A (thêm nhánh `UNPLACED` vào policy chung của Task 4). Phase B
  (Task 12–13) là W5, bản phát hành riêng, sau khi lệnh chuyển đổi đã chạy ở mọi môi trường. Đối chiếu spec với `dev` lúc đó (không
  phải `1a77ffe8`): `IdentityAccessApi.lockSpendingApproverAmong` và service `accounts/` mà nó gọi (capability `request-party/`
  tiêm service đó), `getApprovalRoleHolders()` đọc grant, lệnh thu hồi `UPDATE`
  `role_grants.revoked_at` (điều kiện của khóa `FOR SHARE` ở M6), định nghĩa hàm `role_grants_forbid_super_admin_for_heads_and_approvers`.
- **Luật timestamp migration (`DB-15`):** mỗi thư mục migration mới lấy timestamp thật lúc tạo; trước merge, rebase lên `dev`,
  đổi timestamp cho đứng sau migration mới nhất trên `dev` và thêm tên thư mục vào `scripts/verify/merged-migrations.txt` (gate
  migration-order; ở `1a77ffe8` danh sách dừng ở `20261028110000_budget_version_detached_at` trong khi `prisma/migrations` đã tới
  `20261101000200_licensing_subscription_renewals` — không sửa danh sách lúc thiết kế). `<ts>`/`<ts+1>` dưới đây là chỗ giữ theo
  luật này.
- Đã xác minh khi sửa sau audit (BE `1a77ffe8`, ghi ở spec): dòng nhóm dùng cùng enum `AccessRequestCancelCause`; đường IT Admin
  chỉ định người chịu trách nhiệm mới là `POST /provisioning-tasks` (`responsibleEmployeeId` →
  `ProvisioningHolderService.service`); sự kiện người giữ vai rời đi cho phiên bản/gia hạn là `OrganizationChange` `EMPLOYEE_LEFT`
  (bước chi dùng sweep `HOLDER_LEFT` hiện có); bộ chọn của tạo thay là `groupRequestCandidateList`. Còn phải xác minh trên `dev`:
  nhánh nào đang chuyển hàng đợi trình sang `DIRECT` khi trưởng phòng rời đi (Task 7).
- OD-1 → OD-7 đã được Owner duyệt 01/11/2026 (OD-2 thay bởi `D-S21`; OD-4 theo `D-S16`; OD-7 Docs ghi vào `QĐ-93k`) — đọc chữ ở
  `Decisions/project-decisions.md` của Docs working tree hoặc commit mới hơn `69e8a3d`.
- PostgreSQL riêng theo test guide.
- Phase B là **lần triển khai riêng**: không merge Task 12–13 chung PR với Phase A.

## Tasks

### Phase A1 — Định tuyến, reassign, đóng băng

### Task 1: migration giá trị nguyên nhân hủy và nới hai ràng buộc

- Files: `prisma/migrations/<ts>_requests_spending_approver_party_values/migration.sql`,
  `prisma/migrations/<ts+1>_requests_spending_approver_party_cancellation/migration.sql` (SQL ở spec › _Migration_),
  `prisma/models/requests.prisma` (enum), `src/modules/installation/public/recovery-target.policy.ts` (+ `.spec.ts`), `Dockerfile`
  (nhãn `data-reads`), câu đếm của `src/modules/installation/migration-preflight/migration-preflight.repo.ts`,
  `test/integration/requests/access-request-constraints.integration-spec.ts`.
- Depends on: roles + projects phase 1 `merged-dev`.
- Acceptance: cause `SPENDING_APPROVER_PARTY` tồn tại (Request và dòng nhóm); `CANCELLED` với cause này cho phép người đóng NULL ở
  cả hai bảng, mọi cause khác vẫn bắt buộc (OD-6); hai dạng dữ liệu `access-request-cancel-spending-approver-party`,
  `access-request-step-qd93-waiting-reason` có trong danh mục, nhãn Dockerfile và câu đếm (M5).
- Verify: ca viết trước `it('allows a cancellation with no employee only for SPENDING_APPROVER_PARTY, on requests and lines')`
  đỏ rồi xanh: `pnpm test:integration -- test/integration/requests/access-request-constraints.integration-spec.ts`;
  `pnpm test -- src/modules/installation/public/recovery-target.policy.spec.ts`; `pnpm prisma:validate`;
  `pnpm test:gates`.

### Task 2: bảng định tuyến nhu cầu không còn approver dự phòng (test trước)

- Files: `src/modules/requests/access-request/{routing.policy.ts,routing.policy.spec.ts,routing-facts.service.ts,need-decision.policy.ts,need-decision.policy.spec.ts,access-request.types.ts}`,
  `src/modules/requests/group-request-submission/{group-need-routing.policy.ts,group-need-routing.policy.spec.ts}`,
  `src/modules/requests/request-submission/{request-preview.policy.ts,request-preview.policy.spec.ts,request-preview.dto.ts}`.
- Depends on: Task 1.
- Acceptance: bảng ở spec › _Định tuyến bước nhu cầu_; kiểu `RoutedRole`, `WaitingReason`, `RoutingDecision` đúng spec;
  `RoutingFacts` không còn approver dự phòng; `deciderRoleOf(3|4) = null`; preview dòng 4 `WAITS_FOR_DEPARTMENT_HEAD`.
- Verify: unit `it('waits with NO_DEPARTMENT_HEAD on row 4 when the department has no head')`,
  `it('never routes to a fallback approver')`, `it('a group line of a department without head waits')`,
  `it('names no decider role for a legacy row 3 or 4')` đỏ rồi xanh:
  `pnpm test -- src/modules/requests/access-request src/modules/requests/group-request-submission src/modules/requests/request-submission`.

### Task 3: `REWAIT`, đóng băng, trigger `QD93_CONVERSION`, cảnh báo `D-S20` (test trước)

- Files: `src/modules/requests/step-routing/{reassignment.policy.ts,reassignment.policy.spec.ts,step-target.service.ts,step-reassignment.repo.ts}`,
  `src/modules/requests/reassignment/{step-reassignment.service.ts,reassignment-audit.mapper.ts,controlled-wait.dto.ts,controlled-wait-alert.service.ts}`,
  `src/modules/identity-access/public/identity-access.api.ts` (`everHeldSpendingApproverAmong`),
  `src/modules/identity-access/accounts/{role-grant.service.ts,role-grant.repo.ts}` (câu đọc mọi dòng grant `SPENDING_APPROVER`,
  kể cả đã thu hồi),
  `test/integration/requests/controlled-wait.integration-spec.ts`, `test/integration/requests/step-reassignment.integration-spec.ts`,
  `test/integration/requests/step-reassignment-paid.integration-spec.ts`, `test/support/reassignment-harness.ts` (dựng bước chi
  người thay thế giữ bằng SQL — route `/approval-roles` đã gỡ ở Phase A).
- Depends on: Task 2.
- Acceptance: spec › _Lý do chờ, gợi ý, người nhận cảnh báo_ và _Xác định lại và chờ lại_: `REWAIT` giữ `waiting_since`/`created_at`/
  `routing_row`, audit `STEP_WAITING_REASON_CHANGED`; bước `legacy` đứng yên với mọi trigger trừ `QD93_CONVERSION`; bước chi chỉ
  `legacy` khi người giữ **chưa từng** có dòng grant `SPENDING_APPROVER` (spec › _Luật bước chi cũ_) — thu hồi/chuyển vai thường
  vẫn chờ lại/giao lại bước chi của người cũ như trước (`US-01-03` AC-3, `US-05-11` AC-10); bước cũ mà bảng vẫn chọn người đang
  giữ ⟹ `ASSIGN` (ghi lại dòng); `alertRecipientsOf` luôn `['SUPER_ADMIN']`; `NO_DEPARTMENT_HEAD` phát cảnh báo controlled-wait;
  `US-05-03` AC-4, `US-05-11` AC-6, `US-05-12` AC-3, AC-11, `US-01-02` AC-10; giá trị cũ còn đọc được.
- Verify: unit viết trước (`reassignment.policy.spec.ts`) `it('rewaits with the new reason and keeps the stretch')`,
  `it('keeps a legacy step frozen for every trigger but the conversion')`, `it('reassigns a legacy step to its own holder to rewrite the row')`,
  `it('never calls a spend step of a former or current grant holder legacy')`,
  `it('calls a spend step legacy only when its holder never held SPENDING_APPROVER')`;
  integration viết trước `it('hands a waiting need step to the new head without resetting its age')`,
  `it('waits until a future-dated head starts, then hands the step over')`,
  `it('alerts the Super Admin once when a need step waits with NO_DEPARTMENT_HEAD')`,
  `it('moves no legacy step on a sweep before the conversion')`,
  `it('moves the pending spend step of a revoked or transferred spending approver as before')`,
  `it('keeps a substitute-held spend step frozen through a revoke and a transfer')` đỏ rồi xanh:
  `pnpm test -- src/modules/requests/step-routing src/modules/requests/reassignment`;
  `pnpm test:integration -- test/integration/requests/controlled-wait.integration-spec.ts test/integration/requests/step-reassignment.integration-spec.ts test/integration/requests/step-reassignment-paid.integration-spec.ts`.

### Task 3b: từ chối quyết trên bước đóng băng; hàng đợi không trả bước dòng 3/4 (test trước)

- Files: `src/modules/requests/access-request/{need-decision.policy.ts,access-request.errors.ts,access-request.http-errors.ts}`,
  `src/modules/requests/need-decision/need-decision.service.ts`, `src/modules/requests/need-decision-queue/{need-decision-queue.repo.ts,need-decision-queue.mapper.ts}`,
  `src/modules/requests/group-line-decisions/{group-need-decision.service.ts,group-spend-record.service.ts}`,
  `src/modules/requests/spend/spend-decision.policy.ts` (+ spec), `src/modules/requests/spend-approval/{spend-decision.service.ts,spend-batch-decision.service.ts}`,
  `test/integration/requests/spend-need-decision.integration-spec.ts`, `test/integration/requests/need-decision-queue-handover.integration-spec.ts`,
  `test/integration/requests/spend-approval.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: spec › _Bước cũ đóng băng tới khi chuyển đổi_: 409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION` trên bốn route quyết,
  lý do bỏ qua `STEP_AWAITING_CONVERSION` ở `spendBatchDecide`; kiểm sau `OWN_REQUEST`/`NOT_THE_ASSIGNEE`, trước `STEP_NOT_PENDING`;
  bước chi dùng **cùng** luật của Task 3 (`everHeldSpendingApproverAmong(tx, [người giữ])`) — Người duyệt chi mới sau chuyển vai
  quyết bước vừa được giao, không 409; hàng đợi nhu cầu không gọi `deciderRoleOf(3|4)`.
- Verify: unit `it('refuses a decision on a legacy step')` (need và spend policy),
  `it('lets the new holder decide a spend step handed over by a role transfer')` (spend policy) đỏ rồi xanh:
  `pnpm test -- src/modules/requests/access-request/need-decision.policy.spec.ts src/modules/requests/spend/spend-decision.policy.spec.ts`;
  integration viết trước `it('answers 409 only for a substitute-held spend step, never after a normal transfer')`:
  `pnpm test:integration -- test/integration/requests/spend-need-decision.integration-spec.ts test/integration/requests/need-decision-queue-handover.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts`.

### Checkpoint A1

`pnpm typecheck`; `pnpm lint`; `pnpm test -- src/modules/requests`;
`pnpm test:integration -- test/integration/requests/access-request-constraints.integration-spec.ts test/integration/requests/controlled-wait.integration-spec.ts test/integration/requests/step-reassignment.integration-spec.ts test/integration/requests/step-reassignment-constraints.integration-spec.ts test/integration/requests/step-reassignment-paid.integration-spec.ts test/integration/requests/spend-need-decision.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/need-decision-queue-handover.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts`;
tự review: không còn `FALLBACK_APPROVER` trong `routing.policy.ts`, `group-need-routing.policy.ts`; không chỗ nào tính `legacy`
của bước chi bằng người giữ grant hiện tại.

### Phase A2 — Hợp đồng chung `D-S21`: Người duyệt chi không là bên của Request

### Task 4: policy chung ở `identity-access` + đường tạo Request đơn, đề xuất, tài khoản dịch vụ, gia hạn, nháp (test trước)

- Files: mới `src/modules/identity-access/public/{request-party.types.ts,request-party.errors.ts,request-party-eligibility.api.ts}`,
  capability mới `src/modules/identity-access/request-party/{request-party-eligibility.service.ts,request-party.policy.ts,request-party.policy.spec.ts}`
  (policy thuần nội bộ, một người dùng — không ở `public/`, không vào `PUBLIC_ROOT_POLICY_FILES` của
  `test/gates/policy-ownership.gate-spec.ts`; service tiêm service `accounts/` đứng sau `lockSpendingApproverAmong`/
  `getSpendingApproverEmployeeId`, **không** `IdentityAccessApi`), đăng ký ở `identity-access.module.ts` và
  `identity-access-facade.module.ts`; gọi `assertEligible` ở `src/modules/requests/request-intake/access-request.service.ts`,
  `assessment/proposal.service.ts`, `service-account-request/service-account-request.service.ts`,
  `renewal-request/renewal-request.service.ts`, `draft/{request-draft.service.ts,request-draft-submit.service.ts}` — mỗi chỗ ngay
  sau khóa nhân viên hiện có, trước mọi đọc phòng/Cost Center (spec › _Vị trí trong mỗi route_); map lỗi ở
  `access-request/access-request.http-errors.ts` (và `*_ERROR_EXAMPLES`), controller của các route đó (`ApiErrorResponses` 422);
  `test/support/openapi-example-route-codes-requests.ts`; test mới `test/integration/requests/spending-approver-party.integration-spec.ts`.
- Depends on: Checkpoint A1.
- Acceptance: hợp đồng ở spec › _Hợp đồng từ chối bên của Request_ — mã, `message`, `details`, thứ tự phán định (bên rồi lý do),
  trình tự khóa tài khoản `FOR SHARE` rồi đọc, không khóa nhân viên, `unplacedEmployeeIds` rỗng tới hạng mục unplaced; `US-05-02`
  AC-13 (vế tự gửi), `US-05-20` AC-12, `US-05-21` AC-8 (vế tạo), `US-05-14` AC-6, `US-05-03` AC-15 (vế Người duyệt chi); nháp đơn và
  nháp nhóm (người gửi + mọi dòng) bị chặn khi lưu (OD-3); không bản ghi nào được tạo khi từ chối. Nhiều file vì một lời gọi ở mỗi
  đường tạo — cơ học.
- Verify: unit viết trước `it.each([['REQUESTER'], ['BENEFICIARY']])('blocks the spending approver as %s')`,
  `it('reports SPENDING_APPROVER for a person who is both kinds')`, `it('lists every person of the first party and reason, sorted')`,
  `it('names the reason of each ineligible person')` đỏ rồi xanh:
  `pnpm test -- src/modules/identity-access/request-party/request-party.policy.spec.ts`; integration viết trước
  `it('refuses every request type sent by the spending approver with REQUEST_PARTY.INELIGIBLE')`:
  `pnpm test:integration -- test/integration/requests/spending-approver-party.integration-spec.ts test/integration/requests/access-request-internal-path.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts`;
  `pnpm arch:check` (cạnh `licensing`/`requests` → `identity-access` hợp lệ); `pnpm arch:capabilities --module identity-access`
  (cạnh `request-party → accounts`, không vòng); `pnpm test:gates -- test/gates/module-layout.gate-spec.ts test/gates/capability-graph.gate-spec.ts test/gates/policy-ownership.gate-spec.ts`.

### Task 5: tạo thay, nhóm, hoàn trả, người chịu trách nhiệm, danh sách chọn, preview (test trước)

- Files: `src/modules/requests/delegated-request/delegated-request.service.ts` (khóa mọi người thụ hưởng trước `assertEligible`,
  rồi `headedDepartment`/kiểm từng người),
  `src/modules/requests/group-request/{group-request.policy.ts,group-request.policy.spec.ts,group-request.http-errors.ts}`,
  `src/modules/requests/group-request-submission/{group-request.service.ts,group-candidate.service.ts,group-submission-facts.service.ts,group-requests.controller.ts}`
  (`groupRequestCandidateList`: người gọi không hợp lệ ⟹ 422 chung `REQUESTER`, `ApiErrorResponses` 422),
  `src/modules/requests/return-request/{return-request.service.ts,return-request.http-errors.ts}`,
  `src/modules/licensing/provisioning/tasks/provisioning-holder.service.ts`, `src/modules/licensing/provisioning/provisioning.http-errors.ts`,
  `src/modules/requests/request-submission/{request-preview.service.ts,request-preview.dto.ts}`;
  `test/support/openapi-example-route-codes-{requests,requests-spend,licensing}.ts`; test `spend-delegated-requests`,
  `group-request-submit`, `group-request-edge`, `return-request`, `return-renewal-constraints`, `access-request-preview`,
  `service-account-request`, `spend-supplements` integration spec.
- Depends on: Task 4.
- Acceptance: `US-03-02` AC-15 (tất cả hoặc không, `D-S22`), `US-05-17` AC-18 (lý do dòng `SPENDING_APPROVER`, `/check` 200),
  `US-05-13` AC-11, `US-05-01` AC-16 (`blockedBy`, `blockOf` trước `assess`), `US-05-21` AC-8 (vế IT Admin chỉ định qua
  `POST /provisioning-tasks` — kiểm trong `problemWith` sau khóa nhân viên, trước `OUTSIDE_DEPARTMENT`), `US-05-02` AC-13 (danh
  sách chọn, paging đúng; `C1` gọi danh sách ⟹ 422 `{ SPENDING_APPROVER, REQUESTER, [C1] }`), `US-06-14` AC-16 viết lại (`D-S23`: chỉ hồi quy không có đường thêm — thân có khóa
  thêm người ⟹ 422 `VALIDATION_ERROR`) — vế Người duyệt chi. Không có service _thêm người_ nào được viết. Nếu diff lớn, tách 5a
  (tạo thay + nhóm + danh sách chọn) và 5b (hoàn trả + người chịu trách nhiệm + preview).
- Verify: ca viết trước theo từng file test (tên `it('…spending approver…')`, gồm
  `it('refuses the candidate list to the spending approver with REQUEST_PARTY.INELIGIBLE')` ở `group-request-submit`,
  `it('refuses a delegated request naming the spending approver before any department check')` ở `spend-delegated-requests`) đỏ
  rồi xanh:
  `pnpm test -- src/modules/requests/group-request/group-request.policy.spec.ts`;
  `pnpm test:integration -- test/integration/requests/spend-delegated-requests.integration-spec.ts test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/group-request-edge.integration-spec.ts test/integration/requests/return-request.integration-spec.ts test/integration/requests/return-renewal-constraints.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts test/integration/requests/spend-supplements.integration-spec.ts`.

### Task 6: ca đồng thời gán vai ↔ tạo Request

- Files: `test/integration/requests/spending-approver-party-concurrency.integration-spec.ts` (mới).
- Depends on: Task 4, Task 5.
- Acceptance: cả hai thứ tự commit ⟹ không tồn tại Request mở có người giữ vai là bên.
- Verify: `pnpm test:integration -- test/integration/requests/spending-approver-party-concurrency.integration-spec.ts` xanh 3 lần
  liền.

### Checkpoint A2

`pnpm typecheck`; `pnpm lint`; `pnpm arch:check`; `pnpm test -- src/modules/requests src/modules/identity-access`;
`pnpm test:http -- test/http/platform/api-inventory.http-spec.ts`;
`pnpm test:integration -- test/integration/requests/spending-approver-party.integration-spec.ts test/integration/requests/spending-approver-party-concurrency.integration-spec.ts test/integration/requests/spend-delegated-requests.integration-spec.ts test/integration/requests/group-request-submit.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/requests/service-account-request.integration-spec.ts`.

### Phase A3 — Chi, phiên bản, gia hạn, role-duties, gỡ cấu hình

### Task 7: bước chi không còn người thay thế; bỏ đi thẳng cho phòng thiếu trưởng phòng; khóa grant (test trước)

- Files: `src/modules/requests/step-routing/spend-routing.policy.ts` (+ spec), `src/modules/requests/spend/{spend-submission.policy.ts,spend-entry.service.ts,spend-routing.service.ts,spend-decision.policy.ts,spend-decision.repo.ts}`,
  `src/modules/requests/spend-approval/spend-decision-recorder.service.ts`, `src/modules/requests/spend-approval-view/*`,
  `src/modules/requests/spend-submission/spend-batch.service.ts`, `src/modules/requests/group-request/{line-decision.repo.ts,group-request.dto.ts}`
  (`deciderRole`), `src/modules/requests/group-line-decisions/group-spend-record.service.ts`,
  `src/modules/identity-access/public/identity-access.api.ts` (`getSpendingApproverEmployeeId(tx, { forShare })`); test
  `spend-batches`, `step-reassignment-paid`, `spend-approval`, `spend-routing`, `spend-decision-constraints`, `mobile-spend-approval`
  integration; mới `test/integration/requests/spend-approver-revoke-race.integration-spec.ts`.
- Depends on: Checkpoint A2.
- Acceptance: `US-06-01` AC-22, `US-05-11` AC-10, `US-06-14` AC-8; `SPENDING_APPROVER_IS_PARTY` chỉ cho dữ liệu cũ; không ghi
  `CONFLICT_SUBSTITUTE`, `CONFLICT_OF_INTEREST`, `substituted` mới; mở bước chi khóa grant `FOR SHARE` trước Request (M6). Nhiều file
  vì một kiểu dữ liệu (`DeciderRole`) đổi ở mọi người tiêu dùng của bước chi — cơ học, chứng minh bằng typecheck + test giữ nguyên.
- Verify: unit `it('waits for the spending approver and never assigns a substitute')` đỏ rồi xanh;
  `pnpm test -- src/modules/requests/step-routing src/modules/requests/spend`; integration viết trước
  `it('never leaves a spend step with a revoked holder, either order')`:
  `pnpm test:integration -- test/integration/requests/spend-batches.integration-spec.ts test/integration/requests/step-reassignment-paid.integration-spec.ts test/integration/requests/spend-approval.integration-spec.ts test/integration/requests/spend-routing.integration-spec.ts test/integration/requests/spend-decision-constraints.integration-spec.ts test/integration/requests/mobile-spend-approval.integration-spec.ts test/integration/requests/spend-approver-revoke-race.integration-spec.ts`;
  chuyển ca còn ý nghĩa của `spend-substitute.integration-spec.ts` sang các file trên rồi xóa file đó.

### Task 8: quyết định phiên bản ngân sách và gia hạn chỉ của Người duyệt chi (test trước)

- Files: `src/modules/budgets/budget/{budget.policy.ts,budget-facts.service.ts,decision.repo.ts}`,
  `src/modules/budgets/version/{version-decision-judge.service.ts,version-decision-writer.service.ts,version-history-view.service.ts}` (+ DTO đọc `waitingReason`),
  `src/modules/licensing/subscription-renewal/{subscription-renewal.types.ts,subscription-renewal.repo.ts,subscription-renewal.mapper.ts,subscription-renewal.dto.ts,subscription-renewal-parties.service.ts}`,
  `src/modules/licensing/subscription-renewal/decision/{renewal-decision.policy.ts,renewal-decision.service.ts,renewal-decision-trail.service.ts}`;
  test `test/integration/budgets/budget-version-history.integration-spec.ts`,
  `test/integration/licensing/subscription-renewal-decision.integration-spec.ts`.
- Depends on: Checkpoint A2.
- Acceptance: `US-06-11` AC-12, `US-11-02` AC-23 (vế chỉ Người duyệt chi quyết, chờ, `waitingReason`; vế báo Super Admin ở
  Task 8b). Tách theo budgets/licensing nếu review cần — hai capability độc lập, cùng quy tắc.
- Verify: ca viết trước `it('a version waits for the spending approver and nobody else may decide')`,
  `it('a renewal waits for the spending approver and nobody else may decide')` đỏ rồi xanh:
  `pnpm test -- src/modules/budgets src/modules/licensing/subscription-renewal`;
  `pnpm test:integration -- test/integration/budgets/budget-version-history.integration-spec.ts test/integration/licensing/subscription-renewal-decision.integration-spec.ts`.

### Task 8b: báo Super Admin qua cảnh báo dòng 27 cho phiên bản và gia hạn chờ — ba nguồn (`D-S16`, M6, M7, test trước)

- Files: `src/modules/notifications/inbox/inbox.policy.ts` (+ `inbox.policy.spec.ts`: thêm khóa `versionId`, `costCenterId`,
  `year`, `renewalId`, `subscriptionId` cho `CONTROLLED_WAIT_ALERT`; `IN_APP_NOTIFICATION_CODES` không đổi),
  `src/modules/budgets/budget/budget-notifier.service.ts` (`versionSent` đọc grant `FOR SHARE` + phương thức báo chờ),
  `src/modules/licensing/subscription-renewal/subscription-renewal-notifier.service.ts` (`RenewalNotifier`), listener mới ở
  `budgets` và `licensing` cho `ApprovalRoleChangeListeners` (thu hồi người còn `ACTIVE`) và `OrganizationChangeListeners`
  (`EMPLOYEE_LEFT` của người giữ grant) — đăng ký như `requests/reassignment/approval-role.listener.ts`; test
  `test/integration/budgets/budget-version-history.integration-spec.ts`,
  `test/integration/licensing/subscription-renewal-decision.integration-spec.ts`,
  `test/integration/requests/request-status-notifications.integration-spec.ts` (hồi quy dòng 27 của bước chi và `NO_DEPARTMENT_HEAD`),
  `test/integration/organization/budget-notices.integration-spec.ts`.
- Depends on: Task 8.
- Acceptance: spec › _Quyết định phiên bản ngân sách và gia hạn_: Super Admin nhận `CONTROLLED_WAIT_ALERT` với `subject`
  `BUDGET_VERSION` / `SUBSCRIPTION_RENEWAL`, `waitingReason = NO_SPENDING_APPROVER`, một notice mỗi nguồn (`eventKey` =
  `…:<sent|role|left>:<id>`); không mã thông báo hay bảng mới; không ai khác nhận. Nhiều file vì một cảnh báo được phát từ hai
  capability độc lập và một bảng tham số chung.
- Verify: unit viết trước `it('lets CONTROLLED_WAIT_ALERT name a budget version or a renewal, never an amount')` đỏ rồi xanh:
  `pnpm test -- src/modules/notifications/inbox`; integration viết trước
  `it('tells the Super Admin once when a sent version waits for a spending approver')`,
  `it('tells the Super Admin once when the spending approver leaves while a renewal waits')`,
  `it('writes one notice when the role change is heard twice')`,
  `it('tells again for a new stretch of waiting after the role was given and taken back')` đỏ rồi xanh:
  `pnpm test:integration -- test/integration/budgets/budget-version-history.integration-spec.ts test/integration/licensing/subscription-renewal-decision.integration-spec.ts test/integration/requests/request-status-notifications.integration-spec.ts test/integration/organization/budget-notices.integration-spec.ts`;
  `pnpm test:gates` (extension wiring của hai listener mới mỗi module).

### Task 9: gỡ cấu hình hai vai, facade mới, người tiêu dùng, gate, OpenAPI

- Files: `src/modules/identity-access/approval-roles/*` (gỡ controller/service/repo ghi/`approval-role-reader.repo.ts`/
  `approval-role-holders.service.ts`/DTO/lỗi), `approval-roles/approval-role-facts.service.ts` (chỉ grant),
  `accounts/{account.types.ts,successor-eligibility.service.ts}`, `access/jwt-access-token-verifier.service.ts` (+ spec),
  `identity-access{,-facade,-inspection-facade,-recovery-cli}.module.ts`,
  `public/{identity-access.api.ts,identity-access.types.ts,identity-access-inspection.api.ts,identity-access.extension-points.ts}`;
  người tiêu dùng ở spec › _Gỡ cấu hình hai vai và người tiêu dùng_ (`requests` × 10 tệp, `budgets/budget/budget-facts.service.ts`,
  `licensing/subscription-renewal/subscription-renewal-parties.service.ts`, `personnel/role-duties/*`, `personnel/public/personnel.types.ts`,
  `dashboards/super-admin/super-admin-dashboard.service.ts`, `installation/public/{inspection.types.ts,installation-inspection.api.ts}`,
  `src/cli/inspect/inspect-report.ts`, `src/cli/demo-dataset/{fixture/demo-fixture.types.ts,fixture/shared-demo-v1.ts,steps/organization.steps.ts,steps/finance.steps.ts,steps/request.steps.ts}`);
  gate `test/gates/architecture-boundaries.gate-spec.ts` (danh sách tệp được đọc `approval_role_holders`: chỉ
  `migration-preflight.repo.ts`); xóa `test/http/identity-access/approval-roles.http-spec.ts`,
  `test/integration/identity-access/approval-roles-http.integration-spec.ts`; `test/support/{api-coverage-manifest.ts,api-collection-registry.ts,api-collection-registry-exceptions.ts,api-collection-registry-nested.ts,openapi-example-manifest.ts,openapi-example-route-codes-identity-access.ts}`;
  test còn lại theo danh sách cuối spec › `## Test matrix`.
- Depends on: Task 7, Task 8, Task 8b.
- Acceptance: `US-12-15` AC-25 (dòng 35); không còn `FALLBACK_APPROVER`/`CONFLICT_SUBSTITUTE`/`getApprovalRoleHolders` trong
  `src/` ngoài giá trị lịch sử; `GET/PUT /approval-roles` ⟹ 404; `ops:recover transfer-role` vẫn đúng với grant; gate đọc bảng xanh.
  Nhiều file vì gỡ một capability và đổi một facade — cơ học; chứng minh bằng typecheck, `arch:check` và test giữ nguyên.
- Verify: `pnpm typecheck`; `pnpm arch:check`; `pnpm test:gates`; `pnpm test -- src/modules/identity-access src/modules/personnel src/cli/inspect`;
  `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts test/http/platform/openapi-read-wording.http-spec.ts test/http/requests/need-decision-queue.http-spec.ts`;
  `pnpm test:integration -- test/integration/personnel/role-duties.integration-spec.ts test/integration/installation/inspect.integration-spec.ts test/integration/installation/installation-bootstrap-facts.integration-spec.ts test/integration/installation/installation.integration-spec.ts test/integration/installation/dev-seed.integration-spec.ts test/integration/identity-access/super-admin-transfer-http.integration-spec.ts test/integration/organization/organization-identity-read-contracts.integration-spec.ts test/integration/notifications/step-sla.integration-spec.ts test/integration/audit/access-request-http.integration-spec.ts test/integration/audit/access-request-need-decision.integration-spec.ts test/integration/requests/assessment-queue.integration-spec.ts test/integration/requests/access-request-new-software.integration-spec.ts test/integration/requests/spend-review-flows.integration-spec.ts`.

### Checkpoint A3

`pnpm check`; `pnpm test:http -- test/http/platform test/http/requests`; integration theo file của Task 7–9 (danh sách ở Verify);
`pnpm openapi:export` rồi review diff `openapi.json` theo bảng contract của spec (12 operation có 422 mới — gồm
`groupRequestCandidateList`, 4 có 409 chuyển tiếp, hai operation bị bỏ). Toàn bộ `pnpm test:integration` chỉ khi Owner cho (`D-S26`).

### Phase A4 — Lệnh chuyển đổi

### Task 10: `pnpm ops:approval-role-conversion` (test trước)

- Files: `src/cli/approval-role-conversion/{approval-role-conversion.command.ts,approval-role-conversion.arguments.ts,approval-role-conversion.arguments.spec.ts,approval-role-conversion-cli.module.ts}`,
  `src/cli/commands.ts` (dòng bảng, alias `approval-role-conversion-cli`), `package.json` (script `ops:approval-role-conversion`),
  capability mới `src/modules/requests/approval-role-conversion/{approval-role-conversion.service.ts,approval-role-conversion.repo.ts,approval-role-conversion-cli.module.ts}`
  cùng `src/modules/requests/public/approval-role-conversion.api.ts`; `requests/request-end/request-end.service.ts`,
  `requests/budget-information/budget-information.service.ts`, `requests/access-request/access-request-audit-event.mapper.ts`
  (`operator?`), `requests/group-request/group-resolution.policy.ts` (+ spec; `cancelledByEmployeeId: string | null`);
  `licensing/public/{licensing-open-grants.types.ts,licensing.api.ts}`,
  `licensing/provisioning/grant-cancellation/{grant-cancellation.policy.ts,grant-cancellation.policy.spec.ts,provisioning-cancellation.service.ts}`,
  `licensing/assignment/assignment.service.ts` (`operator?`); `docs/rules/operational-commands.md` (dòng bảng lệnh),
  `test/gates/{operational-commands,module-graph,extension-wiring}.gate-spec.ts`,
  `test/integration/requests/approval-role-conversion.integration-spec.ts` (mới).
- Depends on: Task 1, Checkpoint A3.
- Acceptance: spec › _Lệnh chuyển đổi_: hợp đồng lệnh ghi (tham số, đồ thị, runtime role, khóa phiên, mã thoát 0/2/4/3/1,
  `--dry-run` không ghi, idempotent, không mount ở `AppModule`/`WorkerModule`); mô hình người thực hiện `OPERATOR` + tài khoản
  đứng tên; cause `SPENDING_APPROVER_PARTY` ở `licensing`; task `IN_PROGRESS`/`COMPLETED` và Request hoàn trả chỉ liệt kê;
  `US-05-12` AC-10; `QĐ-93k`(1)–(4). Nhiều file vì một lệnh mới dùng lại khối của bốn capability (đóng, giải phóng, hủy task,
  xác định lại) và thêm `operator?` cho audit của chúng.
- Verify: ca viết trước `it('closes open requests of the spending approver and releases unspent commitments')`,
  `it('closes only the spending approver line of a group request')`, `it('lists requests whose grant is being worked or done')`,
  `it('re-routes and rewaits legacy steps with QD93_CONVERSION as OPERATOR')`,
  `it('keeps direct spend steps created before the conversion')`, `it('stops with 4 and lists versions that waited for the substitute')`,
  `it('answers 2 on a second run')`, `it('refuses a second run while the first holds the lock')` đỏ rồi xanh:
  `pnpm test:integration -- test/integration/requests/approval-role-conversion.integration-spec.ts`;
  `pnpm test -- src/cli/approval-role-conversion src/modules/licensing/provisioning/grant-cancellation src/modules/requests/group-request/group-resolution.policy.spec.ts`;
  `pnpm test:gates`.

### Task 11: e2e hành trình, runbook và tài liệu

- Files: `test/e2e/paid-request-to-seat.e2e-spec.ts` (nhánh phòng thiếu trưởng phòng; bỏ phần người thay thế ở `withApprover`)
  hoặc file e2e mới, `test/e2e/mobile-approver-journey.e2e-spec.ts` (hồi quy `deciderRole`), `src/modules/requests/README.md`,
  `src/modules/identity-access/README.md`, `src/modules/budgets/README.md`, `src/modules/licensing/README.md`,
  `docs/guides/demo-dataset.md`, `docs/guides/containers.md` (runbook: sau khi bản Phase A lên ở mỗi môi trường, `docker compose -f
docker-compose.prod.yml run --rm --no-deps api node dist/approval-role-conversion-cli.js --dry-run …` rồi chạy thật; vì sao không
  chạy giữa migrate và khởi động), `docs/generated/routes.md` (`pnpm arch:routes`), ghi chú _superseded_ ở spec cũ liệt kê trong
  header spec.
- Depends on: Task 10.
- Acceptance: hành trình đi hết chuỗi không người thay thế; tài liệu không còn mô tả hai vai; runbook có thứ tự chạy lệnh.
- Verify: hỏi Owner rồi `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts test/e2e/mobile-approver-journey.e2e-spec.ts`
  (theo file); `pnpm arch:docs:check`; `pnpm rules:check`; `pnpm rules:format`.

### Checkpoint A (phát hành Phase A, cùng roles)

`pnpm check`; `pnpm test:http -- test/http/platform test/http/requests`; integration theo file của mọi task; `pnpm openapi:export`
không drift; toàn bộ `pnpm test:integration` và `pnpm test:e2e` sau khi Owner cho (`D-S26`). Owner review; sau khi bản lên ở mỗi
môi trường: `pnpm ops:approval-role-conversion --dry-run`, rồi chạy thật, xử lý danh sách việc tay, chạy lại tới khi exit 2; ghi
kết quả vào bảng verification. Phase B chỉ bắt đầu khi mọi môi trường đã chuyển đổi.

### Phase B — Gỡ bảng (lần triển khai riêng, W5)

### Task 12: dòng chặn preflight cho Phase B (test trước)

- Files: `src/modules/installation/migration-preflight/*` (ba câu `SELECT` (i)–(iii) của spec, cùng nghĩa với guard),
  `test/integration/identity-access/approval-role-holders-drop-preflight.integration-spec.ts` (mới), `docs/guides/containers.md`.
- Depends on: Checkpoint A.
- Acceptance: ba dòng chặn (i)–(iii) của spec; (iii) theo _Luật bước chi cũ_ (người giữ chưa từng có dòng grant
  `SPENDING_APPROVER`); bước chờ `NO_DEPARTMENT_HEAD` dòng 4, Request `DRAFT` và bước chi `PENDING` của người giữ grant đã thu
  hồi/đã nghỉ không chặn; exit 2 khi còn, 0 khi sạch hoặc migration đã áp.
- Verify: ca viết trước `it('blocks dropping approval_role_holders while a fallback-held step is open')`,
  `it('does not block on a step waiting for a department head on row 4')`,
  `it('does not block on a spend step of a former spending approver')` đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/approval-role-holders-drop-preflight.integration-spec.ts`.

### Task 13: migration gỡ `approval_role_holders`, `ApprovalRole`; bỏ giá trị chuyển tiếp và đóng băng

- Files: `prisma/migrations/<ts>_identity_drop_approval_role_holders/migration.sql` (guard; viết lại
  `role_grants_forbid_super_admin_for_heads_and_approvers()` từ định nghĩa hiện hành; `DROP TRIGGER approval_role_holders_distinct`;
  `DROP FUNCTION approval_role_holders_distinct_approver_and_substitute()`; `DROP TABLE`; `DROP TYPE`),
  `prisma/models/identity-access.prisma`, `prisma/models/organization.prisma` (`Employee.approvalRoles`),
  `src/modules/requests/step-routing/{reassignment.policy.ts,spend-routing.policy.ts}`, `src/modules/requests/reassignment/controlled-wait.dto.ts`,
  `src/modules/requests/access-request/need-decision.policy.ts`, `src/modules/requests/spend/spend-decision.policy.ts`,
  `src/modules/identity-access/public/identity-access.api.ts` + `accounts/role-grant.{service,repo}.ts` (gỡ
  `everHeldSpendingApproverAmong`), DTO đọc `waitingReason`, `test/support/openapi-example-route-codes-{requests,requests-spend}.ts` (bỏ `STEP_AWAITING_CONVERSION`),
  `test/gates/architecture-boundaries.gate-spec.ts`,
  `test/integration/identity-access/drop-approval-role-holders-migration.integration-spec.ts` (mới), harness test còn ghi bảng.
- Depends on: Task 12.
- Acceptance: guard dừng `P0001` khi còn dòng chặn; khi sạch: trigger/hàm/bảng/enum gỡ, trigger `role_grants_super_admin_exclusions`
  vẫn chặn Super Admin làm trưởng phòng; OpenAPI không còn giá trị chuyển tiếp; lệnh chuyển đổi giữ alias, trả 2.
- Verify: ca viết trước `it('refuses to drop while a step still waits with a legacy reason')`,
  `it('drops the table and keeps the super admin exclusion')` đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/drop-approval-role-holders-migration.integration-spec.ts test/integration/identity-access/role-grant-constraints.integration-spec.ts`;
  `pnpm prisma:validate`; `pnpm check`; `pnpm openapi:export`.

### Checkpoint B

`pnpm check`; `pnpm test:http -- test/http/platform`; integration theo file của Task 12–13; `pnpm openapi:export`; toàn bộ
`pnpm test:integration`/`pnpm test:e2e` sau khi Owner cho (`D-S26`); triển khai sau `pnpm ops:preflight` exit 0 ở mỗi môi trường.

## Verification and handoff

Chọn lệnh theo CONTRIBUTING.md, test/README.md và `D-S26`, chạy từ gốc BE: `pnpm check`, integration/http theo file đã sửa,
`pnpm openapi:export`; bộ dài (`pnpm test:integration`, `pnpm test:e2e`, `pnpm test:integration:timing`) chỉ sau khi Owner cho; chỉ
tài liệu dùng `pnpm rules:check` và `pnpm rules:format`.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | thiết kế, chưa implement |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Lệnh chuyển đổi đã chạy ở mọi môi trường (dry-run + thật + chạy lại exit 2), kết quả ghi bảng trên.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
