# AUDIT P3-B2-B — IA-1 + IA-2 (màn IT Admin) — chỉ đọc

> **Phạm vi:** `0fa50828..52a52362` (nhánh `feat/fe-feedback`): IA-1.1 → IA-1.4, IA-1 review (`d258995c` … `d5a891b6`), IA-2.1, IA-2.2, IA-2
> review (`93addc6f`, `339ccb92`, `c49cdd66`, `ec124120`). Mọi dòng trích ở **`52a52362`** (`git show 52a52362:<path>`). Không chạy test,
> không checkout; kết luận dựa trên đọc code + test + Docs.
>
> **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review năm trục, nhãn mức); `superpowers:verification-before-completion`
> (mọi kết luận có trích dòng). Không có skill domain riêng cho BE NestJS ⟹ dùng chính rule repo (`docs/rules/module-structure.md`) làm checklist.
>
> **Căn cứ đã đối chiếu:** `QĐ-103e`, `QĐ-103q`, `QĐ-103v`, `QĐ-104d`, `QĐ-98e`, `QĐ-58b`, `QĐ-87a`, `QĐ-82g`, `QĐ-110l`, `QĐ-111m/n/o/p/q/s`
> (`Docs/Decisions/project-decisions.md`); _Quy trình và chính sách theo main flow_ 1.10 `C-12`, `C.2.2` (dòng 1143–1165); `US-05-08` AC-3/5/9;
> SPEC §IA-1, §IA-2; F2-PROVISIONING-STOCK D2 (dòng 129–140); OVERNIGHT-DECISIONS D-55 → D-60, `IA-1-Q1…Q5`, `IA-2-Q1…Q3`.

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 3 | B2B-01, B2B-02, B2B-03 |
| Optional | 7 | B2B-04 → B2B-10 |
| Nit | 2 | B2B-11, B2B-12 |

---

## Required

### B2B-01 — Gói tháng bị `EXPIRED` ngay sau ngày thanh toán, trái "gói tháng chưa ghi kết quả ⟹ coi như giữ nguyên" (D-57)

- **Vị trí:** `src/modules/catalog/subscription/obligation/subscription-obligation.policy.ts:115-126` (gói tháng `end = payment`,
  `endKind = 'PAYMENT_DATE'`), `:176-181` (`today > point.end` ⟹ `EXPIRED` khi còn ghế); test ghim hành vi sai:
  `subscription-obligation.policy.spec.ts:277-284` ("is EXPIRED the day after the payment day of a plan by the month").
- **Kịch bản:** Canva Teams gói tháng, `renewalDate = 15/12`, 5 người đang giữ ghế. IT không sửa thuê bao trước 15/12 (luật cho phép: gói tháng
  không có tác vụ gia hạn, chưa ghi kết quả ⟹ coi như giữ nguyên số seat). Ngày 16/12 `GET /subscriptions?expiry=EXPIRED` trả Canva là _đã hết
  hạn — chưa gia hạn, quá 1 ngày_; từ đó về sau thuê bao không bao giờ quay lại `SOON` (điểm 08/01 không được tính vì mốc vẫn là 15/12) mà nằm
  mãi ở `EXPIRED`, `daysLeft` âm dần. Màn hình báo sự cố _hết hạn chưa gia hạn_ cho một việc mà luật nói là bình thường.
- **Căn cứ:** `QĐ-103v`(5), `QĐ-103e` ("Gói tháng: IT chưa ghi kết quả trước ngày thanh toán ⟹ coi như giữ nguyên số seat … không cảnh báo đỏ");
  QT `C.2.2` dòng 1146 ("gói tháng: ngày gia hạn = ngày thanh toán kế tiếp"), 1147 ("gói tháng chỉ cập nhật số seat và ngày kỳ trên **cùng** thuê bao"),
  1150; F2 D2-A dòng 134 ("Gói tháng vào danh sách 7 ngày **mỗi tháng**"). `QĐ-98e` là sự cố của mốc _ngày gia hạn_ mà luật riêng của gói tháng đã
  thay bằng "coi như giữ nguyên". `IA-1-Q1` chỉ hỏi gói năm, không hỏi điểm này ⟹ D-57 đã tự chốt trái luật.
