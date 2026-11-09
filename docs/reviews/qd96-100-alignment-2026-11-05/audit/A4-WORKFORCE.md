# A4-WORKFORCE — audit `personnel`, `organization`, `identity-access`, `onboarding`, `data-import` theo QĐ-96 → QĐ-100ai

> Lượt audit 05/11/2026, read-only. BE `3e4553b9` (`git log -1` khớp pin; cây làm việc chỉ có thư mục tracker chưa track). Docs: đọc bản làm việc tại `D:\FPT\FALL2026\Docs` (thư mục này không phải git repo nên không kiểm được commit `3d73a7f`). Không chạy test, không đổi trạng thái git.
> **Điều phối viên (05/11):** mục 3 *Bảng trường API/DTO* đã chuyển cho nhóm agent V1–V4 ⟹ báo cáo này **không** có mục 3; vài chỉ hướng cho V1–V4 nằm ở mục 5.

## 1. Skill, phạm vi đã đọc và chưa đọc

**Skill Preflight**

| Skill | Loại | Mục đích trong lượt này |
| --- | --- | --- |
| `doubt-driven-development` | process (mapping: không có skill *audit* đúng tên, dùng skill này làm khung quy trình) | Viết mỗi kết luận lớn thành CLAIM rồi tự tìm bằng chứng phản bác. Chạy ở **chế độ suy giảm** vì đang là subagent (không tạo reviewer con); cross-model **bỏ qua — ngữ cảnh không tương tác**. Đã tự phản biện 4 kết luận lớn (A4-01, A4-02, A4-12, A4-13) bằng grep độc lập (vd. ai đặt `TERMINATED`, có job nào tự chuyển `LEFT` không, có nhãn T1–T4 ở đâu không). |
| `code-review-and-quality` | review | Khung 5 trục (đúng nghiệp vụ, kiến trúc, bảo mật…) và nhãn mức độ khi đánh giá logic. |
| `api-and-interface-design` | domain | Đánh giá hợp đồng/route ở mức nghiệp vụ (mục 3 đã chuyển cho V1–V4). |
| `superpowers:verification-before-completion` | verification | Mọi kết luận có `file:dòng`; cuối lượt đọc lại file báo cáo và đếm mã QĐ trong bảng mục 2b trước khi bàn giao. |

**Đã đọc**

- BE: `AGENTS.md`, `ARCHITECTURE.md`, README của `personnel`, `identity-access`, `onboarding`; `docs/generated/routes.md` (các route của 5 module); toàn bộ policy/DTO/service chính của `personnel/offboarding/**` (trừ test), `personnel/transfer/{dto,policy}`, `personnel/transfer-review/**` (policy, dto, service, decision, replacement, overdue, mapper), `personnel/notice/notice.dto.ts`, `personnel/leave/leave.dto.ts`; `identity-access`: `account.policy.ts`, `login.service.ts`, `jwt-access-token-verifier.service.ts`, `account-management.dto.ts`, `account-invitation.service.ts`, `account-administration.policy.ts`, `successor-eligibility.service.ts`, `role-transfer-recovery.api.ts`, migration `20261024180100_identity_app_user_employee_left`; `organization`: DTO phòng/Cost Center/nhân viên, `department.service.ts` (ngừng phòng), `employee-first-placement.policy.ts`; `data-import/employee-import/employee-import-row.types.ts`; `operating-parameters/parameter-definitions.policy.ts` (danh sách khóa); `licensing/public/licensing.types.ts` (`REVOCATION_SOURCES`, `OpenRevocationInput`); `docs/workspace/items/g6-offboarding-record/spec.md` (lý do thiết kế cũ).
- Docs: sổ hiệu lực mục 3.2 (dòng 136–175), 3.3 (177–229), 3.6 (324–341), 3.7 (343–358) và các mã liên quan ngoài mục (`QĐ-96j` 487, `QĐ-100x`…`QĐ-100ag` 495–504, `QĐ-94j` 518, `QĐ-83b` 255); BRD `FR-2.1`, `FR-2.2`, `FR-2.12`, `FR-2.16`, `FR-8.1`, `FR-8.5`→`FR-8.11`, `FR-9.1`→`FR-9.8`, `BM-04`/`BM-08` (dòng 1451, 1455); *Quy trình và chính sách theo main flow* MF-2 (342–508) và mục lục MF-3; `MF-2-offboarding-access-reclaim.md` (v7.6), `MF-3-department-transfer-access-adjustment.md` (v6.3); `supporting-business-flows/index.md` (SBF-01a, 02, 13, 16, 18); User Stories `EP-03` (`US-03-04` AC-1→AC-34, `US-03-07` AC-1→AC-18, `US-03-11` AC-4, `US-03-12` toàn bộ), `EP-02` AC-15 của `US-02-02`.

**Chưa đọc / chỉ đọc lướt** (ảnh hưởng độ phủ): nội dung `licensing/handover/**`, `licensing/provisioning/**` (A3), `requests/**` (A2), `notifications`/`dashboards` (A5); file SBF-13/16/18 chi tiết; Context/FDD/ERD; `openapi.json`; test (`test/http`, `test/integration`) — không chạy. Các mã QĐ đánh dấu *thuộc A1/A2/A3/A5* ở mục 2b chỉ được kiểm ở phần chạm vào 5 module của A4.

## 2. Bảng lệch

Quy ước: **Kết luận** `ĐÚNG`/`SAI`/`THỪA`/`THIẾU`; cỡ S ≤ 1h · M ≤ ½ ngày · L > ½ ngày. Đường dẫn code tính từ BE root; `QĐ-…:n` = dòng trong `Docs/Decisions/project-decisions.md`; `BRD:n` = dòng trong file BRD; `EP-03:n` = dòng trong `BE-UserStory/epics/EP-03.md`; `QT-MF:n` = dòng trong *Quy trình và chính sách theo main flow.md*.

**Tổng:** 23 mục lệch (12 `SAI` · 10 `THIẾU` · 1 `THỪA`) + 17 nhóm quy tắc `ĐÚNG`.

### 2a. Lệch (SAI · THIẾU · THỪA)

