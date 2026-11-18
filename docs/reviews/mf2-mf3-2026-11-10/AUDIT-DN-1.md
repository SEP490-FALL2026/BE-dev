# AUDIT-DN-1: rà nghiệp vụ D-1 → D-55 của `OVERNIGHT-DECISIONS.md`

> Reviewer chỉ đọc, ngày 13/11/2026, trên nhánh `feat/mf2-mf3` (HEAD `0de15400`). Không sửa code/test, không chạy pnpm/jest/docker, không đổi git.
> Thứ tự căn cứ: sổ QĐ (`Docs/Decisions/project-decisions.md`, `QD-110-DRAFT`, `QD-111-DRAFT`) → BRD 4.13 → `OWNER-REVIEW` → SPEC v2.3/PLAN v2.4
> → code → thông lệ.
> Skill đã dùng: `agent-skills:code-review-and-quality` (cách rà, phân mức), `superpowers:verification-before-completion` (mỗi kết luận có
> trích nguồn hoặc grep code).

**Tổng:** OK 43 · THIẾT-KẾ 10 · SAI-QĐ 2 · CODE-LỆCH 0.

## Bảng

| D-n  | Gói            | Phân loại | Nhận xét                                                                                                                                                             | Nguồn                                                       |
| ---- | -------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| D-1  | X0             | THIẾT-KẾ  | Hoãn nhãn tương thích rollback cho enum mới sang gói Z. Không trái luật, nhưng phải có trong checklist Z.                                                            | DB-05; không có QĐ                                          |
| D-2  | X0.7           | SAI-QĐ    | `PAID_OLD_DEPARTMENT` bỏ sót case B đã định giá và có bước chi. Case B là Request cấp mới (`QĐ-111a`); khi có chi phí, nó là Request trả phí của phòng cũ.          | `QĐ-110o`, `QĐ-90b`, BRD `BR-MF3-03`, QT C-17               |
| D-3  | X0.7           | OK        | `ALL_OPEN` xét theo người thụ hưởng, đúng chữ "Request còn mở **của người nghỉ**".                                                                                   | `QĐ-110d`, `QĐ-77f`                                         |
| D-4  | X0.7           | THIẾT-KẾ  | "Hàng việc IT" hiện là inbox, cờ `NEEDS_IT_CHECK` và Request còn ở `EXECUTING`/`AWAITING_IT_CLOSE`. QĐ không tả hình dạng hàng việc.                                 | `QĐ-110d`                                                   |
| D-5  | X0.6d          | SAI-QĐ    | Các mode ghi thẳng của CLI BM-09 vẫn bắt bốn cờ `--basis-*` (loại thuộc danh sách đóng). Luật đã đổi thành căn cứ một ô chữ. Phần lưu đúng; đầu vào sai.             | `QĐ-110a`, `QĐ-111bd`                                       |
| D-6  | X-H            | OK        | Giữ `RevocationContext.dueOn/noticeText` tới pha B. Bảng/cột được giữ ở đợt này.                                                                                     | SPEC §5 X-H, R2 C23                                         |
| D-7  | X-H.2          | OK        | Vẫn ghi cột `handover_due_on` để qua CHECK; wire đã trả `null` (D-15).                                                                                               | SPEC §6 (không drop), `QĐ-110g`                             |
| D-8  | X-H.3          | OK        | Giữ khóa với giá trị cố định. Đã kiểm `offboarding.policy.ts:424` (`dataHandover DONE/0`).                                                                           | SPEC P3 ("giữ hình")                                        |
| D-9  | X-H.3          | OK        | Bỏ hai định nghĩa tham số, giữ dòng cũ. Grep `src` không còn tên tham số.                                                                                            | `QĐ-110g`                                                   |
| D-10 | X-H.3          | OK        | Chỉ thêm `plan.preRevocationNote` (`provisioning.dto.ts:201`), đúng P14.                                                                                             | SPEC P14                                                    |
| D-11 | X-H.3          | OK        | Dời type vào `licensing.types.ts`; là việc tổ chức code.                                                                                                             | SPEC §5 X-H, MAJ-3                                          |
| D-12 | X-H            | OK        | Giữ mã đọc để dòng cũ còn hiển thị; chỉ xóa nơi sinh mã.                                                                                                             | `QĐ-110g`, R2 C7                                            |
| D-13 | X-H.3          | OK        | Đổi tên harness thành `test/support/seat-revocation-harness.ts` (đã thấy file).                                                                                       | —                                                           |
| D-14 | X-H.4          | OK        | Hủy duty đang mở bằng `UPDATE`, không ghi audit từng dòng, có khóa bảng. Đúng chữ SPEC.                                                                             | SPEC §5 X-H ("`UPDATE` đóng duty đang mở")                  |
| D-15 | X-H review     | OK        | Wire trả `handoverDueOn: null` (`offboarding.mapper.ts:53`).                                                                                                         | `QĐ-110g`, SPEC S6                                          |
| D-16 | X-H review     | OK        | Mọi phiếu trả có `required=false`, `dueOn=null` (`return-request-query.service.ts:115`).                                                                             | `QĐ-110g`                                                   |
| D-17 | X-SA.1         | THIẾT-KẾ  | Người nhận seat máy khớp QĐ. Riêng việc giữ dòng khi người chịu trách nhiệm cũ còn hồ sơ nhân sự mở thì QĐ không đòi, và sinh dòng `SERVICE` mồ côi.                 | `QĐ-110m`, QD-110-DRAFT §G3 (người nhận)                    |
| D-18 | X-SA.1b        | OK        | Chỉ hủy Request trước khi cấp, giải phóng cam kết; xóa bản nháp loại đã bỏ.                                                                                          | `QĐ-110m`, QD-110 §G3                                       |
| D-19 | X-SA.2         | THIẾT-KẾ  | Tắt cờ không cần người giữ là IT Admin; bất kỳ IT Admin nào cũng bật được, không giới hạn theo phòng.                                                                | SPEC P13 (chỉ nói "bật"), `QĐ-58b`                          |
| D-20 | X-SA.3/4       | OK        | Xóa route/capability, giữ nhánh đọc lịch sử.                                                                                                                         | QD-110 §G3 ("route cũ … xóa luôn"), SPEC P12                |
| D-21 | X-SA.5         | OK        | Cổng ghost seat đọc cờ (`usage-gates.policy.ts:66`, `internal-rules.policy.ts:170`); import `kind=service` báo lỗi dòng.                                              | `QĐ-110m` (điều kiện 2 `FR-4.9` thành cờ), R-9              |
| D-22 | X-SA review    | OK        | Seat nối tiếp mang theo cờ; hai trường bắt buộc ở `NewAssignment`.                                                                                                   | R-9, INV-02                                                 |
| D-23 | X-SA review    | OK        | `ops:preflight` có mục thông tin, không chặn deploy; có hướng dẫn chạy lại.                                                                                          | —                                                           |
| D-24 | X-SA review    | OK        | "Mở" xét theo `validUntil <= today` (`machine-account.policy.ts:37`).                                                                                                | INV-01/02                                                   |
| D-25 | X-SA review    | OK        | Định nghĩa duty mở trùng app cũ và chỉ mục.                                                                                                                          | —                                                           |
| D-26 | X-SA review    | OK        | Kiểm trước theo đúng phép đếm của trigger rồi giữ dòng, không làm hỏng cả migration.                                                                                 | INV-01                                                      |
| D-27 | MF2-A.1        | OK        | Mở rộng enum trước, chưa thu hẹp; grep `src` không còn hai tên cờ.                                                                                                   | SPEC MF2-A, §6; `QĐ-93c`                                    |
| D-28 | MF2-A.1        | OK        | Bỏ `abrupt`; gỡ `device-binding` (grep = 0); không drop `self_executed`.                                                                                             | SPEC S11, QD-110 §H                                         |
| D-29 | MF2-A review   | OK        | Hoãn đồng bộ roadmap cho gói Z.                                                                                                                                      | PLAN §2 #19                                                 |
| D-30 | MF2-B.1        | OK        | Một mã `PERSONNEL.SUCCESSOR_REQUIRED`. Phía điều chuyển đã lật sau đó (`transfer.policy.ts:57-58` gọi `successorRequiredRefusal`).                                    | `QĐ-110h`, `QĐ-110n`, SPEC P1                               |
| D-31 | MF2-B.2        | THIẾT-KẾ  | Giữ `accessBlockMode` thay vì `blockNow` của SPEC; CLI vẫn bắt `--last-working-day` (= hôm nay). Luật nghiệp vụ đúng `QĐ-110b`.                                     | SPEC P1, `QĐ-110a/b`                                        |
| D-32 | MF2-B.3        | OK        | Service tác động thuần, chạy khô thật. `responsibilities` đã được X-IT điền (`departure-impact.service.ts:36-52`).                                                   | SPEC MF2-B, P23                                             |
| D-33 | MF2-B review   | OK        | Chỉ chặn `claim` tác vụ `QUEUED` (`provisioning.service.ts:91`); tác vụ đang làm vẫn cho IT đối chiếu.                                                                | `QĐ-110d`                                                   |
| D-34 | MF2-B review   | OK        | Năm việc nhỏ (khóa `FOR SHARE`, đổi tên `reason`, thứ tự kiểm, help CLI, test seed).                                                                                 | —                                                           |
| D-35 | MF2-B review   | THIẾT-KẾ  | Giữ `OVERLAP` bằng cách khôi phục thứ tự tạo ràng buộc. Cách này đúng hợp đồng nhưng dựa vào thứ tự OID, dễ vỡ.                                                     | hợp đồng route cấp                                          |
| D-36 | MF2-B ghi chú  | THIẾT-KẾ  | Đề xuất sửa SPEC là đúng. Còn mở: `commitmentToRelease` của bản xem trước không tính tiền dòng nhóm nên báo thấp hơn thực.                                           | SPEC P23, S14                                               |
| D-37 | MF2-C.1        | OK        | Giữ 409 `OFFBOARDING_CASE.CASE_LEFT`. R-41 chỉ đòi "không cho"; mã của SPEC sai tiền tố.                                                                             | R-41, `US-03-04` AC-15                                      |
| D-38 | MF2-C.1        | OK        | Migration `_values` riêng, forward-only. Phần nhãn rollback gộp với D-1.                                                                                             | quy tắc DB-05                                               |
| D-39 | MF2-C.1        | OK        | "Sau ngày cuối" đo bằng `IN_FORCE` (`offboarding-change.policy.ts:36-38`); đăng ký thiết bị kết thúc qua `onCancelled` (`device-registration.listener.ts:32-38`).      | SPEC S3, `QĐ-100q`                                          |
| D-40 | MF2-C.1        | OK        | Mã thông báo mới báo IT đóng tác vụ đang làm; response có đếm.                                                                                                       | SPEC S3 ("đang làm báo IT đóng")                            |
| D-41 | MF2-D.1        | THIẾT-KẾ  | Ghi hạn ngay lúc ghi hồ sơ cho cả hai chế độ, khác chữ SPEC ("ghi lúc chặn"). Công thức đúng bảng T-MF2.                                                             | `QĐ-110c`, SPEC MF2-D                                       |
| D-42 | MF2-D.2        | OK        | Đơn vị là hồ sơ; IT phụ trách + Super Admin; mỗi ngày làm việc. Ghi chú: ghế `K3` (không có tác vụ thu hồi) sẽ bị nhắc mãi tới khi ghế hết hiệu lực.                  | `QĐ-110c`, SPEC MF2-D                                       |
| D-43 | MF2-D.3        | OK        | Lọc `revocationOverdue` cắt trang theo id; `?overdue=` theo `due_on`.                                                                                                | SPEC P3, MF2-D                                              |
| D-44 | MF2-C review   | OK        | Thêm khóa `alreadyDone` (`offboarding-cancel-writer.service.ts:97,134`).                                                                                             | —                                                           |
| D-45 | MF2-C review   | OK        | Bỏ chính người nghỉ khỏi người nhận (`personnel-notifier.service.ts:158-168`).                                                                                       | —                                                           |
| D-46 | MF2-C ghi chú  | OK        | Chỉ đề xuất sửa SPEC/PLAN.                                                                                                                                           | —                                                           |
| D-47 | MF2-E.1        | OK        | Hạn đã ghi không bị đè (`block-moment.repo.ts:147-148`, `where revocationDueOn: null`).                                                                              | `QĐ-110c`                                                   |
| D-48 | MF2-E.1        | OK        | Không backfill `block_announced_at`; lượt đầu tự hủy Request của hồ sơ mở. Đúng bất biến của `QĐ-110d`.                                                              | `QĐ-110d`, SPEC MF2-E                                       |
| D-49 | MF2-E.1        | OK        | Gọi thẳng `DevicesApi`; có cả dòng nhật ký **và** audit `OFFBOARDING_CASE.ACCESS_BLOCKED` (`block-moment-effects.service.ts:56-67`).                                 | SPEC MF2-E                                                  |
| D-50 | MF2-E.2        | THIẾT-KẾ  | `ACCOUNT_LOCK_OVERDUE`: người nhận IT + Super Admin, một lần mỗi hồ sơ. SPEC không nói. D-68 đã thêm cột `account_lock_overdue_at`.                                   | SPEC MF2-E, R-1                                             |
| D-51 | MF2-D review   | OK        | Một định nghĩa SQL cho `rightsWithoutCompletedTask`.                                                                                                                 | —                                                           |
| D-52 | MF2-D review   | OK        | Chỉ mục một phần, có đo `EXPLAIN` (D-70 sửa vị từ sau).                                                                                                              | —                                                           |
| D-53 | MF2-D review   | OK        | Sửa chữ mô tả `dueOn` theo tham số N.                                                                                                                                | `QĐ-110c`                                                   |
| D-54 | K1-CL.1        | OK        | Biến thể suy từ mọi lý do còn đứng (`provisioning-k1-checklist.policy.ts:92-94`); người nghỉ luôn có đặt lại/khóa hộp thư.                                            | R-35, `QĐ-111az`, SPEC P25                                  |
| D-55 | K1-CL.1        | THIẾT-KẾ  | Thứ tự mục đúng `QĐ-111az`; `STILL_EMPLOYED` chỉ có hai mục (R-35). Còn mở: thứ tự `doneAt` xét không giảm thay vì tăng ngặt.                                        | `QĐ-111az`, R-35, SPEC P25                                  |

