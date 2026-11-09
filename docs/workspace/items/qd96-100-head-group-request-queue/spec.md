# Spec: qd96-100-head-group-request-queue — Request nhóm của trưởng phòng vào hàng đợi trình ngay; người mới xếp phòng tương lai

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.21` BRD:709; US `US-06-14` AC-5, AC-6, `US-06-01` AC-7, `US-05-17` AC-1, AC-3, AC-20, AC-21; `QĐ-82l(11)`
  PD:310, `QĐ-93g(4)` PD:227, `QĐ-100ag` PD:510), BE `3e4553b9`. LEDGER K-4 (vế chính không phụ thuộc mentor). Ledger: L-210, L-211.
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Request nhóm trả phí do trưởng phòng gửi (kể cả có dòng của chính trưởng phòng) vào hàng đợi trình **ngay**; khi trưởng phòng
trình lô, Người duyệt chi mới nhận cùng lúc bước nhu cầu của dòng trưởng phòng và bước duyệt chi (cờ _cùng người_). Người mới
đã xếp phòng từ ngày tương lai được chọn và gửi trong Request nhóm. Kiểm bằng integration gửi → hàng đợi → trình lô.

## Sizing decision

- Container: G5 và bó finding `qd96-100-alignment` — container, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: thời điểm mở bước của dòng trưởng phòng và tập ứng viên Request nhóm; capability
  `requests/group-request-submission`, `requests/spend` (mở bước lúc trình), đọc `organization/public`.
- Boundaries: hai migration (M19 thêm giá trị enum, M20 viết lại `access_request_steps_holder_check`); mở bước trong transaction trình lô hiện có; không đổi quyền route.
- Not larger: ba kết quả kiểm ngân sách và xác nhận dự phòng (`qd96-100-budget-check-three-outcomes`, `qd96-100-reserve-confirmation`);
  Request nhóm luôn qua Người duyệt chi khi không tốn thêm tiền (`QĐ-100l`, chờ mentor); tối thiểu 2 người (`qd96-100-request-sender-rules`).
- Not smaller: hai lỗi cùng một luồng _trưởng phòng gửi nhóm cho người trong phòng_; test tái hiện dùng chung harness.
- Siblings: `qd96-100-budget-check-three-outcomes`, `qd96-100-reserve-confirmation`, `qd96-100-request-sender-rules`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC         | Coverage | Phần còn lại thuộc                                                                                                                                                   |
| -------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-14 | AC-5, AC-6 | partial  | AC-5 vế từ chối gửi thay một người: `qd96-100-request-sender-rules` (AC-6 thuộc hạng mục này trọn vẹn, xem dưới bảng)                                                |
| US-06-01 | AC-7       | partial  | vế từ chối Request cá nhân của trưởng phòng: chờ mentor (`QĐ-100l`, L-990); vế chặn gán `MANAGER` cho Người duyệt chi: `qd93-direct-manager-spending-approver-roles` |
| US-05-17 | AC-21      | partial  | vế tối thiểu 2 người: `qd96-100-request-sender-rules`                                                                                                                |

AC-6 trọn vẹn ở đây (C-REVIEW R-16c): hàm phán ba kết quả và xác nhận dự phòng là hợp đồng của `qd96-100-budget-check-three-outcomes`
và `qd96-100-reserve-confirmation`, hạng mục này chỉ gọi và có test end-to-end cho Request nhóm có dòng trưởng phòng.

## Supporting references

`QĐ-82l(11)`; `FR-3.21` gạch 1, 3; `US-05-17` AC-1, AC-3 (dòng trưởng phòng do Người duyệt chi giữ — giữ nguyên); `US-05-03`
dòng 6; `QĐ-93g(4)` (_người xếp phòng ngày tương lai coi là thành viên khi xét điều kiện Request_). L-210, L-211 kết luận từ
đọc code — plan bắt đầu bằng test tái hiện.

## Explicit out of scope

- Request nhóm do **nhân viên** gửi (`US-05-17` AC-16): giữ như hiện nay (bước của dòng trưởng phòng mở ngay vì Request còn ở bước nhu cầu).
- Request nhóm nội bộ không phí: không tồn tại (`checkGroupPlan` chỉ nhận `K2` trả phí).
- Bước nhu cầu dòng trưởng phòng khi Request bị trả về hàng đợi sau khi đã mở: giữ nguyên (không đóng/mở lại).
- Đổi luồng `QĐ-100l` (L-990).

## Dependencies and blockers

Sau `qd96-100-budget-check-three-outcomes` (viết lại `spend-routing`/trình lô — điểm gắn mở bước) và `qd96-100-request-sender-rules`.
Migration **M19** `requests_step_state_queued_value` rồi **M20** `requests_step_state_queued` (số thứ tự toàn cục, C-REVIEW mục 3;
timestamp đặt lúc merge) đi trước code. Nếu `#6` chưa merge khi tới lượt: làm Task 1–2 (L-211) trước, giữ Task 3–4 chờ.

## Ownership: module, data, API

