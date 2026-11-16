# AUDIT-SM1 — seat-tháng K2 (SM-1.1 → SM-1.5) ở `75020aed`

Reviewer: chỉ đọc (Opus). Đọc bằng `git show` và bản checkout sạch `D:\FPT\FALL2026\Code\be-verify` (= `75020aed`). Không chạy pnpm, jest hay docker.
Skill: `agent-skills:code-review-and-quality` (review 5 trục, phân mức), `superpowers:verification-before-completion` (mọi kết luận Critical/Required đều đã đọc code thật; không tuyên bố test xanh hay đỏ vì không chạy test).
Nguồn QĐ: `QĐ-103k`, `QĐ-103r`, `QĐ-104c`, `QĐ-104i`, `QĐ-103f`, `QĐ-111ae`, `QĐ-111ak`, `QĐ-111bg`, MG-03 = A (D-82). Các D-n: `docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS.md` (D-83, D-84, D-89, D-90, SM-1-O1…O7).

## Tóm tắt

| Mã | Mức | Một dòng |
|---|---|---|
| SM1-01 | **Critical** | Seat `RENEWAL_CARRY` (đã qua một lần gia hạn) mất liên kết tới Request, nên seat-tháng không tiêu cam kết. Cam kết vẫn `HELD` mà seat-tháng lại vào thực chi, tức phòng bị đếm hai lần. |
| SM1-02 | **High** | Seat chờ cấp (`granted_on` NULL) bị tính từ `valid_from`, mà tháng đã tính thì không bao giờ tính lại. Cấp xong muộn hoặc cấp thất bại thì phòng vẫn chịu những ngày chưa có quyền, và D-89 khóa phần đã tiêu. |
| SM1-03 | **High** | Sweeper bỏ qua tháng đã có bất kỳ dòng nào. Nếu một thuê bao lỗi giữa vòng lặp, các thuê bao sau của tháng đó mất seat-tháng vĩnh viễn (tới RV-1). |
| SM1-04 | Required | Dòng kho tính bằng hóa đơn tháng trừ seat-tháng, khác `QĐ-104c`(2) (số seat đã trả × giá tháng − seat-tháng). Gói năm thì số tháng và số năm đều sai, cảnh báo vượt dự phòng bật sai. Lọc "hóa đơn kho" còn gồm cả hóa đơn của thuê bao phòng sở hữu, không phải K2. |
| SM1-05 | Required | Seat-tháng của phòng chưa có Cost Center (`cost_center_id` NULL) biến mất: không vào thực chi phòng nào, lại bị trừ khỏi dòng kho. |
| SM1-06 | Required (cần Owner) | D-89 "giữ phần đã tiêu" sinh ra (a) tiêu cam kết khác Cost Center, (b) đếm hai lần khi giữ dòng cũ, (c) treo `SeatMonthSignedGuard` "đã ký thì không tính lại", trái `QĐ-111ae` "không khóa dữ liệu". |
| SM1-07 | Medium | Giá tháng lấy từ hai nguồn (giá trên cam kết, ngược lại giá hiện hành của thuê bao), không khớp SM-1-O4 tự ghi. Sau gia hạn, cùng một seat đổi giá. |
| SM1-08 | Low | Migration thiếu CHECK `days_in_month` khớp `month`, và DB không chặn tổng ngày một seat trong tháng vượt số ngày của tháng (lưới an toàn cho SM1-06). |
| SM1-09 | Low | `getSeatsOfMonth` đọc ngoài transaction và ngoài khóa advisory, có thể dùng ảnh seat cũ. |
| SM1-10 | Low | `poolLines` cắt ở 100 mà không báo, không có tổng. |
| SM1-11 | Low | `endedMonthsOf` không thử lại tháng của năm trước sau tháng 1. Tháng không có seat K2 bị tính lại mỗi giờ. |
| SM1-12 | Low | Không có test cho `chargeEndedMonths` và `SeatMonthSweeper`; thiếu test tháng 2, gia hạn, cấp muộn, dòng kho gói năm, Cost Center NULL. |

---

## SM1-01 — Critical — Seat gia hạn (`RENEWAL_CARRY`) không tiêu cam kết, phòng bị đếm hai lần

