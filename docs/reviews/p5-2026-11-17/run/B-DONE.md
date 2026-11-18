# B — báo cáo (17/11/2026) — TRẠNG THÁI: XONG (Phase N, FIX N, Phase E, FIX E, N3d đủ, R-2, FIX N3d); CI run 44051996589 xanh trên `05e1e434`

Chat B, nhánh `feat/p5-b-messages` (worktree `Code/be-p5-b`), đã push `origin`, head `3d76752b`. Code do subagent Sonnet viết từng gói; điều phối (chat này) kiểm lại độc lập từng gói bằng `git show --stat`, typecheck, `test:gates`, `graph.mjs --check`, `routes.mjs --check`, `openapi:export` (không drift) và chạy lại spec/integration chính của gói.
Nhánh B đã GỘP (merge, không rebase) `origin/feat/p5` @ `760cd22d` (lõi A2) và nhánh `feat/p5-b-texts` (N3a/N3b của chat 123).

## Skill đã dùng
`superpowers:subagent-driven-development` (process), `superpowers:verification-before-completion` (verification), `be-quick-check` (bộ kiểm nhanh). Subagent dùng thêm `superpowers:test-driven-development`.

## Bảng task → commit → kết quả

| Task | Commit | Kiểm lại độc lập (chạy thật) |
| --- | --- | --- |
| N1 `@RequestLocale()` | `8eaa52c0` | jest 32/32 |
| N2 renderer + formatter | `23c4e5b8` | jest 106/106 |
| N3a/N3b (chat 123) | gộp `89656f4f` | typecheck 0 |
| N3c bảng `NOTIFICATION_TEXTS` + A11.1 | `566173cf` | jest 357/357 |
| N4 `target` + `subject.type` | `1d69677c` | jest `inbox` 461/461, gates 337 |
| N5a extension point tên | `a5e865e4` | gates 337 |
| N5b 3 listener + `namesOf` | `c1b682bc`, `8e0e9d3d`, `66c92065` | integration `name-sources` 5/5 |
| N6 `InboxViewService` + 3 field + `Accept-Language` | `3fef289e` | integration `in-app-notifications` 27/27 |
| N7 `recipientRole` + ghost seat `null` | `8a6c9ae1` | gates 337, `openapi:export` không drift |
| FIX-R1 sinh lại `docs/generated` | `2a5fa8cd` | `graph/routes --check` OK |
| FIX-R2 `SPEND_QUEUE_REMINDER` ca null | `30f0f7df` | jest `notifications` xanh |
| FIX-R4 biến nullable trong `[ ]` + test | `abf95e9a` | jest `notifications` 638 |
| FIX-O1 cụm chung trung tính | `b10e6355` | integration `in-app-notifications` 27/27 (subagent) |
| FIX-O3/O4 mutation guard | `2f7a1a37` | jest 638 |
| FIX-R3 câu "của bạn" | `e6199805` | jest 648; integration 28/28 (subagent) |
| merge `feat/p5` (A2 core) | `4b6760e7` | xung đột duy nhất `module-graph.md`, sinh lại |
| N3d phần A2 (`SPEND_BATCH_SUBMITTED`, nhãn cause) | `5993bf39` | jest 657; **CI run 43992871487 XANH toàn bộ** |
| E2a+E2b lỗi tiền có `path` | `89a9e64f` | typecheck 0, gates 337 |
| E3a `details` mã 1–5 | `75236fef` | spec mapper mới 10 suite/61 test xanh |
| E3b `details` mã 6, 9–13 | `4e8ff5bd` | (như trên) |
| E3c `details` mã 7, 8, 14, 15 | `bb3f2158` | (như trên) |
| E8a khai mã lỗi thật (3 lô) | `9ac66c3c`, `eeedf32f`, `d3fd0522` | gates 337, `openapi:export` không drift |
| E8b sửa mô tả cũ + tax-profile + emptyState (3 lô) | `c53f0856`, `4b1089d3`, `3d76752b` | gates 337; integration `vendor-tax-profile-http` 27/27 |
| FIX-E-R1 path thật của lỗi tiền ở quote (`quote.` / `spend.quote.`) | `1fa1db30` | jest 12 suite/173 test; integration `access-request-internal-registration` |
| FIX-E-O1 query phẳng `netAmount` ⟹ `issues[0].path = netAmount` | `c8d003c3` | unit + integration `vendor-tax-profile-http` |
| FIX-E-O2 DTO `taxType` đếm sau chuẩn hóa như policy | `92c2815f` | `vendor.dto.spec` + integration |
| FIX-E-O4 mô tả 422 `budgetAdjustmentCreate` (số 0 ⟹ `INVALID_SHAPE`) | `af692c63` | integration `budget-adjustment` |
| FIX-E-O2b bỏ chữ "trimmed" khỏi mô tả `taxType` (test hợp đồng `openapi-request-rules`) | `69b3bb8e` | http-spec 11/11; **CI run 44015764378 XANH toàn bộ** |
| merge `feat/p5` @ `6bb2f3a2` (A2 + A1 + C) | `59f44b61` | xung đột `subscription-renewal.http-errors.ts` (lấy bản A1) + `module-graph.md` (sinh lại); phải `prisma:generate` |
| N3d đủ: câu + nhãn cho 10 mã (A1: `SUBSCRIPTION_RENEWAL_RED_ALERT`/`_KEPT`/`_OUTCOME_RECORDED`; A2: `SAAS_ISSUE_*`, `OUT_OF_PROCESS_CASE_REPORTED`, `VENDOR_ACCOUNT_DISCREPANCY_OPENED`, `DEVICE_STOP_*`) + viết lại `SUBSCRIPTION_RENEWAL_ALERT` (biến thể `commitment`), `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION_EXPIRY_MARKED`, `_DATA_QUALITY` | `1801bb04` | jest `notifications` 763; integration `in-app-notifications` 28/28 |
| R-2 (audit E) path lỗi tiền gia hạn = `nextPeriod.unitPrice` | `f2839e55` | integration `subscription-renewal-record` 18/18, `legacy-outcome` 9/9; **CI run 44047564993 XANH** |
| FIX-N3d-R1 target `subscriptionDeadlineEventList` cho `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` | `1b15298c` | test mới `notification-target.recipients.policy.spec.ts` (vai nhận ⊂ vai route) |
| FIX-N3d-R2 câu trung tính cho `OUTCOME_RECORDED` khi `substitute = true` | `02b4ca8f` | `notification-text.sbf20.spec.ts` 19/19 |
| FIX-N3d-O1 khai đúng mã tiền của hai route ghi kết quả gia hạn | `05e1e434` | `openapi-response-examples.http-spec` 7/7; **CI run 44051996589 XANH toàn bộ** |

