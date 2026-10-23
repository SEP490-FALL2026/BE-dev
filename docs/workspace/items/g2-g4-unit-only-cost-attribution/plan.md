# Plan: Cost Center chỉ `Unit`; tài khoản dịch vụ thuộc phòng sở hữu (`QĐ-86`)

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review (chặn `ready`: phương án A/B cho dữ liệu `COMPANY`). Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, [database rules](../../../rules/database-business.md), module structure; đối chiếu spec
với BE revision lúc bắt đầu; đọc kết quả Prompt 08 cho các route chạm tới; chuẩn bị PostgreSQL riêng theo test guide.

## Tasks

### Phase 1 — dữ liệu

### Task 1: migration phòng sở hữu và enum chỉ `UNIT`

- Files: `prisma/models/organization.prisma`, `prisma/models/licensing.prisma`, `prisma/migrations/<mới>/migration.sql`,
  test integration ràng buộc mới.
- Depends on: Owner chọn A/B.
- Acceptance: Assignment dịch vụ có phòng sở hữu và Cost Center `Unit` của phòng đó; migration dừng khi gặp dữ liệu không
  ánh xạ được; enum theo phương án đã chọn.
- Verify: chạy migration trên CSDL tạm có dữ liệu mẫu `COMPANY` (có và không ánh xạ được); `pnpm exec prisma migrate
diff` không lệch; test ràng buộc đỏ-trước/xanh-sau.

### Checkpoint

`pnpm check` xanh với code đã cập nhật kiểu Prisma tối thiểu (không đổi hành vi HTTP ở checkpoint này nếu tách được).

### Phase 2 — hành vi

### Task 2: danh mục Cost Center và tạo phòng

- Files: `organization/cost-center/*`, `organization/department/*`, mapper lỗi, test `cost-centers-http`,
  `organization.integration-spec`, `departments-http`, `seat-baseline-contracts`.
- Depends on: Task 1.
- Acceptance: `US-04-09` AC-4, AC-7; `US-03-06` AC-2.
- Verify: test HTTP đỏ-trước/xanh-sau; `pnpm test:integration` các suite liên quan.

### Task 3: import hiện trạng và đổi người chịu trách nhiệm

- Files: `data-import/seat-baseline-import/*`, `licensing/assignment/*`, fixture `test/support/seat-baseline-*`, test
  `seat-baseline-rows.spec`, `seat-baseline-import-http`, `license-assignment-http`, `license-assignment-constraints`,
  `seat-baseline-closing-http`, `employee-import-seats-http`.
- Depends on: Task 1.
- Acceptance: `US-02-05` AC-7, vế phòng sở hữu của AC-10.
- Verify: unit + integration đỏ-trước/xanh-sau.

### Task 4: ngừng phòng, công cụ đang dùng, phân bổ

- Files: port mới ở `organization` + hiện thực ở `licensing`, `department/*`, `licensing/assignment/department-tools*`,
  `finance.types.ts`, `subscription-allocation.dto.ts`, test `departments-http`, `department-tools-http`,
  `cost-allocation-*`, `architecture-structure` registry nếu cần.
- Depends on: Task 1.
- Acceptance: `US-03-06` AC-19 vế tài khoản dịch vụ; D08; D10.
- Verify: integration đỏ-trước/xanh-sau; gate cấu trúc không tăng ledger.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng, `pnpm openapi:export` (review diff: enum
co lại, mã lỗi mới, `details.serviceAccounts`); cập nhật roadmap, scope map, ghi chú FE; Owner review revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
