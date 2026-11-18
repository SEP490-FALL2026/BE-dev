# PLAN — mở rộng seed demo `shared-demo-v4` (cho một chat Sonnet)

> **For agentic workers:** làm tuần tự từng task, mỗi task một commit. Bước dùng checkbox (`- [ ]`). Spec: [SPEC.md](SPEC.md) — khi plan
> và spec lệch nhau, **spec thắng**; ghi lệch thành `D-n` trong báo cáo.

**Goal:** dataset `shared-demo-v4` có đủ dữ liệu cho mọi màn của FE (SPEC §1), ghi qua API đúng vai, idempotent, seed DB trống exit 0,
`test:flows` không đỏ thêm.

**Architecture:** chỉ chạm `src/cli/seed/**` (fixture + step + test), `src/cli/seed/fixture/shared-demo-v4/README.md`, `docs/guides/seed.md`;
tài liệu FE ở repo Docs. Dữ liệu mới nằm trong tệp fixture mới (`catalog-extra.ts`, `requests-extra.ts`, `usage-extra.ts`, `devices.ts`,
`renewals.ts`), nối vào `SHARED_DEMO_V4` ở `fixture/shared-demo-v4/index.ts`. Bước mới là `DemoStep` thêm vào `demoSteps()`.

**Tech stack:** NestJS CLI `seed`, TypeScript, Jest; `DemoApiClient` gọi `/api/v1` như FE.

---

## 0. Luật chung (đọc trước task đầu, giữ suốt suite)

1. **Skill Preflight** (`D:\FPT\FALL2026\CLAUDE.md`): mỗi lượt kiểm inventory skill, đọc đủ `SKILL.md` của: một process skill
   (`superpowers:executing-plans` hoặc `agent-skills:incremental-implementation`), `superpowers:test-driven-development`, và
   `superpowers:verification-before-completion`; khi lỗi thêm `superpowers:systematic-debugging`. Đầu báo cáo liệt kê skill đã dùng và mục
   đích. Rule này áp cho mọi lượt của suite, kể cả sau compact context.
2. Trả lời tiếng Việt; giữ tiếng Anh cho code, đường dẫn, lệnh, mã.
3. Đọc `AGENTS.md`, `docs/rules/module-structure.md`, `docs/rules/operational-commands.md`, `src/cli/seed/fixture/shared-demo-v4/README.md`,
   `docs/guides/seed.md` trước T1.
4. Nhánh **`feat/seed-v4-expand`** tạo từ `feat/p5` (Review 2: nhánh này còn đi tiếp, lúc review tới `0f086c61`; seed và flows giống
   `d3757876`) của repo BE đồ án
   `D:\FPT\FALL2026\Code\BE-dev-software-license-management`. Danh tính git "Chill"; không dòng đồng tác giả AI; không `--no-verify`.
   Commit message tiếng Anh `feat(seed): … (Tn)` / `test(seed): …` / `docs(seed): …`. **Không** commit thư mục
   `docs/reviews/seed-expansion-2026-11-17/`.
5. **Kiểm nhanh mỗi task** (không chạy suite đầy đủ ở local):

   ```bash
   pnpm typecheck && pnpm lint && pnpm exec jest src/cli/seed
   ```

   `lint` có `max-lines` 500, `max-lines-per-function` 60, `complexity` 12 cho `src/**` (không áp `*.spec.ts`); không thêm vào
   `eslint-suppressions.json`. Tệp gần 500 dòng thì tách theo use case như task ghi.
6. **Checkpoint cuối mỗi đợt** (CP1…CP5), cần `.env.seed.local` và DB local riêng; API/worker phải tắt:

   ```bash
   pnpm build
   pnpm seed:local -- --confirm-reset <tên-db-local>   # mong đợi: exit 0, không bước conflict/blocked/failed
   pnpm seed:local -- --continue                        # cùng ngày: exit 2 (mọi bước present)
   TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:<port>/postgres pnpm test:flows
   ```

   Review 1: lượt `--continue` cùng ngày phải ra exit 2 ở **mọi** checkpoint. C-1 (tài khoản khóa), C-2 (R57), C-10 (hóa đơn nộp lại),
   C-13 (hoàn trả) đều chỉ lộ ở lượt này. Có thể mô phỏng `D0+1` bằng cách chạy `--continue` trên một bản sao DB vào hôm sau. Kỳ vọng exit 0;
   chỉ được ghi thêm DEMO-14, usage AI và chốt tháng nếu đã sang tháng mới.
   Review 2: lượt `D0+1` **bắt buộc** ở CP2 (sau T16b) và CP5, vì N-1 (DEV4 điều chuyển, OFF1/DEV7 nghỉ) chỉ lộ ở đây. Nếu không chờ được
   tới hôm sau thì ghi `D-n` và chạy ở ngày kế tiếp trước khi báo xong.
   Mong đợi flows: không test nào đỏ thêm so với `feat/p5` (mốc: 70 pass / 9 skip / 0 fail, `MORNING-REPORT.md`). Lưu log vào
   `D:\FPT\FALL2026\Code\verify-logs\seed-v4-expand\CPn-*.log`. Sau mỗi checkpoint, chạy script đếm (§ "Script đếm" cuối file) và so
   với SPEC §6 phần đã làm.
7. **Suite đầy đủ chạy trên GitHub CI:** sau CP5 (và sau mỗi lần sửa CI đỏ) `git push -u origin feat/seed-v4-expand` rồi
   `gh workflow run ci.yml --ref feat/seed-v4-expand`; đỏ thì sửa tới khi xanh trên commit cuối.
8. **Phân loại lỗi:** test cũ đỏ vì dữ liệu mới của chính task ⟹ sửa trong task (chỉ test của seed và fixture; test flows đỏ ⟹ dừng, đổi
   dữ liệu cho khỏi chạm bất biến SPEC §4.2, không sửa test flows trừ khi spec cho phép). Lỗi không liên quan ⟹ "Nợ test". Nghi lỗi sản
   phẩm ⟹ "Nghi lỗi logic", không sửa code sản phẩm.
9. **Quyết định mở:** API từ chối một giả định của spec ⟹ ghi `D-n` (phương án, khuyến nghị, căn cứ), chọn phương án an toàn không trái QĐ,
   làm tiếp. Chỉ dừng khi bị chặn thật.
10. **Không** chạy seed vào DB demo chung/VPS; không deploy; không push/merge `dev`/`main`.
11. **Review 1:** đọc [REVIEW-SPEC.md](REVIEW-SPEC.md) trước T1. Không tự đổi kịch bản README ngoài các chỗ spec cho phép.
12. **Review 2:** đọc [REVIEW-SPEC-2.md](REVIEW-SPEC-2.md). Q-A…Q-E **đã chốt** (SPEC §2): ghế Adobe/Zoom ở BOD; ngân sách theo S24;
    `pdf-lib` + Noto Sans; BM-10 và tệp Finance đều có cơ sở + dự phòng; FR-5.10 là nợ prompt 4b. Không còn "chờ Owner" trong plan.

## 1. Bản đồ tệp

