# AUDIT-MERGE1 — lỗi ngầm sau merge lane A (f55af71b) vào lane B (529beb0f) = b5d041c6

Ngày 15/11/2026. Reviewer chỉ đọc (git trên `BE-dev-software-license-management`, file thường ở `be-verify` = b5d041c6). Không chạy pnpm/jest/docker.
Merge-base fa87ca41. Mọi số dòng dưới đây là ở b5d041c6.

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (khung review 5 trục, nhãn Critical/Required/Optional/Nit),
`superpowers:verification-before-completion` (mọi kết luận kèm bằng chứng file:dòng, không tuyên bố "xanh" khi chưa chạy).

## Tóm tắt

| Mã | Mức | Lane gây ra | Một dòng |
| --- | --- | --- | --- |
| MG-01 | **Required** | B (ảnh hưởng cả suite lane A) | Harness mở kỳ ngân sách năm hiện tại với hạn nộp 01/12 ⟹ từ 02/12/2026 mọi `budgetFor` năm hiện tại bị 409 `BUDGET_CYCLE.LOCKED`; 8 suite PI-1/PI-2 của lane A + serial runtime-role đỏ theo |
| MG-02 | **Required** | A (chỗ nối), B (mở điểm) | `CarriedOverContributions` không ai bind trên b5d041c6 ⟹ `carriedOverNextYear` = 0, cơ sở điền sẵn = 0, `belowCarriedOver` không bao giờ bật |
| MG-03 | Optional (cần Owner quyết) | A ↔ B | Hóa đơn mua gắn **thuê bao** (`booking SUBSCRIPTION`) không vào `spent` của Cost Center nào và không có chỗ đọc "đã chi" của Dự phòng kho (lane B) |
| MG-04 | Optional | B (việc hoãn tới merge) | `COST_STATEMENT` vẫn nhận mới (D-B6 / LB3-07 hẹn làm sau khi PI-1 vào) |
| MG-05 | Optional | A (khi bind MG-02) | Nguồn giả `'test'` ở `budget-baseline-version` sẽ cộng dồn với nguồn thật `requests` |
| MG-06 | Optional | — | Thứ tự timestamp migration A (`20261113004400`, `004500`) < B (`2026111310xxxx`): an toàn vì không bảng chung; lưu ý DB nào đã chạy riêng lane B |
| MG-07 | Nit | B | `version.repo.ts:483` doc comment mồ côi |
| MG-08 | Nit | B | `budgets/README.md` còn mô tả publish/chia Trần/dòng |

Không có Critical. 20 file hai lane cùng sửa: hợp nhất **giữ đủ ý cả hai** (chi tiết ở "Đã kiểm, không lỗi").

---

## MG-01 — Required — kỳ ngân sách của harness khóa từ 02/12 ⟹ suite của cả hai lane đỏ theo lịch

- **Lane gây ra:** B (BG-1.1/BG-2.2). Tác động qua merge: các suite mới của lane A đứng trên harness của lane B.
- **Bằng chứng (b5d041c6):**
  - `test/support/budget-harness.ts:86` mở kỳ cho `year..year+3`; `:90-98` `openedCycle` ghi `submission_deadline = make_date($1, 12, 1)`, `decision_deadline = make_date($1, 12, 15)`.
  - `test/support/budget-harness.ts:76` `year = Number(this.today().slice(0, 4))` (ngày thật của tổ chức).
  - `test/support/spend-harness.ts:163-171` `budgetFor` mặc định `year = this.year` ⟹ `approvedBudget` ⟹ `ProposalService.submit`.
  - `src/modules/budgets/proposal/proposal-sender.service.ts:52-58, 71` `requireOpenCycle` ⟹ `proposalWorkRefusal`.
  - `src/modules/budgets/cycle/cycle.policy.ts:26` `today > submissionDeadline ? 'LOCKED'`; `:34-42` trả `LOCKED` ⟹ `BudgetCycleLockedError` (409).
  - Trước lane B (fa87ca41) điều kiện là `firstPublishedAt !== null` (`cycle.policy.ts:83` ở fa87ca41) — không xét hạn nộp, nên harness cũ chạy được cả tháng 12.
