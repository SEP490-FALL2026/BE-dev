# Plan: qd96-100-reserve-confirmation

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + `qd96-100-budget-check-three-outcomes`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/database-business.md`, `docs/rules/api-contract.md`, README `requests`. Xác
nhận #6 đã có trên branch (policy nhận `reserveConfirmed`, `carryForwardTotal`). Test theo file, không full suite.

## Tasks

FE-tonight: Task 1–5 là **phần A**, trừ hai việc của Task 5 thuộc **phần B** (làm cuối hoặc lượt sau): gỡ `possibleExtraSteps`
của preview và cờ `spendApprovalList.usesReserve`.

**Đợt (Owner 05/11/2026):** phần A thuộc **Đợt 2** cùng #6 — **không có task Đợt 1**. Cờ `usesReserve` không làm nữa
(`outcome` của #6 thay — D2). Hồ sơ bổ sung chỉ trưởng phòng hiện hành (D3, guard hiện có).

### Task 1: migration bảng xác nhận, cột term/cam kết chuyển tiếp, viết lại `change_check` (R-10a)

- Files: `prisma/migrations/<ts>_requests_reserve_confirmations/migration.sql` (M04 toàn cục; timestamp đặt lúc merge, sau M03),
  `prisma/models/requests.prisma`.
- Depends on: `qd96-100-budget-check-three-outcomes` Task 1.
- Acceptance: bảng + trigger INV-05, CHECK lý do một dòng; cột `before/after_term_months`, `carry_forward_total_minor`.
- Verify: `pnpm prisma validate`; `pnpm test:gates -- migration-order`; integration INV-05 (Task 2).

### Task 2: xác nhận trong lần trình lô

- Files: `requests/spend/spend-submission.dto.ts`, `requests/spend-submission/spend-batch.service.ts`,
  mới `requests/spend-submission/reserve-confirmation.repo.ts`, `requests/spend/spend-batch.repo.ts` (`reserveConfirmed`),
  `requests/spend/budget-check.repo.ts` (ghi `carry_forward_total_minor`).
- Depends on: Task 1.
- Acceptance: `US-06-16` AC-1, AC-2, AC-5, AC-8; `US-06-14` AC-12.
- Verify: `pnpm test:integration -- spend-batches spend-batch-constraints` + file mới `spend-reserve-confirmation.integration-spec.ts`.

### Task 3: hiệu lực xác nhận lúc duyệt

- Files: `requests/spend-approval/spend-decision.service.ts`, `spend-batch-decision.service.ts`,
  `requests/group-line-decisions/group-spend-decision.service.ts`.
- Depends on: Task 2.
- Acceptance: `US-06-01` AC-24; `US-06-16` AC-3, AC-6.
- Verify: `pnpm test:integration -- spend-approval spend-approval-batch group-request-spend`.

### Checkpoint

Quick gates (`typecheck`, `lint`, `arch:check`); integration Task 2–3 xanh.

### Task 4: hồ sơ bổ sung giảm thời hạn

- Files: `spend/spend-submission.dto.ts`, `spend/spend-submission.policy.ts`, `spend-submission/supplement.service.ts`,
  `supplement-pricing.service.ts`, `supplement.repo.ts`, `supplement-recorder.service.ts`.
- Depends on: Task 1.
- Acceptance: `US-06-14` AC-13 (vế giảm thời hạn); từ chối khi không ngắn hơn.
- Verify: `pnpm test -- spend-submission.policy`; `pnpm test:integration -- spend-supplements`.

### Task 5: đọc của Người duyệt chi, hàng đợi, rút, preview

- Files: `spend-approval-view/spend-approval.dto.ts`, `spend-approval.mapper.ts`, `spend-approval-sources.service.ts`,
  `finance-review/spend-years-view.service.ts` (đọc năm, tới khi #8 dời), `spend-submission/spend-queue.service.ts`,
  `access-request/withdrawal.policy.ts`, `group-request/group-withdrawal.policy.ts`, `request-submission/request-preview.dto.ts`
  và service preview.
- Depends on: Task 3.
- Acceptance: `US-06-01` AC-1; `US-06-16` AC-4, AC-7.
- Verify: `pnpm test -- withdrawal.policy spend-approval.mapper`; `pnpm test:http` file spend/withdrawal liên quan;
  `pnpm openapi:export`.

### Checkpoint

Quick gates đủ bộ (`typecheck`, `lint`, `arch:check`, `rules:check`, `test:gates`, `openapi:export`). **CP-1** cùng #6.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại     |
| ------------------ | --------------------- | ----------------- | --------------------------- |
| planned            | —                     | —                 | full suite do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo hợp đồng mới.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.
