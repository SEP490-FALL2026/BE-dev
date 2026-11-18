# AUDIT RV-1 — chốt số hằng tháng, dự kiến cuối năm, đèn (MF-4 phần trong năm, SBF-11)

- **Phạm vi:** `ad5d8589..6b505c26` (86bf0423, 64ba35a7, cae93e4a, a0181290, 56af1c51, b5180aa6, 6baa1318, 6b505c26). Chỉ đọc qua `git show`; không chạy pnpm/jest/docker; không đọc `be-fe-feedback`.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review 5 trục, mức finding), `superpowers:verification-before-completion` (mọi khẳng định có dòng code/tài liệu làm bằng chứng; không tuyên bố test xanh/đỏ vì không chạy).
- **Nguồn đối chiếu:** `Docs/Decisions/project-decisions.md` dòng 515–523 (QĐ-111ae/af/ag/ah/ai), 584–589 (QĐ-103k/r, QĐ-104c/i), 595 (QĐ-111an), 634 (QĐ-99h); `Requiments/Quy trình và chính sách theo main flow.md` dòng 890, 893; `BRD …` dòng 260 (GĐ-8), 1153 (FR-5.17(6)); `BE-UserStory/epics/EP-12.md` dòng 577 (US-12-15 AC-20), 1022 (US-12-21 dữ liệu nghiệp vụ), 1038 (AC-2), 1043 (AC-7); `SBF-11-period-cost-attribution.md` dòng 39; trong repo: `SPEC.md` 487–522, `PLAN.md` 213–217, `R14-PERIODIC-BUDGET-REVIEW.md` §8.3 (dòng 208–244), `OVERNIGHT-DECISIONS.md` D-96 (dòng 1231–1237), RV-1-Q1/Q2 (dòng 67–68), RV-1-O1…O9 (dòng 428–436).

## Kết luận nhanh

Công thức **R-37** (không nhân lại thực chi), **R-52** (chỉ phần tăng), **đèn 110/70 %**, **thứ tự Đỏ → Vàng → Dưới mức → Xanh**, ngày làm việc thứ 5 và trigger bất biến đều đúng tài liệu. T-RV1 tính tay khớp. **Nhưng hệ số chênh k đang đo sai đại lượng**: code lấy (thực chi − **giá trên hóa đơn**) ÷ giá trên hóa đơn, nên chỉ bắt **thuế không khấu trừ**; tài liệu định nghĩa k = (thực chi − **phần giá gốc của cam kết** đã thành chi phí) ÷ phần đó, gồm cả **chênh tỷ giá và phí thẻ**. Theo `QĐ-111an` hai khoản này nằm trong `net_minor`, nên với phần mềm trả USD thì k = 0 và dự kiến cuối năm thấp hơn thực tế (RV1-01, mức Cao). Ngoài ra tốc độ chi dùng thực chi **tại lúc chụp**, không phải **lũy kế đến hết tháng M** (RV1-03), và tăng giá đã biết bỏ sót giá tăng có hiệu lực sau ngày đầu tháng kế (RV1-04).

## Tính tay T-RV1 và ca phân biệt

| Ca | Đầu vào | Tài liệu (R-37) | Code @6b505c26 | "Công thức cũ" |
| --- | --- | --- | --- | --- |
| T-RV1 (QT dòng 893) | cơ sở 300 tr, dự phòng 30 tr, tháng 6, TC 168 tr (160 giá gốc + 8 thuế), CK 135 tr, RQ 0 | k = 8/160 = 5 %; DKCN = 168 + 135 × 1,05 = **309.750.000**; tốc độ 168/(300×6/12) = **112 %**; 300 < 309,75 ≤ 330 ⟹ **Vàng**; còn lại 330 − 168 − 135 = **27 tr** | khớp (`policy.spec.ts:31–38`, integration `budget-review.integration-spec.ts:121–137`) | (168 + 135) × 1,05 = 318.150.000 |
| Ca phân biệt | TC 200 (180 + 20), CK 100 | 200 + 100 × 200/180 = **311.111.111** ⟹ Vàng (≤ 330) | khớp (`policy.spec.ts:47–62`) | 300 × 200/180 = 333.333.333 ⟹ Đỏ |
| AC-2 (EP-12:1038) | 120/12, TC 67 (64 + 3), CK 54, RQ 5 | 67 + 59 × 67/64 = **128.765.625**; tốc độ 111,7 % ⟹ Vàng | khớp (`policy.spec.ts:64–81`, tốc độ làm tròn lên 11.167) | — |
| AC-7 (EP-12:1043) | 4 seat × (1.650.000 − 1.500.000) × 4 tháng | **2.400.000** | khớp (`price.service.spec.ts:55–65`) | — |
| AC-20 (EP-12:577) | 120/12, TC 110, CK 18, tháng 10 | DKCN 128 tr; tốc độ đúng 110 % (không > 110); Vàng vì DKCN > cơ sở; còn lại 4 tr | khớp theo đọc code (`paceOf` trả 11.000, `lightOf` chọn Vàng do DKCN) | — |

