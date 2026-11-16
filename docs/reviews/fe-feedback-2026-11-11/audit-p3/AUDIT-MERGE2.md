# AUDIT-MERGE2 — lỗi ngầm sau merge 134a713d (lane B 6be811e9 → lane A 78a938c2)

Ngày 15/11/2026. Reviewer chỉ đọc, trên bản sạch `D:\FPT\FALL2026\Code\be-verify` (134a713d, `git status` sạch trước và sau).
Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (khung review 5 trục, phân mức), `superpowers:verification-before-completion`
(mọi kết luận kèm lệnh/đọc file làm bằng chứng). Không chạy pnpm/jest/docker; chỉ chạy hai script chỉ-đọc
`node scripts/arch/graph.mjs --check` và `node scripts/arch/routes.mjs --check` (đều exit 0).

Phạm vi mới: lane A `f55af71b..78a938c2` (PI-1c, RC-1, FIX-A2, RC-2, PI-2 cuối), lane B `b5d041c6..6be811e9` (FIX-LB3, FIX-LB4).
Merge-base của merge = `f55af71b`.

## Tóm tắt

| Mã | Mức | Lane | Nội dung |
| ---- | ----- | ------ | -------- |
| MG2-01 | Medium (Owner xác nhận lại phạm vi MG-03 A) | A | Hóa đơn thuê bao, cả thuê bao **có phòng sở hữu**, vẫn `cost_center_id = NULL` ⟹ không vào `spent` của ai |
| MG2-02 | Medium | A (chi không cam kết) ↔ view ngân sách | `GET /budgets` và `/budgets/summary` chỉ có dòng cho (CC, năm) có phiên bản tham chiếu hoặc commitment ⟹ thực chi ngoài quy trình (RC-2) và hóa đơn `COST_CENTER` (PI-1) của CC chưa có ngân sách năm đó **không hiện** |
| MG2-03 | Medium (cần Owner) | A ↔ B | Thực chi `UNALLOCATED` (RC-2) và hóa đơn thuê bao kho: không chỗ nào đọc "đã chi"; Dự phòng kho (B) không có số đã dùng; `lastInvoiceRecordedAt` vẫn nhảy |
| MG2-04 | Nit | A | `budgets/README.md:159-160` định nghĩa `spent` cũ (chỉ hóa đơn theo commitment) |
| MG2-05 | Low (nợ test, có từ trước) | A | `contract-fields-migration` đỏ: kiểm drift sau khi chỉ deploy tới `004200` |
| MG2-06 | Optional | B | Lần chạy thử 01/01 (`CarriedOverListener`) quét mọi request mỗi lần đọc/ghi phiên bản |

Không có Critical/Required do tương tác hai lane trên 134a713d.

---

## MG2-01 — Medium — hóa đơn thuê bao có phòng sở hữu vẫn ngoài `spent`

- **File:dòng (134a713d):** `src/modules/budgets/budget/invoice.policy.ts:112` (`subscriptionId !== null ⟹ { kind: 'SUBSCRIPTION' }`, bỏ qua
  `chargedCostCenterId`); `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts:58, 77-78` (ghi `subscription_id`, `cost_center_id`
  = `placed.costCenterId` = null với `SUBSCRIPTION`); `src/modules/budgets/budget/invoice.repo.ts:186-191` (`spentOf` gom theo
  `COALESCE(i.cost_center_id, c.cost_center_id)`).
- **Lane:** A (PI-1, PI-1c). Không đổi sau f55af71b; lane B không chạm.
- **Kịch bản:** IT Admin nộp hóa đơn Gia hạn của thuê bao do phòng X sở hữu, Finance ký ⟹ dòng `invoices` không có Cost Center ⟹ `spent`
  của X (bảng, summary, `yearFacts.spentMinor` khi kiểm ngân sách trình lô) không đổi. Với thuê bao **kho** (K2/K4, PI-1c) đây là đúng
  phương án A của Owner. Với thuê bao **có phòng sở hữu**, AUDIT-MERGE1 MG-03 phương án A đề xuất ghi thêm `cost_center_id`; code chưa làm
  (comment `invoice.policy.ts:96` "to be shared among departments later, QĐ-104c" cho thấy đang cố ý hoãn).
