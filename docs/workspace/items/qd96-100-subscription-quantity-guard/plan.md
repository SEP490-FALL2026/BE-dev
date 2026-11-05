# Plan: Căn cứ cho số lượng thuê bao đang dùng và thuê bao tạo sau khởi tạo

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-TL).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Cỡ ước lại: M ≈ 6h (ITEMS ghi 4h; thêm sổ căn cứ + hai hook). Track L, trước `qd96-100-catalog-api-fields`.

## Before coding

Đọc `catalog/README.md`, `catalog/subscription/{subscription.service,subscription-change.service,subscription.dto}.ts`,
`catalog/public/catalog.extension-points.ts` (mẫu `SeatOccupancyHook` và nơi `licensing` bind), `requests/grant/grant.policy.ts`
(trạng thái _đã duyệt_), `licensing/seat-baseline/**` (trạng thái baseline), `src/infrastructure/database/database-role-judgement.ts`.
Migration đặt timestamp lúc implement, sau migration cuối trên branch.

## Tasks

### Task 1: migration sổ căn cứ + model + quyền runtime

- Files: `prisma/migrations/<ts>_subscription_quantity_basis/migration.sql`, `prisma/models/catalog.prisma`,
  `src/infrastructure/database/database-role-judgement.ts`, `test/gates/architecture-boundaries.gate-spec.ts`,
  `test/integration/catalog/subscription-constraints.integration-spec.ts`.
- Depends on: none.
- Acceptance: bảng, check, trigger chỉ ghi thêm; runtime chỉ `SELECT, INSERT`; không drift.
- Verify: `pnpm test:integration -- test/integration/catalog/subscription-constraints.integration-spec.ts`; `pnpm test:gates`.

### Task 2: hai hook + bind ở `requests` và `licensing/seat-baseline`

- Files: `catalog/public/catalog.extension-points.ts`, `requests/…/subscription-request-basis.binder.ts` (+ spec, đọc
  `approvedSeats` cá nhân/nhóm), `licensing/seat-baseline/subscription-licensing-facts.binder.ts` (chỉ `baselineClosed`).
- Depends on: Task 1.
- Acceptance: catalog không import `requests`/`licensing`; `approvedSeats` đúng cho GRANT và GROUP_GRANT; `renewalBasis` để trống.
- Verify: `pnpm test -- <binder specs>`; `pnpm arch:check`.

### Task 3: policy căn cứ (thuần)

- Files: `catalog/subscription/subscription-basis.policy.ts` (+ `.spec.ts`), `subscription.errors.ts`, `subscription.http-errors.ts`.
- Depends on: none (song song Task 2).
- Acceptance: chiều, trần, thiếu/thừa căn cứ, dạng create — mỗi mã lỗi một ca.
- Verify: `pnpm test -- subscription-basis.policy.spec.ts`.

### Checkpoint A

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`.

### Task 4: nối vào create/update + Audit + DTO

- Files: `subscription.dto.ts`, `subscription.service.ts`, `subscription-change.service.ts`, `subscription.repo.ts`,
  `subscriptions.controller.ts`, `test/integration/catalog/subscription-quantity-basis.integration-spec.ts` (mới),
  `test/http/catalog/subscription-purchase.http-spec.ts`.
- Depends on: Task 2, Task 3.
- Acceptance: toàn bộ test matrix xanh (kể cả đồng thời bằng khóa tư vấn).
- Verify: hai file test trên; `pnpm openapi:export`.

### Checkpoint B

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates`, `pnpm rules:check`, `pnpm openapi:export`;
test theo file. Ghi điểm bind `renewalBasis` vào `catalog/README.md` cho chat MF-5.

## Verification and handoff

| Lệnh / kiểm tra AC   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------- | --------------------- | ----------------- | ----------------------- |
| (điền khi implement) |                       |                   |                         |

- [ ] Test matrix có bằng chứng; vế `renewalId` ghi rõ trạng thái bind.
- [ ] Báo FE và chat MF-5; giao Owner review trên revision cụ thể.
