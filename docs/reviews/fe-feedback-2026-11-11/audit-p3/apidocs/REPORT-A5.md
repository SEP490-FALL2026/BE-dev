# A5 — mua hàng/đối soát, danh mục, chính sách, import, tham số, AI, dashboard (xong 16/11)

Files mới: annotations purchases-reconciliation (15 op), policies-templates (11 op); pending misc.fields.json, misc.enums.json; flows purchase-invoice, reconciliation, policies-checklist (#route-gui-checklist: 7 bước, 12 route gửi checklist). Viết lại: catalog-vendors-applications, catalog-plans-subscriptions (+4 route hợp đồng), imports, settings-and-money, ai-assist, dashboards; flows usage-reconciliation-k4-contracts-status, department-software-list.
--check bản sao có gộp pending: 0 lỗi trong 8 nhóm; còn stale/missing chờ sinh.

## Việc cho điều phối
- Link hỏng: roles/finance.md (#exchangeratelist, #exchangeraterecord), roles/super-admin.md (#reportingcurrencyset), changes/2026-10-31-prompt09-openapi.md.
- flows/README.md thêm 3 luồng mới; groups.json tiêu đề settings-and-money còn "tỷ giá"; flows/finance-screens.md còn nhắc budgetCommitmentInvoiceRecord (A3 sở hữu — kiểm lại); enum label budget-commitments (NEW_PURCHASE, PERIOD).

## Lệch code ↔ BRD/QĐ
- SBF-19: hạn nộp 5 ngày làm việc BRD tính từ ngày mua; code tính từ ngày trả của kỳ (invoiceDueDate); không có thông báo nhắc (IT lẫn Finance), chỉ cờ ở purchaseInvoiceMissingPeriodList.
- SBF-08: không có route import "danh sách tài khoản xuất từ trang quản trị nhà cung cấp" (QĐ-111y) — sai lệch chỉ từ import usage, hóa đơn, collector; vendorAccountDiscrepancyDecide chỉ FALSE_ALARM/OUT_OF_PROCESS (không cấp lại/thu hồi lại SBF-17/18); không gửi thông báo IT; INVOICE_DIFFERENCE chỉ FALSE_ALARM.
- SBF-07a: REVOKED không tạo tác vụ thu hồi SBF-18, chỉ cần bằng chứng hủy gia hạn; 4 kết cục (thêm REPORT_ONLY) vs BRD 3; hồ sơ tài sản công ty sau RECORD_SPENT vẫn OPEN.
- SBF-11a: BRD cho IT đóng ca "nhà cung cấp tính sai"; code chỉ Finance.
- FR-5.14/BRD §5.5.4: chưa có dashboard Finance và Người duyệt chi; dashboard trưởng phòng thiếu danh sách phần mềm của phòng + người chuyển đến trong ân hạn.
- QĐ-111e: functionalGroupId bỏ trống ⟹ tự xếp Khác (nhỏ).

## Nghi lỗi BE
- 409 PURCHASE_INVOICE.NO_PLACE (preview/submit) không khai OpenAPI; ở confirm AMOUNT_NOT_POSITIVE bị gộp thành NO_PLACE.
- policyGet 404 POLICY.VERSION_NOT_FOUND không khai; policyDraftPut 422 mô tả details.codes nhưng code trả details.items.
- managerDashboardGet mô tả 200 còn "open reviews after a transfer".
- Phạm vi IT Admin ở purchaseInvoiceList/invoice discrepancy: không thấy hóa đơn kho dùng chung do IT khác nộp, nhưng thấy kỳ chưa có hóa đơn của kho đó — cần Owner xác nhận.

## Breaking FE
- Gỡ exchangeRateList/Record, reportingCurrencySet; unitPrice chỉ VND (422 SUBSCRIPTION.PRICE_NOT_VND), ngoại tệ ở originalPrice, thuê bao cũ ngoại tệ ⟹ missing UNIT_PRICE.
- applicationCreate: tạo ứng dụng + plan đầu trong một lệnh; bỏ kind và ô liên lạc; thêm homepageUrl, logoUrl, 409 APPLICATION.DUPLICATE; pricingModel hệ thống suy (422 PLAN.PRICING_MODEL_NOT_DERIVED).
- contractCreate bắt buộc vendorId + effectiveFrom; contractGet bọc trong `contract`; K4 chỉ PERPETUAL (K4_PERPETUAL_ONLY).
- Bỏ tham số FISCAL_YEAR_START_MONTH và 409 PARAMETER.LOCKED; Finance đọc/đặt 3 tham số ngân sách.
- Thêm: 15 route mua/đối soát, 11 chính sách/file mẫu, 4 hợp đồng, meGet.pendingPolicyAcknowledgements, accessRequestCatalogLink.addToDepartmentList.

## Lỗi chung chung (prompt 5)
- vendorAccountDiscrepancy internalValue/vendorValue là câu tiếng Anh BE ghép (không i18n được).
- PURCHASE_INVOICE.* không details (trừ DOCUMENT_INVALID); REQUEST_NOT_PURCHASABLE chỉ reason=STATE.
- OUT_OF_PROCESS_CASE.RECORD_FIELDS_MISSING/NOT_ALLOWED không nói field; NUMBER_TAKEN lộ lỗi nội bộ.
- INVOICE_DISCREPANCY.DIFFERENCE_INVALID không phân biệt âm/0.
