# AUDIT A2 lõi — phần 1 (FX-T1, FX-T2, FX-T7, FX-T3a, FX-T3b)

Reviewer chỉ đọc, 17/11/2026. Repo `Code/be-p5-a2`, nhánh `feat/p5-a2-fixes`, đọc qua git ở `7d8586d5` (`git show` / `git diff 94a8ee84..7d8586d5`).
Không sửa file repo, không checkout, không chạy pnpm/jest/docker. Mọi kết luận "CI đỏ" là suy ra từ đọc code test, chưa chạy.

**Skill đã đọc/dùng (Skill Preflight theo `D:\FPT\FALL2026\CLAUDE.md`):**
- `agent-skills:code-review-and-quality`: process + review, soi 5 trục, gắn mức Critical/Required/Optional/Nit.
- `superpowers:verification-before-completion`: verification. Mọi file:dòng bên dưới đều đã đọc lại ở `7d8586d5`. Không có kết luận "test xanh" nào vì không được chạy test.

**Nguồn đã đối chiếu:** `SPEC-5A-FIXES.md` §1 A/B/D, §2, §6, §7, §9; `REVIEW-SPECS-2.md` A2-1…A2-17; `QĐ-99h` (sổ dòng 634); BRD dòng 1059, 1069, 1078
(bảng 5.5.4); `MF-1-access-request-approval-provisioning.md` bước 7, 8, 11; rule `module-layout` (25 file/thư mục, 400 dòng spec unit),
`test-size` (800 dòng), `capability-graph` (spec không tính).

---

## 0. Kết luận

| Commit | Kết luận |
| -- | -- |
| `8eda00c2` FX-T1 | Logic đúng spec. 2 lớp lỗi đã chuyển sang `budgets/public/budgets.errors.ts`, sửa import ở 3 file, không re-export. Mapper trả đúng status/code/details như `budget.http-errors.ts:93-103`. Batch bỏ qua `COMMITMENT_NOT_HOLDABLE`. Lỗi ném trước mọi lần ghi (`commitment.service.ts:207-216`) và nằm trong `runner.run`, nên không có quyết định nào bị lưu dở. **Còn lỗi CI ở R-1.** |
| `bb664564` FX-T2 | Đúng. Chỉ đổi sang 503 khi `toUnavailableApiException` khớp (`TransientDatabaseError`, SQLSTATE/Prisma code tạm thời, object storage). Body là hằng `SERVICE_UNAVAILABLE_ERROR` nên không lộ chi tiết DB. Có log warn kèm `requestId` + `describeForOperator`. Lỗi lập trình (`new Error`) vẫn là 500 và vẫn log error. |
| `3ad9439f` FX-T7 | Đúng thứ tự kiểm REQUIRED → INVALID → NOT_WORK_EMAIL. Luôn lưu `workEmail.trim()`, không bao giờ lưu chuỗi FE gửi. **Còn lỗi CI ở R-1.** |
| `ee3cee73` FX-T3a | Đúng người nhận và `cause`. Không trùng với `NEED_APPROVED`. Có 1 Optional (O-1). |
| `a304b0ce` FX-T3b | Đúng Q-5A-1 = B. Mỗi lô một thông báo cho mỗi Người duyệt chi, ghi trong transaction của lô, khóa idempotent `(recipient, SPEND_BATCH_SUBMITTED:{batchId})`. `results` giữ nguyên shape. `via` phân biệt đúng hai đường. Nhánh `BUDGET_CHECKED` `RESERVE_CONFIRMATION` đã có. |

**Vùng này merge được chưa:** **Chưa**, vì R-1 làm `pnpm test:http` đỏ. Sửa R-1 thì merge được; R-1 chỉ cần thêm 3 dòng manifest, không phải sửa logic. Optional/Nit không chặn merge.

Đếm: Critical 0 · Required 1 · Optional 3 · Nit 4.

---

## 1. Findings

### R-1 — Required — Manifest mã lỗi OpenAPI chưa cập nhật ⟹ `test:http` đỏ ở 3 operation

- **Vị trí (`7d8586d5`):**
  - `test/support/openapi-example-route-codes-identity-access.ts:17-22`: `appUserCreate` `422` không có `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`.
  - `test/support/openapi-example-route-codes-requests-spend.ts:97-105`: `spendApprovalDecide` `409` thiếu `BUDGET.COMMITMENT_NOT_HOLDABLE` và `BUDGET.COMMITMENT_EXISTS`.
  - `test/support/openapi-example-route-codes-requests-spend.ts:114-121`: `spendApprovalLineDecide` `409` thiếu đúng hai mã đó.
  - Nguồn thay đổi:
    - `app-users.controller.ts:144`;
    - `spend-approvals.controller.ts:118-119`;
    - `group-line-decisions/group-lines.controller.ts:167-168`.