| Tệp | Trách nhiệm | Task |
| --- | --- | --- |
| `src/cli/seed/fixture/demo-fixture.types.ts` | thêm kiểu (`DemoPerson.department: string \| null`, `DemoSubscription.noticeDeadlineInDays/withoutDates/autoRenew`, `DemoPlanTerms`, `DemoRequestScenario.rejectAt/returnAt/rejectedLines`, target mới, `taxProfiles`, `saasIssues`, `notices`, `employeeImports`, `accountStates`, `devices`, `renewals`, `aiSummaries`, `retiredApplications`) | T1… |
| `fixture/shared-demo-v4/organization.ts` | +17 người | T1 |
| `fixture/shared-demo-v4/catalog-extra.ts` (mới) | 12 ứng dụng, 18 gói, 16 thuê bao, ghế nền mới, điều khoản, khóa | T4, T6, T7, T8 |
| `fixture/shared-demo-v4/requests-extra.ts` (mới) | R40–R57, hoàn trả, báo lỗi, BM-09 | T12–T16 |
| `fixture/shared-demo-v4/usage-extra.ts` (mới) | 3 nguồn usage | T17 |
| `fixture/shared-demo-v4/renewals.ts` (mới) | 2 lượt SBF-20, 3 lần gọi AI | T18, T23 |
| `fixture/shared-demo-v4/devices.ts` (mới) | thông báo giám sát, 7 máy, allowlist, collector, yêu cầu dừng | T20–T22 |
| `steps/organization.steps.ts` | người chưa xếp phòng | T1 |
| `steps/people-admin.steps.ts` (mới) | `org.employee-imports`, `org.account-states` | T2, T3 |
| `steps/catalog.steps.ts` | neo ngày, chọn kỳ đang chạy | T5, T18 |
| `steps/catalog-extra.steps.ts` (mới) | `catalog.plan-terms`, `catalog.retirement` | T7, T25 |
| `steps/scenario-path.ts`, `steps/request-actions.ts` (mới), `steps/request.steps.ts` | target/hành động mới | T10, T11 |
| `steps/returns.steps.ts` (mới) | `requests.returns` | T13 |
| `steps/saas-issues.steps.ts` (mới), `steps/extras.steps.ts` | báo lỗi SaaS | T14 |
| `steps/notices.steps.ts` (mới) | BM-09, nghỉ đột ngột | T15, T16 |
| `steps/renewals.steps.ts` (mới) | SBF-20 | T18 |
| `demo-api-client.ts`, `steps/file-kit.ts` | `callAsDevice`, `callPublic`, purpose `SIGNATURE_RECORD` | T19 |
| `steps/devices.steps.ts`, `steps/collector.steps.ts` (mới) | S16–S18 | T20–T22 |
| `steps/ai.steps.ts` (mới) | S19 | T23 |
| `steps/demo-documents.steps.ts` (mới), `steps/demo.steps.ts` | hợp đồng, hóa đơn | T24 |
| `steps/file-builders.ts` (mới, Review 1) | tệp XLSX/PDF/CSV thật theo mẫu (S23) | T1b |
| `steps/budget-targets.ts` (mới, Review 1) | ngân sách và đèn đích (S24) | T9b (Review 2) |
| `src/cli/seed/assets/fonts/**`, `nest-cli.json`, `package.json`, `pnpm-lock.yaml` (Review 2, Q-D) | font Noto Sans + giấy phép, chép font vào `dist`, `pdf-lib` | T1b |
| `seed-steps.ts` | thứ tự bước | mọi task thêm bước |
| `fixture/shared-demo-v4.spec.ts`, `seed-steps.spec.ts`, `steps/*.spec.ts` | test | mọi task |

---

## Đợt 1 — tổ chức và danh mục (S01–S09)

### T0 — chuẩn bị (không commit)

- [ ] Review 2: `git status` trước. Tệp `src/`/`test/` nào đang sửa dở (không thuộc suite này) thì **không** stage, không commit; hỏi
  điều phối nếu cần cây sạch. `feat/p5` có người commit song song (F1–F5 trong lúc review).
- [ ] `git -C D:/FPT/FALL2026/Code/BE-dev-software-license-management switch -c feat/seed-v4-expand feat/p5`; ghi `git log -1` vào báo
  cáo (Review 2: `0f086c61` hoặc mới hơn). Kiểm `git diff d3757876 HEAD --stat -- src/cli/seed test/flows test/support/flows` rỗng;
  khác rỗng thì đọc diff trước T1.
- [ ] `pnpm install --frozen-lockfile && pnpm prisma:generate`; chạy kiểm nhanh (§0.5) để có mốc xanh.
- [ ] Ghi mốc: `pnpm exec jest src/cli/seed` số test pass.

### T1 — S01 người mới + nhân viên chưa xếp phòng · M