- **Sửa (lane A, nếu Owner xác nhận A gồm thuê bao có phòng sở hữu):** `bookPurchaseInvoice` trả `{ kind: 'SUBSCRIPTION', subscriptionId,
  costCenterId }` với Cost Center Unit của phòng sở hữu (null cho kho); `place()` khóa năm như nhánh `COST_CENTER`, ghi `cost_center_id`.
  Không cần migration: `invoices.cost_center_id` đã có và `invoices_place_check`
  (`prisma/migrations/20261113004500_pi1_purchase_invoices/migration.sql:188-189`, chỉ yêu cầu ít nhất một nơi) cho phép cả hai cột.
- **Test nên thêm:** integration ký hóa đơn Gia hạn thuê bao phòng sở hữu ⟹ `GET /budgets?year=` dòng của phòng có `spent` tăng; thuê bao kho ⟹
  không dòng phòng nào đổi.

## MG2-02 — Medium — chi không cam kết của Cost Center chưa có ngân sách năm không hiện ở bảng ngân sách

- **File:dòng:** `src/modules/budgets/budget-view/budget-view.repo.ts:23-28` (`pairs` = phiên bản `APPROVED`/`EXPIRED` ∪ `budget_commitments`,
  không có `invoices`); `src/modules/budgets/budget-view/budget-table-view.service.ts:61-80` (`summary` chỉ cộng các dòng đó);
  nguồn chi mới: `src/modules/budgets/invoice/out-of-process-spend-recorder.service.ts:45-63` (RC-2, `commitmentId: null`, `costCenterId`),
  `src/modules/usage/vendor-account-review/out-of-process-case-closure.service.ts:142-160`.
- **Lane:** A (RC-2 thêm loại chi không cam kết thứ hai sau PI-1 `COST_CENTER`) gặp view ngân sách (mô hình cơ sở + dự phòng của B dùng chung view).
- **Kịch bản:** IT Admin quyết `OUT_OF_PROCESS`, Finance đóng ca `RECORD_SPENT` 750.000 đ cho Cost Center của một phòng **chưa có phiên bản
  được duyệt năm nay và chưa có commitment** (phòng mới, đầu năm trước khi duyệt, hoặc CC không phải phòng) ⟹ có dòng `invoices`
  (`spentOf` sẽ đếm nếu được hỏi) nhưng không có cặp (CC, năm) trong `pairs` ⟹ `GET /budgets`, `/budgets/summary` thiếu khoản chi,
  `overBudgetCount` không tính. Khi sau đó phiên bản được duyệt thì khoản chi mới xuất hiện — số liệu "nhảy".
- **Sửa (lane A):** thêm vào `pairs` một nhánh
  `SELECT i.cost_center_id, EXTRACT(YEAR FROM i.service_month)::int, i.currency FROM invoices i WHERE i.commitment_id IS NULL AND
  i.cost_center_id IS NOT NULL AND NOT EXISTS (… reference/commitment cùng cặp)` (giống nhánh commitment-only), để dòng "chỉ có chi" hiện với
  `base/reserve/total` null như dòng commitment-only.
- **Test nên thêm:** integration RC-2: đóng `RECORD_SPENT` cho CC không có ngân sách năm ⟹ `GET /budgets?year=` có dòng CC đó, `spent` =
  750.000, `versionId` null; summary `spent` cộng đúng. Cùng ca cho hóa đơn PI-1 booking `COST_CENTER`.

## MG2-03 — Medium (cần Owner) — "đã chi" không Cost Center không có chỗ đọc