- **Kịch bản:** CI hoặc máy dev chạy integration bất kỳ ngày 02/12–31/12/2026 (và tháng 12 mọi năm) ⟹ `budgetFor(unit, { total })` (năm hiện tại) ném 409 trong `beforeAll`/`it` ⟹ đỏ.
  Suite lane A bị kéo theo: `test/integration/budgets/budget-invoices.integration-spec.ts:78`, `budget-purchase-invoice.integration-spec.ts:34`,
  `k1-early-end-commitment-release.integration-spec.ts:42`, `requests/purchase-invoice.integration-spec.ts:72`,
  `purchase-invoice-decision.integration-spec.ts:60`, `purchase-invoice-missing-periods.integration-spec.ts:87`,
  `_serial/database-runtime-role-invoice-write.integration-spec.ts:50`, `dashboards/dashboards-http.integration-spec.ts` (1 lần gọi),
  cộng mọi suite qua `GroupHarness` (`test/support/group-harness.ts:209`: `shared-pool-next-period`, `group-request-invoiced-release`…) và
  phần lớn suite ngân sách/spend sẵn có của lane B. Hôm nay (15/11) chưa đỏ — đây là bom hẹn giờ 17 ngày.
- **Sửa (giao lane B):** trong `openedCycle` đặt hạn của năm hiện tại sau mọi ngày suite có thể chạy: `submission_deadline = make_date($1, 12, 31)`,
  `decision_deadline = make_date($1, 12, 31)` (CHECK `budget_cycles_deadlines_check` chỉ đòi `decision >= submission`). Rà các suite của lane B
  cố ý kiểm khóa sau hạn (`budget-cycle-lifecycle`, `budget-cycle-deadline`, `budget-baseline-version` dùng `setDeadline`) — chúng tự đặt hạn
  nên không phụ thuộc giá trị mặc định. Không đổi code sản phẩm.
- **Test/mutation nên thêm:** một ca integration trong suite harness: `pretendBusinessToday(app, \`${h.year}-12-20\`)` rồi `h.budgetFor(unit, { total })`
  phải xanh; mutation trả hạn về `12, 1` ⟹ ca này đỏ.

## MG-02 — Required — `CarriedOverContributions` chưa có nguồn: số chạy sang luôn 0

- **Lane:** B mở điểm mở rộng (BG-2.1), phía `requests` (chủ hàm 01/01 XY-1) chưa bind — lane B ghi rõ là "chờ lane A"
  (`docs/reviews/fe-feedback-2026-11-11/OVERNIGHT-DECISIONS-LANE-B.md:114`). Trên b5d041c6 cả hai đã có mặt nhưng chưa nối.
- **Bằng chứng:**
  - Điểm mở: `src/modules/budgets/public/budgets.extension-points.ts:51-80` (`CarriedOverContribution`, `CarriedOverContributions.totals`),
    đăng ký + export `src/modules/budgets/budgets.module.ts:169, 186`.
  - Người đọc (đều gọi đúng năm đích): `src/modules/budgets/version/version-figures.service.ts:24-25` (cơ sở điền sẵn),
    `src/modules/budgets/cycle/baseline-flags.service.ts:32` (số liệu nền theo năm kỳ), `src/modules/budgets/budget/version-view.service.ts:111-115`
    (gom theo `version.year`). Không có lời gọi sai năm/sai Cost Center.
  - Không có `.add(` nào ngoài test: grep `CarriedOverContributions` trong `src` chỉ ra 3 người đọc + module; duy nhất
    `test/integration/budgets/budget-baseline-version.integration-spec.ts:76` thêm nguồn giả `'test'`.
  - Hàm 01/01 chưa đổi ở cả hai lane (`git log fa87ca41..b5d041c6 -- src/modules/requests/year-start-commitments` rỗng); luật số tiền ở
    `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts:119` (`yearStartAmountOf`), `:181` (`bearingDepartmentOf`),
    `:198` (`judgeYearStart`).
