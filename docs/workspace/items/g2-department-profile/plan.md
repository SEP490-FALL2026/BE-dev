# Plan: lát G2 — hồ sơ phòng ban, trưởng phòng có hiệu lực, vai Manager suy ra

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). PR: chưa có. Remote CI chưa chạy.

## Trước khi code

Đã đọc `AGENTS.md`, `ARCHITECTURE.md`, rules, spec G0 (I-2, I-3, giao thức khóa), lát G2 đầu và lát Cost Center. Điều kiện dừng: cần `OrganizationModule` import `identity-access` (vòng phụ thuộc) ⟹ dừng; đã giải bằng cách chỉ lớp HTTP gọi facade identity.

## Các bước nhỏ

- [x] **Bước 1 — Dữ liệu.** `prisma/models/organization.prisma` (phòng, giai đoạn trưởng phòng, dự án); migration `20261016160000_department_profile` (ràng buộc và trigger T-22); `PRISMA_MODEL_OWNER`.
- [x] **Bước 2 — Facade và vai suy ra.** `OrganizationService.businessToday/getHeadedDepartment/isDepartmentHead`; `IdentityAccessService.inspectEmployeeAccount/findUsableItAdminEmployeeIds`; `resolveEffectiveRoles(direct, facts)` + `JwtAccessTokenVerifier` đọc `MANAGER` mỗi request. Unit `account-policy.spec`.
- [x] **Bước 3 — Phòng, trưởng phòng, dự án.** `department.repo.ts`, `department.service.ts`, `project.service.ts`, `departments.controller.ts`, `projects.controller.ts`, `dto/department.dto.ts`, `errors/department.errors.ts`, ánh xạ lỗi; lý do mới `DEPARTMENT_INACTIVE` trong validator T-16.
- [x] **Bước 4 — Test.** e2e `departments.e2e-spec.ts`; integration `departments-http.integration-spec.ts` (44 test); manifest API; đột biến kiểm tra test bắt được lỗi.
- [x] **Bước 5 — Contract, tài liệu.** `pnpm openapi:export`, `AGENTS.md`, `ARCHITECTURE.md`, roadmap, bảng phủ.

Rollback: Prisma không có migration ngược; code cũ bỏ qua bảng/cột mới. Sửa tiến bằng migration mới.

## Kiểm chứng và bàn giao

Chạy từ gốc BE; DB dev Docker `localhost:5433`, DB integration Docker `127.0.0.1:55432` (role `ci_integration`).

| Lệnh / kiểm tra AC                                                | Revision / môi trường             | Kết quả thực chạy                                                                                                    | Giới hạn / việc còn lại    |
| ----------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `pnpm test` (unit)                                                | `e833092` + cây làm việc, Windows | PASS (xem "Cổng cuối" ở roadmap)                                                                                     | —                          |
| `pnpm test:e2e`                                                   | như trên                          | PASS gồm `departments`, `api-inventory`                                                                              | —                          |
| `jest --config test/config/jest.integration.cjs departments-http` | như trên, PostgreSQL 17 Docker    | 44 test PASS; hai đột biến (bỏ kiểm Super Admin, bỏ loại trừ Super Admin khỏi vai suy ra) làm 2 test đỏ rồi hoàn lại | Phần chờ G4/G5/G6 xem spec |

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
