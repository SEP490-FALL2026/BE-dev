# Spec: H2a — trình bày Swagger/OpenAPI

- Phụ trách: AI theo giao việc Owner (Prompt 04, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ lát H2 của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md) và mục 6 của
  [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — không Story nào được giao; không có quyết định `QĐ-*` mới), BE `bd05007`
  (`dev`). Q8 là quyết định **kỹ thuật** của Owner, không phải `QĐ-*`.
- Nhóm roadmap: xuyên nhóm — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, người đọc Swagger và công cụ sinh client (Orval) thấy đúng route nào cần bearer token, mỗi operation có
một summary ngắn, credential hiển thị bằng placeholder an toàn, và document là OpenAPI 3.0 sạch; runtime và wire contract
giữ nguyên. Kiểm được bằng `test/e2e/api-inventory.e2e-spec.ts` và diff `openapi.json`.

## Primary Story/AC

| Story | AC                                                                       | Coverage | Phần còn lại thuộc                                          |
| ----- | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------- |
| —     | Finding F-04, F-27 (phần trình bày); Q8 chỉ ở mức không đổi mã guard/503 | n/a      | H2b: F-28 (422/429 khai thiếu), F-29 (`COMMON.SUCCESS`, Q8) |

## Supporting references

- Audit 18/10/2026 mục 6 (bảng Swagger/OpenAPI, cách sửa nhỏ nhất 1–5), F-04, F-27, F-28, F-29, Q8.
- [API contract](../../../rules/api-contract.md), [security rule](../../../rules/security-jobs.md); lát
  [H1](../h1-auth-session-refresh-expiry/spec.md) cùng chạm `openapi.json` (H1 đã ở `bd05007`).

## Explicit out of scope

- H2b: đổi bốn `COMMON.SUCCESS`, khai 422 còn thiếu ở 5 operation, 429 toàn cục, đổi mã guard/503.
- Đổi guard, thứ tự guard/pipe/interceptor/filter, route, method, status, request/response/error body runtime,
  `operationId`, tag; đổi Zod validation runtime; đổi bất kỳ hành vi H1 nào.
- Example cho mọi field; example trong `ApiSuccessResponse`/`ApiErrorResponses` theo status (đề xuất 6 của audit) —
  chưa cần, có thể làm khi có nhu cầu FE.
- R-1/R-2/H3, refactor module/capability, ops/database, G3–G10; sửa repo Docs.

## Dependencies and blockers

- H1 đã ở HEAD `bd05007`: H2a sinh lại `openapi.json` sau H1, không chạy song song hai diff artifact.
- FE-web/Mobile regenerate client sau khi lát vào `dev` (thay đổi chỉ trình bày, client sinh ra thêm security/summary).

## Ownership: module, data, API

- `src/infrastructure/security/decorators/access.decorators.ts`: `@AuthenticatedOnly()` và `@RequireRoles(...)` ghép
  `ApiBearerAuth()` bằng `applyDecorators`, giữ nguyên metadata guard đọc. `@Public()` không đổi.
- `src/infrastructure/http/openapi-presentation.ts` (mới, thuần): `const` → `enum`, bỏ `pattern` **chỉ** khi cặp
  `format` + `pattern` đúng là regex Zod sinh cho `z.uuid()`/`z.iso.datetime()` (có/không offset); pattern khác, kể cả
  cạnh uuid/date-time, được giữ (đính chính 04B); gọi trong `createOpenApiDocument` sau `cleanupOpenApiDoc`.
- `src/infrastructure/http/decorators/api-error-responses.decorator.ts`: hai hằng `UNAUTHENTICATED_RESPONSE`,
  `GUARDED_SERVICE_UNAVAILABLE_RESPONSE`.
- 15 controller mount: thêm `summary`, dùng hai hằng trên, bỏ mã nội bộ khỏi mô tả. DTO auth/redeem: `.meta({ example })`.
- Dữ liệu: không. API: không thêm/bỏ operation; `openapi.json` sinh lại.

## Behavior and design

**Ma trận trước/sau** (60 operation, đo bằng inventory máy đọc ở plan):

