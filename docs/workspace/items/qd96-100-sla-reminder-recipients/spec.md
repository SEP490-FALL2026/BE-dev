# Spec: qd96-100-sla-reminder-recipients — quá SLA chỉ nhắc đúng người; SLA theo loại bước

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.8` BRD:619; US `US-05-09` AC-1→AC-6, AC-11, `US-01-04` AC-7; `QĐ-100j` PD:528,
  `QĐ-99h` PD:527, `QĐ-42d` PD:518), BE `3e4553b9`. Tự giải `S-05`, `S-06`, `S-07`
  ([QUESTIONS.md](../../../reviews/qd96-100-alignment-2026-11-05/QUESTIONS.md) mục B). Ledger: L-801, L-802, L-816.
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Bước quá SLA chỉ nhắc người giữ bước; bước của trưởng phòng nhắc thêm người yêu cầu; không còn thông báo _cấp trên_; Super Admin
chỉ nhận ở ba ca (không ai giữ, người giữ không dùng được, bước của Người duyệt chi quá hạn); Super Admin đặt SLA riêng cho
bước nhu cầu, đánh giá IT và duyệt chi. Sửa ngày nghỉ quá khứ trả đúng mã của sổ. Kiểm bằng unit policy + integration SLA.

## Sizing decision

- Container: G5 và bó finding `qd96-100-alignment` — container, không phải ranh giới.
- Mode: `single-story`.
- Outcome and owner: người nhận nhắc SLA và thời hạn từng loại bước; capability `requests/sla`, tham số ở `operating-parameters`,
  mã thông báo ở `notifications`.
- Boundaries: một migration thêm giá trị enum; job SLA giữ transaction mỗi bước một giao dịch, khóa `SKIP LOCKED` như cũ.
- Not larger: vai `FINANCE_QUESTION`, kind `FINANCE_REVIEW` (gỡ ở `qd96-100-remove-finance-review-path`); thông báo Người duyệt
  chi khi có lô (`qd96-100-spend-notifications`); dashboard tồn đọng (hoãn H5).
- Not smaller: người nhận và thời hạn cùng một job, cùng bảng nhắc; L-816 là sửa một dòng ở cùng nhóm tham số vận hành.
- Siblings: `qd96-100-remove-finance-review-path`, `qd96-100-spend-notifications`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                           |
| -------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-09 | AC-1, AC-4 | partial  | AC-1, AC-4 vế trước QĐ-96 và AC-2, AC-3, AC-5, AC-6, AC-8, AC-10, AC-11: `g5-step-sla-and-alerts`; AC-7: `g3-downstream-finance-integration` |

## Supporting references

`US-05-09` AC-2, AC-3, AC-5, AC-6, AC-11 (đã đúng, giữ test hồi quy); `US-01-04` AC-7 (mặc định 2 ngày làm việc mỗi loại bước);
`S-06` (BRD đứng trên QT A.4 — nợ tài liệu QT); `S-07`; `QĐ-42d` (`ORGANIZATION.PAST_DAY_IMMUTABLE` 409).

## Explicit out of scope

- Gỡ `FINANCE_QUESTION`, `FINANCE_QUESTION_REMINDER`, kind `FINANCE_REVIEW`: `qd96-100-remove-finance-review-path` (giữ nguyên ở đây).
- Cảnh báo tồn đọng `STEP_BACKLOG_ALERT` và nghẽn (`US-05-10`): không đổi.
- Đổi tên khóa `APPROVAL_SLA_WORKING_DAYS` (tùy chọn sau; giữ khóa để không đổi dữ liệu đã lưu và seed).
- Nhắc hàng đợi trình (`SPEND_QUEUE_REMINDER`, AC-11): giữ nguyên.

## Dependencies and blockers

Sau `qd96-100-request-sender-rules` (cùng track, không phụ thuộc kỹ thuật). Migration `<ts>_requests_sla_reminder_role_requester`
đi trước code (đặt timestamp lúc implement).

## Ownership: module, data, API

- `requests/sla/{step-sla.policy.ts, sla-recipient-facts.service.ts, sla-subject.repo.ts, step-sla.service.ts, reminder-writer.service.ts}`.
- `requests/access-request/{request-facts.service.ts, access-request.policy.ts, access-request.json.ts}`, nơi mở bước:
  `need-decision/need-decision-effects.service.ts` (bước đánh giá IT), `assessment/proposal.service.ts`,
  `service-account-request/service-account-request.service.ts`, `spend/spend-routing.service.ts` (bước chi),
  `request-submission/request-preview.policy.ts` (`expectedWorkingDays` theo loại).
- `operating-parameters/{parameter-definitions.policy.ts, operating-parameters.http-errors.ts, operating-parameters.controller.ts}`.
- `notifications/{public/notifications.types.ts, inbox/inbox.policy.ts}`.
- Bảng: `step_sla_reminder_recipients.role` (enum `SlaReminderRole` + `REQUESTER`). API: `operatingParameterList/Set` (2 khóa mới),
  `nonWorkingDateAdd/Rename/Remove` (mã lỗi đổi), `accessRequestPreview` (`chain[].expectedWorkingDays` theo loại).

## Behavior and design

1. **Người nhận bước quá hạn** (`recipientsOf`, thuần):
   - không ai giữ ⟹ Super Admin, cause `NO_HOLDER`; người giữ không còn làm việc ⟹ Super Admin, cause `HOLDER_NOT_USABLE`;
   - ngược lại người giữ (`HOLDER`); thêm `REQUESTER` khi bước `NEED` và người giữ **không** phải Người duyệt chi (bước của
     trưởng phòng — `QĐ-100j`), người yêu cầu còn làm việc và khác người giữ;
   - người giữ là Người duyệt chi (bất kỳ loại bước) ⟹ thêm Super Admin, cause `SPENDING_APPROVER_LATE` (`US-05-09` AC-4, `S-07`);
   - bỏ `superiorOf`, `SUPERIOR`, cause `NO_SUPERIOR`. `FINANCE_QUESTION` giữ nguyên tới hạng mục gỡ Finance.
2. **Mã thông báo:** `HOLDER` → `STEP_SLA_REMINDER` (giữ); `REQUESTER` → mới `STEP_SLA_REQUESTER_REMINDER`
   (`requestId`, `stepKind`, số lần/tuổi/quá hạn; không id người giữ); `SUPER_ADMIN` → mới `STEP_SLA_SUPER_ADMIN_ALERT`
   (như cũ + `cause`). `STEP_SLA_ESCALATION`, `STEP_SLA_NO_SUPERIOR` giữ trong danh mục và bảng tham số inbox để **đọc**
   thông báo cũ; test chặn job ghi mới hai mã này.
3. **Đọc facts:** `lockOpenStep` trả thêm `requesterEmployeeId`; `forStep` đọc Người duyệt chi (`getSpendingApproverEmployeeId`)
   và người yêu cầu còn làm việc; không còn đọc placement/trưởng phòng của người giữ.
4. **SLA theo loại bước:** thêm `IT_ASSESSMENT_SLA_WORKING_DAYS`, `SPEND_APPROVAL_SLA_WORKING_DAYS` (int 1..30, mặc định 2,
   nhóm `WORKFLOW`, nguồn `FR-3.8`); `APPROVAL_SLA_WORKING_DAYS` đổi nhãn thành _Hạn xử lý bước nhu cầu_. `RequestSettings` đọc
   cả ba trước transaction; `RequestPolicy` (JSON) thêm `slaByKind: { NEED, IT_ASSESSMENT, SPEND_APPROVAL }` chụp lúc gửi
   (`US-01-04` AC-4: đổi tham số không đổi Request đang chạy). Hàm `slaDaysOf(policy, kind)` trả `slaByKind[kind]`, policy cũ
   không có `slaByKind` ⟹ `slaWorkingDays` (tương thích ngược, không backfill). Mỗi nơi mở bước dùng `slaDaysOf`.
5. **L-816:** `NonWorkingDateInPastError` ⟹ `409 ORGANIZATION.PAST_DAY_IMMUTABLE` (thay `422 NON_WORKING_DATE.IN_PAST`), cập nhật ví dụ OpenAPI.
6. Migration: `ALTER TYPE "SlaReminderRole" ADD VALUE 'REQUESTER'` (không tạo lại enum, giữ `SUPERIOR` cho lịch sử — `Q-02` B).
   **DB-05:** `ADD VALUE` không hoàn tác — ngoại lệ theo `Q-02` B (C-REVIEW R-18). Timestamp đặt lúc merge (M05 toàn cục).

### Mức FE-tonight (chỉnh 05/11 theo review main flow)

**B.** Không đổi bước nào của MF-1 mà FE nối: nhắc SLA là job nền, FE chỉ cần thêm nhãn cho hai mã thông báo mới
(`STEP_SLA_REQUESTER_REMINDER`, `STEP_SLA_SUPER_ADMIN_ALERT`), hai dòng tham số và đổi mã lỗi ngày nghỉ — làm khi hạng mục merge.
Tới lúc đó nhắc SLA vẫn chạy theo người nhận cũ (có leo thang cấp trên) — sai luật nhưng không chặn flow.

Tương thích FE: hai mã thông báo mới cần nhãn; mã lỗi ngày nghỉ đổi; màn tham số có 2 dòng mới.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                  | Cấp test                              | Kết quả mong đợi                                                      | Bằng chứng sau implement |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| AC-1        | Bước `NEED` của `H1` quá hạn, người yêu cầu `E1`                                                     | unit `recipientsOf` + integration SLA | `H1` HOLDER, `E1` REQUESTER; Người duyệt chi không nhận               | planned                  |
| AC-1        | `E1` đã nghỉ việc                                                                                    | unit                                  | chỉ `H1`                                                              | planned                  |
| AC-4        | Bước chi do Người duyệt chi `C1` giữ quá hạn                                                         | unit + integration                    | `C1` HOLDER + Super Admin `SPENDING_APPROVER_LATE`; không ai cấp trên | planned                  |
| AC-4        | Bước nhu cầu dòng trưởng phòng do `C1` giữ                                                           | unit                                  | `C1` + Super Admin; không REQUESTER                                   | planned                  |
| S-07        | Bước đánh giá IT quá hạn                                                                             | unit                                  | chỉ IT Admin giữ bước; trưởng phòng CNTT không nhận                   | planned                  |
| S-07        | Không ai giữ / người giữ đã nghỉ                                                                     | unit                                  | chỉ Super Admin `NO_HOLDER` / `HOLDER_NOT_USABLE`                     | planned                  |
| Hồi quy     | Job chạy hai lần cùng ngày                                                                           | integration                           | một lần nhắc (AC-2, AC-3 không đổi)                                   | planned                  |
| Mã cũ       | Sau job, `notifications` không có `STEP_SLA_ESCALATION`/`NO_SUPERIOR` mới; inbox đọc được bản ghi cũ | integration + unit inbox              | đúng                                                                  | planned                  |
| L-802       | Đặt `SPEND_APPROVAL_SLA_WORKING_DAYS = 3`, Request gửi sau đó                                        | integration                           | bước chi `sla_working_days = 3`, bước nhu cầu 2                       | planned                  |
| L-802       | Request gửi trước khi đổi tham số                                                                    | integration                           | giữ giá trị cũ                                                        | planned                  |
| L-802       | Policy JSON cũ không có `slaByKind`                                                                  | unit `access-request.json`            | đọc được, dùng `slaWorkingDays`                                       | planned                  |
| L-816       | Sửa ngày nghỉ hôm qua                                                                                | http                                  | 409 `ORGANIZATION.PAST_DAY_IMMUTABLE`                                 | planned                  |

## Definition of Done

- [ ] AC-1, AC-4 có test đỏ-trước/xanh-sau; hồi quy AC-2/3/5/6/11 xanh.
- [ ] Gate nhanh xanh + migration áp được (`pnpm prisma:validate`, integration file SLA trên DB riêng).
- [ ] Spec/plan phản ánh implementation; báo FE mã thông báo, mã lỗi, tham số mới.
- [ ] Không tăng legacy ledger kiến trúc; README `requests`/`notifications` cập nhật danh mục mã.

## Open questions

Không có.

## Changes and acceptance

05/11/2026: bản đầu. Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B**; thêm câu DB-05 (C-REVIEW R-18). Chưa nghiệm thu.
05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): `US-05-09` AC-1, AC-4 `full` → `partial` — map G5 giữ chủ cũ
`g5-step-sla-and-alerts`, hạng mục này là chủ phần còn lại. Không đổi thiết kế.