- **Code:**
  - `src/modules/licensing/assignment/assignment-seat-month.repo.ts:52-60`: Request của seat chỉ tìm qua `provisioningTask` kind `GRANT` có `assignmentId` = chính seat đó (lấy task tạo sớm nhất, không lọc `status = COMPLETED`).
  - `src/modules/licensing/assignment/assignment-carry.repo.ts:34-44`: mỗi lần gia hạn tạo **dòng `license_assignments` mới** (`source = 'RENEWAL_CARRY'`, `predecessor_id` trỏ seat cũ) và đóng seat cũ ở `startDate`. Dòng này không có task `GRANT`, nên `requestId = null`.
  - Vì vậy ở `seat-month-subscription.service.ts:114-125`, `commitment` = null. Plan (`seat-month-plan.policy.ts:67,78`) tính tiền bằng giá thuê bao và không tiêu cam kết nào.
  - Đường thu hồi lại tìm Request bằng chuỗi `AssignmentChainRepo.grantOfChain` (`assignment-chain.repo.ts:18-37`, CTE đệ quy qua `predecessor_id`). Như vậy đã có helper chuẩn mà SM-1 không dùng.
  - Không có listener nào giải phóng cam kết khi gia hạn: grep `renewal`/`carry` trong `budgets`, `requests/grant` không thấy.
- **Kịch bản bằng số:** seat 300.000/tháng, Request duyệt tháng 1, cam kết 3.600.000 (12 tháng, `QĐ-103f`). Thuê bao K2 gia hạn ngày 01/07, sinh seat mới.
  - Tháng 1–6: seat-tháng 1.800.000, tiêu cam kết 1.800.000.
  - Tháng 7–12: seat-tháng 1.800.000 vào thực chi, cam kết vẫn giữ 1.800.000.
  - Ngày 31/12: phòng X có thực chi 3.600.000 + cam kết 1.800.000 = **5.400.000**, trong khi tiền thật là 3.600.000.
  - Nếu thu hồi ngày 20/09: `revocationShare` (`requests/grant/seat-release.policy.ts:133-152`) chỉ trả phần từ tháng 9 đến tháng 12, trừ 19 ngày tháng 9. Phần tháng 7 + tháng 8 = 600.000 nằm `HELD` tới hết năm.
  - Với gói K2 trả theo tháng (mỗi kỳ là một thuê bao mới), từ tháng thứ hai **mọi** seat đều rơi vào ca này.
- **Hậu quả:** sai `yearFacts.spentMinor + held`, tức kiểm tra ngân sách FR-3.20 khi trình lô bị chặn sai, snapshot Người duyệt chi phóng đại, bảng/summary sai, `spentThisYear` sai. SM-1-O3 ghi việc này là "Optional", nhưng đây là lỗi tiền.
- **Căn cứ:** `QĐ-103r` (seat-tháng ở mọi nơi; cam kết của Request giảm theo seat-tháng — D-84), `FR-5.8` (một khoản tiền là cam kết hoặc thực chi, không đồng thời cả hai), `QĐ-35c` (gia hạn là cùng một quyền).
- **Cách sửa:**
  - Trong `AssignmentSeatMonthRepo.seatsOfPlans`, tìm `requestId` theo chuỗi `predecessor_id`, cùng luật với `grantOfChain`: task `GRANT` `COMPLETED` mới nhất trong chuỗi.
  - Cách gọn nhất là thêm một hàm batch `grantsOfChains(assignmentIds)` trong `AssignmentChainRepo` (một CTE đệ quy cho cả mảng) rồi gọi từ `seatsOfPlans`.
  - Bỏ truy vấn `provisioningTask` riêng (hiện lấy task tạo sớm nhất và không lọc `status`).
  - `HANDOVER` sang người khác: giữ là null nếu QĐ coi đó là quyền mới. Cần Owner xác nhận.
- **Test:**
  - Integration: seat cấp bằng Request tháng 1, `carry` ngày 01/07, `chargeMonth` tháng 7 → dòng có `commitment_id` = cam kết của Request và `applied_minor` = 300.000.
  - Unit cho repo: chuỗi 3 mắt xích (REQUEST → CARRY → CARRY).
  - Mutation: bỏ nhánh chuỗi, test phải đỏ.

## SM1-02 — High — Seat chờ cấp bị tính từ `valid_from`; ngày cấp thật hoặc cấp thất bại đến sau thì không sửa được

- **Code:**
  - `src/core/seat-month-cost.ts:59-68`: `from = grantedOn ?? validFrom`.
  - `assignment-seat-month.repo.ts:88-96`: `touching` chỉ loại `failedAt`/`cancelledAt`, **không** loại seat chưa cấp xong.
  - `assignment.repo.ts:158-170`: `markGranted` ghi `granted_on` một lần, đúng ngày tác vụ hoàn tất. Ngày đó có thể ở tháng sau.
  - `seat-month.service.ts:40`: tháng đã có dòng thì sweeper không tính lại.
