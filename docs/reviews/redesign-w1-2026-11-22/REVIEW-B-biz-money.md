# REVIEW-B — làn biz: tiền, ngân sách, quyền, KPI (đợt 1 thiết kế lại)

- **Người review:** Opus, độc lập, chỉ đọc (23/11/2026). Không sửa code, không commit, không chạy DB.
- **Đối tượng:** `45ee61f4` (`int/redesign-w1`, nhánh máy `merge/redesign-w1`) so với `origin/dev` `6cf4bc3f`. Gói: P1 `e95991a3`, P7 `85bd9d72`,
  P8 `f56ce98d`, P11 `3e93089e`, P13a `006e163c`, P13b `fd11e546`, P14 `5cb99605`; sửa test/CI `485aab6b`, `d41e10a3`, `030329ef`, `1f91aa6e`,
  `08bc10f6`, `1cde4cf4`; seed của các gói này.
- **Nguồn đối chiếu:** `SPEC.md` (W1-01, 11, 12, 13, 18, 20, 21, 22, 23, 26; mục 4, 5, 6, 8, 9), `PLAN.md` (P1, P7, P8, P11, P13a, P13b, P14),
  sổ QĐ (`QĐ-114aj`, `QĐ-64a`, `QĐ-111az`, `QĐ-114w`, `QĐ-111k`, `QĐ-111ak`, `QĐ-116ah`, `QĐ-117h`, `QĐ-114af`, `QĐ-113g`, `QĐ-116i`,
  `QĐ-114s`, `QĐ-111ax`, `QĐ-116ba`, `QĐ-117b`, `QĐ-108i`, `QĐ-111z`, `QĐ-111aa`, `QĐ-111ag`, `QĐ-114a`, `QĐ-111af`, `QĐ-114y`, `QĐ-111am`),
  `Docs/rules/domain-guardrails.md` (tóm tắt BRD 4.17).

## Skill Preflight

| Skill | Mục đích |
| ----- | -------- |
| `agent-skills:code-review-and-quality` (process/review) | Review năm trục, phân mức finding, đọc test trước code, kiểm "verify the verification" |
| `superpowers:verification-before-completion` (verification) | Mọi kết luận "đạt" có lệnh chạy kèm kết quả; mutation thật, trả file về nguyên trạng |
| Domain (thay cho skill domain riêng — ghi mapping) | `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules/database-business.md` (thứ tự khóa, `tx`), `module-structure.md`, `api-contract.md`, `Docs/rules/domain-guardrails.md` |

## Bằng chứng đã chạy

- `pnpm test -- <13 đường dẫn của P1/P7/P8/P11/P13a/P13b/P14 + seed budget/renewals>`: **54 suite, 1107 test pass**.
- 26 mutation tạm (perl trên đúng dòng then chốt, chạy jest theo đường dẫn, `git checkout -- <file>` ngay sau; `git status --short src` sạch sau cùng):
  - **Bị bắt bởi unit (18):** M1 bỏ chọn seat `hasTask` khi không gọi tên, M2 từ chối seat `hasTask` khi gọi tên, M3 sắp theo `assignmentId`, M4 bỏ
    `NOTHING_TO_REVOKE` sau vòng lặp, M5/M5c bỏ nhánh _Dùng lâu dài_ mọi năm (đơn / nhóm), M6 `seatMonthlyMinor` về giá 01/01, M6b `keptAmountOf` bỏ
    _Dùng lâu dài_, M7 cho IT khác ghi khi người phụ trách còn dùng được, M9/M10 bỏ `NOT_IN_CHARGE`, M11 bỏ loại `SUPERSEDED`, M12 bỏ `EXEMPTED` khỏi tử
    số, M13 bỏ `NOT_LOCKED`, M14 `>`→`>=`, M15b bỏ kiểm dự phòng khi sửa kỳ, M16 `<=`→`<` ở `crossedByBaseDrop`, M17 `costCenterCount` cố định.
  - **Sống ở unit, chỉ I-test (CI) bắt (6):** M8 bỏ 403 ở `renewal-record.service.ts`, M8b ở `renewal-outcome.service.ts`, M10b `inChargeAllowed: true`
    ở `escalation.service.ts`, M15 bỏ kiểm dự phòng khi tạo kỳ, M18 bỏ ném `BudgetCycleNotLockedError`, M19 bỏ `settleSourceBase`. Các I-test tương ứng
    tồn tại và khẳng định đúng mã (đã đọc) — chấp nhận theo ma trận SPEC mục 6.
  - **Sống ở mọi tầng (2):** M5b (audit tiền khác VND của _Dùng lâu dài_ năm thứ hai), M16b (`<`→`<=` ở vế "trước" của `crossedByBaseDrop`) ⟹ RB-7.