**Files:** `demo-fixture.types.ts`, `fixture/shared-demo-v4/organization.ts`, `steps/organization.steps.ts`,
`steps/organization.steps.spec.ts`, `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ: `employeeBodyOf` của người `department: null` không có `departmentCode`; fixture có đúng 1 người chưa xếp phòng, 17 người mới
  đúng bảng SPEC S01, mã và email duy nhất.

  ```ts
  it('sends no department for a person the fixture leaves unplaced (QĐ-93g)', () => {
    const body = employeeBodyOf(ctx, { ...person('NV-NEW2'), department: null });
    expect(body).not.toHaveProperty('departmentCode');
  });
  ```

- [ ] Đổi `DemoPerson.department` thành `string | null`; sửa mọi chỗ đọc `person.department` (grep `\.department\b` trong `src/cli/seed`).
- [ ] `placedAsWanted`: người `department: null` ⟹ đọc hồ sơ (route thật: `GET /employees/{id}` hoặc `GET /employees?unplaced=true`,
  kiểm `openapi.json`), `present` khi chưa xếp phòng và đúng họ tên, ngược lại `conflict`.
- [ ] Thêm 17 người (SPEC S01) vào `PEOPLE`. Email theo mẫu `ten.ho` không trùng.
- [ ] Kiểm nhanh; commit `feat(seed): seventeen more people and one unplaced employee (T1, S01)`.

### T1b — S23 tệp thật đúng mẫu (Owner 17/11, Review 1) · M

**Files:** `src/cli/seed/steps/file-builders.ts` (mới) + `file-builders.spec.ts`, `steps/file-kit.ts`, `demo-api-client.ts`
(`download`) + spec, `steps/budget.steps.ts`, `steps/demo.steps.ts`, `steps/baseline.steps.ts`, `steps/usage.steps.ts`,
`fixture/shared-demo-v4/finance.ts` (`budgetLines`). Review 2 (Q-D): `package.json`, `pnpm-lock.yaml`, `nest-cli.json`,
`src/cli/seed/assets/fonts/NotoSans-Regular.ttf`, `OFL.txt`, `README.md` (SPEC S23 mục 4a, §11 ngoại lệ).

- [ ] Đọc `src/modules/policies/import-template/import-template.service.ts:74-137`, `budgets/proposal/budget-proposal-template.policy.ts`,
  `budgets/attachment/budget-attachment.policy.ts`, `catalog/contract/contract.policy.ts:15-57`, `infrastructure/object-storage/file-signature.ts`.
  Review 2: Q-D, Q-E đã chốt; làm đủ XLSX, CSV và PDF có dấu trong task này.
- [ ] Review 2: `pnpm add pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1` (vào `dependencies`, ghim đúng bản). Tải Noto Sans **tĩnh** Regular từ
  nguồn chính thức, chép `OFL.txt`, ghi nguồn + phiên bản + sha256 vào `assets/fonts/README.md`. Thêm `assets` vào `nest-cli.json`; chạy
  `pnpm build` và kiểm `dist/cli/seed/assets/fonts/NotoSans-Regular.ttf` có thật. Không tải được font thì dừng, hỏi điều phối (không đổi
  sang chữ không dấu).
- [ ] Test đỏ:
  - `bm10Workbook(template, lines, header)` mở lại bằng ExcelJS; ô tổng `result` = `requestedAmount`; ô đầu đúng Cost Center/năm/`D0`.
    Review 2: dòng cân khi thiếu; ba dòng "cơ sở / dự phòng (p %) / tổng đề xuất" với `p` truyền vào.
  - `versionWorkbook` (Review 2): ba cột đề xuất / đã chốt / chênh lệch cho cơ sở, dự phòng, tổng; lý do lệch.
  - `invoicePdf(spec)`/`contractPdf(spec)`/`signaturePdf`/`receiptPdf` (Review 2): bytes bắt đầu `%PDF-`; `PDFDocument.load` mở được,
    1 trang, `getTitle()` = số chứng từ; `lines` chứa số chứng từ, số tiền, chữ có dấu. Không tìm chữ trong bytes (font nhúng là mã glyph).
  - Header CSV ghế nền/usage/nhân sự bằng header của `*-template.policy.ts`.
  - Không builder nào trả 0 byte.
- [ ] `DemoApiClient.download(email, path)` (bytes, lỗi chỉ method/path/status). `uploadBudgetFile`/`uploadDocument` nhận
  `{ fileName, contentType, bytes }`. BM-10 tải mẫu bằng trưởng phòng; xóa `SAMPLE_PDF`. Review 2: `p` của dự phòng đề xuất đọc một lần
  từ `GET /operating-parameters` (Super Admin, khóa `BUDGET_RESERVE_DEFAULT_PERCENT`). Tệp Finance dựng trong `sendVersion` từ
  `GET /budget-versions/{id}` vừa đọc.
- [ ] Kiểm nhanh; commit `feat(seed): real files filled from the templates the API hands out (T1b, S23)`.

### T2 — S02 nhập nhân sự · M

**Files:** `steps/people-admin.steps.ts` (mới), `steps/people-admin.steps.spec.ts` (mới), `demo-fixture.types.ts`,
`fixture/shared-demo-v4/organization.ts`, `seed-steps.ts`.

- [ ] Đọc `src/modules/data-import/employee-import/employee-import-template.policy.ts` (cột bắt buộc) và
  `employee-import-audit.mapper.ts` (tên action của import đã tạo/xác nhận).
- [ ] Test đỏ: hàm thuần `employeeImportCsv(ctx, rows)` sinh header đúng thứ tự cột template và một dòng mỗi người; bản xem trước có đúng
  2 dòng lỗi dự kiến (phòng `XYZ`, email của NV-DEV5).
- [ ] Bước `org.employee-imports` (Super Admin): (a) import đã xác nhận NV-IMP1..3, `present` khi `ctx.accounts.findEmployees` đủ 3;
  (b) import chỉ xem trước, `present` khi Audit Trail có sự kiện tạo import với tên tệp `SV-employees-preview.csv`. `needs:
  ['org.employees']`.
- [ ] Thêm vào `demoSteps()` ngay sau `ORGANIZATION_STEPS`; test thứ tự trong `seed-steps.spec.ts` vẫn xanh.
- [ ] Kiểm nhanh; commit `feat(seed): one confirmed and one previewed employee import (T2, S02)`.

### T3 — S03 tài khoản khóa và lời mời · S

**Files:** `steps/people-admin.steps.ts`, spec, `seed-steps.ts`.

- [ ] Test đỏ: thân khóa có `reason` mang thẻ `[SV-LOCK]`; không bao giờ khóa người có Request trong fixture (NV-BOD3 không gửi gì).
- [ ] Review 1 (C-1) — test đỏ: `accountSpecsToCheck(people, lockedCodes)` bỏ người `lockedInDemo` đã có trong danh sách khóa.
  `org.accounts` ghi họ `present`. Không có bước này thì lượt chạy lại ra `ACCOUNT_DIFFERS`
  (`local-demo-account.api.ts:47-56`), exit 4.
- [ ] Bước `org.account-states`: `POST /app-users/{id}/lock` cho NV-BOD3, `POST /app-users { employeeId }` cho NV-NEW3. Đọc trước
  `GET /app-users?status=LOCKED` và `?activationState=INVITED`, khớp `employee.employeeCode` (không có lọc theo nhân viên): đã khóa hoặc
  đã có tài khoản ⟹ `present`. `needs: ['org.accounts']`. Sửa `accounts()` trong `organization.steps.ts` như test trên.
- [ ] Kiểm nhanh; commit `feat(seed): a locked account and an invitation not yet redeemed (T3, S03)`.

### T4 — S04 danh mục mới · M

**Files:** `fixture/shared-demo-v4/catalog-extra.ts` (mới), `fixture/shared-demo-v4/catalog.ts` (`FUNCTIONAL_GROUPS`, nối mảng),
`demo-fixture.types.ts` (`controlLevel` thêm `UNCONTROLLABLE`, `sharingPolicy` thêm `ALLOWED`), `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ: 25 ứng dụng, 32 gói; không tên `Miro`, `Whimsical`, `Canva Enterprise`; 7 nhóm đều có ứng dụng; tên gói duy nhất.
- [ ] Viết 12 ứng dụng/18 gói đúng SPEC §4.4 (dùng lại helper `k2`, `k4`, `app` — export chúng từ `catalog.ts` hoặc chép sang
  `catalog-extra.ts`). Review 1: tên gói đầy đủ ("Zoom Workplace Pro"…), không trùng; `adobe-cc-teams` có `revocationNote`.
- [ ] Kiểm nhanh; commit `feat(seed): twelve more applications and eighteen plans of real SaaS (T4, S04)`.

### T5 — S06a neo ngày gia hạn · M

**Files:** `steps/catalog.steps.ts` (`subscriptionTerms`), `steps/catalog.steps.spec.ts`, `demo-fixture.types.ts`,
`fixture/shared-demo-v4/catalog.ts` (7 gói tháng cũ `renewalInDays: 20`).

- [ ] Test đỏ (ngày giả `2026-11-17`):

  ```ts
  it('anchors the payment day of a monthly plan on today', () => {
    expect(subscriptionBody(ctx, { ...subscription('jira'), renewalInDays: 20 }, 'p')).toMatchObject({
      renewalDate: '2026-12-07', startDate: '2026-01-01', endDate: '2026-12-31',
    });
  });
  it('moves the end of a monthly plan past the year when its payment day is next year', () => {
    expect(subscriptionBody({ ...ctx, today: '2026-12-20' } as DemoRunContext, { ...subscription('jira'), renewalInDays: 20 }, 'p'))
      .toMatchObject({ renewalDate: '2027-01-09', endDate: '2027-01-08' });
  });
  it('declares the deadline to cancel of an annual plan when the fixture names one', () => { /* noticeDeadline = D0+25 */ });
  it('writes no date to alert from for a plan the fixture leaves without dates', () => { /* no endDate/renewalDate/noticePeriodDays, autoRenew false */ });
  // Review 1 (O-2): khóa bom ngày
  it.each(['2026-12-31', '2028-02-29', '2027-01-31'])('keeps renewalDate ≤ endDate + 1 on %s', (today) => { /* n = 1, 3, 20 */ });
  ```

- [ ] Sửa `subscriptionTerms` theo SPEC §4.5 (hàm nhỏ: `monthlyDates`, `annualDates`, `undatedTerms` để giữ complexity ≤ 12).
- [ ] Cập nhật test cũ: Jira giờ có `renewalDate`.
- [ ] Kiểm nhanh; commit `feat(seed): renewal days counted from the day of the seed (T5, S06, Q5)`.

### T6 — S05 + S06b thuê bao và hồ sơ workspace mới · S