- **Kịch bản bằng số:** Request duyệt, seat ghi `valid_from` = 25/03 (đang chờ IT), giá 300.000.
  - 01/04: sweeper tính tháng 3 = 7/31 × 300.000 = **67.742**, phòng X chịu, tiêu cam kết 67.742.
  - 02/04: IT hoàn tất cấp, `granted_on` = 02/04. `lateGrantShare` (`seat-release.policy.ts:160-172`) trả lại cam kết "các tháng trước tháng cấp + ngày trước 02/04" = 300.000 + 9.677 = 309.677, giới hạn bởi phần còn giữ (đã thiếu 67.742).
  - Kết quả: X chịu 67.742 cho những ngày **chưa có quyền**, và cam kết thiếu 67.742 cho tháng 12 (tháng 12 phải vào thực chi không có cam kết).
  - Nếu tác vụ cấp **thất bại** ngày 05/04: dòng tháng 3 vẫn ở lại vì sweeper không tính lại. Khi RV-1 gọi `chargeMonth`, dòng đó "không còn được yêu cầu" nhưng `applied_minor` > 0 nên vẫn được giữ (`seat-month-subscription.service.ts:148-155`, D-89). Phòng chịu 67.742 cho một seat **không bao giờ được cấp**.
- **Căn cứ:** `QĐ-103f`(3) "thời hạn bắt đầu khi tác vụ cấp hoàn tất", `QĐ-103r` (cấp thất bại ⟹ giải phóng phần cam kết còn lại), M-10.
- **Cách sửa:** seat do Request tạo mà chưa có `granted_on` thì **không** tính.
  - `seatHeldRange` nhận thêm `source`/`validFromBasis`: với seat `REQUEST`, `from = grantedOn` và trả `null` khi `grantedOn` là null. `BASELINE`/`RENEWAL_CARRY`/`HANDOVER` giữ `validFrom`.
  - Hoặc lọc trong `touching`: `OR: [{ grantedOn: { not: null } }, { source: { not: 'REQUEST' } }]`.
  - Vì `granted_on` là ngày hoàn tất (không lùi về quá khứ), tháng đã đóng không còn bị ảnh hưởng.
- **Test:**
  - Unit `seatHeldRange`: seat REQUEST với `grantedOn` null cho kết quả `null`.
  - Integration: seat chờ cấp có `valid_from` 25/03, `chargeMonth(03)` ⟹ 0 dòng; sau `markGranted(02/04)`, `chargeMonth(04)` ⟹ 29/30 × giá.

## SM1-03 — High — Sweeper bỏ qua tháng có bất kỳ dòng nào; lỗi giữa vòng lặp làm mất seat-tháng

- **Code:**
  - `src/modules/budgets/seat-month/seat-month.service.ts:40`: `if ((await this.repo.countOfMonth(month)) > 0) continue;`.
  - `:60-64`: mỗi thuê bao chạy một `runner.run` riêng, không có try/catch. Ngoại lệ ở thuê bao thứ k làm `chargeMonth` dừng, các thuê bao 1..k-1 đã commit.
  - `seat-month.job.ts:115-124`: lỗi chỉ được ghi log.
- **Kịch bản bằng số:** tháng 10 có 3 thuê bao K2 A, B, C (theo id).
  - 01/11 00:05: A commit 40 dòng (12.000.000). B ném lỗi (deadlock hoặc timeout). C chưa chạy.
  - 01/11 01:05: `countOfMonth('…-10-01')` = 40 > 0 ⟹ bỏ qua.
  - B và C (ví dụ 25 seat × 300.000 = 7.500.000) **không bao giờ** vào thực chi phòng cho tới khi RV-1 gọi `chargeMonth` (RV-1 chưa có). FR-3.20 và snapshot Người duyệt chi thiếu 7.500.000.
  - Tương tự: một thuê bao K2 mới có seat được ghi lùi ngày sau khi tháng đã có dòng cũng không được tính.
- **Căn cứ:** SPEC SM-1 và `security-jobs.md:77` ("charging a month again gives the same rows") hứa idempotent. `QĐ-111ae` cho phép dữ liệu tới muộn vẫn vào số. D-83(5) chọn "tháng chưa có dòng nào", và chính lựa chọn đó gây ra lỗi.
- **Cách sửa (ít thay đổi nhất):**
  - Sweeper tính lại **mọi** tháng đã kết thúc mà `SeatMonthSignedGuard` chưa ký, trong năm hiện tại và tháng 12 năm trước. Plan đã idempotent, nên chi phí là một `getSeatsOfMonth` cho mỗi tháng.
  - Hoặc tối thiểu: (a) try/catch quanh từng thuê bao, đếm số lỗi; (b) đánh dấu tháng "xong" bằng một bảng hoặc dòng sentinel (`seat_month_runs(month, completed_at)`) chỉ ghi khi **mọi** thuê bao đã xong, rồi sweeper bỏ qua theo dấu đó thay vì theo `countOfMonth`.
