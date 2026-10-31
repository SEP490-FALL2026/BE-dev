# Spec: bản ký `BM-06` gắn hồ sơ thiết bị — chỉ nhân viên giữ máy và IT Admin mở được

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Thiết kế: `blocked`. Owner review: chưa review. Blocked on Owner G7 registry; design/contract only.
- Nguồn: Docs `726219a` (`US-04-04` ở `BE-UserStory/src/EP-04.md`; `US-09-01` ở `EP-09.md`), BE `6eb12d1`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · contract: [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).

## Business outcome

IT Admin lưu bản ký `BM-06` (mục đích _bản ký_) gắn vào hồ sơ thiết bị công ty giao cho `E1`; `E1` và IT Admin nhận liên kết
có thời hạn khi mở; nhân viên khác và Finance bị từ chối, không liên kết nào được phát.

## Sizing decision

- Container: G3 (chỉ là container).
- Mode: `split-story`.
- Outcome and owner: đích gắn _hồ sơ thiết bị_ cho kho tệp riêng tư; `catalog/contract` (tài liệu) — hoặc G7 nếu Owner chọn
  chuyển (Q7).
- Boundaries: transaction gắn tệp hiện có của kho tài liệu; quyền mở hỏi sổ thiết bị ai là người giữ; không bảng thiết bị.
- Not larger: tệp hợp đồng/hóa đơn/sao kê thuộc hạng mục khác.
- Not smaller: một mục đích, một đích gắn, một luật mở.
- Siblings: `g3-contract-documents`, `g3-downstream-finance-integration`, `a05-k4-device-registry-contract`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC   | Coverage | Phần còn lại thuộc                                                                                                                                                                |
| -------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-04 | AC-8 | partial  | AC-1→AC-3, AC-9, AC-10: `g3-contract-documents`; AC-6: `g3-contract-documents`, `g3-downstream-finance-integration`; AC-4, AC-5, AC-7, AC-11: `g3-downstream-finance-integration` |

Vế sở hữu: `US-04-04` AC-8 trọn (`E1` hoặc IT Admin mở bản ký của `E1` ⟹ liên kết có thời hạn; `E2` hoặc Finance ⟹ từ chối).

## Supporting references

`FR-1.5`, BRD 5.13 (`BM-06`), `QĐ-43d`, `QĐ-58f`, `US-09-01`, `US-09-03` (xác nhận trong ứng dụng — Owner/G7).

## Explicit out of scope

Xác nhận chủ động trên ứng dụng và trạng thái xác nhận của thiết bị (`US-09-03`, Owner/G7); nội dung văn bản `BM-06`.

## Dependencies and blockers

Blocker: G7 sổ thiết bị (hồ sơ thiết bị là đích gắn) và **Q7** của
[contract](../a05-k4-device-registry-contract/spec.md#dependencies-and-blockers). `catalog` (T4) không import được module
thiết bị nếu module đó ở tầng trên: catalog mở Hook đích gắn/kiểm người mở cho mục đích _bản ký_, module thiết bị bind; hoặc
Owner chuyển vế lưu bản ký sang G7 và hạng mục này đổi chủ. Không dùng port của licensing (catalog không import licensing).

## Ownership: module, data, API

`catalog` tài liệu (mục đích `SIGNATURE_RECORD` đã có trong enum). Không bảng mới dự kiến ngoài đích gắn; route tải/gắn/mở
hiện có, thêm loại đích — chốt khi gỡ blocker.

## Behavior and design

Gắn: IT Admin chọn mục đích _bản ký_ và hồ sơ thiết bị (Hook xác nhận hồ sơ tồn tại, trả người giữ). Mở: người gọi là IT
Admin, hoặc là người giữ theo hồ sơ thiết bị của tệp; Finance, nhân viên khác ⟹ từ chối, không liên kết (như AC-3).

## Test matrix

| AC / rủi ro   | Tình huống (gồm từ chối, edge case)                       | Cấp test                      | Kết quả mong đợi                | Bằng chứng sau implement |
| ------------- | --------------------------------------------------------- | ----------------------------- | ------------------------------- | ------------------------ |
| US-04-04 AC-8 | bản ký `BM-06` của `E1`: `E1`, IT Admin, `E2`, Finance mở | HTTP + PostgreSQL với sổ thật | hai liên kết; hai từ chối       | chưa chạy (blocked)      |
| Đổi người giữ | máy bàn giao `E1` → `E2`                                  | PostgreSQL                    | bản ký của `E1` vẫn chỉ `E1` mở | chưa chạy (blocked)      |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: tách từ `g4-device-dependent-features` theo A-05; blocked on Owner G7 registry; chưa code, chưa review, chưa
nghiệm thu.