**Files:** `fixture/shared-demo-v4/catalog-extra.ts`, `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ: 29 thuê bao; một thuê bao mỗi gói trừ K5 và Skype; `notion-business` và `canva-teams` (gói, `catalog.ts:89`) `withoutOwnerAccountEmail`; gói
  năm trong/ngoài cửa sổ đúng §4.5 (hàm thuần tính `adjustmentPoint` không có trong seed ⟹ test chỉ kiểm `renewalInDays`/`noticeDeadlineInDays`
  của fixture theo bảng).
- [ ] Viết 16 thuê bao (SPEC §4.4, `freeAfterBaseline` ở S06); K1 `quantity: 0`, `ownerDepartment: 'ENG'`, `originalPrice` USD.
- [ ] Kiểm nhanh; commit `feat(seed): sixteen subscriptions in and out of the adjustment window (T6, S05, S06)`.

### T7 — S06c điều khoản gói · S

**Files:** `steps/catalog-extra.steps.ts` (mới) + spec, `catalog-extra.ts` (`planTerms`), `seed-steps.ts`.

- [ ] Test đỏ: `planTermsBody(ctx, terms)` cho `notion-plus` có `lastReviewedOn = D0−400`; Visio có `installLimit.maxDevicesPerKey: 2`.
- [ ] Bước `catalog.plan-terms` (NV-ITA1): `GET /plans/{id}/terms` có ⟹ `present`; không ⟹ `PUT`. `needs: ['catalog.subscriptions']`.
- [ ] Kiểm nhanh; commit `feat(seed): terms of four plans, two left for review (T7, S06)`.

### T8 — S07 khóa + S08 ghế nền · S

**Files:** `catalog-extra.ts` (`keys`, `seats`), `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ: bất biến SPEC §4.2 — người cũ có ghế mới chỉ thuộc {FINH, DEP, ITOH, SALH} (Review 2: bỏ MKTH); không ghế mới cho Figma,
  1Password, DataGrip, GitHub; mỗi người một ghế mỗi thuê bao; ghế `endInDays < 0` không trước ngày cấp; ≥ 2 ghế hết hạn.
- [ ] Review 2 (Q-B đã chốt): ghế Adobe = DEP, BOD4, BOD5, BOD6; Zoom Pro có BOD4 thay MKT3 (SPEC S08). Test: không người MKT nào có
  ghế K2 mới (bảo vệ R10).
- [ ] Viết ghế theo SPEC S08; `keys` thêm `visio-pro` 3, `sublime-license` 2. Review 2 (Q-C ii): rải `grantedDaysAgo` của người mới;
  hàm thuần `grantedOnOf(seat, subscription, person, today) = max(today − n, startDate, hireDate)`. Test với m365-standard,
  confluence-premium, claude-team (ngày bắt đầu muộn).
- [ ] Kiểm nhanh; commit `feat(seed): baseline seats and keys of the new subscriptions (T8, S07, S08)`.

### T9 — S09 hồ sơ thuế nhiều nhà cung cấp · S

**Files:** `demo-fixture.types.ts` (`taxProfiles: […]`), `fixture/shared-demo-v4/finance.ts`, `steps/finance.steps.ts`, spec.

- [ ] Test đỏ: 6 hồ sơ, có `T2` và `T3`, mỗi `application` có `vendorName`.
- [ ] `taxProfile()` lặp `taxProfiles` với `summarize` (giữ luật present/conflict theo nhóm).
- [ ] Kiểm nhanh; commit `feat(seed): tax profiles of six vendors (T9, S09)`.

### T9b — S24 mục 1, 4: ngân sách cơ sở theo ngày seed (Review 2, Q-C) · M

Phải xong **trước** T12. Sau Q-B, BOD giữ khoảng 11 tr/tháng ghế K2; với cơ sở cũ 50 tr, lúc duyệt chi R47/R49 ở CP2 sẽ bị kiểm lại
ngân sách (`spend-decision.service.ts:101`) và có thể bị chặn.

**Files:** `steps/budget-targets.ts` (mới) + spec, `steps/budget.steps.ts`, `fixture/shared-demo-v4/finance.ts` (đèn đích từng phòng),
`steps/file-builders.ts` (`requestedAmount` làm tròn lên).

- [ ] Đọc `budget-review.policy.ts:12-112`, `budget-review-figures.service.ts:104-147`, `seat-month/seat-month.policy.ts:26-81`,
  `PendingSpendContributions`, `budget/commitment.repo.ts`, `budget-adjustment.controller.ts:88` (`BELOW_FORECAST_FLOOR`).
- [ ] Test đỏ:
  - `expectedOf(fixture, dept, today)` có ghế-tháng các tháng `1…M` theo ngày cấp của fixture;
  - `baseFor` cho đèn đích của SPEC S24 mục 1 (ENG/ITO `UNDER`, BOD `GREEN` với `g(M)`, FIN `YELLOW` với dự phòng 60 %), kiểm bằng
    `lightOf`/`paceOf` chép từ policy, với `D0` = 17/11, 01/10, 31/12;
  - ENG ≥ 600 tr và sau khi chuyển 5 tr vẫn ≥ dự kiến (DEMO-14 ở `D0+1`); ENG còn `BUDGET_OK` cho Figma 375.000 × số tháng còn lại;
  - `D0` tháng 5 ⟹ hàm báo đèn nào không đạt được, không ném lỗi.
- [ ] `budget.year`: ENG/ITO/BOD/FIN dùng `baseFor`. `requestedAmount` = `baseFor` làm tròn lên bội 1.000.000 (BM-10 theo T1b). FIN gửi
  `reservePercent: 60` + `reserveReason` mang thẻ. Lượt chạy lại chỉ đọc trạng thái, không so số.
- [ ] Kiểm nhanh; commit `feat(seed): budgets of the year counted from the day of the seed for four lights (T9b, S24)`.

### CP1 — checkpoint Đợt 1

- [ ] Checkpoint §0.6. Kiểm thêm: `GET /applications` 25, `GET /plans` 32, `GET /subscriptions` 29, `GET /plan-warnings` có 2 gói,
  `GET /assignment-expiry-queue` 2, `unplaced` 1, 1 tài khoản khóa, 1 `INVITED`, import có 2 dòng lỗi.

## Đợt 2 — Request và nhân sự (S10–S13)

### T10 — S10a đường đi mới của Request (thuần) · M

**Files:** `steps/scenario-path.ts`, `steps/scenario-path.spec.ts`, `demo-fixture.types.ts`.

- [ ] Test đỏ, bảng `it.each` (state, stage, goal ⟹ action):

  ```ts
  ['AWAITING_SPEND_DECISION', null, { target: 'REJECTED', rejectAt: 'SPEND' }, 'REJECT_SPEND'],
  ['PENDING', null, { target: 'AWAITING_REQUESTER_REVISION', returnAt: 'NEED' }, 'NEED_RETURN'],
  ['PENDING', null, { target: 'AWAITING_REQUESTER_REVISION', returnAt: 'ASSESSMENT' }, 'NEED_APPROVE'],
  ['AWAITING_IT_ASSESSMENT', null, { target: 'AWAITING_REQUESTER_REVISION', returnAt: 'ASSESSMENT' }, 'ASSESSMENT_RETURN'],
  ['AWAITING_SPEND_DECISION', null, { target: 'AWAITING_REQUESTER_REVISION', returnAt: 'SPEND' }, 'RETURN_SPEND'],
  ['AWAITING_IT_ASSESSMENT', null, { target: 'IT_REJECTED' }, 'ASSESSMENT_REJECT'],
  ['AWAITING_EXECUTION', null, { target: 'EXECUTING' }, 'GRANT'],
  // Review 1 (C-3): task state đi kèm — 'QUEUED'/'FAILED' là trạng thái tác vụ của Request
  ['EXECUTING', 'QUEUED', { target: 'FAILED' }, 'FAIL_TASK_OPEN'],
  ['EXECUTING', 'FAILED', { target: 'FAILED' }, 'FAIL_TASK_CLOSE'],
  ['EXECUTING', 'QUEUED', { target: 'AWAITING_IT_CLOSE' }, 'FAIL_TASK_OPEN'],
  ['EXECUTING', 'FAILED', { target: 'AWAITING_IT_CLOSE' }, 'WITHDRAW'],
  ['EXECUTING', null, { target: 'EXECUTING' }, null],
  ```

  và `reachedTarget`: `REJECTED`+`SPEND` cần `stage = REFUSED`; `REJECTED` (mặc định NEED) **không** đạt khi `stage = REFUSED`;
  `PENDING_OR_CANCELLED` đạt ở `PENDING` và `CANCELLED`.
