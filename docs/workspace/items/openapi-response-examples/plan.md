# Plan: ví dụ response OpenAPI ngắn gọn và đúng sự thật (`OPENAPI-EXAMPLE.1`)

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `ea73c2f`.
- Phụ trách: AI theo giao việc (Prompt 26). Thiết kế ban đầu bởi: Owner (Prompt 26).
- Owner review: chưa review. Peer review: không có.
- Triển khai: `verified` (local, chưa commit). PR: chưa có.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, [API contract](../../../rules/api-contract.md), spec/plan H2a, H2b, Prompt 24 và
Prompt 29A/29B, decorator, `openapi-presentation.ts`, `bootstrap.ts`, `scripts/dev/export-openapi.ts`, mapper và controller,
`openapi.json`, `test/e2e/api-inventory.e2e-spec.ts`. Cây `ea73c2f` sạch, `dev = origin/dev`, ahead/behind `0/0`. Bản
export tươi trùng byte `openapi.json` (sha256 `a6c849cd…`): 146 operation, 162 schema, 1 179 response (1 033 lỗi JSON, 145
thành công JSON, 1 không body), 0 ví dụ media type.

Truy vết mã lỗi: 5 nhóm operation (A 23 · B 38 · C 27 · D 29 · E 29) đọc song song chỉ-đọc, mỗi operation từ handler qua
service/policy/repo tới mapper; kết quả gộp thành `ROUTE_ERROR_CODES` (114 operation, 446 mục) và [inventory](inventory.md).

## Tasks

### Task 1: test đỏ trước

- Files: `src/infrastructure/http/openapi-error-examples.spec.ts`,
  `src/infrastructure/http/decorators/api-response-examples.spec.ts`, `src/infrastructure/http/openapi-rate-limit.spec.ts`,
  `src/infrastructure/http/openapi-request-parser.spec.ts`, `src/infrastructure/http/openapi-presentation.spec.ts`,
  `test/e2e/api-inventory.e2e-spec.ts`, `test/support/openapi-example-manifest.ts`.
- Depends on: none.
- Acceptance: unit đỏ (module ví dụ chưa có; 429/400/413/415 chưa có ví dụ); trên document cũ: 145/145 response thành công
  không có ví dụ `message`, 1 033/1 033 response lỗi không có ví dụ có tên, `error.code` chỉ có `pattern`.
- Verify: `pnpm exec jest src/infrastructure/http` đỏ trước; script so document cũ (bằng chứng bên dưới).

### Task 2: hạ tầng ví dụ và một nguồn cho body dùng chung

- Files: `src/infrastructure/http/openapi-error-examples.ts`, `src/infrastructure/http/filters/fallback-error.ts`,
  `src/infrastructure/http/filters/http-exception.filter.ts`, `src/infrastructure/http/errors/access-errors.ts`,
  `src/infrastructure/http/errors/service-unavailable.ts`, `src/infrastructure/http/pipes/zod-validation.pipe.ts`,
  `src/infrastructure/security/guards/authentication.guard.ts`, `src/infrastructure/security/guards/authorization.guard.ts`,
  `src/infrastructure/http/decorators/api-success-response.decorator.ts`,
  `src/infrastructure/http/decorators/api-error-responses.decorator.ts`, `src/infrastructure/http/openapi-rate-limit.ts`,
  `src/infrastructure/http/openapi-request-parser.ts`.
- Depends on: Task 1.
- Acceptance: unit Task 1 xanh; guard/pipe/filter trả body như trước (refactor giữ hành vi).
- Verify: `pnpm exec jest src/infrastructure/http src/infrastructure/security`.

### Task 3: ví dụ theo route ở mapper và controller

- Files: 20 tệp `src/modules/**/*.http-errors.ts`, 39 controller, `src/infrastructure/health/health.controller.ts`,
  `src/modules/catalog/catalog-entry/application.errors.ts` (rút gọn một thông điệp — quyết định người giao việc).
- Depends on: Task 2.
- Acceptance: mọi khai báo lỗi có `examples` đúng tập mã với tới được; ví dụ theo route dựng qua mapper runtime.
- Verify: `pnpm exec tsc --noEmit`; e2e inventory.

### Task 4: tài liệu và export

- Files: `openapi.json` (exporter), [inventory](inventory.md), spec/plan này, `docs/workspace/items/README.md`,
  `docs/roadmap.md`, `docs/rules/api-contract.md`, tracker ngoài repo.
