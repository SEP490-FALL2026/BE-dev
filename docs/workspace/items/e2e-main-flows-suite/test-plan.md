# Test plan: e2e-main-flows-suite — kịch bản theo 5 main flow

[Spec](spec.md) · [Plan](plan.md). Mọi đường dẫn có tiền tố `/api/v1`. Contract là bản **sau sửa** của hạng mục ghi ở cột
`Item` (`#n` = số trong `docs/reviews/qd96-100-alignment-2026-11-05/ITEMS.md` (nhật ký review đã xóa 11/11/2026 — xem git history)). Chưa chạy: mọi dòng là `planned`.

## 1. Quy ước

- Vai (mã seed): **E** Employee `NV-DEV1..3`, **H** trưởng phòng (`ENGH`, `SALH`, `MKTH`, `DESH`, `FINH`), **IT** `NV-ITA1`
  (`ITA2` khi cần IT khác), **FIN** `NV-FIN1`, **SAP** Người duyệt chi `NV-CEO`, **SA** Super Admin của installation.
- `D0` = ngày thật khi chạy; `+n wd` = n ngày làm việc (lịch tổ chức). Nhảy đồng hồ = `FlowClock.jumpTo`; job = `sweep(<tên>)`
  với `now` = đồng hồ giả. Luật CR-1: dữ liệu nền ghi ở D0 (spec mục 5.5).
- `p` = đơn giá tháng của gói đọc từ `GET /requestable-plans`. Phòng `FLW` = phòng kịch bản tự tạo (spec mục 3) với
  `base = 1,5p`, `reserve = 1p` sau F4-01-setup (`FlowWorld.controlledBudget()`).
- Mỗi lỗi kiểm `status` + `error.code` và số dòng bảng đích không đổi. Thông báo đọc sau `sweep('projection')`.
- Tên cột lấy từ spec của hạng mục chủ; xác nhận với Prisma lúc implement (plan Task 1).

## 2. Dữ liệu cần cho từng kịch bản

| Kịch bản    | Từ seed (v2 ∩ v3 trừ khi ghi v3)                               | Kịch bản tự tạo ở D0 qua API                                          |
| ----------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| F0-01       | mọi tài khoản vai                                              | —                                                                     |
| F1-01…F1-04 | ENG (ngân sách rộng), `chatgpt-eng` (K1), ENGH, CEO, ITA1/ITA2 | Request mới của DEV3, ITA1 (Request của chính IT)                     |
| F1-05…F1-07 | CEO, FIN1, gói `figma-professional`                            | phòng `FLW` + H + 3 E + ngân sách kiểm soát; thuê bao figma của `FLW` |
| F1-08       | `figma-eng` (5 seat), DEV2, DEV3, ENGH                         | Request nhóm                                                          |
| F1-09       | `jira-eng` (K2), `chatgpt-eng` (K1)                            | quyền 1 tháng và 3 tháng của DEV3 (từ F1-01/F1-08)                    |
| F1-10/F1-11 | R3 (PENDING ở ENGH), R8 (`AWAITING_IT_ASSESSMENT`)             | —                                                                     |
| F1-12       | **v3**: R9, R10, R12, R13, R15, R16, CTR1                      | —                                                                     |
| F2-*        | ENG members có seat (DEV1 giữ jira/chatgpt từ R1), ITA1, ENGH  | quyền thêm cho DEV2/DEV3 nếu cần (Request ở D0)                       |
| F3-*        | ENG → SAL/FIN; `jira-sal`; SALH, FINH                          | điều chuyển hiệu lực D0; phòng `FLW` không trưởng phòng (F3-04)       |
| F4-*        | DES (không ngân sách), FIN1, CEO, DESH                         | đề xuất, phiên bản; Request 12 tháng (cam kết chuyển tiếp, F4-03)     |
| F5-01       | `jira-eng` (TERM)                                              | thuê bao TERM mới có ND = D0 + 95 ngày                                |

## 3. MF-1 — Request → duyệt → cấp (`mf1-request-approval`, `mf1-group-renewal`)

**F1-01 Request cá nhân trả phí, trong số cơ sở, tới seat `@MF1 @B3`**

