# AUDIT P3 · FIX-B1 · X — verify các commit sửa vùng Request + tiền (`5289ceb3`, `99cbf62b`, `48daec50`, `f6375f31`, `f1ad3772`, phần requests của `61e910fc`)

Reviewer chỉ đọc, 15/11/2026. Đọc qua `git show` trên `feat/fe-feedback` và file thường ở bản sạch `be-verify` = `47fb5097`. Không chạy pnpm/jest/docker;
mọi kết luận dưới đây từ đọc code. "Xanh/đỏ" là **dự đoán** có lý do, không phải kết quả chạy.

**Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (khung 5 trục, mức Critical/Required/Optional/Nit — process + review),
`superpowers:verification-before-completion` (mỗi kết luận kèm file:dòng; không tuyên bố test xanh khi chưa chạy).

**Nguồn đối chiếu:** `QĐ-103f`(1)(3) (tháng lịch, tháng gửi tính đủ một tháng; thời hạn bắt đầu khi cấp xong), `QĐ-104a`, `QĐ-106b`, `QĐ-111i`
(`K1` 1–9, `K4` không hỏi, cắt tại hợp đồng, R-39 "mỗi tháng đã bắt đầu"), `QĐ-111j`, `QĐ-111ak`, `QĐ-111an`, `QĐ-111l`
(`Docs/Decisions/project-decisions.md:371,377,381,398,399,401`); BRD `INV-07`; finding gốc `AUDIT-P3-B1-B.md` (B-C1, B-R1, B-R2),
`AUDIT-P3-B1-A.md` (B1A-01, B1A-04); `OVERNIGHT-DECISIONS.md@47fb5097` D-41 → D-47.

## Kết luận từng finding gốc

| Finding | Commit | Kết luận | Ghi chú |
| --- | --- | --- | --- |
| B-C1 (Critical) | `5289ceb3` | **SỬA CHƯA ĐỦ** | Lỗi gốc đã hết: hết hạn đúng ngày trả 0, qua năm hết hạn trả 0, _Dùng lâu dài_ giữ 12 tháng, licensing tự đọc bảng của nó. Còn **FX1-R1** (cửa sổ tháng lệch muộn một tháng ⟹ rời đi giữa kỳ trả thừa ~nửa tháng, bậc 14/06 → 15/06) và **FX1-R2** (2 suite test "bom hẹn giờ"). |
| B-R1 (Required) | `99cbf62b` | **ĐÃ SỬA ĐÚNG** | Mọi đường gửi (mới, nháp, tiếp tục, nhóm, đề xuất, preview) và lệnh cấp đều chặn; biên `contractEnd = start` vẫn được. Còn **FX1-R4** (OpenAPI của 2 route chính không khai mã mới). |
| B-R2 (Required) | `48daec50` | **ĐÃ SỬA ĐÚNG** ở hoàn tất đánh giá | `K1` > 9 / không tháng ⟹ 422, `K4` ⟹ xóa tháng + audit, không ghi gì khi từ chối. Còn **FX1-R3**: đường `catalog-link` cùng gốc (kiểu cấp đổi sau khi tháng đã chốt) chưa kiểm. |
| B1A-01 (Required) | `f6375f31` | **ĐÃ SỬA ĐÚNG** | Khoản 01/01 + `nextYearBudget` không còn đọc 14.000 cent là đồng; nhóm lọc `currency`; audit `YEAR_START_SAVED_AMOUNT_IGNORED`. Optional FX1-O3 về số tháng của cách tính dự phòng. |
| B1A-04 (Required) | `f1ad3772` | **ĐÃ SỬA ĐÚNG** | 4.550.000 → 4.200.000; đóng 31/03 ⟹ 3 × 600.000; `min(…, số đã lưu)`; ngoại tệ không đọc. Optional FX1-O4 (giá tháng của khoản 01/01 để trả lại theo ngày vẫn là giá 01/01). |
| `61e910fc` (dời test) | — | **Không mất, không nới assertion** | Hai ca B1A-04 rời `year-start-commitments-batch.service.spec.ts` sang `…-batch-closing.service.spec.ts` giữ nguyên `amountMinor: 1_800_000n, seatMonthlyMinor: 650_000n` và `3n * 650_000n`; file mới thêm 2 ca (không đóng sớm ⟹ 4.200.000; không có giá duyệt ⟹ 4.200.000). Chỉ rút gọn một comment. |

