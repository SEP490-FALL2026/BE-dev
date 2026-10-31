# Plan: Employee tìm và chọn phần mềm/gói trước khi xem trước Request

- [Spec](spec.md); revision đầu vào: Docs `726219a0d7a545c4da71af45eecee6b61c5d45ae`, BE `6eb12d19f704d25d90fbab164c2476eff0a0121f`.
- Phụ trách: Dev A (AI theo giao việc của người dùng). Thiết kế ban đầu bởi: AI theo giao việc của người dùng (31/10/2026).
- Owner review: chưa review. Peer review: chưa có (coordinator điều phối reviewer).
- Triển khai: `verified` local (cây làm việc chưa commit, nhánh `Bao_dev_be`). PR: chưa có.

## Before coding

Đã đọc AGENTS.md, rules `api-contract`, `module-structure`, `work-item-sizing`, test guide, module card `catalog`, preview
(`requests/request-submission/request-preview.service.ts`, `requests/access-request/request-facts.service.ts`,
`access-request.policy.ts`, `pricing.policy.ts`) và catalog quản trị (`applications.controller.ts`, `plans.controller.ts`).
Eligibility chốt theo đúng thứ tự `RequestFactsService.assess`: phòng hôm nay → gói tồn tại → ứng dụng không retired → loại
(nhánh) → cổng Cost Center cho phần mềm trả phí → giá từ subscription `ACTIVE` của chính phòng. Không migration. Môi trường:
Docker `slm-test-db` (127.0.0.1:55432) cho integration/E2E; không dùng PostgreSQL Windows 5432.

## Tasks

### Task 1: quy tắc thuần và đọc giá theo lô

- Files: `src/modules/catalog/requestable-software/requestable-software.policy.ts` (+ `.spec.ts`), `requestable-software.types.ts`;
  `src/modules/catalog/subscription/subscription.repo.ts` (`pricedOf`, `PRICED_FIRST`, `findPricedCyclesOfPlans`),
  `subscription-facts.service.ts` (`pricedCyclesOfPlans`).
- Depends on: none.
- Acceptance: ba loại baseline; cổng `FINANCE_SETUP_INCOMPLETE` chỉ cho phần mềm trả phí; trạng thái giá khớp `priceRequest`
  của preview (không subscription ⟹ `NO_PRICED_SUBSCRIPTION`, kỳ `OTHER` ⟹ `CYCLE_UNKNOWN`); batch dùng chung bộ lọc/thứ tự với
  `findPricedOfPlan`.
- Verify: `pnpm exec jest src/modules/catalog/requestable-software` → xanh.

### Task 2: capability `requestable-software` và bốn route

- Files: `requestable-software.repo.ts`, `.service.ts`, `.controller.ts`, `.dto.ts`, `.errors.ts`, `.http-errors.ts`;
  `src/modules/catalog/catalog.module.ts`; `src/modules/catalog/README.md`.
- Depends on: Task 1.
- Acceptance: `GET /requestable-applications[/{id}]`, `GET /requestable-plans[/{id}]`, `@AuthenticatedOnly()`, projection
  an toàn, 409 `NO_DEPARTMENT`, 404 mã riêng, phân trang ≤ 100, thứ tự tất định, đếm cùng snapshot.
