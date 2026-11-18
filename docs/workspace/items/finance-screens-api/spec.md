# Spec: finance-screens-api — API cho 4 màn Finance (trung tâm chi phí, đề xuất, đã duyệt chi theo đợt, cam kết + hóa đơn)

- Phụ trách: AI theo giao việc Owner (06/11/2026). Thiết kế: `draft` — Owner chốt phạm vi qua câu hỏi 06/11 (xem `## Owner decisions`).
- Nguồn: Docs `60ec6c8`, BE `aeb00f17` (_Quy trình và chính sách theo main flow_ `C-08`, `C-09`, `C-15`, `C-16`; `SBF-11`, `SBF-11a`;
  `QĐ-34b`, `QĐ-49f`, `QĐ-55a`, `QĐ-82l(1)`, `QĐ-97d`, `QĐ-98k`, `QĐ-99j`), BE nhánh `feat/qd96-100-alignment` **sau khi Đợt 1 xong**.
- Yêu cầu FE gốc: `NOTE MD/finance.md`, `NOTE MD/finance-man-4-hoa-don.md` (workspace, ngoài repo BE).
- [Kế hoạch](plan.md) · [Runbook chạy đêm](RUN.md).

## Business outcome

Finance có đủ API cho 4 màn: (1) trung tâm chi phí theo phòng + ô tổng toàn công ty; (2) đề xuất ngân sách — **không đổi BE**;
(3) danh sách _đã duyệt chi theo đợt — chờ hóa đơn_, chỉ đọc; (4+5) danh sách cam kết đang giữ theo phòng, trên mỗi dòng Finance
**ghi hóa đơn** và hệ thống chuyển cam kết thành thực chi. Sau màn 4+5, `spent` ở màn 1 và trong kiểm tra ngân sách là số thật.

## Owner decisions (06/11/2026)

| #   | Quyết định                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Màn 4 gộp vào màn 5 (FE chốt). Hóa đơn **bản tối giản**: Finance ghi tay trên một khoản cam kết; không import CSV, không sao kê (`SBF-07`), hồ sơ sai lệch chỉ là **cờ**, không có luồng điều tra/đóng. Mở lại phần hóa đơn đã hoãn trước đây. |
| D2  | Màn 3 **gom theo đợt**: Finance đọc lô trình duyệt chi (chỉ đọc).                                                                                                                                                                              |
| D3  | Màn 2 giữ đúng Docs (`SoD-8`): Finance lập và gửi phiên bản, Người duyệt chi quyết. Không đổi BE.                                                                                                                                              |
| D4  | Người ghi hóa đơn là **Finance** (`C-16`); IT Admin không ghi hóa đơn/thực chi.                                                                                                                                                                |

## Primary Story/AC

| Story    | AC                                  | Coverage | Phần còn lại thuộc                                                                                                                              |
| -------- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| US-12-01 | AC-1, AC-6, AC-10, AC-13            | partial  | re-pin 11/11/2026 — AC-2→AC-5, AC-7→AC-9, AC-12, AC-14, AC-17: `qd103-budget-vs-actual-report` (`deferred`); AC-11, AC-16: `qd103-budget-views` |
| US-12-02 | AC-4, AC-5, AC-6, AC-8, AC-9, AC-11 | partial  | re-pin 11/11/2026 — AC-1, AC-2, AC-7, AC-13, AC-14: `qd103-purchase-invoice-sbf19` (`deferred`)                                                 |

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ `US-12-01` đổi `full` → `partial` vì Docs `5bb2e6a` thêm AC hoặc hạng mục khác cùng hiện thực khóa của Story này (scope map); phần đã code không đổi.

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ `US-12-02` đổi `full` → `partial` vì Docs `5bb2e6a` thêm AC hoặc hạng mục khác cùng hiện thực khóa của Story này (scope map); phần đã code không đổi.

## Supporting references

`US-06-06` AC-1, AC-4, AC-5, AC-6, AC-9, AC-17 (cam kết thành chi phí — đi cùng `US-12-02` AC-4, chủ G5 vẫn là
`g5-commitment-lifecycle`/`g3-downstream-finance-integration`); `US-06-14` (Finance chỉ đọc lô, màn 3). `NOTE MD/finance.md`, `NOTE MD/finance-man-4-hoa-don.md` (yêu cầu FE); Docs _Quy trình và chính sách theo main flow_ `C-08`,
`C-09`, `C-16`; `SBF-11`, `SBF-11a`; `QĐ-34b`, `QĐ-49f`, `QĐ-97d`, `QĐ-98k`, `QĐ-99j`.