| ID | MF / epic | Kết luận | Căn cứ | Bằng chứng code | Tác động | Đề xuất sửa tối thiểu | Cỡ | Migration? | Phụ thuộc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A4-01 | MF-2 · EP-03 / EP-01 (`US-03-04`, `FR-8.9`) | **SAI** | `QĐ-96j(1)` (:487), `QĐ-39d` (:140), `QĐ-41a` (:141), `QĐ-96c` (:340), `QĐ-77i` (:337); BRD `FR-8.9` (:1261), `FR-2.12(i)` (:515); MF-2 §4 bước 5–6; `US-03-04` AC-9, AC-10 (EP-03:146–147); QT-MF 2.7 (:439) | Đăng nhập/guard/refresh chỉ chặn khi `employee.status === 'TERMINATED'`: `src/modules/identity-access/accounts/account.policy.ts:6-10`, `auth/login.service.ts:52-57`, `access/jwt-access-token-verifier.service.ts:52-54`; `TERMINATED` chỉ được đặt khi Super Admin chuyển *đã nghỉ việc* (`organization/employee/employee-departure.repo.ts:47` ← `personnel/offboarding/offboarding-left.service.ts:61`); comment ghi rõ *"a day past it never takes the rights away by itself"* (`offboarding-left.service.ts:17-22`); `isPastLastDay` coi người qua ngày cuối là *"still working"* (`offboarding/offboarding.policy.ts:346-349`). Không có job nào trong `offboarding/`. | **Bảo mật:** người đang bàn giao đã hết ngày làm việc cuối vẫn đăng nhập và gọi API tới khi Super Admin bấm *đã nghỉ việc* — trái điểm cốt lõi của MF-2 mới; demo MF-2 sai ngay bước *Block Login*. | Sweeper theo giờ ở `personnel` (cùng kiểu `leave-return.job.ts`, ADR-0018): với hồ sơ `HANDING_OVER` có `lastWorkingDay < today` (múi giờ tổ chức), gọi facade `identity-access` đặt **cờ chặn do nghỉ việc** trên `app_users` (vd. `access_blocked_at` + `access_block_reason='DEPARTURE_LAST_DAY'`), thu hồi phiên/refresh token; `employeeHasNotLeft` → hàm `accountUsable` đọc thêm cờ này ở login, guard, refresh, reset mật khẩu, lời mời; audit `SYSTEM` *chặn tự động*; nhắc Super Admin chuyển *đã nghỉ việc* (`US-03-04` AC-9). Không đổi `status` tài khoản (giữ `QĐ-39d` *không tự đổi trạng thái tài khoản*). | L | Có (cột mới trên `app_users`) | A4-03, A4-05; A5 (nhắc/cảnh báo) |
| A4-02 | MF-2 · `US-03-04` | **SAI** (cách sửa chờ **Q4**) | `QĐ-77i` (:337) *chặn → khóa tài khoản công ty → gỡ … xong ≤ 1 ngày làm việc*; `QĐ-94j` (:518); `QĐ-96j(1)`; MF-2 §4 bước 6–8 (*không chờ đã nghỉ việc*); QT-MF 2.8–2.9 (:458–487). Mâu thuẫn tài liệu: BRD checklist `BM-08` (:523) và `US-03-04` AC-20 (EP-03:157) vẫn viết mục (1) *tại đã nghỉ việc* | Ghi khóa tài khoản công ty bị từ chối khi hồ sơ chưa `LEFT`: `offboarding.policy.ts:190-193` (`CASE_NOT_LEFT`); mở thu hồi cũng vậy: `offboarding.policy.ts:244`, và danh sách quyền để chọn chỉ đọc khi `LEFT`: `offboarding-revocation.service.ts:45`, `:97` | Hạn *thu hồi xong ≤ 1 ngày làm việc sau ngày cuối* phụ thuộc thời điểm Super Admin bấm *đã nghỉ việc* (không có hạn) ⟹ không bảo đảm được; seat của người đã rời vẫn tính phí. | Điều kiện của `accountLockRefusal`/`revocationSelection`/`close` đổi từ `state === 'LEFT'` sang *đã bị chặn*: `LEFT`, hoặc `HANDING_OVER` mà đã qua ngày cuối hoặc ghi *chặn ngay*; `listPersonalSeatsOf` gọi theo điều kiện mới. Đóng hồ sơ vẫn cần `LEFT` (MF-2 `j_close`). | M | Không | A4-01, A4-05; Q4 |
| A4-03 | MF-2 · `US-03-04` AC-33 | **THIẾU** | `QĐ-100q` (:341), `QĐ-48a(2)` (:327), `QĐ-96j(1)`; BRD `FR-8.9` (:1262); MF-2 §5.2 *Hủy bàn giao sau ngày làm việc cuối*; `US-03-04` AC-33 (EP-03:170), AC-15 (EP-03:152) | `offboarding/change/offboarding-change-writer.service.ts:112-160`: hủy đưa người về `WORKING`/nghỉ dài, không giữ trạng thái chặn nào; do A4-01 chưa có chặn tự động nên sau khi hủy người đó dùng được ngay | Hủy bàn giao sau ngày cuối mở lại truy cập không qua Super Admin mở khóa có lý do — trái `QĐ-100q`. | Khi hủy mà `today > lastWorkingDay` (đã có cờ chặn của A4-01): **giữ** cờ chặn; `POST /app-users/{id}/unlock` (đã bắt buộc lý do, `account-management.dto.ts:22-25`) xóa luôn cờ chặn do nghỉ việc, ghi Audit Trail; hủy trước hết ngày cuối thì không có gì để giữ. | S–M (sau A4-01) | Cùng migration A4-01 | A4-01 |
| A4-04 | MF-2 · `US-03-04` AC-33 · SBF-18 | **THIẾU** (đang tiềm ẩn, lộ ra khi sửa A4-02) | `QĐ-100x` (:495), tiền lệ `QĐ-83b` (:255); BRD `FR-8.9` (:1262); QT-MF 2.7 (:448) | Hủy bàn giao không gọi `licensing` (`offboarding-change-writer.service.ts:112-160`); `PersonnelFileHooks.onCancelled` không có hook nào đăng ký (grep `onCancelled` chỉ thấy `event-notice/personnel-file-hooks.service.ts:28` và nơi gọi); `LicensingApi` không có thao tác gỡ một nguồn thu hồi (`licensing/public/licensing.api.ts:49-131`) | Sau A4-02, tác vụ thu hồi nguồn `DEPARTURE` mở trước khi hủy sẽ vẫn chạy và gỡ quyền của người đã ở lại. | Facade `licensing` mới (A3 làm) `withdrawRevocationSource(tx, { employeeId, sources: ['DEPARTURE','ABRUPT_DEPARTURE'], reference: offboarding case })`: tác vụ chưa bắt đầu/chờ xác nhận bàn giao/đang lỗi không còn nguồn khác ⟹ `CANCELLED` lý do *không còn áp dụng*, quyền giữ; đang thực hiện ⟹ báo IT Admin đóng *đã hủy* hoặc ghi *hoàn tất*; gọi trong transaction hủy; Audit Trail. | M | Có thể (mã lý do hủy mới) | A3, A4-02 |
| A4-05 | MF-2 · `US-03-04` AC-18, AC-32 | **SAI** (cách sửa chờ **Q1**) | `QĐ-96c` (:340) — *chặn ngay* gồm *công ty quyết cắt quyền **trước ngày cuối***; `QĐ-62e` (:332); BRD `FR-2.12(ii)` (:516); MF-2 §4 bước 2, 4, 6; QT-MF 2.2, 2.4 (:367, :395) | `abrupt=true` bắt buộc ngày làm việc cuối ≤ hôm nay (`offboarding.policy.ts:57-70`, mã `IN_FUTURE`) và chuyển `LEFT` ngay khi ghi (`offboarding-case-writer.service.ts:82-84`); DTO chỉ có cờ `abrupt` (`offboarding/offboarding.dto.ts:32`) | Không ghi được ca *cắt quyền ngay nhưng hợp đồng còn tới ngày cuối* (garden leave): Super Admin phải chọn giữa khai sai ngày cuối hoặc để người đó còn quyền tới ngày cuối. | Tách **lựa chọn chặn ngay** khỏi *đã nghỉ việc ngay*: trường `blockImmediately` (thay nghĩa `abrupt`), cho phép ngày cuối tương lai khi chặn ngay; chặn trong ngày ghi qua cờ của A4-01; nghỉ đột ngột (ngày cuối ≤ hôm nay) giữ đường chuyển `LEFT` ngay — chi tiết theo Q1. | M | Có (đổi/thêm cột `offboarding_cases`) | Q1, A4-01, A4-06 |
| A4-06 | MF-2 · SBF-13 · `US-03-11` | **SAI** | `QĐ-96c` (:340) *rẽ theo lựa chọn của Super Admin, không theo lý do*; MF-2 §5.2 *Super Admin chọn chặn ngay*; QT-MF 2.4 | Ghi từ thông báo suy nhịp từ loại thông báo: `offboarding/offboarding-notice.listener.ts:48` (`abrupt: notice.kind === 'ABRUPT_DEPARTURE'`); body ghi từ thông báo không có lựa chọn: `notice/notice.dto.ts:43-51` | Thông báo *nghỉ việc* mà công ty quyết cắt quyền ngay thì không ghi được *chặn ngay* qua đường thông báo (phải ghi trực tiếp rồi *linking*). | Thêm lựa chọn chặn ngay vào `event` khi ghi từ thông báo, mặc định theo loại (`ABRUPT_DEPARTURE` ⟹ chặn ngay). | S | Không | A4-05 |
| A4-07 | MF-2 · `US-03-04` AC-31 | **THIẾU** | `QĐ-94j` (:518), `QĐ-96c`; BRD `FR-2.12(i)` (:515), `FR-5.14`; MF-2 §4 bước 8, §5.2 *Thu hồi quá 1 ngày làm việc*; `US-03-04` AC-31 (EP-03:168); QT-MF 2.9 | Mở thu hồi không truyền hạn (`offboarding-revocation.service.ts:150`, `context` chỉ có `departmentId` dù `RevocationContext.dueOn` có sẵn ở `licensing/public/licensing.types.ts:275-279`); không có tham số hạn thu hồi khi nghỉ việc (`operating-parameters/parameter-definitions.policy.ts:78-296` chỉ có `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS`, `HANDOVER_SHORT_DEADLINE_WORKING_DAYS`…); không có job cảnh báo quá hạn | Không đo/không leo thang được KPI bảo mật chính của MF-2 (*thu hồi xong ≤ 1 ngày làm việc*). | Tham số `DEPARTURE_REVOCATION_WORKING_DAYS` (mặc định 1, `FR-8.2`); `dueOn` = ngày cuối + N ngày làm việc (chặn ngay: ngày ghi + N) truyền vào `openRevocation`; job cảnh báo IT Admin phụ trách + Super Admin, nhắc lại tới khi mọi tác vụ của hồ sơ kết thúc. | M | Có thể (seed tham số) | A1 (tham số), A3, A5 |
| A4-08 | MF-2 · `US-03-04` AC-32 | **THIẾU** | `QĐ-94j`, `QĐ-96c`; `US-03-04` AC-32 (EP-03:169) *hết ngày ghi mà tài khoản công ty chưa khóa ⟹ IT Admin và Super Admin nhận cảnh báo*; QT-MF 2.8 | Chỉ có cờ `urgent` trong checklist (`offboarding.policy.ts` `checklistOf`) và audit `ACCOUNT_LOCK_REMINDER` khi `LEFT` (`offboarding-left.service.ts:79`); không có kiểm cuối ngày | Nhịp chặn ngay không có lưới an toàn khi IT chưa khóa tài khoản công ty trong ngày. | Job cuối ngày (múi giờ tổ chức) cho hồ sơ chặn ngay chưa ghi `BM-08`(1) ⟹ cảnh báo IT Admin phụ trách + Super Admin. | S–M | Không | A5, A4-05 |
| A4-09 | MF-2 · `US-03-04` · SoD | **THỪA** | MF-2 §2 làn *IT Admin* (`a_lock`), §4 bước 7; BRD `BM-08` người lập IT Admin (:1455); `QĐ-87a` (:163) Super Admin không làm tác vụ kỹ thuật; `US-03-04` AC-9 *khóa tài khoản công ty được IT Admin làm theo `BM-08` (1)* | `POST /offboarding-cases/{id}/departure` (chỉ `SUPER_ADMIN`, `offboarding.controller.ts:294`) nhận `accountLock` (`offboarding.dto.ts:47-50`) và ghi mục (1) `BM-08` dưới tên Super Admin (`offboarding-left.service.ts:47`) | Super Admin ghi thay việc kỹ thuật của IT Admin ⟹ lệch phân vai, checklist có thể ghi sai người. | Bỏ `accountLock` khỏi body `departure`; giữ `…/account-lock` và `accountLock` trong `…/revocations` (IT Admin). | S | Không | V1–V4 (hợp đồng FE) |
| A4-10 | MF-2 · `US-03-04` AC-14, AC-15 | **SAI** (chờ **Q3**) | `QĐ-48c` (:329) *lý do … kèm căn cứ của sự kiện nhân sự*; `QĐ-93f(2)` (:225); MF-2 §5.2 *đổi/hủy … kèm lý do và căn cứ*; QT-MF 2.2 điều kiện *Đổi ngày hoặc hủy … cũng có căn cứ như ghi mới* (:376). `US-03-04` AC-14/15 chỉ nêu lý do | Body đổi ngày cuối và hủy chỉ có `reason` (`offboarding.dto.ts:38-44`); trong khi đổi ngày/hủy **điều chuyển** đã thu `grounds` (`transfer/transfer.dto.ts:31-40`) | Thiếu kiểm soát bù (`QĐ-87b(3)`) cho thao tác đổi/hủy sự kiện nghỉ việc. | Thêm `grounds` bắt buộc (cùng `personnel-grounds.policy.ts`) cho đổi ngày cuối và hủy bàn giao, lưu ở `offboarding_case_changes`. | S | Có thể (cột/JSON căn cứ trên bản ghi thay đổi) | Q3 |
| A4-11 | MF-2 | **THIẾU** (nhẹ, chờ **Q2**) | MF-2 §4 bước 2 và QT-MF 2.2 (:369): ghi *lý do nghỉ (xin nghỉ · công ty chấm dứt · nghỉ đột ngột) — chỉ để ghi nhận*; **không** có trong QĐ, BRD `FR-2.12`, `BM-04` (:1451) hay US | `offboarding.dto.ts:28-36` không có trường lý do nghỉ | Chỉ ảnh hưởng hiển thị/báo cáo; không đổi nhịp. | Theo Q2. | S | Có nếu thêm | Q2 |
| A4-12 | MF-3 · `US-03-12`, `US-03-07` AC-1 | **THIẾU** | `QĐ-94f(1)` (:355), `QĐ-94m(7)` (:357), `QĐ-56a` (:346), `QĐ-87h(3)` (:350); BRD `FR-2.16(1)` (:545), `BM-04` (:1451); MF-3 §4 bước 3, 5; `US-03-12` AC-1, AC-9, AC-12 (EP-03:543, 551, 554); `US-03-07` AC-1 (EP-03:327) | Không có nhãn điều chuyển ở đâu (grep `'T1'` chỉ ra hồ sơ thuế của `catalog`/`finance`); phản hồi ghi điều chuyển chỉ có `warnings` (`transfer/transfer.dto.ts:116`); dòng rà soát không có nhãn (`transfer-review/transfer-review.dto.ts:96-125`) | Trưởng phòng mới không thấy T1/T2/T3, không có căn cứ nhãn; demo câu hỏi hội đồng (*cấp đặc quyền theo nhân viên* = T2) không trả lời được. | Tính nhãn từ read model `FR-3.17` (`licensing/department-tools`) khi ghi điều chuyển (xem trước, trả trong `transferRecorded`/chi tiết) và **chốt** khi mở rà soát ở `PLACEMENT_START` (`transfer-review.service.ts:36-60`), lưu nhãn + căn cứ trên `transfer_review_items`; T4 chỉ để thông tin; không có thao tác sửa nhãn. | L | Có | A3 (read model phần mềm phòng) |
| A4-13 | MF-3 · `US-03-07` AC-6, `US-03-12` AC-5 | **SAI** | `QĐ-94f(4)` (:355), `QĐ-50b` (:345), `QĐ-87h(3)` (:350); BRD `FR-2.16(4)` (:549); MF-3 §4 bước 9; `US-03-07` AC-6 (EP-03:332) *thay vế "quá hạn chỉ nhắc" của QĐ-50b cũ* | `transfer-review.policy.ts:8` *"a review that is late is only told"*; `transfer-review-overdue.service.ts:13-18` *"It only tells. It never takes a seat away"*; `transfer-review-replacement.service.ts:17` *"for a tool nobody decided about, nothing is revoked"* | Quyền của phòng cũ tồn tại vô hạn khi trưởng phòng mới im lặng — đúng thứ `QĐ-94f` muốn chặn; seat cũ tính phí mãi. | Job tại hạn: dòng còn `PENDING` ⟹ quyết định hệ thống *thu hồi mặc định — không quyết trong hạn* (audit), thu hồi mở **khi hết chồng lấn** qua cổng `licensing` (nguồn `TRANSFER_REVIEW`); **loại trừ** rà soát `POST_SETUP` (BRD `FR-9.4`: *không tự thu hồi khi chưa quyết*). Cập nhật bất biến *"Không gì bị thu hồi tự động"* trong `personnel/README.md`. | M–L | Có (giá trị quyết định mới) | A4-15, A4-19 |
| A4-14 | MF-3 · `US-03-12` AC-5, `US-03-07` AC-12 | **THIẾU** | `QĐ-94f(4)`, `QĐ-94m(10)` (:357), `QĐ-94l(5)` (:356); BRD `FR-2.16(4)` | Job hiện chỉ báo **sau** hạn (`transfer-review-overdue.service.ts`, `listOverdueUnnoticed` `dueOn < today` ở `transfer-review.repo.ts:299`); không có tham số báo trước (`parameter-definitions.policy.ts`) | Trưởng phòng mới và IT Admin không được báo trước khi bị thu hồi mặc định. | Tham số `TRANSFER_DEFAULT_NOTICE_WORKING_DAYS` (mặc định 2); job báo trưởng phòng mới + IT Admin phụ trách kèm danh sách quyền sẽ bị thu hồi mặc định; đánh dấu đã báo (một lần). | S–M | Có thể (seed tham số, cột đã báo) | A1, A5, A4-13 |
| A4-15 | MF-3 · `US-03-12` AC-2, AC-4; `US-03-07` AC-4 | **SAI** | `QĐ-94f(3)` (:355), `QĐ-94m(3)`; BRD `FR-2.16(3)` (:547); MF-3 §4 bước 7, 12, 13; `US-03-12` AC-4 (EP-03:546) *chọn không còn cần ngày 17/10 ⟹ tác vụ tạo khi hết ngày làm việc thứ 5* | *Không còn cần* mở thu hồi **ngay** (`transfer-review-decision.service.ts:75`); *còn cần* chờ Request kết thúc mà không có mốc 5 ngày làm việc (`transfer-review-replacement.service.ts:13-24`) | Quyền cũ bị gỡ sớm hơn chồng lấn (người chuyển mất công cụ trước hạn); ngược lại quyền *còn cần* được giữ vô hạn nếu Request treo. | Lưu `overlapEndsOn` cho từng dòng (= sớm hơn của *quyền thay thế được cấp* và *ngày hiệu lực + 5 ngày làm việc*); *không cần*/mặc định ⟹ thu hồi mở ở `overlapEndsOn`; *còn cần* ⟹ hết chồng lấn mà Request đã tới bước duyệt chi thì giữ tới khi có quyết định, chưa tới thì theo A4-20; duyệt/cấp ⟹ thu hồi; từ chối/rút ⟹ thu hồi. | L | Có | A2 (trạng thái *tới bước duyệt chi*), A4-16, A4-20 |
| A4-16 | MF-3 · `US-03-07` AC-3, `US-03-12` | **THIẾU** | `QĐ-99a` (:319), `QĐ-98i` (:318), `QĐ-100t` (:491), `QĐ-56a`, `QĐ-94f(2)`; BRD `FR-2.16(2)` (:546); MF-3 §4 bước 10; `US-03-07` AC-3 (EP-03:329) | *Còn cần* chỉ chờ "một Request mới của phòng" do người khác gửi (`transfer-review-replacement.service.ts:13-24`, `transfer-review.dto.ts:113-120` `needsNewRequest`); module `requests` không có loại/liên kết *Request cấp thay thế khi điều chuyển* (grep `replacement` rỗng) | Sau `QĐ-100t` trưởng phòng **không** được gửi thay cho một người ⟹ hiện không còn đường nào hợp lệ để tạo Request thay thế; MF-3 bước `s_req` không chạy. | Khi trưởng phòng chọn *còn cần* cho quyền trả phí: gọi facade `requests` tạo Request cấp mới liên kết Assignment cũ, miễn cửa sổ 30 ngày, đi kiểm tra ngân sách + Người duyệt chi; `TransferReviewReplacementService` đọc kết cục như hiện tại. | L | Có (liên kết Request ↔ dòng rà soát/Assignment cũ) | A2 (chủ), A1 (kiểm ngân sách), A3 (chuyển seat `QĐ-99e`, `QĐ-100y`) |
| A4-17 | MF-3 · `US-03-07` AC-11 | **SAI** | `QĐ-50b`, `QĐ-87h(3)` *còn cần nội bộ ⟹ giữ*; BRD `FR-2.16(2)`; `US-03-07` AC-11 (EP-03:337) *chọn còn cần ⟹ quyền giữ, không có Request nào* | `transfer-review.mapper.ts:75`: `needsNewRequest = decision === 'STILL_NEEDED' && …` cho cả `K5` | FE/IT hiểu rằng phần mềm nội bộ còn chờ Request; khi A4-15 áp chồng lấn, quyền nội bộ có thể bị thu hồi nhầm. | `needsNewRequest`/chồng lấn chỉ cho quyền trả phí (T1/T2); T3 *còn cần* = giữ, dòng kết thúc. | S | Không | A4-12 |
| A4-18 | MF-3 · `US-03-07` AC-5, AC-13 | **SAI** | `US-03-07` AC-5 (EP-03:331) *cần công cụ mới ⟹ ghi nhu cầu; quyền T1/T2/T3 đang xét **vẫn cần quyết riêng***; AC-13 (EP-03:339) | `NEEDS_NEW_TOOL` là một quyết định của **từng quyền** (`transfer-review.dto.ts:26-37`), làm dòng hết `PENDING` (`transfer-review.policy.ts:76-78`) và không đổi được nữa (`:66-73` chỉ cho `STILL_NEEDED → NOT_NEEDED`); không mở thu hồi | Chọn *cần công cụ mới* trên một quyền làm quyền đó **giữ vĩnh viễn** không ai quyết — lỗ hổng vòng qua mặc định thu hồi sau khi có A4-13. | Tách *cần công cụ mới* thành ghi chú cấp rà soát (không thay quyết định của dòng) hoặc giữ dòng ở `PENDING`; quyền vẫn phải *còn cần*/*không cần*/mặc định. | S–M | Có thể (dữ liệu cũ `NEEDS_NEW_TOOL`) | A4-13 |
| A4-19 | MF-3 · `US-03-07` AC-7, `US-03-12` AC-6, AC-11 | **SAI** | `QĐ-94l(2)` (:356), `QĐ-94m(4)` (:357), `QĐ-62c` (:190); BRD `FR-2.16(7)` (:552); MF-3 §4 bước 7 | Hạn cố định từ ngày hiệu lực (`transfer-review.service.ts:60`); phòng không có trưởng phòng thì chỉ không báo, khi có trưởng phòng mới vẫn tính trễ theo hạn cũ (`transfer-review-overdue.service.ts:17-18`); không có trần, không nhắc Super Admin định kỳ | Trưởng phòng được gán muộn nhận rà soát đã quá hạn (sau A4-13 sẽ bị thu hồi mặc định ngay); không có trần ⟹ quyền phòng cũ giữ vô hạn. | `dueOn`/`overlapEndsOn` tạm dừng khi phòng nhận không có trưởng phòng; listener gán trưởng phòng (`organization.change-listeners`) đặt hạn = ngày gán + 5 ngày làm việc; job trần = điểm điều chỉnh kế tiếp của thuê bao phòng cũ ⟹ thu hồi mặc định; nhắc Super Admin định kỳ. | M | Có (hạn nullable / thời điểm tạm dừng) | A3 (điểm điều chỉnh thuê bao), A4-13 |
| A4-20 | MF-3 · `US-03-12` AC-7, AC-13; `US-03-07` AC-16, AC-17 | **THIẾU** | `QĐ-94l(3)` (:356), `QĐ-87g(4)` (:223), `QĐ-99b` (:358), `QĐ-94m(2)`; BRD `FR-2.16(3a)`, `(8)` (:548, :553) | Không có trạng thái *giữ chờ Cost Center* hay *thêm 10 ngày làm việc khi bị chặn ngân sách* ở `transfer-review/**` | Phòng nhận chưa có Cost Center hoặc hết ngân sách ⟹ không có quy tắc giữ/thu hồi đúng; Finance không được cảnh báo. | Mở rộng mô hình chồng lấn của A4-15: trạng thái `HELD_FOR_COST_CENTER` (tới khi Request được trình, trần ND, cảnh báo Finance), `HELD_BUDGET_BLOCKED` (+10 ngày làm việc, đồng hồ không dừng, trần ND). | M–L | Có | A1, A2, A4-15, A4-16 |
| A4-21 | MF-3 · `US-03-04` AC-34 | **SAI** (nhẹ) | `QĐ-99k(c)` (:229) *khi điều chuyển chỉ hỏi giữ hay đổi*; `US-03-04` AC-34 (EP-03:171) *không bật cờ* | Cảnh báo ghi điều chuyển mang mã `BUSINESS_OWNER_REPLACEMENT_NEEDED` (`transfer/transfer.dto.ts:111`, `transfer.service.ts:41`) | FE hiển thị như *cần thay thế* — trái ý *giữ hay đổi*. | Đổi mã/ý nghĩa (vd. `BUSINESS_OWNER_KEEP_OR_CHANGE`), không bật cờ. | S | Không | V1–V4 |
| A4-22 | EP-01 · `US-01-09` (lệnh vận hành) | **SAI** | `QĐ-44c` (:145) người nhận *đang làm việc (không nghỉ dài, đang bàn giao, đã nghỉ việc)*; `QĐ-47f` (:152); BRD `FR-8.10(c)` | Chỉ kiểm `status !== 'ACTIVE'` (tức chưa `TERMINATED`): `identity-access/accounts/successor-eligibility.service.ts:45-47` (comment chờ *"G6 adds them"* nhưng G6 thêm `workState`, không đổi `status`), `public/role-transfer-recovery.api.ts:72-73` | `TRANSFER_ROLE`/`REASSIGN` nhận người đang nghỉ dài hoặc đang bàn giao làm Super Admin mới. | Thêm `workState === 'WORKING'` (như `canBeSpendingApprover`, `account-administration.policy.ts:20-23`). | S | Không | — |
| A4-23 | EP-02 · `US-02-01/02` · SBF-01 | **THIẾU** | `QĐ-99k(b)` (:229); BRD `FR-9.5` (:1293) *chỉ trong checklist khởi tạo, file nhân sự nhận hồ sơ đã nghỉ việc lịch sử kèm ngày nghỉ — không tạo tài khoản, không chạy MF-2* | Cột file nhân sự không có ngày nghỉ: `data-import/employee-import/employee-import-row.types.ts:5-13` | Lượt quét `G2` đầu tiên không bắt được seat còn gán cho người đã nghỉ trước khi cài hệ thống — mất một giá trị demo của bước 4. | Cột tùy chọn `left_on` chỉ nhận khi giai đoạn khởi tạo chưa đóng; tạo hồ sơ `TERMINATED`/`LEFT` không tài khoản, không hồ sơ nghỉ việc; khớp ở `seat-baseline-import`. | M–L | Có thể | A3/A5 (G2 lượt đầu), A4 data-import |

