# REVIEW-SPEC — Review 1 cho SPEC/PLAN mở rộng seed `shared-demo-v4` (17/11/2026)

Reviewer độc lập, chỉ đọc code. Không chạy pnpm, docker hay test. Code đối chiếu ở `feat/p5`. HEAD hiện là `739b8616`; từ `d3757876` tới
HEAD chỉ thêm tài liệu, `src/`, `test/` và `openapi.json` không đổi. Mọi `file:dòng` tính từ gốc repo BE, trừ khi ghi khác.

## Skill đã dùng

| Skill | Vai trò | Dùng để |
| --- | --- | --- |
| `agent-skills:code-review-and-quality` | process + review | Phân mức Critical/Required/Optional; xét đúng đắn, kiến trúc, tính lặp lại |
| `superpowers:verification-before-completion` | verification | Finding Critical được kiểm lại bằng đọc code trực tiếp, không chỉ tin báo cáo phụ |
| (domain) | — | Không có skill seed nghiệp vụ. Đọc trực tiếp `src/cli/seed/**`, module nguồn, `test/flows/**`, `test/support/flows/**` |

Cách làm: bốn agent phụ chỉ đọc rà song song S01–S13, S14–S21, tệp upload (yêu cầu Owner 1), báo cáo ngân sách (yêu cầu Owner 2).
Reviewer kiểm lại bằng code mọi finding Critical, trừ những chỗ ghi "(theo agent phụ)".

Có hai yêu cầu bổ sung của Owner (17/11), đã đưa vào SPEC §5b, §10 và PLAN T1b, T29, CP6, ghi "Owner 17/11":

1. Mọi tệp seed upload phải là tệp thật, đúng mẫu.
2. Báo cáo của trưởng phòng và Finance phải nhất quán.

## Tổng hợp

| Mức | Số | Đã sửa thẳng vào SPEC/PLAN ("Review 1") | Chờ Owner |
| --- | --- | --- | --- |
| Critical | 13 | 12 | 1 (C-11) |
| Required | 22 | 20 | 2 (R-21, R-22: yêu cầu Owner 17/11 cần chốt chi tiết) |
| Optional | 8 | 5 | 0 |

## Critical

### C-1 · S03 + `org.accounts` · khóa NV-BOD3 làm mọi lượt chạy lại ra exit 4

- **Bằng chứng:**
  - `src/modules/identity-access/public/local-demo-account.api.ts:47-56`: tài khoản demo chỉ `present` khi `status === 'ACTIVE'` và
    `ACTIVATED`; tài khoản `LOCKED` ra `conflict ACCOUNT_DIFFERS`.
  - `src/cli/seed/steps/organization.steps.ts` (`accounts()`, khoảng dòng 144-160): conflict của một người làm cả bước `conflict`.
  - `seed-runner.ts:18-30`: mọi bước `needs: ['org.accounts']` thành `blocked`. `exitCodeOf` trả 4.
- **Hệ quả:** chạy lại cùng ngày ra exit 4 thay vì exit 2. Lượt `--continue` ở `D0+1` bị chặn gần hết. Flows không lộ lỗi này vì chỉ seed
  một lần.
- **Sửa SPEC:** giữ NV-BOD3 trong danh sách tài khoản demo và thêm cờ fixture `lockedInDemo: true`. Bước `org.accounts` của seed (code ở
  `src/cli/seed`, không sửa sản phẩm) đọc `GET /app-users?status=LOCKED` bằng Super Admin trước. Người có cờ mà tài khoản đã khóa thì bỏ
  khỏi `describe/create` và ghi `present`. Thêm test unit. Đã sửa S03 và PLAN T3.

### C-2 · S13d + R57 · chạy lại thì đọc R57 bằng NV-DEV7 đã bị chặn

- **Bằng chứng:**
  - `src/cli/seed/steps/request.steps.ts:51`: `findScenarioRequest` đăng nhập **người gửi**.
  - `src/modules/identity-access/accounts/account.policy.ts:15-21` và `access/jwt-access-token-verifier.service.ts:49-67`: người có
    lệnh chặn đang hiệu lực bị từ chối.
  - `BLOCK_NOW` chặn từ hôm nay.
