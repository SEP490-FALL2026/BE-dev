# A2-DONE — P5-A2 (sửa lỗi + email + collector + tham số + thông báo + phạm vi IT)

Chat `SEP-Start 85: P5-A2 fixes` · nhánh `feat/p5-a2-fixes` (từ `dev` @ `94a8ee84`) · worktree `D:\FPT\FALL2026\Code\be-p5-a2` · 17/11/2026 (đêm).
Spec: `BE-dev-software-license-management/docs/reviews/p5-2026-11-17/SPEC-5A-FIXES.md`. Audit lõi: `AUDIT-A2-core-1-review.md`, `AUDIT-A2-core-2-review.md`.

## 1. Skill đã dùng

Điều phối (chat này), đọc `SKILL.md` trước khi làm:
- `superpowers:subagent-driven-development`: process, mỗi task một subagent Sonnet, chạy tuần tự (cùng worktree + cùng DB test), review diff sau mỗi task.
- `superpowers:test-driven-development`: đỏ trước, xanh sau; ghi lại lần đỏ thật.
- `superpowers:systematic-debugging`: đọc log CI đỏ (run 43968705433) tìm nguyên nhân gốc trước khi sửa (3 test, không chỉ R-1).
- `superpowers:verification-before-completion`: chỉ báo điều đã chạy; đã tự chạy lại tsc, spec serial, 3 spec http platform.
- `agent-skills:context-engineering`: chọn đọc đúng đoạn spec cho từng task.
Subagent: nạp `superpowers:test-driven-development` + `superpowers:verification-before-completion` (FX-T1, T2, T7, T3a: làm theo quy trình TDD ghi trong preamble nhưng không gọi Skill — từ FX-T3b trở đi đều gọi Skill).

## 2. Task → commit → kết quả

Mọi lệnh dưới đây là **kiểm nhanh local** theo chỉ đạo điều phối 123 (Owner 17/11 đêm): typecheck, `npx eslint` trên file đổi, unit liên quan, integration các file chạm (`--maxWorkers=1`, DB `slm-p5-a2` cổng 35442), `test:gates`, `arch:check`, `arch:docs:check` khi đổi graph, `openapi:export` khi đổi OpenAPI. **Không** chạy `test:http` toàn bộ, integration toàn bộ, `pnpm lint` toàn repo, `pnpm check`, `test:flows` ở local (CI chạy).

