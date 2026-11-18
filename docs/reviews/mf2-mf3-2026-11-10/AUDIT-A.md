# AUDIT-A: vùng A (MF-2 nghỉ việc, identity-access, devices, CLI BM-09, phía personnel của điều chuyển)

> Reviewer chỉ đọc, 14/11/2026, nhánh `feat/mf2-mf3` HEAD `9580e179`, phạm vi diff `06bfa6f9..HEAD`. Không sửa code/test, không chạy
> pnpm/jest/docker, không đổi git. Mọi kết luận dưới đây dựa trên đọc code thật (dẫn file:dòng) và grep.
>
> Thứ tự căn cứ: sổ QĐ (Docs main `5ef039c`: `QĐ-110`, `QĐ-111`, `QĐ-112`) → BRD 4.13 → `OWNER-REVIEW` → SPEC v2.3 / PLAN v2.4. Docs từ
> `373bb6b` tới `5ef039c` chỉ thêm `QĐ-112` (bộ chính sách, `POL-MF2` là văn bản diễn giải, không đổi luật MF-2) ⟹ không có lệch luật mới
> so với mốc SPEC ghim ở vùng A.
>
> Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (quy trình rà 5 trục, phân mức Critical/Required/Optional/Nit — đóng vai process +
> review skill), `superpowers:verification-before-completion` (mỗi kết luận có trích code/grep; không tuyên bố test xanh/đỏ vì không được chạy).
> Không có skill domain riêng cho NestJS/Prisma; dùng rule repo (`AGENTS.md`, `docs/rules/*`) thay thế.
>
> Không nhắc lại D-2, D-5, D-62, D-64, D-78, D-95 (AUDIT-DN-1/2) và các mục THIẾT-KẾ đã ghi ở đó (D-31, D-42, D-48, D-68, D-81, D-88…), trừ
> khi có khía cạnh mới (ghi rõ).

## Tổng

| Mức      | Số | Mã             |
| -------- | -- | -------------- |
| Critical | 0  | —              |
| Required | 2  | A-1, A-2       |
| Optional | 3  | A-3, A-4, A-5  |
| Nit      | 1  | A-6            |

Đã rà mà **không** thấy lỗi: chặn ngay ⟹ ngày cuối = hôm nay, `LEFT` ngay, kế nhiệm hiệu lực hôm sau (`offboarding.policy.ts:18-29`, `:78-89`,
`:247-253`); hạn thu hồi trên hồ sơ và bộ số T-MF2 (`departure-deadline.policy.ts:13-56` + spec); nhắc quá hạn mỗi ngày làm việc
`offboarding:<case>:<day>`; hủy sau ngày cuối rút lý do tác vụ + kết thúc đăng ký thiết bị, `LEFT` ⟹ 409 `CASE_LEFT`; (1b) và tự đóng (trừ A-1);
P5 chuyển trách nhiệm IT (`it-handover.policy.ts:148-160`); P23 xem trước chạy trong transaction luôn rollback (`impact-preview-frame.service.ts`);
khóa theo thứ tự employee → case ở mọi sweeper/listener (listener dùng `SKIP LOCKED`); kiến trúc: personnel chỉ gọi module khác qua `public/`,
không query bảng module khác, bảng mới `it_admin_handovers` có trong `PRISMA_MODEL_OWNER`; migration vùng A đều expand-only, enum ở
`20261113000000_mf23_values`/`…001000_devices_end_cause_values` riêng, CHECK/guard được thay đúng, backfill `revocation_due_on` có đếm trước/sau.
Test bị xóa/sửa ở vùng A: chỉ xóa ca bàn giao/tài khoản dịch vụ/rà soát điều chuyển (luật đã bỏ — `QĐ-110g/m/p`); không thấy `it.skip` mới
(các `it.skip` ở `test/flows/mf2-*`, `mf3-transfer` có từ trước, gói Z bị bỏ theo lệnh).

---

## A-1 · Required · Hồ sơ có thể tự đóng **trước** khi hệ thống công bố mốc chặn ⟹ Request còn mở của người nghỉ không bao giờ bị hủy

File:dòng:

- `src/modules/personnel/departure-closure/departure-closure.service.ts:51-63` (`closeIfDue` chỉ hỏi `LEFT` + (1a) + (1b) + số seat chưa có
  tác vụ `COMPLETED`; không hỏi `block_announced_at`).