Chưa chạy local (theo chỉ đạo đêm): `pnpm check`, `pnpm test:http`, `test:e2e`, integration toàn bộ — để CI.

## CI GitHub
- Run 43992871487 (`5993bf39`, sau FIX N): https://github.com/SEP490-FALL2026/BE-dev/actions/runs/43992871487 — **success** (select, quality, http-contract, integration 1/2/3, integration-inband, e2e-smoke; Deploy skipped).
- Run 43962777729 (`8a6c9ae1`): đỏ ở `quality` do `docs/generated/module-graph.md` lỗi thời (đã sửa bằng FIX-R1).
- Run 44005266892 (`3d76752b`, sau Phase E): https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44005266892 — **success** toàn bộ job.
- Run 44013215828 (`af692c63`, sau FIX E): `http-contract` ĐỎ — `test/http/platform/openapi-request-rules.http-spec.ts` (2 test) vì mô tả `taxType` viết "trimmed" trong khi schema không trim; sửa ở `69b3bb8e`.
- Run 44015764378 (`69b3bb8e`): https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44015764378 — **success** toàn bộ job (select, quality, http-contract, integration 1/2/3, integration-inband, e2e-smoke; Deploy skipped).
- Run 44047564993 (`f2839e55`, sau merge A1+A2+C + N3d + R-2): https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44047564993 — **success** toàn bộ job.
- **Run cuối 44051996589 (`05e1e434`, head nhánh B, đã chứa `origin/feat/p5` @ `6bb2f3a2`)**: https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44051996589 — **success** toàn bộ job (select, quality, http-contract, integration 1/2/3, integration-inband, e2e-smoke; Deploy skipped).

## http-spec / test có thể đỏ, cần CI (không chạy local)
- `test/http/platform/openapi-response-examples.http-spec.ts` (so tập mã mỗi route với `test/support/openapi-example-route-codes-*.ts` — đã cập nhật manifest cho E8a/E8b), `openapi-read-wording.http-spec.ts`, `api-coverage-manifest`, `test/http/catalog/vendor-tax-profile.http-spec.ts`, `test/http/requests/dot-1-removed-fields.http-spec.ts`, `test/http/catalog/requestable-software.http-spec.ts`; e2e `mobile-channel-smoke`, `paid-request-to-seat`.