- CI GitHub run `45101176825` (`1cde4cf4`): 13 suite đỏ, **đều** thuộc P9/P10 (`FIX-TEST-biz.md`), không suite nào của phạm vi này. Run trên
  `45ee61f4` (`45106926670`) còn đang chạy lúc review — chưa kết luận.

## Bảng finding

| RB | Mức | file:line | Mô tả | Bằng chứng | Sửa đề xuất cụ thể |
| -- | --- | --------- | ----- | ---------- | ------------------ |
| RB-1 | **High** | `src/cli/seed/steps/budget.steps.ts:199-216`, `src/modules/installation/public/demo-accounts.api.ts:52-70`, `src/cli/seed/fixture/shared-demo-v4/finance.ts:42-47,97-120` | Seed (D-1) dời tạm `submissionDeadline` về hôm qua, gửi phiên bản, rồi **khôi phục** hạn gốc. Với kỳ năm sau (hạn +30 ngày), dữ liệu sau seed là trạng thái **không thể có** theo `QĐ-111z` + W1-20: kỳ `OPEN` mà đã có phiên bản `SENT`, `APPROVED`, `CHANGES_REQUESTED`. Hệ quả demo MF-4 (DEMO-15): suốt 30 ngày Finance **không gửi** được phiên bản (`PROPOSAL_SUBMITTED` → lập → gửi, hay sửa bản bị trả về → gửi lại) vì 409 `BUDGET_CYCLE.NOT_LOCKED`; trưởng phòng vẫn nộp/nộp lại BM-10 trong kỳ mà Finance đã chốt phòng khác. Cách làm cũng đi vòng luật bằng ghi DB trực tiếp, không audit — trái tinh thần SPEC R-8 ("không nới luật cho seed") và SPEC W1-20 ("sửa để gửi khi kỳ đã khóa (hạn nộp đã qua)"). | Đọc `submitDraftsInLockedWindow` + `withLockedBudgetCycle` (`finally` khôi phục); fixture `nextCycle.submissionOffsetDays: 30`, `nextYear` có `APPROVED`/`VERSION_SENT`/`VERSION_RETURNED`. | Owner chọn (xem D-1). Khuyến nghị: tách kịch bản năm sau thành hai năm/hai trạng thái nhất quán — kỳ đã khóa (hạn ≤ hôm qua, có phiên bản ở các trạng thái) và kỳ đang mở chỉ có BM-10; không khôi phục hạn sau khi gửi. |
| RB-2 | Medium | `src/modules/requests/purchase-invoice/purchase-invoice.repo.ts:384-391`, `purchase-invoice-submission.service.ts:53` | W1-02 (c) **chưa xong** ở commit gộp: `resubmittedAs` vẫn đọc `this.prisma` (pool) trong callback `runner.run`. D-4 đã bàn giao P16 nhưng P16 (`f23a1884`) không thêm `tx`. Mỗi lần gửi lại hóa đơn giữ 2 connection (O3 M1). | `grep resubmittedAs` ở `45ee61f4`: chữ ký `(ids)`, lời gọi `:53` không `tx`. | `resubmittedAs(ids, tx?: DbTx)` dùng `(tx ?? this.prisma).purchaseInvoice.findMany`; truyền `tx` ở `:53`; spec mock khẳng định đúng `tx`. |
| RB-3 | Low (cần Owner xác nhận) | `src/modules/optimization/ghost-seat/ghost-seat-state.policy.ts:87` | `KPI5_EXCLUDED_REASONS` loại **mọi** `SUPERSEDED`. `QĐ-117b` chỉ nói khuyến nghị _tạm dừng_ bị `G2` thay thế; code `decideG2` (`internal-rules.policy.ts:131-164`) còn thay cả `G3`/`G4` **đang mở chưa quyết** khi người giữ nghỉ việc ⟹ các dòng đó cũng ra khỏi mẫu số. | Đọc `ghost-seat.service.ts:89-112` (`supersede`) và `decideG2`. | Khuyến nghị giữ (G2 thay thế đã vào mẫu số, đếm thêm dòng cũ là đếm hai lần một seat); ghi một câu làm rõ vào sổ QĐ. Nếu Owner muốn đúng chữ: lưu trạng thái trước khi thay (`PAUSED`) và chỉ loại ca đó. |
| RB-4 | Low | `src/modules/licensing/subscription-renewal/record/renewal-record-trail.service.ts:65-82` (`f56ce98d`, `030329ef`) | Ngoài SPEC: bỏ thông báo cho IT phụ trách khi người khác ghi thay; test I đổi `toContain(it1)` → `toEqual([finance])`. Hợp lý (người phụ trách nay chỉ bị thay khi nghỉ/bị khóa) nhưng không có trong SPEC W1-12 và không ghi D-n. | Diff hai commit. | Ghi một dòng D-n/OVERNIGHT hoặc mục 5 SPEC (đổi người nhận thông báo `SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED`). |
| RB-5 | Low | `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts:166-168` | `yearStartAmountOf` vẫn đòi giá 01/01 hợp lệ (VND, > 0) **cả khi mọi seat đã có số lưu**. Nay số lưu áp mọi năm cho _Dùng lâu dài_ ⟹ năm thứ N mà gói mất giá/đổi tiền thì khoản 01/01 bị bỏ (`NO_PRICE`) dù luật nói "luôn 12 × giá lúc duyệt" (`QĐ-117h`). | Đọc thứ tự kiểm: `isRecurringPriceInDong(price)` trước vòng `keptAmountOf`. | Chỉ đòi giá 01/01 khi còn seat không có số lưu (`seatsByEnd.size > 0`); `seatMonthlyMinor` lấy từ số lưu khi có. Thêm unit: số lưu + giá 01/01 `null` ⟹ `PRICED`. |
| RB-6 | Low | `test/integration/budgets/next-year-reminder.integration-spec.ts` (ca cuối), SPEC W1-23 "H `next-year-budget.http-spec.ts`" | AC W1-23 "3 CC thiếu, 2 người nhận ⟹ `costCenterCount=3`" chỉ được khẳng định `>= 3` và bằng một câu SQL của test; không có H-test inbox cho params mới (ma trận mục 6). Doc-comment `describe` còn câu cũ "once for each Cost Center and day". | Đọc file cuối; `test/http/requests/next-year-budget.http-spec.ts` không nhắc `BUDGET_NEXT_YEAR_MISSING`. | Tạo suite riêng có đúng 3 CC thiếu ⟹ `toBe(3)`; thêm H-test render title/message của hai dạng params; sửa doc-comment. |
| RB-7 | Low | `src/modules/budgets/threshold/threshold.policy.spec.ts`, `year-start-commitments-batch*.spec.ts` | Hai mutation sống ở mọi tầng: (a) vế "trước" `used*100 < t*baseBefore` không có ca biên (đang đúng 80 % rồi hạ cơ sở ⟹ không báo lại 80); (b) audit `SAVED_AMOUNT_IGNORED` cho _Dùng lâu dài_ tiền khác VND ở năm thứ hai. | M16b, M5b ở trên. | Thêm `drop(80n, 100n, 90n)` ⟹ `[]`; thêm ca batch năm `approval+2`, `amountCurrency: 'USD'` ⟹ `ignored` có request. |
| RB-8 | Low | `src/modules/budgets/cycle/cycle.policy.ts:155` | `RESERVE_OVER_CEILING` kiểm **trước** `NOTHING`/mọi thay đổi khác: một kỳ cũ đã lưu dự phòng > trần (dữ liệu trước W1-22) không sửa được hạn nộp nếu không đồng thời sửa dự phòng. | Đọc `planCycleChange`. | Chấp nhận (ép sửa dữ liệu sai) hoặc chỉ kiểm khi `ceilingChanged || reserveChanged`; ghi lựa chọn vào spec. |
| RB-9 | Nit | `ghost-seat-state.policy.ts:104`; `offboarding.policy.ts:315`; `year-start-commitments-batch.service.ts:248`; `test/support/budget-files.ts`, `test/flows/mf4-budget.flow-spec.ts`, `test/integration/requests/budget-versions.integration-spec.ts`; `provisioning-k1-checklist-opened.policy.spec.ts` (tên ca `R-3`); `ghost-seat-escalation.integration-spec.ts` (`toEqual`→`toMatchObject`) | (1) Comment "reasons that make a recommendation _right_" ngược nghĩa: tử số `KPI-5` là _bị bác bỏ_ (`QĐ-116ba`). (2) `RightFacts.hasTask` không còn ai đọc. (3) Chia trần `(saved + 11n) / 12n` chép lại thay vì dùng một hàm với `ceilDiv` của policy. (4) Bốn bản "dời hạn nộp tạm thời" trong test/seed. (5) Tên test chứa mã rủi ro `R-3`. (6) Một khẳng định nới nhẹ. | Đọc diff. | Sửa comment; bỏ field; export một `approvalMonthlyFromSaved`; gom về `sendingCycleLock`; đổi tên ca; giữ `toEqual`. |