- **Kịch bản lỗi:**
  - `test/http/platform/openapi-response-examples.http-spec.ts:168-187` ("shows exactly the codes that each operation can answer with at each status") so tập ví dụ trong OpenAPI với `globalCodes(...) + ROUTE_ERROR_CODES[op][status]` và đòi bằng nhau tuyệt đối.
  - FX-T1 và FX-T7 đã thêm ví dụ vào OpenAPI (`openapi.json` cũng đã đổi) nhưng không sửa `test/support/*`. `git log 94a8ee84..7d8586d5 -- test/support/` chỉ ra FX-T9a, FX-T9b, FX-T10.
  - Vì vậy `mismatches` sẽ có 3 dòng `…: shows …; reachable …`. CI job `test:http` đỏ.
  - Spec §2 Checkpoint 1 và §7 đều đòi `pnpm test:http --maxWorkers=2` xanh, nên checkpoint này chưa được chạy, hoặc đã chạy mà đỏ.
- **Căn cứ:**
  - `globalCodes` (`openapi-response-examples.http-spec.ts:69-85`) chỉ thêm mã auth/validation/transport, không có `BUDGET.*`/`APP_USER.*`.
  - `git grep COMMITMENT_NOT_HOLDABLE -- test` và `git grep LOGIN_EMAIL_NOT_WORK_EMAIL -- test/support` đều không ra kết quả.
- **Cách sửa:**
  - `openapi-example-route-codes-identity-access.ts` → `appUserCreate['422']` thêm `'APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL'`.
  - `openapi-example-route-codes-requests-spend.ts` → `spendApprovalDecide['409']` và `spendApprovalLineDecide['409']` mỗi chỗ thêm `'BUDGET.COMMITMENT_EXISTS'`, `'BUDGET.COMMITMENT_NOT_HOLDABLE'` (test có sort nên thứ tự tự do).
  - Tùy chọn: cập nhật `docs/workspace/items/openapi-response-examples/inventory.md`.
  - **Test:** `pnpm test:http -- test/http/platform/openapi-response-examples.http-spec.ts` phải xanh. Kiểm thêm theo chiều ngược lại: bỏ một ví dụ khỏi controller thì test phải đỏ.

### O-1 — Optional — B1: người giữ bước đánh giá đọc lúc chiếu, không phải lúc sự kiện

- **Vị trí:**
  - `src/modules/requests/status/rules/status-rules-progress.policy.ts:96-113` (nhánh `assessment ? [facts.assessmentHolderEmployeeId]`);
  - `request-resubmission.service.ts:64-82` (payload `RESUBMITTED` của `reopenAssessment` không mang `assignee`, dù đã tính ở dòng 67);
  - `request-status.repo.ts:104-112`.
- **Kịch bản:** worker chiếu chậm, và trong lúc đó bước bị đổi người (`STEP_REDETERMINED`) hoặc đóng. Khi đó IT ban đầu không nhận `RESUBMITTED`; IT mới nhận cả `REASSIGNED` lẫn `RESUBMITTED`; hoặc không ai nhận nếu bước đã đóng.
  - B4 (`ASSESSMENT_REQUESTED`) lấy người nhận từ payload, B1 lại lấy từ fact, nên hai luật không nhất quán.
  - Spec §1.B B1 chọn fact, nên đây là lệch có chủ ý của spec, không phải lỗi code.
- **Cách sửa (nếu muốn):**
  - Thêm `itAdminEmployeeId: assignee` vào payload `RESUBMITTED` của `reopenAssessment`.
  - Luật dùng `text(event.after,'itAdminEmployeeId') ?? facts.assessmentHolderEmployeeId`; giữ fallback cho sự kiện cũ.
  - Test unit: fact `null` + payload có id ⟹ vẫn báo đúng id.

### O-2 — Optional — FX-T1 chỉ có unit cho mapper, chưa có contract HTTP 409

- **Vị trí:**
  - `src/modules/requests/spend-approval/spend-commitment-errors.spec.ts`;
  - `spend-batch-decision.service.spec.ts`;
  - route `spend-approvals.controller.ts:142-143` và `group-lines.controller.ts:195-196`.
- **Kịch bản (mutation):** nếu sau này controller `spendApprovalDecide` đổi sang mapper khác, hoặc bỏ `try/catch`, thì không test nào bắt, vì unit chỉ gọi thẳng `toSpendApiException`.
  - Phần "nothing was decided" trong mô tả OpenAPI đúng theo code: lỗi ném trước `commitments.hold` và trong `runner.run`. Tuy vậy chưa có test chứng minh.
