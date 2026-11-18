# Plan: Rà soát sau điều chuyển — thu hồi mặc định, báo trước, tạm dừng khi thiếu trưởng phòng

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-TL).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Cỡ ước lại: L ≈ 16h. Track T, build trước #17.
- **Mức FE-tonight:** Task 2 (bản Phần A, không phụ thuộc Task 1) = **A ≈ 1,5h**, làm cùng #17 Phần A; Task 1, 3–6 = **B**.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{database-business,api-contract,module-structure}.md`, `personnel/README.md`, toàn
bộ `src/modules/personnel/transfer-review/**`, test `test/integration/personnel/transfer-review-*.integration-spec.ts`,
`test/http/personnel/transfer-reviews.http-spec.ts`. Đọc spec #1 để dùng đúng cơ chế actor `SYSTEM` (Owner chốt 05/11/2026).
Migration theo danh sách phẳng toàn cục (C-REVIEW mục 3): #18 là mục 8 của hàng đợi merge (sau #3), sở hữu **M10**, **M11**;
timestamp đặt lúc merge, lớn hơn migration cuối trên branch (R-19). Rebase trên #1, #5, #2, #3 ở `parameter-definitions.policy.ts`,
`notifications.types.ts`, `inbox.policy.ts`; chỉ thêm khối của mình (R-21).

