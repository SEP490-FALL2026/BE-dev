# Spec: qd103-budget-cycle-ceilings — kỳ lập ngân sách B1/B2: Trần năm, Trần của phòng, Dự phòng kho dùng chung

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W2 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.15`(0), `FR-5.16`(1)(2)(6), `BR-MF4-01`, `BR-MF4-02`; `QĐ-103i`, `QĐ-103z`(1),
  `QĐ-106k`, `QĐ-100k`, `QĐ-94l`(4), `QĐ-82l`(4); quy trình v1.7 mục 4.1–4.3; `US-06-15` AC-1, AC-3, AC-5→AC-8, AC-10,
  AC-13, AC-15, AC-17), BE `d9c46552`. Ledger: L1-08, L1-19; luật R-I02, R-I03 (vế mở kỳ), R-I04. Câu TẠM CHỌN: Q-02 = A;
  câu mới (đề xuất, xem REVISION-NOTES W2): bỏ phát hành khi sửa, tập phòng chia Trần, người nhận thông báo, quyền theo khóa tham số.
- Nhóm roadmap: G5 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment` (scope map G5 chưa re-pin, xem tracker §5).
- [Kế hoạch](plan.md).

## Business outcome

Finance mở kỳ lập ngân sách của một năm (hạn nộp, hạn duyệt, **Trần ngân sách phần mềm năm**, ưu tiên), nhập lại Trần năm
kèm lý do khi lãnh đạo đổi, chia **Trần của phòng** (3 thành phần) cho **mọi phòng** của năm và nhập **Dự phòng kho dùng
chung**, rồi **phát hành** — bị từ chối khi thiếu phòng/thiếu dự phòng kho hoặc tổng vượt Trần năm. Kỳ của năm đã qua chỉ
đọc. Trưởng phòng nộp `BM-10` chỉ khi kỳ của năm đã từng phát hành (Q-02 = A). Finance (và chỉ Finance) sửa các khóa tham
số thuộc Finance. `ops:seed` vẫn chạy. Kiểm bằng test HTTP + integration.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (đợt W2). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `single-story`.
- Outcome and owner: capability mới `budgets/cycle/` sở hữu kỳ, trần và phát hành; `operating-parameters` sở hữu quyền sửa
  theo khóa; `installation/seed` giữ `ops:seed` chạy được.
- Boundaries: 2 bảng mới, 6 operation mới, 1 điều kiện mới ở `budgetProposalSubmit`/`Resubmit`; quyền theo khóa tham số;
  1 bước seed tối thiểu.
- Not larger: số liệu nền, kiểm B4, gói tổng hợp, nhắc hạn ở `qd103-budget-baseline-annual-check`; cờ dòng vượt Trần phòng ở
  `qd103-budget-proposal-lines-cleanup`; lọc phòng theo ngày hiệu lực ở `qd103-department-effective-year`; seed demo đủ
  kịch bản ở W7 `qd103-seed-demo-v4`.
- Not smaller: phát hành kiểm tổng cần Trần năm, Trần phòng và dự phòng kho trong một transaction; seed vỡ ngay khi luật
  Q-02 vào nên phải sửa cùng hạng mục (tracker §4 luật 8).
- Siblings: `qd103-department-effective-year`, `qd103-budget-baseline-annual-check`, `qd103-budget-proposal-lines-cleanup`, `qd103-budget-views`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                                | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-15 | AC-1, AC-3, AC-5→AC-8, AC-10, AC-13, AC-15, AC-17 | partial  | AC còn lại và vế chung theo scope map: `qd103-calendar-fiscal-year`, `qd103-budget-baseline-annual-check`, `qd103-budget-views`, `qd103-department-effective-year`; AC-4, AC-18 `deferred` tới chính `qd103-budget-cycle-ceilings` (chưa claim) |

## Supporting references

