# AUDIT-P3-FIXB2 — verify các commit FIX-B2 (`6b11ea70..79c164c8`) — chỉ đọc

- **Người review:** reviewer chỉ đọc (Opus), 15/11/2026. Đọc qua `git show`/`git diff` ở worktree `be-fe-feedback` và file thường ở bản sạch
  `be-verify` (= `79c164c8`). Không sửa code, không chạy pnpm/jest/docker, không checkout/stash.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review năm trục, nhãn mức Critical/Required/Optional/Nit);
  `superpowers:verification-before-completion` (mọi kết luận kèm `file:dòng` đã đọc; vì không được chạy test, mọi câu "đỏ/xanh" dưới đây là **dự
  đoán từ đọc code**, cột lệnh ở "Mutation đề xuất" là việc cần chạy thật). Không có skill domain NestJS riêng ⟹ dùng `docs/rules/module-structure.md`
  làm checklist kiến trúc.
- **Căn cứ đã đối chiếu (Docs main):** `QĐ-103e`, `QĐ-103f`(2), `QĐ-103p`, `QĐ-103q`, `QĐ-103v`(1)(3)(5)(9), `QĐ-104d`, `QĐ-110h`, `QĐ-110i`,
  `QĐ-111a`, `QĐ-111bc`, `QĐ-111d`, `QĐ-111n`, `QĐ-111o`, `QĐ-111t`, `QĐ-101i`, `QĐ-98e`; `US-04-13` AC-15 (EP-04); file audit gốc
  `AUDIT-P3-B2-A/B/C/D.md`; `OVERNIGHT-DECISIONS.md` ở `79c164c8` (D-53, D-57, D-60, D-62(10), D-63…D-66, bảng "Chờ Owner quyết").

Tổng finding mới: **Critical 0 · Required 1 · Optional 3 · Nit 3.**

---

## 1. Kết luận từng finding gốc