- **Hệ quả:** ở lượt chạy lại, bước `requests.R57` chạy trước `personnel.abrupt-departure`, ra 401/4xx, thành `conflict`, exit 4.
- **Sửa SPEC:** fixture R57 thêm `readAs: 'NV-ENGH'`. Kịch bản có `readAs` thì đọc Request bằng người đó: trưởng phòng đọc được Request
  của phòng mình (kiểm route khi viết; không được thì dùng Super Admin nếu route cho phép). Người gửi chỉ đăng nhập khi còn phải gửi. Đã
  sửa S13d và PLAN T16.

### C-3 · S10a/R48 · chuỗi tới `AWAITING_IT_CLOSE` sai

- **Bằng chứng:**
  - `src/modules/licensing/provisioning/grant-cancellation/grant-cancellation.policy.ts:52-60`: rút khi task `QUEUED` thì `CANCEL`
    (Request thành `WITHDRAWN`); rút khi `IN_PROGRESS` thì `RUNNING` (409).
  - Chỉ task `FAILED` mới cho `WAIT_FOR_IT_ADMIN`.
  - Request chỉ thành `FAILED` khi `close-failed` chạy (theo agent phụ: `access-request-grant.listener.ts:119-139`).
- **Sửa:** tách hai hành động.
  - `FAIL_TASK_OPEN`: claim rồi `report-failure`. Request vẫn `EXECUTING`, task `FAILED`.
  - `FAIL_TASK_CLOSE`: thêm `close-failed`. Dùng cho R47.
  - R48 đi `GRANT → FAIL_TASK_OPEN → WITHDRAW`.
  - Đã sửa bảng S10a và PLAN T10/T11.

### C-4 · S12/ISSUE5 (và ISSUE4) · chuyển trạng thái không hợp lệ

- **Bằng chứng:** `src/modules/licensing/saas-issue/saas-issue.policy.ts:81-85`.
  - `NEW` chỉ sang `IN_PROGRESS` hoặc `DUPLICATE`.
  - `RESOLVED → IN_PROGRESS` là mở lại.
- **Sửa:**
  - ISSUE5 đi `NEW → IN_PROGRESS → WAITING_PROVIDER {vendorTicketRef}`.
  - ISSUE4 sau `reopening` có trạng thái cuối `IN_PROGRESS`, `reopenCount = 1`.
  - Bản trùng gọi `POST /saas-issues/{idBảnTrùng}/duplicate {ofIssueId: <ISSUE5>, reason}`.
  - Đã sửa S12.

### C-5 · S17b bước 5 · mã cửa sổ quota thuộc tool khác

- **Bằng chứng:** `src/modules/usage/tool-status/tool-status.policy.ts:11-15`.
  - `CLAUDE_CODE` dùng `SESSION/WEEKLY_ALL/WEEKLY_MODEL`.
  - `CODEX` dùng `PRIMARY/SECONDARY`.
  - `FIVE_HOUR/WEEKLY` chỉ thuộc `ANTIGRAVITY_CLI`.
- **Hệ quả:** ảnh chụp bị `REJECTED`, `tool-status` rỗng, `intake-rejections` có dòng. Mục "Kiểm" của S17 sai.
- **Sửa:** đã sửa S17. Đổi ảnh chụp sang mã cửa sổ đúng của từng tool.

### C-6 · S17 + `--continue` ở `D0+1` · máy SV-LT-003 đã dừng thu thập

- **Bằng chứng** (theo agent phụ): `src/modules/devices/**/intake-gate.policy.ts:12-19` trả 403 `DEVICE.COLLECTION_STOPPED`.
  `ai-usage-batch.service.ts:60-65` ghi thêm một dòng `intake-rejections`.
- **Hệ quả:** S17 đọc thấy LT-003 thiếu ngày `D0+1`, enroll lại rồi gửi, bị 403, thành `conflict`, exit 4.
- **Sửa:** S17b chỉ chạy cho máy có `state = ACTIVE` trong `GET /devices`. Máy `COLLECTION_STOPPED` ra `present`, kèm ghi chú "chỉ có
  usage ngày D0". Đã sửa S17.

