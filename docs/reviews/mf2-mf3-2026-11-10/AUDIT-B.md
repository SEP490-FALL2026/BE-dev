# AUDIT-B — vùng B: MF-3 điều chuyển + phần requests/licensing/budgets của MF-2 (14/11/2026)

> Reviewer chỉ đọc. Nhánh `feat/mf2-mf3`, HEAD `9580e179`, diff `06bfa6f9..HEAD`. Không sửa code/test, không chạy pnpm/jest/docker, không đổi
> git. Mọi số dòng là của **HEAD**. Working tree đang có thay đổi chưa commit của người khác (k1-checklist, beneficiary-gone-scope, CLI BM-09…),
> nhiều khả năng là bản sửa D-2/D-5/D-62/D-64; review **không** tính các thay đổi đó, chỉ ghi một lưu ý ở cuối.
>
> **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review 5 trục, phân mức Critical/Required/Optional/Nit);
> `superpowers:verification-before-completion` (verification: mỗi Critical/Required có trích code thật ở HEAD, không suy đoán). Không có
> skill domain riêng cho NestJS/Prisma; dùng mục security/performance của skill review làm equivalent.
>
> **Căn cứ** theo thứ tự: `Docs/Decisions/project-decisions.md` @ `5ef039c` (QĐ-110d/o/p/q/r, QĐ-111bg, QĐ-111az, QĐ-110m, QĐ-110i/111bc) →
> `Bộ chính sách khởi tạo.md` `POL-MF3` (mới ở `2ba9e1e`, sau mốc SPEC `373bb6b`) → `OWNER-REVIEW.md` (R-49, R-51) → SPEC v2.3 / PLAN v2.4 →
> `docs/rules/database-business.md`, `module-structure.md`. Không nhắc lại D-2, D-5, D-62, D-64, D-78, D-95 và các THIẾT-KẾ đã có của AUDIT-DN-1/2.

**Tổng:** Critical 0 · Required 4 · Optional 8 · Nit 2.

Đã kiểm và **không** thấy lỗi (tóm tắt): giải phóng cam kết đúng một lần theo sổ cái (`givenAtTransfer` + `releasedFor` theo reason/reference,
`lockSeatCommitments` đọc sổ dưới khóa); dòng nhóm và chuỗi gia hạn tách đúng theo `chainAssignmentIds`; R-49 kết thúc quyền cũ trước khi chèn quyền
mới và trả lại khi cấp hỏng (`reopenReplacedBy`); cổng `openRevocation` và grant cùng khóa thuê bao nên `hasLiveRevocation` không bị race với K1/K2;
lý do hủy `SYSTEM_*` có CHECK riêng và `_values` tách migration; trigger bất biến thêm `replaces_assignment_id` đúng bản mới nhất (`20261109130000`);
SoD-5 khi IT tự bị thu hồi vẫn kiểm ở lúc claim (`provisioning-task-frame.service.ts:60`); không có `it.skip` mới (12 trước = 12 sau); test bị xóa
chỉ là của route/tính năng đã bỏ (P12, P15, handover), test routing MF1-X được làm chặt hơn (5 ca, không nới assert).

---

## Required

### B-1 · Required · Xem trước điều chuyển báo thiếu phần cam kết lớn nhất (khía cạnh mới của D-36)

- **Chỗ:** `src/modules/personnel/transfer-grace/transfer-impact.service.ts:63`; `src/modules/personnel/transfer-grace/transfer-impact.types.ts:14-16`
  (tự ghi "Not yet counted … MF3-B.3 adds it"); phía vùng B: `src/modules/requests/public/requests.api.ts:51-61` chỉ có
  `previewBeneficiaryGone`, không có bản xem trước của `releaseForTransfer`.
- **Kịch bản:** Nhân viên Marketing giữ Figma `K2` (Request trả phí, cam kết 12 tháng của Marketing) và không có Request mở. Super Admin gọi
  `POST /department-transfers/preview` ⟹ `commitmentToRelease = []`. Ngày hiệu lực, `TransferEffectsService.apply` gọi `releaseForTransfer`
  (`transfer-effects.service.ts:36`) và trả lại phần cam kết từ ngày hiệu lực tới hết năm. Màn xem trước nói "không giải phóng gì", hệ thống giải
  phóng vài triệu đồng. D-36 chỉ nói phần dòng nhóm của Request bị hủy; đây là phần của **mọi quyền cũ**, thường lớn hơn nhiều.
