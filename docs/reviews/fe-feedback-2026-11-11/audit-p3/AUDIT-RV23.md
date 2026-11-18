# AUDIT RV-2 + RV-3 — cảnh báo 80/100 % và rà soát quý (MF-4 trong năm, SBF-11)

- Phạm vi: `810957b1..1e134330` — RV-2 `982280dc`, `afcd9e77`, `b1bd15ab`, `3e232de6`; RV-3 `3166bd0b`, `e68e8f7c`, `11ad63fd`, `73d38397`, `3f344392`, `1e134330`. Mọi `file:dòng` là ở `1e134330`.
- Cách làm: chỉ đọc (`git show`, `git archive` ra scratchpad để grep). **Không** chạy pnpm/jest/docker; không đọc `be-fe-feedback`. Mọi nhận định về test là đọc mã test, không phải kết quả chạy.
- Skill: `agent-skills:code-review-and-quality` (năm trục, phân mức), `superpowers:verification-before-completion` (không tuyên bố "xanh" khi chưa chạy). Process skill: dùng chính quy trình review của skill trên (không có skill "audit" riêng).
- Nguồn đối chiếu (QĐ mới nhất thắng): `QĐ-111ae/af/ag/ah/aj/bh`, `QĐ-99h`, `QĐ-97c`; US-12-21 (AC-1…AC-12, OQ-111E12-6, bảng thông báo US-12-15 dòng 89/91); QT main flow §4.12, §4.13; SBF-11 §4–§5; SPEC/PLAN RV-2, RV-3; D-100, D-102 (`OVERNIGHT-DECISIONS.md`); DECISIONS P-13.

## Kết luận

Không có Critical. **3 Required mức Trung bình** (RV2-01 báo lại sau khi tụt dưới ngưỡng, RV3-01 thiếu thông báo lúc mở cửa sổ giải trình, RV3-02 định nghĩa "cam kết dài hạn"), 4 Required mức Thấp, còn lại Optional/FYI. Khung kỹ thuật (khóa năm, transaction, trigger, migration, phân quyền) chắc chắn; lỗi nằm ở chỗ khớp nghiệp vụ.

---

## Findings

### RV2-01 — Required (Trung bình) — Tụt dưới ngưỡng do giải phóng/thu hồi rồi vượt lại thì **không** báo lại

- **Vị trí:** `prisma/migrations/20261113102100_rv2_budget_threshold_alerts/migration.sql:20-21` (unique `cost_center_id, year, threshold, base_minor`); `src/modules/budgets/threshold/threshold.repo.ts:20-29` (`skipDuplicates`); `src/modules/budgets/threshold/threshold-notifier.service.ts:36` (`eventKey` chứa `baseMinor`, cũng chống trùng theo người nhận).
- **Kịch bản:** cơ sở 100 tr. Đã dùng 79 → 81 tr (cam kết R1) ⟹ ghi `(cc, năm, 80, 100tr)`, báo. Thu hồi sớm seat / Request hết hạn ⟹ giải phóng 15 tr, đã dùng 66 tr (đã xuống dưới 80 %). Tháng sau Request R2 làm đã dùng 66 → 82 tr: `crossedThresholds` trả `[80]` (đúng), nhưng `insertNew` đụng unique ⟹ trả `[]` ⟹ **không ai được báo**. Tương tự với 100 %: hóa đơn điều chỉnh/giải phóng phần dư rồi vượt lại.
- **Căn cứ:** `QĐ-111af`: "báo trưởng phòng và Finance — **một lần mỗi lần vượt**". US-12-21 OQ-111E12-6 (đã đóng): "mức đã dùng xuống dưới ngưỡng — **kể cả** khi điều chỉnh nâng số cơ sở — rồi vượt lại ⟹ báo lại". Main flow summary US-12-21: "xuống dưới ngưỡng (vd điều chỉnh nâng số cơ sở) rồi vượt lại ⟹ báo lại". QĐ-104i: thu hồi sớm vẫn giải phóng cam kết ⟹ tụt dưới ngưỡng là chuyện thường. Khóa 4 cột là do SPEC/MAJ-10 đặt; nó chỉ đúng khi tụt dưới ngưỡng là do cơ sở tăng, sai khi đã dùng giảm. US đứng trên SPEC nên phải sửa mã (và SPEC).
- **Cách sửa (ít phần nhất):** `watch` đã giữ khóa năm suốt lần đọc trước/sau, và `trước < t×b` nghĩa là **đang dưới ngưỡng** ⟹ mỗi lần `crossedThresholds` trả về là một lần vượt mới. Thay unique 4 cột bằng `(cost_center_id, year, threshold, episode)`, `episode = 1 + max(episode)` đọc dưới khóa năm (vẫn giữ lưới an toàn DB của MAJ-10 khi lỡ `settle` hai lần trong một thay đổi); `eventKey = budgetThreshold:<cc>:<năm>:<t>:<episode>`. Migration mới `20261113102300` (DROP INDEX IF EXISTS cũ, ADD COLUMN IF NOT EXISTS `episode` int NOT NULL DEFAULT 1, CREATE UNIQUE INDEX IF NOT EXISTS mới). Ghi lại trong SPEC RV-2 và D-100 (5)(6).
- **Test:** integration trong `budget-threshold-alert.integration-spec.ts`: cơ sở 100 tr; giữ cam kết 81 tr ⟹ 1 dòng; giải phóng 15 tr (`BudgetsApi.release`) ⟹ không dòng mới; giữ thêm 16 tr ⟹ dòng 80 % thứ hai và `told(unit, 80)` có head+Finance **hai lần**. Mutation: đặt lại unique cũ ⟹ ca này đỏ.