**Không áp dụng ở hiện trạng (không tính là lệch):** thu hồi và *không tự khôi phục* thông tin xác thực thiết bị (`QĐ-100z` :497, `BR-45.9`, `FR-4.18`) — BE chưa có sổ thiết bị/collector, `licensing/device-binding/device-binding.types.ts:5-14` chỉ là type chờ `US-09-01` (G7); *không khôi phục dữ liệu hoạt động đã xóa* (`QĐ-100af` :503) — BE chưa lưu dữ liệu usage/hoạt động. Khi làm G7/usage phải nối vào cờ chặn của A4-01 và không khôi phục khi hủy (A4-03).

### 2a'. Quy tắc lớn đã khớp (`ĐÚNG`)

| ID | MF / epic | Kết luận | Căn cứ | Bằng chứng code |
| --- | --- | --- | --- | --- |
| A4-30 | MF-2 ghi sự kiện | ĐÚNG | `QĐ-76c`, `QĐ-77a`, `QĐ-87b(1)`, `QĐ-87a`, `QĐ-87c` | Căn cứ bắt buộc, từ chối mã `BM-09` làm căn cứ (`personnel-grounds.policy.ts`, `offboarding.policy.ts:92-111`); chỉ `SUPER_ADMIN` ghi/đổi/hủy/chuyển *đã nghỉ việc* (`offboarding.controller.ts:95,195,216,256,294`); từ chối tự ghi về mình (`PERSONNEL.SELF_CHANGE_FORBIDDEN`) |
| A4-31 | MF-2 sự kiện chờ, nghỉ dài, chưa xếp phòng | ĐÚNG | `QĐ-77j`, `QĐ-93g(5)`, `D-S17/18/28` | `pendingTransferRefusal` (`offboarding.policy.ts:119-128`); hủy về nghỉ dài/đang làm (`offboarding-change-writer.service.ts:121-127`); luồng rút gọn và `FIRST_PLACEMENT_PENDING` (README personnel) |
| A4-32 | MF-2 đổi ngày cuối / hủy trước *đã nghỉ việc* | ĐÚNG (trừ căn cứ — A4-10; ca sau ngày cuối — A4-03) | `QĐ-48a(1)`, `QĐ-48b`, `QĐ-66q`, `QĐ-40a` | `changeLastDayRefusal` (`offboarding.policy.ts:152-163`), `cancelRefusal` (:166-170); dời/hủy chỉ định trưởng phòng mới (`offboarding-change-writer.service.ts:34-59`, `periods.undo`) |
| A4-33 | MF-2 bàn giao dữ liệu | ĐÚNG | `OI-14c`, `QĐ-62e`, `QĐ-94m(12)` | Hạn = ngày cuối − 1 ngày làm việc (`offboarding.policy.ts:30-33`); chặn ngay giữ gói mất dữ liệu theo `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS` (`offboarding-handover.service.ts:42-63`) |
| A4-34 | MF-2 thứ tự `BM-08`, không tự thu hồi | ĐÚNG | `QĐ-77i` (thứ tự), `US-03-04` AC-4, AC-5 | Khóa tài khoản công ty trước/cùng lần mở thu hồi (`offboarding.policy.ts:257`); thu hồi hàng loạt có đếm (`COUNT_MISMATCH`) |
| A4-35 | MF-2 đóng hồ sơ | ĐÚNG | `QĐ-75e`, `QĐ-66i`, `QĐ-56c`, `QĐ-77d`, `QĐ-58d`, `QĐ-99k(c)` | `blockersOf`/`closeRefusal` (`offboarding.policy.ts:276-294`) + listener tài khoản dịch vụ/workspace; Business Owner chỉ cảnh báo (`offboardingDetailSchema.warnings.businessOwnerApplications`) |
| A4-36 | MF-2 người giữ vai then chốt rời | ĐÚNG | `QĐ-77k`, `QĐ-47b` (vế cảnh báo), `QĐ-44b` | `roleFlags` (`offboarding.dto.ts:105`), `role-duties/` (`/super-admin-watch`) |
| A4-37 | Đã nghỉ việc ⟹ chặn từ thao tác kế tiếp | ĐÚNG (vế `LEFT`; vế theo ngày — A4-01) | `QĐ-39d`, `QĐ-46a(6)`, `FR-8.11(e)` | `account.policy.ts:9`, `jwt-access-token-verifier.service.ts:54`, `login.service.ts:57` |
| A4-38 | MF-3 ghi điều chuyển | ĐÚNG | `QĐ-66e`, `QĐ-77j`, `QĐ-93f(2)`, `QĐ-40a`, `QĐ-66a`, `QĐ-87e` | `transfer.policy.ts:92-170` (ngày không lùi, một sự kiện chờ, đổi ngày/hủy cần lý do + căn cứ, chỉ định trưởng phòng kế nhiệm); body không nhận chức vụ (`transfer.dto.ts:23-29`) |
| A4-39 | MF-3 ai quyết, khi nào mở rà soát | ĐÚNG | `QĐ-62c` (vế chờ không giao ai), `QĐ-89c`, `QĐ-93g(3)`, `US-03-07` AC-9, `US-03-12` AC-3, AC-10 | `mayDecide` (`transfer-review.policy.ts:46-48`); không mở cho xếp phòng lần đầu (`transfer-review.service.ts:40`), không mở khi không có quyền (:51); tài khoản dịch vụ không vào rà soát (chỉ seat cá nhân) |
| A4-40 | `BM-09` | ĐÚNG | `QĐ-76a`→`QĐ-76e`, `QĐ-77b`, `QĐ-80d` | `notice.dto.ts:27-57` (4 loại, không lý do nghỉ, ghi/từ chối/rút/nối, bản ghi xác minh) |
| A4-41 | Nghỉ dài (SBF-02) | ĐÚNG | `QĐ-80a`→`QĐ-80e` | `leave.dto.ts:20-35` (căn cứ khi bắt đầu, đổi ngày, quay lại khác ngày) |
| A4-42 | Tài khoản và vai | ĐÚNG | `QĐ-95a`→`QĐ-95c`, `QĐ-95e`, `QĐ-93a`, `QĐ-44a`, `QĐ-44b`, `QĐ-67e`, `QĐ-81a`→`QĐ-81c`, `QĐ-39c`, `QĐ-46a`, `QĐ-93e` | Một vai/tài khoản (index `role_grants_one_role_per_account`, README); tạo mặc định `EMPLOYEE`, từ chối `SUPER_ADMIN`/`SPENDING_APPROVER` (`account-invitation.service.ts:51-62`); đổi vai `PUT …/role`; rời `MANAGER` khi đang/sắp làm trưởng phòng bị chặn (`MANAGER_STILL_HEADING`); khóa/mở bắt buộc lý do (`account-management.dto.ts:22-25`); không tự đổi, không khóa người giữ Super Admin (`account-administration.policy.ts:31-38`) |
| A4-43 | Người mới | ĐÚNG | `QĐ-100ag`, `QĐ-93g(4)`, `QĐ-66ak`, `FR-8.6` (:1254) | Tạo tài khoản/lời mời không chặn theo ngày vào (`account-invitation.service.ts:50-80` chỉ chặn người đã nghỉ); nhân viên chưa xếp phòng có tài khoản (`account-candidates` trả `unplaced`). Phần *tự gửi Request* thuộc A2 |
| A4-44 | Tổ chức, phòng, Cost Center | ĐÚNG | `QĐ-52a`, `QĐ-52b`, `QĐ-87d(1)`, `QĐ-93h`, `QĐ-87h(1)`, `QĐ-58a`, `QĐ-66a`, `QĐ-66b`, `QĐ-90e`, `QĐ-86c` (vế chặn ngừng phòng) | Hồ sơ phòng không dự án/bộ chuẩn (`department.dto.ts:13-31`); Cost Center chỉ Finance tạo cho phòng có sẵn (`cost-centers.controller.ts:147`, `cost-center.dto.ts:10-16`); ngừng phòng đọc thành viên, tài khoản dịch vụ, thuê bao, việc mở (`department.service.ts:171-174` + 4 `DepartmentUseReader`) |
| A4-45 | Hồ sơ nhân viên, import, xếp phòng lần đầu | ĐÚNG (trừ A4-23) | `QĐ-67d`, `QĐ-82i`, `QĐ-93g`, `QĐ-93i`, `QĐ-40b`, `QĐ-40c`, `QĐ-48d`, `QĐ-87e`, `QĐ-99k(a)` | `employee.dto.ts:31-81`; `employee-first-placement.policy.ts:12-15` (từ chối người đang bàn giao, ngày < hôm nay/ngày vào); import lại báo `EXISTS_DIFFERENT` (`employee-import-row.types.ts:19`) |
| A4-46 | Checklist khởi tạo bước 1 | ĐÚNG | `QĐ-66d`, `QĐ-87f(2)`, `FR-9.1` | `onboarding/README.md` (thiếu trưởng phòng/IT/CC chỉ cảnh báo) |

