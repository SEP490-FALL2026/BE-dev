# AUDIT-DN-2 — rà nghiệp vụ D-56 → D-109 của `OVERNIGHT-DECISIONS.md` (13/11/2026)

> Reviewer chỉ đọc, nhánh `feat/mf2-mf3` tại HEAD `0de15400`. Skill: `agent-skills:code-review-and-quality` (phương pháp rà),
> `superpowers:verification-before-completion` (mọi kết luận có trích nguồn/dòng code). Không chạy test, không đổi git.
>
> Phạm vi: D-56 … D-107 và D-109. **D-108 không có trong file** (số bị bỏ qua). Mục cuối đã rà: **D-109**.
> Căn cứ theo thứ tự: sổ QĐ Docs (`project-decisions.md`) → BRD → `OWNER-REVIEW.md` → SPEC v2.3/PLAN v2.4 → code.

## Tổng hợp

| Loại      | Số | Mục                                                                 |
| --------- | -- | ------------------------------------------------------------------- |
| OK        | 39 | còn lại                                                             |
| SAI-QĐ    | 4  | D-62, D-64, D-78(a), D-95                                           |
| THIẾT-KẾ  | 10 | D-68, D-73, D-75, D-81, D-85, D-87, D-88, D-103, D-104, D-105       |
| CODE-LỆCH | 0  | (một chú thích cũ ở D-72, chỉ là Nit)                               |

## Bảng

