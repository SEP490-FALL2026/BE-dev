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

## Pha cuối chung (full test, seed, review)

| Bước | Lệnh / việc | Kết quả thật | Ghi chú |
| ---- | ----------- | ------------ | ------- |
|      |             |              |         |
