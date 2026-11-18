# AUDIT P3 · B3-B — PI-1, PI-1c, PI-2, FIX-A2, RC-2.money (review chỉ đọc)

- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review năm trục, nhãn mức), `superpowers:verification-before-completion` (mọi kết luận dẫn file:dòng đã đọc; không chạy test theo lệnh brief nên không tuyên bố test xanh/đỏ).
- **Phạm vi đọc:** `git -C BE-dev-software-license-management` các commit `27f0f83b`…`7bbf4bb8` (lọc PI-1/PI-2/PI-1c/FIX-A2/RC-2.money) trong `79c164c8..78a938c2`; cây `78a938c2` trích ra scratchpad để đọc theo dòng (lưu ý: `be-verify` = `134a713d` đã có lane B, KHÔNG trùng dòng với `78a938c2`). Nguồn: `project-decisions.md` (QĐ-103k/l/r/w, QĐ-104c/h/k, QĐ-97d, QĐ-60a, QĐ-55a/b, QĐ-34b, QĐ-111u/v/w/x/y/an), BRD (FR-5.3/5.4 qua bảng phiên bản 4.5/4.7), SPEC PI-1/PI-2/SM-1, OVERNIGHT-DECISIONS D-74…D-80 và bảng PI-1-Q*/O*, PI-2-*, PI-1c-*. MG-03 (Owner chốt A 15/11) lấy theo brief.
- **Không chạy** pnpm/jest/docker. Mọi dòng dưới đây là ở `78a938c2`.

## Tóm tắt

| Mức | Số |
| --- | --- |
| Critical | 0 |
| Required | 7 (B3B-01…B3B-07) |
| Optional | 6 (B3B-O1…O6) |
| Nit | 5 (B3B-N1…N5) |

---

## Required

### B3B-01 — Hóa đơn `K2` nối Request đi vào khoản cam kết/“đã chi” của phòng (D-74 (7) / PI-1-Q1 trái `QĐ-104c`(3), `QĐ-103k`, `QĐ-103r`, MG-03, SPEC PI-1)

- **Vị trí:** `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts:114` (`holderBound` chỉ K1/K4; K2 rơi về Cost Center của Request), `:229-254`, `:256-272`; `src/modules/budgets/budget/invoice.policy.ts:112-124` (`bookPurchaseInvoice`: chỉ link thuê bao mới thành `SUBSCRIPTION`); `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts:41-50`. Test ghim hành vi sai: `test/integration/requests/purchase-invoice-decision.integration-spec.ts:43` (gói của thuê bao `K2`) + `:133-168` (khẳng định `spentMinor: 3_840_000n` của phòng).
- **Kịch bản (số):** gói `K2` 200.000 đ/seat/tháng. Request 2 người, 11–12/2026 ⟹ cam kết 800.000 đ. IT mua 2 seat gói năm, nộp hóa đơn nối Request: net 4.800.000 đ, tháng kỳ 11/2026. Code: `COMMITMENT` năm 2026, `takeMinor` = 800.000, `actual_cost` 4.800.000 vào `spentOf` của phòng (`invoice.repo.ts:186-191`), cờ `OVER_APPROVED` (4,8 tr > 0,8 tr) và `invoices.match_result = PRICE_QUANTITY_EXCEPTION` (xem B3B-02). Theo `QĐ-104c`: phòng chỉ chịu seat-tháng 2 × 200.000 × 2 = 800.000 đ; 4.000.000 đ còn lại thuộc dòng *Chưa phân bổ — kho*. Phòng bị đội **4.000.000 đ** ngay; khi SM-1 chạy (SPEC: “Thực chi theo Cost Center = hóa đơn (`spentOf`) + seat-month charges”) cộng thêm 800.000 đ ⟹ **4.800.000 đ + 800.000 đ = 5.600.000 đ** cho chi phí thật 800.000 đ của phòng. Gói tháng cũng vậy: 400.000 đ/tháng hóa đơn + 400.000 đ seat-tháng = gấp đôi.
- **Căn cứ:** `QĐ-104c`(3) “Mọi hóa đơn K2 ghi vào kho (kể cả mua thêm cho Request); phòng chỉ chịu seat-tháng”; `QĐ-103k`, `QĐ-103r` cùng câu; `QĐ-103l` “hóa đơn K2 là bằng chứng tiền đã ra của kho (phòng chịu seat-tháng)”; SPEC PI-1 “hóa đơn seat `K2` ⟹ dòng của thuê bao”; MG-03 = A. D-74 (7) A / PI-1-Q1 chọn ngược ⟹ D-n trái QĐ.
- **Sửa:** ở `requestFacts` lấy `provisioningType` của gói; với `K2` (và `K5` nếu cùng mô hình kho) tìm thuê bao kho của gói (`SubscriptionPeriodApi`/`CatalogApi` — một kho mỗi gói theo `QĐ-104k`(3)) và đặt `subscriptionId` cho lệnh ký (đúng phương án “Đổi lại (7) B” của D-74, không đổi bảng). `chargedCostCenterId = null`, `commitment = null`; cờ vượt theo B3B-06. Khoản cam kết `K2` của Request giảm dần ở SM-1 (SPEC “Cam kết K2 giảm dần”), không ở PI-1.
- **Test:** sửa `purchase-invoice-decision.integration-spec.ts:133-168` thành gói `K1` cho ca “vào khoản cam kết”; thêm ca `K2` nối Request ⟹ `invoices.subscription_id` = thuê bao kho, `commitment_id`/`cost_center_id` NULL, `yearFacts(...).spentMinor` của phòng = 0, cam kết vẫn `HELD` 800.000.