- **File:dòng:** `src/modules/budgets/invoice/out-of-process-spend-recorder.service.ts:43-45, 62` (`costCenterId` null ⟹ `UNALLOCATED`, không khóa
  năm); `src/modules/budgets/budget/invoice.repo.ts:186-191` (`spentOf` bỏ dòng CC null); `src/modules/budgets/budget/invoice.repo.ts:199-207`
  (`lastRecordedAt` lại đếm **mọi** hóa đơn); `src/modules/budgets/budget-view/budget-table-view.service.ts:77-79` (summary có
  `lastInvoiceRecordedAt` và `sharedPoolReserve` nhưng không có số đã dùng).
- **Lane:** A (RC-2 `UNALLOCATED`, PI-1c thuê bao kho theo MG-03 A) ↔ B (Dự phòng kho ở mức kỳ, Trần năm − Dự phòng kho).
- **Kịch bản:** Finance đóng ca `RECORD_SPENT` với `costCenterId: 'UNALLOCATED'`, hoặc ký hóa đơn thuê bao kho ⟹ tiền đã chi thật, nhưng không
  bảng/summary/`yearFacts` nào thấy; chỉ `lastInvoiceRecordedAt` đổi ⟹ FE thấy "vừa cập nhật" mà tổng không đổi. Trần năm − Dự phòng kho
  kiểm phiên bản (B) không bao giờ đối chiếu với tiền kho đã chi.
- **Sửa (lane A, sau khi Owner chọn):** thêm vào `BudgetSummaryWire` hai số theo năm: `sharedPoolSpent` (Σ hóa đơn `subscription_id` của thuê bao
  kho, `cost_center_id` null) và `unallocatedSpent` (Σ hóa đơn `out_of_process_case_id` không CC); hoặc ghi rõ trong SPEC rằng hai loại này
  nằm ngoài ngân sách và bỏ chúng khỏi `lastRecordedAt` cho nhất quán.
- **Test nên thêm:** integration đóng ca `UNALLOCATED` ⟹ summary có `unallocatedSpent` = số tiền (hoặc, nếu Owner chọn bỏ ngoài,
  `lastInvoiceRecordedAt` không đổi).

## MG2-04 — Nit — README định nghĩa `spent` cũ

- `src/modules/budgets/README.md:159-160`: "`spent` … = Σ chi phí thực của hóa đơn thuộc commitment" — sai với `invoice.repo.ts:176-194`
  (gồm hóa đơn không cam kết theo `cost_center_id`, năm `service_month`: PI-1 `COST_CENTER`, RC-2 OOP). Dòng 175 (RC-2) đúng nhưng mâu thuẫn
  với 159. Sửa câu 159 cho khớp `spentOf`, nêu ngoại lệ thuê bao/`UNALLOCATED`.

## MG2-05 — Low (nợ test có từ trước, không do merge) — `contract-fields-migration`

- `test/integration/catalog/contract-fields-migration.integration-spec.ts:44, 60-61, 204-205`: deploy tới trước `004200`, áp tay SQL đích,
  rồi `schemaDrift` so với **toàn bộ** `prisma/models` ⟹ exit 2 từ khi có migration sau `004200` (đỏ cả ở `verify-logs/merge1/int-full.log:1542`
  và `merge2/int-full.log:307`). Sửa (lane A): `await deployMigrations(database)` (phần còn lại) trước `schemaDrift`, như
  `finance-invoices-upgrade`.

## MG2-06 — Optional — chi phí lần chạy thử 01/01

- `src/modules/requests/year-start-commitments/year-start-carried-over.service.ts:52-58` đọc lô mọi request của tổ chức và gọi `judgeBatch`
  (giá, seat, Cost Center) mỗi lần `VersionViewService`/`BaselineFlagsService`/`VersionFigures.carriedOverOf` hỏi, kể cả trong transaction ghi
  phiên bản (`src/modules/budgets/version/version-figures.service.ts:29-31`). Đúng ngữ nghĩa, không khóa; chỉ là chi phí O(số request) mỗi
  lần đọc danh sách phiên bản. Gợi ý: gom một lần cho mọi (CC, năm) của trang (đã gom theo năm) và cân nhắc chỉ đọc request có
  `plan_id` trả phí ngay trong SQL.

