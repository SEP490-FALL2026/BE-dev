# Plan: lát G2 — tham số vận hành và ngày nghỉ

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Các bước nhỏ

- [x] **Bước 1 — Định nghĩa tham số (TDD).** `parameter-definitions.spec.ts` đỏ (chưa có module) → `parameter-definitions.ts` xanh: mặc định, miền, ràng buộc chéo N < M.
- [x] **Bước 2 — Dữ liệu.** `prisma/models/operating-parameters.prisma`; migration `20261016180000_operating_parameters` (partial unique một giá trị hiện tại mỗi khóa; unique `(organization_id, date)`); `PRISMA_MODEL_OWNER`.
- [x] **Bước 3 — Module.** `src/modules/operating-parameters/` (repo, `OperatingParametersService`, `NonWorkingDatesService`, controller, DTO, lỗi, `OperatingParametersModule` + `OperatingParametersHttpModule`); `AppModule`.
- [x] **Bước 4 — Test.** e2e `operating-parameters.e2e-spec.ts`; integration `operating-parameters-http.integration-spec.ts` (19 test); manifest API.
- [x] **Bước 5 — Tài liệu.** `pnpm openapi:export`, roadmap, bảng phủ. **Việc nợ cho lát sau:** G5 phải khóa đổi `BUDGET_PERIOD_KIND` khi đã có ngân sách (AC-8); G3 thêm đồng tiền báo cáo kèm khóa (AC-9); G7 thêm thông báo theo dõi và ngưỡng theo ứng dụng (AC-1, AC-2, AC-5).

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                                                                                                                                                                   | Revision / môi trường                          | Kết quả thực chạy                          | Giới hạn / việc còn lại                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `pnpm test`, `pnpm test:e2e`                                                                                                                                                         | `e833092` + cây làm việc, Windows              | PASS (xem "Cổng cuối" ở roadmap)           | —                                           |
| `jest … operating-parameters-http`                                                                                                                                                   | như trên, PostgreSQL 17 Docker                 | 19 test PASS                               | AC-1, 2, 4, 5, 8, 9                         |
| `reporting-currency-http`, `reporting-currency-rates-http` (viết trước route; ba đột biến — bỏ khóa theo giá quy đổi, bỏ khóa theo tỷ giá, nhận đồng tiền không hỗ trợ — đều làm đỏ) | 20/10/2026, cây làm việc, PostgreSQL 17 Docker | 7 test xanh; e2e `reporting-currency` xanh | AC-9 đã làm; AC-1, 2, 4, 5, 8 vẫn chờ G5/G7 |

- [x] AC trong scope có bằng chứng; spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
