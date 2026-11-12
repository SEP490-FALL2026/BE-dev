# HANDOFF-CODE — MF-2, MF-3 và các thay đổi đi kèm

> Chat code ghi **một dòng mỗi task** sau khi commit ([PLAN v2.3](PLAN.md) §0). Ghi lệnh và kết quả **thật** (số test xanh/đỏ), không ghi
> "chắc xanh". Lệch SPEC, câu hỏi cho Owner, số đếm SQL trước/sau migration (SPEC §6) và lựa chọn kỹ thuật PLAN yêu cầu ghi lý do (vd MF2-G
> sweeper hay listener) ghi ở cột tương ứng. Không ghi giờ.
>
> Nhánh `feat/mf2-mf3`; SPEC [v2.3](SPEC.md); pin Docs: `Docs main @ 373bb6b (QĐ-110 + QĐ-111 synced 13/11/2026)`. Gate cuối mỗi gói
> (`pnpm test:gates` + `pnpm rules:check`, S-5) ghi một dòng `<gói>-G`. Enum `ADD VALUE` (X0.0) ghi "không hoàn tác". Số tác vụ/notice/duty
> mở trỏ tới dòng `SERVICE` (X-SA.1b) ghi ở bảng đếm.

## Số đếm trước khi code (SPEC §6)

| Câu SQL / mục | Kết quả | Ngày |
| ------------- | ------- | ---- |
| Điều kiện chạy SPEC §6 (11 câu đếm) | **Chưa đếm được trên DB seed v4**: DB dev local `software_license_management` có schema (170 migration) nhưng `employees` = 0, không có dataset; `seed:local` bị cấm ở prompt 2. Migration dữ liệu có khối `DO $$ … RAISE` đếm trước/sau (X-SA.1b, MF2-D.1, MF3-B.2); Owner đếm lại trên DB seed trước khi merge (gói Z). | 12/11/2026 |

## Log task

| Task | Commit | Việc đã làm | Lệnh quick check + kết quả thật | Lệch SPEC / câu hỏi |
| ---- | ------ | ----------- | ------------------------------- | ------------------- |
| X0.0 | b91df6b6 | Migration `20261113000000_mf23_values`: `RevocationSource.TRANSFER`, `CommitmentReleaseReason.TRANSFER_EFFECTIVE`, `AssignmentSource.MACHINE_ACCOUNT_CONVERSION`, 5 giá trị `OffboardingChangeKind`; union TS/zod tương ứng. **ADD VALUE không hoàn tác** (DB-05): bản trước migration này lỗi trên dòng chứa giá trị mới. | `prisma:validate` OK; `prisma:generate`; `typecheck` sạch; `eslint` file đổi sạch; `test:gates` 16 suite / 331 test xanh | Tách enum: chỉ giá trị đã biết cần ở đầu đợt. `AccessRequestCancelCause` (bỏ phạm vi, X-SA.1b) và các giá trị khác sẽ có migration `_values` riêng ngay trước migration dùng chúng (đúng quy ước SPEC §6, không dồn một lần). |
| X0.1 | d0be109a | `nthWorkingDayFrom(start, n, nonWorkingDates)` trong `src/core/working-days.ts`: ngày bắt đầu là ngày 1, không phải ngày làm việc thì ngày làm việc kế tiếp là ngày 1. | Test đỏ trước (7 ca fail) rồi xanh: `jest working-days.spec` 34/34; typecheck, eslint sạch | — |
| X0.2 | 7550ae05 | Ba tham số nhóm `PERSONNEL`: `DEPARTURE_REVOCATION_WORKING_DAYS`=1, `TRANSFER_GRACE_WORKING_DAYS`=5, `TRANSFER_GRACE_REMINDER_WORKING_DAYS`=2. | Spec đỏ trước (3 ca) rồi `jest operating-parameters` 37/37; integration `operating-parameters-http` 27/27 (số tham số 30→33); eslint sạch | `TRANSFER_REVIEW_WORKING_DAYS` **còn định nghĩa** tới MF3-A.1 (mã `transfer-review` còn đọc); gỡ cùng task đó. |
| X0.3 | f5fbfb8f | Cột `provisioning_tasks.created_by_system`, `created_by_app_user_id` nullable + CHECK `provisioning_tasks_creator_check` (đúng một người tạo); `SystemActor` + `isSystemActor` ở `licensing.types`; `LicensingApi.openRevocation` nhận `AuthenticatedPrincipal | SystemActor` (audit actor `SYSTEM`, không tự-thực-hiện); sự kiện `OPENED` có `actor: … | null`, listener bàn giao bỏ qua khi `null`. | Test đỏ trước rồi `provisioning-revocation-open` + `provisioning-task-constraints` 40/40 (DB docker 35432, maxWorkers 2); typecheck, eslint, `test:gates` 331/331 | Số nguồn thu hồi 13→14 nên sửa 2 tiêu đề/assert của test cũ. Độ phức tạp `record` vượt 12 → tách `tellSelfExecuted`. |
| X0.4 | 26c755ac | 13 mã thông báo mới + khóa tham số trong `PARAM_KEYS_BY_CODE` (chỉ id/ngày/đếm, không con số tiền). | Spec đỏ trước (26 ca) rồi `jest src/modules/notifications` 85/85; typecheck, eslint sạch | Khóa tham số do tôi định (SPEC chỉ nêu mã); task gửi thông báo nào cần khóa khác thì sửa bảng ở task đó. |
| X0.4-fix | c42a4a8a | Tách 13 ca thông báo MF-2/MF-3 khỏi `inbox.policy.spec.ts` (vượt trần 400 dòng của gate `module-layout`) sang `inbox-mf23.policy.spec.ts`. | `jest src/modules/notifications` 85/85; `test:gates` 331/331 | Lỗi của tôi ở X0.4: chưa chạy `test:gates` ngay task đó. |
| X0.5 | d54a1a21 | Migration `20261113000200_personnel_grounds_note`: 5 bảng (`offboarding_cases`, `department_transfers`, `department_transfer_changes`, `employee_leaves`, `employee_leave_changes`) — `grounds_type/issuer/issued_on` nullable, CHECK mới (hộp `grounds_reference` bắt buộc; ba phần kia cùng NULL hoặc đủ), `employee_leave_changes_kind_check` đòi `grounds_reference`. `groundsNoteBodySchema` (1–500), `groundsNoteRefusal`, `normalizedGroundsNote`, kiểu `RecordedGrounds` + `recordedGroundsOf`; schema wire `grounds` nullable từng phần. | Test đỏ trước (policy 0 test chạy được; integration 4/4 đỏ) rồi `jest src/modules/personnel` 352/352; integration `personnel-grounds-note` 4/4 + `long-leave-integrity`, `offboarding-grounds-and-reasons`, `personnel-grounds-date` xanh (41 test); typecheck, eslint, `test:gates` 331/331 | CHECK có NULL thì **qua**: test bắt được lỗ hổng ở bản đầu (type NULL + issuer có giá trị), đã viết `IS NOT NULL` từng phần. Route chưa nhận `groundsNote` — làm ở X0.6a–d. |

## Pha cuối chung (full test, seed, review)

| Bước | Lệnh / việc | Kết quả thật | Ghi chú |
| ---- | ----------- | ------------ | ------- |
|      |             |              |         |
