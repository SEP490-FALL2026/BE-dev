# Spec: g7-g3-g4-decisions — rule `G3`/`G4`, hàng đợi trưởng phòng, quyết định, thu hồi, miễn trừ (S4b, khung)

- Phụ trách: chưa giao — khung do AI (điều phối viên đăng ký) lập 05/11/2026 để AC `deferred` của scope map có chủ đăng ký.
- Thiết kế ban đầu bởi: Owner + Claude (thiết kế G7 05/11/2026, lát S4b); khung spec do AI (điều phối viên).
- Thiết kế: `draft`. Owner review: lát S4b có trong [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §12
  (Owner duyệt 05/11/2026); spec chưa review. **Khung — chưa thiết kế chi tiết (Đợt sau).**
- Nguồn: Docs `5dad7b6` (= `3d73a7f` + `QĐ-101`; `BE-UserStory/src/EP-08.md`, `EP-09.md`, `EP-10.md`), BE `3e4553b9`.
- Nhóm roadmap: G7 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, hệ thống sinh khuyến nghị `G3`/`G4` từ usage đã gắn Assignment (nguồn AI, trình duyệt, nhà cung cấp) trong cửa sổ
bao phủ, đưa vào hàng đợi của trưởng phòng; trưởng phòng quyết định thu hồi hoặc miễn trừ và quyết định thu hồi tạo tác vụ thu
hồi (lát S4b của DESIGN §12, sau S2a, S3a, S4a). Kiểm được bằng HTTP + integration. Chi tiết: chưa thiết kế — Đợt sau.

## Sizing decision

- Container: G7 (lát S4b của DESIGN §12).
- Mode: `grouped-stories`.
- Outcome and owner: rule dựa trên usage và quyết định của trưởng phòng; capability dự kiến `optimization/recommendation`.
- Boundaries: dự kiến dùng lại bảng khuyến nghị, rule run của `g7-g1-g2-recommendations`; đọc kho usage; ghi thu hồi qua facade
  `licensing`; xác định khi thiết kế chi tiết.
- Not larger: `G1`/`G2` là `g7-g1-g2-recommendations`; nối gia hạn, dashboard, thời hạn lưu là lát S4c.
- Not smaller: các AC ở bảng dưới đều là vế _rule dựa trên usage, gán Assignment và quyết định_ của từng Story; tách khi thiết kế
  chi tiết nếu outcome tách được (Task 1 của plan).
- Siblings: `g7-g1-g2-recommendations`, `g7-vendor-usage-import-identity`, `g7-ai-usage-intake`, `g7-browser-usage-intake`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7) — dòng do điều phối viên đăng ký.

## Size exception

- Cohesion: sáu Story chỉ góp vế _rule dựa trên usage và quyết định_ (gán Assignment cho usage, cửa sổ bao phủ, sinh `G3`/`G4`,
  hàng đợi và quyết định của trưởng phòng); không Story nào được claim trọn.
- Why not split: chưa thiết kế chi tiết; khung giữ chủ AC để không có AC mồ côi; lượt thiết kế quyết định tách hay giữ.
- Checkpoints: plan hiện chỉ có task thiết kế; phase và checkpoint lập ở lượt thiết kế chi tiết.
- Maximum scope: chỉ các khóa Story/AC ở bảng Primary; không S4c (nối gia hạn, ND−60, dashboard, job thời hạn lưu), không collector.
- Accepted by: chưa — khung do điều phối viên lập 05/11/2026 theo DESIGN §12 (thành phần lát S4b Owner duyệt 05/11/2026); ngoại
  lệ kích thước chờ Owner xác nhận khi review spec chi tiết.

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                                                                                                                                                  |
| -------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-08-02 | AC-4                   | partial  | AC-1→AC-3, AC-5, AC-6: `g7-vendor-usage-import-identity`; AC-7: `g7-vendor-usage-csv-template`                                                                      |
| US-08-03 | AC-4                   | partial  | AC-1, AC-3: `g7-vendor-usage-import-identity`; AC-2: `g7-vendor-usage-csv-template`                                                                                 |
| US-08-04 | AC-2                   | partial  | AC-1, AC-3→AC-7: `g7-vendor-usage-import-identity`                                                                                                                  |
| US-08-07 | AC-1, AC-2, AC-4       | partial  | AC-3: `g7-vendor-usage-import-identity`                                                                                                                             |
| US-09-05 | AC-1, AC-5, AC-7       | partial  | AC-1 vế collector AI và AC-3, AC-4, AC-6, AC-8→AC-14: `g7-ai-usage-intake`; AC-1 vế trình duyệt: `g7-browser-usage-intake`; AC-2: `g7-device-credential-enrollment` |
| US-10-05 | AC-1, AC-3, AC-4, AC-6 | partial  | AC-2, AC-5, AC-7, AC-8: `g7-g1-g2-recommendations`                                                                                                                  |

## Supporting references

- [DESIGN.md](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) §10 (rule engine), §12.

## Explicit out of scope

`G1`/`G2`; S4c; chi tiết chưa thiết kế — Đợt sau.

## Dependencies and blockers

- `g7-ai-usage-intake` (S2a), `g7-vendor-usage-import-identity` (S3a), `g7-g1-g2-recommendations` (S4a) phải xong trước.

## Ownership: module, data, API

Chưa thiết kế chi tiết — Đợt sau.

## Behavior and design

Chưa thiết kế chi tiết — Đợt sau.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case) | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| ----------- | ----------------------------------- | -------- | ---------------- | ------------------------ |
| `US-10-05`  | chưa thiết kế — Đợt sau             | —        | —                | planned                  |

## Definition of Done

- [ ] Spec thiết kế chi tiết, Owner review (gồm Size exception); mọi primary AC có test đỏ-trước/xanh-sau.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.

## Changes and acceptance

05/11/2026: khung (`draft`) do điều phối viên lập để gỡ xung đột quy tắc 6 (chủ `deferred` phải là hạng mục đã đăng ký). Chưa
nghiệm thu.
