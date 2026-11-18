# AUDIT B — N3d (phần A1) + R-2 + merge `59f44b61` — review chỉ đọc

- Repo `D:\FPT\FALL2026\Code\be-p5-b`, nhánh `feat/p5-b-messages`, HEAD `f2839e55`. Phạm vi: `59f44b61` (merge `feat/p5`), `1801bb04` (N3d A1 + SaaS/ops), `f2839e55` (R-2).
- Cách đọc: chỉ `git show` / `git diff` / `git grep` / `git merge-tree` (dựng lại merge để so). Không sửa, không checkout, không chạy pnpm/jest/docker. CI run 44047564993 chưa xem kết quả.
- Nguồn đối chiếu: `SPEC-5B-MESSAGES.md` (A4, A6, A10, A11, D1 N3d, D4), `SPEC-5A-SBF20.md` §4.5, §4.6, §13, `verify-logs/p5/A1-DONE.md` §4, `A2-DONE.md` §5, `SPEC-5A-FIXES.md` §1.B, `catalog/notifications.md`.

## Skill đã dùng
- `agent-skills:code-review-and-quality`: process review 5 trục, phân mức Critical / Required / Optional / Nit.
- `superpowers:verification-before-completion`: mọi kết luận dưới đây có lệnh git và dòng code làm bằng chứng. Không có kết luận nào về test xanh vì không chạy test.

## Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| Critical | 0 | — |
| Required | 2 | R-1 (target của sự cố tự gia hạn trả 403 cho Người duyệt chi), R-2 (câu "on your behalf" gửi cho Finance) |
| Optional | 3 | O-1, O-2, O-3 |
| Nit | 3 | N-1, N-2, N-3 |

**Kết luận:** chưa merge B vào `feat/p5` ngay. Sửa R-1 và R-2 trước, khoảng 15–20 phút gồm cả spec. Sau đó merge khi CI 44047564993, hoặc run CI sau khi sửa, xanh. Phần merge `59f44b61` và R-2 đúng. Bảng câu đủ mã. Biến khớp params.

---

## Kết quả theo 6 câu hỏi

### 1. Đủ câu — ĐẠT
- `IN_APP_NOTIFICATION_CODES` ở `f2839e55` có 129 mã, trùng tập mã của `feat/p5` `6bb2f3a2`. So `comm` hai chiều cho kết quả rỗng: không mất mã, không thừa mã.
- `NOTIFICATION_TEXTS ... satisfies Record<InAppNotificationCode, NotificationTexts>` ở `inbox-notification-text.policy.ts:284`, nên thiếu mã thì đỏ typecheck.
- Mỗi file nhóm, gồm cả `notification-texts-subscription.types.ts:189`, có `satisfies Partial<Record<…>>` trên object literal. Kiểm excess-property chặn mã không còn trong danh sách.
- `notification-text.table.spec.ts` có thêm `SUBSCRIPTION_TEXTS` vào kiểm "không mã nào ở hai file".
- Mã của luồng CONFIRM: A1 **không gỡ** `SUBSCRIPTION_RENEWAL_PROPOSED/_DECIDED/_LATE` khỏi danh sách. `SPEC-5A-SBF20` §4.6 ghi rõ "mã giữ trong danh sách để dòng cũ đọc được"; A1-DONE §4 ghi "không còn phát". Vì vậy câu cũ ("chờ bạn xác nhận") được giữ là đúng A7/D4: chỉ dòng cũ đọc. Không có câu cho mã nào ngoài danh sách.

### 2. Biến khớp params — ĐẠT
Đối chiếu từng nơi phát ở `f2839e55`:

| Mã | Nơi phát | Params ghi | Câu dùng | Ghi chú |
| --- | --- | --- | --- | --- |
| `SUBSCRIPTION_RENEWAL_ALERT` | `renewal-alerts.service.ts:86-90` | `subscriptionId, renewalOn, seatsNeeded, renewalId=null, baseDate, commitment` | case `MONTHLY`/`ANNUAL`: `subscriptionId:name, commitment:enum, seatsNeeded, renewalOn:date, baseDate:date`. `otherwise` (dòng cũ): `baseDate:date`, `[ milestoneDays ]` | `commitment` chỉ là `MONTHLY`\|`ANNUAL` (`subscription-period.types.ts:18`). |
| `_RED_ALERT` | `:91` | `subscriptionId, renewalOn, seatsNeeded, baseDate` | đủ | — |
| `_KEPT` | `:93` | `subscriptionId, renewalOn, seatsNeeded, purchasedQuantity` | đủ | Gói tháng: `deadline = end = payment` (`subscription-obligation.policy.ts:206-208`), nên "ngày thanh toán {renewalOn}" đúng. |
| `_DATA_QUALITY` | `renewal-alerts.service.ts:126-128` | `subscriptionId, problem ∈ {NO_ALERT_ANCHOR, NO_NOTICE_DEADLINE}` | `by: problem`, case `NO_NOTICE_DEADLINE` dùng `{problem:enum}` | Nhãn có cả 2 giá trị (`notification-labels.types.ts`, `CODE_LABELS.SUBSCRIPTION_RENEWAL_DATA_QUALITY.problem`). |
| `_OUTCOME_RECORDED` | `renewal-record-trail.service.ts:83-94` | `renewalId, subscriptionId, choice, quantity, outcome, nextSubscriptionId, substitute` | `choice:enum`, `[ {quantity} ]`, `outcome:enum`, `by: substitute` | `quantity` null khi `CANCEL` (`renewal-record.policy.ts:43`), nằm trong `[ ]`. Nhãn `choice` có 4 giá trị = `RENEWAL_CHOICES`; nhãn `outcome` có 4 giá trị = `RENEWAL_OUTCOMES` (`subscription-renewal.types.ts:19-20`), kể cả `UNCONFIRMED`. |
| `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | sweep `renewal-deadline.service.ts:70-74`, lúc ghi `renewal-record-trail.service.ts:104-109` | `subscriptionId, baseDate (= end), renewalId` | `subscriptionId:name, baseDate:date` | `renewalId` không in. |
| `SUBSCRIPTION_EXPIRY_MARKED` | `renewal-deadline.service.ts:73-74` | `subscriptionId, baseDate, endDate` | `subscriptionId:name, baseDate:date` | — |
| `SAAS_ISSUE_*` | `saas-issue-notifier.service.ts:36-108` | đúng `SPEC-5A-FIXES` §1.B | nhãn `category`/`impact`/`fromState`/`toState` phủ đủ `SAAS_ISSUE_CATEGORIES`/`_IMPACTS`/`_STATES` (`saas-issue.policy.ts:5-25`) | Biến thể `trigger` phủ 4 giá trị, `IT_ACTION` qua `otherwise`. |
| `OUT_OF_PROCESS_CASE_REPORTED` | `vendor-account-review-notifier.service.ts:88-95` | `caseId, applicationId (null được), vendorId, employeeId` | `[ {applicationId:name} ]` | B bọc `applicationId` trong `[ ]`, hợp lý hơn câu của spec. |
| `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | `:56-62` | `applicationId, vendorId (null), source, newCount` | `newCount, source:enum` | Nhãn `source` = `DiscrepancyBatchSource` (3 giá trị, `:12`). |
| `DEVICE_STOP_*` | `stop-request-notifier.service.ts:61-68` | `…, holderEmployeeId, dueAt, dueOn` | `holderEmployeeId:name, dueOn:date` | — |

- Biến có thể vắng: `MAY_BE_ABSENT` ở `notification-text.absent.spec.ts:57-68` đã thêm `renewalId/commitment/milestoneDays` (ALERT), `quantity/nextSubscriptionId` (OUTCOME), `renewalId` (INCIDENT), `applicationId/vendorId` (OUT_OF_PROCESS, DISCREPANCY). Spec kiểm biến vắng phải nằm trong `[ ]` hoặc là `by`.
- Miền của biến thể: `notification-text.domains.spec.ts:60-73` có `commitment`, `problem`, `substitute`, `trigger`.