---

## Đã kiểm, không lỗi

1. **File cả hai phía mới sửa** (`comm -12` của `f55af71b..78a938c2` và `b5d041c6..6be811e9`, bỏ docs/reviews, openapi.json, docs/generated):
   `catalog/contract/contract.policy.ts` (A thêm đích `OUT_OF_PROCESS_CASE` = tập `PURCHASE_DOCUMENT`; B tách `NewDocumentPurpose`, giữ
   `COST_STATEMENT` đọc được) — hợp nhất đúng ở `contract.policy.ts:14-24, 50, 72-84`; `catalog/contract/document.service.ts` (A thêm
   `attachOutOfProcessCaseDocuments`, B đổi kiểu `create`) — hai hunk tách rời; `requests/requests.module.ts` (A: RC-1 providers/exports;
   B: `YearStartCarriedOverService`, `CarriedOverListener`) — đủ cả hai; `test/gates/module-graph.gate-spec.ts` — đủ
   `InvoiceDiscrepancyReferralListeners` và `CarriedOverContributions`; hai README chỉ thêm đoạn. `docs/generated/module-graph.md` và
   `routes.md` khớp code (`graph.mjs --check`, `routes.mjs --check` exit 0; 109 cạnh).
2. **(a) CHECK `document_attachments` (RC-2, `prisma/migrations/20261113004560_rc2_out_of_process_cases/migration.sql:66-77`)** giữ nguyên
   ba nhánh cũ của PI-1 (`20261113004500…:165-174`) và thêm nhánh `out_of_process_case_id ⟹ PURCHASE_DOCUMENT`. Lane B không ghi bảng này:
   tệp BM-10/phiên bản/đề xuất ở `budget_attachments`, avatar ở `app_users`/`avatar_purges`; writer duy nhất là `DocumentRepo`. Hàng
   `COST_STATEMENT` cũ (B MG-04) không có owner, `PENDING_ATTACH` ⟹ qua cả hai CHECK (test của B `document-http.integration-spec.ts`
   chèn đúng dạng đó). Không nhánh nào cho `COST_STATEMENT` gắn owner, khớp policy `ATTACHES_TO_*` (`contract.policy.ts:44-50`).
   Trigger `document_attachment_guard` không liệt kê cột owner nên cột mới không bị chặn.
3. **(b) "Đã chi" của RC-2:** `spentOf` (`invoice.repo.ts:181-194`) đếm hóa đơn OOP có CC vào (CC, năm `service_month`) ⟹ đi vào
   `CommitmentRepo.totals` (`commitment.repo.ts:512`) ⟹ bảng/summary/`yearFacts` và mô hình cơ sở + dự phòng của B (`remainingBase`,
   `remainingWithReserve`). Không bị chặn vì vượt ngân sách (C-08) — đúng. Lỗ hổng chỉ ở MG2-02/03.
4. **(c) `CarriedOverListener`:** lane A không sửa `requests/year-start-commitments/*` sau f55af71b. Listener dùng chung `judgeBatch` với
   pass 01/01 (`year-start-commitments-batch.service.ts:145-153`), `readBatch` không khóa; các API catalog nó gọi (`getPlanRevocationInfo`,
   `getPlanPrice`) không bị PI-1c/RC sửa.
5. **(d) Thông báo:** RC-1/RC-2 không gửi thông báo nào (grep `notif` trong `usage/vendor-account-review*`, `requests/invoice-discrepancy*`,
   `out-of-process-spend-recorder` rỗng); FIX-LB3/LB4 cũng không thêm.