## D-n (tự chốt, Owner duyệt sáng)
**Phase N / thông báo (D-N1…D-N13 như bản trước) + bổ sung:**
- D-N1 `q` hợp lệ `\d+(\.\d+)?` trong [0,1]; `*` bỏ qua, mục sau vẫn xét; header không phải chuỗi ⟹ `vi`.
- D-N2 số `0` trong `[ ]` coi là rỗng; `false` vẫn là giá trị.
- D-N3 `USAGE_TRACKING_NOTICE` là mã duy nhất lệch tập biến vi ≠ en (`VARIABLE_SET_EXCEPTIONS`).
- D-N4 `returnRequestId` có trong params `RETURN_*` nhưng không ở `NAME_KIND_BY_KEY` (spec A5) — audit: không ảnh hưởng, mẫu câu không in id này; có thể đóng.
- D-N5 `target = null` tường minh: `TRANSFER_RIGHTS_REVOKING`, `USAGE_TRACKING_NOTICE`, `IT_ADMIN_HANDOVER_RECEIVED`; 7 kiểu `subject` không có route GET chi tiết (`APPLICATION`, `BUDGET_ADJUSTMENT`, `COST_CENTER`, `DEPARTMENT_SOFTWARE_PROPOSAL`, `HANDOVER_DUTY`, `LICENSE_ASSIGNMENT`, `TRANSFER_REVIEW`); `STEP_ASSIGNED`/`STEP_SLA_REMINDER` chỉ `accessRequestGet` (chưa phân nhánh theo `stepKind` — 4b).
- D-N6 5 mã chỉ đọc có target `employeeGet` (catalog thắng spec A7).
- D-N7 tên Cost Center `<mã> · <tên>`; tên Request `<Ứng dụng> – <Gói>` qua `CatalogApi`, rơi về tên đề xuất; **sửa theo audit O-1:** Request nhóm CÓ `planId`, cụm chung chỉ hiện khi id đã bị xóa.
- D-N8 `SubscriptionRepo.labelsOf` giữ `/`, thêm tham số `label`.
- D-N9 câu `STEP_SLA_REMINDER` cho `REQUESTER` do B tự viết (catalog không có câu riêng) — **catalog Docs cần cập nhật**.
- D-N10 ghost seat `employeeId = null` chỉ test được bằng unit (CHECK DB); `decision-reminder.service.ts:132` không tới được với null.
- D-N11 chuẩn hóa `subject.type` chỉ cảnh báo, không ném; không đổi `resource_type` Audit Trail.
- D-N12 commit `c1b682bc` làm đỏ tạm gate `capability-graph` R7 (`core/uuid.ts` mới một module dùng); từ `8e0e9d3d` xanh — gộp hai commit nếu cần bisect sạch.
- D-N13 file vào nhóm text đổi tên `notification-text.policy.ts` → `inbox-notification-text.policy.ts` (rule `group-entry-from-capability`; gate cấm re-export).
- D-O1 cụm chung `(không rõ tên)` / `(unnamed)` cho REQUEST, DEPARTMENT, COST_CENTER, APPLICATION, PLAN, SUBSCRIPTION (danh từ lặp trong mẫu câu); EMPLOYEE giữ "một nhân viên"/"an employee". **Lệch gợi ý "yêu cầu của bạn" của catalog README — Owner chọn.**
- D-R4 các câu bọc `[ ]` lệch chữ catalog (catalog viết biến trần): `STEP_SLA_ESCALATION`, `STEP_ASSIGNED`, `REQUEST_BUDGET_VERSION_ENDED`, `REQUEST_AWAITING_BUDGET`, `REQUEST_WAITING_CONTROLLED/ENDED`, `REQUEST_RENEWAL_NOT_APPLIED`, `REQUEST_CANCELLED_BENEFICIARY_GONE`, `RETURN_REQUESTED` (3 nhánh, thêm chữ "quyền"/"access") — **catalog Docs cần cập nhật**. `CONTROLLED_WAIT_ALERT` viết lại thành một câu (nếu `stepKind` null thì "đang chờ vì …" không chủ ngữ — theo gợi ý audit).
- D-O4 `PERSONNEL_EVENT_RECORDED.eventKind` có 10 giá trị: 9 trong catalog + `DEPARTURE_MARKED_LEFT` (writer có, catalog không ghi).
- D-R3 quét toàn catalog: chỉ 3 mã có câu riêng cho người nhận là đương sự (`EMPLOYEE_PROFILE_UPDATED`, `TRANSFER_RIGHTS_REVOKING`, `PERSONNEL_EVENT_RECORDED`); `REQUEST_RETURNED` (trưởng phòng vs người yêu cầu) = O-2, dời 4b (cần thêm param ở nơi ghi).
- D-A2 `SPEND_BATCH_SUBMITTED` khi `sentCount = 1` ra "1 requests" (spec không có số ít); khi thiếu tên phòng ra "Trưởng phòng (không rõ tên)".
**Phase E / lỗi:**
- D-FIXE-1 (đã xử lý) D-E2-1 bên dưới: query phẳng `netAmount` nay ra `issues[0].path = 'netAmount'` (FIX-E-O1). Đã KIỂM các trường tiền khác nghi phẳng: `invoice-discrepancy` (`differenceAmount`) và mọi caller của `budget-facts.money` đều nhận OBJECT `{amount}` trong body thật ⟹ `<path>.amount` đúng, không sửa (đọc DTO + controller, không đổi file).
- D-FIXE-2 (ĐÃ XỬ LÝ, `f2839e55`) R-2 của audit Phase E: hai route `subscriptionRenewalPropose` (ghi một lần của A1) và `subscriptionRenewalRecordOutcome` cùng gọi `recordNext` ⟹ `details.path = nextPeriod.unitPrice`; path truyền từ nơi gọi nên `subscriptionCreate`/`subscriptionUpdate` vẫn `unitPrice`/`originalPrice`.
- D-N3d-1 `OUT_OF_PROCESS_CASE_REPORTED` có `target = null` (người nhận không có route đọc hồ sơ).
- D-N3d-2 `SAAS_ISSUE_STATE_CHANGED` viết thành 4 câu đầy đủ theo quy ước "biến thể là cả câu" (spec ghi `otherwise` rỗng).
- D-N3d-3 `SUBSCRIPTION_RENEWAL_DATA_QUALITY` thêm biến thể theo `problem` (`NO_NOTICE_DEADLINE` có câu riêng) — catalog Docs cần chép.
- D-N3d-4 câu `SUBSCRIPTION_RENEWAL_ALERT` đọc ra "kỳ gói tháng / kỳ gói năm" (đúng §13, hơi gượng).
- D-N3d-5 `CURRENCY_NOT_SUPPORTED` không tới được qua `nextPeriod.unitPrice` (`assertPriceInDong` chặn trước, `PERIOD_REFUSED` lý do `PRICE_NOT_VND`) ⟹ đã bỏ khỏi khai báo OpenAPI hai route (FIX-N3d-O1), thêm `MONEY_OUT_OF_RANGE` và `MONEY_SCALE_EXCEEDED` `allowedDecimals = 0`.
- D-N3d-6 nhãn `choice` dùng chung thêm `INCREASE`; `OUTCOME_RECORDED` có bộ nhãn riêng thắng nhãn chung.
- D-N3d-7 (audit N3d R-2) câu `substitute = true` của `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`: vi "Kết quả được một IT Admin khác ghi thay IT Admin phụ trách.", en "Recorded by another IT Admin on behalf of the IT Admin in charge." — **lệch §13 của SPEC-5A-SBF20 và catalog Docs; §13 và catalog cần cập nhật** (Finance cũng nhận mã này nên không được viết "ghi thay bạn").
- D-N3d-8 (audit N3d R-1) `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT` target `subscriptionDeadlineEventList` (route mở cho IT Admin, Finance, Người duyệt chi, Super Admin); test `notification-target.recipients.policy.spec.ts` đọc vai của route bằng cách quét `@RequireRoles` trong source controller (OpenAPI không mang vai) và dùng bảng người nhận SBF-20 viết tay — phải sửa khi người nhận hoặc cách khai decorator đổi.
- D-N3d-9 để 4b (audit N3d): O-2, O-3 và các Nit chưa làm.
- D-ENV container test DB `slm-p5-b` mất role `ci_integration` giữa chừng (lỗi 28P01) — subagent tạo lại theo `test/README.md`; không ảnh hưởng CI.
- D-FIXE-3 (Owner) O-3 `FINANCE.SETUP_INCOMPLETE.details.departmentId` trên route Request đảo khẳng định cũ; O-5 `BUDGET.COST_CENTER_REQUIRED.details.costCenterIds` gồm cả Cost Center không còn dùng — chưa đổi mã.
- D-E2-1 `vendor-tax` nhận `netAmount` là query phẳng ⟹ chuỗi hỏng cho `issues[0].path = 'netAmount.amount'` (field không tồn tại) theo B2; `MONEY_*` có `details.path='netAmount'` đúng. Giữ theo spec — Owner quyết nếu muốn đổi.
- D-E2-2 `purchase-invoice-plan.service.ts:254` đổi `path` từ `amount` sang tên field thật `netAmount`/`deductibleTax`/`nonDeductibleTax`.
- D-E3-1 `OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID` không cần sửa — mọi nhánh đã có `details.reason`.
- D-E3-2 `DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS` loại `OFFBOARDING` không có `eventId` (tránh vòng import offboarding↔transfer).
- D-E3-3 `LICENSE_ASSIGNMENT.OVERLAP`/`IDENTIFIER_IN_USE`: mới có đường ống `conflictingAssignmentId`, nơi ném chưa cấp giá trị (id nằm ngoài lỗi `23P01`) ⟹ `details` luôn vắng (spec cho phép) — 4b.
- D-E3-4 `FINANCE.SETUP_INCOMPLETE` nay có `details.departmentId` ở mọi route kể cả access-request (spec cũ từng khẳng định không có id này, đã đổi theo B3 dòng 6) — Owner xem lại nếu muốn giữ kín.
- D-E3-5 `BUDGET_REVIEW.SEAT_MONTHS_NOT_READY` không có unit spec mapper (thư mục đủ 25 file); phủ bằng integration `budget-review-figures` + spec `seat-month.service`.
- D-E8a-1 bỏ có chủ ý (code không ném được qua route): `BUDGET.COMMITMENT_REASON_REQUIRED` (DTO `min(1)` chặn trước), `ACCESS_REQUEST.OWN_REQUEST` ở `accessRequestCatalogLink`, `PLAN.WORKSPACE_LIMIT_EXCEEDED` ở `subscriptionCreate`, `DEPARTMENT_SOFTWARE.NOTE_INVALID`, `BUDGET.VERSION_NUMBER_TAKEN`; `spendApprovalDecide` 404 giữ `ACCESS_REQUEST.NOT_FOUND` (code thật), chỉ sửa mô tả; `LONG_LEAVE.RETURN_DATE_INVALID` chỉ `NOT_AFTER_START` ở route này.
- D-E8a-2 khai thêm ngoài bảng spec vì code thật ném: `PURCHASE_INVOICE.NO_PLACE` (resubmit), `BUDGET.ADJUSTMENT_REASON_REQUIRED`, `GHOST_SEAT.SEAT_NOT_REVOCABLE`, `PROVISIONING_TASK.NOT_MANUAL` (3 route), `EMPLOYEE.NOT_FOUND` ở `provisioningTaskGrant` (suy từ code, chưa chạy thử).
- D-E8b-1 **enum response: KHÔNG bỏ giá trị nào** (`PLAN_LINE_MOVED`, `FINANCE_OUTCOME_WHILE_WAITING`, `RETURNED_BY_FINANCE`, `CONFLICT_OF_INTEREST`, `SENT_TO_FINANCE`, `SERVICE_ACCOUNT`, `BUDGET_VERSION_APPROVED`): code không ghi nữa nhưng vẫn đọc hàng cũ trong DB ⟹ giữ và thêm mô tả "chỉ ở bản ghi cũ".
- D-E8b-2 `REQUEST_BOUNDARY_NOT_CHECKED`/`RESPONSIBLE_NOT_IN_DEPARTMENT` giữ (code còn ném cho request service account cũ còn lại sau migration); mô tả đổi thành "chỉ với request service account còn từ bản cũ".
- D-E8b-3 B1: chỉ ghi `issues[0].path = reason` ở 7/12 route checklist; 5 route còn lại (`accessRequestAssessmentComplete`, `spendBatchSubmit`, `spendReserveConfirm`, `ghostSeatDecisionCreate`, `ghostSeatEscalationCreate`) không ném lỗi thiếu lý do (quyết định COMPLETE/CONFIRM/KEEP/EXEMPT/ESCALATE).
- D-E8b-4 tax-profile: `TOO_MANY_LINES` và `TAX_TYPE_INVALID` (tên dài) không còn ra từ route này; mã/mapper giữ nguyên, bỏ khỏi mô tả 422 và manifest ví dụ.

