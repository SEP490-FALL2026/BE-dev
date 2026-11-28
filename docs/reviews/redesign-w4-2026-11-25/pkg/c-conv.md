# Gói C-CONV — One-step conversion ticket order (`W4-07, W4-14`)

- **Trạng thái:** `xong-unit` (unit + bộ kiểm nhanh xanh; `test/integration/requests/request-ticket-head-conversion.integration-spec.ts` **viết, chưa chạy** — chạy trên CI ở cổng C)
- **Nhánh:** `feat/redesign-w4-c-conv`
- **Sha nền:** `9a303d84`
- **Skill đã đọc:** `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `ponytail` (full), `.claude/skills/be-quick-check/SKILL.md`

## Kiểm giữ

- `StepReassignmentRepo.lockWithOpenSteps`: deduplicate & sort `requestIds`; early return `[]` nếu rỗng; `SELECT id FROM access_requests WHERE id = ANY(...) ORDER BY id FOR UPDATE` (khóa theo id tăng dần); `findMany` giữ điều kiện bước `OPEN` hoặc `AWAITING_SPEND_SUBMISSION` non-group non-one-step.
- `StepReassignmentRepo.oneStepPendingIds`: giữ filter `routingMode: 'ONE_STEP'`, `state in ['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION']`, `steps: { none: SPEND_APPROVAL OPEN }`.
- `StepReassignmentRepo.spendQueueRequestIds`: giữ filter `state: 'AWAITING_SPEND_SUBMISSION'`, `type: { not: 'GROUP_GRANT' }`, `routingMode: { not: 'ONE_STEP' }`.
- `StepReassignmentService.reconcileRequests`: giữ early return khi `requests.length === 0`, giữ `isQueuedSpendEligible` (chỉ `HEAD_CHANGED` / `EFFECTIVE_DATE_REACHED`, `AWAITING_SPEND_SUBMISSION`, non-group, non-one-step, không còn bước `OPEN`), giữ `endNeedStep` và `convertQueuedSpend` gọi `spending.finishConversionById`.
- `OneStepConversionService.finishPending`: giữ guard `!request || request.routing?.mode !== 'ONE_STEP' || !['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'].includes(request.state)` trả `false`.

## Kết quả bộ kiểm nhanh & Unit

- `pnpm prisma:generate` → exit 0
- `pnpm typecheck` → exit 0
- `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm exec eslint src/modules/requests/step-routing/step-reassignment.repo.ts src/modules/requests/reassignment/step-reassignment.service.ts src/modules/requests/reassignment/step-reassignment.service.spec.ts test/integration/requests/request-ticket-head-conversion.integration-spec.ts` → exit 0
- `pnpm exec prettier --check <same 4 files>` → exit 0
- `pnpm arch:check` → exit 0
- `pnpm arch:capabilities --module requests` → exit 0 (`48 capabilities, 146 capability edges, cycles: none`)
- `node --test scripts/verify/capability-graph.test.mjs` → exit 0
- `pnpm rules:check` → exit 0 (`BE: 565 files, 4243 links, 0 errors`)
- `pnpm test:gates` → exit 0 (`17 passed, 17 total`; `346 passed, 346 total`)
- `$env:CI='true'; pnpm test -- src/modules/requests/reassignment src/modules/requests/step-routing src/worker` → exit 0 (`16 passed, 16 total`; `139 passed, 139 total`; riêng `step-reassignment.service.spec.ts`: `11/11` pass sau khi thêm 5 ca, giữ nguyên 6 ca cũ)
- Integration (viết, chưa chạy): `test/integration/requests/request-ticket-head-conversion.integration-spec.ts`

## Đối chiếu tiêu chí

| Ca SPEC (§ / ca)                                                             | Test (file · tên)                                                                                                                                   | file:line code                                                                                           | Unit | CI              | Ghi chú                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- | --------------- | ----------------------------------------------------------------- |
| §7.7 `ReassignableRequest.ticket` đọc trong câu hiện có, khóa id giữ nguyên | `step-reassignment.service.spec.ts:12-27` (`queued` fixture) + `step-reassignment.repo.ts`                                                          | `step-reassignment.repo.ts:41-42,87-88,130-131,298-315`                                                  | PASS | —               | Khóa `ORDER BY id FOR UPDATE` giữ nguyên                          |
| §7.7 thứ tự `position` tăng dần cho mục cùng phiếu (`orderByTicketPosition`) | `step-reassignment.service.spec.ts:217-246` · `it.each` 3 ca (`[R3#3,X,R1#1]`, `[A#2,B#1,C#1]`, không phiếu)                                        | `step-reassignment.repo.ts:49-74,173,266`                                                                | PASS | —               | Giữ ô standalone; dùng chung cho `oneStepPendingIds` & `spendQueueRequestIds` |
| §7.7 / §7.14 chuyển một bước hàng đợi trình & `PENDING` theo `position`      | `step-reassignment.service.spec.ts:109-215` · `reconciles same-ticket queued spend...` & `checks budget in ascending ticket position... (RB-9)`      | `step-reassignment.service.ts:133-137`                                                                   | PASS | —               | Không thêm provider vào `requests-work-facade.module.ts`          |
| §7.7 / §7.14 ca RB-9 (`R12` #1 hàng đợi trình qua, `R11` #2 đứng chờ chặn)  | `test/integration/requests/request-ticket-head-conversion.integration-spec.ts:37-138` · `RB-9: when requester becomes department head...`            | `step-reassignment.repo.ts:41-74,130-131`, `step-reassignment.service.ts:133-137`                        | —    | viết, chưa chạy | Dựng phiếu qua `RequestTicketRepo.insert` + `AccessRequestRepo.insert` với `monthlyPriceMinor` |

## D-n & Bàn giao

- **D-n (kỹ thuật — tự chốt theo gate):**
  - `spend-submission` có `spend-submission.controller.ts` (L3), không nằm trong `REQUESTS_CONTROLLER_IMPORTED` (`test/gates/capability-graph.gate-spec.ts:29-39`, `scripts/verify/capability-graph.test.mjs:451-456`). Import `../spend-submission/spend-batch-order.policy` từ `reassignment` sẽ tạo cạnh L3 → L3 khiến `capability-graph.gate-spec.ts` và `capability-graph.test.mjs` đỏ, trong khi `C-BATCH` đang chạy song song nên không được dời `spend-batch-order.policy.ts`.
  - **Phương án chọn:** đặt hàm thuần `orderByTicketPosition` tại `src/modules/requests/step-routing/step-reassignment.repo.ts` (thuộc `step-routing` L1, đã được `reassignment` import sẵn và thuộc danh sách file gói `C-CONV`), dùng chung cho `StepReassignmentService.reconcileRequests`, `StepReassignmentRepo.oneStepPendingIds` (`OneStepConversionService.pendingIds`) và `StepReassignmentRepo.spendQueueRequestIds`. Không thêm cạnh capability mới (giữ nguyên `146` cạnh), không chạm `requests-work-facade.module.ts`, `test:gates` 17/17 và `worker.module.spec.ts` xanh.
- **Bàn giao (tùy chọn sau khi gộp Wave C):**
  - Nếu muốn bỏ trùng thuật toán slot-ordering giữa `spend-submission/spend-batch-order.policy.ts` và `step-routing/step-reassignment.repo.ts` sau khi `C-BATCH` và `C-CONV` đã gộp, có thể dời `spend-batch-order.policy.ts` xuống `L0 access-request` hoặc `L1 request-ticket` ở gói vá sau cổng C.
