# V1-REQ-API — Việc 2: rà trường API của Request (QĐ-96 → QĐ-100ai)

> Agent V1-REQ-API · 05/11/2026 · BE pin `3e4553b9` (bản làm việc trên đĩa), Docs pin `3d73a7f`. Read-only: không sửa code/tài liệu, không chạy test, không git.

## 1. Skill, phạm vi đã đọc, operation đã rà

**Skill đã đọc/dùng**

| Skill | Loại | Mục đích |
| --- | --- | --- |
| `code-review-and-quality` | process | Quy trình rà nhiều trục (đúng nghiệp vụ, vai, bảo mật), xếp mức độ phát hiện |
| `api-and-interface-design` | domain | Tiêu chí hợp đồng API: input/ouput tách bạch, không để client gửi cái server tự tính, validate ở biên |
| `security-and-hardening` | domain/review | Trường client gửi mà server tin, tối thiểu hóa dữ liệu cá nhân, phân quyền theo tài nguyên |
| `superpowers:verification-before-completion` | verification | Mọi kết luận kèm `file:dòng` đã đọc trực tiếp; ghi rõ phần chưa đọc |

**Đã đọc:** tracker `README.md` của đợt; `inventory.md` (các tag được giao); BE `AGENTS.md`, `src/modules/requests/README.md`; DTO, controller, service, policy liên quan trong `src/modules/requests/{access-request, request-intake, request-submission, need-decision, assessment, plan-line, group-request, group-request-submission, group-line-decisions, delegated-request, renewal-request, return-request, cancellation, service-account-request, draft, sla, grant, request-view}`, `catalog/requestable-software/requestable-software.dto.ts`, `budgets/public/budgets.api.ts` (chữ ký `currentLine`), `licensing/assignment/*` (grep), `prisma/models/{requests,organization,budgets}.prisma` (cột liên quan). Docs: `project-decisions.md` mục 3.5 (dòng 276–322), 3.8 (397–417), 484–506 (QĐ-100s → 100ai); BRD 4.6 (347–383), 5.3 FR-3.2/FR-3.3 (569–583), FR-2.8 (345), BM-01/02/03 (5.13); `Quy trình và chính sách theo main flow.md` MF-1 bước 1.1 → 1.7 và `C-10`, `C-17`; MF-1 activity doc bước 1–2; US `EP-05.md` AC của US-05-01, 05-02, 05-04, 05-14, 05-17, 05-20. FE: `approvals/need/components/need-decision-form.tsx`, `locales/vi/approvals-need.ts`, `employee/software-request/*`, `manager/team-requests/views/manager-create-employee-request-view.tsx`, thống kê import client sinh `shared/api/generated/operations/*`. API-Integration: `tools/glossary/fields.json`, `flows/paid-access-request.md`, `roles/manager.md` (grep).

**Chưa đọc kỹ (ngoài trọng tâm Việc 2 hoặc thuộc agent khác):** service chi tiết của bước chi (`spend/*`, `spend-approval/*` — V2/A1), licensing grant thực thi (`licensing/*` chỉ grep), toàn bộ test/seed (chỉ đếm số file chạm trường), các tag GET chỉ đọc schema chứ không đọc repo SQL (`controlled-waits`, `step-congestion`, `service-account-duties`, `assessment-queue`).

**Operation đã rà: 48** (27 ghi + 21 GET), đủ theo inventory:

- `access-requests` (23): ghi — `accessRequestDraftSave`, `accessRequestDraftSubmit`, `accessRequestDraftDelete`, `accessRequestSubmit`, `accessRequestPreview`, `accessRequestNeedDecide`, `accessRequestWithdraw`, `accessRequestCancelForDeparture`, `accessRequestPropose`, `accessRequestAssessmentSave`, `accessRequestAssessmentComplete`, `accessRequestAssessmentReject`, `accessRequestInternalRegister`, `accessRequestCatalogLink`, `accessRequestServiceAccountSubmit`, `accessRequestServiceAccountReview`, `accessRequestRenewalSubmit`; GET — `accessRequestDraftList`, `accessRequestGet`, `accessRequestSimilarSeatList`, `accessRequestAssessmentGet`, `assessmentQueueList`, `accessRequestTimingsGet`.
- `group-requests` (8): ghi — `groupRequestCheck`, `groupRequestSubmit`, `accessRequestLineNeedDecide`, `spendApprovalLineDecide`, `accessRequestLineWithdraw`, `accessRequestLineCloseForDeparture`; GET — `groupRequestCandidateList`, `accessRequestLineList`.
- `delegated-requests` (2): `delegatedRequestSend` (ghi), `grantQueueList`.
- `return-requests` (4): `returnRequestSubmit`, `returnRequestHandoverConfirm` (ghi), `returnRequestList`, `returnRequestGet`.
- `need-decisions` (1), `controlled-waits` (1), `step-congestion` (4, gồm ghi `stepCongestionIncidentRecord`), `requestable-software` (4), `service-account-duties` (1).

**Tổng kết trường input đã phán quyết (không đếm lặp biến thể bản nháp):** GIỮ 73 · BỎ 21 · ĐỔI 7 · SERVER TÍNH 2 · CHUYỂN BƯỚC 1. Cộng ~12 trường/enum **response** đề xuất bỏ (mục 4).

### Ba trường Owner hỏi trực tiếp — kết luận ngắn

| Trường (nhãn Owner thấy) | Ai đang phải gửi | Kết luận | Lý do một dòng |
| --- | --- | --- | --- |
| `expectedSpendOn` — "Ngày dự kiến phát sinh chi (không bắt buộc)" | Employee (mọi loại Request), trưởng phòng ở bước nhu cầu (`spend.expectedSpendOn`) | **BỎ ở mọi nơi** | `QĐ-98a`, `FR-3.2`, `C-10`: "**không** có ngày dự kiến chi"; năm do hệ thống tạm tính lúc trình, tính lại lúc duyệt (`QĐ-100n`). Hiện server **tin** ngày này để chọn năm ngân sách và lịch thanh toán (nghi vấn L1). |
| `lines[].expectedEndDate` — "Ngày kết thúc quyền (nếu có)" | Người gửi Request nhóm (Employee hoặc trưởng phòng), cho từng người | **SERVER TÍNH** (khuyến nghị; chốt ở Q1) | Có căn cứ nghiệp vụ (`FR-2.8`, `INV-07`, US-05-17 AC-8: nhà thầu/thực tập sinh phải có ngày kết thúc), nhưng người gửi không giữ dữ liệu này, danh sách chọn người cố ý chỉ có họ tên + email (`QĐ-82l(18)`), và khi mọi quyền có hạn ≤ 12 tháng theo `QĐ-98a` thì ngày kết thúc phải do server tính từ thời hạn. |
| `termConfirmation.reason` — "Giải trình thời hạn trên 12 tháng" | Người gửi nhóm/gửi thay/gia hạn, trưởng phòng ở bước nhu cầu | **BỎ ở mọi nơi** | US-05-01 AC-4, US-05-04 AC-6, US-05-14 AC-3 viết lại: thời hạn **tối đa 12 tháng**, không còn xác nhận tường minh (`OI-07a` bỏ). |
| `spend.planLine.position`, `spend.planLine.stillNeeded`, `spend.offPlan` (trưởng phòng duyệt nhu cầu) | Trưởng phòng | **GIỮ** (đổi cách FE nhập `position`) | `QĐ-82l(5)`, `FR-3.3`, US-05-04 AC-12/AC-13: gắn dòng kế hoạch hoặc *ngoài kế hoạch* (chỉ là thông tin) và xác nhận *còn nhu cầu* khi dòng đã quá khoảng mua. Lạ ở **cách nhập**: FE bắt gõ tay "Số thứ tự dòng kế hoạch" thay vì chọn từ `accessRequestPlanLineSuggestionList`. |