6. **(e) Quyền runtime:** `invoice_discrepancy_cases`, `vendor_account_discrepancies`, `out_of_process_cases` cần UPDATE (đóng/quyết) và
   `vendor_account_discrepancies` cần DELETE (xóa bằng chứng 24 tháng) ⟹ đúng là DML mặc định, không cần `RUNTIME_TABLE_EXCEPTIONS`
   (`src/infrastructure/database/database-role-judgement.ts:14-41`); bất biến do trigger. `invoices` vẫn `INSERT, SELECT`, recorder RC-2 chỉ
   insert. Lane B sau b5d041c6 không thêm bảng. Test serial đếm động, không danh sách cứng.
7. **(f) Harness hạn kỳ:** chỉ `test/support/budget-harness.ts:97-100` tạo kỳ (nay 31/12); `SpendHarness`/`InvoiceHarness`/`GroupHarness`/
   `StatusHarness` đều kế thừa, không ghi đè. Suite RC-1/RC-2 (`invoice-discrepancy`, `vendor-account-review`) dùng `InvoiceHarness`.
   Các nơi tự đặt hạn khác (`budget-cycle-constraints`, `budget-cycle-lifecycle`, `department-creation-window` hạn 01/12 cho `h.next`/`h.year`)
   là fixture có chủ đích, không gọi `budgetFor`. Lưu ý ngoài phạm vi: `purchase-invoice-missing-periods.integration-spec.ts:197-297` ghim
   ngày `2026-12-…` — bom ngày từ 01/01/2027 (FIX-TEST).
8. **(g) Migration:** `004510..004560` (A) chỉ chạm enum/bảng mới, `purchase_invoices`, `document_attachments`; `100000..100800` (B) chạm
   `policies*`, `app_users`, `avatar_purges`, `budget_cycles`, `BudgetVersionOrigin`, `budget_versions`, `budget_proposals`. Không đối tượng
   chung ⟹ thứ tự áp trên DB đang chạy không đổi kết quả. `100800` chỉ `UPDATE budget_versions` quý về NULL: qua `budget_versions_quarters_check`
   (`20261023180000…:220-224`) và trigger `budget_versions_retired_columns` (không chạm `reason`/ngưỡng). DB nào đã có 1000xx trước 0045xx thì
   `migrate deploy` vẫn áp phần thiếu; nên chạy `migrate status`/`ops:preflight` (như MG-06).

## Dự đoán integration/e2e/serial đỏ do tương tác (không tính seed Z2)

- **Không thấy ca đỏ do tương tác** trên 134a713d. Không test nào hiện kiểm thực chi RC-2 trong `GET /budgets` hay summary (MG2-02/03 chỉ là
  lỗ hổng chưa có test, không làm test hiện có đỏ).
- Log đang chạy `verify-logs/merge2/int-full.log` (22:46, 84 PASS): FAIL = `installation/seed*` (Z2), `organization.integration` (khóa
  `contractEndDate`, có từ merge1), `ai-assist/queue-summary-approver` (phụ thuộc ngày, có từ merge1), `catalog/contract-fields-migration`
  (MG2-05, có từ merge1). Các suite giao nhau đã PASS: `vendor-account-review`, `invoice-discrepancy`, `purchase-invoice*`,
  `year-start-carried-over`, `finance-invoices-upgrade`, `unit-only-upgrade-history`.
- e2e `budget-version` (`built` có `reserveReason`), `paid-request-to-seat` (`budgetFor` năm hiện tại, nay hạn 31/12): không đỏ do merge.
  Serial `database-runtime-role-invoice-write`/`budget-write`: lần chạy thử 01/01 chỉ SELECT ⟹ không đỏ.
- Sẽ cần soát khi sửa MG2-01: test đọc `cost_center_id` của hóa đơn thuê bao (`purchase-invoice-decision.integration-spec.ts:22` trở đi,
  `purchase-invoice-constraints.integration-spec.ts:308-310`).