- **Căn cứ:** `QĐ-111bg` ("cam kết của quyền cũ giải phóng ngay ngày hiệu lực"); SPEC P23 + S14 (xem trước dùng **cùng** service tác động với lệnh
  ghi); D-125 không ghi quyết định bỏ phần này.
- **Sửa:** thêm `RequestsApi.previewTransferRelease(tx, { effectiveOn, rights })` dùng lại đúng vòng của `SeatReleaseService.afterTransferEffective`
  nhưng đọc cam kết **không khóa** (thêm `BudgetsApi.seatCommitmentsOf(tx, requestIds, fromYear)` cùng hình `SeatCommitment`, kèm `transferReleases`)
  và không gọi `releaseForRequest`; tách phần tính `amounts` của `give()` thành hàm thuần dùng chung cho cả hai. `TransferImpactService` cộng kết
  quả theo currency vào `commitmentToRelease` (rights = `picture` ở dòng 39).
- **Mutation:** integration `impact-preview`: một người giữ `K2` có cam kết, không Request mở ⟹ kỳ vọng `commitmentToRelease[0].amountMinor` bằng
  đúng số `released` mà `releaseForTransfer` trả cho cùng dữ liệu ngày hiệu lực. Đột biến bỏ lời gọi preview mới ⟹ ca đỏ (`[]`).

### B-2 · Required · Migration hủy Request `SERVICE_ACCOUNT` và trả cam kết mà không có Audit Trail

- **Chỗ:** `prisma/migrations/20261113000900_licensing_service_accounts_converted/migration.sql:222-305` (phần 2: `UPDATE access_request_steps`,
  `spend_batch_items`, `INSERT budget_commitment_releases` dòng 283, `UPDATE access_requests … CANCELLED` dòng 291). Phần 1 cùng file có
  `INSERT INTO audit_events` (dòng 188); phần 2 thì không.
- **Kịch bản:** Một Request tài khoản dịch vụ đang `AWAITING_SPEND_DECISION` có cam kết 6 triệu. Migration đổi sang `CANCELLED`/`SYSTEM_SCOPE_REMOVED`
  và trả 6 triệu về ngân sách. Không có `ACCESS_REQUEST.CANCELLED` nên lịch sử Request (suy ra từ sự kiện audit — chính lý do D-18 viện dẫn) dừng ở
  "chờ duyệt chi"; không có `BUDGET_COMMITMENT.RELEASED` nên Finance thấy cam kết đổi `RELEASED` mà Audit Trail không có ai/khi nào/vì sao; người
  gửi và Finance không được báo (đường ứng dụng `BeneficiaryGoneClosing.cancelRequest` ghi audit để `status-rules` báo).
- **Căn cứ:** `docs/rules/database-business.md:92` ("Required audit … cùng transaction với business write"); yêu cầu review "hủy Request bằng
  migration … có Audit Trail"; đường ứng dụng tương đương `beneficiary-gone-closing.service.ts:106-127` và `commitment.service.ts:150-190`
  (mỗi lần trả có một audit `SYSTEM`). AUDIT-DN-1 xếp D-18 là OK chỉ theo phạm vi Request bị hủy, không xét audit.
- **Sửa:** trong vòng `FOR rec` của phần 2, sau mỗi `INSERT budget_commitment_releases` thêm `INSERT INTO audit_events` actor `SYSTEM`, action
  `BUDGET_COMMITMENT.RELEASED`, `after = {requestId, year, amountMinor, heldMinor: '0', reason: 'REQUEST_CANCELLED', reasonText: null}`; sau
  `UPDATE access_requests` thêm `ACCESS_REQUEST.CANCELLED` với `{requestId, from: rec.state, to: 'CANCELLED', reasonKind: 'SYSTEM_SCOPE_REMOVED',
  cancelledByEmployeeId: null, commitmentsReleased, releasedMinor}` (đúng hình `beneficiary-gone-closing.service.ts:115-126`), `correlation_id` =
  tên migration. Migration chưa triển khai nên sửa tại chỗ được (cùng phép đã dùng ở D-98). Thông báo cho người gửi: thêm dòng `notifications`
  hoặc ghi rõ ở HANDOFF là không báo (CẦN-OWNER nhỏ, khuyến nghị báo).