- **Test:**
  - Unit `SeatMonthService.chargeEndedMonths` với `subscriptions.charge` ném lỗi ở thuê bao thứ 2: lần gọi sau phải tính B và C.
  - Mutation M7 (bên dưới) hiện **sống**, vì không test nào gọi `chargeEndedMonths`.

## SM1-04 — Required — Dòng "Chưa phân bổ — kho dùng chung" không theo `QĐ-104c`(2); lọc hóa đơn kho quá rộng

- **Code:**
  - `seat-month.repo.ts:126-151` (`poolLinesOfMonth`): `invoiced` = SUM hóa đơn có `service_month = month`.
  - `:157-173` (`yearTotals`): hóa đơn kho của năm − seat-tháng của năm.
  - `budget-table-view.service.ts:89-104`: `sharedPoolUnallocated`, `sharedPoolOverReserve`.
  - Lọc kho = `subscription_id IS NOT NULL AND commitment_id IS NULL AND cost_center_id IS NULL` (`seat-month.repo.ts:137,161`).
- **Lệch QĐ:**
  - `QĐ-104c`(2) / `QĐ-103k`: dòng kho theo tháng = **số seat đã trả × giá tháng quy đổi − seat-tháng đã gán**. Hóa đơn chỉ là bằng chứng; chênh thuế/tỷ giá để ở dòng kho.
  - `sharedPoolLineOf` của baseline (`cycle/baseline.service.ts:119`) đã tính theo seat Trống × giá tháng. Hai con số cùng tên mà khác cách tính.
- **Kịch bản bằng số:** gói năm 10 seat × 3.600.000 = 36.000.000, kỳ 01/07/2026–30/06/2027, hóa đơn có `service_month` = 2026-07. Có 8 seat được gán (300.000/tháng).
  - Theo tháng (code): tháng 7 = 36.000.000 − 2.400.000 = **33.600.000**; tháng 8–12 = **−2.400.000** mỗi tháng (SM-1-O6 thừa nhận). Theo QĐ: mỗi tháng = 10 × 300.000 − 2.400.000 = **600.000**.
  - Theo năm (summary): 2026 = 36.000.000 − 6 × 2.400.000 = **21.600.000** (QĐ: 3.600.000). 2027 = 0 − 6 × 2.400.000 = **−14.400.000**.
  - Dự phòng kho 5.000.000 ⟹ `sharedPoolOverReserve = true` sai ở 2026 (dòng thật 3.600.000 < 5.000.000).
  - SM-1-O6 nói "`sharedPoolUnallocated` của năm bù đúng". Điều đó **sai** khi kỳ gói vắt qua năm.
- **Lọc rộng:** `purchase-invoice-plan.service.ts:201-206` cho hóa đơn liên kết `SUBSCRIPTION` của **thuê bao do phòng sở hữu** (`ownerDepartmentId` khác null, không phải K2/K4: `isPooledPlan`). `bookPurchaseInvoice` ghi các hóa đơn này `subscription_id` ≠ NULL, `cost_center_id` NULL (`invoice.policy.ts:99`). Như vậy hóa đơn của thuê bao phòng (K1/K5) bị cộng vào "dòng kho K2" và vào cảnh báo dự phòng. Hóa đơn của kho K4 cũng lọt vào.
- **Cách sửa:**
  - Dòng kho tháng = Σ thuê bao K2 đang hiệu lực trong tháng (`purchasedQuantity × monthlyPriceMinor`, lấy qua `SubscriptionPeriodApi.getPurchaseFacts` và kỳ hiệu lực của thuê bao) − seat-tháng.
  - Chênh lệch hóa đơn (Σ hóa đơn − Σ phần đã trả quy đổi của kỳ) đặt vào tháng `service_month` như "chênh thuế/tỷ giá".
  - Năm = Σ 12 tháng.
  - Lọc hóa đơn kho theo danh sách thuê bao K2 do catalog trả về (facade), không lọc theo cột NULL.
  - `companySpent` giữ nguyên là tiền mặt theo hóa đơn, nhưng cần ghi rõ ở OpenAPI là "theo hóa đơn, không dồn tích".
- **Test:** unit cho hàm dòng kho thuần (gói năm vắt qua năm ⟹ 600.000/tháng); integration với hóa đơn thuê bao phòng sở hữu ⟹ không có trong `poolLines`.