### C-7 · S15 mục 2 (zoom-pro) · thiếu `outcomeNote`; `choice` cố định có thể sai

- **Bằng chứng:**
  - `src/modules/licensing/subscription-renewal/subscription-renewal.dto.ts:77-85`: `VENDOR_REFUSED` hoặc `DIFFERENT` mà không có
    `outcomeNote` ra 422.
  - Theo agent phụ: `renewal-seats-needed.policy.ts:87-92` ra `QUANTITY_NOT_SEATS_NEEDED` khi `proposedQuantity ≠ target`.
- **Sửa:**
  - Cả hai lượt đọc `GET /subscription-renewals/adjustment`, lấy `suggestedChoice` và `target`.
  - Zoom thêm `outcomeNote` có thẻ `[SV-…]`.
  - `target = 0` (`CANCEL`) không thuộc phạm vi: ghi `D-n`.
  - Đã sửa S15.

### C-8 · S15 + PLAN T18 · đề xuất đổi `oneSubscription()` sẽ chọn nhầm kỳ

- **Bằng chứng:**
  - `src/modules/catalog/subscription/subscription.repo.ts:601-606`: thứ tự trong một gói là `createdAt asc`, nên `rows[0]` là kỳ gốc.
  - `src/cli/seed/steps/catalog.steps.ts:272-294`: hàm đã không tạo mới khi `rows.length > 0`.
- **Hệ quả nếu đổi sang "startDate lớn nhất":**
  - Seed sẽ chọn kỳ nối tiếp Adobe.
  - `baseline.steps.ts` đọc ghế của kỳ nối tiếp, thấy 0, rồi nạp baseline đã đóng: 409, thành `conflict`.
  - Hóa đơn và khóa cũng gắn lệch kỳ.
- **Sửa:** không đổi `oneSubscription()`. Chỉ thêm test unit khẳng định "hai dòng thì lấy dòng đầu, không POST/PATCH". Đã sửa S15 và PLAN T18.

### C-9 · S16 · thân `POST /devices` và `signature-records` sai

- **Bằng chứng:** `src/modules/devices/**/registry.dto.ts:9-23`.
  - `POST /devices` bắt buộc `assetCode`, `hostname`, `os`, `holderEmployeeId` (uuid, không phải mã nhân viên).
  - `signature-records` nhận `{ documentId, noticeVersionId }`.
- **Sửa:** đã sửa S16. Idempotent theo `GET /devices?search=<assetCode>` (theo agent phụ; không có filter `assetCode`).

### C-10 · S20/SV-INV-007 · nộp lại hóa đơn không lặp lại được

- **Bằng chứng:**
  - `src/cli/seed/steps/demo.steps.ts:96-99`: hóa đơn đã có mà khác đích và khác `SUBMITTED` thì `conflict`.
  - Theo agent phụ: `resubmission` tạo hóa đơn **mới**, bản gốc giữ `RETURNED`, và chỉ người nộp gốc được gọi.
- **Hệ quả:** lượt chạy lại ra `conflict`, exit 4.
- **Sửa:**
  - Thêm đích `RESUBMITTED`. `present` khi có hóa đơn số `SV-INV-007R`.
  - Người nộp lại là IT Admin đã nộp bản gốc.
  - Thân nộp lại đủ trường, kèm tệp mới.
  - Đã sửa S20 và PLAN T24.

### C-11 · S08 + ngân sách · ghế K2 mới ở MKT phá kịch bản R10 (**chờ Owner**)

- **Bằng chứng:**
  - Thực chi của phòng gồm `seat_month_charges` (`src/modules/budgets/budget/invoice.repo.ts:180-209`).
  - Tiền ghế-tháng tính cho phòng của người giữ, cho mọi tháng đã hết mà ghế còn hiệu lực
    (`budgets/seat-month/seat-month.policy.ts`, `licensing/public/licensing-seat-month.api.ts:20-31`).
  - Bước `demo.budget-reviews` chốt tháng 1…10 ngay trong seed (`demo.steps.ts:149-170`), tức là tính luôn tiền ghế-tháng.
  - Duyệt chi kiểm lại ngân sách lúc quyết định (`requests/spend-approval/spend-decision.service.ts:101`).
