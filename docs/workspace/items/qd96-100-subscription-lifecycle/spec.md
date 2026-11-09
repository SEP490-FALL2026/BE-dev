# Spec: qd96-100-subscription-lifecycle — vòng đời thuê bao: điểm linh hoạt, hết hạn và đóng, đổi tier (khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: AI (điều phối viên) theo [ITEMS.md](../../../reviews/qd96-100-alignment-2026-11-05/ITEMS.md) H3.
- Thiết kế: `draft`. Owner review: chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `US-11-06`, `US-11-05`), BE `3e4553b9` (cây làm việc `808318a4`). Ledger:
  L-604, L-608, L-609, L-611, L-612, L-613, L-615, L-616, L-618, L-619, L-805 (vế A5-09), L-810, L-812, L-813.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, thuê bao đi hết vòng đời sau khi trưởng phòng sở hữu xác nhận: điểm điều chỉnh của thuê bao linh hoạt, hết hạn
chưa gia hạn và đóng thuê bao, đổi tier và ghi kết quả, nhắc và email; kiểm được bằng HTTP + integration. Chi tiết: chưa thiết
kế — Đợt sau. ITEMS.md ghi lượt thiết kế phải tách ít nhất bốn hạng mục (điểm linh hoạt; hết hạn và đóng; đổi tier và kết quả;
nhắc và email) — khung này giữ chủ AC tới khi tách.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (H3, hoãn), Story thuộc G8.
- Mode: `single-story`.
- Outcome and owner: vòng đời thuê bao sau xác nhận điều chỉnh; capability dự kiến `catalog/subscription`,
  `licensing/subscription-renewal`.
- Boundaries: chưa xác định — lượt thiết kế chi tiết tách thành nhiều hạng mục theo transaction/job.
- Not larger: vai xác nhận là `qd96-100-subscription-owner-confirmation`; mốc nhắc và người nhận là
  `qd96-100-renewal-milestones-and-recipients`.
- Not smaller: khung giữ chủ AC; việc tách (ít nhất bốn hạng mục) là Task 1 của plan.
- Siblings: `qd96-100-subscription-owner-confirmation`, `qd96-100-renewal-milestones-and-recipients`.
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8) — dòng `deferred` do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                                                    |
| -------- | ------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| US-11-06 | AC-15, AC-16 | partial  | AC-1→AC-7, AC-9→AC-14: `qd96-100-subscription-owner-confirmation`; AC-8: `qd96-100-renewal-milestones-and-recipients` |

## Supporting references

- Spec `qd96-100-subscription-owner-confirmation` ghi `US-11-05` AC-1, AC-6→AC-10, AC-26, AC-28, AC-29 thuộc hạng mục này; map G8
  hiện giao AC-1, AC-6→AC-10 cho `a06-*` và chưa có dòng AC-26, AC-28, AC-29 — không claim tới lượt re-baseline map.
- Owner Q-01, Q-09 ([ITEMS.md](../../../reviews/qd96-100-alignment-2026-11-05/ITEMS.md) H3, ≈ 60h).

## Explicit out of scope

Mọi phần ngoài AC ở bảng trên; chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `qd96-100-subscription-owner-confirmation` (#9); Owner Q-01, Q-09.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ----------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-11-06`  | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết (đã tách hạng mục), Owner review; mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