### 2b. Trạng thái mọi mã QĐ ở mục 3.2, 3.3, 3.6, 3.7 (119 mã) và các mã liên quan ngoài mục

Ký hiệu: **K** = khớp · **L** = lệch (kèm ID) · **KAD** = không áp dụng cho BE/ngoài 5 module của A4 (ghi agent kiểm) · *sơ bộ* = chỉ kiểm phần chạm 5 module.

**3.2 Vai trò, tài khoản, xác thực (38)**

| Mã | TT | Ghi chú |
| --- | --- | --- |
| `QĐ-39b` | K | Super Admin chỉ mang `SUPER_ADMIN`, không làm trưởng phòng (`MANAGER` bắt buộc); vế không gửi Request — A2 |
| `QĐ-39c` | K | `SELF_CHANGE_FORBIDDEN` ở `identity-access` và `personnel` |
| `QĐ-39d` | L | A4-01 (vế chặn theo ngày); vế `LEFT` khớp (A4-37) |
| `QĐ-41a` | L | A4-01 |
| `QĐ-41b` | K *sơ bộ* | Thủ tục `pnpm ops:recover`, không route HTTP |
| `QĐ-44a` | K | Một Super Admin, không route đổi vai này |
| `QĐ-44b` | K | `SUPER_ADMIN_HOLDER_NOT_LOCKABLE` |
| `QĐ-44c` | L | A4-22 |
| `QĐ-44d` | K *sơ bộ* | CLI recovery |
| `QĐ-46a` | K | Lời mời, không tự đăng ký; chặn từ thao tác kế tiếp |
| `QĐ-46c` | K *sơ bộ* | Thư vòng đời qua outbox; không kiểm sâu |
| `QĐ-47a` | K *sơ bộ* | `reset-credentials` |
| `QĐ-47b` | L | Vế cảnh báo khớp; vế *chặn theo `QĐ-96j`* — A4-01 |
| `QĐ-47e` | K *sơ bộ* | Hai giai đoạn `successor-enrolment.service.ts` |
| `QĐ-47f` | L | A4-22 (điều kiện *đang làm việc*) |
| `QĐ-52d` | K | Sáu vai; IT Admin phụ trách theo phòng (`itAdminEmployeeId`) |
| `QĐ-58b` | K | Phân công phòng; xử lý thay — A3 |
| `QĐ-67e` | K | `FINANCE_ALREADY_ASSIGNED` |
| `QĐ-73a` | K *sơ bộ* | Không kiểm sâu nội dung thư |
| `QĐ-77c` | K | Khóa có lý do, không khởi động MF-2 |
| `QĐ-77d` | K *sơ bộ* | Chặn đóng hồ sơ khi workspace mất owner (`workspace-blocker.listener.ts`); phần danh tính workspace — A3 |
| `QĐ-81a` | K | `account-management.dto.ts:22-25` |
| `QĐ-81b` | K *sơ bộ* | Audit trước/sau ở `account-status.service.ts` |
| `QĐ-81c` | K | Khóa chỉ áp `AppUser`; lưu ý cờ chặn của A4-01 phải tách khỏi *khóa* |
| `QĐ-82f` | KAD | A1 |
| `QĐ-87a` | L (nhẹ) | Phân vai khớp, trừ A4-09 (Super Admin ghi khóa tài khoản công ty) |
| `QĐ-87c` | K | Từ chối tự ghi; thủ tục `ops:record-super-admin-event` |
| `QĐ-87f` | K | Lệnh khởi tạo + onboarding bước 1 |
| `QĐ-88b` | K *sơ bộ* | Đi qua thủ tục + `REASSIGN` |
| `QĐ-93a` | K | Gán vai trực tiếp; rời `MANAGER` bị chặn khi đang/sắp làm trưởng phòng |
| `QĐ-93b` | K / KAD | Không gán Người duyệt chi làm trưởng phòng (`SPENDING_APPROVER_HEADS_DEPARTMENT`); vế Request — A2 |
| `QĐ-93e` | K | Không route chuyển giao Super Admin |
| `QĐ-95` | K | Người nhận phải mang `EMPLOYEE`/chưa có tài khoản (`WORK_ROLE_HELD`, `MANAGER_HELD`, `HEADS_DEPARTMENT`) — điều kiện *đang làm việc* ở `QĐ-44c` |
| `QĐ-95a` | K | Index một vai |
| `QĐ-95b` | K | `account-invitation.service.ts:51-62` |
| `QĐ-95c` | K | `PUT /app-users/{id}/role` |
| `QĐ-95d` | KAD | Tự phục vụ/Request — A2 |
| `QĐ-95e` | K | Trưởng phòng/kế nhiệm phải giữ `MANAGER` (README personnel cuối) |

