# SPEC-5A-FIXES — spec + plan chat A2 (prompt 5, 16–17/11/2026)

Tiếng Việt; giữ tiếng Anh cho code, route, field, mã lỗi, đường dẫn. Nguồn: `SPEC-BRIEF.md` cùng thư mục. BE đọc ở `dev` @ `94a8ee84`.

**Skill đã đọc/dùng (Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`):**
- `agent-skills:spec-driven-development`: process, dựng phần spec (mục tiêu, hiện tại, đích, tiêu chí xong).
- `agent-skills:planning-and-task-breakdown`: process, chia task ≤ ~5 file, thứ tự phụ thuộc, checkpoint.
- `superpowers:writing-plans`: domain, mẫu task có file/test/lệnh. Phần "code đầy đủ từng bước" của skill **không áp** vì brief cấm viết code.
- `superpowers:verification-before-completion`: kiểm lại từng `file:dòng` trước khi ghi. Các dòng trích bên dưới đều đã đọc trong code.

**Tổ chức chat (PLAN.md, sửa 17/11 theo `REVIEW-SPECS.md`):** spec này là chat **A2** (nhánh `feat/p5-a2-fixes`, worktree `Code/be-p5-a2`).
`SBF-20` là chat **A1** (`SPEC-5A-SBF20.md`), chạy **song song**; cả hai merge vào nhánh tích hợp `feat/p5`, A2 merge **trước**. Mã task
`FX-T1…` (A1 dùng `S20-T1…`). Migration của A2 chỉ trong dải **`20261117100000`–`20261117100900`**. Sửa theo review: FX-1 (số đếm tham số),
FX-2 (params `DEVICE_STOP_*`), FX-3 (CHECK + đua `23505`), FX-5 (Q-5A-1 = B, Owner chốt 17/11 — Review 2), FX-6 (log trước 503), FX-4 (ghi lệch có
chủ ý), bàn giao câu thông báo đủ cột (§1.B), Breaking FE (§9), trích dẫn `inbox.policy.ts`.

**Không gồm:**
- `SBF-20` (chat A1 song song).
- Chữ `title`/`message` của thông báo và đổi mã/`details` lỗi chung (thuộc 5b).
- `QĐ-108g` (tệp đính kèm phiếu SaaS) và `QĐ-108h` (tự đóng phiếu khi quyền kết thúc hoặc người báo nghỉ). Cả hai đều chưa có trong code, ghi ở §8.
- SoD của `ghostSeatQueueList`: hàng của trưởng phòng đang trả bằng chứng đầy đủ (REPORT-A4). Việc này không thuộc phạm vi đọc của IT, ghi ở §8.
- `FIX-PL2-Q3`: gửi lại kèm hồ sơ bổ sung.

**Quy ước test (Owner 15/11):**
- Test của task phải đỏ trước, xanh sau.
- Test cũ ngoài task vỡ vì test cũ/harness/seed lỗi thời (không có 500, không sai tiền hay luồng) ⟹ ghi một dòng vào `## Nợ test cho FIX-TEST`, không sửa tại chỗ.
- Thấy lỗi logic ⟹ sửa ngay.

---

## 1. Spec

### A. Duyệt chi trả 500 thay 409 (REPORT-A6, REPORT-A3)

**A.1 — lỗi cam kết từ budgets không có mapper ở requests**

Hiện tại:
- `BudgetCommitmentExistsError` và `BudgetCommitmentNotHoldableError` khai ở `src/modules/budgets/budget/budget.errors.ts:62-85`. Hai lớp này là file **nội bộ**, không có trong `budgets/public/budgets.errors.ts`.
- Chỉ `toBudgetApiException` map hai lỗi này (`budget/budget.http-errors.ts:94-104`).
- Chúng được ném từ `CommitmentService.hold` (`budgets/commitment/commitment.service.ts:211-220`, `budget/commitment.repo.ts:94-95`). Đường gọi: `BudgetsApi.holdForRequest` (`public/budgets.api.ts:51`) ⟹ `SpendEffectsService` (`requests/spend-effects/spend-effects.service.ts:70`). Service này được gọi từ `spend-approval/spend-decision-recorder.service.ts:70` (`spendApprovalDecide`, `spendBatchDecide`) và `group-line-decisions/group-spend-hold.service.ts:38` (`spendApprovalLineDecide`).
- `toSpendApiException` (`requests/spend/spend.http-errors.ts:23-57`) không biết hai lỗi này. `toGroupRequestApiException` cũng rơi về nó (`group-request/group-request.http-errors.ts:104`). Kết quả: global filter trả 500 `INTERNAL_SERVER_ERROR` (`infrastructure/http/filters/http-exception.filter.ts:25-26,38-44`).
- Riêng `spendBatchDecide`: `decideOne` chỉ bắt `AccessRequestNotFoundError`, `AccessRequestGroupUsesLinesError` và `SpendDecisionRefusedError` rồi `throw error` (`spend-approval/spend-batch-decision.service.ts:89-98`). Các Request đã quyết trước đó trong lô (mỗi cái một transaction) vẫn được giữ, nhưng cả response là 500.

Ghi chú: comment ở `budget.errors.ts:69-72` gọi lỗi này là "lưới an toàn", vì lần kiểm lại lúc duyệt đã chặn trường hợp năm không có phiên bản. Dù hiếm, lỗi vẫn phải trả 409, không được trả 500.

Đích:
- Chuyển hai lớp lỗi sang `budgets/public/budgets.errors.ts` (theo tiền lệ `organization/public/organization.errors.ts` ⟹ `FinanceSetupIncompleteError` mà budgets đang dùng). **Review 2:** xóa hai lớp khỏi `budget/budget.errors.ts` và **sửa import** ở 3 nơi dùng trong budgets — `budget/budget.http-errors.ts:25-26`, `budget/commitment.repo.ts:14`, `commitment/commitment.service.ts:22-24` — sang `../public/budgets.errors`. **Không** re-export (`docs/rules/module-structure.md:188-189` cấm `export … from`, kể cả `public/`). Một lớp duy nhất nên `instanceof` vẫn đúng. Không đổi logic mapper của budgets.
- `toSpendApiException` thêm hai nhánh, trả **đúng** status/code/details như `budget.http-errors.ts:94-104`:
  - 409 `BUDGET.COMMITMENT_NOT_HOLDABLE`, `details {reason, year?}`.
  - 409 `BUDGET.COMMITMENT_EXISTS`, `details {year}`.
- `spendBatchDecide`: hai lỗi này ⟹ `skipped('COMMITMENT_NOT_HOLDABLE')`. Các Request khác của lô đi tiếp như mọi lý do bỏ qua. Thêm giá trị `COMMITMENT_NOT_HOLDABLE` vào enum `reason` của `resultSchema` (`spend-approval-view/spend-approval.dto.ts:251-260`). Đây là thay đổi **thêm vào** của response.
- OpenAPI: thêm ví dụ 409 cho `spendApprovalDecide` (`spend-approvals.controller.ts:93-125`) và `spendApprovalLineDecide` (`group-line-decisions/group-lines.controller.ts:143-175`). Ví dụ sinh bằng `errorExampleOf(toSpendApiException(...))` trong `SPEND_ERROR_EXAMPLES`.

Xong khi:
- Unit `toSpendApiException(new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026))` ⟹ 409 với `details {reason:'NO_APPROVED_BUDGET', year:2026}`.
- Unit `decideOne` với `decisions.decide` ném lỗi đó ⟹ `{outcome:'SKIPPED', reason:'COMMITMENT_NOT_HOLDABLE'}`.
- `toGroupRequestApiException` cho cùng kết quả.

**A.2 — route không có try/catch: DB tạm lỗi trả 500 thay 503**

Hiện tại:
- `seatMonthChargeList` gọi thẳng service, không có try/catch (`budgets/seat-month/seat-month-charges.controller.ts:47-49`).
- Quét bằng cách so số `catch (` với số route của controller thấy thêm 8 route cùng kiểu:
  - `itAdminList`
  - `stockSummaryList`
  - `invoiceDiscrepancyList`
  - `purchaseInvoiceList`, `purchaseInvoiceMissingPeriodList`
  - `spendBatchList`
  - `outOfProcessCaseList`
  - `vendorAccountDiscrepancyList`
- Global filter chỉ biết `HttpException`; mọi lỗi khác thành 500 (`http-exception.filter.ts:25-26`).
- Trong khi đó OpenAPI của các route này khai 503 (`GUARDED_SERVICE_UNAVAILABLE_RESPONSE`, `api-error-responses.decorator.ts:38-44`).

Đích (một chỗ, không sửa từng controller): trong `HttpExceptionFilter.catch` đổi dòng `const handled = fromRequestParserError(exception) ?? exception` thành thêm `?? toUnavailableApiException(exception)` trước `exception` (`infrastructure/http/errors/service-unavailable.ts:17-27`).
- Hàm này chỉ khớp `TransientDatabaseError`, lỗi driver tạm thời và object storage. Lỗi khác vẫn là 500, đúng ý comment `service-unavailable.ts:13-16`.
- Route đã có mapper không bị ảnh hưởng, vì mapper đã đổi lỗi thành `ApiException`.
- Trước khi đổi sang 503, filter **log cảnh báo** kèm `requestId` và nguyên nhân (`describeForOperator`), vì `createEnvelope` chỉ log lỗi không
  phải `HttpException` — đổi xong sẽ mất log nguyên nhân (review FX-6).

Xong khi: spec của filter cho thấy `new TransientDatabaseError(...)` ⟹ 503 `SERVICE_UNAVAILABLE`, `new Error('x')` ⟹ 500 `INTERNAL_SERVER_ERROR` (giữ log).

### B. Thông báo còn thiếu

Nguyên tắc chung:
- Mã mới thêm vào `IN_APP_NOTIFICATION_CODES` (`notifications/public/notifications.types.ts`) và `PARAM_KEYS_BY_CODE` (`notifications/inbox/inbox.policy.ts:29-213`).
- Khóa param không được chứa từ của `FIGURE_WORDS`/`FORBIDDEN_PARAM_KEY` (`inbox.policy.ts:12-15`).
- Cột `code` chỉ có CHECK regex (`prisma/migrations/20261024110000_notifications_in_app_inbox/migration.sql:19`), nên **không cần migration**.
- Thông báo của Request: thêm luật vào bảng `RULES` (`requests/status/rules/request-status-rules.policy.ts:24-31`). Worker tự chiếu từ audit; người gây ra sự kiện bị loại (`plan()` dòng 66-90).
- Thông báo ngoài Request: ghi `notifyInApp` trong transaction của thao tác (mẫu `licensing/department-tools/department-software-notice.service.ts:30-45`).

| # | Lỗ hổng | QĐ/BRD đòi | Người nhận | Mã |
| -- | -- | -- | -- | -- |
| B1 | Gửi lại sau _Trả về_: `ACCESS_REQUEST.RESUBMITTED` không có luật (`request-intake/request-resubmission.service.ts:64-80,104-120`) | BRD 5.5.4 "Trạng thái yêu cầu thay đổi ⟹ Employee và người duyệt liên quan", `FR-3.11`, `FR-11.2` | Người giữ bước vừa mở lại: IT Admin của bước đánh giá (fact `ASSESSMENT_HOLDER`), hoặc người giữ từng bước nhu cầu mở lại | `STEP_ASSIGNED` có sẵn. `cause` thêm giá trị **`RESUBMITTED`** |
| B2 | Bước duyệt chi mở qua lô (`VIA_HEAD`) không có `STEP_ASSIGNED`. Luật chỉ xét `routingMode === 'ONE_STEP'` (`status-rules-budget-check.policy.ts:17-27`). Bước mở qua xác nhận dự phòng cũng không có, vì `ACCESS_REQUEST.RESERVE_CONFIRMED` (`reserve-confirmation.service.ts:137-153`) không có luật | `FR-3.21`, BRD 5.5.4 "Lô trình duyệt chi được gửi ⟹ Người duyệt chi"; `FR-3.11` "Người duyệt chi nhận thông báo ngay khi cần quyết" | Người duyệt chi giữ bước (`spendAssigneeEmployeeId`) | Theo **Q-5A-1 = B** (Owner chốt 17/11 — Review 2): **`SPEND_BATCH_SUBMITTED`** (mới) một thông báo mỗi lô cho mỗi Người duyệt chi có bước vừa mở trong lô; `STEP_ASSIGNED` `cause` **`SPEND_SENT`** chỉ cho xác nhận dự phòng **sau** lô. Request một bước giữ `cause SUBMITTED` |
| B3 | Mục trình lô dừng vì `PRICE_MISSING`: `notCheckable()` trả về ngay với `VIA_HEAD`, không ghi audit (`spend/spend-routing.service.ts:99-119`), nên không có thông báo (R1 A11/F3) | BRD 5.5.4 "Request bị chặn vì bằng chứng giá ⟹ người yêu cầu và trưởng phòng; IT Admin phụ trách phòng ⟹ khi trình" | Người yêu cầu + IT Admin phụ trách (fact `IT_ADMIN`). Trưởng phòng là người trình nên bị loại; họ đọc `results[]` | `REQUEST_BUDGET_BLOCKED` có sẵn, `reasons = 'PRICE_MISSING'` |
| B4 | Trưởng phòng tự gửi đề xuất phần mềm mới (Request một bước, `NEW_SOFTWARE`): `ACCESS_REQUEST.ASSESSMENT_REQUESTED` (`spend-routing.service.ts:56-65`) không có luật | `FR-3.11`, `FR-3.4` | IT Admin giữ bước đánh giá (`itAdminEmployeeId` của payload; null ⟹ không ai, bước chờ đã có `CONTROLLED_WAIT_ALERT`) | `STEP_ASSIGNED`, `stepKind IT_ASSESSMENT`, `cause SUBMITTED` |
| B5 | Báo lỗi SaaS (`SBF-09`) không có thông báo nào, dù audit đã mang `notifyEmployeeId` (`licensing/saas-issue/saas-issue.service.ts:140-150`, `saas-issue-sweep.service.ts:74-95`) | `FR-2.15`, BRD 5.5.4 "Báo lỗi SaaS mới / đổi trạng thái / quá hạn phản hồi ⟹ IT Admin phụ trách; người báo (khi đổi trạng thái)", `QĐ-108f` (quá hạn chỉ nhắc IT), `SBF-09` bước 7 | Xem B5-chi tiết | 3 mã mới |
| B6 | `SBF-07a` đóng ở mức báo cáo không báo ai (R1 C5, REPORT-A5) | `SBF-07a.md` §5.1 "Không có tài khoản/quyền của công ty để thu hồi — chỉ ghi nhận và báo cáo — người dùng và trưởng phòng của phòng dùng được báo" (`QĐ-103m`) | Người dùng (`vendor_account_discrepancies.employee_id` của hồ sơ) + trưởng phòng hôm nay của phòng người đó. Không có người dùng ⟹ không ai | **`OUT_OF_PROCESS_CASE_REPORTED`** (mới) |
| B7 | `SBF-08` mở sai lệch không báo IT (REPORT-A5) | `SBF-08.md` bước 4 "IT Admin nhận thông báo mức rất cao" | IT Admin chịu trách nhiệm ứng dụng (`QĐ-111g`, catalog entry `responsibleItAdminEmployeeId`) nếu còn dùng được, không thì mọi IT Admin dùng được (`identity.findAllUsableItAdminEmployeeIds`, như `department-software-notice.service.ts:30`) | **`VENDOR_ACCOUNT_DISCREPANCY_OPENED`** (mới), một thông báo mỗi lần nhập, không phải mỗi dòng |
| B8 | Ghi "đã nghỉ việc" không báo ai. Kiểu `DEPARTURE_MARKED_LEFT` khai nhưng không dùng (`personnel/event-notice/personnel-notifier.service.ts:21`) | **Không QĐ/BRD nào đòi**. Bảng 5.5.4 chỉ đòi báo lúc *ghi* nghỉ việc (`DEPARTURE_RECORDED`, đã có), `G2` cho IT (`GHOST_SEAT_G2_DETECTED`, đã có qua `hooks.onLeft`) và người giữ vai chưa có người thay (`ROLE_HOLDER_LEAVING`, đã có). Người nghỉ đã bị chặn nên không đọc được hộp thư | — | **Không thêm.** Chỉ xóa member chết `DEPARTURE_MARKED_LEFT` khỏi union |

**Chi tiết từng luật Request (B1–B4)**

- **B1:** `RequestResubmissionService.reopenNeed` thêm vào payload `assigneeEmployeeIds` (danh sách người giữ các bước mở lại, nối bằng dấu phẩy như `reopenedStepIds`; **Review 2:** bỏ `step.assigneeEmployeeId` null — bước chờ không có người giữ, `request-resubmission.service.ts:89-95`).
  - Luật `'ACCESS_REQUEST.RESUBMITTED'` (đặt trong `status-rules-progress.policy.ts`), `needs: ['REQUEST','ASSESSMENT_HOLDER']`.
  - `reopenedStepKind === 'IT_ASSESSMENT'` ⟹ `STEP_ASSIGNED {requestId, stepKind:'IT_ASSESSMENT', cause:'RESUBMITTED'}` tới `facts.assessmentHolderEmployeeId`.
  - Không có thì ⟹ `STEP_ASSIGNED {stepKind:'NEED', cause:'RESUBMITTED'}` tới từng id của `assigneeEmployeeIds`.
  - Nhánh `ONE_STEP` gọi `spending.route` (`request-resubmission.service.ts:47-48`) đã có `STEP_ASSIGNED` qua `BUDGET_CHECKED`, nên không đổi.
- **B2 (viết theo Q-5A-1 = B, `QĐ-99h` "Người duyệt chi chỉ nhận thông báo ngay khi cần quyết (lô duyệt chi …)", BRD 5.5.4 "Lô trình duyệt chi
  được gửi"; review FX-5):**
  - Luật `BUDGET_CHECKED` **giữ** điều kiện `ONE_STEP && opened` (Request một bước, `cause SUBMITTED`). Nhánh `VIA_HEAD` **không** phát
    `STEP_ASSIGNED` từng Request.
  - `SpendBatchService.recordSubmitted` (`requests/spend-submission/spend-batch.service.ts:152-174`, đang ghi audit `SPEND_BATCH.SUBMITTED`)
    gọi `notifyInApp` trong cùng transaction: gom `assigneeEmployeeId` của các bước duyệt chi **vừa mở trong lô** (kết quả `SENT_TO_APPROVER`,
    kể cả mục xác nhận dự phòng ngay trong lô), khử trùng, bỏ người trình (trưởng phòng) nếu trùng; mỗi người nhận một thông báo
    `SPEND_BATCH_SUBMITTED` (params ở bảng mã mới). Lô không mở bước nào ⟹ không báo.
  - **Review 2 — lấy người giữ bước thế nào (spec cũ không nói, và cách dễ nghĩ nhất gây 500):**
    - `SubmitResult` đi thẳng vào response strict (`spend/spend-submission.dto.ts:206-208`, `z.strictObject` + `submitResultSchema`), nên
      **không** thêm field nào vào `SubmitResult` (thêm ⟹ `ZodSerializationException` ⟹ 500). Cho `sendOn` trả cặp nội bộ
      `{ result: SubmitResult; openedFor: string | null }`; `submit` giữ mảng `results` như cũ để trả về, mảng `openedFor` chỉ đưa vào
      `recordSubmitted`.
    - `openedFor`: nhánh `WITHIN_BASE` lấy `routed.step?.assigneeEmployeeId` (`spend-routing.service.ts:138,143`); nhánh xác nhận dự phòng
      trong lô: đổi `ReserveConfirmationService.confirmOnCheck` từ `Promise<void>` sang trả `SpendStepRecord` (bước `openSpend` vừa mở,
      `reserve-confirmation.service.ts:126`), lấy `step.assigneeEmployeeId`. `assigneeEmployeeId` null (không có Người duyệt chi dùng được,
      bước `WAITING_CONTROLLED`) ⟹ bỏ, đã có `CONTROLLED_WAIT_ALERT`.
    - Theo BRD dòng 290, Người duyệt chi **tối đa một** người, không làm trưởng phòng, không là người yêu cầu/thụ hưởng ⟹ thực tế mỗi lô có
      tối đa một người nhận; bước lọc người trình/người xin chỉ là phòng hờ.
  - Xác nhận dự phòng **ngoài lúc trình lô** (route `reserveConfirmationCreate`, `ReserveConfirmationService.confirm`). **Review 2:** lúc
    `confirmOnCheck` chạy trong lô, `batchId` **chưa có** (lô được tạo sau vòng `sendOn`, `spend-batch.service.ts:96-111`), nên không thể
    dùng "`batchId` null" để phân biệt. Thay bằng cờ: `confirmOnCheck(..., by: { reason, now, via: 'BATCH' | 'CONFIRMATION' })`; `sendOn`
    truyền `'BATCH'`, `resultOf` (đường `confirm`) truyền `'CONFIRMATION'`. Payload `RESERVE_CONFIRMED` thêm `via` và
    `spendAssigneeEmployeeId: step.assigneeEmployeeId`. Luật mới `'ACCESS_REQUEST.RESERVE_CONFIRMED'` (`needs ['REQUEST']`) chỉ phát khi
    `via === 'CONFIRMATION'` ⟹ `STEP_ASSIGNED {stepKind:'SPEND_APPROVAL', cause:'SPEND_SENT'}` tới `spendAssigneeEmployeeId`.
  - **Review 2 — ca sót:** đường `confirm` kiểm lại mà thấy Request nay **trong số cơ sở** thì bước mở bởi `route()` (audit
    `BUDGET_CHECKED`, `routingMode 'VIA_HEAD'`, `trigger 'RESERVE_CONFIRMATION'`, `opened 'SPEND_APPROVAL'`), **không** qua
    `confirmOnCheck` (`reserve-confirmation.service.ts:87,159`) ⟹ không có `RESERVE_CONFIRMED`. Luật `BUDGET_CHECKED` thêm nhánh:
    `routingMode === 'VIA_HEAD' && trigger === 'RESERVE_CONFIRMATION' && opened === 'SPEND_APPROVAL'` ⟹ `STEP_ASSIGNED
    {stepKind:'SPEND_APPROVAL', cause:'SPEND_SENT'}` tới `spendAssigneeEmployeeId`. Trong lô, `trigger` luôn là `'SUBMISSION'` nên không
    trùng với `SPEND_BATCH_SUBMITTED`. (Đường `route()` với `VIA_HEAD` chỉ có hai nơi gọi: lô và `confirm`; `finishConversion` chỉ chạy
    cho `ONE_STEP`, `one-step-conversion.service.ts:32`.)
  - Người nhận trùng người xin thì bỏ, như luật hiện có.
  - **Nếu Owner chọn A** (mỗi Request một thông báo): bỏ phần `SpendBatchService`; luật `BUDGET_CHECKED` đổi điều kiện thành
    `opened === 'SPEND_APPROVAL'`, `cause = ONE_STEP ? 'SUBMITTED' : 'SPEND_SENT'`; luật `RESERVE_CONFIRMED` phát mọi lúc; không có mã
    `SPEND_BATCH_SUBMITTED` (−0,4 h).
- **B3:**
  - `notCheckable()` với `VIA_HEAD` ghi audit mới `'ACCESS_REQUEST.SPEND_NOT_CHECKABLE'` `{requestId, reason, routingMode:'VIA_HEAD'}` rồi mới `return outcome`.
  - Luật trong `BUDGET_CHECK_RULES`, `needs ['REQUEST','IT_ADMIN']` ⟹ `REQUEST_BUDGET_BLOCKED {requestId, reasons: reason}` tới người xin + IT Admin, `includeActor` false.
  - Đường xác nhận dự phòng ném lỗi sau `NOT_CHECKABLE` (`reserve-confirmation.service.ts:87-89`), nên audit rollback theo transaction và không phát.
- **B4:**
  - `SpendRoutingService.start` thêm `routingMode: 'ONE_STEP'` vào payload `ASSESSMENT_REQUESTED`.
  - Luật mới chỉ phát khi `routingMode === 'ONE_STEP'`, vì đường duyệt nhu cầu (`need-decision/need-decision-effects.service.ts:54-80`) đã có `STEP_ASSIGNED` qua `NEED_APPROVED` (`status-rules-progress.policy.ts:51-75`). Thiếu điều kiện này thì IT nhận hai lần.

**B5 — chi tiết SaaS:** service mới `licensing/saas-issue/saas-issue-notifier.service.ts`, gọi trong transaction tại đúng chỗ đang ghi audit.

| Mã | Khi | Người nhận | params | eventKey |
| -- | -- | -- | -- | -- |
| `SAAS_ISSUE_SUBMITTED` | `submit` (`saas-issue.service.ts:81`) | `assignedItAdminEmployeeId` | `issueId`, `issueCode`, `category`, `impact`, `applicationId` | `SAAS_ISSUE_SUBMITTED:{issueId}` |
| `SAAS_ISSUE_RESPONSE_OVERDUE` | sweep `tell` (`saas-issue-sweep.service.ts:74-95`), một lần nhờ `responseOverdueNoticedAt` | `assignedItAdminEmployeeId` | `issueId`, `issueCode`, `responseDueOn` | `SAAS_ISSUE_RESPONSE_OVERDUE:{issueId}` |
| `SAAS_ISSUE_STATE_CHANGED` | IT đổi trạng thái (`saas-issue-handling.service.ts:83-115` transition/resolve, `:168` duplicate) ⟹ báo người báo. Người báo trả lời làm phiếu về `IN_PROGRESS` (`saas-issue.service.ts:117,140-150`) hoặc mở lại (`:170-195`) ⟹ báo IT được giao. Sweep đóng phiếu (`saas-issue-sweep.service.ts:44-66`) ⟹ báo người báo | xem cột "Khi"; bỏ người nhận = người làm | `issueId`, `issueCode`, `fromState`, `toState`, `trigger` (`IT_ACTION`\|`REPORTER_REPLY`\|`REPORTER_REOPEN`\|`REOPEN_WINDOW_LAPSED`) | `SAAS_ISSUE_STATE_CHANGED:{entryId}` (dòng `SaasIssueEntry` vừa ghi; sweep dùng `{issueId}:CLOSED`) |

Subject: `{type:'SAAS_ISSUE', id: issueId}`. Trưởng phòng không nhận gì, vì "trưởng phòng không xem nội dung phiếu" (`FR-2.15`). Không có param chứa nội dung phiếu.

**B6/B7 — chi tiết:**
- `OUT_OF_PROCESS_CASE_REPORTED`
  - params: `caseId`, `applicationId`, `vendorId`, `employeeId`.
  - Phát khi `outOfProcessCaseClose` với `outcome = REPORT_ONLY` (`usage/vendor-account-review/out-of-process-case-closure.service.ts`, nhánh ghi audit `:194-210`).
  - Subject `{type:'OUT_OF_PROCESS_CASE', id}`. eventKey `OUT_OF_PROCESS_CASE_REPORTED:{caseId}`.
  - Người dùng lấy từ `discrepancy.employeeId`. Trưởng phòng lấy qua `organizationReads.getDepartmentHeads([lastPlacement.departmentId])`.
- `VENDOR_ACCOUNT_DISCREPANCY_OPENED`
  - params: `applicationId`, `vendorId`, `source`, `newCount`.
  - Phát trong `VendorAccountIntakeService` (`vendor-account-intake.service.ts:33-70` `fromImport`, `:76-98` `fromInvoiceReferral`, `:100-125` `fromUnlistedTools`) khi `upsertMany` trả > 0 (`vendor-account-review.repo.ts:38-65` trả số dòng **mới chèn**, `xmax = 0`; hai hàm sau đang bỏ giá trị trả về — phải đọc nó).
  - **Review 2 — `applicationId` có thể null:** chỉ `fromImport` có ứng dụng; `fromInvoiceReferral` có `vendorId` nhưng `applicationId: null`
    (`:76-98`), `fromUnlistedTools` cả hai null (`:110-124`). Người nhận: `applicationId` khác null và IT chịu trách nhiệm ứng dụng còn dùng
    được ⟹ người đó; còn lại ⟹ mọi IT dùng được (kiểm "dùng được" theo mẫu `department-software-notice.service.ts:27-30`). Params
    `applicationId`, `vendorId` là `string | null`. Câu bàn giao không dùng `{applicationId:name}` (xem bảng câu).
  - eventKey: `VENDOR_ACCOUNT_DISCREPANCY_OPENED:{source}:{importId|caseId|ngày nghiệp vụ}` (collector: một khóa mỗi ngày — lô thứ hai cùng
    ngày có tool lạ mới **không** báo lại; chấp nhận, IT vẫn thấy hàng). Subject null.
  - "Mức rất cao" không có cột ưu tiên trong hộp thư, nên không mô hình hóa (ghi §8).

**Thông báo mới/đổi cho 5b (bàn giao câu, theo cột `catalog/notifications.md`).** A2 thêm mã + khóa vào `IN_APP_NOTIFICATION_CODES`/
`PARAM_KEYS_BY_CODE`, **không** viết mẫu câu; chat B chép bảng này vào file nhóm của N3b sau khi A2 merge. Câu dùng cú pháp `catalog/README.md`.
Không mã nào của A2 **đổi** params của mã cũ; `STEP_ASSIGNED` chỉ thêm giá trị `cause`.

| Mã | Khi phát sinh · eventKey | Người nhận | `subject` | params | Bấm vào mở (`target`) |
| -- | -- | -- | -- | -- | -- |
| `SAAS_ISSUE_SUBMITTED` | Gửi phiếu (B5) · `SAAS_ISSUE_SUBMITTED:{issueId}` | IT được giao | `SAAS_ISSUE` | `issueId, issueCode, category, impact, applicationId` | `saasIssueGet` `{id: subject}` |
| `SAAS_ISSUE_RESPONSE_OVERDUE` | Sweep quá hạn phản hồi · `SAAS_ISSUE_RESPONSE_OVERDUE:{issueId}` | IT được giao | `SAAS_ISSUE` | `issueId, issueCode, responseDueOn` | như trên |
| `SAAS_ISSUE_STATE_CHANGED` | Đổi trạng thái (B5) · `SAAS_ISSUE_STATE_CHANGED:{entryId}` / sweep `{issueId}:CLOSED` | người báo hoặc IT được giao (theo `trigger`) | `SAAS_ISSUE` | `issueId, issueCode, fromState, toState, trigger` | `saasIssueGet` `{id: subject}` |
| `OUT_OF_PROCESS_CASE_REPORTED` | Đóng hồ sơ `REPORT_ONLY` (B6) · `OUT_OF_PROCESS_CASE_REPORTED:{caseId}` | người dùng + trưởng phòng hôm nay của phòng người đó | `OUT_OF_PROCESS_CASE` | `caseId, applicationId, vendorId, employeeId` | `null` (người dùng/trưởng phòng không có route đọc hồ sơ) |
| `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | Lần nhập có sai lệch mới (B7) · `VENDOR_ACCOUNT_DISCREPANCY_OPENED:{source}:{…}` | IT chịu trách nhiệm ứng dụng, không có thì mọi IT dùng được | `null` | `applicationId, vendorId, source, newCount` | `vendorAccountDiscrepancyList` |
| `DEVICE_STOP_REQUESTED` | Người giữ gửi yêu cầu dừng `OPEN` (E1) · `DEVICE_STOP_REQUESTED:{stopRequestId}` | IT phụ trách phòng của người giữ, không có thì mọi IT dùng được | `DEVICE_STOP_REQUEST` | `stopRequestId, registrationId, deviceId, holderEmployeeId, dueAt` (ISO datetime), `dueOn` (date của `dueAt` theo giờ tổ chức, cho câu) | `deviceStopRequestList` |
| `DEVICE_STOP_REQUEST_OVERDUE` | Sweep: `OPEN` quá `dueAt` · `DEVICE_STOP_REQUEST_OVERDUE:{stopRequestId}` | như trên | `DEVICE_STOP_REQUEST` | như `DEVICE_STOP_REQUESTED` | `deviceStopRequestList` |
| `SPEND_BATCH_SUBMITTED` (Q-5A-1 = B) | Trưởng phòng trình lô, có ≥ 1 bước duyệt chi mở (B2) · `SPEND_BATCH_SUBMITTED:{batchId}` | Người duyệt chi giữ các bước vừa mở | `SPEND_BATCH` | `batchId, departmentId, sentCount` (số bước mở cho **người nhận này**) | `spendBatchGet` `{id: subject}` |
| `STEP_ASSIGNED` (thêm `cause`) | B1, B4, B2 (xác nhận dự phòng sau lô) | như B1–B4 | `ACCESS_REQUEST` | không đổi | không đổi (`accessRequestGet`) |

Câu VI / EN (5b sở hữu chữ cuối; đây là bản bàn giao):

| Mã | Tiếng Việt (tiêu đề · nội dung) | English (title · body) |
| -- | -- | -- |
| `SAAS_ISSUE_SUBMITTED` | **Có phiếu báo lỗi mới** · "Phiếu {issueCode} về ứng dụng {applicationId:name} ({category:enum}, ảnh hưởng {impact:enum}) vừa được gửi và giao cho bạn." | **New issue report** · "Issue report {issueCode} for {applicationId:name} ({category:enum}, impact {impact:enum}) was sent and assigned to you." |
| `SAAS_ISSUE_RESPONSE_OVERDUE` | **Phiếu báo lỗi quá hạn phản hồi** · "Phiếu {issueCode} chưa có phản hồi đầu tiên và đã quá hạn {responseDueOn:date}." | **Issue report awaiting first response** · "Issue report {issueCode} has no first response and passed its due date {responseDueOn:date}." |
| `SAAS_ISSUE_STATE_CHANGED` | **Phiếu báo lỗi đổi trạng thái** · "Phiếu {issueCode} chuyển từ {fromState:enum} sang {toState:enum}." + biến thể `by: trigger`: `REPORTER_REPLY` → " Người báo vừa trả lời.", `REPORTER_REOPEN` → " Người báo đã mở lại phiếu.", `REOPEN_WINDOW_LAPSED` → " Phiếu tự đóng vì hết thời gian mở lại.", `otherwise` → "" | **Issue report status changed** · "Issue report {issueCode} moved from {fromState:enum} to {toState:enum}." + `REPORTER_REPLY` → " The reporter replied.", `REPORTER_REOPEN` → " The reporter reopened it.", `REOPEN_WINDOW_LAPSED` → " It closed because the reopen window ended.", `otherwise` → "" |
| `OUT_OF_PROCESS_CASE_REPORTED` | **Phát hiện dùng phần mềm ngoài quy trình** · "Đã ghi nhận {employeeId:name} dùng {applicationId:name} ngoài quy trình. Công ty không có tài khoản để thu hồi nên hồ sơ chỉ được ghi nhận và báo cáo." | **Software use outside the process recorded** · "{employeeId:name} was recorded using {applicationId:name} outside the process. The company holds no account to revoke, so the case is recorded and reported only." |
| `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | **Có sai lệch tài khoản nhà cung cấp mới** · "Có {newCount} sai lệch tài khoản nhà cung cấp mới cần xử lý (nguồn: {source:enum})." (Review 2: bỏ `{applicationId:name}` vì 2/3 nguồn không có ứng dụng) | **New vendor account discrepancies** · "{newCount} new vendor account discrepancies need handling (source: {source:enum})." |
| `DEVICE_STOP_REQUESTED` | **Yêu cầu dừng thu thập cần xử lý** · "{holderEmployeeId:name} yêu cầu dừng thu thập dữ liệu trên một máy. Vui lòng xử lý trước {dueOn:date}." | **Collection stop requested** · "{holderEmployeeId:name} asked to stop data collection on a device. Please handle it by {dueOn:date}." |
| `DEVICE_STOP_REQUEST_OVERDUE` | **Yêu cầu dừng thu thập quá hạn** · "Yêu cầu dừng thu thập của {holderEmployeeId:name} đã quá hạn {dueOn:date} mà chưa được xử lý." | **Collection stop request overdue** · "The collection stop request of {holderEmployeeId:name} passed its due date {dueOn:date} without being handled." |
| `SPEND_BATCH_SUBMITTED` | **Có lô trình duyệt chi mới** · "Trưởng phòng {departmentId:name} vừa trình một lô có {sentCount} yêu cầu chờ bạn duyệt chi." | **New spend batch** · "The head of {departmentId:name} sent a batch with {sentCount} requests awaiting your spend decision." |

Nhãn `cause` mới của `STEP_ASSIGNED`: `RESUBMITTED` → "người gửi đã gửi lại sau khi bổ sung" / "sent again after revision"; `SPEND_SENT` →
"dự phòng đã được xác nhận, chờ bạn duyệt chi" / "reserve confirmed, awaiting your spend decision" (Q-5A-1 = B; nếu A thì "trưởng phòng đã
trình duyệt chi" / "sent on for spend approval"). Nhãn enum của `category`, `impact`, `fromState`/`toState`, `source`: lấy từ enum DTO của
`saas-issue` và `vendor-account-review` (chat B tạo bảng nhãn). Câu `VENDOR_ACCOUNT_DISCREPANCY_OPENED`/`OUT_OF_PROCESS_CASE_REPORTED` không có
tên nhà cung cấp (5b không có `NameKind` VENDOR; `vendorId` chỉ để lọc) — chấp nhận (review FX-7).

### C. `QĐ-111ax` — IT Admin chỉ đọc usage của phòng mình phụ trách

Nguồn:
- `QĐ-111ax` (sổ dòng 562): "IT Admin đọc usage **chặn cứng theo phòng mình phụ trách**; thao tác ghi giữ *IT khác xử lý thay* … Phòng chưa có IT Admin phụ trách: mọi IT Admin đều thấy".
- BRD vai IT Admin (dòng 288).

Helper có sẵn:
- `organizationReads.getItAdminScope(employeeId, ids => identity.findUsableItAdminEmployeeIds(ids))` trả các phòng trong phạm vi, kể cả phòng chưa có IT dùng được.
- Trong `usage` đã bọc thành `UsageOverviewScopeService` (`usage/usage-overview/usage-overview-scope.service.ts:25-87`: `scopeOf`, `peopleOf`, `employeeInScope`). `vendor-import-query.service.ts:58-77` đã dùng nó.
- Trong `optimization` đã có `BoardQueryService.scopeOf` (`optimization/board/board-query.service.ts:59-67`) và `narrowToDepartment` (`board.policy.ts:49-57`).
- Ngoài phạm vi ⟹ trang rỗng (filter) hoặc 404 (id), theo D8 (`usage-overview-scope.service.ts:18-23`).

| Route | Hiện tại | Đích |
| -- | -- | -- |
| `ghostSeatRecommendationGet` | IT Admin đọc mọi khuyến nghị (`board-query.service.ts:98-111`) | `IT_ADMIN`: `record.departmentId` null hoặc thuộc `scopeOf(actor)`, như filter của list (`ghost-seat/ghost-seat.repo.ts:136-139`). Ngoài phạm vi ⟹ 404 `GHOST_SEAT.NOT_FOUND`. Trưởng phòng giữ như cũ |
| `ghostSeatExemptionList` | IT Admin đọc mọi miễn trừ (`decision/decision-queue.service.ts:146-154`; repo chỉ có `departmentId`, `ghost-seat/ghost-seat-decision.repo.ts:254-263`) | Repo thêm `departmentIds`. **Review 2:** lọc IT bằng **`recommendation.departmentId` null hoặc `in` phạm vi** — đúng điều kiện của list khuyến nghị (`ghost-seat.repo.ts:136-138`) và của `ghostSeatRecommendationGet` ở dòng trên; **không** dùng `deciderDepartmentId` (chỉ giữ cho nhánh trưởng phòng như cũ), để cùng một seat không lúc thấy lúc không giữa ba route. IT đọc theo `getItAdminScope`. Phạm vi rỗng ⟹ trang rỗng |
| `usageIdentityMappingList` | Không có actor, đọc mọi mapping (`usage/identity/identity.controller.ts:~207-225`, `identity-query.service.ts:59-80`) | Truyền actor. `employeeId in peopleOf(actor, {})`. `employeeId` lọc ngoài phạm vi ⟹ trang rỗng |
| `usageNoAssignmentFindingList` | Như trên (`identity.controller.ts:~261-280`, `no-assignment-finding.repo.ts:83`) | Như trên, lọc theo `employeeId` của finding |
| `usageUnmatchedIdentityList` | Mọi IT đọc (`identity-query.service.ts:31-56`) | **Giữ** (Q-5A-2 = A): định danh chưa gắn ai không phải usage của người nào. Tiền lệ: dòng import không gắn người hiện cho mọi IT (`vendor-import-query.service.ts:58-61`) |
| `deviceUsageList`, `deviceToolStatusList` | IT đọc mọi máy (`usage/ai-usage/ai-usage-query.service.ts:44-57`, `tool-status/tool-status-query.service.ts:25-31`) | `DevicesApi` thêm `registrationsOfDevice(deviceId)` ⟹ `{id, holderEmployeeId}[]`. Giữ các đăng ký có `scope.employeeInScope(actor, holder)`, rồi đọc bằng đường `registrationIds` sẵn có (như `ofMyDevice`). Máy tồn tại mà không đăng ký nào trong phạm vi ⟹ trang rỗng; máy không tồn tại ⟹ 404 như cũ. `deviceIntakeRejectionList` giữ nguyên (chẩn đoán kỹ thuật, không có số usage) |

Xong khi:
- Có integration "IT phụ trách P1 không thấy người của P2; phòng P3 chưa có IT thấy được" cho mapping, finding, exemption, device usage.
- Có integration 404 cho `ghostSeatRecommendationGet` ngoài phạm vi.

### D. `loginEmail = workEmail` (Owner 16/11, phương án A)

Hiện tại:
- Body `createAppUserBodySchema` có `loginEmail: z.string().max(254).optional()` (`identity-access/accounts/account-management.dto.ts:14-16`).
- Service lấy `input.loginEmail ?? current.workEmail` (`accounts/app-users/account-invitation.service.ts:72-73`).
- Không có `workEmail` và không gửi `loginEmail` ⟹ 422 `APP_USER.LOGIN_EMAIL_REQUIRED` (`account.http-errors.ts:60-61`).

Đích (ít phá FE nhất):
- Không xóa field khỏi schema strict. Xóa sẽ làm FE đang gửi `loginEmail` (kể cả gửi bằng `workEmail`) nhận 422 `VALIDATION_ERROR`.
- Giữ `loginEmail` optional, đánh dấu deprecated trong mô tả OpenAPI.
- Service luôn dùng `current.workEmail`. Thiếu ⟹ giữ 422 `APP_USER.LOGIN_EMAIL_REQUIRED`, message "The employee has no work email.".
- Có gửi `loginEmail` mà sau chuẩn hóa (`normalizeLoginEmail`) khác `workEmail` ⟹ 422 mới `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`, `details {field:'loginEmail'}`. Gửi bằng ⟹ bỏ qua.
  **Review 2 — thứ tự kiểm:** (1) `workEmail` null ⟹ `LOGIN_EMAIL_REQUIRED` (kể cả khi có gửi `loginEmail`); (2) có gửi ⟹
  `normalizeLoginEmail(input.loginEmail)` (sai dạng ⟹ giữ `LOGIN_EMAIL_INVALID`) rồi so với `normalizeLoginEmail(workEmail)`; (3) lưu
  `loginEmail: workEmail.trim()` (`account-invitation.service.ts:72-87`), không bao giờ lưu chuỗi FE gửi.
- Ghi vào CHANGELOG FE: "bỏ ô loginEmail; gửi thì phải bằng workEmail; bản sau gỡ field".
- Đổi email đăng nhập vẫn là luồng bảo mật riêng, không đụng.
- `installation` bootstrap (`installation/public/installation.api.ts:58`, CLI `--login-email`) **không đổi**: thao tác vận hành, ngoài API tạo tài khoản.

Seed và test:
- Seed tạo tài khoản bằng `emailOf(ctx, code)` (`cli/seed/steps/organization.steps.ts:136`, `demo-step-kit.ts:42`) qua `DemoAccountsApi.create` (không qua route này). Chỉ cần kiểm bằng `shared-demo-v4.spec.ts` rằng `emailOf` = `workEmail` của nhân viên.
- Test phải sửa:
  - `test/integration/identity-access/account-creation-http.integration-spec.ts:140-160`: ca "accepts a separate login email" đổi thành ca 422 `LOGIN_EMAIL_NOT_WORK_EMAIL` + ca gửi đúng `workEmail` khác hoa/thường ⟹ 201.
  - `test/integration/organization/employee-manual-http.integration-spec.ts:619`: kiểm `first.finance@acme.vn` có bằng `workEmail` không.

Xong khi: hai ca trên xanh, `appUserCreate` không body `loginEmail` ⟹ 201 với `loginEmail == workEmail`.

### E. BE cho tool collector

**E1 — dừng thu thập (`FR-4.18`, `US-09-04` AC-1…AC-12, `QĐ-101g`, `QĐ-66ae`, `FR-10.5`)**

Hiện tại:
- Model và enum đã có: `DeviceStopRequest` (`prisma/models/devices.prisma:141-160`), `DeviceStopRequestState OPEN|COMPLETED|INVALID`, `DeviceStopInvalidReason DUPLICATE|ALREADY_STOPPED|REGISTRATION_ENDED|IT_ADMIN` (`:24-35`).
- Model đã có owner (`test/gates/architecture-boundaries.gate-spec.ts:39`).
- Không service/route nào ghi bảng này hay ghi `collection_stopped_at`. Chỉ có đặt NULL (`devices/registry/registry.repo.ts:190-196`).
- Gate và session đã xử lý trạng thái dừng (`devices/credential/session/credential-session.policy.ts:25-36`, `usage/intake-gate/intake-gate.policy.ts:16`). Tool đã xử lý 403 `DEVICE.COLLECTION_STOPPED`.

**~~Lỗi kèm theo cần sửa~~ — Review 2: KHÔNG phải lỗi; thay bằng ràng buộc phải giữ khi hoàn tất (Critical):**
- CHECK `device_registrations_one_projection` (`prisma/migrations/20261107000000_devices_registry_and_acknowledgement/migration.sql:164`):
  `acknowledged_from IS NULL OR collection_stopped_at IS NULL` — hai cột **không bao giờ cùng khác null**.
- Hệ quả 1: hoàn tất yêu cầu dừng **phải** đặt trong **một** `UPDATE`: `collection_stopped_at = now, acknowledged_from = NULL`. Chỉ đặt
  `collection_stopped_at` (như bản cũ của spec) ⟹ vi phạm CHECK `23514` ⟹ 500 ở `deviceStopRequestComplete`.
- Hệ quả 2: sau khi dừng, `acknowledged_from` đã là NULL, nên `setAcknowledged` (`registry.repo.ts:191-196`,
  `COALESCE(acknowledged_from, at), collection_stopped_at = NULL`) tự cho mốc mới = `at`, đúng `QĐ-101a`/AC-11. **Không sửa
  `setAcknowledged`.**
- `device_registrations_guard` (`:177-186`) chỉ khóa các cột định danh/kết thúc, cho phép cập nhật hai cột này. Mốc xác nhận cũ vẫn còn trong
  `device_acknowledgements` (append-only), không mất lịch sử.

Ai làm gì (`US-09-04` "Phạm vi quyền"):
- Chỉ **người giữ** đăng ký còn hiệu lực gửi được. Trưởng phòng, IT hay Super Admin gửi thay ⟹ 404, như xác nhận.
- **Không cần người giữ đồng ý thêm, không cần lý do.** AC-1 chỉ đòi ghi thời điểm tiếp nhận; model không có cột lý do.
- **Mọi IT Admin** hoàn tất được. IT phụ trách phòng của người giữ là người nhận mặc định của thông báo. IT xử lý yêu cầu của chính mình được, `selfHandled = true` + cờ trong audit (AC-7).
- **Không có route "đóng không hợp lệ" cho IT.** AC-6 cấm đóng yêu cầu hợp lệ. Mọi lý do không hợp lệ đều do hệ thống đặt:
  - `DUPLICATE`: đã có `OPEN`.
  - `ALREADY_STOPPED`: `collection_stopped_at` khác null.
  - `REGISTRATION_ENDED`: đăng ký kết thúc khi còn `OPEN`.
  - Giá trị `IT_ADMIN` của enum để không dùng.
- **Mở lại** = route xác nhận có sẵn (`POST /me/device-registrations/{id}/acknowledgements`, `devices/acknowledgement/acknowledgement.service.ts:42-95`): đã xóa `collection_stopped_at` và cho phép xác nhận khi đang dừng (`:64`). Chỉ sửa lỗi mốc nói trên. IT/trưởng phòng bật thay ⟹ 404 sẵn (AC-11).

Contract mới:

| operationId | Route | Vai | Body | 2xx | Lỗi |
| -- | -- | -- | -- | -- | -- |
| `myDeviceStopRequestCreate` | `POST /me/device-registrations/{id}/stop-requests` | đã đăng nhập (người giữ) | `{}` strict | 201 `{stopRequest}`. `state` = `OPEN`, hoặc `INVALID` + `invalidReason` `DUPLICATE`/`ALREADY_STOPPED` (AC-10: vẫn ghi dòng để chứng minh xử lý) | 404 `DEVICE_REGISTRATION.NOT_FOUND` (không phải của mình); 409 `DEVICE_REGISTRATION.ENDED` |
| `deviceStopRequestList` | `GET /device-stop-requests?state=&page=&pageSize=` | `IT_ADMIN` | — | 200 trang, mặc định `state=OPEN`, sắp `dueAt` tăng | 422 query |
| `deviceStopRequestComplete` | `POST /device-stop-requests/{id}/completion` | `IT_ADMIN` | `{}` strict | 200 `{stopRequest}` `COMPLETED` | 404 `DEVICE_STOP_REQUEST.NOT_FOUND`; 409 `DEVICE_STOP_REQUEST.NOT_OPEN` `details {state}` |

- `stopRequest` wire: `{id, registrationId, deviceId, holderEmployeeId, state, invalidReason|null, requestedAt, dueAt, handledAt|null, handledByAppUserId|null, selfHandled, overdue}`.
- `GET /me/devices` thêm `stopRequestPending: boolean` cho mỗi đăng ký (`devices/my-devices/my-devices.repo.ts`), để FE hiện "đang chờ dừng" sau khi tải lại trang.

Hành vi:
- Tạo:
  - Khóa chuỗi đăng ký (`registry.repo.ts:134 lockRegistrationChain`), rồi xét `ENDED` ⟹ `ALREADY_STOPPED` ⟹ `DUPLICATE`.
  - `dueAt` = thời điểm tiếp nhận + **2 ngày làm việc** cùng giờ (AC-5 "09:00 thứ Hai ⟹ 09:00 thứ Tư"). Ghép bằng `addWorkingDays` và `instantAtWallClock` (`core/working-days.ts`).
  - Hằng số 2 — **lệch có chủ ý** so với `US-09-04` ("cấu hình được"): `FR-8.2` (nguồn cao hơn US) không liệt kê tham số này; nếu Owner muốn
    thì thêm sau (review FX-4).
  - Dòng `INVALID` (`DUPLICATE`/`ALREADY_STOPPED`, và `REGISTRATION_ENDED` ở dưới) **phải** đặt `handled_at = now` (`handled_by_app_user_id`
    để null, `invalid_note` null): CHECK `device_stop_requests_outcome`
    (`prisma/migrations/20261107000000_devices_registry_and_acknowledgement/migration.sql:169-173`) bắt `INVALID` có `handled_at`; `due_at` vẫn
    ghi như `OPEN` (cột không null). (Review FX-3.)
  - Đua hai yêu cầu cùng lúc: unique một phần `device_stop_requests_one_open` (`:174`, `WHERE state = 'OPEN'`) có thể trả `23505` cho bên thua.
    Repo bắt `P2002`/`23505` **đúng tên constraint này** ⟹ service chạy lại thao tác tạo **một lần** trong transaction mới (lần hai thấy `OPEN`
    ⟹ ghi dòng `INVALID DUPLICATE`, trả 201). Không bắt chung mọi `23505`.
  - Audit `DEVICE_STOP_REQUEST.CREATED`. Thông báo `DEVICE_STOP_REQUESTED` (chỉ khi `state = OPEN`) tới IT phụ trách phòng của người giữ
    (`organizationReads.getItAdminInCharge`), không có ⟹ mọi IT dùng được. params `stopRequestId, registrationId, deviceId, holderEmployeeId,
    dueAt, dueOn`; subject `{type:'DEVICE_STOP_REQUEST', id: stopRequestId}`; eventKey `DEVICE_STOP_REQUESTED:{stopRequestId}` (review FX-2;
    `dueOn` = ngày của `dueAt` theo giờ tổ chức, để câu dùng `{dueOn:date}`).
  - Dữ liệu vẫn được nhận tới khi hoàn tất (AC-12).
- Hoàn tất (một transaction):
  - Khóa đăng ký. Đăng ký kết thúc ⟹ đặt `INVALID REGISTRATION_ENDED` và trả 409 `NOT_OPEN`.
  - Đặt `COMPLETED`, `handledByAppUserId`, `handledAt`, `selfHandled = (holder == actor.employeeId)`.
  - Đặt `device_registrations.collection_stopped_at = now, acknowledged_from = NULL` trong **một** `UPDATE` (Review 2: CHECK
    `device_registrations_one_projection`; hàm repo mới `RegistryRepo.setCollectionStopped(tx, id, at)` cạnh `setAcknowledged`). **Không**
    thu hồi credential (AC-12).
  - Audit `DEVICE_STOP_REQUEST.COMPLETED` `{selfHandled}`.
- Đăng ký kết thúc (`registry/registration-end.service.ts:25,63`): mọi yêu cầu `OPEN` ⟹ `INVALID REGISTRATION_ENDED`, `handled_at = now`.
  **Review 2 — capability:** `stop-request` import `registry` (khóa chuỗi, như `acknowledgement` đang làm), nên `registry` **không** được
  import `stop-request` (vòng ⟹ gate `capability-graph` đỏ). Viết câu `UPDATE device_stop_requests …` bằng hàm mới trong
  `registry/registry.repo.ts` (cùng module `devices` sở hữu model, `PRISMA_MODEL_OWNER` không đổi). `my-devices` đọc `stopRequestPending`
  bằng SQL trong `my-devices.repo.ts`, không import `stop-request`.
- **Review 2 — thông báo:** người nhận theo mẫu `licensing/department-tools/department-software-notice.service.ts:27-30` (IT phụ trách phòng
  của người giữ qua `getItAdminInCharge(holder)` + `findUsableItAdminEmployeeIds`; không dùng được ⟹ `findAllUsableItAdminEmployeeIds`);
  **bỏ người nhận = người giữ** (IT tự gửi yêu cầu cho máy của mình). `devices.module.ts` phải thêm `NotificationsModule` vào `imports`
  (hiện chưa có); an toàn DI vì `DevicesModule` chỉ ở graph API và CLI `record-super-admin-event` (qua `UsageModule`, vốn đã import
  `NotificationsModule`), không ở worker/installation.
- Quá hạn (AC-5): sweep mỗi giờ, theo mẫu `licensing/saas-issue/saas-issue.job.ts`. `OPEN` và `dueAt < now` và `overdueNoticedAt IS NULL` ⟹ đặt
  mốc + `DEVICE_STOP_REQUEST_OVERDUE` cho cùng người nhận (params như `DEVICE_STOP_REQUESTED`, subject `{DEVICE_STOP_REQUEST, id}`, eventKey
  `DEVICE_STOP_REQUEST_OVERDUE:{stopRequestId}`). Phần "hiện trong cảnh báo nghẽn" không làm (ghi §8).
- Không cần migration: bảng, enum, CHECK và index `[state, dueAt]` đều đã có. Một `OPEN` mỗi đăng ký được giữ bằng khóa chuỗi + unique
  `device_stop_requests_one_open`.

Xong khi: integration chạy kịch bản TS-11 của `US-09-04`.
1. Tạo yêu cầu, lô AI vẫn nhận.
2. IT hoàn tất ⟹ lô nhận 403 `DEVICE.COLLECTION_STOPPED`, credential còn, session `COLLECTION_STOPPED`; DB: `acknowledged_from` NULL,
   `collection_stopped_at` khác null (Review 2).
3. Người giữ xác nhận lại ⟹ lô của **ngày sau thời điểm xác nhận** được nhận; ngày nằm giữa lúc dừng và lúc xác nhận lại ⟹ `OUTSIDE_WINDOW`.
4. Gửi trùng ⟹ 201 `INVALID DUPLICATE` có `handledAt`; hai lời gọi đồng thời ⟹ một `OPEN` + một `INVALID DUPLICATE`, không 500.
5. Người khác ⟹ 404.
6. IT tự xử lý ⟹ `selfHandled`.

**E2 — allowlist theo ngày (TOOL.md F-2, phương án a)**

Hiện tại:
- `evaluateDays` từ chối **cả ngày** nếu có một công cụ không thuộc allowlist của ngày đó (`usage/ai-usage/ai-usage-day.policy.ts:55-72`, dòng `:71`).
- Allowlist của ngày = các bản có hiệu lực trong ngày (`usage/allowlist/allowlist.policy.ts:69-85`).
- `AiUsageBatchService` tạo mục rà soát `COLLECTOR_UNLISTED` cho công cụ đó (`ai-usage-batch.service.ts:89-99` ⟹ `vendor-account-intake.service.ts:100-125`).
- Tool gửi mọi ngày theo allowlist **hiện hành**. Vì vậy thêm công cụ vào allowlist sẽ làm tối đa 13 ngày cũ bị `REJECTED NOT_IN_ALLOWLIST` và sinh mục rà soát giả.

Đích:
- Mỗi ngày bỏ **riêng** công cụ không thuộc allowlist của ngày đó. Kiểm coverage và ghi dòng trên phần còn lại.
- Ngày còn ≥ 1 công cụ ⟹ `ACCEPTED`/`UNCHANGED` như thường, không ghi dòng từ chối.
- Ngày bị bỏ hết ⟹ `REJECTED NOT_IN_ALLOWLIST` như cũ.
- Mục rà soát `COLLECTOR_UNLISTED` chỉ tạo cho công cụ **không có trong allowlist đang hiệu lực lúc nhận** (bản mới nhất, lấy từ `AllowlistFactsService`), không theo allowlist của ngày.
- Response `aiUsageBatchCreate` giữ nguyên shape; tool không phải đổi.

Xong khi:
- Unit `evaluateDays`: ngày có tool A (được phép) + B (chưa được phép ngày đó) ⟹ chỉ giữ dòng A, `reason null`.
- Unit service: B có trong bản hiện hành ⟹ không gọi `fromUnlistedTools`; B không có ⟹ có gọi.
- Integration `test/integration/usage/usage-intake.integration-spec.ts`: phát hành allowlist v2 thêm tool sau ngày xác nhận, gửi ngày cũ ⟹ `ACCEPTED`, không có discrepancy `COLLECTOR_UNLISTED`.

### F. Gỡ tham số chết `BUDGET_ZBB_KPI3_BELOW_PERCENT`, `BUDGET_ZBB_PRICE_INCREASE_PERCENT`

Hiện tại:
- Hai định nghĩa còn ở `operating-parameters/parameter-definitions.policy.ts:159-184`. Không code nào đọc (ZBB theo dòng đã bỏ ở `QĐ-111ab`).
- Finance vẫn thấy chúng trong danh sách tham số (`test/integration/budgets/budget-cycle-lifecycle.integration-spec.ts:458-463`).
- Giá trị có thể đã lưu trong `parameter_values`.

Cách gỡ an toàn (tiền lệ `prisma/migrations/20261108500000_drop_fiscal_year_start_month/migration.sql`):
1. Xóa hai định nghĩa.
2. Migration forward-only **chỉ dữ liệu**, tên cố định trong dải của A2: `20261117100000_drop_zbb_parameters`: `UPDATE parameter_values SET valid_to = GREATEST(CURRENT_TIMESTAMP, valid_from) WHERE key IN (…) AND valid_to IS NULL`. Đóng giá trị chứ không xóa (giữ lịch sử); không đụng bảng hay constraint; comment giải thích như tiền lệ.
3. Cập nhật:
   - `parameter-definitions.policy.spec.ts:135-136,225-231` (thêm `expect(definitionOf(key)).toBeUndefined()`).
   - `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts:144-145`, thêm ca như `:380-410` của tiền lệ: giá trị cũ bị đóng, list không còn key.
   - `budget-cycle-lifecycle.integration-spec.ts:458-463`: Finance chỉ còn `BUDGET_RESERVE_DEFAULT_PERCENT`.
   - `operating-parameters/README.md:66`.
   - **Số đếm tham số (review FX-1)** — quy tắc chung của prompt 5, **không ghi cứng số cuối**: mỗi chat cập nhật số đếm theo `PARAMETER_DEFINITIONS`
     **trên nhánh của mình** (A2: −2 so với `dev`) ở 3 chỗ: `parameter-definitions.policy.spec.ts:160` (tiêu đề "pins the … keys" + danh sách),
     `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts:428` (`parameters.size`),
     `test/support/api-collection-registry-exceptions.ts:81` (`maxItems` — hiện 22, **sai sẵn** so với 29 khóa trên `dev`; đặt bằng số khóa
     thực). Chat điều phối sửa lần cuối khi merge `feat/p5` (A1 và C cũng đổi số).

Xong khi: list tham số không còn hai key, giá trị cũ có `valid_to`, migration chạy hai lần không lỗi, ba chỗ đếm khớp số khóa thực của nhánh
và gate `api-collection-contract` xanh.

---

## 2. Plan task (chat A2, Sonnet, chạy tuần tự trong một chat; song song chat A1)

Lệnh kiểm nhanh mỗi task (Owner 02/11):
- `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`.
- `pnpm openapi:export` (diff chỉ ở route của task).
- Test theo file: `pnpm test -- <file>` / `pnpm test:integration -- <file>` / `pnpm test:http -- <file>`.
- Task thêm route hoặc dependency module ⟹ thêm `pnpm arch:routes && pnpm arch:graph`, rồi `pnpm arch:docs:check`.

Mỗi task một commit đứng tên git Owner, không có dòng đồng tác giả AI, không push.

Ký hiệu cột "Xung đột":
- **[5b]**: file 5b cũng sửa.
- **[A1]**: file chat A1 (SBF-20, chạy song song) cũng sửa — chỉ thêm dòng, chat điều phối gộp khi merge `feat/p5` (A2 merge trước).
- **[5c]**: file chat AI có thể sửa.

| Task | Mục tiêu | File (≤ ~5) | Test cần viết | Giờ | Phụ thuộc · Song song | Xung đột |
| -- | -- | -- | -- | -- | -- | -- |
| **FX-T1** | A.1: lỗi cam kết ⟹ 409 ở 3 route duyệt chi | `budgets/public/budgets.errors.ts`, `budgets/budget/budget.errors.ts`, `requests/spend/spend.http-errors.ts`, `requests/spend-approval/spend-batch-decision.service.ts`, `requests/spend-approval-view/spend-approval.dto.ts` (+ ví dụ OpenAPI ở `spend-approvals.controller.ts`, `group-lines.controller.ts`; **Review 2:** + sửa import ở `budget/budget.http-errors.ts`, `budget/commitment.repo.ts`, `commitment/commitment.service.ts` — không re-export) | unit `spend.http-errors.spec.ts` (**tạo mới**, chưa có); unit `spend-batch-decision.service.spec.ts` (**tạo mới**, mock `decide` ném); `pnpm arch:check` + `pnpm test:gates` (luật không re-export) | 0,6 | — · độc lập | **[5b]** `spend.http-errors.ts`, dto |
| **FX-T2** | A.2: 503 cho lỗi DB ở route không có mapper | `infrastructure/http/filters/http-exception.filter.ts` (+ spec) | unit filter (503/500, và có log cảnh báo kèm `requestId` + nguyên nhân trước khi đổi sang 503 — review FX-6); `pnpm test:http -- test/http/...` một route list bất kỳ (nếu harness giả lập được lỗi DB, không thì chỉ unit) | 0,5 | — · độc lập | **[5b]** nếu 5b sửa envelope trong filter |
| **FX-T3a** | B1 + B4: thông báo khi gửi lại và khi trưởng phòng tự đề xuất | `status/rules/status-rules-progress.policy.ts`, `request-intake/request-resubmission.service.ts`, `spend/spend-routing.service.ts` (payload `start`), `status/rules/request-status-rules.policy.spec.ts` | unit luật (đúng người, `cause`, không trùng với `NEED_APPROVED`); integration `test/integration/requests/request-status-notifications.integration-spec.ts`: Trả về ⟹ gửi lại ⟹ trưởng phòng/IT nhận `STEP_ASSIGNED RESUBMITTED`; trưởng phòng tự gửi case B ⟹ IT nhận một lần | 0,75 | — | — |
| **FX-T3b** | B2 + B3: Người duyệt chi nhận một thông báo mỗi lô (`SPEND_BATCH_SUBMITTED`, Q-5A-1 = B) + `STEP_ASSIGNED SPEND_SENT` khi xác nhận dự phòng sau lô; `PRICE_MISSING` khi trình | `status/rules/status-rules-budget-check.policy.ts`, `spend/spend-routing.service.ts` (`notCheckable`), `reserve-confirmation/reserve-confirmation.service.ts`, `spend-submission/spend-batch.service.ts` (`recordSubmitted`), `notifications.types.ts` + `inbox.policy.ts` (mã `SPEND_BATCH_SUBMITTED`), spec luật | unit luật (`RESERVE_CONFIRMED` `via CONFIRMATION` ⟹ `SPEND_SENT`, `via BATCH` ⟹ không gì; `BUDGET_CHECKED` `VIA_HEAD` + `trigger RESERVE_CONFIRMATION` + `opened` ⟹ `SPEND_SENT`, `trigger SUBMISSION` ⟹ không `STEP_ASSIGNED`; `PRICE_MISSING`); integration `spend-batches.integration-spec.ts`: lô 3 mục (1 trong số cơ sở + 1 xác nhận dự phòng trong lô + 1 bị chặn) ⟹ **một** `SPEND_BATCH_SUBMITTED` `sentCount = 2` và response `results` **không đổi shape** (Review 2: response strict); lô không mở bước ⟹ không báo; `reserveConfirmationCreate` mà kiểm lại ra trong số cơ sở ⟹ Người duyệt chi nhận `SPEND_SENT` (Review 2) | 1,1 (A: 0,5) — Review 2 +0,2 (cặp `openedFor`, `confirmOnCheck` trả bước, cờ `via`, nhánh `BUDGET_CHECKED`) | sau FX-T3a (cùng `spend-routing.service.ts`) | — |
| — | **Checkpoint 1** (FX-T1–FX-T3b) | — | `pnpm test:http --maxWorkers=2` (contract FE) + quick set | — | — | — |
| **FX-T4a** | B5 phần 1: 3 mã SaaS, notifier, phát khi gửi phiếu và quá hạn | `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`, `licensing/saas-issue/saas-issue-notifier.service.ts` (mới), `saas-issue.service.ts` (`submit`), `saas-issue-sweep.service.ts` (`tell`), `licensing.module.ts` | unit `inbox.policy.spec.ts` (khóa param hợp lệ); integration `test/integration/licensing/saas-issue-department.integration-spec.ts`: gửi ⟹ IT được giao nhận; sweep quá hạn ⟹ nhận một lần | 0,6 | — | **[5b]** `notifications.types.ts`, `inbox.policy.ts` · **[A1]** `licensing.module.ts` và hai file notifications |
| **FX-T4b** | B5 phần 2: `SAAS_ISSUE_STATE_CHANGED` | `saas-issue-handling.service.ts`, `saas-issue.service.ts` (`addMessage`, `reopen`), `saas-issue-sweep.service.ts` (`close`), notifier | integration: IT chuyển `WAITING_REPORTER`/`RESOLVED`/`DUPLICATE` ⟹ người báo nhận; người báo trả lời/mở lại ⟹ IT nhận; người làm không tự nhận | 0,5 | sau FX-T4a | — |
| **FX-T5** | B6 + B7: `OUT_OF_PROCESS_CASE_REPORTED`, `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | `notifications.types.ts`, `inbox.policy.ts`, `usage/vendor-account-review/vendor-account-review-notifier.service.ts` (mới), `vendor-account-intake.service.ts`, `out-of-process-case-closure.service.ts` (+ `usage.module.ts` provider) | integration `vendor-account-review.integration-spec.ts` (import có tài khoản lạ ⟹ một thông báo/lần nhập; Review 2: ca chuyển từ `SBF-11a` — `applicationId` null ⟹ mọi IT dùng được); `out-of-process-case-spend.integration-spec.ts` (`REPORT_ONLY` ⟹ người dùng + trưởng phòng) | 0,75 | sau FX-T4a (cùng 2 file notifications) | **[5b]** như FX-T4a |
| — | **Checkpoint 2** (FX-T4a–FX-T5) | — | quick set + `pnpm test:http --maxWorkers=2` | — | — | — |
| **FX-T6a** | C: phạm vi IT ở ghost seat | `optimization/board/board-query.service.ts`, `optimization/decision/decision-queue.service.ts`, `optimization/ghost-seat/ghost-seat-decision.repo.ts` | integration `test/integration/optimization/ghost-seat-decision.integration-spec.ts` (hoặc file board): IT P1 đọc khuyến nghị P2 ⟹ 404; danh sách miễn trừ chỉ P1 + phòng chưa có IT | 0,35 | — · song song FX-T6b/FX-T6c | — |
| **FX-T6b** | C: phạm vi IT ở mapping/finding | `usage/identity/identity.controller.ts`, `identity-query.service.ts`, `identity.repo.ts` (`pageMappings`), `no-assignment-finding.repo.ts` (`page`) | integration `test/integration/usage/usage-identity-queue.integration-spec.ts` (thêm ca ngoài phạm vi). **Review 2:** cạnh capability mới `identity` → `usage-overview` (và `ai-usage`/`tool-status` → `usage-overview` ở FX-T6c); không vòng vì `usage-overview` không import capability nào của `usage` — kiểm bằng `pnpm arch:capabilities --module usage` + `pnpm arch:graph` + `pnpm arch:docs:check` | 0,35 | — | **[5b]** nếu 5b đổi ví dụ lỗi trong controller |
| **FX-T6c** | C: phạm vi IT ở usage máy | `devices/public/devices.api.ts` (+ repo đọc đăng ký của máy), `usage/ai-usage/ai-usage-query.service.ts`, `usage/tool-status/tool-status-query.service.ts`, 2 controller truyền `actor` | integration `test/integration/usage/usage-intake.integration-spec.ts` hoặc file devices: IT P1 đọc máy của người P2 ⟹ trang rỗng | 0,35 | — | — |
| **FX-T7** | D: tạo tài khoản luôn dùng `workEmail` | `identity-access/accounts/account-management.dto.ts`, `accounts/app-users/account-invitation.service.ts`, `accounts/account.errors.ts`, `accounts/account.http-errors.ts`, `app-users.controller.ts` (ví dụ OpenAPI) | sửa `account-creation-http.integration-spec.ts:140-160` (đỏ trước); kiểm `employee-manual-http.integration-spec.ts:619`; unit service | 0,5 | — · độc lập | **[5b]** `account.http-errors.ts` |
| **FX-T8** | E2: allowlist theo ngày bỏ riêng tool | `usage/ai-usage/ai-usage-day.policy.ts` (+ spec), `ai-usage-batch.service.ts` (+ spec), `usage/allowlist/allowlist-facts.service.ts` (đọc bản hiện hành nếu chưa có) | unit 2 file spec; integration `usage-intake.integration-spec.ts` | 0,5 | — · độc lập | — |
| — | **Checkpoint 3** (FX-T6a–FX-T8) | — | quick set + `pnpm test:http --maxWorkers=2` | — | — | — |
| **FX-T9a** | E1: route tạo/danh sách/hoàn tất yêu cầu dừng | `devices/stop-request/stop-request.policy.ts` (+ spec), `stop-request.repo.ts`, `stop-request.service.ts`, `stop-request.controller.ts` + `.dto.ts` + `.errors.ts` + `.http-errors.ts` (capability mới, theo `docs/rules/module-structure.md`), `devices.module.ts`, `registry/registry.repo.ts` (Review 2: `setCollectionStopped` đặt `collection_stopped_at = at, acknowledged_from = NULL` một `UPDATE`) | unit policy (thứ tự `ENDED` ⟹ `ALREADY_STOPPED` ⟹ `DUPLICATE`, `dueAt` 2 ngày làm việc qua cuối tuần); integration mới `test/integration/devices/devices-stop-request.integration-spec.ts` (TS-1…TS-10; dòng `INVALID` có `handled_at`; hai lời gọi song song ⟹ `OPEN` + `INVALID DUPLICATE`, không 500 — review FX-3; **hoàn tất không 500** và DB `acknowledged_from` NULL — Review 2, CHECK `one_projection`) | 1,25 | — | — |
| **FX-T9b** | E1: ~~sửa mốc bật lại~~ (Review 2: không sửa `setAcknowledged`, xem §E1) + đăng ký kết thúc đóng yêu cầu + `stopRequestPending` | `devices/registry/registry.repo.ts` (hàm mới đóng yêu cầu `OPEN` — không import `stop-request`), `registry/registration-end.service.ts`, `my-devices/my-devices.repo.ts` + `.dto.ts` | integration TS-11 trong file của FX-T9a (dừng ⟹ 403 ⟹ xác nhận lại ⟹ ngày giữa hai mốc `OUTSIDE_WINDOW`, ngày sau xác nhận được nhận — chứng minh không cần sửa `setAcknowledged`); đăng ký kết thúc khi còn `OPEN` ⟹ `INVALID REGISTRATION_ENDED`; `devices-acknowledgement.integration-spec.ts` không vỡ | 0,4 | sau FX-T9a | — |
| **FX-T9c** | E1: thông báo yêu cầu mới + sweep quá hạn | `notifications.types.ts`, `inbox.policy.ts`, `devices/stop-request/stop-request-notifier.service.ts`, `stop-request.job.ts` (mẫu `saas-issue.job.ts`), `devices.module.ts` (Review 2: thêm `NotificationsModule` vào `imports`) | integration: tạo ⟹ IT phụ trách nhận; IT tự gửi cho máy mình ⟹ không tự nhận (Review 2) (params/subject/eventKey theo §1.B, review FX-2); quá hạn ⟹ nhận một lần (đặt `dueAt` quá khứ, gọi service sweep) | 0,5 | sau FX-T9a, FX-T5 | **[5b]** 2 file notifications |
| **FX-T10** | F: gỡ 2 tham số ZBB | `operating-parameters/parameter-definitions.policy.ts` (+ spec), migration mới, `operating-parameters/README.md`, 2 integration spec | như §F | 0,5 | — · độc lập (A2 merge trước A1, không chờ SBF-20) | **[A1]** `parameter-definitions.policy.ts` + spec + 3 chỗ đếm (A1 gỡ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, thêm tham số điểm điều chỉnh); **[5c]** cùng 3 chỗ đếm. Mỗi chat đếm theo nhánh mình (§F bước 3), điều phối sửa lần cuối |
| **FX-T11** | Dọn + tài liệu | `personnel/event-notice/personnel-notifier.service.ts` (xóa `DEPARTURE_MARKED_LEFT`), README module: `devices` (routes mới), `notifications` (mã mới), `licensing`/`usage` (notifier); `docs/generated/*` qua `arch:routes`/`arch:graph` | không có test mới | 0,25 | cuối | — |
| — | **Checkpoint cuối** | — | quick set + `pnpm test:http --maxWorkers=2`; ghi "pnpm check và test toàn bộ CHƯA chạy, Owner/Opus chạy khi verify" + bảng test theo file | — | — | — |

**Thứ tự đề nghị:** FX-T1 → FX-T2 → FX-T7 → FX-T3a → FX-T3b → (CP1) → FX-T8 → FX-T9a → FX-T9b → FX-T10 → (**lõi xong ≈ 6 h** — báo điều phối để merge A2 vào `feat/p5`, chat B bắt đầu Phase E) → FX-T6a/FX-T6b/FX-T6c → (CP3) → FX-T4a → FX-T4b → FX-T5 → (CP2) → FX-T9c → FX-T11.

Lý do: lõi (lỗi 500/503 mà Phase E của B dựa vào, MF-1, tool collector, tham số) xong trước để A2 merge sớm — Phase E của B chờ A2. Phần sau lõi merge thêm một lượt nếu kịp (điều phối gộp; B thêm mẫu câu cho mã mới của lượt sau).

**Việc cho điều phối (repo Docs, không phải A2):**
- `catalog/notifications.md`: thêm 8 mã (7 + `SPEND_BATCH_SUBMITTED` nếu Q-5A-1 = B) + 2 nhãn `cause` (`RESUBMITTED`, `SPEND_SENT`) theo bảng §1.B. Sửa dòng `STEP_ASSIGNED` "Nguồn BE" và bỏ dòng "Lệch" về gửi lại.
- `catalog/errors.md`: thêm `BUDGET.COMMITMENT_*` ở route duyệt chi, `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`, `DEVICE_STOP_REQUEST.*`.
- Annotations:
  - `accounts-and-roles` (bỏ ô `loginEmail`).
  - `devices-and-ai-usage`: 3 route mới; bỏ câu "chưa có route" ở `flows/ai-collector-device.md:81-84` và `reference/devices-and-ai-usage.md:22`.
  - `settings-and-money`: Finance chỉ còn 1 tham số.
  - `usage-ghost-seats`: phạm vi IT.

## 3. Ma trận file chung

| File | Task A2 | Chat khác | Cách tránh |
| -- | -- | -- | -- |
| `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts` | FX-T4a, FX-T5, FX-T9c | **B** (mẫu câu theo mã); **A1** thêm/đổi mã `SUBSCRIPTION_*` | A2 merge trước A1; B viết mẫu câu cho mã A1/A2 sau khi hai nhánh merge vào `feat/p5`. Bảng §1.B cho B đủ 8 mã + 2 `cause`. A1/A2 ⟹ chỉ thêm dòng, điều phối gộp |
| `*.http-errors.ts`: `requests/spend/spend.http-errors.ts`, `identity-access/accounts/account.http-errors.ts`, `devices/stop-request/stop-request.http-errors.ts` (mới) | FX-T1, FX-T7, FX-T9a | **B** (mã cụ thể + `details`) | Phase E của B chạy sau khi A2 merge `feat/p5`. Mã mới của A2 đã có `details`, nên B không phải làm lại |
| `infrastructure/http/filters/http-exception.filter.ts` | FX-T2 | **B** không sửa filter (SPEC-5B D3) | Sửa một dòng + log, ghi rõ trong commit |
| `requests/spend-approval-view/spend-approval.dto.ts` | FX-T1 | B nếu đổi enum `reason` | Chỉ thêm một giá trị |
| `usage/vendor-account-review/out-of-process-case-closure.service.ts` | FX-T5 (thông báo `REPORT_ONLY`) | **B** E2b (`parseMoney` thêm `path`, `:171`) | B chạy E2b sau khi A2 merge; hai sửa khác dòng |
| `requests/spend-submission/spend-batch.service.ts` | FX-T3b | — | chỉ A2 |
| `licensing/licensing.module.ts` | FX-T4a | **A1** (subscription-renewal) | Chỉ thêm provider |
| `operating-parameters/parameter-definitions.policy.ts` + spec, `prisma/migrations/` | FX-T10 | **A1** (tham số gia hạn), **C** (`AI_PROVIDER_MODE`) | Dải timestamp cấp trước: A2 `20261117100000`–`…100900`, A1 `…110000`–`…110900`, C `…120000`, B `…130000`+; số đếm theo nhánh, điều phối sửa lần cuối |
| `docs/generated/*` (routes, module graph, openapi) | FX-T9a, FX-T11 | tất cả | Sinh lại sau rebase, không sửa tay |
| `usage/*`, `devices/*` | FX-T5, FX-T6b, FX-T6c, FX-T8, FX-T9 | **C** (AI) chỉ ở `ai-assist`: không va | — |

## 4. Câu hỏi Owner

| Mã | Câu hỏi | A (khuyến nghị) | B |
| -- | -- | -- | -- |
| **Q-5A-1** — **ĐÃ CHỐT B (Owner 17/11, Review 2)** (review FX-5) | Người duyệt chi được báo theo **từng Request** hay **một thông báo mỗi lô** khi trưởng phòng trình? | **Khuyến nghị — một thông báo mỗi lô** (`QĐ-99h` "Người duyệt chi chỉ nhận thông báo ngay khi cần quyết (lô duyệt chi …)", BRD 5.5.4 "Lô trình duyệt chi được gửi"): mã mới `SPEND_BATCH_SUBMITTED` ghi trực tiếp trong `spend-batch.service.ts`; `STEP_ASSIGNED SPEND_SENT` chỉ cho xác nhận dự phòng sau lô. +0,4 h. **Spec viết theo phương án này** | Mỗi Request một `STEP_ASSIGNED cause SPEND_SENT` (lô 20 mục ⟹ 20 thông báo, trái chữ `QĐ-99h`). Nếu chọn: làm theo đoạn "Nếu Owner chọn A" ở B2, bỏ mã `SPEND_BATCH_SUBMITTED` khỏi bảng bàn giao, FX-T3b 0,5 h |
| **Q-5A-2** — **ĐÃ CHỐT A (Owner 17/11, Review 2)** | `usageUnmatchedIdentityList`: định danh chưa gắn ai có giới hạn theo phòng không? | Không giới hạn. Không phải usage của người nào; giữ như dòng import không gắn người (`vendor-import-query.service.ts:58-61`), để IT nào cũng xử lý được (`QĐ-58b`) | Chỉ hiện ứng viên (`candidates`) thuộc phạm vi IT. Định danh không còn ứng viên trong phạm vi thì ẩn |

Các chỗ đã có nguồn nên **không hỏi**:
- SaaS (bảng BRD 5.5.4).
- `SBF-07a` chỉ ở `REPORT_ONLY` (`SBF-07a.md` §5.1).
- "đã nghỉ việc" không báo (không nguồn nào đòi).
- Dừng thu thập không cần lý do/đồng ý; IT không đóng "không hợp lệ" (`US-09-04` AC-6, AC-10).
- `loginEmail` (Owner 16/11).

## 5. Ước lượng và phần cắt được

- **Tổng A2 ≈ 10 h Sonnet** (FX-T1 0,5 · FX-T2 0,5 · FX-T3a 0,75 · FX-T3b 0,9 · FX-T4 1,1 · FX-T5 0,75 · FX-T6 1,05 · FX-T7 0,5 · FX-T8 0,5 ·
  FX-T9a 1,25 · FX-T9b 0,5 · FX-T9c 0,5 · FX-T10 0,5 · FX-T11 0,25) + ~0,5 h checkpoint. Review ước ~10,5 h.
- **Lõi bắt buộc trong prompt 5 (≈ 6 h, theo `PLAN.md`):** FX-T1, FX-T2 (500/503) · FX-T7 (Owner đã chốt) · FX-T3a, FX-T3b (MF-1) · FX-T8,
  FX-T9a, FX-T9b (tool đang chờ BE; bước 7 kịch bản demo đang 404) · FX-T10. = 0,5 + 0,5 + 0,5 + 0,75 + 0,9 + 0,5 + 1,25 + 0,5 + 0,5 ≈ 5,9 h.
  **Review 2:** FX-T1 0,6 (+0,1 sửa 3 import), FX-T3b 1,1 (+0,2), FX-T9b 0,4 (−0,1, bỏ sửa `setAcknowledged`) ⟹ lõi **≈ 6,1 h**; tổng ≈ 10,2 h.
- **Sau lõi, làm nếu kịp trong ~10 h đồng hồ** (thứ tự): FX-T6a–c (`QĐ-111ax`) → FX-T4a → FX-T4b → FX-T5 → FX-T9c → FX-T11.
- **Cắt theo thứ tự nếu trễ** (chuyển 4b):
  1. FX-T9c: thông báo + sweep quá hạn dừng thu thập, −0,5 h. IT vẫn thấy hàng qua `deviceStopRequestList` với cờ `overdue`.
  2. FX-T5 phần `VENDOR_ACCOUNT_DISCREPANCY_OPENED`, −0,35 h. IT vẫn thấy hàng sai lệch.
  3. FX-T6c, −0,35 h. Màn usage máy ít dùng trong demo.
  4. FX-T4b, −0,5 h. Giữ FX-T4a để có thông báo khi gửi phiếu và khi quá hạn, đúng `QĐ-108f`.
  5. FX-T11 phần README, gộp vào FIX-TEST/tài liệu cuối.
  6. Q-5A-1 về phương án A (−0,4 h) chỉ khi Owner đồng ý.
- Task bị cắt thì mã thông báo của nó **không** thêm, và chat A2 bỏ dòng tương ứng khỏi mục "Thông báo mới cho 5b" của báo cáo.

## 6. Ca biên cần nhớ khi code

- Luật Request luôn loại người gây ra sự kiện (`plan()`). Người xin gửi lại ⟹ người xin không nhận gì, đúng.
- Trưởng phòng là người thụ hưởng lúc xác nhận dự phòng trong lô ⟹ mục chờ (`spend-batch.service.ts:194-203`), không mở bước, không `STEP_ASSIGNED`.
- `RESUBMITTED` của nhóm: nhiều bước nhu cầu mở lại, có thể cùng một người giữ ⟹ `plan()` đã khử trùng người nhận.
- Phiếu SaaS do IT Admin tự báo cho chính mình: người nhận = người làm ⟹ bỏ.
- `assignedByFallback`: vẫn báo người được giao.
- `OUT_OF_PROCESS_CASE_REPORTED` khi người dùng đã nghỉ: vẫn ghi cho họ (hộp thư giữ theo employee); trưởng phòng lấy theo phòng cuối (`getLastPlacement`).
- Yêu cầu dừng khi chưa xác nhận lần nào (`AWAITING_ACKNOWLEDGEMENT`): vẫn hợp lệ, vì điều kiện chỉ là "đăng ký còn hiệu lực". Hoàn tất ⟹ `collection_stopped_at` đặt (`acknowledged_from` vốn NULL), xác nhận lần đầu sau đó mở thu thập từ lúc xác nhận.
- **Review 2 — trưởng phòng tự trình lô có Request của chính mình:** Request cá nhân của trưởng phòng là `ONE_STEP`, `lockAll` từ chối
  (`spend-batch.service.ts:139-145`, `SpendNotInQueueError`), nên không vào lô. Request `VIA_HEAD` cũ do người này gửi **trước khi** thành
  trưởng phòng vẫn vào lô được: bước mở cho Người duyệt chi như thường, `SPEND_BATCH_SUBMITTED` gửi Người duyệt chi (trưởng phòng là người
  trình nên không nhận); dự phòng của Request mình thụ hưởng ⟹ `AWAITING_RESERVE_CONFIRMATION` (`:196-204`), không mở bước, không tính vào
  `sentCount`. Request nhóm của trưởng phòng không chứa trưởng phòng (`QĐ-103b`).
- **Review 2 — Người duyệt chi không dùng được:** bước mở ở `WAITING_CONTROLLED`, `assigneeEmployeeId` null ⟹ không vào `sentCount`, lô chỉ
  có mục như vậy ⟹ không có `SPEND_BATCH_SUBMITTED` (Super Admin đã có `CONTROLLED_WAIT_ALERT`).
- **Review 2 — `DEVICE_STOP_REQUESTED`:** người giữ là chính IT phụ trách (hoặc IT duy nhất) ⟹ không tự báo; nếu không còn IT nào khác dùng
  được thì không ai nhận, hàng vẫn ở `deviceStopRequestList`.
- F-2: ngày có tool bị bỏ và tool còn lại `COVERED` nhưng ngày không nằm trọn cửa sổ ⟹ vẫn `INVALID_COVERAGE` như cũ (xét trên phần còn lại).
- Migration FX-T10 chạy trên DB đã có giá trị khác mặc định ⟹ chỉ `RAISE NOTICE` (như tiền lệ), không chặn.

## 7. Điều kiện xong của cả A2

- Mọi mục "Xong khi" ở §1 có test đỏ-trước/xanh-sau, và có commit riêng.
- Quick set xanh sau commit cuối.
- `pnpm test:http --maxWorkers=2` xanh.
- `pnpm openapi:export` chỉ đổi đúng các route nêu ở §1.
- `pnpm arch:docs:check` xanh.
- Báo cáo ghi rõ: test chạy theo file, phần **chưa** chạy (full integration/serial/e2e/flows), và nợ test cho FIX-TEST.
- Báo cáo có ba mục bắt buộc: **"Thông báo mới cho 5b"** (bảng §1.B, ghi lệch nếu code khác, bỏ dòng của task bị cắt), **"Breaking FE"** (§9),
  **số đếm tham số trên nhánh** (3 chỗ, §F bước 3).

## 8. Ghi nhận, không làm ở A2

- `QĐ-108h` (tự đóng phiếu SaaS khi quyền kết thúc/người báo nghỉ, báo IT) và `QĐ-108g` (tệp minh chứng) chưa có trong code (REPORT-A4).
- `markDuplicate` nhận cả `WAITING_*`, trái `QĐ-108h` (REPORT-A4).
- `ghostSeatQueueList` của trưởng phòng trả bằng chứng đầy đủ (REPORT-A4): đây là SoD-2/`QĐ-101i`, không phải `QĐ-111ax`. Đề nghị đưa vào 5b hoặc prompt 4.
- `SBF-08` "mức rất cao": hộp thư không có mức ưu tiên.
- `US-09-04` AC-5 "hiện trong cảnh báo nghẽn": chưa có.
- `BudgetCommitmentRefusedError` từ `releaseForRequest` vẫn là 500 nếu xảy ra (bất biến số học, `request-end/request-end.service.ts:27-38`). Không phải lỗi người dùng, để nguyên.
- `REQUEST_RESERVE_CONFIRMATION_NEEDED` vẫn là mã chết (R1 F2). Q-5A-1 không đổi điều này.

## 9. Breaking FE (chat A2 chép vào báo cáo cuối; điều phối đưa vào `changes/<ngày>-prompt5.md`)

1. **Danh sách usage/ghost seat của IT lọc theo phòng phụ trách** (`QĐ-111ax`, §C): `ghostSeatExemptionList`, `usageIdentityMappingList`,
   `usageNoAssignmentFindingList`, `deviceUsageList`, `deviceToolStatusList` — IT Admin ngoài phạm vi nhận **trang rỗng** (không lỗi);
   `ghostSeatRecommendationGet` ngoài phạm vi ⟹ **404 `GHOST_SEAT.NOT_FOUND`**. Phòng chưa có IT phụ trách: mọi IT vẫn thấy.
   `usageUnmatchedIdentityList` không đổi (Q-5A-2 = A).
2. **`spendBatchDecide`**: `results[].reason` thêm giá trị **`COMMITMENT_NOT_HOLDABLE`** (mục bị bỏ qua, các mục khác của lô đi tiếp);
   `spendApprovalDecide`/`spendApprovalLineDecide` trả **409 `BUDGET.COMMITMENT_NOT_HOLDABLE`/`BUDGET.COMMITMENT_EXISTS`** thay 500.
3. **500 → 503 `SERVICE_UNAVAILABLE`** khi DB/kho tạm lỗi ở các route chưa có mapper (`seatMonthChargeList`, `itAdminList`,
   `stockSummaryList`, `invoiceDiscrepancyList`, `purchaseInvoiceList`, `purchaseInvoiceMissingPeriodList`, `spendBatchList`,
   `outOfProcessCaseList`, `vendorAccountDiscrepancyList`, và mọi route khác rơi vào global filter). FE coi 503 là "thử lại".
4. **`aiUsageBatchCreate` đổi nghĩa từng ngày** (§E2): ngày có công cụ chưa được phép **ngày đó** nay bỏ riêng công cụ đó và **nhận** phần còn
   lại (`ACCEPTED`/`UNCHANGED`) — ngày trước đây bị `REJECTED NOT_IN_ALLOWLIST` nay được nhận; chỉ ngày bị bỏ hết mới `REJECTED`. Shape không đổi.
5. **`appUserCreate`**: `loginEmail` luôn = `workEmail`; gửi `loginEmail` khác `workEmail` ⟹ **422 `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`**
   (field deprecated, bản sau gỡ).
6. **Tham số vận hành**: `BUDGET_ZBB_KPI3_BELOW_PERCENT`, `BUDGET_ZBB_PRICE_INCREASE_PERCENT` biến mất khỏi `operatingParameterList`
   (Finance chỉ còn `BUDGET_RESERVE_DEFAULT_PERCENT`).
7. Thêm (không phá): 3 route dừng thu thập + `GET /me/devices` `stopRequestPending`; thông báo mới (§1.B); `STEP_ASSIGNED.cause` thêm
   `RESUBMITTED`, `SPEND_SENT`.
