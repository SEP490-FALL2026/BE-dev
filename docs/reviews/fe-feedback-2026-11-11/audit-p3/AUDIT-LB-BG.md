# AUDIT-LB-BG — lane B, gói BG-1 + BG-2 (MF-4 lập ngân sách năm)

- **Phạm vi:** nhánh `feat/fe-feedback-lane-b`, đọc qua git ở `BE-dev-software-license-management` tại `529beb0f`. BG-1 = `b3b7599f`, `1282e391`,
  `f9de496a`; BG-2 = `4d58016a`, `09fb1d0e`, `5a1dfc03`, `a4ba8bec`, `7f740cf4`, `d2bad69f`, `6c62609d`, `50d9ca2f`, `864ccf5b`, `529beb0f`
  (bỏ qua FIX-LB2 `7756c710`). Chỉ đọc; không chạy pnpm/jest/docker; không đọc worktree `be-fe-lane-b`.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process review 5 trục, phân mức Critical/Required/Optional/Nit);
  `superpowers:verification-before-completion` (mọi kết luận có trích file:dòng đã đọc; không tuyên bố "test xanh/đỏ" khi chưa chạy — phần CI
  là suy luận tĩnh, ghi rõ).
- **Căn cứ đối chiếu:** `Docs/Decisions/project-decisions.md` (QĐ-111z/aa/ab/ac/ad/ag/ba/bb, QĐ-109f, QĐ-104f, QĐ-97a/b, QĐ-100h/k);
  BRD FR-5.15/5.16 (dòng 1111–1145), bảng thông báo dòng 1077; "Quy trình và chính sách theo main flow.md" §4.1, §4.4–4.6 (dòng 714–800), `C-09`
  (dòng 60); "Bộ chính sách khởi tạo.md" dòng 189; trong nhánh: `SPEC.md` BG-1/BG-2 (dòng 426–460, T-BG2 dòng 703), `OVERNIGHT-DECISIONS-LANE-B.md`.

## Tóm tắt

| Mức | Số |
| --- | --- |
| Critical | 0 |
| Required | 4 (LBG-01 … LBG-04) |
| Optional | 12 |
| Nit | 5 |

Kết luận: luồng BG-1 (Nháp → Mở → Khóa, khóa theo giờ tổ chức, R-16, khóa liên phòng khi gửi) đúng và có khóa hàng đúng thứ tự. BG-2 có hai
`D-Bn` trái tài liệu (D-B14(1), D-B14(3)), một lỗi tương thích dữ liệu cũ (quý) gây 500, và seed/flows còn gọi hợp đồng cũ rộng hơn mục
"Seed cần cho Z2" ghi ⟹ CI integration (seed) và nightly flows sẽ đỏ khi merge.

---

## Required

### LBG-01 — Cờ đỏ `belowCarriedOver` so **số cơ sở**, tài liệu so **ngân sách phòng = cơ sở + dự phòng** (D-B14(3) trái QT/QĐ-111ac)

- **File:dòng (529beb0f):** `src/modules/budgets/budget/budget.policy.ts:214`
  (`belowCarriedOver = (baseMinor, carriedOverMinor) => baseMinor < carriedOverMinor`); gọi ở `budget/version-view.service.ts:90`,
  `cycle/baseline-flags.service.ts:43`; mô tả wire `cycle/cycle.dto.ts:109-112` ("has a base below carriedOverNextYear").
- **Kịch bản:** cam kết chạy sang 900 tr; Finance chốt cơ sở 850 tr + dự phòng 85 tr = 935 tr. Tài liệu: không cờ (935 ≥ 900). Code: cờ đỏ
  (850 < 900). Ngược lại ví dụ chính thức QT §4.6 "Kỹ thuật 800 + 80 = 880 tr vs 900 tr ⟹ **Đỏ: thiếu 20 tr**": code gắn cờ nhưng không có
  "phần thiếu" (20 tr), FE chỉ tự suy ra được 100 tr nếu dùng cơ sở.
- **Căn cứ:** QĐ-111ac "**ngân sách phòng** thấp hơn số chạy sang ⟹ cờ đỏ"; QT `C-09` "Ngân sách phòng = số cơ sở + dự phòng"; QT §4.6 dòng 780
  "Ngân sách phòng (số cơ sở + dự phòng) **thấp hơn** cam kết sẽ chạy sang ⟹ cờ đỏ **kèm phần thiếu**" và bảng ví dụ dòng 788. D-B14(3) chọn
  "cơ sở" với lý do riêng — trái chữ tài liệu ⟹ Required.
