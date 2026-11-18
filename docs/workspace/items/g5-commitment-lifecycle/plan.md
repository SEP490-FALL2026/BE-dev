# Plan: vòng đời khoản cam kết: giải phóng khi hủy hoặc thất bại, không quay ngược

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Repo chưa có thao tác rút hay hủy Request, chưa có hóa đơn và chứng từ mua của Request, nên hạng mục này làm cửa giải phóng (`releaseForRequest`) và phần dùng được ngay: cổng cấp phát thất bại, phần dư của Finance, sổ và trạng thái không quay ngược; người gọi rút, hủy, nhóm gọi cửa đó sau. Phần chi phí hóa đơn thuộc G3/G8.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, `roadmap.md`
- Depends on: hạng mục phụ thuộc
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261024010000`, `budgets.prisma`, `organization.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: số trả về, sổ giải phóng, trigger không quay ngược
- Verify: nhóm _what never goes back_ và _INV-05_ xanh; `migrate diff --exit-code` = 0

### Task 3: quy tắc thuần

- Files: `commitment-release.policy.ts` (+ spec)
- Depends on: Task 1
- Acceptance: giải phóng hết, một phần, từ chối, phần dư
- Verify: 15 ca chính sách xanh

### Task 4: giải phóng và phần dư

- Files: `commitment.service.ts`, `commitment.repo.ts`, `budgets.service.ts`, `budgets.types.ts`, `budget.errors.ts`, `budget.http-errors.ts`
- Depends on: Task 2, Task 3
- Acceptance: ghi sổ và Audit, còn lại đúng, từ chối đúng
- Verify: `spend-commitment-lifecycle` (12) xanh

### Task 5: cấp phát thất bại, API

- Files: `access-request-grant.gate.ts`, `commitment-release.guard.ts`, `requests.module.ts`, `budget-commitments.controller.ts`, `commitment.dto.ts`, `spend-harness.ts`, `api-coverage-manifest.ts`, `openapi.json`
- Depends on: Task 4
- Acceptance: giải phóng khi đóng thất bại; 2 thao tác mới
- Verify: e2e kiểm kê và OpenAPI xanh; `jest src` xanh; hồi quy `access-request`, `budget`, `spend`, `provisioning` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                                       | Revision / môi trường | Kết quả thực chạy        | Giới hạn / việc còn lại                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spend-commitment-lifecycle`                                                             | PostgreSQL 17 Docker  | 12 ca xanh               | —                                                                                                                                                               |
| `commitment-release.policy.spec.ts`                                                      | như trên              | 15 ca xanh               | —                                                                                                                                                               |
| `test/integration/access-request-*`, `budget-*`, `spend-*`, `provisioning-*` sau khi đổi | như trên              | 38 suite, 776 ca xanh    | —                                                                                                                                                               |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI)                | như trên              | 156 suite, 2299 ca xanh  | —                                                                                                                                                               |
| e2e `api-inventory`, `openapi`                                                           | như trên              | 25 ca xanh, 205 thao tác | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5                                                                                                                   |
| `prisma migrate deploy` + `migrate diff --exit-code`                                     | CSDL tạm rỗng         | không drift              | —                                                                                                                                                               |
| `tsc --noEmit`, `eslint`                                                                 | như trên              | sạch                     | Rút, hủy, nhóm gọi `releaseForRequest`: `g5-request-withdrawal`, `g5-group-requests`; chuyển thành chi phí: G3/G8; thông báo: `g5-request-status-notifications` |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
