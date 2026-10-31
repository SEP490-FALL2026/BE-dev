# Plan: b03-my-requests — "Yêu cầu của tôi"

- [Spec](spec.md); revision đầu vào: Docs `d6d868c`, BE `6eb12d1` + cây chưa commit (A-01, A-02, A-03, A-05, A-07, A-09 đã tích hợp).
- Phụ trách: AI theo giao việc của điều phối (31/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026).
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local, chưa commit, 31/10/2026; chỉ phần ghi ở bảng dưới). PR: chưa có (không commit/push theo giao việc).

## Before coding

Đã đọc `docs/rules/api-contract.md` (mục Collection và detail), `module-structure.md`, `database-business.md`,
`work-item-sizing.md`, hướng dẫn dev mới, DEV-B.md (B-03), README audit (`API-GAP-01`, `RA-03`), yêu cầu contract của A-07,
spec/hợp đồng A-09 (`DEF-A09-01`), source `requests` (`draft/`, `request-draft/`, `request-view/`, `withdraw/`, `access-request/`,
`spend/spend-status.service.ts`, `group-request/group-withdrawal.service.ts`, `assessment/assessment-reader.service.ts`) và test
tương ứng. Xác minh bằng source: không có `GET` nào liệt kê Request đã gửi; `GET /access-requests/drafts` và route gửi/rút chỉ
khai `@AuthenticatedOnly()`, Super Admin bị 403 trong service. Dependency: DB test `slm-test-db` (Docker, 127.0.0.1:55432, role
`ci_integration`).

## Tasks

### Task 1: spec, plan, đề xuất roadmap

- Files: `spec.md`, `plan.md` trong thư mục hạng mục
- Depends on: none
- Acceptance: quyền xem người tạo/thụ hưởng/gửi thay/nhóm/tài khoản dịch vụ viết rõ từ nguồn; câu hỏi mở nêu cho Owner, không ghi
  quyết định hộ Owner; sizing hợp lệ
- Verify: `pnpm rules:format`, `pnpm rules:check` (dòng scope map/roadmap do điều phối gộp)

### Task 2: capability `requests/my-requests/`

- Files: `src/modules/requests/my-requests/*` (controller, service, repo, facts repo, dto, mapper, policy, types, hai spec unit),
  một khối import và một dòng đăng ký ở `src/modules/requests/requests.module.ts`
- Depends on: Task 1
- Acceptance: `GET /api/v1/me/access-requests` đúng spec: điều kiện người tạo duy nhất, summary projection, lọc, thứ tự, phân trang,
  số câu lệnh không đổi theo số dòng, không dữ liệu tài chính; không migration
- Verify: `pnpm exec jest src/modules/requests/my-requests` → 68 test; `pnpm exec eslint src/modules/requests/my-requests`;
  `pnpm arch:check`

### Task 3: HTTP contract

- Files: `test/http/requests/my-requests.http-spec.ts`
- Depends on: Task 2
- Acceptance: 401, 403 Super Admin trước mọi đọc, 422 cho từng query sai (gồm tham số chỉ người), vai không bị đòi, thông điệp và hình
  dạng, 503
- Verify: `pnpm exec jest --config ./test/config/jest.http.cjs test/http/requests/my-requests` → 22 test

### Task 4: integration PostgreSQL

- Files: `test/integration/requests/my-requests.integration-spec.ts` (quyền xem, nội dung từng trạng thái, so với detail),
  `test/integration/requests/my-requests-read.integration-spec.ts` (thứ tự, phân trang, lọc, số câu lệnh, dữ liệu tài chính)
- Depends on: Task 2
- Acceptance: IDOR (đồng nghiệp cùng phòng, người phòng khác, trưởng phòng giữ bước, IT Admin, Finance, người duyệt chi, người thụ hưởng
  của gửi thay, người của nhóm), hai Employee, nhóm/gửi thay/tài khoản dịch vụ/nháp, đổi người giữ bước giữa hai lần đọc, thứ tự và phân
  trang, số câu lệnh, không dữ liệu tài chính
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs --runInBand test/integration/requests/my-requests` (từng file, DB
  `slm-test-db`) → 14 + 9 test

### Task 5: đăng ký dùng chung (điều phối)

- Files: không sửa trong hạng mục này: `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-requests.ts`, `test/http/platform/openapi-presentation.http-spec.ts` (số operation),
  `openapi.json`, `docs/generated/routes.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, module card `requests/README.md`
