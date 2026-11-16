# A1 — MF-1 Request (xong 16/11)

Files: annotations access-requests (+assessmentQueueDepartmentList, assessmentDecisionList, mục chung #checklist-quyet-dinh), requests-new-software-and-service-accounts (bỏ service account), group-requests, spend-and-finance-review, request-operations; pending mf1.fields.json (199), mf1.enums.json (15, định dạng {values, context}); flows paid-access-request, internal-free-request, new-software-request, shared-stock-grant (giữ #nap-kho-ban-dau, thêm checklist K1), renewal-request (mới).
--check gộp pending trong bộ nhớ: 0 vấn đề, 1691/1691 field; enum answer YES/NO ở tag budget-versions/ghost-seats thuộc nhóm khác.
Đề nghị groups.json: assessmentQueueDepartmentList, assessmentDecisionList → requests-new-software-and-service-accounts.
flows/README.md: thêm renewal-request, sửa câu revision MF-1.

## Lệch code ↔ BRD/QĐ
- spendBatchDecide: checklist có Không chỉ khóa APPROVE, vẫn REJECT một phần lô; BR-MF1-07 "có Không ⟹ cả lô trả về" (FIX-PL2-Q1).
- groupRequestSubmit: trưởng phòng gửi được tới 100 người; BRD/BR-MF1-01 ≤ 10.
- accessRequestResubmit không nhận hồ sơ bổ sung sau Trả về (FR-11.2, FIX-PL2-Q3).
- accessRequestInternalRegister không có checklist 1.3 (FIX-PL2-Q2).
- K5 gửi mới khi trưởng phòng đã đi, kế nhiệm chưa bắt đầu ⟹ IT thẳng; Request đang chờ thì chờ kế nhiệm (AUDIT-MF23.a).
- Request trả phí của người vừa thành trưởng phòng kẹt WAITING NO_DEPARTMENT_HEAD (B2A-Q2).
- grantQueueList chỉ phòng mình phụ trách; QĐ-58b cho IT khác làm thay (B2B-05).
- Request tiếp tục đã duyệt mà IT không kéo dài ⟹ quyền sống mãi (B-O1).

## Nghi lỗi BE
- Thiếu STEP_ASSIGNED cho Người duyệt chi khi bước chi mở qua lô (chỉ Request một bước có).
- ACCESS_REQUEST.RESUBMITTED không có luật thông báo (trưởng phòng/IT không được báo khi gửi lại).
- grantQueueList.expectedEndDate luôn null với Request mới; hàng cấp không có termMonths.
- Mô tả contract cũ trái code: accessRequestNeedDecide/RenewalSubmit "trên 12 tháng cần xác nhận"; DraftSave "service account"; Withdraw/CancelForDeparture "Finance gave it back"; needDecisionList "confirmed term/line of plan"; spendApprovalLineDecide "back to Finance"; spendBatchItemList "sent to Finance"; spendApprovalList "same person holds need step"; groupRequestSubmit "head named among them" (code HEAD_IN_GROUP); accessRequestTimingsGet "review of Finance"; enum cũ PLAN_LINE_MOVED, FINANCE_OUTCOME_WHILE_WAITING, RETURNED_BY_FINANCE, CONFLICT_OF_INTEREST, SERVICE_ACCOUNT.
- Ví dụ lỗi lệch: accessRequestPropose 422 REFERENCE_NOT_FOUND field=vendorId vs existingApplicationId; spendApprovalDecide 404 mã ví dụ ACCESS_REQUEST.NOT_FOUND vs SPEND.REVIEW_NOT_FOUND; 409 SPEND.STEP_NOT_PENDING không ví dụ; accessRequestCatalogLink 403 OWN_REQUEST không khai.

## Breaking FE
- termMonths thay expectedEndDate (submit, preview, nháp, nhóm, propose, supplements); renewal extensionMonths|longTerm, bỏ newEndDate; bỏ manyPaidSoftwareReason.
- Bỏ flags; preview bỏ maxEndDate, termRequired, limits.paidSoftware*, reasonRequired, thêm termRefusal, limits.resetsOn, cost; groupRequestCheck bỏ maxEndDate/endDateOutOfRange, thêm termRefusal; thêm request.cost, termCost, nextYearBudget.
- OPEN_LIMIT_REACHED 409→422 details {limit, resetsOn}, tuần lịch, mặc định 10; RENEWAL_REQUEST.WINDOW_NOT_OPEN 409→422; bỏ END_DATE_OUT_OF_RANGE (2), GROUP_REQUEST.TERM_BEYOND_LIMIT, MANY_PAID_SOFTWARE_REASON_REQUIRED; thêm ACCESS_REQUEST.TERM_*; SPEND.SUPPLEMENT_END_DATE_OUT_OF_RANGE → SUPPLEMENT_TERM_MONTHS_OUT_OF_RANGE + SUPPLEMENT_TERM_NOT_REDUCED/NOT_ASKED.
- Checklist bắt buộc (lỗi POLICY.*) ở need-decision, line-need-decisions, spend-approval, line-spend-decisions, spend-batches decisions, reserve-confirmation, assessment completion/rejection (REJECT/RETURN), spendBatchSubmit có reserveConfirmations. Thêm RETURN; needDecision.decision có RETURNED.
- grantQueueList không truyền state ⟹ mọi trạng thái; thêm execution, logoUrl. Rút Request sau khi IT bấm Cấp ⟹ 409 GRANT_RUNNING. Hoàn tất K1 bắt buộc k1Checklist. catalog-link response {request, departmentList}. Thêm propose case B rút gọn + 409 SOFTWARE_IN_CATALOG.

## Lỗi chung chung (prompt 5)
- ACCESS_REQUEST.TERM_* không details (maxMonths, kiểu gói).
- 409 thiếu id: RENEWAL_REQUEST.ALREADY_REQUESTED, RETURN_REQUEST.RENEWAL_PENDING, SPEND.NOT_IN_QUEUE; thiếu lý do: SPEND.RESERVE_NOT_PENDING, CATALOG_LINK_NOT_ALLOWED, SPEND.NOT_CHECKABLE.
- ASSESSMENT.QUOTE_NOT_IN_FORCE thiếu ngày; SPEND.SUPPLEMENT_* thiếu số tháng hiện tại.
- Luật nghiệp vụ trả VALIDATION_ERROR (từ chối/trả về không lý do; RETURN một phần nhóm; extensionMonths+longTerm; reserveConfirmations thiếu checklist).
- 404 trộn SPEND.REVIEW_NOT_FOUND và ACCESS_REQUEST.NOT_FOUND.
