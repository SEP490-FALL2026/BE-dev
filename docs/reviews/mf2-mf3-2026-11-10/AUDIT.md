# Audit MF-2/MF-3 (prompt 2) — 14/11/2026, đêm

> Chat điều phối Opus (SEP-Start 120), Owner ngủ. Owner cho phép: tự sửa điểm **trái QĐ/BRD/OWNER-REVIEW**, giữ các điểm chỉ là cân
> nhắc thiết kế (ghi A/B để Owner duyệt sáng), **tự commit BE trên `feat/mf2-mf3`, không push**, chạy lại full test + seed.
> Phạm vi: diff `06bfa6f9..9580e179` (270 commit, ~560 file `src`), SPEC v2.3, PLAN v2.4, Docs `main @ 5ef039c` (BRD 4.13, Quy trình 1.10).

## 1. Cách làm

1. Đọc báo cáo Sonnet (`PROMPT2-DONE.md`, `OVERNIGHT-DECISIONS.md` — 128 mục D-1…D-129), `HANDOFF-CODE.md`.
2. Hai agent Opus chỉ đọc rà 128 điểm D-n với QĐ/BRD/OWNER-REVIEW: [AUDIT-DN-1.md](AUDIT-DN-1.md) (D-1…D-55),
   [AUDIT-DN-2.md](AUDIT-DN-2.md) (D-56…D-109). D-110…D-129 nằm trong vùng review code bên dưới.
3. Ba agent Opus review code chỉ đọc, chia vùng: [AUDIT-A.md](AUDIT-A.md) (MF-2 personnel/identity/devices/CLI),
   [AUDIT-B.md](AUDIT-B.md) (MF-3 requests/licensing/budgets), [AUDIT-C.md](AUDIT-C.md) (catalog X-IT, DS, RD, organization, seed).
4. Tự đọc và sửa các điểm Required/SAI-QĐ, mỗi chỗ sửa có test + mutation (`mutate.py`: thay chuỗi, chạy test, khôi phục).
5. Full test trước sửa (worktree `be-audit-base` ở `9580e179`) và sau sửa (cây chính), rồi `seed:local`.

## 2. Kết quả full test trước sửa (HEAD `9580e179`, chưa ai chạy toàn bộ)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm check` | **đỏ**: `prettier` của `scripts/verify/capability-graph.test.mjs` (CI sẽ đỏ) |
| `test:http` | 93/93 suite, 2238 test xanh |
| `test:integration --maxWorkers=4` | 437/437 suite (1 skip), 4923 test xanh |
| `test:integration:serial` | **1 đỏ**: `database-runtime-role-leave-write` gửi `grounds` cũ thay vì `groundsNote` (QĐ-111bd) |
| `test:integration:timing` | 7/7 xanh |
| `test:flows` | **1 đỏ**: `mf5-rightsizing-no-head` ghi nghỉ việc trưởng phòng với `successor: NONE` — nay bị từ chối (`QĐ-110h`) nên phòng vẫn có trưởng phòng |

## 3. Finding và xử lý

Mức: Critical / Required / Optional / Nit. "Đã sửa" = code + test + mutation KILLED (trừ chỗ ghi khác).

### 3.1. Đã sửa