| Hạng mục                                      | Trước (`bd05007`)              | Sau                                       |
| --------------------------------------------- | ------------------------------ | ----------------------------------------- |
| Operation (tập method + path + `operationId`) | 60                             | 60, cùng tập                              |
| Public / authenticated / roles                | 8 / 2 / 50                     | 8 / 2 / 50 (metadata guard không đổi)     |
| Operation có `security: [{ bearer: [] }]`     | 0                              | 52 = mọi operation không public; public 0 |
| Operation có `summary`                        | 0                              | 60, khác nhau, ≤ 70 ký tự                 |
| Nút `example`                                 | 0                              | 13 (token, mật khẩu, email giả, hạn ISO)  |
| `const`                                       | 1 (`ErrorEnvelopeDto.success`) | 0 (`enum: [false]`)                       |
| `pattern` cạnh `format` uuid/date-time        | 130                            | 0; 40 pattern nghiệp vụ giữ nguyên        |
| Mô tả 401 / 503 của route có guard            | 2 / 2 cách viết                | 1 / 1 (hằng dùng chung)                   |
| Mô tả có mã nội bộ hoặc `⟹`                   | 12 chuỗi, 32 lần               | 0                                         |

`security` suy ra từ access decorator: cùng một lời gọi đặt metadata guard và metadata Swagger, nên document không thể lệch
khỏi khai báo mà guard đọc. Swagger gộp `security` của class với method; không controller nào trộn khai báo class và
method (inventory), và e2e kiểm mỗi operation public không có `security`.

**Không áp dụng:** migration, transaction, job, storage, quyền mới.

## Test matrix

| AC / rủi ro                    | Tình huống                                                         | Cấp test                       | Kết quả mong đợi                                                | Bằng chứng sau implement |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------- | ------------------------ |
| Tập operation                  | Document ↔ manifest; `operationId` duy nhất                        | e2e                            | bằng nhau theo tập (test có sẵn)                                | plan                     |
| Một khai báo quyền mỗi handler | Mọi handler mount                                                  | e2e                            | đúng một (test có sẵn)                                          | plan                     |
| F-04 security                  | Mỗi operation, map qua `operationId` → handler → khai báo hiệu lực | e2e                            | public: không `security`; khác: đúng `[{ bearer: [] }]`         | plan                     |
| Decorator                      | `@AuthenticatedOnly`, `@RequireRoles` ở method và class; `@Public` | unit                           | metadata guard giữ nguyên; bearer chỉ khi không public          | plan                     |
| F-27 summary                   | Mọi operation                                                      | e2e                            | có, ≤ 70 ký tự, khác nhau, không bằng `operationId` tách chữ    | plan                     |
| F-27 `const`, `pattern` dư     | Duyệt đệ quy document; hàm cleanup                                 | unit + e2e                     | 0 `const`; 0 pattern cạnh uuid/date-time; pattern nghiệp vụ còn | plan                     |
| F-27 example an toàn           | Token, mật khẩu login/refresh/body; toàn document                  | e2e                            | placeholder ngắn; không chuỗi giống JWT/secret                  | plan                     |
| Mô tả lỗi                      | 401/503 route có guard; mã nội bộ                                  | e2e                            | một cách viết mỗi status; không mã nội bộ                       | plan                     |
| Runtime không đổi              | Toàn bộ suite                                                      | `pnpm check`, e2e, integration | xanh                                                            | plan                     |
| Contract không đổi             | So `openapi.json` trước/sau sau khi chuẩn hóa các trường trình bày | script parity                  | document chuẩn hóa giống hệt                                    | plan                     |

## Definition of Done

- [x] Test mới đỏ trên `bd05007` vì finding thật, xanh sau implementation; bằng chứng ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; `openapi.json` sinh lại, parity đã kiểm.
- [x] Rule API contract ghi quy ước summary/security/mô tả; roadmap và items index cập nhật.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Phần chưa kiểm chứng ghi rõ (remote CI, Owner review, FE/Mobile regenerate).

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, chưa nghiệm thu.
- 19/10/2026: implementation ở commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR).
  Remote CI chưa có bằng chứng, chưa Owner review, chưa nghiệm thu.
