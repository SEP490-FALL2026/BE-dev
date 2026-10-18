# Plan: H2a — trình bày Swagger/OpenAPI

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bd05007`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local 18/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `bd05007`). Revision:
  commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR); remote CI chưa có bằng chứng.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rule `api-contract`, `security-jobs`, `documentation`, mục 6 của
audit, phần H2 của handoff, item H1, `bootstrap.ts`, access/public decorator, guard, 15 controller mount, helper
`Api*Response`, `api-inventory.e2e-spec.ts`, manifest và lệnh export. Cây BE lúc bắt đầu: `dev` `bd05007`, sạch (Prompt
02B/02C/H1/H1B đã commit ở đó). Inventory máy đọc 60 operation (method, path, `operationId`, controller.handler, khai báo
quyền hiệu lực, summary, security) sinh bằng script tạm ngoài repo từ chính metadata guard đọc; số liệu ở bảng trước/sau
của spec.

## Tasks

### Task 1: test đỏ cho security, summary, schema, example và mô tả

- Files: `src/infrastructure/security/decorators/access.decorators.spec.ts` (mới),
  `src/infrastructure/http/openapi-presentation.spec.ts` (mới), `test/e2e/api-inventory.e2e-spec.ts`.
- Depends on: none.
- Acceptance: test đỏ trên `bd05007` vì finding thật (thiếu security, summary, example; còn `const`, pattern dư, mô tả
  lặp/mã nội bộ); test có sẵn vẫn xanh.
- Verify: `pnpm exec jest --runInBand <hai spec>`, `pnpm test:e2e -- test/e2e/api-inventory.e2e-spec.ts` → đỏ đúng lý do.

### Task 2: implementation tối thiểu

- Files: `access.decorators.ts`, `openapi-presentation.ts` (mới), `bootstrap.ts`, `api-error-responses.decorator.ts`,
  15 controller mount, `dto/auth.dto.ts`, `dto/account-management.dto.ts`.
- Depends on: Task 1.
- Acceptance: test Task 1 xanh; guard metadata, route, status, body không đổi.
- Verify: focused unit + e2e; `pnpm typecheck`, `pnpm lint`.

### Task 3: artifact, rule và tài liệu

- Files: `openapi.json` (generator), `docs/rules/api-contract.md`, roadmap, items index, spec/plan này.
- Depends on: Task 2.
- Acceptance: tập operation trước/sau bằng nhau; document chuẩn hóa (bỏ trường trình bày) giống hệt; rule ghi quy ước.
- Verify: `pnpm openapi:export`, script parity, `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 3: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` (DTO runtime nhận `.meta()` nên chạy lại), tự review
toàn bộ diff.

## Verification and handoff

Môi trường: Windows, cây làm việc chưa commit trên `bd05007`, 18/10/2026. Integration dùng PostgreSQL 17
(`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB`, cổng loopback riêng; container đã
xóa, không chạm database dùng chung.

| Lệnh / kiểm tra AC                                                | Revision / môi trường      | Kết quả thực chạy                                                                                                                                                                                  | Giới hạn / việc còn lại                                                                                      |
| ----------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Đỏ trước: `jest access.decorators.spec openapi-presentation.spec` | `bd05007`                  | 3 fail (không có bearer metadata), 1 pass (`@Public`); cleanup: `Cannot find module` (hàm chưa có)                                                                                                 | —                                                                                                            |
| Đỏ trước: `pnpm test:e2e -- api-inventory`                        | `bd05007`                  | 5 fail đúng finding (52 operation thiếu `security`, 60 thiếu summary, `const` + 130 pattern dư, 0 example, mô tả 401/503 hai cách viết + 32 mã nội bộ), 9 pass                                     | test "một bearer scheme" pass từ đầu (đặc tả)                                                                |
| `jest src/infrastructure`                                         | cây cuối                   | 201 test pass                                                                                                                                                                                      | —                                                                                                            |
| `pnpm test:e2e -- api-inventory`                                  | cây cuối                   | 14 test pass                                                                                                                                                                                       | —                                                                                                            |
| `pnpm openapi:export` + parity script                             | cây cuối                   | cùng tập 60 operation; document chuẩn hóa (bỏ summary/security/example/description, `const`→`enum`, pattern uuid/date-time) giống hệt; 52 security, 60 summary, 13 example; 160 237 → 135 352 byte | FE/Mobile regenerate client                                                                                  |
| `pnpm rules:check`, `pnpm rules:format`                           | cây cuối                   | 0 lỗi (599 link); format sạch                                                                                                                                                                      | —                                                                                                            |
| `pnpm check`                                                      | cây cuối                   | exit 0; unit 52 suite, 547 test                                                                                                                                                                    | —                                                                                                            |
| `pnpm test:e2e`                                                   | cây cuối                   | 14 suite, 267 test pass                                                                                                                                                                            | 1 test có sẵn (`app.e2e-spec.ts`) ghim `const: false`, sửa thành `enum: [false]` — thay đổi chủ đích của H2a |
| `pnpm test:integration`                                           | cây cuối, PostgreSQL riêng | 46 suite, 578 test pass; không còn database thừa                                                                                                                                                   | chạy vì DTO runtime nhận `.meta()`; remote CI chưa chạy                                                      |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; rule [API contract](../../../rules/api-contract.md) ghi quy ước; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: remote CI, Owner review, FE/Mobile regenerate client; H2b chưa bắt đầu.

_Đính chính 18/10/2026 (04B, chỉ helper/test/tài liệu):_ cleanup ban đầu bỏ **mọi** `pattern` cạnh `format` uuid/date-time.
Nay chỉ bỏ cặp `format` + `pattern` trùng đúng regex Zod sinh cho `z.uuid()`, `z.iso.datetime()` và
`z.iso.datetime({ offset: true })` (`isRedundantFormatPattern`); pattern tùy chỉnh được giữ. Test đỏ trước: 3/7 ca
`openapi-presentation.spec.ts` (custom uuid, custom date-time, regex uuid cạnh date-time bị xóa); xanh sau fix 7/7.
`openapi.json` sinh lại giống hệt từng byte bản H2a (sha256 `568a28f0…4340`); e2e chỉ cấm pattern sinh tự động đã biết.
Integration không chạy lại (không đổi runtime); bằng chứng gần nhất là 578 test của H2a.