- **Cách sửa (A, đề xuất):** ở `adjustmentPointOf` nhánh gói tháng, cuộn mốc thanh toán theo tháng tới ngày ≥ hôm nay
  (`payment = rollMonthly(renewalDate ?? endDate, today)`; `endDate` cố định và `autoRenew = false` thì không cuộn — kỳ thật sự kết thúc); gói tháng
  không bao giờ `EXPIRED` qua `renewalDate` cũ, chỉ `EXPIRED` khi qua `endDate` của thuê bao không tự gia hạn mà còn ghế. Hàm cần `today` (đổi chữ ký
  hoặc truyền mốc đã cuộn từ `readingsOf`). **(B)** giữ nguyên nhưng ghi `IA-1-Q6` cho Owner và đổi mô tả OpenAPI — không khuyến nghị vì trái chữ QĐ.
- **Test nên thêm:** unit: gói tháng `renewalDate 15/12`, hôm nay 16/12, còn ghế ⟹ `state null`, `daysLeft 30` tới 15/01, `deadlineKind PAYMENT_DATE`;
  hôm nay 08/01 ⟹ `SOON`; gói tháng `autoRenew false`, `endDate 15/12`, hôm nay 16/12, còn ghế ⟹ `EXPIRED`. Integration `subscription-expiry-http`:
  gói tháng có ngày thanh toán qua 1 ngày không nằm trong `expiry=EXPIRED`. Sửa ca `spec:277`.

### B2B-02 — `GET /stock-summary` đếm đôi ghế và người khi kỳ kế tiếp đã ghi trước, trái `QĐ-111n` (D-60 / `IA-2-Q3` giữ B)

- **Vị trí:** `src/modules/catalog/subscription/subscription-granting.repo.ts:41-49` (`grantable` dùng `notTakenOverOn` ⟹ cả kỳ đang chạy và kỳ
  kế tiếp chưa bắt đầu cùng vào `subscriptions`), `src/modules/licensing/stock-summary/stock-summary.policy.ts:23-41` (`seatsOf` cộng từng thuê
  bao); test ghim số sai: `test/integration/licensing/stock-summary-periods.integration-spec.ts:87` (`purchased: 20, assigned: 8, free: 12` cho 10
  ghế, 4 người), `:95`, `:134`, `:139`.
- **Kịch bản:** Slack 10 ghế, 4 người giữ; IT ghi trước kỳ năm sau (ghế mang sang `RENEWAL_CARRY` nằm ở cả hai kỳ). Màn kho hiện _Đã mua 20, Đã gán
  8, Trống 12_. IT Admin nhìn kho tưởng còn 12 ghế trống, Finance/IT đối chiếu hóa đơn 10 ghế lệch gấp đôi; số người giữ 8 trong khi chỉ có 4 người.
- **Căn cứ:** `QĐ-111n` ("Kho đếm seat (`K2`) … **không đếm bản ghi thuê bao**"); `QĐ-103v`(1)(3) (một (ứng dụng, gói) là một kho, seat
  _Trống / Đã gán_). Cộng hai kỳ của cùng một kho chính là đếm theo bản ghi thuê bao. Chính D-60/`IA-2-Q3` ghi "A về nghĩa" nhưng giữ B — đây là
  quyết định tự chốt trái QĐ, endpoint mới tái tạo lỗi đếm của `SharedPoolService.stockFrom` (`shared-pool.service.ts:20-40`) ra màn hình.
- **Cách sửa:** trong `pageStockPlans` (và cùng lượt ở `getGrantableSubscriptions`/`stockFrom` để ba nơi vẫn khớp), loại kỳ kế tiếp chưa bắt đầu
  khi kỳ nó nối (`renewedFrom`) cũng nằm trong `grantable`: thêm điều kiện
  `NOT { renewedFrom: { is: <grantable của kỳ trước> }, startDate: { gt: today } }` hoặc lọc ở policy theo cặp `renewedFromId`. Tới ngày kỳ kế
  tiếp chạy thì `notTakenOverOn` đã loại kỳ cũ — chỉ còn một kỳ. Nếu Owner muốn giữ lịch trình (sửa ở gói kho/hàng cấp sau), tối thiểu phải ghi
  `IA-2-Q3` là **lỗi đã biết, FE không được hiển thị số này như ghế thật** trong tài liệu API FE và không ghim 20/8/12 như hành vi đúng.