| D-n | Gói | Phân loại | Nhận xét | Nguồn |
| --- | --- | --- | --- | --- |
| D-56 | K1-CL.1 | OK | Cột `k1_checklist` ghi trước `COMPLETED` cùng transaction; chi tiết kỹ thuật, không trái luật. | SPEC P25 |
| D-57 | K1-CL.2 | OK | Checklist bắt buộc cho mọi thu hồi `K1` kể cả `STILL_EMPLOYED`; nhận bằng chứng ở hai chỗ là tương thích, không nới luật. | QĐ-111az, R-19, R-35 |
| D-58 | K1-CL.2 | OK | Thêm `doneAt` vào thẻ và nhận `done:false` ⟹ 422 là mở rộng cộng thêm, hình P25 giữ nguyên. | SPEC P25 |
| D-59 | K1-CL.2 | OK | `k1Checklist` bắt buộc trong facts, không vào audit; kỹ thuật. | — |
| D-60 | K1-CL.2 | OK | Ghi checklist qua `RevocationAftermath`, rollback cả transaction khi lỗi sau. | — |
| D-61 | K1-CL.2 | OK | Ghi sổ mảng lồng `bounded` 10; gate. | SPEC "mục ≤ 10" |
| D-62 | K1-CL-R1 | **SAI-QĐ** | "Tác vụ cuối" chỉ đếm **tác vụ** `K1` sống; ghế `K1` chưa mở tác vụ hoặc tác vụ `CLOSED_FAILED` không tính ⟹ IT bị buộc tick "đã khóa hộp thư" khi còn quyền `K1` chưa thu hồi. | QĐ-111az, QĐ-110b (R-1), SPEC S17/P28 |
| D-63 | K1-CL-O1 | OK | `details { variant, codes }` cộng thêm vào lỗi. | — |
| D-64 | K1-CL-O2 | **SAI-QĐ** | Cấm `doneAt` trước `created_at` của tác vụ, nhưng bước 1 "đặt lại mật khẩu hộp thư" theo QĐ chính là việc (1a) làm ở mốc chặn, **trước** khi IT mở tác vụ ⟹ ghi đúng giờ thật bị 422. | QĐ-110b (R-1), QĐ-110c, QĐ-111az |
| D-65 | MF2-G.1 | OK | "Người có K1" = ghế `K1` chưa có tác vụ `COMPLETED` (chặt hơn chữ SPEC, đúng ý QĐ-110e); mã có tiền tố `OFFBOARDING_CASE.`; hình `mailboxLock` lệch chữ SPEC P3 nhưng chỉ là hình wire. | QĐ-110e, B-1, SPEC P28 |
| D-66 | MF2-G.2 | OK | `SKIP LOCKED` trong listener; hậu quả "bỏ qua" đã được D-72 vá. | SPEC S17 |
| D-67 | MF2-G.3 | OK | Hệ thống tự đóng (listener + sweeper), bỏ P4, bỏ blocker trách nhiệm, bỏ `ACCESS_RUNS_ON`; code `departure-closure.service.ts:51-61` khớp. | QĐ-110e, QĐ-110j |
| D-68 | MF2-G (b) | THIẾT-KẾ | `ACCOUNT_LOCK_OVERDUE` một lần mỗi hồ sơ bằng cột dấu; IT phụ trách mới không được báo. Không QĐ nào bắt nhắc lặp cho (1a) (QĐ-110c chỉ nói tác vụ thu hồi). | SPEC MF2-E |
| D-69 | MF2-G (d) | OK | Thêm `changedBySystem` vào dòng nhật ký; cộng thêm. | QĐ-110e (G: không tài khoản giả) |
| D-70 | MF2-G (f) | OK | Đổi vị từ chỉ mục theo đo thật; hiệu năng, không đổi nghiệp vụ. | — |
| D-71 | MF2-G-R1 | OK | Hệ thống chỉ tự ghi (1b) khi không còn ghế `K1` chưa xong — đúng P28/S17. Hệ quả "bước 6 ở tác vụ đầu" là lỗi gốc của D-62, xử lý ở đó. | SPEC P28, S17 |
| D-72 | MF2-G-R2 | OK | Lượt quét tự ghi (1b) từ checklist đã lưu. Nit: chú thích `mailbox-lock-revocation.listener.ts:19-21` còn câu cũ "IT Admin then writes (1b) on the route". | QĐ-110e |
| D-73 | MF2-G-O1 | THIẾT-KẾ | Cho hủy hồ sơ đã ghi (1a)/(1b), không báo mở lại hộp thư. Không có luật trực tiếp (R-41 chỉ cấm hủy sau `LEFT`). | R-41, SPEC S3 |
| D-74 | MF1-X.1 | OK | Không trưởng phòng + có bước chi ⟹ chờ; `K5` ⟹ IT thẳng; trưởng phòng tự gửi ⟹ một bước. Code `routing.policy.ts:35-45`. | QĐ-110i, QĐ-111bc, R-43 |
| D-75 | MF1-X.2 | THIẾT-KẾ | Bỏ đánh dấu một bước ở listener và sweep (đúng QĐ-110i); còn hai điểm không có căn cứ: hoàn tất hàng `ONE_STEP` cũ, và `DEPARTMENT_WITHOUT_HEAD` chỉ báo ở `HEAD_PERIOD_END` (phòng vốn chưa có trưởng phòng nhờ `CONTROLLED_WAIT_ALERT`). | QĐ-110i |
| D-76 | MF1-X.3 | OK | Đổi kỳ vọng test có chủ đích theo QĐ-110i/R-43, sửa lỗi nhóm ghi `PENDING`; 404 cho trưởng phòng cũ là hệ quả nhất quán. | QĐ-110i, R-43 |
| D-77 | MF1-X-R | OK | Bỏ ghế `design-bot` khỏi seed. | QĐ-110m, SPEC §5 Z |
| D-78 | MF1-X-R | **SAI-QĐ** (ý a) | Request `K5` đang chờ bước nhu cầu khi mất trưởng phòng vẫn **chờ**; QĐ-110i (bản Docs) ghi "luật đứng chờ chỉ áp Request trả phí: `K5` của phòng đó được IT cấp thẳng". Sonnet chỉ ghi câu hỏi, không làm theo QĐ. Ý (b), (c) là ghi chú đúng. | QĐ-110i, QĐ-111bc |
| D-79 | MF3-A.1 | OK | Gỡ luồng rà soát, giữ nhãn/bảng; **giữ** tạm dừng khuyến nghị theo QĐ-66r (thắng chữ SPEC §5 MF3-A). | QĐ-87h(3), QĐ-66r, QĐ-110p |
| D-80 | MF3-A.2 | OK | `PERSONNEL.SUCCESSOR_REQUIRED` chung; "chưa đóng" = `EFFECTIVE AND closed_at IS NULL` ⟹ 409 `TRANSFER_SETTLING`. | QĐ-110h, QĐ-110n, QĐ-110r |
| D-81 | MF3-B.1 | THIẾT-KẾ | `graceStartsOn = max(effectiveOn, notedOn)` mở rộng luật triển khai sang ca hệ thống chốt muộn; QĐ chỉ nói "ngày hiệu lực là ngày 1" và ca trước triển khai. | QĐ-110p |
| D-82 | MF3-B.2 | OK | Migration m-17 phủ mọi điều chuyển `EFFECTIVE` chưa đóng, ân hạn từ ngày triển khai. | QĐ-110p (mục G), QĐ-110r |
| D-83 | MF3-B.3 | OK | K1/K2 giải phóng từ ngày hiệu lực; câu 2 (luật theo nguồn) đã bị D-86 thay và code đã bỏ `releasedAtTransfer`. | QĐ-111bg |
| D-84 | MF3-B.4 | OK | Mở ân hạn trong mọi đường chốt, hủy Request trả phí phòng cũ, báo đủ vai; test AC-6 đổi đúng luật. | QĐ-110o, QĐ-110p, QĐ-111bg |
| D-85 | MF3-B.5 | THIẾT-KẾ | Dòng danh sách P7 chỉ có `phase`/`grace`, `oldRights`… chỉ ở chi tiết — lệch chữ SPEC P7, không trái QĐ. | SPEC P7 |
| D-86 | MF3-B-R1 | OK | Luật sổ cái từng khoản ⟹ đúng "một lần". | QĐ-111bg, SPEC S4 |
| D-87 | MF3-B-R2 | THIẾT-KẾ | Điều chuyển m-17 được trả cam kết lúc thu hồi (từ ngày kết thúc quyền), không từ ngày hiệu lực/ngày triển khai. | QĐ-111bg, QĐ-110p (mục G) |
| D-88 | MF3-C.1 | THIẾT-KẾ (câu 2) | Quyền cũ, nhắc, báo: khớp QĐ. Câu 2: tác vụ `TRANSFER` bị IT đóng `CLOSED_FAILED` được mở lại **mỗi giờ** — không có căn cứ (MF-2 thì IT mở lại tay). | QĐ-110p, QĐ-110e |
| D-89 | MF3-C.2 | OK | Đóng khi hết ân hạn và không còn quyền cũ; `SUPERSEDED` bằng cột; nghỉ việc trong ân hạn tiếp quản. | QĐ-110r |
| D-90 | MF3-C.3 | OK | `Contributions`, quyền cũ theo ảnh chụp/ngày, miễn trừ `ALREADY_HOLDS_ACCESS` + GH-1/GH-2 (về sau D-95 làm sai lại GH-1). Ghi chú ngoài phạm vi: D-90 ghi "không bỏ GH-3" nhưng QĐ-111h đã **bỏ GH-3**, code vẫn còn GH-3. | QĐ-110q, QĐ-111h |
| D-91 | MF3-C.4 | OK | Kết thúc quyền cũ cùng giao dịch chèn quyền mới, đảo khi cấp hỏng/hủy; câu 5 đã bị D-93 thay. | QĐ-110q, R-49 |
| D-92 | MF3-C-R1 | OK | Quyền cũ theo ảnh chụp ngày hiệu lực, một định nghĩa cho P10/sweeper/đóng. | QĐ-110q, R-49 |
| D-93 | MF3-C-R2 | OK | Cấp lại K1 không mua thêm ghế. | R-49, SPEC S5 |
| D-94 | MF3-C-R3 | OK | Cấp lại giải phóng cam kết quyền cũ theo sổ cái. | QĐ-111bg, R-49 |
| D-95 | MF3-C-R4 | **SAI-QĐ** | Dưới `TRANSFER_GRACE` vẫn chặn GH-1 phần "đang có Request mở cùng gói"; QĐ-110q ghi rõ "không tính GH-1/GH-2", SPEC P10 "bỏ … GH-1/GH-2". | QĐ-110q, QĐ-103c, QĐ-108c, SPEC P10/S5 |
| D-96 | MF3-C-R5a | OK | Không đóng khi còn cấp lại đang chờ; code `transfer-sweep.policy.ts:107-113`. | QĐ-110r, R-49 |
| D-97 | MF3-C-R5b | OK | Hủy hồ sơ nghỉ việc ⟹ mở lại điều chuyển, ân hạn đi tiếp. | QĐ-110p, QĐ-110r |
| D-98 | MF3-C-R6 | OK | `replaces_assignment_id` bất biến bằng trigger. | — |
| D-99 | ghi chú | OK | Ghi nhận đúng: tác vụ `TRANSFER` không có `due_on` (chưa có QĐ SLA), mở thu hồi ngày lịch kế tiếp. | — |
| D-100 | X-IT.1 | OK | 4 phòng `ACTIVE`, khóa `FOR UPDATE` dòng IT Admin đích, luật ở cổng chung `assertUsable`; code `department-it-admin.service.ts:25-30`, `department.repo.ts:419-425`. | QĐ-110l, SPEC P20 |
| D-101 | X-IT.2 | OK | Facade có `actor`, Audit theo từng tài nguyên, đếm mọi thuê bao/ứng dụng. | QĐ-110j, QĐ-111g |
| D-102 | X-IT.3 | OK | Bảng `it_admin_handovers`, mốc = ngày chặn/ngày hiệu lực, hàng việc IT chung bằng thông báo mọi IT Admin, mã 422 theo SPEC. Lệch PLAN (thêm migration) có lý do. | QĐ-110j, R-26, SPEC P5 |
| D-103 | X-IT.4a | THIẾT-KẾ | Không thêm `hasAdminConsole` vào bản đánh giá case B (SPEC P29 có liệt kê route này); cờ gói chỉ đặt ở `POST/PATCH /plans`. | QĐ-110k (R-53), SPEC P29 |
| D-104 | X-IT.4b | THIẾT-KẾ | Người không phải IT Admin dùng được ⟹ `PLAN.WORKSPACE_PERSON_INVALID`; SPEC P19 gom vào `PLAN.VENDOR_ADMINS_INVALID`. | SPEC P19, QĐ-110k |
| D-105 | X-IT.5 | THIẾT-KẾ | Kích hoạt chỉ đếm số người **đã ghi** trên hồ sơ, không kiểm còn là IT Admin làm việc lúc kích hoạt. | QĐ-110k, QĐ-110u, QĐ-111r |
| D-106 | X-IT.6 | OK | Cảnh báo ở tác động (nghỉ việc và điều chuyển), cờ < 2 từ mốc chặn, 0 ⟹ mọi IT Admin; chuyển phòng không làm mất vai IT nên không báo. Fix X-IT-R1 (`3db4746f`) vẫn đúng ý D-106. | QĐ-110k, SPEC T-IT |
| D-107 | X-IT.7 | OK | Chỉ kho `K2`/`K4`, báo IT phụ trách thuê bao, không báo người tự mua, không ai ⟹ hàng chung; code `subscription-seat-increase.policy.ts:8-32`. | QĐ-110v, S-4, SPEC P24 |
| D-109 | X-IT-R2 | OK | Thêm hồ sơ hai người ở chỗ dựng gói của test cũ, không nới assert. | D-105 |

