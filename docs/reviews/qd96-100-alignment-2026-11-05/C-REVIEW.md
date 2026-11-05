# C-REVIEW — rà chéo bộ spec/plan `qd96-100-*` trước khi code

> Agent **C-REVIEW**, 05/11/2026. Pin: Docs `3d73a7f`, BE `3e4553b9` (cây làm việc chưa có thay đổi code; chỉ có thư mục spec
> chưa track). Read-only với code và spec; không chạy test; không thao tác git đổi trạng thái. File này là đầu ra duy nhất.

## 0. Skill đã dùng và phạm vi

| Skill | Loại | Mục đích |
| --- | --- | --- |
| `planning-and-task-breakdown` | process | Đồ thị phụ thuộc giữa hạng mục, thứ tự build toàn cục, điểm chạm cùng file |
| `code-review-and-quality` | review | Xếp mức Critical / Required / Optional, ưu tiên đúng-sai và bảo mật trước, đề xuất sửa cụ thể |
| `deprecation-and-migration` | domain | Kiểm migration: expand/contract, thao tác không hoàn tác được, ràng buộc bị kéo theo khi drop cột |
| `superpowers:verification-before-completion` | verification | Mọi phát hiện có bằng chứng `file:dòng` đã mở trong lượt này; kiểm phủ `L-` và AC bằng lệnh grep, không suy đoán |

**Đã đọc:** tracker `README.md`, `ITEMS.md` (mục 1, 2, 6), `QUESTIONS.md` (mục B, D, Q-02, Q-03, Q-04, Q-06), toàn bộ 27 cặp
`spec.md` + `plan.md` hiện có. Đối chiếu từng migration với SQL ràng buộc/trigger hiện có trong `prisma/migrations/**`. Đọc trích
`project-decisions.md` (`QĐ-97c`, `QĐ-100p`, `QĐ-93j`, `QĐ-82m`), `docs/rules/database-business.md` (DB-05),
`src/infrastructure/database/database-role-judgement.ts`.
**Chưa đọc:** BRD 4.0 và *Quy trình và chính sách theo main flow* toàn văn (chỉ dựa vào trích dẫn trong spec và QUESTIONS); code
service ngoài các điểm cần kiểm.