- **Test nên thêm:** đổi `stock-summary-periods:87,95,134,139` thành 10/4/6 (một kỳ); thêm ca `shared-pool-next-period` khẳng định `stock.free` của
  hàng cấp = 6 trước ngày kỳ kế tiếp chạy; ca HTTP `GET /subscriptions?planId=` hai dòng nhưng kho = một kỳ.

### B2B-03 — Mô tả OpenAPI của `expiry`/`daysLeft` sai sau sửa `4dd048ee` (hợp đồng FE nói ngược hành vi)

- **Vị trí:** `src/modules/catalog/subscription/subscription.dto.ts:93` (query `expiry`: "SOON … to the day of its deadline, EXPIRED those past the
  deadline while seats are still held"), `:146` (field `expiry`: "SOON from the point … to the day of its deadline, EXPIRED past it"), `:150`
  (`daysLeft` không nói đổi mốc khi `EXPIRED`); đã sinh vào `openapi.json:23899`, `:94787`, `:95162`.
- **Kịch bản:** sau `4dd048ee` gói năm qua hạn chót báo hủy vẫn `SOON` tới ngày gia hạn, `EXPIRED` chỉ sau ngày gia hạn và `daysLeft` khi `EXPIRED`
  đếm từ ngày gia hạn (`deadlineKind` đổi sang `RENEWAL_DATE`/`END_DATE`). FE đọc OpenAPI sẽ dựng nhãn _"đã quá hạn chót"_ cho dòng `EXPIRED` và
  coi `SOON` + `daysLeft < 0` là dữ liệu lỗi. Review IA-1 đã sửa code nhưng không sửa ba mô tả.
- **Căn cứ:** D-57 sửa theo review (OVERNIGHT-DECISIONS dòng 674); SPEC §1 "Mỗi gói giao = API BE + tài liệu API FE"; `docs/rules/api-contract.md`.
- **Cách sửa:** `:93` ⟹ "SOON lists the subscriptions from the point of adjustment to the end of the period (a plan by the year stays SOON past its
  deadline to cancel), EXPIRED those past the renewal day (else the end day) while seats are still held"; `:146` tương tự; `:150` thêm "once EXPIRED
  it counts from the renewal day (the end day), and deadlineKind says which". Chạy `openapi:export`.
- **Test nên thêm:** ca `openapi-presentation`/`openapi-read-wording` khẳng định mô tả `expiry` không chứa "past the deadline".

---

## Optional

### B2B-04 — Kỳ kế tiếp còn **nháp** làm kỳ đang chạy biến mất khỏi `expiry` (hai định nghĩa "kỳ nối tiếp")

- `subscription.repo.ts:39` (`RUNS_A_PERIOD` = `renewedBy: null`, mọi trạng thái), `subscription-granting.repo.ts:25-33` (`idsWithSuccessor` mọi
  trạng thái) — trong khi `notTakenOverOn` (`:12-17`) coi kỳ nối tiếp nháp là **chưa** thay kỳ cũ. Kịch bản: IT ghi kết quả gia hạn thiếu giá ⟹
  kỳ mới `DRAFT`; kỳ cũ rời `SOON`, kỳ nháp không `ACTIVE` nên cũng không vào; qua ngày gia hạn còn ghế ⟹ không dòng nào `EXPIRED` (`QĐ-98e` mất
  dấu). **A:** `RUNS_A_PERIOD`/`idsWithSuccessor` chỉ tính kỳ nối tiếp `ACTIVE` (cùng nghĩa `notTakenOverOn` trừ phần ngày bắt đầu); **B:** giữ,
  ghi Owner. Test: kỳ cũ có kỳ nối tiếp `DRAFT`, qua ngày gia hạn, còn ghế ⟹ `EXPIRED`.