Không có finding **Critical**.

## Kết luận từng D-n (`OVERNIGHT-DECISIONS-biz.md`)

### D-1 (P13a, seed gửi phiên bản khi kỳ đã khóa) — **cần Owner chọn**

Luật HTTP giữ đúng `QĐ-111z`/W1-20, nhưng dữ liệu seed sau khi khôi phục hạn là trạng thái trái luật và làm hỏng demo MF-4 năm sau (RB-1). SPEC W1-20 nói
"sửa seed để gửi khi kỳ đã khóa (hạn nộp đã qua)", không nói khôi phục hạn.

| Lựa chọn | Nội dung | Ví dụ |
| -------- | -------- | ----- |
| A (khuyến nghị) | Fixture tách hai kỳ nhất quán: kỳ năm hiện hành giữ như cũ (hạn = ngày seed, mai là khóa); kỳ năm sau **khóa thật** sau seed (không khôi phục hạn) cho các phòng có phiên bản; trạng thái "BM-10 chờ Finance" chuyển sang kỳ năm kế tiếp đang mở. | Năm 2027: hạn nộp = hôm qua, MKT `SENT`, DES `CHANGES_REQUESTED`; năm 2028: mở, 1 phòng `PROPOSAL_SUBMITTED`. |
| B | Giữ cửa sổ tạm nhưng **không khôi phục** hạn của năm có phiên bản `SENT`/`APPROVED`/`CHANGES_REQUESTED` (kỳ khóa luôn từ lúc seed). | Năm sau: hạn = hôm qua; ca `PROPOSAL_SUBMITTED` vẫn hiện nhưng Finance chỉ chốt, trưởng phòng không nộp thêm. |
| C | Giữ D-1 như hiện tại, Owner chấp nhận demo năm sau không gửi được phiên bản trong 30 ngày. | Demo DEMO-15 bỏ bước "Finance gửi lại". |

