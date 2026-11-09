# Spec: thu hồi K4 — gỡ kích hoạt khóa, về kho hoặc ngừng dùng theo điều khoản, và đối chiếu thiết bị

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05.
- Thiết kế: `blocked`. Owner review: chưa review. Blocked on Owner G7 registry; design/contract only.
- Nguồn: Docs `726219a` (`US-04-12` ở `EP-04.md`, `US-07-05` ở `EP-07.md`, `US-03-04` ở `EP-03.md` của `BE-UserStory/src`),
  BE `6eb12d1`.
- Nhóm roadmap: G3 và G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · contract: [`a05-k4-device-registry-contract`](../a05-k4-device-registry-contract/spec.md).

## Business outcome

IT Admin hoàn tất tác vụ thu hồi một Assignment K4 bằng xác nhận đã gỡ kích hoạt khóa trên thiết bị: Assignment kết thúc,
khóa về _trong kho_ (gán lại được, sức chứa tăng) nếu điều khoản cho chuyển máy, nếu không thì _ngừng dùng_ (sức chứa không
tăng); mọi nguồn thu hồi hiện có (nghỉ việc, hoàn trả, điều chuyển, hết hạn…) mở được tác vụ cho K4. Khi sổ thiết bị kết
thúc/bàn giao một thiết bị đang gắn khóa, IT Admin nhận cảnh báo, không tự thu hồi.

## Sizing decision

- Container: G3 và G6 (chỉ là container).
- Mode: `split-story`.
- Outcome and owner: hoàn tất thu hồi K4 và trạng thái khóa sau thu hồi; `licensing/provisioning` (revocation,
  revocation-completion), `licensing/license-key`, `licensing/device-binding`.
- Boundaries: transaction hoàn tất thu hồi hiện có cộng khóa khóa (`FOR UPDATE`) → đăng ký thiết bị; bảng `license_keys`,
  `license_key_installations`; route hoàn tất thu hồi hiện có thêm cách hoàn tất K4; chỉ `IT_ADMIN`.
