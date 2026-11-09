# Spec: qd96-100-transfer-labels-and-overlap — nhãn T1–T4, chồng lấn 5 ngày làm việc, trạng thái giữ khi điều chuyển (khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: AI (điều phối viên) theo [ITEMS.md](../../../reviews/qd96-100-alignment-2026-11-05/ITEMS.md) H6.
- Thiết kế: `draft`. Owner review: chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `US-03-12`, BRD 4.0 `FR-2.16`, `QĐ-94f`(3)), BE `3e4553b9` (cây làm việc
  `808318a4`). Ledger: L-501, L-504, L-509.
- Nhóm roadmap: G6 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, mỗi quyền của người được điều chuyển mang nhãn T1–T4; quyền _không còn cần_ được giữ trong thời gian chồng lấn 5
ngày làm việc rồi mới thu hồi, quyền chờ Cost Center ở trạng thái giữ, và hạn được cộng thêm khi Request thay thế bị chặn ngân
sách; kiểm được bằng HTTP + integration của rà soát sau điều chuyển. Chi tiết: chưa thiết kế — Đợt sau.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (H6, hoãn), Story thuộc G6.
- Mode: `single-story`.
- Outcome and owner: nhãn và chồng lấn của quyền khi điều chuyển; capability dự kiến `personnel/transfer-review`.
- Boundaries: dự kiến bảng `transfer_review_items` và job rà soát đã có; xác định ở lượt thiết kế chi tiết.
- Not larger: thu hồi mặc định, báo trước, tạm dừng là `qd96-100-transfer-review-defaults`; Request cấp thay thế là
  `qd96-100-transfer-replacement-request`.
- Not smaller: nhãn quyết định thời điểm thu hồi trong chồng lấn; tách nhãn khỏi chồng lấn để lại giai đoạn có nhãn mà không có
  hành vi. Đánh giá lại khi thiết kế chi tiết.
- Siblings: `qd96-100-transfer-review-defaults`, `qd96-100-transfer-replacement-request`.
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6) — dòng `deferred` do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC                                  | Coverage | Phần còn lại thuộc                                     |
| -------- | ----------------------------------- | -------- | ------------------------------------------------------ |
| US-03-12 | AC-1→AC-4, AC-7→AC-10, AC-12, AC-13 | partial  | AC-5, AC-6, AC-11: `qd96-100-transfer-review-defaults` |

## Supporting references

- `US-03-07` AC-16, AC-17: spec `qd96-100-transfer-review-defaults` giao cho hạng mục này, nhưng scope map G6 chưa có dòng (xem
  [REGISTRATION](../../../reviews/qd96-100-alignment-2026-11-05/fe-batch/REGISTRATION.md)) — không claim tới lượt re-baseline map.
- Blocker MF-3 3.2/3.5 ở [DELTAS-APPLIED](../../../reviews/qd96-100-alignment-2026-11-05/fe-batch/DELTAS-APPLIED.md) mục 2.

## Explicit out of scope

Mọi phần ngoài các AC ở bảng trên; chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `qd96-100-transfer-review-defaults` (mô hình hạn), `qd96-100-revocation-deadline-and-withdraw` (facade `timing`). Owner Q-01.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ----------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-03-12`  | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết, Owner review; mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