**Câu hỏi:** Kỳ ngân sách năm sau của demo nên ở trạng thái nào sau seed: khóa thật (A/B) hay mở như cũ chấp nhận demo không gửi được phiên bản (C)?

### D-2 (P17a, gửi lại sau khi người xin thành trưởng phòng) — **đúng luật, trái quy trình SPEC**

Hành vi (chuyển `ONE_STEP` + `REQUESTER_IS_HEAD` + audit `requesterBecameHead`, rồi `spending.start`) khớp `QĐ-114r`/`QĐ-116c` và SPEC W1-17 (g).
`GROUP_GRANT` giữ nguyên đúng W1-Q3. Nhưng SPEC (g) ghi rõ "không đi qua `routeNeedStep` ⟹ dừng hỏi" — Sonnet tự quyết thay vì dừng. Khuyến nghị
**giữ A**, Owner chỉ phê chuẩn. Lựa chọn khác: B (mở lại bước cũ, đợi lượt quét — để Request nằm sai bước tới hôm sau); C (đổi cho mọi ca chuyển phòng —
vượt phạm vi).
**Câu hỏi:** Owner phê chuẩn A (Request cá nhân gửi lại khi người xin đã là trưởng phòng đi một bước ngay) chứ?

### D-3 (P17b, lọc dòng đã rút ở Request nhóm) — **đúng luật**