- **Sửa:** `belowCarriedOver(totalMinor, carriedOverMinor)` với `totalMinor = baseMinor + reserveMinor` ở cả hai nơi gọi; thêm trường
  `carriedOverShortfall: moneyView` (= `max(0, carried − (base + reserve))`) vào `VersionWire` và `baselineDepartmentView`; sửa mô tả DTO.
- **Test/mutation nên thêm:** unit `budget.policy.spec.ts`: (850+85 vs 900 ⟹ false), (800+80 vs 900 ⟹ true, shortfall 20); integration
  `budget-baseline-version.integration-spec.ts:111` hiện dùng cơ sở 40 tr + 5 % vs 123 tr — cả hai định nghĩa đều cờ, nên mutation đổi
  `baseMinor` ↔ `base+reserve` **không bị bắt**; thêm ca cơ sở < chạy sang ≤ cơ sở + dự phòng.

### LBG-02 — Dự phòng theo tỷ lệ khác mặc định không cần lý do (D-B14(1) trái QĐ-100h/100k, FR-5.15(2))

- **File:dòng:** `src/modules/budgets/budget/budget.policy.ts:182-190` (`reserveReasonMissing` so `reserveMinor` với
  `defaultReserveOf(base, version.reservePercent)` — tức tỷ lệ **đã lưu của phiên bản**), `:197-212` (`versionFiguresOf` lưu tỷ lệ Finance
  chọn vào `reservePercent`), `version/version-figures.service.ts:89-93` (`shareOf` ghi `next.reservePercent = patch.reservePercent`).
- **Kịch bản:** tham số mặc định 10 %. Finance `POST /budget-versions { proposalId, reservePercent: 15 }` (hoặc `PUT { reservePercent: 20 }`),
  không `reserveReason`, rồi gửi ⟹ `reserveReasonMissing` = false (15 % đúng bằng tỷ lệ đã lưu) ⟹ gửi được, không lý do. Test
  `test/integration/requests/budget-versions.integration-spec.ts:173-181` còn khẳng định `reservePercent: 20, reserveReason: null`.
- **Căn cứ:** QĐ-100h "Finance sửa được cho từng phòng khi lập phiên bản và **nhập lý do nếu khác mặc định**"; QĐ-100k "kèm lý do"; BRD
  FR-5.15(2) "sửa được cho từng phòng kèm **lý do khi khác mặc định**"; QT §4.6 điều kiện "10 % số cơ sở, hoặc khác mặc định kèm **lý do**";
  "Bộ chính sách khởi tạo" dòng 189 "khác thì có lý do". SPEC BG-2 chỉ ghi `reserveReason?` (tùy chọn khi bằng mặc định) — không cho phép bỏ lý do khi
  khác mặc định.
- **Sửa:** tách "tỷ lệ mặc định lúc lập" (cột `reserve_percent` hiện có, vẫn ghi `defaultPercent`) khỏi "tỷ lệ Finance chọn" (chỉ dùng để tính
  `reserveMinor`, không ghi đè `reserve_percent`); hoặc giữ cột nhưng `reserveReasonMissing(version, defaultPercent)` so với tham số mặc định đọc
  lúc gửi. Bỏ nhánh "tỷ lệ Finance chọn được lưu nên không cần lý do" ở D-B14(1) và docstring `budget.policy.ts:193-196`. Đổi test
  `budget-versions.integration-spec.ts:181` thành: gửi với 20 % không lý do ⟹ 422 `BUDGET.RESERVE_REASON_REQUIRED`.
- **Test/mutation:** unit `reserveReasonMissing({base:1000, reserve:150, reservePercent:15, reason:null}, default 10) === true`.

### LBG-03 — Sửa phiên bản cũ có dự báo quý ⟹ vi phạm CHECK `budget_versions_quarters_check` ⟹ 500

