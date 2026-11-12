# OVERNIGHT-DECISIONS — điểm tự chốt khi Owner vắng (chế độ chạy đêm, 13/11/2026)

> Owner ngủ tới sáng, không ai trả lời. Gặp câu hỏi, chỗ SPEC mâu thuẫn code hay luật thiếu, chat code tự chọn theo thứ tự căn cứ:
> QĐ (`QD-110-DRAFT`, `QD-111-DRAFT`, sổ QĐ Docs) → BRD 4.13 → `OWNER-REVIEW.md` → SPEC/PLAN → code hiện có → thông lệ thực tế.
> Ưu tiên: đúng QĐ/BRD; đơn giản nhất; dễ đổi lại (không xóa dữ liệu, không drop, không đổi contract khó lùi); an toàn nghiệp vụ
> (không tự cấp quyền, không tự thu hồi khi chưa chắc). **Không** tự chốt điều trái một QĐ đã có: khi phương án tốt nhất trái QĐ, làm
> theo QĐ hiện hành và ghi đề xuất đổi ở đây.
>
> Mỗi mục: `D-n · gói/task · câu hỏi · phương án (ưu/nhược) · ĐÃ CHỌN + lý do + căn cứ · file/commit chạm tới · cách đổi nếu Owner chọn khác`.
> Commit message của task có điểm tự chốt thêm "(tạm chốt D-n)". Task bị chặn thật ghi ở mục "Bị chặn" cuối file.

## Điểm tự chốt

### D-1 · X0 (X0.0, X0.7) · Có ghi nhãn tương thích rollback (`DATA_REPRESENTATIONS` + nhãn Docker) cho các giá trị enum mới không?
- **Phương án A:** thêm ngay nhãn cho hai nguyên nhân hủy `SYSTEM_BENEFICIARY_LEFT/TRANSFERRED` (và các enum của X0.0) vào `src/modules/installation/public/recovery-target.policy.ts` + nhãn Docker. Ưu: bản cũ không chạy nhầm lên dữ liệu mới. Nhược: đụng cơ chế cài đặt/rollback, cần sửa Dockerfile và spec đếm nhãn; cả đợt chưa có enum nào làm vậy.
- **Phương án B:** chưa thêm; ghi vào danh sách việc trước release. Ưu: không đụng cơ chế cài đặt; `ADD VALUE` vốn không hoàn tác (DB-05), đã ghi ở HANDOFF X0.0. Nhược: bản trước X0 lỗi khi đọc dòng mang giá trị mới.
- **ĐÃ CHỌN: B.** Lý do: rollback về bản trước đợt này đã không an toàn vì `ADD VALUE`; cơ chế nhãn chỉ có ý nghĩa nếu cả đợt dùng, nên làm một lần ở pha cuối (Z) cho mọi enum/giá trị mới. Căn cứ: DB-05 (`docs/rules/database-business.md`), tiền lệ chỉ QĐ-93 có nhãn. Chạm: không có file.
- **Đổi nếu Owner muốn A:** thêm khóa vào `DATA_REPRESENTATIONS` cho từng giá trị, sửa `recovery-target.policy.spec.ts` và nhãn Docker `io.github.baophipham.slm.data-reads`.

### D-2 · X0.7 · `PAID_OLD_DEPARTMENT` có hủy case B (đề xuất phần mềm chưa có trong danh mục, đã có giá) không?
- **A:** hủy cả case B còn mở của người chuyển. Ưu: khớp chữ "Request trả phí còn mở" của `QĐ-110o`, người chuyển không để lại việc ở phòng cũ. Nhược: lúc gửi case B chưa biết là trả phí hay `K5` miễn phí (R-43) nên có thể hủy oan Request miễn phí.
- **B:** chỉ hủy Request `PAID_IN_CATALOG` loại `GRANT`/`RENEWAL`/nhóm (hiện trạng). Case B và Request miễn phí chuyển bước nhu cầu sang trưởng phòng mới (`QĐ-110o` vế sau).
- **ĐÃ CHỌN: B.** Lý do: an toàn (không hủy khi chưa chắc có phí), đơn giản, dễ đổi; vế sau `QĐ-110o` đã dùng cho Request nội bộ chưa chắc trả phí. Căn cứ: `QĐ-110o`, R-43. Chạm: `requests/cancellation/beneficiary-gone-scope.policy.ts` (đã có).
- **Đổi sang A:** thêm loại case B (giá đã biết) vào phạm vi `PAID_OLD_DEPARTMENT` ở policy + test.

