# Plan: Người duyệt chi quyết định phiên bản ngân sách và gắn ngược khoản cam kết

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc spec, rule và code liên quan; đối chiếu với BE ở revision đầu vào. Dependency đã `verified` local. Quyết định: bảng khoản cam kết tối thiểu nằm ở đây vì việc gắn ngược cần nó, hạng mục tạo cam kết thêm sau; từ chối phiên bản đầu trả đề xuất về trưởng phòng để không kẹt. Một ràng buộc mới lại để lọt trường hợp thiếu lý do khi so sánh với NULL (`unattached_reason = 'NO_BUDGET'`), đã thêm `IS NOT NULL`.

## Tasks

### Task 1: thiết kế `ready`

- Files: `spec.md`, `plan.md`, ADR-0016
- Depends on: `g5-budget-proposal-and-review`
- Acceptance: spec đủ dữ liệu, API, quyết định và ma trận test
- Verify: `pnpm rules:check` → xanh

### Task 2: dữ liệu

- Files: migration `20261023190000_budgets_decisions_and_commitments`, `budgets.prisma`, `architecture-boundaries.spec.ts`
- Depends on: Task 1
- Acceptance: bản ghi quyết định không đổi, khoản cam kết tối thiểu, ràng buộc gắn
- Verify: `budget-constraints` (14 ca mới) xanh; `migrate diff --exit-code` = 0

### Task 3: quyết định

- Files: `budget.policy.ts` (`checkVersionDecision`), `version-decision.service.ts`, `decision.repo.ts`, `commitment.repo.ts`, `budget-support.service.ts`, `version.repo.ts`
- Depends on: Task 1
- Acceptance: ai quyết, duyệt thay phiên bản và gắn khoản chờ, từ chối và yêu cầu sửa
- Verify: `budget-decisions` (25), chính sách (10 ca mới) xanh

### Task 4: view và API

- Files: `version-view.service.ts`, `budget-view.service.ts`, `proposal.service.ts`, `budget-versions.controller.ts`, `budget-version-lines.controller.ts`, `budget.dto.ts`, `budget-harness.ts`, `api-coverage-manifest.ts`, `openapi.json`
- Depends on: Task 2
- Acceptance: Người duyệt đọc phiên bản và đề xuất, bảng có còn lại, route quyết định, op count 181
- Verify: `jest src`, e2e kiểm kê, `tsc`, `eslint` xanh

### Checkpoint

Gate chạy xanh trên cây làm việc, tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, BE `7920ee5`, Windows, PostgreSQL 17 trong Docker (`slm-g1g2-test-db`).

| Lệnh / kiểm tra AC                                                        | Revision / môi trường | Kết quả thực chạy                                    | Giới hạn / việc còn lại                       |
| ------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `budget-decisions.integration-spec.ts`                                    | PostgreSQL 17 Docker  | 25 ca xanh                                           | —                                             |
| `budget-constraints.integration-spec.ts` (thêm 14 ca)                     | như trên              | xanh; một ca đầu lộ lỗ hổng so sánh với NULL, đã sửa | —                                             |
| `budget-proposals`, `budget-versions` sau khi mở đọc cho Người duyệt chi  | như trên              | tổng 135 ca xanh cho bốn suite `budget-*`            | —                                             |
| `pnpm exec jest src` (unit, gồm kiến trúc, hợp đồng danh sách và OpenAPI) | như trên              | 150 suite, 2216 ca xanh                              | —                                             |
| e2e `api-inventory`, `openapi`                                            | như trên              | 25 ca xanh, 181 thao tác                             | `pnpm test:e2e` đầy đủ chạy ở mốc cuối của G5 |
| `prisma migrate deploy` + `migrate diff --exit-code`                      | CSDL tạm rỗng         | 0 (không drift)                                      | —                                             |
| `tsc --noEmit`, `eslint` `src`, `test/integration`, `test/support`        | như trên              | sạch                                                 | —                                             |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review chưa có.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