Tóm tắt mức: Critical mới **0** · Required mới **4** (FX1-R1 … FX1-R4) · Optional **6** · Nit **2**.

## Đi lại kịch bản bằng số (B-C1)

Giá `K1` 600.000/tháng, `termMonths = 3`, duyệt + cấp 15/03/2026 ⟹ `amount_months = 3` (`monthsBeginningIn`: 15/03, 15/04, 15/05), seat
`expected_end_date = 14/06` (`provisioning-grant-writer.service.ts:304`), `access_requests.expected_end_date = NULL`.
`coverageEndOf` (`seat-release.policy.ts:33-41`) ⟹ `endDate = 14/06`; `firstMonthOf` = 6 − 3 + 1 = **4**, `lastMonthOf` = **6**.

| Kịch bản | Code tại `47fb5097` | Đúng theo `QĐ-103f`/R-39 (tháng bắt đầu: 3, 4, 5) | Kết luận |
| --- | --- | --- | --- |
| Thu hồi hoàn tất 15/06 (RQ-3, K1 `paidThroughOn` 14/06 ⟹ `endsOn` 15/06) | 0 (`seat-release.policy.ts:107`) | 0 | đúng |
| Thu hồi hoàn tất 14/06 | 600.000 − 13/30 × 600.000 = **340.000** (test ghim ở `seat-release.policy.spec.ts:119-122`) | ≈ 1 ngày | trả thừa 16/30 tháng — FX1-R1 |
| Rời đi 20/04 (K2, `endsOn` 20/04) | 1.800.000 − 19/30 × 600.000 = **1.420.000** (test ghim `commitment-release-by-day…:303-317`) | 11/30 tháng 4 + tháng 5 = 820.000; thực chưa dùng 20/04–14/06 ≈ 1.096.000 | trả thừa ≈ 324.000 so với thực — FX1-R1 |
| Qua năm: `K1` 9 tháng duyệt + cấp 15/11/2026, seat hết 14/08/2027; `YEAR_START` 2027 giữ 7 × 600.000 = 4.200.000 (số đã lưu, `QĐ-111ak`) | hết hạn 15/08/2027 ⟹ 0 (đúng); rời đi 01/02/2027 ⟹ `first = 1` (`:61`), `last = 8` ⟹ 7 × 600.000 = **4.200.000 = toàn bộ** | 7 tháng giữ là Jan–Jul ⟹ trả Feb–Jul = 3.600.000, giữ 600.000 cho tháng 1 đã dùng | trả thừa một tháng — FX1-R1 |
| `K2` cấp trễ: duyệt 15/03, cấp 01/04, seat 01/04–30/06 | `first = 4`, cấp tháng 4 ngày 1 ⟹ 0 | 0 (3 tháng cam kết đủ cho 3 tháng seat) | đúng (D-41(4)) |
| _Dùng lâu dài_ (`term_months` NULL) | `endDate = null` ⟹ 12 (test `:319`) | 12 | đúng |
| Request tiếp tục R7 | `new_expected_end_date` thắng (`coverageEndOf` dòng 38); R6 lấy ngày của seat gốc (gia hạn tạo successor, không sửa `expected_end_date` của seat cũ: `assignment-renewal.service.ts:63-82`, `assignment.repo.ts:163-171` là chỗ ghi duy nhất sau insert) | — | đúng, không trả hai lần |
| Hợp đồng cắt ở 30/04 lúc cấp (R-38) | seat hết 30/04, `amount_months` = 2 ⟹ `first = 3`, `last = 4` | Mar–Apr | đúng |
| Chuyển phòng (`TRANSFER_EFFECTIVE`) | cùng công thức, `RightChain.grantedEndDate` truyền đủ ở `afterTransferEffective`/`afterRightReplaced` | — | đúng hướng, **không có test** (FX1-O1) |