## Thông báo mới cho 5b
- Đã có (A2): `SPEND_BATCH_SUBMITTED` (câu theo bảng §1.B), nhãn `cause` `RESUBMITTED`, `SPEND_SENT` của `STEP_ASSIGNED`, `target` `spendBatchGet`.
- Chưa có: mã/đổi của A1 (SBF-20, `SUBSCRIPTION_RENEWAL_ALERT` biến thể `commitment`, `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`/`_EXPIRY_MARKED`, 3 mã mới, nhãn `problem`/`commitment`/`choice`/`outcome`) ⟹ N3d phần A1 chờ "A1 ĐÃ MERGE". Các mã A2 đã bị cắt (FX-T4/T5/T9c) chưa vào `feat/p5` nên không có câu.
- Nhắc điều phối: import `./notification-text.policy` phải thành `./inbox-notification-text.policy`.

## Breaking FE (của B)
- `subject.type` luôn `UPPER_SNAKE`: `LicenseAssignment`→`LICENSE_ASSIGNMENT`, `ProvisioningTask`→`PROVISIONING_TASK`, `HandoverDuty`→`HANDOVER_DUTY`, `Employee`→`EMPLOYEE` (cả hàng cũ, áp lúc đọc).
- DTO `PUT /vendors/{id}/tax-profile` siết: `lines` ≤ 20 (từ 100), `taxType` ≤ 100 ký tự (từ 1000) ⟹ vượt nay là 422 `VALIDATION_ERROR` (`issues[].path = lines` / `lines.N.taxType`), không còn `VENDOR_TAX_PROFILE.TOO_MANY_LINES`/tên quá dài từ route này. **Từ FIX-E-O2: độ dài `taxType` đếm SAU chuẩn hóa (bỏ khoảng trắng đầu/cuối, gộp khoảng trắng, NFC) như policy; OpenAPI của `taxType` MẤT `maxLength: 100` (thay bằng `description`) ⟹ FE sinh form từ OpenAPI không còn tự áp giới hạn 100; FE phải tự ghi giới hạn 100 hoặc dựa vào lỗi 422 (điều phối đã đồng ý ghi nhận).**
- Lỗi tiền: `details.path` là đường dẫn trong body thật: quote thẩm định ra `quote.unitPrice`/`quote.originalPrice` (`accessRequestAssessmentSave`) và `spend.quote.unitPrice`/`spend.quote.originalPrice` (`accessRequestInternalRegister`); query phẳng `netAmount` của tax-profile, chuỗi hỏng ra `issues[0].path = 'netAmount'` (các route nhận object tiền vẫn `<path>.amount`).
- `applicationList.emptyState` chỉ còn `NO_APPLICATIONS`/`APPLICATIONS` (bỏ `NO_SUBSCRIPTIONS`, `CONTRACTS_AND_SUBSCRIPTIONS` khỏi schema).
- `assignmentExpiryStartRevocation`: OpenAPI sửa 409 ⟹ **403** `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` cho khớp code (code không đổi).
- Enum response: **không bỏ giá trị nào** (xem D-E8b-1).
- Chỉ thêm (không phá): thông báo thêm `title`, `message`, `target`; header `Accept-Language` ở `notificationList`, `notificationMarkRead`; `STEP_SLA_REMINDER` thêm param `recipientRole` (dòng mới); ghost seat `employeeId` có thể `null` thay vì `""`; chuỗi tiền hỏng có `details.issues[{code, path}]`, `MONEY_OUT_OF_RANGE`/`MONEY_SCALE_EXCEEDED`/`CURRENCY_NOT_SUPPORTED` thêm `details.path`; 15 mã B3 thêm `details` (xem bảng dưới); `FINANCE.SETUP_INCOMPLETE.details.departmentId`; ~35 mã lỗi thật nay khai trong OpenAPI.
- Danh sách lệch status (B5.1) "sẽ xem ở 4b".

