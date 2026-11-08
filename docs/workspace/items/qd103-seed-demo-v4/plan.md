# Plan: qd103-seed-demo-v4

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9e83c86` (sau W6 PASS trên `feat/qd103-108-mf145`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI (subagent chat review, W7).
- Owner review: chưa review. Peer review: cổng thiết kế W7 (subagent chỉ đọc) — đã chạy 09/11/2026 (`design-audit-w7.md`), đã sửa (mục _Design review_).
- Triển khai: `not-started`. PR: chưa có. Cỡ ước: L ≈ 15h, ~48 file ⟹ 3 phase, mỗi phase một commit `feat(qd103-w7): seed-demo-v4 P<n>`.

## Before coding

- **Điều kiện bắt đầu: W1 → W6 PASS** (tracker §5). Ghi SHA PASS cuối của W6 vào `d9e83c86` trước Task 1.
- Đọc `AGENTS.md`, `docs/rules/operational-commands.md`, `docs/guides/seed.md`, `src/cli/seed/fixture/shared-demo-v3/README.md` (trạng thái cuối W6),
  `test/support/flows/flow-template.ts`, `flow-world.ts`, `flow-clock.ts`.
- Đối chiếu `openapi.json` (sau `pnpm openapi:export`) mọi `operationId`, body và mã lỗi ở spec mục 9 + hai hạng mục `-mf1`, `-mf5` (gồm
  `budgetCyclePublish`, `budgetVersionCreate` khi đã có hiện hành = `BUDGET.CURRENT_EXISTS`, `subscriptionAdjustmentVendorOutcomeRecord`); lệch tên ⟹
  sửa bảng kịch bản (không đổi API).
- Đọc độ trễ lượt đầu của mọi job mới của W2–W6 (`cycle-deadline`, `subscription-adjustment`, `seat-cost`, `kpi4`, `internal-rules`, `usage-rules`,
  `decision-follow-up`) — mặc định 5 phút như `subscription-renewal.job.ts:6`; job nào khác ⟹ ghi vào spec mục 8 và README (Q-99).
- Liệt kê trigger/cột mặc định đọc đồng hồ DB (`now()`, `CURRENT_DATE` trong `prisma/migrations`: kỳ trưởng phòng, `effective_from` của phòng, khóa truy
  cập, nghỉ việc) trước khi chọn ngày giả của `seed-calendar` (DA7-15); step nào chạm chúng thì không chạy ở ngày giả khác ngày DB.
- Kiểm tra nhanh mỗi task theo tracker §4.5: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`,
  `pnpm openapi:export` (không drift) + test theo file. **Không** chạy `pnpm check` hay full suite.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 09/11/2026 (`design-audit-w7.md`, 28 finding, 6 Cao). Hạng mục này nhận DA7-01, 02, 03, 05 (vế nền), 06, 07 (vế
DM4/DS20), 08, 09, 10, 11, 12, 13, 14, 15, 17, 22, 24 (vế DM4-24 + unit kho), 25, 26, 27 ⟹ đã sửa hết trong spec: Trần `Y+1` đủ 11 phòng gồm ADMIN
(Task 6), DM4-04 publish lại, Q-99 viết lại theo sự thật _job chạy trong API_ (Task 8 đổi nội dung, chốt lượt đầu ở `-mf5`), MKT/SAL không seat trả phí
nền + SAL 290.000 (Task 4, 5), luật thứ tự `scenarioDay` (Task 2, 11), DM4-10/11 tạo → vượt → chia lại, GitHub mua 10, tập đỏ {Adobe, Zoom, Loom}, Canva
25 ngày, DS20-20 theo tháng chứa `D0+28`, DM4-13 thành DAT `Y+1`, `hire_date` tương đối + unit baseline qua policy thật (Task 3, 4), luật `present`
từng loại (Task 4, 10), kiểm trigger đồng hồ DB (_Before coding_), DM4-25…27, DS20-22…24, `granted_on` `D0−130`, DM4-24 loại trừ, file Task 1, đo
thời gian apply (Task 10). Finding sai một phần, không sửa theo đề xuất: DA7-03 (khởi động lại API **sau** apply không cứu được kỳ đã claim — đổi
sang API mới trước apply + chốt), DA7-10 (Loom không có cảnh báo chất lượng dữ liệu: `autoRenew` false ⟹ mốc `END_DATE`). Không sửa: DS20-25 (không
thể vượt Dự phòng kho 1 tỷ — đã có integration W5); R-I08 vế _phòng có trưởng phòng sau khi Finance lập phiên bản có cờ_ (DAT chưa hiệu lực, chưa có
người). Phát hiện thêm: ledger L4-23 (`FR-9.5`) gán W7 nhưng cần đổi `src` ⟹ ghi ngoài phạm vi, chuyển chat review.