- `src/modules/personnel/departure-closure/departure-closure.repo.ts:81-93` (`closeBySystem` cũng không ràng buộc `blockAnnouncedAt`).
- `src/modules/personnel/departure-deadline/block-moment.repo.ts:94` (`pageUnannounced` lọc `closedAt: null`) và `:127-130` (`lockOpen`
  … `AND closed_at IS NULL`).
- `src/modules/personnel/offboarding/offboarding-case-writer.service.ts:209-217` (chặn ngay ⟹ `LEFT` ngay trong transaction ghi).

**Kịch bản.** Super Admin ghi `BLOCK_NOW` cho nhân viên không giữ seat nào, có 1 Request trả phí đang chờ trưởng phòng (cam kết đang giữ).
Hồ sơ `LEFT` ngay. Vài phút sau IT Admin gọi `POST …/account-lock` (được: `LEFT` ⟹ `isBlocked`) rồi `POST …/mailbox-lock` (không có `K1` ⟹ ghi
ngay) ⟹ `MailboxLockService.record` gọi `closeIfDue` ⟹ đủ điều kiện ⟹ hồ sơ đóng (actor `SYSTEM`). Lượt `BlockMomentSweeper` kế tiếp (tối đa
1 giờ sau, hoặc lâu hơn nếu API vừa khởi động lại / lượt trước lỗi) không bao giờ thấy hồ sơ vì cả trang lẫn khóa đều đòi `closed_at IS NULL`.
Hậu quả, đều vĩnh viễn:

1. Request còn mở của người nghỉ **không bị hủy**, cam kết không giải phóng (trái `QĐ-110d`, `BR-MF2-04`, SPEC S1); trưởng phòng/Người duyệt
   chi vẫn thấy Request của người đã nghỉ. Không đường nào khác hủy: `OpenRequestsSource` chỉ ghi audit
   (`offboarding/open-requests/open-requests.listener.ts:45-66`).
2. Không có dòng nhật ký/audit `ACCESS_BLOCKED`, không thông báo `DEPARTURE_ACCESS_BLOCKED`.
3. Người nghỉ là IT Admin: không có thông báo hàng việc IT chung `IT_ADMIN_HANDOVER_PENDING` (`R-26`, `QĐ-110j`) và `VENDOR_ADMINS_BELOW_MINIMUM`
   (`QĐ-110k`) — cả hai chỉ được gọi từ `BlockMomentEffects.apply` (`departure-deadline/block-moment-effects.service.ts:174-179`).

Ca `WITH_LAST_DAY` cũng chạm được nếu IT đóng đủ việc trước lượt quét đầu sau 00:00 (ít gặp hơn). Test hiện có luôn gọi `announce()` trước khi
đóng (`test/integration/personnel/departure-closure-chain.integration-spec.ts:88-92`), nên không phủ đường này.

**Căn cứ.** `QĐ-110d` ("tới mốc chặn, hệ thống tự hủy Request còn mở của người nghỉ"), `QĐ-110e` (đóng là bước cuối của luồng), `QĐ-110j`/`R-26`,
`QĐ-110k`; SPEC S1, MF2-E, MF2-G; sơ đồ MF-2 bước 7 → 10.

**Cách sửa (A — khuyến nghị):** bất biến "đã đóng ⟹ đã công bố mốc chặn".

- `OffboardingRecord` (`offboarding/offboarding.types.ts`) hiện **không** có `blockAnnouncedAt`: thêm trường và map ở `toRecord`
  (`offboarding/offboarding.repo.ts`); `departure-closure.service.ts:52` thêm `|| held.blockAnnouncedAt === null`; `departure-closure.repo.ts`
  `closeBySystem` thêm `blockAnnouncedAt: { not: null }` vào `where`; `pageClosable` thêm cùng điều kiện.
- (tùy chọn) `blockersOf` thêm `BLOCK_NOT_ANNOUNCED: 1` để P3 nói vì sao chưa đóng; `BlockAnnouncementService.announceOne` gọi
  `DepartureClosureService.closeIfDue(tx, …)` cuối transaction để không phải chờ thêm một lượt quét.

**B:** cho `pageUnannounced`/`lockOpen` của luồng công bố nhận cả hồ sơ đã đóng (bỏ `closedAt: null` ở `block-moment.repo.ts:94`, `:130`
cho riêng đường công bố). Nhược: hồ sơ đã "đóng" vẫn sinh hủy Request/thông báo sau đó — thứ tự sự kiện ngược.

