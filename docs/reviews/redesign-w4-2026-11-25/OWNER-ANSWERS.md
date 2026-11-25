# Owner trả lời câu hỏi spec đợt 4 (25/11/2026)

Nguồn: `SPEC.md` bản 2 §12 (sau `REVIEW-SPEC-BIZ.md`, `REVIEW-SPEC-TECH.md` — cả hai reviewer đồng ý khuyến nghị A). Quyết định của Owner, chưa báo
GVHD/hội đồng. Áp ở SPEC/PLAN/CODE-PROMPT **bản 2.1**.

| Mã             | Câu                                                                                                   | Quyết định                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OQ-W4-1        | Phiếu tối thiểu mấy mục?                                                                              | **A — 1 đến 6 mục** (phiếu một mục hợp lệ, như `US-05-22` AC-13); không có mã `REQUEST_TICKET.TOO_FEW_ITEMS`                                     |
| OQ-W4-2        | Làm `QĐ-116b` (trưởng phòng rút mọi Request ở hàng đợi trình, lý do bắt buộc) ở đợt 4?                | **A — làm ở đợt 4** (W4-12, gói B6): thêm đúng giai đoạn `NOT_SUBMITTED`, không thêm `RETURNED_TO_REQUESTER`                                     |
| OQ-W4-3        | Phiếu có mã hiển thị?                                                                                 | **A — không có mã**; FE hiện theo thời điểm gửi + người xin                                                                                      |
| OQ-W4-4        | Thông báo khi gửi phiếu                                                                               | **A — mỗi mục một thông báo như hiện nay**; không gộp                                                                                            |
| NESTED_ARRAYS  | Mục mảng lồng có biên `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items` (≤ 6)       | **Duyệt** — đăng ký ở `test/support/api-collection-registry-nested-w4.ts` + sự kiện `api-collection-registry-events-w4.ts` (`added`, `bounded`) |