## SM1-05 — Required — Seat-tháng của phòng chưa có Cost Center biến mất khỏi mọi dòng

- **Code:**
  - `invoice.repo.ts:189-191`: `spentOf` chỉ lấy `s.cost_center_id IS NOT NULL`.
  - `seat-month.repo.ts:140-142` (poolLines) và `:162-163` (yearTotals): `allocated` = SUM **mọi** dòng, kể cả Cost Center NULL.
  - Ngoài các chỗ trên, không file nào đọc `seat_month_charges` (grep: chỉ `invoice.repo.ts`, `budget-view.repo.ts`, `seat-month.repo.ts`).
  - Comment migration (dòng 17) và Prisma model hứa "shown as the line not allocated to a Cost Center", nhưng không có chỗ nào hiện dòng đó.
- **Kịch bản bằng số:** phòng P mới (chưa liên kết Cost Center) có 3 người giữ seat 300.000 cả tháng = 900.000.
  - Thực chi phòng: 0 (không có Cost Center để gán).
  - Dòng kho: hóa đơn 3.000.000 − allocated 3.000.000 (gồm 900.000 của P) = 0, thay vì 900.000 phải hiện ở "Chưa phân bổ Cost Center" (`QĐ-103t`).
  - Tổng phòng + kho = 2.100.000 ≠ 3.000.000 tiền đã trả.
- **Cách sửa:** trong `poolLinesOfMonth`/`yearTotals`, `allocated` chỉ tính `cost_center_id IS NOT NULL`, và thêm `unallocatedCostCenter` (SUM dòng NULL) vào summary và `poolLines`. Hoặc đưa vào dòng "Chưa phân bổ Cost Center" hiện có của ca ngoài quy trình (`QĐ-103t`), tùy Owner chọn chỗ hiện.
- **Test:** integration có phòng không có Cost Center ⟹ phòng + kho + chưa phân bổ Cost Center = hóa đơn.

## SM1-06 — Required (cần Owner) — Hệ quả của D-89 "không hoàn lại" và `SeatMonthSignedGuard` "đã ký thì không tính lại"

- **Code:**
  - `seat-month-plan.policy.ts:140-151`: `appliedMinor = max(wanted, min(prior, amount))`, kể cả khi `sameCostCenter = false`.
  - `seat-month-subscription.service.ts:148-155`: dòng `applied_minor` > 0 không còn được yêu cầu thì **giữ lại**.
  - `seat-month.service.ts:51`: tháng đã ký thì `chargeMonth` trả `skipped`.
- **Kịch bản bằng số (lấy từ test của chính gói, `seat-month-plan.policy.spec.ts:95-112`):** dòng (seat-1, phòng A) đã tiêu 322.581 của cam kết c-1 thuộc **cc-b**.
  - Tính lại: A giữ 322.581 tiêu c-1 (cc-b), B tiêu thêm 77.419, c-1 mất tổng cộng 400.000.
  - cc-b: thực chi 77.419 nhưng cam kết giảm 400.000, tức cc-b **bị thấp đi 322.581** (khả dụng ảo).
  - cc-a: thực chi 322.581 trên cam kết của phòng khác.
  - Điều này trái chính `commitmentApplication` ("only when the commitment is of the Cost Center that bears the month") và `QĐ-111bg`.
  - Ca "dòng không còn được yêu cầu": giữ (A, X) 300.000 và thêm (A, Y) 300.000 ⟹ spentOf X + Y = 600.000 cho một seat-tháng 300.000. `allocated` 600.000 làm dòng kho âm 300.000.
  - Đường dẫn tới đây: SM1-02 (cấp thất bại sau khi đã tính), SM-1-O5 (phòng đổi Cost Center), sửa lịch sử placement.
- **`QĐ-111ae`:** chốt số tháng là **ảnh chụp, không khóa dữ liệu**; số liệu tới muộn vẫn ghi và hiện là thay đổi sau ảnh chụp. "Tháng đã ký không bao giờ tính lại" là khóa dữ liệu.
- **Cách sửa (để Owner chọn, D-89 mới "tạm chốt"):**
  - **A'** (không sửa trigger): không tiêu cam kết ngay lúc tính tháng, mà chỉ tiêu khi RV-1 ký tháng. Trước khi ký, `CommitmentRepo.totals` trừ phần "sẽ tiêu" của các dòng chưa ký (tính theo `applied_minor` dự kiến), nên số `held + spent` vẫn đúng và việc tính lại là tự do. Sau khi ký, áp như hiện nay.
  - **B** (D-89 B): migration cho phép `applied_minor` giảm, chỉ qua bảng bù trừ `budget_commitment_seat_month_reversals` (append-only, có audit), trigger chỉ chấp nhận khi giảm đúng bằng tổng bù trừ.
  - Trong mọi phương án: `appliedOf` khi `sameCostCenter = false` phải trả `applied = 0` (không giữ `kept`), và `SeatMonthSignedGuard` phải hiểu là "ảnh chụp đã có", không phải "cấm tính lại".