- **File:dòng:** `src/modules/budgets/budget/version.repo.ts:382-402` (`patch` ghi `baseMinor`, `reserveMinor`, `totalMinor` mới, **không**
  xóa `q1..q4_minor`); CHECK ở `prisma/migrations/20261023180000_budgets_proposals_and_versions/migration.sql:220-224`
  (`q1..q4` NULL hết **hoặc** tổng q = `total_minor`), không migration BG-2 nào bỏ/nới CHECK này (`git grep budget_versions_quarters_check` chỉ
  thấy migration gốc). Trước BG-2.4, `quartersMismatchAfter` (bị xóa ở `09fb1d0e`) chặn bằng 422.
- **Kịch bản:** phiên bản `DRAFT`/`CHANGES_REQUESTED` lập trước merge có `quarters` (FE đã từng gửi). Finance `PUT /budget-versions/{id}
  { base, baseReason }` ⟹ `total_minor` đổi, `q*` giữ ⟹ PostgreSQL 23514 ⟹ 500 (đúng cơ chế D-B10 tự mô tả). Phiên bản đó không bao giờ sửa
  được nữa (bị trả về thì kẹt).
- **Căn cứ:** QĐ-111ac "bỏ quý — một số cả năm"; D-B9 "cột `q1..q4_minor` không ghi nữa nhưng không xóa (expand–contract)" — expand–contract
  đòi đường ghi mới vẫn thỏa CHECK cũ.
- **Sửa:** trong `patch` thêm `q1Minor: null, q2Minor: null, q3Minor: null, q4Minor: null` (thôi giữ dự báo quý — đúng QĐ-111ac), hoặc migration
  `20261113100800`: `UPDATE budget_versions SET q1_minor=NULL,… WHERE state IN ('DRAFT','CHANGES_REQUESTED')`. Nên làm cả hai.
- **Test:** integration: chèn phiên bản `DRAFT` có q1..q4 = tổng bằng SQL, `PUT { base, baseReason }` ⟹ 200 và `q1_minor IS NULL`.

### LBG-04 — Seed và nightly flows còn gọi hợp đồng cũ, rộng hơn mục "Seed cần cho Z2" ⟹ CI integration + nightly đỏ

- **File:dòng:**
  - `src/cli/seed/steps/finance.steps.ts:109` (`found?.firstPublishedAt` — wire kỳ không còn trường này ⟹ không bao giờ "present"),
    `:112-117` (`POST /budget-cycles` thiếu `sharedPoolReserve` ⟹ 422), `:119-123` (`PUT …/department-ceilings`, `POST …/publish` ⟹ 404), không
    gọi `POST …/opening`.
  - `src/cli/seed/steps/budget.steps.ts:45-49` (`POST /budget-proposals` gửi `lines`, thiếu `requestedAmount`/`attachmentIds` ⟹ 422
    `unrecognized_keys`), `:61`, `:127` (`/submission` không có tệp ⟹ 422 `BUDGET_VERSION.ATTACHMENT_REQUIRED`), `:133-135`
    (`decision: 'REQUEST_CHANGES'` ⟹ 422). Fixture `src/cli/seed/fixture/shared-demo-v4/finance.ts:61-148` (dòng), README dòng 253, 255.
  - `test/integration/installation/seed-calendar.integration-spec.ts:129` đọc `first_published_at`.
  - `test/flows/mf4-budget.flow-spec.ts:44-71`, `:166-207` gửi `lines` cho `BM-10` và assert `issuesOf(...) = ['lines.0.amount']`.
- **Kịch bản/CI (suy luận tĩnh, chưa chạy):** các suite chạy `ops:seed apply` qua API thật — `test/integration/installation/seed.integration-spec.ts`,
  `seed-calendar`, `seed-rerun`, `test/integration/_serial/seed-check-runtime.integration-spec.ts` — sẽ đỏ ở bước `budget.cycles`/`budget.*`; nightly
  `flows` (mf4, và mọi flow cần dataset) đỏ. OVERNIGHT "Seed cần cho Z2" chỉ nêu `finance.steps.ts` — thiếu `budget.steps.ts`, fixture và flow.