### 3. Câu đúng nghiệp vụ SBF-20 — 1 lỗi (R-2)
- Câu mới không còn nhắc "trưởng phòng xác nhận". Chỉ 3 mã cũ chỉ đọc còn nhắc, và như vậy là đúng.
- Người nhận theo code:
  - `noticeRecipients` (`renewal-adjustment-alerts.policy.ts:75-84`): điểm điều chỉnh, KEPT và DATA_QUALITY chỉ báo IT; đỏ và hết hạn báo IT + Finance; sự cố báo IT + Finance + Người duyệt chi.
  - `told` (`renewal-record-trail.service.ts:82`): kết quả gửi Finance, thêm IT phụ trách khi `substitute`. Không gửi Người duyệt chi.
  - Sự cố lúc ghi (`:106`): gửi Người duyệt chi + IT + Finance.
  - Kết luận: Người duyệt chi chỉ nghe về sự cố, khớp §4.6 và A1-DONE §4.
- Câu của RED_ALERT, KEPT, INCIDENT, EXPIRY_MARKED và ALERT chép đúng nguyên văn §13. Nhãn `commitment`, `choice`, `outcome` và `problem` `NO_NOTICE_DEADLINE` cũng chép đúng nguyên văn §13.
- Lỗi R-2: câu biến thể `substitute = true` nói "on your behalf" với cả Finance.

### 4. `target` mã mới — 1 lỗi (R-1)
- `operationId` có thật, method GET, path param khớp (đọc `openapi.json` ở `f2839e55`):

  | operationId | Path | Path param |
  | --- | --- | --- |
  | `subscriptionRenewalGet` | `GET /api/v1/subscription-renewals/{id}` | `id` ← `renewalId` |
  | `saasIssueGet` | `GET /saas-issues/{id}` | `id` ← subject |
  | `subscriptionGet` | `GET /subscriptions/{id}` | `id` ← subject |
  | `vendorAccountDiscrepancyList` | `GET` | không có |
  | `deviceStopRequestList` | `GET` | không có |
  | `subscriptionDeadlineEventList` | `GET` | không có |

- `OUT_OF_PROCESS_CASE_REPORTED: null` đúng §1.B.
- Quyền của người nhận:
  - `saasIssueGet` là `@AuthenticatedOnly`; reporter và IT đọc được.
  - `subscriptionRenewalGet` cho Finance đọc.
  - `deviceStopRequestList` và `vendorAccountDiscrepancyList` dành cho IT; người nhận đều là IT.
  - Lỗi R-1: `subscriptionGet` không cho Người duyệt chi đọc.

### 5. R-2 — ĐẠT (kèm O-1, N-1, N-2)
- Hai body đều có `nextPeriod.unitPrice`, và cả hai `nextPeriodSchema` là `strictObject`:
  - route ghi một lần `proposeRenewalBodySchema`, `subscription-renewal.dto.ts:56-66`;
  - route cũ `/outcome` `recordOutcomeBodySchema`, `:47-52`.
- `nextPeriod` **không có** `originalPrice` (`dto.ts:31-42`). Vì vậy path `nextPeriod.originalPrice` không có nơi dùng; xem N-1.
- Chỉ có một nơi gọi `recordNext`:
  - `SubscriptionPeriodApi.recordNextPeriod` (`subscription-period.api.ts:64-65`) ← `RenewalOutcomeService.continueInto` (`renewal-outcome.service.ts:247-252`).
  - Cả `record()` (route cũ) lẫn `recordIn()` (route một lần) đều đi qua `continueInto`. Nơi này truyền `unitPricePath: 'nextPeriod.unitPrice'` **sau** spread, nên client không ghi đè được (strictObject cũng chặn khóa lạ).
- `SubscriptionPricingService.read`/`readOriginal` nhận `path`, mặc định `'unitPrice'`/`'originalPrice'`. Hai nơi gọi cũ (`subscription.service.ts:172-173`, `subscription-change.service.ts:65-67`) không đổi hành vi.
- Integration của cả hai route assert `details.path = 'nextPeriod.unitPrice'` cho `MONEY_SCALE_EXCEEDED` (VND 0 chữ số lẻ). Route mới assert thêm số âm.