| Task | Commit | Nội dung | Kiểm local (thật) |
| ---- | ------ | -------- | ----------------- |
| FX-T1 | `8eda00c2` | 2 lỗi cam kết ngân sách ⟹ 409 ở `spendApprovalDecide`/`spendApprovalLineDecide`; `spendBatchDecide` bỏ qua mục với `COMMITMENT_NOT_HOLDABLE`; lớp lỗi chuyển sang `budgets/public` | unit đỏ→xanh 7/7; `requests`+`budgets` 130 suite xanh; gates, arch xanh |
| FX-T2 | `bb664564` | filter chung: `TransientDatabaseError`/lỗi driver tạm ⟹ 503 + log warn kèm `requestId` | unit 71/71 (đỏ trước 2); gates, arch xanh |
| FX-T7 | `3ad9439f` | tạo tài khoản luôn lưu `workEmail`; `loginEmail` khác ⟹ 422 `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`; field deprecated | unit đỏ→xanh; integration `account-creation-http` đỏ 2→xanh; `employee-manual-http` 64 test xanh; `shared-demo-v4.spec` xanh |
| FX-T3a | `ee3cee73` | B1 `STEP_ASSIGNED cause RESUBMITTED`; B4 trưởng phòng tự đề xuất phần mềm ⟹ IT nhận 1 lần | unit đỏ 3→xanh; `request-status-notifications` đỏ 3→xanh 21/21 |
| FX-T3b | `a304b0ce` | B2 `SPEND_BATCH_SUBMITTED` một thông báo mỗi lô (Q-5A-1 = B) + `STEP_ASSIGNED cause SPEND_SENT`; B3 `PRICE_MISSING` ⟹ `REQUEST_BUDGET_BLOCKED` | unit đỏ 4→xanh; integration mới đỏ 3/7→xanh 7/7; 9 file integration chạm luồng xanh (116 test) |
| FX-T8 | `8a3e32e3` | allowlist theo ngày: bỏ riêng tool ngoài allowlist của ngày; `COLLECTOR_UNLISTED` so với bản hiện hành | unit đỏ→xanh; `usage-intake` đỏ→xanh 12/12 |
| FX-T9a | `6d1bad22` | 3 route dừng thu thập (`myDeviceStopRequestCreate`, `deviceStopRequestList`, `deviceStopRequestComplete`); `setCollectionStopped` một `UPDATE` | unit 6/6; integration mới đỏ 9/9→xanh; đột biến CHECK `one_projection` ⟹ 5 ca đỏ (đã gỡ) |
| FX-T9b | `6de273f9` | đăng ký kết thúc ⟹ yêu cầu `OPEN` thành `INVALID REGISTRATION_ENDED`; `stopRequestPending`; TS-11 (không sửa `setAcknowledged`) | `devices-stop-request`+`acknowledgement` 21/21; `registrations`/`register`/`credential-lifecycle` 30/30 |
| FX-T10 | `7d8586d5` | gỡ 2 tham số ZBB; migration `20261117100000_drop_zbb_parameters` (chỉ dữ liệu, chạy lại được) | unit đỏ 3→xanh; `operating-parameters-http` 28/28 (2 lần); `budget-cycle-lifecycle` 19/19 |
| FX-T6a | `4e83e3d4` | QĐ-111ax: `ghostSeatRecommendationGet` ngoài phạm vi ⟹ 404; `ghostSeatExemptionList` lọc theo phòng | integration mới đỏ 2/2→xanh; 9 file optimization xanh; `ghost-seat-g2-reclaim` sửa (test cũ đỏ vì luật mới) |
| R-1 | `76da5799` | manifest mã lỗi OpenAPI thiếu 3 mã (audit A2) | `openapi-response-examples.http-spec` 7/7 |
| (CI fix) | `9bf97f30` | `api-coverage-manifest.ts` thiếu 3 operation + số operation 423→426 | `api-inventory` + `openapi-presentation` 26/26 |
| O5 | `35dd83f1` | module card `devices`, `usage` | `rules:check` 0 lỗi |
| FX-T6b | `e678ecb7` | QĐ-111ax: `usageIdentityMappingList`, `usageNoAssignmentFindingList` lọc theo phòng (`usageUnmatchedIdentityList` giữ — Q-5A-2 = A) | integration mới đỏ 4/5→xanh 5/5; usage 18 suite xanh |
| FX-T6c | `aa8200f9` | QĐ-111ax: `deviceUsageList`, `deviceToolStatusList` lọc theo đăng ký thuộc phạm vi IT | integration mới đỏ→xanh 5/5; `usage-intake` 12/12; 3 spec http platform 55/55 |
| FX-T4a | `833f79e5` | `SAAS_ISSUE_SUBMITTED`, `SAAS_ISSUE_RESPONSE_OVERDUE` (+ khai `SAAS_ISSUE_STATE_CHANGED`) | integration mới đỏ 4→xanh 6/6; saas-issue cũ xanh; spec serial role runtime `database-runtime-role-saas-issue-write` 3/3 (chạy tay với `TEST_DATABASE_BOOTSTRAP_URL`) |
| FX-T4b | `c9c8b436` | phát `SAAS_ISSUE_STATE_CHANGED` theo 4 `trigger` | integration đỏ 6→xanh 13/13; 5 file saas-issue cũ xanh |
| FX-T5 | `8000ebeb` | `OUT_OF_PROCESS_CASE_REPORTED`, `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | integration mới đỏ 9→xanh 13/13; 6 file vendor-account/out-of-process/invoice-discrepancy cũ xanh |
| FX-T9c | `2bd191aa` | `DEVICE_STOP_REQUESTED`, `DEVICE_STOP_REQUEST_OVERDUE` + `StopRequestSweeper` mỗi giờ | `devices-stop-request` đỏ 5→xanh 18/18; `acknowledgement` 9/9 |
| FX-T11 | `43de386d` | xóa `DEPARTURE_MARKED_LEFT`; module card; `docs/generated` | typecheck, eslint 2 file personnel, `rules:check` 0 lỗi, prettier README, unit `personnel` 603 xanh, `test:gates` xanh, `arch:check`/`arch:docs:check` xanh |

## 3. CI GitHub

- Run `43968705433` @ `7d8586d5` (lõi): ĐỎ ở `http-contract` — 3 test: `openapi-response-examples` (R-1), `api-inventory` (3 operation chưa vào manifest), `openapi-presentation` (423→426). Các job khác xanh (`quality`, `e2e-smoke`, `integration-inband`, `integration (1..3)`).
- Run `43972137106` @ `9bf97f30`: XANH. Điều phối đã merge lõi vào `feat/p5` (`760cd22d`).
- Run sau cùng @ HEAD: Run `44000122752` @ `43de386d` (HEAD cuối, https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44000122752): lượt 1 ĐỎ ở `integration (1)` đúng một test (`vendor-import-confirm`, "two confirmations of the same import at once write once", dòng 285: `a`,`b` cùng khóa trả 409,409); các job khác xanh (`quality`, `http-contract`, `e2e-smoke`, `integration (2)`, `(3)`, `integration-inband`). Chạy lại local file đó: xanh 13/13. **Rerun job đỏ ⟹ XANH, toàn run `success`.** Nhận định: test phụ thuộc thứ tự (3 lời gọi song song, `c` không khóa có thể thắng cuộc đua ⟹ `a`,`b` cùng 409) — flaky, không phải hồi quy của A2 (xem Nợ test)

## 4. Quyết định tự chốt (D-n)

Chế độ đêm: tự chốt theo luật "an toàn, không trái QĐ", Owner duyệt sáng.

| D | Nội dung | Khuyến nghị / căn cứ |
| -- | -------- | -------------------- |
| D-1 (T1) | Spec đặt unit `requests/spend/spend.http-errors.spec.ts`; thư mục `requests/spend` đã đủ **25 file** (trần gate `module-layout`) ⟹ đặt ở `requests/spend-approval/spend-commitment-errors.spec.ts`. Nội dung test không đổi | Giữ. Chat B không thêm file vào `requests/spend/` |
| D-2 (T3b) | Logic ghi audit + thông báo lô nằm ở service mới `spend-submission/spend-batch-recorder.service.ts` (`SpendBatchRecorder`), không thẳng trong `SpendBatchService` (đã 8 tham số constructor = trần `max-params`). Hành vi đúng spec | Giữ |
| D-3 (T3b) | Integration viết ở file mới `test/integration/requests/spend-batch-notifications.integration-spec.ts`, không thêm vào `spend-batches.integration-spec.ts` | Giữ |
| D-4 (T3b) | `docs/generated/module-graph.md` sinh lại ở commit này nên chứa cả cạnh `requests→budgets` 30→32 của FX-T1 (4 commit giữa `8eda00c2`…`ee3cee73` có `arch:docs:check` đỏ — HEAD đúng; bisect nhiễu) | Ghi nhận. Lần sau chạy `pnpm arch:graph` ở mỗi task đổi import liên module |
| D-5 (T9a) | `devices` gọi `OperatingParametersApi.getNonWorkingDates` (cửa sổ today..+30 ngày) để tính `dueAt` 2 ngày làm việc; tầng `operating-parameters` (T3) thấp hơn `devices` (T4), `arch:check` xanh | Giữ |
| D-6 (T9a) | Mapper `stopRequest` dùng `dueAt ?? requestedAt` (cột `due_at` nullable trong DB, mọi writer đều ghi) | Giữ |
| D-7 (T9a) | Hoàn tất yêu cầu khi đăng ký đã kết thúc ⟹ ghi `INVALID REGISTRATION_ENDED` rồi trả 409 `NOT_OPEN` (`details.state = 'INVALID'`), không audit riêng | Giữ; sau FX-T9b nhánh này gần như không chạy tới (defensive) |
| D-8 (T9a) | Body `{}` strict khai bằng `@Body() _body` đầu tham số handler để qua rule `no-unused-vars` (tiền lệ `device-session.controller`) | Giữ |
| **O1 (T9b)** | `handled_at` của yêu cầu bị đóng vì đăng ký kết thúc lấy **mốc kết thúc của đăng ký** (`input.at` của `RegistrationEndService.end`), **không** `now` như spec §E1. Có thể sớm hơn `requested_at` khi sweep chặn chạy muộn hơn mốc (người giữ gửi yêu cầu trong khoảng giữa) ⟹ `handled_at - requested_at` âm ở báo cáo/SLA | **Cần Owner/4b chọn**: đổi `handled_at = GREATEST(at, requested_at)` trong `registry.repo.ts invalidateOpenStopRequests`, hoặc truyền `now`. Không vi phạm CHECK nào. Chưa sửa |
| D-9 (T8) | `COLLECTOR_UNLISTED` chỉ xét các ngày có `reason` null, `NOT_IN_ALLOWLIST`, `INVALID_COVERAGE`; ngày bị từ chối trước khi xét công cụ (`OUTSIDE_WINDOW`, `FUTURE_GENERATED_AT`) không báo — như cũ | Giữ |
| D-10 (T8) | Hệ quả của luật spec: công cụ **vừa bị gỡ** khỏi allowlist (vd `ANTIGRAVITY_CLI` ở v3) mà tool vẫn gửi ⟹ ngày vẫn `ACCEPTED` nhưng sinh mục `COLLECTOR_UNLISTED` (trước đây không). Audit O4 | Giữ theo spec; nếu Owner muốn bỏ thì đổi điều kiện thành "không có trong allowlist của ngày **và** bản hiện hành" |
| D-11 (T6a) | `ghostSeatExemptionList` với IT có phạm vi rỗng ⟹ trang rỗng (kể cả miễn trừ `departmentId` null); `ghostSeatRecommendationGet` và list khuyến nghị vẫn cho bản ghi `departmentId` null | Giữ (phạm vi rỗng gần như không xảy ra) |
| D-12 (T6b) | Phạm vi mapping/finding lấy theo `peopleOf(actor)` = người đang xếp phòng trong phạm vi; người đã nghỉ (không còn xếp phòng) không hiện, kể cả khi lọc `employeeId`. `usageNoAssignmentFindingList` không có query `employeeId` nên không thêm param | Giữ (khớp chữ spec, không đổi hợp đồng) |
| D-13 (T6c) | Bộ lọc đặt ở `UsageOverviewScopeService.registrationIdsOfDevice` (một nơi) thay vì lặp trong 2 query service; `UsageOverviewScopeService` inject `DevicesApi` | Giữ |
| D-14 (T4a) | `applicationId` của `SAAS_ISSUE_SUBMITTED` lấy qua `CatalogApi.getPlanSummaries` trong notifier (repo `licensing` không đọc bảng `plans`) | Giữ |
| D-15 (T4b) | "IT đổi trạng thái" hiểu là mọi transition ⟹ cả `NEW→IN_PROGRESS` báo người báo | Giữ |
| D-16 (T5) | Thêm `CatalogApi.getApplicationResponsibleItAdminId` (ngoài danh sách file của task) vì `CatalogEntry` không mang IT chịu trách nhiệm | Giữ |
| D-17 (T5) | `source` của `VENDOR_ACCOUNT_DISCREPANCY_OPENED` = loại lô (`USAGE_IMPORT`/`INVOICE_DIFFERENCE`/`COLLECTOR_UNLISTED`), không phải `VendorAccountSource` của từng dòng (một lần nhập trộn `NO_ASSIGNMENT` + `UNMATCHED_IDENTITY`); eventKey `…:{source}:{importId|caseId|ngày}` | Giữ. 5b dùng nhãn enum theo `source` này |
| D-18 (T5) | `OUT_OF_PROCESS_CASE_REPORTED` không loại người đóng hồ sơ; người dùng đồng thời là trưởng phòng ⟹ một thông báo | Giữ |
| D-19 (T9c) | IT phụ trách phòng chính là người giữ ⟹ vẫn rơi về mọi IT dùng được khác (mẫu `department-software-notice` đứng một mình sẽ không ai nhận); luôn loại người giữ | Giữ |
| D-20 (T9c) | `StopRequestSweeper` là provider của `DevicesModule` (graph API), không thêm vào worker — mọi `*Sweeper` trong repo chạy ở graph API; sửa thêm `test/support/flows/flow-template.ts` (`SWEEPER_OVERRIDES`) và `docs/rules/security-jobs.md` (repo bắt buộc) | Giữ |
| D-21 (A2-12) | Owner chốt KHÔNG làm: `ghostSeatOptimizationSummaryGet`, `ghostSeatRuleSkipList` chưa lọc theo phòng — để 4b | — |
| D-22 (FX-T7) | CHANGELOG FE (§1.D nhắc "bỏ ô loginEmail; gửi thì phải bằng workEmail; bản sau gỡ field") chưa viết — thuộc điều phối (`changes/<ngày>-prompt5.md`) | Xem mục Breaking FE |

Ghi chú tiến trình: A2 bị ngắt hai lần vì hạn mức token (khoảng 02:10 và 07:10 giờ VN) và máy tải nặng (nhiều tiến trình eslint/jest), nên mốc lõi trễ ~2 giờ. Một tiến trình jest mồ côi (PID 16840, từ lượt FX-T7) có thể còn giữ một kết nối tới DB test `slm-p5-a2`; vô hại, dọn tay nếu cần.

## 5. Thông báo mới cho 5b (chỉ phần lệch/đáng chú ý so với bảng §1.B của spec)

Code khớp bảng bàn giao §1.B. Người nhận THỰC TẾ trong code:

| Mã | Phát khi | Người nhận | params | subject / eventKey |
| -- | -------- | ---------- | ------ | ------------------ |
| `SPEND_BATCH_SUBMITTED` | `SpendBatchRecorder` trong transaction trình lô, ≥ 1 bước duyệt chi mở cho người giữ | Người duyệt chi giữ bước (khử trùng, bỏ người trình, bỏ bước chờ không có người giữ) | `batchId, departmentId, sentCount` (số bước mở cho người nhận này) | `SPEND_BATCH` / `SPEND_BATCH_SUBMITTED:{batchId}` |
| `STEP_ASSIGNED` `cause=RESUBMITTED` | audit `ACCESS_REQUEST.RESUBMITTED` | `IT_ASSESSMENT`: `facts.assessmentHolderEmployeeId`; ngược lại từng người giữ bước nhu cầu mở lại | không đổi (`requestId, stepKind, cause`) | `ACCESS_REQUEST` |
| `STEP_ASSIGNED` `cause=SPEND_SENT` | `RESERVE_CONFIRMED` với `via CONFIRMATION`; `BUDGET_CHECKED` `VIA_HEAD`+`trigger RESERVE_CONFIRMATION`+`opened SPEND_APPROVAL` | `spendAssigneeEmployeeId` | không đổi | `ACCESS_REQUEST` |
| `STEP_ASSIGNED` `cause=SUBMITTED` (B4) | `ASSESSMENT_REQUESTED` với `routingMode ONE_STEP` | IT giữ bước đánh giá (`itAdminEmployeeId`) | không đổi | `ACCESS_REQUEST`. Cũng phát ở đường chuyển một bước (`finishConversion`) — audit O-3: nhãn `cause SUBMITTED` có thể gây hiểu nhầm, hành vi báo IT là đúng |
| `REQUEST_BUDGET_BLOCKED` (B3) | audit mới `ACCESS_REQUEST.SPEND_NOT_CHECKABLE` (`PRICE_MISSING`, `VIA_HEAD`) | người xin + IT phụ trách (trưởng phòng là người trình, bị loại) | `requestId, reasons` | `ACCESS_REQUEST` |
| `SAAS_ISSUE_SUBMITTED` | `submit` | IT được giao (bỏ nếu = người báo; `assignedByFallback` vẫn báo) | `issueId, issueCode, category, impact, applicationId` | `SAAS_ISSUE` / `SAAS_ISSUE_SUBMITTED:{issueId}` |
| `SAAS_ISSUE_RESPONSE_OVERDUE` | sweep `tell`, một lần | IT được giao | `issueId, issueCode, responseDueOn` | `SAAS_ISSUE` / `…:{issueId}` |
| `SAAS_ISSUE_STATE_CHANGED` | IT đổi trạng thái (`IT_ACTION`) · người báo trả lời (`REPORTER_REPLY`) / mở lại (`REPORTER_REOPEN`) · sweep đóng (`REOPEN_WINDOW_LAPSED`) | `IT_ACTION`, `REOPEN_WINDOW_LAPSED` ⟹ người báo; `REPORTER_REPLY`, `REPORTER_REOPEN` ⟹ IT được giao; bỏ người làm | `issueId, issueCode, fromState, toState, trigger` | `SAAS_ISSUE` / `…:{entryId}` (sweep `…:{issueId}:CLOSED`) |
| `OUT_OF_PROCESS_CASE_REPORTED` | đóng hồ sơ `REPORT_ONLY` | `discrepancy.employeeId` + trưởng phòng hôm nay của phòng cuối (người nghỉ vẫn được ghi); hồ sơ không gắn người ⟹ không ai | `caseId, applicationId, vendorId, employeeId` | `OUT_OF_PROCESS_CASE` / `…:{caseId}`. `target` null |
| `VENDOR_ACCOUNT_DISCREPANCY_OPENED` | một lần mỗi lần nhập có dòng sai lệch **mới** (`upsertMany` > 0) | IT chịu trách nhiệm ứng dụng còn dùng được; còn lại mọi IT dùng được | `applicationId` (null), `vendorId` (null), `source` (**loại lô**, D-17), `newCount` | subject null / `…:{source}:{importId\|caseId\|ngày}`. `target` = `vendorAccountDiscrepancyList` |
| `DEVICE_STOP_REQUESTED` | tạo yêu cầu `OPEN` (không phát cho `INVALID`) | IT phụ trách phòng người giữ, không có/không dùng được hoặc chính là người giữ ⟹ mọi IT dùng được; luôn loại người giữ | `stopRequestId, registrationId, deviceId, holderEmployeeId, dueAt, dueOn` | `DEVICE_STOP_REQUEST` / `…:{stopRequestId}`. `target` = `deviceStopRequestList` |
| `DEVICE_STOP_REQUEST_OVERDUE` | `StopRequestSweeper` mỗi giờ: `OPEN`, `dueAt < now`, chưa báo | như trên | như trên | `…:{stopRequestId}` |

Nhãn `cause` mới: `RESUBMITTED`, `SPEND_SENT` (Q-5A-1 = B). Câu 5b: bảng VI/EN ở SPEC-5A-FIXES §1.B dòng 198-213 vẫn đúng; `VENDOR_ACCOUNT_DISCREPANCY_OPENED` dùng `{source:enum}` với 3 giá trị ở D-17.

## 6. Breaking FE

1. **Danh sách usage/ghost seat của IT lọc theo phòng phụ trách (QĐ-111ax):** `ghostSeatExemptionList`, `usageIdentityMappingList`, `usageNoAssignmentFindingList`, `deviceUsageList`, `deviceToolStatusList` ⟹ IT ngoài phạm vi nhận **trang rỗng** (200, `totalItems 0`, không lỗi); `ghostSeatRecommendationGet` ngoài phạm vi ⟹ **404 `GHOST_SEAT.NOT_FOUND`**. Phòng chưa có IT: mọi IT vẫn thấy. `usageUnmatchedIdentityList` không đổi (Q-5A-2 = A). `ghostSeatOptimizationSummaryGet`, `ghostSeatRuleSkipList` chưa lọc (A2-12, 4b).
2. **`spendBatchDecide`:** `results[].reason` thêm `COMMITMENT_NOT_HOLDABLE`; `spendApprovalDecide`/`spendApprovalLineDecide` trả **409 `BUDGET.COMMITMENT_NOT_HOLDABLE`/`BUDGET.COMMITMENT_EXISTS`** thay 500.
3. **500 → 503 `SERVICE_UNAVAILABLE`** khi DB/kho tạm lỗi ở route chưa có mapper (`seatMonthChargeList`, `itAdminList`, `stockSummaryList`, `invoiceDiscrepancyList`, `purchaseInvoiceList`, `purchaseInvoiceMissingPeriodList`, `spendBatchList`, `outOfProcessCaseList`, `vendorAccountDiscrepancyList`, và mọi route khác rơi vào filter chung). FE coi 503 là "thử lại".
4. **`aiUsageBatchCreate` đổi nghĩa từng ngày:** ngày có công cụ chưa được phép ngày đó nay bỏ riêng công cụ đó và **nhận** phần còn lại; chỉ ngày bị bỏ hết mới `REJECTED NOT_IN_ALLOWLIST`. Shape không đổi.
5. **`appUserCreate`:** `loginEmail` luôn = `workEmail`; gửi khác ⟹ **422 `APP_USER.LOGIN_EMAIL_NOT_WORK_EMAIL`** (`details {field:'loginEmail'}`); field deprecated, bản sau gỡ; message `LOGIN_EMAIL_REQUIRED` đổi thành "The employee has no work email.". CHANGELOG FE: "bỏ ô loginEmail; gửi thì phải bằng workEmail; bản sau gỡ field".
6. **Tham số vận hành:** `BUDGET_ZBB_KPI3_BELOW_PERCENT`, `BUDGET_ZBB_PRICE_INCREASE_PERCENT` biến mất khỏi `operatingParameterList` (Finance chỉ còn `BUDGET_RESERVE_DEFAULT_PERCENT`).
7. **Thêm (không phá):** 3 route dừng thu thập (`POST /me/device-registrations/{id}/stop-requests`, `GET /device-stop-requests`, `POST /device-stop-requests/{id}/completion`; lỗi `DEVICE_REGISTRATION.NOT_FOUND`/`.ENDED`, `DEVICE_STOP_REQUEST.NOT_FOUND`/`.NOT_OPEN`); `GET /me/devices` thêm `stopRequestPending`; thông báo mới (§5); `STEP_ASSIGNED.cause` thêm `RESUBMITTED`, `SPEND_SENT`.
8. Số operation OpenAPI: 423 → **426**.

## 7. Số đếm tham số trên nhánh

`dev` 29 khóa; nhánh `feat/p5-a2-fixes` = **27** (A2 −2). Ba chỗ đã cập nhật:
- `src/modules/operating-parameters/parameter-definitions.policy.spec.ts` (tiêu đề "twenty-seven keys" + `EXPECTED_KEYS`),
- `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts` (`parameters.size` = 27),
- `test/support/api-collection-registry-exceptions.ts` (`maxItems` 22 → 27; 22 sai sẵn so với 29 khóa trên `dev`).
Chat điều phối cộng/trừ khi merge A1 (−1, +3 nếu S20-Q4 = A) và C (+1).

## 8. Nợ test · Nghi lỗi logic · Đã cắt / Chưa làm

- **Nợ test:** không có test cũ nào đỏ vì lý do không liên quan. Ghi nhận khoảng trống test (không phải test đỏ): (a) không có http-contract spec cho 3 route dừng thu thập (manifest đã có operation, test integration phủ hành vi); (b) không có unit/integration cho nhánh retry `23505` (`DeviceStopRequestOpenRaceError`) vì khóa chuỗi đăng ký làm hai lời gọi song song tự tuần tự — chỉ kiểm bằng đột biến tạm; (c) chưa có ca "người giữ là IT duy nhất dùng được thì không ai nhận" (harness luôn ≥ 3 IT); (e) **flaky đã gặp ở CI:** `test/integration/usage/vendor-import-confirm.integration-spec.ts` ca "two confirmations of the same import at once write once" (dòng ~270-288) đỏ một lần ở run 44000122752 (`a`,`b` 409 thay 200) rồi xanh khi rerun; ca bắn 3 lời gọi cùng lúc và giả định `c` (khác khóa) luôn về sau — nên đổi để bắt buộc `c` chạy sau (await `a` trước) hoặc kiểm đúng một trong ba thắng; chưa sửa (ngoài phạm vi, nợ test cho FIX-TEST); (d) audit O-2: chưa có http contract 409 cho `spendApprovalDecide`/`spendApprovalLineDecide` (chỉ unit mapper).
- **Nghi lỗi logic:** không có ngoài phạm vi. Hành vi đáng chú ý ở audit: O-1 (B1 đọc người giữ bước lúc chiếu, không lúc ghi sự kiện), O-3 (B4 cũng phát ở `finishConversion`, nhãn `cause SUBMITTED`), O1/D-9…D-10 ở trên.
- **Đã cắt:** không cắt task nào theo PLAN §5 — làm đủ FX-T1…T11.
- **Chưa làm / chuyển 4b:** A2-12 (Owner chốt); `ghostSeatQueueList` SoD-2; `QĐ-108g/108h`; audit riêng cho việc hệ thống đóng yêu cầu dừng (audit O2); `deviceStopRequestList` đếm + trang cùng snapshot `RepeatableRead` (audit O3, `docs/rules/api-contract.md:92`); "hiện trong cảnh báo nghẽn" của AC-5; mô tả OpenAPI `aiUsageBatchCreate` chưa nói rõ "bỏ im lặng" (audit N4); các Optional/Nit còn lại của `AUDIT-A2-core-1/2`.
- **Môi trường:** không chạy ở local: `pnpm check`, `pnpm lint` toàn repo, `test:http` toàn bộ, integration toàn bộ, `test:flows`, `seed:local` — CI GitHub/điều phối verify.

## 9. Sau audit phần sau lõi (`AUDIT-A2-post-review.md`, không Critical/Required) — đã làm và dời 4b

`feat/p5` @ `49f095a6` = cây `43de386d`, CI xanh. Điều phối giao thêm 3 mục nhỏ trên `feat/p5-a2-fixes` — commit `f462e3c5` (O-01), `e65e4662` (O-02), `28bea3f3` (O-05); CI run `44006915226` @ `28bea3f3` XANH toàn bộ (https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44006915226). D-23 (O-05, tự chốt): `caseReported` khóa `lockDepartmentShared` trước khi đọc trưởng phòng (mẫu `currentHeadOfLocked` của budgets) để thông báo không bị giữ mà không ai nhận khi trưởng phòng được bổ nhiệm đúng lúc. Nội dung: **O-01** (lọc `employeeId` mapping theo phòng cuối qua `peopleOf(actor, {employeeId})`, người đã nghỉ vẫn đọc được với IT phụ trách phòng cuối), **O-02** (sửa test flaky `vendor-import-confirm`: chấp nhận mọi bên thắng, vẫn khẳng định đúng một lần ghi và 409 cho bên thua), **O-05** (phòng chưa có trưởng phòng ⟹ `holdForDepartment` cho `OUT_OF_PROCESS_CASE_REPORTED`).

**Dời 4b (ghi nhận, chưa làm):**
- **O-03** — `source` của `VENDOR_ACCOUNT_DISCREPANCY_OPENED` có giá trị `USAGE_IMPORT` không thuộc enum DTO `vendor-account-review` (`NO_ASSIGNMENT | UNMATCHED_IDENTITY | INVOICE_DIFFERENCE | COLLECTOR_UNLISTED`). Chọn (a): bàn giao cho 5b rằng `source` của mã này là "loại lô" (3 giá trị `USAGE_IMPORT`/`INVOICE_DIFFERENCE`/`COLLECTOR_UNLISTED`), nhãn riêng, không dùng làm bộ lọc `vendorAccountDiscrepancyList?source=` (sẽ 422); hoặc (b) đổi tên param thành `occasion`. Khuyến nghị (a) vì 5b chưa viết câu.
- **O-04** — test `dueOn` của `DEVICE_STOP_REQUESTED` không bắt đột biến tính ngày theo UTC; thêm ca đặt `due_at = '2026-11-19T18:30:00Z'` qua SQL, gọi sweep, kiểm `dueOn === '2026-11-20'`.
- **O-06 (câu hỏi cho Owner)** — `vendorAccountDiscrepancyList` và `outOfProcessCaseList` vẫn cho mọi IT đọc dữ liệu theo người của mọi phòng (dòng `NO_ASSIGNMENT` mang `employeeId`); từ FX-T6b IT P2 không thấy finding của người P1 ở `usageNoAssignmentFindingList` nhưng vẫn thấy cùng dữ liệu ở hai hàng đợi này. Chặn theo `QĐ-111ax`? Nếu có: lọc `employeeId IS NULL OR employeeId IN peopleOf(actor)`.
- **N-01** `registrationIdsOfDevice` tính lại phạm vi IT cho mỗi người giữ — tính `scopeOf` một lần. **N-02** mô tả OpenAPI của `usageIdentityMappingList`/`usageNoAssignmentFindingList` chưa nói về phạm vi/trang rỗng — thêm câu như hai route máy, rồi `openapi:export`. **N-03** `VENDOR_ACCOUNT_DISCREPANCY_OPENED` báo cả IT vừa tự xác nhận import — truyền `actorEmployeeId` qua `UsageImportConfirmedEvent` và lọc nếu Owner muốn. **N-04** catalog FE (`Docs/Figma UI-UX/API-Integration/catalog/notifications.md:2099`) còn nhắc `DEPARTURE_MARKED_LEFT` — điều phối xóa khi chép bàn giao 5b. **N-05** ba `throw new Error` phòng hờ (`saas-issue-notifier`, `stop-request-notifier`) ra 500 không mã nếu bất biến vỡ — giữ.
- Các Optional khác của audit lõi chưa làm: O-1…O-3 của `AUDIT-A2-core-1` (B1 người giữ bước lúc chiếu, http contract 409 cho decide, nhãn `cause` ở `finishConversion`), O2/O3/O4/N1…N5 của `AUDIT-A2-core-2`.