## Chi tiết SAI-QĐ

### D-2: `PAID_OLD_DEPARTMENT` bỏ sót case B đã định giá (mức Trung bình)

- **Căn cứ:**
  - `QĐ-110o`: "Request trả phí còn mở ở phòng cũ ⟹ **hệ thống tự hủy** … hoặc vào hàng việc IT (đang có tác vụ cấp); bước nhu cầu của
    Request **nội bộ** đang chờ ⟹ trưởng phòng mới".
  - `QĐ-90b`: "Request phần mềm trả phí giữ phòng lúc gửi, không chuyển bước nhu cầu sang trưởng phòng mới … ở ngày hiệu lực hệ thống tự
    hủy".
  - BRD `BR-MF3-03`: "Request trả phí còn mở ở phòng cũ ⟹ hệ thống tự hủy".
  - QT C-17 / `QĐ-111a`: "Case A/B là hai nhánh của Request cấp mới".
- **Vì sao sai:** sau khi IT đánh giá và có chi phí, case B giữ `branch = 'NEW_SOFTWARE'` và đi qua `AWAITING_SPEND_SUBMISSION` →
  `AWAITING_SPEND_DECISION` → `AWAITING_EXECUTION` → `EXECUTING` (`requests/assessment/assessment.policy.ts:122-131`). Cam kết của nó đứng ở
  Cost Center phòng cũ, tức là một Request trả phí của phòng cũ. Code chỉ nhận `PAID_IN_CATALOG`:
  - `src/modules/requests/cancellation/beneficiary-gone-scope.policy.ts:16`: `PAID_KINDS`;
  - `src/modules/requests/cancellation/beneficiary-gone-scope.policy.ts:40-48`: `inScope` đòi `request.branch === 'PAID_IN_CATALOG'`.

  Vì vậy case B đã định giá vẫn đi tiếp ở phòng cũ: phòng cũ duyệt chi và trả tiền cho phần mềm người đã chuyển sẽ dùng ở phòng mới. Lý do
  D-2 đưa ra ("lúc gửi chưa biết trả phí hay `K5`", R-43) chỉ đúng với case B **chưa định giá**.
