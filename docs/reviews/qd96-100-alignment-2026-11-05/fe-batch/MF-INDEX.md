# Chỉ mục spec/plan theo main flow (05/11/2026)

Dùng khi giao **một chat cho một main flow**: chat đó chỉ đọc các hạng mục ở dòng của flow mình + hạng mục dùng chung.
Spec/plan nằm ở `docs/workspace/items/<slug>/`. "Đợt": 1 = chốt contract (giao tối nay, xem
[SPEC-PLAN-DOT-1](SPEC-PLAN-DOT-1.md)), 2/3 = logic sau, Khung = mới có spec/plan khung, chưa thiết kế chi tiết.
Field thay đổi Đợt 1: [FIELD-CHANGES-DOT-1](FIELD-CHANGES-DOT-1.md).

## MF-1 — Request → duyệt → cấp (gồm tiếp tục sử dụng)

| Hạng mục                                    | Đợt         | Làm gì                                                                                                 |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `qd96-100-request-sender-rules`             | 1 (+B)      | Gỡ gửi thay một người; nhóm ≥ 2; tiếp tục chỉ người giữ quyền gửi; IT cấp không đặt ngày               |
| `qd96-100-request-term-limit`               | 1 (+B)      | Thời hạn 1..12 tháng; bỏ xác nhận > 12                                                                 |
| `qd96-100-request-year-without-spend-date`  | 1 + 2       | Bỏ ngày dự kiến chi; năm/giá neo ngày gửi, tính lại lúc trình/duyệt                                    |
| `qd96-100-plan-line-removal-and-bm10-lines` | 1           | Request không gắn dòng kế hoạch; dòng BM-10 chỉ gói/mô tả, seat, số tiền, ghi chú                      |
| `qd96-100-remove-spend-override`            | 1 (+B)      | Bỏ duyệt vượt ngân sách                                                                                |
| `qd96-100-approved-end-date`                | 1 (DTO) + 3 | Nhóm bỏ ngày dòng; ngày kết thúc BE tính lúc duyệt chi                                                 |
| `qd96-100-renewal-chaining-and-window`      | 1 (DTO) + 3 | Tiếp tục nhập số tháng; nối kỳ; cửa sổ 30 ngày                                                         |
| `qd96-100-budget-check-three-outcomes`      | 2           | Ba kết quả ngân sách, trừ Request đang chờ, giá gốc                                                    |
| `qd96-100-reserve-confirmation`             | 2           | Trưởng phòng xác nhận dùng dự phòng kèm lý do khi trình lô                                             |
| `qd96-100-head-group-request-queue`         | 3           | Request nhóm của trưởng phòng vào hàng đợi trình                                                       |
| `qd96-100-budget-visibility-qd100p`         | 3           | Số ngân sách trưởng phòng/người yêu cầu được thấy                                                      |
| `qd96-100-spend-notifications`              | B           | Thông báo lô trình, bị chặn, cần dự phòng                                                              |
| `qd96-100-remove-finance-review-path`       | B           | Gỡ hẳn nhánh Finance rà soát (đã chết sau Đợt 2)                                                       |
| `qd96-100-licensing-api-fields`             | B           | Dọn field tác vụ cấp/thu hồi                                                                           |
| Chưa có thư mục                             | —           | Chuyển/giữ seat kèm chi phí (H2), Request tiếp tục nhóm/hợp thức hóa/tăng cấp (H4), K4 (`a05-k4-*` cũ) |

## MF-2 — Nghỉ việc và thu hồi

| Hạng mục                                    | Đợt    | Làm gì                                                                      |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `qd96-100-departure-day-access-block`       | 1 (+B) | Tự chặn đăng nhập hết ngày cuối; IT không chờ "đã nghỉ"                     |
| `qd96-100-departure-block-now-mode`         | 1 (+B) | `accessBlockMode` thay `abrupt`                                             |
| `qd96-100-personnel-grounds-and-reasons`    | 1      | Căn cứ + lý do bắt buộc; BE tự đếm quyền thu hồi                            |
| `qd96-100-revocation-deadline-and-withdraw` | B      | Hạn/không-trước của tác vụ thu hồi, gỡ lý do khi hủy (dùng chung MF-3/MF-5) |
| `qd96-100-people-read-scope`                | B      | IT/trưởng phòng chỉ đọc phần tối thiểu                                      |
| `qd96-100-account-org-api-fields`           | B      | Dọn field tài khoản/tổ chức                                                 |
| `qd96-100-manager-employee-detail`          | B      | Trưởng phòng xem chi tiết nhân viên phòng mình                              |

## MF-3 — Điều chuyển