## Chi tiết SAI-QĐ

### D-62 — "tác vụ `K1` cuối" bỏ sót ghế `K1` chưa có tác vụ hoàn tất

- **Nguồn.**
  - `QĐ-111az`: "… ghi bằng chứng ⟹ **sau cùng** khóa hộp thư".
  - `QĐ-110b` (làm rõ R-1): "khóa hẳn hộp thư chỉ sau khi xong checklist `K1`".
  - SPEC S17: "(1b) … người có `K1` chỉ ghi được sau khi **mọi** tác vụ thu hồi `K1` xong".
- **Code sai.**
  - `src/modules/licensing/provisioning/k1-checklist/provisioning-k1-checklist.service.ts:71-75` (hoàn tất) và `:122-127` (thẻ):
    `lastOfPerson = others.every((id) => id === task.id)`, với `others` chỉ là **tác vụ** `K1` sống (`liveK1Of`).
  - Hai ca bị sai:
    - Ghế `K1` thứ hai chưa mở tác vụ (IT mở thu hồi một phần qua `assignmentIds`).
    - Tác vụ của ghế kia đã `CLOSED_FAILED`.
  - Ở cả hai ca, tác vụ đang làm bị coi là "cuối". Thẻ đòi mục 6 `MAILBOX_LOCKED` (thiếu ⟹ 422 `K1_CHECKLIST_INCOMPLETE`). IT buộc phải khóa hộp thư sớm (ghế
    còn lại cần hộp thư mở cho mục 1–2) hoặc tick không đúng sự thật. D-71 chỉ chặn hệ thống tự ghi (1b), không gỡ yêu cầu tick trên thẻ.
