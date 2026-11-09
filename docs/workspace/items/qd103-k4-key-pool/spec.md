# Spec: qd103-k4-key-pool — kho khóa `K4`: cấp khóa từ kho theo thiết bị đã đăng ký, giải phóng cam kết, thu hồi về kho, rút khỏi kho

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-1.9`, `FR-2.3`, `FR-2.10`, `FR-3.23`, `FR-5.8`(2); `QĐ-103d`(2), `QĐ-103v`(1)(8), `QĐ-103k`, `QĐ-106d`,
  `QĐ-106e`; QT v1.7 `C-13`, `C-18`, mục 1.10), BE `5fd5f594`. Ledger: L2-21, L4-11, L3-21. Luật R-C04, R-E01, R-E04, R-J07 (vế _`K4` khóa
  về kho_), R-J08. Theo nguồn: thiết bị đã đăng ký (`US-07-01` AC-10 — thay Q-37). Câu TẠM CHỌN: Q-10 = B; Q-38, Q-50, Q-51
  ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Spec cũ đọc tham khảo: `a05-k4-key-grant-by-device` (lấy: khóa thuê bao → khóa key `FOR UPDATE` → đăng ký thiết bị, hai IT tranh khóa
  cuối ⟹ đúng một), `a05-k4-device-revocation` (lấy: hoàn tất = gỡ kích hoạt; bỏ: trạng thái `RETIRED`). Đã kiểm lại theo nguồn §2.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin thực hiện Request `K4` bằng **khóa _Trống_ trong kho** (hoặc mua khóa khi kho hết, trong phạm vi đã duyệt), gắn khóa với đúng
một Assignment và **thiết bị công ty đã đăng ký của người thụ hưởng**; cấp từ kho ⟹ **toàn bộ** khoản cam kết của Request được giải
phóng và ghi _tránh được_ bằng giá mua. Thu hồi `K4` (**mọi** nơi gọi `SBF-18`: `MF-2`, `MF-3`, `SBF-03`, `SBF-03a`, ghost seat) hoàn tất
bằng **gỡ kích hoạt**: khóa về kho _Trống_, hoặc — khi không chuyển máy được — về kho và **rút khỏi kho** ngay (sức chứa không tăng). Khóa
chỉ còn hai trạng thái; _rút khỏi kho_ là hành động có lý do, không phải trạng thái thứ ba.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `licensing/license-key` (trạng thái khóa, rút khỏi kho), `licensing/provisioning` (cấp/thu hồi `K4`), `licensing/shared-pool`
  (kho khóa), `devices/registry` (bind hook thiết bị), `personnel/offboarding` + `requests/return-request` (mở `K4` ở nơi gọi), `requests/grant`
  (giải phóng khi cấp từ kho), `budgets` (lý do giải phóng mới).
- Boundaries: 2 migration (`*_values` + bảng); 1 operation mới; 8 operation đổi; 1 extension point mới (`DeviceRegistryHook`).
- Not larger: giới hạn số cài đặt (G7 `a05-k4-device-install-limit`); điều khoản chuyển máy trên gói (`FR-1.10` điểm 4 — W4 để IT chọn, Q-50);
  seat ban đầu `K4` theo thiết bị; `K4` cho tài khoản dịch vụ và Request nhóm (giữ từ chối); hóa đơn mua khóa ở `qd103-purchase-invoice-sbf19`.
- Not smaller: cấp, thu hồi và rút khỏi kho cùng đổi máy trạng thái khóa (bỏ `RETIRED`); mở `K4` ở `assertRevocable` mà không mở ở MF-2/SBF-03a
  thì người nghỉ việc vẫn giữ khóa (DA4-01).
- Siblings: `qd103-grant-from-shared-pool` (`purchase_kind`, `addPoolSeat`, `shared-pool`, `facts.fromPool`, bảng _tránh được_),
  `qd103-commitment-release-on-revocation` (listener bỏ qua `K4`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                                                                     |
| ----- | ------------------- | -------- | -------------------------------------------------------------------------------------- |
| —     | L2-21, L4-11, L3-21 | n/a      | gỡ chặn `qd103-purchase-invoice-sbf19` (hóa đơn `K4`), W6 ghost seat `K4` qua `SBF-18` |

## Supporting references

`US-07-13` AC-6 (giá mua, giải phóng toàn bộ, _tránh được_ 250); `US-07-01` AC-10 (thiết bị công ty đã đăng ký; không đăng ký ⟹ từ chối),
AC-2 (tranh khóa cuối); `US-07-05` AC-6 (về kho), AC-7 (_không chuyển máy_ ⟹ sức chứa không tăng — thực hiện bằng rút khỏi kho theo Q-10 B,
chờ Owner sửa chữ _ngừng dùng_ ở Docs); `US-05-08`/SBF-03a (hoàn trả); `US-06-06`; `FR-5.8`(2) _toàn bộ khi `K4` cấp từ kho_.

## Explicit out of scope

- Khôi phục khóa đã rút (Q-38). Số tiền Request `K4` = giá mua (`ONE_TIME`): W3 `qd103-request-amount-and-term`.
- Chi phí một lần `K4` vào phòng của Request mua (R-H04): thực chi qua hóa đơn `SBF-19` ở hạng mục hóa đơn.
- Xác nhận `BM-06` của thiết bị không là điều kiện gắn khóa ở W4 (Q-51).

## Dependencies and blockers

`qd103-grant-from-shared-pool` (Phase 2 xong): `purchase_kind`, `CatalogApi.addPoolSeat`, `licensing/shared-pool/`, `reportOutcome(..., facts)`,
`pool_grant_avoided_costs`. W3 `qd103-request-amount-and-term` (giá `ONE_TIME`). W2 PASS (migration `budgets.prisma`).

## Ownership: module, data, API

- Migration `<ts>_k4_key_pool_values`: `RevocationCompletion` thêm `KEY_DEACTIVATED` (`licensing.prisma:206-211`), `CommitmentReleaseReason`
  thêm `GRANTED_FROM_POOL` (`budgets.prisma:245-251`) — tách vì giá trị enum mới không dùng được trong cùng transaction (DA4-09, tiền lệ
  `20261024090000_requests_return_renewal_values`).
- Migration `<ts+1>_k4_key_pool`:
  - Kiểm trước: có khóa `ASSIGNED` ⟹ `RAISE EXCEPTION` kèm số dòng và hướng dẫn (khóa `ASSIGNED` cũ không có Assignment để gắn — DA4-25).
  - `license_keys` (`licensing.prisma:261-280`) thêm `assignment_id uuid NULL UNIQUE` FK `license_assignments`, `device_id uuid NULL` (id
    của sổ thiết bị, không FK chéo module — `device-binding.types.ts:4-11`), `withdrawn_at`, `withdrawn_by_app_user_id NULL`, `withdrawal_reason text NULL`.
    CHECK `(status = 'ASSIGNED') = (assignment_id IS NOT NULL)`; `(assignment_id IS NULL) = (device_id IS NULL)`; `withdrawn_at IS NULL OR
