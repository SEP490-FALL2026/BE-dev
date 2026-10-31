# Spec: khung — phần gia hạn subscription chờ đầu vào nghiệp vụ hoặc contract của bên khác

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `EP-11`), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Hoàn tất các vế của `EP-11` mà A-06 chưa đủ đầu vào để làm đúng: số liệu ngân sách thật của snapshot, hỏi–đáp Finance và SLA của
bước quyết gia hạn, thư điện tử, chứng từ `BM-05` của hồ sơ, lịch nhiều kỳ thanh toán, trạng thái "chưa biết" của cờ tự gia hạn,
tác vụ thu hồi do pass nền mở và việc bỏ lý do hết hạn, kỳ mới sau sự cố khi không có quyết định.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: giữ chỗ cho các vế `EP-11` bị chặn; capability `licensing/subscription-renewal` khi mở khóa.
- Boundaries: khung, không code; mở khóa theo từng blocker và khi đó tách hạng mục.
- Not larger: không thêm AC mới; chỉ các vế đã ánh xạ ở scope map.
- Not smaller: các vế cùng chờ quyết định Owner hoặc contract của B; khung riêng cho từng vế chỉ lặp blocker.
- Siblings: `a06-renewal-milestone-alerts`, `a06-renewal-proposal-decision`, `a06-renewal-execution-chain`,
  `a06-renewal-deadline-incident`, `a06-renewal-usage-evidence`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Size exception

- Cohesion: mọi vế trong khung là phần còn lại của cùng một luồng gia hạn (`MF-4`) và cùng thiếu một đầu vào ngoài A-06: quyết định
  Owner hoặc contract ngân sách/chi phí của B.
- Why not split: mỗi Story chỉ còn một đến năm vế chờ; năm khung riêng chỉ lặp blocker và trỏ cùng code.
- Checkpoints: không có phase; khi một blocker gỡ thì tách hạng mục riêng theo blocker đó, có spec/plan/test riêng.
- Maximum scope: chỉ các AC/vế ghi ở bảng Primary và các dòng `deferred` trỏ tới khung này; không code trước khi gỡ blocker.
- Accepted by: AI theo giao việc A-06, 31/10/2026 — chờ Owner xác nhận, chưa phải Owner duyệt.

## Primary Story/AC

| Story    | AC                      | Coverage | Phần còn lại thuộc                                                                                              |
| -------- | ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| US-11-01 | AC-12                   | partial  | vế hộp thông báo trong ứng dụng: `a06-renewal-milestone-alerts`                                                 |
| US-11-02 | AC-4, AC-5, AC-9, AC-14 | partial  | snapshot đóng băng, điểm mở, `NOT_CONNECTED`, không cam kết, bản ghi phê duyệt: `a06-renewal-proposal-decision` |
| US-11-03 | AC-7→AC-10, AC-19       | partial  | mở thu hồi qua cổng chung, một tác vụ nhiều lý do, hủy không kỳ mới: `a06-renewal-execution-chain`              |
| US-11-04 | AC-3                    | partial  | không sự cố, `KPI-4` không tăng khi quá SLA: `a06-renewal-deadline-incident`                                    |
| US-11-05 | AC-2                    | partial  | điều khoản đọc/sửa qua route `plan-terms` sẵn có, hồ sơ nêu `planId`: `a06-renewal-proposal-decision`           |

Các dòng `deferred` của scope map trỏ tới khung này: `US-11-02` AC-7, AC-11, AC-12, AC-16, AC-21; `US-11-04` AC-5, AC-10→AC-13;
`US-11-05` AC-16, AC-18.

## Supporting references

`QĐ-62s`, `QĐ-82e`, `QĐ-84f`, `QĐ-83b`, `QĐ-61b`, `FR-1.5`, `FR-3.14`, `US-05-09`, `US-05-10`, `US-12-03`, `US-12-04`; `DEV-B.md` B-07/B-08.

## Explicit out of scope

Posting chi phí, hóa đơn, dự báo `L1`, báo cáo tiết kiệm: B-07/B-08 (A chỉ cung cấp hợp đồng và outcome).

## Dependencies and blockers

