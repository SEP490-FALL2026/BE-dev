# Plan: tệp gốc hợp đồng và chứng từ mua có kiểm soát truy cập (`US-04-04` phần hiện thực được)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `in-progress`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-04` (AC-1→AC-11 và bảng mục đích), `src/infrastructure/object-storage/*` (cổng, bộ sinh khóa, cấu hình tự kiểm tra khi mount), `docs/guides/containers.md`, `.env.example`, `parameter-definitions.ts`, `provisioning-harness` (ghi đè nhà cung cấp trong test). DB integration Docker `127.0.0.1:55432`; kho S3 thật không có trong môi trường này, test dùng kho giả. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `contracts` và `document_attachments`

- Files: `prisma/models/catalog.prisma`, quan hệ ngược ở `organization.prisma`, migration `20261020250000_catalog_contracts_and_documents`, `src/architecture-boundaries.spec.ts`, `test/integration/document-constraints.integration-spec.ts`.
- Depends on: `g3-subscription-purchase`.
- Acceptance: CHECK trạng thái ⟺ chủ, mục đích gắn được vào hợp đồng, `object_key` duy nhất, kích thước dương, tên hợp đồng không rỗng, trigger không xóa, `READY` bất biến, cột khai báo không đổi.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: chính sách thuần và tham số kích thước

- Files: `src/modules/catalog/contract/contract.policy.ts`, `contract.policy.spec.ts`, `contract.errors.ts`, `src/modules/operating-parameters/parameter-definitions.ts` (`DOCUMENT_MAX_SIZE_MB`) và spec của nó.
- Depends on: Task 1.
- Acceptance: luật vai theo mục đích, mục đích dùng được, loại và đuôi tệp, kích thước, khớp giữa khai báo và kho, ai mở theo trạng thái và vai, tên hợp đồng.
- Verify: `pnpm exec jest src/modules/catalog/contract src/modules/operating-parameters` đỏ trước, xanh sau.

### Task 3: mount kho đối tượng và cấu hình

- Files: `catalog.module.ts` (import `ObjectStorageModule`), `src/infrastructure/object-storage/object-storage.module.ts` (cập nhật chú thích mount), `test/support/http-test-app.ts` (đã có ghi đè nhà cung cấp), `test/support/fake-object-storage.ts` (kho giả), `ARCHITECTURE.md`, `docs/guides/containers.md`, `.env.example`.
- Depends on: Task 2.
- Acceptance: API khởi động với kho mount; production vẫn đòi endpoint HTTPS, bucket và khóa truy cập; tài liệu không còn nói kho chưa mount.
- Verify: `pnpm check` (spec cấu hình), khởi động `AppModule` trong integration.

### Task 4: repo, service, route

- Files: `contract.repo.ts`, `contract.service.ts`, `contracts.controller.ts`, `document.repo.ts`, `document.service.ts`, `documents.controller.ts`, `contract.dto.ts`, `document.dto.ts`, `contract.http-errors.ts`, `catalog.module.ts`, `test/support/api-coverage-manifest.ts` (+7), `test/e2e/api-inventory.e2e-spec.ts` (133 → 140), `test/e2e/document.e2e-spec.ts`, `test/integration/document-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: bảy operation đúng bảng HTTP; mọi AC trong ma trận; không URL ký nào ở CSDL, Audit Trail hay log.
- Verify: e2e + integration; đột biến (bỏ kiểm đuôi tệp, bỏ kiểm kích thước, cho vai khác chọn mục đích, tệp chưa gắn thấy bởi người khác, lưu URL, bỏ kiểm khớp ở bước hoàn tất, cho gắn hai lần, quên kiểm vai lúc mở, thời hạn liên kết sai) làm đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này, `g3-downstream-finance-integration` (điểm nối: hóa đơn, Người duyệt chi mở tệp), `g4-device-dependent-features` (bản ký).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm bảy operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | đang triển khai         |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