- **Nhận xét thêm:** SPEC §5 MF3-B tự thu phạm vi về "`GRANT`, `RENEWAL`; cá nhân hoặc dòng nhóm". SPEC hẹp hơn QĐ nên cũng cần sửa.
- **Cách sửa:**
  - Trong `inScope` (nhánh `PAID_OLD_DEPARTMENT`), nhận thêm `request.branch === 'NEW_SOFTWARE'` khi Request đã qua định giá có chi phí, tức
    `state ∈ { AWAITING_SPEND_SUBMISSION, AWAITING_SPEND_DECISION, AWAITING_EXECUTION, EXECUTING, AWAITING_IT_CLOSE }`. Hai trạng thái cuối
    vẫn ra `NEEDS_IT_CHECK` qua `hasLiveTask`/`AWAITING_IT_CLOSE` như cũ. Vẫn so `departmentId === scope.oldDepartmentId`.
  - Case B còn ở `NEED`/`IT_ASSESSMENT` (chưa định giá) để nguyên. Chuyển bước nhu cầu của nó sang trưởng phòng mới hay không là câu hỏi cho
    Owner, nằm ngoài `QĐ-110o`.
  - Kiểm `DepartureCancellationService` giải phóng đúng cam kết của Request `NEW_SOFTWARE`. Cam kết sinh lúc trình chi, cùng bảng
    `budget_commitments` nên dự kiến không cần đổi.
  - Sửa SPEC §5 MF3-B và chú thích đầu file policy (dòng 7-11, đang ghi "a proposal of new software are not touched").