Idempotent không đổi (tham chiếu `revocationTask:<id>`, `transfer:<id>:assignment:<id>`); tiền vẫn bigint; ngày lấy `to_char(…,'YYYY-MM-DD')` theo lịch
tổ chức. Kiến trúc: `requests` chỉ đọc `access_requests`, `access_request_renewals` (`seat-release.repo.ts:35-42`); `licensing` đọc `provisioning_tasks`,
`license_assignments` của chính nó (`assignment-chain.repo.ts:22-36`); kiểu mới đi qua `licensing/public/licensing.types.ts`. Trần file/thư mục:
`requests/access-request` 25, `licensing/provisioning` 25, `requests/assessment` 24 — đủ, hết chỗ.

---

## Required (mới)

### FX1-R1 — Required — Cửa sổ tháng của cam kết đếm lùi từ **tháng của ngày kết thúc seat** (giữa tháng) ⟹ lệch muộn một tháng so với các tháng đã tính tiền; rời đi giữa kỳ trả thừa, có bậc 14/06 → 15/06

- **Vị trí (`47fb5097`):** `src/modules/requests/grant/seat-release.policy.ts:48-54` (`lastMonthOf` = tháng của `endDate`), `:60-65` (`firstMonthOf`:
  APPROVAL đếm lùi; `YEAR_START` luôn 1), `:106-107` (luật mới `endsOn > endDate ⟹ 0` của D-41(3)); test ghim số thừa:
  `seat-release.policy.spec.ts:119-122`, `test/integration/budgets/commitment-release-by-day.integration-spec.ts:303-317` và công thức gương ở `:344-375`.
- **Kịch bản:** xem bảng trên. Trước RQ-2, ngày kết thúc lấy từ body thường là cuối tháng nên "tháng của ngày kết thúc" = tháng cuối đã tính tiền.
  Với RQ-2, ngày kết thúc luôn là `ngày cấp + n tháng − 1 ngày` (giữa tháng) nên tháng của nó là tháng **sau** tháng cuối mà `monthsBeginningIn`
  (`pricing.policy.ts:155-193`) đã tính. Hệ quả: (a) rời đi giữa kỳ trả thừa ≈ (ngày bắt đầu − 1)/số ngày × giá tháng (≈ 324.000 ở ví dụ); (b) bậc vô
  lý: thu hồi hoàn tất 14/06 trả 340.000, ngày 15/06 trả 0; (c) với khoản `YEAR_START` theo số đã lưu (7 tháng) cửa sổ là Jan–Aug (8 tháng) ⟹ rời
  đi 01/02 trả hết 4.200.000 dù tháng 1 đã dùng. Lỗi tiền ở luồng chính (mọi Request RQ-2 cấp ngày ≠ 1), trả thừa ⟹ ngân sách hiện "còn" tiền đã tiêu.
- **Căn cứ:** `QĐ-103f`(1) "tháng là tháng lịch … tháng gửi tính đủ một tháng", `QĐ-111i` R-39 "mỗi tháng đã bắt đầu tính một tháng", `QĐ-111j`
  (cam kết = giá tháng × số tháng đã chọn), `QĐ-111ak` (01/01 = số năm sau đã lưu, tức các tháng bắt đầu trong năm sau), RV-07/M-10 (trả phần chưa dùng).
- **Cách sửa (khuyến nghị A):** khi `endDate` là ngày suy ra từ lệnh cấp (nhánh `grantedEnd` của `coverageEndOf`), tháng cuối = tháng của **kỳ cuối
  bắt đầu**: `lastPeriodDay = addMonths(addDays(endDate, 1), -1)` (15/06 − 1 tháng = 15/05 ⟹ tháng 5; cuối tháng 30/06 ⟹ 01/07 − 1 tháng = 01/06 ⟹ tháng 6,
  nên Request cũ ngày cuối tháng không đổi; hợp đồng cắt 30/04 ⟹ tháng 4). Cụ thể: `SeatCoverage` thêm `lastMonthDay: BusinessDate | null` (= ngày
  trên, chỉ khi `grantedEnd` được dùng), `lastMonthOf(year, coverage.lastMonthDay ?? coverage.endDate)`; với `YEAR_START`, `last` này cho 7 ⟹ Jan–Jul.
  Khi đó luật `endsOn > endDate ⟹ 0` (dòng 107) thành thừa nhưng vô hại; bậc 14/06 biến mất (tháng 6 > tháng cuối 5 ⟹ 0). Số mới: rời đi 20/04 ⟹ 820.000;
  qua năm rời đi 01/02/2027 ⟹ 3.600.000. (B) giữ cửa sổ hiện tại nhưng trừ thêm phần ngày sau `endDate` trong tháng cuối (`monthCostAfter`): bỏ bậc, rời
  đi 20/04 ⟹ 1.100.000, nhưng tháng đầu vẫn bị coi là "không tính" (rời đi trong tháng 3 trả cả 3 tháng). A khớp chữ `QĐ-103f`; trả thiếu nhẹ thay vì
  trả thừa. Ghi D-n mới (sửa D-41(3)); Owner chọn nếu muốn B.