### 15 mã B3 → `details` thật
`ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE {maxMonths, provisioningType}` (proposal chỉ `{maxMonths:12}`) · `RENEWAL_REQUEST.ALREADY_REQUESTED {requestId}` · `RETURN_REQUEST.ALREADY_REQUESTED {requestId}` · `RETURN_REQUEST.RENEWAL_PENDING {requestId}` · `SPEND.NOT_IN_QUEUE {requestId}` · `FINANCE.SETUP_INCOMPLETE {departmentId}` · `OFFBOARDING_CASE.PENDING_EVENT_EXISTS {eventId}` · `DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS {eventId}` (trừ nhánh OFFBOARDING) · `BUDGET.COST_CENTER_REQUIRED {costCenterIds}` · `BUDGET.VERSION_IN_FLIGHT {versionId}` · `BUDGET.CURRENT_EXISTS {versionId}` · `BUDGET.PROPOSAL_ALREADY_OPEN {proposalId}` · `BUDGET_REVIEW.SEAT_MONTHS_NOT_READY {subscriptionIds}` · `LICENSE_ASSIGNMENT.OVERLAP`/`IDENTIFIER_IN_USE {conflictingAssignmentId}` (hiện luôn vắng — D-E3-3).

## Số đếm tham số
B không thêm/bớt định nghĩa tham số vận hành (số khóa không đổi so `dev`). Chưa chạy test `parameter-definitions` sau merge A2 (ngoài bộ kiểm nhanh) — điều phối kiểm số khóa khi gộp.