- **Căn cứ:** QĐ-111aa/ab/ac/ad; memory Owner "Full CI before done" (chạy mọi job ci.yml).
- **Sửa:** seed: `POST /budget-cycles` kèm `sharedPoolReserve` ⟹ `POST /{year}/opening`; bỏ ceilings; nhận diện "đã có" bằng `openedAt !== null`;
  `BM-10` = upload tệp (`/budget-proposals/attachments` → complete) + `requestedAmount` + `note`; đính ≥ 1 tệp vào phiên bản trước `/submission`;
  `REQUEST_CHANGES` ⟹ `RETURN`. Fixture: `lines` ⟹ `requestedAmount`. `seed-calendar:129` ⟹ `opened_at IS NOT NULL`. Flow mf4 sửa thân `BM-10` và
  ca 422 (`requestedAmount`). Cập nhật mục "Seed cần cho Z2" cho đủ.
- **Test:** chạy lại 4 suite seed + `pnpm test:flows` sau seed (theo memory "post-seed rerun").

---

## Optional (A/B nếu là thiết kế)

| Mã | File:dòng | Vấn đề / kịch bản | Đề xuất |
| --- | --- | --- | --- |
| LBG-05 | `cycle/package.service.ts:20-56` | Gói B4/B5 không có `carriedOverNextYear`, `belowCarriedOver`, `noProposalSubmitted` theo phòng; QT §4.7 dòng 808 và FR-5.16(4) yêu cầu màn quyết hiện chạy sang + cờ đỏ + cờ không nộp **cạnh đề nghị**. FE phải gọi `GET /budget-versions/{id}` từng phòng (N+1). | A (khuyến nghị): thêm ba trường vào `departments[].version` của package (dùng `BaselineFlags`, 3 câu lệnh). B: để FE đọc từng phiên bản. |
| LBG-06 | `budget/version-view.service.ts:91` | `noProposalSubmitted` chỉ true với `BASELINE_NO_PROPOSAL`; phiên bản cũ `BASELINE_NO_HEAD` (QĐ-104f — cũng là phòng không có đề nghị, có cờ) trả false. | `origin === 'BASELINE_NO_PROPOSAL' \|\| origin === 'BASELINE_NO_HEAD'`. |
| LBG-07 | `budget/budget-notifier.service.ts:304` | eventKey dời hạn = `…:${submissionDeadline}:${head}`: dời A→B→A→B thì lần B thứ hai bị chống trùng, trưởng phòng vẫn nghĩ hạn là A. | Thêm `previousSubmissionDeadline` (hoặc id bản ghi audit) vào eventKey. Test: ba lần dời ⟹ ba thông báo. |
| LBG-08 | `cycle/cycle.service.ts:93-100`, `:193` | Không kiểm `sharedPoolReserve ≤ annualCeiling` khi tạo/sửa; dự phòng > Trần ⟹ `available` bị kẹp 0 ở view, mọi lần gửi 409 mà không báo nguyên nhân sớm. | 422 `BUDGET_CYCLE.RESERVE_OVER_CEILING` ở create/update (policy thuần, có unit test). |
| LBG-09 | `cycle/cycle.policy.ts:128` | Kỳ LOCKED từ chối **mọi** sửa, kể cả hạn quyết và ưu tiên; tài liệu chỉ khóa hạn nộp, Trần, Dự phòng kho. | A: cho hạn quyết + ưu tiên đổi sau khóa (kèm lý do). B (hiện tại): khóa hết — ghi vào D-B8 để Owner biết. |
| LBG-10 | `cycle/cycle.service.ts:213-220`, `cycle.policy.ts:162-174` | Phòng tạo **sau khi mở kỳ** (cửa sổ R-16) không được báo kỳ đang mở + mẫu `BM-10`; QĐ-111ba "tạo trước hạn nộp ⟹ trưởng phòng nộp như mọi phòng". | Khi gán trưởng phòng cho phòng thuộc năm của kỳ đang OPEN ⟹ gửi `BUDGET_CYCLE_OPENED` (listener của sự kiện gán trưởng phòng). |
| LBG-11 | `cycle/cycle.service.ts:226-233` | `headsOf` = 2 truy vấn/phòng trong transaction mở kỳ/dời hạn (đang giữ khóa `FOR UPDATE` của kỳ) — 500 phòng ⟹ ~1.000 câu lệnh dưới khóa. | Một lần `getDepartmentHeads(ids)` + `getUpcomingHeads(ids)` theo lô. |
| LBG-12 | `budget/budget.dto.ts:34-38` (D-B12(2)) | `costCenterId` của `BM-10` tùy chọn; SPEC ghi bắt buộc. Server suy ra Cost Center của phòng mình, bắt buộc khi > 1 (422) — đúng FR-5.15(1). | A (khuyến nghị, giữ): tùy chọn. B: bắt buộc như SPEC. Không trái QĐ. |
| LBG-13 | `version/version-creation.service.ts:44-92`, `version.service.ts:63-95` | Finance lập/gửi phiên bản từ đề nghị **trước** hạn nộp được; QT §4.6 "Sau khi khóa, Finance … chốt". Gửi sớm còn đóng cửa sổ tạo phòng R-16 sớm. | A: chặn gửi khi kỳ chưa LOCKED (409). B: giữ, ghi rõ trong D-B8. |
| LBG-14 | `test/integration/budgets/budget-cycle-lifecycle.integration-spec.ts` | Mất ca đồng thời của suite cũ `budget-cycle-edges` ("hai lần phát hành cùng lúc, báo mỗi trưởng phòng một lần"); mở kỳ mới chưa có ca hai `POST /opening` song song. | Thêm: 2 lần mở song song ⟹ 1×200 + 1×409 `ALREADY_OPEN`, mỗi trưởng phòng 1 thông báo. |
| LBG-15 | `Docs/Figma UI-UX/API-Integration/reference/budgets.md`, `api-index.md`, `coverage-manifest.json` | Tài liệu FE vẫn liệt kê 8 route đã xóa (`department-ceilings`, `publish`, 6 route dòng/import). | Sinh lại API docs sau merge (generator trên clone dev). |
| LBG-16 | `prisma/migrations/20261113100400_*` | Kỳ năm sau tạo trước migration mà chưa "phát hành" giờ thành `OPEN` (có `opened_at`) — trưởng phòng nộp được ngay mà chưa từng nhận thông báo mở kỳ. | FYI cho môi trường đã có dữ liệu; nếu cần, gửi bù `BUDGET_CYCLE_OPENED` cho kỳ `first_published_at IS NULL` hoặc ghi chú vận hành. |

