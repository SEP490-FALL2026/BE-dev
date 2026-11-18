# Plan: qd96-100-request-term-limit

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Thứ tự Track R: #4 → #5 → **#15** → #20 → #21 → #19. Migration: không có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/api-contract.md`, README `requests`, `catalog`. Grep lại
`termConfirmation|TERM_CONFIRMATION|LONG_TERM_MONTHS|TERM_MONTHS_MAX` (≈ 40 file ở BE `3e4553b9`, gồm `*.spec.ts` và
`test/`). Xác nhận `subscription-facts.service.ts` `priceOfPlan` chọn đúng thuê bao mà pricing dùng. Không chạy full suite.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1 (thêm `effectiveTermOf`, R-15), 2, 3, 5; **phần B** = Task 4
(báo giá nhánh c). Phần A đi **trước** `request-year-without-spend-date` và `approved-end-date` (hai hạng mục dùng `effectiveTermOf`).

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = toàn bộ phần A: Task 1, 2, 3, 5 (Task 4 = B).

| Task | Operation                                                                                                                            | Request sau                                                                                                                  | Response sau                                                                                                                                                                              | Test 422 field bỏ                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1, 2 | (nội bộ) `termLimitOf`, `effectiveTermOf`, cờ linh hoạt                                                                              | —                                                                                                                            | —                                                                                                                                                                                         | —                                                         |
| 3    | `accessRequestSubmit`, `accessRequestPreview`, `accessRequestServiceAccountSubmit`, `accessRequestPropose`, `accessRequestDraftSave` | `termMonths` int 1..12                                                                                                       | preview: `termLimit {maxMonths: 12, endsBy}`, `canSubmit=false` khi vượt, bỏ `requirements.termConfirmationByHead`; linh hoạt vượt năm tài chính ⟹ 422 `ACCESS_REQUEST.TERM_BEYOND_LIMIT` | `termMonths: 13` ⟹ 422 `VALIDATION_ERROR` (mỗi op 1 test) |
| 3    | `groupRequestSubmit`, `groupRequestCheck`                                                                                            | `termMonths` 1..12                                                                                                           | check: `termLimit`, `termBeyondLimit`; submit vượt ⟹ 422 `GROUP_REQUEST.TERM_BEYOND_LIMIT`                                                                                                | `termConfirmation` (2 test)                               |
| 3    | `accessRequestNeedDecide`, `accessRequestLineNeedDecide`                                                                             | `{decision, reason?}` / `{lines[]}` (`spend.planLine`/`offPlan` bỏ ở `qd96-100-plan-line-removal-and-bm10-lines`, `QĐ-101n`) | bỏ `termConfirmationReason`; `needDecisionList` bỏ `termConfirmationRequired`                                                                                                             | `termConfirmation` (2 test)                               |
| 5    | `accessRequestDraftSubmit` (bản nháp cũ)                                                                                             | —                                                                                                                            | nháp có `termConfirmation` đọc/gửi được (codec bỏ khóa)                                                                                                                                   | —                                                         |

### Task 1: policy thuần `term-limit.policy.ts`

- Files: `requests/access-request/term-limit.policy.ts`, `term-limit.policy.spec.ts`.
- Depends on: none.
- Acceptance: `termLimitOf`, `termEndOf`, `checkTerm`, `effectiveTermOf` đúng các ca biên của test matrix; `endsBy` = cuối năm tài chính
  (điều phối viên chốt 05/11), gồm ca năm tài chính bắt đầu tháng 4.
- Verify: `pnpm jest src/modules/requests/access-request/term-limit.policy.spec.ts`.

### Task 2: cờ linh hoạt từ catalog

- Files: `catalog/subscription/subscription-facts.service.ts`, `catalog/public/catalog.api.ts` (+ type), `requests/access-request/request-facts.service.ts`.
- Depends on: none.
- Acceptance: `getPlanPrice` trả `allowsMidTermReduction`; pricing không đổi số.
- Verify: unit/integration hiện có của `priceOfPlan` xanh; `pnpm arch:check`.

### Task 3: áp trần ở intake và preview; gỡ `termConfirmation`

- Files: `access-request/{access-request.dto.ts, need-decision.policy.ts, access-request.types.ts, access-request.repo.ts,
access-request-record.mapper.ts, access-request.errors.ts, access-request.http-errors.ts}`, `request-intake/access-request.service.ts`,
  `request-submission/{request-preview.dto.ts, request-preview.service.ts, request-preview.policy.ts}`, `need-decision/*`,
  `group-request/*`, `group-line-decisions/*`, `group-request-submission/*`, `need-decision-queue/*`,
  `service-account-request/*`, `spend/spend-decision.repo.ts`, các `*.spec.ts` liên quan.
- Depends on: Task 1, Task 2.
- Acceptance: test matrix dòng AC-4 (cá nhân, nhóm, tài khoản dịch vụ), `US-06-12` AC-18, L-219, L-204.
- Verify: unit `need-decision.policy.spec.ts`, `group-line-decision.policy.spec.ts`, `request-preview.policy.spec.ts`; HTTP
  `accessRequestSubmit`/`groupRequestSubmit` 18 tháng ⟹ 422.

### Checkpoint A

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test:gates`; tự review theo AC-4.

### Task 4: báo giá nhánh (c)

- Files: `assessment/{quote-pricing.policy.ts, quote-pricing.policy.spec.ts}` + service hoàn tất đánh giá, `assessment.dto.ts`, http-errors.
- Depends on: Task 1.
- Acceptance: `ASSESSMENT.TERM_BEYOND_LIMIT` khi linh hoạt vượt cuối năm; `UPFRONT_ONCE` và cam kết đủ dài hợp lệ.
- Verify: unit quote-pricing.

### Task 5: bản nháp cũ

- Files: `request-draft/request-draft-policy.json.ts`, `draft/{request-draft-content.mapper.ts, request-draft.service.spec.ts}`.
- Depends on: Task 3.
- Acceptance: bản nháp cũ đọc được; gửi > 12 tháng ⟹ 422.
- Verify: `request-draft.service.spec.ts`; `pnpm jest test/http/requests/request-drafts.http-spec.ts --config ./test/config/jest.http.cjs`.

### Checkpoint B

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; test theo
file; ghi bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                                      | Revision / môi trường                     | Kết quả thực chạy | Giới hạn / việc còn lại                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đợt 1 (06/11/2026, Sonnet): `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates` (còn 2 đỏ `SeedCliModule` có từ trước), `pnpm rules:check`, `pnpm openapi:export`; unit `src/core/term-limit.spec.ts` 5/5, `src/modules/requests` + `catalog`; HTTP `dot-1-removed-fields.http-spec.ts` (`termMonths: 13` ×4 op, `termConfirmation` ×3) | BE `feat/qd96-100-alignment`, chưa commit | xanh              | `verified-local` cho Task 1, 2, 3, 5 (chính sách thuần ở `src/core/term-limit.ts`, ghi vào allow-list R7 của gate vì `access-request` đã đủ 25 file và L0 không import capability). Task 4 (báo giá) = B, chưa làm. Chưa chạy integration: `access-request-preview` đã sửa nhưng chưa chạy; spec có `termConfirmation` ở `test/integration/{requests,licensing}` cần rà. |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối; báo FE (bỏ ô xác nhận, `termLimit`, mã lỗi).
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
