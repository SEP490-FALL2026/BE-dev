# Plan: lát G2 — danh mục Cost Center do Finance quản lý

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Trước khi code

Đã đọc `AGENTS.md`, `ARCHITECTURE.md`, API/database rules, test guide, spec G0 (I-3, giao thức khóa) và lát G2 đầu (mẫu controller/service/repo của `organization`). Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [x] **Bước 1 — Dữ liệu.** `prisma/models/organization.prisma` (`CostCenterStatus`, `status`, `updatedAt`, `deactivatedAt`); migration `20261016150000_cost_center_lifecycle` (CHECK nhất quán, trigger T-18). `pnpm prisma:validate`, áp lên PostgreSQL Docker.
- [x] **Bước 2 — Quy tắc tên.** `cost-center-name.ts` (mã, tên giữ chỗ) + `cost-center-name.spec.ts`.
- [x] **Bước 3 — Repo, service, controller, DTO.** `cost-center.repo.ts`, `cost-center.service.ts`, `cost-centers.controller.ts`, `dto/cost-center.dto.ts`, `errors/cost-center.errors.ts`, ánh xạ lỗi trong `organization.http-errors.ts`; đăng ký ở `OrganizationModule` (repo) và `OrganizationHttpModule` (controller, service). Lý do mới `DEPARTMENT_COST_CENTER_INACTIVE` trong validator T-16 + đọc lại trạng thái Cost Center sau khóa phòng (T-17).
- [x] **Bước 4 — Test.** e2e `test/e2e/cost-centers.e2e-spec.ts` (401/403/422/DELETE 404); `test/integration/cost-centers-http.integration-spec.ts` (AC-1 → AC-6, AC-10/11, audit, đồng thời); manifest API.
- [x] **Bước 5 — Contract, tài liệu.** `pnpm openapi:export`, `AGENTS.md`, `ARCHITECTURE.md`, roadmap, bảng phủ ở `items/README.md`.

Rollback: Prisma không có migration ngược; code cũ bỏ qua cột mới. Điều kiện dừng: kiểm trigger ảnh hưởng lệnh khởi tạo (đã chạy hồi quy `installation*`).

## Kiểm chứng và bàn giao

Chạy từ gốc BE; DB dev Docker `localhost:5433`, DB integration Docker `127.0.0.1:55432` (role `ci_integration`).

| Lệnh / kiểm tra AC                                                 | Revision / môi trường             | Kết quả thực chạy                                                        | Giới hạn / việc còn lại                      |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `pnpm exec jest src/modules/organization`                          | `e833092` + cây làm việc, Windows | 44 test PASS                                                             | —                                            |
| `pnpm test:e2e`                                                    | như trên                          | 8 suite, 132 test PASS (gồm `cost-centers`, `api-inventory`)             | —                                            |
| `jest --config test/config/jest.integration.cjs cost-centers-http` | như trên, PostgreSQL 17 Docker    | 29 test PASS; đột biến (tắt kiểm "còn người") làm 2 test đỏ rồi hoàn lại | —                                            |
| `pnpm typecheck`, `pnpm lint`                                      | như trên                          | PASS                                                                     | Cổng cuối của cả đợt G1/G2 chạy ở cuối phiên |

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