### B2B-05 — Hàng cấp khóa cứng theo phạm vi phòng, nhưng "IT Admin khác xử lý thay" (`QĐ-58b`) không còn đường trên UI

- `grant-queue.service.ts:54-57`, `grant-queue.repo.ts:120,137`. `POST /provisioning-tasks` không kiểm phạm vi (đúng `QĐ-58b`), nhưng hàng cấp
  không cho IT khác thấy Request phòng ngoài phạm vi để xử lý thay (trái với `saas-issues` có `scope=all`, `QĐ-82g`). SPEC ghi "chỉ phòng trong
  phạm vi" nên không phải lỗi. **A:** thêm `scope=all` (chỉ đọc, mặc định phạm vi) như `GET /saas-issues`; **B:** giữ, ghi trong tài liệu API FE
  rằng xử lý thay đi qua `GET /provisioning-tasks`.

### B2B-06 — `execution.claimedBy` là `appUserId`, FE không có tên người đã nhận

- `grant-queue.mapper.ts:24`. Lý do D-59/`IA-1-Q3` là "IT khác thấy việc đã của ai", nhưng không route IT Admin nào đổi `appUserId` ⟹ tên.
  Đề xuất `claimedBy: { appUserId, employeeId, fullName } | null` (đọc một lần cho trang qua `IdentityAccessApi` + `getEmployees`). Test: mapper
  + đếm câu lệnh không tăng.

### B2B-07 — `revocation.claimableNow = true` cho tác vụ `FAILED`/`IN_PROGRESS`/`RETRY_SCHEDULED`

- `assignment.policy.ts:53`. Tên trường nói "nhận được ngay" nhưng claim tác vụ `FAILED` ⟹ 409 `NOT_CLAIMABLE` (test `license-assignment-revocation`
  ghim). Mô tả OpenAPI đã cảnh báo (`ec124120`), song đây là bẫy hợp đồng. **A:** `claimableNow = status === 'QUEUED' && notBefore đã tới` (đổi cả
  `GET /provisioning-tasks/{id}` cho một nghĩa); **B:** đổi tên thành `notBeforeReached`. `IA-2-Q2` đang chờ Owner — gộp vào câu hỏi đó.

### B2B-08 — Bấm "Cấp" lần hai trả 201 `PROVISIONING_TASK.CREATED` cho tác vụ đã `COMPLETED`/`FAILED` mà FE không phân biệt được

- `provisioning-grant.service.ts:73-80` (`takenBy`, `warnings: []`). Request `AWAITING_IT_CLOSE` (rút khi tác vụ lỗi) bấm lại ⟹ 201 với tác vụ
  `FAILED`; Request đã `COMPLETED` ⟹ 201 với tác vụ `COMPLETED`. Đề xuất thêm cờ `existing: true` (hoặc `warnings: ['TASK_ALREADY_EXISTS']`) để FE
  báo "việc này đã có người nhận"; giữ 201 theo D-56. Test: `grant-self-claim` ca IT khác bấm ⟹ cờ bật.

### B2B-09 — Hệ quả tự nhận (`IA-1-Q5`): `US-05-08` AC-5 chỉ còn đường qua "lỗi rồi thử lại"

- Không đổi code (đã ghi `IA-1-Q5`, chờ Owner). Ghi nhận cho người duyệt: 9 ca test cũ của AC-5/leaver/transfer (`access-request-withdrawal:303,472`,
  `group-request-withdrawal:146,222`, `leaver-request-closure:120-126,295,502,521,548`, `provisioning-grant-cancellation-transfer:41,64,88`,
  `seat-guards-http:69`, `provisioning-queue-http:33-37`) giờ dựng tác vụ `QUEUED` bằng `h.unclaimed` (lỗi → thử lại) — assertion **không** bị nới,
  nhưng đường nghiệp vụ thật (bấm Cấp rồi rút) không còn ca nào khẳng định trả lời 409 `GRANT_RUNNING` kèm thông báo đúng AC-3. Nên thêm một ca
  HTTP: bấm Cấp ⟹ người xin rút ⟹ 409 `ACCESS_REQUEST.GRANT_RUNNING`, Request vẫn `EXECUTING`, ghế còn giữ.