### 6. Merge `59f44b61` — ĐẠT
- Dựng lại merge bằng `git merge-tree --write-tree 69b3bb8e 6bb2f3a2` cho tree `f2360faf`. `git diff f2360faf 59f44b61` chỉ khác ở **2 file conflict**. Mọi file auto-merge, gồm 15 file hai phía cùng đổi, giữ nguyên kết quả của git, tức là có thay đổi của cả hai phía:
  - `notifications.types.ts`, `inbox.policy.ts`, `inbox.policy.spec.ts`, `notifications/README.md`;
  - `openapi.json`, `licensing.errors.ts`, `catalog.module.ts`…
- `docs/generated/module-graph.md`: lấy `catalog -->|3| notifications` (B +1: listener tên) và `catalog -->|3| operating_parameters` (A1 −1). Cách gộp hai phía hợp lý. File là file sinh, CI gate xác nhận.
- `subscription-renewal.http-errors.ts`: lấy phía `feat/p5`. Phía này bỏ `REVOCATION_TYPE_NOT_SUPPORTED` (đúng ý A1) và thêm `NEXT_PERIOD_REQUIRED`, nhưng tạm mất `path` của B trên 2 ví dụ tiền. `f2839e55` đặt lại path (`:136-137`) theo body thật, nên kết quả cuối đúng. Commit merge vẫn biên dịch được vì `path` là tham số tùy chọn (`money.errors.ts`).
- Import: mọi nơi import `./notification-text/inbox-notification-text.policy` (`inbox-view.service.ts:16` và 8 spec). Không còn import tên cũ.
- Số tham số vận hành: `PARAMETER_DEFINITIONS` có 30 khóa (`grep -c "key: '"` = 30). `parameter-definitions.policy.spec.ts:176` ghi "thirty keys", `operating-parameters-http.integration-spec.ts:550` ghi `30`, `api-collection-registry-exceptions.ts:81` ghi `maxItems: 30`. Khớp phép tính 29 − 2 (A2) − 1 + 3 (A1) + 1 (C) = 30.
- Mọi lời gọi `parseMoney` (B E2 làm `path` bắt buộc) trên code A1/A2/C đã gộp đều có `path`.

---

## Findings