- **Test:** đảo nghĩa test `seat-month-plan.policy.spec.ts:95` thành "khác Cost Center ⟹ applied 0"; integration: một seat, tháng tính hai lần với placement khác ⟹ Σ `amount_minor` của (assignment, tháng) ≤ giá × ngày giữ.

## SM1-07 — Medium — Giá tháng từ hai nguồn, lệch với SM-1-O4 tự ghi

- **Code:** `seat-month-plan.policy.ts:67`: `seat.commitment?.seatMonthlyMinor ?? input.subscriptionMonthlyPriceMinor`. SM-1-O4 (OVERNIGHT-DECISIONS:399) lại ghi "giá tháng lấy giá hiện hành của thuê bao cho mọi tháng".
- **Số:** cùng thuê bao, tháng 8:
  - Seat có cam kết (duyệt lúc giá 300.000) bị tính 300.000.
  - Seat baseline bị tính giá hiện hành 350.000 (đổi giá từ 01/07).
  - Sau gia hạn (SM1-01), seat cũ đổi từ 300.000 sang 350.000 dù cùng một quyền.
  - RV-1 tính lại tháng 3 sau khi giá đổi: seat không cam kết đổi từ 300.000 sang 350.000 hồi tố.
- **Căn cứ:** `QĐ-103r`/`QĐ-104c`: "giá tháng quy đổi" là của thuê bao.
- **Cách sửa:** chốt một nguồn, ghi D-n và sửa O4. Khuyến nghị: giá của **kỳ thuê bao chứa tháng đó** (lấy từ catalog theo `subscriptionId` của seat; seat gia hạn đã nằm trên thuê bao mới nên tự có giá mới), không lấy giá trên cam kết. Lệch giữa giá đó và `seatMonthlyMinor` của cam kết chỉ ảnh hưởng phần còn lại của cam kết (đã giới hạn bởi `held`).
- **Test:** unit plan với hai seat cùng tháng ⟹ cùng `monthlyPriceMinor`.

## SM1-08 — Low — Migration `20261113100900_sm1_seat_month_charges`

- Phần đúng: `CREATE TABLE IF NOT EXISTS`; FK `DROP CONSTRAINT IF EXISTS` rồi `ADD`; `CREATE [UNIQUE] INDEX IF NOT EXISTS`, nên chạy lại an toàn. Có `month_check`, `days_check`, `amount_check`, `applied_check` (`applied ≤ amount`, `applied > 0 ⟹ commitment_id NOT NULL`). Unique `(assignment_id, month, department_id)` đúng với mô hình nhiều phòng một tháng. FK `ON DELETE RESTRICT`. Không có default cho `id` (Prisma `uuid(7)` sinh phía client), nhất quán với `createMany`.
- Thiếu: CHECK `days_in_month = EXTRACT(day FROM (month + interval '1 month' - interval '1 day'))` (`migration.sql:29-31` chỉ kiểm 28..31). Thiếu lưới DB cho Σ `days` của (assignment, month) ≤ `days_in_month`: không làm được bằng CHECK, nên đặt một assert trong `SeatMonthSubscriptionService.charge` trước `insertMany` (ném lỗi nếu sau `replace` một assignment vượt). Assert này chặn được ca đếm hai lần của SM1-06.

## SM1-09 — Low — Đọc seat ngoài transaction

`seat-month.service.ts:53` gọi `licensing.getSeatsOfMonth(month)` không truyền `tx`, trước khi lấy khóa advisory (`seat-month-subscription.service.ts:45`). Nếu một gia hạn (`carry`) hay thu hồi commit giữa hai bước thì plan dùng ảnh cũ. Cách sửa: đọc seat của **một** thuê bao trong transaction, sau `lockMonthOf` (thêm `getSeatsOfSubscriptionMonth(tx, subscriptionId, month)`).

## SM1-10 — Low — `poolLines` cắt ở 100 không báo

`seat-month-query.service.ts:24,78` và `seat-month.repo.ts:144`: `LIMIT 100` theo `subscription_id`, không có `total`/`truncated`. Finance có thể thiếu dòng mà không biết. Thêm `poolLinesTotal`, hoặc phân trang riêng.