`US-06-15` AC-1, AC-3, AC-5→AC-8, AC-10, AC-13, AC-15, AC-17 — hiện thực ở đây nhưng chưa ghi lên scope map G5 (xem
tracker). `FR-5.16`(2): _Trần của phòng = cam kết đã ký + seat kế hoạch × giá tháng + khoản ưu tiên_. QT 4.3 điều kiện
tối thiểu: _mỗi phòng có Trần của phòng; đã nhập Dự phòng kho dùng chung_. QT 4.1: Người duyệt chi xem kỳ ở trang tổng
quan (thắng `US-06-15` AC-1 _báo cả Người duyệt chi_ theo thứ tự nguồn — ghi câu tạm chọn để Owner xác nhận).

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L1-08, L1-19 — gỡ chặn `qd103-budget-baseline-annual-check`, `qd103-budget-check-three-outcomes`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

Gói tổng hợp B4/B5, số liệu nền, nhắc hạn (sibling `baseline-annual-check`); Trần phòng cho phòng chưa có Cost Center vẫn
chia được (khóa theo `department_id`) nhưng nộp `BM-10` vẫn cần Cost Center (`QĐ-108e`, giữ `FINANCE.SETUP_INCOMPLETE`).
Cảnh báo dòng kho vượt Dự phòng kho (`FR-5.16`(6)) ở W5.

## Dependencies and blockers

W1 `qd103-calendar-fiscal-year` (năm dương lịch). Không chờ hạng mục nào của W2; `qd103-department-effective-year` sau đó
thêm điều kiện ngày hiệu lực vào luật chọn phòng của PUT/publish (một hàm, xem Behavior 3).

## Ownership: module, data, API

- Bảng `budget_cycles` (`id`, `organization_id`, `year` unique theo org, `submission_deadline date`, `decision_deadline date`
  CHECK ≥ hạn nộp, `annual_ceiling_minor bigint ≥ 0`, `shared_pool_reserve_minor bigint ≥ 0 NULL` (NULL = chưa nhập),
  `currency char(3)` = đồng tiền báo cáo lúc mở, `priorities text NULL`, `opened_by`, `opened_at`, `published_by NULL`,
  `published_at NULL` (đang phát hành), `first_published_at NULL` (không bao giờ xóa), `updated_at`).
- Bảng `budget_department_ceilings` (`cycle_id`, `department_id`, `signed_commitments_minor`, `planned_seats_minor`,
  `priority_minor` ≥ 0, `total_minor` = tổng (CHECK), `published_total_minor NULL` (số đã báo lần phát hành gần nhất),
  PK `(cycle_id, department_id)`).
- Audit Trail (không bảng riêng): mở kỳ; mỗi lần đổi Trần năm (trước/sau + lý do), hạn, ưu tiên; mỗi PUT ghi trước/sau của
  `sharedPoolReserve` và từng Trần phòng đổi; lần phát hành bị chặn (mã lỗi + chênh lệch) và lần phát hành.
- Operation mới: `budgetCycleOpen` POST `/budget-cycles`; `budgetCycleList` GET `/budget-cycles` (Finance, Người duyệt chi);
  `budgetCycleGet` GET `/budget-cycles/{year}` (Finance, Người duyệt chi; trưởng phòng đọc phần của phòng mình qua
  `budgetMine` ở `qd103-budget-views`); `budgetCycleUpdate` PATCH `/budget-cycles/{year}` (hạn, ưu tiên, Trần năm kèm
  `reason` bắt buộc khi đổi Trần năm); `budgetDepartmentCeilingsSet` PUT `/budget-cycles/{year}/department-ceilings`
  (thay toàn bộ danh sách Trần phòng + `sharedPoolReserve`); `budgetCyclePublish` POST `/budget-cycles/{year}/publish`.
  Ghi chỉ `FINANCE`; Super Admin, IT Admin, Người duyệt chi, trưởng phòng, Employee ⟹ 403.
- `budgets/proposal/proposal-sender.service.ts`: nộp/nộp lại cần kỳ của năm có `first_published_at` ⟹ ngược lại 409
  `BUDGET.CYCLE_NOT_PUBLISHED`.
