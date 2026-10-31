# Spec: khung — phần G2 chờ phiên bản ngân sách, hàng đợi trình, phiếu báo lỗi và việc đang mở (G5–G7)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã G2, 22/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC; `QĐ-82l`(23), `QĐ-82m` `INF-13`,
  `QĐ-82g`, `QĐ-86c`), BE `69f4891`.
- Nhóm roadmap: G2 — chỉ là planning container, không phải phạm vi (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các vế AC của G2 chỉ kiểm được khi đã có phiên bản ngân sách năm, hàng đợi trình duyệt chi, phiếu báo lỗi SaaS
và việc đang mở (rà soát sau điều chuyển, khuyến nghị, xác nhận) của G5–G7.

## Sizing decision

- Container: G2 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Hoàn tất các vế AC của G2 chờ dữ liệu của G5–G7; capability `operating-parameters`,
  `organization/department`.
- Boundaries: Hạng mục khung: không có code. Mở khóa khi `US-06-09` (phiên bản ngân sách), `US-05-09` (hàng đợi trình),
  `US-07-10`/`US-07-11` (phiếu báo lỗi) và việc đang mở của G6/G7 có hạng mục.
- Not larger: Không thêm AC mới; chỉ giữ chỗ cho vế AC đã ánh xạ.
- Not smaller: Mỗi Story chỉ còn một hoặc hai vế chờ; khung riêng cho từng vế chỉ lặp blocker.
- Siblings: `g2-fiscal-year-operating-parameters`, `g2-g4-unit-only-cost-attribution`.
- Scope map: [G2](../../../roadmap.md#work-item-decomposition-g2).

## Primary Story/AC

| Story    | AC          | Coverage | Phần còn lại thuộc                                                                                                                                      |
| -------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-04 | AC-15       | partial  | AC-7, AC-14: `g2-fiscal-year-operating-parameters`; AC-8: `b01-fiscal-year-start-lock` (vế khóa) và `g2-fiscal-year-operating-parameters` (vế không có loại kỳ); AC-1→AC-6, AC-9→AC-13: `g2-operating-parameters` (giao trước GOV.1) |
| US-03-06 | AC-19       | partial  | AC-2 và vế tài khoản dịch vụ của AC-19: `g2-g4-unit-only-cost-attribution`; AC còn lại: `g2-department-profile` (giao trước GOV.1)                      |

Vế giữ ở khung: `US-01-04` AC-15 (vế khóa của AC-8 đã chuyển sang `b01-fiscal-year-start-lock`) — thời hạn chờ trình được dùng để nhắc (`US-05-09` AC-11) và hai
tham số phiếu báo lỗi (`US-07-10`, `US-07-11`; giá trị mặc định chốt ở thiết kế kỹ thuật); `US-03-06` AC-19 — nhóm _việc
đang mở_ (rà soát, khuyến nghị, xác nhận) khi ngừng phòng.

## Supporting references

`FR-8.2`, `FR-5.1`, `FR-3.21`, `FR-2.15`, `FR-3.1`; `US-06-09`, `US-05-09`, `US-07-10`, `US-07-11`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map G2.

## Dependencies and blockers

Blocker: chưa có hạng mục cho `US-06-09`, `US-05-09` (G5), `US-07-10`/`US-07-11` (phiếu báo lỗi) và việc đang mở của
G6/G7. Theo dõi: người lập scope map G5/G6/G7. Điều kiện gỡ: các hạng mục đó có thiết kế `ready`.

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G5–G7).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map; thiết kế khi blocker được gỡ.

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                 | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| ---------------- | ------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| `US-01-04` AC-8  | (đã chuyển) đổi tháng bắt đầu khi đã có phiên bản ngân sách thuộc `b01-fiscal-year-start-lock` | — | — | — |
| `US-01-04` AC-15 | thời hạn chờ trình và tham số phiếu báo lỗi được dùng (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| `US-03-06` AC-19 | ngừng phòng còn việc đang mở (chờ blocker)                          | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

22/10/2026: lập khung theo bản đồ phân rã G2 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa
review, chưa nghiệm thu.