**Mutation chứng minh.** Viết test mới trong `test/integration/personnel/departure-closure.integration-spec.ts`: "chặn ngay, không seat, 1 Request
`PENDING_HEAD`; ghi (1a) rồi (1b) ngay ⟹ `closed: false`, Request còn mở; `BlockAnnouncementService.announce()` ⟹ Request `CANCELLED`
(`BENEFICIARY_GONE`), hồ sơ `closed: true`". Sau khi sửa, mutation xóa `|| held.blockAnnouncedAt === null` ở `departure-closure.service.ts:52` (và
điều kiện tương ứng ở `closeBySystem`) ⟹ test này phải đỏ ở assert `closed: false`.

---

## A-2 · Required · `CẦN-OWNER` · Seat _dùng cho tài khoản máy_ của IT Admin nghỉ việc/điều chuyển bị coi là quyền cá nhân phải thu hồi

File:dòng:

- MF-2: `src/modules/licensing/provisioning/revocation-read.repo.ts:161-181` (`countPersonalSeatsWithoutCompletedTask`) và `:45-92`
  (`personalSeatsOf`) không lọc `is_machine_account` (vùng B, nhưng là định nghĩa MF-2 dùng); `PersonalSeat` không có trường cờ
  (`licensing/public/licensing.types.ts:493-509`) nên personnel không phân biệt được. Hệ quả ở vùng A:
  `personnel/departure-closure/departure-closure.service.ts:55` (chặn tự đóng), `departure-deadline/revocation-overdue.service.ts:61-66`
  (nhắc quá hạn mỗi ngày), `offboarding/offboarding.policy.ts:351-352` (mở thu hồi không nêu tên ⟹ chọn cả seat máy),
  `departure-deadline/departure-impact.service.ts:104` (P23 liệt kê là quyền sẽ thu hồi).
- MF-3: `personnel/transfer-grace/transfer-sweep.policy.ts:65-76` (`rightsToTakeBack`) ⟹ hết ân hạn **hệ thống tự mở** tác vụ thu hồi seat máy
  (`transfer-revocation.service.ts:126-139`), trong khi `replacedByGrant` (D-91/D-93) đã loại seat máy nên người chuyển cũng không "xin lại" được.
- Liên vùng B: `prisma/migrations/20261113000900_licensing_service_accounts_converted/migration.sql:31-44` (`slm_usable_it_admin`) chỉ kiểm
  `employees.status = 'ACTIVE'`, không kiểm IT Admin đích có hồ sơ nghỉ việc/điều chuyển đang mở (chỉ người chịu trách nhiệm cũ được kiểm,
  `:132-139`) ⟹ seat máy có thể được chuyển ngay cho một IT Admin đang `HANDING_OVER`, rơi thẳng vào danh sách thu hồi của hồ sơ đó.

**Kịch bản.** IT Admin `ITA1` giữ seat Figma có cờ _tài khoản máy_ (bot CI, từ migration X-SA). `ITA1` nghỉ có ngày cuối. (a) MF-2: hồ sơ không tự
đóng tới khi seat bot bị thu hồi; mỗi ngày làm việc sau hạn IT + Super Admin bị nhắc; IT bấm "mở thu hồi tất cả" sẽ kéo cả bot. (b) MF-3: `ITA1`
chuyển phòng ⟹ ngày thứ 6 hệ thống tự tạo tác vụ thu hồi seat bot giao IT phòng mới, không ai quyết. Bot ngừng chạy.

**Căn cứ.** `QĐ-110m` + làm rõ R-9: seat máy "ghi như seat thường của một IT Admin… nghỉ việc/điều chuyển **của người khác** không đụng tới";
QĐ **không** nói gì khi chính IT Admin giữ seat máy rời đi. `QĐ-110j` chỉ chuyển "thuê bao và ứng dụng". Không có D-n nào xử lý (grep
`OVERNIGHT-DECISIONS.md` "machine"/"tài khoản máy": chỉ D-17…D-24, D-91/D-93). ⟹ điểm nghiệp vụ không có căn cứ.

**Phương án.**

- **A (khuyến nghị):** seat máy không phải quyền của người, là việc bàn giao IT. (1) `PersonalSeat` thêm `isMachineAccount`; MF-2 đếm/nhắc/đóng và
  `revocationSelection` mặc định **bỏ qua** seat máy, P3/P23 liệt kê riêng `machineAccountSeats[]` trong `itHandover`; (2) P5 chuyển luôn seat máy
  cho IT Admin đích (licensing: kết thúc dòng cũ + chèn dòng mới `predecessor_id`, cờ giữ nguyên — cùng cách migration 0900), tới mốc chặn chưa
  chuyển ⟹ hàng việc IT chung như R-26; (3) MF-3 `rightsToTakeBack` loại seat máy (chuyển phòng không làm mất vai IT); (4) migration 0900 loại
  IT Admin đích có hồ sơ mở.