### B3B-02 — `invoices.match_result` thành `PRICE_QUANTITY_EXCEPTION` khi VND thực bị trừ vượt cam kết, dù R-44 khớp (trái `QĐ-111an`, `QĐ-55a`, T-PI)

- **Vị trí:** `src/modules/budgets/budget/invoice.policy.ts:73`, `:77-81` (`matchOf` so tổng net với số cam kết cho phép); `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts:136-156` (giữ `plan.matchResult`, chỉ ghi đè khi hóa đơn mua là exception). Hệ quả đọc: `src/modules/budgets/commitment/commitment.service.ts:380` (`hasDiscrepancy` = có dòng `PRICE_QUANTITY_EXCEPTION`). Unit spec ghim hành vi: `purchase-invoice-recorder.service.spec.ts:157` (“flags what goes over what it allowed”).
- **Kịch bản (số, đúng T-PI):** Request `K1`/`K4` Figma 10 seat × 15 USD, cam kết 3.750.000 đ; hóa đơn 10 seat × 15 USD, net 3.840.000 đ (tỷ giá + phí thẻ). `purchase_invoices.match_result = MATCHED`, không mở `SBF-11a` (đúng). Nhưng `planInvoice`: 0 + 3.840.000 > 3.750.000 ⟹ dòng `invoices` = `PRICE_QUANTITY_EXCEPTION`; danh sách cam kết hiện `hasDiscrepancy: true` mà không có hồ sơ nào để đóng. Test T-PI hiện có (`invoice-discrepancy.integration-spec.ts:189`) đi đường **thuê bao** (`carriesTax ? TAX_ONLY : MATCHED`) nên không chạm nhánh cam kết.
- **Căn cứ:** `QĐ-111an` “chênh VND do tỷ giá/phí thẻ đi thẳng vào thực chi, không mở hồ sơ sai lệch (R-44)”; `QĐ-55a` “báo cáo tách chênh do thuế khỏi chênh số lượng/đơn giá; chênh tỷ giá/phí thẻ không tách”; SPEC PI-1 “So khớp (R-44)… chênh VND… không mở hồ sơ”. Phần vượt tiền đã có cờ `OVER_APPROVED` ở hóa đơn mua.
- **Sửa:** với hóa đơn mua, `matchResult` của dòng `invoices` = `input.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? 'PRICE_QUANTITY_EXCEPTION' : (carriesTax ? 'TAX_ONLY' : 'MATCHED')`; bỏ dùng `plan.matchResult` ở `place()` (giữ `takeMinor`/`stateAfter`). `matchOf` cũ chỉ còn ý nghĩa cho dòng trước PI-1.
- **Test:** integration ký hóa đơn `K1` net 3.840.000 vào cam kết 3.750.000 ⟹ `invoices.match_result = 'MATCHED'`, `GET /budget-commitments` `hasDiscrepancy = false`, cam kết `EXPENSED`, thực chi 3.840.000; sửa unit `:157` thành “không đổi match theo VND”.