**Tóm tắt.** 30 phát hiện: **8 Critical** (đều là migration sẽ hỏng khi chạy vì ràng buộc/trigger hiện có), **13 Required**,
**9 Optional**. Bộ spec còn **thiếu một thư mục**: ITEMS mục 6 có 27 hạng mục, #27 tách thành hai, nên phải có 28 thư mục. Hiện có
27, thiếu `qd96-100-seed-demo-v3` (#28). Phủ `L-`: mọi `L-` của 26 hạng mục còn lại đều có chủ, không trùng. Một câu hỏi cho Owner.

## 1. Bảng phát hiện

Đường dẫn bằng chứng tương đối với repo BE. `MIG/` = `prisma/migrations/`. `IT/` = `docs/workspace/items/qd96-100-`.

### 1.1 Critical — migration hỏng khi chạy (phải sửa spec trước khi code)

| ID | Mức | Hạng mục | Mô tả | Bằng chứng | Đề xuất sửa cụ thể |
| --- | --- | --- | --- | --- | --- |
| R-01 | Critical | #6 `budget-check-three-outcomes` | Migration chỉ `ADD VALUE` và thêm cột. Hai CHECK hiện có sẽ từ chối mọi check mới: (1) `request_budget_check_years_shape_check` chỉ nhận mã `NO_ACTIVE_BUDGET` hoặc `BUDGET_OK/HIGH_VALUE/INSUFFICIENT_BUDGET`, nên `WITHIN_BASE`, `USES_RESERVE`, `OVER_RESERVE`, `CARRY_FORWARD` đều vi phạm. (2) `request_budget_checks_blocked_check` buộc `route='BLOCKED'` ⟺ `stale_cost_evidence OR period_closed`, nên `BLOCKED` vì `OVER_RESERVE`/`NO_ACTIVE_BUDGET` vi phạm. CHECK tham chiếu giá trị enum mới không đặt được trong cùng migration với `ADD VALUE` (Postgres báo *unsafe use of new enum value*; repo đã tách migration *values* làm tiền lệ). | `MIG/20261023210100_requests_budget_checks/migration.sql:74-76`, `:99-102`; `IT/budget-check-three-outcomes/spec.md:124-128`; tiền lệ `MIG/20261023230000_requests_spend_decision_values/migration.sql:3` | Tách hai migration: (a) `<ts>_requests_budget_check_values`: chỉ `ADD VALUE`. (b) `<ts+1>_requests_budget_check_three_outcomes`: cột `base_minor`, `reserve_minor`; `DROP/ADD` `shape_check` (`CARRY_FORWARD` cùng hình với `NO_ACTIVE_BUDGET`; ba mã mới cùng hình với `BUDGET_OK`; mã cũ giữ để đọc lịch sử); thay `blocked_check` bằng ràng buộc một chiều `NOT (stale_cost_evidence OR period_closed) OR route = 'BLOCKED'`. Thêm một dòng test matrix *ghi được cả 5 mã và `BLOCKED` vì `OVER_RESERVE`*. |
| R-02 | Critical | #19 `head-group-request-queue` | Bước `QUEUED` không có người giữ, nhưng `access_request_steps_holder_check` chỉ liệt kê `PENDING`, `WAITING`, `APPROVED/REJECTED/COMPLETED`, `CLOSED`. Mọi INSERT bước `QUEUED` sẽ vi phạm CHECK. Spec mục 5 chỉ có `ADD VALUE` và ghi *kiểm lại khi implement*. | `MIG/20261023210100_requests_budget_checks/migration.sql:39-46`; `IT/head-group-request-queue/spec.md:84` | Hai migration: `ADD VALUE 'QUEUED'`, rồi `DROP/ADD holder_check` thêm nhánh `state='QUEUED' AND assignee_employee_id IS NULL AND assigned_at IS NULL AND waiting_reason IS NULL AND decided_at IS NULL`. Ghi rõ ngoại lệ DB-05 (xem R-18). |
| R-03 | Critical | #1 `revocation-deadline-and-withdraw` | Gỡ lý do cần UPDATE `provisioning_task_reasons` (`withdrawn_at`, `withdrawn_by_*`, `withdraw_cause`). Trigger `provisioning_task_reasons_immutable` từ chối **mọi** UPDATE. Spec mục 8 chỉ thêm cột/CHECK và viết lại guard của `provisioning_tasks`. | `MIG/20261024080000_licensing_revocation_tasks/migration.sql:137-146`; `IT/revocation-deadline-and-withdraw/spec.md:74` | Cùng migration: `CREATE OR REPLACE FUNCTION provisioning_task_reason_reject_change()`. Cho UPDATE khi và chỉ khi `OLD.withdrawn_at IS NULL`, nhóm cột `withdrawn_*` đổi từ NULL sang giá trị và `to_jsonb(NEW) - withdrawn_* = to_jsonb(OLD) - withdrawn_*`. DELETE vẫn bị cấm. Thêm test DB: sửa cột khác, hoặc gỡ lần hai, đều bị 55000. |
| R-04 | Critical | #3 `departure-block-now-mode` | `DROP COLUMN abrupt` làm hỏng trigger `offboarding_cases_guard`, vì hàm còn đọc `NEW."abrupt"`. Từ đó mọi UPDATE hồ sơ nghỉ việc đều lỗi *record has no field*, tức sweeper, mark-left và hủy đều chết. Hai CHECK `due_for_planned_only_check` (`abrupt = handover_due_on IS NULL`) và `abrupt_is_left_check` bị drop theo mà không có ràng buộc thay. | `MIG/20261024180000_personnel_offboarding_cases/migration.sql:54,56,140-161` (dòng 154); hàm được viết lại bằng thay chuỗi ở `MIG/20261029100700_super_admin_event_tickets/migration.sql:165`; `IT/departure-block-now-mode/spec.md:68` | Cùng migration, trước DROP: `CREATE OR REPLACE FUNCTION offboarding_cases_guard()` từ định nghĩa **hiện hành** (sau 20261029100700), thay `abrupt` bằng `block_mode` trong danh sách bất biến. Thêm CHECK `(block_mode = 'BLOCK_NOW') = (handover_due_on IS NULL)`, giữ ngữ nghĩa *giữ quyền tính từ ngày ghi* của ca đột ngột; không cần hỏi Owner. Bỏ hẳn `abrupt_is_left_check`, vì `BLOCK_NOW` tương lai là `HANDING_OVER`. Test: UPDATE hồ sơ sau migration. |
| R-05 | Critical | #14 `annual-budget-reserve-and-floor` | Lệnh `UPDATE budget_commitments SET unattached_reason='CARRY_FORWARD' WHERE ='NO_BUDGET'` sẽ hỏng ở hai chỗ. (1) CHECK `budget_commitments_attachment_check` bắt `unattached_reason = 'NO_BUDGET'`. (2) Trigger `budget_commitments_guard` từ chối mọi UPDATE khi `OLD.state <> 'HELD'`, tức cam kết đã giải phóng hoặc đã chi. | `MIG/20261023190000_budgets_decisions_and_commitments/migration.sql:104-107`; `MIG/20261024010000_budgets_commitment_release/migration.sql:66-89`; `IT/annual-budget-reserve-and-floor/spec.md:86-90` | Không sửa dữ liệu lịch sử (đúng tinh thần Q-02 B: giữ giá trị). `DROP/ADD attachment_check` với `unattached_reason IN ('NO_BUDGET','CARRY_FORWARD')`. Code chỉ ghi `CARRY_FORWARD` cho cam kết mới. Một hàm đọc ánh xạ `NO_BUDGET` thành `CARRY_FORWARD` ở wire. Bỏ câu UPDATE khỏi mục 8. |
| R-06 | Critical | `catalog-api-fields` | Đính biên lai vào thuê bao (`contract_id` NULL, `status='READY'`) vi phạm `document_attachments_owner_state`, CHECK bắt `READY` ⟺ `contract_id IS NOT NULL`. `purpose_fits_owner` cũng chỉ xét `contract_id`. Spec chỉ thêm CHECK *không cả hai*. | `MIG/20261020250000_catalog_contracts_and_documents/migration.sql:43-51`; `IT/catalog-api-fields/spec.md:77-79` | `DROP/ADD owner_state`: `(status='READY') = (num_nonnulls(contract_id, subscription_id) = 1)` và `(num_nonnulls(contract_id, subscription_id) = 0) = (attached_at IS NULL)`. `DROP/ADD purpose_fits_owner`: hợp đồng nhận 2 mục đích, thuê bao chỉ nhận `PURCHASE_DOCUMENT`; như vậy mã `DOCUMENT.ATTACH_TARGET_INVALID` có lớp DB đỡ. |
| R-07 | Critical | `catalog-api-fields` | Backfill `tax_code` là UPDATE lên `vendor_tax_profile_lines`, mà trigger `vendor_tax_profile_lines_immutable` từ chối mọi UPDATE. Sau đó `SET NOT NULL` không áp được. | `MIG/20261020140000_finance_vendor_tax_profiles/migration.sql:65-78`; `IT/catalog-api-fields/spec.md:80-83` | Phương án gọn: thêm `tax_code TEXT NULL` + `CHECK (tax_code IS NOT NULL AND tax_code IN (...)) NOT VALID`. CHECK chỉ áp cho dòng mới; phiên bản cũ là lịch sử bất biến, đọc thì suy mã bằng một hàm thuần từ `normalized_tax_type`, không backfill. Unique một phần `(version_id, tax_code) WHERE tax_code IS NOT NULL AND tax_code <> 'OTHER'`. Nếu Owner muốn có cột trên dữ liệu cũ thì `DISABLE/ENABLE TRIGGER` trong migration theo tiền lệ R-08, ghi Audit `SYSTEM`. |
| R-08 | Critical | `licensing-api-fields` | Tính lại `normalized_account_identifier` sang NFC là UPDATE bị `license_assignments_immutable` chặn, vì cột này nằm trong bộ cột bất biến của hàm `license_assignment_reject_change`. | `MIG/20261024090200_licensing_assignment_renewal/migration.sql:16-34`; `IT/licensing-api-fields/spec.md:68-71` | Trong migration: `ALTER TABLE license_assignments DISABLE TRIGGER license_assignments_immutable;` → UPDATE → `ENABLE TRIGGER`, theo tiền lệ `MIG/20261022120000_cost_centers_unit_only/migration.sql:15,30`. Kiểm thêm trigger `capacity_on_extend`/`rules` không bắt UPDATE cột này. Test: trigger bật lại sau migration. |

### 1.2 Required

| ID | Mức | Hạng mục | Mô tả | Bằng chứng | Đề xuất sửa cụ thể |
| --- | --- | --- | --- | --- | --- |
| R-09 | Required | #13 `remove-budget-revision-and-high-value` | `DROP COLUMN based_on_version_id` tự drop luôn `budget_versions_source_check`, vì CHECK nhiều cột chứa cột bị xóa. Mất bất biến *phiên bản `INITIAL` phải có `proposal_id`*. | `MIG/20261023180000_budgets_proposals_and_versions/migration.sql:224-226`; `IT/remove-budget-revision-and-high-value/spec.md:76-83` | Mục 3(c): sau DROP, thêm `CHECK (kind <> 'INITIAL' OR proposal_id IS NOT NULL)`. Dòng `REVISION` lịch sử vẫn hợp lệ. Thêm một dòng test. |
| R-10 | Required | #7 `reserve-confirmation`, #16 `request-year-without-spend-date` | `request_supplements_change_check` hiện bắt *đổi ngày dự kiến chi hoặc đổi số tiền*. (a) #7: hồ sơ bổ sung chỉ giảm `termMonths` mà số tiền không đổi (giá chưa có hoặc bằng 0) sẽ bị từ chối. Từ #7 tới #16, 4 cột ngày/năm vẫn `NOT NULL`, nên #7 phải ghi before = after. (b) #16 drop 4 cột thì CHECK này bị drop theo, mất luôn bất biến *hồ sơ bổ sung phải đổi gì đó*. | `MIG/20261024130200_requests_group_supplement_drops/migration.sql:22-26`; `MIG/20261023220000_requests_spend_batches/migration.sql:55-58`; `IT/reserve-confirmation/spec.md:100-104`; `IT/request-year-without-spend-date/spec.md:92-96` | #7 mục 10: viết lại CHECK, thêm vế `before_term_months IS DISTINCT FROM after_term_months`, và ghi rõ cặp ngày/năm before = after khi không đổi ngày. #16 mục 7: sau DROP, tạo lại CHECK chỉ trên số tiền và term (đã tính cả bản ghi chỉ bỏ người, vì bỏ người làm đổi số tiền). |
| R-11 | Required (bảo mật) | #2 `departure-day-access-block`, #3 | #2 mục 2 viết *đổi ngày cuối ⟹ upsert `blockedFrom = lastWorkingDay + 1`*. #3 không loại trừ ca `BLOCK_NOW`. Super Admin đổi ngày cuối của hồ sơ *chặn ngay* (vẫn trước ngày cuối nên luật cho phép) sẽ dời ngày chặn sang tương lai và mở lại truy cập cho người công ty đã quyết cắt ngay. | `IT/departure-day-access-block/spec.md:62`; `IT/departure-block-now-mode/spec.md` mục 2–3 (không nhắc đổi ngày cuối) | #3 thêm luật: đổi ngày cuối chỉ upsert khi `cause = DEPARTURE_LAST_DAY`; `DEPARTURE_BLOCK_NOW` giữ `blockedFrom`. Thêm test HTTP: đổi ngày cuối hồ sơ `BLOCK_NOW` → người đó vẫn 401. |
| R-12 | Required | #2 | Backfill `block_announced_at = now()` *cho hồ sơ đã qua ngày cuối*. Nếu chạm hồ sơ `CANCELLED`, guard sẽ raise (*a cancelled case cannot change again*) và cả migration thất bại. | `MIG/20261024180000_personnel_offboarding_cases/migration.sql:147-150`; `IT/departure-day-access-block/spec.md:68` | Giới hạn `WHERE state = 'HANDING_OVER' AND last_working_day < <hôm nay giờ tổ chức>`, vì sweeper chỉ đọc `HANDING_OVER`. |
| R-13 | Required (hợp đồng) | #6 ↔ #7 ↔ #22 | #22 đọc Audit `ACCESS_REQUEST.BUDGET_CHECKED` (`outcome`, `blockedReasons`, phần vượt, `currency`, đã xác nhận dự phòng chưa) và `SPEND_STEP_CLOSED` (`reason`, `blockedReasons`, phần vượt). #6 chỉ nói *ghi Audit event mà rule thông báo đọc*, không định nghĩa hình dạng `detail`. #7 không nói ghi `reserveConfirmed` vào Audit. | `IT/budget-check-three-outcomes/spec.md:47-48`; `IT/spend-notifications/spec.md:58,73-77`; plan #22 *Before coding* (bổ sung nếu thiếu) | #6 (chủ hợp đồng) thêm bảng `detail` của hai event: `outcome`, `blockedReasons[]`, `years[{year, code, overBase, overReserve}]`, `currency`, `trigger`. #7 thêm `reserveConfirmed: boolean`. #22 chỉ tham chiếu, bỏ câu *nếu thiếu thì bổ sung ở Task 1* (tránh sửa hợp đồng của #6 từ #22). |
| R-14 | Required | #16 ↔ #21 | Cả hai nhận bỏ `expectedSpendOn` của `renewalSubmitSchema` (`L-208` của #21; #16 liệt kê `renewal-request.dto.ts:20` và `accessRequestRenewalSubmit`). Ngoài ra, luật neo của #16 (*thời hạn bắt đầu từ ngày duyệt chi*, reprice lúc duyệt) mâu thuẫn với #21: Request tiếp tục bắt đầu từ `previousEnd + 1`. | `IT/request-year-without-spend-date/spec.md:27,70,80`; `IT/renewal-chaining-and-window/spec.md` mục 1, plan *Before coding* | #16: bỏ renewal khỏi danh sách DTO/API. Thêm câu *Request `RENEWAL` neo vào `previousEnd + 1` theo #21, không reprice theo ngày trình/duyệt*. #21 giữ là chủ duy nhất. |
| R-15 | Required | #15, #16, #17, #20 | Thuê bao linh hoạt (`US-06-12` AC-18, `QĐ-98a`). (a) #15 kiểm trần với `start` = ngày gửi. #16 dời ngày bắt đầu sang ngày duyệt chi. #20 cắt ngày kết thúc quyền ở `endsBy`, nhưng giá lúc reprice ở #16 vẫn tính đủ `termMonths`. Ví dụ: gửi 15/10 xin 2 tháng, duyệt 20/12 thì tiền tính 2 tháng (có phần năm sau, thành cam kết chuyển tiếp) mà quyền chỉ tới 31/12. (b) #17 mặc định `termMonths = 12`. Với gói linh hoạt, luật #15 luôn vi phạm, nên mặc định hầu như luôn ra 422 `REPLACEMENT_NOT_POSSIBLE`. | `IT/request-term-limit/spec.md:82`; `IT/request-year-without-spend-date/spec.md:80`; `IT/approved-end-date/spec.md:81`; `IT/transfer-replacement-request/spec.md:75` | #15 (chủ policy) thêm `effectiveTermOf({start, months, flexible, fiscalYearStartMonth})` = số tháng/ngày kết thúc sau khi cắt ở `endsBy`. #16 dùng hàm này khi reprice lúc trình và lúc duyệt; #20 dùng cùng hàm cho `approvedEndOf`, để tiền khớp quyền. #17: bỏ trống ⟹ `min(12, số tháng tới endsBy)` với gói linh hoạt. |
| R-16 | Required (phủ AC) | #7, #16, #19, #6 | (a) `US-06-16` AC-9: #7 claim `full` (AC-1→AC-9) nhưng mục *Out of scope* lại giao AC-9 cho #19, mà #19 không claim. (b) `US-05-02` AC-11: #20 giao *vế năm tạm tính và lịch trả từ ngày duyệt chi* cho #16, nhưng bảng Primary của #16 không có dòng này. (c) `US-06-14` AC-6: #19 giao vế còn lại cho #6, #7, nhưng hai hạng mục này không liệt kê AC-6. (d) Ghi chú *Cần điều phối viên chốt* của #6 đã cũ: #15 nay claim AC-18, #19 claim `US-06-01` AC-7 và `US-06-14` AC-5. | `IT/reserve-confirmation/spec.md:40,60`; `IT/approved-end-date/spec.md:37`; `IT/head-group-request-queue/spec.md:34`; `IT/budget-check-three-outcomes/spec.md:48` | (a) #7 xóa dòng out-of-scope AC-9 và giữ test AC-9 *sau #19*. (b) #16 thêm `US-05-02` AC-11 partial. (c) #6 thêm `US-06-14` AC-6 partial (vế phán), #7 thêm AC-6 partial (vế xác nhận), hoặc #19 đổi chữ thành *AC-6 thuộc #19 trọn vẹn*. (d) Xóa ghi chú cũ ở #6. |
| R-17 | Required (phủ) | #28 `seed-demo-v3` | Thiếu spec/plan. Phạm vi cuối (ITEMS mục 6) có #28; `L-901`→`L-905` chưa có chủ ở mức spec. Các handoff không có nơi nhận: #11 (R9 thay bằng kịch bản *bị chặn*, *dùng dự phòng*), #13, #14 (dự phòng đúng 10 % hoặc có lý do), #16 (kịch bản qua năm), #18 (không sinh `NEEDS_NEW_TOOL`), catalog/licensing (gỡ chặn seed). | `ls docs/workspace/items/qd96-100-*` (27 thư mục); `ITEMS.md` mục 1 dòng #28, mục 6 *Phạm vi cuối* | Viết `IT/seed-demo-v3/{spec,plan}.md` trước CP-2. Kèm danh sách kịch bản nhận từ các handoff ở trên và quyết định Q-R1. |
| R-18 | Required (DB-05) | #5, #19 | `ALTER TYPE … ADD VALUE` không hoàn tác được. DB-05 bắt ghi rõ trong spec trước merge. #2, #6, #18 có ghi; #5 (`SlaReminderRole.REQUESTER`) và #19 (`QUEUED`) không ghi. | `docs/rules/database-business.md:26-29`; `IT/sla-reminder-recipients/spec.md:86`; `IT/head-group-request-queue/spec.md:84` | Thêm một câu *DB-05: ADD VALUE không hoàn tác — ngoại lệ theo Q-02 B* ở mục migration của hai spec. |
| R-19 | Required | mọi hạng mục có migration | Mỗi plan đánh số migration theo track (*1/5 track P*, *đầu tiên Track B*, *thứ 1 Track R*) và đặt timestamp lúc implement. Nhưng có phụ thuộc chéo track: #19 sau #6; #17 sau #16, #18; #16 sau #15; `catalog-api-fields` sau #23. Repo có gate thứ tự migration. Merge theo track song song dễ sinh timestamp đảo, làm hỏng DB đã áp. | các dòng *Migration dự kiến* trong plan #1, #2, #3, #5, #6, #19, #20, #21 | Dùng danh sách phẳng ở mục 3. Đổi nhãn *n/5 track P* thành số thứ tự toàn cục. Quy ước: timestamp đặt **lúc merge vào branch**, lớn hơn migration cuối đã có. |
| R-20 | Required | #14 (plan) | Task 1 (migration) drop cột `budget_versions.reason` **trước** Task 3, là task gỡ code còn đọc/ghi `reason`. Ngược với mẫu của #12, #13, #16 (gỡ code trước, drop cuối). Giữa hai task, typecheck/test sẽ đỏ. | `IT/annual-budget-reserve-and-floor/plan.md:15,35`; spec mục 8 | Tách Task 1 làm hai: thêm cột/tham số ở đầu; drop `reason` ở task cuối, sau khi đã kiểm `budget_version_history` giữ lý do cũ (hoặc ghi Audit như #12). |
| R-21 | Required | #3 ↔ #2 (thứ tự file) và Track R ↔ Track B | Điểm chạm cùng file giữa hai track chạy song song. Không hạng mục nào ghi thứ tự rebase, trừ #11↔#5 và #16↔#15. Nóng nhất: `requests/spend/spend-routing.service.ts` (#5, #6, #11, #16, #19); `spend-decision.repo.ts`, `group-decision.dto.ts`, `group-line-decision.policy.ts` (#12, #15); `spend-decision-recorder.service.ts` (#12, #16, #20, #21); `group-request-submission/group-request.service.ts` (#4, #5, #6, #15, #19); `access-request.dto.ts` (#4, #11, #12, #15, #16); `operating-parameters/parameter-definitions.policy.ts` (#1, #5, #14, #18, #21); `notifications/public/notifications.types.ts` + `inbox.policy.ts` (#1, #2, #3, #5, #11, #18, #21, #22); `licensing/provisioning/provisioning.dto.ts` (#1, #4, licensing-api-fields). | mục *Ownership* và *Files* của các plan nêu trên | Theo thứ tự build mục 3 (một hàng đợi merge duy nhất). Hạng mục sau rebase trên hạng mục trước, không sửa đè. Riêng `parameter-definitions.policy.ts` và `notifications.types.ts`: mỗi hạng mục chỉ thêm khối của mình, không sắp xếp lại. |

### 1.3 Optional

| ID | Mức | Hạng mục | Mô tả | Bằng chứng | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| R-22 | Optional | #1 ↔ #18, #2 | Tên `decidedRole` không thống nhất: #1 lấy ví dụ `TRANSFER_REVIEW_DEFAULT`, #18 dùng `TRANSFER_REVIEW_DEADLINE`. Cột là `String` nên không lỗi DB, nhưng báo cáo/tra cứu sẽ lệch. `SystemActor.reference` cũng chưa ai định nghĩa giá trị. | `IT/revocation-deadline-and-withdraw/spec.md:75`; `IT/transfer-review-defaults/spec.md:82,97`; `prisma/models/licensing.prisma:226` | #1 export hằng `DECIDED_ROLE_SYSTEM_*` và quy ước `reference = '<job>:<id>'`; #18, #2 dùng hằng đó. |
| R-23 | Optional | #18 | Thu hồi mặc định không truyền `timing.dueOn`, nên sweeper quá hạn của #1 không bao giờ cảnh báo các tác vụ này. | `IT/transfer-review-defaults/spec.md:82` | Hoặc truyền `dueOn = addWorkingDays(today, DEPARTURE_REVOCATION_WORKING_DAYS)`, hoặc ghi rõ *không hạn* là có chủ ý. |
| R-24 | Optional (lean) | #1 | `created_by_system` và `withdrawn_by_system` là boolean thừa: CHECK bắt chúng **bằng đúng** `created_by_app_user_id IS NULL` / `withdrawn_by_app_user_id IS NULL`. Hai bảng, ba cột, ba CHECK chỉ lặp lại thông tin đã có. | `IT/revocation-deadline-and-withdraw/spec.md:74,97` | Bỏ boolean. Giữ NULL người tạo + Audit `actorKind = SYSTEM`. Test *Actor Hệ thống* giữ nguyên ý. |
| R-25 | Optional | #7 ↔ #16 | Duyệt sau Tết dương lịch: #16 reprice theo năm mới, kiểm lại vẫn `USES_RESERVE` (năm 2027), và #7 vẫn chấp nhận xác nhận dự phòng đã ghi cho năm 2026. | `IT/reserve-confirmation/spec.md` mục 3; `IT/request-year-without-spend-date/spec.md:80-86` | Xác nhận chỉ còn hiệu lực khi các năm `USES_RESERVE` của check mới ⊆ các năm của check đã xác nhận; ngược lại `RETURN_TO_HEAD` với `RESERVE_CONFIRMATION_REQUIRED`. |
| R-26 | Optional | #17 ↔ #8, #22 | Request thay thế có người gửi = trưởng phòng mới. Người được điều chuyển (người thụ hưởng) không đọc được kết quả kiểm tra của Request cấp cho chính mình, vì luật #8 chỉ cho *người thụ hưởng của Request cá nhân do chính họ gửi*. Thông báo *bị chặn* (#22) cũng chỉ tới trưởng phòng. | `IT/budget-visibility-qd100p/spec.md` mục 1; `IT/transfer-replacement-request/spec.md:74-75` | Chấp nhận như hiện tại (trưởng phòng là người quyết). Hoặc #8 mở chiếu hẹp cho người thụ hưởng của Request `origin = TRANSFER_REPLACEMENT`. Ghi rõ lựa chọn trong #17. |
| R-27 | Optional | #25 ↔ #3 | IT Admin chỉ thấy thông báo `ABRUPT_DEPARTURE`. Sau #3, thông báo `DEPARTURE` có thể mang `blockMode=BLOCK_NOW` (chặn ngay, ngày cuối ở tương lai) mà IT Admin không thấy. | `IT/people-read-scope/spec.md` bảng *Ownership* dòng 1; `IT/departure-block-now-mode/spec.md` mục 6 | Lọc theo nhịp hiệu lực (`ABRUPT_DEPARTURE` hoặc `blockMode = BLOCK_NOW`). Hoặc ghi rõ IT Admin nhận qua hồ sơ nghỉ việc sau khi Super Admin ghi (`QĐ-76d`(4) chỉ nói *nghỉ đột ngột*). |
| R-28 | Optional | #6 | Cột `request_budget_checks.plan_line_overdue` vẫn ghi `false` vĩnh viễn, và `overdue_check` còn đó. | `MIG/20261023210100_requests_budget_checks/migration.sql:77`; spec #6 mục 8 | Giữ như spec (Q-02 B) nhưng ghi vào danh sách *cột chết* để #28 hoặc một lượt dọn sau xử lý. Không làm gì thêm ở lượt này. |
| R-29 | Optional | #11 | Mã lỗi đọc check vẫn là `SPEND.REVIEW_NOT_FOUND` sau khi khái niệm *Finance rà soát* bị gỡ (#8 giữ mã cho FE). | `IT/budget-visibility-qd100p/spec.md` mục 1 | Giữ tới CP-2. Ghi vào danh sách đổi tên lúc FE sinh lại client. |
| R-30 | Optional (lean) | #2 | Ba migration (enum, bảng `identity-access`, cột `personnel`). Migration 3 và 4 có thể gộp nếu quy ước repo cho phép một migration chạm hai module. | `IT/departure-day-access-block/plan.md` Task 2, 5 | Chỉ gộp khi rule module cho phép; nếu không, giữ như spec. |

## 2. Kiểm theo 6 tiêu chí

1. **Hợp đồng giữa hạng mục.**
   - Hàm `checkBudget`/`routeOf`/`judgeApproval` của #6 được #7 (cờ `reserveConfirmed`), #19 (mở bước lúc `routeOf` = `SPEND_APPROVAL`), #16 (reprice trước check) và #17 (qua hàng đợi, không gọi trực tiếp) dùng đúng chữ ký. #8, #22 đọc kết quả, không gọi. Thiếu duy nhất hợp đồng Audit `detail` (R-13). `carryForwardTotal` được #7 và #14 dùng đúng.
   - `withdrawRevocationReason(tx, actor, {sources, referenceId, cause})` và `RevocationActor`/`systemAuditActor` của #1 được #2 và #18 dùng đúng. #3 dùng đúng luật hạn *ngày ghi + N*.
   - Facade `TransferReplacementApi.create` của #17 đặt ở `requests/public`. Không xung đột với #4: #4 không thêm guard người gửi chung, chỉ gỡ route. Câu *miễn luật người gửi của #4* ở #17 thừa nhưng vô hại. #16: phải dùng neo giá mới (đã ghi).
   - Ngày kết thúc: #20 dùng `termEndOf`/`termLimitOf` của #15. #21 dùng cùng hàm cộng `contractEndDate` của #20. Lệch tiền và quyền với thuê bao linh hoạt ở R-15.
2. **Cùng file/DTO.** Các điểm nóng ở R-21. Có giả định trạng thái code sai: #16 giả định Request tiếp tục đi theo neo mới (R-14); #3 giả định guard không đọc `abrupt` (R-04).
3. **Migration.** 8 Critical ở mục 1.1 và 3 Required (R-09, R-10, R-12). Thao tác không hoàn tác được đều nằm ở hạng mục có ghi DB-05, trừ #5 và #19 (R-18). Drop cột/bảng (#3, #11, #12, #13, #14, #16) đều đặt sau bước gỡ code, trừ #14 (R-20). Không hạng mục nào tạo lại enum type cũ (đúng Q-02 B). Bảng mới bất biến theo mẫu INV-05: #7, #23.
4. **Tuân quyết định Owner (mục D) và phạm vi.**
   - Không spec nào sửa `licensing/subscription-renewal`: #12 và #23 ghi rõ; #23 để `renewalBasis` cho chat MF-5 bind.
   - Không làm phong bì/chỉ tiêu (#14 out of scope); không làm đối soát/hóa đơn (`licensing-api-fields` bỏ `discrepancyId` theo G-4; #8 ghi H7).
   - Không đụng `QĐ-100l`/`QĐ-100ah`: #4, #17, #19, #21 đều giữ hiện trạng.
   - Q-03 a1+b1+c1+d1, Q-04 B, Q-06 A, Q-08 C, Q-10 1a/2a/3a, OQ-29-1, Q-T1, G-1→G-4 đều khớp.
   - Điểm lệch duy nhất: #11, #13, #16 sửa `shared-demo-v2` trong khi Owner chọn `shared-demo-v3` (xem Q-R1).
5. **Phủ.**
   - Mọi `L-` ITEMS gán cho 26 hạng mục có spec đều có mặt trong spec chủ (đã đối chiếu bằng grep). `L-219` chia vế #15/#16 đúng. `L-901`→`L-905` (#28) không có spec (R-17).
   - Không có AC Primary nào bị hai hạng mục cùng claim `full`. Lệch chủ ở R-16.
   - Open questions còn lại: G-2 (#18) và G-3 (#23), đều *không chặn*, chờ chat MF-5. G-4 đã có hướng A.
6. **Lean.** Phần lớn spec gọn và đúng QĐ. Sổ căn cứ của #23 có căn cứ ở Q-06 A (*tổng không vượt phần được duyệt*). Chỗ phình rõ: boolean thừa ở #1 (R-24). Có thể giảm số migration ở #2 (R-30). Backfill mã thuế có thể bỏ (R-07, phương án `NOT VALID`).

## 3. Thứ tự build và migration toàn cục đề xuất (một danh sách phẳng)

Một hàng đợi merge trên `feat/qd96-100-alignment`. Mỗi dòng: hạng mục → migration (nếu có), theo thứ tự timestamp tăng dần.
`Mxx` = số thứ tự migration toàn cục.

1. #1 `revocation-deadline-and-withdraw` → **M01** `licensing_revocation_deadline_withdraw` (cột, guard task, **viết lại trigger lý do** R-03)
2. #4 `request-sender-rules` — không migration
3. #6 `budget-check-three-outcomes` → **M02** `requests_budget_check_values` (ADD VALUE) · **M03** `requests_budget_check_three_outcomes` (cột + viết lại 2 CHECK, R-01)
4. #7 `reserve-confirmation` → **M04** `requests_reserve_confirmations` (+ viết lại `request_supplements_change_check`, R-10) — CP-1 cùng #6
5. #5 `sla-reminder-recipients` → **M05** `requests_sla_reminder_role_requester` (ADD VALUE)
6. #2 `departure-day-access-block` → **M06** `identity_access_blocked_reasons` (ADD VALUE) · **M07** `identity_employee_access_blocks` · **M08** `personnel_offboarding_block_announced` (backfill chỉ `HANDING_OVER`, R-12)
7. #3 `departure-block-now-mode` → **M09** `personnel_offboarding_block_mode` (guard + CHECK mới trước DROP, R-04) — **CP-1** (sau #2, #3, #4, #5, #6, #7)
8. #18 `transfer-review-defaults` → **M10** `transfer_review_decision_default` (ADD VALUE) · **M11** `transfer_review_defaults`
9. #8 `budget-visibility-qd100p` — không migration
10. #15 `request-term-limit` — không migration (thêm `effectiveTermOf`, R-15)
11. #24 `personnel-grounds-and-reasons` — không migration
12. #11 `remove-finance-review-path` → **M12** `requests_retire_finance_path`
13. #12 `remove-spend-override` → **M13** `requests_drop_spend_override`
14. #13 `remove-budget-revision-and-high-value` → **M14** `budgets_retire_revision_and_high_value` (+ CHECK `INITIAL ⟹ proposal_id`, R-09)
15. #14 `annual-budget-reserve-and-floor` → **M15** `budgets_reserve_default_and_floor` (không UPDATE cam kết, R-05; drop `reason` để cuối, R-20)
16. #16 `request-year-without-spend-date` → **M16** `requests_pricing_anchor_without_spend_date` (+ tạo lại `change_check`, R-10) — **CP-2** (sau #11, #12, #13, #16)
17. #20 `approved-end-date` → **M17** `organization_employee_contract_end_date`
18. #21 `renewal-chaining-and-window` → **M18** `licensing_expiry_reminder_kind`
19. #19 `head-group-request-queue` → **M19** `requests_step_state_queued_value` (ADD VALUE) · **M20** `requests_step_state_queued` (viết lại `holder_check`, R-02)
20. #17 `transfer-replacement-request` → **M21** `transfer_replacement_request_link`
21. #22 `spend-notifications` — không migration — **CP-3** (sau #17, #20, #21, #22)
22. #25 `people-read-scope` — không migration
23. #26 `account-org-api-fields` — không migration
24. #29 `manager-employee-detail` — không migration
25. #23 `subscription-quantity-guard` → **M22** `subscription_quantity_basis`
26. `catalog-api-fields` → **M23** `catalog_document_subscription_target` (viết lại 2 CHECK, R-06) · **M24** `finance_vendor_tax_code` (`NOT VALID`, không backfill, R-07)
27. `licensing-api-fields` → **M25** `licensing_account_identifier_nfc` (`DISABLE/ENABLE TRIGGER`, R-08)
28. #28 `seed-demo-v3` (spec chưa có, R-17) — dữ liệu; **CP-4**, Owner reset VPS

Tổng: 25 migration (23 theo spec gốc + 2 migration *values* tách ra cho #6 và #19). Có 5 migration `ADD VALUE` không hoàn
tác: M02, M05, M06, M10, M19. Drop cột/bảng không hoàn tác: M09, M12, M13, M14, M15, M16.

Ghi chú song song: track L (#23 → `catalog-api-fields` → `licensing-api-fields`) và #25/#26/#29 không phụ thuộc kỹ thuật vào
track B. Có thể code song song, nhưng **merge** theo hàng đợi trên để timestamp migration tăng đúng thứ tự.

## 4. Câu hỏi cho Owner

### Q-R1 — `shared-demo-v2` trong khoảng từ #11 tới #28

- **Bối cảnh.** Owner chọn Q-02 B kèm dataset mới `shared-demo-v3`. README của `shared-demo-v2` ghi *immutable after shared
  deployment*. Nhưng để seed còn biên dịch và chạy sau khi gỡ khái niệm cũ, #11, #13, #16 đều sửa `v2`:
  - #11 đổi đích R9 từ `AWAITING_FINANCE_REVIEW` sang `AWAITING_SPEND_SUBMISSION`;
  - #13 bỏ `highValuePercent`;
  - #16 bỏ `expectedSpendOn`.

  Chưa có spec #28 (R-17).
- **Ví dụ.** Sau khi merge #11, lệnh `ops:seed check` trên VPS demo (đã seed `v2` cũ) sẽ báo lệch ở R9 cho tới khi Owner reset ở
  CP-4. Trong khoảng đó, FE demo vẫn thấy R9 ở trạng thái mà không màn hình nào xử lý được.
- **Phương án.**
  - **A.** Sửa `v2` tối thiểu như các spec hiện viết. Ghi ngoại lệ *bất biến* trong README `v2`. Chấp nhận `seed check` lệch trên
    VPS tới CP-4. Ít việc nhất; quy tắc bất biến bị phá có ghi chú.
  - **B.** Ở #11, đánh dấu `v2` *retired*: CLI từ chối `v2`, test seed tạm skip. Không sửa dữ liệu `v2`. Seed demo không chạy được
    tới khi có `v3` (#28), nên dev local mất dữ liệu mẫu vài ngày.
  - **C.** Đưa phần khung của #28 lên trước #11: `v3` = bản sao `v2` đã sửa, CLI mặc định `v3`. Các hạng mục sau chỉ sửa `v3`;
    phần kịch bản mới của #28 vẫn làm cuối. Giữ đúng tinh thần Q-02 B; thêm khoảng 2h trước CP-2.
- **Khuyến nghị: C.** Đúng quyết định `v3` của Owner, không phá bất biến `v2`, dev local vẫn có dữ liệu, và buộc viết spec #28
  sớm (đóng luôn R-17).