## SM1-11 — Low — Lịch sweeper

`seat-month.policy.ts:103-109`: từ tháng 2 trở đi không thử lại tháng 12 năm trước; tháng 1 lỗi cả tháng thì tháng 12 mất. Tháng không có seat K2 (0 dòng) bị `chargeMonth` lại mỗi giờ (tới 11 tháng × `getSeatsOfMonth`). Đi cùng cách sửa SM1-03 (dấu "đã chạy").

## SM1-12 — Low — Lỗ test

- Không test nào gọi `chargeEndedMonths` hay `SeatMonthSweeper` (grep `test/` và `src/`).
- `seat-month.policy.spec.ts` không có ca chia ngày tháng 2: grep `-02-` chỉ thấy ở `endedMonthsOf`. `core/seat-month-cost.spec.ts:21` có tháng 2 năm nhuận, nhưng đó là `monthCostBefore`.
- Thiếu: gia hạn/`RENEWAL_CARRY` (SM1-01), seat chờ cấp (SM1-02), dòng kho gói năm (SM1-04), Cost Center NULL trong tổng (SM1-05), đổi giá (SM1-07), lỗi giữa vòng (SM1-03).

---

## Phần đúng đã kiểm

- **Chia ngày và làm tròn** (`seat-month.policy.ts:12-17,55-78`): `roundHalfAway` đúng cho cả số âm. Dư dồn vào đoạn có ngày cuối muộn nhất (sắp theo `last`), nên Σ đoạn = round(giá × ngày giữ / ngày tháng). Kiểm tay T-SM1: 400.000 × 25/31 = 322.580,6 → 322.581; phần còn lại 77.419; tổng 400.000.
- **Ca gán 10/03 → thu hồi 20/05, 300.000/tháng, Request duyệt tháng 3 (10 tháng = 3.000.000):**
  - Seat-tháng: tháng 3 = 22/31 → 212.903; tháng 4 = 300.000; tháng 5 = 19/31 → 183.871; tổng 696.774.
  - Cam kết: `lateGrantShare` = 9/31 → 87.097; `revocationShare` 20/05 = 8 × 300.000 − 183.871 = 2.216.129.
  - 87.097 + 2.216.129 + 696.774 = **3.000.000**: khớp từng đồng, không đếm hai lần. Hai cách làm tròn (`divideHalfUp` và `roundHalfAway`) trùng nhau với số dương, và tử /31 không bao giờ rơi đúng 0,5.
- **Điều chuyển giữa tháng** (`QĐ-111bg`): `sameCostCenter` chỉ tiêu cam kết của phòng cũ. Phòng mới chịu thực chi không có cam kết. Ngày không ở phòng nào rơi về dòng kho. Gộp hai đoạn cùng phòng thành một dòng (đúng với unique).
- **Seat trong ân hạn điều chuyển:** tiền về phòng của người giữ theo placement, đúng `QĐ-111bg`. Service account dùng `owningDepartmentId`.
- **Tháng 2:** `monthBoundsOf` và `daysBetween` cho 28/29; CHECK cho phép 28..31.
- **Không đếm trùng với hóa đơn K2** (sau D-84): hóa đơn nối Request K2 có `subscription_id`, `commitment_id` NULL, `cost_center_id` NULL (`purchase-invoice-confirmation.service.ts:103-122`). `spentOf` lấy theo `COALESCE(i.cost_center_id, c.cost_center_id)`, nên hóa đơn kho không vào phòng nào; phòng chỉ chịu seat-tháng, một lần, qua một chỗ duy nhất (`InvoiceRepo.spentOf` ⟹ `CommitmentRepo.totals` ⟹ yearFacts/FR-3.20, snapshot Người duyệt chi, bảng, summary, `spentThisYear`). `BudgetViewRepo` thêm cặp cho Cost Center chỉ có seat-tháng. `priorPeriodAdjustments` và `lastRecordedAt` không cộng seat-tháng (D-90(3)).
- **`companySpent`** = mọi hóa đơn của năm (gồm kho, K1/K4, ngoài quy trình `UNALLOCATED`/`COST_CENTER`), không cộng seat-tháng, nên không trùng.
- **Khóa:** advisory `seat-month:<sub>:<month>` (`hashtextextended`), rồi cam kết `FOR UPDATE` theo request id đã sắp, rồi khóa năm theo Cost Center đã sắp. Cùng thứ tự với `lockSeatCommitmentsOf` và đường hóa đơn. Hai instance xếp hàng, instance sau tính lại ra cùng số (chỉ thêm một audit `SEAT_MONTH.CHARGED`). `takeDown` dùng `applyInvoice` với `stateAfter` đúng.
- **Múi giờ:** `businessToday` theo tổ chức; mọi ngày là `BusinessDate`; `[from, until)` nhất quán với placement (`validTo` exclusive) và `valid_until`.
- **Kiến trúc:** budgets chỉ gọi `licensing/public`, `organization/public`, `catalog/public`. Repo licensing chỉ đọc bảng của licensing (`license_assignments`, `provisioning_tasks`). `PRISMA_MODEL_OWNER` có `SeatMonthCharge: 'budgets'`. `src/core/seat-month-cost.ts` thuần, chỉ import `business-date` (Nit: tên miền "seat" nằm trong core). `seat-month/` 12 file; `licensing/public` 25/25 (đã chạm trần); `security-jobs.md:77` mô tả sweeper.
- **Phân quyền/wire:** `@RequireRoles('FINANCE','MANAGER')`; trưởng phòng bị giới hạn theo `headedUnitsFor` (bộ lọc ngoài phạm vi ⟹ rỗng, D-90(2)); `poolLines` chỉ Finance. Query `strictObject`, `pageSize ≤ 100`. `openapi.json`: 0 chuỗi "QĐ-", schema SeatMonth không có "SM-1"/"MG-03"/"D-n".

