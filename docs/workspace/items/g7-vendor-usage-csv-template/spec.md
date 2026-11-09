# Spec: g7-vendor-usage-csv-template — import usage nhà cung cấp theo mẫu CSV (S3b, khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: Owner + Claude (thiết kế G7 05/11/2026, lát S3b); khung spec do AI (điều phối viên).
- Thiết kế: `draft`. Owner review: lát S3b có trong [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §12
  (Owner duyệt 05/11/2026); spec chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `BE-UserStory/src/EP-08.md`), BE `3e4553b9`.
- Nhóm roadmap: G7 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, IT Admin tải được báo cáo usage nhà cung cấp dạng CSV theo mẫu chuẩn của hệ thống (bên cạnh báo cáo JSON của
S3a), xem trước, sửa dòng lỗi và xác nhận ghi vào kho usage (lát S3b của DESIGN §12: _Import CSV theo mẫu_, sau S3a). Kiểm được
bằng HTTP + integration. Chi tiết: chưa thiết kế — Đợt sau.

## Sizing decision

- Container: G7 (lát S3b của DESIGN §12).
- Mode: `grouped-stories`.
- Outcome and owner: định dạng CSV theo mẫu cho luồng import đã có; capability dự kiến `usage/usage-import`.
- Boundaries: dự kiến dùng lại bảng và transaction xác nhận của `g7-vendor-usage-import-identity`; thêm bộ đọc CSV và tệp mẫu.
- Not larger: nguồn, import JSON, khớp danh tính là `g7-vendor-usage-import-identity`; rule là `g7-g3-g4-decisions`.
- Not smaller: mẫu, bộ đọc và xem trước CSV là một đường vào; tách ra thì không kiểm được độc lập. Đánh giá lại khi thiết kế chi
  tiết.
- Siblings: `g7-vendor-usage-import-identity`, `g7-browser-usage-intake`, `g7-g3-g4-decisions`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7) — dòng `deferred` do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC              | Coverage | Phần còn lại thuộc                                                                                   |
| -------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| US-08-01 | AC-1→AC-5, AC-7 | partial  | AC-8: `g7-vendor-usage-import-identity`; AC-6: `g7-browser-usage-intake`; AC-9: `g7-ai-usage-intake` |
| US-08-02 | AC-7            | partial  | AC-1→AC-3, AC-5, AC-6: `g7-vendor-usage-import-identity`; AC-4: `g7-g3-g4-decisions`                 |
| US-08-03 | AC-2            | partial  | AC-1, AC-3: `g7-vendor-usage-import-identity`; AC-4: `g7-g3-g4-decisions`                            |

## Supporting references

- [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §4, §12; data model của
  [g7-vendor-usage-import-identity](../g7-vendor-usage-import-identity/data-model.md).

## Explicit out of scope

Import JSON và khớp danh tính (S3a); chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `g7-vendor-usage-import-identity` (S3a) phải xong trước.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ----------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-08-01`  | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết, Owner review; mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
