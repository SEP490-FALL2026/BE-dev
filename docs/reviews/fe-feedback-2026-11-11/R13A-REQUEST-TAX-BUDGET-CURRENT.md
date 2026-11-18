# R13A — Request (thời hạn, số tiền), thuế/tiền tệ, hóa đơn, qua năm, ngân sách, gói Team: thiết kế hiện tại (Docs + code)

> Chỉ đọc, 12/11/2026. Docs `main` @ `8480e79`; BE `feat/mf2-mf3` @ `b71ed330` (cây làm việc). Không chạy test. **Skill:** `context-engineering`
> (process — nạp đúng đoạn cần), `superpowers:verification-before-completion` (mọi câu có `path:line` đã mở lại). **[DOCS]** = Docs; **[CODE]** = BE.
> Viết tắt (Docs `d:\FPT\FALL2026\Docs\`): `QĐ` = `Decisions/project-decisions.md`; `BRD` = `Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN …md`;
> `QT` = `Requiments/Quy trình và chính sách theo main flow.md`; `EP-xx` = `BE-UserStory/epics/EP-xx.md`; `SBF-19`/`SBF-20` =
> `Diagrams/supporting-business-flows/SBF-…md`. BE: từ gốc repo, `src/m/` = `src/modules/`. `DEC` = [DECISIONS.md](DECISIONS.md), `R9` =
> [R9](R9-ANNUAL-BUDGET-PROCESS.md). Hóa đơn IT nộp/Finance xác nhận, gia hạn kỳ, thu hồi `K1`: xem [R12A](R12A-PAYMENT-RENEWAL-CURRENT.md).

## 1. Thời hạn và số tiền Request

- **[DOCS]** Quyền (`K1`, `K2`, `K4`, `K5`) mặc định **không có ngày kết thúc**; người xin chọn _có thời hạn_ (vd. dự án), nhà thầu/freelancer/thực tập
  **bắt buộc** có — `QĐ:349` (`QĐ-104a`), `QĐ:287` (`QĐ-103d`), `BRD:581` (`FR-3.2`), `BRD:346` (`FR-2.8`).
- **Số tiền = giá tháng × số tháng còn lại của năm hiện tại × số người**; quyền có thời hạn tính tới ngày kết thúc, **không quá 31/12**;
  tháng lịch, tháng gửi tính đủ (làm tròn lên) — `QĐ:349`, `QĐ:343` (`QĐ-103f`(1)), `QĐ:351` (`QĐ-104k`(1)), `BRD:586`, `QT:58` (`C-08`).
  Tức là **luôn tới hết năm**, không phải 12 tháng, không phải tới hết kỳ thuê bao.
- Lúc gửi chỉ tạm tính; Request qua lô tính số tiền + năm theo **tháng trình**, tính lại theo **tháng duyệt chi**; gửi tháng 12 duyệt tháng 01
  ⟹ tính theo năm mới — `QĐ:352` (`QĐ-106a`), `QĐ:362` (`QĐ-109e`).
- Trần: Request không có trần 12 tháng (số tiền tự dừng ở 31/12) — `QĐ:343`(3); quyền _có thời hạn_ tối đa **12 tháng** — `QĐ:353`
  (`QĐ-106b`), kiểm lúc gửi: ngày kết thúc ≤ ngày gửi + 12 tháng − 1 ngày — `EP-05.md:983` (`US-05-23` AC-9); mỗi Request tiếp tục ≤ 12
  tháng — `QĐ:358` (`QĐ-108a`). Request tiếp tục có kỳ mới trọn năm sau: số tiền năm nay = 0, màn duyệt hiện số tiền năm sau — `QĐ:361`.
- Không có trường _lịch thanh toán dự kiến_ (suy từ chu kỳ trả của gói) — `QĐ:351`(6). Lần mua gói năm đầu tiên hiện thêm _tiền phải trả
  nhà cung cấp cả năm_ — `QĐ:291` (`QĐ-104d`(1)), `QT:206`.
- **"Ngày dự kiến kết thúc"**: Docs gọi _ngày kết thúc dự kiến_ của quyền — bắt buộc với nhà thầu/thực tập (`BRD:346`, `EP-05.md:734`
  AC-8), tùy chọn khi chọn _có thời hạn_; Logical ERD `LicenseAssignment.expectedEndDate` — `Docs/ERD/logical/LOGICAL-ERD.md:601`. Owner
  **còn mở Q9** (hỏi FE ô ở màn nào) — `DEC:53`; bảng các ô ngày có thể bị nhầm — `F4-BUDGET-REQUESTS-MISC.md:79-91`.

| Kiểu                               | Giá tính số tiền                                                                                  | Số tháng        | Sang năm sau                       | Nguồn                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------- | --------------------- |
| `K1` gói cá nhân, **chỉ kỳ tháng** | giá gói tháng                                                                                     | còn lại của năm | khoản 01/01                        | `QĐ:343`, `QĐ:287`(1) |
| `K2` seat kho dùng chung           | **giá tháng quy đổi** (gói năm: giá năm ÷ 12), kể cả cấp từ seat _Trống_                          | còn lại của năm | khoản 01/01; phòng chịu seat-tháng | `QĐ:343`, `QĐ:527`    |
| `K4` khóa vĩnh viễn                | **giá mua một lần**, không nhân tháng, kể cả cấp từ kho (cấp từ kho ⟹ giải phóng toàn bộ cam kết) | —               | **không** có khoản 01/01           | `QĐ:354`, `BRD:978`   |

- **[CODE]** Body gửi `expectedEndDate: businessDate.optional()` — `src/m/requests/access-request/access-request.dto.ts:9-24`; nhóm
  `group-request/group-request.dto.ts:41`; hồ sơ bổ sung `spend/spend-submission.dto.ts:55`; tiếp tục dùng `newEndDate`/`extensionMonths`
  (`renewal-request/renewal-request.dto.ts:19`). **Không** có cờ "có thời hạn" riêng: có ngày = có thời hạn. Cột `expected_end_date` —
  `prisma/models/requests.prisma:206-207` (chú thích còn ghi "not staff", cũ).
- Kiểm: ngày < hôm nay hoặc > hôm nay + 12 tháng − 1 ngày ⟹ `ACCESS_REQUEST.END_DATE_OUT_OF_RANGE`; không phải `STAFF` mà thiếu ngày ⟹
  `TERM_REQUIRED` — `src/m/requests/access-request/request-facts.service.ts:222-237`, `pricing.policy.ts:89-90`. Khớp `US-05-23` AC-9.
- `requestAmountOf`: năm = năm của ngày tính; `ONE_TIME` = giá × người; `RECURRING` = ⌈đơn giá × tháng × người ÷ số tháng của chu kỳ⌉, tháng
  từ tháng ngày tính tới tháng của min(ngày kết thúc, 31/12) — `src/m/requests/access-request/pricing.policy.ts:56-71,120-191`; bắt đầu năm
  sau ⟹ 0 + `nextYearAmount` (`:171-181`). `annualVendorAmount` (giá 12 tháng) — `pricing.policy.ts:102-118`,
  `request-submission/request-preview.dto.ts:55`, `spend-approval-view/spend-approval.dto.ts:209`.
- Còn cột cũ trái `QĐ-104k`(6)/`QĐ-101n`: `expectedSpendOn`, `paymentSchedule`, `planLine*`, `offPlan` — `requests.prisma:187-203`;
  `expectedSpendOn` vẫn được đọc `src/m/requests/spend/spend-request.repo.ts:35`.

## 2. Thuế và tiền tệ

- **[DOCS]** Request, kiểm tra ngân sách, snapshot, khoản cam kết: **giá gốc chưa thuế**, không cộng thuế ước tính — `QĐ:439` (`QĐ-97d`), `QĐ:513`
  (`QĐ-55a`), `BRD:939`, `BRD:687`. Dòng `BM-10`/phiên bản cũng chưa thuế — `QĐ:449` (`QĐ-101n`(2)). Ngân sách phòng = số cơ sở + dự phòng
  (mặc định 10 %), dự phòng là **khoản đệm cho phần thuế** — `QĐ:438`, `QĐ:439`, `QĐ:444`.
- **Thực chi = chi phí thực chịu** = giá + thuế không được khấu trừ (TNDN nộp thay; GTGT không được khấu trừ) + phí thẻ/chênh tỷ giá; GTGT
  được khấu trừ ở cột riêng, không trừ ngân sách; phần chênh so với cam kết trừ thêm vào _còn lại_; hóa đơn không bị chặn, _còn lại_ được âm
  — `QĐ:515` (`QĐ-60a`), `BRD:941`, `BRD:913`, `BRD:981-983` (`FR-5.8a`). `K2`: chênh thuế/tỷ giá để lại dòng kho — `QĐ:527`(3).
- Hồ sơ thuế nhà cung cấp: `T1` trong nước (GTGT 10 % hoặc không chịu) · **`T2`** nước ngoài qua nền tảng số, doanh nghiệp **khấu trừ nộp
  thay GTGT + TNDN** từ 01/07/2026 (thuế nhà thầu) — mặc định · `T3` thuế đã thu trên chứng từ; mỗi hồ sơ có tỷ lệ ước tính + cờ _được khấu
  trừ_ — `QĐ:516` (`QĐ-60b`), `BRD:938`; căn cứ (GTGT 10 %, TNDN 5 %/10 %) `BRD:945`, `Docs/Decisions/tax-saas-purchase-research-2026-10-08.md`.
  Hệ thống chỉ ghi nhận, không tính/kê khai — `QĐ:513`. Hóa đơn ghi **từng dòng thuế** (loại, tỷ lệ, số tiền, NCC thu hay DN nộp thay, được
  khấu trừ) do Finance ghi khi xác nhận — `BRD:940`. Sao kê không có cột thuế — `QĐ:529` (`QĐ-106l`).
- Tiền tệ: mọi trường tiền lưu tiền gốc, tỷ giá, ngày tỷ giá, giá trị quy đổi — `BRD:419` (`FR-1.6`), `BRD:1838-1842` (ADR-03); báo cáo quy
  đổi theo tỷ giá chốt lúc ghi, không quy đổi lại — `BRD:958` (`FR-5.6`); làm tròn — `QĐ:507`; ngày tỷ giá của giá thuê bao = ngày ghi giá,
  thiếu ⟹ nháp, không dùng "tỷ giá gần nhất" — `QĐ:508`; khóa đổi đồng tiền báo cáo — `QĐ:509`; hóa đơn khác tiền tệ không tự khớp, Finance
  liên kết tay — `QĐ:506`; chênh phí thẻ/tỷ giá Finance đánh dấu — `QĐ:519`. Bỏ giả định tỷ giá/trượt giá ở mở kỳ — `QĐ:451`. Giả định GĐ-8
  (tỷ giá công khai, cập nhật định kỳ) — `BRD:257`.

- **[CODE]** Kiểm tra ngân sách quy đổi số tiền Request về tiền báo cáo **theo tỷ giá ngày kiểm**, "no estimate of tax is added"; thiếu tỷ giá ⟹
  `RATE_MISSING`, không kiểm được — `src/m/requests/spend/budget-check.service.ts:59-65,269-295`. Khoản cam kết lưu ở tiền tệ của lần kiểm
  (tiền báo cáo) — `src/m/requests/spend-effects/spend-effects.service.ts:68-75`. Ngân sách chỉ bằng tiền báo cáo, khác tiền tệ bị từ chối —
  `docs/decisions/0016-budgets-context.md:30-31`.
- Tỷ giá **chỉ nhập tay** (`ExchangeRateSource { MANUAL }`), mỗi (tiền tệ, ngày) một bản, không sửa — `prisma/models/finance.prisma:1-3,28-45`;
  `/exchange-rates` — `docs/generated/routes.md:316-317`. Giá thuê bao có snapshot tỷ giá — `prisma/models/catalog.prisma:324-332`.
- Hồ sơ thuế `TaxGroup T1/T2/T3`, dòng `rateBp` + `deductible`, phiên bản bất biến — `finance.prisma:47-99`; `/vendors/{id}/tax-profile` —
  `routes.md:97-99`.
- `Invoice` chỉ có `netMinor`, `deductibleTaxMinor`, `nonDeductibleTaxMinor`; `actualCost = net + nonDeductible`; cam kết giảm theo `net` —
  `prisma/models/budgets.prisma:387-405`, `src/m/budgets/budget/invoice.policy.ts:60-74`. **Không** có dòng thuế từng loại/tỷ lệ/ai nộp
  (`BRD:940`), không phí thẻ/chênh tỷ giá. Tiền hóa đơn nhập **theo tiền tệ của khoản cam kết**, client không gửi được `currency` —
  `src/m/budgets/invoice/invoice.dto.ts:7-15` ⟹ hóa đơn USD Finance phải tự quy đổi. Request/`BudgetCommitment` không có trường thuế (đúng luật).

## 3. Hóa đơn ↔ khoản cam kết; thực chi

- **[DOCS]** Một khoản cam kết nhận **nhiều hóa đơn**: mỗi hóa đơn chuyển phần giá gốc tương ứng thành chi phí, hết thì _Đã thành chi phí_, Finance giải
  phóng phần dư kèm lý do — `BRD:975` (`FR-5.8`(3)); tối đa một khoản mỗi (Request, năm) — `BRD:973` (`INV-16`). `K1` nộp hóa đơn **từng
  kỳ** — `QĐ:287`(1); gói năm trả tháng: mỗi tháng một hóa đơn — `SBF-20:65`.
- Mua mới vs gia hạn: phân biệt qua **liên kết** của đề nghị — _Request/tác vụ cấp_ (`K1`, `K2` mua thêm, `K4`) hay _thuê bao/kỳ_ (gia hạn);
  cờ _vượt_ tính khác nhau theo loại — `QĐ:525` (`QĐ-103l`), `SBF-19:35,38`. Trường "loại hóa đơn" riêng: **không tìm thấy**.
- Thực chi ghi khi **Finance xác nhận** hóa đơn IT nộp (R12A §1–2), thuộc **năm của kỳ dịch vụ** trên hóa đơn — `QĐ:247` (`QĐ-104e`(2)),
  `SBF-19:41`. `K2`: hóa đơn vào kho; phòng chịu **seat-tháng đã gán × giá tháng quy đổi**, dồn tích theo tháng; khoản cam kết `K2` thành chi
  phí theo seat-tháng, không chờ hóa đơn — `QĐ:524`, `QĐ:527`, `BRD:974`, `EP-12.md:865` (`US-12-18`).
- Theo tháng: hai góc nhìn _theo hóa đơn_ / _theo kỳ_ (cho báo cáo tháng) — `BRD:926` (`FR-5.3`); `US-12-01` "tổng chi theo tháng/quý/năm"
  — `EP-12.md:15`; "tháng cho thực chi và báo cáo" — `QĐ:412`; bản tóm tắt hằng tháng cho Người duyệt chi — `BRD:1069`, `QĐ:570`.

- **[CODE]** `Invoice` N:1 `BudgetCommitment` (`commitmentId` bắt buộc) — `budgets.prisma:390-419`; nhiều hóa đơn được: khóa dòng cam kết, mỗi hóa đơn
  trừ tối đa phần còn giữ, khớp tính **lũy kế** — `src/m/budgets/invoice/invoice.service.ts:23-29,43-80`, `budget/invoice.policy.ts:46-80`.
- Không có kỳ dịch vụ, liên kết thuê bao/kỳ hay tác vụ cấp, loại hóa đơn — `budgets.prisma:390-419` ⟹ thực chi gộp theo **năm của khoản cam
  kết** (`src/m/budgets/budget/invoice.repo.ts:156-173`), không theo năm kỳ dịch vụ. Người ghi: Finance (R12A §1).
- Seat-tháng `K2` **chưa** vào thực chi: "the seat-months of K2 are not in it yet" — `src/m/budgets/cycle/cycle.dto.ts:132-135`.
- Báo cáo tháng / ngân sách so thực tế theo kỳ / burn-rate: **chưa có** route (chỉ `/budgets`, `/budgets/summary`, `/budgets/mine` —
  `routes.md:253-257`); `US-12-01` AC-2→AC-5, AC-7→AC-9… _deferred_ `qd103-budget-vs-actual-report` — `docs/roadmap.md:1159`. Bản tóm tắt
  tháng: không tìm thấy trong `src/`.

## 4. Qua năm

- **[DOCS]** Request không vượt 31/12. Ngày **01/01** hệ thống tự tạo khoản cam kết năm mới cho quyền trả phí đang chạy **có Request** và Request đã duyệt
  chưa cấp: giá tháng × số tháng năm mới (có thời hạn: tới ngày kết thúc), Cost Center phòng đang chịu chi phí, **không duyệt lại, không kiểm
  ngân sách** — `QĐ:349`, `QĐ:456` (`QĐ-109a`), `BRD:978` (`FR-5.8`(6)), `EP-06.md:653-662` (`US-06-18`). Không cho `K4`, quyền theo vai,
  seat nhập lúc khởi tạo — `EP-06.md:658,662`. Giá đổi giữa năm không tính lại khoản này — `QĐ:453` (`QĐ-106c`).
- **Năm mới chưa có ngân sách duyệt**: khoản vẫn ghi (ngoại lệ `INV-18`), quyền vẫn chạy, báo cáo _chưa có ngân sách_, khi phiên bản được duyệt
  thì tính vào — `QĐ:404` (`QĐ-30b`), `BRD:981`, `EP-06.md:656` (AC-4); Request **mới** của phòng đó bị chặn — `QĐ:438`. Hóa đơn năm sau về
  trước ngân sách: ghi thực chi ngay — `QĐ:442`.
- Request đã duyệt chưa cấp tới 31/12 vẫn hiệu lực; khoản năm cũ ở lại năm cũ tới khi khớp hoặc Finance giải phóng, chênh = _điều chỉnh kỳ trước_
  — `QĐ:247`, `BRD:977`(c), `EP-06.md:657`. Ngân sách chưa dùng không chuyển năm — `QĐ:411`.
- Rủi ro: 01/01 _còn lại_ âm ⟹ phòng bị chặn Request mới cả năm; ví dụ Figma 30 tr (2026) → 120 tr (2027) — `R9:91-114`.
- Hiển thị phần chạy sang ở `MF-4`: Docs hiện chỉ có `US-06-15` AC-17 "đánh dấu quyền đang chạy sẽ thành khoản 01/01" ở số liệu nền —
  `EP-06.md:536`. Owner 11/11 (chưa vào Docs): **Q-C** hiện "cam kết sẽ chạy sang năm sau" từng phòng, điền sẵn số cơ sở, **cờ đỏ** khi thấp
  hơn, không chặn; **Q-D** không thêm ô "kéo qua năm", màn gửi/duyệt Request hiện số tiền sẽ trừ từ 01/01 — `DEC:21-22`, `R9:177,185`.

- **[CODE]** Job `src/m/requests/year-start-commitments/` (không có route HTTP): chỉ `K1`/`K2`, trạng thái `AWAITING_EXECUTION|EXECUTING|COMPLETED` —
  `year-start-commitments.policy.ts:14-18`; bỏ qua khi `NO_PRICE`, `NO_SEAT`, `NO_COST_CENTER`, `NO_RATE`, `CURRENCY_MISMATCH` — `:38-50`;
  roadmap: "xử lý khi chưa có tỷ giá ngày 01/01 chờ Owner" — `docs/roadmap.md:1257`.
- Chưa có ngân sách: khoản `YEAR_START` để _unattached_ (`NO_BUDGET`), gắn khi phiên bản được duyệt — `budgets.prisma:314-316,339-340`,
  `src/m/budgets/budget/commitment.repo.ts:38-46,91-93`. Q-D: **chưa có** (chỉ `nextYearAmount` của Request tiếp tục). Số liệu nền
  **không** có cột "sẽ chạy sang năm sau" — `src/m/budgets/cycle/cycle.dto.ts:127-140`, `R9:76`.

## 5. Vòng đời ngân sách năm

- **[DOCS hiện hành]** B1→B7, có B2 chia Trần phòng; B5 duyệt / yêu cầu sửa / từ chối — `QĐ:435` (`QĐ-94g`), `QĐ:451`, `BRD:1102`. Duyệt ⟹ hiện hành, **khóa cả
  năm**: không phiên bản sửa đổi, không sửa tiền tại chỗ, không điều chỉnh chuyển kỳ, không chuyển sang năm sau — `QĐ:437` (`QĐ-97b`),
  `QĐ:427`, `BRD:917`, `BRD:1117`, `QT:774` ("không điều chuyển ngân sách giữa kỳ"). Phòng chưa có ngân sách lập phiên bản đầu bất kỳ lúc nào —
  `BRD:1118`. Trần năm nhập lại khi lãnh đạo đổi — `QĐ:436`; quá hạn nộp chỉ nhắc — `QĐ:454`. Quý cho dự báo/phân kỳ — `QĐ:412` (`QĐ-82e`).
- **Dự phòng 10 %** dùng trong năm qua kiểm tra ngân sách: vượt số cơ sở mà còn trong dự phòng ⟹ trưởng phòng xác nhận dùng dự phòng (Request
  một bước: Người duyệt chi tự quyết) — `QĐ:438` (`QĐ-97c`), `QĐ:440`, `QĐ:444`. Dự phòng kho chỉ là số kiểm soát — `QĐ:452`.
- **Chuyển ngân sách giữa các phòng**: không tìm thấy luật riêng (bị loại ngầm bởi khóa cả năm và "không quỹ tập trung" `BRD:1967`).
  **Mở lại**: không có.

**[Owner 11/11 — chưa vào Docs]** `DEC:18-22`: kỳ _Nháp_ (sửa/xóa) → **Mở kỳ** → trong kỳ dời hạn nộp, sửa Trần năm → **hết hạn nộp khóa** →
Finance chốt từng phòng (cơ sở + dự phòng 10 % + ≥ 1 file) → Người duyệt chi **Duyệt / Trả về sửa** (lý do) → hiện hành, khóa năm; **không
mở lại (F1)**; bỏ B2 (`DEC:19`). **Xác nhận bỏ quý:** "Bỏ quý" ở `DEC:18`; R9 đề xuất bỏ `q1..q4` — `R9:200`.

**Báo cáo:** Docs có `US-12-01` "theo tháng/quý/năm" (`EP-12.md:15`), `FR-5.3` _theo kỳ_ cho báo cáo tháng và so phân kỳ quý (`BRD:926`),
dự báo `L1` (`BRD:953`). **Burn-rate: không tìm thấy** trong Docs.

- **[CODE]** `REVISION` còn trong enum nhưng bị từ chối — `budgets.prisma:40-45`, `src/m/budgets/version/version-decision-judge.service.ts:17-20`,
  `version/version.service.ts:78`; một hiện hành (`BUDGET.CURRENT_EXISTS`) — `version/budget-versions.controller.ts:128`. Không có route
  chuyển/mở lại (`routes.md:235-279`). Xác nhận dùng dự phòng: `src/m/requests/reserve-confirmation/`.
- Còn trái Owner 11/11: `REJECTED` (`budgets.prisma:255-259`), B2 `PUT …/department-ceilings`, `POST …/publish` (`routes.md:267,270`), **quý**
  `q1Minor…q4Minor` (`budgets.prisma:162-165`, `src/m/budgets/budget/budget.dto.ts:120-136`).
- Báo cáo ngân sách so thực tế theo tháng / burn: **chưa có** (`roadmap.md:1159`).

## 6. Gói Team/Business (`K2`)

- **[DOCS]** Thuê bao khai số seat đã mua, đơn giá, chu kỳ trả, **kỳ cam kết 1/12 tháng**, ND, giá tháng quy đổi — `BRD:412` (`FR-1.3`); mỗi (ứng dụng,
  gói) một thuê bao — `QĐ:287`(2). Phần mềm mới: `BM-02` có "số người dùng" — `BRD:1489`; lần mua gói năm đầu hiện tiền cả năm — `QĐ:291`.
- Số seat = **đúng số cần, không seat đệm**; người vào sau gửi Request rồi IT mua thêm — `QĐ:289` (`QĐ-103q`). Kho còn _Trống_ ⟹ gán; hết ⟹
  IT **mua thêm trong phạm vi đã duyệt**, không duyệt chi lần hai; gói năm nhà cung cấp tính tỷ lệ tới ngày gia hạn — `QĐ:343`(2), `QT:63`
  (`C-13`), `QT:306`, `QT:1084`, `SBF-20:55`. Gói năm chỉ tăng giữa kỳ, giảm ở kỳ gia hạn — `QĐ:288`.
- `QĐ-110v` (nháp): kho hết ⟹ IT phụ trách phòng người nhận ghi **mua thêm 1 seat** trong phạm vi Request; mỗi lần số seat tăng, báo IT phụ
  trách thuê bao, không thêm bước duyệt — `../mf2-mf3-2026-11-10/QD-110-DRAFT.md:64`; SPEC P24 `SUBSCRIPTION_SEATS_INCREASED` — `SPEC.md:38,89`.
- **Điểm điều chỉnh** trước kỳ trả: gói tháng 7 ngày trước ngày thanh toán, gói năm 30 ngày trước ND; hệ thống tính số seat cần, IT gia hạn
  đúng số; không có trưởng phòng/Người duyệt chi — `BRD:413` (`FR-1.4`), `BRD:435-436` (`FR-1.12`(3)(4)), `QĐ:288`, `SBF-20:35-40`. Điều
  chỉnh **không** tạo khoản cam kết, không kiểm ngân sách; chi phí kỳ gia hạn chỉ ở dự báo `L1` — `QĐ:407` (`QĐ-62s`), `BRD:976`.
- Seat ↔ khoản cam kết: khoản cam kết theo **Request** (người × giá tháng quy đổi × tháng còn lại), như nhau dù cấp từ kho hay mua thêm —
  `QĐ:343`(1); hóa đơn `K2` (kể cả mua cho Request) vào **kho**, cờ _vượt_ = seat mua × giá tháng × số tháng tới ngày gia hạn; phòng chịu
  seat-tháng — `QĐ:527`, `QĐ:348`(3). Thu hồi sớm giải phóng phần còn lại — `QĐ:528`, `BRD:977`(a).

- **[CODE]** Chỉ mua khi kho hết; **một seat mỗi lần cấp**; có seat đang thu hồi ⟹ cần lý do — `src/m/licensing/shared-pool/shared-pool.policy.ts:20-40`;
  `purchased_quantity` +1 — `src/m/catalog/public/catalog.api.ts:128-135`; tác vụ chỉ ghi `POOL_TOP_UP`, không tiền —
  `src/m/licensing/provisioning/tasks/provisioning-grant.policy.ts:1-22`. Thông báo `QĐ-110v`: **chưa có** (grep rỗng).
- Khoản cam kết tạo lúc duyệt chi, không phụ thuộc mua hay không — `spend-effects.service.ts:68-75`; hóa đơn **bắt buộc** gắn một khoản cam kết
  (`budgets.prisma:393`) ⟹ không có hóa đơn vào kho, không seat-tháng (§3). Điểm điều chỉnh/gia hạn: code còn mô hình cũ — R12A §3.

## Khoảng trống

| #   | Chủ đề                                                          | DOCS                                               | CODE                                                  | Cần                            |
| --- | --------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| G1  | Ô "Ngày dự kiến kết thúc"                                       | Q9 còn mở `DEC:53`                                 | `expectedEndDate` tùy chọn, ≤ 12 tháng                | Owner trả lời Q9               |
| G2  | Hiện số trừ từ 01/01 (Q-D) + "cam kết chạy sang" ở `MF-4` (Q-C) | Owner chốt `DEC:21-22`, chưa có QĐ                 | chưa có; số liệu nền không có cột                     | `QĐ-111` + code                |
| G3  | Dòng thuế chi tiết của hóa đơn                                  | từng dòng loại/tỷ lệ/ai nộp `BRD:940`              | 2 số tổng                                             | code `SBF-19`                  |
| G4  | Hóa đơn ngoại tệ                                                | tiền gốc + tỷ giá `BRD:419`; liên kết tay `QĐ:506` | chỉ tiền tệ của cam kết `invoice.dto.ts:7`            | code                           |
| G5  | Năm của thực chi                                                | năm kỳ dịch vụ `QĐ:247`                            | năm của khoản cam kết `invoice.repo.ts:156-173`       | code (thêm kỳ dịch vụ)         |
| G6  | `K2` seat-tháng, hóa đơn vào kho                                | `QĐ:527`                                           | chưa có `cycle.dto.ts:134`                            | code `US-12-18`                |
| G7  | Báo cáo tháng / so ngân sách                                    | `US-12-01`, `FR-5.3`; burn-rate không có           | không route; _deferred_                               | code; Owner nếu muốn burn-rate |
| G8  | Quý                                                             | Owner bỏ `DEC:18`; `QĐ-82e` còn quý                | `q1..q4` còn                                          | `QĐ-111` + migration           |
| G9  | `REJECT`, B2, phát hành                                         | Owner: chỉ Duyệt/Trả về, bỏ B2                     | còn đủ                                                | `QĐ-111` + code (R9 §5.2)      |
| G10 | Chuyển ngân sách giữa phòng                                     | không tìm thấy luật riêng                          | không có                                              | ghi rõ "không" trong `QĐ-111`  |
| G11 | Thiếu tỷ giá 01/01                                              | không tìm thấy luật                                | bỏ qua `NO_RATE`                                      | Owner (`roadmap.md:1257`)      |
| G12 | Báo khi mua thêm seat                                           | `QĐ-110v` nháp                                     | chưa có                                               | code P24                       |
| G13 | Cột cũ của Request                                              | bỏ bởi `QĐ-104k`(6), `QĐ-101n`                     | `expectedSpendOn`, `paymentSchedule`, `planLine*` còn | dọn schema                     |
| G14 | Hóa đơn mua mới vs gia hạn                                      | qua liên kết Request/tác vụ vs thuê bao/kỳ         | không có liên kết nào                                 | code `SBF-19`                  |