- **Cách sửa.**
  - `lastOfPerson` = không còn tác vụ `K1` sống nào khác **và** không còn ghế `K1` cá nhân nào khác chưa có tác vụ thu hồi `COMPLETED`.
  - Dùng cùng truy vấn với `countPersonalSeatsOfKindWithoutCompletedTask(…, 'K1')`, trừ ghế của chính tác vụ này. Đây là truy vấn của licensing, nằm cùng module.
  - Thẻ và hoàn tất dùng chung hàm, giữ khóa advisory theo người.
  - Hình wire không đổi: chỉ số mục (5/6) đổi theo điều kiện mới.
- **Test / mutation.**
  - Integration `provisioning-k1-checklist`:
    - 2 ghế `K1`, mở thu hồi 1 ghế ⟹ thẻ 5 mục; gửi `MAILBOX_LOCKED` ⟹ 422 `COMPLETION_NOT_ALLOWED`; mở nốt ghế kia ⟹ thẻ của nó 6 mục.
    - Ghế kia có tác vụ `CLOSED_FAILED` ⟹ 5 mục.
  - Mutation: bỏ vế đếm ghế ⟹ hai ca trên đỏ.

### D-64 — cấm `doneAt` trước lúc tạo tác vụ trái trình tự nghiệp vụ