**"Công thức cũ"** Sonnet nhắc là (TC + CK) × (1 + k): nhân hệ số chênh vào cả thực chi đã có hóa đơn. US-12-21 AC-2 ghi rõ "số sửa 12/11/2026 theo công thức thực chi + (cam kết + Request chờ) × (1 + hệ số chênh) — R-37". **Công thức mới trong code là công thức đúng tài liệu**: QĐ-111ai viết "hệ số chênh chỉ nhân phần còn mở, không nhân thực chi đã có hóa đơn để thuế/phí không bị tính hai lần (làm rõ R-3, R-37)".

## Findings

### RV1-01 — Cao (Required, tiền) — k chỉ đo thuế; bỏ chênh tỷ giá, phí thẻ và lệch giá so với cam kết

- **File:dòng @6b505c26:** `src/modules/budgets/budget/invoice.repo.ts:209–231` (`priceBasisOf`: `SUM(i.net_minor)` làm mẫu số, dòng 221); `src/modules/budgets/review/budget-review.policy.ts:22–26` (`variancePpm`), `:39–41` (`forecastOfYear` nhân `actual ÷ net`); `review/budget-review-figures.service.ts:47, 60–61`. Nguồn số: `budget/invoice.policy.ts:46–65`: `actualCostMinor = net + nonDeductibleTax`, và theo chú thích dòng 46–47 "the exchange rate and the card fee go straight into what was spent" — nghĩa là vào `net_minor`.
- **Kịch bản bằng số:** Cost Center trả phần mềm USD. Cơ sở 300 tr, dự phòng 30 tr, chốt **tháng 9**. Cam kết ghi giá gốc 180 tr; số VND thực bị trừ là 200 tr (chênh tỷ giá + phí thẻ 20 tr, không có thuế không khấu trừ) ⟹ hóa đơn có `net_minor` 200 tr, `actual_cost_minor` 200 tr. CK còn giữ 100 tr.
  - Theo tài liệu: k = (200 − 180)/180 = 11,11 % ⟹ DKCN = 200 + 100 × 1,1111 = **311.111.111** > 300 ⟹ **Vàng**. Tốc độ = 200/(300 × 9/12) = 88,9 %.
  - Theo code: k = (200 − 200)/200 = **0** ⟹ DKCN = **300.000.000**, không > 300; tốc độ 88,9 % ⟹ **Xanh**. Phòng không phải giải trình ở kỳ quý (QĐ-111ah) và sàn *Trả lại*/*Chuyển* của AD-1 (QĐ-111ag: sàn = dự kiến cuối năm) thấp hơn **11,1 tr**.
  - Ví dụ thật trong code: T-PI của B3B-02 (D-n dòng 1147): cam kết 3.750.000, VND thực trừ 3.840.000 ⟹ tài liệu k = 90.000/3.750.000 = **2,4 %**, code k = **0**.
- **Căn cứ:**
  - QĐ-111ai: "hệ số chênh thực tế (**thực chi so với cam kết** từ đầu năm)".
  - US-12-21 (EP-12:1022): "hệ số chênh thực tế = (TC − **phần giá gốc của cam kết đã thành chi phí**) ÷ phần giá gốc đó".
  - SPEC RV-1 (dòng 499): "k = (Σ thực chi − Σ giá gốc đã thành chi phí) ÷ Σ giá gốc đã thành chi phí".
  - BRD GĐ-8 (dòng 260): "Giá VND nhập lệch ⟹ cam kết lệch thực chi; phần lệch hiện ở `SBF-11a` **và ở hệ số chênh thực tế** của dự kiến cuối năm".
  - R14 §8.3 (dòng 213): "hệ số chênh = (thuế không khấu trừ + **phí thẻ + chênh tỷ giá** từ đầu năm) ÷ phần giá gốc đã thành chi phí".
  - D-96 (2) tự chọn `net_minor` mà không nêu `QĐ-111an`; khi tạm chốt, D-96 không đối chiếu GĐ-8.
- **Cách sửa:** đổi mẫu số sang **giá gốc theo cam kết** của phần đã hóa đơn, không dùng `net_minor`. Không dùng thẳng `applied_minor` được: `planInvoice` lấy `take = min(net, held)` nên các hóa đơn đầu "nuốt" phần chênh của các tháng sau, và applied chỉ lệch net ở hóa đơn cuối. Hai cách:
  - (a) Với hóa đơn có `commitment_id`, `service_month` và cam kết có `seat_monthly_minor`: giá gốc = `seat_monthly_minor × số seat × số tháng dịch vụ` của hóa đơn.
  - (b) Đơn giản hơn: chỉ tính trên các cam kết đã `EXPENSED`, với giá gốc = `amount − released`, thực chi = Σ `actual_cost_minor` của hóa đơn cam kết đó.
  - Nếu Owner muốn giữ k chỉ đo thuế thì phải sửa GĐ-8, US-12-21, SPEC và R14 cho khớp code. Việc này cần **ghi vào §Chờ Owner** (đề xuất mã RV-1-Q3). Hiện code mâu thuẫn với 4 tài liệu.
- **Test/mutation:** thêm vào `budget-review.integration-spec.ts` một ca có hóa đơn `net 200 tr` gắn cam kết `amount 180 tr` (để `applied` 180 tr), CK 100 tr, tháng 9 ⟹ kỳ vọng `forecast 311111111`, `light YELLOW`. Code hiện tại sẽ đỏ (300.000.000, GREEN). Mutation M4 bên dưới hiện **sống**, chứng minh test chưa ghim được k.

### RV1-02 — Trung bình — mẫu số của k gồm cả hóa đơn không có cam kết (ngoài quy trình, PI-1)

- **File:dòng:** `budget/invoice.repo.ts:219–224`: `WHERE` không lọc `i.commitment_id IS NOT NULL`. `budget/invoice/out-of-process-spend-recorder.service.ts:53–57` ghi `net = actual = amount`, `applied 0`.
- **Kịch bản:** hóa đơn theo cam kết có net 160 tr, thuế 8 tr; cộng 40 tr chi ngoài quy trình (net = actual) ⟹ TC 208 tr, CK 135 tr, cơ sở 300 tr.
  - Tài liệu: k = 8/160 = 5 % ⟹ DKCN = 208 + 141,75 = **349.750.000**.
  - Code: k = 8/200 = 4 % ⟹ DKCN = 208 + 140,4 = **348.400.000**, thấp hơn 1,35 tr.
  - Khi số gần mép Đỏ 330 + x thì đèn có thể đổi màu.
- **Căn cứ:** như RV1-01 ("phần giá gốc **của cam kết**").
- **Cách sửa:** gộp vào bản sửa RV1-01: chỉ hóa đơn có cam kết mới vào mẫu số k. Thực chi TC vẫn gồm mọi hóa đơn.
- **Test:** ca trên trong integration, kỳ vọng `variancePpm 50000`.

### RV1-03 — Trung bình (Required) — tốc độ chi và cột "thực chi" lấy số tại lúc chụp, không phải lũy kế đến hết tháng M

- **File:dòng:** `review/budget-review-figures.service.ts:45, 57` (`commitments.totals(…, true).spent`, tức `InvoiceRepo.spentOf` `invoice.repo.ts:179–202`, gom cả năm không cắt `service_month ≤ M`); `budget-review.policy.ts:65–71` (`paceOf` chia cho `cơ sở × M ÷ 12`). Quyết định ghi ở D-96 (3).
- **Kịch bản:** cơ sở 300 tr, đến hết tháng 6 TC = 150 tr (tốc độ đúng 150/150 = **100 %**). Ngày 01–06/07 IT ghi hóa đơn tháng 7 (`service_month` 07) 25 tr và cam kết giảm 25 tr. Finance chốt tháng 6 ngày 07/07.
  - Code: TC = 175 tr ⟹ tốc độ = 175/150 = **116,7 %** > 110 % ⟹ **Vàng**.
  - Đúng tài liệu: tốc độ = 100 % ⟹ **Xanh** (DKCN không đổi vì tổng TC + CK như nhau).
  - Nếu chốt muộn (RV-1-Q2 = A cho phép), ví dụ chốt tháng 6 vào 10/11, TC đã chứa tháng 7–10 ⟹ tốc độ vô nghĩa. Ảnh chụp tháng 6 lúc đó còn phụ thuộc **ngày bấm chốt**.
- **Căn cứ:** US-12-21 (EP-12:1022): "**thực chi lũy kế** (TC, theo kỳ dịch vụ) … tốc độ chi = TC ÷ (số cơ sở × M ÷ 12)"; R14 §8.3 dòng 210: "TC = thực chi lũy kế theo kỳ dịch vụ"; SPEC dòng 495: "thực chi **theo tháng kỳ**"; R14 dòng 27: "thực chi phải theo năm kỳ dịch vụ … thiếu hai việc này thì **tốc độ chi sai**".
- **Cách sửa:** giữ DKCN trên tổng (lý do của D-96 (3) đúng cho DKCN). Thêm `spentThroughMonthMinor` cho tốc độ và cột hiển thị: `spentOf(pairs, tx, throughMonth)` lọc `service_month < nextStart(M)` và `seat_month_charges.month ≤ M`. Hóa đơn không có `service_month` thì dùng `issued_on`. Lưu thêm cột `spent_after_month_minor` (expand) để TC (lũy kế đến M) + phần sau M + CK không lệch.
- **Test:** integration: hóa đơn `service_month = 07` ghi trước khi chốt tháng 6 ⟹ `paceBasisPoints 10000`, `light GREEN`, `forecast` không đổi.

### RV1-04 — Trung bình — tăng giá đã biết chỉ nhìn giá ngày đầu tháng kế; giá tăng đã nhập có hiệu lực muộn hơn bị bỏ

- **File:dòng:** `review/budget-review-price.service.ts:44–48, 72` (`getPlanPrice(planId, tx, from)` với `from` = ngày đầu tháng M+1, `figures.service.ts:43`). RV-1-O9 có ghi nhận nhưng xếp Optional.
- **Kịch bản:** biến thể AC-7. IT nhập giá Adobe 1.650.000 có hiệu lực **01/10/2027** (nhập từ 20/08). Finance chốt tháng 8 ngày 08/09.
  - Tài liệu: tăng giá đã biết = 150.000 × 4 seat × 3 tháng (10 → 12) = **1.800.000**.
  - Code: giá tại 01/09 vẫn là 1.500.000 ⟹ **0**. DKCN thiếu 1,8 tr.
- **Căn cứ:** QĐ-111ai/R-52 "tăng giá **đã biết**"; US-12-21 (EP-12:1022) "(giá gói mới − giá trong cam kết) × số seat × số tháng còn lại". Giá mới đã nằm trong danh mục lúc chốt.
- **Cách sửa:** với mỗi tháng m ∈ (M, 12] tính `max(0, giá(m) − giá cam kết)`, rồi cộng theo số tháng mà cam kết còn phủ. Một câu đọc các kỳ giá của gói trong khoảng [`from`, 31/12] qua `CatalogApi` (thêm hàm public đọc lịch giá) thay cho N lần `getPlanPrice`.
- **Test:** spec giá: giá 1.650.000 từ `2027-10-01`, chốt tháng 8 ⟹ 1.800.000.

### RV1-05 — Thấp — số seat-tháng còn phủ làm tròn lên theo `beneficiaryCount`, có thể thổi phồng

- **File:dòng:** `budget-review-price.service.ts:53–60` (`covered = ceil(held ÷ (seats × seatMonthly))`, sau đó dùng `seats × monthsLeft`).
- **Kịch bản:** 4 seat, `seat_monthly` 1.500.000, còn giữ 20 tr (một seat đã thu hồi sớm và được giải phóng một phần).
  - Code: ceil(20/6) = 4 ⟹ 4 × 4 × 150.000 = **2.400.000**.
  - Số seat-tháng thật = 20/1,5 = 13,33 ⟹ **2.000.000**. Lệch 400.000.
- **Cách sửa:** seat-tháng = min(held ÷ seat_monthly, seats × (12 − M)), rồi tăng = rise × seat-tháng, làm tròn nửa ra xa 0 một lần. Đổi `PriceIncreaseItem` sang `seatMonths` (giữ AC-7 = 2.400.000 vì 24/1,5 = 16 = 4 × 4).
- **Test:** ca 20 tr ⟹ 2.000.000.

### RV1-06 — Trung bình — không hiện "thay đổi sau ảnh chụp" (QĐ-111ae)

- **File:dòng:** `review/budget-review-query.service.ts:133–154` (`lineWires` chỉ đọc số đã chụp); trong `budget-review.dto.ts` không có trường nào cho thay đổi sau chụp.
- **Kịch bản:** tháng 6 chốt ngày 07/07 với TC 168 tr. Ngày 20/07 ghi hóa đơn muộn `service_month` 05, 10 tr.
  - Chi tiết kỳ 6 vẫn hiện 168 tr, không có dấu hiệu gì. Kỳ 7 hiện 178 tr nhưng không phân biệt 10 tr là của tháng 5.
  - Test R-2 (`budget-review.integration-spec.ts:165–177`) chỉ khẳng định ảnh chụp đứng yên.
- **Căn cứ:** QĐ-111ae: "hóa đơn tới muộn vẫn ghi, **hiện là thay đổi sau ảnh chụp** (làm rõ R-2)". SPEC chỉ viết "kỳ sau thấy thay đổi", yếu hơn QĐ.
- **Cách sửa:** ở `GET /budget-review-periods/{id}`, mỗi dòng có `changedAfterSnapshot` = Σ `actual_cost_minor` của hóa đơn thuộc Cost Center với `service_month ≤ M` (năm đó) và `recorded_at > snapshot_at`. Tính lúc đọc, không lưu, nên không đụng trigger. Một câu `GROUP BY` cho cả trang.
- **Test:** ca trên ⟹ kỳ 6 dòng A có `changedAfterSnapshot 10000000`, số chụp vẫn 168 tr.

### RV1-07 — Thấp — trigger không chặn INSERT dòng mới vào kỳ đã có (kể cả kỳ đã ký)

- **File:dòng:** `prisma/migrations/20261113101700_rv1_budget_review_periods/migration.sql:96–97` (`BEFORE UPDATE OR DELETE`, không có `INSERT`).
- **Kịch bản:** `INSERT INTO budget_review_lines (…, period_id = <kỳ 6 đã SIGNED>, forecast_minor = 999…)` được chấp nhận. Bảng đèn của kỳ đã ký đổi từ "1 Vàng" thành "1 Vàng + 1 Đỏ" mà UPDATE/DELETE đều bị chặn. Ứng dụng hiện chỉ chèn trong cùng transaction tạo kỳ (`budget-review.repo.ts:121–129`), nên lỗ hổng chỉ còn ở tầng DB.
- **Căn cứ:** QĐ-111ae "ảnh chụp không sửa"; chú thích của chính migration ở dòng 75.
- **Cách sửa:** migration mới (expand): thêm trigger `BEFORE INSERT` trên `budget_review_lines`, chỉ cho chèn khi kỳ được tạo trong **chính transaction hiện tại**, tức `(SELECT xmin FROM budget_review_periods WHERE id = NEW.period_id)::text::bigint = txid_current() % 2^32`. Nếu không thì cách tối thiểu là từ chối khi kỳ đã `SIGNED`.
- **Test:** integration bảng: INSERT vào kỳ `SIGNED` ⟹ lỗi `/keeps its picture/`.

### RV1-08 — Thấp — kỳ quý ký thẳng từ `SNAPSHOT` khi RV-3 chưa có: mất cửa sổ giải trình 5 ngày làm việc

- **File:dòng:** `review/budget-review.repo.ts:250–256` (`state in [SNAPSHOT, AWAITING_EXPLANATIONS]`); `budget-review-signature.service.ts:40`. RV-1-O8 có ghi nhận.
- **Kịch bản:** chốt tháng 6 (`QUARTER`) ngày 07/07, Finance ký ngay. Phòng Vàng không còn đường giải trình. Khi RV-3 lên, kỳ này đã `SIGNED` và trigger cấm đổi, nên không thể ghi *chưa giải trình*/*phòng chưa có trưởng phòng*.
- **Căn cứ:** QĐ-111ah (chỉ phòng Vàng/Đỏ/Dưới mức giải trình, hạn 5 ngày làm việc; biên bản ghi *chưa giải trình*).
- **Cách sửa:** cho tới RV-3, ký kỳ `QUARTER` ⟹ 422 `BUDGET_REVIEW.QUARTER_NEEDS_EXPLANATIONS`, hoặc Owner chấp nhận rủi ro bằng cách ghi rõ vào §Chờ Owner.
- **Test:** integration: ký kỳ tháng 6 ⟹ 422, ký kỳ tháng 7 ⟹ 200.