- `operating-parameters`: định nghĩa tham số thêm `owner: 'SUPER_ADMIN' | 'FINANCE'` (mặc định `SUPER_ADMIN`);
  `BUDGET_RESERVE_DEFAULT_PERCENT` → `FINANCE` (hai ngưỡng ZBB do `lines-cleanup` thêm cũng `FINANCE`);
  `FORECAST_ERROR_THRESHOLD_PERCENT` (`FR-5.7`) giữ `SUPER_ADMIN`. `operatingParameterSet` cho cả hai vai, service kiểm
  `owner` ⟹ 403 khi sai vai; `operatingParameterList`/`History` cho Finance chỉ các khóa Finance sở hữu.
- Thông báo: `BUDGET_CYCLE_OPENED` (trưởng phòng có hiệu lực; Người duyệt chi xem trang tổng quan — QT 4.1);
  `BUDGET_DEPARTMENT_CEILING_PUBLISHED` (trưởng phòng của phòng có `total_minor ≠ published_total_minor` — lần đầu là mọi phòng).
- Seed: `src/cli/seed/steps/finance.steps.ts` thêm bước _mở kỳ + chia Trần + phát hành_ cho năm hiện tại và năm sau trước
  bước ngân sách (Trần năm đủ lớn để B4 không chặn), fixture `shared-demo-v3/finance.ts` thêm số kỳ.

## Behavior and design

1. Mở kỳ: một kỳ mỗi (organization, year); `year < năm hiện tại` (múi giờ tổ chức) ⟹ 422 `BUDGET.CYCLE_YEAR_PAST`; đã có
   ⟹ 409 `BUDGET.CYCLE_EXISTS`; hạn duyệt < hạn nộp ⟹ 422 `BUDGET.CYCLE_DEADLINES_INVALID`. Năm hiện tại được mở (Q-02 = A,
   hạn có thể ở quá khứ). `currency` lấy đồng tiền báo cáo lúc mở và không đổi.
2. **Năm đã qua chỉ đọc** (`QĐ-82l`(4), B7): PATCH, PUT, publish với `year < năm hiện tại` ⟹ 422 `BUDGET.CYCLE_YEAR_PAST`.
3. **Tập phòng của năm** (một hàm `ceilingDepartments(tx, org, year)` trong `budgets/cycle`, đọc qua `OrganizationReadApi`):
   phòng chưa ngừng. `qd103-department-effective-year` thêm điều kiện `effective_from ≤ 31/12/year` vào đúng hàm này.
   PUT: phòng không thuộc tập (lạ, đã ngừng) ⟹ 422 `BUDGET.CEILING_DEPARTMENT_INVALID` (`details.departmentIds`); được thiếu
   phòng (đang chia). Trần phòng: `total = signed + planned + priority`.
4. Phát hành: khóa kỳ `FOR UPDATE`; thiếu phòng của tập, thiếu diễn giải của một Trần phòng (W2-N4, QT 4.3) hoặc `shared_pool_reserve_minor IS NULL` ⟹ 422
   `BUDGET.CEILINGS_INCOMPLETE` (`details.missingDepartmentIds`, `details.explanationMissingDepartmentIds`, `details.reserveMissing`; 0 tường minh hợp lệ); dòng của
   phòng đã rời tập ⟹ cùng lỗi (`details.staleDepartmentIds`); `Σ total + reserve > annualCeiling` ⟹ 409
   `BUDGET.CEILINGS_OVER_ANNUAL` (`details.gapMinor`). Thành công: `published_*` (và `first_published_at` nếu null),
   `published_total_minor = total_minor`, gửi thông báo.