## Nợ test / Nghi lỗi logic
- Nợ test: không có test cũ nào đỏ ngoài phạm vi trong các lượt kiểm local. Nhóm http-spec/e2e liệt kê ở trên chỉ chạy được ở CI.
- Nghi lỗi logic: không có.

## Đã cắt / Chưa làm
- Chưa làm: không còn việc của prompt 5 (N3d đủ đã xong sau khi A1 + C merge `feat/p5`). Chưa cắt gì trong `PLAN.md` §5.
- Dời 4b (ghi nhận): O-2 (`REQUEST_RETURNED` câu riêng trưởng phòng), nhãn `target` phân nhánh theo `stepKind`, id `conflictingAssignmentId`, `eventId` nhánh OFFBOARDING, các mục B5 (lệch status, tách mã gộp…).
- Audit (AUDIT-B-N-review.md): R-1…R-4 + O-1/O-3/O-4 đã sửa; O-5 (test HTTP đếm N+1), O-6 (gộp `c1b682bc`+`8e0e9d3d`), O-8, N-1…N-5 chưa làm (ghi D-n/để 4b).

## Docs follow-up (cho điều phối, Phần C — B không sửa repo Docs)
- `catalog/notifications.md`: ví dụ wire thêm `title`/`message`/`target`; dòng `target` mỗi mục; `subject.type` luôn `UPPER_SNAKE`; `STEP_SLA_REMINDER` thêm `recipientRole` + câu `REQUESTER` (D-N9); ghost seat `employeeId` có thể `null`; các câu đã đổi theo R-4 (D-R4) và `BUDGET_ADJUSTMENT_DECIDED` thêm `[ — {costCenterId:name}]`; `PERSONNEL_EVENT_RECORDED.eventKind` thêm `DEPARTURE_MARKED_LEFT`; ghi mã do A2 thêm.
- `catalog/errors.md`: 15 mã B3 (cột `details`), lỗi tiền `details.path`/`issues`, bỏ nhãn "(không khai trong OpenAPI)" ở mã đã khai (E8a), không đổi cột HTTP.
- `catalog/README.md`: thêm formatter `:quarter`; quy ước lỗi 17/11; cụm chung `(không rõ tên)`.
- Sinh lại `reference/*`, `enums.md`, `api-index.md`.