## Sizing decision

- Container: G8 — giao việc Owner 06/11/2026 (4 màn Finance cho FE).
- Mode: grouped-stories
- Outcome and owner: Finance có API cho 4 màn; capability `budgets/budget-view`, `budgets/commitment` (+ hóa đơn),
  `requests/spend-submission`.
- Boundaries: bảng `invoices`, cột `budget_commitments.applied_minor`; API ghi ở `## Ownership: module, data, API`.
- Not larger: CSV hóa đơn, sao kê, hồ sơ sai lệch, dòng _Chưa phân bổ_ (xem `## Explicit out of scope`).
- Not smaller: hóa đơn và công thức `totals`/`heldOf` phải đổi cùng nhau, tách ra thì số còn lại sai giữa chừng.
- Siblings: `g3-downstream-finance-integration`, `g5-commitment-lifecycle`
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8)

## Dependencies and blockers

Sau Đợt 1 (`aeb00f17`). Không blocker. Owner cần thêm QĐ cho D1 (mở lại hóa đơn) và D2 (Finance đọc lô) ở Docs.

## Ownership: module, data, API

- `budgets`: `budget-view` (màn 1), `commitment` + hóa đơn (màn 4+5), bảng `invoices`, cột `budget_commitments.applied_minor`,
  extension point request facts.
- `requests`: `spend-submission` (màn 3), listener bind extension point.
- API: `budgetTable` (sửa), `budgetSummary` (mới), `budgetCommitmentList` (sửa), `budgetCommitmentInvoice*` (mới),
  `spendBatchList` (mới), `spendBatchGet`/`spendBatchItemList` (sửa quyền đọc).

## Behavior and design

Mọi route dưới `/v1`, envelope và lỗi theo `docs/rules/api-contract.md`. Tiền là `{amount: string, currency: string}` như các DTO budgets hiện có.

### Màn 1 — trung tâm chi phí (`budgets/budget-view`)

- **Sửa** `GET /budgets` (FINANCE): mỗi dòng **thêm** `base`, `reserve` (từ phiên bản hiện hành — `baseMinor`, `reserveMinor`).
  Các field cũ giữ nguyên (chỉ thêm, không đổi tên).
- **Mới** `GET /budgets/summary?year=` (FINANCE, `year` bắt buộc): tổng toàn công ty theo **từng đồng tiền** —
  `{ year, totals: { <currency>: { base, reserve, total, committed, spent, remaining, costCenterCount, overBudgetCount } },
lastInvoiceRecordedAt }` — `lastInvoiceRecordedAt` (null khi chưa có) là _thời điểm cập nhật_ của số thực chi (`US-12-01` AC-13).
  `overBudgetCount` = số Cost Center có `remaining < 0`. Năm không có phiên bản nào ⟹ `totals: {}`. `totals` là **map theo mã đồng tiền**, không phải mảng (gate `api-collection-contract`).

### Màn 2 — đề xuất ngân sách

Không đổi. Ánh xạ cho FE ghi ở [plan.md](plan.md) `## FE mapping`.

### Màn 3 — đã duyệt chi theo đợt (`requests/spend-submission`)

- **Mới** `GET /spend-batches` (FINANCE): `?departmentId=&submittedFrom=&submittedTo=&page=&pageSize=`, mới nhất trước. Dòng:
  `{ id, department{id,name}, submittedBy{employeeId, employeeCode, fullName}, submittedAt, itemCount, approvedCount, pendingCount,
approvedAmounts: { <currency>: amount } }` (map theo đồng tiền, cùng lý do). Định nghĩa: `approvedCount` = số item mà Request **có khoản cam kết** (cam kết chỉ sinh
  khi duyệt chi); `approvedAmounts` = tổng `amount` các cam kết đó theo đồng tiền; `pendingCount` = item đã gửi đi (không `STOPPED`,
  chưa rời lô) mà Request chưa có quyết định chi. Enum `SpendBatchItemOutcome` còn giá trị cũ `SENT_TO_FINANCE` — coi như _đã gửi
  đi_, không sửa enum. Đọc cam kết qua `BudgetsApi` theo lô requestId (requests đã phụ thuộc budgets), không gọi từng dòng.