- Not larger: cấp khóa (`a05-k4-key-grant-by-device`), vượt số cài đặt (`a05-k4-device-install-limit`).
- Not smaller: trạng thái khóa là kết quả của cùng thao tác hoàn tất; nguồn nghỉ việc chỉ là một nguồn mở tác vụ.
- Siblings: `g6-revocation-by-grant-kind`, `g6-offboarding-record`, `g6-downstream-integration`, `g3-license-key-vault`,
  `a05-k4-key-grant-by-device`, `a05-k4-device-registry-contract`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G6](../../../roadmap.md#work-item-decomposition-g6).

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                  |
| -------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-04-12 | AC-7, AC-8 | partial  | AC-1→AC-4, AC-9→AC-12: `g3-license-key-vault`; AC-5, AC-6: `a05-k4-key-grant-by-device`                                                                                                                                             |
| US-07-05 | AC-6, AC-7 | partial  | AC-1→AC-5, AC-8, AC-11, AC-12, AC-15, AC-17→AC-19: `g6-revocation-by-grant-kind`; AC-9: `g6-transfer-tool-review`; AC-13, AC-16: `g6-handover-confirmation`; AC-10, vế còn lại của AC-12, AC-13, AC-15: `g6-downstream-integration` |
| US-03-04 | AC-16      | partial  | vế K2/K1 và hồ sơ của AC-16: `g6-offboarding-record`; vế tiết kiệm: `g6-downstream-integration`                                                                                                                                     |

Vế sở hữu: `US-04-12` AC-7, AC-8 trọn (Assignment đóng; `K-07` về kho, gán lại được cho `E3`, audit chuyển trạng thái / chuyển
_ngừng dùng_, không gán lại). `US-07-05` AC-6, AC-7 trọn (gỡ kích hoạt `KEY-7` ⟹ về kho, số khóa sẵn sàng +1 / `KEY-8` ⟹
_ngừng dùng_, sức chứa không tăng). `US-03-04` AC-16 chỉ vế K4 (_thu khóa về kho hoặc ngừng dùng theo điều khoản_, không
chuyển cho người khác) — vế này đang ghi _chờ `g4-device-dependent-features`_ trong spec `g6-downstream-integration`.

## Supporting references

`FR-1.10` điểm 4, `FR-2.10`, `FR-2.12`, `QĐ-54b`, `QĐ-56b`, `QĐ-66g`, `SoD-5`, `SoD-6`, BRD 3.2; `US-09-01` AC-10,
`US-09-08` (đăng ký kết thúc — Owner/G7).

## Explicit out of scope

Thu hồi credential/định danh thiết bị và kết thúc đăng ký thiết bị khi nghỉ việc (`US-09-01`, `US-09-08` — Owner/G7). Quyết
định có thu hồi hay không (Story nguồn). Tiết kiệm (G8).

## Dependencies and blockers

Blocker: G7 sổ thiết bị; **Q4** (điều khoản cho chuyển máy — `OQ-B-19`) và **Q5** (đối chiếu khi sổ đổi) của
[contract](../a05-k4-device-registry-contract/spec.md#dependencies-and-blockers). Mặc định Q4: thiếu điều khoản ⟹ hoàn tất K4
bị từ chối `TRANSFER_CLAUSE_MISSING`. Phụ thuộc `a05-k4-key-grant-by-device` (khóa có assignment và lần cài).

## Ownership: module, data, API

`licensing` (`revocation.policy.ts`: bỏ từ chối K4 ở `assertRevocable`, `completionsFor('K4')` = gỡ kích hoạt; revocation
completion ghi trạng thái khóa qua `releaseKeyOnRevocation`). Consumer phải xét lại cùng lúc: `personnel/offboarding`
(`revocable` K4), `personnel/transfer-review`, `requests/return-request` (`PLAN_NOT_SUPPORTED` cho K4) — gỡ từ chối K4 ở cổng
chung làm đổi hành vi ở cả ba; owner `requests` (Dev B) phối hợp phần `return-request`. Đối chiếu Q5: method facade licensing
mới (nếu sổ ở tầng trên) ghi cảnh báo theo `checkBinding`.

## Behavior and design

Hoàn tất: khóa Assignment/tác vụ như hiện có → khóa `FOR UPDATE` → `lockDeviceForBinding` (đọc lại thiết bị để ghi audit) →
`releaseKeyOnRevocation` → khóa `IN_STORE`/`RETIRED`, lần cài đóng, `assignment_id` null, audit. Lặp hoàn tất một tác vụ đã
xong ⟹ lỗi trạng thái hiện có, không đổi khóa lần hai. Đối chiếu: kết quả khác `IN_ORDER` ⟹ cảnh báo IT Admin, không mở thu hồi.

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)               | Cấp test                      | Kết quả mong đợi                                       | Bằng chứng sau implement |
| ---------------------------- | ------------------------------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------ |
| US-04-12 AC-7, US-07-05 AC-6 | cho chuyển máy, gỡ `KEY-7` của `E1`, gán lại `E3` | HTTP + PostgreSQL với sổ thật | Assignment đóng, khóa trong kho +1, audit              | chưa chạy (blocked)      |
| US-04-12 AC-8, US-07-05 AC-7 | không cho chuyển máy, gỡ `KEY-8`                  | PostgreSQL                    | _ngừng dùng_, sức chứa không tăng, không gán lại       | chưa chạy (blocked)      |
| US-03-04 AC-16 (vế K4)       | hồ sơ nghỉ việc `E1` giữ Office 2021 K4           | PostgreSQL                    | tác vụ thu hồi K4 mở được, không chuyển cho người khác | chưa chạy (blocked)      |
| Q4                           | điều khoản chưa ghi                               | unit + HTTP                   | `TRANSFER_CLAUSE_MISSING`, tác vụ không đổi            | chưa chạy (blocked)      |
| Q5 / `SoD-6`                 | sổ bàn giao `D1` khi khóa còn gắn                 | PostgreSQL                    | cảnh báo, không tác vụ thu hồi                         | chưa chạy (blocked)      |
| Quyền                        | Finance/trưởng phòng hoàn tất thu hồi K4          | HTTP                          | từ chối                                                | chưa chạy (blocked)      |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: tách từ `g4-device-dependent-features` theo A-05 (kèm vế K4 của `US-03-04` AC-16 mà `g6-downstream-integration`
đang để chờ khung thiết bị); blocked on Owner G7 registry; chưa code, chưa review, chưa nghiệm thu.