### B3B-03 — Thiếu cờ audit khi Finance ký hóa đơn có người thụ hưởng là chính mình (`QĐ-104h`)

- **Vị trí:** `src/modules/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts:35-50` (chỉ chặn `SAME_PERSON`), `:111-130` (`after` không có cờ).
- **Kịch bản:** Request `K1` của nhân viên Finance F (F là người thụ hưởng), IT nộp hóa đơn 600.000 đ, F tự ký ⟹ hợp lệ theo QĐ nhưng audit `PURCHASE_INVOICE.CONFIRMED` không có cờ *tự xác nhận*; không truy được ca F duyệt tiền cho chính mình.
- **Căn cứ:** `QĐ-104h` “Finance xác nhận hóa đơn có người thụ hưởng là chính mình ⟹ cờ audit” (sửa `QĐ-103l`, được `QĐ-103l` dẫn lại). SPEC PI-1 bỏ sót, không có D-n hoãn.
- **Sửa:** trong `confirm`, nếu `row.requestId` thì đọc người thụ hưởng (bảng cùng module `requests`, thêm `PurchaseInvoiceRepo.isBeneficiary(tx, requestId, employeeId)`), truyền `selfBeneficiary: true` vào `trail(...).after` (và vào audit `INVOICE.RECORDED` nếu muốn lọc ở budgets).
- **Test:** integration: Finance là người thụ hưởng ⟹ 201, audit có `after.selfBeneficiary = true`; Finance khác ⟹ không có khóa.

### B3B-04 — Request `FAILED` (IT đã mua `K1`, cấp thất bại) không nộp được hóa đơn (D-75 (2) trái `QĐ-104k`(4), `QĐ-103r`)

- **Vị trí:** `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts:30` (`PURCHASABLE_STATES` = `AWAITING_EXECUTION`, `EXECUTING`, `COMPLETED`), `:96-98` (ném `REQUEST_NOT_PURCHASABLE`).
- **Kịch bản (số):** IT ứng tiền mua `K1` 300.000 đ ngày 03/11 (Request `AWAITING_EXECUTION`), cấp thất bại ngày 05/11 ⟹ Request `FAILED`, cam kết giải phóng. IT nộp hóa đơn 06/11 ⟹ 409 `PURCHASE_INVOICE.REQUEST_NOT_PURCHASABLE`; nối thuê bao cũng không có (K1 không có kho) ⟹ 300.000 đ tiền ứng của IT không bao giờ được Finance ký trong hệ thống (`QĐ-111u`).
- **Căn cứ:** `QĐ-104k`(4) “IT đã mua K1 mà tác vụ cấp thất bại ⟹ IT hủy gia hạn, hóa đơn vào *Chưa phân bổ Cost Center* của phòng người dùng”; `QĐ-103r` cùng câu; `QĐ-111u` mọi hóa đơn mua có đề nghị.
- **Sửa:** thêm `FAILED` (và `AWAITING_IT_CLOSE`) vào trạng thái nhận hóa đơn; với các trạng thái này đặt `chargedCostCenterId` = Cost Center phòng người dùng và để `bookPurchaseInvoice` ghi `COST_CENTER` (khoản đã `RELEASED` ⟹ nhánh có sẵn `invoice.policy.ts:122-124`); nếu phòng chưa có Cost Center xem B3B-O4.
- **Test:** integration: Request `K1` `AWAITING_EXECUTION` → đánh `FAILED` → nộp 300.000 ⟹ 201; ký ⟹ `invoices.cost_center_id` = CC phòng người dùng, `commitment_id` NULL, cam kết giữ `RELEASED`.