## Tasks

### Phase 1 — phát hành v4, lịch tương đối, tổ chức, kho

### Task 1: fixture v4 từ v3 cuối W6, phát hành và từ chối dataset khác

- Files: `src/cli/seed/fixture/shared-demo-v4/{index,installation}.ts` (chép v3), `src/cli/seed/fixture/demo-fixture.types.ts`,
  `src/cli/seed/seed-steps.ts` (`DEMO_FIXTURES` chỉ còn v4), `src/cli/seed/seed.arguments.ts` (+ spec), `src/cli/seed/seed-run.ts` (+ spec: Audit
  `DEMO_DATASET:` của fixture khác ⟹ refused), `src/cli/seed/seed.command.ts` và `src/cli/seed/seed-secrets.ts` (+ `seed-runner.spec.ts`,
  `seed-secrets.spec.ts`, `seed-steps.spec.ts`: import `INSTALLATION` từ `shared-demo-v4/installation`), `src/cli/seed/fixture/shared-demo-v4.spec.ts` (mới).
- Depends on: W6 PASS.
- Acceptance: test matrix _phát hành_; v3 vẫn còn trong cây tới Task 9 (chỉ không đăng ký trong `DEMO_FIXTURES`).
- Verify: `pnpm exec jest src/cli/seed/seed.arguments.spec.ts src/cli/seed/seed-run.spec.ts src/cli/seed/seed-secrets.spec.ts src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Task 2: lịch tương đối `demo-dates.ts`

- Files: `src/cli/seed/demo-dates.ts` (mới, hàm thuần dùng `src/core/business-date.ts`; gồm `scenarioDay` và hàm sắp dòng), `src/cli/seed/demo-dates.spec.ts`,
  `src/cli/seed/seed-calendar.ts` (giữ `calendarRefusal`; `seedCalendar` trả `{ today, years: [Y, Y+1] }` cho step).
- Depends on: Task 1.
- Acceptance: test matrix _ngày tương đối_ (`D0` 15/03, 20/12, 31/12, 01/01) và _thứ tự dòng flow_ (đọc khóa _Khi_ của bốn bảng từ hằng ở Task 11/12;
  ở task này kiểm bằng bảng mẫu).
- Verify: `pnpm exec jest src/cli/seed/demo-dates.spec.ts src/cli/seed/seed-calendar.spec.ts`.

### Task 3: tổ chức — 10 phòng, 36 persona, 84 nhân viên nền

- Files: `fixture/shared-demo-v4/organization.ts`, `fixture/shared-demo-v4/background-staff.ts` (mới, sinh `NV-B001`…`NV-B084` tất định),
  `steps/organization.steps.ts` (+ step `org.background-staff`: `employeeImportUpload` CSV dựng trong bộ nhớ → `employeeImportConfirm`; idempotent theo
  mã nhân viên đã có; `hire_date = D0 − 400` thay hằng `HIRE_DATE`), `fixture/shared-demo-v4.spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _quy mô BRD 3.4_; LGL/OPS tạo trước kỳ (hiệu lực hôm nay); NV-CTR1 `contractEndDate` `D0+120`, NV-INT1 `D0+90`; NV-MOV1 ở
  DES (điều chuyển sang ENG ở `-mf5`).
- Verify: `pnpm exec jest src/cli/seed/fixture/shared-demo-v4.spec.ts src/cli/seed/steps`.

### Task 4: danh mục và kho — một thuê bao mỗi gói, ngày tương đối, seat nền, đóng baseline