- **Test nên thêm:**
  - `beneficiary-gone-scope.policy.spec.ts`: bảng `PAID_OLD_DEPARTMENT × NEW_SOFTWARE × state`.
    - `NEED`, `IT_ASSESSMENT` ⟹ `SKIP`.
    - `AWAITING_SPEND_SUBMISSION`, `AWAITING_SPEND_DECISION`, `AWAITING_EXECUTION` ⟹ `CANCEL`.
    - `EXECUTING`, `AWAITING_IT_CLOSE` ⟹ `NEEDS_IT_CHECK`.
    - Phòng khác ⟹ `SKIP`.
  - `test/integration/requests/beneficiary-transferred-closure.integration-spec.ts`: case B đã định giá ở `AWAITING_SPEND_DECISION` của phòng
    cũ. Tới ngày hiệu lực, Request thành `CANCELLED`, cause `SYSTEM_BENEFICIARY_TRANSFERRED`, cam kết `RELEASED`; case B ở `NEED` không đổi.
  - Mutation: xóa vế `NEW_SOFTWARE` thì hai ca trên đỏ.

### D-5: CLI `record-super-admin-event` bắt căn cứ bốn phần (mức Thấp)

- **Căn cứ:**
  - `QĐ-110a`: "Ghi nghỉ việc chỉ gồm: … **căn cứ = một ô chữ bắt buộc** … Đổi ngày cuối/hủy nghỉ việc và ghi điều chuyển dùng cùng ô căn cứ
    một trường"; QĐ này sửa `QĐ-77a`, `QĐ-87b` (căn cứ nhiều trường).
  - `QĐ-111bd`: "Căn cứ **mọi** sự kiện nhân sự … là **một ô chữ bắt buộc**".
  - PLAN X0.6d cho phép riêng _notice_ giữ form cũ.