**3.3 Tổ chức, nhân sự, Department, Cost Center (51)**

| Mã | TT | Ghi chú |
| --- | --- | --- |
| `QĐ-30c` | K | Không Cost Center giữ chỗ; CC suy ra từ phòng; dòng *Chưa phân bổ* — A1 |
| `QĐ-40b` | K | Import lại chỉ báo khác biệt |
| `QĐ-40c` | K | Mã phòng sai = lỗi dòng; trống = chưa xếp phòng |
| `QĐ-41c` | K *sơ bộ* | Bản đọc Finance qua Cost Center, trưởng phòng qua `/departments/{id}/employees`; không kiểm từng trường |
| `QĐ-43d` | KAD | Tệp riêng tư — module khác (A5) |
| `QĐ-47d` | K *sơ bộ* | Không thấy route đổi múi giờ trong 5 module |
| `QĐ-48d` | K | `EXISTS_SAME` / `EXISTS_DIFFERENT` |
| `QĐ-51` | K | Đổi trưởng phòng không đổi thành viên |
| `QĐ-52a` | K | Phòng phẳng, một trưởng phòng `MANAGER` |
| `QĐ-52b` | K | Cost Center `UNIT` 1–1 (trường `kind` thừa — chỉ hướng V1–V4) |
| `QĐ-58a` | K | Một người trưởng tối đa một phòng |
| `QĐ-62c` | L | Vế điều chuyển (hạn tạm dừng, bắt đầu khi có trưởng phòng) — A4-19; các vế khác khớp |
| `QĐ-66a` | K | `SUCCESSOR_NOT_A_MEMBER_ON_DATE` |
| `QĐ-66b` | K | Ngừng phòng có danh sách chặn |
| `QĐ-66d` | K | Onboarding bước 1 |
| `QĐ-66ak` | K | Thành viên từ lúc ghi; vế Request — A2 |
| `QĐ-67a` | K *sơ bộ* | Lệnh khởi tạo (`installation`, A5) |
| `QĐ-67b` | K *sơ bộ* | Như trên |
| `QĐ-67c` | K | Super Admin tạo hồ sơ Finance như mọi người |
| `QĐ-67d` | K | `POST /employees` |
| `QĐ-68f` | K | Như `QĐ-66ak` |
| `QĐ-70c` | K | Như trên |
| `QĐ-73b` | K | Nhập tay hoặc import |
| `QĐ-76a` | K | Thông báo không có hiệu lực |
| `QĐ-76b` | K | Vòng đời 4 trạng thái; quá hạn chỉ nhắc (`PERSONNEL_NOTICE_REVIEW_WORKING_DAYS`) |
| `QĐ-76c` | K | Căn cứ bắt buộc mọi sự kiện |
| `QĐ-76d` | K | Rào chắn người gửi; ưu tiên cao khi nghỉ đột ngột |
| `QĐ-76e` | K | Không lý do nghỉ, không HRM |
| `QĐ-77a` | K | Bốn phần căn cứ; `GROUNDS_IS_NOTICE` |
| `QĐ-77b` | K | Bản ghi xác minh chỉ khi ghi từ thông báo |
| `QĐ-77j` | K | A4-31, A4-38 |
| `QĐ-80a` | K | `leave.dto.ts` |
| `QĐ-80b` | K | Như trên |
| `QĐ-80c` | K | Như trên |
| `QĐ-80d` | K | Như trên |
| `QĐ-80e` | K | Quá hạn quay lại chỉ báo (`leave-return.job.ts`) |
| `QĐ-82i` | K | Tạo hồ sơ không tạo tài khoản |
| `QĐ-82l(19)` | K | `PATCH /employees/{id}` không căn cứ |
| `QĐ-82l(20)` | K | Từ chối hồ sơ của chính Super Admin |
| `QĐ-86b` | KAD | Cost Center trên Assignment dịch vụ — A3 |
| `QĐ-86c` | K *sơ bộ* | Vế chặn ngừng phòng và đổi người chịu trách nhiệm khi nghỉ/chuyển; phần licensing — A3 |
| `QĐ-87b` | K | Kiểm soát bù; IT Admin đọc bản tối thiểu (`grounds: null` cho IT) — vế căn cứ khi đổi/hủy bàn giao xem A4-10 |
| `QĐ-87d` | K / KAD | (1) khớp; (2)(3) — A1 |
| `QĐ-87e` | K | Chức vụ chữ tự do; không mở rà soát |
| `QĐ-87g` | L / KAD | Vế người điều chuyển vào phòng chưa có Cost Center — A4-20; phần Request — A1/A2 |
| `QĐ-90e` | K | Ngừng phòng chặn bởi thuê bao (`subscription-department-use.listener.ts`) |
| `QĐ-93f` | L | Thao tác tổ chức không căn cứ: khớp; vế (2) với đổi/hủy bàn giao — A4-10 (Q3) |
| `QĐ-93g` | K | Chưa xếp phòng, xếp phòng lần đầu, luồng nghỉ rút gọn |
| `QĐ-93h` | K | Không dự án |
| `QĐ-93i` | K | Format mã |
| `QĐ-99k` | L | (a) khớp; (b) — A4-23; (c) nghỉ việc khớp, điều chuyển — A4-21 |