- **B:** giữ như code (seat máy là seat cá nhân, thu hồi như mọi quyền); bù bằng cảnh báo ở P23/P1 "người nghỉ giữ N seat tài khoản máy — tạo
  lại dưới IT Admin khác trước mốc chặn", và vẫn sửa (4).

**Mutation chứng minh (nếu chọn A).** Test mới `test/integration/personnel/departure-closure.integration-spec.ts`: "IT Admin nghỉ, giữ 1 seat cá nhân và
1 seat máy; thu hồi xong seat cá nhân + (1a)(1b) ⟹ hồ sơ đóng, seat máy còn nguyên"; và `transfer-grace-sweep.integration-spec.ts`: "IT Admin
chuyển phòng giữ seat máy ⟹ hết ân hạn không có tác vụ `TRANSFER` cho seat máy". Mutation: bỏ điều kiện `isMachineAccount: false` trong
`countPersonalSeatsWithoutCompletedTask` ⟹ ca 1 đỏ (`closed: false`); bỏ `&& !seat.isMachineAccount` trong `rightsToTakeBack` ⟹ ca 2 đỏ (1 tác vụ
thay vì 0).

---

## A-3 · Optional · Seat `K3` (không có đường thu hồi) giữ hồ sơ nghỉ việc mở mãi; MF-2 và MF-3 xử lý khác nhau

**File:dòng.** `licensing/provisioning/revocation-read.repo.ts:161-181` đếm mọi loại cấp; `personnel/departure-deadline/departure-impact.policy.ts:4-5`
(`K3` không thu hồi được) ⟹ `departure-closure.service.ts:55` không bao giờ đạt 0. Test đã khóa hành vi này:
`test/integration/personnel/offboarding-departure.integration-spec.ts` ("the seat with no revocation (K3) does [keep the case open]").
Ngược lại MF-3 loại `K3` khỏi thu hồi vì "nothing could close the transfer if it waited for one" (`transfer-grace/transfer-sweep.policy.ts:58-76`).
P8 `GET /me/department-transfer` vẫn trả seat `K3` là quyền "sẽ bị thu hồi khi hết ân hạn" (`transfer-grace/my-transfer.service.ts:47`) dù sweep
không thu hồi.

**Kịch bản.** Người giữ một seat `K3` cũ (dữ liệu trước khi `plan.policy.ts:62` cấm tạo `K3`) nghỉ việc ⟹ hồ sơ không bao giờ tự đóng (không có
nút đóng tay), nhắc quá hạn mỗi ngày tới khi seat tự hết hạn (D-42 chỉ ghi phần nhắc; phần **kẹt đóng** là khía cạnh mới).

**Căn cứ.** `QĐ-110e` (đóng khi mọi **tác vụ** thu hồi hoàn tất — `K3` không có tác vụ), `POL-MF2` phạm vi chỉ `K1/K2/K4/K5`.

**Sửa.** Một định nghĩa "quyền phải thu hồi" dùng chung: lọc `plan.provisioningType in (K1,K2,K4,K5)` trong
`countPersonalSeatsWithoutCompletedTask` (hoặc trả seat `K3` thành cảnh báo riêng), và P8 lọc bằng `rightsToTakeBack`. Nếu muốn giữ `K3` chặn
đóng thì phải có lối ra (IT ghi "đã xử lý ngoài") — `CẦN-OWNER`, A: lọc như trên.

**Mutation.** Sau khi sửa, đổi ca test trên thành "K3 không giữ hồ sơ"; mutation bỏ bộ lọc loại cấp ⟹ ca đó đỏ (`blockers.PERSONAL_RIGHTS_OPEN: 1`).

## A-4 · Optional · Số liệu P21 của IT Admin lệch phạm vi giữa các ô

**File:dòng.** `personnel/dashboard-facts/dashboard-facts.repo.ts:57-63` (`upcoming`, `awaitingRevocation`, `closedThisMonth`, `mailboxLockPending`
chỉ `departmentId IN (...)`; `departmentIds = []` ⟹ trả 0) so với `departure-deadline/departure-deadline.repo.ts:37` và
`offboarding/offboarding-list.repo.ts:47` (cả hai gồm hồ sơ `departmentId IS NULL` — người chưa xếp phòng, `QĐ-93g`(5): "hồ sơ hiện cho mọi IT Admin").