## Nit

- LBG-17 `cycle/cycle.service.ts`/`baseline.service.ts:203`: `locked = today > cycle.submissionDeadline` bỏ qua kỳ nháp hạn quá khứ ⟹ `noProposalSubmitted`
  true cho cả kỳ nháp; dùng `cycleStateOf(cycle, today) === 'LOCKED'`.
- LBG-18 migration `20261113100600` `DROP CONSTRAINT` không `IF EXISTS`; `100400` `ADD CONSTRAINT` không xóa trước — không chạy lại được thủ công
  (Prisma chỉ chạy một lần, nên Nit).
- LBG-19 `budget/version.repo.ts:485-487` đếm `budget_attachments` (bảng của capability `attachment`) từ capability `budget` — đã ghi ở D-B14(4); nên
  chuyển thành một hàm đọc ở `attachment/` khi gỡ được vòng.
- LBG-20 `dashboards/manager` khóa `approvedBudgetLines` trỏ sang `budgetMine` (D-B11) — đổi tên khi FE đổi.
- LBG-21 `src/cli/seed/fixture/shared-demo-v4/README.md:253,255` còn route đã xóa.

---

## Đánh giá các câu hỏi riêng

- **`costCenterId` của `BM-10` tùy chọn (D-B12(2))** — không trái QĐ-111ab/FR-5.15(1) (trưởng phòng nộp cho Cost Center phòng mình; server suy ra,
  bắt buộc khi > 1 Cost Center). Optional LBG-12, khuyến nghị giữ.
- **`belowCarriedOver` so cơ sở (D-B14(3))** — trái QĐ-111ac đọc cùng `C-09` và QT §4.6 (ví dụ "880 vs 900 ⟹ thiếu 20") ⟹ **Required LBG-01**.
- **Dự phòng theo tỷ lệ không cần lý do (D-B14(1))** — trái QĐ-100h/100k ⟹ **Required LBG-02**.
- Các `D-Bn` khác của BG: D-B8 (khóa từ ngày sau hạn; nháp đóng cửa sổ tạo phòng), D-B9 (giữ tên `base`/`reserve`), D-B10, D-B11, D-B13, D-B15 —
  không trái QĐ/BRD; D-B9 lệch tên SPEC (`baseAmount`) là thiết kế, FE đã dùng tên cũ.