- **Test/mutation:** sửa 2 ca ghim (`seat-release.policy.spec.ts:119-122`, integration `:303-317`) theo số mới; thêm unit `lastMonthOf`/`firstMonthOf`
  với `endDate = 2026-06-14` ⟹ `first 3, last 5`, `endDate = 2026-06-30` ⟹ `4, 6`; thêm ca `YEAR_START` 2027 (7 tháng đã lưu, seat hết 14/08/2027,
  rời đi 01/02/2027 ⟹ 3.600.000). Mutation: bỏ `addMonths(…, -1)` ⟹ các ca trên đỏ.

### FX1-R2 — Required — Hai suite tích hợp mô tả quyền _Dùng lâu dài_ nhưng Request mang `term_months = 1` (harness) ⟹ sau `5289ceb3` chỉ xanh từ ~02/11 tới 31/12; **đỏ từ 01/01/2027**

- **Vị trí:** `test/integration/budgets/commitment-release-on-transfer.integration-spec.ts:57-61` (`approved` không đặt `term_months = NULL`) và kỳ vọng
  `shareFrom` `:112` (giả định tháng cuối = 12); `test/integration/personnel/transfer-effective-grace.integration-spec.ts:63-68` cùng kiểu, kỳ vọng `:159`,
  `:291`. Harness đặt `termMonths: 1` cho mọi gói không `K4`: `test/support/spend-harness.ts:127`. D-41(5) chỉ sửa 3 helper anh em
  (`commitment-release-by-day`, `commitment-release-ledger-rule`, `transfer-grace-sweep-ledger`), bỏ sót 2 file này.
- **Kịch bản:** cả hai đều cấp thật qua route (`grantedSeat` / `h.grant`) ⟹ seat hết `hôm nay + 1 tháng − 1` ⟹ `coverageEndOf` nay trả ngày đó (trước đây
  `null` ⟹ 12). Hôm nay 15/11/2026 seat hết 14/12 ⟹ `last = 12`, số trùng kỳ vọng ⟹ CI hôm nay xanh **do trùng hợp**. Chạy ngày 10/03/2027: seat hết
  09/04 ⟹ `last = 4`, `first = 1` ⟹ trả 2 tháng thay vì 10 ⟹ đỏ. (Sau FX1-R1 còn đỏ sớm hơn: `last` = tháng hiện tại.)
- **Cách sửa:** thêm `term_months = NULL` vào hai câu `UPDATE access_requests …` (đúng như D-41(5) đã làm), hoặc đổi kỳ vọng sang Request có tháng
  rõ ràng; ghi vào D-41(5).
- **Test:** chạy hai suite với `pretendBusinessToday('2027-03-10')` (hoặc biến môi trường ngày nghiệp vụ của harness) để chứng minh không còn phụ thuộc ngày.

### FX1-R3 — Required — `catalog-link` gắn Request đề xuất vào gói có kiểu cấp khác kết luận đánh giá, không kiểm lại số tháng ⟹ hở B-R2 qua đường thứ hai

- **Vị trí:** `src/modules/requests/assessment/catalog-link.service.ts:53-68` (chỉ kiểm `RETIRED`, rồi `setPlan`); `assessment.policy.ts:124-128`
  (`canLinkCatalogPlan` ở `AWAITING_EXECUTION`, sau khi hoàn tất đánh giá và duyệt chi); `requests/grant/grant.policy.ts:57`
  (`termBound = … || (termMonths ?? 0) > 0` bất kể kiểu cấp); `provisioning-grant-writer.service.ts:295-305` (`endOfSeat`).