- **Nguồn.**
  - `QĐ-110b` (R-1): "*Chặn* tài khoản công ty = admin đặt lại mật khẩu hộp thư và đăng xuất mọi phiên". Việc này là (1a), làm ở mốc chặn.
  - `QĐ-110c`: "IT Admin bấm mở tác vụ thu hồi **sau khi chặn**".
  - `QĐ-111az`: bước 1 của checklist nghỉ việc = "đặt lại mật khẩu hộp thư".
  - Vì vậy, theo QĐ, bước 1 (và thường bước 3) được làm **trước** khi tác vụ `K1` tồn tại.
- **Code sai.**
  - `src/modules/licensing/provisioning/k1-checklist/provisioning-k1-checklist.policy.ts:186-189` (`time < opened` ⟹ `K1_CHECKLIST_OUT_OF_ORDER`).
  - `provisioning-k1-checklist.service.ts:67` truyền `openedAt: task.createdAt`.
  - Hệ quả: IT ghi đúng giờ đã đặt lại mật khẩu ở bước (1a) thì nhận 422. Người có hai ghế `K1` càng chắc bị: tác vụ thứ hai luôn sinh sau lần đặt lại mật khẩu duy nhất.
  - Test support đã né ca thật bằng cách đặt mọi bước ở "bây giờ + 1 giây".
- **Cách sửa (đơn giản nhất).**
  - Bỏ cận dưới `openedAt` (giữ luật không giảm theo `order` của SPEC P25).
  - Nếu Owner vẫn muốn một cận dưới, dùng mốc chặn của hồ sơ nghỉ việc. Licensing không đọc được mốc này, nên phải truyền qua facts. Không khuyến nghị.
- **Test / mutation.**
  - Integration: ghi (1a), sau đó mở tác vụ `K1`, rồi hoàn tất với `MAILBOX_PASSWORD_RESET.doneAt = accountLockAt` (trước `created_at`) ⟹ 200.
  - Mutation: thêm lại `time < opened` ⟹ đỏ.
  - Spec `provisioning-k1-checklist-opened.policy.spec.ts` đổi kỳ vọng tương ứng.

### D-78 (ý a) — Request `K5` đang chờ trưởng phòng vẫn đứng chờ

- **Nguồn.** `QĐ-110i` (sổ Docs, dòng 391): "Luật đứng chờ chỉ áp Request **trả phí**: phần mềm nội bộ miễn phí (`K5`) của phòng đó được IT
  cấp thẳng, gắn cờ audit cho Super Admin". Câu này không phân biệt Request mới hay Request đang chờ. `QĐ-111bc` làm rõ cùng ý.