- Verify: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates` → xanh.

### Task 3: HTTP contract và inventory

- Files: `test/http/catalog/requestable-software.http-spec.ts`; `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-catalog.ts`,
  `test/http/platform/openapi-presentation.http-spec.ts` (287 → 291); `openapi.json`, `docs/generated/routes.md`,
  `docs/generated/module-graph.md` (qua generator).
- Depends on: Task 2.
- Acceptance: 401/503/200/409/404/422 và envelope/message đúng; inventory và ví dụ OpenAPI khớp.
- Verify: `pnpm test:http`, `pnpm openapi:export`, `pnpm arch:docs:check` → xanh, `openapi.json` chỉ thêm bốn path và bốn schema.

### Task 4: integration PostgreSQL và smoke E2E

- Files: `test/integration/catalog/requestable-software.integration-spec.ts`; `test/e2e/paid-request-to-seat.e2e-spec.ts`
  (thêm bước đầu).
- Depends on: Task 2.
- Acceptance: ma trận spec — dữ liệu ẩn, gói không hợp lệ/thiếu cấu hình, mọi loại, đối chiếu preview, tìm kiếm, phân trang,
  số câu lệnh, quyền, chuỗi list → detail → preview → submit cho ba loại; E2E D-1 bắt đầu từ danh mục.
- Verify: `pnpm test:integration -- test/integration/catalog/requestable-software.integration-spec.ts`,
  `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts` → xanh.

### Task 5: tài liệu và scope map

- Files: `docs/workspace/items/a01-employee-catalog-selector/{spec,plan}.md`, `docs/workspace/items/README.md`,
  `docs/roadmap.md` (bảng hạng mục + scope map G5: tách `US-05-01` AC-8), `docs/workspace/items/g5-request-preview/spec.md`
  (bảng Primary `partial` + ghi chú).
- Depends on: Task 1→4.
- Acceptance: không AC mồ côi/hai chủ; không ghi `accepted`.
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh.

### Checkpoint

Sau Task 2 và Task 4: typecheck, lint, gates, arch, unit/HTTP/integration của hạng mục xanh; tự review diff theo spec.

## Verification and handoff

Chạy từ gốc BE, nhánh `Bao_dev_be`, nền `6eb12d1`, cây làm việc chưa commit; Node 24.0.2 (riêng `openapi:export` chạy
bằng Node 22.15.0 — xem giới hạn). Integration/E2E trên Docker `slm-test-db`, mỗi file một database tạm tự xóa.

| Lệnh / kiểm tra AC                                                                           | Revision / môi trường                                    | Kết quả thực chạy                                                                                                                                          | Giới hạn / việc còn lại                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/catalog/requestable-software`                                    | `6eb12d1` + cây làm việc, Node 24                        | 1 suite, 17 test xanh                                                                                                                                      | —                                                                                                                                                                     |
| `pnpm typecheck`; `pnpm lint`                                                                | như trên                                                 | xanh; xanh (0 lỗi)                                                                                                                                         | `typecheck` đỏ trước đó vì client Prisma sinh ngày 25/10 lỗi thời; `pnpm prisma:generate` rồi xanh                                                                    |
| `pnpm test` (unit toàn bộ)                                                                   | như trên                                                 | 1 103 suite, 15 991 test xanh                                                                                                                              | số suite có thể gồm spec trong `.claude/worktrees/` của agent khác                                                                                                    |
| `pnpm test:gates`; `pnpm arch:check`; `pnpm arch:docs:check`                                 | như trên                                                 | 16 suite 317 test xanh (gồm gate collection, không thêm ngoại lệ); 0 vi phạm; xanh                                                                         | `pnpm arch:capabilities --module catalog`: 12 capability, không vòng                                                                                                  |
| `pnpm test:http`                                                                             | như trên                                                 | lượt đầu 45/52 suite xanh, 7 đỏ do máy quá tải (OOM worker, timeout 30 s, `ECONNRESET`) và `openapi-export`; 6 suite chạy lại `--runInBand`: 180 test xanh | spec mới `requestable-software.http-spec.ts` 36 test xanh                                                                                                             |
| `pnpm openapi:export`; `openapi-export.http-spec.ts`                                         | Node 22.15.0 (`nvm` bản cài sẵn, không đổi bản mặc định) | ghi `openapi.json`: đúng +4 path, +4 schema (so ngữ nghĩa với HEAD); spec export 4/4 xanh                                                                  | Node 24.0.2 + ts-node: `MODULE_NOT_FOUND` khi nạp graph (`return-request.service.ts`), tái hiện cả khi gỡ controller mới khỏi `CatalogModule` ⟹ lỗi môi trường có sẵn |
| `pnpm test:integration -- test/integration/catalog/requestable-software.integration-spec.ts` | Docker `slm-test-db`                                     | 29/29 xanh                                                                                                                                                 | database tạm tự xóa; không còn `slm_*`                                                                                                                                |
| `pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts`                                 | Docker `slm-test-db`                                     | 7/7 xanh (bước danh mục mới + 6 bước D-1 cũ)                                                                                                               | —                                                                                                                                                                     |
| Drift: DB tạm `slm-test-db` + `prisma migrate deploy` + `migrate diff --exit-code`           | Docker                                                   | "No difference detected", exit 0; DB tạm đã xóa                                                                                                            | không có migration mới                                                                                                                                                |
| `pnpm rules:check`; `pnpm rules:format`                                                      | như trên                                                 | 325 file, 2 771 link, 0 lỗi; xanh                                                                                                                          | scope map G5 tách `US-05-01` AC-8                                                                                                                                     |
| `pnpm test:discovery`                                                                        | như trên                                                 | đỏ: 827 mục, **mọi mục** là spec trong `.claude/worktrees/` của agent khác                                                                                 | không mục nào thuộc hạng mục này                                                                                                                                      |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