## FIX smoke (P5-FIX-SMOKE, 17/11/2026) — XONG, CI xanh trên `fe91beb4`

Làm trực tiếp trên `feat/p5` (đã push, chưa merge `dev`/`main`). Code do subagent Sonnet viết từng gói; điều phối chat B kiểm lại độc lập từng gói (typecheck, `test:gates` 337, jest, `graph/routes --check`, `openapi:export` không drift, integration chính).

| Mục | Commit | Kết quả |
| --- | --- | --- |
| F1 target theo vai người đọc | `d19bbbdd` | trưởng phòng không còn 403 ở `budgetCycleGet`/`budgetVersionGet`/`departmentTransferGet`/`offboardingCaseGet`; test lượng tử hóa mọi mã × subject × vai; integration `in-app-notifications` 29/29 |
| F2 path lỗi tiền `budgetAdjustmentCreate` | `22aa9322` | **không đổi path** (xem D-1); test ghim hành vi, integration `budget-adjustment` 18/18 |
| F3 chữ EN + dấu chấm đôi | `9e4ce969` | spec `notification-text.wording.spec.ts` (đỏ 7 câu → xanh); jest `notifications` 773 |
| F4 `NOT_RENEWABLE` đủ 6 reason | `5f952160`, `fe91beb4` | commit đầu làm message 165 ký tự > 160 ⟹ `http-contract` đỏ (run 44085641450); `fe91beb4` rút còn 148 ký tự |
| F5 `alerts` rỗng khi không có điểm điều chỉnh | `65375780` | `hasAdjustmentPoint` (chỉ K2, không INTERNAL); jest `catalog` 576 |
| T1 replay lô chỉ báo 1 lần | `0f086c61` | mutation `randomUUID()` trong `eventKey` ⟹ test đỏ (3 dòng thay vì 1), đã khôi phục; integration 8/8 |