- **Mutation:** integration migration X-SA.1b: sau khi chạy, `SELECT count(*) FROM audit_events WHERE action IN ('ACCESS_REQUEST.CANCELLED',
  'BUDGET_COMMITMENT.RELEASED') AND correlation_id = '<migration>'` = số Request hủy + số cam kết trả. Xóa một `INSERT` ⟹ đỏ.

### B-3 · Required · CẦN-OWNER · Cấp lại đúng thuê bao sau khi hết ân hạn bị chặn `OVERLAP` dù tác vụ thu hồi chưa ai làm

- **Chỗ:** `src/modules/licensing/assignment/assignment.policy.ts:89` (`!grant.revocationUnderWay`);
  `src/modules/licensing/provisioning/tasks/provisioning-grant-writer.service.ts:164-185` (`hasLiveRevocation` ở dòng 173); `D-99 (4)` ghi nhận
  hành vi này là "không coi là lỗi" nhưng chưa ai xét theo QĐ.
- **Kịch bản:** Ân hạn 16–20/11. Ngày 18/11 người chuyển gửi lại Request Figma (`replacesAssignmentId` = quyền cũ). Trưởng phòng mới duyệt 19/11,
  Người duyệt chi duyệt 23/11. Sáng 21/11 sweeper đã mở tác vụ `TRANSFER` (QUEUED) cho quyền cũ. 23/11 IT bấm cấp ⟹ `replacedByGrant` trả `false`
  ⟹ chèn quyền mới đụng EXCLUDE ⟹ 422 `LICENSE_ASSIGNMENT.OVERLAP`. Muốn cấp, IT phải hoàn tất thu hồi (gỡ tài khoản khỏi workspace, `K1` thì hủy
  gia hạn) rồi cấp lại từ đầu — đúng thao tác ở nhà cung cấp mà R-49 muốn tránh, và người dùng mất dữ liệu/gián đoạn. Với MF-1 (trưởng phòng
  2 ngày + chi 2 ngày + Finance) ca này không hiếm.
- **Căn cứ:** `QĐ-110q` "quyền cũ vẫn thu hồi khi hết ân hạn — **trừ khi** được cấp lại đúng thuê bao: hệ thống kết thúc quyền cũ ngay lúc cấp
  (không thao tác ở nhà cung cấp, không tạo tác vụ thu hồi cho quyền đó)"; `POL-MF3` quy định 7. QĐ không giới hạn "cấp trong ân hạn"; chỉ Request
  phải **gửi** trong ân hạn.
- **Phương án:**
  - **A (khuyến nghị):** ở `endReplacedRight`, nếu tác vụ thu hồi sống của quyền cũ đang `QUEUED` (chưa ai claim) và mọi lý do còn đứng đều là
    `TRANSFER` của chính điều chuyển đó ⟹ gọi `RevocationWithdrawalService` rút lý do `TRANSFER` (tác vụ tự `CANCELLED` "no longer applying")
    trong cùng transaction rồi kết thúc quyền cũ như R-49; tác vụ đã `IN_PROGRESS` hoặc có lý do khác (nghỉ việc, ghost seat) ⟹ giữ như hiện tại.
    Thứ tự khóa: `lockLiveRevocation` trước `assignment.lock` (giống `RevocationService.open`).
  - **B:** giữ hành vi, nhưng trả mã riêng `LICENSE_ASSIGNMENT.REVOCATION_PENDING` (409) kèm `taskId` để IT biết phải làm gì, và sửa chữ `POL-MF3`/
    QĐ cho rõ "chỉ khi cấp trước khi hết ân hạn".
- **Mutation (A):** integration `transfer-grace-regrant`: hết ân hạn ⟹ sweeper mở tác vụ ⟹ cấp Request đã gửi trong ân hạn ⟹ 201, tác vụ
  `CANCELLED`, quyền cũ `valid_until` = ngày cấp, đúng 1 seat. Đột biến giữ `!revocationUnderWay` như cũ ⟹ đỏ 422. Ca hiện có "a right a task of
  revocation is working…" phải đổi thành tác vụ `IN_PROGRESS`.