- **Hệ quả:**
  - MKT hiện không ai giữ ghế (`fixture/shared-demo-v4/catalog.ts:237-268`).
  - S08 thêm 4 ghế Adobe (khoảng 1,83 triệu/ghế/tháng) và ghế Zoom của MKT3, cấp từ `D0−130`.
  - Thực chi MKT vượt xa 240.000 + 24.000. Khi Người duyệt chi duyệt R10 lúc demo, kiểm lại sẽ chặn. README ("R10 dùng dự phòng") sai.
  - Câu ở §4.2 "ghế nền mới ở MKT/SAL không tạo cam kết" đúng về cam kết nhưng sai về thực chi.
  - SAL vẫn bị chặn như README nên không đổi.
- **Câu hỏi Owner Q-B:** chọn một trong hai phương án.
  - (a) Chuyển ghế Adobe và Zoom khỏi MKT sang BOD (ngân sách 50 tr), để MF-5 mới ở NV-DEP và MKT vẫn không giữ ghế. **Khuyến nghị.**
  - (b) Giữ ghế ở MKT và sửa README/DEMO: R10 thành "bị chặn khi duyệt".
- SPEC chỉ ghi câu hỏi ở §10, không tự sửa bảng ghế.

### C-12 · S10a/R49 · `GRANT` mở tác vụ cho cả dòng bị từ chối

- **Bằng chứng:** `src/cli/seed/steps/request.steps.ts:240-246` lặp qua mọi `scenario.beneficiaries`.
- **Hệ quả:** dòng NV-BOD2 đã bị từ chối nhận 4xx, thành `conflict`.
- **Sửa:** `GRANT`/`COMPLETE_TASK` bỏ qua người trong `rejectedLines`. Đã sửa S10a và PLAN T11.

### C-13 · S11 · idempotent theo thẻ lý do không làm được

- **Bằng chứng** (theo agent phụ):
  - Dòng danh sách `GET /return-requests` không có `reason`, chỉ chi tiết mới có.
  - IT Admin thấy mọi hoàn trả.
  - Query có `state` và `assignmentId`.
- **Hệ quả:** viết như SPEC thì lượt chạy lại không thấy, gửi lại, bị 4xx, exit 4.
- **Sửa:** idempotent theo `GET /return-requests?assignmentId=<ghế>`. Mục "Kiểm" lọc theo `?state=`. Đã sửa S11.

## Required

