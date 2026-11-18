# Spec: cảnh báo vi phạm số thiết bị trên một khóa K4

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Thiết kế: `blocked`. Owner review: chưa review. Blocked on Owner G7 registry; design/contract only.
- Nguồn: Docs `726219a` (`US-04-11` ở `BE-UserStory/src/EP-04.md`), BE `6eb12d1`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · contract: [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).

## Business outcome

Khi một khóa của gói K4 gắn với nhiều thiết bị công ty hơn giới hạn dạng số của điều khoản (điểm 4), IT Admin phụ trách nhận
cảnh báo _vi phạm điều khoản_ nêu gói, khóa, các thiết bị và giới hạn; hệ thống không tự thu hồi, không đổi Assignment, không
kết luận pháp lý; gói không phải K4 (giới hạn dạng văn bản) không bao giờ được đếm.

## Sizing decision

- Container: G3 (chỉ là container).
- Mode: `split-story`.
- Outcome and owner: cảnh báo vượt số cài đặt K4; `licensing/device-binding` (`judgeInstallLimit`) đọc lần cài của
  `licensing/license-key`, giới hạn từ `catalog/plan-terms` (`installLimitMaxDevices`), gửi qua inbox hiện có.
- Boundaries: kiểm khi ghi thêm lần cài (transaction cấp) và khi giới hạn điều khoản đổi; không bảng mới ngoài trạng thái cảnh
  báo mở/đóng nếu inbox chưa có; chỉ IT Admin nhận.
- Not larger: ghi lần cài thuộc `a05-k4-key-grant-by-device`; kênh thông báo là inbox của A-03.
- Not smaller: một luật, một cảnh báo.
- Siblings: `g3-vendor-terms-checklist`, `a05-k4-key-grant-by-device`, `g4-notification-delivery`,
  `a05-k4-device-registry-contract`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                |
| -------- | ----- | -------- | ------------------------------------------------- |
| US-04-11 | AC-10 | partial  | AC-1→AC-4, AC-6→AC-9: `g3-vendor-terms-checklist` |

Vế sở hữu: cả hai vế của `US-04-11` AC-10 (Office 2021 K4 giới hạn 1, `K-07` gắn `LAP-114` và `LAP-120` ⟹ cảnh báo nêu gói,
`K-07`, hai máy, giới hạn 1, không thu hồi/không đổi Assignment/không kết luận pháp lý; Figma ghi giới hạn văn bản ⟹ không
cảnh báo tự động).

## Supporting references

`FR-1.10` điểm 4, `FR-2.10`, `FR-5.14`, `QĐ-66al`, `QĐ-54e`; `US-04-12` (lần cài của khóa).

## Explicit out of scope

Phát hiện cài đặt qua collector/usage (G7 ingest — Owner); cảnh báo rà soát điều khoản (AC-3, AC-4 đã có); tự thu hồi.

## Dependencies and blockers

Blocker: G7 sổ thiết bị và **Q3** (nguồn _dữ liệu nội bộ ghi thêm thiết bị_) của
[contract](../a05-k4-device-registry-contract/spec.md#dependencies-and-blockers); mặc định: lần cài licensing ghi khi IT
Admin gắn thêm thiết bị của cùng người. Phụ thuộc `a05-k4-key-grant-by-device` (lần cài) và kênh inbox F58 của
`g4-notification-delivery` (A-03) — phối hợp mã sự kiện, không tạo nền thông báo thứ hai.

## Ownership: module, data, API

`licensing` (device-binding, license-key); đọc `catalog` qua `CatalogApi` (giới hạn điều khoản); `notifications` qua public
API. Không route mới dự kiến (cảnh báo hiện ở inbox/danh mục cảnh báo).

## Behavior and design

Sau mỗi lần ghi thêm lần cài và khi IT Admin đổi giới hạn (`plan-terms`), chạy `judgeInstallLimit`; vi phạm mở cảnh báo một lần
cho cặp (khóa, tập thiết bị), đóng khi số thiết bị ≤ giới hạn; không lặp. Người nhận: IT Admin phụ trách phòng sở hữu thuê bao
(`QĐ-58b`, `QĐ-89a`).

## Test matrix

| AC / rủi ro                 | Tình huống (gồm từ chối, edge case)                | Cấp test           | Kết quả mong đợi                                   | Bằng chứng sau implement |
| --------------------------- | -------------------------------------------------- | ------------------ | -------------------------------------------------- | ------------------------ |
| US-04-11 AC-10 (vế K4)      | giới hạn 1, `K-07` trên `LAP-114` + `LAP-120`      | PostgreSQL + inbox | một cảnh báo đúng người nhận, Assignment không đổi | chưa chạy (blocked)      |
| US-04-11 AC-10 (vế văn bản) | Figma K2 "tối đa 2 thiết bị mỗi người", 3 thiết bị | unit + PostgreSQL  | không cảnh báo                                     | chưa chạy (blocked)      |
| Lặp                         | job/ghi lại cùng tập thiết bị                      | PostgreSQL         | không cảnh báo trùng                               | chưa chạy (blocked)      |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: tách từ `g4-device-dependent-features` theo A-05; blocked on Owner G7 registry; chưa code, chưa review, chưa
nghiệm thu.
