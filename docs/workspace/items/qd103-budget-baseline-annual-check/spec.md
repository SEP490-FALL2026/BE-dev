# Spec: qd103-budget-baseline-annual-check — số liệu nền B1, kiểm B4 theo Trần năm, gói tổng hợp, phiên bản từ số liệu nền, nhắc hạn

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W2 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.15`(0)(1)(2)(6), `FR-5.16`(4)(5)(6), `BR-MF4-02`, `BR-MF4-03`; `QĐ-103i`, `QĐ-104f`,
  `QĐ-106k`, `QĐ-100v`, `QĐ-100h`, `QĐ-108e`, `QĐ-92d`; quy trình v1.7 mục 4.2, 4.6, 4.7, 4.9; L1 MF-4 bước 7–9 và _Quá hạn_;
  `US-06-15` AC-2, AC-12, AC-15, AC-16, AC-17; `US-06-19` AC-1→AC-5), BE `d9c46552`. Ledger: L1-09, L1-10, L1-11; luật
  R-I03 (số liệu nền), R-I05 (không trưởng phòng, nhắc hạn), R-I06, R-I08 (phiên bản có cờ đi tiếp). Câu tạm chọn mới (đề
  xuất, REVISION-NOTES W2): tập phiên bản tính ở B4, lý do khi chia lại số cơ sở, người nhận nhắc hạn.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (xem tracker §5).
- [Kế hoạch](plan.md).

## Business outcome

Finance và Người duyệt chi xem **số liệu nền** theo phòng của năm đang lập (trưởng phòng chỉ phòng mình); gửi phiên bản bị
chặn khi tổng (số cơ sở + dự phòng) các phòng vượt **Trần năm − Dự phòng kho**; chia lại số cơ sở đòi lý do; Finance và Người
duyệt chi xem **gói tổng hợp** (tổng đề xuất và tổng phiên bản so với Trần năm và mức kiểm B4); tới hạn nộp mà phòng không có
trưởng phòng, kế nhiệm hay đề xuất, Finance lập phiên bản **từ số liệu nền** có cờ; hạn nộp/hạn duyệt chỉ nhắc; Finance được
nhắc liên kết Cost Center cho phòng thiếu.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W2), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability `budgets/cycle/` (số liệu nền, gói tổng hợp, job nhắc hạn) và `budgets/version/` (kiểm B4,
  phiên bản từ số liệu nền, lý do số cơ sở).
- Boundaries: đọc licensing/catalog/organization qua API public; 2 cột mới ở `budget_versions`; 2 operation đọc mới; đổi
  `budgetVersionCreate`, `budgetVersionUpdate`, `budgetVersionSend`; 1 job nhắc; 6 mã thông báo.
- Not larger: dòng `BM-10` (loại, ZBB, hạng, cờ vượt) và phần dòng gắn cờ/thứ hạng trong gói ở
  `qd103-budget-proposal-lines-cleanup`; view của trưởng phòng ở `qd103-budget-views`.
- Not smaller: kiểm B4 cần gói tổng hợp; phiên bản từ số liệu nền cần số liệu nền.
- Siblings: `qd103-budget-cycle-ceilings`, `qd103-department-effective-year`, `qd103-budget-proposal-lines-cleanup`, `qd103-budget-views`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                            |
| ----- | ------------------- | -------- | --------------------------------------------- |
| —     | L1-09, L1-10, L1-11 | n/a      | gỡ chặn `qd103-budget-proposal-lines-cleanup` |

## Supporting references

`US-06-15` AC-2, AC-12, AC-15, AC-16, AC-17; `US-06-19` AC-1→AC-5. `QĐ-100v`: vượt ⟹ Finance chọn chia lại số cơ sở/dự
phòng **kèm lý do** hoặc trả đề xuất. `FR-5.15`(6): Finance và Người duyệt chi thấy toàn bộ. Spec cũ
`qd96-100-annual-budget-reserve-and-floor` chỉ đọc tham khảo (bỏ sàn cam kết chuyển tiếp).

## Explicit out of scope

Seat-tháng `K2` chính xác (W5 `qd103-seat-month-cost-pool-line`): số liệu nền dùng _giá tháng quy đổi × seat đang gán_ tính
lúc đọc. `KPI-3` thật cần usage (W6) — trả `null`. Dòng gắn cờ/thứ hạng trong gói: sibling `lines-cleanup` thêm.

## Dependencies and blockers

`qd103-budget-cycle-ceilings` (kỳ, Trần, thứ tự khóa); `qd103-department-effective-year` (số liệu nền và gói gồm phòng mới
hiệu lực 01/01 qua `ceilingDepartments` — AC-16; nhiệm kỳ tương lai cho điều kiện _kế nhiệm_); W1
`qd103-shared-pool-subscription` (giá tháng quy đổi theo chu kỳ trả).

## Ownership: module, data, API

- `budgetCycleBaseline` GET `/budget-cycles/{year}/baseline` (Finance, Người duyệt chi; trưởng phòng chỉ phòng mình qua
  `?departmentId=`, phòng khác 403): mỗi phòng của `ceilingDepartments` × phần mềm/gói: quyền trả phí đang chạy (số người), giá
  tháng quy đổi (`ANNUAL` ÷ 12), chi phí ước tính năm = seat × giá tháng × số tháng chạy trong năm (không ngày kết thúc ⟹ 12),
  seat _Đã gán_/_Trống_ ở mức kho, `kpi3` (`null`), thực chi năm hiện tại của phòng, `computedAt`; gợi ý dòng _Renew_. Đọc
  qua `LicensingApi`/`CatalogApi` (thêm hàm public nếu thiếu), theo lô.
- `budgetCyclePackage` GET `/budget-cycles/{year}/package` (Finance, Người duyệt chi; trưởng phòng 403): `annualCeiling`,
  `sharedPoolReserve`, `available = annualCeiling − sharedPoolReserve`, `proposalsTotal` (Σ đề xuất `SUBMITTED`/`REVIEWED`
  mới nhất mỗi Cost Center) và `proposalsOverAnnual`, `versionsTotal` (tập B4) và `overBy` (so `available`); mỗi phòng: Trần
  phòng, đề xuất (id, tổng, trạng thái), phiên bản tính ở B4 (cơ sở, dự phòng, tổng, trạng thái, `origin`).
- `budget_versions.origin` enum `PROPOSAL` | `BASELINE_NO_HEAD` (default `PROPOSAL`); `budget_versions.base_reason text NULL`.
- `budgetVersionCreate`: thêm `source: 'PROPOSAL' | 'BASELINE'` (+ `costCenterId`, `year` khi `BASELINE`). `BASELINE` chỉ khi
  **đủ** (a) kỳ của năm đã từng phát hành; (b) `today > submission_deadline` (sau hết ngày, múi giờ tổ chức); (c) phòng không có
  trưởng phòng hôm nay **và** không có nhiệm kỳ trưởng phòng bắt đầu sau hôm nay (kế nhiệm, kể cả phòng mới); (d) không có đề
  xuất `SUBMITTED`/`REVIEWED` của (Cost Center, năm); (e) phòng có Cost Center hiện hành — thiếu (e) ⟹ 409
  `FINANCE.SETUP_INCOMPLETE`, thiếu (a)–(d) ⟹ 409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED` (`details.reason`). Dòng _Renew_ sinh
  từ số liệu nền; dự phòng mặc định. Chỉ Finance (Super Admin, Người duyệt chi, IT Admin, Employee 403 — AC-5).