5. **Sửa sau phát hành** (PATCH Trần năm, PUT): được (lãnh đạo đổi) và **tự bỏ phát hành** (`published_at = NULL`, giữ
   `first_published_at`) — phải phát hành lại để kiểm tổng. Trong lúc chờ (TẠM CHỌN): nộp/nộp lại `BM-10` và gửi phiên bản
   vẫn được vì điều kiện là `first_published_at`; cửa sổ tạo phòng mới đã đóng từ lần phát hành đầu (sibling). Đổi lại = một
   vị từ `cycleAcceptsWork(cycle)` trong `budgets/cycle/cycle.policy.ts`.
6. **Thứ tự khóa chung của `budgets`** (ghi README trong Task 2): **kỳ → proposal → version → năm**. Nộp/nộp lại đọc kỳ
   `FOR SHARE` trước khóa proposal và `yearLock`; PUT/PATCH/publish khóa kỳ `FOR UPDATE` trước khi ghi Trần.
7. Quá hạn nộp/duyệt chỉ nhắc (sibling), không chặn nộp. Tiền: đồng tiền báo cáo, số nguyên minor, chuỗi trong JSON (ADR-0007).
8. Dữ liệu cũ: môi trường đang có đề xuất/phiên bản mà chưa có kỳ ⟹ sau deploy nộp `BM-10` bị 409 tới khi Finance mở và phát
   hành kỳ năm hiện tại/năm sau (README `budgets` mục vận hành + `docs/guides/seed.md`); phiên bản đã có không đổi.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                                                                                                                           | Cấp test    | Kết quả mong đợi                                                                             | Bằng chứng sau implement |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| R-I03          | Finance mở 2027; mở lại 2027; mở 2025 khi đang 2026; hạn duyệt < hạn nộp                                                                                                      | http        | 201 / 409 / 422 `CYCLE_YEAR_PAST` / 422 `CYCLE_DEADLINES_INVALID`                            |                          |
| AC-10          | Super Admin, IT Admin, Người duyệt chi, trưởng phòng gọi mở / PATCH / PUT / publish                                                                                           | http        | 403 mọi ô                                                                                    |                          |
| quyền đọc      | Người duyệt chi `budgetCycleList`/`Get`; trưởng phòng `budgetCycleGet`                                                                                                        | http        | 200 / 403                                                                                    |                          |
| R-I04          | phát hành khi Σ + dự phòng kho = Trần năm; vượt 1 đơn vị                                                                                                                      | integration | 200 / 409 `CEILINGS_OVER_ANNUAL` gap 1                                                       |                          |
| QT 4.3         | phát hành khi thiếu một phòng; dự phòng kho chưa nhập; dự phòng kho = 0                                                                                                       | integration | 422 `CEILINGS_INCOMPLETE` / 422 / 200                                                        |                          |
| QT 4.3 (W2-N4) | phát hành khi một Trần phòng không có diễn giải; kỳ đã phát hành rồi PUT cùng số mà bỏ diễn giải; chỉ đổi diễn giải                                                           | integration | 422 `CEILINGS_INCOMPLETE` + `explanationMissingDepartmentIds` / bỏ phát hành / giữ phát hành |                          |
| R-I04          | PUT Trần cho phòng đã ngừng / phòng lạ                                                                                                                                        | http        | 422 `CEILING_DEPARTMENT_INVALID`                                                             |                          |
| AC-8           | sửa Trần năm sau phát hành thiếu lý do / có lý do                                                                                                                             | http        | 422 / 200 + bỏ phát hành + audit trước/sau                                                   |                          |
| AC-15          | PUT đổi dự phòng kho và một Trần phòng sau phát hành                                                                                                                          | integration | bỏ phát hành; audit trước/sau từng số                                                        |                          |
| AC-8           | phát hành lại sau khi đổi Trần một phòng                                                                                                                                      | integration | chỉ trưởng phòng đó nhận `BUDGET_DEPARTMENT_CEILING_PUBLISHED`                               |                          |
| AC-1           | mở kỳ                                                                                                                                                                         | integration | trưởng phòng có hiệu lực nhận `BUDGET_CYCLE_OPENED`; Người duyệt chi không                   |                          |
| B7             | PATCH / PUT / publish kỳ 2025 khi đang 2026                                                                                                                                   | http        | 422 `CYCLE_YEAR_PAST`                                                                        |                          |
| Q-02           | nộp `BM-10` khi kỳ chưa mở / chưa từng phát hành / đã phát hành / bỏ phát hành sau lần đầu                                                                                    | http        | 409 / 409 / 201 / 201                                                                        |                          |
| Q-02           | `budgetProposalResubmit` khi kỳ chưa từng phát hành                                                                                                                           | integration | 409 `CYCLE_NOT_PUBLISHED`                                                                    |                          |
| L1-19          | Finance sửa `BUDGET_RESERVE_DEFAULT_PERCENT`; Super Admin / Người duyệt chi / IT Admin sửa cùng khóa; Super Admin sửa `FORECAST_ERROR_THRESHOLD_PERCENT`; Finance sửa khóa đó | http        | 200 / 403 / 403 / 200 / 403                                                                  |                          |
| L1-19          | Finance `operatingParameterList`                                                                                                                                              | http        | 200, chỉ khóa Finance sở hữu                                                                 |                          |
| concurrency    | hai lần phát hành song song; PUT Trần song song phát hành                                                                                                                     | integration | một lần phát hành; PUT xếp sau, kết quả bỏ phát hành                                         |                          |
| seed           | `ops:seed` trên DB sạch, chạy lại lần hai                                                                                                                                     | integration | kỳ 2 năm phát hành; ngân sách demo tới `APPROVED`; lần hai không đổi                         |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có 6 operation mới + lỗi mới; `api-coverage-manifest.ts` có 6 operation; README `budgets`
      ghi capability `cycle/`, thứ tự khóa kỳ → proposal → version → năm, mục vận hành dữ liệu cũ.
