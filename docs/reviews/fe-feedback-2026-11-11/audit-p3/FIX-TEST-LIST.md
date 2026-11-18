# Nợ test cho FIX-TEST cuối prompt 3 (chat 121 ghi)

Nguồn: integration toàn bộ trên merge b5d041c6 (32 suite đỏ lần đầu do DB chung quá tải, 630 dòng lỗi tạm thời) → chạy lại trên DB riêng
35434: 11 suite đỏ thật, phân loại dưới đây. Không suite nào là lỗi logic mới.

| Suite | Lỗi | Gốc | Xử lý |
| --- | --- | --- | --- |
| organization/organization.integration-spec.ts ("reads several employees at once…") | danh sách khóa thiếu `contractEndDate` | test lỗi thời từ RQ-2 (d99c21c3), đỏ cả ở fa87ca41 | FIX-TEST |
| ai-assist/queue-summary-approver.integration-spec.ts | `requestedDurationLabel` phụ thuộc ngày chạy | đỏ cả ở fa87ca41 | FIX-TEST (cố định ngày) |
| catalog/contract-fields-migration.integration-spec.ts:204 | `schemaDrift` code 2: test chỉ deploy tới migration CO-1 rồi so với schema hiện tại | test lỗi thời khi có migration sau (A 0044xx/0045xx, B 1000xx) | FIX-TEST: áp các migration sau TARGET trước khi kiểm drift (như year-start-commitments-migration:121-125) |
| requests/year-start-commitments-migration.integration-spec.ts:126 | drift code 2 | drift index purchase_invoices (lane A) | đã sửa FIX-A2 a0442752 — kiểm lại sau merge cuối |
| platform/finance-invoices-upgrade, platform/unit-only-upgrade-history | drift index purchase_invoices | lane A | đã sửa FIX-A2 — kiểm lại sau merge cuối |
| budgets/budget-attachment-access.integration-spec.ts | REJECT/REQUEST_CHANGES ⟹ 422 (BG-2.7) | lane B | đã giao FIX-LB4 |
| installation/seed, seed-rerun, seed-calendar, seed-bootstrap | seed gọi API cũ | lane B BG-1/BG-2 (+ lane A) | Z2 (prompt 4) |
| requests/budget-proposals.integration-spec.ts:282 | danh sách khóa của GET /budgets/mine thiếu `effectiveBudget` | test lỗi thời từ AD-1.3 fcc9b6d2 (chat 81 báo) | FIX-TEST |