| # | Bước/Task | Finding | Bằng chứng | Cách sửa (đã sửa nếu ghi ✔) |
| --- | --- | --- | --- | --- |
| R-1 | S13 Kiểm | Không có trạng thái `LINKED`. Gắn vào sự kiện cũng ra `RECORDED` | `personnel/personnel-notice.types.ts`, `notice-handling.service.ts` (agent phụ) | 1 `PENDING_VERIFICATION`, 2 `RECORDED`, 1 `REJECTED`. Phân biệt gắn/ghi qua Audit `PERSONNEL_NOTICE.LINKED/RECORDED` ✔ |
| R-2 | S13 | Phương án dự phòng NOTICE2 không cần: BM-09 về người đang nghỉ dài được nhận | `leave-notice.listener.ts:59-64` (agent phụ) | Bỏ nhánh dự phòng ✔ |
| R-3 | S12 Kiểm | `GET /saas-issues` của IT Admin mặc định `scope=assigned` | `saas-issue-view.service.ts:89` (agent phụ) | Kiểm bằng `?scope=all`. IT xử lý là IT Admin phụ trách phòng người báo, để không ra nhãn `onBehalfOf` ✔ |
| R-4 | S10a | `ASSESSMENT_REJECT`, `ASSESSMENT_RETURN`, `RETURN_SPEND` cần `reason` | `spend-approvals.controller.ts`, `proposals.controller.ts:242` (agent phụ) | Thêm `reason` có thẻ ✔ |
| R-5 | S10b | R42 và R49 là Request một bước, đi thẳng `AWAITING_SPEND_DECISION`, không "trình lô" | `requests/spend/spend-routing.service.ts:148-152` (agent phụ) | Sửa cột "Người làm" ✔ |
| R-6 | S10b | R46 `EXECUTING` chỉ là task `QUEUED`, chưa "đang làm" | `grant-cancellation.policy.ts:52` | Ghi "tác vụ đã mở, chờ nhận" ✔ |
| R-7 | S10 Kiểm | `NV-ENGH ≥ 2` không chắc: R57 có thể đã `CANCELLED` | SPEC S13d | ENGH ≥ 1 ✔ |
| R-8 | S04 | `dataLossOnRemoval` bắt buộc kèm `revocationNote` | `catalog/plan/plan.policy.ts:78` (agent phụ) | Adobe CC Teams thêm `revocationNote` ✔ |
| R-9 | S04 | Tên gói trùng ("Pro" ×2, "Business" ×2). Fixture cũ và flows dùng tên đầy đủ, ví dụ `'Canva Teams'` | `fixture/shared-demo-v4/catalog.ts:89`; `test/support/flows/flow-calls.ts:120-139` | Tên gói đầy đủ, ví dụ "Zoom Workplace Pro". Khóa thuê bao ghi rõ (`visio-pro`, không phải `visio`) ✔ |
| R-10 | S03 | `GET /app-users` không lọc được theo nhân viên | `account-management.dto.ts:33-47` (agent phụ) | Dùng `?status=LOCKED` và `?activationState=INVITED`, rồi khớp `employee.employeeCode` ✔ |
| R-11 | S02 | Cần ghi rõ: action Audit là `EMPLOYEE_IMPORT.UPLOADED`; cột bắt buộc `employee_code, full_name, employment_type, hire_date`; mã lỗi `DEPARTMENT_CODE_INVALID`, `WORK_EMAIL_TAKEN`; import mở không chặn import khác | `employee-import-audit.mapper.ts:37` (agent phụ) | ✔ |
| R-12 | S01 | NV-NEW2 tạo tài khoản được (`DemoAccountsApi` không kiểm phòng). Số đếm sau S02 là 61 | `local-demo-account.api.ts`; `employee.dto.ts:56-65` | Bỏ nhánh "không tài khoản"; ghi "58 sau S01, 61 sau S02" ✔ |
| R-13 | S16 | "Allowlist trước xác nhận" không phải luật code. Mọi IT Admin làm được (không cần phụ trách phòng) | `acknowledgement.policy.ts:23-31` (agent phụ) | Giữ thứ tự theo ý Owner, ghi rõ "không phải luật code" ✔ |
| R-14 | S16 Kiểm | Sau S18 chỉ còn 3 máy `ACTIVE` (LT-001, 002, 004) | S18 | ✔ |
| R-15 | S18 | `GET /device-stop-requests` mặc định chỉ `OPEN`. Gửi lại tạo dòng `INVALID` | `stop-request.dto.ts:7-12` (agent phụ) | Đọc `OPEN` và `COMPLETED`, lọc theo máy phía client, rồi mới gửi ✔ |
| R-16 | S14 Kiểm | Khuyến nghị theo phạm vi IT Admin: MKT5 chỉ ITA2 thấy, SAL4 chỉ ITA1 thấy | `optimization/board/board.controller.ts:69` (agent phụ) | Tách theo từng IT Admin ✔ |
| R-17 | S11 + S14 | RET1 thu hồi ghế Notion của NV-DEV6 trước `usage.imports`, nhưng nguồn Notion vẫn có dòng DEV6 | thứ tự `seed-steps.ts:28-47` | Bỏ dòng DEV6 khỏi nguồn Notion. Nếu giữ thì kiểm luật nhập dòng của người không giữ ghế ✔ |
| R-18 | S20 | Hợp đồng `effectiveTo = null` là `ACTIVE` bình thường, không phải "thiếu ngày". SL hóa đơn khác `purchasedQuantity` sinh `PRICE_QUANTITY_EXCEPTION` | `contract-fields.policy.ts`; `purchase-invoice-plan.service.ts` (agent phụ) | Sửa mô tả; SL bằng số mua, trừ khi cố ý tạo lệch ✔ |
| R-19 | PLAN T20/T21 | T20 thêm `devices.acknowledgements` cần `devices.allowlist`, nhưng bước này tới T21 mới có. `seed-steps.spec.ts:8-14` sẽ đỏ ngay ở T20 | `seed-steps.spec.ts:8-14` | Chuyển bước allowlist sang T20 ✔ |
| R-20 | S19 + flows | Template flows yêu cầu **mọi** bước `done/present` (`flow-template.ts:115-121`). Một bước mới `conflict` trong môi trường flows làm **toàn bộ** flows đỏ. S17 (route công khai, Idempotency-Key) và S19 (AI) phải chạy được trong app test | `test/support/flows/flow-template.ts:93-131` | Ghi vào §7; CP chạy flows bắt buộc từ CP4 ✔ |
| R-21 | Owner 17/11 (1) | Mọi tệp seed hiện là PDF giả (`SAMPLE_PDF` không có trang). BM-10 khai `application/pdf`, không dùng mẫu `GET /import-templates/budget-proposal?format=xlsx` | `src/cli/seed/steps/file-kit.ts:4-6,23-37`; `budget.steps.ts:54-58`; `policies/import-template/import-template.controller.ts:28-72` | Thêm §5b S23, PLAN T1b. Câu hỏi Owner Q-D (thư viện PDF) |
| R-22 | Owner 17/11 (2) | Báo cáo ngân sách thiếu: (1) đèn đa dạng — ENG/BOD/FIN/ITO gần như chắc `UNDER`, chưa chắc có phòng `GREEN`; (2) xu hướng — mọi ghế cấp `D0−130`, hóa đơn chỉ tháng `D0`; (3) đẳng thức "Σ phòng + Chưa phân bổ = Σ hóa đơn" **không đúng** với K2 | `budgets/review/budget-review.policy.ts:95-112`; `budget/invoice.repo.ts:180-209`; `seat-month/seat-month-pool.policy.ts`; `demo.steps.ts:149-170` | Thêm §5b S24 + script kiểm tổng, PLAN T29/CP6. Câu hỏi Owner Q-C |

