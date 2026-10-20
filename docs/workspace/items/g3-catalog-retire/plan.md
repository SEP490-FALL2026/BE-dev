# Plan: ngừng sử dụng ứng dụng bị chặn tới khi dọn sạch quyền và thuê bao (`US-04-01` phần ngừng)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, ADR-0013 (mục 4), `US-04-01` (AC-8, AC-9, AC-14 và AC khác cùng Story), `application.service.ts` và `application.repo.ts` (trạng thái `catalogStatus`, Business Owner hiện tại), `application-owner.service.ts` (lịch sử Business Owner), `g3-subscription-seat-guards` (người đọc chiếm chỗ), `g4-provisioning-queue-manual` (Assignment `Thất bại`). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu xác nhận và trạng thái ngừng

- Files: `prisma/models/catalog.prisma` (`ApplicationRetirementConfirmation`, cột của `Application`), quan hệ ngược ở `organization.prisma`, migration `20261020240000_catalog_application_retirement`, `src/architecture-boundaries.spec.ts`, `test/integration/application-retirement-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-entry`.
- Acceptance: CHECK `RETIRED ⟺ retired_at`, bản ghi xác nhận bất biến và không xóa, ứng dụng đã ngừng không đổi lại, khóa ngoại, nội dung không rỗng.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: chính sách thuần

- Files: `src/modules/catalog/catalog-entry/application-retirement.policy.ts`, `application-retirement.policy.spec.ts`, `application.errors.ts`.
- Depends on: Task 1.
- Acceptance: kiểm Business Owner hiện tại và còn làm việc, nội dung xác nhận, thứ tự quyết định (đã ngừng, thiếu xác nhận, bị chặn), tập thuê bao chặn (`TERM` còn hạn hoặc chưa có ngày kết thúc, không tính mua vĩnh viễn).
- Verify: `pnpm exec jest src/modules/catalog/catalog-entry` đỏ trước, xanh sau.

### Task 3: repo, service, route

- Files: `application-retirement.repo.ts`, `application-retirement.service.ts`, `application-retirement.dto.ts`, `application-retirement.controller.ts`, `application.http-errors.ts`, `catalog.module.ts`, `test/support/api-coverage-manifest.ts` (+3), `test/e2e/api-inventory.e2e-spec.ts` (130 → 133), `test/e2e/application-retirement.e2e-spec.ts`, `test/integration/application-retirement-http.integration-spec.ts`.
- Depends on: Task 2 và `g3-subscription-seat-guards` Task 2 (người đọc `openAssignmentsOfPlans`).
- Acceptance: ba operation đúng bảng HTTP; mọi AC trong ma trận; không tác vụ nào được tạo.
- Verify: e2e + integration; đột biến (bỏ kiểm xác nhận, không kiểm Business Owner hiện tại, đếm cả Assignment đã kết thúc, bỏ thuê bao `TERM`, đếm mua vĩnh viễn, tự tạo tác vụ, bỏ khóa ứng dụng) làm đỏ.

### Task 4: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, `g3-catalog-entry` (ghi phần ngừng đã có), plan/spec này.
- Depends on: Task 3.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | đang triển khai         |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