- `budgetVersionUpdate`: đổi `base` ⟹ `baseReason` bắt buộc (422 `BUDGET.BASE_REASON_REQUIRED`), lưu cột và snapshot lịch sử
  phiên bản (TẠM CHỌN cách hiểu _chia lại kèm lý do_ của `QĐ-100v`).
- `budgetVersionSend`: kiểm B4 (dưới) ⟹ 409 `BUDGET.OVER_ANNUAL_CEILING` (`details.gapMinor`, `availableMinor`).
- Job (`budgets/cycle/cycle-deadline.job.ts`, mỗi giờ trong tiến trình API như `year-end.job`, chống trùng bằng `eventKey`
  chứa `cycleId` + ngày hạn ⟹ Finance đổi hạn thì nhắc lại theo hạn mới, không cột dấu):
  - qua hạn nộp: trưởng phòng chưa nộp — `BUDGET_PROPOSAL_DEADLINE_REMINDER`; Finance và Super Admin — `BUDGET_NO_HEAD_AT_DEADLINE`
    (danh sách phòng thỏa (c)(d)); Finance — `BUDGET_SUBMISSION_DEADLINE_PASSED` (số phòng chưa nộp);
  - qua hạn duyệt: Người duyệt chi — `BUDGET_DECISION_DEADLINE_REMINDER` (phiên bản `SENT`); Finance — cùng mã (số chưa quyết);
  - kỳ đã từng phát hành, chưa qua hạn nộp: phòng của tập thiếu Cost Center hiện hành ⟹ Finance `BUDGET_COST_CENTER_SETUP_DUE`
    một lần mỗi (kỳ, phòng) (`QĐ-108e`).
