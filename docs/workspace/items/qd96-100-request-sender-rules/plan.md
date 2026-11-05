# Plan: qd96-100-request-sender-rules

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Thứ tự Track R: **#4** → #5 → #15 → #20 → #21 → #19. Migration: không có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{module-structure,api-contract}.md`, `src/modules/requests/README.md`.
Đối chiếu lại `file:dòng` của spec với branch `feat/qd96-100-alignment`. Grep `delegated` trong `test/` (đã thấy:
`test/http/platform/openapi-request-rules`, `test/http/requests/request-drafts`, `request-project-label`,
`test/integration/requests/{self-service-every-role, super-admin-cannot-request}`, `test/support/{api-coverage-manifest,
openapi-example-manifest, openapi-example-route-codes-requests, spend-harness}`) và `fromRequestId`, `expectedEndDate` của grant.
Chỉ chạy quick check set + test theo file (memory Owner); không chạy full suite.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 1–4 và vế _grant_ của Task 5; **phần B** = vế _hoàn trả_
(`fromRequestId`) của Task 5. Phần A merge đầu tiên của toàn hàng đợi (không migration).

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = toàn bộ phần A: Task 1, 2, 3, 4 và vế _grant_ của Task 5. Prefix `/api/v1`.

| Task      | Operation                                 | Request sau                                                                                                  | Response sau                                                                                            | Test 422 field bỏ           |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1         | `grantQueueList` `GET /grant-queue`       | không đổi                                                                                                    | không đổi (chỉ dời capability)                                                                          | —                           |
| 2         | `delegatedRequestSend`                    | route gỡ                                                                                                     | 404                                                                                                     | — (op bỏ)                   |
| 2         | `accessRequestGet`, `grantQueueList`      | —                                                                                                            | bỏ `delegatedBatchId`                                                                                   | — (output)                  |
| 3         | `accessRequestRenewalSubmit`              | người gọi phải là người giữ quyền; body cuối do #21 Đợt 1: `{assignmentId, extensionMonths, businessReason}` | như nay; khác người giữ ⟹ 403 `RENEWAL_REQUEST.NOT_HOLDER`                                              | `termConfirmation` (1 test) |
| 4         | `groupRequestSubmit`, `groupRequestCheck` | `lines` ≥ 2 người khác nhau sau khử trùng (DTO giữ `min(1)`)                                                 | submit 1 người ⟹ 422 `GROUP_REQUEST.TOO_FEW_LINES {min: 2}`; check thêm `tooFewLines: {min: 2} \| null` | — (không bỏ field)          |
| 5 (grant) | `provisioningTaskGrant`                   | `{requestId, subscriptionId?, accountIdentifier?, responsibleEmployeeId?, beneficiaryEmployeeId?}`           | như nay                                                                                                 | `expectedEndDate` (1 test)  |

### Task 1: tách `grantQueueList` sang capability `requests/grant-queue/` (giữ hành vi)

- Files: `requests/delegated-request/{grant-queue.repo.ts, grant-queue.service.ts, delegated-requests.controller.ts}` →
  `requests/grant-queue/{grant-queue.repo.ts, grant-queue.service.ts, grant-queue.controller.ts, grant-queue.dto.ts}`; `requests.module.ts`.
- Depends on: none.
- Acceptance: cùng path, operationId, response (chưa bỏ trường); test hiện có của grant queue xanh không sửa assertion.
- Verify: `pnpm typecheck && pnpm arch:check && pnpm test:gates` → xanh; `pnpm openapi:export` không diff ngoài tag.

### Task 2: gỡ gửi thay và `delegatedBatchId`

