# Spec: qd103-department-effective-year — phòng mới chỉ tạo trong kỳ lập ngân sách năm sau, hiệu lực 01/01 năm sau

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W2 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.1`, `FR-5.15`(0)(1)(6); `QĐ-104e`(3), `QĐ-106k`, `QĐ-108e`, `QĐ-87g`; quy trình v1.7
  mục 4.4, 4.9; `US-06-15` AC-16; `US-06-19` AC-4), BE `d9c46552`. Ledger: L1-12; luật R-I05 (vế phòng mới), R-I10.
  Câu tạm chọn mới (đề xuất, xem REVISION-NOTES W2): ngoại lệ khởi tạo, một người hai nhiệm kỳ.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (xem tracker §5 về hình thức hạng mục).
- [Kế hoạch](plan.md).

## Business outcome

Super Admin tạo phòng mới chỉ khi kỳ lập ngân sách của **năm sau** (`Y+1`, `Y` = năm hiện tại theo múi giờ tổ chức) đã mở
và **chưa từng phát hành B2**; phòng có **ngày hiệu lực 01/01/`Y+1`**, chưa nhận nhân viên tới ngày đó, được chia Trần
phòng của năm `Y+1`. Trưởng phòng được gán cho phòng đó (nhiệm kỳ từ 01/01) làm **đủ việc B3** trước ngày hiệu lực: nộp,
xem, đính kèm, rút, nộp lại `BM-10`, đọc `budgetMine` — khi Finance đã liên kết Cost Center. Ngoài cửa sổ (kể cả giữa năm
khi kỳ năm hiện tại chưa phát hành) tạo phòng bị từ chối — trừ lúc khởi tạo hệ thống.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W2), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `organization` sở hữu ngày hiệu lực và luật tạo phòng; `budgets` trả cửa sổ tạo phòng qua Hook
  (organization ở tầng thấp hơn) và sở hữu phép tra _trưởng phòng của (Cost Center, năm)_.
- Boundaries: 1 cột mới `departments.effective_from`; `departmentCreate` thêm điều kiện; xếp phòng lần đầu/điều chuyển và
  gán trưởng phòng kiểm ngày hiệu lực; `budgets` thay phép tra trưởng phòng ở mọi điểm B3; luật chọn phòng chia Trần thêm
  ngày hiệu lực.
- Not larger: kỳ lập ngân sách ở `qd103-budget-cycle-ceilings`; MF-3 điều chuyển ngoài phạm vi (chỉ thêm kiểm ngày); nhắc
  Finance liên kết Cost Center (`QĐ-108e`) ở job của `qd103-budget-baseline-annual-check`.
- Not smaller: tạo phòng và làm B3 cho phòng mới là một ca của `MF-4` (B1 → B3).
- Siblings: `qd103-budget-cycle-ceilings`, `qd103-budget-baseline-annual-check`.
- Scope map: n/a

## Primary Story/AC

| Story | AC    | Coverage | Phần còn lại thuộc                           |
| ----- | ----- | -------- | -------------------------------------------- |
| —     | L1-12 | n/a      | gỡ chặn `qd103-budget-baseline-annual-check` |

## Supporting references

`US-06-15` AC-16; `FR-3.1`; `QĐ-104e`(3): _Super Admin chỉ tạo phòng mới trong kỳ lập ngân sách (trước B2), phòng có hiệu
lực từ 01/01 năm sau … giữa năm không tạo phòng mới … ngoại lệ duy nhất là lúc khởi tạo hệ thống (`SBF-01`)_. `QĐ-106k`,
`FR-5.15`(1): trưởng phòng được gán cho phòng mới lập và nộp `BM-10` trước ngày hiệu lực, rút được, đính kèm tài liệu.
`QĐ-108e`: phòng mới cần Cost Center trước khi nộp `BM-10`.

## Explicit out of scope

Ngừng phòng (`QĐ-106h`(3), MF-3); đổi tên/sửa hồ sơ phòng giữ nguyên; tạo phòng ở đường cài đặt
(`OrganizationApi.createDepartment` của `installation`, seed) giữ nguyên — đó là khởi tạo.

## Dependencies and blockers

`qd103-budget-cycle-ceilings` (bảng kỳ, `first_published_at`, hàm `ceilingDepartments`).

## Ownership: module, data, API

- Cột `departments.effective_from date NOT NULL`. Backfill = `min(created_at::date theo múi giờ tổ chức, min valid_from của
placement vào phòng, min valid_from của nhiệm kỳ trưởng phòng)` để dữ liệu effective-dated cũ không mâu thuẫn.
- `organization/public/organization.extension-points.ts`: Hook `DepartmentCreationWindowHook`
  (`organization.department-creation-window`), chữ ký `(tx: DbTx, organizationId: string, today: BusinessDate) =>