### B-4 · Required · Hệ thống tự ghi (1b) "đã khóa hộp thư" từ checklist `K1` của một hồ sơ nghỉ việc **cũ đã hủy**

- **Chỗ:** `src/modules/licensing/provisioning/k1-checklist/provisioning-k1-checklist.repo.ts:65-83` (`completedOf`: mọi tác vụ thu hồi
  `COMPLETED` của người, không giới hạn thời điểm/hồ sơ); `provisioning-k1-checklist.service.ts:88-101` (`mailboxLockedAmong`);
  `src/modules/licensing/public/licensing.api.ts:195`; người gọi `src/modules/personnel/departure-closure/mailbox-lock-settlement.service.ts:50-53`.
- **Kịch bản:** Hồ sơ nghỉ việc A: sau ngày cuối IT hoàn tất thu hồi `K1` cuối, tick `MAILBOX_LOCKED`. Người lao động rút đơn ⟹ Super Admin hủy A
  (chưa `LEFT`, được phép theo S3/R-41); IT mở lại hộp thư. Ba tháng sau ghi hồ sơ B, IT ghi (1a). Người đó không còn `K1` nên theo S17 IT phải tự ghi
  (1b) sau khi thật sự khóa. Nhưng lượt quét hằng giờ thấy người này "đã tick khóa hộp thư" (tác vụ của A) ⟹ `writeForSystemIfDue(…, ticked=true)`
  ⟹ `k1RightsOpen = 0` ⟹ hệ thống ghi (1b) actor `SYSTEM` rồi có thể **tự đóng** hồ sơ B trong khi hộp thư vẫn mở. Đây là bản ghi kiểm soát an ninh
  sai (BM-08 mục 1b) và đóng hồ sơ sớm.
- **Căn cứ:** `QĐ-110e`/B-1 (đóng khi (1b) đã ghi thật), `QĐ-111az` + R-1/R-19 (khóa hẳn hộp thư chỉ sau checklist của **lần thu hồi này**), SPEC
  S17/P28.
- **Sửa:** cho `listPeopleWithMailboxLockTicked` nhận mốc theo người: `listPeopleWithMailboxLockTicked(cases: {employeeId, since: Date}[])`, với
  `since` = thời điểm chặn của hồ sơ đang xét (`block_announced_at` hoặc `created_at` của hồ sơ); repo lọc `completedAt >= since` (hoặc
  `createdAt` của tác vụ ≥ `since`). Listener `mailbox-lock-revocation.listener.ts` đã dùng checklist của chính sự kiện nên không cần đổi.
- **Mutation:** integration `departure-closure`: hồ sơ A hoàn tất `K1` có `MAILBOX_LOCKED` → hủy A → hồ sơ B ghi (1a), người không còn `K1` → chạy
  `MailboxLockSettlement.settle()` ⟹ `mailbox_lock_at` của B vẫn `NULL`. Đột biến bỏ điều kiện `since` ⟹ đỏ.

---

## Optional

### B-5 · Optional · CẦN-OWNER · Seat _tài khoản máy_ bị thu hồi và trả cam kết khi chính IT Admin giữ nó điều chuyển/nghỉ

- **Chỗ:** `src/modules/licensing/provisioning/revocation-read.repo.ts:46-54` (`personalSeatsOf` không lọc `is_machine_account`) ⟹ dùng ở
  `transfer-effects.service.ts:27` (trả cam kết), `transfer-sweep.policy.ts:307-318` (thu hồi khi hết ân hạn), `TransferImpactService`, đếm
  `rightsWithoutCompletedTask` của MF-2.