### B3B-05 — Hạn “5 ngày làm việc” của PI-2 không tính ngày thanh toán là ngày 1 (D-77 (1) trái `QĐ-104k`(2); cần Owner xác nhận vì T-PI ghi 18/11)

- **Vị trí:** `src/modules/requests/purchase-invoice/purchase-invoice-missing-periods.policy.ts:31-43` (`addWorkingDays`, “the payment day itself never counted”); spec ghim `purchase-invoice-missing-periods.policy.spec.ts:15`, `:28-33`.
- **Kịch bản (ngày):** thanh toán Thứ Ba 10/11/2026 (ngày làm việc). `QĐ-104k`(2): 10/11 là ngày 1 ⟹ ngày 5 = Thứ Hai 16/11 ⟹ “quá 5 ngày” từ **17/11**. Code: hạn 17/11, cờ từ **18/11** ⟹ trễ 1 ngày làm việc ở mọi kỳ (dashboard IT đếm thiếu cả ngày 17/11).
- **Căn cứ:** `QĐ-104k`(2) “ngày phát sinh sự kiện là ngày 1 nếu là ngày làm việc, áp chung cho mọi hạn”; repo đã có `nthWorkingDayFrom` (`core/working-days.ts:41-52`, dùng cho `QĐ-110c/p`). SPEC T-PI (“cờ từ 18/11, chưa cờ 17/11”) mâu thuẫn QĐ-104k(2) ⟹ ghi rõ để Owner chọn; nếu Owner giữ T-PI thì cần ghi ngoại lệ vào QĐ-111x.
- **Sửa:** `invoiceDueDate = nthWorkingDayFrom(paymentDate, 5, nonWorking)`; `lacksInvoice` giữ `today > due`. Cùng quy ước cho hạn nộp/ký 5 ngày nếu sau này có nhắc (B3B-O5).
- **Test:** unit 10/11 ⟹ hạn 16/11, chưa cờ 16/11, cờ 17/11; thanh toán Thứ Bảy 14/11 ⟹ ngày 1 = 16/11, hạn 20/11.

### B3B-06 — Không có cờ *vượt* cho hóa đơn thuê bao/kho `K2` và hóa đơn gia hạn (`QĐ-103w`(3), `QĐ-104c`(3), `QĐ-104d`)

- **Vị trí:** `purchase-invoice-plan.service.ts:221-224` (`overApproved` chỉ khi `commitment !== null`), `:262` (`commitmentOf` trả `null` khi không có Request) ⟹ link `SUBSCRIPTION` không bao giờ có `OVER_APPROVED`.
- **Kịch bản (số):** kho `K2` 10 seat × 200.000 đ/tháng, còn 3 tháng tới ngày gia hạn ⟹ mốc 6.000.000 đ. IT nộp hóa đơn 10 seat × 200.000 đ nhưng net 9.000.000 đ (bị tính 4,5 tháng) ⟹ số lượng/đơn giá khớp ⟹ `MATCHED`, flags `[]`. Gia hạn: hệ thống tính 8 seat ở điểm điều chỉnh, giá gói 200.000 đ, kỳ tháng ⟹ mốc 1.600.000 đ; hóa đơn 10 seat 2.000.000 đ chỉ ra `PRICE_QUANTITY_EXCEPTION` nếu `purchasedQuantity` = 8, không có cờ vượt.
- **Căn cứ:** `QĐ-103w`(3)/`QĐ-103l`: cờ vượt cho `K2` “so với số seat mua × giá tháng × số tháng tới ngày gia hạn”, hóa đơn gia hạn “so với số seat hệ thống tính ở điểm điều chỉnh × giá gói”. SPEC PI-1 chỉ nêu chung “cờ vượt số duyệt” ⟹ khoảng trống SPEC so với QĐ, không có D-n hoãn.
- **Sửa:** `subscriptionFacts` trả thêm mốc tiền (`SubscriptionPeriodApi`: seat mua, giá tháng VND, ngày gia hạn; số seat hệ thống tính của kỳ điều chỉnh) và `read()` đặt `overApproved = netMinor > mốc`; mốc `null` ⟹ không xét (như R-44 “bên chưa biết không xét”).
- **Test:** integration hai ca số trên ⟹ `flags: ['OVER_APPROVED']`; ca đúng mốc ⟹ `[]`.

