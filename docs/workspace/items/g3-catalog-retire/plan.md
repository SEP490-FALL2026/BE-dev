# Plan: ngừng sử dụng ứng dụng bị chặn tới khi dọn sạch quyền và thuê bao (`US-04-01` phần ngừng)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, 21/10/2026; cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, ADR-0013 (mục 4), `US-04-01` (AC-8, AC-9, AC-14 và AC khác cùng Story), `application.service.ts` và `application.repo.ts` (trạng thái `catalogStatus`, Business Owner hiện tại), `application-owner.service.ts` (lịch sử Business Owner), `g3-subscription-seat-guards` (người đọc chiếm chỗ), `g4-provisioning-queue-manual` (Assignment `Thất bại`). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu xác nhận và trạng thái ngừng — xong

- Files: `prisma/models/catalog.prisma` (`ApplicationRetirementConfirmation`, cột của `Application`), quan hệ ngược ở `organization.prisma`, migration `20261020240000_catalog_application_retirement`, `test/gates/architecture-boundaries.gate-spec.ts`, `test/integration/catalog/application-retirement-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-entry`.
- Acceptance: CHECK `RETIRED ⟺ retired_at`, bản ghi xác nhận bất biến và không xóa, ứng dụng đã ngừng không đổi lại, khóa ngoại, nội dung không rỗng.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: chính sách thuần — xong

- Files: `src/modules/catalog/catalog-entry/retirement/application-retirement.policy.ts`, `application-retirement.policy.spec.ts`, `application.errors.ts`.
- Depends on: Task 1.
- Acceptance: kiểm Business Owner hiện tại và còn làm việc, nội dung xác nhận, thứ tự quyết định (đã ngừng, thiếu xác nhận, bị chặn), tập thuê bao chặn (`TERM` còn hạn hoặc chưa có ngày kết thúc, không tính mua vĩnh viễn).
- Verify: `pnpm exec jest src/modules/catalog/catalog-entry` đỏ trước, xanh sau.

### Task 3: repo, service, route — xong

- Files: `application-retirement.repo.ts`, `application-retirement.service.ts`, `application-retirement.dto.ts`, `application-retirement.controller.ts`, `application.http-errors.ts`, `catalog.module.ts`, `test/support/api-coverage-manifest.ts` (+3), `test/http/platform/api-inventory.http-spec.ts` (130 → 133 khi lát này vào; hiện tổng 143 do các lát sau), `test/http/catalog/application-retirement.http-spec.ts`, `test/integration/catalog/application-retirement-http.integration-spec.ts`.
- Depends on: Task 2 và `g3-subscription-seat-guards` Task 2 (người đọc `openAssignmentsOfPlans`).
- Acceptance: ba operation đúng bảng HTTP; mọi AC trong ma trận; không tác vụ nào được tạo.
- Thay đổi thực tế ở lượt 21/10/2026: `markRetired` chuyển vào `ApplicationRepo` (một repo ghi `applications`); xác nhận khóa nhân viên `FOR SHARE` (INV-06); thêm test `GET …/retirement` của ứng dụng đã ngừng, xem trước import làm trước khi ngừng không xác nhận được sau đó, và hai test khóa giữ tất định (`test/support/lock-wait.ts`); mô tả OpenAPI nêu mã lỗi mới.
- Verify: e2e + integration; đột biến (bỏ kiểm xác nhận, không kiểm Business Owner hiện tại, đếm cả Assignment đã kết thúc, bỏ thuê bao `TERM`, đếm mua vĩnh viễn, tự tạo tác vụ, bỏ khóa ứng dụng) làm đỏ.

### Task 4: tài liệu và gate cuối — xong

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, `g3-catalog-entry` (ghi phần ngừng đã có), plan/spec này.
- Depends on: Task 3.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                    | Revision / môi trường                                                                                       | Kết quả thực chạy                                  | Giới hạn / việc còn lại                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                                                                                                                          | 21/10/2026, cây làm việc chưa commit trên `5f3b2b3` (nhánh `Bao_dev_be`); Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test | Không có remote CI; chưa chạy trên môi trường dùng chung                                                              |
| `pnpm test:e2e`                                                                                                                                                                                                                                       | như trên                                                                                                    | 32 suite, 811 test xanh                            | Không cần DB; `api-inventory` đếm 143 operation                                                                       |
| `pnpm test:integration`                                                                                                                                                                                                                               | như trên; PostgreSQL 17 trong Docker `127.0.0.1:55432`                                                      | 97 suite, 1307 test xanh                           | Chạy trên một DB cô lập, không phải môi trường dùng chung                                                             |
| Từng test mới của lượt 21/10 chạy riêng: `INV-06: a confirmation waits for a departure…`, `a retirement waits for a grant that is being made…`, `GET …/retirement` của ứng dụng đã ngừng, xem trước import trước khi ngừng không xác nhận được sau đó | như trên                                                                                                    | xanh khi chạy riêng từng test (21/10/2026)         | Hai test khóa tất định dùng `test/support/lock-wait.ts`                                                               |
| Đột biến: bỏ khóa `plans` trong `retire`; bỏ khóa nhân viên khi xác nhận                                                                                                                                                                              | như trên                                                                                                    | test đỏ, rồi khôi phục mã và xanh lại              | Ghi hai đột biến của lượt 21/10; kết quả các đột biến ghi ở Task 3 gốc (20/10) không được xác nhận lại trong lượt này |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (giới hạn ở spec, mục Changes and acceptance).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