## Phần đúng đã kiểm

- **Trạng thái kỳ** `cycle/cycle.policy.ts:20-27`: Nháp tới khi mở; OPEN tới hết ngày hạn; LOCKED từ ngày sau; không mở lại (`judgeOpening` LOCKED ⟹
  409). `today` = `organizationReads.businessToday` (giờ tổ chức, `budget-facts.service.ts:120-122`).
- **Sửa kỳ theo trạng thái** `cycle.policy.ts:122-139`: LOCKED từ chối (Trần + Dự phòng kho khóa cùng — R-14); OPEN: dời hạn không về quá khứ,
  Trần/Dự phòng kho/hạn nộp cần lý do; lưu trước/sau ở audit (`cycle.service.ts:201-212`); báo trưởng phòng khi dời hạn (`:213-220`), dedupe theo
  người (`new Set(heads)`). Xóa chỉ nháp (`judgeDelete`). Không còn route chia Trần/phát hành (404 ở `test/http/budgets/budget-cycles.http-spec.ts:118-119`).
- **SoD:** chỉ FINANCE ghi kỳ (`@RequireRoles('FINANCE')` cho POST/PATCH/DELETE/opening; `facts.requireFinance`); Người duyệt chi chỉ đọc, không
  đặt Trần; trưởng phòng không thấy Trần (baseline/notice không có Trần). Quyết định phiên bản giữ `SoD-8` (`version-decision-judge.service.ts:50-59`).
- **Khóa liên phòng khi gửi:** `version.service.ts:74` khóa kỳ `FOR UPDATE` trước đề nghị/phiên bản/năm (`version-access.service.ts:77-83`), nên
  hai lần gửi của hai phòng nối đuôi; tổng = mới nhất mỗi Cost Center trong {SENT, CHANGES_REQUESTED, APPROVED} + bản đang gửi thay chỗ
  (`budget.policy.ts:234-253`), so `Trần − Dự phòng kho` ⟹ 409 `BUDGET_VERSION.OVER_CEILING` `details.overBy`; có ca đồng thời
  `budget-annual-check.integration-spec.ts:185-195`. PATCH kỳ cũng khóa `FOR UPDATE` cùng hàng ⟹ đổi Trần không chen giữa kiểm và ghi.
- **Thứ tự khóa** nhất quán cycle → proposal → version → year ở `proposal-sender.service.ts:52-83`, `proposal.service.ts` (resubmit/withdraw/giveBack),
  `version-baseline-creation.service.ts:151-154`; `createFromProposal` không khóa kỳ nên không đảo thứ tự.
- **BM-10** `budget.dto.ts:15-41`: 1–10 tệp, không trùng, `requestedAmount`, `note` ≤ 1000 đã trim; CHECK DB khớp (`100700`). Gửi/gửi lại/rút sau hạn
  ⟹ 409 `BUDGET_CYCLE.LOCKED`; Finance trả về chỉ trước hạn (`proposalWorkRefusal`, `cycle.policy.ts:34-42`).
- **Phiên bản:** cơ sở bỏ trống ⟹ `carriedOverNextYear` (`versionFiguresOf`); mặc định 10 % từ tham số `BUDGET_RESERVE_DEFAULT_PERCENT`; `reserve` và
  `reservePercent` loại trừ nhau (422); ≥ 1 tệp khi gửi (`version-access.service.ts:86-90`), lưu nháp không chặn; bỏ quý khỏi wire.
- **Không nộp / không trưởng phòng:** `baselineVersionRefusal` (`cycle/baseline.policy.ts:157-170`) bỏ chặn `HAS_HEAD` (QĐ-111bb), chỉ sau hạn, chặn khi
  còn đề nghị SUBMITTED/REVIEWED; đề nghị RETURNED không chặn (đúng). `origin = BASELINE_NO_PROPOSAL`.
- **Quyết định:** chỉ `APPROVE` | `RETURN` (lý do bắt buộc, APPROVE không lý do) ở `budget.dto.ts:47-63`; `RETURN` ⟹ `CHANGES_REQUESTED` (Finance sửa,
  gửi lại); `REJECT`/`REQUEST_CHANGES` ⟹ 422; enum `REJECTED` giữ đọc dữ liệu cũ.
