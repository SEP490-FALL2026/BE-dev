# Spec: qd96-100-renewal-milestones-and-recipients — mốc nhắc gia hạn và người nhận theo mốc (khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: AI (điều phối viên) theo [ITEMS.md](../../../reviews/qd96-100-alignment-2026-11-05/ITEMS.md) #10.
- Thiết kế: `draft`. Owner review: chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `US-11-06`), BE `3e4553b9` (cây làm việc `808318a4`). Ledger: L-605, L-606,
  L-607, L-805 (vế A5-08).
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, thuê bao sắp hết hạn được nhắc theo mốc mặc định `[90, 60, 30, 7]` với người nhận theo từng mốc (không gửi Người
duyệt chi và Super Admin), bỏ mốc ND−7 khi đã xác nhận và đã báo nhà cung cấp, thuê bao linh hoạt không chạy chuỗi mốc; sự cố
tự gia hạn báo thêm trưởng phòng sở hữu và Finance. Kiểm được bằng integration của job mốc. Chi tiết: chưa thiết kế — Đợt sau.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (#10, mức B), Story thuộc G8.
- Mode: `single-story`.
- Outcome and owner: mốc nhắc và người nhận; capability dự kiến `licensing/subscription-renewal/{alerts,deadline}`.
- Boundaries: dự kiến tham số mốc, cột `vendor_notified_at`, API mới `…/vendor-notice`; xác định ở lượt thiết kế chi tiết.
- Not larger: vai xác nhận điều chỉnh là `qd96-100-subscription-owner-confirmation`; hết hạn, đóng, đổi tier là
  `qd96-100-subscription-lifecycle`.
- Not smaller: mốc và người nhận cùng một job nhắc; tách ra để lại mốc gửi sai người. Đánh giá lại khi thiết kế chi tiết.
- Siblings: `qd96-100-subscription-owner-confirmation`, `qd96-100-subscription-lifecycle`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8) — dòng `deferred` do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC   | Coverage | Phần còn lại thuộc                                                                                                 |
| -------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| US-11-06 | AC-8 | partial  | AC-1→AC-7, AC-9→AC-14: `qd96-100-subscription-owner-confirmation`; AC-15, AC-16: `qd96-100-subscription-lifecycle` |

## Supporting references

- [ITEMS.md](../../../reviews/qd96-100-alignment-2026-11-05/ITEMS.md) #10 (phạm vi, ≈ 11h); `KPI-4`.

## Explicit out of scope

Mọi phần ngoài AC ở bảng trên; chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `qd96-100-subscription-owner-confirmation` (#9) phải xong trước.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro     | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| --------------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-11-06` AC-8 | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết, Owner review; mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
