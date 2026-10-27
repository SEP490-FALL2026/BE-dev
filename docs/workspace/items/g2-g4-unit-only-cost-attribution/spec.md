# Spec: Cost Center chỉ `Unit`; tài khoản dịch vụ thuộc phòng sở hữu (`QĐ-86`)

- Phụ trách: chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `draft`. Owner review: chưa review — cần Owner xem cách migration dữ liệu `COMPANY` (mục _Behavior and
  design_) trước khi chuyển `ready`.
- Nguồn: Docs `72e1480` (BRD v3.53 `FR-3.1`, `FR-5.2`, `FR-9.7` ghi chú, `FR-2.11`, `FR-2.12`; `QĐ-86a`→`QĐ-86c` và hệ
  quả (1), (6), (7); `US-04-09` AC-4, AC-7; `US-03-06` AC-2, AC-19; `US-02-05` AC-7, AC-10; `CERD5-17`), BE `69f4891`.
- Nhóm roadmap: G2 và G4 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- Finding: `BBI-D04` → `BBI-D08`, `BBI-D10` của
  [business-baseline-impact-2026-10-22](../business-baseline-impact-2026-10-22/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, danh mục Cost Center chỉ có loại `Unit`; mọi tài khoản dịch vụ ghi phòng sở hữu và Cost Center `Unit` của
phòng đó; đổi người chịu trách nhiệm chỉ chọn được nhân viên đang làm của phòng sở hữu; phòng còn tài khoản dịch vụ
không ngừng được — kiểm bằng test HTTP và ràng buộc CSDL.

## Sizing decision

- Container: G2 và G4 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: chi phí và tài khoản dịch vụ chỉ quy về Cost Center `Unit` của đúng một phòng; capability
  `organization/cost-center`, `organization/department`, `licensing/assignment`, `data-import/seat-baseline-import`.
- Boundaries: một migration đổi enum `CostCenterKind` và thêm phòng sở hữu cho Assignment dịch vụ; các lệnh ghi
  `cost_centers`, `license_assignments`, `departments` (ngừng), dòng import hiện trạng; HTTP `/cost-centers`,
  `/departments/{id}/deactivate`, `/seat-baseline-imports*`, `/license-assignments/{id}/responsible-changes`,
  `/subscriptions/{id}/cost-allocation` (chỉ enum phản hồi); quyền giữ nguyên.
- Not larger: chuyển tài khoản dịch vụ sang phòng khác có trưởng phòng nhận xác nhận (`US-03-08` AC-10) và Request tài
  khoản dịch vụ (`US-05-21`) là G6/G5; báo cáo cấp công ty là G8.
- Not smaller: gỡ giá trị `COMPANY` khỏi enum là thay đổi nguyên tử ở CSDL — mọi consumer (tạo Cost Center, import hiện
  trạng, đổi người chịu trách nhiệm, phân bổ, ngừng phòng) phải đổi trong cùng revision và rollback cùng nhau; tách ra
  sẽ để code tham chiếu một giá trị enum đã mất hoặc để dữ liệu dịch vụ không có phòng sở hữu.
- Siblings: `g2-cost-center-catalogue`, `g2-department-profile` (lát gốc, giao trước GOV.1), `g4-seat-baseline-import`,
  `g2-downstream-integration`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2), [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC          | Coverage | Phần còn lại thuộc                                                                                         |
| -------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| US-04-09 | AC-4, AC-7  | partial  | AC-1→AC-3, AC-5, AC-6, AC-8→AC-11: `g2-cost-center-catalogue` (giao trước GOV.1)                           |
| US-03-06 | AC-2, AC-19 | partial  | AC-19 vế việc đang mở: `g2-downstream-integration`; AC còn lại: `g2-department-profile` (giao trước GOV.1) |
| US-02-05 | AC-7, AC-10 | partial  | các vế còn lại của AC-1→AC-14: `g4-seat-baseline-import`; AC-11 vế K4: `g4-device-dependent-features`      |

Vế sở hữu ở đây: `US-04-09` AC-4, AC-7 trọn AC; `US-03-06` AC-2 trọn AC, AC-19 vế _tài khoản dịch vụ thuộc phòng_;
`US-02-05` AC-7 vế _thuộc phòng, Cost Center `Unit` tại ngày ghi nhận, `Company` là lỗi dòng_, AC-10 vế _người mới
thuộc phòng sở hữu_ (`QĐ-86c`; câu chữ AC-10 không đổi).

## Supporting references

- `US-04-08` (điều kiện trước: chỉ `Unit`; `QĐ-86` hệ quả (1)) — phân bổ gói tính tiền chung: hành vi tỷ lệ của
  `g3-shared-cost-allocation` giữ nguyên, test và enum phản hồi đổi theo (D08).
- `US-03-06` AC-13 và `US-01-11` (không đổi câu chữ): công cụ đang dùng và tác vụ của tài khoản dịch vụ đọc theo phòng
  sở hữu (`QĐ-86` hệ quả (6); D10).
- `QĐ-43a`, `QĐ-75e`, `QĐ-40d` (đã chú thích theo `QĐ-86`), `INV-01`, `INV-02`, `INV-14b`, `INV-20`; ADR-0005.

## Explicit out of scope

- Chuyển tài khoản sang phòng khác kèm xác nhận trưởng phòng nhận, chia chi phí theo ngày, giữ cam kết ở `Unit` cũ
  (`US-03-08` AC-10, `US-12-13` AC-6) — G6/G8, cần dữ liệu phòng sở hữu do lát này lập.
- Request tài khoản dịch vụ (`US-05-21`) và quy ngân sách theo phòng của Request (`QĐ-86a`) — G5.
- Báo cáo cấp công ty = tổng các phòng + _Chưa phân bổ_ (`QĐ-86` hệ quả (2)) — G8.
- Vế _việc đang mở_ khi ngừng phòng (rà soát, khuyến nghị, xác nhận) — `g2-downstream-integration`.
- Sửa dữ liệu môi trường dùng chung.

## Dependencies and blockers

- Owner review cách xử lý dữ liệu `COMPANY` đã ghi (phương án A/B dưới) — chặn `ready`.
- Nên chạy sau Prompt 08 nếu nó lập hạng mục chạm cùng route; liên kết thay vì làm trùng.
- Migration là task riêng, đi trước code phụ thuộc.

## Ownership: module, data, API

- `organization`: `cost-center/` (DTO, service, types, errors, controller), `department/` (ngừng phòng đọc tài khoản dịch
  vụ qua **port** của `organization` do `licensing` hiện thực — `licensing` đã phụ thuộc `organization`, không tạo vòng;
  đăng ký contract theo [module structure](../../../rules/module-structure.md)), `mappers/organization.http-errors.ts`.
- `licensing/assignment/` (policy và service đổi người chịu trách nhiệm, view công cụ đang dùng), `licensing.types.ts`.
- `data-import/seat-baseline-import/` (`seat-baseline-rows.ts`, `seat-baseline-import.types.ts`).
- `finance/` (`finance.types.ts`) và `catalog/subscription/subscription-allocation.dto.ts` (enum phản hồi).
- Prisma: `prisma/models/organization.prisma` (`CostCenterKind`), `prisma/models/licensing.prisma` (cột phòng sở hữu);
  migration mới; không sửa migration đã merge.
- `openapi.json` qua `pnpm openapi:export`.

## Behavior and design

**Dữ liệu và migration (task đầu):**

1. Thêm cột phòng sở hữu cho Assignment loại `SERVICE` (tên đề xuất `owning_department_id`, FK `departments`), CHECK:
   `SERVICE` ⇔ có phòng sở hữu; `PERSONAL` không có. Ràng buộc (trigger theo ADR-0005): Cost Center của Assignment dịch vụ
   là `Unit` của phòng sở hữu tại `valid_from`. Chuỗi nối (`QĐ-43a`) giữ cùng phòng sở hữu.
2. Backfill Assignment dịch vụ hiện có: phòng sở hữu = phòng có hiệu lực của người chịu trách nhiệm tại `valid_from`
   (`employee_placements`); Cost Center = `Unit` của phòng đó. Không xác định được ⟹ migration dừng kèm danh sách.
3. Cost Center `COMPANY` — **cần Owner chọn khi review spec** (quyết định kỹ thuật, không phải nghiệp vụ mới):
   - **A (đề xuất):** kiểm kê trước; **từ chối chạy** khi còn tham chiếu `COMPANY` không ánh xạ được (dòng phân bổ, Cost
     Center gắn phòng — không thể có do trigger); xóa Cost Center `COMPANY` không còn tham chiếu sau backfill; đổi enum
     sang chỉ `UNIT` (tạo enum mới, đổi kiểu cột, xóa enum cũ trong cùng migration). Lý do: chưa có revision `released`,
     baseline nói `Company` **không** phải Cost Center.
   - **B:** giữ giá trị `COMPANY` làm dữ liệu lịch sử chỉ đọc, chặn tạo/dùng mới bằng CHECK và ứng dụng. Để lại một loại
     mà baseline nói không tồn tại; chỉ chọn nếu Owner cần giữ dữ liệu `COMPANY` ở một môi trường đã dùng.
   - Cả hai: không sửa dữ liệu môi trường dùng chung trong lượt implement; người vận hành chạy kiểm kê chỉ đọc trước.

**HTTP và hành vi:**

- `POST /cost-centers`: chỉ loại `UNIT`; `COMPANY` hay loại khác ⟹ 422 (giữ mã `COST_CENTER.KIND_NOT_SUPPORTED` hoặc
  `VALIDATION_ERROR` — chọn khi `ready`, ghi diff OpenAPI); bộ lọc `kind` của danh sách chỉ còn `UNIT`; mô tả và lỗi bỏ
  `COMPANY`.
- `POST /departments`: lý do từ chối mã không phải `Unit` giữ `NOT_UNIT`/`NOT_FOUND` như hiện hành (`US-03-06` AC-2 —
  `CORP` không còn là Cost Center ⟹ không tìm thấy Cost Center `Unit`).
- Import hiện trạng, dòng `service`: phòng sở hữu = phòng của người chịu trách nhiệm tại ngày ghi nhận; Cost Center suy ra
  là `Unit` của phòng đó; cột Cost Center (nếu có) khác `Unit` đó, kể cả mã `Company` ⟹ lỗi dòng (mã mới, ví dụ
  `COST_CENTER_NOT_OWNING_UNIT`, thay `COST_CENTER_NOT_COMPANY`); thiếu lý do vẫn lỗi.
- `POST /license-assignments/{id}/responsible-changes`: người mới phải là nhân viên đang làm việc **của phòng sở hữu**
  tại ngày hiệu lực ⟹ khác phòng: 422 (mã mới, ví dụ `LICENSE_ASSIGNMENT.RESPONSIBLE_OUTSIDE_OWNING_DEPARTMENT`); Cost
  Center và phòng sở hữu giữ nguyên trên Assignment mới. Chuyển phòng là `US-03-08` AC-10 (G6).
- `POST /departments/{id}/deactivate`: còn Assignment dịch vụ đang hoặc sẽ hiệu lực thuộc phòng ⟹ 409
  `DEPARTMENT.IN_USE` với nhóm thứ ba `details.serviceAccounts` (thêm khóa — đổi wire có tính cộng thêm; ghi khác với lựa
  chọn _không thêm `serviceAccounts`_ của `M-01` cũ, đã bị `QĐ-86c` thay).
- Phân bổ gói tính tiền chung: dòng phân bổ chỉ có thể là `Unit` (hệ quả của enum); `costCenterKind` phản hồi chỉ `UNIT`.
- Công cụ đang dùng của phòng và hàng đợi tác vụ: tài khoản dịch vụ tính theo **phòng sở hữu**, không theo phòng hiện tại
  của người giữ.
- Concurrency: khóa phòng và Assignment như các lệnh ghi hiện hành (`FOR SHARE` Cost Center khi import xác nhận); ngừng
  phòng và đổi người chịu trách nhiệm khóa cùng thứ tự để không lọt tài khoản dịch vụ mới khi đang ngừng.
- Tương thích: FE/Mobile tái sinh client (enum co lại, mã lỗi import đổi, thêm `details.serviceAccounts`).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                                                               | Cấp test               | Kết quả mong đợi                                               | Bằng chứng sau implement                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-04-09` AC-4  | Finance tạo Cost Center loại `COMPANY`, _dự án_, tên _Chưa phân loại_                                             | integration            | 422, không bản ghi                                             | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| `US-04-09` AC-7  | tạo phòng với `Unit` đã gắn / `Unit` trống                                                                        | integration            | từ chối / thành công                                           | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| `US-03-06` AC-2  | tạo phòng với mã chưa có, mã `CORP`, `Unit` đã gắn phòng khác                                                     | integration            | ba lý do đúng, không phòng nào                                 | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| `US-03-06` AC-19 | ngừng phòng còn `ops-bot` thuộc phòng; sau khi `ops-bot` kết thúc chuỗi                                           | integration            | 409 có `serviceAccounts`; sau đó thành công                    | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| `US-02-05` AC-7  | dòng `ci-bot` của `E2` (`P-DES`) không cột Cost Center; ghi `CC-DES`; ghi `CC-FIN`; ghi mã `Company`; thiếu lý do | unit + integration     | Assignment thuộc `P-DES`, `CC-DES`; hai ca sau là lỗi dòng     | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| `US-02-05` AC-10 | đổi sang `E5` cùng phòng; sang `E6` phòng khác; `E5` đã nghỉ                                                      | integration            | nối chuỗi cùng phòng/Cost Center; khác phòng 422; nghỉ 422     | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| migration        | Assignment dịch vụ trỏ `COMPANY` có/không có placement; dòng phân bổ trỏ `COMPANY`                                | integration (CSDL tạm) | backfill đúng `Unit`; dừng kèm danh sách khi không ánh xạ được | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| ràng buộc CSDL   | ghi thẳng Assignment dịch vụ không phòng sở hữu / Cost Center không phải `Unit` của phòng                         | integration            | CSDL từ chối                                                   | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| D08              | khai báo phân bổ có Cost Center không tồn tại / ngừng dùng                                                        | integration            | như hiện hành; không còn ca `COMPANY`                          | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |
| D10              | người giữ `ci-bot` điều chuyển (fixture) — công cụ đang dùng của phòng sở hữu                                     | integration            | `ci-bot` hiện ở phòng sở hữu                                   | xanh — `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` |

Test đang ghim hành vi cũ phải đổi cùng lát (không xóa ca từ chối): `cost-centers-http`, `organization.integration-spec`,
`departments-http`, `seat-baseline-contracts`, `seat-baseline-rows.spec`, `license-assignment-http`,
`license-assignment-constraints`, `seat-baseline-import-http`, `seat-baseline-closing-http`, `department-tools-http`,
`employee-import-seats-http`, `cost-allocation-http`, `cost-allocation-constraints`, `cost-allocation.policy.spec`,
`dev-seed-plan.spec`, fixture `test/support/seat-baseline-facts.ts`, `test/support/seat-baseline-harness.ts`.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập theo Prompt 07. Chưa code, chưa review, chưa nghiệm thu.

23/10/2026 (Prompt 10 — xử lý tồn đọng G0→G4): `BBI-D04`→`D08`, `D10` hiện thực theo **phương án A** (kiểm kê rồi bỏ `COMPANY`): migration `20261022120000_cost_centers_unit_only` (cột `owning_department_id`, bù từ giai đoạn phòng của người phụ trách ở ngày bắt đầu, dừng có danh sách khi không xác định được hoặc còn tham chiếu `COMPANY`, enum chỉ còn `UNIT`, trigger/CHECK ràng buộc Cost Center = Unit của phòng sở hữu). Ứng dụng: tài khoản dịch vụ thuộc phòng của người phụ trách (import lấy phòng/Unit từ ngày chốt; cột `cost_center_code` chỉ được là chính Unit đó), đổi người phụ trách phải cùng phòng (`RESPONSIBLE_INVALID` với `details.problem = OUTSIDE_OWNING_DEPARTMENT`), phòng không ngừng được khi còn tài khoản dịch vụ mở (`DEPARTMENT.IN_USE` thêm `serviceAccounts`, `totalServiceAccounts`), công cụ của phòng gồm tài khoản dịch vụ phòng sở hữu, sắp theo `validFrom, id` (không theo mã nhân viên). Áp dụng **mặc định do spec khuyến nghị**, không phải quyết định của Owner: Owner chưa review; nếu Owner chọn khác thì đổi ở đây. Kiểm chứng: `unit-only-cost-attribution` (5), `license-assignment-constraints`, `license-assignment-http`, `department-tools-http`, `departments-http`, `cost-centers-http`, `cost-allocation-http`, `seat-baseline-*`, `employee-import-seats-http` — xanh trên cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026. Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`. Giới hạn: Owner chọn A/B chưa có (áp mặc định A). Chuyển tài khoản dịch vụ sang phòng khác chưa làm (G6). Chưa commit khi viết dòng này, chưa remote CI, chưa Owner review, chưa nghiệm thu: không có gì là `accepted`; đỏ-trước của từng test không được ghi lại.

**Không hoàn tác được (`DB-05`, bổ sung 23/10/2026, Prompt 29):** `20261022120000` tắt trigger lịch sử để backfill, ghi đè `cost_center_id` của tài khoản dịch vụ không có Audit Trail, xóa cứng mọi Cost Center `COMPANY` (kể cả `INACTIVE`) và thu hẹp enum `CostCenterKind` về `UNIT`. Chỉ bản sao lưu deploy tạo trước `migrate deploy` giữ lại dữ liệu đó (ranh giới khôi phục: [containers](../../../guides/containers.md#backup-before-production-migrations)). Ngoại lệ trước phát hành của `DB-15` **không** dùng: Owner chọn `B-FORWARD` vì VPS thử nghiệm đã áp checksum gốc; sửa tiếp ở [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F01, F20 — liên kết phía Cost Center; phòng sở hữu của Assignment theo thuê bao.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