- **R-16 / QĐ-111ba / QĐ-109f:** `windowOf` (`cycle.policy.ts:162-174`) mở từ khi mở kỳ năm sau tới lần gửi phiên bản đầu (kể cả sau hạn nộp);
  không có kỳ nào ⟹ như cài đặt; kỳ năm nay không mở cửa sổ. Tạo phòng đọc kỳ `FOR SHARE`, gửi khóa `FOR UPDATE` ⟹ không lọt.
- **Kiến trúc:** `CarriedOverContributions` mở ở `budgets/public/budgets.extension-points.ts`, `requests` (tier trên) sẽ bind — budgets không import
  requests; organization → budgets qua `DepartmentCreationWindowHook` (organization không import budgets). Thư mục ≤ 25 tệp (budget 23, attachment 21,
  version 20). Module card `budgets/README.md` cập nhật. Gate `module-graph` R10 không đỏ vì chưa ai ngoài budgets tiêm `CarriedOverContributions`.
- **OpenAPI:** `openapi.json` ở 529beb0f không chứa "QĐ-", "R-1x", "D-B".
- **Migration:** `100400` chỉ `DROP NOT NULL` + CHECK both-or-neither (hàng cũ có cả hai ⟹ thỏa); `100500` chỉ `ADD VALUE IF NOT EXISTS`, tách khỏi
  `100600` dùng giá trị mới (đúng ràng buộc PostgreSQL); `100600` chỉ nới CHECK nguồn; `100700` `ADD COLUMN IF NOT EXISTS` + CHECK cho phép NULL.
  Không drop cột/bảng (expand–contract). Ngoại lệ: LBG-03.
- **Test:** không có `.skip/.only/xit` mới trong diff; test bị xóa đều gắn với luật đã bỏ (dòng, ZBB, xếp hạng, Trần phòng, phát hành, quý) — không mất BR
  còn hiệu lực, trừ ca đồng thời mở kỳ (LBG-14).

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh |
| --- | --- | --- | --- |
| `src/modules/budgets/cycle/cycle.policy.ts` | `return today > cycle.submissionDeadline ? 'LOCKED' : 'OPEN';` | `return today >= cycle.submissionDeadline ? 'LOCKED' : 'OPEN';` | `pnpm exec jest src/modules/budgets/cycle/cycle.policy.spec.ts` |
| `src/modules/budgets/cycle/cycle.policy.ts` | `const needsReason = change.submissionMoved \|\| change.ceilingChanged \|\| change.reserveChanged;` | `const needsReason = change.submissionMoved \|\| change.ceilingChanged;` | `pnpm exec jest src/modules/budgets/cycle/cycle.policy.spec.ts` |
| `src/modules/budgets/cycle/cycle.policy.ts` | `input.nextCycle.opened && !input.nextCycle.firstVersionSent` | `input.nextCycle.opened` | `pnpm exec jest src/modules/budgets/cycle/cycle.policy.spec.ts` |
| `src/modules/budgets/cycle/cycle.policy.ts` | `state === 'DRAFT' ? 'NOT_OPEN' : state === 'LOCKED' ? 'LOCKED' : null` | `state === 'DRAFT' ? 'NOT_OPEN' : null` | `pnpm exec jest src/modules/budgets/cycle/cycle.policy.spec.ts` |
| `src/modules/budgets/budget/budget.policy.ts` | `return total > input.availableMinor` | `return total >= input.availableMinor` | `pnpm exec jest src/modules/budgets/budget/budget-annual-check.policy.spec.ts` |
| `src/modules/budgets/version/version-access.service.ts` | `const cycle = await this.cycles.lockByYear(tx, version.organizationId, version.year, 'UPDATE');` | `const cycle = await this.cycles.lockByYear(tx, version.organizationId, version.year, 'SHARE');` | `pnpm test:integration -- test/integration/budgets/budget-annual-check.integration-spec.ts` (ca đồng thời phải đỏ/treo deadlock) |
| `src/modules/budgets/budget/budget.policy.ts` | `baseMinor < carriedOverMinor` | `baseMinor <= carriedOverMinor` | `pnpm exec jest src/modules/budgets/budget/budget.policy.spec.ts` (sau LBG-01 đổi theo tổng cơ sở + dự phòng) |