| #   | Vai  | Gọi (body chính)                                                                                                 | Mong đợi                                        | DB / thông báo kiểm                                                                              | Item       |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| 1   | DEV3 | `POST /access-requests/preview {planId, termMonths:1}`                                                           | 200 `canSubmit`, `termLimit {maxMonths:12}`     | không ghi                                                                                        | #15        |
| 2   | DEV3 | `POST /access-requests {planId, businessReason, termMonths:1}`                                                   | 201 `PENDING`, `needStep.assignee` = ENGH       | `access_requests.state`, `pricing_anchor_on` = D0                                                | #16        |
| 3   | ENGH | `GET /need-decisions` → `POST /access-requests/{id}/need-decision {decision:APPROVE}`                            | 200 `AWAITING_SPEND_SUBMISSION`                 | `spend_queued_at` đặt                                                                            | B0, #15    |
| 4   | ENGH | `GET /spend-queue` → `POST /spend-batches {requestIds:[id]}`                                                     | 201, item `SPEND_APPROVAL`, check `WITHIN_BASE` | `request_budget_check_years.code`, `base_minor`, `reserve_minor`; số kiểm = giá gốc (không thuế) | #6         |
| 5   | CEO  | `GET /spend-approvals` → `GET /access-requests/{id}/spend-approval` → `POST …/spend-approval {decision:APPROVE}` | 200 `AWAITING_EXECUTION`                        | `budget_commitments` 1 dòng `HELD` = giá gốc; `expected_end_date` = D0 + 1 tháng − 1             | #6 #16 #20 |
| 6   | IT   | `GET /grant-queue` → `POST /provisioning-tasks {requestId, subscriptionId}` → `/claim` → `/complete {evidence}`  | 201 → 200 → 200 `COMPLETED`                     | `license_assignments.expected_end_date` = bước 5; `seat-usage.occupied` +1                       | #4 #20     |
| 7   | —    | `sweep('projection')`                                                                                            | —                                               | DEV3 `REQUEST_GRANTED`; CEO báo khi trình lô; ENGH báo cấp xong                                  | #22        |

**F1-02 Field cũ ⟹ 422, không ghi `@MF1 @B3`** — mỗi dòng một lời gọi, đếm bảng trước/sau.

| Gọi                                         | Field gửi                                   | Mong đợi                                       | Item    |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------- | ------- |
| `POST /access-requests`                     | `expectedSpendOn`                           | 422 `VALIDATION_ERROR`, `access_requests` =    | #16     |
| `POST /access-requests`                     | `termMonths:13`                             | 422 `VALIDATION_ERROR`                         | #15     |
| `POST /access-requests/{id}/need-decision`  | `termConfirmation`, `spend.expectedSpendOn` | 422 `VALIDATION_ERROR`                         | #15 #16 |
| `POST /access-requests/{id}/need-decision`  | `spend.planLine`, `spend.offPlan`           | 422 `VALIDATION_ERROR`                         | 12b     |
| `PUT /access-requests/{id}/plan-line`       | —                                           | 404                                            | 12b     |
| `POST /budget-proposals`                    | `lines[].windowFrom` (mỗi 5 trường)         | 422 `VALIDATION_ERROR`, `budget_proposals` =   | 12b     |
| `POST /access-requests/{id}/spend-approval` | `override`                                  | 422 `VALIDATION_ERROR`                         | #12     |
| `POST /provisioning-tasks`                  | `expectedEndDate`                           | 422 `VALIDATION_ERROR`, `provisioning_tasks` = | #4      |
| `POST /group-requests`                      | `lines[].expectedEndDate`                   | 422 `VALIDATION_ERROR`                         | #20     |
| `POST /delegated-requests`                  | (route gỡ)                                  | 404                                            | #4      |
| `POST /budget-versions`                     | `highValuePercent`                          | 422 `VALIDATION_ERROR`                         | #13     |

**F1-03 Sai vai, khác phòng, tự duyệt `@MF1 @B0`** (Request mới của DEV3, đưa tới bước tương ứng bằng body B0)

