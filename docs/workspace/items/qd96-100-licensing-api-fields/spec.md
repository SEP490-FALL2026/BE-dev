# Spec: Dọn trường API licensing (thu hồi, bàn giao, báo lỗi SaaS, đổi người chịu trách nhiệm, định danh tài khoản)

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-TL) theo giao việc Owner (05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD `FR-2.12`, `FR-2.15`; `QĐ-43a`, `QĐ-43c`, `QĐ-63b`, `QĐ-86c`, `QĐ-90a`; SBF-18), BE `3e4553b9`.
  Tracker `docs/reviews/qd96-100-alignment-2026-11-05/`: L-714, L-710; S-20; Owner Q-03(4) = d1. Báo cáo `api-fields/V3-CATALOG-API.md`
  §2.9–2.15.
- Nhóm roadmap: không thuộc G — bó finding `qd96-100-alignment` (Track L). Tách từ #27 `qd96-100-catalog-licensing-api-fields`;
  phần catalog ở `qd96-100-catalog-api-fields`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin và người xác nhận bàn giao không phải gửi giá trị mà server đã biết; liên kết của phiếu báo lỗi SaaS luôn trỏ tới bản ghi
có thật và không bị ghi đè lặng lẽ; đổi người chịu trách nhiệm tài khoản dịch vụ không kéo dài được ngày kết thúc; định danh tài
khoản chuẩn hóa đúng `NFC` như luật.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (Track L).
- Mode: `technical-enabler`.
- Outcome and owner: vệ sinh hợp đồng API theo QĐ (không claim AC Story); hợp đồng ghi của `licensing/{provisioning, handover, saas-issue, assignment, public}` và mẫu
  `data-import/seat-baseline-import`.
- Boundaries: một migration dữ liệu (tính lại cột chuẩn hóa); còn lại DTO/policy; một hook đọc mới (bound bởi `requests`).
- Not larger: phần catalog tách riêng. Không đụng `licensing/subscription-renewal` (chat MF-5).
- Not smaller: cùng loại thay đổi trên cùng module, một lượt review.
- Siblings: `qd96-100-catalog-api-fields`, `a05-k4-*` (K4), #20 `qd96-100-approved-end-date` (ngày kết thúc lúc cấp).
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc              |
| ----- | ------------ | -------- | ------------------------------- |
| —     | L-714, L-710 | n/a      | gỡ chặn `qd96-100-seed-demo-v3` |

## Supporting references

- `US-07-05` (thu hồi theo kiểu cấp), `US-03-09` (bàn giao), `US-07-10` (BM-11), `US-03-08` (người chịu trách nhiệm), `US-02-05` (baseline).

## Explicit out of scope