### B3B-07 — `K4` tính cho phòng người giữ ở tháng kỳ thay vì phòng của Request mua (`QĐ-103k`)

- **Vị trí:** `purchase-invoice-plan.service.ts:114` (`holderBound` gồm `K4`), `:232-253`.
- **Kịch bản (số):** khóa `K4` vĩnh viễn 5.000.000 đ, Request phòng A (cam kết A 5.000.000). Người giữ đang ân hạn điều chuyển sang B (hiệu lực 20/11, `QĐ-110r`); IT nộp 25/11 tháng kỳ 11 ⟹ `holderDayOf` = 25/11 ⟹ CC của B ⟹ ký: `COST_CENTER` B 5.000.000 đ, cam kết A vẫn `HELD` 5.000.000 đ tới khi MF-3 giải phóng ⟹ báo cáo năm hiện 10.000.000 đ cho khoản mua 5.000.000 đ trong khoảng đó, và vĩnh viễn ghi chi phí sai phòng.
- **Căn cứ:** `QĐ-103k` “`K4` vĩnh viễn: chi phí một lần vào phòng của Request mua; cấp lại khóa từ kho không tính tiền” (sửa `QĐ-55b`); SPEC ghi “K1/K4 theo người giữ” ⟹ SPEC lệch QĐ.
- **Sửa:** `holderBound = provisioningType === 'K1'`; `K4` dùng `request.costCenterId`.
- **Test:** unit/integration: `K4` có người giữ khác CC ⟹ `chargedCostCenterId` = CC Request; `K1` giữ hành vi R-51.

---

## Optional