| Finding | Commit | Kết luận | Ghi chú kiểm |
| ------- | ------ | -------- | ------------ |
| **B2A-R1** case B rút gọn nối gói ứng dụng khác | `d4bbb284` | **ĐÃ SỬA ĐÚNG** | `catalog-link/catalog-link.service.ts:112-119`: đọc `findProposal` trong cùng `tx` đã khóa Request, `existingApplicationId ≠ applicationId` của gói ⟹ `CatalogLinkApplicationMismatchError` trước mọi ghi; đề xuất `FULL` (`null`) vẫn nối mọi gói (R-25). 422 `ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH` + `details.expectedApplicationId` (`assessment.http-errors.ts:94`), mô tả route + sổ mã route có. Wire có `proposal.existingApplication {id,name}` (`assessment-view.service.ts:126`), `getCollectorApplications` không lọc theo `kind` nên đọc được cả ứng dụng `INTERNAL`. Capability mới `requests/catalog-link/` (2 file, không controller ⟹ được capability `proposal-review` import), `assessment/` còn 24 file. |
| **B2A-R2** `K5` đang chờ kết thúc dù đã ghi kế nhiệm | `49d6ca70` | **ĐÃ SỬA ĐÚNG** | `step-target.service.ts:87-90,113-122` chỉ đọc `nextHeadPeriodOf` khi bảng nói hàng 4 `NOT_REQUIRED/NO_DEPARTMENT_HEAD`; `reassignment.policy.ts:166-174` (`endsAsFree`) ⟹ có kế nhiệm thì chờ `NO_DEPARTMENT_HEAD`, `HEAD_PERIOD_START` giao cho kế nhiệm. Đi lại: H nghỉ hôm nay, S bắt đầu mai ⟹ bước `WAITING NO_DEPARTMENT_HEAD`, `created_at` giữ, 0 `STEP_NOT_REQUIRED`; ngày mai ⟹ `PENDING` giao S. Test `department-head-loss` đổi đúng chiều (ca cũ ghim hành vi trái `QĐ-110h` được thay, không nới khẳng định). Đường gửi mới không đổi ⟹ xem FX2-O2. |
| **B2A-R3** `PLAN_ONLY` + `K5` ghi `PAID_LICENSED` | `961e85b9` | **ĐÃ SỬA ĐÚNG — lệch của Sonnet là đúng** | `assessmentPatchSchema.provisioningType` chỉ `K1`…`K4` (`assessment.dto.ts:104`) ⟹ verdict theo `provisioningType === 'K5'` của file A là code chết. Catalog giữ `INTERNAL ⟺ K5` (`catalog/plan/plan.policy.ts:64`), `kind`/`vendor` của ứng dụng không đổi được (`application.dto.ts:43`) ⟹ "ứng dụng đề xuất nêu là `INTERNAL`" là tín hiệu đúng và ổn định của "gói miễn phí" (`QĐ-111d`: *nội bộ* suy từ `K5`). `judgeCompletion` trả `FREE_PLAN` trước `UNCONTROLLABLE`/thiếu ô (`assessment.policy.ts:93-94`), 409 `ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN`, readiness `FREE_PLAN`; lối ra (`NOT_ELIGIBLE` + `alternativePlanId`) dùng route có sẵn. Đúng `QĐ-103p`/`QĐ-50a` (không qua Người duyệt chi). |
| **B2A-R4** người xin thành trưởng phòng kẹt | `8f4525ed` | **ĐÃ SỬA ĐÚNG (phần `K5`)** | `needStepTarget(…, { chainHasSpendStep })` trả `notRequired: 'REQUESTER_IS_HEAD'` chỉ khi chuỗi không có bước chi (`reassignment.policy.ts:155-173`); integration ghim `NOT_REQUIRED` dòng 2, `ONE_STEP REQUESTER_IS_HEAD`, `AWAITING_EXECUTION`, đúng một `NO_NEED_APPROVER`, đúng một `STEP_NOT_REQUIRED`, quét lại không ghi thêm; ca Request kẹt từ trước được gỡ. Request trả phí còn chờ ⟹ `B2A-Q2` (đúng phạm vi file A). |
| **B2A-N1** mô tả `GET /assessment-decisions` | `d6b30d7e` | **ĐÃ SỬA ĐÚNG** | Chỉ đổi chữ. |
| **B2B-01** gói tháng `EXPIRED` sau ngày thanh toán | `ee0649bb` | **ĐÃ SỬA ĐÚNG** | `subscription-obligation.policy.ts:134-155`. Đi số: ngày thanh toán lưu `2026-08-10`, không ai sửa: hôm nay `11-03` ⟹ mốc `11-10`, điểm `11-03` ⟹ `SOON`, `daysLeft 7`; `11-10` ⟹ `SOON`, 0; `11-11` ⟹ mốc `12-10`, `state null`, `daysLeft 29`; `12-03` ⟹ `SOON` lại — mỗi tháng `03…10`, **không bao giờ** `EXPIRED`. Không tự gia hạn, `endDate 12-31`, `renewalDate` ngày 10: `12-11` ⟹ mốc `min(01-10, 12-31)` = `12-31`; `2027-01-01` + còn ghế ⟹ `EXPIRED`, `deadlineKind PAYMENT_DATE`. `addMonths` kẹp ngày cuối tháng (`fiscal-year.ts:15-26`) và cuộn từ ngày lưu ⟹ `01-31` không trôi thành `28`. Bộ lọc và nhãn dùng chung một đường (`subscription.service.ts:145` → `subscription-view.service.ts:102`). Khớp `QĐ-103e`/`QĐ-103v`(5); gói năm không cuộn (đúng `QĐ-103v`(9)). Còn một ca biên ⟹ FX2-O1. |
| **B2B-02** kho đếm đôi khi kỳ kế tiếp ghi trước | `00cfa42e`, `7f2662d5`, `cda6a82d`, `18f8c9a8` | **SỬA ĐÚNG VỀ SỐ ĐẾM, CHƯA ĐỦ VỀ LUỒNG** | `withoutPeriodsAhead` (`pool/subscription-pool.policy.ts:267-281`) dùng ở cả ba cách đọc (`subscription-granting.repo.ts:65,146,179`) ⟹ 10 ghế/4 người + kỳ kế tiếp ghi trước = **10/4/6** ở `stock-summary`, `stock.free` hàng cấp, `judgePurchase` (`PURCHASE_NOT_ALLOWED` `freeSeats 6`, `subscriptionIds [running]`) và luật ghế bỏ phí. Kỳ kế tiếp đã bắt đầu (`startDate = today`) ⟹ `notTakenOverOn` loại kỳ cũ, kỳ mới được giữ (`>` chứ không `>=`). Kỳ trước đã hết (`endDate` qua) ⟹ không trong tập ⟹ kỳ kế tiếp được đếm 10/4/6. Chuỗi ba kỳ ⟹ chỉ còn kỳ chạy (`ids` lấy từ toàn tập). `mine` hai IT Admin ⟹ mỗi người đếm kỳ của mình. **Nhưng** đổi B2B-Q1 làm lộ lỗ ở luồng cấp: ghế cấp sau khi đã ghi kỳ kế tiếp không bao giờ mang sang kỳ đó ⟹ FX2-R1. |
| **B2B-03** mô tả OpenAPI `expiry`/`daysLeft` | `e28137e5`, `46369af1` | **ĐÃ SỬA ĐÚNG** | `subscription.dto.ts:93,146,150,154` và mô tả route nói đúng "last day of the period", gói tháng cuộn, `deadlineKind` khi `EXPIRED`. Test `openapi-presentation` ghim (giòn, FX2-N2). |
| **B2B-11** hàng cấp bỏ dòng im lặng | `7df7e117` | **ĐÃ SỬA ĐÚNG** | `grant-queue.service.ts:73-76` ném lỗi; `getDepartmentBriefs` chỉ thiếu khi phòng không tồn tại (`organization-brief.mapper.ts`), `getPlanSummariesWithLogo` không lọc gói ngừng ⟹ không biến dữ liệu hợp lệ thành 500. |
| **B2C-R1** hợp đồng FE `k1Checklist` | (docs) | **ĐÃ GHI ĐÚNG** | Đứng đầu "Chờ Owner quyết" với nhãn "báo FE trước khi deploy", đủ ba mã 422, ca tác vụ `IN_PROGRESS` trước deploy và dataset demo. Việc còn lại thuộc lượt tài liệu API FE. |
| **B2D-01** Finance không thấy nguồn usage ở hợp đồng | `b08d53cc` | **ĐÃ SỬA ĐÚNG (phương án B của file D)** | Route mới ở `usage` (`vendor-source-contract.controller.ts:33-36`, `@RequireRoles('IT_ADMIN','FINANCE')` mức class), đọc ứng dụng của hợp đồng qua facade `catalog/public/catalog-contract.api.ts` (không truy vấn bảng `catalog`), repo chỉ đọc `usage_sources` (`vendor-source.repo.ts` `applicationId IN`). `VendorSourceController` vẫn `@RequireRoles('IT_ADMIN')` (`vendor-source.controller.ts:81`) ⟹ Finance chỉ thấy nguồn của ứng dụng các thuê bao liên kết hợp đồng; wire chỉ `id,name,application,status` (không template/khối lượng — không đụng `QĐ-101i`). 404 khi không có hợp đồng, trang rỗng khi chưa có thuê bao, phân trang + đếm cùng `$transaction`. Mô tả OpenAPI không có "QĐ-" (grep `openapi.json` = 0). |
| **B2D-05** số hợp đồng chỉ dấu kết hợp ⟹ 500 | `faa9809e` | **ĐÃ SỬA ĐÚNG** | `numberOrNull` (`contract-fields.policy.ts:91-95`) dùng chính `numberKeyOf` mà CHECK `contracts_number_given` đo ⟹ không còn khóa rỗng; áp cả POST lẫn PATCH. |
| **CO-1 tự review** (gói rời K2/K4 khi còn liên kết) | `a6f598da` | **ĐÚNG** | Migration `20261113004300`: thân `plans_keep_children_valid` là bản `…004000` cộng đúng một vế `CONTRACT_LINKS` (đã `diff` hai bản: chỉ thêm 13 dòng), không drop dữ liệu, `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` ⟹ chạy lại an toàn; trigger liên kết thêm `UPDATE OF contract_id, subscription_id`. `changeBlockOf` so `plan_change_blocked: ${reason}` có tiền tố đầy đủ nên `SUBSCRIPTIONS` không nuốt `CONTRACT_LINKS`. Đổi nhà cung cấp của ứng dụng bị cấm ở DTO (`application.dto.ts:43`) ⟹ không còn đường thứ ba phá luật cùng nhà cung cấp. `escapeLikePattern` cho `contains` (tên + `numberKey`) có test bằng ký tự thật. |