### RV3-01 — Required (Trung bình) — Mở kỳ quý **không** gửi yêu cầu giải trình cho trưởng phòng (RV-3-O1)

- **Vị trí:** `src/modules/budgets/review/budget-review-snapshot.service.ts:76-90` (chỉ tính `explanationsDueOn`, ghi kỳ, trả về); `src/modules/budgets/review/budget-review-explanation-reminder.service.ts:24-27` (chỉ nhắc từ ngày hạn).
- **Kịch bản:** Finance chốt tháng 6 ngày 07/07/2027 (Thứ Tư). `H5` (`CC-MKT` *Vàng*) không nhận gì cho tới 13/07 (ngày hạn) — tức là lần đầu biết mình bị hỏi là **đúng ngày hạn**; 4 trên 5 ngày làm việc bị mất.
- **Căn cứ:** US-12-21 AC-4: "**When** kỳ rà soát quý mở, **Then** … `H5`, `H2`, `H7` **nhận yêu cầu giải trình** (`US-12-15` dòng 91) với hạn hết thứ Ba 13/07/2027 …; `H1` không nhận". Bảng thông báo US-12-15 dòng 91: "Yêu cầu giải trình kỳ quý … **Khi Finance chốt số tháng 3/6/9**; hạn 5 ngày làm việc; quá hạn: nhắc ở ngày hạn rồi mỗi Thứ Hai". QT §4.13 điều kiện tối thiểu: "Mỗi phòng Vàng/Đỏ/Dưới mức có trưởng phòng **đã được yêu cầu giải trình kèm hạn**". SBF-11 vai SaaS-Sentry: "yêu cầu giải trình". Sonnet dựa vào chữ SPEC ("nhắc ở ngày hạn…") — SPEC thiếu, US/QT rõ ràng ⟹ không cần Owner chốt.
- **Cách sửa:** trong transaction `write` của snapshot, sau `repo.insert`, với mỗi dòng `PENDING` có trưởng phòng hôm nay ⟹ `notifyInApp` mã mới `BUDGET_REVIEW_EXPLANATION_REQUESTED` `{ periodId, costCenterId, year, month, dueOn, light }` (không số tiền — đúng `FIGURE_WORDS`), `eventKey = review:<kỳ>:<cc>:open`. Thêm mã ở `notifications.types.ts` + `inbox.policy.ts` (D12); cập nhật tài liệu API FE (RV-3-O7).
- **Test:** ca integration "the quarter opens…" (`budget-review-explanation.integration-spec.ts:129`) thêm: head `answering`, `silent` có một thông báo `…:open`; `green`, `other` không. Mutation: bỏ vòng notify ⟹ đỏ.

