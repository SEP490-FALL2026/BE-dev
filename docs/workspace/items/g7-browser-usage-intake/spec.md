# Spec: g7-browser-usage-intake — lô usage trình duyệt từ extension (S2b, khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: Owner + Claude (thiết kế G7 05/11/2026, lát S2b); khung spec do AI (điều phối viên).
- Thiết kế: `draft`. Owner review: lát S2b có trong [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §12
  (Owner duyệt 05/11/2026); spec chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `BE-UserStory/src/EP-08.md`, `EP-09.md`), BE `3e4553b9`.
- Nhóm roadmap: G7 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, extension trình duyệt trên máy công ty đã đăng ký gửi được lô usage theo tên miền nằm trong danh sách cho phép
(mục `WEB_DOMAIN`), BE nhận hoặc từ chối có lý do và ghi vào kho usage như nguồn AI (lát S2b của DESIGN §12: _Browser batch_,
sau S2a). Kiểm được bằng HTTP + integration. Chi tiết: chưa thiết kế — Đợt sau.

## Sizing decision

- Container: G7 (lát S2b của DESIGN §12).
- Mode: `grouped-stories`.
- Outcome and owner: usage trình duyệt vào kho usage qua cổng nhận dùng chung với collector AI; capability dự kiến cổng intake
  của `g7-ai-usage-intake`.
- Boundaries: dự kiến một route nhận lô do thiết bị xác thực, mục `WEB_DOMAIN` của allowlist; xác định khi thiết kế chi tiết.
- Not larger: collector AI là `g7-ai-usage-intake`; import báo cáo nhà cung cấp là `g7-vendor-usage-import-identity`; gán
  Assignment và rule là `g7-g3-g4-decisions`.
- Not smaller: allowlist `WEB_DOMAIN`, lô trình duyệt và vế trình duyệt của cổng nhận là một đường dữ liệu; tách ra thì không
  có đường kiểm chứng riêng. Đánh giá lại khi thiết kế chi tiết.
- Siblings: `g7-ai-usage-intake`, `g7-vendor-usage-import-identity`, `g7-g3-g4-decisions`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7) — dòng do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC                                   | Coverage | Phần còn lại thuộc                                                                                                                                                                 |
| -------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-08-01 | AC-6                                 | partial  | AC-8: `g7-vendor-usage-import-identity`; AC-1→AC-5, AC-7: `g7-vendor-usage-csv-template`; AC-9: `g7-ai-usage-intake`                                                               |
| US-09-02 | AC-1→AC-6                            | partial  | AC-7: `g7-ai-usage-intake`                                                                                                                                                         |
| US-09-05 | AC-1, AC-4, AC-8, AC-10→AC-12, AC-14 | partial  | vế collector AI của các AC này và AC-3, AC-6, AC-9, AC-13: `g7-ai-usage-intake`; AC-1 vế gán Assignment, AC-5, AC-7: `g7-g3-g4-decisions`; AC-2: `g7-device-credential-enrollment` |

## Supporting references

- [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §2, §12 (S2b phụ thuộc S2a; T1/T2 phía tool).

## Explicit out of scope

Vế collector AI; extension phía tool (workstream T2); chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `g7-ai-usage-intake` (S2a) phải xong trước.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ---------------------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-09-02`, `US-09-05` | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết, Owner review; mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
