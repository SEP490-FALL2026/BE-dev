# Spec: cấp khóa K4 từ kho kèm thiết bị công ty đã đăng ký

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Thiết kế: `blocked`. Owner review: chưa review. Blocked on Owner G7 registry; design/contract only.
- Nguồn: Docs `726219a` (`US-07-01`, `US-04-12`, `US-07-02` ở `BE-UserStory/src/EP-07.md`, `EP-04.md`), BE `6eb12d1`.
- Nhóm roadmap: G3 và G4 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · contract: [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).

## Business outcome

IT Admin hoàn tất tác vụ cấp K4 bằng cách chọn một khóa _trong kho_ và gán cho người kèm một thiết bị công ty người đó đang
giữ trong sổ thiết bị; khóa gắn đúng một Assignment đang hiệu lực, mỗi lần xem đầy đủ có audit nêu Assignment; thiết bị
không hợp lệ hoặc hết khóa thì bị từ chối, hai IT Admin tranh khóa cuối thì đúng một người thành công.

## Sizing decision

- Container: G3 và G4 (chỉ là container).
- Mode: `split-story`.
- Outcome and owner: cấp K4 theo thiết bị; capability `licensing/provisioning/tasks` (grant) dùng `licensing/license-key` và
  `licensing/device-binding`.
- Boundaries: một transaction cấp — khóa thuê bao (khoản mua) → khóa → đăng ký thiết bị (`lockDeviceForBinding`); bảng
  `license_keys` (+ `assignment_id`), bảng mới `license_key_installations`; route hoàn tất tác vụ cấp hiện có thêm khóa và
  thiết bị; chỉ `IT_ADMIN`.
- Not larger: seat baseline K4 (`a05-k4-baseline-key-by-device`), giới hạn thiết bị (`a05-k4-device-install-limit`), thu hồi
  (`a05-k4-device-revocation`) là outcome và transaction khác.
- Not smaller: chọn khóa, kiểm thiết bị, giữ sức chứa và audit xem khóa là cùng một thao tác cấp nguyên tử.
- Siblings: `a05-k4-device-registry-contract`, `a05-k4-baseline-key-by-device`, `a05-k4-device-revocation`,
  `g4-provisioning-queue-manual`, `g3-license-key-vault`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                                         |
| -------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-07-01 | AC-10      | partial  | AC-1, AC-2, AC-4→AC-9, AC-11→AC-13, AC-15, AC-17, AC-18: `g4-provisioning-queue-manual`; AC-1, AC-3, AC-15, AC-16: `g4-request-and-transfer-integration`; AC-14: `g4-seat-baseline-import` |
| US-04-12 | AC-5, AC-6 | partial  | AC-1→AC-4, AC-9→AC-12: `g3-license-key-vault`; AC-7, AC-8: `a05-k4-device-revocation`                                                                                                      |
| US-07-02 | AC-4       | partial  | vế thẻ K1, K5 của AC-4 và AC-1→AC-3, AC-5→AC-7: `g4-provisioning-queue-manual`                                                                                                             |

Vế sở hữu: `US-07-01` AC-10 cả ba vế (gán `KEY-7` cho `E1` kèm `D1` và audit mỗi lần xem đầy đủ; thiết bị không phải thiết
bị công ty đã đăng ký ⟹ từ chối; kho hết khóa ⟹ không cấp). `US-04-12` AC-5 cả hai vế (khóa đang gắn người khác ⟹ từ chối;
không chọn thiết bị hoặc máy cá nhân ⟹ từ chối) và AC-6 cả ba vế (50/50 ⟹ từ chối; hai IT Admin tranh khóa cuối ⟹ đúng một;
chưa import khóa ⟹ sức chứa 0). `US-07-02` AC-4 chỉ vế thẻ K4 (dẫn vào kho chọn khóa, xem đầy đủ có audit, gán kèm thiết bị).

## Supporting references

`US-09-01` (Owner/G7), `FR-2.10`, `INV-01`, `QĐ-54b`, `QĐ-66g`, `SoD-5`; `US-04-12` AC-3 (vế _Assignment của `E1`_ trong
audit — đang ở `g3-license-key-vault` nhưng source ghi `assignmentId: null`; đề nghị Owner chuyển vế này về đây).