| Mã | Mức | Vấn đề | Sửa | Kiểm |
| --- | --- | --- | --- | --- |
| D-2 | SAI-QĐ (TB) | Điều chuyển có hiệu lực không hủy Request case B **đã định giá có chi phí** ở phòng cũ (trái `QĐ-110o`, `QĐ-90b`, `BR-MF3-03`) | `beneficiary-gone-scope.policy.ts`: `NEW_SOFTWARE` ở các trạng thái sau định giá (`AWAITING_SPEND_*`, `AWAITING_EXECUTION`, `EXECUTING`, `AWAITING_IT_CLOSE`) tính là trả phí; case B chưa định giá giữ nguyên | spec +2 ca; 2 mutation KILLED |
| D-5 | SAI-QĐ (thấp) | CLI `record-super-admin-event` bắt căn cứ 4 phần, danh sách đóng (trái `QĐ-110a`, `QĐ-111bd`: một ô chữ) | Thêm `--basis <text>` (một ô, lưu nguyên văn); 4 cờ `--basis-*` chỉ còn là dạng của `--from-notice`; `EventBasis` = `{ note }` hoặc 4 phần; `documentBasisOf` từ chối ô chữ ở đường từ notice | spec CLI +4 nhóm, policy +2; 2 mutation KILLED. Giữ 4 cờ cho ghi thẳng để không vỡ script cũ (ghi chú) |
| D-62 | SAI-QĐ | Thẻ checklist K1 đòi "đã khóa hộp thư" khi người nghỉ còn ghế K1 chưa thu hồi (chưa mở tác vụ / tác vụ `CLOSED_FAILED` / rút lý do) — trái `QĐ-111az`, `QĐ-110b` | `provisioning-k1-checklist.service.ts`: "tác vụ K1 cuối" = không còn tác vụ K1 sống khác **và** không còn ghế K1 cá nhân nào khác chưa có thu hồi `COMPLETED` (truy vấn mới `openPersonalSeatsOf`, bảng licensing, đọc tuần tự trên `tx`) | integration K1 cập nhật + ca mới; `departure-closure` D-71 đổi theo; mutation KILLED |
| D-64 | SAI-QĐ | Cấm `doneAt` trước lúc tạo tác vụ ⟹ IT ghi đúng giờ đặt lại mật khẩu (làm ở mốc chặn, `QĐ-110b/c`) bị 422 | Bỏ cận dưới `openedAt`; giữ luật thứ tự trong danh sách | spec `opened` viết lại; integration "review O2" đổi thành nhận bước trước tác vụ |
| A-1 | Required | Hồ sơ nghỉ việc có thể tự đóng **trước** lượt quét mốc chặn ⟹ lượt quét bỏ qua hồ sơ đã đóng: Request mở không bị hủy, cam kết không trả, không audit `ACCESS_BLOCKED`, không báo IT/admin nhà cung cấp (trái `QĐ-110d`) | `departure-closure.repo.ts` `closeBySystem` đòi `block_announced_at IS NOT NULL`; hồ sơ đóng ở lượt sau | 5 test closure cập nhật (thêm lượt quét mốc chặn như thực tế, harness `blockPass()`); mutation KILLED |
| B-4 | Required | `mailboxLockedAmong` đọc mọi tác vụ K1 hoàn tất của người đó, không theo hồ sơ ⟹ hồ sơ nghỉ việc cũ đã hủy có tick khóa hộp thư làm hệ thống tự ghi (1b) cho hồ sơ mới | Chỉ tính tác vụ hoàn tất **sau** `account_lock_at` của hồ sơ đang chờ (`listPeopleWithMailboxLockTicked` nhận `{ employeeId, since }`) | unit spec mới; mutation KILLED |
| B-2 | Required | Migration `…000900` hủy Request `SERVICE_ACCOUNT` + trả cam kết **không ghi Audit Trail** | Migration mới `20261113002700_requests_scope_removed_audit` (chỉ dữ liệu, chạy lại an toàn) ghi `ACCESS_REQUEST.CANCELLED` + `BUDGET_COMMITMENT.RELEASED`, actor SYSTEM. Không sửa migration cũ (giữ checksum). Không gửi thông báo (thông báo đến từ ghi của ứng dụng) | integration migration: chạy hai lần ⟹ đúng 2 sự kiện |
| C-1 | Required | `PATCH` gói K4 gửi lại `provisioningType: 'K4'` làm mất cờ `hasAdminConsole` không báo | `plan.service.ts`: giữ cờ khi loại kế tiếp vẫn là K4 | integration +1 ca; mutation KILLED |
| GATE-1 | Required (CI) | `prettier` đỏ ở `scripts/verify/capability-graph.test.mjs` | `prettier --write` | `pnpm check` |
| GATE-2 | Required (CI) | Serial `database-runtime-role-leave-write` gửi body cũ | `groundsNote` | serial |
| FLOW-1 | Required (nightly) | Flow MF-5 không trưởng phòng dựa vào nghỉ việc `successor: NONE` đã bị cấm | Dùng `POST /departments/{id}/head-vacancies` | `test:flows` file đó xanh |

### 3.2. Chưa sửa — cần Owner chốt (khuyến nghị đứng đầu)