- `provisioningTaskGrant.expectedEndDate`/`subscriptionId`/`seatSource` (#4, #20, H2). K4 thu hồi và `licenseKeyReveal` (`a05-k4-*`, S-21).
- Tệp minh chứng của phiếu báo lỗi (`OQ-31`). Mọi trường của `subscriptionRenewal*` (chat MF-5).

## Dependencies and blockers

- Không chặn. Migration đặt sau migration của `qd96-100-catalog-api-fields` trên branch.

## Ownership: module, data, API

| Operation                                                    | Trường                 | Thay đổi                                                                                                                                                                                                                                                                                                                                                                             | Căn cứ / code                                                                  |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `provisioningTaskCompleteRevocation`                         | `completion`           | tùy chọn; K1 ⟹ server điền `RENEWAL_CANCELLED`, K5 ⟹ `OFF_SYSTEM_REVOKED`; K2 bắt buộc (`ACCOUNT_REMOVED`/`ALREADY_GONE`), thiếu ⟹ 422 `PROVISIONING_TASK.COMPLETION_REQUIRED`                                                                                                                                                                                                       | SBF-18; `revocation.policy.ts:70-81`, `provisioning.dto.ts:36-44`              |
| `handoverDutyConfirm`                                        | `value`                | tùy chọn; nguồn `DEPARTURE`/`ABRUPT_DEPARTURE` bắt buộc `HANDED_OVER`/`NOT_NEEDED` (thiếu ⟹ 422 `HANDOVER_DUTY.VALUE_REQUIRED`); nguồn khác server ghi `HANDLED`                                                                                                                                                                                                                     | `FR-2.12`, `QĐ-63b`; `handover.dto.ts:8`, `handover-confirmer.policy.ts:47-49` |
| `provisioningTaskHandOff`                                    | body                   | không nhận body (bỏ `@Body`; thân rỗng `{}` vẫn chấp nhận để tương thích)                                                                                                                                                                                                                                                                                                            | `QĐ-90a`; `provisioning-tasks.controller.ts:294-320`                           |
| `provisioningTaskComplete`, `…ReportFailure`, `…CloseFailed` | `evidence` / `reason`  | bắt buộc ở DTO (bỏ `.default('')`, `provisioning.dto.ts:26-27,30`): thiếu ⟹ 422 `VALIDATION_ERROR`; rỗng/khoảng trắng vẫn ra mã domain hiện có (`provisioning.policy.ts:147,155`) — D4                                                                                                                                                                                               | `QĐ-90a`, `QĐ-62i`                                                             |
| `saasIssueTransition`                                        | `linkedWork.*`         | `grantTaskId`, `requestId`, `returnId` kiểm tồn tại + cùng tổ chức; gộp vào liên kết đã có, khóa đã có giá trị khác ⟹ 422 `SAAS_ISSUE.LINKED_WORK_INVALID` `reason: ALREADY_LINKED`; `discrepancyId` bỏ khỏi input (G-4)                                                                                                                                                             | S-20, `FR-2.15`; `saas-issue-handling.service.ts:57-68`                        |
| `licenseAssignmentChangeResponsible`                         | `expectedEndDate`      | thiếu ⟹ BE lấy ngày sớm hơn (bỏ `null`) của dòng cũ và `contractEndDate` người nhận (cột ở `qd96-100-approved-end-date` phần B; trước đó chỉ ngày dòng cũ); gửi muộn hơn ngày đó ⟹ 422 `LICENSE_ASSIGNMENT.END_DATE_LATER_THAN_CURRENT` (chỉ được rút ngắn); lỗi bắt buộc ngày của INV-07 (`assignment.policy.ts:137-141`) chỉ khi cả hai nguồn trống mà người nhận có thời hạn (D3) | Q-03 d1, `QĐ-43a`; `assignment-responsible.service.ts:61-69`                   |
| `seatBaselineImport*` (mẫu)                                  | cột `cost_center_code` | đã tùy chọn và chỉ đối chiếu (`seat-baseline-rows.policy.ts:209-215`) — chỉ sửa mô tả mẫu/OpenAPI ghi _tùy chọn, chỉ để đối chiếu_                                                                                                                                                                                                                                                   | `QĐ-89a(2)`                                                                    |
| (nội bộ) `normalizeAccountIdentifier`                        | —                      | `NFKC` → `NFC` (`account-identifier.policy.ts:30`) + tính lại cột                                                                                                                                                                                                                                                                                                                    | `QĐ-43c`, L-710                                                                |

## Behavior and design

1. Kiểm tồn tại `requestId`/`returnId`: hook mới `SaasIssueLinkReader` ở `licensing/public/licensing.extension-points.ts`, bind ở
   `requests` (`exists(tx, kind, id) → boolean`, lọc theo tổ chức); licensing không import `requests`. `grantTaskId` dùng
   `grantTaskExists` có sẵn. Audit `SAAS_ISSUE.TRANSITIONED` ghi liên kết trước/sau.
2. Response của phiếu giữ `linkedWork.discrepancyId` (đọc dữ liệu cũ) để không vỡ đọc.
3. Migration `<ts>_licensing_account_identifier_nfc` (timestamp lúc implement). (C-REVIEW R-08) cột nằm trong bộ cột bất biến
   của `license_assignment_reject_change` (`20261024090200_licensing_assignment_renewal/migration.sql:16-34`) ⟹ trong cùng migration:
   `ALTER TABLE license_assignments DISABLE TRIGGER license_assignments_immutable;` → UPDATE → `ENABLE TRIGGER` (tiền lệ
   `20261022120000_cost_centers_unit_only/migration.sql:15,30`); kiểm thêm các trigger khác trên bảng (capacity, rules) không bắt
   UPDATE cột này; test: trigger bật lại sau migration, UPDATE cột khác vẫn bị từ chối. Câu UPDATE: `UPDATE license_assignments SET
normalized_account_identifier = lower(btrim(normalize(account_identifier, NFC)))` cho dòng có định danh; NFC mịn hơn NFKC nên
   không sinh trùng mới với ràng buộc chống chồng lấn. Rủi ro: `lower()`/`btrim` của PostgreSQL khác `toLowerCase()`/`trim()` của JS
   ở vài ký tự ⟹ test integration so kết quả SQL với hàm TS trên bộ ký tự mẫu (khoảng trắng Unicode, chữ có dấu tổ hợp, fullwidth).
4. Không đổi quyền gọi của các route.

## Test matrix

| AC / rủi ro    | Tình huống                                                                   | Cấp test                       | Kết quả mong đợi                                                | Bằng chứng sau implement |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- | ------------------------ |
| SBF-18         | hoàn tất thu hồi K1/K5 không `completion`                                    | HTTP                           | 200, giá trị server điền                                        | planned                  |
| SBF-18         | K2 không `completion`                                                        | HTTP                           | 422 `PROVISIONING_TASK.COMPLETION_REQUIRED`                     | planned                  |
| `FR-2.12`      | xác nhận bàn giao nguồn `TRANSFER_REVIEW` không `value`                      | HTTP                           | 200, `HANDLED`                                                  | planned                  |
| `FR-2.12`      | nguồn `DEPARTURE` không `value`                                              | HTTP                           | 422 `HANDOVER_DUTY.VALUE_REQUIRED`                              | planned                  |
| `QĐ-90a`       | `hand-off` không thân / thân `{}`                                            | HTTP                           | 200 cả hai                                                      | planned                  |
| S-20           | `requestId` không tồn tại / tổ chức khác                                     | integration                    | 422 `LINKED_WORK_INVALID`                                       | planned                  |
| S-20           | lần 1 `grantTaskId`, lần 2 `returnId`                                        | integration                    | cả hai còn; lần 3 đổi `grantTaskId` khác ⟹ 422 `ALREADY_LINKED` | planned                  |
| G-4            | gửi `discrepancyId`                                                          | HTTP                           | 422 `VALIDATION_ERROR`                                          | planned                  |
| Q-03 d1        | đổi người không gửi ngày; gửi ngày muộn hơn                                  | integration                    | dòng mới mang ngày cũ / 422 `END_DATE_LATER_THAN_CURRENT`       | planned                  |
| Q-03 d1        | dòng cũ không có ngày, gửi ngày bất kỳ                                       | integration                    | 200 (luật nhà thầu cũ vẫn áp)                                   | planned                  |
| D3 (sau #20 B) | dòng cũ không ngày; người nhận nhà thầu có `contractEndDate`; không gửi ngày | integration                    | dòng mới mang `contractEndDate`, không lỗi INV-07               | planned                  |
| D4             | `complete` không `evidence`; `report-failure` `{}`                           | HTTP                           | 422 `VALIDATION_ERROR`                                          | planned                  |
| L-710          | `ＣＩ-Bot` (fullwidth) và `CI-Bot`                                           | unit + integration (migration) | NFC: hai định danh khác nhau; SQL = TS trên bộ mẫu              | planned                  |

## Definition of Done

- [ ] Test matrix đỏ-trước/xanh-sau; quick gates; `pnpm openapi:export`.
- [ ] Báo FE (F10, F11, F13, F14, màn hình phiếu báo lỗi) qua L-984.

## Open questions

- **G-4 (không chặn, khuyến nghị A)**: BE chưa có thực thể _chênh lệch đối soát_ nên không kiểm được `discrepancyId` như S-20 yêu
  cầu. (A) bỏ khỏi input tới khi có thực thể đối soát, đọc dữ liệu cũ vẫn trả; (B) giữ không kiểm — trái S-20. Implement theo A.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`), tách phần licensing khỏi #27. Chưa nghiệm thu.
- 05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B** — các trường ở đây thuộc MF-2/thu hồi, bàn giao, phiếu
  SaaS, tài khoản dịch vụ; trường MF-1 của `provisioningTaskGrant` (`expectedEndDate`) đã ở `qd96-100-request-sender-rules` phần A.
  Sửa C-REVIEW R-08 (`DISABLE/ENABLE TRIGGER` quanh UPDATE NFC).
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D3 (ngày mặc định khi đổi người chịu trách nhiệm = sớm hơn của dòng cũ và `contractEndDate`;
  client chỉ rút ngắn) và D4 (`evidence`/`reason` bắt buộc ở DTO của 3 op tác vụ cấp) — đều mức **B**.