- [ ] Mở rộng `DemoRequestTarget`, `ScenarioGoal` (`rejectAt`, `returnAt`), `ScenarioAction`, `PAST_*`, `FROM_STATE` (thêm `AWAITING_IT_ASSESSMENT`,
  `EXECUTING` cho các target mới). Mỗi hàm ≤ 60 dòng, complexity ≤ 12.
- [ ] Kiểm nhanh; commit `feat(seed): the paths to the remaining states of a request (T10, S10)`.

### T11 — S10a hành động mới · M

**Files:** `steps/request-actions.ts` (mới, chuyển `perform`, `decideNeed`, `approveSpend`, `grant`, `completeGrant` sang), `steps/request.steps.ts`,
`steps/request.steps.spec.ts`.

- [ ] Đọc trước: module provisioning (trạng thái tác vụ sau `report-failure`; điều kiện `close-failed`), `assessment-rejection.service.ts`,
  `assessment-return.service.ts`, `spend-decision.service.ts:94-112`.
- [ ] Test đỏ cho các hàm dựng thân thuần: `needBody('RETURN')` có `reason` mang thẻ; `assessmentRejectBody` có `kind: 'NOT_ELIGIBLE'`,
  `alternativePlanId`; `lineSpendBody(scenario)` đặt `REJECT` + `reason` cho người trong `rejectedLines`, `APPROVE` cho người còn lại.
- [ ] `perform()` thành bảng `Record<ScenarioAction, Handler>`.
  - Thêm `REJECT_SPEND`, `RETURN_SPEND`, `NEED_RETURN`, `ASSESSMENT_REJECT`, `ASSESSMENT_RETURN` (checklist 1.3 qua
    `yesChecklist(ctx, email, '1.3')`; mọi hành động này có `reason`).
  - Thêm `FAIL_TASK_OPEN` (claim + `report-failure`), `FAIL_TASK_CLOSE` (`close-failed`), `WITHDRAW` khi `EXECUTING` + task `FAILED`.
  - `request.steps.ts` chỉ còn tìm/gửi/vòng lặp.
- [ ] Review 1 (C-12): `grant`/`completeGrant` bỏ qua người trong `rejectedLines`. Test: R49 chỉ mở một tác vụ.
- [ ] Review 1 (C-2): `findScenarioRequest` dùng `scenario.readAs` (nếu có) để đọc Request. Người gửi chỉ đăng nhập khi phải gửi.
  Test bằng api giả: người gửi bị chặn (401) thì vẫn tìm thấy Request qua `readAs`.
- [ ] Kiểm nhanh (R01…R33 cũ không đổi hành vi); commit `feat(seed): actions that reject, return, fail and close a request (T11, S10)`.

### T12 — S10b dữ liệu R40–R57 · M

