# A6 — catalogue thông báo và lỗi (xong 16/11)

Files: catalog/README.md, catalog/notifications.md (118/118 mã, 13 nhóm luồng, 11 mã chỉ đọc), catalog/errors.md (743/743 mã có trong ví dụ OpenAPI + 35 mã code trả nhưng không khai + 5 AI.* errorCode trong 200; lỗi chung, fallback), verify-logs/apidocs/GENERIC-ERRORS.md (184 dòng, gồm 16 dòng gộp từ A1/A2/A3/A5 và 23 dòng params thông báo thiếu cho prompt 5).
--check: 0 vấn đề thuộc catalog/. Việc cho điều phối: link catalog/README.md vào README.md "Đọc theo thứ tự" và mục lỗi của conventions.md.

## Comment code lệch code
ROLE_HOLDER_LEAVING (comment SA+IT, code chỉ SA); SUBSCRIPTION_AUTO_RENEWAL_INCIDENT (comment người quyết định, code người duyệt chi); BUDGET_SHARED_POOL_OVER_RESERVE (comment khi chốt tháng, code job mỗi giờ); GRANT_TASK_CANCELLED (comment chỉ khi rút, code mọi lần hủy tác vụ cấp có requestId).

## Nghi lỗi BE
- ĐÃ KIỂM: spendApprovalDecide/spendBatchDecide/spendApprovalLineDecide — BUDGET.COMMITMENT_NOT_HOLDABLE/COMMITMENT_EXISTS chỉ map trong budget.http-errors.ts; mapper spend/group-request không gọi ⟹ 500 thay vì 409.
- ĐÃ KIỂM: accessRequestResubmit không tạo thông báo (ACCESS_REQUEST.RESUBMITTED không trong PROJECTED_ACTIONS) — người giữ bước mở lại không nhận STEP_ASSIGNED (A1 cũng thấy).
- Chưa kiểm lại: mã map nhưng không ném (GROUP_REQUEST.LINE_NOT_FOUND, LONG_LEAVE.CONCURRENT_CHANGE, SUBSCRIPTION_RENEWAL.MID_TERM_NOT_ALLOWED, USAGE_IMPORT.CANCELLED/EXPIRED); PLAN.WORKSPACE_TEXT_INVALID khi identity trống nhưng message "quá dài"; PLAN.PROVISIONING_TYPE_MISMATCH dự phòng mọi vi phạm check; ACCESS_REQUEST.NOT_REQUESTER message sai ở supplementAdd; FINANCE.SETUP_INCOMPLETE thiếu departmentId; ABRUPT_DEPARTURE_RECORDED không loại người nghỉ khỏi IT nhận; VENDOR_ADMINS_BELOW_MINIMUM.adminCount luôn 0; nhánh IT của CONTROLLED_WAIT_ALERT không chạy; WITHDRAWAL_AWAITING_IT_CLOSE không báo ai khi phòng chưa có IT; subject.type hoa/thường không thống nhất; REQUEST_SUBMITTED.stage thật là WAITING_NEED_DECISION|WAITING_CONTROLLED|CONFIRMED.
- OpenAPI thiếu/sai ví dụ: DOCUMENT.PURPOSE_FORBIDDEN, APPLICATION.INTERNAL_HAS_NO_VENDOR không khai; PLAN.WORKSPACE_LIMIT_EXCEEDED chỉ OWNER (code còn ADMIN); SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED ví dụ QUARTERLY; OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID thiếu details.placementFrom.

## Lỗi chung chung lớn (prompt 5)
VALIDATION_ERROR.details.issues chỉ {code, path} (không min/max, unrecognized_keys không nêu field); chuỗi tiền sai ⟹ VALIDATION_ERROR không details; luật nghiệp vụ dưới VALIDATION_ERROR; MONEY_* không nói ô nào; 3 mã 503 cùng nghĩa (AUTH.UNAVAILABLE, SERVICE_UNAVAILABLE, TOKEN_VERIFICATION_UNAVAILABLE); 429 chỉ có Retry-After header; ~60 mã 409/422 thiếu id/lý do, nhiều mã gộp nhiều luật; status khác nhau cùng luật (SUPPLEMENT_TERM_* 409 vs TERM_* 422; SELF_CHANGE_FORBIDDEN 409 vs 403); message EMPLOYEE/PERSONNEL.SELF_CHANGE_FORBIDDEN nhúng lệnh vận hành.