## Explicit out of scope

Sổ thiết bị và endpoint thiết bị (G7); seat baseline K4; cảnh báo vượt số cài đặt; thu hồi K4; K4 cho tài khoản dịch vụ và
Request nhóm (nguồn loại trừ, giữ nguyên từ chối hiện có).

## Dependencies and blockers

Blocker: public API sổ thiết bị của Owner (G7, `US-09-01`) và câu trả lời Q1, Q2, Q8 ở
[contract](../a05-k4-device-registry-contract/spec.md#dependencies-and-blockers). Điều kiện gỡ: sổ thiết bị `verified` có
adapter pass contract của port. Thứ tự: migration `license_keys.assignment_id` + `license_key_installations` trước code.

## Ownership: module, data, API

`licensing` (provisioning/tasks, license-key, device-binding). Bảng: `license_keys` (thêm `assignment_id`),
`license_key_installations` (mới). HTTP: thân hoàn tất tác vụ cấp K4 thêm `licenseKeyId`, `deviceId`; `GET` thiết bị lựa chọn
cho thẻ K4 qua port (`listActiveDevicesOf`) — chốt route ở thiết kế chi tiết khi gỡ blocker. Không endpoint quản trị thiết bị.

## Behavior and design

- Bỏ từ chối K4 ở `assertGrantable`; tác vụ K4 hoàn tất khi IT Admin gửi khóa + thiết bị (`KEY_ASSIGNED_WITH_DEVICE`).
- Trong transaction: khóa thuê bao `FOR UPDATE` → khóa `FOR UPDATE` → `lockDeviceForBinding` → `judgeKeyBinding` → ghi
  `ASSIGNED` + installation + audit; sức chứa = `capacityOf` (min(số đã mua, số khóa còn dùng được)) so với Assignment đang
  chiếm chỗ (`INV-01`).
- Reveal: audit ghi `assignmentId` khi khóa đã gán.
- Lỗi ổn định: các mã lý do của `judgeKeyBinding`; chưa cài sổ ⟹ 503 `DEVICE_REGISTRY_UNAVAILABLE`.
- Idempotency: `ALREADY_BOUND` không ghi lần hai.

## Test matrix

| AC / rủi ro       | Tình huống (gồm từ chối, edge case)                               | Cấp test                      | Kết quả mong đợi                              | Bằng chứng sau implement |
| ----------------- | ----------------------------------------------------------------- | ----------------------------- | --------------------------------------------- | ------------------------ |
| US-07-01 AC-10    | `KEY-7` + `D1` của `E1`; `D1` chưa đăng ký; kho hết khóa          | HTTP + PostgreSQL với sổ thật | gắn một Assignment + thiết bị, audit; từ chối | chưa chạy (blocked)      |
| US-04-12 AC-5     | `K-07` đang gắn `E1`, gán `E2`; `K-08` không thiết bị/máy cá nhân | PostgreSQL                    | từ chối, kho không đổi                        | chưa chạy (blocked)      |
| US-04-12 AC-6     | 50/50; hai IT Admin tranh khóa cuối; K4 chưa import               | PostgreSQL đồng thời          | từ chối; đúng một thành công; sức chứa 0      | chưa chạy (blocked)      |
| US-07-02 AC-4     | thẻ K4 dẫn kho, chọn thiết bị của người                           | HTTP                          | bước K4 dùng được, xem đầy đủ có audit        | chưa chạy (blocked)      |
| Đổi người giữ đua | sổ bàn giao `D1` cùng lúc cấp                                     | PostgreSQL đồng thời          | một bên chờ, kết quả nhất quán                | chưa chạy (blocked)      |

Luật thuần đã có contract test với mock ở `a05-k4-device-registry-contract` (không phải bằng chứng cho hàng trên).

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: tách từ `g4-device-dependent-features` theo A-05; thiết kế khung, blocked on Owner G7 registry; chưa code, chưa
review, chưa nghiệm thu.