(status = 'IN_STORE' AND assignment_id IS NULL)`; `(withdrawn_at IS NULL) = (withdrawal_reason IS NULL)`.
  - `license_key_guard` (`20261020260000_licensing_license_keys/migration.sql:43-70`) mở rộng: `withdrawn_*` đã đặt thì không đổi, không xóa.
  - Dữ liệu: `RETIRED` ⟹ `IN_STORE` + `withdrawn_at = now()`, `withdrawal_reason = 'RETIRED trước QĐ-103v (L3-21)'` (`RAISE NOTICE`); dựng
    lại enum `LicenseKeyStatus {IN_STORE, ASSIGNED}`. Không hoàn tác (DB-05).
- `licensing/public/licensing.extension-points.ts`: `DeviceRegistryHook` (`Hook<KeyDeviceRegistry>`, `KeyDeviceRegistry = Pick<DeviceRegistryPort,
'lockDeviceForBinding'>` — port có sẵn `device-binding.types.ts:44-74`, kiểu re-export ở `public/licensing.types.ts`).
- `devices/registry/key-device-registry.listener.ts` (mới; `devices` T5 → `licensing` T4 hợp lệ, `scripts/arch/tiers.cjs:7-8`): bind hook,
  khóa đăng ký đang hiệu lực của thiết bị `FOR SHARE` qua `registry.repo.ts` (mẫu :125, :149), trả `DeviceLookup`.
- `licensing/license-key/`: `license-key.repo.ts` (`countUsable` :59 bỏ khóa đã rút; `lockInStoreOfPlan`, `assign`, `returnToStore`, `withdraw`),
  `license-key.service.ts` (`withdraw`; reveal ghi `assignmentId` — :173-194), `license-key.policy.ts`, `license-key.dto.ts` (bộ lọc `status` :15
  bỏ `RETIRED`, thêm `withdrawn`), `license-key.errors.ts`, `license-key.http-errors.ts`, `license-keys.controller.ts`.
- `licensing/device-binding/device-binding.policy.ts` (`releaseKeyOnRevocation` :100-104 ⟹ `{ status: 'IN_STORE', withdraw: boolean }`; dùng
  `judgeKeyBinding` :66 cho lỗi thiết bị), `device-binding.types.ts` (:85, :123 bỏ `RETIRED`).
- `licensing/provisioning/`: `provisioning.policy.ts` (`assertGrantableType` :104-107 chỉ chặn `K3`; `assertSubscriptionChoice` :110-117; thẻ thu hồi
  `K4` :65-76), `revocation.policy.ts` (`assertRevocable` :46-48 chỉ chặn `K3`; `completionsFor` :70-81 `K4` ⟹ `KEY_DEACTIVATED`; `planCompletion`
  :129-182), `provisioning.dto.ts` (`completeBodySchema` :25 thêm `licenseKeyId?`, `deviceId?`; `revocationCompletionBodySchema` :35-43 thêm
  `keyDisposition?`), `provisioning.errors.ts`, `provisioning.http-errors.ts`, `tasks/provisioning.service.ts` (`complete` :105-122),
  `revocation-completion/revocation-completion.service.ts` (:48-66); `licensing/shared-pool/` (nhánh `K4` của `capacityOf`);
  `public/licensing.types.ts:260` (`RevocationCompletion` thêm `KEY_DEACTIVATED` — DA4-26).
- Nơi gọi `SBF-18` (DA4-01, giữ thứ tự để `MF-2`/`MF-3`/`SBF-03`/`SBF-03a` không vỡ): `personnel/offboarding/offboarding.policy.ts:263-265`
  (`isRevocableType` thêm `K4`); `requests/return-request/return-request.policy.ts:57` (chỉ `K3` ⟹ `PLAN_NOT_SUPPORTED`; chú thích :43);
  `licensing/expiry/expiry.http-errors.ts:46` (ví dụ đổi sang `K3`); `personnel/transfer-review/transfer-review.errors.ts:11`,
  `transfer-review-decision.service.ts:167` (chú thích: chỉ `K3`; luồng dùng lỗi của licensing nên tự mở).
- `requests/grant/access-request-grant.listener.ts` (:66-93): `COMPLETED` + `facts.provisioningType = 'K4'` + `facts.fromPool` ⟹
  `releaseForRequest({ reason: 'GRANTED_FROM_POOL' })`. `budgets/public/budgets.types.ts:34-35` thêm lý do.
- Operation: mới `licenseKeyWithdraw` POST `/api/v1/license-keys/{id}/withdrawal` (`IT_ADMIN`). Đổi: `provisioningTaskGrant` (nhận `K4`),
  `provisioningTaskComplete` (khóa + `deviceId`), `provisioningTaskCompleteRevocation` (`KEY_DEACTIVATED`, `keyDisposition`), `provisioningTaskGet`/`List`
  (thẻ `K4`), `licenseKeyList` (bộ lọc, `withdrawn*`, `assignmentId`), `budgetCommitmentReleases` (lý do mới), `returnRequestSubmit` (nhận `K4`), `offboardingCaseRightList` (`revocable` của `K4`).

## Behavior and design

1. **Cấp `K4`** (`provisioningTaskGrant`): bỏ `ProvisioningTypeNotSupportedError` cho `K4` (giữ cho `K3`; `SERVICE` vẫn `ASSIGNMENT_IS_SERVICE_ACCOUNT`);
   `subscriptionId` bắt buộc, thuê bao `PERPETUAL` `ACTIVE` của gói (khác ⟹ 422 `PROVISIONING.SUBSCRIPTION_REQUIRED` / 409 `PLAN_MISMATCH`).
   Kho (`SharedPoolService.capacityOf`): `free` = khóa `IN_STORE` chưa rút của mọi thuê bao `PERPETUAL` cấp được của gói − tác vụ cấp `K4` mở
   chưa gắn khóa. Luật mua như `qd103-grant-from-shared-pool` mục 5 (`KEY_PURCHASE`, `addPoolSeat` +1). Mua không quay lại kiểm tra ngân sách (R-C04).
2. **Hoàn tất cấp `K4`** (`provisioningTaskComplete`; `US-07-01` AC-10, `FR-2.10`, QT 1.10): `licenseKeyId` và `deviceId` bắt buộc với `K4` (thiếu ⟹
   422 `PROVISIONING.KEY_REQUIRED`), cấm với kiểu khác (422 `PROVISIONING.KEY_NOT_APPLICABLE`). Thứ tự khóa: task → subscription `FOR UPDATE` → khóa
   `license_keys` `FOR UPDATE` → đăng ký thiết bị `FOR SHARE` (hook) → Assignment. Khóa thuộc thuê bao **cùng gói** (khác ⟹ 409 `LICENSE_KEY.PLAN_MISMATCH`),
   `IN_STORE` chưa rút (khác ⟹ 409 `LICENSE_KEY.NOT_IN_STORE` / `LICENSE_KEY.WITHDRAWN`). Thiết bị: hook chưa bind (`isBound()` false) ⟹ 409
   `PROVISIONING.DEVICE_REGISTRY_UNAVAILABLE`; `NOT_REGISTERED`, đăng ký không hiệu lực hôm nay, người giữ ≠ người thụ hưởng ⟹ 422
   `PROVISIONING.DEVICE_NOT_ELIGIBLE` (`details.reason` ∈ `NOT_REGISTERED`, `REGISTRATION_NOT_ACTIVE`, `HELD_BY_OTHER_PERSON` — mã của `judgeKeyBinding`).
   Đạt ⟹ `ASSIGNED`, `assignment_id`, `device_id`; audit `LICENSE_KEY.ASSIGNED`. Hai IT gắn cùng khóa ⟹ một thành công, một 409. `KEY_PURCHASE`
   ⟹ khóa mới phải nhập (`licenseKeyImport`) trước khi hoàn tất.
3. **Giải phóng khi cấp từ kho** (R-C04, `QĐ-106d`): `reportOutcome(..., 'COMPLETED', ..., { fromPool: purchase_kind IS NULL, provisioningType: 'K4' })`;
   `requests` gọi `releaseForRequest({ requestId, reason: 'GRANTED_FROM_POOL', now })` không `amounts` ⟹ giải phóng **toàn bộ** phần đang giữ mọi
   năm (phần đã khớp hóa đơn không đảo). `K4` có mua ⟹ cam kết giữ tới hóa đơn. _Tránh được_ = giá mua (hàng `pool_grant_avoided_costs`).
4. **Thu hồi `K4`** (R-J07, R-J08): `assertRevocable` nhận `K4`; `isRevocableType` (`MF-2`) và `checkReturnable` (`SBF-03a`) nhận `K4`; `MF-3`,
   `SBF-03`, ghost seat dùng `assertRevocable` nên tự mở. `provisioningTaskCompleteRevocation` với `completion: KEY_DEACTIVATED`, `evidence` không
   rỗng (rỗng ⟹ 422 `VALIDATION_ERROR`), `keyDisposition ∈ {RETURN_TO_STORE, WITHDRAW}` **bắt buộc** với `K4` (thiếu ⟹ 422
   `PROVISIONING.KEY_DISPOSITION_REQUIRED`; `WITHDRAW` cần `withdrawalReason` 1–500 — Q-50: gói chưa có điều khoản chuyển máy nên IT khai);
   completion khác với `K4` ⟹ 422 như luật hiện có. Thứ tự khóa: task → subscription → Assignment → khóa (khác thứ tự hoàn tất cấp nhưng cả hai
   khóa subscription trước ⟹ không vòng; README ghi một câu — DA4-26). `AssignmentEndService.end`, rồi khóa ⟹ `IN_STORE`, `assignment_id`/`device_id`
   NULL, audit `LICENSE_KEY.RETURNED_TO_STORE`; `WITHDRAW` ⟹ thêm `withdrawn_*` + audit `LICENSE_KEY.WITHDRAWN` trong cùng transaction — khóa không
   bao giờ ở _Trống_ cấp được giữa hai bước (DA4-24). Không có khóa gắn (dữ liệu cũ) ⟹ chỉ kết thúc Assignment + cảnh báo trong audit. Thu hồi
   `K4` **không** đổi cam kết hay thực chi (listener `qd103-commitment-release-on-revocation` bỏ qua `K4`).
5. **Rút khỏi kho** (Q-10 B): `licenseKeyWithdraw` body `{ reason: string 1–500 }`; khóa thuê bao `FOR UPDATE` → khóa `FOR UPDATE` (thứ tự
   `licenseKeyImport`); chỉ khóa `IN_STORE` chưa rút (đang gán ⟹ 409 `LICENSE_KEY.ASSIGNED`; đã rút ⟹ 409 `LICENSE_KEY.ALREADY_WITHDRAWN`); audit
   `LICENSE_KEY.WITHDRAWN`. Khóa đã rút không đếm, không cấp, `licenseKeyReveal` ⟹ 409 `LICENSE_KEY.WITHDRAWN`; trigger giữ `withdrawn_*` bất biến (Q-38).
6. **Hai trạng thái** (R-E04, L3-21): `licenseKeyList` trả `status ∈ {IN_STORE, ASSIGNED}` + `withdrawnAt`, `withdrawalReason`; bộ lọc
   `status=RETIRED` ⟹ 422 (breaking có chủ đích, API docs W8); `withdrawn=true|false`. Tóm tắt kho: `usable` = gán + Trống chưa rút.
7. Tương thích: `GRANTED_FROM_POOL` chỉ do hệ thống ghi; `budgetCommitmentRelease` (Finance) không nhận giá trị này. Hook thiết bị: gate
   `extension-wiring` phải thấy binder ở mọi đồ thị tiến trình dùng `provisioningTaskComplete` (API có `devices`); đồ thị thiếu ghi lý do.

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case)                                                                        | Cấp test              | Kết quả mong đợi                                                                                | Bằng chứng sau implement |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| AC-6 cấp từ kho        | `R11` 250 đã giữ cam kết, kho còn `KEY-9`; grant + complete với `KEY-9`, thiết bị `D2` của người thụ hưởng | integration           | khóa `ASSIGNED`, `device_id = D2`; cam kết `RELEASED` 250 `GRANTED_FROM_POOL`; _tránh được_ 250 |                          |
| AC-6 kho hết           | kho 0 khóa: grant không `purchase`; có `purchase`; nhập khóa rồi complete                                  | integration           | 409 `SEAT_CAPACITY` / 201 `KEY_PURCHASE` / hoàn tất, cam kết **giữ**                            |                          |
| R-E05 `K4`             | `purchase` khi còn 1 khóa Trống; khóa đã rút không tính là Trống                                           | http                  | 409 `PURCHASE_NOT_ALLOWED` / mua được                                                           |                          |
| AC-10 thiết bị         | thiết bị không trong sổ; đăng ký đã kết thúc; thiết bị của người khác; hook chưa bind                      | integration           | 422 `DEVICE_NOT_ELIGIBLE` (3 lý do) / 409 `DEVICE_REGISTRY_UNAVAILABLE`                         |                          |
| hoàn tất phủ định      | `K4` thiếu `licenseKeyId`/`deviceId`; `K2` gửi `licenseKeyId`; khóa gói khác; khóa đã gán; khóa đã rút     | http                  | 422 / 422 / 409 `PLAN_MISMATCH` / 409 `NOT_IN_STORE` / 409 `WITHDRAWN`                          |                          |
| đua (`US-07-01` AC-2)  | hai tác vụ cùng gắn khóa cuối; đổi người giữ thiết bị song song với gắn khóa                               | integration           | một 200 một 409; đổi người giữ chờ hoặc gắn thấy người mới                                      |                          |
| phủ định cam kết       | `K2` từ kho hoàn tất; `K4` `reportOutcome` không `facts` (đường cũ)                                        | integration           | không giải phóng                                                                                |                          |
| `US-07-05` AC-6        | thu hồi `KEY-7` `KEY_DEACTIVATED`, `RETURN_TO_STORE`, có bằng chứng                                        | integration           | Assignment kết thúc; khóa `IN_STORE`, `assignment_id` null; Trống +1                            |                          |
| `US-07-05` AC-7        | thu hồi `KEY-8` `WITHDRAW` có lý do; `WITHDRAW` thiếu lý do; thiếu `keyDisposition`                        | integration + http    | khóa `IN_STORE` đã rút, usable −1, Trống +0, audit 2 dòng / 422 / 422                           |                          |
| thu hồi phủ định       | `K4` với `ACCOUNT_REMOVED`; `KEY_DEACTIVATED` bằng chứng rỗng; `K3` mở thu hồi                             | http                  | 422 / 422 / 409 `TYPE_NOT_SUPPORTED`                                                            |                          |
| R-J08 `MF-2`           | `offboardingCaseOpenRevocations` cho người giữ `K4`; màn hình ca nghỉ việc                                 | integration           | tác vụ mở; `revocable = true` cho seat `K4`                                                     |                          |
| R-J08 `SBF-03a`        | `E1` hoàn trả khóa `K4` đã cấp xong; hoàn trả `K3`                                                         | integration           | đề nghị hoàn trả + tác vụ thu hồi; hoàn tất ⟹ khóa về kho / `PLAN_NOT_SUPPORTED`                |                          |
| R-J08 `SBF-03`, `MF-3` | `assignmentExpiryStartRevocation` `K4` có thời hạn; quyết định thu hồi rà soát điều chuyển seat `K4`       | integration           | tác vụ mở (không còn `REVOCATION_NOT_SUPPORTED`)                                                |                          |
| Q-10 B                 | rút khóa Trống có lý do; thiếu lý do; khóa đang gán; rút lần hai; reveal khóa đã rút; người không phải IT  | http                  | 200 + audit / 422 / 409 / 409 / 409 / 403                                                       |                          |
| đua rút/gắn            | rút song song với hoàn tất cấp dùng cùng khóa                                                              | integration           | đúng một thành công                                                                             |                          |
| L3-21 migration        | DB có khóa `RETIRED`, `IN_STORE`; DB có khóa `ASSIGNED`; sửa `withdrawn_at` của khóa đã rút                | integration migration | `RETIRED` ⟹ rút; enum 2 giá trị / migration dừng có hướng dẫn / trigger từ chối                 |                          |
| bộ lọc + reveal        | `licenseKeyList?status=RETIRED`; `?withdrawn=true`; xem đầy đủ khóa đang gán                               | http + integration    | 422 / chỉ khóa đã rút / audit có `assignmentId`                                                 |                          |
| device-binding         | `releaseKeyOnRevocation` điều khoản cho chuyển / cấm / chưa khai                                           | unit                  | về kho / về kho + rút / cần IT chọn (không `RETIRED`)                                           |                          |
| hồi quy + seed         | test khóa/thu hồi/MF-2/SBF-03a hiện có; `ops:seed` (fixture không có gói `K4`)                             | integration           | xanh (kỳ vọng `K4` đổi có lý do); seed không đổi                                                |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có `licenseKeyWithdraw` + lỗi mới có ví dụ; `test/support/api-coverage-manifest.ts` thêm operation mới.
- [ ] README `licensing` (máy trạng thái khóa, rút khỏi kho, thu hồi `K4`, một câu thứ tự khóa cấp/thu hồi, hook thiết bị), `devices` (binder),
      `personnel`/`requests` (K4 thu hồi/hoàn trả được) cập nhật; test cũ kỳ vọng `REVOCATION_NOT_SUPPORTED` cho `K4` đổi có ghi lý do.
- [ ] Kiểm tra nhanh tracker §4.5 xanh (`extension-wiring` thấy binder); `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4: DA4-01, DA4-02 (Cao), DA4-17, DA4-24, DA4-25, DA4-26 sửa; áp DA4-09 (`*_values`). Q-37 bỏ, theo
  `US-07-01` AC-10. Không finding nào bị bác. Chi tiết ở plan _Design review_ và [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md). Chưa nghiệm thu.