### RV1-09 — Thấp — chốt được tháng của năm không có ngân sách; kỳ rỗng không xóa được; số công ty/kho đọc ngoài transaction

- **File:dòng:** `review/budget-review-snapshot.service.ts:58–70`: không kiểm năm có phiên bản/chu kỳ; `linesOf` trả `[]` (`figures.service.ts:40`) nhưng kỳ vẫn được ghi. Các dòng 65–69 đọc `poolWatch.figuresOf` và `companySpentMinor` **trước** transaction (RV-1-O3).
- **Kịch bản:** Finance chốt nhầm `{year: 2025, month: 12}` (năm trước khi dùng hệ thống) ⟹ 201, kỳ 0 dòng, summary "0 Xanh, 0 Vàng…". Trigger chặn DELETE nên không dọn được.
- **Cách sửa:** năm không có `budget_cycles` hoặc không có phiên bản tham chiếu nào ⟹ 422 `BUDGET_REVIEW.NO_BUDGET_FOR_YEAR`. Đọc số công ty và dòng kho trong cùng `tx` (Repeatable Read nếu runner cho phép).
- **Test:** HTTP/integration năm không có ngân sách ⟹ 422.

### RV1-10 — Thấp/Nit — đọc ngoài transaction và tuần tự

- **File:dòng:** `budget-review-price.service.ts:43` (`requestFacts.get().factsOf(...)` không truyền `tx`); `:70–76` (`getPlanPrice` từng gói tuần tự, RV-1-O9).
- **Ảnh hưởng:** ảnh chụp lấy seat/plan ở snapshot khác với cam kết. Mỗi gói tốn 1 câu, N gói ⟹ N câu. Gộp vào bản sửa RV1-04.