| Hạng mục                                | Đợt              | Làm gì                                                                            |
| --------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `qd96-100-transfer-review-defaults`     | 1 (+B)           | Bỏ `NEEDS_NEW_TOOL`; B: quá hạn mặc định thu hồi, tạm dừng khi thiếu trưởng phòng |
| `qd96-100-transfer-replacement-request` | 1 (`reason`) + B | B: tự tạo Request cấp thay thế                                                    |
| `qd96-100-transfer-labels-and-overlap`  | Khung            | Nhãn T1–T4, chồng lấn 5 ngày                                                      |

## MF-4 — Ngân sách năm

| Hạng mục                                         | Đợt         | Làm gì                                                                      |
| ------------------------------------------------ | ----------- | --------------------------------------------------------------------------- |
| `qd96-100-remove-budget-revision-and-high-value` | 1 (+B)      | Gỡ revision trong năm, ngưỡng giá trị cao                                   |
| `qd96-100-annual-budget-reserve-and-floor`       | 1 (DTO) + 3 | Tiền `{amount}`, dự phòng mặc định 10 % + lý do; 3: sàn cam kết chuyển tiếp |
| Chưa có thư mục                                  | —           | Lịch B0, baseline, phong bì, chỉ tiêu, BM-10 có loại dòng/ưu tiên/ZBB (H1)  |

## MF-5 — Usage → thu hồi → điều chỉnh thuê bao

| Hạng mục                                                  | Đợt             | Làm gì                                                                                  |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `qd96-100-subscription-owner-confirmation`                | 1 (+B)          | Trưởng phòng sở hữu xác nhận đề xuất điều chỉnh                                         |
| `g7-device-registry-acknowledgement`                      | 1 (mức A) + B   | Sổ máy, BM-06, thông báo, xác nhận; B: yêu cầu dừng thu thập                            |
| `g7-device-credential-enrollment`                         | 1 (mức A) + B   | Mã đăng ký, token thiết bị, session, thu hồi                                            |
| `g7-ai-usage-intake`                                      | 1 (mức A) + B   | Nhận usage AI theo ngày + snapshot quota, API đọc                                       |
| Tool `Code/Tools/workstreams/ai-collector/be-integration` | 1 (mức A) + B   | Uploader collector                                                                      |
| `g7-browser-usage-intake`                                 | Khung           | Usage extension theo ngày                                                               |
| `g7-vendor-usage-import-identity`                         | Khung (spec dở) | Import usage vendor JSON, khớp danh tính                                                |
| `g7-vendor-usage-csv-template`                            | Khung           | Import CSV theo mẫu                                                                     |
| `g7-g1-g2-recommendations`                                | Khung (spec dở) | G1/G2, bảng IT                                                                          |
| `g7-g3-g4-decisions`                                      | Khung           | G3/G4, quyết Giữ/Thu hồi/Miễn trừ                                                       |
| `qd96-100-renewal-milestones-and-recipients`              | Khung           | Mốc ND−90/60/30/7 và người nhận                                                         |
| `qd96-100-subscription-lifecycle`                         | Khung           | Thuê bao linh hoạt, hết hạn/đóng, đổi tier                                              |
| `qd96-100-subscription-quantity-guard`                    | B               | Đổi số lượng/phòng sở hữu phải có căn cứ                                                |
| `qd96-100-catalog-api-fields`                             | B               | Dọn field catalog                                                                       |
| `c1-contract-list-and-fields`                             | độc lập         | Danh sách hợp đồng + tệp                                                                |
| Chưa có thư mục                                           | —               | Tổng hợp ND−60 từ usage, hóa đơn/tiết kiệm thực (H7), dữ liệu usage giữ lại (retention) |

## Dùng chung mọi flow

| Hạng mục                           | Đợt             | Làm gì                      |
| ---------------------------------- | --------------- | --------------------------- |
| `qd96-100-seed-demo-v3`            | 1 (Task 0) + 3  | Fixture v3, kịch bản demo   |
| `qd96-100-sla-reminder-recipients` | B               | Nhắc quá SLA đúng người     |
| `e2e-main-flows-suite`             | 1 (`@D1`) + sau | Suite E2E `pnpm test:flows` |

## Tài liệu trung gian (không phải spec để code)

`../audit/`, `../api-fields/`, `../LEDGER.md`, `../QUESTIONS.md` (mục D = câu trả lời Owner), `../C-REVIEW.md`,
`V1-*`, `V2-*`, `FIELDS-*`, `DELTAS-APPLIED.md`, `REGISTRATION.md`, `PLAN-LINE-DECISION.md`: bằng chứng và lịch sử phân
tích. Chat review từng flow chỉ mở khi cần tra lý do.