- **Kịch bản:** IT Admin ITA1 giữ seat Figma đã chuyển từ tài khoản dịch vụ của bot CI (chuỗi `predecessor_id` → dòng `SERVICE` có Request và cam
  kết của Cost Center phòng Kỹ thuật). ITA1 điều chuyển sang phòng IT khác: ngày hiệu lực hệ thống trả cam kết **của phòng Kỹ thuật** (chuỗi gồm dòng
  `SERVICE`), hết ân hạn mở tác vụ thu hồi seat của bot ⟹ pipeline gãy. Nếu ITA1 nghỉ, hồ sơ không đóng được tới khi seat bot bị thu hồi; P5 bàn giao IT
  chỉ chuyển thuê bao/ứng dụng, không chuyển seat máy.
- **Căn cứ:** `QĐ-110m` chỉ nói "nghỉ việc/điều chuyển **của người khác** không đụng tới"; không nói về chính IT Admin giữ seat.
- **A (khuyến nghị):** loại seat có cờ khỏi quyền cũ của điều chuyển (không trả cam kết, không thu hồi) vì IT Admin vẫn là IT Admin; với nghỉ việc, P5
  `it-admin-handover` chuyển luôn seat máy sang IT Admin nhận (kết thúc + chèn dòng mới như migration X-SA) và loại seat máy khỏi điều kiện đóng hồ sơ
  sau khi đã chuyển. **B:** giữ như hiện tại (bot gãy, IT tạo lại seat máy), ghi rõ ở `POL-MF2/POL-MF3`.
- **Mutation:** unit `rightsToTakeBack` với seat `isMachineAccount = true` ⟹ không có trong kết quả; đột biến bỏ lọc ⟹ đỏ.

### B-6 · Optional · CẦN-OWNER · `K1`: trả cam kết từ ngày hiệu lực, trong khi kỳ `K1` đang chạy là chi của phòng cũ

- **Chỗ:** `src/modules/requests/grant/seat-release.policy.ts:133-135` (`transferReleaseEndsOn` dùng `effectiveOn` cho cả `K1`), so với
  `revocationEndsOn` dòng 56-62 (`K1` trả từ `paidThroughOn + 1`).
- **Kịch bản:** `K1` kỳ tháng 01–30/11, hóa đơn tháng 11 chưa nhập (SBF-19). Hiệu lực 16/11 ⟹ trả cam kết 16–30/11 + tháng 12. Hóa đơn tháng 11 (đủ
  tháng, của phòng cũ theo R-51 "kỳ **sau** ngày hiệu lực mới là của phòng mới") sau đó áp vào cam kết chỉ còn 1–15/11 ⟹ phòng cũ chi vượt cam kết nửa
  tháng; giữa hai mốc ngân sách phòng cũ hiện "còn" nhiều hơn thật. Nếu hóa đơn đã nhập trước ngày hiệu lực thì `heldMinor` chặn nên đúng.
- **A (khuyến nghị):** `K1` trả từ đầu kỳ thanh toán kế tiếp sau ngày hiệu lực (ngày 1 tháng sau với kỳ tháng); `K2` giữ `effectiveOn`. **B:** giữ,
  ghi rõ Finance chấp nhận vượt nhỏ ở kỳ đang chạy.
- **Mutation:** unit `transferReleaseEndsOn('K1', '2026-11-16')` = `'2026-12-01'`; đổi lại `effectiveOn` ⟹ đỏ.

### B-7 · Optional · CẦN-OWNER · IT Admin tự bật cờ _tài khoản máy_ trên seat của chính mình

- **Chỗ:** `src/modules/licensing/machine-account/machine-account.service.ts:54-61`, `machine-account.policy.ts:29-41` (không so `actor.employeeId`
  với `current.employeeId`).
- **Kịch bản:** IT Admin bật cờ cho seat cá nhân của mình ⟹ seat rời khỏi luật ghost seat (MF-5 bỏ qua) và INV-02, rồi xin thêm seat cá nhân cùng
  thuê bao. Không ai được báo (khác SoD-5: IT tự làm việc của mình thì Super Admin được báo).
- **A (khuyến nghị):** cho phép nhưng khi `actor.employeeId === current.employeeId` thì `frame.tellSuperAdmin` như SoD-5, hoặc chặn nếu có IT Admin
  khác dùng được (cùng `selfExecutionMode`). **B:** giữ (D-19 đã cho mọi IT Admin bật).
- **Mutation:** unit service: actor = người giữ ⟹ có một thông báo Super Admin; bỏ nhánh ⟹ đỏ.

