# Spec: qd103-commitment-release-on-revocation — giải phóng phần cam kết còn lại khi quyền bị thu hồi hoặc hết hạn

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.8`(2)(5)(a)(d); `QĐ-103r`, `QĐ-104i`, `QĐ-103k`, `QĐ-104k`(1); QT v1.7 `C-18`, mục 1.8, 1.10),
  BE `5fd5f594`. Ledger: L2-20, L4-12. Luật R-C05, R-J07 (vế _thu hồi sớm giải phóng cam kết_), R-J08. Theo nguồn: vế _thu hồi đúng ngày 1
  ⟹ tháng đó giải phóng_ của Q-05 (`US-07-05` AC-21), `K1` _các tháng sau ngày hết kỳ đã trả_ (AC-21 vế `K1`). Câu TẠM CHỌN: Q-05 = A (vế
  giữa tháng), Q-39 ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Khi tác vụ thu hồi (`SBF-18`) **hoàn tất** — từ bất kỳ nơi gọi nào (`MF-2`, `MF-3`, `MF-5`, `SBF-03` hết hạn, `SBF-03a` hoàn trả,
quyền theo vai thôi vai) — hệ thống tự giải phóng phần khoản cam kết **các tháng còn lại** của Request đã cấp quyền đó (và của Request
tiếp tục đã áp vào quyền đó), trong cùng transaction, theo **giá tháng của một seat**; tác vụ đóng _thất bại_ không giải phóng gì. Nơi
gọi hiện có không đổi hành vi ngoài việc ngân sách _còn lại_ của phòng tăng đúng phần giải phóng.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `budgets/commitment` (listener + phép tính phần giải phóng); `licensing` **thêm** dữ kiện vào `RevocationTaskFacts`
  và hàm chuỗi `predecessor_id` ở `licensing/assignment` (capability thấp — `provisioning` đã import nó, DA4-36); `requests` bind thêm một
  phương thức của hook có sẵn (file binder có sẵn, repo ở `renewal-apply/` — `requests/spend` đã đủ 25 file, DA4-16).
- Boundaries: 1 migration (2 giá trị enum lý do không dùng trong cùng migration ⟹ không cần `*_values`; 1 cột); 1 listener mới; 0 operation
  mới; response `budgetCommitmentReleases`/`List` có lý do mới.
- Not larger: thực chi seat-tháng `K2` dồn tích và dòng _Chưa phân bổ — kho dùng chung_ (W5 `qd103-seat-month-cost-pool-line`); cảnh báo
  dòng kho vượt dự phòng (W5); khoản 01/01 gắn Assignment (`qd103-new-year-auto-commitments` mở rộng listener); đổi phòng chịu chi phí khi
  điều chuyển (`FR-5.8`(5)(b), `MF-3` — ngoài phạm vi).
- Not smaller: một listener cho mọi nguồn — tách theo nơi gọi thì mỗi luồng một phép tính khác nhau.
- Siblings: `qd103-k4-key-pool` (thu hồi `K4` không đụng cam kết), `qd103-role-based-access` (quyền theo vai không có cam kết),
  `qd103-new-year-auto-commitments` (dùng lại hàm chuỗi).
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                                           |
| ----- | ------------ | -------- | -------------------------------------------------------------------------------------------- |
| —     | L2-20, L4-12 | n/a      | gỡ chặn `qd103-new-year-auto-commitments` (listener theo Assignment), W5 seat-tháng, W6 MF-5 |

## Supporting references

`US-07-05` AC-21 (thu hồi 01/09, cam kết 03→12 × 200 ⟹ giải phóng 800; `K1` trả tới 30/09, hủy 10/09 ⟹ giải phóng các tháng sau 30/09);
`US-10-07` AC-19, AC-20 (ghost seat thu hồi sớm giải phóng); `US-06-06` (_chỉ phần chưa phát sinh chi_, phần đã khớp hóa đơn không đảo);
`FR-5.8`(5)(a) _quyền có thời hạn hết hạn trước 31/12_; `FR-5.8`(2) _đóng thất bại_ đã có ở `requests/grant/access-request-grant.listener.ts:85-89`.

## Explicit out of scope

- Cấp thất bại (đã giải phóng `GRANT_FAILED`); hủy/rút Request; Finance giải phóng phần dư (`REMAINDER`) — giữ nguyên.
- `K4` (chi phí một lần), `K5`, tài khoản dịch vụ (`SERVICE` không thu hồi qua đường này), quyền theo vai và seat ban đầu/bàn giao không
  có khoản theo Request.
- Tính lại khi giá đổi (`QĐ-106c`): phần giải phóng dùng giá tháng **đã ghi** trên khoản cam kết.

## Dependencies and blockers

W3 `qd103-commitment-current-year` (một khoản năm hiện hành, `hold` một mục) và `qd103-budget-check-three-outcomes` (capability
`requests/spend-effects/` thay `budget-information/`, nơi gọi `holdForRequest`). W2 PASS (migration `budgets.prisma`). Sau
`qd103-k4-key-pool` (cùng enum `CommitmentReleaseReason`); đặt **trước** `qd103-new-year-auto-commitments`.

## Ownership: module, data, API

- Migration `<ts>_commitment_release_on_revocation` (task đầu): enum `CommitmentReleaseReason` (`prisma/models/budgets.prisma:245-251`)
  thêm `REVOKED`, `EXPIRED`; `budget_commitments` (`:279-316`) thêm `seat_monthly_minor bigint NULL CHECK (seat_monthly_minor > 0)` —
  giá tháng quy đổi của **một** seat lúc giữ khoản. Không backfill (dữ liệu cũ dùng Q-39).
- `budgets`:
  - `public/budgets.types.ts`: `CommitmentHoldInput.seatMonthlyMinor?: bigint` (thêm), `CommitmentReleaseReason` (:34-35) **không** thêm
    `REVOKED`/`EXPIRED` (chỉ listener nội bộ ghi).
  - `budget/commitment.repo.ts` (`hold` :72-109 ghi cột mới; `lockOfRequest` :116, `release` :162-202 dùng lại).
  - `commitment/commitment-revocation.listener.ts` (mới; `static readonly binds = [RevocationListeners]`, tên `budgets.commitment-release`),
    `commitment/commitment-revocation.policy.ts` (+ spec, thuần: `releasableOf`), `commitment/commitment.service.ts` (`releaseOnRevocation`),
    `budgets.module.ts`, `budgets/README.md` (listener, lock order, dữ liệu cũ).
  - `public/budgets.extension-points.ts`: `CommitmentRequestFacts` thêm `coveringRequests(tx, grantRequestId, assignmentId):