### D-3 · X0.7 · `ALL_OPEN` tính theo người thụ hưởng: Request do người nghỉ gửi hộ người khác thì sao?
- **A:** để nguyên (người thụ hưởng còn làm việc vẫn cần phần mềm; người gửi đã chặn nên không còn thao tác). Ưu: không mất nhu cầu thật. Nhược: Request không còn người gửi để rút/trả lời yêu cầu bổ sung.
- **B:** hủy cả Request do người nghỉ gửi hộ. Ưu: không treo. Nhược: hủy nhu cầu còn hiệu lực của người khác.
- **ĐÃ CHỌN: A.** Lý do: `QĐ-110d` nói "Request còn mở của **người nghỉ**" (người thụ hưởng); hủy nhu cầu của người khác là trái ý. Treo (nếu có) do SLA và cảnh báo nghẽn đã có xử lý. Chạm: không có file. Đề xuất cho Owner: thêm luật "người gửi nghỉ ⟹ chuyển quyền rút cho trưởng phòng".

### D-4 · X0.7 · "Hàng việc IT" của `QĐ-110d` khi Request có tác vụ cấp đang chạy
- **A:** chỉ thông báo inbox `REQUEST_BENEFICIARY_GONE_IT_CHECK` (hiện trạng). Nhược: mất dấu khi đã đọc.
- **B:** thêm cờ/hàng đợi riêng cho IT. Ưu: bền. Nhược: thêm bảng/route, chưa có luật mô tả hình dạng.
- **ĐÃ CHỌN: A**, kèm đường đóng tay cũ của IT Admin (`POST /access-requests/{id}/cancellation`) và cờ `NEEDS_IT_CHECK` ở kết quả. Lý do: Owner ghét phức tạp, chưa có luật cho hàng đợi mới. Căn cứ: `QĐ-110d`, nguyên tắc "một thứ một nguồn". Đề xuất cho Owner: nếu muốn bền thì thêm bộ lọc "Request của người đã rời còn mở" vào danh sách Request của IT.

### D-5 · X0.6d · CLI `record-super-admin-event` giữ bốn cờ `--basis-*` hay đổi sang một cờ?
- **ĐÃ CHỌN: giữ bốn cờ**, đổi thành một câu khi ghi sự kiện (`groundsNoteOfBasis`). Lý do: `--from-notice` cần bốn phần cho chính thông báo (thông báo giữ form cũ, `QĐ-110`); đổi một cờ buộc bỏ `--from-notice` hoặc đổi form thông báo (trái QĐ). Chạm: không có file (hiện trạng).
- **Đổi nếu Owner muốn một cờ:** thêm `--basis <text>` cho mọi mode trừ `--from-notice`, cập nhật `record-super-admin-event.arguments.ts` + spec.

### D-6 · X-H.1/X-H.3 · `RevocationContext.dueOn` / `noticeText` không còn ai đọc: bỏ hay giữ?
- **A:** bỏ hai trường (và cả `context` nếu chỉ còn `departmentId`) khỏi `OpenRevocationInput` và 3 nơi gọi (`offboarding-revocation`, `transfer-review-*`). Ưu: không còn mã chết. Nhược: đổi chữ ký facade, đụng code `transfer-review` sắp bị xóa ở MF3-A.1 và test pin `context` (`provisioning-revocation-read-contracts`).
- **B:** giữ nguyên hình. Ưu: không đổi facade, R2 C23 xếp việc này vào pha B.
- **ĐÃ CHỌN: B.** Lý do: dễ đổi lại, ít chạm, `transfer-review` còn tới MF3-A.1. Căn cứ: R2 C23 (pha B), SPEC §5 X-H ("bảng/cột giữ"). Chạm: không có file (chỉ HANDOFF X-H.1).
- **Đổi sang A:** sửa `licensing.types.ts` (`RevocationContext`), `revocation-recorder.service.ts`, 3 nơi gọi và test hook.