- Depends on: Task 3.
- Acceptance: diff OpenAPI chỉ là ví dụ; metadata khớp.
- Verify: `pnpm openapi:export`, script diff ngữ nghĩa, `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Gate cuối ở mục dưới, trên cùng một cây.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                          | Revision / môi trường                                                  | Kết quả thực chạy                                                                                                                                                                                                                                         | Giới hạn / việc còn lại                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Đỏ trước — document cũ                                                                      | `ea73c2f`, export tươi (sha256 `a6c849cd…`, trùng byte `openapi.json`) | 145/145 response thành công không có ví dụ `message`; 1 033/1 033 response lỗi không có ví dụ có tên; `error.code` chỉ có `pattern`                                                                                                                       | —                                                                                                                                              |
| Đỏ trước — unit                                                                             | cây làm việc, trước Task 2                                             | `openapi-error-examples.spec.ts` không biên dịch (module chưa có); spec rate-limit/parser mong ví dụ chưa có                                                                                                                                              | —                                                                                                                                              |
| `pnpm exec jest src/infrastructure/http src/infrastructure/security`                        | cây cuối, Windows                                                      | xanh (HTTP 12 suite / 135 test sau khi thêm `openapi-success-examples.spec.ts`; HTTP + security 15 / 177 ở mốc giữa)                                                                                                                                      | —                                                                                                                                              |
| `pnpm exec jest --config ./test/config/jest.e2e.cjs test/e2e/api-inventory.e2e-spec.ts`     | cây cuối                                                               | 38/38 xanh (6 test mới của `OPENAPI-EXAMPLE.1`)                                                                                                                                                                                                           | —                                                                                                                                              |
| Đột biến (script phiên, khôi phục byte)                                                     | cây cuối                                                               | 4/4 bị giết đúng test: thêm mã ngoài manifest → _shows exactly the codes_; đổi message thành công và bỏ overlay → _every JSON success response_; message 181 ký tự → _keeps every example short_                                                          | —                                                                                                                                              |
| `pnpm openapi:export` + diff ngữ nghĩa với baseline                                         | cây cuối                                                               | _examples only_: 146 operation, 162 schema (thứ tự không đổi), 138 operation có security, 1 179 response, 1 security scheme — trước/sau như nhau; thêm 1 570 ví dụ lỗi có tên + 145 overlay `message`; sha256 mới `70c5a498…`; diff dòng 26 163+ / 1 271− | Owner review artifact                                                                                                                          |
| `pnpm check`                                                                                | cây cuối, Windows PowerShell/Git Bash                                  | exit 0 — rules/format/prisma/lint/typecheck; unit 150 suite / 2 203 test; scripts; discovery; build                                                                                                                                                       | Lần đầu đỏ 3 gate cấu trúc (BEH.1 literal `DEPARTMENT_NOT_FOUND` trong mapper, controller 409 dòng, manifest 837 dòng) — đã sửa, chạy lại xanh |
| `pnpm test:e2e`                                                                             | cây cuối                                                               | 32 suite / 880 test xanh                                                                                                                                                                                                                                  | `app.e2e-spec.ts` cập nhật kỳ vọng schema 200 của health sang overlay                                                                          |
| `pnpm test:integration` (server PostgreSQL 17 mới `127.0.0.1:55436`, role `ci_integration`) | cây cuối                                                               | xanh ngay lượt đầu: 116 suite + 1 bỏ qua / 1 464 test + 4 bỏ qua, 880 s; 0 CSDL `slm_*_test` sót; container đã xóa                                                                                                                                        | —                                                                                                                                              |
| `git diff --check`, `pnpm rules:check`                                                      | cây cuối                                                               | sạch; `BE: 202 files, 1652 links, 0 errors`                                                                                                                                                                                                               | —                                                                                                                                              |
| Orval FE 8.39 (script phiên, thư mục tạm)                                                   | document trước/sau                                                     | Cả hai **không qua** validate của Orval với cùng 154 lỗi (`type: [..., "null"]`, `propertyNames` — `-F3`, có từ `ea73c2f`); tắt validate: 145 tệp contract mới (`<OperationId><Status> = <Dto> & { message?: unknown }`), 128 tệp đổi, 0 tệp xóa          | Không bắt buộc sinh lại client; nếu sinh lại phải xử lý `-F3` trước                                                                            |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (Swagger UI trên trình duyệt chưa chụp — kiểm tự động là gate).
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