- **Sửa** quyền đọc `GET /spend-batches/{id}` và `/{id}/items`: thêm FINANCE đọc **mọi** lô (chỉ đọc). Người trình/người giữ như cũ.
- Không có thao tác ghi nào cho Finance trên lô. Finance vẫn không nằm trên đường Request.

### Màn 4+5 — cam kết đang giữ + hóa đơn (`budgets/commitment`, mới `budgets/invoice` hoặc trong `commitment`)

- **Sửa** `GET /budget-commitments` (FINANCE):
  - thêm lọc `state` (`HELD|RELEASED|EXPENSED`, tùy chọn);
  - mỗi dòng **thêm** `request` = `{ id, code?, software{name}, plan{name}?, requester{employeeCode, fullName}, beneficiaryCount,
spendApprovedAt }` (null khi không đọc được), `invoiced` (tổng thực chi đã ghi từ hóa đơn của khoản này), `invoiceCount`,
    `hasDiscrepancy`. `held` = `amount − released − applied` (applied = phần cam kết đã chuyển thành chi phí).
  - Thông tin Request lấy qua **extension point** mới trong `budgets/public/budgets.extension-points.ts` (Hook, ADR-0016) do module
    `requests` bind từ một `*.listener.ts` — budgets **không** import requests (graph một chiều requests → budgets).
- **Mới** `POST /budget-commitments/{id}/invoices` (FINANCE). Body:
  `{ number: string(1..64), issuedOn: date, netAmount: {amount}, deductibleTax?: {amount}, nonDeductibleTax?: {amount},
note?: string(≤1000) }` — `netAmount` = giá trên hóa đơn chưa thuế; `deductibleTax` = GTGT được khấu trừ, **chỉ ghi để hiện cột
  riêng, không vào thực chi**; `nonDeductibleTax` = thuế không được khấu trừ (vd. thuế nộp thay), **vào** thực chi
  (`US-06-06` AC-1, `US-12-01` AC-1, `US-12-02` AC-5).
  Đồng tiền = đồng tiền của khoản cam kết (server suy ra; client gửi `currency` ⟹ 422 theo strictObject).
  - Nhà cung cấp do server suy ra từ Request của khoản cam kết (qua cùng extension point: `vendorId`). Chống trùng
    **(organization, vendorId, number)** ⟹ 409 `INVOICE.DUPLICATE` (`US-12-02` AC-11). Request không suy ra được nhà cung cấp ⟹
    409 `INVOICE.VENDOR_UNKNOWN` (không tự đoán).
  - Chỉ ghi được cho khoản cam kết đã duyệt (`HELD` hoặc `EXPENSED`); `RELEASED` hoàn toàn ⟹ 409 `INVOICE.COMMITMENT_RELEASED`.
  - Tính trong **một giao dịch**, khóa dòng cam kết bằng `CommitmentRepo.lockById` như `release`. Không khóa năm ngân sách: hóa
    đơn không bao giờ bị chặn (`C-08`, `US-06-06` AC-17), nên không cần xếp hàng với kiểm tra ngân sách.
    - `applied += min(netAmount, held hiện tại)`; `held` giảm đúng bấy nhiêu (cam kết giảm theo **giá gốc**, `US-06-06` AC-1, AC-5).
    - Thực chi của hóa đơn `actualCost = netAmount + nonDeductibleTax` (chi phí thực chịu, `QĐ-97d`, `QĐ-60a`). Phần net vượt
      `held` vẫn là thực chi (`QĐ-34b`).
    - Trạng thái khi `held = 0`: `EXPENSED` nếu `applied > 0`, ngược lại `RELEASED` (áp cho cả hóa đơn **và** `release`: cam kết
      đã chi một phần rồi giải phóng phần dư là `EXPENSED` — `US-06-06` AC-9).
    - Kết quả so khớp (`matchResult`), theo **lũy kế** net đã ghi của khoản cam kết so với `amount − released`:
      `MATCHED` (lũy kế ≤ hạn mức, không có thuế) · `TAX_ONLY` (lũy kế ≤ hạn mức, có `deductibleTax` hoặc `nonDeductibleTax` > 0 —
      chênh thuế ghi riêng, **không** mở sai lệch, `US-12-02` AC-5) · `PRICE_QUANTITY_EXCEPTION` (lũy kế > hạn mức) ⟹
      `hasDiscrepancy = true` (`US-12-02` AC-6; bản tối giản chỉ có cờ, không có hồ sơ).
    - **Không** bao giờ chặn vì vượt ngân sách (`C-08`); ghi audit event như `release`.
  - Response: `{ invoice: {id, number, issuedOn, netAmount, nonDeductibleTax, actualCost, matchResult, recordedBy, recordedAt},
commitment: <dòng cam kết sau khi ghi> }`.
- **Mới** `GET /budget-commitments/{id}/invoices` (FINANCE): danh sách hóa đơn của khoản cam kết, mới nhất trước, có phân trang.
- **Sửa** `CommitmentRepo.totals` (dùng chung cho `GET /budgets`, summary và **kiểm tra ngân sách** qua `budget-facts.repo.ts`):
  `held = Σ(amount − released − applied)` của cam kết `HELD`; `spent = Σ actualCost` của hóa đơn gắn với cam kết đã gắn phiên bản
  của (Cost Center, năm). Trạng thái `EXPENSED` không còn được cộng nguyên khoản vào `spent`.
