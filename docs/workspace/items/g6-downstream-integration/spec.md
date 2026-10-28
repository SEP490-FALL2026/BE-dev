# Spec: khung — phần G6 chờ rule và khuyến nghị (G7), chi phí theo ngày và tiết kiệm (G8), hộp thông báo

- Phụ trách: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (24/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các vế AC của nhóm điều chuyển, nghỉ việc, quyền có hạn chỉ kiểm được khi đã có bộ rule `G1`→`G4` và khuyến nghị (nghỉ dài loại khỏi đánh giá, khuyến nghị `G2` khi nghỉ việc và trong lúc giữ gỡ, ghost seat), chi phí chia theo ngày và tiết kiệm (G8), và hộp thông báo trong ứng dụng cho nhắc trước hạn.

## Sizing decision

- Container: G6 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: giữ chỗ cho các vế AC của G6 chờ dữ liệu hay luồng ngoài nhóm; capability `personnel` và `licensing` (khi mở khóa).
- Boundaries: hạng mục khung, không có code. Mở khóa khi rule `G1`→`G4` và `US-10-01` (G7), `US-12-13` và ghi nhận tiết kiệm (G8), hộp thông báo `US-05-15` có nguồn.
- Not larger: không thêm AC mới; chỉ giữ chỗ cho vế AC đã ánh xạ ở scope map.
- Not smaller: mỗi Story chỉ còn một vài vế chờ cùng một vài blocker ngoài nhóm; khung riêng cho từng Story chỉ lặp blocker.
- Siblings: `g6-transfer-record`, `g6-long-leave`, `g6-offboarding-record`, `g6-revocation-by-grant-kind`, `g6-handover-confirmation`, `g6-transfer-tool-review`, `g6-time-limited-access`, `g3-downstream-finance-integration`, `g4-device-dependent-features`, `g4-notification-delivery`.
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6).

## Size exception

- Cohesion: mọi vế trong khung cùng thiếu một điều kiện nằm ngoài các hạng mục G6 đã thiết kế: bộ rule và khuyến nghị của G7, chi phí chia theo ngày và tiết kiệm của G8, hoặc hộp thông báo trong ứng dụng.
- Why not split: mỗi Story chỉ còn một đến bốn vế chờ, cùng ba blocker; sáu khung riêng chỉ lặp cùng blocker và cùng bộ test đọc dữ liệu của G6.
- Checkpoints: không có phase; khung chuyển `ready` khi blocker được gỡ và khi đó mới tách theo blocker.
- Maximum scope: chỉ các AC ghi ở bảng Primary; không thêm AC, không code trước khi blocker được gỡ.
- Accepted by: AI theo giao việc của người dùng, 24/10/2026 — chờ Owner xác nhận, chưa phải Owner duyệt.

## Primary Story/AC

| Story    | AC                         | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                  |
| -------- | -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-01 | AC-1                       | partial  | AC-1 (vế điều chuyển và Cost Center suy ra), AC-2, AC-4→AC-8, AC-11, AC-13→AC-16, AC-18→AC-24: `g6-transfer-record`; AC-9: `g6-service-account-handover`; AC-12: `g3-downstream-finance-integration`                                                                                |
| US-03-03 | AC-1→AC-3                  | partial  | AC-4, AC-5, AC-7, AC-8: `g6-long-leave`; AC-6: `g6-offboarding-record`                                                                                                                                                                                                              |
| US-03-04 | AC-3, AC-6, AC-16, AC-21   | partial  | vế danh sách quyền, thu hồi và hồ sơ của các AC này: `g6-offboarding-record`; AC-11, AC-13, AC-27, AC-28: `g6-leaver-role-and-workspace-duties`; AC-17: `g6-service-account-handover`; AC-24, AC-25: `g6-leaver-request-closure`; vế K4 của AC-16 chờ `g4-device-dependent-features` |
| US-03-05 | AC-1                       | partial  | AC-1 (vế nhắc, audit, danh sách), AC-2, AC-6→AC-11: `g6-time-limited-access`; AC-3: `g3-downstream-finance-integration`; AC-5: `g5-return-and-renewal-requests`                                                                                                                     |
| US-03-07 | AC-3                       | partial  | AC-1, AC-2, AC-3 (vế quyết định), AC-4→AC-9, AC-11→AC-15: `g6-transfer-tool-review`; AC-10: `g3-downstream-finance-integration`                                                                                                                                                     |
| US-07-05 | AC-10, AC-12, AC-13, AC-15 | partial  | AC-1→AC-5, AC-8, AC-11, AC-12 (vế tác vụ và Assignment), AC-15 (vế quyền còn), AC-17→AC-19: `g6-revocation-by-grant-kind`; AC-13 (vế giữ gỡ), AC-16: `g6-handover-confirmation`; AC-9: `g6-transfer-tool-review`; AC-6, AC-7: `g4-device-dependent-features`                        |

## Supporting references