- **Kịch bản:** Finance mở `GET /budget-cycles/{year}/baseline` hoặc tạo phiên bản không nhập `base`: `carriedOverNextYear = 0`, cơ sở điền sẵn 0,
  `belowCarriedOver` luôn `false` dù phòng có 10 quyền Dùng lâu dài (T-BG2 kỳ vọng 123.000.000 đ). Không lỗi 500, chỉ sai nghĩa im lặng —
  đúng loại Owner lo.
- **Sửa (giao lane A):** thêm `src/modules/requests/year-start-commitments/carried-over.listener.ts` với `static readonly binds = [CarriedOverContributions]`,
  `onModuleInit` gọi `contributions.add('requests', { carriedOverOf })`; `carriedOverOf(costCenterIds, year, tx)` là **dry-run đọc-không-khóa**
  của đúng luật 01/01: tách phần tính số tiền theo request (giá đã lưu cho năm sau của quyền có thời hạn; 12 × giá tháng VND hiện hành của
  quyền Dùng lâu dài; bỏ request đã giữ cam kết năm đó) thành hàm thuần dùng chung với `YearStartCommitmentsBatchService`, gom theo
  `bearingDepartmentOf` → Cost Center. Khai `'BudgetsModule: CarriedOverContributions'` trong `PUBLIC_CONTRACT_EXPORTS`
  (`test/gates/module-graph.gate-spec.ts:72-77`) khi `requests` tiêm nó. Lưu ý LBG-01 của AUDIT-LB-BG (so cơ sở hay cơ sở + dự phòng) vẫn để Owner chốt.
- **Test/mutation nên thêm:** integration T-BG2 với nguồn thật (10 quyền lâu dài × 1.000.000 × 12 + 3.000.000 đã lưu ⟹ 123.000.000);
  ca đối chiếu "dry-run trước 01/01 = tổng cam kết pass 01/01 tạo ra" cho cùng dữ liệu; mutation xóa `add('requests', …)` ⟹ đỏ;
  mutation đổi 12 → 11 tháng ⟹ đỏ ở cả hai ca.

## MG-03 — Optional (cần Owner quyết) — hóa đơn thuê bao không vào "đã chi" của ai

- **Lane:** A (D-74 tạm chốt) gặp mô hình B (Dự phòng kho ở mức kỳ, ngân sách phòng = cơ sở + dự phòng).
- **Bằng chứng:** `src/modules/budgets/budget/invoice.policy.ts:112` `subscriptionId !== null ⟹ { kind: 'SUBSCRIPTION' }` (bỏ qua `chargedCostCenterId`);
  `src/modules/budgets/invoice/purchase-invoice-recorder.service.ts:45-58, 77` ghi `subscription_id`, `cost_center_id = NULL`;
  `src/modules/budgets/budget/invoice.repo.ts:178-192` `spentOf` chỉ gom theo `COALESCE(i.cost_center_id, c.cost_center_id)` ⟹ dòng thuê bao rơi khỏi mọi cặp.
- **Kịch bản:** IT nộp hóa đơn Gia hạn của thuê bao do phòng sở hữu (PI-2 có "thuê bao có phòng sở hữu") hoặc của kho `K2`/`K4`; Finance ký.
  Bảng/summary ngân sách, `yearFacts.spentMinor` (kiểm FR-3.20 khi trình lô, snapshot Người duyệt chi), `spentThisYear` của số liệu nền đều
  không thấy khoản này; Dự phòng kho dùng chung (lane B) không có số "đã dùng". Chỉ `lastInvoiceRecordedAt` thấy.
- **Sửa:** Owner chọn (A) thuê bao có phòng sở hữu ⟹ ghi thêm `cost_center_id` = Cost Center phòng sở hữu ở tháng kỳ (lane A, `bookPurchaseInvoice`
  trả `SUBSCRIPTION` kèm `costCenterId`), thuê bao kho ⟹ đọc "đã chi kho" theo `subscription_id` ở báo cáo kỳ (lane B); hoặc (B) giữ nguyên và ghi
  rõ trong SPEC rằng chi thuê bao nằm ngoài ngân sách phòng.
