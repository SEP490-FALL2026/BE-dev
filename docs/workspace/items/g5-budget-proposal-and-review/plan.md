# Plan: trưởng phòng nộp đề xuất ngân sách năm và Finance lập phiên bản rà soát

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified`. Quyết định mở `budgets` (ADR-0016) thay vì nhét vào `finance`; bắt các ràng buộc bằng chỉ mục duy nhất một phần để `INV-21` không phụ thuộc vào việc ứng dụng nhớ kiểm tra. Hai ca ràng buộc đầu tiên bị lọt vì so sánh với NULL (`q2_minor >= 0` khi cột rỗng) — đã thêm `IS NOT NULL` tường minh.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, ADR-0016, bản đồ G5 (AC-17 `partial`)
- Depends on: `g2-department-profile`
- Acceptance: spec đủ dữ liệu, 22 route, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu của ngân sách

- Files: migration `20261023180000_budgets_proposals_and_versions`, `budgets.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: năm bảng, chỉ mục duy nhất một phần, ràng buộc trạng thái, tiền, nguồn, quý
- Verify: `budget-constraints` (37) xanh; `migrate diff --exit-code` = 0

### Task 3: chính sách thuần

- Files: `budget.policy.ts`, `budget.policy.spec.ts`
- Depends on: Task 2
- Acceptance: trường bắt buộc của dòng, năm mở, tổng, quý, rút/trả/nộp lại, loại thay đổi của dòng
- Verify: `budget.policy.spec.ts` (24) xanh

### Task 4: đề xuất

- Files: `proposal.repo.ts`, `proposal.service.ts`, `budget-support.service.ts`, `budget-proposals.controller.ts`
- Depends on: Task 2
- Acceptance: nộp, rút, trả lại, nộp lại, đọc theo vai
- Verify: `budget-proposals` (25) xanh

### Task 5: phiên bản và dòng

- Files: `version.repo.ts`, `version-line.repo.ts`, `version.service.ts`, `version-line.service.ts`, `version-view.service.ts`, `line-import.service.ts`, `budget-view.service.ts`, `budget-versions.controller.ts`, `budgets.controller.ts`
- Depends on: Task 3
- Acceptance: dựng, chỉnh, gửi, sửa đổi, nạp file, dời khoảng mua, nhìn của trưởng phòng
- Verify: `budget-versions` (33) xanh

### Task 6: API, harness và gate

- Files: `budget.dto.ts`, `budget-harness.ts`, `api-coverage-manifest.ts`, `api-inventory.e2e-spec.ts`, `openapi.json`, `app/app.module.ts`
- Depends on: Task 4
- Acceptance: 22 route, op count 180, danh sách trả bản tóm tắt, OpenAPI xuất lại
- Verify: `jest src`, e2e kiểm kê, `tsc`, `eslint` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                        | Revision / môi trường | Kết quả thực chạy                                                            | Giới hạn / việc còn lại                       |
| ------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `budget-proposals.integration-spec.ts`                                    | PostgreSQL 17 Docker  | 25 ca xanh                                                                   | —                                             |
| `budget-versions.integration-spec.ts`                                     | như trên              | 33 ca xanh                                                                   | —                                             |
| `budget-constraints.integration-spec.ts`                                  | như trên              | 37 ca xanh; một ca đầu lộ lỗ hổng so sánh với NULL của ràng buộc quý, đã sửa | —                                             |
| `budget.policy.spec.ts`                                                   | như trên              | 24 ca xanh                                                                   | —                                             |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI) | như trên              | 150 suite, 2208 ca xanh                                                      | —                                             |
| e2e `api-inventory`, `openapi`                                            | như trên              | 25 ca xanh, 180 thao tác                                                     | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate deploy` + `migrate diff --exit-code`                      | CSDL tạm rỗng         | 0 (không drift)                                                              | —                                             |
| `tsc --noEmit`, `eslint` `src`, `test/integration`, `test/support`        | như trên              | sạch                                                                         | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