- **Code sai.**
  - `src/modules/requests/step-routing/reassignment.policy.ts:113` (`WAIT` khi bảng không còn ai) áp cho mọi bước `NEED`, kể cả Request có
    `chainHasSpendStep = false`.
  - D-78 tự nhận là "khác kết quả tùy thời điểm gửi" nhưng để thành câu hỏi Owner. Nguyên tắc của file là làm theo QĐ hiện hành.
- **Cách sửa.**
  - Trong `StepReassignmentService`, khi bước `NEED` của Request **không có bước chi** mất người giữ hoặc đang chờ `NO_DEPARTMENT_HEAD`:
    - kết thúc bước nhu cầu là `NOT_REQUIRED` với lý do `NO_DEPARTMENT_HEAD`;
    - gắn cờ `NO_NEED_APPROVER`;
    - chuyển sang `IT_EXECUTION`.
  - Làm như đường gửi mới ở `routeNeedStep`, theo `routing.policy.ts:38-40`.
  - Ca hiếm (kế nhiệm bắt buộc), nên có thể làm ở gói sau. Cần Owner xác nhận ưu tiên.
- **Test / mutation.**
  - `department-head-loss.integration-spec`: Request `K5` đang chờ trưởng phòng, kỳ trưởng phòng kết thúc không kế nhiệm ⟹ Request sang IT, có cờ.
  - Mutation: để `WAIT` ⟹ đỏ.

### D-95 — dưới ân hạn vẫn chặn GH-1 "trùng Request mở cùng gói"

- **Nguồn.**
  - `QĐ-110q`: "Request cá nhân trong ân hạn cho phần mềm đang giữ được bỏ chặn *đang có quyền* và **không tính GH-1/GH-2**".
  - `QĐ-103c`: GH-1 = "không xin **gói** đang có quyền **hoặc đang có Request mở**".
  - `QĐ-108c` (ca anh em): "**không** bị GH-1 chặn và không được GH-2 đếm (như ca xin lại trong ân hạn `MF-3` — `QĐ-110q`)".
  - SPEC P10: "bỏ `ALREADY_HOLDS_ACCESS` + GH-1/GH-2".
  - Lý do của D-95 ("QĐ-110q chỉ giải phóng số đếm") đọc sai chữ QĐ. Đây là việc review MF3-C yêu cầu, nhưng đi ngược QĐ mà không ghi đề xuất đổi QĐ.
- **Code sai.**
  - `src/modules/requests/request-limits/request-limits.policy.ts:68-86` (nhánh `TRANSFER_GRACE` trả `HAS_OPEN_REQUEST`), cùng chú thích `:7-8` và `:46`.
  - `request-limits.service.ts:64-78` (đọc `openIncludingExempt`).
  - `request-limits.repo.ts:35-49` (`includeExempt`).
- **Cách sửa.**
  - Trả nhánh `TRANSFER_GRACE` về như `ROLE_ENDED`: `refusal: null`.
  - Bỏ `openIncludingExempt` và cờ `includeExempt`, rồi sửa lại lời mô tả `limitExemption`.
  - Nếu Owner thật sự muốn chống xin trùng trong ân hạn, phải ghi QĐ sửa `QĐ-110q` trước, rồi mới code.
- **Test / mutation.**
  - Đổi kỳ vọng hai ca policy và ca integration `transfer-grace-rerequest`: Request thứ hai cùng gói trong ân hạn ⟹ 201, `limitExemption = TRANSFER_GRACE`.
  - Mutation: thêm lại kiểm trùng ⟹ đỏ.

## Phương án cho THIẾT-KẾ