- **Cách sửa:** thêm `test/http/requests/spend-commitment-conflict.http-spec.ts` theo mẫu `account-role-change.http-spec.ts`:
  - override `SpendDecisionService.decide` ném `new BudgetCommitmentNotHoldableError('NO_APPROVED_BUDGET', 2026)`;
  - kiểm `POST /access-requests/:id/spend-approval` ⟹ 409, `error.code`, `error.details = {reason, year}`;
  - làm tương tự cho route line-decide.

### O-3 — Optional — B4 cũng phát ở đường chuyển một bước (`finishConversion`), `cause` = `SUBMITTED`

- **Vị trí:**
  - `spend-routing.service.ts:83-92` (`finishConversion` ⟹ `start(tx, null, …)` khi `NEW_SOFTWARE && !needDecision && pricing MISSING`);
  - `:56-66` (payload `routingMode: 'ONE_STEP'`);
  - luật `status-rules-progress.policy.ts:79-94`.
- **Kịch bản:**
  - Request `VIA_HEAD` mới đề xuất bị chuyển sang một bước (trưởng phòng nghỉ, `one-step-conversion.service.ts:27-38`). IT nhận `STEP_ASSIGNED {IT_ASSESSMENT, cause:'SUBMITTED'}` dù không ai vừa gửi.
  - Hành vi báo IT là **đúng**: họ có bước mới, trước đây không được báo. Chỉ nhãn `cause` gây hiểu nhầm, và chưa có test ghim hành vi này.
- **Cách sửa:** chọn một trong hai.
  - Chấp nhận, rồi thêm 1 ca integration ghim hành vi (chuyển một bước ⟹ IT nhận đúng 1 thông báo).
  - Hoặc `start` nhận `cause` (`'SUBMITTED' | 'REASSIGNED'`), ghi vào payload, luật đọc `cause` từ payload, kèm test unit hai nhánh.

### N-1 — Nit — `module-graph.md` sinh lại trễ một nhịp ⟹ 4 commit trung gian đỏ gate

- **Vị trí:** `docs/generated/module-graph.md:136` (`requests -->|32| budgets`) chỉ đổi ở `a304b0ce`.
- **Kịch bản:**
  - FX-T1 thêm 2 cạnh `requests → budgets` (`spend.http-errors.ts:4`, `spend-batch-decision.service.ts:4`) nhưng không sinh lại graph.
  - Ở `8eda00c2`, `bb664564`, `3ad9439f`, `ee3cee73`, các lệnh `pnpm arch:docs:check` và gate `module-graph` sẽ đỏ, nên bisect bị nhiễu.
  - HEAD đã đúng.
- **Cách sửa:** không cần sửa ở HEAD. Ghi vào báo cáo A2. Lần sau mỗi task có import liên module thì chạy `pnpm arch:graph`.

### N-2 — Nit — Không có `A2-DONE.md`, D-n không được khai

- **Vị trí:** `verify-logs/p5/` chưa có `A2-DONE.md`. Thân commit của `8eda00c2`, `3ad9439f`, `ee3cee73`, `a304b0ce` rỗng; chỉ `bb664564` có thân.
- **Lệch so với spec mà không khai (đều hợp lý, chỉ cần ghi lại):**
  - D-a: spec FX-T1 nói "unit `spend.http-errors.spec.ts` (tạo mới)", code tạo `spend-approval/spend-commitment-errors.spec.ts`. Lý do là `requests/spend/` đang đúng trần 25 file (`module-layout.gate-spec.ts:26`, gồm cả spec); thêm spec vào đó là gate đỏ.
  - D-b: spec FX-T3b nói `recordSubmitted` trong `spend-batch.service.ts` gọi `notifyInApp`. Code tách ra service mới `spend-submission/spend-batch-recorder.service.ts`, đăng ký ở `requests.module.ts`, và thay `AuditApi` bằng `SpendBatchRecorder` trong constructor.
  - D-c: integration FX-T3b viết ở file mới `test/integration/requests/spend-batch-notifications.integration-spec.ts`, không phải `spend-batches.integration-spec.ts`.
- **Cách sửa:** báo cáo cuối A2 ghi D-a…D-c.

### N-3 — Nit — `workEmail` không chuẩn hóa được thì trả `LOGIN_EMAIL_INVALID` không có `details.field`

