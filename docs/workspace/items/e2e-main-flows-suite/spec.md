# Spec: e2e-main-flows-suite — một suite E2E cho 5 main flow (API thật, đăng nhập thật, DB local riêng, đồng hồ điều khiển)

- Phụ trách: AI/dev được Owner giao implement suite; người nhận tiếp quản spec/plan/test-plan và evidence.
- Thiết kế ban đầu bởi: AI (lượt "FE nối 5 main flow", 05/11/2026) theo
  [BRIEF](../../../reviews/qd96-100-alignment-2026-11-05/fe-batch/BRIEF.md) và yêu cầu Owner cùng ngày.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026 (`Requiments/Quy trình và chính sách theo main flow.md` 53 bước,
  `Reviews/main-flows-api-contract-review-2026-11-05/README.md` bản đồ bước → API, `QĐ-96`→`QĐ-101`), BE `808318a4`
  (branch `feat/qd96-100-alignment`). Contract đích: spec `qd96-100-*` (sau sửa) và
  [G7 DESIGN](../../../reviews/g7-usage-design-2026-11-05/DESIGN.md) cho MF-5.
- Nhóm roadmap: không thuộc G — bó finding `qd96-100-alignment` (lượt FE nối 5 main flow).
- [Kế hoạch](plan.md) · [Test plan — kịch bản](test-plan.md).

## Business outcome

Sau lát này, một lệnh `pnpm test:flows` chạy 5 main flow (cộng nhánh phụ bắt buộc) qua **HTTP API thật**, đăng nhập thật
từng vai trên **PostgreSQL local riêng** đã migrate + seed dataset demo, điều khiển được "hôm nay" để kiểm các mốc thời gian;
chạy được từng phần theo batch hạng mục đã implement. Kết quả là bằng chứng nghiệm thu CP-1…CP-4 của bộ `qd96-100-*` và
danh sách BLOCKER còn lại; không thay CI hiện có.

## Sizing decision

- Container: bó finding `qd96-100-alignment` — lượt "FE nối 5 main flow" (giao việc Owner 05/11/2026).
- Mode: `technical-enabler`.
- Outcome and owner: runner `flows` (`test/flows/**`, `test/support/flows/**`, `test/config/jest.flows.cjs`); không sở hữu
  module `src` nào; chỉ đọc qua HTTP và SQL chỉ-đọc.
- Boundaries: không route, không migration, không đổi hành vi `src`; một runner mới, harness test, một script `package.json`,
  một mục trong `scripts/verify/runners.mjs` và `test/README.md`.
- Not larger: không thêm job CI (Owner quyết sau khi có số đo), không viết lại `test/e2e` smoke, không kiểm từng biên đơn vị
  (thuộc unit/http/integration của từng hạng mục).
- Not smaller: harness (DB seed, đồng hồ, tài khoản) vô nghĩa nếu không có kịch bản; kịch bản không chạy được nếu thiếu harness.
  Kịch bản được thêm dần theo batch (plan Phase 2–4), không tách hạng mục.
- Siblings: mọi `qd96-100-*` của phạm vi B; `qd96-100-seed-demo-v3`; `g7-vendor-usage-import-identity`,
  `g7-g1-g2-recommendations`, `g7-device-registry-acknowledgement`, `c1-contract-list-and-fields`.
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                                    |
| ----- | ------------ | -------- | ------------------------------------------------------------------------------------- |
| —     | E2E-FLOWS-01 | n/a      | gỡ chặn nghiệm thu CP-1…CP-4 của `qd96-100-seed-demo-v3` và các hạng mục `qd96-100-*` |

## Supporting references

`test/README.md` (năm tầng; E2E smoke "không kiểm từng nhánh lỗi" ⟹ suite này là runner riêng), `test/support/README.md`,
`test/e2e/paid-request-to-seat.e2e-spec.ts` (mẫu hành trình), `test/integration/installation/seed*.integration-spec.ts` (mẫu
chạy `runSeed` trong tiến trình, giả `Date`), `test/support/{http-test-app,disposable-database,migrated-template,pretend-today,
status-harness,renewal-harness,api-accounts}.ts`, `docs/rules/operational-commands.md`, `ITEMS.md` mục 1/6 (số `#n`, track).

## Explicit out of scope