Promise<{ kind: 'OPEN'; effectiveFrom: BusinessDate } | { kind: 'CLOSED' } | { kind: 'NO_CYCLE_YET' }>`; `budgets` bind
  trong `budgets/cycle/department-creation-window.listener.ts` (đọc kỳ `FOR SHARE` trong `tx`). Hook chỉ gọi ở use case
  `departmentCreate` (`DepartmentService` của `organization-http.module`, chỉ graph `AppModule` — có binder); không gọi ở
  `installation`. Không có giá trị thay thế (ADR-0019, gate `extension-wiring`).
- `departmentCreate`: `OPEN` ⟹ `effectiveFrom` của hook; `CLOSED` ⟹ 409 `DEPARTMENT.OUTSIDE_BUDGET_PERIOD`; `NO_CYCLE_YET`
  (tổ chức chưa có kỳ nào — TẠM CHỌN ngoại lệ khởi tạo) ⟹ hiệu lực hôm nay. Response phòng thêm `effectiveFrom`.
- Xếp phòng lần đầu (`organization/employee`) và điều chuyển MF-3 (`personnel/transfer`): ngày hiệu lực < `effective_from`
  của phòng đích ⟹ 422 `DEPARTMENT.NOT_YET_EFFECTIVE`.
- Gán trưởng phòng (`department-head.service.ts`) cho phòng chưa hiệu lực: nhiệm kỳ phải bắt đầu đúng `effective_from`
  (sớm hơn ⟹ 422 `DEPARTMENT.NOT_YET_EFFECTIVE`); luật _trưởng phòng là thành viên_ kiểm vào ngày bắt đầu nhiệm kỳ (đã có).
- `budgets/budget/budget-facts.service.ts`: thay `headedUnit(employee, today)` ở mọi điểm B3 bằng
  `headedUnitsFor(employeeId, year, today)` = phòng người đó làm trưởng phòng hôm nay **cộng** phòng chưa hiệu lực có nhiệm
  kỳ của người đó bắt đầu `effective_from = 01/01/year`; `requireHeadFor(employeeId, costCenterId, year, today)` cho thao
  tác trên một đề xuất. Một người có hai đơn vị cho cùng năm (trưởng phòng A hiện tại, phòng mới B từ 01/01): thao tác không
  có đề xuất (`budgetProposalSubmit`, `budgetMine`) nhận `costCenterId` tùy chọn — thiếu khi có > 1 ⟹ 422
  `BUDGET.COST_CENTER_REQUIRED` (TẠM CHỌN). Điểm dùng: `proposal-sender.service.ts`, `proposal.service.ts`,
  `proposal-view.service.ts`, `attachment/{budget-attachment-declaration, budget-attachment-link,
budget-attachment-query}.service.ts`, `budget-view/budget-view.service.ts`.
- `budgets/cycle` `ceilingDepartments`: thêm `effective_from ≤ 31/12/year` (phòng mới 01/01/`Y+1` thuộc kỳ `Y+1`, không thuộc kỳ `Y`).

## Behavior and design

1. Hôm nay 20/09/2026, kỳ 2027 mở và chưa từng phát hành ⟹ tạo phòng 201, `effectiveFrom = 2027-01-01`. Kỳ 2027 đã từng phát
   hành (kể cả đang bỏ phát hành để sửa) ⟹ 409. Không có kỳ 2027 mà tổ chức đã có kỳ khác (vd. chỉ kỳ 2026 chưa phát hành)
   ⟹ 409 — kỳ năm hiện tại **không** mở cửa sổ (giữa năm không tạo phòng).
2. Tổ chức chưa có kỳ nào ⟹ tạo được, hiệu lực hôm nay (khởi tạo `SBF-01`).
3. Phòng chưa hiệu lực: không nhận nhân viên (422); trưởng phòng gán được với nhiệm kỳ từ `effective_from`.
4. Phòng chưa hiệu lực không có thành viên nên không xuất hiện ở định tuyến Request; kiểm tra ngân sách không đổi.
5. Trưởng phòng phòng mới chưa có Cost Center ⟹ nộp 409 `FINANCE.SETUP_INCOMPLETE` (giữ); Finance được nhắc bởi job sibling.
6. Transaction: tạo phòng gọi hook trong cùng `tx` (đọc kỳ `FOR SHARE`) nên phát hành song song xếp hàng, không lọt.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                               | Cấp test    | Kết quả mong đợi                                                       | Bằng chứng sau implement |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- | ------------------------ |
| R-I10          | kỳ năm sau chưa từng phát hành; đã phát hành; đã phát hành rồi bỏ phát hành; tổ chức chưa có kỳ nào               | integration | 201 hiệu lực 01/01 / 409 / 409 / 201 hiệu lực hôm nay                  |                          |
| AC-16 (DA2-01) | chỉ có kỳ năm hiện tại chưa phát hành, không có kỳ năm sau                                                        | integration | 409 `OUTSIDE_BUDGET_PERIOD`                                            |                          |
| R-I10          | response `departmentCreate`/`departmentGet`                                                                       | http        | có `effectiveFrom`                                                     |                          |
| R-I10          | xếp nhân viên lần đầu vào phòng chưa hiệu lực với ngày < / = `effective_from`                                     | http        | 422 `NOT_YET_EFFECTIVE` / 201                                          |                          |
| R-I10          | điều chuyển MF-3 vào phòng chưa hiệu lực với ngày < / = `effective_from`                                          | integration | 422 / thành công                                                       |                          |
| R-I10          | gán trưởng phòng phòng mới từ hôm nay / từ 01/01                                                                  | http        | 422 / 200                                                              |                          |
| concurrency    | tạo phòng song song phát hành kỳ năm sau                                                                          | integration | hoặc tạo trước rồi phát hành báo thiếu Trần phòng mới, hoặc tạo bị 409 |                          |
| R-I05          | trưởng phòng phòng mới nộp `BM-10` năm sau khi có Cost Center / chưa có                                           | integration | 201 / 409 `FINANCE.SETUP_INCOMPLETE`                                   |                          |
| R-I05 (DA2-09) | trưởng phòng phòng mới xem đề xuất, đính kèm, tải tài liệu, rút, nộp lại khi bị trả, đọc `budgetMine` trước 01/01 | integration | 200/201 mọi ô                                                          |                          |
| R-I05          | người là trưởng phòng A và được gán phòng mới B: nộp năm sau không `costCenterId` / có                            | http        | 422 `COST_CENTER_REQUIRED` / 201                                       |                          |
| R-I05          | trưởng phòng phòng mới nộp cho năm hiện tại                                                                       | http        | 403 `BUDGET.NOT_YOUR_COST_CENTER`                                      |                          |
| QT 4.3         | kỳ năm hiện tại `ceilingDepartments` khi có phòng mới hiệu lực năm sau                                            | unit        | không gồm phòng mới                                                    |                          |
| migration      | phòng cũ có placement trước ngày tạo phòng                                                                        | integration | `effective_from` = ngày placement sớm nhất                             |                          |

## Definition of Done

- [ ] Test matrix xanh; `pnpm arch:check`, `pnpm test:gates` (extension-wiring) xanh với hook mới; README `organization`,
      `budgets` cập nhật (cửa sổ tạo phòng, ngoại lệ khởi tạo, phép tra trưởng phòng theo năm).
- [ ] Kiểm tra nhanh tracker §4.5; `pnpm check`, full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W2. Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W2 (DA2-01, 02, 09, 10, 11, 12, 13; luật bỏ sót 1, 8): cửa sổ = kỳ `Y+1` chưa từng phát
hành, hook kiểu union có `tx` chỉ ở `departmentCreate`, bỏ _chưa bind ⟹ từ chối_, phép tra trưởng phòng theo (Cost Center,
năm) cho mọi việc B3, backfill theo placement/nhiệm kỳ, thêm test và file cụ thể; ngoại lệ khởi tạo và một người hai nhiệm
kỳ là câu tạm chọn; nhắc Finance liên kết Cost Center chuyển sang job của `baseline-annual-check`.
