# Plan: bộ công cụ chuẩn theo phòng × chức vụ (`US-04-10` phần cấu hình)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, 21/10/2026; cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-10` (AC-1→AC-12) và `US-02-04` AC-5, `QĐ-52e`/`QĐ-58`/`QĐ-62p`/`QĐ-68d`/`QĐ-70b`, các lát `g3-vendor-tax-profile` (mẫu phiên bản bất biến, đầu khóa `FOR UPDATE`), `g2-job-title-catalogue-and-manual-employee` (trạng thái chức vụ), `g2-department-profile` (phạm vi của trưởng phòng), `g4-seat-baseline-import` (Assignment). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu ba bảng bộ chuẩn — xong

- Files: `prisma/models/catalog.prisma`, quan hệ ngược ở `organization.prisma`, migrations `20261020210000_catalog_standard_toolsets` và `20261021110000_catalog_standard_toolset_history_guard` (ba trigger thứ tự lịch sử, thêm ở lượt 21/10/2026), `test/gates/architecture-boundaries.gate-spec.ts`, `test/integration/standard-toolset-constraints.integration-spec.ts`.
- Depends on: `g3-plan-declaration`, `g2-department-profile`, `g2-job-title-catalogue-and-manual-employee`.
- Acceptance: CHECK phiên bản/lý do, unique `(phòng, chức vụ, phiên bản)`, khóa ngoại, trigger bất biến (`55000`).
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 2: policy thuần — xong

- Files: `src/modules/catalog/standard-toolset/standard-toolset.policy.ts`, `standard-toolset.policy.spec.ts`, `standard-toolset.errors.ts`.
- Depends on: Task 1 (lỗi và kiểu dùng chung của capability).
- Acceptance: lý do cắt/rỗng/quá dài, trùng gói, quá 50, tập đã sắp, `sameToolset`.
- Verify: `pnpm exec jest src/modules/catalog/standard-toolset` đỏ trước, xanh sau.

### Task 3: facade `organization` — xong

- Files: `organization.service.ts`, repo phòng và nhân viên (`getDepartmentBrief`, `lockDepartmentShared`, `getEmployeePlacement`).
- Depends on: —
- Acceptance: đọc phòng theo id, khóa `FOR SHARE`, vị trí hiện tại của nhân viên.
- Verify: integration `standard-toolset-http` (qua service).

### Task 4: repo, service, route — xong

- Files: `standard-toolset.{repo,service,dto,http-errors}.ts`, `standard-toolsets.controller.ts`, `catalog.module.ts`, `test/gates/architecture-structure.gate-spec.ts` nếu cần, `test/support/api-coverage-manifest.ts` (+5), `test/http/platform/api-inventory.http-spec.ts` (116 → 121 khi lát này vào; hiện tổng 143 do các lát sau), `test/e2e/standard-toolset.e2e-spec.ts`, `test/integration/standard-toolset-http.integration-spec.ts`.
- Depends on: Task 1, Task 2, Task 3.
- Acceptance: năm operation đúng bảng HTTP; mọi AC trong ma trận; không Assignment/tác vụ nào đổi.
- Thay đổi thực tế ở lượt 21/10/2026: test AC-4 seed một Assignment thật rồi so hàng Assignment và các số đếm trước/sau; ba test `mine` mới; test ràng buộc cho ba trigger của migration `20261021110000`. Các gói được kiểm trước giao dịch (không khóa `FOR SHARE` trong giao dịch), an toàn nhờ khóa ngoại `RESTRICT`.
- Verify: e2e + integration; đột biến (bỏ lý do bắt buộc, bỏ kiểm chức vụ ngừng dùng ở cặp mới, bỏ khóa đầu, cho đọc phòng khác) làm đỏ.

### Task 5: mục gợi ý của checklist — xong

- Files: `onboarding.service.ts` (+ spec), `onboarding.controller.ts`, `catalog.types.ts` (`standardToolsets`), `onboarding-http`.
- Depends on: Task 4.
- Acceptance: `suggestions` sau bước 3, không chặn bước 4.
- Verify: unit đỏ trước, xanh sau; HTTP.

### Task 6: tài liệu và gate cuối — xong

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, `g2-onboarding-checklist` (AC-5), plan/spec này.
- Depends on: Task 5.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm năm operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                     | Revision / môi trường                                                                                       | Kết quả thực chạy                                  | Giới hạn / việc còn lại                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                           | 21/10/2026, cây làm việc chưa commit trên `5f3b2b3` (nhánh `Bao_dev_be`); Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test | Không có remote CI; chưa chạy trên môi trường dùng chung                           |
| `pnpm test:e2e`                                                                                                                        | như trên                                                                                                    | 32 suite, 811 test xanh                            | Không cần DB; `api-inventory` đếm 143 operation                                    |
| `pnpm test:integration`                                                                                                                | như trên; PostgreSQL 17 trong Docker `127.0.0.1:55432`                                                      | 97 suite, 1307 test xanh                           | Chạy trên một DB cô lập, không phải môi trường dùng chung                          |
| Test AC-4 (seed Assignment), ba test `mine` và test ràng buộc `standard-toolset-constraints` của migration `20261021110000` chạy riêng | như trên                                                                                                    | xanh khi chạy riêng từng test (21/10/2026)         | Không có chặn `TRUNCATE`; gói của ứng dụng đã ngừng vẫn được nhận (Q7 / `OQ-B-09`) |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (giới hạn ở spec, mục Changes and acceptance).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