- `budgets/proposal/budget-head-change.listener.ts`: `HEAD_PERIOD_START` của phòng có phiên bản `BASELINE_NO_HEAD` chưa kết
  thúc ⟹ trưởng phòng mới nhận `BUDGET_BASELINE_VERSION_HEAD_ASSIGNED` (`QĐ-106k`).

## Behavior and design

1. **Tập phiên bản tính ở B4** (TẠM CHỌN): mỗi Cost Center của năm lấy phiên bản mới nhất (theo `number`) ở `SENT`,
   `CHANGES_REQUESTED`, `APPROVED`; phiên bản đang gửi thay bản của chính Cost Center đó; loại `DRAFT`, `REJECTED`,
   `EXPIRED`, bản đã tách (`detachedAt`). Phiên bản khác `currency` của kỳ ⟹ 409 `BUDGET.CYCLE_CURRENCY_MISMATCH`.
2. **Kiểm B4** lúc gửi: Σ (cơ sở + dự phòng) của tập ≤ `annualCeiling − sharedPoolReserve`; kỳ chưa từng phát hành ⟹ 409
   `BUDGET.CYCLE_NOT_PUBLISHED`. Khóa theo thứ tự chung của sibling (kỳ → proposal → version → năm): kỳ `FOR UPDATE` trước
   khóa phiên bản, nên hai lần gửi song song của hai phòng không cùng lọt.
3. Vượt ⟹ Finance chọn (ngoài API này): sửa số cơ sở (kèm `baseReason`) / dự phòng (kèm `reserveReason` khi khác mặc định —
   đã có) hoặc trả đề xuất (`budgetProposalReturn`, đã có).
4. Phiên bản từ số liệu nền mang `origin = BASELINE_NO_HEAD` trong mọi response và gói; phòng có trưởng phòng sau đó ⟹ phiên
   bản đi tiếp, giữ cờ, không đổi người lập; trưởng phòng mới được báo và thấy phiên bản (AC-4); nộp `BM-10` cho phiên bản
   tiếp theo nếu bị yêu cầu sửa/từ chối (luồng hiện có).