**D-n:** D-53 (sửa (2) ⟹ B), D-57 (bullet B2B-01), D-60 (đánh dấu đã sửa), D-62(10), D-63, D-64, D-66 khớp code đã đọc. **D-65 thiếu** hệ quả ở FX2-R1 (nói "ghế mang sang nằm ở cả hai kỳ", chỉ đúng cho ghế có lúc ghi kết quả gia hạn). Bảng "Chờ Owner quyết": B2C-R1 đứng đầu đúng; B2B-05 (A `scope=all`), B2C-O1 (B), B2C-O3 (A), B2D-Q1 (B), IN-1-O3 (A) — khuyến nghị hợp `QĐ-58b`/`US-01-11`, không thấy dòng nào trái QĐ; B2B-Q1 xem mục 2; AUDIT-MF23.a xem FX2-O2.

## 2. Đổi hành vi B2B-Q1 có trái QĐ không?

**Không trái QĐ — với điều kiện sửa FX2-R1.**

- `QĐ-103f`(2): "kho còn seat *Trống* cùng gói ⟹ IT gán, không mua; kho hết ⟹ IT … mua thêm … (gói năm: nhà cung cấp tính theo tỷ lệ tới ngày gia
  hạn)". Ghế thêm của kỳ **chưa bắt đầu** chưa tồn tại ở nhà cung cấp hôm nay ⟹ không phải *Trống* hôm nay ⟹ mua thêm vào kỳ đang chạy là đúng chữ
  (đúng cả câu "tính theo tỷ lệ tới ngày gia hạn"). `QĐ-103q` (không seat đệm) và `QĐ-111n` (đếm seat, không đếm bản ghi) cùng chiều. Lệnh cấp nêu
  `subscriptionId` kỳ kế tiếp ⟹ 422 `SUBSCRIPTION_NOT_GRANTABLE` là hệ quả nhất quán (một định nghĩa "cấp được").