Chỉ tính dòng `AWAITING_NEED` ở `holdsHead` (`step-target.service.ts:107` là chỗ dùng duy nhất của `SELECT_REQUEST.lines`) và ở `stepEmployeeIds` của
`GroupNeedPreconditions`. `SoD-4` vẫn áp cho mọi dòng còn chờ quyết; dòng đã rút/đã quyết không còn là "tự duyệt". Đây là điều kiện cần để lối ra W1-Q3
chạy. Khuyến nghị **giữ A**; không cần Owner chọn thêm.

### D-4 (P3, `resubmittedAs` thuộc file của P16) — **đúng quy trình nhưng việc bàn giao chưa làm**

Bàn giao là đúng ranh giới làn, nhưng ở `45ee61f4` lời gọi vẫn không có `tx` (RB-2). Không cần Owner chọn luật; cần giao người sửa ngay trên nhánh gộp.
**Câu hỏi:** Ai (biz hay tech) sửa RB-2 trên `int/redesign-w1` trước khi merge?

## Đã kiểm đạt

- **W1-01 / P1:** chọn seat đang có tác vụ thu hồi sống (`QUEUED`/`IN_PROGRESS`/`FAILED` — `lockLiveRevocation` loại `CLOSED_FAILED`, `CANCELLED`),
  cổng `licensing` cộng lý do, không tạo tác vụ thứ hai; seat cùng lý do + cùng hồ sơ ⟹ không đổi; `created + reasonAdded = 0` ⟹ 409 rollback cả lệnh
  (I-test khẳng định `account_lock_at` null). K3/K4 vẫn bị từ chối. Sắp (`subscriptionId`, `assignmentId`) khớp `transfer-sweep.policy.ts:80` và
  `decision.service.ts:296` (UUID cùng độ dài ⟹ `<` và `localeCompare` cùng thứ tự). Mỗi seat đi trọn tác vụ → subscription → assignment trước seat kế
  (luật vòng lặp nhiều seat). R-3 có unit. Câu lỗi/mô tả OpenAPI đã sửa. Khẳng định đổi ở `offboarding-departure` (`NOTHING_TO_REVOKE` →
  `ALREADY_RECORDED`) đúng luật mới (seat có tác vụ nay được chọn, rồi tới kiểm khóa tài khoản).
- **W1-26:** `offboardingCaseId` chỉ trả cho chính người nghỉ; DTO `z.uuid()`, OpenAPI `required`.
- **W1-11 / P7 — tính lại tới đồng:** duyệt 100.000 đ/tháng ⟹ lưu 1.200.000 đ; 01/01 năm 1 và năm 2 đều 1.200.000 đ, `seatMonthlyMinor` 100.000 đ
  (giá 01/01 120.000 đ không vào); không số lưu ⟹ 12 × 120.000 = 1.440.000 đ; đóng 31/03 ⟹ 3 × ⌈1.200.000/12⌉ = 300.000 đ ≤ số lưu. Ca cũ T-RQ2
  375.000 đ/tháng: 4.500.000 đ (không còn 4.800.000 đ) — khẳng định đổi đúng `QĐ-114w`/`QĐ-117h`. Nhóm _Dùng lâu dài_ năm ≥ 2 đọc dòng
  `access_request_line_amounts` `held=false` năm `approval+1` (cột `held` không bị lượt 01/01 lật). Số chạy sang năm sau dùng cùng `judgeBatch`.