| Vế                                                                       | Blocker                                                                                   | Người theo dõi | Điều kiện gỡ                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| `US-11-02` AC-4, AC-5 (số liệu)                                          | reader `RenewalFinancialContributions` của module ngân sách/chi phí                       | B (B-07/B-08)  | B thêm listener; A thêm test tích hợp                |
| `US-11-02` AC-9 (dự báo `L1`)                                            | `US-12-03`                                                                                | B-08           | read model dự báo có                                 |
| `US-11-02` AC-7, AC-14 (hỏi–đáp), AC-11; `US-11-04` AC-3 (nhắc, backlog) | bước quyết gia hạn chưa là một "bước" có SLA; cần thiết kế dùng lại `US-05-09`/`US-06-02` | Owner/A        | Owner chốt bước gia hạn có SLA hay chỉ nhắc theo mốc |
| `US-11-02` AC-12                                                         | kiểm Mobile                                                                               | A-08           | E2E Mobile xác nhận queue không có mục gia hạn       |
| `US-11-02` AC-16, `US-11-05` AC-16                                       | chứng từ `BM-05` gắn hồ sơ: chưa có `DocumentPurpose` cho hồ sơ gia hạn                   | A + Owner      | chốt purpose và quyền đọc theo hồ sơ                 |
| `US-11-02` AC-21                                                         | lịch nhiều kỳ thanh toán, tổng nghĩa vụ (`QĐ-84f`)                                        | B-07           | contract lịch thanh toán                             |
| `US-11-01` AC-12 (thư)                                                   | mẫu thư và cấu hình bật/tắt                                                               | A-03 / Owner   | mẫu thư + tham số                                    |
| `US-11-03` AC-7, AC-8, AC-10, AC-19                                      | test người xác nhận với gói mất dữ liệu ở nguồn gia hạn                                   | A              | thêm integration (code đã dùng cổng chung)           |
| `US-11-03` AC-9                                                          | tiết kiệm của hủy toàn bộ theo `US-12-04`                                                 | B-08           | báo cáo tiết kiệm                                    |
| `US-11-04` AC-5                                                          | `auto_renew` không có trạng thái chưa biết                                                | Owner/catalog  | quyết định biểu diễn                                 |
| `US-11-04` AC-11                                                         | actor hệ thống cho cổng thu hồi                                                           | A + Owner      | quyết định actor                                     |
| `US-11-04` AC-10, AC-12, AC-13; `US-11-05` AC-18                         | ghi kỳ mới khi không có quyết định; bỏ lý do hết hạn (lý do bất biến hiện hành)           | A + Owner      | thiết kế `QĐ-83b` trên `provisioning_task_reasons`   |
| `US-11-05` AC-2 (trong hồ sơ)                                            | gộp checklist vào hồ sơ và đóng cảnh báo rà soát của kỳ                                   | A              | đọc `plan-terms` qua facade                          |

## Ownership: module, data, API

Khung; khi mở: `licensing/subscription-renewal`, listener ở module của B cho điểm mở tiền.

## Behavior and design

Không áp dụng tới khi gỡ blocker. Mặc định hiện hành: snapshot `NOT_CONNECTED`; chỉ hộp thông báo; không SLA/hỏi–đáp riêng cho
bước gia hạn; đánh dấu hết hạn không mở tác vụ.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)      | Cấp test          | Kết quả mong đợi                                | Bằng chứng sau implement |
| ------------------- | ---------------------------------------- | ----------------- | ----------------------------------------------- | ------------------------ |
| US-11-02 AC-4, AC-5 | snapshot số liệu (chờ blocker)           | integration       | theo AC trong nguồn; ma trận cụ thể khi `ready` | chưa chạy                |
| US-11-02 AC-7       | hỏi Finance (chờ blocker)                | HTTP + PostgreSQL | theo AC trong nguồn                             | chưa chạy                |
| US-11-04 AC-11      | tác vụ thu hồi khi hết hạn (chờ blocker) | integration       | theo AC trong nguồn                             | chưa chạy                |

## Definition of Done

- [ ] Mỗi blocker gỡ thì tách hạng mục và cập nhật scope map.

## Changes and acceptance

31/10/2026: lập khung; chưa Owner review.