- **Nhưng** `QĐ-103e`/`QĐ-103v`(2) định cỡ kỳ sau = quyền đang gán **+ Request đã duyệt chờ cấp**. Tức là số ghế của kỳ kế tiếp ghi trước đã tính
  cả người sắp được cấp; khi A buộc người đó vào kỳ đang chạy mà không mang sang, ghế của họ ở kỳ sau hiện *Trống* từ ngày kỳ sau chạy ⟹ cấp trùng
  (FX2-R1). Hành vi cũ (B) gắn người đó vào kỳ kế tiếp nên ở ca "ghế thêm" không bị lỗ này; A đúng QĐ hơn về mua, nhưng phải đi kèm mang ghế sang.

## 3. Finding mới

### FX2-R1 · Required — Ghế cấp sau khi đã ghi trước kỳ kế tiếp không bao giờ được mang sang kỳ đó ⟹ từ ngày kỳ sau chạy, kho báo *Trống* một ghế đang có người giữ (cấp trùng)

- **File (ở `79c164c8`):**
  `src/modules/licensing/subscription-renewal/outcome/renewal-outcome.service.ts:162-199` (`continueInto`: mang ghế **một lần**, lúc ghi kết quả gia
  hạn, chỉ những ghế `notEndedBy(running, nextStart)` lúc đó); `src/modules/licensing/subscription-renewal/subscription-renewal-seat.repo.ts:91-123`
  (`carry` — nơi duy nhất ghi `RENEWAL_CARRY`, grep `\.carry(` chỉ một chỗ gọi); `src/modules/catalog/subscription/subscription-granting.repo.ts:65`
  + `pool/subscription-pool.policy.ts:267-281` (`withoutPeriodsAhead`: lệnh cấp chỉ còn thấy kỳ đang chạy);
  `src/modules/licensing/provisioning/tasks/provisioning-grant-writer.service.ts:61-63` (chọn thuê bao rồi ghi quyền, không biết kỳ kế tiếp).
  Không có job nào mang ghế muộn ở ngày kỳ sau bắt đầu (grep `carry`/`nextPeriod`/`renewedBy` trong `licensing/provisioning`, `shared-pool`,
  `assignment`: không có).