- **Vị trí:** `account-invitation.service.ts:145-155` (chuẩn hóa `workEmail` trước khi xét `sent`).
- **Kịch bản:** dữ liệu cũ hoặc import có `workEmail` sai dạng. FE không gửi `loginEmail` nhưng nhận "The login email is not a valid address."
  - DTO `employee.dto.ts:40-47` đã có `canBeNormalized` và import cũng kiểm, nên gần như không xảy ra.
- **Cách sửa:** để nguyên, hoặc map riêng sang `LOGIN_EMAIL_REQUIRED`/mã khác. Không cần trong prompt 5.

### N-4 — Nit — Nhánh phòng hờ của `SpendBatchRecorder` không có test

- **Vị trí:** `spend-batch-recorder.service.ts:46-49` (bỏ `holder === actor.employeeId`, đếm theo từng người nhận).
- Mutation bỏ điều kiện `holder === actor.employeeId` không bị test nào bắt. Theo BRD, Người duyệt chi không kiêm trưởng phòng (`MF-1` dòng 22), nên đây chỉ là phòng hờ, đúng như spec §1.B B2 ghi.
- **Cách sửa (tùy chọn):** thêm 1 unit cho `SpendBatchRecorder.submitted` với `openedFor = [A, A, null, actor]` ⟹ đúng 1 lần `notifyInApp` cho A với `sentCount: 2`.

---

## 2. Rà theo 5 trục (bằng chứng)

**Trục 1 — Đúng spec/QĐ/BR-MF1**
- B2 (`QĐ-99h` "chỉ nhận thông báo ngay khi cần quyết (lô duyệt chi…)", BRD dòng 1078):
  - `spend-batch.service.ts:100-137` gom `openedFor` từ `sendOn` (`routed.step?.assigneeEmployeeId` cho `WITHIN_BASE`, `step.assigneeEmployeeId` từ `confirmOnCheck`), rồi `SpendBatchRecorder` ghi trong cùng transaction.
  - Người duyệt chi không bao giờ là người xin/thụ hưởng: `step-routing/spend-routing.policy.ts:30-35` trả `WAITING`, `assignee` null ⟹ không đếm.
  - `spendSent` (`status-rules-budget-check.policy.ts:9-19`) bỏ thêm trường hợp `holder === requester`.
- Đúng một lần mỗi lô:
  - unique `(recipient_employee_id, event_key)` (`migrations/20261024110000…/migration.sql:30`) + `eventKey SPEND_BATCH_SUBMITTED:{batchId}`.
  - Trình lại sau `RETURN` tạo lô mới, `batchId` mới, nên có một thông báo mới (đúng nghiệp vụ: lô mới).
  - Mục trong lô không phát `STEP_ASSIGNED` riêng: `BUDGET_CHECKED` `VIA_HEAD`+`SUBMISSION` ⟹ `[]` (`:37-50`); `RESERVE_CONFIRMED` `via BATCH` ⟹ `[]` (`:95-102`).
- B3: `notCheckable` `VIA_HEAD` ghi audit (`spend-routing.service.ts:104-119`).
  - Đường `confirm` ném lỗi sau đó (`reserve-confirmation.service.ts:89`) nên rollback.
  - Người nhận là người xin + IT phụ trách; trưởng phòng (actor) bị `plan()` loại (`request-status-rules.policy.ts:79`), khớp BRD dòng 1069.
- B1/B4: đúng bảng §1.B.
  - `ONE_STEP` mới phát B4, nên không trùng `NEED_APPROVED`; integration `request-status-notifications.integration-spec.ts` có ca "IT nhận đúng 1".
- FX-T7 đúng ý Owner (một ô "Email công ty"):
  - không đụng luồng đổi email đăng nhập;
  - `successor-enrolment.service.ts:46-58` vốn đã dùng `workEmail`.

**Trục 2 — Đúng đắn**
- Transaction:
  - thông báo lô ghi bằng `notifyInApp(tx, …)` trong `runner.run` của `submit`;
  - thông báo Request đi qua audit + projector có cursor (`request-status-projector.service.ts:94`, không backfill sự kiện cũ khi deploy luật mới).
- Race trình lô hai lần: `lockAll` khóa theo id đã sort (`spend-batch.service.ts:146-163`). Lô sau thấy state đã đổi ⟹ `SpendNotInQueueError`. Không có deadlock chéo.
- Mapping lỗi:
  - FX-T1 chỉ khớp đúng 2 lớp bằng `instanceof`; lỗi khác vẫn `throw` (unit "still throws an error nobody maps").
  - FX-T2 chỉ khớp lớp lỗi tạm thời; `new Error('x')` ⟹ 500 + log error (spec filter có ca này).
  - FYI: SQLSTATE `57014` (statement timeout) cũng thành 503. Đây là ngữ nghĩa sẵn có của `TRANSIENT_SQL_STATES` (`transaction-runner.ts:29`), không phải lỗi mới.
