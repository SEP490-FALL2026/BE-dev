# Spec: qd96-100-remove-budget-revision-and-high-value — ngân sách đã duyệt khóa cả năm; bỏ ngưỡng giá trị cao

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo tracker qd96-100 (nhật ký review đã xóa 11/11/2026 — xem git history),
  `LEDGER.md` L-124, L-125; Q-02 B.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-5.15`; US 05/11/2026 — `US-06-09` AC-31 (AC-7→AC-10, AC-17 bị thay); `QĐ-97b`, `QĐ-97c`,
  `QĐ-82l(5)`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Finance không còn lập được phiên bản sửa đổi, dời khoảng mua hay xem lịch sử dời của một năm đã có ngân sách được duyệt (3
endpoint gỡ); không còn trường/cột _ngưỡng giá trị cao_. Phiên bản sửa đổi đang dở được đóng bằng migration kèm Audit. Kiểm được
bằng HTTP 404/422, integration migration và gate OpenAPI.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: gỡ hai khái niệm cùng nằm trên `budget_versions` và cùng màn hình Finance; capability `budgets/version`,
  `budgets/budget`, `budgets/public`.
- Boundaries: bảng `budget_versions` (drop `high_value_*`, `based_on_version_id`), `budget_version_line_changes` (drop); API
  `budgetVersionRevise`, `budgetVersionLineWindow`, `budgetVersionLineChangeList` (gỡ), `budgetVersionCreate/Update/Get/List`
  (bỏ trường); extension point `BudgetChangeListeners` (xóa).
- Not larger: dự phòng 10 %, `reserveReason`, sàn cam kết chuyển tiếp → `qd96-100-annual-budget-reserve-and-floor`.
- Not smaller: hai khái niệm chung bảng/màn hình; tách thì migration `budget_versions` chạy hai lần.
- Siblings: `qd96-100-remove-finance-review-path`, `qd96-100-annual-budget-reserve-and-floor`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                         |
| -------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-06-09 | AC-31 | partial  | AC-30, AC-32: `qd96-100-annual-budget-reserve-and-floor`; còn lại: `g5-budget-proposal-and-review`, `g5-commitment-creation`, `g5-budget-version-decision` |

## Supporting references

- `QĐ-97b`: phiên bản đã duyệt không sửa trong năm; phòng chưa có phiên bản vẫn lập phiên bản đầu qua `MF-4`.
- `QĐ-82l(5)`: gắn dòng kế hoạch chỉ là thông tin — không dời khoảng mua. `QĐ-97c`: không ngưỡng giá trị cao.
- `US-06-12` AC-25 (chủ `qd96-100-remove-finance-review-path`): hạng mục này thêm ca _ngưỡng giá trị cao_, _phiên bản sửa đổi_.

## Explicit out of scope

- Vòng yêu cầu sửa/từ chối trước khi duyệt (`CHANGES_REQUESTED`, `rejectedPredecessorId`) — **giữ** (`QĐ-97b`).
- Đổi `reason` thành `reserveReason` → `qd96-100-annual-budget-reserve-and-floor`.
- Cột lịch sử bất biến `budget_version_decisions.previous_total_minor`, `request_budget_check_years.share_basis_points` — giữ cột,
  không ghi giá trị mới (null), bỏ khỏi wire.
- Seed: chỉ bỏ `highValuePercent` ở `src/cli/seed/fixture/demo-fixture.types.ts:76`, `steps/finance.steps.ts:141`,
  `fixture/shared-demo-v2/finance.ts` để biên dịch; dữ liệu v3 → `qd96-100-seed-demo-v3`.

## Dependencies and blockers

- Cần #6 (check không đọc `highValue*`) và #11 (không còn listener `PLAN_LINE_MOVED` ở `requests`).
- Migration thứ năm của Track B.

## Ownership: module, data, API

- Xóa: `budgets/version/version-revision.service.ts`, `version-window.service.ts`, `version-line-moved.service.ts`, các route
  `budget-versions.controller.ts:144-180`, `budget-version-lines.controller.ts:223-290`, `budgets/public/budgets.extension-points.ts`
  (không còn sự kiện nào) cùng mọi `listeners.emit` (`version-decision-judge.service.ts:60-63`, `version-decision-writer.service.ts:78`,
  `year-end/year-end.service.ts:85`), `BudgetVersionLineChange` repo.
- Sửa: `budgets/budget/budget.dto.ts:79-138,163,241-254,283,340` (bỏ `highValuePercent`, `highValueAmount`, `revisionBodySchema`,
  `basedOnVersionId`, `previousTotal`, `SUPERSEDED` khỏi enum đầu ra mới), `version-figures.service.ts`, `version.repo.ts`,
  `version-view.service.ts:122-162`, `version-history.policy.ts`, `budget-facts.repo.ts:43-44`, `public/budgets.types.ts`,
  `budget.policy.ts:91,250`, `decision.repo.ts`, `budget.errors.ts`/`http-errors` (`REVISION_REQUIRED`, `NO_CURRENT_BUDGET` nếu chỉ
  revision dùng), `line-import.service.ts` nếu đọc ngưỡng.

## Behavior and design

1. **Route gỡ** (404): `POST /budget-versions/revisions`, `PUT /budget-versions/{id}/lines/{position}/window`,
   `GET /budget-versions/{id}/lines/{position}/changes`. `budgetVersionCreate` chỉ còn tạo phiên bản đầu từ đề xuất (như nay).
2. **Trường gỡ:** body `budgetVersionCreate/Update` bỏ `highValuePercent`, `highValueAmount` (strict ⟹ 422 `VALIDATION`); response
   bỏ `highValuePercent`, `highValueAmount`, `basedOnVersionId`, `previousTotal`, `kind` chỉ còn `INITIAL` trên dòng mới.
3. **Migration** `<ts>_budgets_retire_revision_and_high_value` (timestamp lúc implement, sau migration #12):
   (a) phiên bản `kind = REVISION` ở `DRAFT`, `SENT`, `CHANGES_REQUESTED` → `EXPIRED`, `never_current = true`, `expired_at = now()`
   kèm `audit_events` `SYSTEM` `BUDGET_VERSION.REVISION_RETIRED` mỗi dòng (bước Người duyệt chi đang chờ của phiên bản `SENT` không
   còn đối tượng — Audit ghi `stepless`);
   (b) `DROP TABLE budget_version_line_changes`;
   (c) `ALTER TABLE budget_versions DROP COLUMN high_value_percent, DROP COLUMN high_value_amount_minor, DROP COLUMN
