# Spec: contract sổ thiết bị cho K4 — port licensing cần từ G7 và phân rã `g4-device-dependent-features`

- Phụ trách: AI theo giao việc A-05 của Dev A (31/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc A-05 ([DEV-A](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md), mục A-05).
- Thiết kế: `draft`. Owner review: chưa review. **Chỉ thiết kế/contract**: sổ thiết bị (`US-09-01`) thuộc G7 của Owner và
  chưa có trong BE; không claim tích hợp K4 hoàn tất ở bất kỳ đâu.
- Nguồn: Docs `726219a` (HEAD bản Docs local đọc 31/10/2026; `BE-UserStory/src` EP-02, EP-03, EP-04, EP-07, EP-09 — Story/AC
  ở mục _Primary Story/AC_ của các hạng mục phía sau), BE `6eb12d1`.
- Nhóm roadmap: G3, G4 và G6 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md) · dòng roadmap và scope map ở [roadmap](../../../roadmap.md).

## Business outcome

Sau lát này licensing có **một contract thành văn và chạy được trong test** về những gì nó cần từ sổ thiết bị công ty của
Owner — dữ liệu, cách khóa, trạng thái lỗi, quyền — cùng luật thuần cấp/gỡ khóa K4 theo thiết bị, giới hạn số thiết bị và
đối chiếu ràng buộc, được kiểm bằng **contract test với mock** (không phải integration). Khung `g4-device-dependent-features`
được phân rã thành năm hạng mục outcome, mỗi AC/vế một chủ. Không có registry, endpoint quản trị thiết bị, collector hay usage.

## Sizing decision

- Container: G3, G4 và G6 (nhóm giao việc A-05; chỉ là container).
- Mode: `technical-enabler`.
- Outcome and owner: contract port `DeviceRegistryPort` + luật thuần `device-binding.policy.ts` trong capability mới
  `licensing/device-binding/`, contract test với stand-in; phân rã và re-pin AC của khung thiết bị. Không hiện thực AC nào.
- Boundaries: không migration, không route, không provider/hook nào được đăng ký trong Nest module, không gọi module khác;
  chỉ type, hàm thuần, một test double ở `test/support/` và một unit spec.