### B-8 · Optional · Thứ tự khóa ngược nhau giữa thao tác tay và sweeper ⟹ deadlock (40P01)

- **Chỗ:** claim tác vụ cấp: khóa tác vụ (`provisioning.service.ts:83` qua `frame.work`) rồi `lockEmployeeForShare`
  (`provisioning-holder.service.ts:58-61`); sweeper chặn MF-2 khóa nhân viên `FOR UPDATE` (`block-announcement.service.ts:72`) rồi
  `lockGrantOfRequest` (`beneficiary-gone-cancellation.service.ts:111`). Tương tự cấp R-49: thuê bao → quyền cũ → nhân viên (`holderOf`) với
  sweeper hết ân hạn: nhân viên → thuê bao → quyền.
- **Kịch bản:** IT claim tác vụ cấp đúng lúc lượt chặn chạy cho cùng người ⟹ Postgres hủy một bên; IT nhận 503 tạm, sweeper thử lại giờ sau. Tự
  lành nhưng trái quy ước "thứ tự khóa của lệnh trên hồ sơ" và gây lỗi khó tái hiện.
- **Sửa:** ở `claim`, khóa nhân viên `FOR SHARE` **trước** `frame.work` khóa tác vụ (đọc `assignment.employeeId` không khóa trước); ở grant
  writer, gọi `lockEmployeeForShare` ngay đầu `write` (trước `claimForGrant`).
- **Mutation:** khó với unit; integration hai kết nối (đã có mẫu ở test khóa offboarding) chạy claim và `announceOne` xen kẽ ⟹ không có 40P01.

### B-9 · Optional · Race trả cam kết ngày hiệu lực với hoàn tất thu hồi cùng lúc ⟹ trả cả phần đã dùng

- **Chỗ:** `src/modules/requests/grant/seat-release.service.ts:74-101`: danh sách quyền đọc trước (`transfer-effects.service.ts:27`, không khóa),
  `givenAtTransfer`/ledger chỉ xét `TRANSFER_EFFECTIVE`.
- **Kịch bản:** Lượt hiệu lực đọc quyền Figma còn mở; cùng lúc IT hoàn tất một thu hồi khác nguồn (ghost seat) cho quyền đó, `afterRevocation` trả
  `REVOKED` từ ngày kết thúc và commit. Lượt hiệu lực khóa cam kết, không thấy `TRANSFER_EFFECTIVE` ⟹ `revocationShare` từ ngày hiệu lực, chặn bởi
  `heldMinor` = phần **đã dùng** trước ngày kết thúc ⟹ trả luôn phần đã dùng (trả hai lần, vượt phần thật).
- **Sửa:** trong `afterTransferEffective`, sau `lockSeatCommitments` bỏ qua khoản đã có release `REVOKED` với reference `revocationTask:*` của chuỗi
  quyền (hoặc khóa `license_assignments` của quyền và kiểm còn mở trước khi tính).
- **Mutation:** unit với `SeatCommitment` có release `REVOKED` của chuỗi ⟹ `afterTransferEffective` trả 0.

### B-10 · Optional · Dòng `SERVICE` và Request bị migration "giữ lại" không có đường xử lý tiếp

- **Chỗ:** `20261113000900_…/migration.sql` phần 1 (`kept`, `RAISE NOTICE`), phần 2 (Request `EXECUTING`/`AWAITING_IT_CLOSE`); header nói Owner "chạy
  lại file" — `prisma migrate` không chạy lại migration đã áp.
- **Kịch bản:** Tác vụ cấp của Request `SERVICE_ACCOUNT` đang chạy lúc triển khai ⟹ IT hoàn tất ⟹ dòng `SERVICE` sống mãi, không có cờ máy, luật
  ghost/INV-02 vẫn theo nhánh `SERVICE` cũ; không ai biết ngoài log `NOTICE`.
- **Sửa:** một lệnh vận hành `ops:convert-service-accounts` (dùng lại SQL phần 1–2, `docs/rules/operational-commands.md`) + ghi số giữ lại vào HANDOFF.

### B-11 · Optional · Khía cạnh mới của D-88: mỗi lần mở lại tác vụ `TRANSFER` lại báo người chuyển và IT