- **Kịch bản:** đề xuất 6 tháng, IT kết luận `K2` (giữ 6 tháng, D-43(3)), duyệt chi; IT gắn Request vào gói `K4` có sẵn ⟹ lệnh cấp cho seat `K4`
  ngày kết thúc sau 6 tháng ⟹ RQ-3 nhắc T−7 rồi **tự mở thu hồi** khóa mua đứt — đúng hậu quả B-R2 mô tả. Ngược lại: kết luận `K4` (tháng bị xóa) rồi gắn
  gói `K1` ⟹ seat `K1` không ngày kết thúc (trái `K1` bắt buộc 1–9); kết luận `K2` 12 tháng rồi gắn gói `K1` ⟹ seat `K1` 12 tháng.
- **Căn cứ:** `QĐ-111i`, `QĐ-106b`, `QĐ-103d` (`K4` vĩnh viễn); D-43 tự nêu "một chỗ kiểm duy nhất" nhưng kiểu cấp còn đổi được ở đây.
- **Cách sửa (A, tối thiểu):** `link()` đọc `provisioningType` của gói (`findPlanSeatTargets` đã trả target) và của đánh giá đã hoàn tất; khác nhau ⟹
  409 `ASSESSMENT.CATALOG_LINK_KIND_MISMATCH` `{ assessed, plan }` (thêm vào `CatalogLinkRefusedError` reason + http-errors + ví dụ OpenAPI). (B) cho đổi
  nhưng chạy lại `checkTermMonths` như `fitTerm` (K4 ⟹ xóa tháng; K1 ngoài 1–9 ⟹ 422) — kèm định giá lại thì vượt phạm vi, nên A.
- **Test/mutation:** integration ở `access-request-new-software…`: kết luận `K2` 6 tháng, duyệt chi, gắn gói `K4` ⟹ 409, `plan_id` vẫn NULL; gắn gói
  `K2` ⟹ 200. Mutation: bỏ so kiểu ⟹ ca 409 đỏ.

### FX1-R4 — Required (wire) — `ACCESS_REQUEST.TERM_CONTRACT_ENDED` không có trong OpenAPI của `POST /access-requests` và `POST /access-requests/proposals`

- **Vị trí:** mô tả 422 `src/modules/requests/request-submission/access-requests.controller.ts:88`, `src/modules/requests/proposal-review/proposals.controller.ts:111`
  không nêu mã `TERM_*` nào; `openapi.json@47fb5097` chỉ có mã mới ở `POST …/drafts/{id}/submission` và `POST …/renewals` (đã kiểm bằng duyệt `paths`).
  Mã được ném ở `request-intake/access-request.service.ts:105-107` và `assessment/proposal.service.ts:23-27`. D-42 "FE cần biết" nói mã có ở gửi/đề xuất.
- **Đánh giá:** các mã `TERM_*` cũ cũng thiếu ở hai route này (có từ RQ-2), nhưng finding này mở mã mới cho FE dựa trên OpenAPI. Không có `QĐ-` trong mô
  tả (đếm `openapi.json`: 0).
- **Sửa:** thêm `...TERM_ERROR_EXAMPLES` + câu mô tả (như `request-drafts.controller.ts:173`) vào 422 của hai route; thêm mã vào
  `test/support/openapi-example-route-codes-requests.ts` cho `accessRequestCreate`/`proposalCreate` (tên khóa theo manifest). Kiểm lại route nhóm
  (`GROUP_REQUEST.LINES_REFUSED` có lý do dòng mới, enum `LINE_REASONS` đã thêm ở `group-request.dto.ts:48`).

---

## Optional

- **FX1-O1 — Hở test B-C1 phụ thuộc ngày chạy.** Ca "granted late" (`commitment-release-by-day…:377-389`) và ca "licensing tells the end" (`:344-375`) tính
  kỳ vọng bằng công thức gương theo `h.today()`; từ ~02/10 tới 31/12 seat 3 tháng hết sang năm sau ⟹ `last = 12` trùng nhánh `endDate = null` ⟹ mutation
  bỏ `grant:` ở `seat-release.service.ts:139-143` (`afterGrant`) **sống** hôm nay. Đường `afterTransferEffective`/`afterRightReplaced` (`:88-92`, `:120-124`)
  với Request có tháng không có test nào. Sửa: `pretendBusinessToday('…-03-15')` trước khi cấp, và một ca `TRANSFER_EFFECTIVE` cho Request 3 tháng
  (chuyển 20/04 ⟹ số theo FX1-R1). Ca hết hạn tự động qua `expiry-system-revocation` mà audit gốc đề xuất cũng chưa có.
