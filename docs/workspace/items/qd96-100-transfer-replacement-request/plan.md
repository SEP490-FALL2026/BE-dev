# Plan: Request cấp thay thế khi điều chuyển do hệ thống tự tạo

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-TL).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Cỡ ước lại: L ≈ 12h. Phần B bắt đầu sau #4, #6, #16, #18.
- **Mức FE-tonight:** Task 0 (Phần A) = **A ≈ 1,5h**; Task 1–4 (Phần B) = **B**.

## Before coding

Đọc `requests/README.md`, `requests/delegated-request/delegated-request.service.ts` (mẫu tạo + ghi nhu cầu đã duyệt — #4 có thể
đã xóa route nhưng logic cần tái dùng nằm ở `RequestFactsService`/`AccessRequestRepo`), `access-request/request-facts.service.ts`
(`heldAccess`), `personnel/transfer-review/**`. Kiểm #4 đã đặt luật người gửi ở đâu để thêm miễn trừ đúng chỗ; kiểm #16 đã bỏ
`expectedSpendOn` khỏi `assess`. Migration đặt timestamp lúc implement, sau migration của #18.

## Tasks

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 0 (một thay đổi với #18 Task 2; migration M21a). Task 1–4 = B.

| Task | Operation              | Request sau                                                                                                                      | Response sau                       | Test 422                                                                                   |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| 0    | `transferReviewDecide` | `{assignmentId, decision: 'STILL_NEEDED' \| 'NOT_NEEDED', reason: trim 1..500}` — `reason` bắt buộc cả hai lựa chọn và lần đổi ý | item thêm `reason: string \| null` | thiếu `reason`, `reason` chỉ khoảng trắng (2 test); `termMonths` ⟹ 422 tới Phần B (1 test) |

### Task 0 (Phần A — tối nay): `reason` bắt buộc của quyết định rà soát

- Files: `prisma/migrations/<ts>_transfer_review_item_reason/migration.sql` (**M21a**, timestamp lúc merge), `prisma/models/personnel.prisma`,
  `personnel/transfer-review/transfer-review.{dto,types,repo,mapper}.ts`, `transfer-review-decision.service.ts` (ghi `reason`, Audit),
  `test/http/personnel/transfer-reviews.http-spec.ts`.
- Depends on: #18 Task 2 (cùng DTO; làm chung một thay đổi).
- Acceptance: dòng `reason` (A) của test matrix; body strict như spec Ownership Phần A.
- Verify: `pnpm test:http -- test/http/personnel/transfer-reviews.http-spec.ts`; integration decide; `pnpm openapi:export`.

### Task 1 (Phần B): migration liên kết

- Files: `prisma/migrations/<ts>_transfer_replacement_request_link/migration.sql`, `prisma/models/{requests,personnel}.prisma`,
  `test/integration/personnel/transfer-review-constraints.integration-spec.ts`.
- Depends on: #18 Task 1.
- Acceptance: hai cột liên kết, check và trigger như spec mục 9 (**M21b**); không drift.
- Verify: `pnpm test:integration -- test/integration/personnel/transfer-review-constraints.integration-spec.ts`.

### Task 2: capability `requests/transfer-replacement` + facade

- Files: `requests/transfer-replacement/transfer-replacement.{service,policy,types}.ts` (+ `.spec.ts`),
  `requests/public/transfer-replacement.api.ts`, `requests/requests.module.ts`, `access-request/request-facts.service.ts`
  (tham số `replacesAssignmentId` cho miễn trừ `heldAccess`), `access-request/access-request.repo.ts` (ghi cột liên kết).
- Depends on: Task 1, #4, #16.
- Acceptance: tạo Request GRANT nhu cầu đã duyệt ở `AWAITING_SPEND_SUBMISSION`, miễn `heldAccess` đúng Assignment cũ; trả
  `{requestId}` hoặc ném lỗi có mã; `FinanceSetupIncompleteError` để nơi gọi quyết.
- Verify: `pnpm test -- src/modules/requests/transfer-replacement`; `pnpm arch:check` (facade, không vòng phụ thuộc).

### Task 3: nối vào quyết định rà soát + `reason`, `termMonths` + từ chối đổi ý

- Files: `personnel/transfer-review/transfer-review-decision.service.ts`, `transfer-review.{dto,types,repo,mapper,errors,http-errors}.ts`,
  `test/integration/personnel/transfer-review-replacement-request.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: dòng test matrix _còn cần_ K2/K5, `termMonths` (bỏ trống = 12), nguyên tử, thiếu CC, từ chối, đổi ý, đồng thời xanh.
- Verify: `pnpm test:integration -- test/integration/personnel/transfer-review-replacement-request.integration-spec.ts`.

### Checkpoint A

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`; tự review diff theo AC-3.

### Task 4: kết cục theo liên kết + wire đọc

- Files: `transfer-review-replacement.service.ts`, `transfer-review.repo.ts` (`stillNeededFor` theo `replacement_request_id`),
  `requests/request-view/**` (thêm `transferReplacement`), `test/http/personnel/transfer-reviews.http-spec.ts`,
  `test/integration/personnel/transfer-review-change-of-mind.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: cấp/từ chối/rút Request liên kết ⟹ thu hồi seat cũ một lần; response có `reason`, `replacementRequest`.
- Verify: test integration + `pnpm test:http -- test/http/personnel/transfer-reviews.http-spec.ts`; `pnpm openapi:export`.

### Checkpoint B

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates`, `pnpm rules:check`, `pnpm openapi:export`;
test theo file. Sau #6: chạy thêm ca trình lô có Request thay thế (`test/integration/requests/spend-*`).

## Verification and handoff

| Lệnh / kiểm tra AC   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------- | --------------------- | ----------------- | ----------------------- |
| (điền khi implement) |                       |                   |                         |

- [ ] AC-3 vế claim có bằng chứng; `termMonths` theo Owner chốt 05/11/2026.
- [ ] README `requests` + `personnel` cập nhật; báo FE đổi contract.
- [ ] Giao Owner review trên revision cụ thể.
