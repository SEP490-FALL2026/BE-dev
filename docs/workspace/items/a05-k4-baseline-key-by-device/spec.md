# Spec: dòng K4 của hiện trạng seat khởi tạo — một khóa trong kho kèm thiết bị công ty

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Thiết kế: `blocked`. Owner review: chưa review. Blocked on Owner G7 registry; design/contract only.
- Nguồn: Docs `726219a` (`US-02-05` ở `BE-UserStory/src/EP-02.md`), BE `6eb12d1`.
- Nhóm roadmap: G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · contract: [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).

## Business outcome

Trong giai đoạn khởi tạo, IT Admin xác nhận được dòng hiện trạng thuộc gói K4: dòng hợp lệ khi chỉ một khóa có trong kho,
chưa gắn Assignment hiệu lực nào, và thiết bị là thiết bị công ty người đó đang giữ; dòng thiếu khóa hoặc khóa đã gắn người
khác báo lỗi theo dòng; số khóa trong kho là sức chứa.

## Sizing decision

- Container: G4 (chỉ là container).
- Mode: `split-story`.
- Outcome and owner: dòng K4 của seat baseline; `data-import/seat-baseline-import` (preview/xác nhận) gọi
  `LicensingSeatBaselineApi` (`licensing/assignment`, `licensing/license-key`, `licensing/device-binding`).
- Boundaries: transaction xác nhận seat baseline hiện có (giữ baseline state `FOR SHARE`) cộng khóa khóa → đăng ký thiết bị;
  cột mới của file baseline (khóa và mã tài sản thiết bị) — chốt định dạng khi gỡ blocker; chỉ `IT_ADMIN`.
- Not larger: cấp K4 qua Request là `a05-k4-key-grant-by-device`.
- Not smaller: kiểm dòng và ghi dòng K4 là một luồng preview → xác nhận đã có.
- Siblings: `g4-seat-baseline-import`, `g2-g4-unit-only-cost-attribution`, `a05-k4-key-grant-by-device`,
  `a05-k4-device-registry-contract`.
- Scope map: [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                              |
| -------- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-02-05 | AC-11 | partial  | vế K1/K2 của AC-11 và AC-1→AC-6, AC-8, AC-9, AC-12→AC-16: `g4-seat-baseline-import`; AC-7, AC-10: `g4-seat-baseline-import`, `g2-g4-unit-only-cost-attribution` |

Vế sở hữu: chỉ vế K4 của `US-02-05` AC-11 (một khóa trong kho chưa gắn Assignment hiệu lực, gắn đúng một Assignment cùng
thiết bị công ty đã cài; dòng K4 không khóa hoặc khóa đã gắn người khác ⟹ lỗi; số khóa trong kho là sức chứa).

## Supporting references

`US-04-12` AC-5, AC-6 (luật một khóa/sức chứa, ở `a05-k4-key-grant-by-device`), `US-09-01` (Owner/G7), `FR-1.9`, `FR-2.10`,
`QĐ-54a`.

## Explicit out of scope

Dòng K1/K2/K5 (đã có); cấp K4 qua Request; sổ thiết bị.

## Dependencies and blockers

Blocker: public API sổ thiết bị (G7) và Q6 (mã tài sản là khóa duy nhất) của
[contract](../a05-k4-device-registry-contract/spec.md#dependencies-and-blockers). Câu hỏi riêng: file baseline nêu khóa thế
nào mà không đưa giá trị khóa bí mật vào file import (đề xuất: chọn khóa trong kho bằng mã che bớt hoặc id, không giá trị rõ).
Phụ thuộc migration của `a05-k4-key-grant-by-device`.

## Ownership: module, data, API

`data-import/seat-baseline-import` (định dạng dòng, preview), `licensing` (`baseline-target.policy.ts` bỏ từ chối K4, ghi
khóa + lần cài). Bảng: `license_keys`, `license_key_installations`. HTTP: route preview/xác nhận seat baseline hiện có, cột
mới; không route mới dự kiến.

## Behavior and design

Preview gọi `findDeviceByAssetTag` (đọc) để báo lỗi theo dòng; xác nhận khóa lại bằng `lockDeviceForBinding` và
`judgeKeyBinding` (người thao tác IT Admin; Assignment nguồn _khởi tạo_). Lỗi theo dòng dùng mã lý do của luật.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                      | Cấp test                      | Kết quả mong đợi                            | Bằng chứng sau implement |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------- | ------------------------ |
| US-02-05 AC-11 (K4) | dòng K4 có khóa trong kho + `LAP-114` của người; không khóa; khóa của người khác; máy lạ | HTTP + PostgreSQL với sổ thật | ghi một Assignment + lần cài; lỗi theo dòng | chưa chạy (blocked)      |
| Sức chứa            | số dòng K4 vượt số khóa                                                                  | PostgreSQL                    | dòng vượt báo lỗi                           | chưa chạy (blocked)      |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: tách từ `g4-device-dependent-features` theo A-05; blocked on Owner G7 registry; chưa code, chưa review, chưa
nghiệm thu.