### R-1 — Required — Bấm vào sự cố tự gia hạn trả 403 cho Người duyệt chi
- **File:dòng (`f2839e55`):**
  - `src/modules/notifications/inbox/notification-target.policy.ts:93-94`: `TARGET_BY_CODE` không có mục cho `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, nên rơi xuống `:127` `SUBSCRIPTION: route('subscriptionGet', …)`.
  - `src/modules/catalog/subscription/subscriptions.controller.ts:182-184`: `subscriptionGet` có `@RequireRoles('IT_ADMIN', 'FINANCE')`.
  - Người duyệt chi là người nhận: `renewal-adjustment-alerts.policy.ts:81` và `renewal-record-trail.service.ts:106`.
  - Spec target khóa sai: `notification-target.policy.spec.ts:190-201`.
- **Kịch bản:**
  1. Kỳ tự gia hạn qua `end` mà không ghi kết quả; hoặc IT ghi "giảm" mà nhà cung cấp vẫn gia hạn số cũ.
  2. Người duyệt chi nhận `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` với `target = { operationId: 'subscriptionGet', pathParams: { id } }`.
  3. FE mở thì nhận 403 `FORBIDDEN`. Đây chính là người mà `QĐ-99h` muốn báo.
  - Cùng lỗi đã có từ trước N3d (catalog cũ ghi người nhận "IT + người duyệt chi"), nhưng N3d là lượt đặt target cho mã đổi người nhận. `SPEC-5A-SBF20` §13 đã nêu màn thứ hai là `subscriptionDeadlineEventList`; route này mở cho `IT_ADMIN, FINANCE, SPENDING_APPROVER, SUPER_ADMIN` (`subscription-renewals.controller.ts:288`).
- **Cách sửa:** thêm vào `TARGET_BY_CODE`: `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: route('subscriptionDeadlineEventList'),`. Route này đọc được với cả 3 người nhận. Ca (b) lúc ghi kết quả không có dòng sự kiện, nhưng danh sách vẫn là màn gần nhất mà cả ba đọc được. Sửa vòng lặp ở spec target `:190` để bỏ mã này khỏi nhóm `subscriptionGet`, rồi assert riêng. Điều phối ghi vào catalog FE.

### R-2 — Required — Finance đọc "Another IT Admin recorded it on your behalf"
- **File:dòng:**
  - `src/modules/notifications/inbox/notification-text/notification-texts-subscription.types.ts:71` (vi) và `:82` (en).
  - Người nhận ở `src/modules/licensing/subscription-renewal/record/renewal-record-trail.service.ts:80-82`: `recipients: [finance, responsible]`, trong đó `responsible` chỉ có khi `who.substitute`.
  - Spec khóa câu: `notification-text.sbf20.spec.ts:134,137`.
- **Kịch bản:**
  1. IT Admin B ghi kết quả thay IT phụ trách A (`substitute: true`).
  2. Finance luôn là người nhận và nhận cùng `params` có `substitute: true`, nên render case `true`: "… vendor agreed. Another IT Admin recorded it on your behalf."
  3. Với Finance câu này sai nghĩa: không ai ghi thay Finance.
  4. Bản vi "Một IT Admin khác đã ghi thay." mơ hồ với Finance: không biết ghi thay ai.
  - Params không có `audience` hay `recipientRole` để tách câu theo người đọc. Câu chép đúng nguyên văn `SPEC-5A-SBF20` §13, nên lỗi gốc nằm ở bảng bàn giao. Dù vậy, câu hiện ra cho người nhận vẫn sai.
- **Cách sửa (ít nhất):** viết câu trung tính cho mọi người nhận:
  - vi: `… nhà cung cấp {outcome:enum}. Kết quả do một IT Admin khác ghi thay IT Admin phụ trách.`
  - en: `… vendor {outcome:enum}. It was recorded by an IT Admin other than the one in charge.`
  - Sửa 2 assert ở `notification-text.sbf20.spec.ts:134,137`. Điều phối cập nhật §13 và catalog.
  - Phương án lớn hơn, không cần cho merge: thêm khóa `recipientRole` (`FINANCE` | `IT_ADMIN`), như `STEP_SLA_REMINDER`.

### O-1 — Optional — Mã lỗi tiền khai ở OpenAPI của 2 route ghi kết quả không khớp mã thật
- **File:dòng:**
  - `src/modules/licensing/subscription-renewal/subscription-renewal.http-errors.ts:136-137`;
  - `subscription-renewals.controller.ts:208,215-216` và `:264,268-269`;
  - `test/support/openapi-example-route-codes-licensing.ts:257-258,273`.
- **Kịch bản:**
  - `CURRENCY_NOT_SUPPORTED` không tới được:
    1. `SubscriptionPricingService.read` gọi `assertPriceInDong` trước `parseMoney` (`subscription-pricing.service.ts:28`).
    2. Đơn vị tiền khác VND ném `SubscriptionPriceNotVndError`.
    3. `subscription-period.service.ts:216` đổi lỗi đó thành `PERIOD_REFUSED('PRICE_NOT_VND')`, rồi `renewal-outcome.service.ts:252-253` trả 409 `SUBSCRIPTION_RENEWAL.PERIOD_REFUSED`.
  - Ngược lại, `MONEY_OUT_OF_RANGE` (giá âm) tới được: integration `subscription-renewal-record.integration-spec.ts:192-194` ra 422 với `details.path`. Mã này chưa khai.
  - Ví dụ `MoneyScaleExceededError(2, …)` cho VND thật ra là 0 chữ số lẻ; test assert `allowedDecimals: 0`.
- **Cách sửa:** thay ví dụ `CURRENCY_NOT_SUPPORTED` bằng `MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('nextPeriod.unitPrice'))` và dùng `MoneyScaleExceededError(0, …)`. Sửa mô tả 422 ở 2 route và danh sách mã trong `openapi-example-route-codes-licensing.ts`. Sau đó chạy `pnpm openapi:export`. Có thể để 4b nếu gấp.

### O-2 — Optional — Dòng `SUBSCRIPTION_RENEWAL_ALERT` cũ có tiêu đề mới không hợp
- **File:dòng:** `notification-texts-subscription.types.ts:15,28`.
- **Kịch bản:**
  - Dòng ghi trước A1 (mốc 60/30/… ngày, gửi cả trưởng phòng/Super Admin theo `audience`) đọc tiêu đề "Thuê bao tới điểm điều chỉnh", trong khi thân là `otherwise` "… sắp đến hạn …".
  - Tương tự với dòng `SUBSCRIPTION_EXPIRY_MARKED` và `_AUTO_RENEWAL_INCIDENT` cũ:
    - `baseDate` cũ là hạn báo hủy (`760cd22d` `renewal-deadline.service.ts:86-102`), không phải `end`;
    - nghĩa cũ của EXPIRY là "sẽ kết thúc vào {endDate}", nay đọc thành "đã qua ngày gia hạn … có thể bị tạm ngưng".
  - Ảnh hưởng thấp vì A1-DONE §5 yêu cầu seed lại VPS.
- **Cách sửa:**
  - Cho `title` của ALERT là biến thể `by: 'commitment'`: case `MONTHLY`/`ANNUAL` = tiêu đề mới, `otherwise` = "Thuê bao sắp đến hạn gia hạn" / "Subscription renewal approaching".
  - Với INCIDENT/EXPIRY: chấp nhận và ghi FYI vào catalog, vì không có khóa để phân biệt dòng cũ.

### O-3 — Optional — Dòng ALERT cũ gửi trưởng phòng/Super Admin mở `subscriptionGet` thì nhận 403
- **File:dòng:** `notification-target.policy.ts:127`, có từ N4, trước `1801bb04`.
- **Kịch bản:** dòng cũ có `audience = HEAD`/`SUPER_ADMIN`. Khi bấm thì mở `subscriptionGet`, mà route này chỉ cho IT/Finance, nên trả 403.
- **Cách sửa:** thêm mục `SUBSCRIPTION_RENEWAL_ALERT` vào `TARGET_BY_CODE` với `by: 'audience'`: `IT_ADMIN` → `subscriptionGet`, `otherwise: null`. Có thể để 4b.

### N-1 — Nit — `readOriginal(…, path)` chưa có nơi gọi truyền path
- `src/modules/catalog/subscription/subscription-pricing.service.ts:36-44`. `nextPeriod` không có `originalPrice`, nên tham số mới chỉ được test (`subscription-pricing.service.spec.ts`) dùng.
- Có thể giữ cho đối xứng hoặc bỏ cho gọn (YAGNI).

### N-2 — Nit — `unitPricePath?` tùy chọn trên kiểu public của catalog
- `src/modules/catalog/public/subscription-period.types.ts:68`. Nơi gọi `recordNextPeriod` sau này quên truyền thì lỗi lặng lẽ quay về `unitPrice`. Khái niệm "path trong body HTTP" cũng lọt vào hợp đồng public của catalog.
- Cách sửa: bắt buộc trường này, hoặc để licensing bắt lỗi tiền rồi gán lại `path`. Chấp nhận được như hiện tại vì có đúng một nơi gọi và đã có test integration.

### N-3 — Nit — Hai case `MONTHLY`/`ANNUAL` của ALERT trùng nguyên câu
- `notification-texts-subscription.types.ts:19-22,32-35`. Việc trùng là bắt buộc vì `otherwise` dành cho dòng cũ. Có thể gom vào một hằng để không lệch khi sửa một bên.

## FYI (không tính)
- `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` ca (b), phát lúc ghi kết quả (`renewal-record-trail.service.ts:96-110`): IT đã ghi là nhà cung cấp gia hạn số cũ, nhưng câu §13 vẫn nói "có thể đã … tự gia hạn". Câu đúng nguyên văn spec, và không có khóa nào phân biệt hai ca để chọn biến thể (`renewalId` là id, không phải enum).
- `OUT_OF_PROCESS_CASE_REPORTED` gửi cả chính người đó với câu ngôi thứ ba "{employeeId:name} …". Câu khớp §1.B.
- Chưa kiểm được bằng chạy: `docs/generated/*`, `openapi.json` có tươi không, và gate `module-graph`. Các mục này để CI 44047564993 xác nhận.