CI: run 44085641450 (`0f086c61`) đỏ ở `http-contract` (`openapi-response-examples`: message `NOT_RENEWABLE` quá 160 ký tự); **run 44088867187 (`fe91beb4`) xanh toàn bộ job**: https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44088867187

### D-n
- D-1 (F2, cần Owner/điều phối xác nhận): BE nhất quán — `MONEY_OUT_OF_RANGE`/`MONEY_SCALE_EXCEEDED` trả `details.path` là đường dẫn tới OBJECT tiền (`amount`), còn `VALIDATION_ERROR` chuỗi hỏng trả `<path>.amount`. Mọi route khác (`unitPrice`, `requestedAmount`, `annualCeiling`, `base`, `reserve`) cùng quy ước. Smoke F2 coi là lỗi nhưng đó là cách đọc nhầm; đổi riêng một route sẽ lệch, đổi chung phải sửa helper `facts.money`, nhiều test và ví dụ OpenAPI. **Docs**: `catalog/errors.md` và `changes/2026-11-17-prompt5.md` ghi rõ: `MONEY_*` có `details.path` trỏ tới object tiền, `VALIDATION_ERROR` có `issues[].path = <object>.amount`; FE gắn cùng một ô bằng cách bỏ hậu tố `.amount`. Nếu vẫn muốn `amount.amount` cho `MONEY_*` ⟹ đợt đổi riêng.
- D-2 (F5): chỉ đổi `alerts` của list; badge/filter hết hạn vẫn dùng `runsAPeriod`, `subscription-notice.service.ts` không đổi. Muốn K1 mất badge/nhắc hạn ⟹ việc riêng.
- D-3 (F1, Docs): cột "Bấm vào mở" của `catalog/notifications.md` phải theo vai; trưởng phòng nhận `BUDGET_CYCLE_OPENED` → `budgetMine`, `BUDGET_VERSION_DECIDED` → `budgetMineVersionList`, `BUDGET_NEXT_YEAR_MISSING`/`BUDGET_THRESHOLD_REACHED`/`BUDGET_SHARED_POOL_OVER_RESERVE` → `budgetMine`; `PERSONNEL_EVENT_RECORDED` người liên quan → `meDepartmentTransferGet`/`meDepartureNoticeGet`, trưởng phòng `null`; `EMPLOYEE_PROFILE_UPDATED` nhân viên → `meGet`, vai khác `null`; `target = null` có thể xảy ra với bất kỳ mã nào khi vai người đọc không đọc được route đích. `budgetMine`/`budgetMineVersionList` không có path param (FE tự thêm `year`/`costCenterId`).
- D-4 (F1, kỹ thuật): vai route đọc bằng quét `@RequireRoles`/`@RequireRolesOrGrants`/decorator class trong controller + bảng tay cho 3 route service giới hạn (`budgetVersionGet`, `budgetProposalGet`, `subscriptionRenewalGet`) — phải sửa khi vai route đổi.
- D-5 (F3): dấu chấm đôi xử lý ở renderer (cắt đúng một dấu chấm cuối của biến raw đứng ngay trước dấu chấm của mẫu), không đổi dữ liệu lưu.
- D-6 (F4): subagent không chạy `test:http`; lỗi 160 ký tự chỉ lộ ở CI, điều phối chạy đúng một http-spec để xác nhận sửa.
