# B-texts (N3a + N3b) — subagent Sonnet của chat điều phối 123, 17/11 đêm

Nhánh `feat/p5-b-texts`, worktree `Code/be-p5-btexts`. Hai commit (Chill, chưa push):

| Commit | Nội dung |
| ------ | -------- |
| `beba0e32` | N3a: `notification-text.types.ts`, `notification-texts-mf1.types.ts`, `notification-texts-mf1-sla.types.ts`, `notification-labels.types.ts` |
| `d27758c6` | N3b: `notification-texts-org.types.ts`, `notification-texts-budget.types.ts`, `notification-texts-licensing.types.ts` |

Chỉ chạm thư mục `src/modules/notifications/inbox/notification-text/` (7 file, +2004 dòng). Kiểm typecheck và eslint (`max-lines` đạt) đều sạch.

## Phân bổ mã
Tổng **118/118** mã trên `dev`, mỗi mã đúng một lần:

| Object | Số mã | Ghi chú |
| ------ | ----- | ------- |
| `MF1_TEXTS` | 32 | MF-1 |
| `MF1_SLA_TEXTS` | 9 | MF-1, file riêng vì vượt 500 dòng |
| `ORG_TEXTS` | 21 | |
| `BUDGET_TEXTS` | 26 | |
| `LICENSING_TEXTS` | 30 | |

Script kiểm cho kết quả: 0 mã lạ, 0 mã trùng, 0 khóa ngoài params.

## Quyết định của subagent (N3c/N2 phải biết)
1. **`otherwise` tự viết từ phần câu chung** cho các mã: REQUEST_SUBMITTED, REQUEST_WITHDRAWN, REQUEST_CANCELLED, RETURN_REQUESTED,
   REQUEST_CANCELLED_BENEFICIARY_GONE, REQUEST_BENEFICIARY_GONE_IT_CHECK, SPEND_QUEUE_REMINDER, PERSONNEL_EVENT_RECORDED, POLICY_PUBLISHED,
   DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED, SUBSCRIPTION_RENEWAL_ALERT.
2. **Câu riêng theo người nhận** (trưởng phòng / "Bạn") ở các mã REQUEST_RETURNED, PERSONNEL_EVENT_RECORDED, EMPLOYEE_PROFILE_UPDATED,
   TRANSFER_RIGHTS_REVOKING: renderer không biết người nhận, nên chỉ chép câu chính.
3. **PERSONNEL_EVENT_RECORDED** dùng biến thể `by: eventKind` (10 case) thay cho nhãn enum, vì nhãn trong catalog có chứa `{effectiveOn:date}`.
4. **POLICY_PUBLISHED** để `{policyCode}` thô.
5. **REQUEST_IT_REJECTED** dùng biến thể `by: noAlternative`. **CONTROLLED_WAIT_ALERT** có 3 đoạn `[ ]` loại trừ nhau.
   Chỗ catalog ghi "bỏ khi null" thì bọc `[ ]`.
6. **SUBSCRIPTION_RENEWAL_ALERT** dùng nhãn boolean `outcomeRecorded` cộng nhãn `usageData`. Mã này sẽ bị N3d viết lại.
7. **BUDGET_VERSION_DECIDED / BUDGET_ADJUSTMENT_DECIDED** thêm bí danh nhãn `APPROVE` / `APPROVED`.
8. **BUDGET_REVIEW_EXPLANATION_*** không dùng `:quarter`, vì catalog đã viết sẵn "quý kết thúc tháng".

## Lưu ý cho N2/N3c
- **Kiểu nhãn:** lá nhãn là `LabelText = Record<'vi'|'en', string>`, khai trong `notification-labels.types.ts`.
- **Số 0 trong `[ ]`:** renderer phải coi số 0 trong `[ ]` là rỗng. Cần cho 4 mã có `[ {overdueWorkingDays} ngày làm việc]` và `[; có {waitingCount} …]`.
- **Ngoại lệ test A11.1:** test "tập biến vi = en" cần ngoại lệ cho USAGE_TRACKING_NOTICE (bản vi dùng `dataKinds`, `purpose`; bản en bỏ).
- **`servicePeriodMonth`:** đang hiện thô, chưa có formatter `MM/yyyy`.
- **Biến nullable ngoài `[ ]`:** một số biến `|null` nằm ngoài `[ ]` vì chép nguyên văn catalog. Nếu luật A10 bắt chúng phải nằm trong `[ ]` thì N3c đỏ ⟹ sửa ở N3c.
- **STEP_SLA_REMINDER:** chưa có biến thể `recipientRole` (N7 thêm sau).
- **`notification-text.types.ts`:** bản này chỉ có 3 kiểu + `NotificationLocale`. Khi gộp, **giữ bản của chat B**.
- **Gộp ở N3c:** `NOTIFICATION_TEXTS` phải spread cả `MF1_TEXTS` lẫn `MF1_SLA_TEXTS`.