- Files: `fixture/shared-demo-v4/catalog.ts`, `steps/catalog.steps.ts` (+ spec: khóa idempotent = gói trên cả chuỗi kỳ, kể cả `CLOSED`; không so số
  seat/ngày; `purchasedQuantity` tính; `autoRenew` ba trạng thái; `vendorMinimumSeats`; hồ sơ workspace qua `planWorkspaceProfileSet`),
  `steps/baseline.steps.ts` (mới: `seatBaselineImportUpload` → `seatBaselineImportConfirm` mỗi thuê bao, rồi `seatBaselineClose`; đã đóng ⟹ `present`),
  `seed-steps.ts`, `fixture/shared-demo-v4.spec.ts` (mọi dòng baseline qua `seat-baseline-rows.policy`; MKT/SAL không seat trả phí; Loom NV-DES5; Jira
  của NV-DES3; GitHub `freeAfterBaseline` 4).
- Depends on: Task 3.
- Acceptance: spec mục 4; test matrix _baseline hợp lệ_, _kho đủ chỗ_ (gồm RB1–RB3 của `-mf1`), _GH-1 vô tình_; Notion 0 seat gán, 1Password Trống 0.
- Verify: `pnpm exec jest src/cli/seed/steps/catalog.steps.spec.ts src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Checkpoint A

Kiểm tra nhanh §4.5 xanh; `pnpm exec jest src/cli/seed` xanh; tự review diff theo spec mục 1–4. Commit `feat(qd103-w7): seed-demo-v4 P1`.

### Phase 2 — ngân sách MF-4, mốc SBF-20

### Task 5: ngân sách năm `Y` — sáu phòng duyệt, DES yêu cầu sửa, LGL số liệu nền

- Files: `fixture/shared-demo-v4/finance.ts`, `steps/finance.steps.ts` (+ spec: `budget.year` nhận trạng thái đích mỗi phòng `APPROVED` |
  `CHANGES_REQUESTED` | `BASELINE_APPROVED`; dòng có `lineType`/`priorityRank`/`zbb`; đã có đề xuất/phiên bản của (Cost Center, năm) ⟹ `present`),
  `fixture/shared-demo-v4.spec.ts`.
- Depends on: Task 4.
- Acceptance: spec mục 5 bảng `Y` (MKT 240.000, SAL 290.000); test matrix _ba kết quả ngân sách_ (bất đẳng thức gồm `spent` tối đa tới 31/12 tính từ
  seat nền của fixture, `held`, `pending`).
- Verify: `pnpm exec jest src/cli/seed/steps/finance.steps.spec.ts src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Task 6: kỳ `Y+1` — mở, DAT, Trần đủ tập phòng, phát hành, trạng thái từng phòng

- Files: `fixture/shared-demo-v4/finance.ts` (`nextCycle`: Trần năm, dự phòng kho, Trần từng phòng **gồm ADMIN 0**; `nextYear`: đích mỗi phòng, ITO
  20M), `steps/finance.steps.ts` (step `budget.next-cycle`: `budgetCycleOpen` → `departmentCreate` DAT (Super Admin) → `costCenterCreate` CC-DAT →
  đọc tập phòng từ `/departments` (như `finance.steps.ts:356-367`) → phòng thiếu số trong fixture ⟹ `conflict` → `budgetDepartmentCeilingsSet` →
  `budgetCyclePublish`; step `budget.next-year`: ENG `SUBMITTED`, MKT `SENT`, SAL `APPROVED`, ITO trả lại), `steps/organization.steps.ts` (DAT là phòng
  của step tài chính, không của `org.*`), `fixture/shared-demo-v4.spec.ts`.
- Depends on: Task 5.
- Acceptance: spec mục 5 bảng `Y+1`; test matrix _B2/B4 bất đẳng thức_.
- Verify: `pnpm exec jest src/cli/seed/steps/finance.steps.spec.ts src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Task 7: mốc `SBF-20` và tham số

- Files: `fixture/shared-demo-v4/catalog.ts` (`renewalInDays`, `noticePeriodDays`, `autoRenew`, `nextBillingDate` khi gói năm trả tháng — không có
  trong v4; Canva 25 ngày), `fixture/shared-demo-v4.spec.ts` (đọc mặc định từ `src/modules/operating-parameters/parameter-definitions.policy.ts`).
- Depends on: Task 4.
- Acceptance: test matrix _tham số_ (đỏ ở `D0` = {Adobe, Zoom, Loom}; Figma, Canva điểm mở chưa đỏ; Zoom qua hạn chót; Jira/Notion/GitHub/Canva điểm
  mở; Slack chưa mở).
- Verify: `pnpm exec jest src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Checkpoint B