| Vai  | Gọi                                                 | Mong đợi                                                      | Item |
| ---- | --------------------------------------------------- | ------------------------------------------------------------- | ---- |
| DESH | `POST /access-requests/{id}/need-decision`          | 403 `ACCESS_REQUEST.NOT_THE_ASSIGNEE`                         | B0   |
| DEV1 | cùng                                                | 403 (role)                                                    | B0   |
| SALH | `POST /spend-batches {requestIds:[id]}`             | 403 `SPEND.NOT_HEAD` hoặc 409 `SPEND.NOT_IN_QUEUE`            | B0   |
| FIN1 | `POST /access-requests/{id}/spend-approval`         | 403 (route chỉ cho Người duyệt chi)                           | B0   |
| IT   | `POST /provisioning-tasks` trước duyệt chi          | 409 (chưa `AWAITING_EXECUTION`)                               | B0   |
| ITA1 | tự cấp Request của chính ITA1 (đã duyệt ở ITOH/CEO) | 409/403 `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED`; ITA2 cấp được | B0   |

**F1-04 Retry / idempotent `@MF1 @B0`** (Request riêng ở ENG): gọi lại `POST /spend-batches` cùng `requestIds` ⟹ 409,
`spend_batch_items` 1 dòng; gọi lại duyệt chi ⟹ 409 `ACCESS_REQUEST.STEP_NOT_PENDING`, `budget_commitments` vẫn 1; gọi lại
`/complete` ⟹ 409, `license_assignments` 1. Item: B0 (sau #6 kiểm thêm `request_budget_checks` không có dòng thứ hai).

**F1-05 Dùng dự phòng cần trưởng phòng xác nhận `@MF1 @B2`** (phòng `FLW`, sau một Request p đã duyệt: còn cơ sở 0,5p)

| #   | Vai  | Gọi                                                                            | Mong đợi                                                        | DB / thông báo                                                              | Item  |
| --- | ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ----- |
| 1   | E→H  | Request p, duyệt nhu cầu; `POST /spend-batches {requestIds}`                   | item `STOPPED` `RESERVE_CONFIRMATION_REQUIRED`, `overBase` 0,5p | không bước chi; `spend_batch_items.stop_reason`                             | #6    |
| 2   | H    | trình lại có `reserveConfirmations:[{requestId, reason:"hai dòng\n"}]`         | 422 `VALIDATION_ERROR`                                          | `request_reserve_confirmations` = 0                                         | #7    |
| 3   | FIN1 | `POST /spend-batches …reserveConfirmations`                                    | 403                                                             | không ghi                                                                   | #7    |
| 4   | H    | `POST /spend-batches {requestIds, reserveConfirmations:[{requestId, reason}]}` | 201 `SPEND_APPROVAL`, `reserveConfirmed:true`                   | 1 dòng xác nhận (`over_base_minor`)                                         | #7    |
| 5   | CEO  | `GET /access-requests/{id}/spend-approval`                                     | `reserveConfirmation {reason, confirmedBy, overBase}`           | —                                                                           | #7 #8 |
| 6   | CEO  | `POST …/spend-approval {decision:APPROVE}`                                     | 200                                                             | cam kết `HELD`, `request_reserve_confirmations.check_id` khớp check mở bước | #6 #7 |
| 7   | —    | `sweep('projection')`                                                          | —                                                               | E + H nhận thông báo "cần xác nhận dự phòng" (bước 1), CEO nhận "có lô"     | #22   |

**F1-06 Bị chặn, quyền xem hẹp, rút `@MF1 @B2`**: Request 2p ở `FLW` ⟹ trình ⟹ `STOPPED` `OVER_RESERVE` (không bước chi,
không bảng Finance — `finance_reviews` không tồn tại sau #11); người yêu cầu `GET /access-requests/{id}/budget-check` ⟹ 200
`outcome BLOCKED`, số ngân sách `null`; H phòng khác ⟹ 404 `SPEND.REVIEW_NOT_FOUND`; H `GET /budgets/mine` thấy `base`,
`reserve`, `remaining`; H `POST /access-requests/{id}/withdraw {reason}` ⟹ `WITHDRAWN`, không cam kết. Request DES2 ở DES
(chưa phiên bản) ⟹ `BLOCKED` `NO_ACTIVE_BUDGET`. Item #6 #7 #8 #11.

**F1-07 Kiểm lại lúc duyệt qua năm ⟹ trả về trưởng phòng `@MF1 @B2` (mốc)**: D0 trình Request cá nhân ở ENG (`WITHIN_BASE`);
`jumpTo(02/01 năm sau)`, refresh token; CEO duyệt ⟹ 409 `SPEND.RECHECKED_RETURNED_TO_HEAD` `details.blockedReasons ∋
NO_ACTIVE_BUDGET` (năm theo ngày duyệt); bước chi `CLOSED`, Request `AWAITING_SPEND_SUBMISSION`, stage `RETURNED_AT_DECISION`;
không cam kết. Item #6 #16. Rủi ro CR-1: chỉ ghi bước chi (trigger `waiting_since`/`spend_queued_at` dùng `now()` không ảnh
hưởng kết quả).

**F1-08 Request nhóm `@MF1 @B3`**: DEV2 `POST /group-requests {planId:figma, businessReason, termMonths:3, lines:[{employeeId:
DEV2}]}` ⟹ 422 `GROUP_REQUEST.TOO_FEW_LINES {min:2}`; với DEV2+DEV3 ⟹ 201, ENGH duyệt dòng `POST …/line-need-decisions`; ENGH
gửi nhóm cho DEV1+DEV3 (cùng phòng) ⟹ vào `AWAITING_SPEND_SUBMISSION` ngay (#19); trình ⟹ duyệt ⟹ IT cấp từng dòng
`POST /provisioning-tasks {requestId, beneficiaryEmployeeId}`; mỗi dòng `expected_end_date` = ngày duyệt + 3 tháng − 1. DEV2 (người
gửi, không phải trưởng phòng) `GET /access-requests/{id}/lines` ⟹ dòng DEV3 `cost`/`expectedEndDate` = `null`. Item #4 #19 #20.

**F1-09 Tiếp tục sử dụng và cửa sổ 30 ngày `@MF1 @B3` (mốc)**

| #   | Vai  | Gọi                                                                                          | Mong đợi                                                        | Item    |
| --- | ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| 1   | DEV3 | `POST /access-requests/renewals {assignmentId:<3 tháng>, extensionMonths:1, businessReason}` | 422 `RENEWAL_REQUEST.WINDOW_NOT_OPEN {opensOn}`                 | #21     |
| 2   | ENGH | cùng body cho quyền của DEV3                                                                 | 403 `RENEWAL_REQUEST.NOT_HOLDER`                                | #4      |
| 3   | DEV3 | body có `newExpectedEndDate`                                                                 | 422 `VALIDATION_ERROR`                                          | #21     |
| 4   | DEV3 | quyền K1 1 tháng (cửa sổ mở ở D0) `extensionMonths:2` → duyệt nhu cầu/chi                    | `AWAITING_EXECUTION`; `grantQueueList` dòng `RENEWAL`           | #21     |
| 5   | IT   | `POST /access-requests/{id}/renewal-extension {evidence}`                                    | 200 `COMPLETED`; Assignment kế tiếp tới `previousEnd + 2 tháng` | #21     |
| 6   | DEV3 | quyền K2 1 tháng (jira, tạo ở D0) `extensionMonths:1` → duyệt nhu cầu/chi                    | `COMPLETED` tự áp; IT nhận `RENEWAL_APPROVED_SHARED_PLAN`       | #21 #22 |
| 7   | —    | `jumpTo(opensOn của quyền 3 tháng)`; `sweep('expiry')` hai lần                               | `RENEWAL_WINDOW_OPEN` cho DEV3 + ENGH đúng 1 lần                | #21     |

**F1-10 SLA nhắc người giữ bước `@MF1 @B1` (mốc)**: R3 đang `PENDING` ở ENGH; `jumpWorkingDays(2)` ⟹ `sweep('sla')` không
nhắc; `jumpWorkingDays(1)` ⟹ `sweep('sla')` ⟹ nhắc ENGH + người yêu cầu DEV3, **không** báo cấp trên/SA, không
`STEP_SLA_ESCALATION`; chạy lại không thêm dòng. Item #5.

**F1-11 IT đánh giá phần mềm mới `@MF1 @B2`**: R8; IT `PUT /access-requests/{id}/assessment` báo giá `termMonths:13` ⟹
`POST …/assessment/completion` 422 `ASSESSMENT.TERM_BEYOND_LIMIT`; sửa 12 ⟹ 200, Request về hàng đợi trình của trưởng phòng.
Item #15, B0.

**F1-12 Bản ghi v3 đi tiếp `@MF1 @B4`**: R10 (MKT nhóm, cần xác nhận) — MKTH xác nhận + lý do ⟹ CEO duyệt; R12 `OVER_RESERVE`
và R9 `NO_ACTIVE_BUDGET` không có bước chi; R13 đã kéo dài R1; R15 ở `grant-queue` `RENEWAL`; R16 `expected_end_date` =
`contractEndDate` của CTR1. Item #28 (+ #7 #19 #20 #21).

## 4. MF-2 — nghỉ việc (`mf2-offboarding`)

**F2-01 Có ngày cuối: tự chặn hết ngày cuối, không bấm "đã nghỉ" `@MF2 @B2` (mốc)**

| #   | Vai  | Gọi / đồng hồ                                                                                                                                               | Mong đợi                                      | DB / thông báo                                                                 | Item      |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| 1   | SA   | `POST /offboarding-cases {employeeId:DEV2, lastWorkingDay:D0+3wd, blockMode:WITH_LAST_DAY, grounds{type,reference,issuer,issuedOn}, successor:{kind:NONE}}` | 201 `HANDING_OVER`                            | `offboarding_cases.block_mode`; `employee_access_blocks.blocked_from` = lwd+1  | #2 #3 #24 |
| 2   | IT   | `GET /offboarding-cases/{id}/rights` → `POST …/revocations {assignmentIds}`                                                                                 | 201; không cần `count`                        | `provisioning_tasks.due_on` = lwd + N wd, `not_before` NULL; nguồn `DEPARTURE` | #1 #24    |
| 3   | ENGH | `GET /handover-duties` → `POST /handover-duties/{id}/confirmations {value:HANDED_OVER}`                                                                     | 200                                           | `handover_duties` đóng                                                         | B0        |
| 4   | —    | `jumpTo(lwd)`; `sweep('offboardingBlock')`; DEV2 login                                                                                                      | 200 (còn trong ngày cuối)                     | không chặn                                                                     | #2        |
| 5   | —    | `jumpTo(lwd+1 wd)`; `sweep('offboardingBlock')`                                                                                                             | —                                             | `auth_sessions.revoked_reason = ACCESS_BLOCKED`; Audit hệ thống                | #2        |
| 6   | DEV2 | login; refresh bằng token cũ; `GET /me` bằng access token cũ                                                                                                | 401 `AUTH.INVALID_CREDENTIALS` (lỗi chung) ×3 | không ghi `departure`                                                          | #2        |
| 7   | IT   | `POST …/account-lock {note}` (chưa `LEFT`)                                                                                                                  | 200                                           | change `ACCOUNT_LOCK_RECORDED`                                                 | #2        |

**F2-02 Chặn ngay với ngày cuối tương lai `@MF2 @B1` (mốc)**: SA `POST /offboarding-cases {employeeId:DEV3,
lastWorkingDay:D0+5wd, blockMode:BLOCK_NOW, grounds}` ⟹ 201 `HANDING_OVER`; request kế tiếp của DEV3 bằng token đang có ⟹ 401;
tác vụ nguồn `ABRUPT_DEPARTURE`, `due_on` = D0 + N wd. Gửi `abrupt:true` ⟹ 422 `VALIDATION_ERROR`. IT không khóa:
`jumpTo(D0+1 wd)`, `sweep('offboardingBlock')` ×2 ⟹ `ACCOUNT_LOCK_OVERDUE` tới ITA phụ trách + SA đúng 1 lần. Item #1 #3.

**F2-03 Hủy sau ngày cuối giữ chặn, gỡ lý do thu hồi `@MF2 @B2` (mốc)**: hồ sơ DEV1 lwd = D0; IT mở thu hồi hai quyền, claim
một (`IN_PROGRESS`); `jumpTo(D0+1 wd)`, `sweep('offboardingBlock')`; SA `POST /app-users/{id}/unlock {reason}` ⟹ 409
`ACCESS_BLOCK_NOT_RELEASABLE`; SA `POST /offboarding-cases/{id}/cancellation {reason, grounds}` ⟹ 200 `CANCELLED`; DEV1 login
vẫn 401; tác vụ `QUEUED` ⟹ `CANCELLED` `close_reason NO_LONGER_APPLIES`, `provisioning_task_reasons.withdrawn_at` đặt; tác vụ
`IN_PROGRESS` giữ + `REVOCATION_NO_LONGER_APPLIES` tới người làm; `license_assignments` không đổi; SA unlock ⟹ 200, login 200.
Item #1 #2 #24.

**F2-04 Hủy trước ngày cuối `@MF2 @B1`**: lwd = D0+3wd, hủy ở D0 ⟹ dòng chặn bị xóa, tác vụ chưa làm `CANCELLED`, login 200. #1 #2.

**F2-05 Từ chối `@MF2 @B2`**: IT `POST /offboarding-cases` ⟹ 403; SA ghi hồ sơ cho chính mình ⟹ 403
`PERSONNEL.SELF_CHANGE_FORBIDDEN`; thiếu `grounds` ⟹ 422 `VALIDATION_ERROR`; `POST …/departure` trước lwd ⟹ 409
`LAST_WORKING_DAY_AHEAD`; `departedOn` ⟹ 422; mở thu hồi khi không còn quyền ⟹ 409 `NOTHING_TO_REVOKE`; `closure` khi còn tác
vụ ⟹ 409. Item #3 #24, B0.

**F2-06 Đóng hồ sơ, seat về pool, quá hạn thu hồi `@MF2 @B2` (mốc)**: tiếp F2-01: `jumpTo(due_on + 1 wd)`,
`sweep('revocationOverdue')` ×2 ⟹ `REVOCATION_OVERDUE` 1 lần; IT `/claim` ⟹ `/revocation-completion {completion:ACCOUNT_REMOVED,
evidence}`; SA `POST …/departure {}` ⟹ `LEFT`, `left_on` = lwd; SA `POST …/closure` ⟹ `CLOSED`; `license_assignments.ended_on`
đặt, `seat-usage.occupied` −1. Item #1 #3, B0.

**F2-07 BM-09 tới hồ sơ `@MF2 @B2` (mốc)**: ENGH `POST /personnel-notices {kind:DEPARTURE, employeeId, …}`; `jumpWorkingDays(3)`,
`sweep('noticeOverdue')` ⟹ nhắc SA; SA `POST /personnel-notices/{id}/recording {blockMode?, grounds}` ⟹ hồ sơ `HANDING_OVER`,
notice `RECORDED`. Item #3 #24, B0.

## 5. MF-3 — điều chuyển (`mf3-transfer`)

| ID    | Tag       | Bước chính (vai · gọi · mong đợi)                                                                                                                                                                                                                                                                                                            | DB / thông báo kiểm                                                                                                                                                                  | Item       |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| F3-01 | `@B3`     | SA `POST /department-transfers {employeeId:DEV1, toDepartmentId:SAL, effectiveOn:D0, grounds}` ⟹ 201; SALH `GET /transfer-reviews/{id}/items`; `POST …/decisions {assignmentId:<jira>, decision:STILL_NEEDED, reason, termMonths:1}` ⟹ 200 `replacementRequest`; SALH `POST /spend-batches` ⟹ `WITHIN_BASE`; CEO duyệt; IT cấp từ `jira-sal` | `access_requests.replaces_assignment_id`, need step `APPROVED`; `transfer_review_items.replacement_request_id`; sau cấp: tác vụ thu hồi seat cũ mở; IT hoàn tất ⟹ seat `jira-eng` −1 | #17 #18 #6 |
| F3-02 | `@B3`     | SALH `decision:NOT_NEEDED, reason` ⟹ 200; tác vụ thu hồi mở                                                                                                                                                                                                                                                                                  | `transfer_review_items.revocation_task_id`; (chặn thực thi trước hết chồng lấn = **BLOCKER H6**)                                                                                     | #17 #18    |
| F3-03 | `@B1` mốc | Không ai quyết. Trước `dueOn − 2 wd`: `sweep('transferReview')` không đổi. `jumpTo(dueOn − 2 wd)` ⟹ sweep ⟹ `TRANSFER_REVIEW_DEFAULT_REVOCATION_NOTICE` tới SALH + IT, `defaultRevocationAfter` trên `GET`. `jumpTo(max(dueOn, noticed+2wd) + 1 wd)` ⟹ sweep ×2                                                                              | `default_noticed_on`; items `DEFAULT_REVOKED`, `revocation_task_id`; tác vụ `created_by_system`; Audit actor `SYSTEM`; review `COMPLETED`; lần sweep 2 không thêm                    | #18 #1     |
| F3-04 | `@B1` mốc | Phòng `FLW` không trưởng phòng; điều chuyển tới `FLW` ⟹ review `dueOn:null`, `waitingReason:NO_HEAD`; sweep ⟹ `TRANSFER_REVIEW_WAITING_FOR_HEAD` tới SA; SA `POST /departments/{id}/head-assignments` (D0); sweep ⟹ `dueOn` đặt, `TRANSFER_REVIEW.DEADLINE_STARTED`                                                                          | `transfer_reviews.due_on`, `no_head_alerted_on`                                                                                                                                      | #18        |
| F3-05 | `@B3`     | `decision:NEEDS_NEW_TOOL` ⟹ 422; `newToolNote` ⟹ 422; `termMonths` với `NOT_NEEDED` ⟹ 422; ENGH (trưởng phòng cũ) quyết ⟹ 403/404; IT quyết ⟹ 403; đổi `STILL_NEEDED → NOT_NEEDED` khi đã có Request thay thế ⟹ 409 `TRANSFER_REVIEW.REPLACEMENT_REQUEST_OPEN`; SA ghi điều chuyển của chính mình ⟹ 403                                      | số dòng `transfer_review_items` đã quyết không đổi                                                                                                                                   | #17 #18    |

## 6. MF-4 — ngân sách năm (`mf4-budget`)

| ID    | Tag   | Bước chính                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DB / kiểm                                                              | Item       |
| ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| F4-01 | `@B2` | DESH `POST /budget-proposals/attachments` → PUT bytes (FakeObjectStorage) → `POST /budget-attachments/{id}/complete` → `POST /budget-proposals {year, lines:[{description, amount:{amount}}], attachmentIds}` (không `costCenterId`); FIN1 `POST /budget-versions {proposalId, base:{amount}}` (không `reserve`) ⟹ `reservePercent:10`, `reserve` = 10 %; FIN1 `POST …/submission`; CEO `POST …/decision {decision:APPROVE}`; DESH `GET /budgets/mine` thấy `base/reserve/remaining`; DESH trình lại Request DES2 ⟹ `WITHIN_BASE` | `budget_versions.reserve_percent`, `state`; `budgets/mine` không 0 giả | #14 #8 #6  |
| F4-02 | `@B2` | FIN1 `PUT /budget-versions/{id} {reserve ≠ 10 %}` rồi gửi không lý do ⟹ 422 `BUDGET.RESERVE_REASON_REQUIRED`; có `reserveReason` ⟹ gửi được; CEO `REQUEST_CHANGES {reason}` ⟹ `CHANGES_REQUESTED`; FIN1 sửa, gửi lại; CEO `REJECT {reason}` ở phiên bản khác                                                                                                                                                                                                                                                                      | `reserve_reason`; lịch sử phiên bản                                    | #14        |
| F4-03 | `@B2` | `POST /budget-versions/revisions` ⟹ 404; `highValuePercent` ⟹ 422; FIN1 `POST …/decision` ⟹ 403; DESH `GET` ngân sách phòng SAL ⟹ 403/404; Request 12 tháng duyệt ở D0 tạo cam kết năm sau; FIN1 lập phiên bản năm sau `base` < cam kết chuyển tiếp, CEO duyệt ⟹ 409 `BUDGET.BASE_BELOW_CARRY_FORWARD`, phiên bản vẫn `SENT`                                                                                                                                                                                                      | `budget_commitments.unattached_reason = CARRY_FORWARD`                 | #13 #14 #6 |

## 7. MF-5 — usage → thu hồi → điều chỉnh thuê bao (`mf5-rightsizing`)

| ID    | Tag   | Bước chính                                                                                                                                                                                                                                                                                                                                           | Kiểm                                                                                              | Item / trạng thái                                                          |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| F5-01 | `@B5` | IT tạo thuê bao TERM (ND = D0+95, ngày ở **kỳ thuê bao** là input hợp lệ); `jumpTo(ND−90/−60/−30/−7)`, `sweep('renewal')` mỗi mốc ×2                                                                                                                                                                                                                 | sự kiện/thông báo mỗi mốc 1 lần; người nhận không có CEO/SA                                       | sweep có (B0); người nhận theo vai = #10 **BLOCKER**                       |
| F5-02 | `@B5` | IT `POST /subscription-renewals` (giảm, danh sách seat thu hồi); **ENGH** (trưởng phòng sở hữu) `POST /subscription-renewals/{id}/decision {decision:CONFIRM, reason}` ⟹ 200; CEO cùng route ⟹ 403; body cũ `choice`/`quantity` ⟹ 422; IT `POST …/outcome`                                                                                           | `deciderRole = OWNER_DEPARTMENT_HEAD`; tác vụ thu hồi seat đã chọn; IT + Finance nhận `…_DECIDED` | #9 `qd96-100-subscription-owner-confirmation` (spec draft, chưa implement) |
| F5-03 | `@B5` | IT `POST /usage-sources`, `POST /usage-imports`, `POST /usage-tracking-notices`, `POST /usage-imports/{id}/confirmations {previewVersion, idempotencyKey}` (gửi lại cùng key ⟹ cùng kết quả); `GET /ghost-seat-recommendations`; ENGH `POST /ghost-seat-recommendations/{id}/decisions {decision:RECLAIM, reason}`; sau 7 ngày (`jumpTo`) IT thu hồi | G1/G2/G3/G4; `usage_records`; không dữ liệu ⟹ không kết luận "không dùng"                         | **BLOCKER** (S3a/S4a spec ready chưa implement; S4b chưa có spec)          |

## 8. F0 và BLOCKER

**F0-01 Đăng nhập theo vai `@B0`**: mỗi vai `POST /auth/login` ⟹ 200; `POST /auth/refresh` ⟹ token mới, refresh cũ ⟹ 401; mỗi
vai gọi một route không thuộc vai ⟹ 403; tài khoản `INVITED` login ⟹ 401.

| Bước MF          | Thiếu gì                                                              | Chủ                                                    | Ảnh hưởng                        |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| 1.9              | chuyển seat kèm chi phí, giữ seat, cấm mua khi còn seat cùng gói      | `H2` (hoãn)                                            | MF-1 thiếu nhánh chọn nguồn seat |
| 1.10/2.9         | cấp/thu hồi K4                                                        | `a05-k4-*`                                             | không kịch bản K4                |
| 1.1              | tiếp tục nhóm, tăng cấp, hợp thức hóa                                 | `H4` (hoãn)                                            | MF-1 thiếu ba loại Request       |
| 2.7              | thu hồi credential thiết bị khi chặn                                  | `g7-device-registry-acknowledgement` + S1b (chưa spec) | F2-01 chỉ kiểm đăng nhập         |
| 3.2/3.5/3.9      | nhãn T1–T4, chồng lấn 5 ngày, chặn thực thi sớm                       | `H6` (hoãn)                                            | F3-02 không kiểm chồng lấn       |
| 3.7              | hạn 10 ngày làm việc cho Request thay thế bị chặn                     | `H6` / `QĐ-99b`                                        | F3-01 chỉ nhánh trong số cơ sở   |
| 4.1–4.4, 4.5/4.6 | lịch B0, baseline B1, phong bì B2, chỉ tiêu B3; loại dòng/ưu tiên/ZBB | `H1` (hoãn)                                            | MF-4 chỉ chạy B4→B7              |
| 4.11             | đóng năm cần ghi ở ngày tương lai (OQ-E2E-2)                          | suite                                                  | không kịch bản đóng năm          |
| 5.2–5.5          | usage import, danh tính, G1–G4, quyết ghost seat, thu hồi sau ân hạn  | `g7-*` (S3a, S4a ready; S4b chưa spec)                 | F5-03                            |
| 5.1, 5.6         | mốc ND theo vai người nhận, tổng hợp nhu cầu ND−60                    | #10 (chat MF-5, chưa có spec trong repo)               | F5-01 chỉ kiểm sự kiện/mốc       |
| 5.10/5.11        | đóng thuê bao đủ ba điều kiện; hóa đơn, tiết kiệm thực                | `H3`, `H7`                                             | không kịch bản                   |

Tổng: 31 kịch bản — F0: 1 · MF-1: 12 · MF-2: 7 · MF-3: 5 · MF-4: 3 · MF-5: 3 (F5-02 chờ #9; F5-03 hiện là BLOCKER toàn phần).