5. Số liệu nền, gói chỉ đọc; số câu lệnh cố định theo số phòng (đọc theo lô, không N+1).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                                      | Cấp test           | Kết quả mong đợi                                          | Bằng chứng sau implement |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------- | ------------------------ |
| R-I06       | gửi làm tổng = available; vượt 1; gửi song song hai phòng cùng làm vượt                                                                                  | integration        | 200 / 409 gap 1 / đúng một lần thành công                 |                          |
| R-I06       | gửi khi kỳ chưa từng phát hành                                                                                                                           | integration        | 409 `CYCLE_NOT_PUBLISHED`                                 |                          |
| R-I06       | tập B4: `DRAFT`, `REJECTED`, `EXPIRED` không tính; `SENT`, `CHANGES_REQUESTED`, `APPROVED` tính; bản đang gửi thay bản cùng Cost Center; khác `currency` | unit policy        | tổng đúng; 409 `CYCLE_CURRENCY_MISMATCH`                  |                          |
| QĐ-100v     | PATCH đổi `base` thiếu / có `baseReason`                                                                                                                 | http               | 422 `BASE_REASON_REQUIRED` / 200, lịch sử có lý do        |                          |
| R-I03       | số liệu nền: quyền không ngày kết thúc, quyền hết hạn giữa năm, `ANNUAL` ÷ 12; phòng mới hiệu lực 01/01 có mặt, số 0                                     | unit + integration | số đúng tính tay                                          |                          |
| AC-12       | gói: `proposalsTotal` vs `annualCeiling`, `versionsTotal`, `available`, `overBy`                                                                         | integration        | số khớp tính tay                                          |                          |
| R-I05       | Finance lập `BASELINE` trước/đúng ngày hạn nộp; sau hạn: phòng có trưởng phòng; có kế nhiệm; đã có đề xuất nộp; thiếu Cost Center; đủ điều kiện          | http               | 409 / 409 / 409 / 409 / 409 `SETUP_INCOMPLETE` / 201 cờ   |                          |
| AC-5        | Super Admin / Người duyệt chi / IT Admin lập `BASELINE`                                                                                                  | http               | 403                                                       |                          |
| AC-4        | gán trưởng phòng sau khi lập phiên bản có cờ                                                                                                             | integration        | phiên bản giữ cờ, trưởng phòng nhận thông báo và đọc được |                          |
| R-I05       | job qua hạn nộp chạy hai lần; Finance đổi hạn nộp rồi job chạy                                                                                           | integration        | mỗi người nhận một lần; nhắc lại theo hạn mới             |                          |
| AC-1        | qua hạn nộp có phòng không trưởng phòng                                                                                                                  | integration        | Finance và Super Admin nhận `NO_HEAD_AT_DEADLINE`         |                          |
| R-I05       | qua hạn duyệt có phiên bản `SENT`                                                                                                                        | integration        | Người duyệt chi và Finance nhận nhắc                      |                          |
| QĐ-108e     | kỳ đã phát hành, phòng mới chưa có Cost Center                                                                                                           | integration        | Finance nhận `COST_CENTER_SETUP_DUE` một lần              |                          |
| quyền       | trưởng phòng đọc `package`; đọc `baseline` phòng khác; Người duyệt chi đọc `baseline`                                                                    | http               | 403 / 403 / 200                                           |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có 2 operation mới, `budgetVersionCreate`/`Update`/`Send` đổi như spec;
      `api-coverage-manifest.ts` có 2 operation mới; README `budgets` ghi job nhắc hạn và tập B4.
