# Spec: qd96-100-spend-notifications — thông báo của bước trình lô, kiểm tra ngân sách và cấp phát xong

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-803, L-804, L-811.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-5.14`, `FR-3.11`, `FR-3.20`, `FR-3.21`; US 05/11/2026 — `US-12-15` AC-30 và dòng 43, 49, 72,
  73 của danh mục; `US-06-12` AC-4, AC-5, AC-8, AC-23; `QĐ-99h`, `QĐ-97c`, `QĐ-97f`, `QĐ-97g`, `QĐ-100p`; QT 1.11), BE `3e4553b9`.
- Nhóm roadmap: G8 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người duyệt chi nhận **một** thông báo khi trưởng phòng trình lô có mục tới bước của họ; trưởng phòng nhận thông báo *cần xác
nhận dùng dự phòng* (kèm phần vượt số cơ sở); người yêu cầu và trưởng phòng nhận thông báo *bị chặn* (kèm lý do và phần vượt) và
*bị trả về lúc duyệt*; IT Admin phụ trách nhận thêm ca *bằng chứng giá hết hạn*; trưởng phòng nhận thông báo cấp phát xong hoặc
thất bại. Finance không nhận gì về Request. Kiểm được bằng unit status rules + integration hộp thông báo.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G8.
- Mode: `split-story`.
- Outcome and owner: một danh mục mã thông báo + một chính sách lọc tham số số tiền; capability `requests/status` (rule) và
  `notifications/inbox` (policy tham số).
- Boundaries: không bảng mới (mã là chuỗi), rule đọc Audit event đã có; không API mới; hộp thông báo hiện có.
- Not larger: bản tóm tắt hằng tháng và dashboard Người duyệt chi (dòng 77, 79) → hoãn H5; nhắc SLA → `qd96-100-sla-reminder-recipients`.
- Not smaller: các mã dùng chung một chính sách tham số (nới `FIGURE_WORDS` cho đúng khóa); tách thì có giai đoạn chính sách hai nghĩa.
- Siblings: `qd96-100-budget-check-three-outcomes`, `qd96-100-reserve-confirmation`, `qd96-100-remove-finance-review-path`,
  `qd96-100-role-dashboards-and-summary` (hoãn H5).
- Scope map: [G8](../../../roadmap.md#work-item-decomposition-g8) — điều phối viên re-pin Docs `3d73a7f` khi đăng ký.

## Primary Story/AC

| Story    | AC | Coverage | Phần còn lại thuộc |
| -------- | -- | -------- | ------------------ |
| US-12-15 | AC-30 | partial | AC-28: `qd96-100-role-dashboards-and-summary` (hoãn H5); còn lại: chủ hiện có ở scope map G8 |

Vế *được báo* của `US-06-12` AC-4, AC-5, AC-8, AC-23 và `US-06-01` AC-18 hiện thực ở đây (các AC đó có chủ là
`qd96-100-budget-check-three-outcomes`); test của vế này nằm trong hạng mục này.

## Supporting references

- `US-12-15` danh mục: dòng 43 (lô → Người duyệt chi), 49 (bằng chứng giá hết hạn → người yêu cầu, trưởng phòng, IT Admin phụ
  trách), 72 (dùng dự phòng → trưởng phòng, kèm phần vượt số cơ sở), 73 (bị chặn → người yêu cầu, trưởng phòng, kèm lý do và phần
  vượt; không Finance). AC-1/AC-11: mỗi thông báo khớp đúng một dòng, đúng người nhận.
- `US-06-12` AC-23: bị trả về lúc duyệt ⟹ **người yêu cầu và trưởng phòng** được báo — cụ thể hơn dòng 72 (chỉ trưởng phòng); hạng
  mục này theo AC-23 cho ca *lúc duyệt*, theo dòng 72 cho ca *lúc trình*.
- `QĐ-99h`: Người duyệt chi chỉ nhận thông báo ngay khi cần quyết (lô duyệt chi). QT 1.11: trưởng phòng được báo cấp phát xong.
- `QĐ-100p` thay `INF-06` ⟹ được phép đưa **phần vượt của chính Request** vào thông báo (không số ngân sách phòng).

## Explicit out of scope

- Gỡ mã thông báo của Finance (`REQUEST_FINANCE_REVIEW_OPENED`, …) → `qd96-100-remove-finance-review-path`.
- Thông báo vượt dự phòng do thuế trên hóa đơn (dòng 74) → hoãn H7. Thư điện tử: không (kênh trong ứng dụng, `AC-15`).

## Dependencies and blockers

- Cần #6 (Audit `BUDGET_CHECKED` có `outcome`, `blockedReasons`; `SPEND_STEP_CLOSED` có lý do), #7 (stage dùng dự phòng) và #11
  (rule Finance đã gỡ, tránh hai rule cùng event). Không migration.

## Ownership: module, data, API

- `requests/status/rules/`: mới `status-rules-spend.policy.ts` (thay `status-rules-finance.policy.ts` đã xóa ở #11),
  `status-rules-outcome.policy.ts:54-66,92-120` (thêm trưởng phòng), `request-status-rules.policy.ts` (đăng ký), facts loader
  (`request-status.types.ts`: nhu cầu mới `BUDGET_CHECK`, `SPENDING_APPROVER`, `IT_ADMIN_IN_CHARGE` nếu chưa có).
- `notifications/public/notifications.types.ts` (mã mới), `notifications/inbox/inbox.policy.ts:14-15,30+` (khóa tham số).

## Behavior and design

1. **Mã mới** (tham số chỉ id, mã, số tiền phần vượt dạng chuỗi thập phân + `currency`):
   - `SPEND_BATCH_SUBMITTED` ← `SPEND_BATCH.SUBMITTED` khi `sentToApprover > 0`; người nhận: Người duyệt chi dùng được; params
     `{batchId, departmentId, sentCount}`. Không có mục nào tới bước chi ⟹ không gửi.
   - `REQUEST_RESERVE_CONFIRMATION_NEEDED` ← `ACCESS_REQUEST.BUDGET_CHECKED` với `outcome = NEEDS_RESERVE`, chưa xác nhận; người
     nhận: trưởng phòng; params `{requestId, overBaseAmount, currency}`.
   - `REQUEST_BUDGET_BLOCKED` ← `BUDGET_CHECKED` với `outcome = BLOCKED`; người nhận: người yêu cầu + trưởng phòng (+ IT Admin
     phụ trách khi có `STALE_COST_EVIDENCE`, chỉ nhận `reasons`); params `{requestId, reasons, overageAmount?, currency?}`.
   - `REQUEST_RETURNED_AT_DECISION` ← `ACCESS_REQUEST.SPEND_STEP_CLOSED` có lý do trả về; người nhận: người yêu cầu + trưởng phòng
     (+ IT Admin phụ trách nếu lý do là báo giá); params `{requestId, reason, reasons, overageAmount?, currency?}`.
2. **Cấp phát xong/thất bại** (L-811): `REQUEST_GRANTED`, `REQUEST_FAILED` thêm trưởng phòng hiện hành của phòng vào người nhận
   (không lặp nếu trùng người yêu cầu).
3. **Chính sách tham số:** `FIGURE_WORDS` giữ; thêm danh sách khóa được phép rõ ràng `overageAmount`, `overBaseAmount` **chỉ** cho
   ba mã `REQUEST_RESERVE_CONFIRMATION_NEEDED`, `REQUEST_BUDGET_BLOCKED`, `REQUEST_RETURNED_AT_DECISION`; mã khác mang các khóa này
   vẫn bị từ chối. IT Admin không bao giờ nhận khóa số tiền (rule không đặt cho người nhận đó — tách intent).
4. **Không báo Finance:** test quét mọi intent của các mã trên không có người nhận vai Finance (trừ khi người đó là bên của Request).
5. Không áp dụng: migration, API, job (rule chạy trong pipeline thông báo hiện có).
6. Dữ liệu rule đọc: Audit `ACCESS_REQUEST.BUDGET_CHECKED`, `ACCESS_REQUEST.SPEND_STEP_CLOSED` đúng bảng *Hợp đồng Audit* của
   `qd96-100-budget-check-three-outcomes` mục 11 (chủ hợp đồng; C-REVIEW R-13) — hạng mục này không định nghĩa lại.

### Mức FE-tonight (chỉnh 05/11 theo review main flow)

**B.** Không đổi API; FE chỉ thêm nhãn cho 4 mã mới trong hộp thông báo khi hạng mục merge. Bước MF-1 vẫn đi được tối nay: trưởng
phòng và người yêu cầu thấy kết quả bị chặn/cần xác nhận ở `spendQueueList`, `budgetCheckGet` (`qd96-100-budget-visibility-qd100p`
phần A) thay vì thông báo đẩy.

## Test matrix

| AC / rủi ro | Tình huống | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| --- | --- | --- | --- | --- |
| Dòng 43 | lô có 2 mục tới bước chi, 1 mục dừng | unit + integration | 1 `SPEND_BATCH_SUBMITTED` cho Người duyệt chi, `sentCount=2` | planned |
| Dòng 43 | lô chỉ có mục dừng | unit | không gửi | planned |
| `US-12-15` AC-30, dòng 72 | R dùng dự phòng lúc trình | unit + integration | trưởng phòng nhận, `overBaseAmount`; Finance không | planned |
| AC-30, dòng 73 | R vượt dự phòng | integration | người yêu cầu + trưởng phòng nhận, `overageAmount`; Finance không | planned |
| Dòng 49 | báo giá hết hạn | unit | thêm IT Admin phụ trách, không khóa số tiền | planned |
| `US-06-12` AC-23 | kiểm lại lúc duyệt thành dùng dự phòng | integration | người yêu cầu + trưởng phòng nhận `REQUEST_RETURNED_AT_DECISION` | planned |
| L-811 | cấp phát xong / thất bại | unit | trưởng phòng nhận thêm | planned |
| Chính sách | mã khác mang `overageAmount` | unit | bị từ chối | planned |
| `US-12-15` AC-1 | quét danh mục | unit | mỗi mã khớp một dòng | planned |

## Definition of Done

- [ ] AC claim có test; quick gates + test theo file xanh.
- [ ] FE được báo mã mới và tham số (hộp thông báo dịch mã — L-984).
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B**; tham chiếu hợp đồng Audit của #6 (C-REVIEW R-13); mã
`USES_RESERVE` đổi thành `NEEDS_RESERVE`. Vẫn `draft`.
