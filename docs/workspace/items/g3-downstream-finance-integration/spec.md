# Spec: khung — phần tài chính của G3/G4 chờ hóa đơn, báo cáo, cam kết và import (G5/G8/G9)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 và G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- _Tác động 22/10/2026 (baseline Docs `72e1480`):_ khoản cam kết nay tối đa một mỗi (Request, năm tài chính) (`QĐ-84b`,
  `INV-16`), Finance không ghi nhận sau duyệt (`QĐ-82m` B), mọi chi phí quy về Cost Center `Unit` (`QĐ-86`). Khi gỡ blocker,
  thiết kế lại các AC của khung theo dòng C01, C02, C05, C14 của
  [ma trận](../business-baseline-impact-2026-10-22/spec.md#ma-trận-tác-động-ae).
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các AC của G3/G4 chỉ kiểm được khi đã có hóa đơn, ảnh chụp ngân sách, khoản cam kết, báo cáo chi phí theo Cost Center, bảng mục nợ và lần import sao kê.

## Sizing decision

- Container: G3, G4 và G5 (nhóm giao việc, không phải ranh giới hạng mục; G5 thêm ngày 27/10/2026 để giữ `US-12-15` AC-24; G8 thêm ngày 31/10/2026 để giữ `US-12-15` AC-3 vế tiền).
- Mode: `split-story`.
- Outcome and owner: Hoàn tất các AC của G3/G4 chỉ kiểm được khi đã có hóa đơn, ảnh chụp ngân sách, khoản cam kết, báo cáo chi phí theo Cost Center, bảng mục nợ và lần import sao kê.
- Boundaries: Hạng mục khung: không có code. Mở khóa khi các lát G5 (cam kết), G8 (hóa đơn, báo cáo, khép kỳ) và G9 (import sao kê) có nguồn.
- Not larger: Không thêm AC mới; chỉ giữ chỗ cho AC đã ánh xạ.
- Not smaller: Các AC này cùng chờ một nhóm hạ tầng dữ liệu tài chính; tách theo Story sẽ tạo bốn khung rỗng.
- Siblings: `g3-vendor-tax-profile`, `g3-shared-cost-allocation`, `g3-contract-documents`, `g4-provisioning-failure-handling`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4), [G5](../../../roadmap.md#work-item-decomposition-g5), [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC               | Coverage | Phần còn lại thuộc                                                                                                                                                        |
| -------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-04 | AC-4→AC-7, AC-11 | partial  | AC-1→AC-3, AC-6, AC-9, AC-10: `g3-contract-documents`; AC-8: `g4-device-dependent-features`                                                                               |
| US-07-04 | AC-5             | partial  | AC-1→AC-3, AC-6→AC-14: `g4-provisioning-failure-handling`; AC-3, AC-6, AC-12, AC-13: `g4-notification-delivery`; AC-4, AC-6, AC-12: `g4-request-and-transfer-integration` |
| US-12-09 | AC-5, AC-9       | partial  | AC-1→AC-8: `g3-vendor-tax-profile`                                                                                                                                        |
| US-12-15 | AC-3             | partial  | vế vận hành của trang trưởng phòng: `a10-manager-dashboard`; vế thực chi và cam kết đang giữ của phòng chờ contract ngân sách/chi phí (B-08)                              |
| US-12-15 | AC-24            | partial  | vế phát thông báo trong ứng dụng (`FR-5.14`, F67): `g5-budget-proposal-and-review`                                                                                        |

## Size exception

- Cohesion: Mọi AC trong khung cùng thiếu một điều kiện: dữ liệu tài chính G5/G8/G9 chưa tồn tại.
- Why not split: Mỗi Story chỉ còn một đến hai AC chờ; bốn hạng mục khung riêng chỉ lặp cùng một blocker.
- Checkpoints: Không có phase; khung chuyển `ready` khi blocker được gỡ và khi đó mới tách theo Story.
- Maximum scope: Chỉ các AC ghi ở bảng Primary; không thêm AC, không code trước khi blocker được gỡ.
- Accepted by: AI theo giao việc Owner, 20/10/2026 — Owner xác nhận khi review roadmap.

## Supporting references

US `US-12-09`, `US-04-08`, `US-04-04`, `US-07-04`; `FR-5.8`, `FR-5.13`, `FR-5.4`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map.

## Dependencies and blockers

Blocker: `US-12-10`, `US-12-14`, `US-06-04`, `US-13-01`, `US-12-15` chưa có. Theo dõi: người phụ trách G5/G8. Điều kiện gỡ: các Story đó `verified`.

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G8).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map; thiết kế khi blocker được gỡ.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                           | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| -------------- | ----------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| US-04-04 AC-4  | Hóa đơn chưa có hợp đồng (chờ blocker)                                        | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-04 AC-5  | Người duyệt chi (OI-08a) (chờ blocker)                                        | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-04 AC-6  | Mục đích, người tải lên, quyền trước và sau khi gắn (chờ blocker)             | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-04 AC-7  | Chứng từ thuế nộp thay (`FR-5.13`, BM-05) (chờ blocker)                       | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-04 AC-11 | Sao kê chi phí do Finance tải (chờ blocker)                                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-08 AC-1  | Happy path (chờ blocker)                                                      | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-08 AC-3  | Gói theo đầu người (chờ blocker)                                              | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-08 AC-4  | Khoản chi phần mềm nội bộ không chia tỷ lệ (`QĐ-49g`) (chờ blocker)           | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-5  | Mục nợ (chờ blocker)                                                          | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-12-09 AC-5  | Đổi hồ sơ không viết lại quá khứ (chờ blocker)                                | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-12-09 AC-9  | Đổi hồ sơ thuế khi khoản cam kết đang giữ (`FR-5.8`, `FR-3.14`) (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể (từ chối, đồng thời, edge case) được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: lập khung theo bản đồ phân rã G3/G4 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

## Cập nhật scope map theo baseline `e0cb5a0` (Prompt 04, 27/10/2026)

- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G3](../../../roadmap.md#work-item-decomposition-g3) Docs `e0cb5a0`, BE `7c28e75`):_ `US-04-08` `RETIRED` nên bỏ dòng `US-04-08` AC-1, AC-3, AC-4 khỏi bảng _Primary Story/AC_ (lịch sử: từng `partial` — AC-1 vế báo cáo, AC-3, AC-4 khoản chi nội bộ, chờ G8/G9); nhận `US-12-15` AC-24 `partial` ở khung G8 (danh mục cảnh báo và bảng điều khiển; phần phát thông báo trong ứng dụng thuộc `g5-budget-proposal-and-review`, scope map G5); trường `Container` và liên kết `Scope map` của hạng mục thêm G5 để khóa G5 này khớp bản đồ ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64), [mục 9.1](../g0-g6-final-business-baseline-remediation/impact-matrix.md#91-delta-user-stories-769bb64--e0cb5a0)). Phần đã ghi phía trên là lịch sử, giữ nguyên.