Kiểm tra nhanh §4.5 xanh; `pnpm exec jest src/cli/seed` xanh; tự review theo spec mục 5–7. Commit `feat(qd103-w7): seed-demo-v4 P2`.

### Phase 3 — wrapper, consumer, tài liệu, integration, flow

### Task 8: wrapper — API mới khởi động ngay trước apply

- Files: `scripts/ops/seed.sh` (nhánh không reset: `compose restart api` + chờ ready trước `seed_call apply`; nhánh reset giữ `up -d api worker` trước
  apply), `scripts/verify/seed.test.mjs`, `scripts/verify/seed-local.test.mjs` (khẳng định thứ tự hiện có: `dist/main` khởi động mới ngay trước apply
  và dừng sau; không đổi `seed-local.mjs` trừ khi test lộ lệch).
- Depends on: Checkpoint B.
- Acceptance: test matrix _lượt job đầu sau apply_; mọi chốt an toàn cũ của wrapper giữ nguyên (test hiện có xanh). Không thêm bước dừng/khởi động worker.
- Verify: `node --test scripts/verify/seed-local.test.mjs scripts/verify/seed.test.mjs`.

### Task 9: chuyển consumer sang v4, xóa v3

- Files: `test/support/flows/flow-template.ts`, `test/support/flows/flow-actors.ts`, `src/modules/installation/public/demo-accounts.api.spec.ts`,
  `src/infrastructure/database/session-advisory-lock.spec.ts`, `src/cli/seed/*.spec.ts` còn import v3; xóa `src/cli/seed/fixture/shared-demo-v3/`,
  `src/cli/seed/fixture/shared-demo-v3.spec.ts`.
- Depends on: Task 8.
- Acceptance: `grep -rn "shared-demo-v3\|SHARED_DEMO_V3" src test scripts` không còn kết quả; flow hiện có xanh **không nới assertion** (nếu flow
  dựa vào dữ liệu v3 đã đổi, sửa phần dựng/tra cứu dữ liệu của flow, giữ nguyên điều nó kiểm; ghi từng file vào cột _Giới hạn_ của _Verification and
  handoff_).
- Verify: `pnpm exec jest src/cli/seed src/modules/installation/public/demo-accounts.api.spec.ts src/infrastructure/database/session-advisory-lock.spec.ts`;
  `pnpm test:flows -- test/flows/f0-auth-roles.flow-spec.ts test/flows/mf1-group-request.flow-spec.ts test/flows/mf1-request-contract.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf2-offboarding.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts test/flows/mf4-budget.flow-spec.ts test/flows/sbf20-adjustment.flow-spec.ts test/flows/sbf20-adjustment-edges.flow-spec.ts test/flows/mf5-ghost-seat.flow-spec.ts`
  (tên file theo W5/W6 sau PASS; đây là consumer trực tiếp của dataset nên phải chạy đủ).

### Task 10: integration seed

- Files: `test/integration/installation/seed.integration-spec.ts` (+ đo thời gian apply, in ra log test), `seed-rerun.integration-spec.ts` (+ ca chạy
  lại sau khi chạy rút gọn DM4-04, DM4-11, DM4-16, DS20-04, DS20-13 qua API), `seed-calendar.integration-spec.ts` (ngày giả chỉ cho step không chạm trigger
  đồng hồ DB — danh sách ở _Before coding_), `seed-bootstrap.integration-spec.ts` (đếm), `test/integration/_serial/seed-check-runtime.integration-spec.ts`.
- Depends on: Task 9.
- Acceptance: các dòng integration của test matrix (seed thật, plan không ghi, chạy lại, chạy lại ngày khác, biên năm, runtime role); thời gian apply ghi
  vào _Verification and handoff_; > 4 phút ⟹ dừng, báo chat review (spec mục 8).
