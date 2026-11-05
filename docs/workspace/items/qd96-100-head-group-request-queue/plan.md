# Plan: qd96-100-head-group-request-queue

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Vị trí trong hàng đợi merge toàn cục (C-REVIEW mục 3): **19** (sau #21, trước #17).
- Migration: **M19** `requests_step_state_queued_value` (chỉ `ADD VALUE`) → **M20** `requests_step_state_queued` (viết lại
  `holder_check`). Timestamp đặt **lúc merge** vào branch, lớn hơn migration cuối đã có (R-19).
- Thứ tự rebase file nóng (R-21): `requests/spend/spend-routing.service.ts` sau #5, #6, #11, #16;
  `group-request-submission/group-request.service.ts` sau #4, #5, #6, #15. Rebase trên bản đã merge, không sửa đè.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{database-business,module-structure}.md`, README `requests`, `organization`.
Kiểm trên branch: `#6` đã đổi nơi mở bước chi thế nào (điểm gắn Task 3); grep mọi truy vấn `access_request_steps.state`
(`'PENDING'`, `'WAITING'`, `IN (`) để liệt kê nơi cần loại `QUEUED`; trigger `access_request_steps_waiting_since`
(`20261024100000_requests_step_waiting_since`); `organization/department/department.repo.ts:placementsOn`. Không chạy full suite.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): Task 1–4 đều là **phần A**. Hàng đợi phần A đổi so với dòng _Vị trí_ ở trên: merge
sau `request-sender-rules`, `request-term-limit`, `budget-check-three-outcomes`, `reserve-confirmation` (phần A); `#5`, `#11` là
phần B nên rebase **ngược lại** (chúng rebase trên hạng mục này).

**Đợt (Owner 05/11/2026):** phần A thuộc **Đợt 3** (cần #6, #7 của Đợt 2) — **không có task Đợt 1**; không đổi hình dạng API.

### Task 1: test tái hiện L-210, L-211 (đỏ)

- Files: `test/integration/requests/head-group-request-queue.integration-spec.ts` (mới), harness hiện có (`test/support/spend-harness.ts`).
- Depends on: none.
- Acceptance: hai ca tái hiện đỏ trên code hiện tại; nếu một ca **không** đỏ ⟹ dừng, cập nhật spec (kết luận gốc chỉ từ đọc code).
- Verify: `pnpm jest test/integration/requests/head-group-request-queue.integration-spec.ts --config ./test/config/jest.integration.cjs`.

### Task 2: người mới xếp phòng tương lai (L-211)

- Files: `organization/department/department.repo.ts`, `organization/public/organization-read.api.ts` (+ spec),
  `requests/group-request-submission/{group-submission-facts.service.ts, group-candidate.service.ts}`, `group-request/beneficiary-eligibility.policy.ts`.
- Depends on: Task 1.
- Acceptance: test matrix dòng L-211; nơi đọc phòng khác không đổi.
- Verify: integration Task 1 (phần L-211) xanh; `pnpm arch:check`.

### Checkpoint A

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test:gates`.

### Task 3: migration M19/M20 và gửi vào hàng đợi ngay

- Files: `prisma/models/requests.prisma`, `prisma/migrations/<ts>_requests_step_state_queued_value/migration.sql` (M19),
  `prisma/migrations/<ts+1>_requests_step_state_queued/migration.sql` (M20, `DROP/ADD access_request_steps_holder_check`),
  `requests/access-request/access-request.types.ts`, `group-request-submission/{group-need-routing.policy.ts,
group-need-routing.policy.spec.ts, group-request.service.ts, group-request-writer.service.ts}`.
- Depends on: Task 1; `qd96-100-budget-check-three-outcomes` merged.
- Acceptance: test matrix dòng AC-6 (gửi), SLA, R-02 (DB), Hồi quy.
- Verify: unit `group-need-routing.policy.spec.ts`; integration Task 1.

### Task 4: mở bước dòng trưởng phòng lúc trình lô; rút/hủy

- Files: nơi mở bước chi sau `#6` (`requests/spend/spend-routing.service.ts` hoặc thay thế), `spend/spend-step.repo.ts`,
  `group-request/group-line-withdrawer.service.ts`, `withdraw/*`, `sla/*`, `sla/congestion.repo.ts`, `need-decision-queue/*` (loại `QUEUED` nếu cần).
- Depends on: Task 3.
- Acceptance: test matrix dòng AC-6 (trình, ba kết quả), `US-06-14` AC-5 (chỉ vế _vào hàng đợi ngay, trình được_; vế 422 lý do
  dòng kế hoạch và _gắn rồi trình_ **đã bỏ theo `QĐ-101n`**), `US-06-01` AC-7, các dòng Biên.
- Verify: integration Task 1 toàn bộ xanh; integration SLA theo file.

### Checkpoint B

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; ghi bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | —                       |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
