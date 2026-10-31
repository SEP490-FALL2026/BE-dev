# Spec: a10-background-jobs-board — mục "tác vụ nền" của trang Super Admin (khung, chờ quyết định)

- Phụ trách: AI implementer theo giao việc Dev A (`A-10`); chưa có người nhận làm.
- Thiết kế ban đầu bởi: AI implementer khi phân rã `US-12-15` AC-7 ([bảng phân rã](../a10-operational-dashboards/spec.md)).
- Thiết kế: `blocked`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-12-15` AC-7 vế "tác vụ nền"; dòng 26 của danh mục cảnh báo, `US-07-04`),
  BE `6eb12d1`.
- Nhóm roadmap: G8 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi có nguồn: Super Admin thấy trên trang tổng quan số tác vụ nền cần chú ý (định nghĩa chờ Owner), thay cho mục hiện đang báo
`NOT_AVAILABLE` `NO_DATA_SOURCE` ở `GET /api/v1/dashboards/super-admin`.

## Sizing decision

- Container: G8 (`US-12-15`), Dev A `A-10`.
- Mode: `split-story`.
- Outcome and owner: số "tác vụ nền" của trang Super Admin; capability `dashboards/super-admin/` + facade của module giữ dữ liệu
  (chưa biết).
- Boundaries: chỉ đọc; không operation mới (thay mục `backgroundJobs` của `superAdminDashboardGet`).
- Not larger: chỉ một vế của AC-7.
- Not smaller: một vế, một nguồn.
- Siblings: `a10-super-admin-dashboard` (phần còn lại của AC-7).
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8).

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                |
| ---------- | ---- | -------- | ------------------------------------------------- |
| `US-12-15` | AC-7 | partial  | mọi vế khác của AC-7: `a10-super-admin-dashboard` |

## Supporting references

- `US-07-04` (lỗi kết nối nhà cung cấp, dòng 26 danh mục cảnh báo — connector thuộc G7 của Owner).

## Explicit out of scope

- Connector, sweep của worker, hàng đợi Redis: không có bảng ghi lần chạy trong BE hiện tại.

## Dependencies and blockers

- **Blocker (Owner):** "tác vụ nền" trên trang Super Admin là gì — lỗi kết nối nhà cung cấp (G7, chưa có connector), vòng job của
  worker (không có bảng ghi), hay task provisioning kênh `CONNECTOR` thất bại? Điều kiện gỡ: Owner chốt định nghĩa và nguồn.
- Theo dõi: Dev A (`A-10`). Không implement khi chưa gỡ.

## Ownership: module, data, API

Chưa xác định (phụ thuộc quyết định trên). Không đổi contract `superAdminDashboardGet` ngoài trạng thái mục `backgroundJobs`.

## Behavior and design

Hiện tại: mục `backgroundJobs` = `NOT_AVAILABLE` `NO_DATA_SOURCE` (đã implement ở `a10-super-admin-dashboard`). Phần còn lại:
không áp dụng tới khi gỡ blocker.

## Test matrix

| AC / rủi ro        | Tình huống   | Cấp test    | Kết quả mong đợi                             | Bằng chứng        |
| ------------------ | ------------ | ----------- | -------------------------------------------- | ----------------- |
| AC-7 vế tác vụ nền | khi có nguồn | integration | số khớp list nguồn; trước đó không bao giờ 0 | chưa có (blocked) |

## Definition of Done

- [ ] Owner chốt định nghĩa và nguồn "tác vụ nền".
- [ ] Mục `backgroundJobs` chuyển sang `COUNTED`/`AT_SOURCE` có test integration.

## Changes and acceptance

- 31/10/2026: lập khung deferred khi phân rã AC-7 (AI implementer). Chưa review, chưa nghiệm thu.