### B2B-10 — Phòng của phiếu SaaS là phòng **hôm nay** của người báo

- `saas-issue-view.service.ts:134` (lọc), `:196` (hiển thị). Người báo chuyển phòng ⟹ phiếu cũ đổi phòng, rời khỏi bộ lọc của IT phụ trách phòng cũ
  đang xử lý. D-58 đã chọn có ý thức; **B** thay thế: snapshot `department_id` lúc gửi (cần cột). Ghi để Owner biết, không bắt buộc.

## Nit

- **B2B-11** — `grant-queue.service.ts:73`: dòng thiếu gói/phòng bị bỏ khỏi `items` nhưng vẫn tính trong `total` ⟹ trang ngắn hơn `pageSize`, FE
  phân trang lệch. Nên `throw` (dữ liệu hỏng) như `person()` thay vì im lặng bỏ.
- **B2B-12** — `saas-issue.policy.ts:65`: `slice(0, 119)` theo code unit UTF-16 có thể cắt đôi cặp surrogate (emoji ở ký tự 119) ⟹ JSON chứa
  surrogate lẻ. Dùng `Array.from(line).slice(0, 119).join('')` và đo độ dài theo code point.

---

## Phần đúng đã kiểm

- **Đua hai IT Admin cùng bấm Cấp:** `claimForGrant` khóa dòng Request trong giao dịch (`provisioning-grant-writer.service.ts:58`), lệnh sau
  thấy `EXECUTING` ⟹ `ENDED` ⟹ `takenBy` đọc tác vụ đã commit (`provisioning-grant.service.ts:53-57`); test `grant-self-claim:110-118` ghim một
  tác vụ, hai 201. Tác vụ `CANCELLED`/`CLOSED_FAILED` không phải câu trả lời (`provisioning-task.repo.ts:138-151`). Kênh luôn `MANUAL`
  (`writer:90`) nên tự nhận không đụng connector.
- **Audit tự nhận:** sự kiện `CREATED` rồi `CLAIMED` có `before.claimedBy = null`, `after.claimedBy`, `selfExecuted` (`writer:145-175`); SoD-5
  vẫn báo Super Admin; 403 `ANOTHER_IT_ADMIN_NEEDED` giữ nguyên (`grant-self-claim:133-140`). Hoàn tất bởi IT khác vẫn được (không kiểm
  `claimedBy`) — khớp `QĐ-58b` "xử lý thay, có Audit Trail".
- **Phạm vi hàng cấp:** `getItAdminScope` (gồm phòng không ai phụ trách dùng được, R-20); IT không phòng ⟹ trang rỗng; `department_id = ANY(...)`
  ở cả hai nhánh UNION; lọc `beneficiaryEmployeeId` ngoài phạm vi ⟹ rỗng (D8). SQL thô chỉ đọc bảng `requests` (không `departments`,
  không `provisioning_tasks`); tác vụ qua `LicensingOpenGrantsApi` (`public/`). Thứ tự `state, beneficiary, submitted_at, id` duy nhất ⟹ phân
  trang ổn định.
- **`availableActions`:** luật thuần ở `licensing/public/licensing-grant-execution.policy.ts` dùng lại `availableDecisions` (một nguồn);
  `FAILED` + người xin đã rút ⟹ chỉ `CANCEL` (`US-05-08` AC-9); connector không có nút tay.
- **Điểm điều chỉnh gói năm:** 30 ngày trước hạn chót (khai hoặc suy từ số ngày báo trước), thiếu thì ngày gia hạn khi tự gia hạn (`QĐ-106i`),
  không tự gia hạn ⟹ ngày kết thúc; `K4`/`PERPETUAL` ⟹ không điểm (`QĐ-111o`); gói năm trả theo tháng (`commitmentTermMonths 12`) đi nhánh năm
  (`QĐ-104d`(3)); `EXPIRED` cần còn ghế (`QĐ-98e`); `businessToday()` theo múi giờ tổ chức. Bộ lọc và nhãn dòng cùng luật `runsAPeriod`.