### D-7 · X-H.2 · `offboarding_cases.handover_due_on`: còn ghi cho hồ sơ có ngày cuối không?
- **A:** ngừng ghi (NULL). Nhược: CHECK `offboarding_cases_due_for_planned_only_check` + guard còn đòi cột này cho hồ sơ `WITH_LAST_DAY`; phải viết migration thay CHECK/guard (R4 trong R2).
- **B:** vẫn ghi `plannedDueOn` (ngày cuối trừ 1 ngày làm việc), bỏ khỏi API ở pha B.
- **ĐÃ CHỌN: B.** Lý do: không migration cấu trúc, không rủi ro trigger; R2 Q4 khuyến nghị "giữ cột chết". Căn cứ: R2 §4.2 A2/C21, SPEC §6 ("không drop ở đợt này"). Chạm: `personnel/offboarding/offboarding-handover.service.ts` (`plannedDueOn`), commit 8e6bc748. API `handoverDueOn` **trước đây** giữ giá trị thật; review X-H sửa: wire trả `null` (xem D-15).
- **Đổi sang A:** migration thay CHECK + guard `offboarding_cases`, bỏ `plannedDueOn`, bỏ khóa `handoverDueOn` ở DTO list/detail.

### D-8 · X-H.3 · Các khóa của bàn giao ở API đọc (`rights[].handover`, `assignment-expiry-queue[].handover`, `checklist.dataHandover`, `return-requests[].handover*`): bỏ khóa hay giữ giá trị cố định?
- **A:** bỏ khóa ngay. Ưu: gọn. Nhược: FE đang đóng hồ sơ cần checklist "đúng 4 bước" đều `DONE` (R2 K5-iv) và đọc `handover` ⟹ hỏng nếu bỏ trước FE.
- **B:** giữ khóa với giá trị cố định: `handover: null`, `dataHandover: { state: 'DONE', pendingDuties: 0 }`, phiếu trả mới `handover.required=false`; phiếu cũ vẫn hiện dữ liệu cột. Bỏ khóa ở pha B sau khi FE phát hành.
- **ĐÃ CHỌN: B.** Lý do: SPEC P3 ("khóa `handover` trả `null`, giữ hình"), R2 pha A/B và `QĐ-110g` không đòi bỏ khóa. Chạm: `offboarding.mapper.ts`, `expiry-queue.service.ts`, `offboarding.policy.ts`, DTO (chỉ đổi mô tả). Tài liệu API FE ghi "luôn null/DONE".
- **Đổi sang A:** xóa khóa ở 3 DTO + `toRight` + queue + policy; ghi changelog FE.

### D-9 · X-H.3 · Hai tham số `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS`, `HANDOVER_SHORT_DEADLINE_WORKING_DAYS`: bỏ định nghĩa không, và dòng `parameter_values` cũ thì sao?
- **ĐÃ CHỌN: bỏ cả hai khỏi `PARAMETER_DEFINITIONS`** (grep: không còn mã đọc, chỉ còn `HandoverCaseFacts` đã xóa); số tham số 33 → 31 ở test đếm; **không xóa** dòng `parameter_values` cũ: `list()` đi theo danh sách định nghĩa và `effectiveValues` bỏ qua khóa lạ nên dòng mồ côi vô hại, còn xóa dữ liệu là không hoàn tác. Căn cứ: PROMPT X-H, R2 C18. Chạm: `parameter-definitions.policy.ts` (+spec), `operating-parameters-http.integration-spec.ts`.
- **Đổi nếu Owner muốn dọn dòng cũ:** thêm migration `DELETE FROM parameter_values WHERE key IN (…)` ở pha B.

### D-10 · X-H.3 · Thẻ tác vụ thu hồi: thêm `plan.preRevocationNote` thôi, hay thêm cả `dataLossOnRemoval` như R2 A4?
- **ĐÃ CHỌN: chỉ `plan.preRevocationNote`** (chỉ đọc; `null` ở tác vụ cấp và gói không có lưu ý). Lý do: SPEC P14 (thắng báo cáo R2). `dataLossOnRemoval` đã có ở `/rights`, hàng đợi hết hạn; thêm cờ lên thẻ là một khóa thêm FE chưa yêu cầu. Chạm: `provisioning.dto.ts`, `provisioning-task-view.service.ts`. Một lần đọc `getPlanRevocationInfo` cho cả trang (số câu lệnh không đổi theo số tác vụ).
- **Thêm sau nếu FE cần:** thêm `dataLossOnRemoval: boolean` vào cùng object `plan`.

### D-11 · X-H.3 · `OperatorAuditActor` dời đi đâu ("types dùng chung")?
- **ĐÃ CHỌN: `licensing/public/licensing.types.ts`** (cạnh `SystemActor`), không tạo file mới. Lý do: `licensing/public/` đang 25 file, xóa 2 file `licensing-handover.*` còn 23; ba nơi dùng (`licensing-audit-event.mapper.ts`, 2 file `requests/reassignment/`) vốn đã import facade licensing. Chạm: commit X-H.3.