### RV3-02 — Required (Trung bình, cần Owner chọn) — "Cam kết dài hạn" (RV-3-O3) đang là "lập trước quý của **hôm nay**", không khớp tài liệu và không gắn với kỳ đang xem

- **Vị trí:** `src/modules/budgets/commitment/commitment.service.ts:343-359` (`quarterStart` tính từ `today`); `src/modules/budgets/budget/commitment.repo.ts:489` (`state HELD, createdAt < quarterStart`).
- **Vấn đề đã kiểm:** (a) gắn với ngày gọi, không với kỳ: Finance mở biên bản quý 6 vào tháng 10 sẽ thấy danh sách của quý 4; (b) Request `K1` 1 tháng lập 30/09 bị coi là "dài hạn", còn Request *Dùng lâu dài* lập 02/10 thì không; (c) không lọc năm ⟹ trộn cam kết năm cũ còn giữ (QĐ-104e); (d) `toDateColumn` = nửa đêm **UTC**, giờ VN +7 ⟹ cam kết lập 01/07 00:00–06:59 giờ VN bị tính là "trước quý".
- **Tài liệu nói gì:** `QĐ-111aj`: "rà soát quý chỉ hiện cam kết dài hạn và mức dùng, ít dùng ⟹ MF-5" — không định nghĩa thêm. Nguồn gốc P-13 (DECISIONS.md dòng 73, chốt A): "rà soát quý hiện **quyền đang chạy** + mức dùng". AC-8: `R95` `K1` 9 tháng duyệt 15/05/2027 tới 14/02/2028 phải hiện ở kỳ quý 09/2027 — tức là quyền còn chạy, thời hạn vượt kỳ rà soát. Không chỗ nào nói "lập trước quý".
- **Đề xuất cho Owner:**
  - **A (khuyến nghị — đơn giản, đúng P-13):** "cam kết dài hạn" = mọi cam kết **còn giữ** (`HELD`) của Cost Center **trong năm của kỳ** đang xem (quyền đang chạy), không lọc ngày lập. Route nhận `periodId` (hoặc `year` bắt buộc khi `longTerm=true`). Không cần dữ liệu từ `requests`.
  - **B (sát chữ "dài hạn"):** cam kết còn giữ của Request *Dùng lâu dài* hoặc có ngày hết thời hạn **sau ngày cuối quý của kỳ**; cần thêm `termEndsOn`/`perpetual` vào `CommitmentRequestView` (hook `requests` bind) — thêm một trường, một join.
  - Cả hai: bỏ phụ thuộc `today`, dùng tháng của kỳ.
- **Test:** A — cam kết lập trong quý đang chạy vẫn hiện (đảo ngược ca `budget-commitments-long-term.integration-spec.ts:74`), cam kết năm trước không hiện. B — `K1` 1 tháng lập tháng 9 không hiện ở kỳ 09; `R95` hiện.

### RV2-02 — Required (Thấp) — Duyệt phiên bản thường gắn cam kết chờ ngân sách mà không xét ngưỡng (RV-2-O1)

- **Vị trí:** `src/modules/budgets/version/version-decision-writer.service.ts:70` (`attachWaiting` không có `watch/settle`); đối chiếu `src/modules/budgets/adjustment/budget-adjustment-apply.service.ts:54-64` (đường R-48 thì có).
- **Kịch bản:** phiên bản 2027 duyệt muộn (tháng 1 — chính là tình huống thông báo dòng 93 *Chưa có ngân sách năm mới* nhắc từ 01/12). Khoản 01/01 của các Request *Dùng lâu dài* chờ ngân sách 85 tr; phiên bản cơ sở 100 tr được duyệt ⟹ đã dùng nhảy 0 → 85 tr (85 %) mà không ai được báo. Cùng một sự kiện qua đường điều chỉnh R-48 thì có báo ⟹ hai đường cùng nghiệp vụ cho hai kết quả.
- **Căn cứ:** `QĐ-111af` "Phần đã dùng chạm 80 % … ⟹ báo"; SBF-11 `e_use` "Used Spend Crosses 80% or 100% of Base"; US-12-15 dòng 89 "Khi phần đã dùng đi qua 80 % rồi 100 % số cơ sở hiệu lực".
- **Cách sửa:** bọc `attachWaiting` trong `VersionDecisionWriter` bằng `thresholds.watch(tx, [{costCenterId, year}])` / `settle` (khóa năm đã được `VersionDecisionJudge` lấy ở `version-decision-judge.service.ts:68`, lấy lại là no-op, đúng thứ tự khóa). Kèm quyết định nhỏ cho Owner (FYI, xem RV2-06): khi trước đó **chưa có cơ sở**, có coi `trước = 0` không (thực chi đã có từ trước cũng làm "chạm" ngưỡng lần đầu).
- **Test:** integration: Cost Center chưa có phiên bản, `holdYearStart` 85 tr (chờ), duyệt phiên bản 100 tr ⟹ một dòng 80 %, head+Finance được báo.

