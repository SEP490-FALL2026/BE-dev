# Spec: qd96-100-remove-spend-override — Người duyệt chi không còn override; gỡ giá trị lịch sử người thay

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo [tracker qd96-100](../../../reviews/qd96-100-alignment-2026-11-05/README.md),
  `LEDGER.md` L-110, L-117; Q-02 B.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.20`; US 05/11/2026 — `US-06-01` AC-23 (AC-5, AC-16 bỏ); `QĐ-97c`, `QĐ-93c`, `QĐ-93d(1)`),
  BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

`spendApprovalDecide` và `spendApprovalLineDecide` không còn trường `override`; cột `spend_decisions.override_*` bị gỡ sau khi
lưu bằng chứng vào Audit; response duyệt chi không còn `overrideReason`, `bySubstitute`, `CONFLICT_OF_INTEREST`,
`FALLBACK_APPROVER`/`CONFLICT_SUBSTITUTE` ở phần `requests`. Kiểm được bằng HTTP (422 khi gửi `override`) và integration migration.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: gỡ một khái niệm đã bỏ trên bước duyệt chi; capability `requests/spend*`, `requests/group-*`.
- Boundaries: bảng `spend_decisions` (drop 2 cột); API `spendApprovalDecide`, `spendApprovalLineDecide`, `spendApprovalGet`,
  `spendBatchItemList`, các response có `deciderRole` ở `requests`.
- Not larger: Finance rà soát và giá trị cao là hạng mục khác; `licensing/subscription-renewal` (`CONFLICT_SUBSTITUTE`) thuộc chat
  MF-5 — **không đụng**; `personnel` (`FALLBACK_APPROVER` của role duties) thuộc Track P.
- Not smaller: trường request và cột lưu cùng một khái niệm, một lần gỡ.
- Siblings: `qd96-100-budget-check-three-outcomes` (đã bỏ verdict `OVERRIDE_*`), `qd96-100-remove-finance-review-path`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC | Coverage | Phần còn lại thuộc |
| -------- | -- | -------- | ------------------ |
| US-06-01 | AC-23 | partial | xem bảng của `qd96-100-budget-check-three-outcomes` |

## Supporting references

- `QĐ-97c`: không còn override của Người duyệt chi. `QĐ-93d(1)`: không còn người thay thế khi xung đột (`US-06-08` `RETIRED`).
- Spec trước: [qd93-remove-fallback-substitute-approvers](../qd93-remove-fallback-substitute-approvers/spec.md) (đã để lại giá trị lịch sử).

## Explicit out of scope

- `BudgetDecisionRefusedError('CONFLICT_OF_INTEREST')` của **phiên bản ngân sách** — giữ (`SoD-8` còn áp cho phiên bản, `QĐ-29b`).
- `subscription-renewal` `deciderRole` (chat MF-5), `personnel` `FALLBACK_APPROVER` (Track P).
- Kiểm tra AC-25 toàn cục → `qd96-100-remove-finance-review-path` (hạng mục này bổ sung ca `override` vào test đó).

## Dependencies and blockers

- Cần #6 (verdict không còn override; body `override` ⟹ 422 `OVERRIDE_NOT_NEEDED`) và #11 (đã xóa `spend-years-view` cũ).
- Migration thứ tư của Track B.

## Ownership: module, data, API

- `requests/spend-approval-view/spend-approval.dto.ts:15-53,136-140`, `spend-approval.mapper.ts:220`,
  `requests/group-request/group-decision.dto.ts:68-98`, `group-line-decision.policy.ts`, `requests/spend/spend-decision.policy.ts:83-125`,
  `spend-decision.repo.ts:11-93`, `spend.errors.ts` (`OVERRIDE_*`), `spend.http-errors.ts:54`,
  `spend-approval/{spend-approvals.controller.ts, spend-decision.service.ts, spend-batch-decision.service.ts,
  spend-decision-recorder.service.ts}`, `group-line-decisions/{group-lines.controller.ts, group-spend-decision.service.ts,
  group-spend-record.service.ts, group-spend-report.service.ts}`.
- `requests/spend/spend-batch.repo.ts:7`, `spend-submission.dto.ts:128` (`CONFLICT_OF_INTEREST`);
  `access-request/access-request.dto.ts:124`, `access-request.types.ts:37`, `group-request/group-request.dto.ts:93-94`,
  `need-decision-queue/need-decision-queue.dto.ts:40` (`FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`).

## Behavior and design

1. **Body:** bỏ `override` ở `spendDecisionBodySchema` và `lineSpendDecisionBodySchema`; schema `strictObject` ⟹ gửi `override`
   bị 422 `VALIDATION` (thay 422 `SPEND.OVERRIDE_NOT_NEEDED` tạm của #6). Bỏ lỗi `OVERRIDE_REQUIRED/MISMATCH/NOT_NEEDED`.
2. **Ghi:** `spendDecisionRecordOf` bỏ tham số `override` và trường Audit `override`, `overrideYears`; repo bỏ hai cột.
3. **Response:** bỏ `decision.overrideReason`, `decision.bySubstitute`; `leftReason` bỏ `CONFLICT_OF_INTEREST`; `deciderRole` ở
   `requests` chỉ còn `MANAGER | SPENDING_APPROVER`. Dòng lịch sử (nếu còn sau migration) đọc `FALLBACK_APPROVER` → `MANAGER`,
   `CONFLICT_SUBSTITUTE` → `SPENDING_APPROVER`, `CONFLICT_OF_INTEREST` → không trả mục đó trong `leftReason` (`null`) — một hàm
   ánh xạ, ghi chú ở code.
4. **Migration** `<ts>_requests_drop_spend_override` (timestamp lúc implement, sau migration #11): (a) mỗi `spend_decisions` có
   `override_reason` khác null hoặc `override_years` khác rỗng ⟹ một `audit_events` `SYSTEM` `SPEND_DECISION.OVERRIDE_ARCHIVED`
   (`stepId`, `requestId`, lý do, năm) để giữ bằng chứng; (b) `ALTER TABLE spend_decisions DROP COLUMN override_reason, DROP
   COLUMN override_years` (DDL, không kích trigger INV-05). Giá trị enum `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`,
   `CONFLICT_OF_INTEREST` để lại, test chặn ghi mới. **DB-05:** drop cột không hoàn tác; bằng chứng còn ở Audit.
5. Không áp dụng: job, khóa mới, đổi quyền.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F08)

**Mức FE-tonight: A** cho mục 1, 2, 3 (plan Task 1) — không migration: `override_reason` nullable, `override_years` mặc định
`{}` (`prisma/models/requests.prisma:756,758`), code mới không ghi hai cột. **B:** mục 4 (Audit lưu trữ + drop cột, plan Task 2).
Vì `budget-check-three-outcomes` phần A không bao giờ đưa Request vượt dự phòng/chưa có ngân sách tới bước duyệt chi, phần A này
chỉ là gỡ trường thừa — không mất nhánh nghiệp vụ nào.

| Operation (Người duyệt chi) | Hiện tại | Sau sửa — người dùng nhập | Output / lỗi |
| --- | --- | --- | --- |
| `spendApprovalDecide` `POST /access-requests/{id}/spend-approval` | `{decision, reason?, override? {reason, years[]}}` | `{decision: APPROVE \| REJECT, reason?}` (REJECT bắt buộc `reason`, APPROVE không `reason`) | `override` ⟹ 422 `VALIDATION_ERROR`; kiểm lại ⟹ 409 `SPEND.RECHECKED_RETURNED_TO_HEAD` (#6) |
| `spendApprovalLineDecide` `POST /access-requests/{id}/line-spend-decisions` | có `override` | như trên theo từng dòng | như trên |
| `spendBatchDecide` `POST /spend-batches/{id}/decisions` | `{decision, requestIds, reason?}` | giữ | `result.reason` bỏ `OVERRIDE_REQUIRED` |
| `spendApprovalGet`, `spendBatchItemList` | `decision.overrideReason`, `decision.bySubstitute`, năm `overridden`, `leftReason CONFLICT_OF_INTEREST` | — | bỏ các trường/giá trị đó; `deciderRole` chỉ `MANAGER \| SPENDING_APPROVER` |

## Test matrix

| AC / rủi ro | Tình huống | Cấp test | Kết quả mong đợi | Bằng chứng sau implement |
| --- | --- | --- | --- | --- |
| `US-06-01` AC-23 | APPROVE kèm `override` (một mục, theo dòng) | http | 422 `VALIDATION`, không ghi | planned |
| AC-23 | R bị chặn | integration | không có bước duyệt chi để override | planned |
| Migration | `spend_decisions` có override | integration | 1 Audit `OVERRIDE_ARCHIVED`, cột bị drop | planned |
| Response | `spendApprovalGet` đã quyết | http | không `overrideReason`, `bySubstitute` | planned |
| Ghi mới | mọi quyết định | integration | không ghi `FALLBACK_APPROVER`/`CONFLICT_SUBSTITUTE`/`CONFLICT_OF_INTEREST` | planned |
| Ranh giới | `subscriptionRenewal*` | gates OpenAPI | không đổi | planned |

## Definition of Done

- [ ] Grep `src/modules/requests` sạch `override`, `bySubstitute`; quick gates + test theo file xanh.
- [ ] OpenAPI sinh lại; FE được báo (form `spend-decision-form.tsx` bỏ khối override — L-981).
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F08): mức FE-tonight **A** (Task 1, không migration) / **B** (Task 2 migration);
bảng contract FE. Vẫn `draft`.