**Files:** `fixture/shared-demo-v4/requests-extra.ts` (mới), `fixture/shared-demo-v4/index.ts`, `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ (bất biến): không Request mới có người gửi/thụ hưởng ở MKT, DES, SAL; không người cũ ngoài NV-FINH, NV-DEP, NV-ITOH là người
  gửi; ≤ 3 Request mở mỗi người theo thứ tự gửi (test có sẵn); không xin gói đang giữ (test có sẵn); R42 do trưởng phòng gửi;
  R49 `rejectedLines ⊂ beneficiaries`; mỗi target mới có ít nhất một Request. Review 1: R57 có `readAs: 'NV-ENGH'`; test pool
  (`shared-demo-v4.spec.ts:122`) tính thêm target `EXECUTING`. Review 2: R42, R55 (FIN, đèn `YELLOW`) có `confirmReserve: true`
  (`scenario-path.ts:69-72`).
- [ ] Viết 18 kịch bản theo SPEC S10b, tóm tắt tiếng Việt, đề xuất Linear/Loom với `homepageUrl` thật.
- [ ] Kiểm nhanh; commit `feat(seed): eighteen requests in the states the demo lacked (T12, S10)`.

### T13 — S11 hoàn trả · S

**Files:** `steps/returns.steps.ts` (mới) + spec, `requests-extra.ts` (`returns`), `seed-steps.ts`.

- [ ] Test đỏ: thân `POST /return-requests` có `assignmentId`, `reason` mang thẻ; hàm chọn tác vụ thu hồi của đúng ghế.
- [ ] Bước `requests.returns` (người giữ gửi; IT phụ trách phòng claim + `revocation-completion` `{ completion: 'ACCOUNT_REMOVED', evidence }`
  cho RET1). `needs: ['catalog.baseline-close', 'org.it-admins']`, đặt sau `requestSteps`. Review 1 (C-13): idempotent theo
  `GET /return-requests?assignmentId=<ghế>` (dòng danh sách không có `reason`).
- [ ] Kiểm nhanh; commit `feat(seed): a return completed and one waiting for IT (T13, S11)`.

### T14 — S12 báo lỗi SaaS · M

**Files:** `steps/saas-issues.steps.ts` (mới, chuyển `saasIssue` khỏi `extras.steps.ts`), spec, `demo-fixture.types.ts` (`saasIssues`),
`requests.ts`/`requests-extra.ts`, `seed-steps.ts`.

- [ ] Đọc policy chuyển trạng thái `src/modules/licensing/saas-issue/saas-issue.policy.ts:81-85` (Review 1: `NEW` chỉ sang
  `IN_PROGRESS`/`DUPLICATE`; ISSUE5 phải qua `IN_PROGRESS`; ISSUE4 kết thúc ở `IN_PROGRESS` sau mở lại). Kiểm bằng `?scope=all`.
- [ ] Test đỏ: chuỗi thao tác của từng báo lỗi (hàm thuần trả danh sách lệnh theo trạng thái hiện tại tới đích). Review 2: ISSUE5 và
  bản trùng do NV-BOD4 báo (Q-B), bản trùng có thẻ `[SV-ISSUE5B]`; ISSUE3 ở `CLOSED` (sweep) là `present`.
- [ ] Bước `saas.issues` giữ key cũ `saas.issue` cho ISSUE1 hoặc đổi key và cập nhật `needs` liên quan; đi tiếp từ trạng thái hiện có, đã
  tới đích ⟹ `present`.
- [ ] Kiểm nhanh; commit `feat(seed): SaaS issues in progress, resolved, reopened and duplicated (T14, S12)`.

### T15 — S13a–c BM-09 · M

**Files:** `steps/notices.steps.ts` (mới, chuyển `notice` khỏi `extras.steps.ts`), spec, `demo-fixture.types.ts` (`notices` với
`handling`), `requests.ts`/`requests-extra.ts`, `seed-steps.ts`.

- [ ] Test đỏ: thân `linking` (`eventId`, `verification`), `rejection` (`reason`), `recording` (`grounds.issuedOn = D0`,
  `event.approvedReturnOn = D0+5`). Review 2: NOTICE3 là NV-DEP → NV-BOD5 (Q-B).
- [ ] Bước `personnel.notices`; NOTICE2 `needs: ['personnel.events']`; NOTICE4 `needs` thêm `requests.R48`, `requests.R54`. Review 1: API
  nhận BM-09 về người đang nghỉ dài, bỏ phương án dự phòng. Kiểm cuối: 1 `PENDING_VERIFICATION`, 2 `RECORDED`, 1 `REJECTED` (không có `LINKED`).
- [ ] Kiểm nhanh; commit `feat(seed): notices linked, rejected and recorded by the Super Admin (T15, S13)`.

### T16 — S13d nghỉ đột ngột + R57 · S

**Files:** `steps/notices.steps.ts` hoặc `steps/personnel.steps.ts`, spec, `seed-steps.ts`.

- [ ] Test đỏ: thứ tự — `personnel.abrupt-departure` sau `requests.R57` và `personnel.events`, trước `rules.first-run`.
- [ ] Bước ghi `BLOCK_NOW` cho NV-DEV7 (dùng lại `eventSpec`/`exists` của `personnel.steps.ts`); R57 dùng target `PENDING_OR_CANCELLED`
  và `readAs: 'NV-ENGH'` (T11). `needs: ['personnel.events', 'requests.R57']`.
- [ ] Review 1 (C-2): sau T16 bắt buộc chạy `seed:local -- --continue` cùng ngày, mong đợi exit 2 (R57 không đăng nhập NV-DEV7).
- [ ] Kiểm nhanh; commit `feat(seed): an abrupt departure with a request left open (T16, S13)`.

### T16b — `D0+1` an toàn cho người có sự kiện nhân sự (Review 2, N-1) · S

**Files:** `steps/organization.steps.ts` (`placedAsWanted`), `steps/organization.steps.spec.ts`.

- [ ] Test đỏ (api giả): ở `today = D0+1`, NV-DEV4 nằm ở ITO ⟹ `present` (có `TRANSFER` trong fixture, đã tới `effectiveOn`); NV-OFF1 và
  NV-DEV7 `status: TERMINATED` hoặc `workState: LEFT/HANDING_OVER` ⟹ `present`; người không có sự kiện mà sai phòng ⟹ vẫn `conflict`.
- [ ] Người có sự kiện trong `personnel` hoặc S13d đọc `GET /employees/{id}` (Super Admin) thay cho danh sách thành viên phòng, theo
  SPEC §4.1 mục 3. Họ tên vẫn phải khớp.
- [ ] Kiểm nhanh; commit `fix(seed): a rerun the next day accepts the people the dataset itself moved or let go (T16b)`.

### CP2 — checkpoint Đợt 2

- [ ] Review 2: chạy thêm lượt `D0+1` (§0.6): exit 0; `org.employees` `present`; DEMO-14 ghi được.
- [ ] Checkpoint §0.6. Kiểm thêm: trạng thái R40–R57; `GET /spend-approvals` (NV-CEO) ≥ 7; hàng nhu cầu ITOH/FINH/DEP/OPSH ≥ 1, ENGH ≥ 1 (Review 2: theo SPEC R-7);
  `GET /return-requests` 2; `GET /saas-issues?scope=all` 7 dòng (6 + bản trùng); `GET /personnel-notices` 4; R10/R21/R11 vẫn đúng trạng
  thái cũ.

## Đợt 3 — usage và SBF-20 (S14–S15)

### T17 — S14 nguồn usage mới · S

**Files:** `fixture/shared-demo-v4/usage-extra.ts` (mới), `fixture/shared-demo-v4/index.ts`, `fixture/shared-demo-v4.spec.ts`.

- [ ] Test đỏ: không dòng của người DES hay ENG cũ; mọi người có dòng đều giữ ghế của ứng dụng **sau S11** (Review 1: không dòng DEV6 ở
  Notion vì RET1 đã thu hồi); số ngày không hoạt động BOD5 75, BOD3 95 (Review 2, Q-B);
  BOD6, SAL4 không dòng; không dòng của người MKT; không nguồn cho ứng dụng nhóm _Liên lạc_.
- [ ] Thêm 3 nguồn vào `usageSources`; **không** thêm `ghostDecisions`.
- [ ] Kiểm nhanh; commit `feat(seed): usage of Adobe, HubSpot and Notion raises seats for three more heads (T17, S14)`.

### T18 — S15 SBF-20 đã ghi + chọn kỳ đang chạy · M

**Files:** `steps/renewals.steps.ts` (mới) + spec, `fixture/shared-demo-v4/renewals.ts` (mới), `steps/catalog.steps.spec.ts`,
`seed-steps.ts`.

- [ ] Test đỏ (Review 1, C-7):
  - `renewalBody(adjustment, spec)` lấy `choice = adjustment.suggestedChoice`, `proposedQuantity = adjustment.target`.
  - Adobe: `nextPeriod.renewalDate = renewalOn + 365`, `unitPrice` dạng `{ amount, currency }`.
  - Zoom: `outcome: 'VENDOR_REFUSED'`, có `outcomeNote` mang thẻ, không `nextPeriod`.
  - `target = 0` ⟹ ném lỗi rõ để ghi `D-n`.
- [ ] Review 1 (C-8): **không** sửa `oneSubscription`. Chỉ thêm test "plan có 2 dòng ⟹ lấy `rows[0]` (kỳ gốc, `createdAt asc`), không POST,
  PATCH hay completions".
- [ ] Bước `renewals.adjustments` (Adobe: NV-ITA2; Zoom: NV-ITA2 không phụ trách); `present` khi đã có lượt cho thuê bao.
  `needs: ['catalog.baseline-close', 'ghost.decisions']`; đặt sau `USAGE_STEPS`.
- [ ] Kiểm nhanh; commit `feat(seed): two adjustments of SBF-20 recorded, one by another IT Admin (T18, S15)`.

### CP3 — checkpoint Đợt 3

- [ ] Checkpoint §0.6. Kiểm thêm: `GET /usage-sources` 6; G3 BOD6 (NV-ITA2), SAL4 (NV-ITA1) có trong `GET /ghost-seat-recommendations?group=G3`;
  `GET /subscription-renewals` 2 `OUTCOME_RECORDED`; flows `mf5-rightsizing*` xanh (Figma không đổi).

## Đợt 4 — thiết bị, collector, AI (S16–S19)

### T19 — client thiết bị và tệp ký · S

**Files:** `demo-api-client.ts`, `demo-api-client.spec.ts`, `steps/file-kit.ts`.

- [ ] Test đỏ (fetch giả): `callPublic('POST', '/device-enrollments', body, { 'Idempotency-Key': k })` không gửi `authorization`;
  `callAsDevice(token, 'GET', '/device-session')` gửi `Bearer <token>`; lỗi chỉ chứa method/path/status/code, **không** chứa token.
- [ ] Thêm hai hàm (dùng `send()` có sẵn, không lưu token vào `sessions`); `uploadDocument` nhận purpose `SIGNATURE_RECORD`.
- [ ] Kiểm nhanh; commit `feat(seed): calls of a device and of the public routes for the collector (T19)`.

### T20 — S16 sổ máy, thông báo, xác nhận · M

**Files:** `steps/devices.steps.ts` (mới) + spec, `fixture/shared-demo-v4/devices.ts` (mới), `demo-fixture.types.ts`, `seed-steps.ts`.

- [ ] Test đỏ: thân thông báo có `includesToolStatus: true`; 7 máy `assetCode` duy nhất; mọi người giữ máy có tài khoản; ai xác nhận
  đều có bản ký `BM-06`. Review 1 (C-9): `deviceBody` có `hostname`, `holderEmployeeId` là uuid; `signatureRecordBody` =
  `{ documentId, noticeVersionId }`.
- [ ] Bước `devices.notice` (Super Admin; `GET /monitoring-notices/current` 404 ⟹ chưa có), `devices.registry` (máy theo
  `GET /devices?search=`, bản ký PDF BM-06 thật từ T1b, đổi người giữ, ngừng). Review 2: đổi người giữ/ngừng là
  `POST /devices/{id}/holder-changes`, `POST /devices/{id}/retirements` (id **máy**); bản ký, xác nhận, mã đăng ký, yêu cầu dừng dùng
  `registrationId`. SV-LT-004 thuộc NV-BOD4 (Q-B).
- [ ] Review 1 (R-19): bước `devices.allowlist` (NV-ITA1, xem T21) **viết ở task này**, đặt trước `devices.acknowledgements`. Không có nó
  thì `seed-steps.spec.ts:8-14` đỏ, vì `devices.acknowledgements` `needs: ['devices.allowlist']`.
- [ ] `devices.acknowledgements` (người giữ), `needs: ['devices.allowlist']`.
- [ ] Kiểm nhanh; commit `feat(seed): monitoring notice, seven company machines and their acknowledgements (T20, S16)`.

### T21 — S17 allowlist và collector · M

**Files:** `steps/collector.steps.ts` (mới) + spec, `devices.ts`, `seed-steps.ts`.

- [ ] Test đỏ: `usageBatchBody(ctx, machine, now)` chỉ có ngày `ctx.today`, `coverage` `PARTIAL` hoặc `NOT_OBSERVABLE` với 0/0, `generatedAt`
  không sau `now`, số liệu cố định theo `assetCode` + ngày; `statusSnapshotsBody` có `OK` kèm cửa sổ **đúng mã của tool** (Review 1, C-5:
  `CLAUDE_CODE` → `SESSION`/`WEEKLY_ALL`, `CODEX` → `PRIMARY`/`SECONDARY`, `tool-status.policy.ts:11-15`); `installKey()` 43 ký tự base64url;
  `machinesToCollect(devices)` bỏ máy không `ACTIVE` (C-6).
- [ ] (Bước `devices.allowlist` đã viết ở T20 — Review 1.)
- [ ] Bước `devices.collector`: mỗi máy SV-LT-001…003 có `state = ACTIVE` (máy `COLLECTION_STOPPED` ⟹ `present`) — nếu
  `GET /devices/{id}/usage` đã có ngày hôm nay ⟹ `present`; không thì phát mã,
  enroll (`callPublic` + `Idempotency-Key`), `GET /device-session` (phải `ACTIVE`), gửi lô usage (mọi kết quả phải `ACCEPTED` hoặc
  `UNCHANGED`, khác ⟹ `conflict`), gửi ảnh chụp trạng thái.
- [ ] Kiểm nhanh; commit `feat(seed): the AI collector enrolls three machines and sends today's usage (T21, S17)`.

