# Plan: ghi nhận hiện trạng seat khởi tạo (`US-02-05`, `US-07-01` AC-14)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0005, ADR-0007, ADR-0013, `US-02-05` (AC-1→AC-14), `US-07-01` AC-14, `US-04-12` (để tách vế K4), `INV-01`/`INV-02`/`INV-07`, và mã `data-import/employee-import` (tải lên, xem trước, xác nhận một lần, khóa idempotency, xét lại dưới khóa), `employee_placements` (khoảng nửa mở và ràng buộc loại trừ), `catalog/subscription` (khóa thuê bao), `organization` facade (nhân viên, Cost Center). Hướng phụ thuộc `licensing → catalog → finance`, `data-import → licensing`. DB integration Docker `127.0.0.1:55432`. Không blocker; K4 và khóa thuộc `g4-device-dependent-features`.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `license_assignments` và `seat_baseline_states`

- Files: `prisma/models/licensing.prisma`, `prisma/models/catalog.prisma`/`organization.prisma` (quan hệ ngược), migration `20261020190000_licensing_assignments`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/license-assignment-constraints.integration-spec.ts`.
- Depends on: `g3-subscription-purchase`, `g3-plan-declaration`, `g2-cost-center-catalogue`.
- Acceptance: CHECK loại/lý do/Cost Center/ngày; loại trừ chồng lấn cá nhân và định danh trùng; trigger sức chứa `INV-01` (kể cả hai giao dịch song song), `INV-07`, đúng gói của thuê bao, đóng khởi tạo; dòng `HANDOVER`/`REQUEST` không cần import.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: dữ liệu `seat_baseline_imports` và dòng

- Files: `prisma/models/data-import.prisma`, migration `20261020190100_data_import_seat_baseline`, `PRISMA_MODEL_OWNER`, `test/integration/seat-baseline-import-constraints.integration-spec.ts`.
- Depends on: Task 1.
- Acceptance: trạng thái, khóa idempotency, `baseline_import_id` khóa ngoại, dòng xóa theo lần import.
- Verify: test constraints đỏ trước, xanh sau.

### Task 3: hợp đồng `catalog` và `organization`

- Files: `src/modules/catalog/catalog.service.ts`, `catalog.types.ts`, `catalog.module.ts` (export), `src/modules/organization/organization.service.ts` (`getEmployeesByCodes`, `getCostCentersByCodes`, `getCompanyEmailDomains`), `organization.types.ts` (`EmployeeRecord.employmentType`), repo liên quan, `src/module-graph.spec.ts` (`PUBLIC_CONTRACT_EXPORTS`).
- Depends on: Task 1.
- Acceptance: `resolveSeatTarget`/`lockSeatTarget` trả đúng loại gói và số đã mua, từ chối K4 ở tầng `licensing`; tra cứu theo mã không lộ trường thừa.
- Verify: integration `seat-baseline-contracts` (đỏ trước), `pnpm exec jest src/architecture src/module-graph`.

### Task 4: `licensing` — capability `assignment/` và `seat-baseline/`

- Files: `src/modules/licensing/{licensing.module,licensing.service,licensing.types,licensing.errors}.ts`, `assignment/{assignment.policy,assignment.repo,assignment.service,assignment.types}.ts` (+ `assignment.policy.spec.ts`), `seat-baseline/{seat-baseline.repo,seat-baseline.service}.ts`, `app.module.ts`, `src/architecture-structure.spec.ts` (hợp đồng nội module), `src/module-graph.spec.ts`.
- Depends on: Task 1, Task 3.
- Acceptance: tạo hàng loạt dưới khóa thuê bao, trạng thái đóng khởi tạo, đổi người chịu trách nhiệm một giao dịch, đếm seat, Audit Trail từng Assignment; chuyển `employeeCode`→`id` không nằm ở đây.
- Verify: `pnpm exec jest src/modules/licensing src/architecture src/module-graph`; integration `license-assignment-http`.

### Task 5: `data-import` — capability `seat-baseline-import/`

- Files: `src/core/csv.ts` (chuyển từ `employee-import/csv.ts`) + spec, `src/modules/data-import/seat-baseline-import/{seat-baseline-file,seat-baseline-rows,seat-baseline-import.repo,seat-baseline-import.service,seat-baseline-import.errors,seat-baseline-import.types,seat-baseline-import.dto,seat-baseline-imports.controller,seat-baseline-import.http-errors}.ts` (+ spec của file và dòng), `data-import.module.ts`, `src/architecture-structure.spec.ts`.
- Depends on: Task 2, Task 4.
- Acceptance: đọc tệp, phán xét dòng theo bảng mã lỗi, xem trước lưu dòng, xác nhận một lần có xét lại dưới khóa, hủy, lỗi riêng.
- Verify: `pnpm exec jest src/modules/data-import`; integration `seat-baseline-import-http`.

### Task 6: route của `licensing` và HTTP

- Files: `assignment/{assignment.dto,assignments.controller,assignment.http-errors}.ts`, `seat-baseline/{seat-baseline.dto,seat-baseline.controller}.ts`, `test/support/api-coverage-manifest.ts` (+10), `test/e2e/api-inventory.e2e-spec.ts` (103 → 113), `test/e2e/seat-baseline.e2e-spec.ts`, `test/integration/{license-assignment-http,seat-baseline-http}.integration-spec.ts`.
- Depends on: Task 4, Task 5.
- Acceptance: mười operation đúng bảng HTTP; 401/403/404/409/422 theo vai và tình huống; không `DELETE`; đồng thời hợp lệ; mọi AC trong ma trận.
- Verify: `pnpm test:e2e`, integration; đột biến (bỏ khóa thuê bao, bỏ kiểm sức chứa của policy, bỏ trigger đóng khởi tạo, bỏ so khớp xét lại, bỏ nối chuỗi) làm test đỏ.

### Task 7: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, ADR-0013 (hệ quả), `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 6.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm mười operation; ledger không tăng; `prisma migrate diff` không còn khác biệt.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 4 và Task 6: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ví dụ 70/100, 12/10, 60/40…).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                   | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                                                                                                                         | Giới hạn / việc còn lại                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm exec jest src/core/seat-occupancy src/core/account-identifier src/modules/licensing src/modules/data-import/seat-baseline-import` (đỏ trước từng file: thiếu module; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | seat-occupancy 7, account-identifier 41, licensing 23, seat-baseline-import 39 xanh; sáu đột biến của phán xét dòng (bỏ kiểm sức chứa, chồng lấn cho dòng dịch vụ, so định danh thô, dòng sai chiếm seat, freelancer, ngày cấp tương lai) làm đỏ sau khi bổ sung một test | —                                                  |
| `license-assignment-constraints` (đỏ trước migration: `relation "seat_baseline_imports" does not exist`) và `seat-baseline-import-constraints`                                       | như trên, PostgreSQL 17 Docker             | 25 + 5 test xanh; năm đột biến migration (bỏ khóa trigger sức chứa, chỉ đếm ngày đầu, loại trừ cho cả dòng dịch vụ, bỏ INTERN, bỏ chặn đóng) đều làm đỏ sau khi thêm test ngày sau                                                                                        | CHECK bằng chứng xác nhận siết lại sau khi test đỏ |
| `seat-baseline-contracts` (đỏ trước: thiếu `CatalogService`)                                                                                                                         | như trên                                   | 9 test xanh                                                                                                                                                                                                                                                               | —                                                  |
| `seat-baseline-import-http`                                                                                                                                                          | như trên                                   | 32 test xanh; ba đột biến (bỏ xét lại, che bí mật, …) làm đỏ                                                                                                                                                                                                              | HTTP/tích hợp viết sau mã route, bù bằng đột biến  |
| `license-assignment-http`, `seat-baseline-closing-http`, `seat-baseline-close-http`, `assignment-writes`                                                                             | như trên                                   | 13 + 6 + 3 + 5 test xanh; đột biến bỏ khóa trạng thái, đổi ngày kết thúc, đổi loại, đếm seat đã hết làm đỏ; ánh xạ lỗi CSDL kiểm trên hình dạng lỗi Prisma thật                                                                                                           | —                                                  |
| `pnpm exec jest --config test/config/jest.e2e.cjs seat-baseline api-inventory`                                                                                                       | như trên                                   | 41 + inventory xanh; đột biến nới vai `close` làm 1 test đỏ                                                                                                                                                                                                               | e2e viết sau route, bù bằng đột biến               |
| `prisma migrate diff` migration ↔ schema trên CSDL tạm                                                                                                                               | như trên                                   | không khác biệt                                                                                                                                                                                                                                                           | Chưa có script drift trong `pnpm check`: chạy tay  |
| `pnpm check`                                                                                                                                                                         | như trên (cây cuối)                        | exit 0, 1787 test; lần đầu đỏ: gate kiến trúc (hợp đồng nội module chưa đăng ký, spec dòng > 400 ⟹ tách spec và chuyển fixture sang `test/support`), lint (import thừa, ép kiểu thừa), ba test cũ giả định bảng chưa có hoặc danh sách khóa của nhân viên (đã cập nhật)   | —                                                  |
| `pnpm test:e2e`                                                                                                                                                                      | như trên                                   | 25 suite, 659 test xanh                                                                                                                                                                                                                                                   | —                                                  |
| `pnpm test:integration`                                                                                                                                                              | như trên                                   | 78 suite, 1080 test xanh                                                                                                                                                                                                                                                  | —                                                  |
| `pnpm openapi:export`                                                                                                                                                                | như trên                                   | thêm mười operation (`seatBaselineImport*`, `seatBaselineGet/Close`, `licenseAssignmentList/ChangeResponsible`, `subscriptionSeatUsage`)                                                                                                                                  | FE cần regenerate client                           |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