| Mã | Câu hỏi | A (khuyến nghị) | B | Hiện code |
| --- | --- | --- | --- | --- |
| **D-82/88/92** | Deploy: migration đặt ân hạn cho **mọi** điều chuyển `EFFECTIVE` chưa đóng ⟹ hết ân hạn hệ thống tự mở thu hồi quyền cũ, kể cả dòng review cũ chọn "giữ ghế" | Trước deploy thật: chạy migration trên bản sao DB, đọc `RAISE NOTICE` số dòng; demo/seed không ảnh hưởng | Thêm cờ chỉ áp cho điều chuyển có review `OPEN` | A (theo `QĐ-110p/110r`) |
| **D-95** | Trong ân hạn điều chuyển có chặn Request **trùng gói đang mở** không? `QĐ-110q` chữ là "không tính GH-1/GH-2" | Giữ chặn trùng (an toàn: tránh hai Request thay cùng một quyền, hai cam kết) và **sửa chữ `QĐ-110q`** thành "bỏ chặn *đang có quyền*, không đếm GH-2" khi Owner nói "đồng bộ" | Theo chữ QĐ: bỏ cả chặn trùng | A (chưa sửa, chờ Owner) |
| D-78 | Request K5 đang chờ trưởng phòng mà mất trưởng phòng vẫn đứng chờ; `QĐ-110i` cho K5 IT cấp thẳng | Sửa ở prompt 3 (task riêng: kết thúc bước nhu cầu `NOT_REQUIRED` + cờ `NO_NEED_APPROVER`, sang IT) | Giữ chờ (ca hiếm, kế nhiệm bắt buộc) | chờ |
| C-2 / D-105 | Kích hoạt thuê bao cần admin đếm người **đã ghi** hay người **còn là IT Admin làm việc** (`QĐ-110k`) | Đếm người còn làm việc — nhưng phải sửa harness test + seed (đang ghi "một nhân viên bất kỳ" làm admin): làm ở prompt 3 | Giữ đếm người đã ghi, cờ `vendorAdminsBelowMinimum` báo sau | B. Tôi đã thử A, 4 suite đỏ vì harness/seed ⟹ hoàn lại |
| C-3 / D-103 | Bản đánh giá case B `adminConsole = true` gắn được vào gói K4 không cờ | 422 khi gắn (luật ≥ 2 admin không bị né) | Chỉ ràng ở `POST/PATCH /plans` | B |
| B-3 | Gửi lại trong ân hạn nhưng cấp sau ân hạn ⟹ 422 `OVERLAP` dù tác vụ thu hồi `TRANSFER` còn `QUEUED` | Rút lý do `TRANSFER` khi tác vụ chỉ `QUEUED` với lý do đó, kết thúc quyền cũ như R-49 | Giữ, trả 409 `REVOCATION_PENDING` riêng | lỗi `OVERLAP` |
| A-2 / B-5 / B-7 | Seat "tài khoản máy" của chính IT Admin nghỉ/điều chuyển bị thu hồi như quyền cá nhân, giữ hồ sơ mở; IT tự bật cờ cho seat của mình không ai được báo | Loại seat máy khỏi đếm/thu hồi, chuyển seat máy trong cùng thao tác bàn giao IT (P5) | Thu hồi như thường kèm cảnh báo | B |
| B-1 / D-36 | Màn xem trước điều chuyển không cộng phần cam kết của quyền cũ trả lại ngày hiệu lực (`QĐ-111bg`) và phần dòng nhóm | Thêm bản xem trước của `releaseForTransfer` vào P23 (prompt 3) | Giữ, FE ghi chú | thiếu |
| D-88 / B-11 | Tác vụ `TRANSFER` bị IT đóng `CLOSED_FAILED` ⟹ lượt quét mở lại mỗi giờ, báo lại mỗi lần | Không tự mở lại; IT mở tay như MF-2 (`QĐ-110e`) | Giữ | B |
| D-17, D-35, D-41, D-50, D-55, D-73, D-75, D-81, D-85, D-87, D-104 | Cân nhắc thiết kế khác | Xem bảng A/B ở [AUDIT-DN-1.md](AUDIT-DN-1.md), [AUDIT-DN-2.md](AUDIT-DN-2.md) | | như Sonnet chọn |
| D-89/97, D-111, D-113/114, D-122, D-127, D-1, D-77 | Sonnet tự ghi "cần Owner" | Xem "Tóm tắt cho Owner" cuối [OVERNIGHT-DECISIONS.md](OVERNIGHT-DECISIONS.md). D-122(a): tự chấp nhận đề xuất của mình chỉ xảy ra khi đổi vai giữa chừng (một tài khoản một vai); `SoD-4` đủ căn cứ thêm một dòng chặn — đưa vào prompt 3 | | |

### 3.3. Optional / Nit để lại (ghi để prompt sau)

A-3…A-6, B-6, B-8 (thứ tự khóa claim/grant với sweeper có thể deadlock 40P01), B-9, B-10, B-12…B-14, C-4…C-12 — chi tiết ở các file AUDIT-A/B/C.
Ngoài phạm vi MF-2/MF-3: GH-3 còn trong `request-limits`, GH-2 còn đếm "đang mở" (`QĐ-111h`) — thuộc SPEC feedback FE (prompt 3).
Docs cần chỉnh chữ khi Owner nói "đồng bộ": US-03-06 AC-9/AC-11, US-05-01 AC-5 (lệch `QĐ-111bc`); SPEC P1/P23/P2 mã `OFFBOARDING.*`;
SPEC §5 MF3-B phạm vi case B đã định giá (D-2); chữ `QĐ-110q` nếu Owner chọn A ở D-95.

## 4. Full test sau sửa

_(điền khi chạy xong — xem §6)_

## 5. Seed

_(điền khi xong)_

## 6. Lệnh và commit

_(điền khi xong)_