- **W1-12 / P8:** hai route ghi (`POST /subscription-renewals`, `/:id/outcome`) đều kiểm sau khi khóa kỳ, dùng chung `findUsableItAdminEmployeeIds`
  (không chép luật); `null` ⟹ ai cũng ghi, `substitute=false`; 403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE` + example. Seed ghi bằng IT phụ trách của
  fixture (`renewals.steps.ts:56`, fixture `zoom-pro` → `NV-ITA1`), đúng luật, không nới. Flow `mf5-rightsizing*` đổi người ghi đúng luật.
- **W1-13:** ba điều kiện (người phụ trách, phòng không có IT, IT phụ trách không dùng được); lô không bị từ chối cả lô; enum `NOT_IN_CHARGE` vào
  OpenAPI; cạnh `optimization → identity-access` qua `public/` (tầng dưới).
- **W1-18 / P11:** tử = `KEPT`+`EXEMPTED`+`NEGATED` (`NEGATED` chỉ do `usage-negation.service.ts`, đúng `QĐ-117b`); mẫu loại `LEFT_TO_EXPIRE`,
  `SUPERSEDED`; 11 dòng ⟹ 9/3. I-test cũ đổi 3/8 → 2/7 (28,6 %) tính lại đúng.
- **W1-20 / W1-22 / P13a:** chỉ đường gửi (`version.service.ts:76`) dùng `lockCycleOf`; quyết phiên bản (`lockCycleOfYear`) không bị chặn; `DRAFT`/không
  kỳ ⟹ `NOT_OPEN`; hạn = hôm nay ⟹ `NOT_LOCKED`; hôm sau ⟹ gửi được. Dự phòng = trần hợp lệ; tạo và sửa (`DRAFT`, `OPEN`) đều chặn; `LOCKED` trả
  `LOCKED` trước. Harness/flow dời hạn tạm chỉ trong test, ca 409 dùng route trực tiếp (không đi qua harness). Seed năm có cấp trần/dự phòng thỏa W1-22.
- **W1-21 / P14:** 75/100 → _Chuyển_ 12 ⟹ 75/88 = 85,2 % ⟹ chỉ 80; _Trả lại_ 25 ⟹ 75/75 ⟹ 80 và 100; `CEILING_REDUCTION` không canh. `watchBase` đọc sau
  khi `locks.lock` đã giữ cycle + CC-year (E3), không lấy khóa mới; `settleBase` chạy sau `repo.decide` nên cơ sở hiệu lực đã gồm điều chỉnh. Đúng
  `QĐ-114y`.
- **W1-23 / P13b:** một tx mỗi người nhận, `subject` null, `eventKey nextYearBudget:<year>:<day>` (không đụng khóa cũ dạng UUID), danh sách khóa
  `inbox.policy.ts` giữ `costCenterId` cho dòng cũ, câu hai dạng có unit; `security-jobs.md` cập nhật.
- **OpenAPI:** diff `openapi.json` không thêm `QĐ-`, `FR-`, `US-`, `SBF-`, `MF-`, `BR-`, `O3`, `W1-`, `H-6`, `G-15/16`, `D-35`, `R-n` (chỉ có tên kiểu
  cấp `K2/K4/K5` vốn là giá trị enum). Comment `src` của các gói không nêu mã finding.
- **Kiến trúc:** không query chéo bảng; `BudgetsLocalSeedFacadeModule` chỉ gắn `SeedCliModule`; `installation` (T6) → `budgets/public` (T5) đúng chiều;
  đọc trong `runner.run` của các gói này đi qua `tx`.

## Chưa kiểm được

- Integration/http/flow không chạy ở máy (không DB, theo giao việc). Dựa trên đọc test và CI run `45101176825`; run trên `45ee61f4` đang chạy.
- Concurrency: P1 (thu hồi nghỉ việc ‖ lô `G2` cùng seat) và P14 (quyết điều chỉnh ‖ cam kết mới cùng CC) chỉ suy luận theo bảng khóa, không có test
  barrier mới trong phạm vi.
- `SBF-01` (khởi tạo hệ thống): W1-20 buộc Finance chờ qua hạn nộp mới gửi phiên bản năm đầu (sớm nhất hôm sau ngày mở kỳ). Chưa tìm thấy QĐ nói ngoại
  lệ — Owner nên xác nhận có chấp nhận độ trễ một ngày.
- Chất lượng `budget.steps.spec.ts` (256 dòng đổi ở `d41e10a3`) chỉ đọc lướt; không chạy seed thật.
- Ca `K1` có tác vụ `RETURN` đã `IN_PROGRESS` và đã tick vài bước biến thể `STILL_EMPLOYED` rồi mới cộng lý do nghỉ việc: chỉ có unit R-3, không có I.
