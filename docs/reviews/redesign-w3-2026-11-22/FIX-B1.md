# FIX-B1 — Sửa sau review B1 đợt 3 (25/11/2026)

Nguồn: 2 reviewer Opus (P1–P4, P5–P8) đọc `444e6fc3` + 1 reviewer Opus độc lập đối kháng kiểm từng mục (bác bỏ A-I4, B-I2,
B M2, B M4; hạ B-I4 xuống Minor). Owner trả lời 25/11: D-10 = **tính cả năm sau**; D-9 = Owner giao Neon làm, điều phối chọn
**tách reader** (dưới). Gói này thuộc làn **biz** (Neon), làm trên `int/redesign-w3` **trước P10**, sau khi gộp làn tech nếu
Bảo đã push.

## Skill Preflight (bắt buộc, theo Docs `rules/skill-workflow.md`)

- Code: `superpowers:executing-plans` + `superpowers:test-driven-development` (red-first) + repo skill `be-quick-check`.
- Verify: `superpowers:verification-before-completion` trước khi ghi `xong`.
- Đầu báo cáo liệt kê skill đã đọc.

## LUẬT CỨNG

Áp nguyên văn mục **LUẬT CỨNG 1–11** của [CODE-PROMPT.md](CODE-PROMPT.md#luật-cứng-đọc-trước-mọi-thứ-áp-mọi-gói-không-ngoại-lệ).
Nhấn mạnh: mỗi sửa có test red-first nằm cạnh file và **đi qua code thật** (không tự dựng target bằng `roundHalfAway` — đó là lý do
I-1/I-2 lọt); test lỗi assert mã lỗi; ghi `Kiểm giữ:` khi đụng đường refactor; không nới gate.

## Danh sách sửa (theo thứ tự)

| Mã | Sửa | Test bắt buộc |
| --- | --- | --- |
| F1 (A-I1) | `line-allocation.policy.ts:48` `lineAmountsOf` → `requestAmountOf` phải nhận `provisioningType` + `monthlyPriceMinor` (lấy từ `request.pricing` hoặc giá gói); K1/K2 bỏ nhánh `monthsBeginningIn` + `ceilDiv`. Kiểm cả dòng năm sau (`group-spend-hold.service.ts:96-100`, `held=false` → `pricing.nextYearAmount` → `savedMinor` lượt 01/01) | Request nhóm K2 seat 15/11/2027 → 10/02/2028, 500.000: dòng năm sau = **1.000.000** (tháng lịch 1–2); ca giá `ANNUAL` 1.000.001 ⟹ 83.333/tháng (không 83.334) |
| F2 (A-I2) | `seat-release.policy.ts:135-153` `monthlyRevocationBreakdown`: chỉ nhả `s` các tháng **của seat bị thu hồi** — chặn trên theo tháng của `coverage.endDate` khi cùng năm (`seat-release.repo.ts:50-54`); áp cả `afterTransferEffective`, `afterRightReplaced` | Nhóm 2 seat, A hết 31/03, B hết 31/12, thu hồi A 15/02 ⟹ nhả phần tháng 2 + tháng 3 của A; tháng 4–12 của B **giữ nguyên** |
| F3 (A-I3) | `commitment-month-settlement.service.ts:85-98,140-147` và dọn năm: **mỗi cam kết một tx**, duyệt theo (`year`, `id`) (SPEC §6.2, LUẬT CỨNG 11); một cam kết lỗi không chặn cam kết khác (ghi log, lượt sau thử lại) | Integration Ca H thêm vòng ≥ 2 cam kết; ca một cam kết lỗi CHECK ⟹ cam kết còn lại vẫn chốt |
| F4 (B-I1) | `shared-pool-line-facts.service.ts:204` và `shared-pool-line.policy.ts:181-183` (`unallocatedMinorOf`): `idleCost` null ⟹ góp **0** + cờ `NO_PRICE`/`NO_QUANTITY`, bỏ fallback `invoiced − allocated` | Kỳ thiếu giá, hóa đơn 10.000.000 xác nhận ⟹ tổng năm kho = 10.000.000 (không 20.000.000); dòng tháng = tổng năm |
| F5 (B-I3) | `shared-pool-line-facts.service.ts:131-150`: tập ứng viên `linesOfMonth` thêm `subscription_id` của hóa đơn có chênh lệch kho trong tháng; cả nhánh `only` (`:210-217`) | Hóa đơn gia hạn xác nhận tháng 6 cho kỳ bắt đầu 01/07 ⟹ chênh lệch nằm ở `poolLines` tháng 6 và Σ dòng = tổng kho |
| F6 (B-I4) | `grant-settlement.service.ts:28-29`: chọn cam kết có `year` = năm của ngày cấp (không lấy `[0]`) | Request duyệt 12/2026, cấp từ kho 01/2027 ⟹ tránh chi lấy cam kết 2027 |
| F7 (D-10, Owner 25/11) | `runningUncommitted` K2 tính cho năm `Y+1`: seat đang hiệu lực hôm nay × giá tháng × số tháng lịch của `Y+1` tới ngày cuối của seat (không ngày cuối ⟹ 12), trừ vào *Còn lại* năm sau (`next-year-budget.service.ts`, `summary`/`table` của năm sau); năm đã qua vẫn 0. Sửa dòng D-10 trong `OVERNIGHT-DECISIONS-biz.md` thành "Owner 25/11: tính cả năm sau" | Seat 500.000 không ngày cuối ⟹ năm sau 6.000.000; seat hết 31/03 năm sau ⟹ 1.500.000; năm trước ⟹ 0 |
| F8 (D-9) | Worker gọi kiểm tra ngân sách (`StepRedeterminationSweepApi` → `step-reassignment.service.ts:401/424` → `finishConversionById` → `route` → `BudgetCheckService.run` → `BudgetsReadApi.yearFacts`) nhưng không nạp `BudgetsModule` ⟹ `runningUncommitted` = 0. Sửa: **tách reader** `runningUncommitted` để worker cũng nạp (đi qua `*Api`, đúng module graph — nếu buộc phải thêm ngoại lệ gate ⟹ DỪNG, ghi D-n hỏi điều phối); và **phòng thủ**: không có reader ⟹ `NOT_CHECKABLE`, không bao giờ trả 0 lặng lẽ | Test worker module: reader có mặt; unit `BudgetsReadApi` thiếu reader ⟹ `NOT_CHECKABLE` |
| F9 (A M-6) | `purchase-invoice-recorder.service.ts:39,87-94`: trả thứ tự lỗi như base — `NO_PLACE` trước trùng số | Test thứ tự hai lỗi, assert mã |
| F10 (B M6) | `shared-pool-avoided-cost.repo.ts:36`: `recordedOn` trả về `completedOn` như base (đổi sang `validFrom` không có trong SPEC) | Test ngày ghi = ngày hoàn tất |
| F11 (W3-01) | `openapi.json`: bỏ chuỗi "pool of the plan" còn lại (mô tả `PURCHASE_NOT_ALLOWED`) | `grep -c "pool of the plan" openapi.json` = 0 |

## Không sửa trong đợt này (ghi nợ đợt 8 vào `FIX-TEST-biz.md` mục mới "Nợ review B1")

B-I5 (`yearFigures` ~150 truy vấn), A M-2 (`YEAR_START` trộn giá), A M-3 (`monthRowsOf` nuốt chênh — thêm log khi |chênh| ≥ số seat),
A M-5 (ghi D-n cho guard `EXCEEDS_HELD` khi có `months`), B M1 (gộp nhãn theo đoạn liền, lệch ≤ 1 đ), B M7, M-4/M3 code chết,
B M2 (sửa chữ SPEC: `flags` là object — D-7 đúng).

## Xong khi

- Mỗi F có test red-first xanh + bộ kiểm nhanh xanh; commit theo LUẬT CỨNG 7 (một commit mỗi F hoặc gom F nhỏ F9–F11).
- `PROGRESS-biz.md` thêm mục **FIX-B1** với bảng F → test → file:line (LUẬT CỨNG 6).
- Chạy CI GitHub tay trên `int/redesign-w3` (`gh workflow run ci.yml --ref int/redesign-w3`), ghi run id; các spec mới của F phải xanh.