based_on_version_id` (FK tự tham chiếu gỡ trước). (C-REVIEW R-09) DROP `based_on_version_id` kéo theo
   `budget_versions_source_check` (`20261023180000_budgets_proposals_and_versions/migration.sql:224-226`) ⟹ cùng migration thêm
   `CHECK ("kind" <> 'INITIAL' OR "proposal_id" IS NOT NULL)` (dòng `REVISION` lịch sử vẫn hợp lệ). DROP `high_value_percent` kéo
   theo `budget_versions_threshold_check` (`:218`) — không cần thay.
   Giá trị `REVISION`, `SUPERSEDED`, `PLAN_LINE_MOVED` (trigger check) để lại, test chặn ghi mới. **DB-05:** drop cột/bảng không
   hoàn tác — ngoại lệ theo Q-02 B.
4. **Lịch sử phiên bản** (`budget_version_history`, bất biến): giữ; kiểu sự kiện dời dòng không còn được ghi.
5. Không áp dụng: khóa mới, job mới.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F22)

**Mức FE-tonight: A** cho mục 1, 2 và một migration _expand_ nhỏ: **M-A13** `<ts>_budgets_high_value_optional`:
`ALTER TABLE budget_versions ALTER COLUMN high_value_percent DROP NOT NULL` (CHECK `BETWEEN 0 AND 100` vẫn nhận `NULL`); code
mới ghi `NULL` cho cả hai cột ngưỡng và không đọc chúng (`budget-check-three-outcomes` phần A đã ngừng đọc). Xóa route và service
revision/window/line-changes; `BudgetChangeListeners` để nguyên tới phần B (không còn ai phát `PLAN_LINE_MOVED`). **B:** mục 3
(đóng phiên bản `REVISION` dở + drop bảng/cột + R-09), mục 4, gỡ extension point (sau `remove-finance-review-path`). Demo không
mất gì: Owner drop DB và seed lại (`QUESTIONS.md` mục D, Q-R1), nên không có `REVISION` dở.

| Operation (Finance)                                                                                                          | Hiện tại                                                                           | Sau sửa — người dùng nhập                                                                                                                               | Output / lỗi                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `budgetVersionRevise` `POST /budget-versions/revisions`                                                                      | lập phiên bản sửa đổi                                                              | **gỡ**                                                                                                                                                  | 404; OpenAPI không còn                                                        |
| `budgetVersionLineWindow` `PUT /budget-versions/{id}/lines/{position}/window`, `budgetVersionLineChangeList` `GET …/changes` | dời khoảng mua, lịch sử dời                                                        | **gỡ**                                                                                                                                                  | 404                                                                           |
| `budgetVersionCreate` `POST /budget-versions`                                                                                | `{proposalId, base, reserve, highValuePercent, highValueAmount?, quarters?}`       | `{proposalId, base, reserve?, reserveReason?, quarters?}` (`reserve`/`reserveReason`/tiền chỉ `{amount}` theo `annual-budget-reserve-and-floor` phần A) | `highValue*` ⟹ 422 `VALIDATION_ERROR`                                         |
| `budgetVersionUpdate` `PUT /budget-versions/{id}` (phiên bản **chưa duyệt**)                                                 | `{base?, reserve?, highValuePercent?, highValueAmount?, quarters?, reason?}`       | `{base?, reserve?, reserveReason?, quarters?}`                                                                                                          | `highValue*`, `reason` ⟹ 422; phiên bản đã hiện hành ⟹ lỗi trạng thái hiện có |
| `budgetVersionGet`/`List`                                                                                                    | `highValuePercent`, `highValueAmount`, `basedOnVersionId`, `previousTotal`, `kind` | —                                                                                                                                                       | bỏ 4 trường đầu; `kind` chỉ còn `INITIAL` trên dòng mới                       |
| `budgetVersionList` query (`versionListQuerySchema`, `budget.dto.ts:162-163`)                                                | `state` nhận `SUPERSEDED`                                                          | `state` bỏ `SUPERSEDED`                                                                                                                                 | `?state=SUPERSEDED` ⟹ 422 `VALIDATION_ERROR` (D5)                             |

Sửa phiên bản **chưa duyệt** (vòng `REQUEST_CHANGES`) vẫn hợp lệ; chỉ revision của ngân sách **hiện hành** bị gỡ (F22).

## Test matrix

| AC / rủi ro      | Tình huống                                          | Cấp test    | Kết quả mong đợi                               | Bằng chứng sau implement |
| ---------------- | --------------------------------------------------- | ----------- | ---------------------------------------------- | ------------------------ |
| `US-06-09` AC-31 | F1 gọi 3 route cũ trên `V1` đã duyệt                | http        | 404, không phiên bản mới                       | planned                  |
| AC-31            | F1 tạo phiên bản thứ hai cho năm đã có hiện hành    | http        | từ chối như hiện nay (`BUDGET.CURRENT_EXISTS`) | planned                  |
| AC-31            | phòng chưa có phiên bản lập giữa năm                | integration | tạo được phiên bản đầu                         | planned                  |
| L-124            | body có `highValuePercent`                          | http        | 422 `VALIDATION`                               | planned                  |
| Migration        | có `REVISION` `SENT` + dòng `line_changes`          | integration | `EXPIRED`, Audit, bảng/cột bị drop             | planned                  |
| Ghi mới          | mọi đường ghi                                       | integration | không ghi `REVISION`/`SUPERSEDED`              | planned                  |
| `US-06-12` AC-25 | quét OpenAPI                                        | gates       | không `highValue*`, `revision`                 | planned                  |
| R-09 (DB)        | sau migration, INSERT `INITIAL` không `proposal_id` | integration | CHECK từ chối; dòng `REVISION` cũ vẫn đọc được | planned                  |
| M-A13            | tạo phiên bản không ngưỡng                          | integration | `high_value_percent` NULL, CHECK nhận          | planned                  |

## Definition of Done

- [ ] Grep `src/modules/budgets` sạch `highValue`, `revision`, `window` (route), `BudgetChangeListeners`.
- [ ] Quick gates + test theo file xanh; OpenAPI, `docs/generated/routes.md` sinh lại; FE được báo (CP-2).
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F22): mức FE-tonight **A** (gỡ 3 route, gỡ trường ngưỡng, migration expand
`DROP NOT NULL`) / **B** (migration dọn + extension point); sửa C-REVIEW R-09 (CHECK `INITIAL ⟹ proposal_id`). Vẫn `draft`.
05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D5 — bỏ `SUPERSEDED` cả ở enum **query** của `budgetVersionList`. Phần A thuộc **Đợt 1**
(Owner); cầu nối tới #6 ghi ở plan (ngưỡng `NULL` ⟹ không phát `HIGH_VALUE`). Vẫn `draft`.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Route dời khoảng mua ở đây là tiền đề của hạng mục đó (Task 1). Không viết lại phần khác.