**3.6 Nghỉ việc (MF-2) (16)**

| Mã | TT | Ghi chú |
| --- | --- | --- |
| `QĐ-40a` | K | Chỉ định trưởng phòng mới/chưa có; tài khoản dịch vụ nhắc |
| `QĐ-48a` | L | (1) khớp; (2) ca sau ngày cuối — A4-03 |
| `QĐ-48b` | K | Dời/hủy chỉ định |
| `QĐ-48c` | L | A4-10 (Q3) |
| `QĐ-56b` | L | Không kế nhiệm license khớp; thời điểm khóa/thu hồi — A4-02, A4-07 |
| `QĐ-56c` | K | Workspace chặn đóng hồ sơ |
| `QĐ-62e` | L | Giữ gói mất dữ liệu ≤ 1 ngày khớp; định nghĩa *chặn ngay* — A4-05 |
| `QĐ-66i` | K | Nhắc, chặn đóng hồ sơ |
| `QĐ-66q` | K | Dời/hủy chỉ định chưa hiệu lực |
| `QĐ-75e` | K *sơ bộ* | Assignment dịch vụ không trong danh sách quyền cá nhân; đổi người — A3 |
| `QĐ-77f` | K / KAD | Liệt kê Request/tác vụ cấp còn mở (`open-requests/`); đóng *bị hủy* — A2/A3 |
| `QĐ-77i` | L | A4-01, A4-02 (thứ tự khóa trước thu hồi khớp — A4-34) |
| `QĐ-77k` | K | A4-36 |
| `QĐ-83c` | K *sơ bộ* | Người kế nhiệm xác nhận bàn giao — `licensing/handover` (A3) |
| `QĐ-96c` | L | A4-01, A4-05, A4-06 |
| `QĐ-100q` | L | A4-03 |