- **Chỗ:** `src/modules/personnel/transfer-grace/transfer-revocation.service.ts:140-147` (`created > 0` ⟹ `tell` ⟹ `transferRightsRevoking`).
- **Kịch bản:** IT đóng `CLOSED_FAILED` mỗi ngày (nhà cung cấp lỗi) ⟹ mỗi lần lượt giờ tạo tác vụ mới thì người chuyển nhận lại "quyền cũ đang bị
  thu hồi". Gộp vào phương án A của D-88; nếu giữ B thì ít nhất `eventKey` thông báo theo `transfer:<id>` để chỉ báo một lần.

### B-12 · Optional · `K5`: đọc `hasLiveRevocation` trước khi khóa, không có khóa chung với `openRevocation`

- **Chỗ:** `provisioning-grant-writer.service.ts:173` đọc trước `assignments.endReplacedByGrant` khóa dòng (`assignment.service.ts:278`);
  `AssignmentEndService.lock` chỉ khóa thuê bao khi có `subscriptionId` (`assignment-end.service.ts:38`).
- **Kịch bản:** với `K1`/`K2` hai bên cùng khóa thuê bao nên an toàn; với `K5` (không thuê bao) sweeper mở tác vụ giữa lúc đọc và lúc khóa ⟹ quyền cũ
  bị kết thúc dù có tác vụ thu hồi sống; IT hoàn tất ⟹ gỡ tài khoản mà quyền mới đang dùng.
- **Sửa:** chuyển `hasLiveRevocation` vào trong `endReplacedByGrant`, **sau** `repo.lock` (hoặc `lockLiveRevocation` trước như `RevocationService.open`).

---

## Nit

- **B-13 · Nit:** `afterRightReplaced` ghi lý do `TRANSFER_EFFECTIVE` với reference `transfer:regrant:assignment:<id>` (`seat-release.service.ts:24,
  124`): sổ cam kết của Finance hiện "điều chuyển regrant" như một mã điều chuyển; FE nào tách `transferId` từ reference sẽ được `regrant`. Đặt
  reference riêng `regrant:assignment:<id>` và cho `assignmentOfTransferReference` nhận cả hai mẫu.
- **B-14 · Nit:** `ProvisioningTaskRepo.hasLiveRevocation` (`provisioning-task.repo.ts:349-355`) đếm cả `COMPLETED`; tên và JSDoc ("working the
  assignment") nói khác. Đúng kết quả (quyền đã thu hồi thì không còn mở) nhưng dễ dùng sai ở nơi khác: đổi tên `hasRevocationNotDropped` hoặc lọc
  thêm `COMPLETED`.

---

## Ghi chú ngoài phạm vi / cho người đang sửa working tree

- Bản sửa **chưa commit** của `provisioning-k1-checklist.service.ts` (`k1StillToDoOf`) dùng `Promise.all([...liveRevocationsOf(…, tx),
  …openPersonalSeatsOf(…, tx)])` trên cùng `tx` — trái `docs/rules/database-business.md:88-91` (gate `module-layout` R2 sẽ đỏ) — và
  `getOrganization()` không truyền `tx`. Đổi thành hai `await` tuần tự.
- `QĐ-111h` (đã có ở mốc `373bb6b`) bỏ GH-3 và đổi GH-2 thành "10 Request cấp mới đã gửi mỗi tuần"; `request-limits.policy.ts` vẫn đếm Request mở và
  giữ GH-3. Thuộc MF-1/SPEC FE, không thuộc SPEC này; ghi để vùng phụ trách MF-1 đối chiếu.
- Docs `5ef039c` (sau mốc SPEC) thêm `POL-MF3`: quy định 7 xác nhận R-49 không giới hạn thời điểm cấp (căn cứ B-3); quy định 8 "trách nhiệm ở phòng cũ
  chuyển ngay trong ngày hiệu lực" thuộc vùng A (X-IT).
- Flow MF-2/MF-3 (`test/flows/mf2-abrupt-departure`, `mf3-transfer`) vẫn `it.skip` trên route đã xóa (`/transfer-reviews`) — đúng kế hoạch gói Z, chưa
  đạt S12.
