# Spec: kho khóa bản quyền cho gói K4 (`US-04-12` phần kho)

- Phụ trách: AI theo giao việc Owner (lập bản đồ phân rã 20/10/2026; thiết kế và triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin import lô khóa vào kho của khoản mua K4, thấy khóa che bớt, xem đầy đủ khi cấp có ghi Audit Trail; sức chứa của khoản mua là min(số đã mua, số khóa còn dùng được).

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: IT Admin import lô khóa vào kho của khoản mua K4, thấy khóa che bớt, xem đầy đủ khi cấp có ghi Audit Trail; sức chứa của khoản mua là min(số đã mua, số khóa còn dùng được).
- Boundaries: Bảng `license_keys` (mã hóa) của `licensing`; route `/license-keys`; chỉ IT Admin; mỗi lần xem đầy đủ một sự kiện audit cùng giao dịch.
- Not larger: Gán khóa cho Assignment kèm thiết bị công ty và thu hồi (AC-5→AC-8) cần Assignment và sổ thiết bị.
- Not smaller: Import, che bớt, xem đầy đủ và sức chứa chung một bảng và một bí mật.
- Siblings: `g4-device-dependent-features`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                        |
| -------- | --------------------- | -------- | ----------------------------------------- |
| US-04-12 | AC-1→AC-4, AC-9→AC-12 | partial  | AC-5→AC-8: `g4-device-dependent-features` |

Hạng mục làm đủ tám AC trên; `partial` chỉ vì AC-5→AC-8 của `US-04-12` (gán khóa cho Assignment kèm thiết bị công ty, thu hồi) thuộc `g4-device-dependent-features`. Hai điểm nói rõ vế đã làm:

- AC-3: làm vế _xem đầy đủ, IT Admin thấy giá trị, mỗi lần xem một dòng Audit Trail ghi người xem, thời điểm, khóa_. Vế _Assignment của `E1`_ trong dòng Audit Trail cần khóa đã gắn một Assignment (AC-5): ở đây trường `assignmentId` của sự kiện luôn rỗng và sẽ có giá trị khi hạng mục kia gắn khóa.
- AC-12: làm công thức sức chứa `min(số đã mua, số khóa dùng được)` và cảnh báo lệch; khóa `ngừng dùng` (sinh ra ở AC-8) được tính đúng khi có (test dựng bằng SQL); việc chặn lệnh cấp vượt sức chứa K4 (AC-6) thuộc hạng mục kia.

## Supporting references

`FR-2.10`, `INV-01`, `QĐ-54b`, `QĐ-66g`, `OQ-B-13`.

## Explicit out of scope

Gán/thu hồi khóa, thiết bị công ty, kênh connector cho K4; chuyển khóa sang `ngừng dùng` (AC-8); xóa khóa; xuất khóa hàng loạt.

## Dependencies and blockers

`g3-subscription-purchase` (khoản mua K4), `g3-plan-declaration` (kiểu cấp K4); mã hóa khóa ở trạng thái nghỉ bằng bí mật cấu hình mới. Không blocker; bí mật mới phải có ở mọi môi trường không phải test (xem _Dữ liệu và migration_).

## Ownership: module, data, API

- Module `licensing`: capability `license-key/` (`license-key.policy.ts` + spec thuần, `license-key-cipher.ts` + spec, `license-key.repo.ts`, `license-key.service.ts`, `license-keys.controller.ts`, `license-key.dto.ts`, `license-key.http-errors.ts`); lỗi vào `licensing.errors.ts`; đọc khoản mua và kiểu cấp qua `CatalogService.findSeatTarget` (cùng dữ kiện với ghế: kiểu cấp và số đã mua; không thêm phương thức mới).
- Cấu hình: `LICENSE_KEY_VAULT_KEY`, `LICENSE_KEY_VAULT_KEY_ID`, `LICENSE_KEY_VAULT_PREVIOUS_KEYS`, `LICENSE_KEY_FINGERPRINT_PEPPER` (`env-schema.ts`, `secret-environment.ts`, `.env.example`, `scripts/dev/export-environment.ts`, các spec cấu hình, tài liệu vận hành).
- Dữ liệu: bảng `license_keys`; `PRISMA_MODEL_OWNER`: `LicenseKey` → `licensing`.
- API (ba operation): `POST /license-keys/imports` (`licenseKeyImport`), `GET /license-keys` (`licenseKeyList`), `POST /license-keys/{id}/reveal` (`licenseKeyReveal`) — tất cả chỉ `IT_ADMIN`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn | Kết luận                                                                                                                                                                                                                                                                                                                                                                                                                 | Nguồn / loại          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Hình thức import    | `POST /license-keys/imports` nhận JSON `{ subscriptionId, keys: string[] }`, tối đa 1.000 khóa mỗi lô (khóa không đi qua tệp xem trước nên không lưu ở đâu khác ngoài kho). Giới hạn thân yêu cầu mặc định của máy chủ (100 KB) là giới hạn thực: khóa dài thường (≤ 60 ký tự) vừa 1.000 khóa; khóa dài tới 128 ký tự thì chia lô (không đổi giới hạn chung của API). Không có bước xem trước: mỗi dòng hợp lệ được lưu, mỗi dòng lỗi được báo theo số dòng (1, 2, …) và bỏ qua, **không** làm hỏng cả lô                                                                                                          | AC-1; `OQ-B-13`       |
| Khóa hợp lệ         | Sau khi cắt khoảng trắng: 8–128 ký tự trong `A-Z a-z 0-9 - _ . = + /`, không có khoảng trắng bên trong. Sai ⟹ lỗi dòng `INVALID_FORMAT`; trùng trong lô ⟹ `DUPLICATE_IN_BATCH` (dòng sau); đã có trong kho ⟹ `ALREADY_IN_STORE`. Hai khóa chỉ khác hoa thường là hai khóa (khóa bản quyền phân biệt hoa thường)                                                                                                          | AC-1, AC-9            |
| Chống trùng         | So bằng **dấu vân tay** `HMAC-SHA256(khóa đã cắt, LICENSE_KEY_FINGERPRINT_PEPPER)` ở cột `fingerprint` với `UNIQUE (organization_id, fingerprint)` (một khóa chỉ có một bản trong kho của tổ chức, dù của khoản mua nào); CSDL là chốt cuối khi hai lô đồng thời cùng thêm một khóa. Dấu vân tay không đảo ngược được và không phải khóa                                                                                 | AC-9                  |
| Chỉ gói K4          | Khoản mua phải là của gói K4 (thuê bao `TERM` hay khoản mua vĩnh viễn đều được); gói khác ⟹ `422 LICENSE_KEY.PLAN_NOT_K4`; khoản mua không có ⟹ `404 SUBSCRIPTION.NOT_FOUND`. Không import khi không có khoản mua                                                                                                                                                                                                        | AC-10                 |
| Lưu mã hóa          | `AES-256-GCM` với `LICENSE_KEY_VAULT_KEY` (32 byte base64) và mã khóa `LICENSE_KEY_VAULT_KEY_ID`; mã id dòng và mã khóa mã hóa là dữ liệu xác thực nên bản mã chép sang dòng khác không mở được (như bản mã của hộp thư đi); `LICENSE_KEY_VAULT_PREVIOUS_KEYS` giữ khóa cũ cho tới khi hết dòng niêm bằng khóa đó. Khóa dạng rõ **không bao giờ** nằm trong bảng, log, Audit Trail, thông báo lỗi hay phản hồi danh sách | AC-2; `QĐ-54b`        |
| Hiển thị che bớt    | Danh sách trả `masked` = `••••` + 4 ký tự cuối (khóa ngắn hơn 8 ký tự không tồn tại nên luôn có ít nhất 4 ký tự bị che), lưu sẵn ở cột `masked` lúc import                                                                                                                                                                                                                                                               | AC-2                  |
| Xem đầy đủ          | `POST /license-keys/{id}/reveal` trả giá trị đầy đủ; **mỗi lần** (kể cả lần hai) ghi một sự kiện `LICENSE_KEY.REVEALED` cùng giao dịch: người xem, thời điểm, mã khóa (không phải giá trị), khoản mua, `assignmentId` (rỗng cho tới khi khóa được gán); phản hồi mang `Cache-Control: no-store`. Giải mã hỏng ⟹ lỗi 500 không kèm gì của khóa và không có dòng audit                                                                            | AC-3                  |
| Quyền               | Mọi route chỉ `IT_ADMIN`: Finance, trưởng phòng, Employee, Người duyệt chi, Super Admin ⟹ 403 và phản hồi không có giá trị khóa; kho không đổi khi bị từ chối import                                                                                                                                                                                                                                                     | AC-4, AC-11; `SoD-*`  |
| Sức chứa            | `capacity = min(purchasedQuantity, usableKeys)`, với `usableKeys` = số khóa không `ngừng dùng` (`IN_STORE` và `ASSIGNED`); khoản mua chưa có số đã mua ⟹ sức chứa 0 và `warning = QUANTITY_UNKNOWN`; `GET /license-keys?subscriptionId=` trả `summary { purchased, usableKeys, capacity, warning }`, `warning = KEY_COUNT_DIFFERS` khi `usableKeys ≠ purchased` và `QUANTITY_UNKNOWN` khi chưa có số đã mua. Khóa vượt số đã mua vẫn lưu nhưng không tăng sức chứa                       | AC-1, AC-12; `INV-01` |
| Trạng thái khóa     | `IN_STORE` (trong kho), `ASSIGNED` (đang gắn Assignment), `RETIRED` (ngừng dùng): lát này chỉ tạo `IN_STORE`; hai trạng thái kia do `g4-device-dependent-features` đặt, CSDL đã sẵn và công thức sức chứa đã đúng với chúng                                                                                                                                                                                              | AC-1, AC-12           |
| Lô lớn              | Mỗi lô một giao dịch: khóa hợp lệ được chèn cùng sự kiện `LICENSE_KEY.IMPORTED` (khoản mua, số khóa nhận `imported`, số dòng không nhận `rejected`; không giá trị khóa); khóa trùng với lô đồng thời bị CSDL bỏ qua (`INSERT … ON CONFLICT DO NOTHING`) và báo `ALREADY_IN_STORE` ở đúng dòng, các dòng còn lại vẫn lưu. Các khóa chèn theo thứ tự dấu vân tay để hai lô cùng khóa không chờ nhau thành vòng                                                                                                                                                                            | AC-1, AC-9            |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-K1 | `license-key.policy.ts` thuần: `judgeBatch(keys)` ⟹ dòng hợp lệ đã cắt và lỗi theo dòng (`INVALID_FORMAT`, `DUPLICATE_IN_BATCH`), `maskKey`, `capacityOf({ purchased, usableKeys })`, `warningOf`; không I/O                                                            |
| T-K2 | `LicenseKeyCipher` (một lớp, không Nest): `encrypt(rowId, key)`, `decrypt(rowId, keyId, bytes)`, `fingerprint(key)`; dựng từ cấu hình một lần; AES-256-GCM, bố cục `iv (12) \| tag (16) \| bản mã`, AAD `rowId\|keyId`                                                  |
| T-K3 | Import: kiểm khoản mua tồn tại và là gói K4 (không khóa khoản mua: khóa ngoại `RESTRICT` giữ nó, và gói của một khoản mua không đổi), chèn từng khóa hợp lệ theo thứ tự dấu vân tay (id sinh trước để làm AAD) bằng `createMany({ skipDuplicates })` nên khóa đã có không làm hỏng giao dịch (không cần savepoint), audit; reveal: một `TransactionRunner.run` đọc dòng, giải mã, ghi audit rồi mới trả (giải mã hỏng thì không có dòng audit nào) |

### HTTP contract

Lỗi chung: 401, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503.

| Operation (operationId)                                                                  | Thành công                                                                                                      | Lỗi riêng                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `POST /license-keys/imports` (`licenseKeyImport`) — `{ subscriptionId, keys }`           | 201 `LICENSE_KEY.IMPORTED` `{ imported, errors: [{ line, code }], summary }`                                    | 404 `SUBSCRIPTION.NOT_FOUND`; 422 `LICENSE_KEY.PLAN_NOT_K4` |
| `GET /license-keys` (`licenseKeyList`) — `subscriptionId`, `status?`, `page`, `pageSize` | 200 `LICENSE_KEY.LISTED` `{ items: [{ id, subscriptionId, masked, status, importedAt }], pagination, summary }` | 404 `SUBSCRIPTION.NOT_FOUND`                                |
| `POST /license-keys/{id}/reveal` (`licenseKeyReveal`)                                    | 200 `LICENSE_KEY.REVEALED` `{ id, value }` (`Cache-Control: no-store`)                                          | 404 `LICENSE_KEY.NOT_FOUND`                                 |

### Dữ liệu và migration

Migration `20261020260000_licensing_license_keys` (`…250000` đã dùng cho hợp đồng): enum `LicenseKeyStatus`; bảng `license_keys` (`id`, `organization_id`, `subscription_id`, `fingerprint`, `masked`, `ciphertext` bytea, `cipher_key_id`, `status` mặc định `IN_STORE`, `imported_by_app_user_id`, `imported_at`; khóa ngoại `RESTRICT`; `UNIQUE (organization_id, fingerprint)`; CHECK `fingerprint` là 64 ký tự hex, `masked` 1–16 ký tự, `ciphertext` ≥ 29 byte (iv 12 + tag 16 + ít nhất 1 byte), `cipher_key_id` 1–32 ký tự `A-Za-z0-9._-`); trigger: khóa không bao giờ bị xóa, và `id`, `organization_id`, `subscription_id`, `fingerprint`, `masked`, `imported_by_app_user_id`, `imported_at` không đổi; `ciphertext` được niêm lại (kèm đổi `cipher_key_id`), còn `cipher_key_id` đổi mà không có bản mã mới thì bị từ chối; `status` đổi tự do (việc gán/ngừng dùng thuộc hạng mục thiết bị). Bí mật mới (cấu hình bắt buộc ngoài môi trường test, ở `secret-environment.ts`): `LICENSE_KEY_VAULT_KEY` (32 byte base64), `LICENSE_KEY_VAULT_KEY_ID`, `LICENSE_KEY_VAULT_PREVIOUS_KEYS` (rỗng được), `LICENSE_KEY_FINGERPRINT_PEPPER` (bí mật ổn định, không xoay, tối thiểu 16 ký tự); ngoài môi trường test không có giá trị mặc định và giá trị công khai trong repo bị từ chối, như các bí mật hiện có.

### Audit và bảo mật

`LICENSE_KEY.IMPORTED` (khoản mua, `imported`, `rejected`), `LICENSE_KEY.REVEALED` (`licenseKeyId`, `subscriptionId`, `assignmentId` rỗng; người xem và thời điểm là của sự kiện). Giá trị khóa và dấu vân tay không vào Audit Trail, log, thông báo hay phản hồi lỗi. Phản hồi reveal không được lưu đệm.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                                        | Cấp test                   | Kết quả mong đợi                       | Bằng chứng sau implement |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------- | ------------------------ |
| US-04-12 AC-1  | Khoản mua K4 số đã mua 50, import 50 khóa hợp lệ ⟹ 50 khóa `IN_STORE`, sức chứa 50, không cảnh báo; lô có dòng sai định dạng ⟹ dòng đó báo theo số dòng và bị bỏ qua, các dòng khác lưu                                                                    | policy + HTTP + PostgreSQL | nhập đủ, báo theo dòng                 | chờ chạy                 |
| US-04-12 AC-2  | Danh sách chỉ có `masked`; bảng chứa bản mã, không có khóa dạng rõ; giá trị đầy đủ không có trong phản hồi danh sách, Audit Trail, nhật ký                                                                                                                 | HTTP + PostgreSQL          | che bớt, lưu mã hóa                    | chờ chạy                 |
| US-04-12 AC-3  | IT Admin xem đầy đủ ⟹ thấy giá trị, một dòng `LICENSE_KEY.REVEALED` (người xem, mã khóa, `assignmentId` rỗng, không giá trị); xem lần hai ⟹ dòng thứ hai; `Cache-Control: no-store`                                                                        | HTTP + PostgreSQL          | mỗi lần xem một dấu vết                | chờ chạy                 |
| US-04-12 AC-4  | Finance, trưởng phòng, Employee, Người duyệt chi, Super Admin xem đầy đủ ⟹ 403, phản hồi không có giá trị; không dòng audit mới                                                                                                                            | e2e + HTTP                 | chỉ IT Admin                           | chờ chạy                 |
| US-04-12 AC-9  | Lô chứa lại khóa đã có hoặc hai dòng cùng một khóa ⟹ dòng trùng báo lỗi và bỏ qua; kho không có hai bản; hai lô đồng thời cùng một khóa ⟹ một bản, một dòng lỗi `ALREADY_IN_STORE`                                                                         | policy + HTTP + PostgreSQL | không trùng khóa                       | chờ chạy                 |
| US-04-12 AC-10 | Gói K2 ⟹ 422 `PLAN_NOT_K4`, kho không đổi; khoản mua vĩnh viễn của gói K4 nhận được                                                                                                                                                                        | HTTP + PostgreSQL          | chỉ gói K4                             | chờ chạy                 |
| US-04-12 AC-11 | Finance, trưởng phòng gọi import ⟹ 403, kho không đổi                                                                                                                                                                                                      | e2e + HTTP                 | chỉ IT Admin import                    | chờ chạy                 |
| US-04-12 AC-12 | Số đã mua 50, import 48 ⟹ sức chứa 48 và cảnh báo `KEY_COUNT_DIFFERS`; thêm lô tới 52 ⟹ sức chứa 50, khóa vượt vẫn lưu, cảnh báo; 50 khóa trong đó 2 `RETIRED` (dựng bằng SQL) ⟹ sức chứa 48; chưa có số đã mua ⟹ sức chứa 0                               | policy + HTTP + PostgreSQL | sức chứa `min(số mua, khóa dùng được)` | chờ chạy                 |
| Bí mật         | Cấu hình thiếu `LICENSE_KEY_VAULT_KEY` hoặc sai độ dài ngoài môi trường test ⟹ khởi động thất bại; giá trị mặc định của test bị từ chối ở production; bản mã chép sang dòng khác hoặc đổi mã khóa không mở được; khóa cũ trong `PREVIOUS_KEYS` vẫn mở được | unit + spec cấu hình       | bí mật không rò, xoay khóa được        | chờ chạy                 |
| Dữ liệu        | CHECK, `UNIQUE (organization_id, fingerprint)`, khóa không xóa, cột không đổi trừ `status`; khóa ngoại                                                                                                                                                     | constraints                | CSDL giữ bất biến                      | chờ chạy                 |
| Hợp đồng       | `api-inventory`: ba operation mới có summary, 401/403/404/422/503, message riêng; manifest cập nhật                                                                                                                                                        | e2e                        | 143 operation                          | chờ chạy                 |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: import bằng JSON tối đa 1.000 khóa mỗi lô, mỗi dòng lỗi báo riêng; dạng khóa hợp lệ (8–128 ký tự `A-Za-z0-9-_.=+/`); chống trùng theo dấu vân tay `HMAC` trong phạm vi cả tổ chức; mặt nạ là bốn ký tự cuối; bốn bí mật cấu hình mới (khóa mã hóa, mã khóa, khóa cũ, tiêu bản dấu vân tay) bắt buộc ngoài môi trường test; `assignmentId` của sự kiện xem khóa rỗng cho tới khi khóa được gán (hạng mục thiết bị); số hiệu operation của hạng mục này phụ thuộc thứ tự làm các hạng mục khác. Chưa code, chưa review, chưa nghiệm thu.