## 2. Theo từng operation ghi

Quy ước cột: **Biết?** = vai đó có biết/có trách nhiệm cung cấp giá trị theo nghiệp vụ không · **Logic** = nơi dùng (`file:dòng`, đường dẫn tương đối từ `src/modules/requests/` nếu không ghi khác) · **Suy ra?** = server tự suy ra được không · **NC** = nhạy cảm/dữ liệu cá nhân.

### 2.1 `accessRequestSubmit` — `POST /access-requests`

- Vai theo QĐ: chính người cần quyền (mọi tài khoản trừ Super Admin, Người duyệt chi, nhân viên chưa xếp phòng — `QĐ-100t`, `QĐ-93d(2)`, `QĐ-93g(4)`, `QĐ-95d`). Guard: `AuthenticatedOnly` + từ chối Super Admin (403) + `REQUEST_PARTY.INELIGIBLE` (422). Khớp. Trưởng phòng tự gửi cho mình vẫn được (đường dòng định tuyến 2) — `QĐ-100l` **chờ mentor**, chỉ ghi nhận.
- Flow: MF-1 bước 1.1. DTO `access-request/access-request.dto.ts:16-22` (`SubmitBodyDto` :313).

| Trường | Biết? | Logic | Suy ra? | NC | Kết luận | Căn cứ | Ảnh hưởng FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planId` | Có (chọn phần mềm/gói) | `access-request/request-facts.service.ts:120-124` chọn nhánh, giá | Không | Không | GIỮ | `FR-3.2`, BM-01 | Không |
| `businessReason` | Có | lưu `access_requests.business_reason`, hiện cho trưởng phòng | Không | Thấp (văn bản tự do) | GIỮ | BM-01, US-05-02 AC-6 | Không |
| `termMonths` | Có ("thời hạn cần dùng") | giá: `access-request/pricing.policy.ts:69`; trần `TERM_MONTHS_MAX = 120` `access-request.dto.ts:9` ("không phải luật BRD") | Không | Không | **ĐỔI**: `max(12)`; server thêm luật gói linh hoạt chỉ tới 31/12 năm bắt đầu (trả 422 có lý do) | `QĐ-98a`, `C-10`, US-05-01 AC-4 | Form employee (demo) đổi trần; preview nên trả hạn tối đa (mục 4) |
| `expectedSpendOn` | **Không** — nhân viên không biết ngày công ty trả tiền | `request-facts.service.ts:246` (`?? today`), `pricing.policy.ts:60` (năm ngân sách), `:72` (ngày từng kỳ), lưu `access_requests.expected_spend_on` (`prisma/models/requests.prisma:161`) | Có (ngày trình/duyệt) | Không | **BỎ** | `QĐ-98a(1)`, `QĐ-100n`, `FR-3.2` "không có ngày dự kiến chi", US-05-02 AC-11 | API-Integration `flows/paid-access-request.md:38,60`, `reference/access-requests.md:1069`, glossary `fields.json:75` |

### 2.2 `accessRequestPreview` — `POST /access-requests/preview`

- Vai: như 2.1 (xem trước). Guard: chỉ đăng nhập (đúng: xem trước báo *chưa gửi được* cho Người duyệt chi — US-05-01 AC-16). DTO `request-submission/request-preview.dto.ts:11-15` (pick từ submit).

| Trường | Biết? | Logic | Suy ra? | NC | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planId` | Có | như 2.1 | — | — | GIỮ | US-05-01 | — |
| `termMonths` | Có | như 2.1 | — | — | ĐỔI (trần 12, luật 31/12) | `QĐ-98a` | — |
| `expectedSpendOn` | Không | `request-preview.service.ts:97` | Có | — | BỎ | `QĐ-98a`, `QĐ-100n` | — |

Ghi chú: response có `explanation: HEAD_ASKS_FOR_SELF` (`request-preview.dto.ts:24`) — ca trưởng phòng tự xin cho mình, phụ thuộc `QĐ-100l` (chờ mentor), **không** đề xuất sửa.

### 2.3 `accessRequestDraftSave` / `accessRequestDraftSubmit` / `accessRequestDraftDelete`

- Vai: chính người soạn (`QĐ-87g`: phòng chưa có Cost Center chỉ lưu nháp). Guard: chặn Super Admin. DTO `draft/request-draft.dto.ts:16-20` (union `INDIVIDUAL`/`GROUP`/`SERVICE_ACCOUNT` = đúng thân của ba op gửi), `:29` (`DraftSubmitBodyDto` rỗng).

| Trường | Kết luận | Ghi chú |
| --- | --- | --- |
| `kind` | GIỮ | phân biệt loại; khi thêm loại mới (`QĐ-100ab`, `100ac`) mở rộng enum |
| các trường của từng biến thể | **theo phán quyết của op gốc** (2.1, 2.10, 2.14) | `expectedSpendOn`, `termConfirmation` bỏ; `lines` tối thiểu 2; `termMonths` ≤ 12. Bản nháp cũ trong DB có các trường này (cột JSON `policy` của nháp — `request-draft/request-draft-policy.json.ts`) ⟹ codec đọc phải bỏ qua trường thừa |
| body rỗng của submit, `id` path | GIỮ | đúng: gửi lại nội dung đã lưu |

### 2.4 `accessRequestNeedDecide` — `POST /access-requests/{id}/need-decision`

- Vai theo QĐ: trưởng phòng của phòng Request (`QĐ-52c`); Người duyệt chi cho dòng/Request mà người thụ hưởng là chính trưởng phòng (`QĐ-100l`). Guard: `OWN_REQUEST`, `NOT_THE_ASSIGNEE` (`access-request/need-decision.policy.ts:39-48`). Khớp.
- Flow: MF-1 bước 1.2. DTO `access-request/access-request.dto.ts:58-92`; controller `need-decision/need-decision.controller.ts:86-100`; service gắn chi `assessment/need-spend.service.ts:33-78` → `plan-line/plan-line.service.ts:30-76`.

