# Plan: hệ thống tự tạo khoản cam kết khi duyệt chi, kể cả khi chưa có ngân sách

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Bảng `budget_commitments` đã có từ `g5-budget-version-decision` (giữ id Request như giá trị); hạng mục này thêm khóa ngoại và snapshot, và gọi từ quyết định duyệt qua facade của `budgets`.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, `roadmap.md`
- Depends on: hai hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261023240000`, `budgets.prisma`, `requests.prisma`
- Depends on: Task 1
- Acceptance: khóa ngoại tới Request và phép kiểm, snapshot lưu theo khoản
- Verify: `migrate diff --exit-code` = 0; `budget-constraints` xanh

### Task 3: giữ khoản cam kết

- Files: `commitment.service.ts`, `commitment.repo.ts`, `budgets.service.ts`, `budgets.types.ts`, `spend-decision.service.ts`
- Depends on: Task 2
- Acceptance: mỗi năm một khoản, chờ ngân sách, Audit, cùng transaction với quyết định
- Verify: `spend-commitments` (14) xanh

### Task 4: đọc cho Finance, API

- Files: `budget-commitments.controller.ts`, `commitment.dto.ts`, `access-request-query.service.ts`, `api-coverage-manifest.ts`, `openapi.json`, registries kiến trúc
- Depends on: Task 3
- Acceptance: danh sách, lọc, Finance mở Request; 199 thao tác
- Verify: e2e kiểm kê và OpenAPI xanh; `jest src` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                     | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                              |
| ---------------------------------------------------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------- |
| `spend-commitments`                                                    | PostgreSQL 17 Docker  | 14 ca xanh               | —                                                                    |
| `test/integration/access-request-*`, `budget-*`, `spend-*` sau khi đổi | như trên              | 30 suite, 656 ca xanh    | —                                                                    |
| `pnpm exec jest` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI)  | như trên              | 154 suite, 2270 ca xanh  | —                                                                    |
| e2e `api-inventory`, `openapi`                                         | như trên              | 25 ca xanh, 199 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                        |
| `prisma migrate deploy` + `migrate diff --exit-code`                   | CSDL tạm rỗng         | không drift              | —                                                                    |
| `tsc --noEmit`, `eslint`                                               | như trên              | sạch                     | Giải phóng, chuyển thành chi phí, gia hạn: `g5-commitment-lifecycle` |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