### RV1-11 — Thấp — lỗ test

1. Spec giá không có ca `12 − M < covered`, nên mutation `12 - month` → `13 - month` **sống** (AC-7: min(5, 4) = 4; ca 2 tháng: min(5, 2) = 2; tháng 12 thoát sớm).
2. Test trigger (`budget-review-table.integration-spec.ts:115–128`) không có `invoice_actual_minor`.
3. Không có test cho 409 `SEAT_MONTHS_NOT_READY`, năm chưa có ngân sách, chốt tháng 1 (tốc độ = TC ÷ (cơ sở/12)), chốt tháng 12 qua route (tăng giá = 0), Cost Center có cơ sở 0 (tốc độ `null`).
4. T-RV1 integration chèn hóa đơn với `applied_minor = net_minor` (`budget-review.integration-spec.ts:84–86`), nên không phân biệt được định nghĩa k (RV1-01).
5. Không chứng minh được đỏ-trước từ git: policy và spec cùng commit 86bf0423.

## RV-1-Q1 / RV-1-Q2 (Chờ Owner)

- **RV-1-Q1 — đề xuất A (giữ):** QĐ-99h nói "bản tóm tắt hằng tháng … kèm bảng đèn" và QĐ-111ae nói "Người duyệt chi xem bảng đèn trong bản tóm tắt hằng tháng". Tháng 3/6/9 cũng là tháng. Ghi chú: tóm tắt hiện chỉ có **số đếm** theo đèn (`signature.service.ts:69–85`), còn "bảng đèn ngân sách các phòng" là bảng theo phòng. Người duyệt chi mở được `GET /{id}` (vai `SPENDING_APPROVER`), nên chấp nhận được.
- **RV-1-Q2 — đề xuất A, có điều kiện sửa RV1-03:** không bắt chốt theo thứ tự là hợp với R-2. Nhưng chừng nào thực chi còn lấy "tại lúc chụp" thì chốt muộn hoặc lệch thứ tự cho ra tốc độ sai (RV1-03).