Promise<{ requestId: string; coverFromOn: string; coverEndOn: string | null }[]>` — Request cấp và mỗi Request tiếp tục đã áp vào
    chuỗi quyền, kèm khoảng ngày mà **chính Request đó** phủ (DA4-14).
- `licensing`:
  - `public/licensing.types.ts` (`RevocationTaskFacts` :300-306) thêm `grantRequestId: string | null`, `provisioningType`, `endedOn: string | null`
    (`valid_until`, chỉ ở `AFTER_WORK` `COMPLETED`), `paidThroughOn: string | null` (`K1` `RENEWAL_CANCELLED` — DA4-13), `sources: RevocationSource[]`.
  - `assignment/assignment-chain.repo.ts` (mới): `grantRequestOfChain(tx, assignmentId)` — đi chuỗi `predecessor_id` (`RENEWAL_CARRY`, `HANDOVER`),
    lấy Request của tác vụ `GRANT` **hoàn tất mới nhất** có `request_id` (`provisioning_tasks.request_id`, `licensing.prisma:136`).
  - `provisioning/revocation-completion/revocation-completion.service.ts:65` và `provisioning/provisioning-task.types.ts` (`toRevocationFacts`
    :155 — dữ kiện thêm chỉ điền ở hoàn tất; nơi khác để null).
- `requests`: `spend/commitment-request-facts.listener.ts` (file có sẵn, bind thêm `coveringRequests`), `renewal-apply/renewal-request.repo.ts`
  (Request tiếp tục đã áp của chuỗi: phủ từ `previousExpectedEndDate + 1` tới `newExpectedEndDate`; Request trước dừng ở `previousExpectedEndDate`); nơi gọi
  `holdForRequest` (W3 `requests/spend-effects/spend-effects.service.ts`) truyền `seatMonthlyMinor`.
- Operation: không có mới. Đổi response: `budgetCommitmentReleases`, `budgetCommitmentList` (lý do `REVOKED`/`EXPIRED`; `seatMonthly` — tiền
  là chuỗi, ADR-0007). `provisioningTaskCompleteRevocation`, `offboardingCaseOpenRevocations`, `assignmentExpiryStartRevocation`: không đổi.

## Behavior and design

1. **Kích hoạt**: listener chỉ xử lý `moment = 'AFTER_WORK'` **và** `task.status = 'COMPLETED'` (sự kiện `AFTER_WORK` lúc nhận việc có
   `IN_PROGRESS` — `provisioning/tasks/provisioning.service.ts:85` — bị bỏ qua), `provisioningType ∈ {K1, K2}`, `grantRequestId` khác null.
   `CLOSED_FAILED`, `OPENED`, `BEFORE_WORK` ⟹ không làm gì (L4-12).
2. **Khoản liên quan**: `coveringRequests` ⟹ khóa các khoản `HELD` của các Request đó `FOR UPDATE ORDER BY year` (`lockOfRequest`), chỉ năm
   `≥ năm(lastCostDay)`. Không khóa năm (`yearLock`), không khóa hàng Request — thứ tự khóa của transaction hoàn tất thu hồi (task →
   subscription → Assignment → khóa `K4`) + **khoản cam kết** cuối cùng; ghi README `budgets` và `licensing`.
3. **Ngày cuối còn tính chi phí** (DA4-13): `K1` ⟹ `lastCostDay = paidThroughOn` (cả `UNTIL_PAID_END` lẫn `CUT` — đã trả thì không giải phóng;
   `revocation.policy.ts:153-178` đặt `valid_until = min(paidThroughOn, accessCutOn)` với `CUT` nên không dùng `endedOn`); `K2` ⟹ `lastCostDay =
