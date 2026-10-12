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
- Success `message` là key như `CATALOG.APPLICATION_CREATED`. FE không branch theo error message.
- Stream/file/redirect/204 dùng `@RawResponse()` có contract/test phù hợp; không dùng để né DTO.

## Errors

Lỗi: `{ success: false, error: { code, message, requestId, details? } }`.
`details` là object đã chọn trường an toàn. Filter giữ mã lỗi chủ đích;
`INTERNAL_SERVER_ERROR` là fallback cho server error không có mã riêng.
The guard returns 401 for missing credentials. Supplied tokens currently receive
503 `AUTHENTICATION_NOT_CONFIGURED`; account/password + JWT is not implemented.

## Handoff

- Operation ID ổn định, tag theo domain, mô tả đầy đủ success/error response.
- Cập nhật [API inventory](../../test/support/api-coverage-manifest.ts) khi thêm/bỏ operation.
- Chạy `pnpm test:e2e`, `pnpm openapi:export`; review diff `openapi.json`.
- Contract sinh từ controller/DTO. Không sửa JSON hoặc generated FE client bằng tay.
- Nếu thay contract có consumer FE, nêu operation/schema thay đổi và phối hợp regenerate client.

Ví dụ hiện có: [catalog controller](../../src/modules/catalog/catalog.controller.ts).
Cách thêm endpoint: [development guide](../guides/kien-truc-backend-va-cach-viet-code.md).