- Verify: `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts test/integration/installation/seed-calendar.integration-spec.ts test/integration/installation/seed-bootstrap.integration-spec.ts`;
  `pnpm test:integration:serial -- test/integration/_serial/seed-check-runtime.integration-spec.ts`.

### Task 11: flow kịch bản `@MF4`, `@SBF20`

- Files: `test/flows/demo-mf4.flow-spec.ts` (mới, `describe('… @MF4 @DEMO')`, DM4-01 → DM4-27), `test/flows/demo-sbf20.flow-spec.ts` (mới, `@SBF20 @DEMO`,
  DS20-01 → DS20-24; DS20-17 trong `describe` world riêng), `test/support/flows/flow-world.ts` (đăng ký pass còn thiếu: đóng năm, khoản cam kết 01/01,
  `subscription-adjustment`, `subscription-renewal`, `seat-cost`, `kpi4` — chỉ khi W4/W5 chưa đăng ký), `test/support/flows/demo-scenarios.ts` (mới: tra
  persona/ID kịch bản → id thật từ dataset; khóa _Khi_ của mỗi dòng; hàm kết quả _theo `D0`_ cho DM4-13, DS20-20, DS20-13 (có SV-HD5 hay chưa)).
- Depends on: Task 10.
- Acceptance: test matrix _MF-4 từng bước_, _SBF-20/SBF-11 từng bước_; mỗi `it` mang đúng ID dòng bảng; dòng có ngày chạy theo thứ tự `scenarioDay`
  (sắp lúc chạy), dùng `FlowClock.jumpTo` rồi `sweep`; ghi trước khi nhảy đồng hồ (CR-1 của `flow-clock.ts`); không `FlowClockError`.
- Verify: `pnpm test:flows -- test/flows/demo-mf4.flow-spec.ts test/flows/demo-sbf20.flow-spec.ts`.

### Task 12: README fixture, hướng dẫn, kiểm bảng kịch bản

- Files: `fixture/shared-demo-v4/README.md` (bảng phòng, người/tài khoản, thuê bao + mốc, ngân sách `Y`/`Y+1`, _Diễn biến theo ngày_ gồm giới hạn tháng
  12, _Lượt job đầu_ với thời gian apply thật), `docs/guides/seed.md` (fixture v4, _Lịch và giới hạn_, runbook reset: API khởi động lại trước apply,
  chờ 5 phút trước khi demo MF-5), `docs/guides/huong-dan-dev-moi.md`, `src/cli/seed/fixture/shared-demo-v4.spec.ts` (README khớp fixture; mọi
  `operationId` của bảng kịch bản ở ba spec có trong `openapi.json` export — đọc từ hằng `DEMO_SCENARIO_OPERATIONS` trong
  `test/support/flows/demo-scenarios.ts`; hằng `REMOVED_OPERATIONS` (DM1-42 `budgetCommitmentInvoiceRecord`) phải **vắng** trong `openapi.json`).
- Depends on: Task 11.
- Acceptance: test matrix _README_; DoD mục tài liệu.
- Verify: `pnpm rules:format` rồi `pnpm rules:check`; `pnpm exec jest src/cli/seed/fixture/shared-demo-v4.spec.ts`.

### Checkpoint C

Kiểm tra nhanh §4.5 xanh; test theo file của Task 8–12 xanh; báo cáo ghi "`pnpm check` và test toàn bộ CHƯA chạy". Commit
`feat(qd103-w7): seed-demo-v4 P3`. Sau đó mới giao `qd103-seed-demo-v4-mf1`.

## Verification and handoff

| Lệnh / kiểm tra AC        | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                      |
| ------------------------- | --------------------- | ----------------- | -------------------------------------------- |
| (chưa chạy)               | —                     | —                 | Owner reset VPS sau release; full suite ở W9 |
| thời gian apply (Task 10) | —                     | (điền số giây)    | > 240 s ⟹ báo chat review (Q-99)             |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; mọi điều chỉnh flow consumer ghi ở cột _Giới hạn_ trên.
- [ ] Runbook reset VPS cập nhật; phần chưa kiểm trên VPS ghi rõ.
- [ ] Giao chat review (R2) SHA ba commit P1–P3.