- **Kịch bản (bằng số):** Slack kỳ 2026 `P1` 10 ghế, 4 người; một Request đã duyệt chờ cấp. Điểm điều chỉnh ⟹ IT ghi trước kỳ 2027 `P2` = 5 ghế
  (`QĐ-103e`: 4 + 1), 4 ghế mang sang `P2` (ghế `P1` kết thúc ở `P2.startDate`). Kho hôm nay 10/4/6 (đúng). IT cấp người thứ 5 ⟹ quyền nằm ở `P1`
  (`P2` bị loại), `valid_until NULL`. Ngày `P2` chạy: `P1` bị thay (`notTakenOverOn`), kho đọc `P2` = **5/4/1**, người thứ 5 vẫn giữ ghế trên `P1`
  (không nằm trong số đếm nào). IT cấp tiếp "ghế Trống" cho người thứ 6 ⟹ 6 người trên 5 ghế đã trả nhà cung cấp; chi phí theo seat (`QĐ-89a(2)`)
  của người thứ 5 nằm trên kỳ đã kết thúc. Ca B2B-Q1 (kỳ chạy 1 ghế đủ người, kỳ sau 2 ghế): lệnh cấp mua `POOL_TOP_UP` vào `P1` (test
  `shared-pool-next-period` "a grant that buys is recorded on the period that runs" ghim đúng điều này) ⟹ cùng hậu quả, ghế thứ 2 của `P2` hiện
  *Trống* trong khi đã có người.
- **Căn cứ:** `QĐ-111n` (kho đếm seat), `QĐ-103v`(1) (seat chỉ *Trống/Đã gán*), `QĐ-103e`/`QĐ-103v`(2) (kỳ sau đã tính Request chờ cấp),
  `QĐ-35c` (ghế giữ ngày đầu kỳ mới đi sang kỳ mới — chú thích `seatsToCarry`), `BR-MF1-09a`. Có một phần từ trước (cấp vào `P1` khi `P1` còn chỗ đã
  xảy ra trước FIX-B2), nhưng D-65 biến nó thành đường duy nhất và bỏ đường duy nhất tránh được (gắn vào kỳ kế tiếp ở ca B2B-Q1).
