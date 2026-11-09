# Spec: khung — gia hạn subscription dùng evidence sử dụng (G7 của Owner)

- Phụ trách: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-06 của người dùng (31/10/2026).
- Thiết kế: `blocked`. Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-11-01` AC-3, `US-11-02` AC-20, `US-11-05` AC-4), BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Business outcome

Khi Owner bàn giao contract evidence sử dụng/khuyến nghị (G7), cảnh báo gia hạn kèm các khuyến nghị `G1`/`G3`/`G4` đang mở và
tiết kiệm tại kỳ gia hạn ước tính, hồ sơ gia hạn hiện số liệu sử dụng, và danh sách ghế phải thu hồi xếp được nhóm `G3`/`G4` và
hoạt động cuối — mà không tự suy usage 0 hay tự tạo thuật toán ghost.

## Sizing decision

- Container: G8 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: nối evidence G7 vào gia hạn qua điểm mở `RenewalUsageContributions` của licensing; capability
  `licensing/subscription-renewal`.
- Boundaries: khung, không code mới tới khi có contract; điểm mở và trạng thái `NOT_AVAILABLE` đã có ở các hạng mục chủ.
- Not larger: không nhận ingest, rule, recommendation engine hay privacy usage (Owner, G7).
- Not smaller: ba vế cùng chờ một contract (`RenewalUsageReader`) và một bộ test tích hợp thật theo revision G7.
- Siblings: `a06-renewal-milestone-alerts`, `a06-renewal-proposal-decision`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                           |
| -------- | ----- | -------- | -------------------------------------------------------------------------------------------- |
| US-11-01 | AC-3  | partial  | cảnh báo mốc, người nhận, trạng thái `usageData`: `a06-renewal-milestone-alerts`             |
| US-11-02 | AC-20 | partial  | danh sách xếp, chọn đúng số ghế, quyền: `a06-renewal-proposal-decision`                      |
| US-11-05 | AC-4  | partial  | hồ sơ nêu `NOT_AVAILABLE` thay vì 0 và vẫn lập được đề xuất: `a06-renewal-proposal-decision` |

## Supporting references

`FR-4.12`, `FR-4.15`, `QĐ-66x`; `DEV-A.md` A-06 ("không tự bổ sung thuật toán nhận diện không dùng"); handoff Tools G7.

## Explicit out of scope

Thuật toán ghost/usage, coverage, privacy/retention của usage: Owner (G7). Phép tính tiết kiệm/KPI: B-08.

## Dependencies and blockers

Blocker: contract evidence G7 của Owner (`lastActivityOn`, cờ khuyến nghị theo Assignment, khuyến nghị theo subscription và
tiết kiệm ước tính). Gỡ khi Owner bàn giao revision có test tích hợp thật; không claim xong bằng mock.

## Ownership: module, data, API

Điểm mở `RenewalUsageContributions` (`licensing.renewal-usage-evidence`, `public/licensing.extension-points.ts`), contract
`RenewalUsageReader` (`public/licensing-subscription-renewal.types.ts`). Khi gỡ: thêm tham số khuyến nghị vào
`SUBSCRIPTION_RENEWAL_ALERT` (không số tiền trong thông báo) và trường usage của hồ sơ.

## Behavior and design

Hiện có: không ai thêm reader → `usage.status = NOT_AVAILABLE`, `usageData = NOT_AVAILABLE`, xếp ghế không dùng usage (nhóm
`USAGE_FLAGGED` rỗng, phần còn lại theo ghế cũ nhất). Khi có reader: `rankSeats` đã dùng `flagged` và `lastActivityOn` (unit test có
sẵn); phần còn lại là contract, phân quyền dữ liệu usage và test tích hợp thật.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)     | Cấp test                  | Kết quả mong đợi                                | Bằng chứng sau implement                       |
| -------------- | --------------------------------------- | ------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| US-11-01 AC-3  | Cảnh báo kèm 6 khuyến nghị (chờ G7)     | integration theo contract | theo AC trong nguồn; ma trận cụ thể khi `ready` | chưa chạy                                      |
| US-11-02 AC-20 | Nhóm `G3`/`G4`, hoạt động cuối (chờ G7) | unit + integration        | xếp đúng thứ tự `QĐ-66x`                        | unit `rankSeats` có sẵn; integration chưa chạy |
| US-11-05 AC-4  | Usage quá cũ → "không đánh giá được"    | integration               | lý do thay vì 0                                 | chưa chạy                                      |

## Definition of Done

- [ ] Contract G7 có revision; test tích hợp thật xanh.
- [ ] Scope map G8 cập nhật.

## Changes and acceptance

31/10/2026: lập khung; chưa Owner review.