## Mutation đề xuất

| # | File | Chuỗi cũ (đã grep, duy nhất) | Chuỗi mới | Lệnh jest | Kỳ vọng |
|---|---|---|---|---|---|
| M1 | `src/modules/budgets/seat-month/seat-month.policy.ts` | `.sort((a, b) => a.last - b.last)` | `.sort((a, b) => b.last - a.last)` | `pnpm jest src/modules/budgets/seat-month/seat-month.policy.spec.ts` | Đỏ (dư dồn sai đoạn) |
| M2 | `src/modules/budgets/seat-month/seat-month.policy.ts` | `const rounded = (2n * magnitude + denominator) / (2n * denominator);` | `const rounded = magnitude / denominator;` | `pnpm jest src/modules/budgets/seat-month/seat-month.policy.spec.ts` | Đỏ |
| M3 | `src/modules/budgets/seat-month/seat-month-plan.policy.ts` | `const appliedMinor = wanted > kept ? wanted : kept;` | `const appliedMinor = wanted;` | `pnpm jest src/modules/budgets/seat-month/seat-month-plan.policy.spec.ts` | Đỏ hiện nay (test :95). Sau khi sửa SM1-06 thì test mới phải bắt chiều ngược lại |
| M4 | `src/modules/budgets/seat-month/seat-month-plan.policy.ts` | `seat.commitment.costCenterId === costCenterId` | `seat.commitment.costCenterId !== ''` | `pnpm jest src/modules/budgets/seat-month/seat-month-plan.policy.spec.ts` | Đỏ |
| M5 | `src/modules/budgets/seat-month/seat-month-subscription.service.ts` | `row.appliedMinor === 0n \|\| asked.has(` | `true \|\| asked.has(` | `pnpm test:integration -- test/integration/budgets/seat-month.integration-spec.ts` | Nhiều khả năng **sống** (không có ca dòng bị bỏ). Cần test SM1-06 |
| M6 | `src/modules/budgets/budget/invoice.repo.ts` | `s.amount_minor AS amount` | `s.applied_minor AS amount` | `pnpm test:integration -- test/integration/budgets/seat-month.integration-spec.ts` | Đỏ nếu ca MG-03 có seat không cam kết |
| M7 | `src/modules/budgets/seat-month/seat-month.service.ts` | `if ((await this.repo.countOfMonth(month)) > 0) continue;` | `if ((await this.repo.countOfMonth(month)) >= 0) continue;` | `pnpm jest src/modules/budgets/seat-month` | **Sống** (không test nào gọi `chargeEndedMonths`). Cần test SM1-03 |
| M8 | `src/modules/budgets/seat-month/seat-month-query.service.ts` | `const poolLines = isFinance ? await this.poolLines(month, filter.subscriptionId) : [];` | `const poolLines = await this.poolLines(month, filter.subscriptionId);` | `pnpm test:integration -- test/integration/budgets/seat-month.integration-spec.ts` | Đỏ (ca trưởng phòng ở :246) |

Thứ tự sửa khuyến nghị: SM1-01 → SM1-02 → SM1-03 (cả ba là sai số tiền đang chạy) → SM1-05 → SM1-04 → SM1-06 (cùng RV-1, cần Owner chọn A'/B) → SM1-07 → Low.