- **FX1-O2 — B-R2: ca `K4` không kiểm lệnh cấp.** `access-request-new-software…:476-489` chỉ kiểm `term_months` NULL + audit; audit gốc đề xuất kiểm seat cấp ra
  không có ngày kết thúc (nút thắt thật của B-R2). Thêm `catalog-link` + grant + `expected_end_date IS NULL` (gộp với test của FX1-R3).
- **FX1-O3 — B1A-01: số tháng của cách tính dự phòng lớn hơn phần năm sau thật.** Seat đã cấp hết 14/08/2027 ⟹ đếm 01/01→14/08 = 8 tháng; seat chưa cấp ⟹
  `termEndOf(01/01, 9)` = 9 tháng (`year-start-commitments-batch.service.ts:289`; test ghim `9 * 650_000` ở `year-start-commitments-kept…`), trong khi
  số đã lưu (14.000 cent = 7 × 2.000) cho biết 7 tháng. Gợi ý: khi số ngoại tệ có `unit_price_minor` cùng tiền tệ, `tháng = nextYearAmountMinor ÷ giá tháng
  của Request` (14.000 ÷ 2.000 = 7) × giá VND 01/01 — không quy đổi tỷ giá, chỉ đếm tháng. Đồng thời `nextYearBudget` bỏ hẳn Request USD
  (`next-year-budget.repo.ts:33`, `next-year-budget.service.ts:46-51`) nên `remaining` năm sau cao hơn số lượt 01/01 sẽ giữ; cùng công thức trên dùng được
  cho dự báo. Đúng hướng audit gốc, chỉ là độ chính xác.
- **FX1-O4 — B1A-04: `seat_monthly_minor` của khoản `YEAR_START` vẫn là giá 01/01** (`year-start-commitments.policy.ts:161-166`; test ghim
  `seatMonthlyMinor: 650_000n` ở `year-start-commitments-batch-closing.service.spec.ts`) trong khi số tiền là số đã lưu theo giá lúc duyệt ⟹ trả lại theo
  ngày tính 650.000/tháng cho tháng giữ ở 600.000 (bị chặn bởi `heldMinor`). Gợi ý: khi mọi seat dùng số đã lưu và có `approvalPrice`, đặt
  `seatMonthlyMinor` = giá tháng lúc duyệt. Cần Owner chốt (QĐ-111ak không nói giá trả lại).
- **FX1-O5 — B-R1: đường `EXTEND` không kiểm hợp đồng lúc áp.** Request tiếp tục được duyệt rồi Super Admin rút ngắn hợp đồng về trước ngày bắt đầu kỳ mới ⟹
  `assignment-renewal.service.ts:63-82` vẫn tạo successor tới `newExpectedEndDate`. Hiếm; gợi ý kiểm như `provisioning-holder.service.ts:87-91` trước khi áp.
  B-O6 (planner đọc người ngoài transaction) đã được che ở `personal()`.
- **FX1-O6 — Khoản 01/01 bị `NO_PRICE` dù mọi seat có số đã lưu bằng đồng.** `yearStartAmountOf` từ chối trước khi xét số đã lưu
  (`year-start-commitments.policy.ts:127-130`); sau D-46 (`21914df6`) gói chỉ còn thuê bao USD ⟹ "không giá" ⟹ Request `K1` 7 tháng đã lưu 4.200.000 bị
  bỏ, trái `QĐ-111ak` ("đúng số năm sau đã lưu"). Có từ XY-1, D-46 làm hay gặp hơn. Gợi ý: chỉ đòi giá 01/01 khi có seat cần tính theo giá đó.

## Nit

- **FX1-N1** `seat-release.policy.spec.ts:119`: comment "one day of June goes back with the rest of the month" — thực trả 17/30 tháng (850/1500); viết lại
  hoặc bỏ theo FX1-R1.
- **FX1-N2** `year-start-commitments-batch.service.ts:256`: `currency: candidate.amountCurrency ?? 'UNKNOWN'` — `amount_currency` NULL mà có
  `next_year_amount_minor` không xảy ra theo CHECK hiện có; nên `throw` bất biến thay vì ghi chuỗi bịa vào audit.