- **Test nên thêm:** integration ký một hóa đơn Gia hạn của thuê bao phòng sở hữu ⟹ kiểm `yearFacts(cc).spentMinor` theo phương án đã chọn.

## MG-04 — Optional — `COST_STATEMENT` vẫn nhận mới sau khi PI-1 đã vào

- **Lane:** B hoãn có chủ đích tới merge (D-B6, LB3-07: `OVERNIGHT-DECISIONS-LANE-B.md:49-50`), POL-SAAS quy định 14 nói "Không nhập sao kê"
  (`src/modules/policies/initial/pol-saas.types.ts:24`).
- **Bằng chứng:** `src/modules/catalog/contract/contract.dto.ts:95`, `src/modules/catalog/contract/contract.policy.ts:20, 35`.
- **Sửa (chat điều phối hoặc lane B):** bỏ `COST_STATEMENT` khỏi danh sách nhận mới ở DTO/policy (+ spec), giữ giá trị DB để đọc tệp cũ.
- **Test:** HTTP upload purpose `COST_STATEMENT` ⟹ 422; đọc tệp cũ vẫn 200.

## MG-05 — Optional — nguồn giả `'test'` sẽ cộng với nguồn thật

- `test/integration/budgets/budget-baseline-version.integration-spec.ts:76` `add('test', …)`; `CarriedOverContributions.totals` cộng mọi nguồn
  (`budgets.extension-points.ts:70-79`). Sau MG-02, nếu Cost Center của suite có request thật thì 123.000.000 kỳ vọng sẽ lệch.
- **Sửa (lane A, khi bind):** suite dùng phòng không có request nào, hoặc thay nguồn bằng spy `jest.spyOn(contributions, 'totals')`.

## MG-06 — Optional — thứ tự migration

- A: `20261113004400_us2_ghost_seat_escalations`, `20261113004500_pi1_purchase_invoices` (bảng mới + `invoices`, `document_attachments`).
  B: `20261113100000…100700` (`policies*`, `app_users`, `avatar_purges`, `budget_cycles`, enum `BudgetVersionOrigin`, `budget_versions_source_check`,
  `budget_proposals.note`). **Không bảng/enum/CHECK nào bị cả hai sửa**; không migration B nào giả định trạng thái `invoices`/`budget_commitments`.
  Trên DB đang ở fa87ca41, `migrate deploy` chạy A rồi B đúng thứ tự.
- Rủi ro duy nhất: môi trường nào đã deploy riêng nhánh lane B (có 1000xx mà chưa có 0044xx/0045xx) — `migrate deploy` vẫn áp hai migration A
  (độc lập), nhưng nên chạy `ops:preflight`/`migrate status` để chắc báo cáo lịch sử không coi là lệch.
- `100500` (`ALTER TYPE … ADD VALUE`) tách khỏi `100600` (CHECK dùng giá trị mới) — đúng.

## MG-07 — Nit — `src/modules/budgets/budget/version.repo.ts:483`

Doc comment "The newest version of the Cost Center and year…" đứng trước một doc comment khác của `countAttachedFiles` (`:484`); hàm nó mô tả nằm
ở dưới. Lane B: dời comment về đúng hàm.

## MG-08 — Nit — `src/modules/budgets/README.md`

`:18` (`planLine`, `currentLine`, `currentLines`), `:82` (publish, `budgetDepartmentCeilingsSet`, `CYCLE_NOT_PUBLISHED`, `requirePublishedCycle`),
`:86-90` (`renewalLinesOf`, `publishedCeiling`, `proposal.lines[]`) mô tả thứ lane B đã bỏ. Lane B cập nhật module card.

---

## Đã kiểm, không lỗi

**20 file hai lane cùng sửa** (so `diff fa87ca41..A`, `diff fa87ca41..B`, `diff B..merge`):

