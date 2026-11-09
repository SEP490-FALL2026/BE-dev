# Spec: khung — phần gửi thông báo trong ứng dụng của G3/G4 chờ hộp thông báo (G5/G8)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026).
- Thiết kế: `superseded` (31/10/2026: tiếp quản bởi [a03-license-inbox-alerts](../a03-license-inbox-alerts/spec.md)). Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 và G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- _Tác động 22/10/2026 (baseline Docs `72e1480`):_ scope map G2 hoãn `US-02-02` AC-17 (báo hồ sơ nhân viên mới cho IT
  Admin phụ trách và trưởng phòng — kiểm soát bù của `QĐ-82i`) tới khung này; khi gỡ blocker, thêm AC đó vào bảng Primary
  và `Container` G2. Xem [g2-employee-intake-by-super-admin](../g2-employee-intake-by-super-admin/spec.md).
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các AC của G3/G4 có vế _nhận thông báo_: trưởng phòng khi bộ chuẩn đổi, người yêu cầu khi tác vụ thủ công hoàn tất hoặc thất bại, Super Admin khi lỗi xác thực kết nối.

## Sizing decision

- Container: G3 và G4 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Hoàn tất các AC của G3/G4 có vế _nhận thông báo_: trưởng phòng khi bộ chuẩn đổi, người yêu cầu khi tác vụ thủ công hoàn tất hoặc thất bại, Super Admin khi lỗi xác thực kết nối.
- Boundaries: Hạng mục khung: không có code. Mở khóa khi hộp thông báo trong ứng dụng (`US-05-15`) và danh mục cảnh báo (`US-12-15`) có nguồn.
- Not larger: Không thêm AC mới; chỉ giữ chỗ cho vế thông báo đã ánh xạ.
- Not smaller: Các vế cùng chờ một hộp thông báo; tách theo Story chỉ lặp cùng blocker.
- Siblings: `g3-standard-toolset`, `g4-provisioning-queue-manual`, `g4-provisioning-failure-handling`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC                       | Coverage | Phần còn lại thuộc                                                                                                                                             |
| -------- | ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-07-02 | AC-1                     | partial  | AC-1→AC-7: `g4-provisioning-queue-manual`; AC-4: `g4-device-dependent-features`                                                                                |
| US-07-04 | AC-3, AC-6, AC-12, AC-13 | partial  | AC-1→AC-3, AC-6→AC-14: `g4-provisioning-failure-handling`; AC-4, AC-6, AC-12: `g4-request-and-transfer-integration`; AC-5: `g3-downstream-finance-integration` |

## Supporting references

`US-05-15`, `US-12-15`, `FR-3.11`, `BR-12.4`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map.

## Dependencies and blockers

Blocker: hộp thông báo trong ứng dụng chưa có (module `notifications` hiện chỉ có outbox thư). Điều kiện gỡ: `US-05-15` `verified`. _Cập nhật 24/10/2026: hộp thư và cửa `NotificationsService.notifyInApp` đã có (Phase 1 của `g5-request-status-notifications`, `verified` local; bảng mã đóng và khóa tham số ở `inbox/inbox.policy.ts`, thêm mã của hạng mục này vào đó); hạng mục này chưa mở khóa cho tới khi người tích hợp ghi `US-05-15` `verified` ở roadmap._

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G5).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)      | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| -------------- | ---------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| US-04-10 AC-1  | Cấu hình theo đề xuất (chờ blocker)      | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-10 AC-3  | Chủ động cập nhật (chờ blocker)          | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-02 AC-1  | Happy path (chờ blocker)                 | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-3  | Xác thực (chờ blocker)                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-6  | Đóng thất bại hẳn (cấp) (chờ blocker)    | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-12 | Thu lại lời mời sau M ngày (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-04 AC-13 | Thông báo không có mã lỗi (chờ blocker)  | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể (từ chối, đồng thời, edge case) được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: lập khung theo bản đồ phân rã G3/G4 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F58 — cảnh báo license `FR-5.14` (phạm vi theo P03-D15).
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G3](../../../roadmap.md#work-item-decomposition-g3) Docs `e0cb5a0`, BE `7c28e75`):_ `US-04-10` `RETIRED` nên bỏ dòng `US-04-10` AC-1, AC-3 khỏi bảng _Primary Story/AC_ (lịch sử: từng `partial` — vế thông báo cho trưởng phòng khi đổi bộ chuẩn) ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)). Phần đã ghi phía trên là lịch sử, giữ nguyên.

## Tiếp quản bởi A-03 (31/10/2026)

- Hạng mục được tiếp quản bởi [a03-license-inbox-alerts](../a03-license-inbox-alerts/spec.md) (Dev A, A-03, F58, `RA-06`),
  re-pin theo `FR-5.14`/`US-12-15` Docs `726219a`, BE `6eb12d1`. Phần bộ chuẩn (`US-04-10`, `RETIRED`) bỏ hẳn.
- Vế thông báo của `US-07-02` AC-1, `US-07-04` AC-3, AC-6, AC-12, AC-13 chuyển sang A-03; AC-3 (lỗi xác thực connector) và
  AC-12 (thu lại lời mời) `blocked` chờ contract G7 của Owner. Khung này vào danh sách `legacy` của `rules-check.config.json`;
  mọi phần phía trên giữ làm lịch sử, không sửa.