- **Vì sao sai:** phần lưu đã đúng: `groundsNoteOfBasis` ghép bốn phần thành một câu (`personnel/personnel-grounds.policy.ts:113-121`).
  Nhưng mọi mode của CLI vẫn bắt nhập bốn phần, kể cả mode ghi thẳng (không `--from-notice`), và `--basis-type` phải thuộc danh sách đóng
  `GROUNDS_TYPES`. Đó chính là căn cứ nhiều trường mà QĐ đã bỏ. Chỗ sai:
  - `src/cli/record-super-admin-event/record-super-admin-event.arguments.ts:70` (help, "Required for every mode");
  - `src/cli/record-super-admin-event/record-super-admin-event.arguments.ts:85-88`, `:124-127` (khai báo cờ);
  - `src/cli/record-super-admin-event/record-super-admin-event.arguments.ts:248-264` (`contextOf`, `basisType`).

  Lý do của D-5 ("đổi một cờ buộc bỏ `--from-notice`") không đứng: chính phương án "Đổi" của D-5 giữ được `--from-notice`.
- **Cách sửa:**
  - Thêm `--basis <text>` (1…`GROUNDS_NOTE_MAX_LENGTH` ký tự sau khi cắt), bắt buộc cho các mode ghi thẳng, ghi thẳng vào `groundsNote`.
  - Chỉ bắt bốn cờ `--basis-*` khi có `--from-notice` (để đối chiếu với notice giữ form cũ).
  - Mode ghi thẳng mà gửi `--basis-*` ⟹ lỗi tham số.
  - Cập nhật `SUPER_ADMIN_EVENT_USAGE`.