endedOn − 1 ngày` (trigger sức chứa dùng `day < valid_until`, `20261022110000_catalog_licensing_write_integrity/migration.sql:183-187`).
4. **Phần giải phóng** (Q-05): với mỗi Request `r` trong `coveringRequests` và mỗi khoản năm `y` của nó: `firstMonth = max(y = năm(lastCostDay) ?
tháng(lastCostDay) + 1 : 1, tháng(r.coverFromOn) nếu cùng năm y)`; `lastMonth = r.coverEndOn` thuộc năm `y` ? tháng đó : (`coverEndOn` < 01/01/`y` ? 0 : 12) — mỗi khoản chỉ
   giải phóng trong phạm vi tháng **chính Request đó phủ** (DA4-14); `months = max(0, lastMonth − firstMonth + 1)`; `amount = min(held,
seatMonthly × months)`. Theo nguồn: thu hồi đúng ngày 1 ⟹ tháng đó giải phóng (AC-21: 01/09 ⟹ 09→12 = 800); tạm chọn: ngày giữa tháng ⟹
   tháng đó tính đủ (10/09 ⟹ 10→12 = 600).
5. **Giá một seat**: `seat_monthly_minor` của khoản; NULL (khoản cũ) ⟹ Q-39: `floor(amount_minor / beneficiaryCount / coveredMonths)`,
   `coveredMonths` = từ tháng tạo khoản (năm tạo) hoặc 01 (năm sau) **tới tháng `coverEndOn` nếu trong năm, không thì 12** (DA4-18);
   `beneficiaryCount` từ `factsOf`. Làm tròn xuống ⟹ không giải phóng quá phần một seat. Request nhóm: chỉ phần của **một** seat (`C-18`).
6. **Ghi**: `amount > 0` ⟹ `CommitmentRepo.release` (`reason` = `EXPIRED` nếu `sources` có `TIME_LIMITED_EXPIRY`, ngược lại `REVOKED`;
   `reasonText` = `revocationTask:<id>`; `releasedByEmployeeId` null) + audit `BUDGET_COMMITMENT.RELEASED` actor hệ thống. Khoản thành
   `RELEASED` khi held về 0. Phần đã khớp hóa đơn không đảo.
7. **Không làm vỡ nơi gọi** (R-J08): mọi tình huống nghiệp vụ (không Request, không khoản, held = 0, `months = 0`, khoản `EXPENSED` hết,
   `factsOf` thiếu Request) ⟹ no-op, **không ném**. Chỉ lỗi DB thật làm rollback. **Thứ tự listener** (DA4-15): `Listeners` chạy theo thứ tự
   `onModuleInit`; `requests` import `budgets` nên thứ tự thực tế có thể là `licensing` → `budgets` → `requests`. Thiết kế **không phụ thuộc**
   thứ tự với `requests.return-request` (listener đó chỉ đọc/ghi bảng hoàn trả, chỉ ném ở `BEFORE_WORK`; listener này chỉ ghi khoản ở `AFTER_WORK`);
   test chỉ ghim `licensing.handover` đứng trước và tên `budgets.commitment-release` có mặt, không ghim vị trí so với `requests`.
8. **Từ 01/01**: quyền đã thu hồi không có khoản năm mới — job của `qd103-new-year-auto-commitments` bỏ Assignment đã kết thúc.
9. **Dữ liệu cũ**: tác vụ thu hồi hoàn tất trước triển khai **không** giải phóng hồi tố (Finance dùng `REMAINDER`); README `budgets` mục
   vận hành. Seed: không có bước thu hồi hoàn tất có cam kết ⟹ `ops:seed` không đổi.

## Test matrix

| AC / rủi ro          | Tình huống (gồm từ chối, edge case)                                                                                                        | Cấp test                  | Kết quả mong đợi                                                                           | Bằng chứng sau implement |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| AC-21                | `K2` cam kết 03→12 × 200 = 2 000, thu hồi hoàn tất 01/09                                                                                   | integration               | giải phóng 800 `REVOKED`; held 1 200                                                       |                          |
| Q-05 A               | cam kết 06→12 × 200, hoàn tất 10/09; hoàn tất 31/12; hoàn tất 01/01 năm sau với khoản năm sau (Q-27)                                       | unit policy + integration | 600 / 0 / khoản năm sau giải phóng 12 tháng (cap held)                                     |                          |
| `FR-5.8`(5)(a)       | quyền có thời hạn tới 30/09, cam kết 07→09; thu hồi sớm hoàn tất 15/08; hết hạn đúng ngày (`TIME_LIMITED_EXPIRY`)                          | integration               | giải phóng 09 (1 tháng) `REVOKED` / 0, không dòng release                                  |                          |
| `K1` (AC-21, DA4-13) | `UNTIL_PAID_END` trả tới 30/09, hủy 10/09; `CUT` 05/10 với kỳ trả tới 30/11; trả tới 01/10                                                 | unit policy + integration | giải phóng 10→12 / chỉ 12 / 11→12 (không lệch một tháng)                                   |                          |
| nhóm                 | Request nhóm 3 người 06→12 × 100/seat (2 100), thu hồi 1 người 01/09                                                                       | integration               | giải phóng 400; 2 người kia giữ                                                            |                          |
| cap / hóa đơn        | khoản đã khớp hóa đơn còn held 100 < phần tính 400                                                                                         | integration               | giải phóng 100, không đảo phần đã khớp                                                     |                          |
| Q-39                 | khoản cũ `seat_monthly` NULL, tạo 03/2026, 2 000, 1 người, thu hồi 01/09; khoản cũ quyền có thời hạn tới 30/06, tạo 03, 800, thu hồi 01/05 | integration               | `floor(2000/1/10)=200` × 4 = 800 / `floor(800/1/4)=200` × 2 = 400                          |                          |
| phủ định kích hoạt   | `CLOSED_FAILED`; `AFTER_WORK` lúc nhận việc (`IN_PROGRESS`); `K4`; `K5`; seat ban đầu (không Request)                                      | integration               | không dòng release                                                                         |                          |
| phủ định dữ liệu     | Request không còn khoản `HELD`; khoản đã `EXPENSED`; Assignment không có                                                                   | unit + integration        | no-op, không ném, tác vụ `COMPLETED`                                                       |                          |
| R-J08 `MF-2`         | `offboardingCaseOpenRevocations` → hoàn tất thu hồi seat `K2` của người nghỉ                                                               | integration               | `COMPLETED` + giải phóng; bàn giao vẫn chạy                                                |                          |
| R-J08 `SBF-03a`      | hoàn trả seat (nguồn `RETURN`) hoàn tất                                                                                                    | integration               | hoàn trả hoàn tất + giải phóng 1 lần (bất kể thứ tự listener)                              |                          |
| R-J08 `MF-3`         | thu hồi nguồn `TRANSFER_REVIEW` hoàn tất                                                                                                   | integration               | giải phóng ở Request cũ                                                                    |                          |
| chuỗi Assignment     | seat `RENEWAL_CARRY` rồi thu hồi; seat `HANDOVER` có tiền nhiệm cấp theo Request                                                           | integration               | Request tìm qua `predecessor_id`, giải phóng đúng khoản                                    |                          |
| Request tiếp tục     | quyền tới 30/06/2026 (R6, khoản 2026 03→06) áp Request tiếp tục R7 tới 31/12 (khoản 2026 07→12), thu hồi 01/05                             | integration               | R6 giải phóng 05→06; R7 giải phóng 07→12; không lấy nhầm tháng của nhau                    |                          |
| thứ tự listener      | ba listener đăng ký; hoàn tất thu hồi hoàn trả                                                                                             | integration               | `licensing.handover` trước; có `budgets.commitment-release`; kết quả không đổi theo thứ tự |                          |
| lỗi DB               | ép lỗi ghi release                                                                                                                         | integration               | rollback cả hoàn tất thu hồi                                                               |                          |
| hold ghi giá seat    | duyệt chi Request 1 người và nhóm 3 người                                                                                                  | integration               | `seat_monthly_minor` = giá tháng 1 seat                                                    |                          |
| migration + seed     | DB có khoản cũ; `ops:seed`                                                                                                                 | integration migration     | cột NULL, enum thêm 2 giá trị; seed xanh                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; README `budgets` (listener, thứ tự khóa, dữ liệu cũ) và `licensing` (thứ tự listener, dữ kiện mới, hàm chuỗi) cập nhật.
- [ ] Test `MF-2`/`SBF-03a`/`MF-3` hiện có vẫn xanh (danh sách ở plan Task 4); `pnpm arch:capabilities --module licensing` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4: DA4-13, DA4-14, DA4-15, DA4-16, DA4-17, DA4-18 sửa; nhận phần DA4-36 (hàm chuỗi ở
  `licensing/assignment`). Q-05 vế ngày 1 ghi theo nguồn. Không finding nào bị bác. Chi tiết ở plan _Design review_ và
  [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md). Chưa nghiệm thu.