### RV3-03 — Required (Thấp) — "Nhu cầu đã biết tới cuối năm (số tiền)" đang tùy chọn và không nhận 0

- **Vị trí:** `src/modules/budgets/review/budget-review-explanation.dto.ts:46-59` (`amount` `.optional()`); `budget-review-explanation.service.ts:82-85` (`positiveMoney` ⟹ phải > 0); migration `20261113102200:31` cho phép `>= 0` (lệch nhau).
- **Kịch bản:** `H5` nộp không có số tiền ⟹ được lưu `EXPLAINED`; phòng biết chắc không cần thêm gì (0 đ) thì không nhập được 0, phải bỏ trống.
- **Căn cứ:** US-12-21 AC-5: "nộp mà thiếu một trong bốn mục — nguyên nhân · một lần hay kéo dài · hành động · **nhu cầu đã biết tới cuối năm (số tiền)** —, **Then không lưu**"; QT §4.13 điều kiện tối thiểu "đủ bốn ý"; Dữ liệu nghiệp vụ US-12-21: "nhu cầu đã biết tới cuối năm (số tiền)". SPEC viết `amount?` — US đứng trên SPEC.
- **Cách sửa:** `amount` bắt buộc, cho phép `0` (`nonNegativeMoney`), giữ `note` như hiện tại (hoặc tùy chọn — hỏi Owner nếu muốn); CHECK DB `explanation_needs_amount_minor IS NOT NULL` khi `EXPLAINED` (migration mới).
- **Test:** HTTP/integration: thiếu `amount` ⟹ 422 `VALIDATION_ERROR`; `amount: "0"` ⟹ 200.

### RV3-04 — Required (Thấp) — `NO_HEAD` quyết theo trưởng phòng **ngày ký**, không theo lúc mở kỳ; dòng phòng không trưởng phòng hiện `PENDING`

- **Vị trí:** `src/modules/budgets/review/budget-review-signature.service.ts:69-82` (`currentHeadOf(…, today)` lúc ký); `src/modules/budgets/review/budget-review.repo.ts:181` (dòng Vàng/Đỏ/Dưới mức nào cũng `PENDING`, kể cả phòng không có trưởng phòng).
- **Kịch bản:** (1) `P-LOG` không có trưởng phòng lúc mở kỳ ⟹ dòng `PENDING`, FE hiện "chờ giải trình" cho P-LOG; Super Admin gán trưởng phòng mới hôm trước ngày ký ⟹ người mới bị nhắc Thứ Hai và biên bản ghi `UNEXPLAINED` dù chưa từng được hỏi trong hạn. (2) Ngược lại: phòng có trưởng phòng lúc mở, người đó rời trước khi ký ⟹ `NO_HEAD` (không bị tính) dù đã được hỏi 5 ngày.
- **Căn cứ:** US-12-21 AC-12: "`P-LOG` **vốn** chưa có trưởng phòng … **When** kỳ rà soát quý mở, **Then** không ai nhận yêu cầu giải trình cho `P-LOG`, **kỳ không chờ `P-LOG`**". Integration test hiện ghim đúng hành vi (2) (`budget-review-explanation.integration-spec.ts:177-180`: gỡ trưởng phòng **sau** khi mở kỳ ⟹ `NO_HEAD`).
- **Cách sửa:** quyết lúc mở kỳ: phòng không có trưởng phòng hôm chốt ⟹ dòng `NO_HEAD` ngay khi chèn (cột giải trình vẫn null — CHECK đã cho phép); lúc ký chỉ còn `PENDING → UNEXPLAINED`. Trường hợp (2) theo đó thành `UNEXPLAINED`. Nếu Owner muốn giữ "trưởng phòng ngày ký" thì ghi rõ vào D-102 — hiện D-102 (4) chọn "hôm ký" mà không dẫn AC-12.
- **Test:** đổi ca R-17: phòng không có trưởng phòng **trước** khi chốt ⟹ dòng `NO_HEAD` ngay sau chốt, không nhận nhắc; gán trưởng phòng sau đó ⟹ vẫn không bị nhắc, ký ⟹ `NO_HEAD`.