- **Sửa bắt buộc** `heldOf` trong `budgets/budget/commitment-release.policy.ts` thành `amount − released − applied`, và mọi chỗ khác
  tự tính `amount − released` (grep `releasedMinor` trong `budgets/**`, `budgets/public/**` và chỗ requests đọc cam kết). Nếu không,
  hủy Request/thất bại/thu hồi sau khi đã có hóa đơn sẽ **giải phóng cả phần đã thành chi phí** (sai `US-06-06` AC-9, AC-4).
- `POST /budget-commitments/{id}/release` giữ nguyên ý nghĩa: chỉ giải phóng phần `held` còn lại.
- Thông tin Request/nhà cung cấp qua Hook phải đọc **theo lô** (`factsOf(requestIds[])`) — không gọi một lần cho mỗi dòng.

### Dữ liệu (một migration)

- Bảng `invoices`: `id uuid(7)`, `organization_id`, `commitment_id` FK Restrict, `vendor_id` (uuid, không FK chéo module nếu rule
  cấm — theo `docs/rules/database-business.md`), `number`, `issued_on date`, `currency char(3)`, `net_minor bigint ≥ 0`,
  `deductible_tax_minor bigint ≥ 0 default 0`, `non_deductible_tax_minor bigint ≥ 0 default 0`, `actual_cost_minor bigint` (= net + tax, CHECK), `applied_minor bigint ≥ 0`,
  `match_result` enum, `note`, `recorded_by_employee_id`, `recorded_at`. `UNIQUE (organization_id, vendor_id, number)`.
  Không sửa/xóa (trigger hoặc quyền DB như các bảng chỉ ghi thêm khác nếu module đã có mẫu).
- `budget_commitments`: thêm `applied_minor bigint not null default 0`, CHECK `released_minor + applied_minor ≤ amount_minor`.
- Migration chỉ **thêm**, chạy được trên DB đã có dữ liệu demo.

## Logic cũ của Đợt 1 — không sửa

Đợt 1 cố ý giữ một số logic cũ (đã bỏ hoặc sai so với BRD/US mới) để demo 07/11; Owner sửa theo BRD, US, main flow **sau** demo.
Hạng mục này **không** sửa chúng, kể cả khi thấy sai: chỉ ghi vào `REPORT.md` mục _Logic cũ còn lại_ (file:dòng, lệch với QĐ/US nào).
Ví dụ đã biết: `budgets/mine` không trả _còn lại_ (khác `QĐ-100p`), `remaining` ở `GET /budgets` chưa trừ Request đang chờ duyệt chi
(khác `C-09`), enum `SENT_TO_FINANCE`/`RETURNED_BY_FINANCE`. Ngoại lệ duy nhất: `heldOf` ở trên — bắt buộc sửa vì hạng mục này làm nó sai.

## Known gaps vs US (chấp nhận cho demo)

