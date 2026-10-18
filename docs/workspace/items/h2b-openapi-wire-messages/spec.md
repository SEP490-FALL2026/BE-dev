# Spec: H2b — message code cụ thể và response 422/429 còn thiếu

- Phụ trách: AI theo giao việc Owner (Prompt 05, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ lát H2 của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md), finding F-28, F-29 và
  quyết định Owner Q8 của [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — không Story nào được giao; không có quyết định `QĐ-*` mới), BE `bd05007`
  (`dev`) cộng H2a/04B chưa commit. Q8 là quyết định **kỹ thuật** của Owner, không phải `QĐ-*`.
- Nhóm roadmap: xuyên nhóm — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, client phân biệt được bốn response thành công theo `message` riêng, và OpenAPI khai đủ 422 của năm
operation có validation cùng 429 của rate limit toàn cục trên cả 60 operation — contract khớp với runtime. Kiểm được bằng
test HTTP, `test/e2e/api-inventory.e2e-spec.ts` và diff `openapi.json`.

## Primary Story/AC

| Story | AC                                                                 | Coverage | Phần còn lại thuộc                                      |
| ----- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------- |
| —     | Finding F-29 (Q8: đổi `COMMON.SUCCESS`), F-28 (422/429 khai thiếu) | n/a      | Q8 vế thống nhất mã guard/503: hoãn tới khi phối hợp FE |

## Supporting references

- Audit 18/10/2026 mục 6, F-28, F-29, Q8 (giữ mã guard/503).
- [API contract](../../../rules/api-contract.md); lát [H2a](../h2a-openapi-presentation/spec.md) cùng chạm `openapi.json`.

## Explicit out of scope

