# Spec: qd96-100-reserve-confirmation — trưởng phòng xác nhận dùng dự phòng trong lần trình lô

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-107, L-108, L-113, L-119, L-126; tự giải S-15, S-16.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.21`; US 05/11/2026 — `US-06-16`, `US-06-14`, `US-06-01`; `QĐ-97f`, `QĐ-97g`, `QĐ-100u`,
  `QĐ-29b`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng xác nhận dùng dự phòng cho từng mục _dùng dự phòng_ **ngay trong** `spendBatchSubmit` kèm một dòng lý do bắt buộc;
mục được xác nhận có bước duyệt chi, mục chưa xác nhận ở lại hàng đợi. Người duyệt chi thấy cờ _dùng dự phòng_, lý do, người
và lúc xác nhận cùng snapshot đủ số (số cơ sở, dự phòng, hai mức còn lại, phần vượt, cam kết chuyển tiếp). Kiểm lại lúc duyệt
chấp nhận xác nhận còn hiệu lực. Hồ sơ bổ sung giảm được thời hạn; trưởng phòng rút được Request đang chờ xác nhận hoặc bị trả
về lúc duyệt. Kiểm được bằng integration + HTTP.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: một wire contract trình lô ↔ chi tiết duyệt chi; capability `requests/spend-submission` (ghi) và
  `requests/spend-approval-view` (đọc).
- Boundaries: transaction trình lô (bản ghi xác nhận ghi cùng check và bước chi); bảng mới `request_reserve_confirmations`, cột
  mới của `request_supplements`, `request_budget_check_years`; API `spendBatchSubmit`, `accessRequestSupplementAdd`,
  `spendApprovalGet`, `spendApprovalList`, `spendQueueList`, `spendBatchItemList`, rút Request.
- Not larger: hiển thị số cho người yêu cầu/trưởng phòng ngoài hàng đợi là `qd96-100-budget-visibility-qd100p`; thông báo là
  `qd96-100-spend-notifications`.
- Not smaller: xác nhận và việc Người duyệt chi đọc xác nhận là một hợp đồng; tách ra thì có giai đoạn cờ không ai thấy.
- Siblings: `qd96-100-budget-check-three-outcomes` (chủ policy), `qd96-100-head-group-request-queue`,
  `qd96-100-request-year-without-spend-date`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — `US-06-16` chưa có trong map; điều phối viên thêm khi đăng ký.

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                         |
| -------- | ------------ | -------- | ------------------------------------------------------------------------------------------ |
| US-06-16 | AC-1→AC-9    | full     | —                                                                                          |
| US-06-14 | AC-12, AC-13 | partial  | AC-8, AC-9: `qd96-100-budget-check-three-outcomes`; còn lại: `g5-spend-submission-batches` |
| US-06-01 | AC-1, AC-24  | partial  | xem bảng của `qd96-100-budget-check-three-outcomes`                                        |

Vế _được báo_ của `US-06-16` AC-1, AC-6 thuộc `qd96-100-spend-notifications`. AC-9 (Request nhóm của trưởng phòng dùng dự
phòng) dùng cùng cơ chế xác nhận theo `requestId`; test AC-9 cần Request nhóm của trưởng phòng đã vào hàng đợi
(`qd96-100-head-group-request-queue`, Track R) — chạy sau khi hạng mục đó merge.

## Supporting references

- S-15: chỉ một trường `reserveConfirmations[{requestId, reason}]` ở `spendBatchSubmit`, không endpoint riêng.
- S-16: hồ sơ bổ sung = `dropEmployeeIds` + `termMonths` (chỉ giảm) + `reason`; không đổi gói (`QĐ-90d`).
- `QĐ-100u`: lý do một dòng bắt buộc, Người duyệt chi thấy cạnh cờ. `QĐ-29b`: snapshot đủ số, chụp lúc quyết.

## Explicit out of scope

- Hàm phán ba kết quả, stage `RESERVE_CONFIRMATION_REQUIRED`/`RETURNED_AT_DECISION` → `qd96-100-budget-check-three-outcomes`.
- Bỏ `expectedSpendOn` khỏi hồ sơ bổ sung và cột before/after ngày, năm → `qd96-100-request-year-without-spend-date`.
- Bỏ `RETURNED_BY_FINANCE`, `WAITING_BUDGET`, `latestBudgetInformation`, `noIndependentReview` → `qd96-100-remove-finance-review-path`;
  `overrideReason`, `bySubstitute` → `qd96-100-remove-spend-override`.
- (R-16a) `US-06-16` AC-9 **thuộc hạng mục này** (cùng cơ chế theo `requestId`); chỉ test AC-9 chạy sau khi
  `qd96-100-head-group-request-queue` merge.

## Dependencies and blockers

- Cần `qd96-100-budget-check-three-outcomes` (policy `routeOf`/`judgeApproval` nhận `reserveConfirmed`, `carryForwardTotal`).
- Migration thứ hai của Track B.

## Ownership: module, data, API

- `requests/spend-submission`: `spend-batch.service.ts`, `supplement*.service.ts`, `supplement.repo.ts`; mới
  `reserve-confirmation.repo.ts`. `requests/spend/spend-submission.dto.ts`, `spend-submission.policy.ts` (`checkSupplement`).
- `requests/spend-approval-view`: `spend-approval.dto.ts`, `spend-approval.mapper.ts`, `spend-approval-sources.service.ts`.
- `requests/access-request/withdrawal.policy.ts:20`, `group-request/group-withdrawal.policy.ts` (danh sách stage được rút).
- `requests/request-submission/request-preview.dto.ts:72-75` (gỡ `possibleExtraSteps`).

## Behavior and design

1. **Body** `spendBatchSubmit`: thêm `reserveConfirmations` tùy chọn, `{ requestId: uuid, reason: string 1..500, một dòng }[]`,
   tối đa `BATCH_MAX`, mỗi `requestId` một lần và phải nằm trong `requestIds` (sai ⟹ 422 `VALIDATION`).
2. **Trình** (`spend-batch.service.ts:96-120`): `reserveConfirmed = có xác nhận cho requestId`. Check `NEEDS_RESERVE` + xác nhận
   ⟹ `routeOf(..., true)` = `SPEND_APPROVAL`, ghi `request_reserve_confirmations` cùng transaction (check, lô, người, lúc, lý do,
   `over_base_minor`). Check khác `NEEDS_RESERVE` ⟹ xác nhận **không** ghi, mục đi theo kết quả; `batchItem.reserveConfirmed`
   (`boolean`) cho thấy xác nhận có được dùng không (không bỏ qua lặng lẽ).
3. **Hiệu lực khi duyệt:** `reserveConfirmed` = có bản ghi xác nhận gắn với check `SUBMISSION` đã mở bước chi đang mở. Lần trình
   mới (sau sửa, sau bị trả về) tạo check mới nên xác nhận cũ hết hiệu lực (`US-06-16` AC-3, AC-6). Kiểm lại vẫn `NEEDS_RESERVE`
   và xác nhận còn hiệu lực ⟹ lưu duyệt (`US-06-01` AC-24); thành `BLOCKED` ⟹ trả về như #6. (R-25) Xác nhận chỉ còn hiệu lực
   khi tập năm `NEEDS_RESERVE` của check lúc duyệt ⊆ tập năm `NEEDS_RESERVE` của check đã xác nhận (năm đổi do duyệt sau cuối năm
   — `QĐ-100n`); ngược lại `RETURN_TO_HEAD` `RESERVE_CONFIRMATION_REQUIRED`. Audit `BUDGET_CHECKED` ghi `reserveConfirmed` (R-13,
   hợp đồng ở spec #6 mục 11).
4. **Hồ sơ bổ sung** (`spend-submission.dto.ts:33-52`): body sau sửa `{ dropEmployeeIds?, termMonths?, reason }`, ít nhất một trong
   hai trường đầu (thiếu cả hai ⟹ 422 `VALIDATION_ERROR`); `expectedSpendOn` bị bỏ ở phần A của
   `qd96-100-request-year-without-spend-date` (gửi ⟹ 422). `termMonths` int 1..12, phải < thời hạn hiện tại (ngược lại 409
   `SPEND.SUPPLEMENT_TERM_NOT_SHORTER`). Tính lại giá với thời hạn mới; `request_supplements.before_term_months`/
   `after_term_months` ghi khi đổi; trong lúc 4 cột ngày/năm còn `NOT NULL` (tới phần B của #16) ghi before = after = neo hiện tại.
   Response hồ sơ bổ sung: thêm `termMonths {before, after} | null`; cặp `expectedSpendOn`/`budgetYear` bỏ ở #16.
5. **Đọc của Người duyệt chi:** `spendApprovalList` thêm `usesReserve`; `spendApprovalGet` thêm
   `reserveConfirmation { reason, confirmedBy, confirmedAt, overBase } | null`; `budgetCheckYearList` mỗi năm có `base`, `reserve`,
   `remainingBase`, `remaining`, `overBase`, `overReserve`, `pending`, và năm `CARRY_FORWARD` có `carryForwardTotal` của
   (Cost Center, năm) chụp lúc kiểm (cột mới).
6. **Hàng đợi trưởng phòng** (`spendQueueList`): thêm `overBase`, `overReserve` (của check mới nhất), `reserveConfirmation`
   (lần gần nhất) — chỉ trưởng phòng của phòng gọi được (guard hiện có).
7. **Rút:** `HEAD_MAY_WITHDRAW_AT` thêm `RESERVE_CONFIRMATION_REQUIRED`, `RETURNED_AT_DECISION` (cả Request nhóm). Lý do bắt buộc
   như hiện nay.
8. **Preview:** bỏ trường `possibleExtraSteps` (chỉ còn hứa `FINANCE_REVIEW`, đã sai sau #6).
9. **Phòng chưa có trưởng phòng** (`US-06-16` AC-7): chỉ trưởng phòng hiện hành gọi được `spendBatchSubmit` ⟹ Request đứng ở hàng
   đợi; người yêu cầu vẫn rút; trưởng phòng mới thấy hàng đợi theo phòng. Không thêm cơ chế mới.
10. **Migration** `<ts>_requests_reserve_confirmations` (đặt timestamp lúc implement, sau migration của #6): bảng
    `request_reserve_confirmations` (`id`, `organization_id`, `request_id`, `check_id` UNIQUE, `batch_id`, `reason` CHECK một dòng
    1..500, `over_base_minor`, `confirmed_by_employee_id`, `confirmed_at`) + trigger chặn UPDATE/DELETE/TRUNCATE theo mẫu INV-05;
    `request_supplements` thêm `before_term_months`, `after_term_months` `INT NULL` + CHECK `after < before`;
    (R-10a) `DROP/ADD request_supplements_change_check` từ định nghĩa hiện hành
    (`20261024130200_requests_group_supplement_drops/migration.sql:22-26`) thêm vế
    `"before_term_months" IS DISTINCT FROM "after_term_months"` (hồ sơ chỉ giảm thời hạn mà số tiền không đổi vẫn hợp lệ);
    `request_budget_check_years` thêm `carry_forward_total_minor BIGINT NULL`. Không đụng dữ liệu cũ. Timestamp đặt lúc merge
    (M04 toàn cục, sau M03).

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F07)

**Mức FE-tonight: A** cho mục 1→7, 10 (wire + bảng xác nhận + hồ sơ bổ sung `termMonths` + rút). **B:** mục 8 (gỡ
`possibleExtraSteps` của preview — FE bỏ qua trường này từ tối nay). `spendApprovalList.usesReserve` **bỏ** — thay bằng
`outcome` của `qd96-100-budget-check-three-outcomes` (delta D2).
Lý do giữ hồ sơ bổ sung ở A: sau khi bỏ `expectedSpendOn`, Request cá nhân bị chặn không còn cách _sửa_ nào ngoài rút (QT 1.6).

| Operation (vai)                                                                                                                                                                              | Hiện tại                                       | Sau sửa — người dùng nhập                                                                                                                                                      | BE tự tính / output                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `spendBatchSubmit` `POST /spend-batches` (trưởng phòng hiện hành của phòng)                                                                                                                  | `{requestIds}`                                 | `{requestIds[1..50], reserveConfirmations?: [{requestId, reason (1..500, một dòng)}]}`; `requestId` phải nằm trong `requestIds`, mỗi id một lần (sai ⟹ 422 `VALIDATION_ERROR`) | item `outcome`, `stopReason`, `reserveConfirmed`; bản ghi xác nhận (người, lúc, `overBase`) |
| `accessRequestSupplementAdd` `POST /access-requests/{id}/supplements` (chỉ trưởng phòng hiện hành của phòng Request — `@RequireRoles('MANAGER')` ở `spend-submission.controller.ts:228`; D3) | `{expectedSpendOn?, dropEmployeeIds?, reason}` | `{dropEmployeeIds?, termMonths?, reason}`                                                                                                                                      | giá mới, `termMonths {before, after}`, số người bỏ                                          |
| `spendApprovalGet` `GET /access-requests/{id}/spend-approval` (người giữ bước chi)                                                                                                           | không có xác nhận                              | —                                                                                                                                                                              | `reserveConfirmation {reason, confirmedBy, confirmedAt, overBase} \| null` + số năm như #6  |
| `spendQueueList` (trưởng phòng)                                                                                                                                                              | —                                              | —                                                                                                                                                                              | `overBase`, `overReserve`, `reserveConfirmation` (lần gần nhất)                             |
| `accessRequestWithdraw`, rút dòng nhóm                                                                                                                                                       | rút ở stage cũ                                 | `{reason}` như nay                                                                                                                                                             | được rút thêm ở `RESERVE_CONFIRMATION_REQUIRED`, `RETURNED_AT_DECISION`                     |

Không có endpoint xác nhận riêng (S-15). Lỗi: 422 `VALIDATION_ERROR` (hình dạng), 403/404 theo guard hiện có của trình lô,
409 `SPEND.SUPPLEMENT_TERM_NOT_SHORTER`.

## Test matrix

| AC / rủi ro                       | Tình huống                                                          | Cấp test              | Kết quả mong đợi                                          | Bằng chứng sau implement |
| --------------------------------- | ------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- | ------------------------ |
| `US-06-16` AC-1, `US-06-14` AC-12 | lô R2 (dùng dự phòng) có xác nhận + lý do                           | integration           | bước chi mở, bản ghi xác nhận, `reserveConfirmed=true`    | planned                  |
| AC-1 (từ chối)                    | lý do rỗng / nhiều dòng / requestId ngoài lô                        | http                  | 422, không ghi gì                                         | planned                  |
| AC-2                              | trình không xác nhận                                                | integration           | `STOPPED` `RESERVE_CONFIRMATION_REQUIRED`, không bước chi | planned                  |
| AC-3                              | sửa bỏ E5 rồi trình lại                                             | integration           | check mới; xác nhận cũ không dùng được                    | planned                  |
| AC-4                              | trưởng phòng rút ở `RESERVE_CONFIRMATION_REQUIRED`                  | integration           | `WITHDRAWN`, không cam kết                                | planned                  |
| AC-5                              | Người duyệt chi, Finance, IT, SA, Employee, H2 gửi xác nhận         | http                  | 403/404, không ghi                                        | planned                  |
| AC-6                              | kiểm lại lúc duyệt thành dùng dự phòng chưa xác nhận                | integration           | trả về; rút được ở `RETURNED_AT_DECISION`                 | planned                  |
| AC-7                              | phòng không có trưởng phòng                                         | integration           | không ai trình; người yêu cầu rút được                    | planned                  |
| AC-8                              | R4 bị chặn kèm xác nhận                                             | integration           | xác nhận không ghi, `STOPPED` `OVER_RESERVE`              | planned                  |
| AC-9                              | Request nhóm R9 của H1 (gồm H1) dùng dự phòng, H1 xác nhận          | integration (sau #19) | bước chi mở; Người duyệt chi thấy lý do                   | planned                  |
| `US-06-01` AC-24                  | duyệt mục đã xác nhận, kiểm lại vẫn dùng dự phòng                   | integration           | lưu duyệt, cam kết                                        | planned                  |
| `US-06-01` AC-1                   | chi tiết duyệt chi                                                  | http                  | đủ số + cờ + lý do                                        | planned                  |
| `US-06-14` AC-13                  | hồ sơ bổ sung giảm `termMonths`                                     | integration           | giá tính lại, cột term ghi                                | planned                  |
| Từ chối                           | `termMonths` ≥ hiện tại                                             | http                  | 409 `SPEND.SUPPLEMENT_TERM_NOT_SHORTER`                   | planned                  |
| INV-05                            | UPDATE bản ghi xác nhận                                             | integration           | trigger từ chối                                           | planned                  |
| R-10a (DB)                        | hồ sơ bổ sung chỉ giảm `termMonths`, giá 0/không đổi                | integration           | CHECK nhận; hồ sơ không đổi gì vẫn bị từ chối             | planned                  |
| R-25                              | xác nhận năm 2026; duyệt sau Tết, kiểm lại `NEEDS_RESERVE` năm 2027 | integration           | trả về `RESERVE_CONFIRMATION_REQUIRED`                    | planned                  |
| R-13                              | trình kèm xác nhận                                                  | integration           | Audit `BUDGET_CHECKED.detail.reserveConfirmed = true`     | planned                  |

## Definition of Done

- [ ] Mọi AC claim có test đỏ-trước/xanh-sau; quick gates + test theo file xanh.
- [ ] OpenAPI xuất lại; FE được báo trường mới (`reserveConfirmations`, `termMonths`, `reserveConfirmation`) và bỏ `possibleExtraSteps`.
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F07): mức FE-tonight **A** (trừ mục 8 và `usesReserve` — B); bảng contract FE;
hồ sơ bổ sung không còn `expectedSpendOn`; sửa C-REVIEW R-10a (viết lại `change_check`), R-13 (`reserveConfirmed` trong Audit),
R-16a (AC-9 thuộc hạng mục này), R-25 (xác nhận hết hiệu lực khi năm đổi). Mã `USES_RESERVE` đổi thành `NEEDS_RESERVE`. Vẫn `draft`.
05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): hạng mục thuộc **Đợt 2** (Owner). D3: hồ sơ bổ sung chỉ trưởng phòng hiện hành (khớp code,
`QĐ-97f`), không mở cho người yêu cầu. Bỏ `usesReserve` (D2 ở #6 thay). Vẫn `draft`.
05/11/2026 (`QĐ-101m`): trưởng phòng không còn gắn dòng kế hoạch — input gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md); hồ sơ bổ sung không có trường dòng kế hoạch, lần trình lại BE khớp lại. Không viết lại phần khác.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Hồ sơ bổ sung không có trường dòng kế hoạch, lần trình lại không khớp dòng. Không viết lại phần khác.