### RV2-03 — Required (Thấp) — Khóa mới trong hóa đơn gắn cam kết có thể deadlock với duyệt phiên bản

- **Vị trí:** `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts:43-46` (khóa dòng cam kết `FOR UPDATE`), `:59` + `:93-110` (`watchUse` ⟹ khóa năm **sau** khóa dòng); `version-decision-judge.service.ts:68` (khóa năm) rồi `version-decision-writer.service.ts:70` → `commitment.repo.ts:56` (UPDATE các dòng cam kết chờ).
- **Kịch bản:** cam kết C chờ ngân sách (chưa gắn). T1 = Finance ký hóa đơn của C: khóa dòng C, chờ khóa năm. T2 = Người duyệt chi duyệt phiên bản: giữ khóa năm, UPDATE C ⟹ chờ dòng C ⟹ vòng. PostgreSQL hủy một bên (lỗi 500/40P01 cho người dùng). Trước RV-2, hóa đơn gắn cam kết **không** lấy khóa năm (Sonnet tự ghi ở RV-2-O5 nhưng xếp "hiếm").
- **Cách sửa (một dòng):** trong `watchUse`, cam kết chưa gắn phiên bản (`attachedVersionId === null`) thì không `watch` — chưa có phiên bản thì chưa có cơ sở, không thể có cảnh báo. Cần thêm `attachedVersionId` vào `LockedCommitmentOfRequest` (`commitment.repo.ts:133-144`, `:613`). Cập nhật lời bình `BudgetYearLockRepo`.
- **Test:** unit cho `watchUse` (cam kết chưa gắn ⟹ `thresholds.watch` không được gọi); không cần test đồng thời.

### RV3-05 — Optional — Lượt nhắc không kiểm lại dưới khóa; không bù ngày bị lỡ

- **Vị trí:** `budget-review-explanation-reminder.service.ts:25-55` (đọc `awaitingUntil` ngoài transaction, rồi gửi trong transaction mà không đọc lại trạng thái kỳ/dòng); `budget-review.job.ts:6-7` (lượt giờ, chạy trong API).
- **Kịch bản:** Finance ký (hoặc trưởng phòng nộp) giữa lúc đọc và lúc gửi ⟹ một nhắc thừa, trái AC-11 "kỳ đã ký nên **không** nhắc". Máy chủ tắt cả ngày Thứ Hai ⟹ tuần đó không có nhắc (không bù).
- **Cách sửa:** trong transaction mỗi kỳ, `findSharedLocked` + đọc lại `pendingCostCenterIds(tx, …)` trước khi gửi. Ngày lỡ: chấp nhận (ghi vào `security-jobs.md`).

### RV2-04 — Optional — Cảnh báo cho năm đã đóng (RV-2-O4) và `RV2-05` một thay đổi vượt hai ngưỡng gửi hai thông báo (RV-2-O3)

- `threshold-alert.service.ts:56-86` không lọc năm: hóa đơn tới muộn của năm 2026 (ghi tháng 1/2027) vẫn báo 80/100 % cho năm đã đóng. Tài liệu không nói; gợi ý bỏ qua năm `< năm hiện tại` (năm đóng ở 01/01 — `QĐ-104e`). Hai thông báo cho hai ngưỡng đúng chữ "mỗi ngưỡng một lần" (US-12-21 Main flow) — giữ.

### RV2-06 — FYI / câu hỏi Owner — Cơ sở **giảm** làm đã dùng vượt 80 % mà không ai báo