**Kịch bản.** Người chưa xếp phòng nghỉ, đã quá hạn và chờ (1b): IT Admin thấy `revocationOverdue: 1` nhưng `awaitingRevocation`/`mailboxLockPending`
= 0; IT Admin chưa phụ trách phòng nào thấy mọi ô 0 trừ `revocationOverdue`. Lọc P3 cùng vai lại trả hồ sơ đó.

**Căn cứ.** SPEC S14 ("đúng phạm vi vai"), P21 ("danh sách chi tiết qua P3"), `QĐ-93g`(5).

**Sửa.** Dùng cùng mệnh đề `OR: [{ departmentId: { in } }, { departmentId: null }]` cho `scope` ở `departureCounts`; bỏ nhánh trả 0 sớm khi `[]`.

**Mutation.** Thêm ca vào `test/integration/personnel/…dashboard…` (hoặc `dashboards/progress`) với hồ sơ không phòng; mutation trả lại `scope` cũ ⟹
`mailboxLockPending` lệch ⟹ đỏ.

## A-5 · Optional · `REVOCATION_OVERDUE` ghi audit lần hai trong cùng ngày và có thể báo cho hồ sơ vừa đóng

**File:dòng.** `personnel/departure-deadline/revocation-overdue.service.ts:218-258`: danh sách quá hạn đọc ngoài transaction, `tell` không khóa/đọc lại
hồ sơ; `written` = "có ít nhất một người nhận mới" (`event-notice/personnel-notifier.service.ts:423-440`) ⟹ đổi IT phụ trách (hoặc Super Admin) giữa hai
lượt cùng ngày ⟹ thêm một sự kiện audit `OFFBOARDING_CASE.REVOCATION_OVERDUE` cùng `correlationId`. Hồ sơ đóng giữa lúc đọc và lúc báo vẫn được báo.
D-68 đã sửa đúng lỗi này cho `ACCOUNT_LOCK_OVERDUE` bằng cột dấu; luồng quá hạn thu hồi chưa.

**Căn cứ.** SPEC MF2-D ("một lần mỗi hồ sơ" mỗi ngày); tiền lệ D-68.

**Sửa.** Trong `tell`: `lockEmployeeForUpdate` + khóa hồ sơ (`BlockMomentRepo.lockOpen`), đếm lại seat, rồi mới báo; audit chỉ ghi khi chưa có
sự kiện cùng `correlation_id` trong ngày (hoặc thêm cột `revocation_overdue_told_on DATE` và `updateMany where told_on <> today`).

**Mutation.** Ca mới trong `departure-revocation-deadline.integration-spec.ts`: hai lượt cùng ngày, đổi IT phụ trách giữa hai lượt ⟹ đúng 1 sự kiện
audit. Mutation bỏ điều kiện "chưa báo hôm nay" ⟹ 2 sự kiện ⟹ đỏ.

## A-6 · Nit · Mã chết và chú thích cũ sau `QĐ-110b`/`QĐ-110d`

- `personnel/offboarding/offboarding-case-writer.service.ts:213-216`: `else if (!leftAtOnce) blockAccessNow(...)` không bao giờ chạy — chặn ngay giờ
  luôn có ngày cuối = hôm nay ⟹ `leavesAtOnce` luôn đúng (`offboarding.policy.ts:247-253`). Tương tự `OffboardingHandoverService.blockAccessNow`
  (`offboarding-handover.service.ts:37-44`). Xóa hoặc chú thích là nhánh dữ liệu cũ.
- `personnel/offboarding/open-requests/open-requests.listener.ts:18`: "closing them is the IT Admin's act, one at a time" trái `QĐ-110d` (hệ thống tự
  hủy ở mốc chặn) — sửa chú thích.

---

## Ghi chú bổ sung cho mục đã có (không tính finding)

- **D-31 (THIẾT-KẾ):** hệ quả phụ — vì chặn ngay luôn `LEFT` lúc ghi, `superAdminToMarkLeft` và thông báo "chuyển đã nghỉ việc" cho chặn ngay không
  bao giờ có; đúng `QĐ-110b`, chỉ cần biết khi dọn.
- **D-106:** `ItHandoverMilestoneService.reached` chỉ chạy trong `BlockMomentEffects` ⟹ phụ thuộc A-1; sửa A-1 thì R-26/`QĐ-110k` cũng được bảo đảm.
