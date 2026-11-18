# AUDIT — tài liệu API prompt 5 so với BE `feat/p5` @ `d3757876`

Phạm vi: Docs `main` 4 commit `bbb13d6`, `054844a`, `67c5031`, `3c9e53c` (`Figma UI-UX/API-Integration/`), đối chiếu
`D:\FPT\FALL2026\Code\be-p5-int` (`openapi.json` sha256 `aed0a016…` khớp changelog) và `src/`. Chỉ đọc; không chạy pnpm/docker.

Skill đã đọc/dùng: `superpowers:verification-before-completion` (mỗi kết luận có file:dòng của code), `agent-skills:code-review-and-quality`
(phân mức, ưu tiên lỗi đúng/sai trước nit). Không có skill review tài liệu API riêng: dùng code-review làm equivalent.

Đường dẫn tài liệu tương đối với `Docs/Figma UI-UX/API-Integration/`; đường dẫn code tương đối với `be-p5-int/src/modules/`.

## Cách kiểm (đã chạy)

- Diff operation `openapi.json` `94a8ee84` ⟹ `d3757876`: 423 ⟹ 426; thêm đúng 4 (`subscriptionRenewalAdjustmentGet`, `myDeviceStopRequestCreate`,
  `deviceStopRequestList`, `deviceStopRequestComplete`), bỏ đúng 1 (`subscriptionRenewalDecide`). Khớp changelog (c).
- `@RequireRoles` của 4 route mới khớp bảng (c): adjustment `IT_ADMIN, FINANCE`; stop list/complete `IT_ADMIN`; create `@AuthenticatedOnly`.
  `subscriptionDeadlineEventList` trước `IT_ADMIN, SPENDING_APPROVER, SUPER_ADMIN`, nay thêm `FINANCE` ⟹ dòng "403 ⟹ 200" đúng.
- Tham số vận hành: `parameter-definitions.policy.ts` có **30** khóa; 4 thêm/3 bỏ, min/max/mặc định đúng. Finance trước thấy 3 khóa owner `FINANCE`, nay 1.
- `catalog/notifications.md`: trích **toàn bộ 129 mã** BE (node type-stripping đọc `notification-text/*.types.ts` + `notification-target.policy.ts`),
  so từng câu vi/en (title, message, mọi biến thể): **0 lệch**; 129 = 129 mã. So `target` của 129 mã: 3 dòng mô tả sai nhánh fallback (N-2).
- Người nhận/điều kiện phát kiểm bằng code nơi phát cho 16 mã: 11 mã mới + `SUBSCRIPTION_RENEWAL_ALERT`, `_DATA_QUALITY`, `_LATE`,
  `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION_EXPIRY_MARKED`.
- Lỗi: `subscription-renewal.http-errors.ts`, `stop-request.http-errors.ts`, `spend.http-errors.ts`, `account.http-errors.ts`, `money-errors.ts`.

Kết quả 5 điểm "tự nhận chưa chắc":