- Kiểm biên từng luật (0/13 tháng, mọi mã lỗi, race tranh ngân sách): ở test unit/http/integration của hạng mục chủ. Suite
  chỉ lấy **một** ca đại diện cho mỗi loại nhánh (sai vai, khác phòng, tự duyệt, retry, field cũ ⟹ 422, mốc thời gian).
- Mock bước nghiệp vụ: cấm. Thay thế duy nhất được phép là hạ tầng ngoài BE: `FakeObjectStorage` cho bytes tệp
  (`ObjectStoragePort`), SMTP không gửi (chỉ đọc outbox/`in_app_notifications`), timer sweeper bị tắt (chạy tay, xem mục 5).
- CI/nightly, deploy VPS, FE runtime, AI assist (QĐ-69), `QĐ-100l`/`QĐ-100ah` (chờ mentor — không kịch bản trưởng phòng tự xin
  cho chính mình).

## Dependencies and blockers

- Cần trước khi viết code: không (Phase 1 chạy được trên HEAD hiện tại với kịch bản `@B0`).
- Mỗi kịch bản chỉ được bật khi **mọi** hạng mục ghi ở cột `Item` của bước đã implement; batch xem mục 7.
- **BLOCKER** (API/thiết kế chưa có — không mock, không skip để gọi flow là xong; danh sách đầy đủ ở test-plan mục 6):
  MF-4 B0–B3 + loại dòng/ZBB (`H1`); MF-3 nhãn T1–T4, chồng lấn 5 ngày, hạn Request thay thế bị chặn (`H6`); chuyển seat kèm
  chi phí/giữ seat (`H2`); loại Request mới (`H4`); K4 cấp/thu hồi (`a05-k4-*`); MF-5 usage/danh tính/G1–G4/quyết ghost seat/
  credential thiết bị (`g7-*` chưa implement, S1b/S4b chưa có spec); MF-5 mốc ND theo vai người nhận (#10 — chat MF-5, chưa có spec
  trong repo); hóa đơn/tiết kiệm thực (`H7`). Trưởng phòng sở hữu xác nhận (#9) **không** là BLOCKER: route có, contract đích ở
  `qd96-100-subscription-owner-confirmation` (draft).
- Dữ liệu: seed mặc định của `DEMO_FIXTURES` (`shared-demo-v2` tới khi #28 merge, sau đó `shared-demo-v3`); kịch bản cần bản
  ghi chỉ có ở v3 (R10–R16, OFF1–3, MOV1–2, CTR1) mang tag `@B4`.

## Ownership: module, data, API

- Không module `src`. File mới: `test/config/jest.flows.cjs`, `test/config/flows-global-setup.ts`,
  `test/config/flows-global-teardown.ts`, `test/support/flows/{flow-world,flow-clock,flow-actors,flow-facts,flow-calls}.ts`,
  `test/flows/mf{1..5}-*.flow-spec.ts`, `test/flows/f0-auth-roles.flow-spec.ts`.
- Sửa: `package.json` (`test:flows`), `scripts/verify/runners.mjs` (runner `flows`), `test/README.md` (bảng tầng + mục chạy),
  `test/support/README.md` (harness mới). Bảng đọc: chỉ `SELECT` qua `ctx.sql`; không ghi SQL dựng dữ liệu nghiệp vụ.

## Behavior and design

### 1. Lệnh và runner

| Lệnh                                            | Làm gì                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test:flows`                               | `jest --config ./test/config/jest.flows.cjs --runInBand` — mọi kịch bản |
| `pnpm test:flows -- -t "@B[0-1]"`               | chỉ kịch bản thuộc batch ≤ B1 (tag trong tên `describe`)                |
| `pnpm test:flows -- test/flows/mf2-offboarding` | một flow                                                                |
| `pnpm test:flows -- -t "F2-03"`                 | một kịch bản                                                            |

`jest.flows.cjs`: `roots ['<rootDir>/test/flows']`, `testRegex '\.flow-spec\.ts$'`, `testTimeout 120000`, `globalSetup
flows-global-setup.ts`, `globalTeardown`, `setupFilesAfterEnv integration-setup.cjs` (giữ timeout DB, `TEST_PASSWORD_HASHER=fast`),
reporter timing `{ runner: 'flows' }`. In band vì đồng hồ giả và một cụm DB. Không thêm vào `pnpm check` hay CI. Mỗi file
≤ 800 dòng (gate `test-size`); mỗi flow lớn tách theo nhóm kịch bản.

### 2. Database local riêng

- Cùng cơ chế integration (`test/README.md` mục _Database_): PostgreSQL 17 Docker `slm-test-db` ở `127.0.0.1:55432`, role
  `ci_integration LOGIN CREATEDB` không superuser; biến bắt buộc `TEST_DATABASE_ADMIN_URL`; test không đọc `.env`. Thiếu biến ⟹
  global setup dừng với thông báo, không chạm DB nào khác (`checkDisposableUrl`, marker `disposable_test_run`).
- `flows-global-setup.ts`: (1) `prepareMigratedTemplate()` — `prisma migrate deploy` một lần (H7-RUN-01);
  (2) **mẫu đã seed**: clone mẫu migrate thành `slm_<run>_flows_seeded`, dựng app (`createHttpTestApp({ database })`),
  `InstallationApi.install(INSTALLATION, …)`, `runSeed({ mode: 'apply', fixture: <mặc định>, environment: 'LOCAL_TEST' })` qua
  HTTP thật như `seed.integration-spec.ts`; yêu cầu `report` không `conflict`, exit 0; đóng app; ghi tên vào biến
  `SLM_TEST_FLOWS_SEEDED_TEMPLATE`. (3) Mỗi file flow `CREATE DATABASE … TEMPLATE <seeded>` (cơ chế `migratedTemplate`), nên
  file độc lập và chạy lại không cần reset tay. `globalTeardown` xóa mẫu; `afterAll` của file xóa bản clone.
- Reset = chạy lại lệnh. Không trỏ DB dev/VPS. Mật khẩu: Super Admin `SEED_PASSWORD`, tài khoản demo một mật khẩu test cố định
  (truyền vào `runSeed.secrets`, không ghi log).

### 3. Seed và dữ liệu từng kịch bản

- Dataset = fixture mặc định của seed (v2 → v3). Hạng mục làm vỡ apply v2 (#11, #13, #16…) đã phải sửa v2 để
  `seed.integration-spec` xanh, nên suite luôn seed được. Danh tính 23 người + 8 phòng giữ nguyên v2 → v3 (spec #28 mục 1):
  kịch bản dùng mã `DS1-*` (`FlowActors.as('NV-ENGH')`), không dùng id cứng.
- Kịch bản tự tạo dữ liệu mới qua API đúng vai (Request, hồ sơ nghỉ việc, điều chuyển, phiên bản ngân sách). Số tiền không
  phụ thuộc số của seed: ngân sách "kiểm soát" do kịch bản MF-4 F4-01 tạo cho một phòng mới `FLW-<file>` (SA tạo phòng +
  Cost Center + trưởng phòng + 3 nhân viên qua API, `createActivatedAccount`), với `base = 1,5p`, `reserve = 1p` (p = đơn giá
  tháng của gói đọc từ `GET /requestable-plans`) ⟹ ba kết quả ngân sách xác định được mà không đoán giá.
- Bảng dữ liệu cần cho từng kịch bản: test-plan mục 2.

### 4. Đăng nhập thật theo vai

`FlowActors`: `signIn(code)` = `POST /api/v1/auth/login {email, password}` → giữ `accessToken`, `refreshToken`,
`refreshExpiresAt`; `as(code)` trả header `Authorization`. Sau mỗi lần nhảy đồng hồ: `POST /auth/refresh {refreshToken}` (kiểm
xoay vòng: refresh cũ ⟹ 401), quá `refreshExpiresAt` thì đăng nhập lại. Vai lấy từ seed: Employee `NV-DEV1..3`, Manager
`NV-ENGH/SALH/MKTH/DESH/FINH`, IT Admin `NV-ITA1/ITA2`, Finance `NV-FIN1`, Spending Approver `NV-CEO`, Super Admin
(installation). Không token tự ký (`principal(...)` của test HTTP không dùng ở đây).

### 5. Đồng hồ và job — cơ chế ít xâm lấn nhất

BE **không có** Clock provider chung: ngày nghiệp vụ đọc `new Date()` qua `OrganizationContextService.businessToday(now)` /
`businessDateAt` (`src/modules/organization/organization-context.service.ts:19`), và mọi service sweep đã nhận `now: Date`
(`TransferReviewOverdueService.noticeOverdue(now)`, `SubscriptionRenewalSweepService.sweep(now)`, `ExpiryReminderService
.noticeDue(now)`, `StepSlaSweepApi.sweep(now)`, `RequestStatusProjectorApi.project(now)`, `HandoverOverdueService`,
`NoticeOverdueService`, `LeaveOverdueService`). Chọn:

1. **Giả riêng `Date` trong tiến trình test** — `jest.useFakeTimers({ doNotFake: [mọi timer, nextTick, hrtime, performance…],
now })`, đúng tiền lệ `test/integration/installation/seed-calendar.integration-spec.ts:63`. App Nest chạy cùng tiến trình nên
   HTTP, guard, Prisma `@default(now())` đều thấy cùng "hôm nay". `FlowClock.jumpTo(day)` / `jumpWorkingDays(n)` (dùng
   `addWorkingDays` của `src/core/working-days.ts`, giờ 12:00 `Asia/Ho_Chi_Minh`) **chỉ tiến**, từ chối lùi.
2. **Job chạy tay**: `FlowClock.sweep('transferReview' | 'offboardingBlock' | 'revocationOverdue' | 'renewal' | 'expiry' |
'sla' | 'projection' | …)` gọi service với `now = clock.now()`; không gọi lớp `*Sweeper`.
3. **Tắt timer**: `createHttpTestApp({ providerOverrides })` thay mọi lớp `*Sweeper`/`*.job.ts` của `AppModule` bằng giá trị
   rỗng (test-only, không sửa `src`), để timer thật 5 phút không chạy song song với đồng hồ giả. Worker (`src/worker`) không
   nằm trong `AppModule`; projection chạy tay như `StatusHarness.project()`.
4. **Seam test cần thêm (yêu cầu cho hạng mục chủ, không sửa spec của họ ở lượt này)**: sweeper mới của #1
   (`RevocationOverdueSweeper`), #2/#3 (`OffboardingBlockSweeper`), #18 (`sweep`), #21 (nhắc cửa sổ) phải tách service có
   `sweep(now: Date = new Date())` khỏi lớp timer — đúng mẫu hiện có. Không cần Clock provider/endpoint admin.
5. **Giới hạn đồng hồ DB**: PostgreSQL giữ đồng hồ thật. Trigger đọc `now()` cho ngày nghiệp vụ:
   `employee_placements_keep_one` (`20261103130000`), cấp vai Spending Approver/đầu phòng (`20261102082906`,
   `20261016190000`), announcement (`20261024140100`). Luật CR-1: mọi ghi tạo dữ liệu nền làm ở **D0 thật** trước khi nhảy;
   sau khi nhảy chỉ đọc, sweep, đăng nhập và ghi không chạm các trigger trên (thu hồi, khóa tài khoản, bàn giao, đã nghỉ,
   duyệt chi). Task 1 của plan liệt kê lại trigger bằng grep migration lúc implement.

### 6. Khẳng định

Mỗi bước: status + `error.code` của envelope; trạng thái qua `GET` đúng vai; hiệu ứng DB qua `SELECT` (bảng/cột ghi trong
test-plan); thông báo qua `in_app_notifications` sau `sweep('projection')`; Audit qua `audit_events.action`. Field cũ ⟹ 422
**và** số dòng bảng đích không đổi (`flowFacts.count(table)` trước/sau). Retry ⟹ cùng kết quả, không dòng trùng.

### 7. Batch và tag

Tên `describe` = `F<flow>-<nn> <mô tả> @MF<n>` (không tag batch). Mỗi bước là một `it` tên `<bước> #<item…> @B<k>`, với
k = max(batch của item ở bước, k của bước trước nó trong kịch bản) ⟹ lọc `-t "@B[0-k]"` chạy đúng **phần đầu** của từng kịch
bản mà mọi item đã có. Tag ở test-plan là batch của bước cuối (kịch bản đầy đủ). Batch của item:

| Batch | Hạng mục (`ITEMS.md`)                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `B0`  | contract hiện có, không item                                                                                                                        |
| `B1`  | #1 revocation-deadline, #2 departure-day-block, #3 block-now, #4 sender-rules, #5 sla, #6 three-outcomes, #18 transfer-defaults, #23 quantity-guard |
| `B2`  | #7 reserve, #8 visibility, #11 finance-path, #12 override, #13 revision/high-value, #14 reserve/floor, #15 term, #16 year-without-date, #24 grounds |
| `B3`  | #17 replacement, #19 head-group, #20 end-date, #21 renewal-window, #22 notifications, #29 employee-detail                                           |
| `B4`  | #28 seed v3 (bản ghi chỉ có ở v3)                                                                                                                   |
| `B5`  | MF-5/G7: #9, #10 (chat MF-5), `c1-*`, `g7-*`                                                                                                        |

Chạy cộng dồn `-t "@B[0-k]"`. Một flow chỉ được gọi **hoàn tất** khi mọi kịch bản của nó chạy xanh ở batch cuối và danh sách
BLOCKER của flow rỗng. BLOCKER không có `it.skip`/`it.todo`: chỉ ghi ở test-plan.

### 8. Không áp dụng

Migration, route, khóa/transaction mới: không áp dụng (suite chỉ gọi API). Collection `GET` mới: không áp dụng.

## Test matrix

| AC / rủi ro       | Tình huống                                           | Cấp test | Kết quả mong đợi                                                    | Bằng chứng sau implement |
| ----------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------- | ------------------------ |
| E2E-FLOWS-01 lệnh | `pnpm test:flows` không có `TEST_DATABASE_ADMIN_URL` | flows    | dừng ở global setup, thông báo rõ, không DB nào bị tạo              | verified-local: dừng với thông báo, không tạo database |
| seed              | global setup                                         | flows    | mẫu seeded tồn tại, report seed không `conflict`; teardown xóa sạch | verified-local: 24 bước `done`, exit 0; teardown xóa mẫu |
| đồng hồ           | `jumpTo` lùi ngày                                    | flows    | harness ném lỗi trước khi gọi API                                   | verified-local: `f0-auth-roles` (FlowClockError, ngày không đổi) |
| timer tắt         | file chạy > 5 phút                                   | flows    | không sweep nào tự chạy (Audit `SYSTEM` chỉ xuất hiện sau `sweep`)  | verified-local: `f0-auth-roles` đo 300 ms thật không tăng Audit `SYSTEM`; chưa đo 5 phút |
| discovery         | `pnpm test:discovery`                                | gate     | runner `flows` liệt kê đúng `test/flows/*.flow-spec.ts`             | verified-local: `flows 5 spec file(s)` |
| kịch bản          | 31 kịch bản ở [test-plan](test-plan.md)              | flows    | xanh theo batch đã implement; BLOCKER ghi riêng                     | verified-local Đợt 1: 9 kịch bản, 34 test xanh (xem _Changes and acceptance_); còn lại chờ |

## Definition of Done

- [ ] `pnpm test:flows -- -t "@B0"` xanh trên HEAD có harness; mỗi batch sau xanh khi đủ item, ghi lệnh/revision/output ở plan.
- [ ] `pnpm test:discovery`, `pnpm test:gates` (test-size, test-support-structure, parallel-safety), `pnpm lint`,
      `pnpm typecheck` xanh; `test/support/flows/**` không chứa assertion/hook.
- [ ] `test/README.md`, `test/support/README.md` mô tả runner và harness; BLOCKER còn lại ghi ở test-plan mục 6.
- [ ] Không sửa `src`, migration, CI; phần chưa kiểm chứng ghi rõ.

## Open questions

- **OQ-E2E-1 — CI.** A (khuyến nghị): chỉ chạy tay/nightly sau khi có số đo; B: thêm job `flows` trên push `main`. Owner chọn.
- **OQ-E2E-2 — Đồng hồ DB.** Nếu sau này cần ghi dữ liệu nền ở ngày tương lai (vd. đóng năm 4.11 kèm đổi vai), cần
  PostgreSQL có `faketime` hoặc tham số ngày ở trigger. Hiện chọn CR-1 (ghi ở D0, nhảy chỉ cho đọc/sweep/ghi không chạm trigger).

## Changes and acceptance

Chỉnh 05/11 theo review main flow: bản đầu (`draft`) — thiết kế suite E2E 5 main flow theo yêu cầu Owner; chưa implement,
chưa chạy, chưa nghiệm thu.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Test-plan F1-01 bước 3, F1-02 và F4-01 sửa theo. Không viết lại phần khác.

05/11/2026 (tối) — Đợt 1 implement xong Task 1–2 và các kịch bản `@D1`, `verified` (local, chưa commit). Chạy: `pnpm test:flows -- -t "@D1"` ⟹ 5 file, 34 test xanh (~60 s kể cả seed ~30 s).
Có: runner `flows` (`jest.flows.cjs`, `scripts/verify/run-flows.mjs` để `pnpm test:flows -- -t …` hoạt động, global setup/teardown), harness `test/support/flows/*`, `FakeObjectStorage` cho tệp ngân sách.
Kịch bản: F0-01 (`f0-auth-roles`), F1-02/F1-03/F1-04 (`mf1-request-contract`), F1-08 kèm nhà thầu R1 (`mf1-group-request`), F4-01/F4-02/F4-03 phần Đợt 1 (`mf4-budget`), F5-02 (`mf5-rightsizing`).
Lệch so với test-plan, ghi theo hành vi thật (không nới kỳ vọng nghiệp vụ): (1) trưởng phòng khác phòng và đồng nghiệp không liên quan gọi quyết nhu cầu nhận **404** `ACCESS_REQUEST.NOT_FOUND`, không 403 `NOT_THE_ASSIGNEE`; (2) gọi lại duyệt chi: 409 `SPEND.NO_SPEND_STEP`, không `ACCESS_REQUEST.STEP_NOT_PENDING`; (3) IT Admin cấp cho chính mình: tạo tác vụ được (201), **nhận việc** (`claim`) mới bị 403 `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` khi còn IT Admin khác; (4) Finance gọi duyệt chi chỉ 403 sau khi đã có bước duyệt chi (trước đó 409); (5) refresh token cũ dùng lại bị 401 và **thu hồi phiên**; (6) phiên hết hạn idle 8 giờ nên mọi cú nhảy đồng hồ ≥ 1 ngày cần đăng nhập lại; (7) _cập nhật 06/11:_ dataset có ngân sách đã duyệt của năm hiện tại và năm sau cho ENG/MKT/SAL nên Request 1–12 tháng của các phòng này đi thẳng tới duyệt chi (một Request 12 tháng giữ chỗ hai năm: `budget_commitments` 2 dòng); các Request trong suite vẫn dùng `termMonths: 1` để một dòng giữ chỗ, riêng phòng Thiết kế (không có ngân sách nào) giữ ca `AWAITING_FINANCE_REVIEW` của R9.
Chưa viết (chờ, không `it.skip`): G7-01 (chờ chat devices/G7 báo xong việc chặn token máy theo ngày cuối; thêm bước nhân viên bị chặn ⟹ token máy 401), cùng F1-01, F1-05, F1-06, F1-07, F1-09, F1-10, F1-11, F1-12, F2-03/06/07, F3-01…04, F5-01, F5-03 (cần B1/B2/B3 hoặc BLOCKER).
Phát hiện: lúc setup đầu tiên seed dừng ở `budget.year` (422) vì `src/cli/seed/steps/finance.steps.ts` còn gửi 5 field BM-10 đã gỡ; đã sửa trong seed (cùng lượt, theo giao việc Owner), không phải bug của API.

06/11/2026 — viết nốt kịch bản chờ của chat bước 2→5, `verified` (local, chưa commit): `pnpm test:flows -- -t "@D1"` ⟹ 8 file, 52 test xanh.
Mới: `mf2-offboarding` (F2-01 có ngày cuối, F2-04 hủy trước ngày cuối, F2-05 phần từ chối khi ghi hồ sơ), `mf2-abrupt-departure` (F2-02 `BLOCK_NOW`, F2-05 phần các bước sau), `mf3-transfer` (F3-05). Harness: thêm pass `organizationChange` (`OrganizationChangeService.announceDue`) cho đồng hồ, vì điều chuyển có hiệu lực qua đó.
Lệch so với test-plan (test-plan viết trước bước 2→5, API đã đổi; ghi theo hành vi thật): (1) body ghi hồ sơ dùng `accessBlockMode` (`WITH_LAST_DAY` | `BLOCK_NOW`), không `blockMode`/`abrupt` (`abrupt` ⟹ 422); (2) không còn pass `offboardingBlock`, `ACCOUNT_LOCK_OVERDUE`, `REVOCATION_OVERDUE`, `due_on`, `not_before` của tác vụ thu hồi: chặn truy cập tính theo ngày ngay khi đăng nhập/làm mới/gọi API (dòng `employee_access_blocks.blocked_from` = ngày cuối + 1, hoặc hôm nay với `BLOCK_NOW`), không phiên nào bị thu hồi bằng `ACCESS_BLOCKED`; (3) đăng nhập sai/bị chặn trả 401 `AUTH.INVALID_CREDENTIALS`, token đang có trả 401 `INVALID_ACCESS_TOKEN`; (4) IT chỉ khóa tài khoản/mở thu hồi khi đã bị chặn (409 `CASE_NOT_BLOCKED` trước đó) và phải ghi khóa trước hoặc cùng lúc (`ACCOUNT_LOCK_NOT_RECORDED`); nguồn tác vụ thu hồi `DEPARTURE` / `ABRUPT_DEPARTURE`; (5) IT ghi hồ sơ ⟹ 403 `AUTHORIZATION.FORBIDDEN`; (6) F3-05: quyết định chỉ còn `STILL_NEEDED`/`NOT_NEEDED`, luôn có `reason`; `NEEDS_NEW_TOOL`, `newToolNote`, `termMonths` ⟹ 422; trưởng phòng cũ và IT quyết ⟹ 403 `TRANSFER_REVIEW.NOT_REVIEWER`, trưởng phòng cũ đọc danh sách ⟹ 404; không còn Request thay thế (`REPLACEMENT_REQUEST_OPEN`), `STILL_NEEDED` đổi một lần sang `NOT_NEEDED` mở tác vụ thu hồi, sau đó 409 `NOT_OPEN`; (7) chỉ DEV1 giữ ghế trong dataset nên F2 dùng DEV1 cho các ca cần quyền, DEV2/DEV3 cho ca không quyền; (8) phiên idle 8 giờ nên mọi cú nhảy ≥ 1 ngày cần đăng nhập lại.
Chưa phủ vì API đã đổi hoặc chờ hạng mục khác: bước 3 của F2-01 (xác nhận bàn giao của trưởng phòng — dataset không có trưởng phòng nghỉ việc), F2-03/F2-06/F2-07, F3-01…F3-04.

06/11/2026 (sửa theo `FIX-DOT-1` mục Chat 4, `verified` local): D-M3 — `mf4-budget` so khớp chính xác ngân sách (tổng 33 000 000, dự phòng 3 000 000, Cost Center, phiên bản), kiểm tra qua `budget-check` của Finance thay vì chuỗi, bỏ nhánh `created.status === 201 ? … : created` và `[409, 422]`, ghim 422 `VALIDATION_ERROR` / 403. D-M4 — `f0-auth-roles` thêm vai gọi ngoài vai ⟹ 403 `AUTHORIZATION.FORBIDDEN` (4 route) và tài khoản INVITED đăng nhập ⟹ 401 cùng mã với sai mật khẩu; `mf4-budget` thêm `costCenterId`/`currency` ⟹ 422 với đúng key bị từ chối; file mới `mf5-rightsizing-edges` (giảm sai số ghế, trường lẫn lựa chọn, hủy phải xác nhận sau cảnh báo, trưởng phòng khác 404, đề xuất lỗi thời đóng `STALE` rồi đề xuất lại, phòng không còn trưởng phòng ⟹ `NO_HEAD` + báo Super Admin). A-H1 (IT Admin đồng thời là trưởng phòng) không dựng được qua API vì DB chặn (`role_grants_one_role_per_account`, `role_grants_manager_revoke_guard`), nên chỉ có integration test tắt trigger để dựng. D-L — đồng hồ giả bắt đầu không trước giờ thật (muộn hơn trưa thì lấy giờ thật), bản sao DB bị bỏ nếu dựng app lỗi. G7-01 vẫn chờ Chat 3 xác nhận xong G-ACC (định nghĩa kịch bản ở `SPEC-PLAN-DOT-1.md` §4 và mở rộng `SPEC-PLAN-DOT-2-4.md`).