- Depends on: Task 2
- Acceptance: các dòng roadmap/scope map đã được gộp; `pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph` chạy
  lại; các test inventory/example/presentation xanh
- Verify: `pnpm test:http`, `pnpm arch:docs:check`, `pnpm rules:check`

### Checkpoint

`pnpm arch:check`, eslint các file của hạng mục, hai spec unit, HTTP contract của hạng mục, hai spec integration; tự review diff theo
bảng test của spec.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                      | Revision / môi trường                   | Kết quả thực chạy                                                                                                                                                                                                                        | Giới hạn / việc còn lại                                                                                     |
| --------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/requests/my-requests`                                       | cây chưa commit, 31/10/2026             | 2 file, 68 test đạt                                                                                                                                                                                                                      | —                                                                                                           |
| `pnpm exec eslint` các file của hạng mục (source và ba file test)                       | như trên                                | 0 lỗi                                                                                                                                                                                                                                    | —                                                                                                           |
| `pnpm exec tsc --noEmit`                                                                | như trên                                | 0 lỗi trong file của hạng mục (các lần chạy giữa chừng còn lỗi ở file đang sửa của hạng mục khác)                                                                                                                                        | chạy lại sau khi tích hợp                                                                                   |
| `pnpm arch:check`                                                                       | như trên                                | 0 vi phạm                                                                                                                                                                                                                                | —                                                                                                           |
| `pnpm test:gates`                                                                       | như trên                                | 15/16 file đạt (`capability-graph`, `module-layout`, `api-collection-contract`, `lint-debt` đạt); `module-graph` đỏ ở `BudgetsModule.FiscalYearStartLockReader` — file của hạng mục khác                                                 | gate `api-collection-contract` đọc `openapi.json` cũ, chưa có route mới: chạy lại sau `pnpm openapi:export` |
| HTTP contract `test/http/requests/my-requests`                                          | như trên                                | 22 test đạt                                                                                                                                                                                                                              | —                                                                                                           |
| Integration `my-requests.integration-spec.ts` (`--runInBand`, `slm-test-db`)            | PostgreSQL 17 Docker, DB riêng của file | 14 test đạt                                                                                                                                                                                                                              | không chạy toàn bộ integration (điều phối chạy)                                                             |
| Integration `my-requests-read.integration-spec.ts` (`--runInBand`, `slm-test-db`)       | như trên                                | 9 test đạt; 21 câu lệnh dữ liệu cho 6 dòng và cho 18 dòng                                                                                                                                                                                | —                                                                                                           |
| `test/http/platform/api-inventory`, `openapi-response-examples`, `openapi-presentation` | như trên                                | đỏ đúng ở các dòng chờ điều phối (operation chưa có trong manifest, thông điệp `ME.ACCESS_REQUESTS_LISTED`, mã 403 chưa khai trong manifest ví dụ, số operation); `openapi-dialect`, `openapi-request-rules`, `openapi-read-wording` đạt | điều phối đã gộp các dòng manifest; chạy `pnpm openapi:export`                                           |

Phần chưa kiểm chứng: `openapi.json` và `docs/generated/*` chưa sinh lại (cấm sửa trong lát này); không chạy toàn bộ integration/E2E;
chưa thêm bước list vào `mobile-channel-smoke` và `mobile-employee-requests` (việc của A-07 khi route đã tích hợp); `updatedAt` là cột
`updated_at` của Request (mọi ghi qua Prisma đều đổi nó) — chưa có test pin ngữ nghĩa "lần cuối đổi trạng thái"; chưa kiểm trang có
`GROUP_GRANT` ở các trạng thái nhóm hỗn hợp (chỉ kiểm nhóm đang chờ chi).

- [x] AC trong scope có bằng chứng; vế của hạng mục khác ghi tên hạng mục.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; module card `requests/README.md` cập nhật khi tích hợp (capability `my-requests`).
- [ ] Giao Owner review trên revision cụ thể; chưa ghi `merged-dev`, `accepted` hay `released`.