**3.7 Điều chuyển (MF-3) (14)**

| Mã | TT | Ghi chú |
| --- | --- | --- |
| `QĐ-50b` | L | A4-13, A4-14, A4-15, A4-19 (hạn 5 ngày làm việc có tham số `TRANSFER_REVIEW_WORKING_DAYS` — khớp) |
| `QĐ-56a` | L | A4-12, A4-13, A4-16 |
| `QĐ-58d` | K | Đóng điều chuyển/nghỉ việc chờ người chịu trách nhiệm tài khoản dịch vụ |
| `QĐ-66e` | K | `EFFECTIVE_DATE_IN_PAST` |
| `QĐ-66r` | KAD | Tạm dừng khuyến nghị ghost seat — A3 |
| `QĐ-87h` | L | (1) khớp; (3) — A4-12, A4-13, A4-14, A4-16 |
| `QĐ-89b` | L | Seat không đi theo người khớp; Request thay thế/chồng lấn — A4-15, A4-16; chuyển seat kèm chi phí — A3 |
| `QĐ-89c` | K *sơ bộ* | T4 không vào rà soát; người chịu trách nhiệm mới thuộc phòng cũ — A3 |
| `QĐ-90b` | K / KAD | Rà soát liệt kê Request chưa xong (`unfinishedRequests`); đóng — A2 |
| `QĐ-90c` | KAD | A3 |
| `QĐ-94f` | L | A4-12 → A4-16, A4-21 |
| `QĐ-94l` | L / KAD | (2) A4-19; (3) A4-20; (5) A4-14; (1)(4) — A1/A3 |
| `QĐ-94m` | L / KAD | (3) A4-15/A4-20; (4) A4-19; (7) A4-12; (10) A4-14; (12) khớp phần giữ gói; còn lại — A1/A3 |
| `QĐ-99b` | L | A4-20 |

**Mã liên quan ngoài bốn mục**

| Mã | TT | Ghi chú |
| --- | --- | --- |
| `QĐ-96j` | L | (1) — A4-01, A4-02, A4-03; (2)–(6) — A2/A3 |
| `QĐ-94j` | L | Hạn thu hồi 1 ngày, báo trước 2 ngày — A4-07, A4-14; hạn `BM-09` 2 ngày khớp |
| `QĐ-100x` | L | A4-04 |
| `QĐ-100z` | KAD | Chưa có sổ thiết bị (G7) |
| `QĐ-100af` | KAD | Chưa lưu dữ liệu hoạt động |
| `QĐ-100ag` | K | A4-43 (phần tài khoản) |
| `QĐ-99a`, `QĐ-98i`, `QĐ-100t` | L | A4-16 (phía rà soát); phía Request — A2 |
| `QĐ-100l`, `QĐ-100ah` | — | Điểm chờ mentor: không đánh giá, không đề xuất code (tracker) |

Đếm: 38 + 51 + 16 + 14 = **119 mã** trong bốn mục.

## 4. Câu hỏi cho Owner

**Q1 — *Chặn ngay* khi ngày làm việc cuối còn ở tương lai (A4-05, kéo theo A4-01, A4-02, A4-06).**
- *Bối cảnh:* `QĐ-96c` xếp *công ty quyết cắt quyền trước ngày cuối* vào nhịp chặn ngay, nhưng không nói trạng thái nhân viên trong khoảng từ ngày ghi tới ngày cuối. BE hiện coi chặn ngay = *đã nghỉ việc* ngay, ngày cuối ≤ hôm nay. QT-MF 2.2 viết *nhân viên chuyển đang bàn giao* cho cả hai nhịp; BRD `FR-2.12(ii)` lại nói *nghỉ đột ngột (chuyển thẳng đã nghỉ việc)*.
- *Ví dụ:* 10/11 công ty quyết chấm dứt hợp đồng của `E5`, trả lương tới 30/11 nhưng cắt mọi truy cập ngay 10/11. Hiện Super Admin chỉ có thể ghi ngày cuối 10/11 (sai hợp đồng) hoặc ghi nhịp thường (để `E5` dùng tới 30/11).
- *Thực tế bên ngoài:* *garden leave* / trả lương thay báo trước là phổ biến: quyền truy cập cắt ngay, quan hệ lao động kết thúc ở ngày hợp đồng (NIST SP 800-53 PS-4 tách *vô hiệu truy cập* khỏi *ngày chấm dứt*). Không tra web trong lượt này.
- *Phương án:* **A.** Giữ như BE: chặn ngay luôn *đã nghỉ việc* ngay; ngày cuối = ngày cắt quyền — đơn giản, mất ngày hợp đồng, báo cáo nhân sự lệch. **B.** Tách *lựa chọn chặn ngay* khỏi *đã nghỉ việc*: chặn ngay cho phép ngày cuối tương lai; nhân viên *đang bàn giao* nhưng bị chặn từ ngày ghi; IT khóa tài khoản công ty và thu hồi ngay; Super Admin chuyển *đã nghỉ việc* khi tới/qua ngày cuối; nghỉ đột ngột = chặn ngay + ngày cuối ≤ hôm nay (có thể chuyển *đã nghỉ việc* ngay). Hệ quả: đổi cột `abrupt`, sửa ~6 policy/service, hủy bàn giao trong khoảng này theo `QĐ-100q`. **C.** Như B nhưng bắt buộc chuyển *đã nghỉ việc* ngay cả khi ngày cuối tương lai (`LEFT` sớm hơn ngày cuối) — ít code hơn B nhưng trạng thái *đã nghỉ việc* sai về pháp lý trong khoảng còn hợp đồng.
- *Khuyến nghị:* **B** — đúng chữ `QĐ-96c`, khớp MF-2 (*Set Status to Left* đứng sau điểm chặn ở cả hai nhịp) và cùng cơ chế cờ chặn với A4-01.