- Files: xóa phần còn lại `requests/delegated-request/**`; `access-request/{access-request.errors.ts, access-request.http-errors.ts,
access-request.dto.ts}`; `request-view/access-request-query.service.ts`; `grant-queue/*`; `test/support/*manifest*`, test có gọi route.
- Depends on: Task 1.
- Acceptance: `POST /delegated-requests` 404; không còn `DELEGATED_REQUEST.*`; `grantQueueList`, `accessRequestGet` không còn `delegatedBatchId`.
- Verify: test HTTP mới cho 404 đỏ trước/xanh sau; `pnpm jest test/http/platform/openapi-request-rules.http-spec.ts --config ./test/config/jest.http.cjs`.

### Task 3: Request tiếp tục chỉ do người giữ quyền gửi

- Files: `renewal-request/{renewal-request.policy.ts, renewal-request.service.ts, renewal-request-writer.service.ts,
renewal-request-submission.mapper.ts, renewal-request.dto.ts, renewal-request.errors.ts, renewal-request.http-errors.ts, *.spec.ts}`.
- Depends on: none.
- Acceptance: `checkRenewalSender` chỉ trả `ok` cho người giữ; bỏ `byHead`, `confirmNeed`, tự áp dụng khi gửi, `termConfirmation`,
  `TERM_CONFIRMATION_REQUIRED`, `END_PASSED`, `OUTSIDE_DEPARTMENT`, `DELEGATED_ROW`.
- Verify: unit `renewal-request.policy.spec.ts` (đỏ trước với ca trưởng phòng), `test/integration/requests/return-renewal-constraints`.

### Checkpoint A

Quick check set xanh; tự review diff theo test matrix dòng 1–3.

### Task 4: Request nhóm tối thiểu 2 người

- Files: `group-request/{group-request.policy.ts, group-request.errors.ts, group-request.http-errors.ts, group-request.dto.ts
(check response), group-request.policy.spec.ts}`; `group-request-submission/group-request.service.ts`.
- Depends on: none.
- Acceptance: `TOO_FEW_LINES { min: 2 }` cho mọi người gửi, sau khử trùng; `groupRequestCheck` báo `tooFewLines`.
- Verify: unit policy + HTTP `groupRequestSubmit` (1 dòng → 422, 2 dòng → 201).

### Task 5: IT không nhập ngày kết thúc khi cấp; hoàn trả tự suy Request gốc

- Files: `licensing/provisioning/{provisioning.dto.ts, tasks/provisioning-grant-writer.service.ts, tasks/provisioning-tasks.controller.ts}`;
  `requests/return-request/{return-request.dto.ts, return-request.service.ts, return-requests.controller.ts, *.spec.ts}`.
- Depends on: none.
- Acceptance: grant có `expectedEndDate` → 422; Assignment lấy ngày của Request; `originRequestId` do server tính.
- Verify: `return-request.service.spec.ts`, `return-request.policy.spec.ts`; HTTP grant 422.

### Checkpoint B

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; test theo file
đã sửa; cập nhật README `requests`; ghi bằng chứng vào bảng dưới.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                                  | Revision / môi trường                                  | Kết quả thực chạy                                          | Giới hạn / việc còn lại                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đợt 1 (06/11/2026, Sonnet): `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm openapi:export`; unit `src/modules/requests`, `src/modules/licensing/provisioning`; HTTP `test/http/requests/dot-1-removed-fields.http-spec.ts` (404 `delegated-requests`, 422 `termConfirmation` ở renewal, 422 `expectedEndDate` ở grant) | BE `feat/qd96-100-alignment`, working tree chưa commit | xanh (HTTP 10/10; unit requests+catalog 1163/1163 sau sửa) | `verified-local` cho Task 1–5 vế grant. Chưa chạy integration: các spec dùng `sendDelegated` (`test/integration/{audit,requests}/*`) và `renewal-request.integration-spec.ts` còn kịch bản trưởng phòng gửi thay — cần viết lại; 2 gate `SeedCliModule` đỏ có từ trước (không do bước này). Hoàn trả `fromRequestId` vẫn B. |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối; báo FE (gỡ form gửi thay, ô ngày ở màn cấp, `fromRequestId`).
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
