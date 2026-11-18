# A4 — MF-5, kho/thuê bao SBF-20, cấp/thu hồi, thiết bị, báo lỗi SaaS (xong 16/11)

Files: annotations usage-ghost-seats (38 op), licensing-seats (20, có stockSummaryList, bỏ service account), subscription-renewals (7), provisioning-and-saas-issues (21), devices-and-ai-usage (26, có deviceRegistrationList); flows ghost-seat-reclaim, subscription-rightsizing, ai-collector-device, saas-issue; pending mf5.fields.json (252), mf5.enums.json (36 context, chép đủ giá trị cũ). Render gộp mf5 ⟹ 0 vấn đề.

## Việc cho điều phối
- shared-stock-grant.md (A1): bỏ bước claim sau provisioningTaskGrant (QĐ-111m); K1 cần checklist GRANT; "rút đơn ⟹ IT hủy" sai khi IN_PROGRESS (409 GRANT_RUNNING); thêm stockSummaryList, phân biệt stock của stock-summary với grant-queue; lỗi CONTRACT_ENDED/SUBSCRIPTION_NEXT_PERIOD_SEATS, thông báo SUBSCRIPTION_SEATS_INCREASED; revision 1f7ffa19.
- groups.json: gỡ tag service-account-duties khỏi licensing-seats; cân nhắc đổi slug/title requests-new-software-and-service-accounts.
- Glossary: xóa licensing-seats:created; sửa values.RETURN_TO_STORE ("mặc định" sai), values.MINE, values.PARTIAL ("Kiểm soát một phần").
- demo/scenarios.md:158 bước …/claim thừa.

## Lệch code ↔ BRD/QĐ (QUAN TRỌNG)
- SBF-20 điều chỉnh thuê bao: QĐ-103e/104d bỏ bước trưởng phòng xác nhận — code vẫn đề xuất → trưởng phòng CONFIRM → ghi kết quả; vẫn cho CANCEL khi còn ghế gán; thuê bao kho dùng chung K2/K4 không có phòng sở hữu ⟹ 404 = KHO DÙNG CHUNG KHÔNG CÓ ROUTE ĐIỀU CHỈNH NÀO; vẫn cảnh báo theo RENEWAL_ALERT_DAYS_BEFORE_DEADLINE (15/7) dù QĐ-103e bỏ; sự cố tự gia hạn không báo Finance (QĐ-106i), Finance 403 ở subscriptionDeadlineEventList.
- QĐ-111ax: IT Admin đọc ngoài phòng phụ trách ở ghostSeatRecommendationGet (bằng chứng đầy đủ), ghostSeatExemptionList, usageIdentityMappingList, usageUnmatchedIdentityList, usageNoAssignmentFindingList; ghostSeatQueueList trả evidence đầy đủ.
- ghostSeatEscalationCreate: ghi chú đẩy sớm (câu 5.3-06 POL-USAGE để trưởng phòng đọc) được lưu nhưng không route nào trả.
- Báo lỗi SaaS: không có thông báo nào (FR-2.15, SBF-09 b7, QĐ-108f); không tệp đính kèm (QĐ-108g); không tự đóng khi quyền kết thúc/người báo nghỉ (QĐ-108h); markDuplicate nhận cả WAITING_* (QĐ-108h chỉ Mới/Đang xử lý).
- Cấp: chưa có SLA cấp 2 ngày làm việc (US-07-01 AC-19), dueOn = null.
- Thiết bị: monitoringNoticeVersionCreate không báo người giữ (FR-10.4); không cảnh báo IT khi người giữ chưa xác nhận (SBF-05); người giữ không mở được bản ký (US-09-03 AC-7); đọc usage máy không giới hạn phòng; chưa có route dừng thu thập (FR-4.18).

## Nghi lỗi BE
DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED sai tên/mô tả; endCause DEPARTURE chết; deviceHolderChange 422 thay 404; lastAcceptedAt không cập nhật khi lô toàn UNCHANGED; assignmentExpiryStartRevocation OpenAPI 409 ANOTHER_IT_ADMIN_NEEDED nhưng code 403; subscriptionRenewalDecide PROPOSAL_STALE OpenAPI "nothing written" nhưng code ghi STALE + audit, không báo ai; revocation.claimableNow true khi FAILED/RETRY_SCHEDULED; stockSummaryList không đếm K1 của thuê bao hết kỳ; revoking vs inRevocation cùng số hai tên; mô tả provisioningTaskCompleteRevocation K1_CHECKLIST_OUT_OF_ORDER cũ; rút Request sau khi IT bấm Cấp bị chặn (GRANT_RUNNING) — có thể trái US-05-08; reactions.mjs ghi "không tự gửi lại" cho aiUsageBatchCreate, aiToolStatusSnapshotCreate, deviceEnrollmentCreate (thực ra an toàn).

## Breaking FE
- ghostSeatDecisionCreate bắt buộc checklist 5.4 (có Không ⟹ chỉ RECLAIM; 409 POLICY.VERSION_CHANGED/NOT_IN_FORCE, 422 CHECKLIST_INCOMPLETE/HAS_NO).
- provisioningTaskComplete K1 bắt buộc k1Checklist GRANT (422 PROVISIONING.K1_CHECKLIST_* details.variant/codes); provisioningTaskGrant 409 CONTRACT_ENDED, 422 SUBSCRIPTION_NEXT_PERIOD_SEATS; 403 DEPARTMENT_SOFTWARE.OWN_PROPOSAL; subscriptionRenewalRecordOutcome giá ngoại tệ 409 PERIOD_REFUSED reason PRICE_NOT_VND.
- Field mới bắt buộc ở response: licenseAssignmentList plan.logoUrl, revocation; task termCutAt; SaaS issue title, department, plan.logoUrl; device collection; department software applicationLogoUrl.
- Thêm: ghostSeatEscalationCreate, usageOverviewList, usageEmployeeSoftwareList/Get, usageImportList, usageSourceListOfContract, stockSummaryList, deviceRegistrationList; query importId, activeOnly, saasIssueList?departmentId; DUPLICATE_FILE + duplicateOfImportId; usageImportRowList ẩn dòng ngoài phạm vi IT; tầng MONITOR là OPEN chỉ IT thấy.

## Lỗi chung chung (prompt 5)
GHOST_SEAT.* error.code theo khuyến nghị đầu, lỗi khác chỉ trong details.items; NOT_RECLAIMABLE/NOT_RETURNABLE/SEAT_NOT_REVOCABLE thiếu trạng thái; ESCALATION_KEY_REUSED không details; REVOCATION.COMPLETION_NOT_ALLOWED 5 nguyên nhân một mã; ACCESS_STATE_REQUIRED không nói field; PROVISIONING_TASK.NOT_* thiếu trạng thái; LICENSE_ASSIGNMENT.OVERLAP/IDENTIFIER_IN_USE thiếu id; SAAS_ISSUE.* không details; LICENSE_KEY.*, NOT_OPEN, NOT_RENEWABLE/NOT_DECIDER, CONTRACT_DATA_INCOMPLETE không lý do; DEPARTMENT.OUT_OF_SCOPE message nói trưởng phòng nhưng dùng cho IT; DEVICE.REGISTRATION_OVERLAP/ASSET_CODE_TAKEN thiếu id; HOLDER_NOT_WORKING; COLLECTOR_ALLOWLIST.APPLICATION_*.