**Q2 — Có ghi *lý do nghỉ* (xin nghỉ · công ty chấm dứt · nghỉ đột ngột) không? (A4-11)**
- *Bối cảnh:* MF-2 bước 2 và QT-MF 2.2 ghi trường này *chỉ để ghi nhận*; QĐ, BRD `FR-2.12`, `BM-04` và US không có; `QĐ-76e`, `QĐ-80e` theo hướng không lưu lý do nghỉ.
- *Ví dụ:* báo cáo *số người nghỉ do công ty chấm dứt trong quý* — hiện không lấy được.
- *Thực tế bên ngoài:* HRIS thường lưu loại chấm dứt (tự nguyện/không tự nguyện), nhưng hệ thống này không có actor/tích hợp HR (`QĐ-87a`); nguyên tắc tối thiểu hóa dữ liệu (GDPR Art. 5(1)(c)).
- *Phương án:* **A.** Không thêm; sửa MF-2/QT-MF bỏ *lý do nghỉ* — không đổi code, nhất quán với QĐ/BRD. **B.** Thêm enum tùy chọn `departureKind` chỉ hiển thị, không ảnh hưởng nhịp — 1 cột + migration nhỏ, tăng dữ liệu nhạy cảm.
- *Khuyến nghị:* **A** (QĐ/BRD/`BM-04` không yêu cầu; giữ tối thiểu dữ liệu).

**Q3 — Đổi ngày làm việc cuối / hủy bàn giao có bắt buộc căn cứ mới không? (A4-10)**
- *Bối cảnh:* `QĐ-48c` *lý do … kèm căn cứ của sự kiện nhân sự*; QT-MF 2.2 *đổi ngày hoặc hủy … cũng có căn cứ như ghi mới*; MF-2 §5.2 *kèm lý do và căn cứ*; nhưng `US-03-04` AC-14, AC-15 chỉ đòi lý do và BE chỉ thu lý do. Điều chuyển (đổi ngày/hủy) thì BE đã bắt buộc căn cứ.
- *Ví dụ:* `E1` rút đơn nghỉ việc; Super Admin hủy bàn giao chỉ với lý do "nhân viên đổi ý" — không có văn bản rút đơn đã được chấp thuận.
- *Phương án:* **A.** Bắt buộc căn cứ (loại, số/tệp, người ban hành, ngày) cho cả đổi ngày và hủy — đối xứng điều chuyển, thêm trường body + lưu ở bản ghi thay đổi; sửa US AC-14/15. **B.** Chỉ lý do (như BE) — sửa `QĐ-48c`/QT-MF/MF-2 cho khớp.
- *Khuyến nghị:* **A** (đúng nguồn đứng đầu, kiểm soát bù `QĐ-87b(3)` khi chỉ một Super Admin).

**Q4 — IT Admin ghi khóa tài khoản công ty và mở thu hồi có phải chờ *đã nghỉ việc* không? (A4-02)**
- *Bối cảnh:* tài liệu mâu thuẫn: BRD checklist `BM-08` (:523) và `US-03-04` AC-20 viết mục (1) *tại đã nghỉ việc*; MF-2 v7.6 bước 6–8 và QT-MF 2.7–2.9 viết *nhánh song song sau chặn, không chờ đã nghỉ việc*; `QĐ-77i`/`QĐ-94j` đặt hạn *thu hồi xong ≤ 1 ngày làm việc sau ngày cuối* mà việc chuyển *đã nghỉ việc* không có hạn.
- *Ví dụ:* ngày cuối thứ Tư 30/09; Super Admin nghỉ phép tới thứ Hai 05/10 mới bấm *đã nghỉ việc* ⟹ theo BE, IT không khóa/thu hồi được trước 05/10, trễ hạn 1 ngày làm việc (01/10).
- *Phương án:* **A.** Không chờ: mở khi đã bị chặn (qua ngày cuối hoặc chặn ngay) — đạt hạn `QĐ-94j`; sửa câu chữ BRD `BM-08`/AC-20. **B.** Giữ chờ *đã nghỉ việc* và thêm hạn/nhắc Super Admin chuyển trạng thái trong ngày đầu sau ngày cuối — ít code, hạn thu hồi vẫn phụ thuộc người.
- *Khuyến nghị:* **A**.

## 5. Rủi ro / ghi chú cho pha spec

- **Migration:** cờ chặn do nghỉ việc trên `app_users` (A4-01/03); đổi nghĩa/đổi tên `offboarding_cases.abrupt` (A4-05, theo Q1); `transfer_review_items` thêm nhãn + căn cứ nhãn, `overlap_ends_on`, quyết định *thu hồi mặc định*, trạng thái giữ (Cost Center/ngân sách/chờ duyệt chi), mốc đã báo trước; `transfer_reviews.due_on` cho phép tạm dừng (A4-12 → A4-20); dữ liệu cũ `NEEDS_NEW_TOOL` (A4-18); tham số mới `DEPARTURE_REVOCATION_WORKING_DAYS`, `TRANSFER_DEFAULT_NOTICE_WORKING_DAYS` (A1 sở hữu `operating-parameters`); liên kết Request thay thế ↔ dòng rà soát (A2). Mọi ràng buộc DB đặt ở migration SQL (ADR-0005).
- **Ranh giới tầng:** `identity-access` (T2) không đọc được `personnel` (T6) ⟹ cờ chặn phải do `personnel` đặt qua facade `IdentityAccessApi`, guard chỉ đọc cột của chính mình. Sweeper chạy trong tiến trình API (ADR-0018), idempotent, khóa theo thứ tự nhân viên → tài khoản.
- **Hai loại rà soát:** rà soát sau khởi tạo (`origin: POST_SETUP`) **không** có mặc định thu hồi (`FR-9.4`) — đừng áp A4-13 cho nó.
- **Bất biến cần sửa trong tài liệu BE:** `personnel/README.md` *"Không gì bị thu hồi tự động"* và *"Về trễ … chỉ được báo"*; comment `transfer-review.policy.ts:8`, `transfer-review-overdue.service.ts:13-18`, `offboarding-left.service.ts:17-22`, `offboarding.policy.ts:346`; spec cũ `docs/workspace/items/g6-offboarding-record/spec.md:74` (*quá ngày cuối không làm mất quyền*).
- **Seed/demo:** dữ liệu demo có hồ sơ *đang bàn giao* đã qua ngày cuối sẽ bị chặn đăng nhập sau A4-01 — kiểm tài khoản demo trong `ops:seed`/demo dataset (A5). Đặt ít nhất một ca chặn ngay + một ca hủy sau ngày cuối để trình MF-2; một ca điều chuyển có T1/T2/T3/T4 cho MF-3.
- **Test bị ảnh hưởng:** `test/http/personnel/**`, `test/integration/personnel/**` (offboarding, transfer-review), `test/integration/identity-access/**` (login/guard), spec `offboarding.policy.spec.ts`, `transfer-review.policy.spec.ts`, `successor-eligibility` — nhiều test đang khẳng định hành vi cũ (*vẫn đăng nhập sau ngày cuối*, *quá hạn chỉ báo*).
- **Chỉ hướng cho V1–V4 (bảng trường API):** `offboarding.dto.ts` — `abrupt` (đổi nghĩa theo Q1), `accountLock` trong body `departure` (bỏ — A4-09), body đổi ngày/hủy thiếu `grounds` (Q3); `transfer-review.dto.ts` — `NEEDS_NEW_TOOL`, `needsNewRequest`, thiếu nhãn/`overlapEndsOn`; `transfer.dto.ts` — mã cảnh báo Business Owner (A4-21), thiếu nhãn xem trước; `notice.dto.ts` — `event` thiếu lựa chọn chặn ngay (A4-06); `cost-center.dto.ts:13` — `kind` chuỗi tự do trong khi chỉ có `UNIT` (`QĐ-52b`, `QĐ-86b`).
- **Phụ thuộc agent khác:** A3 cho gỡ nguồn thu hồi (A4-04), read model phần mềm phòng (A4-12), điểm điều chỉnh thuê bao (trần A4-19/20), chuyển seat (`QĐ-99e`, `QĐ-100y`); A2 cho Request thay thế (A4-16) và trạng thái *tới bước duyệt chi*; A1 cho tham số và kiểm ngân sách; A5 cho cảnh báo (A4-07, A4-08, A4-14) và seed.
- **Tài liệu tự mâu thuẫn cần Owner/Docs sửa sau khi chốt:** BRD `BM-08` (:523) và `US-03-04` AC-20 *tại đã nghỉ việc* (Q4); MF-2/QT-MF *lý do nghỉ* (Q2); `US-03-04` AC-14/15 thiếu căn cứ (Q3).