| D-n | A (khuyến nghị) | B | Sonnet chọn |
| --- | --- | --- | --- |
| D-68 | Giữ "một lần mỗi hồ sơ" bằng cột `account_lock_overdue_at`. Đây là đúng chữ D-50/SPEC MF2-E, chống trùng đa instance. | Báo thêm IT phụ trách mới khi người phụ trách đổi, dùng khóa sự kiện theo người nhận. | A |
| D-73 | Cho hủy, giữ (1a)/(1b) trên hồ sơ hủy. IT đọc được qua thông báo `DEPARTURE_CANCELLED`. | Kèm thông báo/mục việc "mở lại hộp thư" cho IT phụ trách khi hủy hồ sơ đã có (1b). | A |
| D-75 | Bỏ đánh dấu một bước mới. Hàng đã đánh dấu trước triển khai vẫn hoàn tất một bước. `DEPARTMENT_WITHOUT_HEAD` chỉ ở `HEAD_PERIOD_END`; phòng vốn chưa có trưởng phòng dựa vào `CONTROLLED_WAIT_ALERT`. | Migration đưa hàng `ONE_STEP`/`HEAD_LEFT` chưa có bước chi về chờ trưởng phòng, và báo `DEPARTMENT_WITHOUT_HEAD` cả lúc gửi vào phòng chưa từng có trưởng phòng. | A |
| D-81 | `graceStartsOn = max(effectiveOn, notedOn)`: không bao giờ thu hồi sớm hơn số ngày đã báo. Owner xác nhận là mở rộng của mục G `QĐ-110p`. | Luôn lấy ngày hiệu lực làm ngày 1; ngày triển khai chỉ dùng trong migration. | A |
| D-85 | Dòng danh sách chỉ có `phase`/`grace`, chi tiết đủ trường (giữ `API-LIST-DETAIL.1`). Cần sửa chữ SPEC P7 cho khớp. | Mọi trường ở cả danh sách, đúng chữ SPEC P7. Phải đọc licensing theo trang, không theo từng dòng. | A |
| D-87 | Trả cam kết điều chuyển m-17 lúc thu hồi, theo sổ cái (đơn giản, không thêm đường mới). Owner chấp nhận phần lệch nhỏ với QĐ-111bg: phòng cũ giữ cam kết thêm khoảng 5 ngày ân hạn. | Trả ngay ở lúc sweeper chụp ảnh m-17, tính từ max(ngày hiệu lực, ngày triển khai), đúng chữ "giải phóng ngay ngày hiệu lực". | A |
| D-88 (câu 2) | Sau `CLOSED_FAILED`, không tự mở lại mỗi giờ: điều chuyển giữ mở, tác vụ hiện ở hàng việc. IT mở lại tay như MF-2 (`QĐ-110e`), hoặc tối đa một lần mỗi ngày làm việc. | Mỗi lượt giờ hỏi lại cổng `openRevocation`: tác vụ mới sinh ngay sau khi IT đóng thất bại, có thể lặp. | B |
| D-103 | Khi nối Request case B vào gói `K4` mà bản đánh giá `adminConsole = true` và gói chưa có cờ: đặt cờ trong cùng lệnh, hoặc trả 422. Như vậy luật ≥ 2 admin (`QĐ-110k`, "IT đặt cờ khi đánh giá hoặc tạo gói") không bị bỏ sót. | Chỉ đặt cờ ở `POST/PATCH /plans`, FE điền sẵn từ bản đánh giá; server không ràng. | B |
| D-104 | Giữ hai mã: `WORKSPACE_PERSON_INVALID` cho từng người sai (có `employeeId`), `VENDOR_ADMINS_INVALID` cho thiếu người. Sửa chữ SPEC P19 cho khớp. | Gom mọi lỗi người vào `PLAN.VENDOR_ADMINS_INVALID`, đúng chữ SPEC P19. | A |
| D-105 | Kích hoạt đếm số người trên hồ sơ **còn là IT Admin làm việc** (`workingAdminsAmong`), sát chữ `QĐ-110k` "đều là IT Admin đang làm việc" lúc đăng ký. Hồ sơ cũ thiếu thì IT `PUT` lại. | Đếm số người **đã ghi**; người rời sau đó chỉ làm bật cờ `vendorAdminsBelowMinimum`, không chặn kích hoạt. | B |

## Ghi chú ngoài phạm vi D-n

- GH-3 (`judgeNewRequestLimits`, `manyPaidSoftware`) và GH-2 đếm "đang mở" (`openNew.length >= openLimit`,
  `request-limits.policy.ts:91`) vẫn là luật cũ. `QĐ-111h` đã đổi GH-2 sang "10 Request cấp mới trong một tuần lịch" và **bỏ GH-3**. Không thuộc
  MF-2/MF-3; cần gói QĐ-111 xác nhận đã lên lịch.