- 503 không lộ chi tiết: body là hằng (`service-unavailable.ts:7-10`); chi tiết chỉ nằm trong log warn.

**Trục 3 — Kiến trúc**
- Import liên module đều qua `public/`: `budgets/public/budgets.errors`, `notifications/public/notifications.api`. Không re-export (đúng A2-5).
- Không query bảng module khác.
- Trần 25 file: `requests/spend/` = 25 (không tăng); `spend-submission/` = 16; spec unit lớn nhất `request-status-rules-budget-check.policy.spec.ts` = 302 dòng (< 400); integration lớn nhất 559 (< 800).
- `requests → notifications` đã có `NotificationsModule` trong imports (`requests.module.ts:235`). Graph ở HEAD đúng (xem N-1 về commit trung gian).

**Trục 4 — Phân quyền/SoD (FX-T7)**
- Không còn đường đặt `loginEmail` tùy ý qua `appUserCreate`:
  - lưu luôn là `workEmail.trim()` (`account-invitation.service.ts:150`);
  - gửi khác ⟹ 422 `LOGIN_EMAIL_NOT_WORK_EMAIL` `{field:'loginEmail'}` trước mọi lần ghi.
- Email trùng: unique `(organization_id, normalized_login_email)` ⟹ `LOGIN_EMAIL_TAKEN` 409 (integration đã viết lại để chứng minh).
- Đổi `workEmail` sau khi tạo: `loginEmail` không đổi theo; `resendInvitation` dùng `account.loginEmail`. Đúng quyết định Owner (đổi email đăng nhập ở màn bảo mật). FYI cho FE.
- Bootstrap/demo/successor không đổi, đúng §1.D.

**Trục 5 — Test**
- Assertion không bị nới:
  - ca cũ "accepts a separate login email" được thay bằng 3 ca chặt hơn: lưu đúng `workEmail` thay vì chuỗi gửi; 422 + đếm `app_users` không đổi; unique qua SQL.
  - message `LOGIN_EMAIL_REQUIRED` đổi theo spec.
- Test CI sẽ đỏ: **R-1** (`openapi-response-examples.http-spec.ts`). Đã rà các file test chạm `STEP_ASSIGNED`, `REQUEST_BUDGET_BLOCKED`, `app-users`, audit `RESERVE_CONFIRMED`/`RESUBMITTED`/`SPEND_BATCH.SUBMITTED`: không thấy ca nào khác vỡ do thay đổi trong vùng này. Chưa chạy để xác nhận.
- Mutation đã lập luận:

  | Mutation | Bị bắt bởi |
  | -- | -- |
  | Bỏ nhánh `BudgetCommitmentExistsError` trong `decideOne` | `spend-batch-decision.service.spec.ts` (`it.each`) |
  | `toSpendApiException` trả 500 / sai `details` | `spend-commitment-errors.spec.ts` |
  | Bỏ `?? unavailableOrSelf` hoặc bỏ log warn | `http-exception.filter.spec.ts` (3 ca FX-T2) |
  | Lưu `sent` thay `workEmail` / bỏ so sánh / đảo thứ tự REQUIRED | unit `account-invitation.service.spec.ts` + integration "stores the work email, not the sent text" |
  | Bỏ `routingMode:'ONE_STEP'` khỏi payload `start` | integration "tells the IT Admin once that a head proposed…" |
  | Bỏ `holders.push` | integration "tells the head the need step is theirs again…" |
  | `via:'BATCH'` → `'CONFIRMATION'` trong `sendOn` | integration lô 3 mục (`codesFor(boss, uses)` phải `[]`) |
  | Bỏ `openedFor` của `confirmOnCheck` | integration (`sentCount: 2`) |
  | Bỏ audit `SPEND_NOT_CHECKABLE` | integration B3 |
  | Bỏ điều kiện `holder === actor` của recorder | **không bắt** (N-4, chỉ là phòng hờ) |
  | Controller đổi mapper | **không bắt** (O-2) |

## 3. Việc cần làm trước merge

1. R-1: thêm 3 mã vào 2 file manifest `test/support/openapi-example-route-codes-*.ts`, chạy `pnpm test:http -- test/http/platform/openapi-response-examples.http-spec.ts`, sau đó chạy `pnpm test:http --maxWorkers=2` (checkpoint của spec).
2. Báo cáo A2 ghi D-a…D-c (N-2) và lưu ý N-1.