### T22 — S18 yêu cầu dừng · S

**Files:** `steps/collector.steps.ts` hoặc `steps/devices.steps.ts`, spec, `seed-steps.ts`.

- [ ] Test đỏ: thứ tự `devices.stop-requests` sau `devices.collector`.
- [ ] NV-BOD4 (Review 2, Q-B) gửi (để `OPEN`); BOD1 gửi rồi NV-ITA2 hoàn tất. Review 1 (R-15): đọc `GET /device-stop-requests?state=OPEN` và `?state=COMPLETED`,
  lọc theo máy phía client, và `GET /me/devices` (`stopRequestPending`) **trước khi** gửi. Gửi lại tạo dòng `INVALID`.
- [ ] Kiểm nhanh; commit `feat(seed): one stop of collection waiting and one completed (T22, S18)`.

### T23 — S19 AI `SIMULATED` · S

**Files:** `steps/ai.steps.ts` (mới) + spec, `fixture/shared-demo-v4/renewals.ts` (`aiSummaries`), `seed-steps.ts`.

- [ ] Test đỏ: bước không bao giờ ghi `AI_PROVIDER_MODE` (kiểm danh sách khóa ghi); ba người gọi không phải Super Admin.
- [ ] Bước `ai.switches` (Super Admin, chỉ ghi khóa đang `OFF`) và `ai.summaries` (đọc `source` ⟹ `POST` ⟹ hỏi lại ≤ 30 s chỉ để ghi
  `detail`; `present` theo Audit `AI_INVOCATION.REQUESTED` của người gọi). `needs` gồm mọi `requests.*` của hàng chờ đó.
- [ ] Kiểm nhanh; commit `feat(seed): AI switched on in simulated mode with three summaries (T23, S19)`.

### CP4 — checkpoint Đợt 4

- [ ] Checkpoint §0.6. Kiểm thêm: `GET /devices` 7 (3 `ACTIVE`); 3 máy có `collection.lastAcceptedAt`; `GET /devices/{id}/usage` có ngày `D0`;
  `GET /devices/{id}/tool-status` có dòng, `intake-rejections` rỗng; `GET /device-stop-requests` 1 mở, 1 xong, 0 `INVALID`;
  3 sự kiện `AI_INVOCATION.REQUESTED`. Flows **bắt buộc** ở CP này (Review 1, R-20: một bước collector/AI `conflict` trong app test làm
  đỏ toàn bộ flows).

## Đợt 5 — hợp đồng, hóa đơn, ngừng ứng dụng, tài liệu (S20–S22)

### T24 — S20 hợp đồng và hóa đơn · M

**Files:** `steps/demo-documents.steps.ts` (mới, chuyển `CONTRACTS`, `contracts`, `INVOICES`, `invoices` khỏi `demo.steps.ts`), spec,
`steps/demo.steps.ts`.

- [ ] Tách trước (không đổi hành vi), chạy `pnpm exec jest src/cli/seed` xanh rồi mới thêm dữ liệu.
- [ ] Test đỏ: hợp đồng Zoom không `effectiveTo`; `SV-INV-007` có bước `resubmission` với số `SV-INV-007R`; số hóa đơn duy nhất.
  Review 1 (C-10): hàm thuần `invoiceMove(spec, rows)` trả `present` khi đã có `SV-INV-007R`, `resubmit` khi bản gốc `RETURNED` mà chưa có
  bản mới, `conflict` chỉ khi trạng thái khác hẳn đích. Thân `resubmission` đủ trường (SPEC S20), không `link`, tệp PDF mới; người gọi là
  IT Admin đã nộp bản gốc.
- [ ] Thêm 3 hợp đồng, 6 hóa đơn (SPEC S20), số lượng bằng `purchasedQuantity` (Review 2: SV-INV-010 là 7, không phải 6); `invoices` đi tiếp `RETURNED → resubmission` khi spec có
  `resubmitAs`. Hợp đồng/hóa đơn dùng PDF thật của T1b.
- [ ] Kiểm nhanh; một commit `feat(seed): contracts and invoices in their own file, three more contracts and six invoices (T24, S20)`.

### T25 — S21 ngừng ứng dụng · S

**Files:** `steps/catalog-extra.steps.ts`, spec, `catalog-extra.ts` (`retiredApplications: ['skype']`), `seed-steps.ts`.

- [ ] Test đỏ: ứng dụng được ngừng không có thuê bao và không có ghế trong fixture.
- [ ] Bước `catalog.retirement`: `GET /applications/{id}/retirement` đã ngừng ⟹ `present`; không ⟹ `POST …/retire`. `needs:
  ['catalog.plans']`.
- [ ] Kiểm nhanh; commit `feat(seed): Skype for Business retired from the catalog (T25, S21)`.

### T26 — S22 tài liệu BE · S

**Files:** `src/cli/seed/fixture/shared-demo-v4/README.md`, `docs/guides/seed.md`.

- [ ] README: cập nhật mọi bảng (người, tài khoản, danh mục 25/32/29 kèm "giá mô phỏng", Request R40–R57, usage, thiết bị, SBF-20, AI,
  giới hạn SPEC §8); thay "phòng gốc" bằng "phòng khởi đầu do lệnh cài đặt tạo (`QĐ-87f`)", thêm câu giải thích cảnh báo của `ADMIN`.
- [ ] `seed.md`: thời gian lượt đầu; `--continue` ở `D0+1` ghi thêm điều chỉnh ngân sách và một ngày usage AI.
- [ ] `pnpm rules:format`; commit `docs(seed): the expanded dataset, its limits and the start department (T26, S22)`.

