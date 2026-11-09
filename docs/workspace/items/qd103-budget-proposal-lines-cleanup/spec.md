# Spec: qd103-budget-proposal-lines-cleanup — dòng `BM-10` (loại, ZBB, xếp hạng, cờ vượt Trần phòng); dọn phiên bản sửa đổi và cột thừa

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`), đợt W2 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready`. Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.15`(1)(2)(4), `FR-5.16`(3)(4), `BR-MF4-02`, `BR-MF4-05`; `QĐ-101n`, `QĐ-94l`(4),
  `QĐ-97b`, `QĐ-97c`; quy trình v1.7 mục 4.4–4.5, 4.7, A.4 _Ngưỡng giải trình ZBB_; L1 MF-4 bước 5–7, 9; `US-06-10` AC-1, AC-2,
  AC-20; `US-06-09` AC-31), BE `d9c46552`. Ledger: L1-20, L1-21, L1-22; luật R-I05 (cờ vượt, bất biến), R-I08. Câu tạm
  chọn mới (đề xuất, REVISION-NOTES W2): vế ZBB _đơn giá tăng_, vế ZBB `KPI-3` theo `QĐ-94l`, dữ liệu legacy `REVISION`.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (xem tracker §5).
- [Kế hoạch](plan.md).

## Business outcome

Trưởng phòng lập `BM-10` với mỗi dòng có **loại** (_Renew_/_Change_/_New_/_Cancel_), **xếp hạng ưu tiên**, **giải trình ZBB
rút gọn** khi bắt buộc; server gắn **cờ vượt Trần phòng kèm phần vượt** cho dòng làm tổng vượt và đòi lý do ở dòng đó (không
chặn vì vượt). Finance và Người duyệt chi thấy dòng gắn cờ và thứ hạng trong gói tổng hợp. Dòng phiên bản mang loại/ZBB/hạng.
Mô hình không còn phiên bản sửa đổi (`REVISION`/`SUPERSEDED`), đổi dòng, _dời khoảng mua_, cột khoảng mua/kỳ dịch vụ/chu
kỳ/hạn báo giá/giá trị cao. `ops:seed` vẫn chạy.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W2), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `budgets/proposal` + `budgets/version` (dạng dòng), lõi `budgets/budget` (enum/kiểu), `budgets/cycle`
  (phần dòng của gói); `installation/migration-preflight` (chặn dữ liệu legacy); seed.
- Boundaries: một migration (thêm cột dòng, drop cột/enum thừa); DTO dòng của đề xuất/phiên bản/import; bỏ extension
  `PLAN_LINE_MOVED`; mở rộng `budgetCyclePackage`; 2 tham số; 1 judgement preflight.
- Not larger: tổng/kiểm B4 ở `qd103-budget-baseline-annual-check`; view ở `qd103-budget-views`; gỡ cả nhánh Finance rà soát
  ở W3 `qd103-budget-check-three-outcomes`.
- Not smaller: dọn cột thừa cùng bảng dòng với cột mới — hai migration trên cùng bảng không có lợi; seed vỡ ngay khi
  `lineType`/`priorityRank` bắt buộc nên sửa cùng hạng mục (tracker §4 luật 8).
- Siblings: `qd103-budget-cycle-ceilings`, `qd103-budget-baseline-annual-check`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc           |
| ----- | ------------------- | -------- | ---------------------------- |
| —     | L1-20, L1-21, L1-22 | n/a      | gỡ chặn `qd103-budget-views` |

## Supporting references

`US-06-10` AC-1, AC-2, AC-20 (_kèm phần vượt_); `US-06-09` AC-31. `QĐ-94l`: ZBB bắt buộc với dòng _New_, dòng
_Renew/Change/New/Cancel_ có `KPI-3 < 70 %` và dòng đơn giá tăng `> 10 %` so với kỳ trước — ngưỡng là tham số Finance (BRD
`FR-5.15`(1), QT 4.4 chỉ ghi _Renew/Change_ cho vế `KPI-3`; theo thứ tự nguồn áp `QĐ-94l`, ghi câu tạm chọn). QT 4.4 điều
kiện tối thiểu: _đã xếp hạng ưu tiên; dòng vượt Trần của phòng có lý do_. Spec cũ `qd96-100-plan-line-removal-and-bm10-lines`,
`qd96-100-remove-budget-revision-and-high-value` chỉ đọc tham khảo.

## Explicit out of scope

`KPI-3` thật từ usage (W6): ở đây `kpi3` của số liệu nền là `null` ⟹ vế `KPI-3` chỉ áp khi có số. Nhánh `PLAN_LINE_MOVED`
trong `requests/finance-review/spend-budget.listener.ts`: chỉ gỡ nhánh đó; W3 `qd103-budget-check-three-outcomes` gỡ cả
listener (phối hợp: làm sau W2, không sửa lại phần này).

## Dependencies and blockers

`qd103-budget-cycle-ceilings` (Trần phòng, `owner` tham số); `qd103-budget-baseline-annual-check` (giá tháng quy đổi và `kpi3`
của số liệu nền — chỉ Task 3; gói tổng hợp — Task 4). Task 1–2 không chờ baseline.

## Ownership: module, data, API

- `budget_proposal_lines`: `line_type` enum `RENEW|CHANGE|NEW|CANCEL` NOT NULL (backfill `NEW`), `zbb jsonb NULL`
  (`purpose`, `alternatives`, `consequenceIfNot`, `usageIndicator` — chuỗi 1…1000 ký tự), `priority_rank int NOT NULL ≥ 1`
  (backfill = `position`, unique theo đề xuất), `over_ceiling_minor bigint NULL` (NULL = không cờ; số = phần vượt, server tính khi nộp).
- `budget_version_lines`: `line_type` NOT NULL (backfill `NEW`), `zbb jsonb NULL`, `priority_rank int NULL` — sao từ đề xuất;
  Finance thêm/sửa/import phải có `lineType`, giữ `zbb`/hạng khi không gửi. Không có cột cờ (cờ là của đề xuất B3).
- Drop: `window_from`, `window_to`, `service_period_months`, `repeat_cycle`, `quote_valid_until` (2 bảng), enum
  `BudgetRepeatCycle`; `budget_versions.{high_value_percent, high_value_amount_minor, kind, based_on_version_id, reason}`, enum
  `BudgetVersionKind`; bảng `budget_version_line_changes`; trạng thái `SUPERSEDED`, history kind `WINDOW_MOVED`; listener/
  extension `PLAN_LINE_MOVED`, `version/version-line-moved.service.ts`.
- **Dữ liệu legacy** (TẠM CHỌN): `budget_versions` có `kind = REVISION` hoặc `state = SUPERSEDED`, hoặc
  `budget_version_line_changes` có dòng ⟹ judgement mới của `ops:preflight` `BUDGET_LEGACY_REVISION_PRESENT` chặn và
  migration `RAISE EXCEPTION` (không xóa ngầm; môi trường demo seed lại). Bảng lịch sử bất biến
  `budget_version_history_entries` còn `WINDOW_MOVED`/`SUPERSEDED` ⟹ giữ giá trị enum đó (legacy, chỉ đọc; code không ghi),
  `budget_versions` thêm CHECK `state <> 'SUPERSEDED'`; không có ⟹ drop giá trị. `audit_events` giữ dấu đổi khoảng mua.
- Tham số (`owner: FINANCE`, nhóm `BUDGET`): `BUDGET_ZBB_KPI3_BELOW_PERCENT` (70), `BUDGET_ZBB_PRICE_INCREASE_PERCENT` (10).
- Operation đổi: `budgetProposalSubmit`, `budgetProposalResubmit`, `budgetProposalGet`, `budgetProposalLineList`,
  `budgetVersionLineAdd`, `budgetVersionLineUpdate`, `budgetVersionImport`, `budgetVersionLineList`, `budgetMineLineList`,
  `budgetVersionGet`/`List` (bỏ `kind`/`basedOn`/`SUPERSEDED`), `budgetCyclePackage` (thêm dòng cờ + hạng).

## Behavior and design

1. Nộp: mỗi dòng có `lineType` (thiếu ⟹ 422 `VALIDATION`), `priorityRank` (thiếu/trùng ⟹ 422 `BUDGET.PRIORITY_RANK_INVALID`
   `details.positions`). `zbb` bắt buộc khi (a) `NEW`; (b) `kpi3` của gói (số liệu nền) có số và `< BUDGET_ZBB_KPI3_BELOW_PERCENT`
   — mọi loại dòng (`QĐ-94l`); (c) dòng có `planId`, `seats > 0` và gói có giá tháng quy đổi (không áp `K4` trả một lần):
   `amount / seats / 12 > giá tháng × (1 + BUDGET_ZBB_PRICE_INCREASE_PERCENT/100)` — _kỳ trước_ = giá tháng quy đổi hiện hành
   (TẠM CHỌN). Thiếu ⟹ 422 `BUDGET.ZBB_REQUIRED` (`details.positions`). `CANCEL` không có luật số tiền riêng (≥ 0 như mọi dòng).
2. Cờ vượt: sắp theo `priorityRank`, cộng dồn; dòng đầu tiên làm tổng vượt Trần phòng và mọi dòng sau nó ⟹
   `overCeiling = min(amount, cộng dồn − Trần)`; dòng có cờ thiếu `note` ⟹ 422 `BUDGET.OVER_CEILING_NOTE_REQUIRED`
   (`details.positions`). Không chặn vì vượt. Không có dòng Trần của phòng (phòng thêm sau phát hành) ⟹ không gắn cờ.
3. Đề xuất đã nộp bất biến (hiện có). Lập phiên bản sao `lineType`/`zbb`/`priorityRank`; import CSV thêm cột `lineType`
   (bắt buộc), `priorityRank` (tùy chọn).
4. Gói tổng hợp (`budgetCyclePackage`): mỗi phòng thêm `lines[] { position, lineType, priorityRank, amount, overCeiling }` của
   đề xuất mới nhất, sắp theo hạng (B4/B5 — L1 bước 7, 9; QT 4.7).
5. Migration một transaction; preflight chạy trước; seed v3 cập nhật cùng hạng mục (Task 5).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                   | Cấp test                         | Kết quả mong đợi                                                                                    | Bằng chứng sau implement |
| ----------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------ |
| QT 4.5      | dòng thiếu `lineType`; thiếu `priorityRank`; trùng hạng                                               | http                             | 422 / 422 / 422 `PRIORITY_RANK_INVALID`                                                             |                          |
| R-I05       | `NEW` thiếu ZBB; `RENEW` KPI-3 65 % thiếu ZBB; `CANCEL` KPI-3 65 % thiếu ZBB; KPI-3 null              | unit policy + http               | 422 / 422 / 422 / không bắt buộc                                                                    |                          |
| R-I05       | giá tăng 11 % / 10 %; `seats` null; `seats` 0; gói `K4`                                               | unit policy                      | 422 / không / không / không / không                                                                 |                          |
| R-I05       | trường ZBB 1001 ký tự; chuỗi rỗng                                                                     | http                             | 422                                                                                                 |                          |
| R-I05       | `CANCEL` số tiền 50tr                                                                                 | http                             | 201                                                                                                 |                          |
| AC-20       | 3 dòng hạng 1,2,3; Trần phòng vượt giữa dòng 2 (vượt 30tr) có `note`                                  | unit policy + http               | dòng 2 `overCeiling` 30tr, dòng 3 = số tiền dòng 3; nộp 201                                         |                          |
| QT 4.4      | dòng có cờ thiếu `note`                                                                               | http                             | 422 `OVER_CEILING_NOTE_REQUIRED`                                                                    |                          |
| B4/B5       | gói tổng hợp có dòng cờ + hạng                                                                        | integration                      | khớp đề xuất                                                                                        |                          |
| phiên bản   | Finance thêm dòng thiếu `lineType`; sửa dòng giữ loại/ZBB/hạng; lập phiên bản sao từ đề xuất          | integration                      | 422 / giữ / giữ                                                                                     |                          |
| L1-19       | Finance sửa 2 ngưỡng ZBB; Super Admin sửa                                                             | http                             | 200 / 403                                                                                           |                          |
| R-I08       | OpenAPI `budgetVersionGet`/`List`                                                                     | contract (`openapi:export`)      | không còn `kind`, `basedOn`, `SUPERSEDED`                                                           |                          |
| migration   | dòng cũ có `window_*`; history có `WINDOW_MOVED`; DB có `REVISION` hoặc `budget_version_line_changes` | integration (preflight + deploy) | cột drop, dòng cũ `NEW`, hạng = position; history giữ, CHECK có; preflight chặn + migration dừng rõ |                          |
| import      | CSV có cột `lineType` / thiếu                                                                         | integration                      | nhận / 422 theo dòng                                                                                |                          |
| seed        | `ops:seed` sạch, chạy lại                                                                             | integration                      | đề xuất demo có loại/hạng/ZBB, ngân sách tới `APPROVED`                                             |                          |

## Definition of Done

- [ ] Test matrix xanh; grep `windowFrom|repeatCycle|highValue|REVISION|SUPERSEDED|PLAN_LINE_MOVED|WINDOW_MOVED|basedOn` trong
      `src/` chỉ còn ở migration, enum legacy của lịch sử có chú thích, judgement preflight, và giá trị `PLAN_LINE_MOVED` của
      `requests` (`budget-check.repo.ts`, `finance-review/*` — W3 dọn).
- [ ] Kiểm tra nhanh tracker §4.5; `pnpm check`, full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W2. Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W2 (DA2-20…25, 30, 31; luật bỏ sót 4): vế giá ZBB chỉ khi có gói/seat/giá tháng (tạm
chọn _kỳ trước_), vế `KPI-3` theo `QĐ-94l` mọi loại dòng (tạm chọn), bỏ luật `CANCEL = 0`, cờ thành phần vượt + `note` bắt
buộc, `priorityRank` bắt buộc (QT 4.4), cờ chỉ trên dòng đề xuất, preflight + giữ enum legacy của lịch sử bất biến, drop đủ
cột, gói có dòng cờ/hạng (chuyển từ `baseline-annual-check`), bỏ file không tồn tại, test contract thay _404 route_, seed.
09/11/2026 (code, lát đầu, không cần DB): `proposal/proposal-line-rules.policy.ts` (+spec) cài các luật thuần của Behavior 1–2: `duplicateRankPositions`, `zbbMissingPositions` (`NEW`; `KPI-3` biết và dưới ngưỡng, mọi loại dòng kể cả `CANCEL`; giá tăng quá ngưỡng theo `amount ×100 > giá tháng × (100+%) × seats × 12`, không xét khi thiếu seats/plan/giá tháng), `overCeilingParts` (cộng dồn theo hạng; dòng đầu làm vượt mang phần vượt, các dòng sau mang cả số tiền; không có Trần ⟹ không cờ), `overCeilingNoteMissing`. Hai tham số `BUDGET_ZBB_KPI3_BELOW_PERCENT` (70) và `BUDGET_ZBB_PRICE_INCREASE_PERCENT` (10), `owner: FINANCE`. Chưa nối vào DTO/sender: phần đó cùng migration và đổi mọi fixture, làm sau khi có DB để chạy integration.
