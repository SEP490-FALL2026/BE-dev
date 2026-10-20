# API contract

## DTO và pipeline

- Base path mặc định `/api/v1`; resource plural kebab-case, JSON camelCase.
- Dùng Zod 4 DTO qua `nestjs-zod`; request object dùng `z.strictObject`.
- Khai schema cho body, query **và params**. Ví dụ `@Param() params: ApplicationIdParamDto`.
  Global pipe dùng strict schema declaration; param primitive không có schema có thể trả 500.
- Guards chạy trước pipe. Kiểm tra quyền theo input/resource đã validate ở use case.
- Response DTO mô tả wire data; map Date/Decimal/BigInt trước khi trả, không lộ Prisma record.
- `@ApiSuccessResponse` khai full envelope. Handler trả data; interceptor bọc
  `{ success: true, message, data }`, sau đó serializer validate.
- Success `message` là key như `AUDIT.EVENTS_LISTED`. FE không branch theo error message.
- Stream/file/redirect/204 dùng `@RawResponse()` có contract/test phù hợp; không dùng để né DTO.

## Errors

Lỗi: `{ success: false, error: { code, message, requestId, details? } }`.
`details` là object đã chọn trường an toàn. Filter giữ mã lỗi chủ đích;
`INTERNAL_SERVER_ERROR` là fallback cho server error không có mã riêng.
Every route declares exactly one of `@Public()`, `@AuthenticatedOnly()`, `@RequireRoles(...)`;
a route with none (or two kinds) answers 500 and is logged as a programming error. The guard returns
401 `AUTHENTICATION_REQUIRED` for a missing token and 401 `INVALID_ACCESS_TOKEN` for a token that is
bad or whose session/account is no longer usable; a wrong role is 403 `AUTHORIZATION.FORBIDDEN`;
an unreachable database is 503 (`TOKEN_VERIFICATION_UNAVAILABLE`, or `AUTH.UNAVAILABLE` on auth routes),
never 401; account administration routes use 503 `SERVICE_UNAVAILABLE` for a transient database failure.
Request-body validation errors are 422 `VALIDATION_ERROR`.

## Handoff

- Operation ID ổn định, tag theo domain, mô tả đầy đủ success/error response.
- `@ApiOperation` có `summary` ngắn (≤ 70 ký tự, khác nhau giữa các operation). OpenAPI `security` **không** khai tay:
  `@AuthenticatedOnly()`/`@RequireRoles(...)` đã gắn bearer, `@Public()` không. Route có guard dùng
  `UNAUTHENTICATED_RESPONSE` và `GUARDED_SERVICE_UNAVAILABLE_RESPONSE` cho 401/503. Mô tả public không chứa mã nội bộ
  (`US-*`, `AC-*`, `QĐ-*`); credential trong example là placeholder như `<refresh-token>`. `createOpenApiDocument`
  đổi `const` thành `enum` và bỏ `pattern` lặp format uuid/date-time; `test/e2e/api-inventory.e2e-spec.ts` kiểm các
  điều trên.
- Mọi `@ApiSuccessResponse` của route mount khai `message` riêng; không route sản phẩm nào rơi về `COMMON.SUCCESS`
  (chỉ probe trong test). Route có đầu vào (path, query, body) khai 422 `VALIDATION_ERROR`.
- 429 của `ThrottlerGuard` toàn cục (`HTTP_TOO_MANY_REQUESTS`) được `createOpenApiDocument` thêm cho mọi operation
  không tự khai 429. Route tự khai 429 (khóa đăng nhập, limit riêng) phải nêu cả `HTTP_TOO_MANY_REQUESTS` trong mô tả.
  Không dùng `@SkipThrottle` nếu chưa sửa cách tài liệu hóa 429. Inventory test kiểm các điều trên.
- Cập nhật [API inventory](../../test/support/api-coverage-manifest.ts) khi thêm/bỏ operation.
- Chạy `pnpm test:e2e`, `pnpm openapi:export`; review diff `openapi.json`.
- Contract sinh từ controller/DTO. Không sửa JSON hoặc generated FE client bằng tay.
- Nếu thay contract có consumer FE, nêu operation/schema thay đổi và phối hợp regenerate client.

Ví dụ hiện có, đã mount và khai báo quyền đúng: [audit controller](../../src/modules/audit/audit.controller.ts)
(`GET /api/v1/audit-events`, `@RequireRoles('SUPER_ADMIN')` ở class, `operationId`, success/error response) cùng test
[e2e](../../test/e2e/audit-events.e2e-spec.ts) và [integration](../../test/integration/audit-query-http.integration-spec.ts).
Cách thêm endpoint: [development guide](../guides/kien-truc-backend-va-cach-viet-code.md).