`US-10-01`, `US-10-02`, `US-10-03`, `US-10-06`, `US-12-13`, `US-12-15`, `US-05-15`, `US-09-08`, `US-14-03`; `FR-4.9`, `FR-4.15`, `FR-3.18`, `QĐ-35b`, `QĐ-55b`, `QĐ-62e`, `QĐ-77l`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map G6; hạng mục này không hiện thực gì.

## Dependencies and blockers

Blocker: bộ rule `G1`→`G4` và hàng đợi ghost seat (`US-10-01`→`US-10-03`, `US-10-06`, G7); chi phí chia theo ngày (`US-12-13`) và ghi nhận tiết kiệm đúng loại (`FR-4.15`, G8); hộp thông báo trong ứng dụng (`US-05-15`, `g4-notification-delivery`); K4 gán kèm thiết bị (`g4-device-dependent-features`, G7). Theo dõi: người phụ trách G7 và G8. Điều kiện gỡ: các Story đó `verified`.

**Điểm gọi G6 sẽ cung cấp khi khung được thiết kế lại:** `PersonnelService.getLeaveIntervals(employeeIds, from, to)` (khoảng nghỉ dài, `g6-long-leave`); `LicensingService.listPersonalSeatsOf` và tác vụ thu hồi có nguồn (`g6-revocation-by-grant-kind`) cho nhãn `G2` và lãng phí trong lúc giữ gỡ hay thu hồi lỗi; `handover_duties` còn mở (`g6-handover-confirmation`) cho dấu _đang giữ gỡ_; audit event `OFFBOARDING_CASE.LEFT`, `LICENSE_ASSIGNMENT.EXPIRY_REMINDER` và các event nhắc khác của nhóm cho hộp thông báo; Assignment mang Cost Center và kỳ theo phòng cho phân bổ chi phí theo ngày.

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G7 và G8).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map; thiết kế khi blocker được gỡ.

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                          | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| US-03-01 AC-1                | chi phí tháng 06 thuộc `CC-DES`, tháng 07 thuộc `CC-FIN` (chờ blocker)       | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-03-03 AC-1→AC-3           | nghỉ dài loại khỏi đánh giá, tạm dừng, không tính khoảng nghỉ (chờ blocker)  | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-03-04 AC-3, AC-21         | khuyến nghị `G2` khi nghỉ việc, không có `G2` cho K5 (chờ blocker)           | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-03-04 AC-6, AC-16         | tiết kiệm ghi đúng loại; vế K4 (chờ blocker)                                 | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-03-05 AC-1                | nhắc trong hộp thông báo trong ứng dụng (chờ blocker)                        | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-03-07 AC-3                | chi phí Figma của người chuyển tính vào Cost Center phòng nhận (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-05 AC-10               | ghost seat chỉ thu hồi sau quyết định (chờ blocker)                          | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-05 AC-12, AC-13, AC-15 | `G2` hiện tới khi thu hồi xong, trong lúc giữ gỡ và khi lỗi (chờ blocker)    | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

24/10/2026: lập khung theo scope map G6 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

24/10/2026: `g6-handover-confirmation` đã xong (`verified` local): `openHandoverDuties`, `reconcileHandoverDuties`, `cancelHandoverDuties`, danh sách `GET /handover-duties` có `waitingReason` và `flaggedUnconfirmed`, sự kiện audit `HANDOVER_DUTY.*` là các điểm gọi khung có thể đọc; khuyến nghị `G2` trong lúc giữ gỡ vẫn thuộc hạng mục này.

24/10/2026: `g6-long-leave` đã xong (`verified` local): `PersonnelService.getLeaveIntervals(employeeIds, from, to)` (`personnel.service.ts`, đã trong `PUBLIC_CONTRACT_EXPORTS`) trả khoảng nghỉ dài theo lô, một câu lệnh: người nghỉ từ `startedOn` đến _trước_ `endedOn` (rỗng khi còn nghỉ); sự kiện audit `LONG_LEAVE.RETURN_OVERDUE` là điểm gọi nhắc IT Admin; `employees.work_state = ON_LONG_LEAVE` là cờ loại khỏi đánh giá. Chi tiết ở [spec](../g6-long-leave/spec.md#như-đã-xây-và-khác-biệt).

25/10/2026: `g6-time-limited-access` đã xong (`verified` local): điểm gọi cho vế hộp thông báo của `US-03-05` AC-1 là audit `LICENSE_ASSIGNMENT.EXPIRY_REMINDER` (một sự kiện cho mỗi người nhận: người giữ quyền, trưởng phòng, IT Admin phụ trách; `after` có `audience`, `recipientEmployeeId`, `holderEmployeeId`, `planId`, `departmentId`, `expectedEndDate`, `options`), và `GET /assignment-expiry-reminders` đọc lại nhắc của chính người gọi. `GET /assignment-expiry-queue` trả `daysOverdue` và cờ `debt` cho bảng điều khiển G8. Chi tiết ở [spec](../g6-time-limited-access/spec.md#như-đã-xây-và-khác-biệt).