- `prisma/models/budgets.prisma`: merge − B đúng bằng diff của A (`Invoice.commitmentId?`, 5 cột mới, 2 `@@index`); B giữ enum origin mới, `note`,
  `openedAt?`. Không trùng/không mất.
- `src/infrastructure/database/database-role-judgement.ts:28-41`: có cả `purchase_invoice_documents` (A) và `policy_acknowledgements` (B) ở
  `['INSERT','SELECT']`; cùng danh sách dùng cho provisioning (`roles/database-role-provisioning.ts`). Bảng mới khác (`purchase_invoices` có trigger
  chặn DELETE/sửa sau quyết; `ghost_seat_escalations`, `avatar_purges`, `policies`, `policy_versions`) giữ DML đầy đủ — đúng vì có UPDATE hợp lệ
  (`purchase_invoices` SUBMITTED→CONFIRMED/RETURNED, `avatar_purges.purged_at`, nháp chính sách).
- `budget-facts.service.ts`: A bỏ `moneyIn`, B bỏ `requirePlans/planNames` — cả hai được giữ; không ai còn gọi (typecheck xanh).
- `budget.errors.ts`, `budget.http-errors.ts`: merge − B đúng bằng phần A bỏ 3 lỗi `INVOICE.*` + 3 ví dụ; lỗi mới của B còn nguyên.
- `budgets.module.ts:30-35, 169-189`: đủ `PurchaseInvoiceFactsHook`, `PurchaseInvoiceRecorderService` (A) và `CarriedOverContributions`,
  `BaselineFlags`, `BudgetProposalTemplateListener`, `PoliciesTemplateFacadeModule` (B); không provider trùng.
- `budgets.extension-points.ts`: cả `CarriedOverContributions` (B) và `PurchaseInvoiceFactsHook` (A).
- `licensing.module.ts`: `AssignmentCarryRepo` (A) + `LicenseKeyTemplateListener`, `PoliciesTemplateFacadeModule` (B).
- `notifications.types.ts` / `inbox.policy.ts`: `PURCHASE_INVOICE_SUBMITTED|CONFIRMED|RETURNED` (A), `BUDGET_CYCLE_DEADLINE_MOVED`, `POLICY_PUBLISHED`,
  `BUDGET_CYCLE_OPENED` + `templateKind` (B) — mỗi mã một lần, đủ khóa tham số (spec `inbox.policy.spec.ts:313` so hai danh sách); mỗi mã có đúng
  một nơi gửi (`purchase-invoice-confirmation.service.ts`, `budget-notifier.service.ts`, `library-publish.service.ts`); không có enum DB cho mã.
- `architecture-boundaries.gate-spec.ts`, `module-graph.gate-spec.ts`, registry/manifest/route-codes: merge − B đúng bằng diff A; số thao tác
  388 + 9 (A) + 10 (B) = 407 khớp `openapi-presentation.http-spec.ts:277` và `openapi.json` (đếm 407).
- `budgets/README.md`, `licensing/README.md`: phần hóa đơn là của A (Finance chỉ đọc, ghi qua ký), phần BM-10/phiên bản là của B.

**Tương tác ngữ nghĩa:**

- (a) Kiểm ngân sách khi trình lô và snapshot Người duyệt chi: `requests/spend/budget-check.service.ts:252-260` và
  `spend-approval-view/*` đọc `BudgetsApi.yearFacts` / `BudgetsReadApi` ⟹ `budget-facts.repo.ts:23-75`: chỉ `totalMinor/baseMinor/reserveMinor`
  và `held/spent`; không đọc quý/dòng/trần phòng; `REFERENCE_VERSION` (`version.repo.ts:116-118`) không lọc `origin` nên phiên bản
  `BASELINE_NO_PROPOSAL` được đọc như ngân sách. Lane B không xóa cột (migration chỉ expand), Prisma không còn map quý vào record.
  `spent` = `spentOf` LEFT JOIN của A (`invoice.repo.ts:178-192`): hóa đơn theo commitment vào (CC, năm commitment hoặc năm `service_month`),
  hóa đơn không cam kết vào (CC phòng chịu, năm kỳ) — khớp đơn vị (Cost Center, năm) của phiên bản lane B. Ngoại lệ: MG-03.