- Not larger: hành vi thật (cấp khóa, đếm thiết bị, thu hồi K4, `BM-06`) cần sổ thiết bị thật và thuộc năm hạng mục phía sau.
- Not smaller: port, luật và test double là một contract; tách ra sẽ để port không có bằng chứng hoặc luật không có port.
- Siblings: `a05-k4-key-grant-by-device`, `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`,
  `a05-k4-device-revocation`, `a05-bm06-signature-record`; khung cũ `g4-device-dependent-features`
  (`superseded`).
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3), [G4](../../../roadmap.md#work-item-decomposition-g4), [G6](../../../roadmap.md#work-item-decomposition-g6).

## Primary Story/AC

| Story | AC       | Coverage | Phần còn lại thuộc                                                                                                                                                              |
| ----- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | A05-PORT | n/a      | gỡ chặn thiết kế `a05-k4-key-grant-by-device`, `a05-k4-baseline-key-by-device`, `a05-k4-device-install-limit`, `a05-k4-device-revocation`, `a05-bm06-signature-record` (chờ G7) |

## Supporting references

`US-09-01` (sổ thiết bị — Owner/G7), `US-04-12`, `US-04-11`, `US-04-04`, `US-07-01`, `US-07-02`, `US-07-05`, `US-02-05`,
`US-03-04`; `FR-2.10`, `FR-1.10` điểm 4, `FR-4.21`, `INV-01`, `INV-17`, `QĐ-54b`, `QĐ-57b`, `QĐ-58f`, `QĐ-66g`, `QĐ-66al`,
`SoD-2`, `SoD-5`, `SoD-6`; [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md),
[module structure](../../../rules/module-structure.md#extension-point).

## Explicit out of scope

Sổ thiết bị, xác nhận `BM-06` trong ứng dụng, credential/định danh thiết bị, collector, usage (G7 — Owner). Endpoint quản trị
thiết bị dưới bất kỳ tên nào. Bind/đăng ký port vào Nest, migration, đổi route/OpenAPI. Mọi AC của năm hạng mục phía sau.

## Dependencies and blockers

- Blocker của mọi hạng mục phía sau: **public API sổ thiết bị của Owner (G7, `US-09-01`)**. Port ở đây là đề xuất phía
  consumer; Owner có thể thay bằng facade của module sổ thiết bị, khi đó licensing viết adapter ánh xạ về port.
- Câu hỏi cho Owner (G7 handoff), mỗi câu ghi mặc định đang dùng trong luật:
  - **Q1 — tầng và cách nối.** Module sổ thiết bị ở tầng nào ([ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md))?
    Trên `licensing` (T5/T6) ⟹ licensing mở `DeviceRegistryHook` (`Hook<DeviceRegistryPort>`) ở `public/`, module thiết bị
    bind trong `*.listener.ts`. Dưới `licensing` (T2/T3) ⟹ licensing gọi thẳng facade `public/` của nó qua adapter. Mặc định
    thiết kế: Hook (không đổi bảng tầng); chưa thêm lớp Hook để không chốt thay Owner.
  - **Q2 — "thiết bị đã đăng ký" có cần đã xác nhận `BM-06` không?** `US-04-12` AC-5 và `US-07-01` AC-10 chỉ đòi _thiết bị
    công ty đã đăng ký_; trạng thái xác nhận của `US-09-01` là cổng nhận usage (`INV-17`). Mặc định: **không** đòi xác nhận
    (`requireAcknowledgement = false`); luật có cờ để bật nếu Owner chọn khác.
  - **Q3 — nguồn của "thêm thiết bị trên một khóa"** (`US-04-11` AC-10: _dữ liệu nội bộ ghi thêm `LAP-120` gắn cùng
    `K-07`_). Mặc định: số thiết bị = các lần cài (installation) licensing ghi khi IT Admin gắn thêm một thiết bị **của cùng
    người** vào khóa assignment đang giữ (`US-09-01` AC-5 cho phép nhiều máy). Nếu Owner muốn dùng dữ liệu collector/phát hiện
    cài đặt thì đó là contract G7 khác (ingest), không thuộc A.
  - **Q4 — điều khoản cho chuyển máy** (`OQ-B-19`, không-chặn ở nguồn): checklist `US-04-11` chưa có trường riêng. Mặc định:
    thiếu điều khoản ⟹ hoàn tất thu hồi K4 bị từ chối `TRANSFER_CLAUSE_MISSING`, không đoán. Cần Owner chọn: thêm cờ ở điều
    khoản gói (catalog, `g3-vendor-terms-checklist`) hay IT Admin ghi lúc hoàn tất.
  - **Q5 — đối chiếu khi đăng ký kết thúc/đổi người giữ** (`US-09-01` AC-10, `US-09-08`): sổ thiết bị báo licensing thế
    nào? Theo Q1: module thiết bị ở tầng trên ⟹ gọi một method mới của facade licensing trong transaction kết thúc/bàn giao
    đăng ký; ở tầng dưới ⟹ module thiết bị mở `Listeners` và licensing đăng ký listener. Mặc định thiết kế: lời gọi facade.
    Kết quả chỉ là **cảnh báo** cho IT Admin, không tự thu hồi (`SoD-6`, BRD 3.2); thu hồi cần nguồn quyết định riêng.
  - **Q6 — asset tag là khóa duy nhất trong tổ chức?** Dòng seat baseline (`US-02-05` AC-11) cần tìm thiết bị theo mã tài sản.
  - **Q7 — `BM-06`** (`US-04-04` AC-8): đích gắn là hồ sơ thiết bị của sổ G7. Chọn: catalog mở một Hook đích gắn/kiểm người
    mở cho mục đích _bản ký_ để module thiết bị bind, **hoặc** chuyển vế lưu bản ký sang G7 (Owner) và A chỉ giữ kho tệp.
  - **Q8 — quyền xem thiết bị trong dữ liệu licensing.** `US-09-01`: trưởng phòng, Finance không xem sổ (`SoD-2`). Mặc định:
    response licensing chỉ trả `deviceId`/mã tài sản cho IT Admin; Employee chỉ thấy thiết bị của chính mình; vai khác không.
- Phụ thuộc trong A: `a05-k4-device-install-limit` dùng kênh inbox của A-03 (`g4-notification-delivery`).

## Ownership: module, data, API

- Module: `licensing` (T4), capability mới `device-binding/` — đáy đồ thị capability (không import capability nào).
  - `device-binding.types.ts`: port `DeviceRegistryPort`, `RegisteredDevice`, `DeviceLookup`, `KeyFacts`, mã lý do.
  - `device-binding.policy.ts`: `judgeKeyBinding`, `judgeInstallLimit`, `releaseKeyOnRevocation`, `checkBinding` (thuần).
  - `device-binding.policy.spec.ts`: contract test với mock.
- Test double: `test/support/device-registry-contract-double.ts` (`DeviceRegistryContractDouble`, không assertion).
- Không bảng, không migration, không HTTP, không public API mới, không extension point đăng ký; module card thêm một dòng
  capability.

## Behavior and design

### Hiện trạng K4 trong BE `6eb12d1` (đọc source)

| Chỗ                                                                             | Hành vi hiện tại                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `licensing/provisioning/provisioning.policy.ts` `assertGrantable`               | K3, K4 ⟹ `ProvisioningTypeNotSupportedError`: không cấp K4; thẻ việc K4 đã có bước `OPEN_KEY_STORE`, `ASSIGN_KEY_WITH_COMPANY_DEVICE`, xong khi `KEY_ASSIGNED_WITH_DEVICE` |
| `licensing/provisioning/revocation.policy.ts` `assertRevocable`                 | K3, K4 ⟹ `RevocationRefusedError('TYPE_NOT_SUPPORTED')`; `completionsFor('K4')` rỗng                                                                                       |
| `licensing/assignment/baseline-target.policy.ts`                                | seat baseline từ chối gói K4 (`SeatPlanNotSupportedError`)                                                                                                                 |
| `licensing/license-key/license-key.service.ts` `reveal`                         | xem đầy đủ ghi audit với `assignmentId: null` (chưa có gán khóa)                                                                                                           |
| `license_keys` (Prisma)                                                         | `IN_STORE`/`ASSIGNED`/`RETIRED`; không cột assignment, không thiết bị                                                                                                      |
| `catalog/plan-terms`                                                            | `installLimitMaxDevices` dạng số chỉ cho K4 (`QĐ-66al`); không có cờ _cho chuyển máy_                                                                                      |
| `personnel/offboarding`, `personnel/transfer-review`, `requests/return-request` | K4 `revocable: false` / `PLAN_NOT_SUPPORTED` — cùng chờ thu hồi K4                                                                                                         |
| `catalog` tài liệu, mục đích `SIGNATURE_RECORD`                                 | enum có, chưa có đích gắn hồ sơ thiết bị                                                                                                                                   |

### Contract `DeviceRegistryPort` (dữ liệu tối thiểu licensing cần)

- `findDevice({ organizationId, deviceId, on })` → `DeviceLookup`: đọc không khóa, để hiện lựa chọn và trả lời sớm.
- `lockDeviceForBinding(tx, query)` → `DeviceLookup`: **trong transaction** cấp/thu hồi; giữ đăng ký (khóa chia sẻ) tới hết
  transaction để đổi người giữ/kết thúc đăng ký phải chờ hoặc binding thấy nó. Thứ tự khóa: thuê bao (khoản mua) → khóa →
  đăng ký thiết bị.
- `listActiveDevicesOf({ organizationId, employeeId, on })`: thiết bị đang hiệu lực của một người, theo mã tài sản — lựa chọn
  của thẻ việc K4 (`US-07-02` AC-4).
- `findDeviceByAssetTag({ organizationId, assetTag, on })`: cho dòng seat baseline (`US-02-05` AC-11).
- `RegisteredDevice`: `deviceId` (giá trị duy nhất licensing lưu), `assetTag`, `hostName` (chỉ đọc khi hiển thị/cảnh báo),
  `holderEmployeeId`, `registration` (`ACTIVE` · `NOT_YET_EFFECTIVE` · `ENDED`, hiệu lực nửa mở `ADR-04`),
  `acknowledgement` (`UNCONFIRMED` · `CONFIRMED` · `STOPPED`). Không IP (`QĐ-57b`), không credential thiết bị.
- **Lỗi:** trạng thái nghiệp vụ là giá trị (`found: false, reason: 'NOT_REGISTERED'` — cũng là câu trả lời cho máy cá
  nhân/dùng chung vì sổ không ghi chúng, `US-09-01` AC-7). Port chỉ reject khi không trả lời được (DB lỗi trong transaction
  của bên gọi ⟹ rollback). Chưa cài sổ ⟹ bên gọi không có port ⟹ từ chối ổn định `DEVICE_REGISTRY_UNAVAILABLE` (dự kiến 503
  theo [API contract](../../../rules/api-contract.md)), không 500.

### Luật thuần (`device-binding.policy.ts`)

- `judgeKeyBinding` — thứ tự cố định, cùng dữ kiện cùng lý do: `NOT_IT_ADMIN` → `PLAN_NOT_K4` → `ASSIGNMENT_NOT_OPEN` →
  `NO_KEY_IN_STORE` → `KEY_RETIRED` → `KEY_HELD_BY_OTHER_ASSIGNMENT` → `DEVICE_REGISTRY_UNAVAILABLE` →
  `DEVICE_NOT_REGISTERED` → `DEVICE_REGISTRATION_NOT_ACTIVE` → `DEVICE_HELD_BY_OTHER_PERSON` → (`DEVICE_NOT_ACKNOWLEDGED` khi
  bật Q2). Cho phép: `TAKE_FROM_STORE` (khóa _trong kho_ → _đang gán_), `ADD_INSTALLATION` (thiết bị thứ hai của cùng người),
  `ALREADY_BOUND` (lặp cùng khóa/assignment/thiết bị ⟹ không ghi, không audit lần hai — idempotent).
- `judgeInstallLimit` — chỉ gói K4 có giới hạn số; số thiết bị khác nhau > giới hạn ⟹ vi phạm (khóa, thiết bị, giới hạn);
  không thu hồi, không đổi Assignment, không kết luận pháp lý; gói khác/giới hạn văn bản ⟹ không đếm.
- `releaseKeyOnRevocation` — cho chuyển máy ⟹ `IN_STORE`; không ⟹ `RETIRED`; chưa biết ⟹ `TRANSFER_CLAUSE_MISSING` (Q4).
- `checkBinding` — đối chiếu lại: `IN_ORDER` · `HOLDER_CHANGED` · `REGISTRATION_NOT_ACTIVE` · `DEVICE_NOT_REGISTERED` ·
  `DEVICE_REGISTRY_UNAVAILABLE`; mọi kết quả khác `IN_ORDER` chỉ là cảnh báo.

### Dữ liệu licensing sẽ cần (thiết kế, chưa migration)

`license_keys.assignment_id` (nullable, một assignment mở mỗi khóa — unique partial index) và bảng
`license_key_installations` (khóa, assignment, `device_id` tham chiếu sổ G7, ngày gắn, ngày gỡ; một dòng mở mỗi cặp
khóa–thiết bị). Ràng buộc FK sang bảng thiết bị chốt khi biết bảng của Owner; licensing không chép tên máy, mã tài sản hay
người giữ (dữ liệu cá nhân thuộc sổ thiết bị). Migration thuộc `a05-k4-key-grant-by-device`.

### Phân rã và re-pin AC (mỗi vế một chủ)

| Hạng mục                        | Story/AC (vế)                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a05-k4-key-grant-by-device`    | `US-07-01` AC-10 (cả ba vế: gán khóa + thiết bị hợp lệ và audit mỗi lần xem; thiết bị không đăng ký ⟹ từ chối; hết khóa ⟹ không cấp); `US-04-12` AC-5, AC-6; `US-07-02` AC-4 (vế thẻ K4) |
| `a05-k4-baseline-key-by-device` | `US-02-05` AC-11 (vế dòng K4: một khóa trong kho, một Assignment, thiết bị công ty; lỗi khi thiếu/khóa của người khác)                                                                   |
| `a05-k4-device-install-limit`   | `US-04-11` AC-10 (cả hai vế: cảnh báo vi phạm K4 dạng số; không cảnh báo cho giới hạn dạng văn bản)                                                                                      |
| `a05-k4-device-revocation`      | `US-04-12` AC-7, AC-8; `US-07-05` AC-6, AC-7; `US-03-04` AC-16 (vế K4: thu khóa về kho/ngừng dùng trong hồ sơ nghỉ việc) — kèm đối chiếu ràng buộc khi sổ đổi (Q5, không claim AC)       |
| `a05-bm06-signature-record`     | `US-04-04` AC-8 (bản ký `BM-06`: `E1` và IT Admin mở; `E2`, Finance bị từ chối)                                                                                                          |

AC chưa rõ, ghi để Owner chốt: `US-04-12` AC-3 vế _Assignment của `E1`_ trong audit xem khóa đang do `g3-license-key-vault`
giữ `full` nhưng source ghi `assignmentId: null` — hạng mục cấp khóa làm vế này qua `US-07-01` AC-10 (audit mỗi lần xem) và
đề nghị Owner chuyển vế đó; `US-04-11` AC-10 phụ thuộc Q3; `US-04-12` AC-7/AC-8, `US-07-05` AC-6/AC-7 phụ thuộc Q4.

### Không áp dụng

Migration, HTTP/OpenAPI, job, audit, transaction thật: không có trong lát (chỉ contract). Quyền HTTP sẽ là `IT_ADMIN` ở
controller; luật vẫn từ chối `NOT_IT_ADMIN` trước khi xét sổ.

## Test matrix

| AC / rủi ro                          | Tình huống (gồm từ chối, edge case)                                                          | Cấp test                     | Kết quả mong đợi                                                    | Bằng chứng sau implement                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Port — thiết bị hợp lệ               | `E1` giữ `LAP-114`, khóa trong kho                                                           | unit, contract test với mock | `TAKE_FROM_STORE`; port được hỏi dưới khóa (`lockDeviceForBinding`) | `device-binding.policy.spec.ts`, 31/10/2026 ✔ |
| Port — thiết bị chưa đăng ký/cá nhân | máy cá nhân; máy của `E2`; đã bàn giao; đăng ký kết thúc/chưa bắt đầu                        | unit, contract test với mock | `DEVICE_NOT_REGISTERED` / `HELD_BY_OTHER_PERSON` / `NOT_ACTIVE`     | như trên ✔                                    |
| Port — chưa xác nhận (Q2)            | thiết bị `UNCONFIRMED`, cờ tắt/bật, sau xác nhận                                             | unit, contract test với mock | mặc định cho; bật cờ ⟹ `DEVICE_NOT_ACKNOWLEDGED`; xác nhận ⟹ cho    | như trên ✔                                    |
| Khóa/giới hạn                        | khóa của assignment khác, kho trống, khóa ngừng dùng; K4 giới hạn 1 với 2 máy; text/K2       | unit, contract test với mock | lý do ổn định; vi phạm nêu khóa, máy, giới hạn; không đếm gói khác  | như trên ✔                                    |
| Lặp thao tác                         | gắn lại cùng khóa/assignment/thiết bị hai lần                                                | unit, contract test với mock | `ALREADY_BOUND` cả hai lần                                          | như trên ✔                                    |
| Quyền                                | Finance, Manager, Employee, Người duyệt chi, Super Admin                                     | unit, contract test với mock | `NOT_IT_ADMIN` trước khi xét sổ                                     | như trên ✔                                    |
| Lỗi                                  | chưa cài sổ; sổ reject                                                                       | unit, contract test với mock | `DEVICE_REGISTRY_UNAVAILABLE`; reject lan ra (rollback)             | như trên ✔                                    |
| Thu hồi/đối chiếu                    | cho/không cho chuyển máy/chưa biết; bàn giao, kết thúc, máy lạ, không có sổ                  | unit, contract test với mock | `IN_STORE`/`RETIRED`/`TRANSFER_CLAUSE_MISSING`; cảnh báo đúng loại  | như trên ✔                                    |
| Contract của port                    | nửa mở, chưa hiệu lực, kết thúc, khác tổ chức, theo mã tài sản, reject chỉ khi không trả lời | unit trên stand-in           | câu trả lời mà adapter của Owner cũng phải cho                      | như trên ✔                                    |

Mọi dòng là **contract test với mock, không phải integration**: không chứng minh K4 chạy với sổ thật.

## Definition of Done

- [x] Port, luật thuần và test double có contract test với mock xanh; nhãn "contract test with mock, NOT integration".
- [x] Không registry, không endpoint thiết bị, không collector/usage, không wiring Nest/migration/OpenAPI.
- [x] Phân rã và re-pin AC ghi ở các hạng mục phía sau và ở [roadmap](../../../roadmap.md); câu hỏi Owner Q1→Q8 ghi rõ.
- [ ] Owner chốt Q1→Q8 và public API sổ thiết bị; adapter thật pass cùng contract — thuộc hạng mục phía sau.
- [x] Roadmap đã tích hợp: dòng hạng mục và scope map G3/G4/G6 của A-05 có trong `docs/roadmap.md`.

## Changes and acceptance

31/10/2026: lập theo A-05; thiết kế + contract, chưa review, chưa nghiệm thu. Không claim tích hợp K4.
