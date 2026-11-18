# Spec: qd103-request-single-step-routing — Request một bước (trưởng phòng tự gửi, phòng không có trưởng phòng và chưa có kế nhiệm), chuyển một bước khi mất trưởng phòng, nội bộ cấp thẳng

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.3`, `FR-3.4` nhánh (a)(b), `FR-3.6`, `FR-3.13`, `FR-3.19`, `FR-3.20` _Request một bước_,
  `FR-3.21`, `BR-MF1-02`, `BR-MF1-04`, `BR-MF1-05`; `QĐ-103b`, `QĐ-103o`, `QĐ-103p`, `QĐ-103u`(2)(7)(8), `QĐ-104f`, `QĐ-104l`,
  `QĐ-106h`(1), `QĐ-62c`, `QĐ-53c`; QT v1.7 mục 1.2, 1.4, 1.6, 1.7; L1 MF-1 bước 2 _không còn trưởng phòng **và chưa có kế
  nhiệm**_), BE `1cd81101`. Ledger: L2-01, L2-02, L2-03, L2-15, L2-34, L2-06 (vế `HEAD_IN_GROUP`); luật R-A07→R-A12, R-B06,
  R-B07 (vế một bước). Câu chọn: Q-06 = B; Q-24 (cải tiến), Q-25, Q-31, Q-33 (mới).
- Nhóm roadmap: G5 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Request của **trưởng phòng cho chính mình**, hoặc của **phòng không có trưởng phòng và chưa ghi kế nhiệm**, là _Request một bước_:
không bước nhu cầu, không vào lô; phần mềm trả phí được **kiểm ngân sách ngay khi gửi** rồi Người duyệt chi quyết **một lần** gộp
nhu cầu và chi, tự quyết khi có cờ _dùng dự phòng_; bị chặn (khi gửi hoặc lúc duyệt) ⟹ _chờ người yêu cầu sửa_, người yêu cầu bổ
sung rồi **gửi lại** hoặc rút (Q-06 = B). Phần mềm nội bộ không phí ⟹ IT cấp thẳng, cờ audit _không có người duyệt nhu cầu_. Định
tuyến **chốt lúc gửi**. Phòng **mất** trưởng phòng không có kế nhiệm ⟹ mọi Request **trả phí** đang ở chỗ trưởng phòng chuyển thành
Request một bước. Request nhóm không chứa trưởng phòng. Không còn _cùng người hai bước_. IT từ chối phần mềm _không kiểm soát được_
phải kèm phương án thay thế.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (đợt W3). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `grouped-stories`.
- Outcome and owner: lõi `requests/access-request` (`routing.policy.ts`, `access-request.policy.ts`) sở hữu bảng định tuyến;
  `request-intake`, `group-request-submission`, `renewal-request`, `service-account-request`, `assessment` gửi theo bảng;
  `requests/spend` mở bước một bước; `requests/reassignment` chuyển khi mất trưởng phòng và hoàn tất chuyển (sweep).
- Boundaries: 2 migration (enum, rồi cột + đánh dấu dữ liệu Q-24); 1 operation mới (`accessRequestResubmit`); đổi DTO ~15
  operation; không đổi bảng ngân sách; không thêm file vào `access-request/` (đủ 25).
- Not larger: GH-1/2/3 và danh sách ứng viên nhóm ở `qd103-request-limits-gh`; ba kết quả + xác nhận dự phòng ở
  `qd103-budget-check-three-outcomes`; báo cáo Super Admin (`US-05-24` AC-4) ở W8.
- Not smaller: kiểm khi gửi, bước một bước, trả về người yêu cầu và chuyển khi mất trưởng phòng dựa trên **một** cột định tuyến
  và **một** trạng thái mới; tách ra thì có Request một bước không có đường sửa. Giao code chia 4 lượt (plan).
- Siblings: `qd103-budget-check-three-outcomes`, `qd103-request-amount-and-term`, `qd103-commitment-current-year` (trước);
  `qd103-request-limits-gh` (sau).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                           | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-03 | AC-2, AC-4, AC-9, AC-13, AC-16, AC-18, AC-19 | partial  | AC còn lại và vế chung theo scope map: `g5-request-submission-and-routing`, `qd93-remove-fallback-substitute-approvers`, `g5-spend-submission-batches`, `g5-step-reassignment-and-controlled-wait`, `g5-delegated-requests`, `g5-group-requests`, `qd103-request-limits-gh`, `qd93-unplaced-employee-first-placement` |
| US-05-24 | AC-1→AC-3, AC-5, AC-6                        | partial  | AC còn lại và vế chung theo scope map: `qd103-request-history-by-role`                                                                                                                                                                                                                                                |
| US-06-17 | AC-1→AC-13                                   | partial  | AC còn lại và vế chung theo scope map: `qd103-commitment-current-year`                                                                                                                                                                                                                                                |

## Supporting references

`US-06-17` AC-1→AC-13; `US-05-03` AC-2, AC-4, AC-9, AC-13, AC-16, AC-18, AC-19; `US-05-02` AC-18; `US-05-24` AC-1→AC-3, AC-5,
AC-6; `US-06-12` AC-30, AC-31; `US-06-14` AC-8, AC-18, AC-20; `US-06-16` AC-7, AC-10; `US-05-14` AC-16; `US-05-18`. Spec cũ
`qd96-100-request-sender-rules`, `-head-group-request-queue` chỉ đọc tham khảo (bỏ: chặn trưởng phòng tự gửi, dòng trưởng phòng trong nhóm).

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L2-01, L2-02, L2-03, L2-15, L2-34, L2-06 (vế `HEAD_IN_GROUP`) — gỡ chặn `qd103-request-limits-gh`, W8 `qd103-request-history-by-role`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

- Báo cáo Super Admin (`US-05-24` AC-4) — cờ audit ghi ở đây, màn đọc ở W8. Ghost seat/bàn giao chờ trưởng phòng — giữ nguyên.
- GH-1/GH-2/GH-3 và `groupRequestCandidateList` không liệt kê trưởng phòng — `qd103-request-limits-gh`.

## Dependencies and blockers

Sau `qd103-request-amount-and-term`, `qd103-budget-check-three-outcomes`, `qd103-commitment-current-year`. Đọc _kỳ trưởng phòng kế
tiếp đã ghi_ cần hàm mới `OrganizationReadApi.nextHeadPeriodOf(departmentId, afterDate)` (chưa có; `organization-read.api.ts`) và
chuyển đổi chạm `reassignment/organization-change.listener.ts` ⟹ **sau commit W2** cho `organization` (DA3-16). Thứ tự W3: thứ tư.

## Ownership: module, data, API

- Migration A `<ts>_request_one_step_values`: `CREATE TYPE "RequestRoutingMode" AS ENUM ('VIA_HEAD','ONE_STEP')`;
  `AccessRequestStepState` + `NOT_REQUIRED`; `AccessRequestState` + `AWAITING_REQUESTER_REVISION` (mẫu `20261108300000_licensing_renewal_stale_state`).
- Migration B `<ts>_request_one_step`: `access_requests.routing_mode RequestRoutingMode NOT NULL DEFAULT 'VIA_HEAD'`, `one_step_reason
text NULL` CHECK ∈ `{REQUESTER_IS_HEAD, NO_DEPARTMENT_HEAD, HEAD_LEFT}`, CHECK `(routing_mode = 'ONE_STEP') = (one_step_reason IS NOT
NULL)`; index `(department_id, routing_mode, state)`; drop `access_request_steps.same_person_as_spend`, `no_independent_review`
  (L2-15); đánh dấu dữ liệu Q-24 (mục 10). Cột `routing_mode` **thắng** `policy.chain` v1 của Request cũ khi đọc (DA3-15).
- File chính: `access-request/routing.policy.ts` (+ spec), `access-request/access-request.policy.ts` (`policyFor` nhận `routing`,
  `CURRENT_POLICY_VERSION = 2`), `access-request/access-request.repo.ts`, `access-request/routing-facts.service.ts` (+ _có kỳ trưởng
  phòng kế tiếp đã ghi_), `request-intake/*`, `request-intake/request-resubmission.service.ts` (mới),
  `group-request-submission/group-need-routing.policy.ts`, `group-request/group-request.policy.ts` (`HEAD_IN_GROUP`, gỡ
  `isHeadOwnLine`), `renewal-request/renewal-request-writer.service.ts`, `service-account-request/*`, `assessment/*`,
  `spend/spend-routing.service.ts`, `spend/spend-entry.service.ts` (gỡ), `spend-approval/*`, `group-line-decisions/*`,
  `reassignment/one-step-conversion.service.ts` (mới), `step-routing/one-step-conversion.policy.ts` (mới),
  `public/step-redetermination-sweep.api.ts`, `status/rules/*`, `need-decision-queue/*`, README `requests`.
- Operation **mới**: `accessRequestResubmit` POST `/api/v1/access-requests/{id}/resubmission` (không body) — chỉ người yêu cầu.
- Operation **đổi**: `accessRequestSubmit`, `accessRequestPropose`, `accessRequestServiceAccountSubmit`, `accessRequestRenewalSubmit`,
  `groupRequestSubmit`, `groupRequestCheck` (`HEAD_IN_GROUP`), `accessRequestDraftSubmit`; `accessRequestGet`, `meAccessRequestList`
  (`routing { mode, oneStepReason }`, `needStep.state` + `NOT_REQUIRED`, state + `AWAITING_REQUESTER_REVISION`, `spend.stage` +
  `RETURNED_TO_REQUESTER`; bỏ `samePersonAsSpend`, `FALLBACK_APPROVER`); `accessRequestLineList` (`needStep.state` + `NOT_REQUIRED`,
  `group-request.dto.ts:104-108` — DA3-10); `needDecisionList`; `spendApprovalList`/`Get` (`routing`); `spendApprovalDecide`/
  `spendApprovalLineDecide`/`spendBatchDecide` (409 `SPEND.RECHECKED_RETURNED_TO_REQUESTER`); `accessRequestSupplementAdd`;
  `accessRequestWithdraw`; `accessRequestAssessmentComplete`; `accessRequestAssessmentReject` (L2-34); `spendQueueList`.

## Behavior and design

1. **Bảng định tuyến** (pure `routeRequest`, thay `routeNeedStep`; facts thêm `successorRecorded`): phòng không có trưởng phòng hiệu
   lực lúc gửi **và không có kỳ trưởng phòng kế tiếp đã ghi** ⟹ `ONE_STEP NO_DEPARTMENT_HEAD` (dòng 4, kể cả Request nhóm của nhân
   viên); không có trưởng phòng nhưng **đã ghi** kế nhiệm ⟹ `VIA_HEAD`, bước nhu cầu `WAITING_CONTROLLED NO_DEPARTMENT_HEAD`, giao
   kế nhiệm ở ngày hiệu lực (Q-25, DA3-08 — cùng nguồn đọc với mục 7); người gửi là trưởng phòng gửi cho chính mình (cá nhân, tiếp
   tục, đề xuất, tài khoản dịch vụ) ⟹ `ONE_STEP REQUESTER_IS_HEAD` (dòng 2); Request nhóm do trưởng phòng gửi ⟹ `VIA_HEAD`, dòng
   _đã xác nhận_ (dòng 5, vào lô — `QĐ-103o`); còn lại ⟹ `VIA_HEAD` (dòng 1, 9). Không còn dòng 8, `samePersonAsSpend`. Ghi
   `routing_mode`, `one_step_reason`, `policy.chain` v2: nội bộ `['IT_EXECUTION']`; trả phí `['SPEND_APPROVAL','IT_EXECUTION']`;
   phần mềm mới `['IT_ASSESSMENT','SPEND_APPROVAL','IT_EXECUTION']`.
2. **Request nhóm không chứa trưởng phòng (DA3-14, L2-06 vế dòng):** mọi người gửi; dòng là trưởng phòng hiệu lực của phòng hôm nay
   ⟹ lý do `HEAD_IN_GROUP` trong 422 `GROUP_REQUEST.LINES_REFUSED`; gỡ nhánh `own` (`group-need-routing.policy.ts:93-104`) và
   `isHeadOwnLine` (`group-submission-facts.service.ts:129`) **cùng task** bỏ dòng 2 — không có khoảng giữa hai hạng mục.
3. **Bước nhu cầu của Request một bước:** vẫn một hàng `NEED` ở `NOT_REQUIRED`, `routing_row` 2/4, không người giữ, không SLA, không
   bản ghi phê duyệt; audit `ACCESS_REQUEST.NEED_STEP_ROUTED`. Dòng của Request nhóm một bước ở `NEED_CONFIRMED`.
4. **Gửi Request một bước** (cùng transaction gửi): nội bộ ⟹ `AWAITING_EXECUTION`, audit `ACCESS_REQUEST.NO_NEED_APPROVER` —
   `US-05-24`; IT Admin là người yêu cầu không tự cấp (`QĐ-77m`). Trả phí ⟹ `SpendRoutingService.route(…, 'SUBMISSION')` (tính lại
   số tiền trong `run`): `WITHIN_BASE`/`USES_RESERVE` ⟹ bước `SPEND_APPROVAL` (chưa có Người duyệt chi ⟹ `WAITING_CONTROLLED
NO_SPENDING_APPROVER`), không đòi xác nhận, cờ `usesReserve` + _Người duyệt chi tự quyết_; `BLOCKED` ⟹ `AWAITING_REQUESTER_REVISION`,
   báo người yêu cầu (và trưởng phòng nếu có, khác người yêu cầu). **Thiếu giá/tỷ giá (Q-31):** `AWAITING_REQUESTER_REVISION`, **không**
   ghi kiểm tra ngân sách, `spend.blockedReasons = ['PRICE_MISSING'|'RATE_MISSING']` + gợi ý _chờ IT cập nhật giá_, báo IT Admin
   phụ trách phòng. Phần mềm mới ⟹ `AWAITING_IT_ASSESSMENT`; thẩm định xong ⟹ kiểm như trên. 201 trả `spend.stage`/kết quả.
5. **Người duyệt chi quyết một lần** (`spendApprovalDecide`, `spendApprovalLineDecide`): kiểm lại (tính lại trong `run`); `BLOCKED` ⟹
   không lưu, bước `CLOSED`, `AWAITING_REQUESTER_REVISION`, 409 `SPEND.RECHECKED_RETURNED_TO_REQUESTER` (`details.reasons`, `overBy`),
   báo người yêu cầu _tự sửa và gửi lại_; `USES_RESERVE` ⟹ lưu; duyệt ⟹ một bản ghi phê duyệt (vai `SPENDING_APPROVER`, dấu _Request
   một bước_), khoản cam kết năm hiện hành; từ chối ⟹ `REJECTED`. Người khác ⟹ 403 như hiện có (`NOT_THE_ASSIGNEE`, `OWN_REQUEST`).
6. **Sửa và gửi lại (Q-06 = B):** ở `AWAITING_REQUESTER_REVISION` người yêu cầu (a) lập hồ sơ bổ sung (giảm thời hạn / bỏ người)
   qua `accessRequestSupplementAdd`; (b) `accessRequestResubmit`: khóa Request, chạy như mục 4 — giá vẫn thiếu ⟹ 200, vẫn
   `PRICE_MISSING`, không ghi kiểm tra; không phải người yêu cầu ⟹ 403 `ACCESS_REQUEST.NOT_REQUESTER`; khác trạng thái ⟹ 409
   `ACCESS_REQUEST.NOT_AWAITING_REVISION`; (c) rút. Trạng thái này không vào hàng đợi trình lô, không tính _đang chờ duyệt chi_, nhưng
   **là trạng thái mở** ở mọi danh sách loại trừ (`ENDED_STATES`, `NOT_OPEN_FOR_LEAVER`) — có test (DA3-11).
7. **Chuyển khi mất trưởng phòng (L2-02, `QĐ-104f`) — hai pha (DA3-16):** (a) **Đánh dấu** trong listener `HEAD_PERIOD_END`
   (transaction thay đổi tổ chức) và lượt ngày của sweep: phòng không có trưởng phòng hiệu lực **và** không có kỳ kế tiếp đã ghi
   (Q-25) ⟹ Request **trả phí** `VIA_HEAD` của phòng ở bước nhu cầu (`PENDING`/`WAITING_CONTROLLED`) hoặc hàng đợi trình lô (bị chặn,
   chờ xác nhận dự phòng, bị trả về) ⟹ khóa theo id tăng, đóng bước nhu cầu mở `CLOSED`, dòng `AWAITING_NEED` ⟹ `NEED_CONFIRMED`, ghi
   `ONE_STEP HEAD_LEFT`, audit `ACCESS_REQUEST.CONVERTED_ONE_STEP` — **chỉ ghi, không kiểm ngân sách**, nên listener không ném lỗi
   kiểm tra. (b) **Hoàn tất** ở mọi lượt sweep, mỗi Request một transaction: `ONE_STEP` còn ở `PENDING`/`WAITING_CONTROLLED`/
   `AWAITING_SPEND_SUBMISSION` không bước chi mở ⟹ trả phí: kiểm như mục 4; nội bộ (chỉ từ Q-24): `AWAITING_EXECUTION` + cờ. Lỗi ⟹
   ghi log, lượt sau thử lại. Request **nội bộ** `VIA_HEAD` đang chờ bước nhu cầu **không** chuyển: chờ, giao kế nhiệm/trưởng phòng
   mới (Q-33, DA3-09). Request có bước chi mở giữ nguyên.
8. **Định tuyến chốt lúc gửi** (`QĐ-106h`(1)): phòng được gán trưởng phòng hoặc người yêu cầu thôi làm trưởng phòng ⟹ Request một
   bước không đổi `routing_mode`; bước chi theo người giữ vai Người duyệt chi.
9. **L2-34:** `assessmentRejectionBodySchema` `superRefine`: `UNCONTROLLABLE` thiếu cả `alternativePlanId` lẫn `alternativeNote` ⟹
   422 `VALIDATION_ERROR` (`path: alternativeNote`); `NOT_ELIGIBLE` không đòi. **Khóa:** gửi: bản nháp → người gửi `FOR SHARE` →
   phòng `FOR SHARE` → ghi Request → khóa năm (kiểm) → ghi bước; hoàn tất chuyển: Request `FOR UPDATE` → khóa năm. Gửi lại song
   song: lần sau 409 `NOT_AWAITING_REVISION`.
10. **Dữ liệu cũ (Q-24, cải tiến):** Migration B chỉ **đánh dấu**: Request mở có bước nhu cầu dòng 2/8 (bất kể đã quyết nhu cầu, gồm
    Request bị migration Finance đưa về hàng đợi của chính trưởng phòng — DA3-15) chưa có bước chi mở ⟹ `ONE_STEP REQUESTER_IS_HEAD`;
    dòng 4 chưa quyết, phòng chưa ghi kế nhiệm ⟹ `ONE_STEP NO_DEPARTMENT_HEAD`; bước nhu cầu chưa quyết ⟹ `NOT_REQUIRED`; **state
    giữ**. Lượt _hoàn tất_ của mục 7(b) chạy kiểm/chuyển như Request vừa chuyển (cùng mã, có lý do chặn, có thông báo). Có bước chi
    mở ⟹ chỉ ghi `ONE_STEP`. Seed: kịch bản ở phòng có trưởng phòng; `OPS` (không trưởng phòng, `organization.ts:62-66`) không có
    kịch bản Request (DA3-19).

## Test matrix

| AC / rủi ro             | Tình huống (gồm từ chối, edge case)                                                                                                                                                           | Cấp test                | Kết quả mong đợi                                                                                                                                                           | Bằng chứng sau implement |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| R-A07                   | nhân viên/phòng có trưởng phòng; trưởng phòng tự gửi; phòng không trưởng phòng; nhóm của trưởng phòng; nhóm nhân viên phòng không trưởng phòng; **phòng không trưởng phòng, đã ghi kế nhiệm** | unit                    | `VIA_HEAD` 1 / `ONE_STEP` 2 / `ONE_STEP` 4 / `VIA_HEAD` 5 / `ONE_STEP` 4 / `VIA_HEAD` chờ `NO_DEPARTMENT_HEAD`                                                             |                          |
| US-06-17 AC-1           | `H1` gửi `K1` 2tr × 6 khi còn 25/35                                                                                                                                                           | integration             | `NOT_REQUIRED`, bước chi giao `C1` ngay, không vào hàng đợi                                                                                                                |                          |
| AC-3 / AC-4             | `H1` gửi 30tr; 45tr                                                                                                                                                                           | integration             | `USES_RESERVE` bước chi ngay, cờ tự quyết; `AWAITING_REQUESTER_REVISION`, `H1` được báo, Finance không                                                                     |                          |
| AC-5, AC-11             | kiểm lại lúc duyệt thành chặn; `H1` bổ sung ngày kết thúc rồi gửi lại                                                                                                                         | integration + http      | 409 `RECHECKED_RETURNED_TO_REQUESTER`, `H1` được báo; kiểm mới, bước chi mới                                                                                               |                          |
| gửi lại                 | người khác gửi lại; khi đang chờ duyệt; song song                                                                                                                                             | http + integration      | 403 `NOT_REQUESTER`; 409 `NOT_AWAITING_REVISION`; một 200 một 409                                                                                                          |                          |
| rút / AC-6 / AC-9       | rút ở trạng thái mới; `C1` từ chối; Finance/IT/SA/`H2`/`H1` duyệt                                                                                                                             | integration + http      | `WITHDRAWN`; `REJECTED` một bản ghi; 403                                                                                                                                   |                          |
| AC-7, AC-8              | `H1` mở `spendQueueList`, trình `R1`; Request nhóm của `H1`                                                                                                                                   | http + integration      | không thấy Request một bước, nó tính vào _đang chờ_; nhóm vào hàng đợi                                                                                                     |                          |
| AC-2, US-05-24          | `E6` phòng không trưởng phòng gửi trả phí; `H1`/`E4` gửi nội bộ; `E1` gửi nội bộ; `IT2` nội bộ                                                                                                | integration             | một bước; `AWAITING_EXECUTION` + `NO_NEED_APPROVER`; bước nhu cầu `H1`; `IT2` không tự cấp                                                                                 |                          |
| US-05-03 AC-13          | chưa có Người duyệt chi, `H1` gửi                                                                                                                                                             | integration             | bước chi `WAITING_CONTROLLED NO_SPENDING_APPROVER`                                                                                                                         |                          |
| AC-19                   | sau khi gửi, phòng được gán trưởng phòng / `H1` thôi làm trưởng phòng                                                                                                                         | integration             | vẫn `ONE_STEP`, bước chi giữ                                                                                                                                               |                          |
| L2-06                   | `H1` thêm chính mình; `E1` thêm `H1` vào nhóm                                                                                                                                                 | http                    | 422 `LINES_REFUSED` `HEAD_IN_GROUP`                                                                                                                                        |                          |
| AC-12, L2-02            | `H7` nghỉ, không kế nhiệm; `R70` chờ nhu cầu, `R71` hàng đợi, `R72` chờ xác nhận dự phòng, `R73` bị trả về                                                                                    | integration             | listener đánh dấu `ONE_STEP HEAD_LEFT`; lượt hoàn tất kiểm lại, mở bước chi hoặc chờ người yêu cầu                                                                         |                          |
| DA3-16                  | `H7` nghỉ khi Request của phòng thiếu tỷ giá; lượt hoàn tất lần đầu ném lỗi (giả lập)                                                                                                         | integration             | thay đổi tổ chức commit, Request đã đánh dấu; lượt lỗi không làm hỏng Request khác; lượt sau xong (`RATE_MISSING`)                                                         |                          |
| Q-25                    | mất trưởng phòng, kế nhiệm ghi từ ngày sau                                                                                                                                                    | integration             | không chuyển; tới ngày hiệu lực bước giao kế nhiệm, `waiting_since` giữ                                                                                                    |                          |
| Q-33                    | mất trưởng phòng không kế nhiệm, Request nội bộ chờ nhu cầu                                                                                                                                   | integration             | không chuyển, chờ; gán trưởng phòng mới ⟹ giao người đó                                                                                                                    |                          |
| sweep                   | listener bỏ lỡ (dữ liệu tạo trực tiếp)                                                                                                                                                        | integration             | lượt ngày đánh dấu, lượt sau hoàn tất; chạy lại không đổi gì                                                                                                               |                          |
| phần mềm mới / tiếp tục | `H1` đề xuất, IT thẩm định xong; `H1` gửi Request tiếp tục                                                                                                                                    | integration             | `AWAITING_IT_ASSESSMENT` ⟹ kiểm, bước chi; một bước, không vào lô                                                                                                          |                          |
| Q-31                    | `H1` gửi gói chưa có giá; gửi lại khi giá vẫn thiếu; IT cập nhật giá, gửi lại                                                                                                                 | integration             | `PRICE_MISSING`, IT Admin được báo, không kiểm tra ngân sách; 200 vẫn `PRICE_MISSING`; kiểm, bước chi                                                                      |                          |
| DA3-11                  | Request ở `AWAITING_REQUESTER_REVISION`: người thụ hưởng nghỉ; điều chuyển; ngừng phòng/Cost Center; dashboard                                                                                | integration             | hủy khi nghỉ; đóng `BENEFICIARY_TRANSFERRED`; không ngừng được; đếm ở `openRequestsSentBy`                                                                                 |                          |
| L2-15, DA3-10           | `accessRequestGet`, `needDecisionList`, `spendApprovalGet`; `accessRequestLineList` của Request nhóm một bước                                                                                 | http + `openapi:export` | không `samePersonAsSpend`, `FALLBACK_APPROVER`; `needStep.state` `NOT_REQUIRED` qua zod                                                                                    |                          |
| L2-34                   | từ chối `UNCONTROLLABLE` không phương án; có `alternativeNote`; `NOT_ELIGIBLE` không phương án                                                                                                | http                    | 422 / 200 / 200                                                                                                                                                            |                          |
| Q-24, DA3-15            | dòng 2/4/8 × (chưa quyết nhu cầu · đã về `AWAITING_SPEND_SUBMISSION` từ migration Finance · có bước chi mở) × (trả phí · nội bộ); dòng 4 phòng đã ghi kế nhiệm                                | integration (migration) | đánh dấu đúng mục 10, state giữ; lượt hoàn tất đưa về bước chi/`AWAITING_REQUESTER_REVISION`/`AWAITING_EXECUTION`; có bước chi ⟹ chỉ `ONE_STEP`; kế nhiệm ⟹ không đánh dấu |                          |
| seed                    | `ops:seed` DB sạch, chạy lại                                                                                                                                                                  | integration             | xanh, không đổi kịch bản                                                                                                                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; `openapi.json` có `accessRequestResubmit` và các trường đổi; `api-coverage-manifest.ts` khớp.
- [ ] README `requests` (bảng định tuyến, _phòng chưa có trưởng phòng_, hai pha chuyển, bảng tầng nếu đổi), mục _Tìm X ở đâu_.
- [ ] Flow/e2e viết lại theo luật mới (`department-without-head-journey`, `mobile-approver-journey`) — không nới khẳng định khác.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): kế nhiệm đã ghi áp cả lúc gửi (DA3-08), Request nội bộ không chuyển
(DA3-09 ⟹ Q-33), `accessRequestLineList` (DA3-10), test trạng thái mới ở nơi gọi ngoài phạm vi (DA3-11), `HEAD_IN_GROUP` chuyển về
đây (DA3-14), Q-24 đánh dấu + lượt hoàn tất, ca migration (DA3-15), chuyển hai pha không kiểm trong listener (DA3-16), `OPS` (DA3-19).
Chưa nghiệm thu.