- [ ] Test hiện có của đề xuất/phiên bản/flow/e2e (danh sách ở plan Task 3) cập nhật fixture có kỳ đã phát hành và xanh.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W2. Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W2 (DA2-02…08, 30, 31; luật bỏ sót 3): tập phòng + `CEILINGS_INCOMPLETE`, năm đã qua
chỉ đọc, `first_published_at` + bỏ phát hành không chặn nộp (tạm chọn), audit trước/sau mọi số, người nhận thông báo theo
QT 4.1, thứ tự khóa kỳ → proposal → version → năm, quyền theo khóa tham số, task seed tối thiểu, Verify đúng file.
08/11/2026 (chat code): thêm `OrganizationReadApi.getActiveDepartmentIds(tx?)` (liệt kê phòng chưa ngừng) cho `ceilingDepartments`; `budgetCycleList` phân trang và trả bản tóm tắt không kèm chia Trần, `budgetCycleGet` trả `ceilings` dạng bản đồ theo `departmentId` (tránh mảng lồng và ngoại lệ đã đóng băng của sổ collection).
08/11/2026 (sau review W2 R2, chat code): `budget_department_ceilings` thêm cột `explanation` (diễn giải Trần phòng, QT 4.3; tùy chọn, không bắt buộc ở publish — tạm chọn); PUT từ chối `departmentId` trùng (422); số tiền PATCH/PUT đọc theo đồng tiền của kỳ; PUT/PATCH không đổi gì thì giữ nguyên trạng thái phát hành, không audit; nộp lại khóa kỳ trước proposal; `budgetCycleList` phân trang ở SQL.
08/11/2026 (R3): diễn giải Trần phòng BẮT BUỘC khi phát hành (W2-N4, QT 4.3); chỉ đổi diễn giải không bỏ phát hành; nộp lại kiểm sở hữu đề xuất trước khi hỏi kỳ, rồi khóa kỳ → đề xuất.
09/11/2026 (R4): PUT chia lại mà còn một Trần phòng không có diễn giải thì bỏ phát hành (nó không thể được phát hành); test matrix QT 4.3 thêm hai ca diễn giải.