- Đổi, thống nhất hay đổi tên `INVALID_ACCESS_TOKEN`, `AUTHENTICATION_REQUIRED`, `AUTHORIZATION.FORBIDDEN`,
  `TOKEN_VERIFICATION_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `AUTH.UNAVAILABLE`, `HTTP_TOO_MANY_REQUESTS`,
  `AUTH.LOGIN_TEMPORARILY_BLOCKED` hay bất kỳ mã/message nào ngoài bốn message dưới đây (Q8).
- Đổi limit, TTL, keying, thứ tự guard, `@Throttle`, pipe, Zod schema, status, `data`, error body.
- Đổi route, method, `operationId`, tag, security, summary, example của H2a.
- Regenerate client FE/Mobile trong repo BE; R-1/R-2/H3, refactor, ops/database, G3–G10; repo Docs.

## Dependencies and blockers

- H2a + 04B (chưa commit) là nền: H2b sinh lại `openapi.json` sau chúng.
- Sau khi merge: FE-web và Mobile regenerate client; mọi chỗ branch theo `message` của bốn operation phải đổi.

## Ownership: module, data, API

- `identity-access/accounts/app-users.controller.ts`, `infrastructure/health/health.controller.ts`: `message` cụ thể.
- `organization/cost-centers.controller.ts`, `data-import/employee-imports.controller.ts`: khai 422.
- `infrastructure/http/openapi-rate-limit.ts` (mới, thuần): thêm 429 toàn cục cho operation chưa tự khai; gọi trong
  `createOpenApiDocument`. `auth.controller.ts`, `me.controller.ts`: mô tả 429 riêng nêu cả hai nhánh.
- Dữ liệu: không. API: thay đổi wire là bốn `message` (bảng dưới); còn lại chỉ là khai báo OpenAPI.

## Behavior and design

**Bốn success message (thay đổi wire — consumer branch theo `message` phải sửa):**

| Operation            | Route                        | `message` trước  | `message` sau              |
| -------------------- | ---------------------------- | ---------------- | -------------------------- |
| `appUserList`        | `GET /api/v1/app-users`      | `COMMON.SUCCESS` | `APP_USER.LISTED`          |
| `appUserGet`         | `GET /api/v1/app-users/{id}` | `COMMON.SUCCESS` | `APP_USER.RETRIEVED`       |
| `healthGetLiveness`  | `GET /api/v1/health/live`    | `COMMON.SUCCESS` | `HEALTH.LIVENESS_CHECKED`  |
| `healthGetReadiness` | `GET /api/v1/health/ready`   | `COMMON.SUCCESS` | `HEALTH.READINESS_CHECKED` |

Status và `data` không đổi. `DEFAULT_SUCCESS_MESSAGE = COMMON.SUCCESS` giữ cho probe trong test; inventory test cấm
route mount nào rơi về nó.

**422 `VALIDATION_ERROR`** thêm đúng năm operation (runtime đã trả 422 — chứng minh bằng test trước khi khai):
`costCenterList` (query), `employeeImportGet`, `employeeImportPreviewRefresh`, `employeeImportCancel` (`id` không phải
UUID), `employeeImportRowList` (`id` hoặc query lọc/phân trang). Bảy operation không đọc input nào giữ nguyên không có 422.

**429:** `ThrottlerGuard` là `APP_GUARD` đầu tiên và không route nào `@SkipThrottle`, nên mọi operation có thể trả 429
`HTTP_TOO_MANY_REQUESTS`. `withGlobalRateLimitResponse` thêm 429 (mô tả chung, `ErrorEnvelopeDto`) cho mọi operation
**chưa** tự khai — không phụ thuộc thứ tự decorator. Bốn operation tự khai giữ mô tả riêng nêu đủ nhánh: `authLogin`,
`meChangePassword` — `AUTH.LOGIN_TEMPORARILY_BLOCKED` **và** `HTTP_TOO_MANY_REQUESTS`; `authRequestPasswordReset`,
`authResetPassword` — limit riêng 10 lần/phút (`@Throttle`), `HTTP_TOO_MANY_REQUESTS`.

**Không áp dụng:** migration, transaction, job, storage, quyền.

## Test matrix

| AC / rủi ro                 | Tình huống                                                                    | Cấp test          | Kết quả mong đợi                                                                                          | Bằng chứng sau implement |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| F-29 message                | `GET /health/live`                                                            | e2e               | `HEALTH.LIVENESS_CHECKED`, `data` cũ                                                                      | plan                     |
| F-29 message                | `GET /health/ready`, `GET /app-users`, `GET /app-users/{id}` với CSDL thật    | integration       | ba message mới, `data` cũ                                                                                 | plan                     |
| Không còn fallback          | Metadata mọi handler mount                                                    | e2e               | không handler nào `COMMON.SUCCESS`; bốn message đúng                                                      | plan                     |
| F-28 422 khai báo           | Document                                                                      | e2e               | đúng năm operation mới có 422 `ErrorEnvelopeDto` + `VALIDATION_ERROR`; bảy operation không input không có | plan                     |
| F-28 422 runtime            | Query/id sai cho năm operation                                                | integration       | 422 `VALIDATION_ERROR` (có từ trước, chứng minh trước khi khai)                                           | plan                     |
| F-28 429                    | 60 operation                                                                  | unit + e2e        | 429 `ErrorEnvelopeDto`, mô tả có `HTTP_TOO_MANY_REQUESTS`                                                 | plan                     |
| Bốn 429 riêng               | `authLogin`, `meChangePassword`, hai route đặt lại mật khẩu                   | e2e               | không mất nhánh domain hay global                                                                         | plan                     |
| Không route nào bỏ throttle | Metadata `THROTTLER:SKIP*` ở handler và class                                 | e2e               | không có                                                                                                  | plan                     |
| Q8 mã giữ nguyên            | Mô tả 503 guard; runtime 429 global/lockout                                   | e2e + integration | mã cũ                                                                                                     | plan                     |
| H2a không đổi               | security, summary, example, `const`, pattern; parity sau khi bỏ 429 + năm 422 | e2e + script      | giống hệt                                                                                                 | plan                     |

## Definition of Done

- [x] Test mới đỏ trên H2a/04B vì finding thật, xanh sau implementation; bằng chứng ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; `openapi.json` sinh lại, diff chỉ gồm 429/422.
- [x] Rule API contract ghi quy ước message/422/429; roadmap và items index cập nhật.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Handoff consumer ghi rõ; phần chưa kiểm chứng ghi rõ (remote CI, Owner review, FE/Mobile regenerate).

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, chưa nghiệm thu.