- **B3B-O1 — Trùng số với dòng `invoices` cũ chỉ bị chặn lúc Finance ký** (`purchase-invoice.repo.ts:154-160` chỉ đọc `purchase_invoices`; chặn thật ở `purchase-invoice-recorder.service.ts:52-54` ⟹ 409 `NUMBER_TAKEN` ở `/confirmation`). Hóa đơn ghi tay trước PI-1 (dữ liệu thật/seed, PI-1-O1) cùng (nhà cung cấp, số) vẫn nộp được; `QĐ-103w`(1) muốn chặn ngay lúc nộp. Sửa: thêm `BudgetsApi.invoiceNumberTaken(tx, org, vendor, number)` gọi ở `keep()`. Test: chèn `invoices` cũ số X ⟹ `POST /purchase-invoices` 409.
- **B3B-O2 — Cờ `OVER_APPROVED` bỏ qua hóa đơn đã nộp chưa ký** (`purchase-invoice-plan.service.ts:223` so với `remainingMinor` chỉ trừ hóa đơn đã ký). Cam kết còn 200.000 đ; nộp A 150.000 (không cờ), nộp B 150.000 trước khi A được ký (không cờ) ⟹ tổng 300.000 > 200.000 mà không hóa đơn nào mang cờ. A: trừ thêm tổng net các hóa đơn `SUBMITTED` cùng Request/năm; B: tính lại cờ lúc ký (cột `flags` bị trigger khóa ⟹ cần cột mới). Thiết kế ⟹ Owner chọn.
- **B3B-O3 — Cost Center chịu chốt lúc nộp nên phụ thuộc ngày nộp** (D-74 (3) A, D-75 (6) A; `purchase-invoice-charge.policy.ts:10-14`). Cùng kỳ 11/2026, điều chuyển hiệu lực 16/11: nộp 05/11 ⟹ phòng cũ; nộp 17/11 ⟹ phòng mới (T-PI chỉ phủ ca nộp sau hiệu lực). A: giữ (đơn giản); B: tính lại ở lúc ký khi tháng kỳ đã kết thúc (ngày cuối tháng cố định). Ghi vào PI-1-Q2.
- **B3B-O4 — Phòng chưa có Cost Center ⟹ Finance không ký được** (`invoice.policy.ts:122-124` `UNPLACED` ⟹ `NO_PLACE` 409; CHECK `invoices_place_check` migration `:189-190`). `QĐ-103t`/`QĐ-104k`(4) có dòng *Chưa phân bổ Cost Center*. Sửa: cho phép `cost_center_id` NULL kèm `department_id` (hoặc cột cờ “chưa phân bổ”) như `out-of-process-spend-recorder.service.ts` (booking `UNALLOCATED`).
- **B3B-O5 — Không có nhắc quá hạn 5 ngày (IT nộp, Finance ký) và không có “việc tồn” hóa đơn bị trả chưa nộp lại trên dashboard IT** (`QĐ-103w`(4), `QĐ-103l`; `dashboards/it-admin/it-admin-dashboard-facts.service.ts:16-47` chỉ có `missingInvoicePeriods`). PI-2-O1 chỉ hoãn nhắc của kỳ thiếu hóa đơn. Thêm đếm `returnedNotResubmitted` (đọc `purchase_invoices` `RETURNED` không có bản nộp lại) — rẻ; nhắc cần sweeper D12. SPEC bỏ sót ⟹ để Owner xếp gói.
- **B3B-O6 — Mua trước khi cấp, khác tháng ⟹ nhãn và cờ kỳ lệch nhau** (`purchase-invoice-plan.service.ts:150-155`, `:199`; `purchase-invoice-missing-periods-query.service.ts:144-157`). `K1` 6 tháng: IT mua 28/02, nộp tháng kỳ 02 (chưa cấp ⟹ `startMonth` = 02 ⟹ *Mua mới 1/6*); cấp xong 02/03. PI-2 tính kỳ từ ngày cấp 02/03 ⟹ kỳ 03 không có hóa đơn ⟹ cờ sai ngày 10/03; hóa đơn kỳ 03 nộp sau đó ra *Kỳ 1/6* lần hai; kỳ 08 thành `OUTSIDE_TERM`. Sửa: lấy `startMonth` = tháng của hóa đơn đầu không bị trả nếu sớm hơn tháng cấp (cả ở PI-2), hoặc yêu cầu tháng kỳ ≥ tháng cấp.

## Nit

- **B3B-N1** — `invoices_place_check` là “ít nhất một chỗ” (migration `20261113004500…:189-190`), SPEC nói “hoặc … hoặc”; `spentOf` ưu tiên `cost_center_id` khi có cả hai. Nên `num_nonnulls(commitment_id, subscription_id, cost_center_id) <= 1` (giữ `out_of_process_case_id` đi cùng `cost_center_id`).
- **B3B-N2** — `resubmittedAs` đọc bằng `this.prisma` ngoài transaction trong `resubmit` (`purchase-invoice-submission.service.ts:53`, `purchase-invoice.repo.ts:368-375`); đúng nhờ khóa hàng + unique index, nhưng nên nhận `tx`.
- **B3B-N3** — Hai lần nộp đồng thời cho cùng Request đều ra *Mua mới* (`earlierOf` không khóa Request, `purchase-invoice-plan.service.ts:188-200`); nhãn chỉ hiển thị, không ảnh hưởng tiền.
- **B3B-N4** — `insert` phân biệt `ALREADY_RESUBMITTED`/`NUMBER_TAKEN` bằng `JSON.stringify(meta.target).includes('resubmission')` (`purchase-invoice-submission.service.ts:126-129`): phụ thuộc dạng `meta.target` của driver; sau FIX-A2 tên index là `purchase_invoices_resubmission_key` nên vẫn khớp, nhưng nên so tên constraint cụ thể.
- **B3B-N5** — RC-2.money (`7bbf4bb8`) gộp test và sửa trong một commit nên không chứng minh được “đỏ trước” từ git (D-80 tự khai 9 ca 500 + 2 ca 200); không phải lỗi code.

---

## Phần đúng đã kiểm