| Trường | Biết? | Logic | Suy ra? | NC | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `decision` | Có | `need-decision.policy.ts:108-126` | — | — | GIỮ | US-05-04 AC-1/2 | — |
| `reason` | Có | bắt buộc khi REJECT (`access-request.dto.ts:77-79`) | — | Thấp | GIỮ | US-05-04 AC-2, `QĐ-53a` | — |
| `termConfirmation.reason` | Không còn nghĩa | `need-decision.policy.ts:10,49-52` (`TERM_CONFIRMATION_REQUIRED` khi > 12), lưu `approval_records.term_confirmation_reason` (`requests.prisma:408`) | — | — | **BỎ** (cùng `LONG_TERM_MONTHS`, mã lỗi, cột → để trống/không ghi) | US-05-04 AC-6 viết lại, `QĐ-98a` | `need-decision-form.tsx:32,64-65,89` và nhãn `termReason` `vi/approvals-need.ts:26-27` |
| `spend.planLine.position` | Có (trưởng phòng thấy kế hoạch phòng mình — `QĐ-100p`) | `plan-line.service.ts:40-43` (`budgets.currentLine(costCenter, year, position)`); khóa dòng là `(versionId, position)` (`prisma/models/budgets.prisma:178-180`), không có id riêng | Không (trưởng phòng chọn; hệ thống chỉ gợi ý) | Không | GIỮ | `QĐ-82l(5)`, `FR-3.3`, US-05-04 AC-12 | **ĐỔI cách nhập ở FE**: bỏ ô gõ số `planPosition` (`need-decision-form.tsx:181-194`, hint "không có quyền xem gợi ý" `vi/approvals-need.ts:33`) → chọn từ `accessRequestPlanLineSuggestionList` (route có `MANAGER`, `spend-submission/spend-submission.controller.ts:203-204`) |
| `spend.planLine.stillNeeded` | Có | `spend/spend-submission.policy.ts:29` chặn `STILL_NEEDED_REQUIRED` khi dòng quá khoảng mua; lưu `plan_line_confirmed` | Không | — | GIỮ | `FR-3.3`, US-05-04 AC-13 | FE chỉ nên hiện checkbox khi dòng được chọn có `windowTo < hôm nay` (dữ liệu có ở suggestions) |
| `spend.offPlan` | Có | `plan-line.service.ts:50-56` → `off_plan` | Không | — | GIỮ | `QĐ-82l(5)` (cờ thông tin) | — |
| `spend.expectedSpendOn` | **Không** — trưởng phòng cũng không quyết ngày công ty trả tiền | `need-spend.service.ts:44-68` định giá lại, đổi `budget_year`, ghi audit `EXPECTED_SPEND_DATE_CHANGED` | Có | — | **BỎ** | US-05-04 AC-16 (bỏ), `QĐ-98a`, `QĐ-100n` | `need-decision-form.tsx:36,96,196-205`, nhãn `expectedSpendOn` `vi/approvals-need.ts:36` |

### 2.5 `accessRequestLineNeedDecide` — `POST /access-requests/{id}/line-need-decisions`

- Vai: trưởng phòng quyết **từng người** với Request nhóm của Employee (`QĐ-82h`, `QĐ-100ai`); Người duyệt chi quyết dòng của chính trưởng phòng (`QĐ-100l`). Guard: `OWN_REQUEST`/`NOT_THE_ASSIGNEE`. Khớp. Chỉ trưởng phòng (vai `MANAGER`) chọn dòng kế hoạch (`need-decision.policy.ts:125`) — đúng vì Request nhóm do trưởng phòng gửi gắn dòng trước khi trình (`FR-3.3`).
- DTO `group-request/group-decision.dto.ts:37-66`; controller `group-line-decisions/group-lines.controller.ts:120-140`.

| Trường | Kết luận | Căn cứ / ghi chú |
| --- | --- | --- |
| `lines[].employeeId`, `lines[].decision`, `lines[].reason` | GIỮ | US-05-04 AC-14; lý do bắt buộc khi từ chối (`group-decision.dto.ts:22-28`) |
| `termConfirmation.reason` | **BỎ** | như 2.4; `group-request/group-line-decision.policy.ts:37` |
| `spend.planLine.position`, `spend.planLine.stillNeeded`, `spend.offPlan` | GIỮ | như 2.4 (FE `group-need-decisions.tsx` dùng chung form) |
| `spend.expectedSpendOn` | **BỎ** | như 2.4; `group-lines.controller.ts:135` |

### 2.6 `spendApprovalLineDecide` — `POST /access-requests/{id}/line-spend-decisions`

- Vai: Người duyệt chi giữ bước chi (`QĐ-22`, `QĐ-66m`). Guard: `SPEND.NOT_THE_ASSIGNEE`, `SPEND.OWN_REQUEST`. Khớp. (Op thuộc tag `group-requests` nên rà ở đây; phần lõi bước chi để V2/A1.)
- DTO `group-request/group-decision.dto.ts:72-96`.

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `lines[].employeeId`, `lines[].decision`, `lines[].reason` | GIỮ | `QĐ-66m`, US-05-17 AC-9 |
| `override.reason`, `override.years` | **BỎ** | `QĐ-97c`: "Không còn … override của Người duyệt chi"; MF-1 1.7 "Không có override". Hiện client còn tự gửi **danh sách năm** được ngoại lệ (`:76-83`) và controller còn mô tả `OVERRIDE_REQUIRED/MISMATCH/NOT_NEEDED`, `RECHECKED_NEEDS_FINANCE_REVIEW` (`group-lines.controller.ts` ~170-185) |

FE: `approvals/queue/components/spend-decision-form.tsx` (dùng `spend-approval-line-decide`) — bỏ khối override.

### 2.7 `groupRequestCheck` / `groupRequestSubmit` — `POST /group-requests/check`, `POST /group-requests`

- Vai theo QĐ: Employee gửi nhóm ≤ 10 người cùng phòng (`QĐ-82h`); trưởng phòng gửi nhóm **từ 2 người** (`QĐ-100aa`), có thể gồm chính mình (`QĐ-100l`). Guard: chặn Super Admin; `requireEligibleSender`. **Thiếu** luật ≥ 2 (DTO `min(1)` `group-request/group-request.dto.ts:30-33`; `group-request-submission/group-request.service.ts` `refuse` không kiểm số dòng tối thiểu).
- Flow: MF-1 bước 1.1 (form Owner chụp). DTO `group-request/group-request.dto.ts:28-38`.