- `threshold.policy.ts:14-26` + `threshold-alert.service.ts:61`: chỉ xét khi đã dùng **tăng**. *Trả lại*/*Chuyển* đi có sàn = dự kiến cuối năm (≥ đã dùng) nên không làm vượt 100 %, nhưng có thể đẩy từ 75 % lên 85 % số cơ sở. `QĐ-111af` "phần đã dùng chạm 80 % … số cơ sở" — đọc theo chữ là có báo; R-28 chỉ nói trường hợp nâng cơ sở. Đề xuất: **A** giữ như hiện tại (điều chỉnh do Finance tự lập, Finance và trưởng phòng đã được báo điều chỉnh qua `BUDGET_ADJUSTMENT_DECIDED`) — khuyến nghị; **B** gọi `watch/settle` quanh mọi lần duyệt điều chỉnh và so theo tỷ lệ (cần đổi `crossedThresholds` nhận `baseBefore`).

### RV3-06 — Optional — Kỳ quý không có dòng nào bị hỏi vẫn ở `AWAITING_EXPLANATIONS`; không có trạng thái *Chờ ký*

- `budget-review.repo.ts:172` đặt mọi kỳ `QUARTER` ở `AWAITING_EXPLANATIONS`. US-12-21 *Dữ liệu nghiệp vụ* liệt kê "*Đã chốt số* → *Chờ giải trình* → *Chờ ký* → *Đã đóng*", AC-6 "kỳ ở *Chờ ký*". Ký vẫn được bất cứ lúc nào nên không chặn ai; FE có thể suy ra *Chờ ký* khi không còn dòng `PENDING`. Đề xuất: không thêm trạng thái DB, thêm trường dẫn xuất `pendingCount`/`readyToSign` ở `GET /budget-review-periods/{id}` (hoặc ghi rõ vào tài liệu API FE).

### RV3-07 — FYI — Một chữ ký vừa đóng kỳ tháng 3/6/9 vừa ký rà soát quý

- SBF-11 bước 6 (ký đóng kỳ tháng, mọi tháng) và bước 8 (ký rà soát quý) là hai việc; RV-1/RV-3 dùng một chữ ký trên một kỳ. Hệ quả: Finance quen tay "ký đóng tháng 6" ngày làm việc thứ 5 sẽ đóng luôn cửa sổ giải trình (mọi dòng `UNEXPLAINED`), và bản tóm tắt bảng đèn cho Người duyệt chi (`tellSpendingApprover`) của tháng 3/6/9 chỉ đi khi ký quý. `QĐ-111ae` "Chỉ Finance ký (đóng kỳ tháng, ký rà soát quý)" không nói một hay hai chữ ký. Không đổi mã; nên ghi rõ trên FE (nút ký kỳ quý cảnh báo "còn N phòng chưa giải trình") và hỏi Owner khi rảnh.

---

## Phần đúng đã kiểm

**RV-2**
- Cơ sở so ngưỡng = số cơ sở hiệu lực (phiên bản + điều chỉnh đã duyệt), **không** gồm dự phòng: `threshold-alert.service.ts:65-71` → `BudgetFactsRepo.approvedOfCostCenters` (`budget-facts.repo.ts:72-84`, cùng nguồn `yearFacts`). Đúng `QĐ-111af` "số cơ sở", `QĐ-111bh` "điều chỉnh cộng/trừ vào số cơ sở".
- "Đã dùng" = thực chi + cam kết còn giữ đã gắn (`CommitmentRepo.totals`), trùng số kiểm ngân sách Request đọc; không cộng Request chờ duyệt chi — đúng QT §4.12 "thực chi + cam kết".
- Quy tắc vượt `trước×100 < t×b ≤ sau×100` bằng bigint, không làm tròn; "chạm" tính cả bằng (`threshold.policy.ts:24`, spec có ca 95.999.999/96.000.000). Ca AC-1 (120 → +8 tr → 128/129 tr báo lại 100 %, không báo lại 80 %) đúng cả ở unit và integration T-RV2.
- Người nhận: trưởng phòng hiện tại + Finance; phòng không có trưởng phòng chỉ báo Finance; **không** Người duyệt chi (`threshold-notifier.service.ts:23-38`) — đúng `QĐ-99h`, AC-1 "`C1` không nhận". Params không có số tiền (đúng quy ước `FIGURE_WORDS` của `inbox.policy.ts`).
- Điểm gọi: giữ cam kết khi duyệt chi (`commitment.service.ts:224-229`), khoản 01/01 (`:268-301`, một lần cho cả lượt), hóa đơn mua (cam kết hoặc Cost Center), chi ngoài quy trình, seat-tháng (theo phần thay đổi, không đếm lại cả tháng), phiên bản R-48 do điều chỉnh. Tất cả trong transaction của thao tác gốc; thông báo cũng trong transaction đó.
- Đồng thời: `watch` lấy `pg_advisory_xact_lock` theo (Cost Center, năm), Cost Center theo id, năm tăng dần; mọi đường **tăng** đã dùng đều qua khóa này ⟹ hai thay đổi song song không cùng bỏ sót một lần vượt. Giải phóng không lấy khóa nhưng chỉ làm giảm, không thể làm lỡ một lần vượt.
- Kiến trúc: `budgets/threshold/` 5 file, chỉ import `budget/` (lõi) và `notifications/public`; `commitment`, `invoice`, `seat-month`, `adjustment` import nó mà không vòng với `review/`. `PRISMA_MODEL_OWNER` có `BudgetThresholdAlert`.
- Migration `20261113102100`: `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, CHECK năm/ngưỡng/cơ sở > 0, không FK chéo context — chạy lại an toàn, chỉ thêm.

**RV-3**
- Kỳ quý tháng 3/6/9 mở ở `AWAITING_EXPLANATIONS`, kỳ tháng vẫn `SNAPSHOT` (`budget-review.repo.ts:172`); chỉ dòng Vàng/Đỏ/Dưới mức của kỳ quý là `PENDING` (`budget-review-explanation.policy.ts:15-17`, có spec).
- Hạn = ngày làm việc thứ 5, ngày chốt là ngày 1 (`nthWorkingDayFrom`, lịch nghỉ từ tham số vận hành) — khớp AC-4 (chốt Thứ Tư 07/07 ⟹ hạn Thứ Ba 13/07). Hằng số, không tham số (R-47).
- Nhắc: đúng ngày hạn, rồi mỗi Thứ Hai **sau** ngày hạn; không nhắc trước hạn; Thứ Hai trùng ngày hạn chỉ một lần (spec `:41-70`). Tuần bắt đầu Thứ Hai (`weekBoundsOf`), `today` là ngày theo lịch của tổ chức (`facts.today`) — không lệch múi giờ. Khóa `review:<kỳ>:<cc>:<ngày>` chống trùng khi chạy lại/nhiều instance; kỳ đã ký không còn trong `awaitingUntil`.
- Chỉ trưởng phòng của phòng chứa Cost Center (route `MANAGER` + `headedCostCenters` hôm nay; Finance và trưởng phòng khác 403); ghi lại được tới khi ký; quá hạn vẫn nhận (B-7).
- Ký: `FOR UPDATE` kỳ, đánh dấu `PENDING → UNEXPLAINED/NO_HEAD` **trước** khi đổi sang `SIGNED`, cùng transaction; giải trình lấy `FOR SHARE` nên một lần ký xen giữa được đọc là đã ký (409). Sau ký khóa giải trình bằng cả kiểm tra ở service lẫn trigger `budget_review_lines_explanation_guard`.
- Ảnh chụp bất biến, không khóa dữ liệu: migration `20261113102200` không đụng `budget_review_lines_guard`, `budget_review_periods_guard`, trigger chèn FIX-RV1; chỉ thêm cột có mặc định, CHECK, một trigger cho cột giải trình. `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` rồi `ADD`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` ⟹ chạy lại an toàn; CHECK hợp lệ với dữ liệu cũ (mặc định `NOT_REQUIRED`, cột null).
- `GET /budget-commitments`: Finance đọc hết; MANAGER chỉ Cost Center mình đứng đầu (Cost Center khác là trang rỗng — D8); Người duyệt chi/khác 403; `longTerm` lỗi ⟹ 422. Không có thao tác thu hồi (AC-8).
- OpenAPI ở `1e134330`: `grep -c "QĐ-"` = 0. `review/` 24 file (≤ 25, sát trần — việc RV-3 tiếp theo nên tách thư mục con), `commitment/` 7, `threshold/` 5.
- Hai test RV-1 đổi `SNAPSHOT → AWAITING_EXPLANATIONS` (`budget-review-table.integration-spec.ts:72`, `budget-review.integration-spec.ts:125`): **đúng hợp đồng mới** — AC-4 "kỳ ở trạng thái *Chờ giải trình*", FIX-RV1-O1 đã hẹn RV-3 đưa kỳ quý qua `AWAITING_EXPLANATIONS`; không phải sửa kỳ vọng cho xanh. Hệ quả cho seed/`test:flows` (DEMO-12) đã ghi ở RV-3-O7.

## Thiếu test / ca biên

- RV-2: giải phóng rồi vượt lại cùng cơ sở (RV2-01); duyệt phiên bản thường (RV2-02); seat-tháng và khoản 01/01 chưa có ca integration cảnh báo (RV-2-O2); hóa đơn cam kết chưa gắn (RV2-03).
- RV-3: thông báo mở kỳ (RV3-01); phòng không trưởng phòng **trước** khi chốt (RV3-04); `amount` thiếu/0 (RV3-03); ranh giới quý theo giờ VN và theo kỳ chứ không theo hôm nay (RV3-02).
- Các `it` của `budget-review-explanation.integration-spec.ts` phụ thuộc thứ tự (ca nhắc gỡ trưởng phòng mà ca ký dùng) — Nit: chạy riêng một `it` sẽ sai.

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất ở `1e134330`) | Chuỗi mới | Lệnh jest | Kỳ vọng |
|---|---|---|---|---|
| `src/modules/budgets/threshold/threshold.policy.ts` | `return input.usedBeforeMinor * 100n < limit && limit <= input.usedAfterMinor * 100n;` | `return input.usedBeforeMinor * 100n < limit && limit < input.usedAfterMinor * 100n;` | `pnpm jest src/modules/budgets/threshold/threshold.policy.spec.ts` | đỏ (ca 96.000.000 đúng ngưỡng) |
| `src/modules/budgets/threshold/threshold-notifier.service.ts` | `for (const recipientEmployeeId of new Set([head, finance])) {` | `for (const recipientEmployeeId of new Set([finance])) {` | `pnpm test:integration -- test/integration/budgets/budget-threshold-alert.integration-spec.ts` | đỏ (`told` = head + Finance) |
| `src/modules/budgets/review/budget-review-explanation.policy.ts` | `return today > dueOn && weekBoundsOf(today).start === today;` | `return weekBoundsOf(today).start === today;` | `pnpm jest src/modules/budgets/review/budget-review-explanation.policy.spec.ts` | đỏ (Thứ Hai trước hạn) |
| `src/modules/budgets/review/budget-review-explanation.policy.ts` | `return kind === 'QUARTER' && light !== 'GREEN' ? 'PENDING' : 'NOT_REQUIRED';` | `return light !== 'GREEN' ? 'PENDING' : 'NOT_REQUIRED';` | `pnpm jest src/modules/budgets/review/budget-review-explanation.policy.spec.ts` | đỏ (`MONTH`/`RED`) |
| `src/modules/budgets/review/budget-review-explanation.service.ts` | `if (period.state !== 'AWAITING_EXPLANATIONS') throw new BudgetReviewNotAwaitingError(period.state);` | `// removed` | `pnpm test:integration -- test/integration/budgets/budget-review-explanation.integration-spec.ts` | đỏ (409 thành 500 do trigger) — kiểm cả hai lớp |
| `src/modules/budgets/review/budget-review-signature.service.ts` | `if (statusWhenSigned(head !== null) === 'NO_HEAD') noHead.push(costCenterId);` | `if (statusWhenSigned(true) === 'NO_HEAD') noHead.push(costCenterId);` | `pnpm test:integration -- test/integration/budgets/budget-review-explanation.integration-spec.ts` | đỏ (`NO_HEAD`) |
| `src/modules/budgets/threshold/threshold.repo.ts` | `skipDuplicates: true,` | `skipDuplicates: false,` | `pnpm test:integration -- test/integration/budgets/budget-threshold-alert.integration-spec.ts` | đỏ (ca MAJ-10); sau khi sửa RV2-01 thay bằng mutation "giữ unique 4 cột" ⟹ ca giải phóng-vượt lại đỏ |
