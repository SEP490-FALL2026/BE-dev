# Plan: lát G2 — checklist khởi tạo (bước 1)

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Các bước nhỏ

- [x] **Bước 1 — Facade.** `OrganizationService.getOnboardingFacts` (`CostCenterRepo.countFreeUnits`, `DepartmentRepo.countActiveDepartments/countEmployees`); `EmployeeImportService.latestImport` (`findLatestKept`); `DataImportModule` export `EmployeeImportService`.
- [x] **Bước 2 — Module.** `src/modules/onboarding/` (`onboarding.service.ts`, `onboarding.controller.ts`, `onboarding.module.ts`); `AppModule`.
- [x] **Bước 3 — Test.** unit `onboarding.service.spec.ts` (9); e2e `onboarding.e2e-spec.ts`; integration `onboarding-http.integration-spec.ts` (7); manifest API.
- [x] **Bước 4 — Tài liệu.** `pnpm openapi:export`, roadmap, bảng phủ.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC           | Revision / môi trường             | Kết quả thực chạy                | Giới hạn / việc còn lại |
| ---------------------------- | --------------------------------- | -------------------------------- | ----------------------- |
| `pnpm test`, `pnpm test:e2e` | `e833092` + cây làm việc, Windows | PASS (xem "Cổng cuối" ở roadmap) | —                       |
| `jest … onboarding-http`     | như trên, PostgreSQL 17 Docker    | 7 test PASS                      | Bước 2 → 5 chờ G3/G4/G7 |

- [x] AC trong scope có bằng chứng; spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