- **SoD:** `confirm` chặn `SAME_PERSON` trước khi ghi (`purchase-invoice-confirmation.service.ts:38`) + CHECK `purchase_invoices_person_check` (migration `:84`); trả lại không bị chặn (D-75 (9), đúng QĐ chỉ nói “ký”).
- **Khóa/đồng thời:** `lock` `FOR UPDATE` hàng hóa đơn mua (`purchase-invoice.repo.ts:283-289`) rồi `markConfirmed/markReturned` chỉ từ `SUBMITTED` (`:292-309`) ⟹ quyết một lần; recorder khóa cam kết của Request trước, khóa năm chỉ cho `COST_CENTER` (`purchase-invoice-recorder.service.ts:41-44`, `:149-151`), thứ tự khớp `BudgetYearLockRepo`. Hai lần ký đồng thời có test (`purchase-invoice-decision.integration-spec.ts:276`).
- **Trùng số trong `purchase_invoices`:** kiểm trước + partial unique `WHERE state <> 'RETURNED'` (migration `:95-96`), P2002 ⟹ 409; số của hóa đơn bị trả dùng lại được; nộp lại một lần (`:98-99`).
- **Tiền:** thực chi = net + thuế không khấu trừ (`purchase-invoice-recorder.service.ts:57`, `QĐ-60a`/`QĐ-97d`); cam kết giảm theo giá trước thuế, tối đa phần còn giữ (`invoice.policy.ts:60-72`) ⟹ phần chênh thuế/tỷ giá trừ thêm vào ngân sách còn lại; VND không phần lẻ (`DONG`, `parseMoney` VND); `moneyOf` chặn net ≤ 0, thuế < 0, đơn giá gốc ≤ 0 bằng `MONEY_OUT_OF_RANGE` (`purchase-invoice-plan.service.ts:162-179`) khớp CHECK bảng; mapper gọi `toMoneyApiException` (`purchase-invoice.http-errors.ts:40`).
- **Năm/tháng kỳ:** năm thực chi = năm của tháng kỳ (`expenseYearOf`, `bookPurchaseInvoice` theo `serviceYear`); `spentOf`/`lastRecordedAt`/`priorPeriodAdjustments` `LEFT JOIN` + `COALESCE` (`invoice.repo.ts:181-225`), dòng cũ giữ năm cam kết; hóa đơn tới muộn (02/01/2027 cho 12/2026) vẫn ghi năm 2026 (test `:204`), không có khóa “chốt tháng” chặn ghi.
- **Kho dùng chung qua thuê bao (PI-1c, MG-03 cho link thuê bao):** dòng `SUBSCRIPTION` không `commitment_id`/`cost_center_id` ⟹ không vào `spentOf` phòng (đúng MG-03 A cho hóa đơn nối thuê bao); mọi IT Admin nộp được cho kho (`purchase-invoice-plan.service.ts:124-128`).
- **R-44:** so số lượng + đơn giá gốc + tiền tệ, bên chưa biết không xét (`purchase-invoice-match.policy.ts:111-124`); RC-1 mở cùng transaction khi exception (`confirmation:45`).
- **Nhãn `QĐ-111w`:** *Mua mới*/*Kỳ k/N*/*Kỳ k* (lâu dài, `periodCount` null)/*Gia hạn* (`labels/purchase-invoice-labels.policy.ts:55-70`), hóa đơn bị trả không tính là “hóa đơn trước”.
- **PI-2:** hôm nay và ngày cấp theo múi giờ tổ chức (`purchase-invoice-missing-periods-query.service.ts:82`, `:144`), ngày nghỉ từ tham số vận hành (`:98`), hóa đơn khác `RETURNED` xóa cờ, phân trang sau khi đếm với số câu lệnh cố định (D-77 (7)); Finance thấy hết, IT theo `getItAdminScope` + kho.
- **Kiến trúc:** `requests` chỉ gọi `budgets/catalog/licensing/organization/identity/finance` qua `public/`; `budgets` đọc nhãn/nguồn tiền qua `PurchaseInvoiceFactsHook` (extension point) — grep không thấy import sâu hay query bảng module khác.
- **Wire/OpenAPI:** tiền `{ amount, currency }` (D-75 (1) lệch chữ SPEC `amountMinor` nhưng đúng `docs/rules/api-contract.md` — chấp nhận); không có chuỗi `QĐ-` trong các path `purchase-invoices*`/`budget-commitments/{id}/invoices` của `openapi.json`; `POST /budget-commitments/{id}/invoices` đã biến mất.
- **Migration `20261113004500`:** expand-only, idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS`), `commitment_id DROP NOT NULL` + CHECK bốn chỗ — dòng cũ đều có `commitment_id` nên CHECK hợp lệ; CHECK `document_attachments` mới chỉ nới (thêm chủ `purchase_invoice_id`), không làm hỏng dòng cũ; trigger chặn sửa/xóa sau `CONFIRMED/RETURNED`. **FIX-A2** (`a0442752`) chỉ thêm `map:` tên index trùng tên migration tạo — không đổi schema.
- **Test PI-1.7:** đối chiếu tên `it(` bị xóa/thêm ở `5e5354bc`, `a8f7cdff`: ca “khoản đã giải phóng” đổi đúng luật mới (`QĐ-55b` ⟹ thực chi CC), “không nhà cung cấp” chuyển sang `NO_VENDOR` (`2331867f`), kiểm body chuyển sang route nộp (`1310357b`), ca race số trùng, ghi audit, thuế giữ nguyên ⟹ không mất ca nghiệp vụ; các ca chỉ thuộc route ghi tay (body `note`, `currency` của POST, 403/404 của POST) bỏ cùng route là hợp lý.

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh jest |
| --- | --- | --- | --- |
| `src/modules/requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts` | `if (row.submittedByEmployeeId === actor.employeeId) throw new PurchaseInvoiceRefusedError('SAME_PERSON');` | `if (false) throw new PurchaseInvoiceRefusedError('SAME_PERSON');` | `pnpm test:integration -- test/integration/requests/purchase-invoice-decision.integration-spec.ts` (phải đỏ: 409 thành 500 do CHECK) |
| `src/modules/budgets/budget/invoice.repo.ts` | `SUM(i.actual_cost_minor)::text AS spent` | `SUM(i.net_minor)::text AS spent` | `pnpm test:integration -- test/integration/budgets/budget-purchase-invoice.integration-spec.ts` |
| `src/modules/budgets/budget/invoice.policy.ts` | `ofYear.costCenterId === input.chargedCostCenterId` | `true` | `pnpm test -- src/modules/budgets/budget/invoice.policy.spec.ts` |
| `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts` | `const actualCostMinor = input.netMinor + input.nonDeductibleTaxMinor;` | `const actualCostMinor = input.netMinor + input.deductibleTaxMinor;` | `pnpm test -- src/modules/budgets/invoice/purchase-invoice-recorder.service.spec.ts` |
| `src/modules/requests/purchase-invoice/purchase-invoice-missing-periods.policy.ts` | `return today > invoiceDueDate(paymentDate, nonWorkingDates);` | `return today >= invoiceDueDate(paymentDate, nonWorkingDates);` | `pnpm test -- src/modules/requests/purchase-invoice/purchase-invoice-missing-periods.policy.spec.ts` |
| `src/modules/requests/purchase-invoice/purchase-invoice-plan.service.ts` | `overApproved: commitment !== null && money.netMinor > commitment.remainingMinor,` | `overApproved: commitment !== null && money.netMinor >= commitment.remainingMinor,` | `pnpm test:integration -- test/integration/requests/purchase-invoice.integration-spec.ts` (dự đoán SỐNG: chưa có ca net = còn lại ⟹ thêm ca biên) |
| `src/modules/requests/purchase-invoice/purchase-invoice.repo.ts` | `where: { organizationId, vendorId, number, state: { not: 'RETURNED' } },` | `where: { organizationId, vendorId, number },` | `pnpm test:integration -- test/integration/requests/purchase-invoice.integration-spec.ts` (ca `:364` nộp lại cùng số phải đỏ) |
