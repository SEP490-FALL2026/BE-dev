# Spec: khung — phần nối Request (G5) và điều chuyển/đổi chức vụ (G6) với bộ chuẩn và cấp phát

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 và G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- _Tác động 22/10/2026 (baseline Docs `72e1480`):_ khung này giữ thêm `US-07-04` AC-15 (`QĐ-83a`). Hướng dẫn _nhánh mua
  thêm khi hết hạn mức_ và dẫn `US-05-05`, `US-05-07` dưới đây **lỗi thời**: hai Story đó `RETIRED` (`QĐ-82m` C), không có
  nhánh seat trống chi phí 0, hết hạn mức không chèn bước duyệt chi; cam kết chỉ giải phóng phần chưa chi (`QĐ-83a`,
  `QĐ-84g`); hợp đồng `GRANT_REQUEST_GATE` cần phòng, Cost Center `Unit`, số tiền/lịch và _một lần cấp mỗi Request_
  (`QĐ-86a`, câu Q3 của PR #14). Thiết kế lại khi gỡ blocker theo dòng C04, C06, C09 của
  [ma trận](../business-baseline-impact-2026-10-22/spec.md#ma-trận-tác-động-ae).
- _Review hậu merge 22/10/2026 (Prompt 08):_ khi gỡ blocker, cổng G5 phải kiểm Request **trong** transaction cấp có khóa
  và bảo đảm một lần cấp mỗi Request (`DB-06` của
  [review](../../../reviews/g0-g4-post-merge-review-2026-10-22/README.md#5-bảo-mật-migration-transaction-và-audit); câu Q3
  của PR #14); vế _thực thi tác vụ cho chính IT Admin lúc cấp_ của `QĐ-77m` (Q2) cũng ở đây.
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các AC của G3/G4 cần Request hoặc sự kiện điều chuyển: điều kiện Request đủ phê duyệt trước khi cấp, phân loại yêu cầu theo bộ chuẩn, nhánh mua thêm khi hết hạn mức, kết cục Request khi đóng thất bại.

## Sizing decision

- Container: G3 và G4 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Hoàn tất các AC của G3/G4 cần Request hoặc sự kiện điều chuyển: điều kiện Request đủ phê duyệt trước khi cấp, phân loại yêu cầu theo bộ chuẩn, nhánh mua thêm khi hết hạn mức, kết cục Request khi đóng thất bại.
- Boundaries: Hạng mục khung: không có code. Mở khóa khi `US-05-*` và `US-03-*` có nguồn.
- Not larger: Không thêm AC mới; chỉ giữ chỗ cho AC đã ánh xạ.
- Not smaller: Các AC cùng chờ một vòng đời Request; tách theo Story chỉ lặp cùng blocker.
- Siblings: `g3-standard-toolset`, `g4-provisioning-queue-manual`, `g4-provisioning-failure-handling`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC                       | Coverage | Phần còn lại thuộc                                                                                                                                         |
| -------- | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-10 | AC-5, AC-6, AC-11        | partial  | AC-1→AC-4, AC-7→AC-10, AC-12: `g3-standard-toolset`; AC-1, AC-3: `g4-notification-delivery`                                                                |
| US-07-01 | AC-1, AC-3, AC-15, AC-16 | partial  | AC-1, AC-2, AC-4→AC-9, AC-11→AC-13, AC-15, AC-17: `g4-provisioning-queue-manual`; AC-14: `g4-seat-baseline-import`; AC-10: `g4-device-dependent-features`  |
| US-07-04 | AC-4, AC-6, AC-12, AC-15 | partial  | AC-1→AC-3, AC-6→AC-14: `g4-provisioning-failure-handling`; AC-3, AC-6, AC-12, AC-13: `g4-notification-delivery`; AC-5: `g3-downstream-finance-integration` |

## Supporting references

`US-05-01`, `US-05-05`, `US-05-07`, `US-06-06`, `US-03-04`, `US-03-07`; `FR-3.4`, `FR-3.18`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map.

## Dependencies and blockers

Blocker: Request (G5) và sự kiện điều chuyển/nghỉ việc (G6) chưa có. Điều kiện gỡ: các Story đó `verified`.

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G5/G6).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map; cổng điều kiện cấp ở `g4-provisioning-queue-manual` là điểm nối.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                        | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| -------------- | ---------------------------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| US-04-10 AC-5  | Bộ mới chỉ áp cho yêu cầu mới (chờ blocker)                | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-10 AC-6  | Đổi chức vụ trong cùng phòng (`QĐ-62p`(3)) (chờ blocker)   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-10 AC-11 | Hiện trước khi tạo yêu cầu (chéo `US-05-01`) (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-01 AC-1  | Happy path (chờ blocker)                                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-01 AC-3  | Chưa đủ phê duyệt (chờ blocker)                            | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-01 AC-15 | Khởi tạo không thay đường cấp thường (chờ blocker)         | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-01 AC-16 | Request đã kết thúc không được cấp (chờ blocker)           | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-4  | Hết hạn mức (chờ blocker)                                  | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-6  | Đóng thất bại hẳn (cấp) (chờ blocker)                      | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-12 | Thu lại lời mời sau M ngày (chờ blocker)                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể (từ chối, đồng thời, edge case) được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: lập khung theo bản đồ phân rã G3/G4 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: phần cổng cấp phát của hạng mục này — `US-07-01` AC-1, AC-3, AC-15, AC-16 — đã được làm kèm ở [`g5-internal-software-path`](../g5-internal-software-path/spec.md) (cổng `claimForGrant` và `reportOutcome`, Request cấp một lần). Phần còn lại (`US-04-10` AC-5, AC-6, AC-11; `US-07-04` AC-4, AC-6, AC-12, AC-15; mọi thứ chờ G6) vẫn `blocked`; chưa đổi trạng thái hạng mục.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F28, F29 — Request trả phí khi người thụ hưởng điều chuyển (`QĐ-90b`).
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