## Optional

| # | Bước | Finding | Cách sửa |
| --- | --- | --- | --- |
| O-1 | S13d | Câu "đặt ngay sau `personnel.events`" mâu thuẫn nhẹ với "sau R57" | `needs: ['personnel.events', 'requests.R57']` ✔ |
| O-2 | §4.5 | Thiếu test khóa bom ngày | Test `subscriptionTerms()` với `D0` = 31/12, 29/02, 31/01 và `n` = 1/3/20 ✔ (PLAN T5) |
| O-3 | §8 | `BlockMomentSweeper` không có trong `SWEEPER_OVERRIDES` (`flow-template.ts:53-71`; job chạy sau 5 phút, `block-moment.job.ts:7-8`). R57 trong flows có thể ở `PENDING` hoặc `CANCELLED` | Đích `PENDING_OR_CANCELLED` đã đủ; sửa câu §8 ✔ |
| O-4 | S08 | Job hết hạn mở tác vụ thu hồi cho ghế SAL4/ITO2 sau lượt giờ đầu | Ghi cho FE ✔ |
| O-5 | S02 | Bản xem trước hết hạn sau 24 giờ (`employee-import-preview.service.ts:22`) | Ghi README |
| O-6 | S03 | `POST /app-users` xếp mail mời vào outbox | Ghi README/FE |
| O-7 | Lịch | Seed ngày 31/12 rồi `--continue` ngày 1/1 bị `calendarRefusal` (exit 3, `seed-calendar.ts:22-30`) | Ghi `docs/guides/seed.md` ✔ |
| O-8 | PLAN T28 | `git apply --3way` cần blob gốc có trong repo WDP | Nếu không có thì `git apply` thường + sửa tay, ghi `D-n` |

## Đã kiểm và đúng