- (b) `CarriedOverContributions`: ba người đọc gọi đúng năm đích, không ai gọi sai; chỗ cần nối ở MG-02.
- (c) `IdentityAccessApi.markEmployeeLeft` (`identity-access.api.ts:99-112`) chỉ được gọi ở `personnel/offboarding/offboarding-left.service.ts:62`;
  lane A không thêm luồng nghỉ việc/điều chuyển nào, không sửa `GET /me` (`me.*` chỉ lane B sửa). `ProfileRepo` có trong facade module.
- (d) Thông báo: xem trên.
- (e) Grants: xem trên.
- (f) Installation: chỉ lane B (8 chính sách; `http-test-app.ts` seed giống lệnh cài). Route đã xóa: không có code `src`, `scripts`, `test/e2e`,
  `test/flows`, `test/integration` nào gọi `POST /budget-commitments/{id}/invoices` (chỉ `budget-invoices.http-spec.ts:64` ghim 404) hay route
  dòng/import/ceilings/publish của B (`budget-bm10-routes.http-spec.ts` ghim 404). Seed còn gọi `PUT /budget-cycles/{year}/department-ceilings`
  (`src/cli/seed/steps/finance.steps.ts:119`) và gửi đề nghị theo dòng (`finance-kit.ts:12`) — thuộc Z2 đã biết, không do merge.
- (g) Migration: MG-06. Drift 4 index `purchase_invoices` (A) đã biết.
- Khóa: người ký hóa đơn (A) khóa commitment rồi năm, không chạm `budget_cycles`; gửi phiên bản (B) khóa kỳ → … → năm; cửa sổ tạo phòng đọc kỳ
  `FOR SHARE`. Không có vòng khóa mới giữa hai lane.
- Fixture tạo phòng (`test/support/builders/organization.builder.ts:42-63`) bỏ qua cửa sổ R-16 mới của B (`department-creation-window.listener.ts`),
  nên suite lane A tạo phòng sau khi gửi phiên bản năm sau vẫn chạy.
- Harness lane B (`budget-files.ts`, `budget.builder.ts`) chỉ ghi `budget_attachments`, không đụng `document_attachments` mà A đổi CHECK.

## Dự đoán test đỏ do tương tác hai lane

- **Hôm nay (15/11):** không thấy ca đỏ chắc chắn do tương tác. Log chạy dở của điều phối (`verify-logs/merge1/int-full.log`, 20:24) có 5 suite đỏ,
  đều **một lane**: `budget-attachment-access` (B, BG-2.7: `REJECT`/`REQUEST_CHANGES` ⟹ 422, test chưa đổi), `finance-invoices-upgrade` +
  `unit-only-upgrade-history` (A, drift tên index `purchase_invoices`), `organization.integration` (khóa `contractEndDate`), `ai-assist/queue-summary-approver`
  (`requestedDurationLabel`, phụ thuộc ngày, không chạm hai lane). Các suite lane A trên harness lane B (`budget-invoices`, `k1-early-end…`,
  `purchase-invoice-missing-periods`, `purchase-invoice-constraints`, `devices-registrations`, `subscription-payment-schedules`) đã PASS trong log đó.
- **Từ 02/12/2026:** MG-01 làm đỏ mọi suite gọi `budgetFor`/`approvedBudget` cho năm hiện tại — lane A: 8 file liệt kê ở MG-01 + suite qua
  `GroupHarness`; serial: `_serial/database-runtime-role-invoice-write`; cùng phần lớn suite ngân sách/spend của lane B và sẵn có.
- **Sau khi nối MG-02:** có thể lệch `budget-baseline-version` (MG-05) và các ca kiểm `carriedOverNextYear = 0`/cơ sở điền sẵn 0 nếu có.
- e2e/flows: không file nào gọi route bị bên kia xóa; flows phụ thuộc seed Z2 (đã biết đỏ).