## Phần đúng đã kiểm

- `forecastOfYear` = TC + round((CK + RQ) × actual ÷ net) + tăng giá (`policy.ts:33–44`), không nhân TC, đúng QĐ-111ai/R-37. Làm tròn một lần, nửa ra xa 0.
- `knownPriceIncrease` chỉ cộng `rise > 0` (`policy.ts:50–59`), đúng R-52. Giá năm/quý quy về tháng làm tròn lên giống cam kết.
- `paceOf` làm tròn lên để "> 110 %" đúng tới từng đồng (`policy.ts:65–71`). `lightOf` (`:77–94`): Đỏ `> cơ sở + dự phòng`, Vàng `> cơ sở` hoặc tốc độ `> 11.000`, Dưới mức `M ≥ 6` và `DKCN × 100 < 70 × cơ sở`, đúng QĐ-111af. Các hằng số là hằng, không phải tham số (R-5, R-47).
- `remainingMinor` = cơ sở + dự phòng − TC − CK − RQ, khớp AC-20 (4 tr) và R14 dòng 238.
- `reviewReminderFor`: ngày làm việc thứ 5 theo lịch nghỉ của tham số vận hành và múi giờ tổ chức (`facts.today`); tháng 1 hỏi tháng 12 năm trước. Event key `budgetReviewDue:<năm>-<tháng>` giúp nhiều instance an toàn. Timer `unref`, lượt lỗi chỉ log. Đã ghi vào `docs/rules/security-jobs.md:214`.
- Cảnh báo kho: `sharedPoolOverReserve` dùng `>`, reserve `null` ⟹ không báo. Event key theo tháng nên mỗi tháng còn vượt báo một lần, không trùng giữa lần chốt và lượt chạy theo giờ (QĐ-104i).
- Chỉ Finance chốt/ký: `@RequireRoles('FINANCE')` cùng `requireFinance`. GET cho FINANCE/SPENDING_APPROVER/MANAGER; trưởng phòng chỉ thấy dòng và số đếm của Cost Center phòng mình, `company = null`, id ngoài phạm vi ⟹ 404 (D8). Ký một lần qua `updateMany` có điều kiện state ⟹ 409. Chốt trùng: kiểm trước, kiểm lại trong tx và unique ⟹ 409.
- Ảnh chụp không khóa dữ liệu: không giữ khóa năm/`budget_cycles`. `chargeMonth` được tính lại trước khi chụp (SM-1, D-95).
- Migration 101700: `IF NOT EXISTS`, `DROP … IF EXISTS` trước khi tạo FK/trigger, `CREATE OR REPLACE FUNCTION` nên chạy lại an toàn. Trigger dòng chặn UPDATE mọi cột số, DELETE và TRUNCATE. Trigger kỳ chặn sửa số, chặn mọi UPDATE sau `SIGNED`, trạng thái chỉ đi tới. CHECK `kind` gắn với tháng 3/6/9, `signed_*` đi cùng `SIGNED`. `remaining_minor` không có CHECK ≥ 0, đúng vì còn lại có thể âm.
- Kiến trúc: `budgets/review/` có 17 file (≤ 25). Chỉ import `catalog/public`, `notifications/public`, `operating-parameters/public`, `audit/public`. SQL thô chỉ chạm bảng của `budgets`. `planId` đi qua extension point `CommitmentRequestFactsHook`. Có `PRISMA_MODEL_OWNER` cho 2 model. Không có "QĐ-" nào trong `openapi.json`. Danh sách và chi tiết đều phân trang (dòng ≤ 100, Đỏ lên trước). Số đèn tính bằng một `groupBy` cho cả trang.