- **S01:** route và vai đúng; lọc `unplaced` có trong `GET /employees`.
- **S02–S09:** route và vai đúng.
  - `PUT /vendors/{id}/tax-profile` chỉ FINANCE, nên NV-FIN1 đúng.
  - `PUT /plans/{id}/terms`, `GET /plan-warnings` dành cho IT_ADMIN.
  - `installLimit` chỉ áp K4.
  - Số mua = ghế nền + `freeAfterBaseline`.
- **S10:**
  - Route `need-decision` RETURN, `assessment/rejection`, `spend-approval` REJECT/RETURN, `line-spend-decisions`, `report-failure`,
    `close-failed`, `withdraw` đều có.
  - Mã checklist 1.2/1.3/1.7 đúng.
  - SoD-1, `REQUEST_PARTY.INELIGIBLE`, `REQUESTER_IS_HEAD` không bị vi phạm.
  - SoD-7 chỉ liên quan quyền đọc lịch sử của Người duyệt chi, không ảnh hưởng.
  - GH-1: không ai xin gói đang giữ hoặc có Request mở cùng gói.
  - GH-2 thật là 10 Request gửi trong tuần mỗi người. Bảng thỏa; "≤ 3 mở" là quy ước fixture.
  - Ngân sách BOD/FIN/ITO/ENG đủ cho R40–R57.
- **S13, S15, S17 (phần khác):**
  - `linking`, `recording` đúng thân bài.
  - Mọi IT Admin được ghi SBF-20 (`QĐ-58b`).
  - Gói tháng `VENDOR_REFUSED` không cần `nextPeriod`.
  - Enroll lại thu hồi credential cũ (`REPLACED`).
  - Server chỉ nhận ngày từ lúc xác nhận; `PARTIAL` được nhận; `generatedAt` không được quá 5 phút về sau.
- **S19:** `AI_PROVIDER_MODE` mặc định `SIMULATED`; hai khóa AI mặc định `OFF`; action `AI_INVOCATION.REQUESTED`.
- **S21:** Skype không thuê bao, không ghế, nên ngừng được.
- **Bom ngày §4.5:** mô phỏng `n ≤ 25` cho mọi `D0`, kể cả 29–31 và tháng 2, thì ngày trả kế tiếp luôn là `D0+n`. Công thức `endDate`
  thỏa `renewalDate ≤ endDate+1`. Lưới gói năm (Adobe đỏ, notion-plus đỏ từ `D0+8`) đúng.
- **Flows:** không flow nào đếm tuyệt đối số thuê bao, renewal hay hàng chờ. Flows tìm gói theo tên đầy đủ, không trùng với gói mới.

## Câu hỏi Owner

- **Q-B (C-11):** ghế K2 mới ở MKT làm R10 "dùng dự phòng" thành "bị chặn" khi duyệt. Hai phương án:
  - (a) chuyển ghế Adobe/Zoom của MKT sang BOD — khuyến nghị;
  - (b) giữ ở MKT và sửa README.
- **Q-C (Owner 17/11 (2)):** để có phòng ở cả bốn đèn và có xu hướng theo tháng, có cho seed:
  - (i) đổi ngân sách cơ sở ENG/FIN/BOD/ITO, tính từ thực chi dự kiến theo `D0`? ENG vẫn phải đủ rộng cho `mf4-budget` (`BUDGET_OK`,
    `test/flows/mf4-budget.flow-spec.ts:100-120`);
  - (ii) rải ngày cấp ghế nền mới từ 300 tới 30 ngày trước;
  - (iii) thêm hóa đơn của các tháng đã qua? Code không chặn tháng quá khứ (theo agent phụ).
- **Q-D (Owner 17/11 (1)):** PDF "thật, đọc được" có tiếng Việt có dấu cần nhúng font, tức là thêm dependency như `pdf-lib`. Seed chạy
  trong image production nên đây phải là `dependencies`. Hai phương án:
  - thêm dependency;
  - tự viết PDF tối giản với chữ không dấu.
- **Q-E (Owner 17/11 (1)):** BM-10 chỉ có các dòng phần mềm và tổng bằng `requestedAmount`. "Số cơ sở, dự phòng" là của phiên bản
  Finance. Đề xuất: ghi base, reserve và tổng vào tệp XLSX giải thích của Finance gắn vào phiên bản. Owner đồng ý không?