### T27 — S22 tài liệu FE (repo Docs) · S

**Files:** `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\demo\README.md`, `demo/accounts.md`, `demo/scenarios.md`,
`roles/super-admin.md`, `flows/ai-collector-device.md`, liên kết ở các `roles/*.md` (SPEC §9).

- [ ] Viết theo SPEC §9, số liệu lấy từ log CP5 (không đoán); đoạn `ADMIN` dùng nguyên văn SPEC §9.3.
- [ ] Commit trong repo Docs theo luật repo đó (nhánh `main`, không push khi chưa được giao): `docs(fe-demo): dataset after the seed expansion (T27)`.

### T29 — S24 chốt tháng, ký quý, hóa đơn tháng trước, script kiểm (Owner 17/11, Review 1, Review 2) · M

Review 2: phần ngân sách cơ sở đã chuyển sang T9b. Task này chỉ còn mục 3, 5, 6 của SPEC S24.

**Files:** `steps/demo.steps.ts` (`reviews`, `explainOne`), `steps/demo-documents.steps.ts` (hóa đơn `SV-INV-011/012`), spec; script
ngoài repo `D:\FPT\FALL2026\Code\verify-logs\seed-v4-expand\check-finance.mjs`.

- [ ] Đọc `budget-review-signature.service.ts:29-60`, `budget-review-explanation.policy.ts:15-34`,
  `requests/purchase-invoice/purchase-invoice-plan.service.ts:120-160,340-400`, `budget/invoice.policy.ts:90-110`.
- [ ] Test đỏ:
  - `quartersToSign(periods)` = mọi kỳ `QUARTER` khác `SIGNED`, trừ kỳ quý mới nhất;
  - `explanationMove(lines)` ⟹ `present` khi đủ 2 dòng `EXPLAINED`; chọn FIN, DES trước nếu `PENDING`; giữ ≥ 1 dòng `PENDING`;
  - hóa đơn `SV-INV-011` (R18, tháng `M−1`), `SV-INV-012` (R56, tháng `M`) có `link.requestId`, `quantity` 1.
- [ ] `reviews()`: chốt tháng như cũ; ký theo `quartersToSign`; giải trình theo `explanationMove`. Vẫn là bước cuối.
- [ ] Hai hóa đơn tháng trước đi qua `invoices()` (khóa là số hóa đơn, đích `CONFIRMED`) và đứng trước `demo.budget-reviews`.
- [ ] Viết `check-finance.mjs` theo SPEC S24 mục 6 (A–D, F, G; E chỉ in), chỉ đọc, mật khẩu từ biến môi trường, không in.
- [ ] Kiểm nhanh; commit `feat(seed): months and quarters that add up for heads and Finance (T29, S24)`.

### CP6 — checkpoint báo cáo

- [ ] Checkpoint §0.6, rồi `node D:/FPT/FALL2026/Code/verify-logs/seed-v4-expand/check-finance.mjs`. Mọi đẳng thức A–D, F, G đạt; đủ bốn
  đèn ở kỳ chốt mới nhất đúng bảng SPEC S24 mục 1 (khi `D0` từ 01/10 tới 31/12); R10/R21/R11 đúng kịch bản. Lưu log `CP6-finance.log`.
  Đèn lệch ⟹ chỉnh hằng số của `baseFor` (T9b), ghi `D-n`; không ép số bằng tay.

### CP5 — checkpoint cuối + CI

- [ ] Checkpoint §0.6 và so toàn bộ SPEC §6.
- [ ] Tự review diff `git diff feat/p5...feat/seed-v4-expand` theo SPEC §4 (bất biến, SoD, không SQL, không token trong log).
- [ ] Push nhánh, `gh workflow run ci.yml --ref feat/seed-v4-expand`; đỏ thì sửa, chạy lại tới xanh.

### T28 — đưa sang repo WDP bằng patch · S

Cách làm như prompt 5 (`docs/reviews/p5-2026-11-17/run/NIGHT-PLAN.md:19-27`): **không copy đè thư mục**.

- [ ] Kiểm hai repo còn giống nhau ở phần seed: `diff -rq BE-dev-software-license-management/src/cli/seed BE-WDP/src/cli/seed` và
  `test/support/flows` (17/11 hai bên giống hệt).
- [ ] Trong `D:\FPT\FALL2026\Code\BE-WDP`: tạo `feat/wdp-seed-v4-expand` từ nhánh WDP đang chứa P5 (`feat/wdp-p5`, hoặc `dev` nếu Owner đã
  merge — hỏi điều phối nếu không rõ).
- [ ] `git -C ../BE-dev-software-license-management diff --binary $(git -C ../BE-dev-software-license-management merge-base feat/p5 feat/seed-v4-expand)..feat/seed-v4-expand -- src/cli/seed docs/guides/seed.md package.json pnpm-lock.yaml nest-cli.json > seed-v4-expand.patch`
  rồi `git apply --3way seed-v4-expand.patch` (Review 2: `--binary` cho tệp font; thêm `package.json`, `pnpm-lock.yaml`, `nest-cli.json`
  của Q-D; lockfile xung đột thì chạy lại `pnpm add pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1` ở WDP thay vì vá tay); xung đột ⟹ giữ phía WDP cho phần ngoài seed, ghi `D-n`. Review 1: `--3way` cần blob gốc có
  trong repo WDP; thiếu thì `git apply` thường rồi sửa tay, ghi `D-n`.
- [ ] Kiểm nhanh, checkpoint §0.6 trên DB WDP (WDP lưu lịch sử AI ở MongoDB khi `AI_HISTORY_STORE=mongodb`: bước S19 phải chạy được với
  cấu hình đó), push nhánh, CI GitHub repo WDP xanh. Commit `feat(seed): the expanded demo dataset from the project repo (T28)`.

---

## Báo cáo cuối (`D:\FPT\FALL2026\Code\verify-logs\seed-v4-expand\DONE.md`)

- skill đã dùng; bảng task → commit → lệnh → kết quả thật; link CI và trạng thái job (hai repo);
- số đếm thật so với SPEC §6; exit code seed DB trống / chạy lại;
- `D-n`; "Nợ test"; "Nghi lỗi logic"; "Đã cắt/Chưa làm".

## Thứ tự cắt khi trễ

Cắt từ cuối, mỗi mục cắt ghi lại: T25 (ngừng ứng dụng) ⟹ T24 (hóa đơn/hợp đồng thêm) ⟹ T14 (báo lỗi thêm) ⟹ T2 (import) ⟹ T9. Không cắt
T5, T18, T20–T23 (quyết định Q4, Q5, Q6 của Owner), T1b và T29 (yêu cầu Owner 17/11).

Thứ tự làm (Review 1): T1b ngay sau T1, trước T2, vì T2, T20, T24 dùng tệp của nó. T29 + CP6 sau T25, trước T26. Như vậy README và tài
liệu FE lấy số từ CP6.

Review 2: T9b sau T9, trước CP1 (ngân sách phải có trước Request mới). T16b sau T16, trước CP2. Thứ tự đầy đủ: T0, T1, T1b, T2…T9,
T9b, CP1, T10…T16, T16b, CP2, T17, T18, CP3, T19…T23, CP4, T24, T25, T29, CP6, T26, T27, CP5, T28. T9b và T16b không được cắt.

## Script đếm (dùng ở checkpoint)

Viết một lần ở `D:\FPT\FALL2026\Code\verify-logs\seed-v4-expand\count.mjs` (ngoài repo): đăng nhập từng vai bằng mật khẩu đọc từ biến môi
trường (không in), gọi route của SPEC §6 với `pageSize=1` và in `pagination.total` (hoặc độ dài `items`) cạnh số mong đợi. Không ghi gì.