## Tasks

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 2 (làm chung #17 Task 0). D6 (`timing.notBefore` cho `NOT_NEEDED`) = B, sau #1 Task 2.

| Task             | Operation                  | Request sau                                                        | Response sau                                                                                                                     | Test 422 field bỏ                                    |
| ---------------- | -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 2 (+ #17 Task 0) | `transferReviewDecide`     | `{assignmentId, decision: 'STILL_NEEDED' \| 'NOT_NEEDED', reason}` | item: `needsNewRequest = false` với K5; `decision` vẫn đọc được `NEEDS_NEW_TOOL` lịch sử; `NOT_NEEDED` mở thu hồi ngay (như nay) | `decision: 'NEEDS_NEW_TOOL'`, `newToolNote` (2 test) |
| 2                | `departmentTransferRecord` | không đổi (căn cứ theo #24)                                        | `warnings[].code` `BUSINESS_OWNER_KEEP_OR_CHANGE` thay `BUSINESS_OWNER_REPLACEMENT_NEEDED`                                       | —                                                    |

### Task 1: migration M10 + M11 và Prisma model

- Files: `prisma/migrations/<ts>_transfer_review_decision_default/migration.sql`, `prisma/migrations/<ts+1>_transfer_review_defaults/migration.sql`,
  `prisma/models/personnel.prisma`, `test/integration/personnel/transfer-review-constraints.integration-spec.ts`.
- Depends on: none.
- Acceptance: enum có `DEFAULT_REVOKED`; `due_on` nullable, chỉ đổi NULL → giá trị; ba cột mới; check mới cho `DEFAULT_REVOKED`;
  dòng `NEEDS_NEW_TOOL` của rà soát OPEN về `PENDING`; không drift.
- Verify: `pnpm test:integration -- test/integration/personnel/transfer-review-constraints.integration-spec.ts` (ca mới đỏ trước).

### Task 2 (Phần A — tối nay): bỏ `NEEDS_NEW_TOOL`, sửa `needsNewRequest` K5, mã cảnh báo Business Owner

- Files: `transfer-review.{dto,policy,types,mapper}.ts`, `transfer-review.policy.spec.ts`, `personnel/transfer/transfer.{dto,types,service}.ts`.
- Depends on: none (không cần migration; response vẫn đọc được `NEEDS_NEW_TOOL` cũ). Làm trước Task 1 trong lượt tối nay.
- Acceptance: body chỉ nhận `STILL_NEEDED | NOT_NEEDED`; `newToolNote` bị từ chối; K5 `needsNewRequest = false`; warning
  `BUSINESS_OWNER_KEEP_OR_CHANGE`.
- Verify: `pnpm test -- src/modules/personnel/transfer-review` và test HTTP `transfer-reviews.http-spec.ts`.

### Task 3: policy hạn — tạm dừng, báo trước, ngày áp, trần (thuần)

- Files: `transfer-review.policy.ts`, `transfer-review.policy.spec.ts`, `operating-parameters/parameter-definitions.policy.ts` (+ spec).
- Depends on: Task 2.
- Acceptance: hàm `noticeDueOn`, `defaultRevocationAfter`, `mayApplyDefault`, `noHeadAlertDue`, `capReached`; hai tham số mới.
- Verify: `pnpm test -- transfer-review.policy.spec.ts parameter-definitions.policy.spec.ts`.

### Task 4: mở rà soát với hạn tạm dừng + chụp n

- Files: `transfer-review.service.ts`, `post-setup-review.service.ts`, `transfer-review.repo.ts`, `transfer-review.service.spec.ts`.
- Depends on: Task 3.
- Acceptance: phòng không trưởng phòng ⟹ `dueOn = null`; `defaultNoticeWorkingDays` chụp từ tham số.
- Verify: unit + `pnpm test:integration -- test/integration/personnel/transfer-review-decide.integration-spec.ts`.

### Checkpoint A

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`; tự review diff theo AC-7.

### Task 5: job sweep (bắt đầu hạn, báo trước, áp mặc định, nhắc Super Admin, trần)

- Files: `transfer-review-overdue.service.ts` (đổi tên `transfer-review-deadline.service.ts`), `transfer-review.job.ts`,
  `transfer-review.repo.ts`, `event-notice/personnel-notifier.service.ts`, `notifications/public/notifications.types.ts`,
  `notifications/inbox/inbox.policy.ts`, `test/integration/personnel/transfer-review-defaults.integration-spec.ts` (mới).
- Depends on: Task 4; #1 `qd96-100-revocation-deadline-and-withdraw` (actor `SYSTEM`, hằng `DECIDED_ROLE_SYSTEM_*`).
- Acceptance: tác vụ thu hồi mặc định do actor `SYSTEM` mở, giao IT Admin phụ trách, `decidedRole` là hằng của #1, có
  `timing.dueOn = addWorkingDays(today, DEPARTURE_REVOCATION_WORKING_DAYS)`; các dòng test matrix AC-5, AC-6, AC-7, AC-11, rủi ro deploy, đồng thời, K3/K4, `POST_SETUP` xanh.
- Verify: `pnpm test:integration -- test/integration/personnel/transfer-review-defaults.integration-spec.ts`.

### Task 6: wire đọc — `dueOn` nullable, `defaultRevocationAfter`, lọc `defaultPending`

- Files: `transfer-review.dto.ts`, `transfer-review.mapper.ts`, `transfer-review-list.repo.ts`, `transfer-reviews.controller.ts`,
  `test/http/personnel/transfer-reviews.http-spec.ts`, `personnel/README.md`.
- Depends on: Task 5.
- Acceptance: AC-12; OpenAPI mô tả mới; README bỏ bất biến cũ.
- Verify: `pnpm test:http -- test/http/personnel/transfer-reviews.http-spec.ts`; `pnpm openapi:export` không lỗi.

### Checkpoint B

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates`, `pnpm rules:check`, `pnpm openapi:export`;
test theo file của Task 1–6. Không chạy full suite (Owner chạy ở audit).

## Verification and handoff

| Lệnh / kiểm tra AC   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------- | --------------------- | ----------------- | ----------------------- |
| (điền khi implement) |                       |                   |                         |

- [ ] AC trong scope có bằng chứng; G-2 ghi kết quả.
- [ ] Spec/plan khớp implementation; báo FE đổi `transferReviewDecide` và response.
- [ ] Diff tự review; giao Owner review trên revision cụ thể.
