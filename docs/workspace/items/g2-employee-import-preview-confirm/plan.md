# Plan: lát G2 — import nhân sự: tải lên, xem trước, xác nhận

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `e833092` (nhánh `Bao_Dev`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner (16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026). Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Các bước nhỏ

- [x] **Bước 1 — Phần thuần (TDD).** `csv.spec.ts` + `csv.ts` (RFC 4180, BOM, dấu phân cách, giới hạn, số dòng); `employee-import-rows.spec.ts` + `employee-import-rows.ts` (ánh xạ cột, chấm dòng, so sáu cột).
- [x] **Bước 2 — Dữ liệu.** `prisma/models/data-import.prisma`; migration `20261016200000_employee_import`; `PRISMA_MODEL_OWNER`; facade `organization` (`import-lookup.repo.ts`, `lookupForEmployeeImport`, `lockForEmployeeImport`, `departmentsWithoutHead`); lỗi `EmployeeCodeTakenError`/`EmployeeEmailTakenError` công khai ở `organization.errors.ts`.
- [x] **Bước 3 — Module.** `src/modules/data-import/` (`employee-import.repo.ts`, `employee-import.service.ts`, `employee-imports.controller.ts`, `dto/`, `employee-import.errors.ts`, `data-import.module.ts`); `AppModule`.
- [x] **Bước 4 — Test.** e2e `employee-imports.e2e-spec.ts`; integration `employee-imports-http.integration-spec.ts` (29 test); manifest API; đột biến.
- [x] **Bước 5 — Tài liệu.** `pnpm openapi:export`, roadmap, bảng phủ. **Việc nợ:** `.xlsx`; lưu tệp gốc (`TE-07`); job dọn dòng xem trước; liên kết với người đang giữ seat (G4).

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                                                                                                                                                                                     | Revision / môi trường                          | Kết quả thực chạy                                                                    | Giới hạn / việc còn lại    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `pnpm test`, `pnpm test:e2e`                                                                                                                                                                           | `e833092` + cây làm việc, Windows              | PASS (xem "Cổng cuối" ở roadmap)                                                     | —                          |
| `jest … employee-imports-http`                                                                                                                                                                         | như trên, PostgreSQL 17 Docker                 | 29 test PASS; đột biến bỏ kiểm lỗi thời + kiểm file trùng làm 3 test đỏ rồi hoàn lại | Xlsx, lưu tệp gốc, job dọn |
| `employee-import-seats-http` (viết trước; đỏ 4/4 rồi xanh; ba đột biến — đưa cả người có trong tệp, cả người đã nghỉ vào hàng đợi — làm đỏ) và hai test mô tả hình dạng cũ cập nhật thêm `reviewQueue` | 20/10/2026, cây làm việc, PostgreSQL 17 Docker | 4 test xanh; `employee-imports-http` 38 test xanh                                    | `US-02-02` AC-4 đã làm     |

- [x] AC trong scope có bằng chứng; spec/plan phản ánh implementation cuối.
- [ ] Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