- `requests/group-request-submission/{group-need-routing.policy.ts, group-request.service.ts, group-request-writer.service.ts,
group-submission-facts.service.ts, group-candidate.service.ts}`; `requests/spend/spend-routing.service.ts` (hoặc nơi `#6` mở
  bước chi), `requests/spend/spend-step.repo.ts`; danh sách/withdraw đọc trạng thái bước (`need-decision-queue`, `withdraw`,
  `group-request/group-line-withdrawer.service.ts`, `sla/*`, `congestion.repo.ts`) — kiểm `QUEUED` bị loại hoặc xử lý đúng.
- `organization/public/organization-read.api.ts` + `organization/department/department.repo.ts`: đọc lần xếp phòng hiện tại
  **hoặc** sắp tới gần nhất.
- Bảng: enum `AccessRequestStepState` + `QUEUED`. API: không đổi hình dạng; hành vi `groupRequestSubmit`, `groupRequestCheck`,
  `groupRequestCandidateList`, `spendBatchSubmit`, `needDecisionList` đổi.

## Behavior and design

1. **Gửi** (người gửi là trưởng phòng, chuỗi có bước chi — luôn đúng với Request nhóm): dòng của người khác _đã xác nhận_ như
   nay; dòng của chính trưởng phòng có bước nhu cầu trạng thái **`QUEUED`** (chưa giao, không SLA, không cảnh báo chờ có kiểm
   soát); `groupStartState` bỏ qua bước `QUEUED` ⟹ Request vào `AWAITING_SPEND_SUBMISSION` ngay (trigger `spend_queued_at` chạy như cũ).
2. **Trình lô:** khi trình lô mở bước chi cho Request (trong số cơ sở, hoặc dự phòng đã xác nhận — theo `#6`/`#7`), cùng
   transaction: bước `QUEUED` ⟹ `PENDING`, người giữ = Người duyệt chi dùng được (khóa `FOR SHARE` như bước chi) hoặc `WAITING`
   `NO_SPENDING_APPROVER`; `created_at` đặt lại = lúc mở (đồng hồ SLA chạy từ lúc trình, `FR-3.21`); cờ `same_person_as_spend`
   trên cả hai bước. Request bị chặn/không trình được ⟹ bước vẫn `QUEUED`.
   Hai quyết định riêng của Người duyệt chi ghi Audit với cờ _cùng người_ như hiện có (`US-06-01` AC-7). Request nhóm của trưởng
   phòng luôn qua bước chi: BE chưa có nhánh _phần tiền mới bằng 0_ cho Request nhóm (`QĐ-99l` thuộc hạng mục hoãn H2) — test giữ
   điều này. Không còn điều kiện dòng kế hoạch khi trình (`QĐ-101n`).
3. **Rút/hủy** dòng hoặc Request khi bước `QUEUED` ⟹ bước `CLOSED` như bước mở.
4. **Người mới (L-211):** `getOwningUnits(..., { includeUpcoming: true })` trả lần xếp phòng hiện tại, nếu không có thì lần sắp
   tới gần nhất; dùng ở `group-submission-facts` (điều kiện dòng) và `group-candidate` (`getDepartmentMemberIds` cùng tùy chọn).
   Ngày bắt đầu của người đó = `max(hireDate, ngày xếp phòng)` cho luật hiện có của `beneficiary-eligibility`. Người gửi vẫn
   xét theo phòng hôm nay. Không đổi các nơi đọc phòng khác.
5. Migration (R-02): **M19** chỉ `ALTER TYPE "AccessRequestStepState" ADD VALUE 'QUEUED'` (giá trị mới không dùng được trong
   CHECK cùng migration — tiền lệ `20261023230000_requests_spend_decision_values`). **M20** `DROP/ADD
access_request_steps_holder_check` từ định nghĩa hiện hành (`20261023210100_requests_budget_checks`) thêm nhánh
   `state = 'QUEUED' AND assignee_employee_id IS NULL AND assigned_at IS NULL AND waiting_reason IS NULL AND decided_at IS NULL`.
   Index `access_request_steps_open_created_at_idx` (lọc `PENDING`, `WAITING`) tự loại `QUEUED`; trigger `waiting_since` chỉ xét
   `WAITING` — kiểm lại khi implement. **DB-05:** `ADD VALUE` không hoàn tác — ngoại lệ theo `Q-02` B (không tạo lại enum).

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F09)

**Mức FE-tonight: A** — toàn bộ mục 1→5 (cần cho demo MF-1 nhánh _trưởng phòng gửi Request nhóm_, QT 1.4). Không đổi hình
dạng API; FE chỉ cần biết hành vi: sau `groupRequestSubmit` của trưởng phòng, Request hiện **ngay** ở `spendQueueList` của chính
trưởng phòng (`stage = NOT_SUBMITTED`), không ở `needDecisionList` của Người duyệt chi cho tới khi trình lô; ứng viên
`groupRequestCandidateList` có người đã xếp phòng từ ngày tương lai. Vế `DIRECT` (Request có người quyết nhu cầu không phải
`MANAGER` đi thẳng bước chi) do `qd96-100-budget-check-three-outcomes` phần A gỡ. Ca trưởng phòng tự gửi Request **cá nhân** cho
mình: giữ hiện trạng, chờ mentor (`QĐ-100l`, L-990).