- **Test nên thêm:**
  - Spec của `record-super-admin-event.arguments`:
    - mode `departure-record` chỉ với `--basis "QĐ nghỉ việc số 12/2026"` ⟹ parse được, `groundsNote` đúng nguyên văn;
    - thiếu `--basis` ⟹ `SuperAdminEventArgumentError`;
    - `--basis-type` khi không có `--from-notice` ⟹ lỗi;
    - `--from-notice` vẫn đòi đủ bốn cờ.
  - Integration CLI hiện có: đổi các ca ghi thẳng sang `--basis`.
  - Mutation: cho `--basis` thành tùy chọn thì ca "thiếu" đỏ.

## CODE-LỆCH

Không có. Đã đối chiếu code với chữ của D-8, D-10, D-15, D-16, D-21, D-24, D-30, D-32, D-33, D-39, D-44, D-45, D-47, D-49, D-50, D-54, D-55
(grep/đọc file nêu ở bảng). Mỗi chỗ code làm đúng như D-n mô tả.

## Phương án cho THIẾT-KẾ

| D-n  | A (khuyến nghị)                                                                                                                                                                                                                                                                      | B                                                                                                                                                                  | Sonnet chọn                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| D-1  | Hoãn sang gói Z, nhưng ghi thành một dòng bắt buộc của checklist Z, liệt kê đủ giá trị enum mới của đợt (X0.0, `SYSTEM_BENEFICIARY_*`, `SYSTEM_SCOPE_REMOVED`, `DEPARTURE_BLOCKED`, …).                                                                                              | Thêm nhãn `DATA_REPRESENTATIONS` ngay ở từng migration `_values`.                                                                                                 | A (hoãn); cần kiểm Z có dòng này                                            |
| D-4  | Giữ inbox và `NEEDS_IT_CHECK`, thêm bộ lọc "người thụ hưởng đã rời" vào danh sách Request của IT. Chỉ là bộ lọc đọc, giúp không mất dấu sau khi đọc thông báo.                                                                                                                       | Chỉ inbox, như hiện tại.                                                                                                                                           | B                                                                           |
| D-17 | Không giữ dòng chỉ vì người chịu trách nhiệm cũ còn hồ sơ nhân sự mở (`QĐ-110m`: "nghỉ việc/điều chuyển của người khác không đụng tới"). Nếu chính người đó là IT Admin đang rời thì chọn IT Admin phụ trách phòng, rồi tới IT dùng được đầu tiên. Ít dòng `SERVICE` mồ côi hơn. | Giữ dòng, Owner chạy lại migration bằng `psql` sau khi hồ sơ đóng (preflight D-23 báo).                                                                           | B                                                                           |
| D-19 | Giữ: tắt cờ không cần người giữ là IT Admin; bật cờ cần IT Admin dùng được.                                                                                                                                                                                                        | Chỉ IT Admin phụ trách phòng của seat (`owning_department_id`) được bật/tắt (`QĐ-58b`).                                                                           | A                                                                           |
| D-31 | Giữ `accessBlockMode` trên wire; sửa SPEC P1 theo D-36. CLI cho bỏ trống `--last-working-day` khi `abrupt-departure-record` (= hôm nay) cho khớp chữ "bỏ trống khi chặn ngay" của `QĐ-110a`.                                                                                     | Đổi wire sang `blockNow` boolean như SPEC, kèm changelog FE.                                                                                                       | Giữ wire; CLI vẫn bắt nhập ngày                                             |
| D-35 | Phân loại lỗi trên đường lỗi: khi gặp `identifier_no_overlap`, đọc thêm một câu để biết chính người đó đã có seat cùng thuê bao thì trả `OVERLAP`. Chỉ tốn truy vấn khi lỗi và không phụ thuộc thứ tự OID.                                                                          | Khôi phục thứ tự tạo ràng buộc trong migration, ghim bằng test DB.                                                                                                | B                                                                           |
| D-36 | Bản xem trước cộng cả phần cam kết của dòng nhóm (đọc qua facade nhóm) để `commitmentToRelease` bằng số thật sẽ giải phóng.                                                                                                                                                         | Giữ số thấp hơn thực, FE dựa `line: true` để ghi chú.                                                                                                              | B                                                                           |
| D-41 | Ghi hạn lúc ghi hồ sơ và tính lại khi đổi ngày cuối. Hồ sơ mở luôn có hạn, FE/job chỉ so `< hôm nay`. Đề nghị sửa chữ SPEC MF2-D cho khớp.                                                                                                                                       | Theo chữ SPEC: chỉ ghi lúc sweeper chặn (với chặn ngay thì ghi lúc ghi hồ sơ).                                                                                    | A                                                                           |
| D-50 | `ACCOUNT_LOCK_OVERDUE` tới IT + Super Admin, một lần mỗi hồ sơ (đã có cột ở D-68). Cùng người nhận với `QĐ-110c`.                                                                                                                                                                | Lặp mỗi ngày làm việc như `REVOCATION_OVERDUE`, hoặc chỉ báo IT.                                                                                                  | A                                                                           |
| D-55 | `doneAt` không giảm theo `order` (cho phép hai mục cùng giây); không kiểm `doneAt` ở tương lai.                                                                                                                                                                                    | Tăng ngặt (`<=` thành lỗi), kèm chặn `doneAt` sau thời điểm nhận request.                                                                                         | A                                                                           |

## Ghi chú phụ (không đổi phân loại)

- **D-42:** `countPersonalSeatsWithoutCompletedTaskOf` tính cả ghế không có đường thu hồi (`K3`). Khi có ghế `K3` thật, hồ sơ sẽ bị nhắc quá hạn
  mỗi ngày và không bao giờ tự đóng (`QĐ-110e`). Hiện baseline từ chối `K3` (D-28) nên rủi ro thấp; nên ghi vào giới hạn đã biết.
- **D-42/D-45:** `itAdminOfDeparture` lấy IT phụ trách phòng mà không kiểm người đó còn "dùng được" (tài khoản hoạt động, còn làm việc). Chỉ người
  nghỉ bị loại (`personnel-notifier.service.ts:162-165`). Nếu IT phụ trách phòng cũng đã rời, thông báo sẽ rơi vào hộp thư không ai đọc. Nên
  thêm phép thử `findUsableItAdminEmployeeIds`.