- [ ] Kiểm tra nhanh tracker §4.5; `pnpm check`, full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W2. Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W2 (DA2-14…19, 31; luật bỏ sót 1, 2, 5, 6, 7): điều kiện `BASELINE` đủ (a)–(e), tập B4
định nghĩa rõ + khác đồng tiền, `baseReason`, gói có tổng đề xuất so Trần năm (cờ/hạng giao `lines-cleanup`), nhắc hạn có
Finance/Super Admin và nhắc lại khi đổi hạn (eventKey thay cột dấu), báo trưởng phòng mới, nhắc Finance liên kết Cost Center,
Người duyệt chi đọc số liệu nền, ghi rõ lý do phụ thuộc `department-effective-year`, Verify đúng file.
09/11/2026 (code, đợt 1/3): Task 1 và phần kiểm B4 + `baseReason` đã cài. Chi tiết cài: `annualCheck` ở `budget.policy.ts` (tập B4 = bản mới nhất mỗi Cost Center trong `SENT/CHANGES_REQUESTED/APPROVED`, không detached, bản đang gửi thay bản cùng Cost Center); khóa kỳ `FOR UPDATE` ở `VersionAccessService.lockCycleOf` (bỏ qua năm đã kết thúc để vẫn báo `YEAR_ENDED`); `baseReason` ≤ 1000 ký tự, CHECK ở DB, hiện ở `VersionWire`, lịch sử `FIGURES_UPDATED`.
09/11/2026 (R2 đợt 1, F-057…F-063): test giữ tập B4 (SENT/CHANGES_REQUESTED/APPROVED tính; DRAFT/REJECTED/EXPIRED/draft tách không tính) và thứ tự khóa kỳ tất định (giữ `FOR UPDATE` kỳ ở kết nối khác; mutation dời khóa ⟹ đỏ); `baseReason` luôn hiện ở mục lịch sử khi số cơ sở đổi; "đổi `base`" nghĩa là khác giá trị đang có, `baseReason` kèm theo khi số không đổi bị bỏ qua (Q-16 A hiểu hẹp); CHECK `budget_versions_source_check` sửa ở migration `20261108550000_budget_version_baseline_source` cho phiên bản `BASELINE_NO_HEAD` không có đề xuất.
09/11/2026 (code, đợt 2/3 phần đọc): `budgetCycleBaseline`/`budgetCyclePackage` đã cài. Dạng wire: map theo id phòng và id thuê bao (không mảng). Giá tháng = giá đơn vị theo tiền báo cáo của thuê bao (`price_reporting_minor`) ÷ chu kỳ (tháng ×1, quý ÷3, năm ÷12, `OTHER` ⟹ null), làm tròn nửa lên; tháng chạy = số tháng chạm trong năm (không ngày kết thúc ⟹ 12); chi phí ước tính = ghế mua × giá tháng × tháng chạy; seat Đã gán = quyền cá nhân đang giữ của thuê bao hôm nay (`LicenseAssignment` không thất bại/hủy, hiệu lực hôm nay); thực chi năm hiện tại của phòng lấy từ hóa đơn đã áp vào cam kết của Cost Center hiện hành (`CommitmentRepo.totals`). Gói: `versionsTotal` cộng đúng tập B4 (mọi phiên bản tính của năm), `overBy` = vượt so `available`.
09/11/2026 (code, đợt 2b): `source: BASELINE` đã cài. Body: `{source:'BASELINE', costCenterId, year}` (không `proposalId`, không `base`; trộn hai nguồn ⟹ 422). Dòng = mỗi thuê bao đang chạy trong năm có giá biết trước ⟹ một dòng `Renew <ứng dụng> <gói>` với số tiền = chi phí ước tính của số liệu nền; base = Σ dòng; dự phòng = tỷ lệ mặc định. Thứ tự kiểm: năm đã kết thúc (422 `YEAR_ENDED`) → khóa kỳ → Cost Center còn dùng (409 `SETUP_INCOMPLETE`) → (a) đã phát hành, (b) qua hạn nộp (ngày hạn vẫn chưa được), (c) không trưởng phòng hôm nay, (d) không nhiệm kỳ sắp tới, (e đề xuất) không đề xuất `SUBMITTED`/`REVIEWED` ⟹ 409 `BASELINE_VERSION_NOT_ALLOWED`; rồi `BUDGET.CURRENT_EXISTS`/`VERSION_IN_FLIGHT`. Phiên bản không có đề xuất (migration `…baseline_source`).

09/11/2026 (R2 đợt 2 + 2b R1, F-066…F-093): (1) chi phí của phòng = seat **đang gán** (đếm HOLDING của kho: gồm tài khoản dịch vụ và ngày bắt đầu tương lai) × giá tháng × tháng chạy; seat mua nhưng Trống thuộc dòng _Chưa phân bổ — kho dùng chung_ (QĐ-103k), không vào phòng. (2) Thuê bao hết hạn trước năm nhưng còn chạy hôm nay tính 12 tháng và đề xuất gia hạn. (3) Wire là **mảng** có trần: tối đa 500 phòng, 50 phần mềm mỗi phòng, kèm `departmentsTotal`/`softwareTotal`; `hasUnknownCost` cho thuê bao chưa có giá. (4) `spentThisYear` cộng mọi Cost Center Đơn vị phòng từng có; seat-tháng chính xác của K2 vẫn thuộc W5. (5) Gói: `proposalsOverAvailable` (so với phần còn lại sau Dự phòng kho), phiên bản khác đồng tiền loại ra và đếm riêng (`versionsInOtherCurrency`), `versionsOutsideListed`. (6) `budgetVersionCreate`: body là `oneOf` hai nhánh `strictObject` (`PROPOSAL` mặc định / `BASELINE` chỉ `costCenterId`, `year`); trường của nhánh kia ⟹ 422. (7) Điều kiện mới ngay sau (a): phòng phải có Trần trong kỳ của năm và hiệu lực không muộn hơn 31/12 năm đó, không thì 409 `BASELINE_VERSION_NOT_ALLOWED` `details.reason = DEPARTMENT_NOT_IN_CYCLE`. (8) TẠM CHỌN (chờ Owner): phòng không chạy gì vẫn lập được phiên bản base 0, không dòng.
