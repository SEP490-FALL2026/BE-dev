# Spec: khung — phần kiểu cấp K4, bản ký và gán khóa kèm thiết bị công ty chờ sổ thiết bị (G7)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026).
- Thiết kế: `superseded` (31/10/2026, A-05: phân rã thành năm hạng mục `a05-*`, xem _Phân rã A-05_). Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 và G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Hoàn tất các AC của G3/G4 cần sổ thiết bị công ty đã đăng ký: gán khóa K4 kèm thiết bị, thu hồi khóa, vi phạm số cài đặt trên một khóa, bản ký `BM-06` và dòng hiện trạng K4.

## Sizing decision

- Container: G3 và G4 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `technical-enabler`
- Outcome and owner: Khung đã thay (31/10/2026), không còn sở hữu AC nào; mỗi AC/vế cũ có chủ mới ở mục _Phân rã A-05_. Outcome cũ: hoàn tất các AC của G3/G4 cần sổ thiết bị công ty đã đăng ký: gán khóa K4 kèm thiết bị, thu hồi khóa, vi phạm số cài đặt trên một khóa, bản ký `BM-06` và dòng hiện trạng K4.
- Boundaries: Hạng mục khung: không có code. Mở khóa khi sổ thiết bị `US-09-01` và thu hồi theo kiểu cấp `US-07-05` có nguồn.
- Not larger: Không thêm AC mới; chỉ giữ chỗ cho AC đã ánh xạ.
- Not smaller: Các AC đều chờ cùng sổ thiết bị; tách theo Story tạo nhiều khung chỉ lặp cùng blocker.
- Siblings: `a05-k4-device-registry-contract`, `a05-k4-key-grant-by-device`, `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`, `a05-k4-device-revocation`, `a05-bm06-signature-record`; trước đây `g3-license-key-vault`, `g3-vendor-terms-checklist`, `g4-seat-baseline-import`, `g4-provisioning-queue-manual`, `g3-contract-documents`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story | AC             | Coverage | Phần còn lại thuộc                                                                                                                                                                                           |
| ----- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —     | A05-SUPERSEDED | n/a      | thay bởi `a05-k4-key-grant-by-device`, `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`, `a05-k4-device-revocation`, `a05-bm06-signature-record` (contract: `a05-k4-device-registry-contract`) |

## Size exception

- Cohesion: Mọi AC trong khung cùng cần một thiết bị công ty đã đăng ký gắn với khóa hoặc bản ký.
- Why not split: Sáu Story chỉ còn vài AC chờ cùng sổ thiết bị; khung riêng cho từng Story lặp cùng một blocker.
- Checkpoints: Không có phase; khung chuyển `ready` khi sổ thiết bị có nguồn và khi đó mới tách theo Story.
- Maximum scope: Chỉ các AC ghi ở bảng Primary; không thêm AC, không code trước khi blocker được gỡ.
- Accepted by: AI theo giao việc Owner, 20/10/2026 — Owner xác nhận khi review roadmap.

## Supporting references

`US-09-01`, `US-07-05`, `FR-2.10`, `FR-4.18`, `QĐ-54b`, `QĐ-66g`, `QĐ-66al`.

## Explicit out of scope

Mọi phần đã giao cho hạng mục khác trong scope map.

## Dependencies and blockers

Blocker: sổ thiết bị công ty (`US-09-01`, G7) và `US-07-05` chưa có. Điều kiện gỡ: hai Story đó `verified`.

## Ownership: module, data, API

Chưa xác định (phụ thuộc thiết kế G7).

## Behavior and design

Chưa thiết kế — khung giữ chỗ cho scope map.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                            | Cấp test                    | Kết quả mong đợi                                     | Bằng chứng sau implement |
| -------------- | -------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- | ------------------------ |
| US-02-05 AC-11 | Hiện trạng theo kiểu cấp của gói (chờ blocker)                 | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-04 AC-8  | Bản ký `BM-06` (chờ blocker)                                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-11 AC-10 | Vi phạm vượt số cài đặt trên một khóa (gói `K4`) (chờ blocker) | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-12 AC-5  | Một khóa, một Assignment, thiết bị công ty (chờ blocker)       | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-12 AC-6  | Số khóa là sức chứa (`INV-01`) (chờ blocker)                   | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-12 AC-7  | Thu hồi, điều khoản cho chuyển máy (chờ blocker)               | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-04-12 AC-8  | Thu hồi, điều khoản không cho chuyển máy (chờ blocker)         | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-01 AC-10 | K4: gán khóa từ kho kèm thiết bị công ty (chờ blocker)         | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |
| US-07-02 AC-4  | Thẻ việc theo kiểu cấp (chờ blocker)                           | theo AC (HTTP + PostgreSQL) | theo AC trong nguồn; ma trận cụ thể viết khi `ready` | chưa chạy                |

Ma trận trên là khung từ tiêu đề AC; tình huống cụ thể (từ chối, đồng thời, edge case) được viết lại khi thiết kế chuyển `ready` và trước khi code.

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: lập khung theo bản đồ phân rã G3/G4 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

## Phân rã A-05 (31/10/2026)

- Khung này `superseded`: theo [A-05](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md) mọi Story/AC/vế từng giữ ở đây
  chuyển sang đúng một hạng mục mới; contract sổ thiết bị ở [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).
  Blocked on Owner G7 registry; design/contract only — không claim tích hợp K4.
- Bảng Primary cũ (lịch sử, không còn claim): `US-02-05` AC-11 → `a05-k4-baseline-key-by-device` (vế K4); `US-04-04` AC-8 →
  `a05-bm06-signature-record`; `US-04-11` AC-10 → `a05-k4-device-install-limit`; `US-04-12` AC-5, AC-6 →
  `a05-k4-key-grant-by-device`, AC-7, AC-8 → `a05-k4-device-revocation`; `US-07-01` AC-10 → `a05-k4-key-grant-by-device`;
  `US-07-02` AC-4 (vế K4) → `a05-k4-key-grant-by-device`. Thêm theo scope map G6: `US-07-05` AC-6, AC-7 và vế K4 của
  `US-03-04` AC-16 → `a05-k4-device-revocation`.
- Scope map G3/G4/G6 đã đổi theo phân rã A-05 trong [roadmap](../../../roadmap.md) (các dòng trỏ tới `a05-*`).