## Mutation đề xuất

| # | File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh jest | Kỳ vọng |
| --- | --- | --- | --- | --- | --- |
| M1 | `src/modules/budgets/review/budget-review.policy.ts` | `const open = input.committedMinor + input.pendingMinor;` | `const open = input.committedMinor;` | `pnpm jest src/modules/budgets/review/budget-review.policy.spec.ts` | đỏ (AC-2 128.765.625) |
| M2 | `src/modules/budgets/review/budget-review.policy.ts` | `if (input.forecastMinor > input.baseMinor + input.reserveMinor) return 'RED';` | `if (input.forecastMinor >= input.baseMinor + input.reserveMinor) return 'RED';` | như M1 | đỏ (330 tr phải Vàng) |
| M3 | `src/modules/budgets/review/budget-review-price.service.ts` | `monthsLeft: Math.min(12 - month, covered),` | `monthsLeft: Math.min(13 - month, covered),` | `pnpm jest src/modules/budgets/review/budget-review-price.service.spec.ts` | **hiện SỐNG** (RV1-11.1); sau khi thêm ca held 36 tr, tháng 8 ⟹ đỏ |
| M4 | `src/modules/budgets/budget/invoice.repo.ts` | `SUM(i.net_minor)::text AS net, SUM(i.actual_cost_minor)::text AS actual` | `SUM(i.applied_minor)::text AS net, SUM(i.actual_cost_minor)::text AS actual` | `pnpm test:integration -- test/integration/budgets/budget-review.integration-spec.ts` | **hiện SỐNG** vì T-RV1 chèn `applied = net` (RV1-01, RV1-11.4) |
| M5 | `src/modules/budgets/review/budget-review.policy.ts` | `if (input.month >= UNDER_FROM_MONTH && input.forecastMinor * 100n < UNDER_PERCENT * input.baseMinor) return 'UNDER';` | `if (input.month > UNDER_FROM_MONTH && input.forecastMinor * 100n < UNDER_PERCENT * input.baseMinor) return 'UNDER';` | như M1 | đỏ (tháng 6 phải Dưới mức) |
| M6 | `prisma/migrations/20261113101700_rv1_budget_review_periods/migration.sql` | `OR NEW.invoice_net_minor IS DISTINCT FROM OLD.invoice_net_minor OR NEW.invoice_actual_minor IS DISTINCT FROM OLD.invoice_actual_minor` | `OR NEW.invoice_net_minor IS DISTINCT FROM OLD.invoice_net_minor` | `pnpm test:integration -- test/integration/budgets/budget-review-table.integration-spec.ts` | **hiện SỐNG** (RV1-11.2) |
| M7 | `src/modules/budgets/review/budget-review-reminder.service.ts` | ``eventKey: `budgetReviewDue:${due.year}-${String(due.month).padStart(2, '0')}`,`` | ``eventKey: `budgetReviewDue:${Date.now()}`,`` | `pnpm test:integration -- test/integration/budgets/budget-review-signature.integration-spec.ts` | đỏ (ca "once") |

Không chạy mutation nào ở lượt này (chỉ đọc). Cột "kỳ vọng" là suy luận từ việc đọc spec ở @6b505c26.