- **Kho `K2`/`K4`/`K1`:** đếm seat/khóa/quyền, không đếm thuê bao (trừ B2B-02); `free` từng thuê bao không âm, không cho mượn; `revoking` cùng định
  nghĩa với `revocation` của dòng (test `c49cdd66` so số dòng); khóa đã rút không tính `inStore`; `mine` khớp `GET /subscriptions?mine=true`.
- **N+1:** `GET /grant-queue`, `GET /subscriptions`, `GET /stock-summary`, `GET /license-assignments`, `GET /saas-issues` đọc số câu cố định
  (`ia1-`/`ia2-collections-query-count` hai cỡ dữ liệu); `AssignmentRevocationRepo.openOf` một câu cho trang.
- **Phân quyền:** `@RequireRoles('IT_ADMIN')` ở `grant-queue`, `stock-summary`, `license-assignments`; `departmentId` của `saas-issues` chỉ IT Admin
  (người khác ⟹ 403 `SCOPE_FORBIDDEN`), ngoài phạm vi ⟹ rỗng; IT Admin khác vẫn đọc theo `scope=all` và chuyển trạng thái (`QĐ-111s`, `QĐ-82g`).
  Không DTO nào nhận/trả mật khẩu nhà cung cấp (`QĐ-111q`, kiểm lại grep). `openapi.json` phần thêm không chứa "QĐ-".
- **Kiến trúc:** module khác chỉ qua `public/` (`CatalogApi.getStockPlans`, `getPlanSummariesWithLogo`, `SeatOccupancyHook`); capability
  `stock-summary` không import facade của chính module; policy ở `public/` có tiền lệ (`seat-month-cost.policy.ts`); `PlanSummary` giữ bốn khóa
  (sửa lỗi 500 `GET /me/access-requests`, `a9f6d8a5`, có `plan-summaries-shape`).
- **Test:** thay đổi test cũ là đổi kỳ vọng `QUEUED ⟹ IN_PROGRESS`, thêm `CLAIMED`, `409 ⟹ 201` đúng hành vi mới; không `skip`/`only`, không xóa
  ca âm (ca "đóng thất bại vẫn 409" được giữ ở `grant-self-claim:121-130`). `test/flows` gọi `claim` lại sau khi cấp bởi **cùng** IT ⟹ no-op 200
  (`provisioning-queue-http:207-222`), nên không đoán đỏ ở nightly.

## Mutation đề xuất

1. `adjustmentPointOf` gói tháng: bỏ cuộn mốc (sau khi sửa B2B-01) ⟹ ca "qua ngày thanh toán 1 ngày, còn ghế, không EXPIRED" phải đỏ.
2. `pageStockPlans`: bỏ điều kiện loại kỳ kế tiếp chưa bắt đầu (sau khi sửa B2B-02) ⟹ `stock-summary-periods` (10/4/6) và `shared-pool-next-period`
   (`stock.free` = 6) phải đỏ.
3. `RUNS_A_PERIOD`: `renewedBy: null` ⟹ `renewedBy: { is: { status: 'ACTIVE' } }` đảo lại (sau B2B-04) ⟹ ca kỳ nối tiếp nháp phải đỏ.
4. `provisioning-grant.service.ts` `takenBy`: bỏ nhánh sau `runner.run` (chỉ giữ nhánh trước `plan`) ⟹ ca hai IT cùng bấm phải 201/409 thay vì 201/201.
5. `grant-queue.repo.ts:137`: bỏ `department_id = ANY(...)` ở nhánh nhóm ⟹ ca Request nhóm của phòng ngoài phạm vi phải đỏ (hiện mới có đột biến ở
   nhánh Request đơn theo HANDOFF IA-1.1).
6. `grantExecutionActions`: trả `availableDecisions` cả khi `withdrawing` ⟹ ca `AWAITING_IT_CLOSE` chỉ có `CANCEL` phải đỏ.