- **Cách sửa (đề xuất A, nhỏ nhất):** trong transaction của lệnh cấp, sau khi ghi quyền trên thuê bao `S`, nếu `S` có kỳ kế tiếp `ACTIVE` chưa bắt
  đầu (`renewedBy.startDate > today`), mang ngay quyền mới sang kỳ đó bằng chính `SubscriptionRenewalSeatRepo.carry` (một dòng `RENEWAL_CARRY`
  `valid_from = next.startDate`, ghế trên `S` kết thúc ở ngày đó). Kỳ sau hết chỗ ⟹ trigger `license_assignments_seat_capacity` từ chối ⟹ cần một
  quyết định: (a) lệnh cấp mua luôn một ghế cho cả kỳ sau (`POOL_TOP_UP` ghi hai kỳ), hoặc (b) 409 mã mới "kỳ sau thiếu ghế, sửa kết quả gia hạn
  trước". Facade cần thêm hàm đọc "kỳ kế tiếp ghi trước của thuê bao" (`SubscriptionPeriodApi` đã có). **(B)** job ngày đầu kỳ: mang mọi ghế
  `valid_until NULL` còn trên kỳ bị thay sang kỳ thay nó, quá chỗ thì cảnh báo IT — rẻ hơn nhưng để kho sai số từ lúc cấp tới ngày đầu kỳ (hôm nay đúng
  10/5/5, ngày đầu kỳ thành 5/4/1 rồi mới sửa). Ghi `B2B-Q1` thêm câu này; nếu Owner chọn B cũ của B2B-Q1 thì lỗ chỉ còn ở ca `P1` còn chỗ.
- **Test cần thêm (đỏ trước sửa):** `shared-pool-next-period.integration-spec.ts`: `P1` 10 ghế/4 người, ghi `P2` 5 ghế + `carry`, cấp người thứ 5 ⟹
  có đúng một quyền `RENEWAL_CARRY` của người đó trên `P2` (`predecessor_id` = quyền vừa cấp); kéo `P2.start_date` về hôm nay ⟹
  `GET /stock-summary?planId=` = `{ purchased: 5, assigned: 5, free: 0 }`. Ca B2B-Q1: sau lệnh cấp có mua, `P2` 2 ghế/2 người.

### FX2-O1 · Optional — Gói tháng tự gia hạn, chỉ có `endDate` đã qua: không `EXPIRED` nhưng cũng rời kho