## Test matrix

| AC / rủi ro     | Tình huống (gồm từ chối, edge case)                                                             | Cấp test    | Kết quả mong đợi                                                                                          | Bằng chứng sau implement |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| L-210 tái hiện  | `H1` gửi nhóm `E1`, `E2`, `H1` (trước sửa)                                                      | integration | đỏ: Request `PENDING`, bước dòng `H1` mở ngay                                                             | planned                  |
| `US-06-14` AC-6 | Sau sửa, gửi                                                                                    | integration | `AWAITING_SPEND_SUBMISSION`; bước dòng `H1` `QUEUED`; Người duyệt chi không thấy trong `needDecisionList` | planned                  |
| `US-06-14` AC-6 | `H1` trình lô, kết quả trong số cơ sở                                                           | integration | bước nhu cầu dòng `H1` + bước chi giao `C1`, cờ cùng người, SLA từ lúc trình                              | planned                  |
| Biên            | Trình bị chặn / không trình được                                                                | integration | bước vẫn `QUEUED`                                                                                         | planned                  |
| Biên            | Chưa có Người duyệt chi lúc trình                                                               | integration | cả hai bước `WAITING` `NO_SPENDING_APPROVER`                                                              | planned                  |
| Biên            | `H1` rút dòng của mình khi `QUEUED`                                                             | integration | bước `CLOSED`                                                                                             | planned                  |
| SLA             | Job SLA với bước `QUEUED` quá 2 ngày                                                            | integration | không nhắc                                                                                                | planned                  |
| R-02 (DB)       | INSERT bước `QUEUED` có/không người giữ; mở thành `PENDING`                                     | integration | không người giữ: được; có người giữ: vi phạm `holder_check`; mở: được                                     | planned                  |
| AC-6 ba kết quả | `H1` trình nhóm có dòng mình: dùng dự phòng chưa xác nhận / đã xác nhận / bị chặn               | integration | bước vẫn `QUEUED` / hai bước mở cho `C1` / bước vẫn `QUEUED`                                              | planned                  |
| `US-06-14` AC-5 | `H1` gửi nhóm `E2`, `E3` (không có dòng mình); trình ngay (không cần dòng kế hoạch — `QĐ-101n`) | integration | vào hàng đợi ngay; trình được                                                                             | planned                  |
| `US-06-01` AC-7 | `C1` quyết bước nhu cầu dòng `H1` rồi bước chi                                                  | integration | hai quyết định riêng; Audit cả hai có cờ _cùng người_                                                     | planned                  |
| Hồi quy         | Nhân viên gửi nhóm có dòng `H1`                                                                 | integration | như cũ (bước dòng `H1` mở ngay, Request `PENDING`)                                                        | planned                  |
| L-211 tái hiện  | `A1`, `A2` xếp `P-DES` từ 15/11, hôm nay 10/11                                                  | integration | đỏ trước; sau sửa: ứng viên có `A1`, `A2`; gửi nhóm 201                                                   | planned                  |
| L-211           | Người xếp phòng tương lai ở phòng khác                                                          | integration | `OUTSIDE_DEPARTMENT`                                                                                      | planned                  |

## Definition of Done

- [ ] Test tái hiện L-210, L-211 đỏ trước/xanh sau; vế còn lại của `US-06-14` AC-5, `US-06-01` AC-7, `US-05-17` AC-21 ghi đúng chủ.
- [ ] Gate nhanh xanh + migration áp được.
- [ ] Spec/plan phản ánh implementation; báo FE (Request nhóm của trưởng phòng hiện ngay ở hàng đợi trình).
- [ ] Không tăng legacy ledger kiến trúc.

## Open questions

Không có.

## Changes and acceptance

05/11/2026: bản đầu. 05/11/2026: nhận `US-06-14` AC-5, `US-06-01` AC-7 (Track B báo chưa có chủ). 05/11/2026 theo C-REVIEW:
R-02 (viết lại `holder_check`, tách M19/M20), R-18 (DB-05), R-16c (AC-6 trọn vẹn ở đây), R-19 (số migration toàn cục).
05/11/2026 (chỉnh 05/11 theo review main flow: F09): mức FE-tonight **A** toàn bộ; ghi hành vi FE thấy. Chưa nghiệm thu.
05/11/2026 (`QĐ-101m`): câu _trình khi chưa gắn dòng kế hoạch bị chặn_ (`US-06-14` AC-5) hết hiệu lực — trình không cần dòng, BE tự khớp ([`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md)); ca test AC-5 vế 422 lý do dòng bỏ. Không viết lại phần khác.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Trình không gắn dòng (`US-06-14` AC-5). Không viết lại phần khác.