### D-12 · X-H.1…3 · Mã thông báo `HANDOVER_CONFIRMATION_*`, hành động audit `HANDOVER_DUTY.*` và `RETURN_REQUEST.HANDOVER_CONFIRMED` còn trong bảng đọc của inbox/audit?
- **ĐÃ CHỌN: giữ** ở `notifications.types.ts`, `inbox.policy.ts`, `status-rules-related.policy.ts` (đọc dòng cũ); chỉ bỏ nơi sinh (`handoverAlert` xóa). Lý do: dòng cũ trong DB vẫn phải hiển thị được, R2 C7 xếp bỏ mã vào pha B. Chạm: `licensing-alerts.policy.ts` (+spec).

### D-13 · X-H.3 · `test/support/handover-harness.ts` còn dùng cho 5 harness khác: xóa hay đổi tên?
- **ĐÃ CHỌN: bỏ phần duty, đổi tên thành `seat-revocation-harness.ts` (`SeatRevocationHarness`)**. Lý do: phần còn lại (`seatOf`, `describePlan`, `open`, `revoked`…) là của thu hồi ghế, không còn dính bàn giao. Test cần nói "không duty" đếm `handover_duties` qua `h.count(...)`. Cũng hạ trần `test/gates/lint-debt.gate-spec.ts` (complexity 49→48, max-lines 44→41, complexityAndLines 93→89) vì ESLint pruning bỏ 4 suppression của file đã xóa/gọn.

### D-14 · X-H.4 · Hủy duty đang mở bằng migration: lý do viết thế nào, có ghi Audit Trail không?
- **A:** `UPDATE … cancel_reason = 'RULE_CHANGED'` thuần SQL, không ghi `audit_events`. Ưu: đúng chữ SPEC §6, một câu lệnh, chạy lại an toàn (chỉ đụng dòng còn mở). Nhược: dòng hủy không có sự kiện `HANDOVER_DUTY.CANCELLED` kèm.
- **B:** thêm audit event mỗi dòng. Nhược: migration không có người/phiên để nêu làm tác nhân, cột `created_by_app_user_id` đã là NOT NULL của dòng cũ; lịch sử `HANDOVER_DUTY.*` cũ vẫn còn đủ.
- **ĐÃ CHỌN: A.** Lý do: đơn giản, đúng SPEC; `cancel_reason` là TEXT tự do (không enum nên không cần migration `_values`). Có khối `DO $$ … RAISE` đếm mở trước/hủy/mở sau và dừng chỉ khi **còn dòng mở sau** UPDATE; `LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` đầu khối để bản app cũ không mở thêm duty giữa lúc đếm và UPDATE (sửa theo review X-H, trước đó so thêm `cancelled <> open_before`). Chạm: `prisma/migrations/20261113000500_handover_duties_cancel_open/migration.sql`, test `licensing/handover-removed.integration-spec.ts`. Owner đếm lại `SELECT count(*) FROM handover_duties WHERE confirmed_at IS NULL AND cancelled_at IS NULL` trước deploy (cần 0 sau migration).
- **Đổi sang B:** thêm vào migration một `INSERT INTO audit_events` cho từng dòng với `actor_kind = 'SYSTEM'`.

### D-15 · X-H review (Required) · `handoverDueOn` trên wire của hồ sơ nghỉ việc còn lộ ngày thật
- **A:** giữ ngày thật trên wire (D-7 như ban đầu). Nhược: trái SPEC S6 và `QĐ-110g` ("không hạn bàn giao"): FE thấy một hạn không ai xác nhận.
- **B:** wire trả `null`, giữ khóa (như D-8), cột `handover_due_on` vẫn được ghi cho CHECK/guard (D-7 giữ phần này).
- **ĐÃ CHỌN: B.** Lý do: `QĐ-110g`, SPEC S6; giữ khóa để FE chưa gãy. Chạm: `offboarding.mapper.ts` (`toSummary` luôn `null`), `OffboardingSummaryRecord` và `offboarding-list.repo.ts` không đọc cột nữa, mô tả DTO; test `offboarding-record`, `offboarding-change` khẳng định `null` ở wire **và** cột vẫn có ngày (`caseRow`). `HandingOverCase.handoverDueOn` (facade `personnel`, không lên wire, không ai đọc) giữ tới pha B.
- **Đổi lại A:** trả `record.handoverDueOn` ở mapper và đọc lại cột ở `offboarding-list.repo.ts`.

## Bị chặn

(chưa có)

## Dừng ở đâu

(chưa dừng)

## Tóm tắt cho Owner

(viết khi xong hết hoặc khi dừng)