- **File:** `subscription-obligation.policy.ts:135-138` (`autoRenew = true` ⟹ cuộn cả khi mốc là `endDate`, có spec "rolls the end day of a plan that
  renews itself"), đối với `subscription-granting.repo.ts:49,108,166` (`endDate >= today` bất kể `autoRenew`).
- **Kịch bản:** IT khai gói tháng `autoRenew true`, `endDate 2026-11-30`, không `renewalDate`; 3 người giữ ghế. Từ `12-01`: dòng thuê bao cuộn sang
  `12-30`, không bao giờ `EXPIRED`; nhưng thuê bao không còn "cấp được" ⟹ biến khỏi `GET /stock-summary`, hàng cấp báo `NONE`. Không màn nào báo IT
  (`QĐ-98e`/`QĐ-103v`(9) mất dấu ở ca này). Có từ trước (định nghĩa "đã hết" của kho), nay hai luật lệch nhau rõ hơn.
- **Sửa:** một nghĩa cho "kỳ còn chạy": hoặc kho coi `autoRenew` không có `renewalDate` là chưa hết (cuộn như expiry), hoặc expiry chỉ cuộn khi có
  `renewalDate` (gói chỉ có `endDate` thì `EXPIRED` sau đó). Ghi một dòng Chờ Owner nếu không sửa.

### FX2-O2 · Optional — AUDIT-MF23.a có thể đóng bằng chính `QĐ-110i`, không cần Owner

- `QĐ-110i`: "Vì kế nhiệm bắt buộc (`QĐ-110h`), ca này chỉ còn xảy ra khi phòng **vốn chưa có** trưởng phòng". Khoảng giữa có kế nhiệm đã ghi
  không phải "phòng không có trưởng phòng" theo nghĩa QĐ ⟹ `K5` **gửi mới** vào khoảng giữa cũng phải chờ kế nhiệm (phương án B của dòng
  AUDIT-MF23.a), không đi thẳng IT như `routeNeedStep` làm hôm nay (test "leaves the sending as it was" ở `department-head-loss` đang ghim A).
  Khuyến nghị của Sonnet đã là B; đề nghị đổi dòng đó từ "Chờ Owner" thành việc làm ở gói sau, căn cứ `QĐ-110i`/`QĐ-110h`.

### FX2-O3 · Optional — "Trạng thái" nguồn ở AC-15 hiện luôn `ACTIVE`

- `vendor-source.policy.ts` `sourceStatusOf(retiredAt)`; D-66(3) tự ghi chưa có lệnh ngừng nguồn ⟹ trường luôn `ACTIVE`. Không sai, nhưng `B2D-Q1`
  chưa hỏi Owner "trạng thái" là gì (file D nêu hai nghĩa: lần nhập gần nhất / kết nối). Thêm vế này vào câu hỏi `B2D-Q1` để FE không dựng nhãn trên một
  trường hằng.

### Nit

- **FX2-N1** `vendor-source-query.service.ts` `listOfContract`: `applicationName: names.get(...) ?? ''` — fallback im lặng (ứng dụng của nguồn luôn
  tồn tại vì FK); nên ném như `grant-queue.service.ts:75` (B2B-11) cho một luật.
- **FX2-N2** `test/http/platform/openapi-presentation.http-spec.ts` ca B2B-03 quét **mọi** mô tả có chữ `SOON` và mọi `daysLeft`/`deadlineKind` của
  cả tài liệu: route mới nào dùng chữ `SOON` (vd. hàng nhắc gia hạn) sẽ làm ca này đỏ vô lý. Giới hạn theo `operationId` `subscriptionList` và schema
  của nó.
- **FX2-N3** `contract-query.service.ts` `CONTRACT_APPLICATIONS_READ_MAX = 1000` cắt im lặng (D-62(9) coi cắt im lặng là sai ở chi tiết); ca không xảy
  ra thực tế, nhưng nên ghi rõ trong chú thích facade là "không cắt" hoặc bỏ giới hạn (một nhà cung cấp, vài ứng dụng).

## 4. Kiến trúc, phân quyền, test

- **Kiến trúc:** `usage → catalog` chỉ qua `public/` (`CatalogContractApi`, `CatalogApi.getCollectorApplications`); `requests → catalog/organization`
  qua facade; không thấy truy vấn bảng module khác trong code mới (repo `usage` chỉ `usage_sources`; `catalog-link` gọi `findProposal` của chính
  `requests`). Số file: `requests/assessment` 24, `requests/catalog-link` 2, `catalog/subscription` 25 (đúng trần), `pool` 4, `usage/vendor-source`
  13, `catalog/contract` 20, `catalog/public` 18 — không thư mục nào quá 25. `subscription.repo.ts` 563 dòng thân (Sonnet nói dưới 500 dòng đếm của
  gate — không tự kiểm được cách gate đếm), `subscription-pool.policy.spec.ts` đúng 400 dòng. `PUBLIC_CONTRACT_EXPORTS`, `capability-graph` (42
  capability) đã cập nhật.
- **Phân quyền:** route mới duy nhất `GET /contracts/{id}/usage-sources` chỉ `IT_ADMIN` + `FINANCE`; Finance vẫn 403 ở `GET /usage-sources`,
  `GET /usage-sources/{id}`, `POST`, `PATCH` (integration `contract-usage-sources` ca 5, http +8). Wire không lộ template/khối lượng. `openapi.json`
  không có "QĐ-".
- **Test:** không ca nào bị `skip`/`only`; khẳng định bị xóa đều là khẳng định ghim hành vi sai cũ (20/8/12, `EXPIRED` sau ngày thanh toán, `K5`
  sang IT trong khoảng giữa, G9-01 `freeSeats 1 / [next]`) và được thay bằng khẳng định chặt hơn. Đỏ-trước: phần lớn test nằm cùng commit với code
  (không chứng minh đỏ-trước bằng lịch sử), Sonnet báo đã chạy đột biến; `18f8c9a8` là test-ghim sau sửa. **Rủi ro CI:** không thấy test cũ nào
  khác còn ghim 20/8/12 hay `EXPIRED` gói tháng (grep `purchased: 20`, `free: 12`, `subscriptionIds: [next]` = 0); `test/flows` không dựng kỳ kế
  tiếp ghi trước hay gói tháng quá hạn ⟹ không đoán đỏ ở flows. `usage-intake` đã đỏ trước FIX-B2 do `declareApplication` bỏ `communication`
  (`9f2cf0e5` sửa helper) — cần CI xác nhận. Không có test nào phủ FX2-R1.

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất trong file) | Chuỗi mới | Lệnh test (kỳ vọng đỏ) |
| ---- | ------------------------------ | --------- | ---------------------- |
| `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts` | `const next = nextPayment(stored, today);` | `const next = stored;` | `pnpm jest src/modules/catalog/subscription/obligation/subscription-obligation.policy.spec.ts` + `pnpm test:integration -- test/integration/catalog/subscription-expiry-http.integration-spec.ts` (ca `monthGoesOn`) |
| `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts` | `input.endDate < next ? input.endDate : next` | `false ? input.endDate : next` | `pnpm jest src/modules/catalog/subscription/obligation/subscription-obligation.policy.spec.ts` (ca "does not roll past the end day") + integration `subscription-expiry-http` (`pastWithSeat`) |
| `src/modules/catalog/subscription/pool/subscription-pool.policy.ts` | `ids.has(row.renewedFromId) &&` | *(xóa)* | `pnpm jest src/modules/catalog/subscription/pool/subscription-pool.policy.spec.ts` + `pnpm test:integration -- test/integration/licensing/stock-summary-periods.integration-spec.ts` (ca `plans.ended`) |
| `src/modules/requests/catalog-link/catalog-link.service.ts` | `if (named !== null && named !== target.applicationId) throw new CatalogLinkApplicationMismatchError(named);` | *(xóa)* | `pnpm test:integration -- test/integration/requests/proposal-case-b.integration-spec.ts` + `pnpm test:http -- test/http/requests/proposal-case-b.http-spec.ts` |
| `src/modules/requests/step-routing/step-target.service.ts` | `return (await this.organizationReads.nextHeadPeriodOf(departmentId, today, tx)) !== null;` | `return false;` | `pnpm test:integration -- test/integration/requests/department-head-loss.integration-spec.ts` (ca "goes on waiting through the gap") |
| `src/modules/requests/step-routing/reassignment.policy.ts` | `return reason === 'REQUESTER_IS_HEAD';` | `return false;` | `pnpm jest src/modules/requests/step-routing/reassignment.policy.spec.ts` + integration `department-head-loss` (ca "requester becomes the head", "puts right a request of its own head") |
| `src/modules/requests/assessment/assessment.policy.ts` | `if (internalApplication) return { kind: 'FREE_PLAN' };` | *(xóa)* | `pnpm jest src/modules/requests/assessment/assessment.policy.spec.ts` + `pnpm test:integration -- test/integration/requests/proposal-case-b.integration-spec.ts` (409 `SHORT_PROPOSAL_FREE_PLAN`) |
| `src/modules/usage/vendor-source/vendor-source-contract.controller.ts` | `@RequireRoles('IT_ADMIN', 'FINANCE')` | `@RequireRoles('IT_ADMIN')` | `pnpm test:integration -- test/integration/usage/contract-usage-sources.integration-spec.ts` + `pnpm test:http -- test/http/usage/vendor-usage.http-spec.ts` |