| Trường | Biết? | Logic | Suy ra? | NC | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planId` | Có | `group-request/group-request.policy.ts:25-32` (chỉ K2, không nội bộ) | — | — | GIỮ | US-05-17 AC-14 | — |
| `lines[]` (số phần tử) | Có | `group-request.policy.ts:50-60` (trần 10/100) | — | — | **ĐỔI**: tối thiểu 2 dòng cho mọi Request nhóm (lỗi nghiệp vụ có lý do, không chỉ DTO) — xem Q3 | `QĐ-100aa`; `QĐ-100t` (nhóm 1 dòng của người khác = gửi thay một người) | form employee/manager báo "cần từ 2 người" |
| `lines[].employeeId` | Có (chọn từ `groupRequestCandidateList`) | `group-request.policy.ts:96-124` | — | Thấp (id) | GIỮ | `QĐ-82l(18)` | — |
| `lines[].expectedEndDate` ("Ngày kết thúc quyền (nếu có)") | **Không**: người gửi không có hồ sơ hợp đồng của đồng nghiệp; danh sách chọn người không có loại nhân viên (`group-request-submission/group-candidate.service.ts` trả `employeeId, fullName, workEmail`) | bắt buộc với `CONTRACTOR/FREELANCER/INTERN` (`group-request/beneficiary-eligibility.policy.ts:11,45-49`), lưu `access_request_lines.expected_end_date` (`requests.prisma:290`), chuyển nguyên sang Assignment (`grant/grant.policy.ts:117`) | Có (từ `termMonths` + ngày duyệt; hoặc hồ sơ nhân sự) | **Có** — lộ gián tiếp loại hợp đồng của đồng nghiệp (lỗi `END_DATE_REQUIRED`) | **SERVER TÍNH** (khuyến nghị — chốt ở Q1, Q2) | `FR-2.8`, `INV-07`, US-05-17 AC-8; `QĐ-98a`; `QĐ-82l(18)`; `QĐ-87` (dữ liệu nhân sự do Super Admin) | bỏ ô ngày theo từng người; API-Integration glossary `fields.json:85` |
| `businessReason` | Có | lưu chung | — | Thấp | GIỮ | BM-01 | — |
| `termMonths` | Có | giá × số người | — | — | **ĐỔI** (≤ 12, luật 31/12) | `QĐ-98a` | — |
| `expectedSpendOn` ("Ngày dự kiến phát sinh chi") | **Không** | `group-request-submission/group-request.service.ts:152`, `group-submission-facts.service.ts:91,145` | Có | — | **BỎ** | `QĐ-98a`, `QĐ-100n` | bỏ ô ngày cuối form |
| `termConfirmation.reason` | Không còn nghĩa | `group-request.policy.ts:127-132`, `group-request.service.ts:176-183`, `group-request-writer.service.ts:132` | — | — | **BỎ** | US-05-01 AC-4 | — |

Thiếu (ngoài phạm vi trường, để A2): loại **Request tiếp tục nhóm** (`QĐ-100ab`) chưa có đường; Request nhóm của nhân viên xét theo từng dòng tiền mới (`QĐ-100ai`) không thêm trường input nào.

### 2.8 `accessRequestLineWithdraw` / `accessRequestLineCloseForDeparture`

| Op | Trường | Kết luận | Căn cứ |
| --- | --- | --- | --- |
| LineWithdraw (người gửi, chính người đó, trưởng phòng ở chặng của mình) | `reason` (tùy chọn; bắt buộc với trưởng phòng) | GIỮ | US-05-17 AC-10, US-06-14 AC-14, `QĐ-82l(15)` |
| LineCloseForDeparture (IT Admin) | `cause`, `note`, `evidence` | GIỮ | US-03-04 AC-25, `QĐ-90b`; server kiểm thật người đã nghỉ/đã chuyển (`cancellation/cancellation.policy.ts:28`), không tin client |

### 2.9 `delegatedRequestSend` — `POST /delegated-requests` (trưởng phòng gửi thay)

- Vai theo QĐ: **không còn** — `QĐ-100t` "Request cho **một** người chỉ do chính người đó gửi; trưởng phòng chỉ gửi Request nhóm" (thay vế gửi thay của `QĐ-99a`, `QĐ-62a`). Op tạo **một Request cá nhân cho mỗi (người × gói)** (`delegated-request/delegated-request.dto.ts:12-16`), cho phép cả phần của chính trưởng phòng (`delegated-request.policy.ts:31-41`, `QĐ-100l` chờ mentor).
- Kết luận cả op: **BỎ** (nhu cầu nhiều người dùng `groupRequestSubmit` ≥ 2 người). Ca MF-3 do hệ thống tự tạo, không dùng op này (`QĐ-99a`).

| Trường | Kết luận | Ghi chú |
| --- | --- | --- |
| `beneficiaryEmployeeIds`, `items[].planId`, `businessReason`, `termMonths` | BỎ (theo op) | — |
| `items[].expectedSpendOn` | BỎ | thêm lý do `QĐ-98a` |
| `expectedEndDate` (một ngày cho **mọi** người của lần gửi) | BỎ | sai cả mô hình: một ngày áp chung cho mọi nhà thầu |
| `termConfirmation.reason` | BỎ | US-05-01 AC-4 |

`grantQueueList` (cùng tag, IT Admin) GIỮ. Response `requestSchema.delegatedBatchId` (`access-request.dto.ts:213`) BỎ theo. FE: `manager/team-requests/views/manager-create-employee-request-view.tsx` (form "tạo Request cho nhân viên" với `usageStartDate/usageEndDate`, :31, :252-263) phải bỏ hoặc chuyển thành form nhóm.

### 2.10 `accessRequestRenewalSubmit` — `POST /access-requests/renewals` (Request tiếp tục sử dụng)

- Vai theo QĐ: chính người giữ quyền trong cửa sổ 30 ngày (`QĐ-100t`, `QĐ-62h`); trưởng phòng chỉ gửi **Request tiếp tục nhóm** ≥ 2 người cùng gói (`QĐ-100ab`). Guard: `checkRenewalSender` cho phép **trưởng phòng gửi cho một người** (`renewal-request/renewal-request.policy.ts:39-50`) → sai vai.
- DTO `renewal-request/renewal-request.dto.ts:15-22`.

| Trường | Biết? | Logic | Suy ra? | Kết luận | Căn cứ | FE |
| --- | --- | --- | --- | --- | --- | --- |
| `assignmentId` | Có | `renewal-seat-facts.service.ts` khóa ghế | — | GIỮ | US-05-14 | — |
| `newExpectedEndDate` | Có nhưng sai dạng: nghiệp vụ hỏi "thời gian dùng thêm" | `renewal-request-writer.service.ts:58-60` (term = `monthsBetween(previousEnd, newEnd)`), trần 120 (`renewal-request.service.ts:90-95`) | Ngày kết thúc mới suy ra được từ số tháng | **ĐỔI** → `extensionMonths` (1..12); server tính ngày mới = ngày sau ngày hết hạn hiện tại + số tháng, cắt ở 31/12 với thuê bao linh hoạt | `QĐ-98a(1)`, MF-1 1.1 "nhập thời gian dùng thêm", US-05-14 AC-3 | chưa có form FE |
| `businessReason` | Có | — | — | GIỮ | BM-01 | — |
| `expectedSpendOn` | Không | `renewal-request-writer.service.ts:71` | Có | **BỎ** | `QĐ-98a` | — |
| `termConfirmation.reason` | Không còn nghĩa | `renewal-request-writer.service.ts:61-64` | — | **BỎ** | US-05-14 AC-3 viết lại | — |
| (ngầm định) người gửi = trưởng phòng cho một người | — | `renewal-request-writer.service.ts:93-99`: trưởng phòng gửi ⟹ bước nhu cầu tự xác nhận và **tự áp dụng ngay** nếu không có bước chi | — | **CHUYỂN BƯỚC** → chỉ qua Request tiếp tục nhóm (`QĐ-100ab`, ≥ 2 người, luôn qua Người duyệt chi — `QĐ-100w`) | `QĐ-100t`, `QĐ-100ab`, US-05-14 AC-10, AC-17 | — |

### 2.11 `accessRequestPropose` — `POST /access-requests/proposals` (BM-02, nhánh c)

- Vai: Employee (`FR-3.4(c)`). Guard: chặn Super Admin. DTO `assessment/assessment.dto.ts:31-41`.

| Trường | Kết luận | Căn cứ / logic |
| --- | --- | --- |
| `softwareName`, `homepageUrl`, `purpose`, `dataDescription`, `expectedUsers` | GIỮ | BM-02 (tên, mục đích, loại dữ liệu, số người dùng); `expectedUsers` chỉ là thông tin cho IT (`assessment/proposal.service.ts:83,99`), không vào giá (giá theo người thụ hưởng — `assessment/repricing.service.ts:14-17`) |
| `termMonths` | ĐỔI (≤ 12) | `QĐ-98a` |
| `expectedSpendOn` | **BỎ** | `proposal.service.ts:44`, `request-facts.service.ts:176` |

### 2.12 Nhóm thẩm định của IT Admin (`accessRequestAssessmentSave` PUT, `…Complete`, `…Reject`, `…InternalRegister`, `…CatalogLink`)

- Vai: IT Admin, không cho Request của chính mình (`OWN_REQUEST`). Khớp `SBF-15`, `FR-3.19`. DTO `assessment/assessment.dto.ts:58-118`.

| Op | Trường | Kết luận | Ghi chú |
| --- | --- | --- | --- |
| AssessmentSave | `classification`, `vendorId`, `vendorName`, `plannedPlanName`, `provisioningType`, `adminConsole`, `memberExport`, `sso`, `termsSummary`, `memberUsageMethod`, `grantRevokeMethod`, `dataSensitivity`, `opinion{status,note}`, `equivalentPlanId`, `proposedBusinessOwnerEmployeeId`, `controlLevel`, `controlRiskNote`, `quote{unitPrice, billingCycle, validFrom, validUntil, commitmentMonths, paymentFrequency, firstPaymentOn}` | GIỮ (18 nhóm) | Đều là nội dung BM-02 do IT hoàn thiện (`QĐ-53c`, `QĐ-82n`, `FR-1.9/1.10`, `FR-3.20` ngày hiệu lực báo giá). `quote.firstPaymentOn` là dữ liệu bằng chứng giá (đúng vai IT), còn fallback của nó đang là `expectedSpendOn` (`assessment/quote-pricing.policy.ts:74`) → đổi fallback sang ngày duyệt chi khi bỏ `expectedSpendOn`. *Có thể thiếu* cờ thuê bao linh hoạt/cam kết kỳ của BM-02 (`FR-1.3`) — để V3/A3 xác nhận. |
| AssessmentComplete | (không body) | GIỮ | — |
| AssessmentReject | `kind`, `reason`, `alternativePlanId`, `alternativeNote` | GIỮ | `FR-3.19`: lý do bắt buộc + phương án thay thế |
| InternalRegister | `businessOwnerEmployeeId`, `softwareName`, `dataSensitivity`, `spend.quote` | GIỮ | `QĐ-50a`, US-05-20 AC-10 (khoản chi kèm theo) |
| CatalogLink | `planId` | GIỮ | US-05-06 AC-8 |

### 2.13 `accessRequestWithdraw`, `accessRequestCancelForDeparture`

| Op | Vai | Trường | Kết luận | Căn cứ |
| --- | --- | --- | --- | --- |
| Withdraw | người yêu cầu/thụ hưởng; trưởng phòng ở chặng của mình | `reason` (bắt buộc với trưởng phòng — `access-request.dto.ts:311`) | GIỮ | US-05-08, `QĐ-77g`, `QĐ-82l(15)` |
| CancelForDeparture | IT Admin | `cause`, `note`, `evidence` | GIỮ | US-03-04 AC-25; `cause` được server kiểm (`cancellation/cancellation.policy.ts:28`) |

### 2.14 `accessRequestServiceAccountSubmit`, `accessRequestServiceAccountReview`

- Vai: Employee sẽ chịu trách nhiệm (`QĐ-77h`); IT Admin kiểm ranh giới, không tự xét tài khoản của mình (`PROVISIONING.ANOTHER_IT_ADMIN_NEEDED`). Khớp. DTO `service-account-request/service-account-request.dto.ts:14-38`.

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `planId`, `purpose`, `expectedIdentifier`, `businessReason` | GIỮ | `QĐ-77h`: gói, mục đích phi con người, định danh dự kiến; người chịu trách nhiệm = người gửi (server tự lấy, đúng) |
| `termMonths` | ĐỔI (≤ 12) | `QĐ-98a` |
| `expectedSpendOn` | **BỎ** | `service-account-request.service.ts:76` |
| Review: `decision`, `reason` | GIỮ | `QĐ-75c` |

### 2.15 `returnRequestSubmit`, `returnRequestHandoverConfirm`

- Vai: người giữ ghế, hoặc trưởng phòng xác nhận *không còn nhu cầu* (BM-03, `SBF-03a` — không thuộc `QĐ-100t` vì không phải Request cấp). Guard khớp. DTO `return-request/return-request.dto.ts:18-22`.

| Trường | Kết luận | Căn cứ / logic |
| --- | --- | --- |
| `assignmentId`, `reason` | GIỮ | BM-03 |
| `fromRequestId` | **SERVER TÍNH** | server chỉ chấp nhận khi trùng `grantRequestId` của chính ghế (`return-request/return-request.policy.ts:75`) ⟹ suy ra được từ `assignmentId`; giữ cột `origin_request_id` nhưng tự gắn. Ưu tiên thấp. |
| HandoverConfirm (không body) | GIỮ | `QĐ-63a` |

### 2.16 `stepCongestionIncidentRecord`

| Trường | Kết luận | Căn cứ |
| --- | --- | --- |
| `holderEmployeeId` (nullable), `description` | GIỮ | US-05-10; Super Admin ghi sự cố nghẽn (`sla/congestion.dto.ts:16-19`) |

### 2.17 GET đáng chú ý (query/response)

| Op | Nhận xét | Kết luận |
| --- | --- | --- |
| `groupRequestCandidateList` | Chỉ trả `employeeId, fullName, workEmail`, loại Người duyệt chi và người không đủ điều kiện (`group-candidate.service.ts`) — đúng `QĐ-82l(18)`. Nhưng vì vậy người gửi **không thể biết** ai cần "ngày kết thúc". | GIỮ; hệ quả cho Q1 |
| `needDecisionList` `type` | enum `GRANT/SERVICE_ACCOUNT/RENEWAL/GROUP_GRANT` | GIỮ; mở rộng khi có loại mới (`QĐ-100ab/ac/ad`) |
| `requestablePlanList/Get` | Không lộ giá, seat, ngân sách (đúng US-05-01 AC-3). Thiếu thông tin để FE biết hạn tối đa (cam kết kỳ vs linh hoạt) | GIỮ; đề xuất preview trả `termLimit` do server tính (mục 4) |
| `accessRequestSimilarSeatList` `employeeId`, `grantQueueList` `beneficiaryEmployeeId`, `serviceAccountDutyList`, `controlledWaitList`, `stepCongestion*`, `assessmentQueueList`, `accessRequestTimingsGet`, `returnRequestList/Get`, `accessRequestDraftList` | query phân trang/lọc hợp lý | GIỮ |

## 3. Nghi vấn logic

| ID | Mức | Nghi vấn | Bằng chứng | Căn cứ | Đề xuất tối thiểu |
| --- | --- | --- | --- | --- | --- |
| **L1** | Cao | **Server tin ngày chi do client gửi** để chọn **năm ngân sách** và **lịch thanh toán**; không chặn ngày quá khứ (năm đã đóng) hay năm sau; trưởng phòng đổi được ngày ở bước nhu cầu ⟹ dời Request sang năm khác/khỏi kiểm tra năm hiện hành. | `access-request/request-facts.service.ts:246`, `pricing.policy.ts:60,72`, `assessment/need-spend.service.ts:44-68`, `group-request-submission/group-submission-facts.service.ts:91` | `QĐ-98a(1)`, `QĐ-100n`, `QĐ-97g` | Bỏ input; năm = tạm tính theo ngày trình lô, tính lại theo ngày duyệt chi; lịch thanh toán bắt đầu từ ngày duyệt chi (hoặc `firstPaymentOn` của báo giá). Cột `expected_spend_on` thành giá trị server ghi (hoặc bỏ). |
| **L2** | Cao | **Thời hạn quyền không do server tính**: Assignment chỉ có ngày kết thúc khi client gửi `expectedEndDate` (chỉ nhà thầu/thực tập sinh); nhân viên chính thức nhận quyền **không hạn** dù Request tính tiền cho `termMonths` ⟹ (a) dùng quá phần đã duyệt chi; (b) Request tiếp tục **không gửi được** (`NO_END_DATE`); (c) ngày client gửi không đối chiếu với `termMonths` (có thể dài hơn thời hạn đã tính tiền). | `grant/grant.policy.ts:40-60,117`; `renewal-request/renewal-request.service.ts:86-88`; `renewal-request.policy.ts:78` | `QĐ-98a`, `QĐ-62h`, `C-10`, US-05-14 AC-1/AC-9, `INV-07` | Khi cấp: ngày kết thúc = ngày bắt đầu (ngày duyệt chi, hoặc ngày duyệt nhu cầu với Request không qua chi) + `termMonths`, cắt 31/12 với thuê bao linh hoạt; ngày hợp đồng (nếu có, Q1) chỉ được rút ngắn. Phụ thuộc Q2. |
| **L3** | Cao | **Không có trần 12 tháng**: `termMonths` tới 120, vượt 12 chỉ cần một dòng "giải trình"; thuê bao linh hoạt không bị cắt ở 31/12. | `access-request/access-request.dto.ts:9`; `need-decision.policy.ts:10,49-52`; `group-request/group-request.policy.ts:127-132`; `renewal-request-writer.service.ts:61-64`; không có luật 31/12 trong `requests` (grep) | `QĐ-98a`, `QĐ-99g`, US-05-01 AC-4, US-05-04 AC-6, US-05-14 AC-3 | Trần 12 ở intake (422 có lý do), luật 31/12 theo `allowsMidTermReduction` của thuê bao; bỏ toàn bộ `termConfirmation`. |
| **L4** | Cao | **Đường "gửi thay một người" còn mở ba cửa**: `delegatedRequestSend` (mỗi người một Request); gia hạn do trưởng phòng gửi cho một người và **tự áp dụng ngay** khi không có bước chi (không ai duyệt); Request nhóm 1 dòng (không kiểm ≥ 2). | `delegated-request/delegated-request.dto.ts:12-56`; `renewal-request.policy.ts:39-50`, `renewal-request-writer.service.ts:93-99`; `group-request.dto.ts:30-33` | `QĐ-100t`, `QĐ-100aa`, `QĐ-100ab`, `QĐ-100w` | Bỏ op gửi thay và nhánh `byHead` của gia hạn; tối thiểu 2 dòng cho nhóm (Q3). |
| **L5** | Trung bình | **Override của Người duyệt chi còn được nhận** (kèm danh sách năm client tự nêu) ở quyết định chi theo dòng. | `group-request/group-decision.dto.ts:72-96`; ví dụ lỗi `OVERRIDE_*`, `RECHECKED_NEEDS_FINANCE_REVIEW` ở `group-line-decisions/group-lines.controller.ts` | `QĐ-97c`, MF-1 1.7 | Bỏ `override`; phối hợp V2/A1 (Finance rà soát cũng bỏ). |
| L6 | Trung bình | Gia hạn tính lịch thanh toán từ `expectedSpendOn ?? hôm nay`, không từ ngày sau ngày hết hạn hiện tại; cửa sổ 30 ngày trước ngày kết thúc không được kiểm (chỉ kiểm "trước/sau ngày kết thúc"). | `renewal-request-writer.service.ts:66-71`; `renewal-request.policy.ts` `routeRenewal` | `QĐ-98a(1)`, US-05-14 AC-7 | Lịch từ `previousEnd + 1`; thêm luật cửa sổ (tham số `FR-8.2`). Để A2. |
| L7 | Trung bình | Dòng kế hoạch được gắn theo `budgetYear` lấy từ `expectedSpendOn`; khi bỏ ngày, năm phải là năm tạm tính — nhưng dòng gắn **ở bước nhu cầu** còn năm tạm tính tính **lúc trình** (`QĐ-100n`); duyệt nhu cầu tháng 12, trình tháng 1 ⟹ dòng thuộc phiên bản năm cũ. | `plan-line/plan-line.service.ts:37-42`; `spend-submission/plan-line-route.service.ts:85` | `QĐ-82l(5)`, `QĐ-100n` | Xem Q4. |
| L8 | Thấp | Trưởng phòng **phải gõ tay số thứ tự dòng** kế hoạch; FE ghi "vai trò này không có quyền xem gợi ý" dù route gợi ý mở cho `MANAGER`. | FE `need-decision-form.tsx:181-194`, `vi/approvals-need.ts:31-33`; BE `spend-submission.controller.ts:203-204` | `QĐ-100p`, US-05-04 AC-12 | FE chọn từ danh sách gợi ý; BE không đổi. |
| L9 | Thấp | Người duyệt chi quyết nhu cầu dòng 2 ⟹ Request đi `DIRECT` vào kiểm tra, bỏ qua hàng đợi trình của trưởng phòng. | `spend/spend-submission.policy.ts:53-55` | `QĐ-82l(10)`, `QĐ-82l(11)` (nhóm do trưởng phòng gửi vào hàng đợi trình ngay khi tạo) | Để A2 xác minh với ca nhóm; phần cá nhân của trưởng phòng phụ thuộc `QĐ-100l` (chờ mentor). |

## 4. Response lộ dữ liệu / trường response lỗi thời

**Lộ dữ liệu vượt phạm vi vai**

- `groupRequestCheck` trả lý do theo dòng `END_DATE_REQUIRED`/`END_DATE_TOO_EARLY` (`group-request/group-request.dto.ts:40-49`) ⟹ Employee gửi nhóm **suy ra được đồng nghiệp là nhà thầu/freelancer/thực tập sinh** — trái tinh thần `QĐ-82l(18)` (chỉ họ tên + email). Hết khi bỏ input ngày (Q1).
- `accessRequestLineList`: người gửi (kể cả Employee) thấy mọi dòng gồm `expectedEndDate`, `cost`, `share`, lý do từ chối của từng đồng nghiệp (`group-line-decisions/group-line-query.service.ts:105,133-139`). Mức thấp; đề xuất Employee gửi chỉ thấy trạng thái + lý do của dòng mình, các dòng khác chỉ trạng thái — cần Owner xác nhận nếu muốn siết (không đưa vào câu hỏi vì không có QĐ trực tiếp; ghi để pha spec cân nhắc).

**Trường/enum response nên bỏ theo QĐ-97 → 100** (`access-request/access-request.dto.ts`)

| Trường | Dòng | Kết luận | Căn cứ |
| --- | --- | --- | --- |
| `expectedSpendOn` (Request, preview `request-preview.dto.ts:64`) | 272 | BỎ (hoặc đổi tên `tentativeStartOn` nếu FE cần hiện năm tạm tính) | `QĐ-98a` |
| `budgetYear` | 273 | GIỮ, mô tả lại: "năm tạm tính lúc trình, tính lại lúc duyệt" | `QĐ-100n` |
| `delegatedBatchId` | 213 | BỎ | `QĐ-100t` |
| `expectedEndDate` (mức Request) | 215 | Theo Q1/Q2 (thành ngày kết thúc server tính) | `QĐ-98a` |
| `needDecision.termConfirmationReason` | 126 | BỎ | US-05-04 AC-6 |
| `state`: `AWAITING_FINANCE_REVIEW`, `AWAITING_BUDGET` | 163-164 | BỎ (chỉ sinh từ Finance rà soát `finance-review/finance-review-writer.service.ts:66`) | `QĐ-97c` |
| `spend.stage`: `RETURNED_BY_FINANCE`, `WAITING_FINANCE_REVIEW`, `WAITING_BUDGET`; `spend.financeReturnReason` | 259-266 | BỎ | `QĐ-97c` |
| `needDecision.deciderRole` / dòng `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE` | 124; `group-request.dto.ts:94` | Giữ đọc lịch sử chỉ khi DB còn bản ghi cũ; không thì BỎ | `QĐ-93c`, `QĐ-93d` |
| Mới (SERVER TÍNH): `termLimit` trong preview (hạn tối đa: 12 tháng hoặc tới 31/12) | — | THÊM | `QĐ-98a`, `QĐ-99g` — để FE không phải tự biết loại thuê bao |

## 5. Câu hỏi cho Owner

### Q1 — Ai cung cấp ngày kết thúc của nhà thầu/freelancer/thực tập sinh? (`lines[].expectedEndDate`, `expectedEndDate` của Request)

- **Bối cảnh:** `FR-2.8`/`INV-07` bắt buộc quyền của nhà thầu, freelancer, thực tập sinh có ngày kết thúc dự kiến; US-05-17 AC-8 đặt ô này cho **người gửi nhóm**. Nhưng (1) Employee gửi nhóm chỉ thấy họ tên + email (`QĐ-82l(18)`) nên không biết ai là thực tập sinh và không biết ngày hết hợp đồng; (2) hồ sơ nhân viên có `employmentType` nhưng **không có** ngày kết thúc hợp đồng (`prisma/models/organization.prisma:238-251`); (3) theo `QĐ-98a` mọi Request đã có thời hạn ≤ 12 tháng tính từ ngày duyệt chi, nên quyền nào cấp qua Request cũng sẽ có ngày kết thúc (xem Q2).
- **Ví dụ:** `E1` gửi nhóm Figma cho `E1`, `E2`, `E3`; `E3` là thực tập sinh hết hợp đồng 31/08. Hiện `E1` phải tự điền 31/08 cho `E3`, không điền thì bị từ chối với lý do lộ ra `E3` là thực tập sinh.
- **Thực tế bên ngoài:** SailPoint Identity Security Cloud cho người yêu cầu đặt *removal (sunset) date* tùy chọn, không có cơ chế bắt buộc sẵn ([API](https://developer.sailpoint.com/docs/api/create-access-request-v-1), [cộng đồng](https://developer.sailpoint.com/discuss/t/mandatory-sunset-date/87333)); Okta Identity Governance để quản trị viên đặt **thời hạn tối đa**, người yêu cầu chọn thời lượng trong trần ([Okta Help](https://help.okta.com/en-us/Content/Topics/identity-governance/access-requests/rcar-condition-create.htm)). Ngày hết hợp đồng thường lấy từ hệ thống nhân sự, IGA tự thu hồi theo vòng đời người dùng (hiểu biết chung, chưa kiểm một nguồn cụ thể).
- **Phương án:**
  - **A.** Giữ ô ở người gửi, nhưng API ứng viên trả cờ `endDateRequired` (không trả loại hợp đồng). Hệ quả: vẫn bắt người gửi nhập dữ liệu nhân sự mình không có; ít sửa.
  - **B.** Super Admin ghi *ngày kết thúc hợp đồng* trên hồ sơ (FR-2.1, `QĐ-87`); server lấy ngày kết thúc quyền = min(ngày hết hợp đồng, ngày bắt đầu + `termMonths`). Hệ quả: đúng chủ sở hữu dữ liệu, không lộ; cần migration cột hồ sơ + form Super Admin + dòng file nhân sự.
  - **C.** Bỏ ô; mọi quyền kết thúc theo thời hạn Request (Q2), `INV-07` thỏa vì mọi quyền đều có hạn ≤ 12 tháng; nhà thầu nghỉ sớm thì đi `MF-2` như mọi người nghỉ. Hệ quả: đơn giản nhất, không dữ liệu cá nhân; quyền có thể sống quá ngày hết hợp đồng tới khi Super Admin ghi nghỉ việc.
- **Khuyến nghị:** **C** cho MVP (khớp `QĐ-98a`, bỏ trường lạ khỏi form nhân viên), để ngỏ **B** khi cần chính xác theo hợp đồng. Phụ thuộc: 2.7 (`lines[].expectedEndDate`), 2.9, L2, mục 4 (`expectedEndDate`).

### Q2 — Quyền cấp qua Request có luôn kết thúc theo thời hạn của Request?

- **Bối cảnh:** `QĐ-98a`/`C-10`: thời hạn bắt đầu từ ngày duyệt chi; `QĐ-62h`: "mọi quyền có thời hạn đã duyệt" muốn dùng thêm thì gửi Request tiếp tục. Code hiện **không** ghi ngày kết thúc cho nhân viên chính thức (L2), nên Request tiếp tục chỉ dùng được cho nhà thầu. US-05-14 AC-9 có ví dụ "Jira không có ngày kết thúc" — chưa rõ đó là quyền từ khởi tạo hay quyền cấp qua Request.
- **Ví dụ:** `E1` xin Figma 6 tháng, duyệt chi 15/01 ⟹ phòng bị trừ 6 tháng tiền; hiện quyền của `E1` không có ngày kết thúc, tháng 7 không có cửa sổ tiếp tục, không ai nhắc, seat vẫn chiếm.
- **Thực tế bên ngoài:** Okta/SailPoint gắn thời hạn quyền ngay khi cấp theo thời lượng đã duyệt (nguồn như Q1).
- **Phương án:**
  - **A.** Mọi Request (gồm nội bộ không phí, tài khoản dịch vụ) ⟹ ngày kết thúc = ngày bắt đầu + `termMonths` (cắt 31/12 nếu linh hoạt). Hệ quả: đúng BM-01 (mọi Request có thời hạn), đặc quyền tối thiểu; thêm việc gia hạn cho phần mềm nội bộ.
  - **B.** Chỉ phần mềm trả phí có ngày kết thúc; nội bộ không phí và quyền khởi tạo không hạn. Hệ quả: gắn hạn với tiền đã duyệt; nội bộ ít nhắc hơn.
  - **C.** Giữ hiện trạng (chỉ nhà thầu). Hệ quả: trái `QĐ-98a`, `QĐ-62h`; Request tiếp tục gần như không dùng được.
- **Khuyến nghị:** **B** (tiền đã duyệt cho đúng thời hạn ⟹ quyền phải dừng hoặc tiếp tục bằng Request mới); nếu Owner muốn đặc quyền tối thiểu cho cả nội bộ thì A. Phụ thuộc: L2, L6, 2.10, Q1.

### Q3 — Request nhóm của **nhân viên** có cần tối thiểu 2 người không? (`lines[]` min)

- **Bối cảnh:** `QĐ-100aa` chỉ nói nhóm của trưởng phòng ≥ 2. Nhưng `QĐ-100t` nói Request cho **một** người chỉ do chính người đó gửi; DTO hiện `min(1)` cho mọi người gửi.
- **Ví dụ:** `E1` gửi "Request nhóm" chỉ có một dòng là `E2` ⟹ thực chất `E1` gửi thay `E2`. Nhóm một dòng là chính `E1` ⟹ trùng Request cá nhân.
- **Thực tế bên ngoài:** ServiceNow cho đặt "Request for" người khác tùy cấu hình catalog item — không có chuẩn chung (không chắc nguồn).
- **Phương án:** **A.** Tối thiểu 2 dòng cho mọi Request nhóm (lỗi nghiệp vụ có lý do). **B.** Nhân viên được 1 dòng nhưng dòng đó phải là chính mình. **C.** Giữ 1 dòng.
- **Khuyến nghị:** **A** — đóng cửa gửi thay qua nhóm, một luật cho mọi người gửi. Phụ thuộc: 2.7, L4.

### Q4 — Dòng kế hoạch gắn theo năm nào khi năm của Request chỉ tạm tính lúc trình? (`spend.planLine.position` × `QĐ-100n`)

- **Bối cảnh:** Trưởng phòng gắn dòng kế hoạch **khi duyệt nhu cầu** (`QĐ-82l(5)`), dòng thuộc phiên bản ngân sách của một năm; năm của Request tạm tính **lúc trình lô** và tính lại lúc duyệt chi (`QĐ-100n`).
- **Ví dụ:** `H1` duyệt nhu cầu 28/12/2026 và gắn dòng *Figma 10 seat* của phiên bản 2026; trình lô 05/01/2027 ⟹ năm tạm tính 2027, dòng đã gắn thuộc năm cũ.
- **Phương án:** **A.** Lúc trình, nếu năm tạm tính khác năm của dòng ⟹ Request dừng ở hàng của trưởng phòng với lý do `PLAN_LINE_REQUIRED`, gắn lại (dùng `PUT /plan-line` sẵn có). **B.** Giữ dòng cũ, chỉ gắn cờ *lệch năm* cho Người duyệt chi (dòng chỉ là thông tin). **C.** Chuyển việc gắn dòng sang lúc trình (CHUYỂN BƯỚC) — trái `QĐ-82l(5)`, US-05-04 AC-12.
- **Khuyến nghị:** **A** — giữ đúng `QĐ-82l(5)` và `QĐ-100n`, ít sửa (chỉ thêm một điều kiện trong kiểm khi trình). Phụ thuộc: L7, 2.4, 2.5.

## 6. Rủi ro / ghi chú cho pha spec

- **Tương thích API:** các DTO là `z.strictObject` ⟹ client cũ còn gửi `expectedSpendOn`/`termConfirmation`/`override` sẽ nhận **400/422**. FE thật chỉ gọi `accessRequestNeedDecide`, `accessRequestLineNeedDecide`, `spendApprovalLineDecide` trong số op bị đổi (thống kê import `shared/api/generated/operations/*`); form gửi Request của employee/manager vẫn dùng dữ liệu demo. Cần sửa `need-decision-form.tsx`, `spend-decision-form.tsx`, form manager "tạo Request cho nhân viên", rồi sinh lại client (`orval.config.ts`) và tài liệu API-Integration (`flows/paid-access-request.md`, `roles/manager.md`, `reference/*`, glossary).
- **Migration:** `access_requests.expected_spend_on`, `delegated_batch_id`, `expected_end_date`, `access_request_lines.expected_end_date`, `approval_records.term_confirmation_reason`, `request_supplements.before/after_expected_spend_on` (`prisma/models/requests.prisma:161,178,180,290,408,716-719`). Đề xuất pha 1 chỉ ngừng nhận input và để server ghi (không xóa cột), pha sau mới drop. Ngày kết thúc server tính (L2) ghi vào `license_assignments.expected_end_date` sẵn có (`prisma/models/licensing.prisma:43`).
- **Bản nháp cũ:** JSON nháp đã lưu chứa trường bị bỏ ⟹ codec `request-draft-policy.json.ts` phải bỏ qua, nếu không gửi nháp sẽ lỗi strict.
- **Test/seed bị ảnh hưởng (đếm file):** `expectedSpendOn` 8 spec + 9 test + 1 seed/script; `termConfirmation` 4 spec + 10 test; `delegated-requests` 6 test; `expectedEndDate` 18 spec + 23 test; `override` 26 spec + 61 test + 4 seed/script (một phần thuộc bước chi — V2).
- **Phụ thuộc agent khác:** L5 và các enum Finance ở mục 4 trùng phạm vi V2/A1; L2/L6 chạm licensing (A3); loại Request mới (`QĐ-100ab/ac/ad`) và luật cửa sổ 30 ngày là việc của A2. `QĐ-100l`/`QĐ-100ah`: chỉ ghi nhận hiện trạng (trưởng phòng vẫn tự gửi cá nhân được, preview `HEAD_ASKS_FOR_SELF`, gửi thay có phần của chính trưởng phòng) — **không** đề xuất code.