## D-n rà lại

| D-n | Kết luận |
| --- | --- |
| D-41 | (1)(2)(4)(5) đồng ý; (3) là vá triệu chứng của FX1-R1 — thay bằng cửa sổ tháng đúng; (5) sót 2 suite (FX1-R2). |
| D-42 | Đồng ý (A). Lệch audit "không ném ở `termRunOf`" hợp lý (kiểm ngân sách sau duyệt). FX1-R4, FX1-O5. |
| D-43 | Đồng ý (A) cho hoàn tất đánh giá; câu "một chỗ kiểm duy nhất" chưa đúng vì `catalog-link` (FX1-R3). 422 + IT từ chối là chấp nhận được khi `RETURN` chưa có. |
| D-44 | Đồng ý (B). FX1-O3. |
| D-47 | Đồng ý (A). FX1-O4, FX1-O6. |

## Dự đoán CI (không chạy)

- Typecheck: các literal `RevocationCompletedFacts`/`GrantOutcomeFacts`/`YearStartCandidate` trong src và test đã thêm trường mới (đã grep); không unit spec nào
  `new` các service đổi constructor (`AssessmentCompletionService` thêm `OrganizationReadApi`).
- Hôm nay (15/11) dự kiến xanh; **rủi ro theo ngày**: FX1-R2 (đỏ từ 01/01/2027), FX1-O1 (mutation sống trong Q4). Ca B-R1 ở `renewal-term-end` dùng ngày cố định.
- `request-amount-term` ca B-R1 phụ thuộc ngày hôm nay nhưng đối xứng (`addDays(today, -1)`/`today`) nên ổn.

## Mutation đề xuất

| File | Chuỗi cũ | Chuỗi mới | Test nên bắt |
| --- | --- | --- | --- |
| `src/modules/requests/grant/seat-release.repo.ts` | `grantedEnd: row.id === input.grant?.requestId ? input.grant.endDate : null,` | `grantedEnd: null,` | `pnpm jest -c test/config/jest-integration… commitment-release-by-day` (ca B-C1 `:284` đỏ: trả 1.800.000) |
| `src/modules/requests/grant/seat-release.service.ts` | `grant: { requestId, endDate: facts.expectedEndDate },` | `grant: { requestId, endDate: null },` | `commitment-release-by-day` ca `:377` — **dự đoán SỐNG** hôm nay (FX1-O1) |
| `src/modules/requests/grant/seat-release.policy.ts` | `if (coverage.endDate !== null && endsOn > coverage.endDate) return 0n;` | (xóa dòng) | `seat-release.policy.spec.ts` + `commitment-release-by-day` ca `:284` đỏ |
| `src/core/term-limit.ts` | `return termStart !== undefined && contractEndDate < termStart;` | `return termStart !== undefined && contractEndDate <= termStart;` | `src/core/term-limit.spec.ts`, `renewal-term-end` (lastDay), `request-amount-term` (onTheLastDay 201) đỏ |
| `src/modules/licensing/provisioning/tasks/provisioning-holder.service.ts` | `contractEnd !== null && contractEnd < input.today` | `contractEnd !== null && contractEnd <= input.today` | `provisioning-grant-http` ca B-R1 (cấp ngày cuối hợp đồng 201) đỏ |
| `src/modules/requests/assessment/assessment-completion.service.ts` | `const months = kind === 'K4' ? null : request.termMonths;` | `const months = request.termMonths;` | `access-request-new-software` ca K4 đỏ (422 `TERM_NOT_ASKED`) |
| `src/modules/requests/year-start-commitments/year-start-commitments-batch.service.ts` | `return request.budgetYear === year - 1 && request.amountCurrency === DONG ? request.nextYearAmountMinor : null;` | `return request.budgetYear === year - 1 ? request.nextYearAmountMinor : null;` | `year-start-commitments-batch-currency.service.spec.ts`, `year-start-commitments-kept` ca B1A-01 đỏ |
| `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts` | `return monthsToClose.amount.amountMinor < seat.savedMinor ? monthsToClose.amount.amountMinor : seat.savedMinor;` | `return monthsToClose.amount.amountMinor;` | `year-start-commitments.policy.spec.ts` ca "cut at the kept number" đỏ |