- `US-12-02` AC-1/AC-2: không có số seat trên hóa đơn; ngoại lệ số lượng chỉ suy từ số tiền. AC-3/AC-13 (dòng không ghép được,
  quyền ngoài quy trình), AC-7 (đóng hồ sơ), AC-10 (IT đính biên lai): ngoài phạm vi.
- `US-12-02` AC-8 ghi cam kết giảm theo _chi phí thực chịu_ (13tr), còn `US-06-06` AC-1/AC-5 ghi giảm theo _giá gốc_. Spec theo
  `US-06-06` + `QĐ-97d` (giá gốc); ghi vào REPORT để Owner sửa câu chữ `US-12-02` AC-8.
- `US-12-01` phạm vi quyền: Người duyệt chi cũng xem tổng chi toàn công ty; `GET /budgets` và `summary` hôm nay chỉ FINANCE (giữ
  như route hiện có). Ghi vào REPORT.
- `US-12-01` AC-15 / `US-12-02` AC-12 (hóa đơn năm sau về trước ngân sách năm sau): ghi được trên cam kết chuyển tiếp nhưng `spent`
  chỉ hiện khi cam kết đã gắn phiên bản.

## Explicit out of scope

Import CSV hóa đơn, sao kê ngân hàng (`SBF-07`), luồng điều tra/đóng hồ sơ sai lệch (`SBF-11a` §5), dòng _Chưa phân bổ Cost Center_
và hóa đơn không gắn cam kết (`C-15`), hóa đơn khác đồng tiền cam kết, tiết kiệm thực (`5.11`), IT đính kèm biên lai,
khoản cam kết chưa gắn phiên bản (hóa đơn năm sau về sớm — `QĐ-98k`: ghi được nhưng chưa hiện ở `spent` cho tới khi gắn).

## Test matrix

Mỗi dòng phải có test tự động (unit/http/integration) và được nêu trong `HANDOFF.md`.

- A1 `GET /budgets` có `base`, `reserve`; `total = base + reserve`.
- A2 `GET /budgets/summary` cộng đúng theo đồng tiền; vai khác FINANCE ⟹ 403.
- A3 `GET /spend-batches` chỉ FINANCE; số đếm và `approvedAmounts` khớp cam kết; FINANCE đọc được chi tiết/items mọi lô; trưởng phòng
  khác vẫn bị coi như không tồn tại (404) như cũ.
- A4 `GET /budget-commitments?state=HELD` lọc đúng; dòng có `request` và `invoiced`.
- A5 Ghi hóa đơn: `held` giảm, `spent` (màn 1 và kiểm tra ngân sách) tăng đúng `actualCost`; ba `matchResult` đúng ở biên
  (bằng hạn mức = `MATCHED`/`TAX_ONLY`; vượt 1 đơn vị = `PRICE_QUANTITY_EXCEPTION`); hết `held` ⟹ `EXPENSED`.
- A6 Trùng (nhà cung cấp, số) ⟹ 409; cam kết đã giải phóng hết ⟹ 409; gửi `currency` ⟹ 422; không phải FINANCE ⟹ 403.
- A7 Hai hóa đơn ghi đồng thời trên một cam kết không làm `applied` vượt `amount − released` (test đồng thời).
- A8 Kiểm tra ngân sách khi trình lô dùng `spent` mới: Request sau hóa đơn có thuế thấy `remaining` giảm thêm đúng phần thuế
  không khấu trừ; GTGT được khấu trừ **không** làm giảm `remaining`.
- A9 Cam kết 20 đã có hóa đơn net 12 (`applied` 12): hủy Request ⟹ chỉ giải phóng 8, `state = EXPENSED`; Finance giải phóng phần dư
  ⟹ cũng chỉ 8. Cam kết `EXPENSED` không quay về `HELD`.
- A10 Danh sách cam kết 50 dòng gọi Hook đúng một lần (test đếm lời gọi).

## Definition of Done

- Mọi dòng `## Test matrix` có test xanh; quick set xanh; test toàn bộ xanh hoặc đỏ còn lại đã chứng minh là logic cũ Đợt 1/môi trường.
- Smoke API thật trên dữ liệu demo (`SMOKE.md`); seed T7 chạy được; OpenAPI và `docs/generated` cập nhật.
- `REPORT.md` đủ; commit riêng, PR vào `dev`.
