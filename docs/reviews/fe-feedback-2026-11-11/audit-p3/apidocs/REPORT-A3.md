# A3 — MF-4 ngân sách năm + SBF-11 trong năm (xong 16/11)

Files: annotations budgets.md (viết lại, 38 op), budget-in-year.md (mới, 10 op); pending mf4.fields.json (324 khóa, nguồn sinh lại scratchpad/mkfields.mjs), mf4.enums.json (27 khóa context `<tag>/<field>` — GỘP THEO TỪNG GIÁ TRỊ, nhất là budgets/status); flows annual-budget.md (giữ #tep-dinh-kem, #phong-nao-la-cua-nguoi-goi), finance-screens.md (màn 1,2,4 viết lại, thêm màn 5), in-year-budget-review.md (mới, #dieu-chinh-ngan-sach).
--check: 48/48 op có chú thích; preview gộp pending còn 3 vấn đề ngoài nhóm (answer YES/NO → mf1; import-templates kind budget-proposal → policies-templates).

## Việc cho điều phối
- 33 link tới anchor đã xóa của budgets.md: changes/*.md (23, lịch sử), demo/scenarios.md (2), roles/finance.md (7), roles/manager.md (1), roles/spending-approver.md (2).
- flows/README.md: thêm in-year-budget-review, sửa mô tả 2 luồng ngân sách; README §Phạm vi còn "kỳ ngân sách và Trần".
- Xóa khóa chết fields.json: budgets:lines[]*, line.*, *zbb*, *priorityRank, *lineType, *overCeiling, budget.departmentCeiling*, budget.cycle.published, firstPublishedAt, allocated, ceilings, departments[].signedCommitments/plannedSeats/ceiling/publishedCeiling, result, invoice*. enums.json: budget-cycles/status NOT_PUBLISHED/PUBLISHED/CHANGED_AFTER_PUBLISH.

## Lệch code ↔ BRD/QĐ
- budgetAdjustmentCreate/Decide: FR-5.18(3) "lúc nào cũng được" vs code chỉ khi kỳ KHÓA (CYCLE_NOT_LOCKED) — FIX-AD1-Q2 chờ Owner.
- budgetVersionSend không chặn khi kỳ còn mở (QT §4.6 nói chốt sau khóa) — LBG-13 chờ Owner.
- budgetCycleCreate/Update không kiểm Dự phòng kho ≤ Trần năm (LBG-08) ⟹ mọi lần gửi 409 OVER_CEILING không rõ nguyên nhân.

## Nghi lỗi BE / contract lệch code
- Mã lỗi thật không khai OpenAPI: budgetAdjustmentCreate (404 BUDGET.COST_CENTER_NOT_FOUND, MONEY_*, BUDGET.CURRENCY_NOT_REPORTING); budgetAdjustmentDecide (403 BUDGET.NOT_SPENDING_APPROVER/CONFLICT_OF_INTEREST khai FORBIDDEN chung); budgetReviewLineExplain (403 NOT_YOUR_COST_CENTER, 422 tiền).
- Mô tả OpenAPI/DTO cũ: budgetMine "published department ceiling"; budgetVersionCreate 409 "never published"; budgetVersionHistoryList nói sửa/nạp dòng; budgetProposalGet "lines paged"; baseline spentThisYear "seat-months not in yet" (code có cộng); seatsAssigned nhắc service account; departments "division of the ceiling"; explanationStatus NO_HEAD; budgetCommitmentList chỉ nói Finance (MANAGER cũng đọc); budgetCommitmentReleases chỉ 4 lý do.
- seatMonthChargeList không try/catch → toBudgetApiException ⟹ DB tạm lỗi có thể 500 thay 503 (chưa kiểm global filter).
- budgetMine/MineVersionList phòng chưa có Cost Center: 403 NOT_YOUR_COST_CENTER vs nộp đề xuất 409 FINANCE.SETUP_INCOMPLETE.

## Breaking FE (so 67a1abeb)
- Kỳ: budgetCycleCreate POST /budget-cycles (nháp, sharedPoolReserve bắt buộc); budgetCycleOpen POST /budget-cycles/{year}/opening không body; budgetCycleDelete. status DRAFT/OPEN/LOCKED (bỏ NOT_PUBLISHED/PUBLISHED/CHANGED_AFTER_PUBLISH); bỏ ceilings/allocated/unallocated, thêm available/openedAt.
- Xóa 9 route: budgetDepartmentCeilingsSet, budgetCyclePublish, budgetProposalLineList, budgetVersionLineList/LineAdd/LineUpdate, budgetVersionImport, budgetMineLineList, budgetCommitmentInvoiceRecord.
- BM-10: bỏ lines[], thay requestedAmount + note? + attachmentIds 1–10 bắt buộc; bỏ mã CYCLE_NOT_PUBLISHED, ZBB_REQUIRED, PRIORITY_RANK_INVALID, OVER_CEILING_NOTE_REQUIRED, PLAN_NOT_FOUND; thêm 409 BUDGET_CYCLE.NOT_OPEN/LOCKED; rút/trả về khóa sau hạn nộp.
- Phiên bản: bỏ quarters; thêm reservePercent; base tùy chọn (mặc định carriedOverNextYear); origin + BASELINE_NO_PROPOSAL, ADJUSTMENT; baselineRefusal bỏ HAS_HEAD/HAS_SUCCESSOR; gửi cần ≥1 tệp (ATTACHMENT_REQUIRED); BUDGET.OVER_ANNUAL_CEILING(gapMinor) → BUDGET_VERSION.OVER_CEILING(overBy, availableMinor); quyết định chỉ APPROVE/RETURN + checklist bắt buộc (REJECT/REQUEST_CHANGES ⟹ 422), APPROVE kiểm lại Trần năm.
- Đọc: budgetMine bỏ departmentCeiling, cycle.published → cycle.status; budgetPackage bỏ Trần phòng + dòng; còn lại/overBudget tính trên effectiveBudget.
- Thêm: seatMonthChargeList, 5 budgetReviewPeriod*/Explain, 3 budgetAdjustment*; effectiveBudget; longTerm + MANAGER ở budgetCommitmentList; servicePeriodMonth/label/paymentSource ở hóa đơn.

## Lỗi chung chung (prompt 5)
- 403 khai chung: budgetAdjustmentDecide, budgetReviewLineExplain, budgetVersionGet/List/HistoryList (AUTHORIZATION.FORBIDDEN).
- Thiếu details: BUDGET_REVIEW.SEAT_MONTHS_NOT_READY (thuê bao nào), BUDGET.VERSION_IN_FLIGHT/CURRENT_EXISTS (id phiên bản), PROPOSAL_ALREADY_OPEN (id đề xuất), COST_CENTER_REQUIRED (danh sách CC), BUDGET_ADJUSTMENT.OVER_UNALLOCATED (costCenterId).
- Tiền trong details (overBy, availableMinor, floorMinor) là minor chuỗi, không phải Money — không thống nhất.