| Điểm | Kết luận |
| --- | --- |
| `notifications.md` ~2038 `SUBSCRIPTION_RENEWAL_KEPT` | Gần đúng; ghi chú "không xét `autoRenew`" **đúng** (`alerts/renewal-adjustment-alerts.policy.ts:38`). Thiếu: so với `target` chứ không phải số cần (T-3). |
| `notifications.md` ~2149 `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | Người nhận **đúng** (IT Admin + Finance + Người duyệt chi, cả hai nhánh). Thiếu điều kiện "còn ghế đang giữ" và cửa sổ 60 ngày ở nhánh (1) (T-1). |
| `annotations/subscription-renewals.md:48` (`suggestedChoice`, `canCancel`) | **Đúng** từng nhánh (`seats-needed/renewal-seats-needed.policy.ts` `suggestedChoiceOf`, `cancelProblem`). |
| `annotations/subscription-renewals.md:69` (`nextPeriod`, `closure`) | **Đúng** (`record/renewal-record.policy.ts` `nextPeriodProblem`, `nextStartProblem`; `subscription-renewal.dto.ts:89-103`). |
| `changes/2026-11-17-prompt5.md:297` (seed lại) | Sự kiện đúng (migration `20261117110100` dòng 45 đổi `PROPOSED`⟹`STALE`) nhưng **thiếu lý do thật** phải seed lại (T-4). |
| `VENDOR_ACCOUNT_DISCREPANCY_OPENED`, `OUT_OF_PROCESS_CASE_REPORTED` | Cơ bản đúng; thiếu tần suất của collector, người nhận khi `applicationId = null`, và giữ thông báo khi phòng chưa có trưởng phòng (T-5, T-6). |

## Sai (FE code sai nếu làm theo tài liệu)

### S-1. Finance vẫn được nói là thấy 3 tham số ZBB

- **Tài liệu:** `roles/finance.md:76` — tiêu đề dòng ghi "còn một: `BUDGET_RESERVE_DEFAULT_PERCENT`", nhưng cột mô tả vẫn ghi
  "Finance chỉ thấy và đặt `BUDGET_RESERVE_DEFAULT_PERCENT`, `BUDGET_ZBB_KPI3_BELOW_PERCENT`, `BUDGET_ZBB_PRICE_INCREASE_PERCENT`".
- **Code:** hai khóa ZBB không còn trong `operating-parameters/parameter-definitions.policy.ts` (30 khóa); khóa owner `FINANCE` duy nhất là
  `BUDGET_RESERVE_DEFAULT_PERCENT` (dòng 157); Finance chỉ đọc khóa mình sở hữu (`rolesMayRead`, dòng 455-456). Hai khóa ZBB ⟹
  `operatingParameterSet`/`History` bị từ chối.
- **Sửa:** "Finance chỉ thấy và đặt `BUDGET_RESERVE_DEFAULT_PERCENT` (hai khóa ZBB đã gỡ ở `feat/p5`; lấy danh sách từ `operatingParameterList`, không hardcode)."

### S-2. `collectionStoppedAt` "luôn `null`" — đã sai từ `feat/p5`

- **Tài liệu:** `tools/annotations/devices-and-ai-usage.md:117` (sinh ra `reference/devices-and-ai-usage.md:617`, mục `deviceRegistrationList`):
  "`collectionStoppedAt` luôn `null` ở revision này (chưa có route dừng thu thập)". Mâu thuẫn với chính trang đó dòng 18/22 và dòng 552.
- **Code:** `devices/stop-request/stop-request-completion.service.ts:55` `setCollectionStopped(...)`; `devices/registry/registry.mapper.ts:76`
  trả `collectionStoppedAt` thật. FE làm theo dòng 117 sẽ bỏ qua cột/nhãn "Đã dừng thu thập" trong lịch sử đăng ký.
- **Sửa:** "`collectionStoppedAt`: thời điểm IT Admin hoàn tất yêu cầu dừng ([deviceStopRequestComplete](#devicestoprequestcomplete)); `null` khi
  không dừng hoặc người giữ đã xác nhận lại." rồi sinh lại reference.

## Thiếu

### T-1. Sự cố tự gia hạn (nhánh job) cần còn ghế đang giữ và chỉ trong 60 ngày

- **Tài liệu:** `catalog/notifications.md:2149` (nhánh (1)); `flows/subscription-rightsizing.md:52-53` và `:62` ("qua ngày gia hạn ⟹ sự kiện hạn");
  `changes/2026-11-17-prompt5.md:81`.
- **Code:** `licensing/subscription-renewal/alerts/renewal-adjustment-alerts.policy.ts:33-34` (chỉ khi `end < today ≤ end + 60`,
  `RENEWAL_DAY_LOOKBACK_DAYS = 60` dòng 8) và `:64` (cả `AUTO_RENEWAL_INCIDENT` lẫn `EXPIRY_MARKED` chỉ khi `holdsSeats`);
  `subscription-renewal-sweep.service.ts:141` (`holdsSeats = activeSeatsToday > 0`). Thuê bao đã ghi hủy (`ending`) bị bỏ qua hẳn (sweep dòng 105).
  `SUBSCRIPTION_EXPIRY_MARKED` (dòng 2165) đã ghi "vẫn còn quyền đang gán", `INCIDENT` thì không.
- **Sửa (2149):** "(1) ngày gia hạn của kỳ đã qua (tối đa 60 ngày), thuê bao tự gia hạn, chưa có kết quả ghi **và vẫn còn quyền đang giữ hôm nay**; …".
  Flow dòng 53: "qua ngày gia hạn mà chưa ghi **và còn ghế đang giữ**".

### T-2. "IT Admin phụ trách thuê bao" thực ra là chuỗi dự phòng

- **Tài liệu:** `catalog/notifications.md:2003, 2022, 2039, 2076, 2150, 2168`; `changes/2026-11-17-prompt5.md:265-267`.
- **Code:** `licensing/subscription-renewal/subscription-renewal-parties.service.ts:37-56` `itAdminOf`: IT Admin phụ trách thuê bao nếu còn dùng được,
  không thì IT Admin phụ trách phòng sở hữu, không thì **IT Admin dùng được đầu tiên**. Chỉ `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED` dùng đúng
  "người phụ trách" (`substituteOf`, dòng 62-74).
- **Sửa:** thêm một câu ở đầu mục SBF-20: "IT Admin phụ trách = người phụ trách thuê bao nếu còn dùng được; không thì IT Admin phụ trách phòng sở hữu;
  không thì IT Admin dùng được đầu tiên. Không có ai ⟹ bỏ qua."

### T-3. `SUBSCRIPTION_RENEWAL_KEPT` so với `target`, và chỉ đúng ngày thanh toán

- **Tài liệu:** `catalog/notifications.md:2038` "số seat đang mua lớn hơn số cần"; `flows/subscription-rightsizing.md:62` như vậy.
- **Code:** `alerts/renewal-adjustment-alerts.policy.ts:63` `purchased > target` (`target` = số cần nâng lên mức tối thiểu nhà cung cấp,
  `renewal-seats-needed.policy.ts` `targetOf`); dòng 38 chỉ khi `today === adjustment.deadline` (một ngày; job không chạy ngày đó thì không phát).
  Param `seatsNeeded` là số cần (chưa nâng), nên câu có thể in "chỉ cần 3" dù không phát khi mua 5 = mức tối thiểu 5.
- **Sửa:** "…mà số seat đang mua lớn hơn `target` (số cần, nâng lên mức tối thiểu nhà cung cấp nếu có). Chỉ xét đúng ngày thanh toán."

### T-4. Lý do seed lại VPS: ca `DECIDED` cũ chặn mọi cảnh báo về sau

- **Tài liệu:** `changes/2026-11-17-prompt5.md:297-299` lấy migration `PROPOSED`⟹`STALE` làm lý do seed lại (migration này tự chạy khi deploy, không cần seed).
- **Code:** `record/renewal-record.policy.ts:176-180` `existingCaseOf` trả **bất kỳ** ca `DECIDED` nào, không xét kỳ; sweep dùng nó làm `hasCase`
  (`subscription-renewal-sweep.service.ts:109-112`) ⟹ thuê bao còn ca `DECIDED` cũ **không bao giờ** nhận `ALERT`/`RED_ALERT`/`KEPT`/sự kiện hạn
  ở mọi kỳ sau, và `POST /subscription-renewals` trả 409 `ALREADY_PROPOSED` cho tới khi ghi `/outcome` ca cũ. Đây là rủi ro O-6 ở
  `A1-DONE.md:199`.
- **Sửa:** "Seed lại VPS sau deploy: thuê bao còn ca `DECIDED` cũ sẽ không nhận cảnh báo/sự kiện gia hạn nào nữa và ghi mới bị 409
  `ALREADY_PROPOSED` cho tới khi ghi kết quả ca cũ qua `/outcome` (migration đã tự đóng ca `PROPOSED` thành `STALE`)."

### T-5. `VENDOR_ACCOUNT_DISCREPANCY_OPENED`: tần suất và người nhận khi không có ứng dụng

- **Tài liệu:** `catalog/notifications.md:1863` "Một lần mỗi lần như vậy"; `:1864` "IT Admin chịu trách nhiệm ứng dụng…"; changelog `:271`.
- **Code:** `usage/vendor-account-review/vendor-account-review-notifier.service.ts:64` eventKey `…:{source}:{occasion}`; collector dùng
  `occasion` = **ngày làm việc** (`vendor-account-intake.service.ts:145-152`) ⟹ tối đa **một thông báo/ngày** cho `COLLECTOR_UNLISTED`
  (`newCount` là của lô đầu tiên trong ngày). `INVOICE_DIFFERENCE` và `COLLECTOR_UNLISTED` luôn `applicationId = null`
  (intake dòng 109-115, 145-150) ⟹ notifier dòng 108-115 gửi **mọi IT Admin dùng được**. Người vừa xác nhận import cũng nhận (A2 N-03).
- **Sửa:** "Một lần mỗi lần nhập usage / mỗi hồ sơ chênh lệch hóa đơn / **mỗi ngày** với lô collector. Người nhận: IT Admin phụ trách ứng dụng
  (chỉ có ở `USAGE_IMPORT`); `INVOICE_DIFFERENCE`, `COLLECTOR_UNLISTED` và khi không có người phụ trách ⟹ mọi IT Admin dùng được (kể cả người vừa thao tác)."

### T-6. `OUT_OF_PROCESS_CASE_REPORTED`: phòng chưa có trưởng phòng

- **Tài liệu:** `catalog/notifications.md:1846`.
- **Code:** `vendor-account-review-notifier.service.ts:102-104` — phòng cuối chưa có trưởng phòng ⟹ `holdForDepartment`: thông báo được giữ và
  giao cho trưởng phòng đầu tiên được bổ nhiệm.
- **Sửa:** thêm "Phòng chưa có trưởng phòng ⟹ thông báo được giữ và giao cho trưởng phòng đầu tiên được bổ nhiệm."

## Nit

- **N-1** `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` lúc ghi: `tools/annotations/subscription-renewals.md:74` (⟹ `reference/subscription-renewals.md:447`) và
  `changes/2026-11-17-prompt5.md:279` chỉ nêu `REDUCE`/`CANCEL`. Code `record/renewal-record.policy.ts:208-219`: `outcome ∈ {VENDOR_REFUSED, DIFFERENT}`,
  có `nextPeriod`, và (`CANCEL` hoặc số ghế kỳ mới > số đã ghi) — gồm cả `RENEW`/`INCREASE`. Sửa theo câu đã đúng ở `catalog/notifications.md:2149`.
- **N-2** Dòng `target` ghi "Thiếu giá trị path ⟹ `null`" nhưng code rơi về route theo `subject.type` (`notifications/inbox/notification-target.policy.ts:203-211`):
  `catalog/notifications.md:460` (`WITHDRAWAL_AWAITING_IT_CLOSE`) và `:494` (`GRANT_TASK_CANCELLED`) ⟹ `accessRequestGet`;
  `:2061` (`SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`) ⟹ `subscriptionGet`. FE chỉ đọc `target` nên không gây lỗi; sửa câu thành
  "Thiếu `params.X` ⟹ route theo `subject.type`".
- **N-3** "Nguồn BE" trỏ file/hàm không còn: `catalog/notifications.md:2103` (`proposal/renewal-proposal.service.ts`), `:2122`
  (`decision/renewal-decision-trail.service.ts`, `decision/renewal-decision.policy.ts`), `:2141` (`renewal-deadline.policy.ts`, `flagLateIfDue`).
  Các mã chỉ đọc; ghi "(đã gỡ ở `feat/p5`)" thay vì đường dẫn.
- **N-4** `roles/super-admin.md:279` "thêm bốn khóa `SUBSCRIPTION_*` và `AI_PROVIDER_MODE`" ⟹ "thêm ba khóa `SUBSCRIPTION_*` và `AI_PROVIDER_MODE`".
- **N-5** `changes/2026-11-17-prompt5.md:95` "không thấy ca kho (404)": 404 chỉ ở `subscriptionRenewalGet`; ở `subscriptionRenewalList` ca kho
  chỉ vắng khỏi trang (controller dòng 74). Sửa "không thấy ca kho (List bỏ qua, Get 404)".
- **N-6** `catalog/errors.md:113` câu người dùng "Hãy bỏ trống ô này" mâu thuẫn với cột FE "bỏ ô `loginEmail` khỏi form". Sửa câu:
  "Email đăng nhập phải là email công ty của nhân viên."
- **N-7** `changes/2026-11-17-prompt5.md:42` liệt kê thuê bao thôi nhận cảnh báo "(`K1` có phòng, `K5`, dòng cũ)" thiếu `K4`
  (sweep chỉ quét `K2`: `catalog/subscription/period/subscription-period.repo.ts:15`). Flow dòng 15 đã đúng.

## Đã kiểm, đúng (không ghi lỗi)

Changelog (b)/(c)/(d)/(e)/(g): 4 route thêm/1 bỏ, vai; `spendBatchDecide.reason` 8 ⟹ 9 giá trị; `BUDGET.COMMITMENT_*` 409 và `details`
(`spend.http-errors.ts:65-78`); `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL` 422 `details.field = "loginEmail"`, so khớp không phân biệt hoa thường
(`account-invitation.service.ts:149-152`); `DEVICE_STOP_REQUEST.NOT_FOUND` 404, `.NOT_OPEN` 409 `details.state` `COMPLETED`/`INVALID`
(cả ca đăng ký đã kết thúc); `deviceStopRequestComplete` 200; mã SBF-20 mới: status, `details` và thứ tự lỗi của `subscriptionRenewalPropose`
(`record/renewal-record.service.ts` `check`); `NEXT_PERIOD_REQUIRED` 422, `PERIOD_REFUSED` 409 + `NOT_ON_RENEWAL_DAY`/`renewalOn`;
`ALREADY_PROPOSED` ở route đọc chỉ cho ca hủy `DECIDED` cũ; lỗi tiền `details.path` (`nextPeriod.unitPrice`, `quote.*`, `spend.quote.*`,
`netAmount` phẳng); `waitingReason` luôn `null`; `assignmentExpiryStartRevocation` 403; `vendorTaxProfileSet` `maxItems 20`, mất `maxLength 100`;
tổng tham số 30; Finance trước 3 khóa nay 1. Người nhận `DEVICE_STOP_*`, `SAAS_ISSUE_*` (3), `SPEND_BATCH_SUBMITTED`, `_OUTCOME_RECORDED`,
`_RED_ALERT`, `_ALERT`, `_DATA_QUALITY`, `EXPIRY_MARKED` khớp code. Câu vi/en của cả 129 mã khớp từng chữ.
