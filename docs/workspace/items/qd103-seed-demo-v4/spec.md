# Spec: qd103-seed-demo-v4 — dataset demo `shared-demo-v4`: tổ chức, kho dùng chung, ngân sách MF-4, thuê bao SBF-20 và bảng kịch bản demo cho W9

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI (subagent của chat review `SEP-Start 114`), đợt W7 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W7 `design-audit-w7.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 mục 3.4 _Hồ sơ tổ chức mục tiêu_, 2.4 `TC-1`/`TC-2`, 5.10.1 `BR-MF1-01`→`BR-MF1-09`, `BR-MF4-01`→`BR-MF4-06`,
  `BR-MF5-01`→`BR-MF5-04`, 6.3, `FR-9.5`; QT v1.7 A.4, B (MF-1, MF-4, MF-5), C.1, C.2), BE `d9e83c86` (nhánh `feat/qd103-108-mf145` sau W6 PASS).
  Câu tạm chọn: Q-97 → Q-110 ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md), mục _Câu tạm chọn khi thiết kế W7_).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W7).
- [Kế hoạch](plan.md). Hai hạng mục cùng đợt: `qd103-seed-demo-v4-mf1`, `qd103-seed-demo-v4-mf5`.

## Business outcome

Sau một lần reset DB demo, `pnpm ops:seed apply` (mặc định `--fixture shared-demo-v4`) dựng một tổ chức đúng quy mô BRD 3.4 (120 người, 15 SaaS) với
dữ liệu tuân `QĐ-103` → `QĐ-108`: mỗi (ứng dụng, gói) một thuê bao kho dùng chung, ngày tương đối so với ngày chạy, ngân sách năm hiện tại đã khóa và
kỳ năm sau đang ở từng bước B1 → B5, thuê bao ở đúng các mốc của `SBF-20`; cùng bảng _Kịch bản demo_ để W9 gọi API từng bước của MF-1, MF-4, MF-5 (kể cả
ca từ chối) trên chính dữ liệu đó. Kiểm bằng unit fixture, integration seed/seed-rerun/seed-calendar trên PostgreSQL + API thật, và flow `@MF4`, `@SBF20`.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W7), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: lệnh `seed` (`src/cli/seed/**`, module `installation` giữ phần tài khoản demo); dữ liệu ghi qua HTTP API đúng vai.
- Boundaries: không route HTTP mới, không migration, không đổi luật nghiệp vụ, không đổi lịch/độ trễ job trong `src`; chỉ fixture, step, lịch tương đối, wrapper seed (API mới khởi động ngay trước apply — Q-99), README fixture, `docs/guides/seed.md`, test seed và flow.
- Not larger: kịch bản Request/K4/quyền theo vai/hóa đơn ở `qd103-seed-demo-v4-mf1`; usage, ghost seat, nghỉ việc/điều chuyển/nghỉ dài, chốt lượt job đầu ở `qd103-seed-demo-v4-mf5`.
- Not smaller: phát hành v4 (id mới, xóa v3, tổ chức, kho một thuê bao mỗi gói, ngày tương đối) phải đi cùng một lần vì đổi khóa idempotent và buộc reset DB; tách nữa thì có trạng thái trung gian không seed được.
- Siblings: `qd103-seed-demo-v4-mf1`, `qd103-seed-demo-v4-mf5` (cùng đợt, làm sau hạng mục này); `qd96-100-seed-demo-v3` (cũ, chỉ đọc).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                                                          | Coverage | Phần còn lại thuộc                     |
| ----- | ------------------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| —     | `BR-MF4-01`→`BR-MF4-06`, `BR-MF1-09` (vế kho), `SBF-20` C.2.1–C.2.4 (dữ liệu demo), BRD 3.4 | n/a      | gỡ chặn `qd103-full-verification` (W9) |

## Supporting references

`US-05-*` (MF-4: B1–B7, trưởng phòng/Finance/Người duyệt chi), `US-11-03`, `US-11-04`, `US-11-08` (điểm điều chỉnh, cảnh báo đỏ, sự cố, đóng thuê bao),
`US-12-19` (`KPI-4`). Spec các hạng mục W1–W6 `qd103-*` (task seed tối thiểu của từng hạng mục là đầu vào; danh sách ở _Dependencies_). Spec cũ chỉ đọc:
`qd96-100-seed-demo-v3` (khung fixture, runbook reset; bỏ kịch bản luật cũ).

## Explicit out of scope

- Kịch bản Request, `K4`, quyền theo vai, hóa đơn `SBF-19` (`qd103-seed-demo-v4-mf1`); usage, ghost seat, `MF-2`/`MF-3` trong dataset (`qd103-seed-demo-v4-mf5`).
- Không giả ngày trong seed: mọi bước cần thời gian trôi (ân hạn, mặc định gói tháng, đóng năm 01/01, seat-tháng, `KPI-4`) chỉ chạy trong flow bằng
  `FlowClock` (Q-100); W9 gọi tay chỉ các dòng `D0` của bảng.
- Không route chạy job thủ công, không biến env đổi độ trễ lượt đầu của sweeper (đề xuất ở W8 nếu cần — Q-99). Không tài liệu demo ở repo Docs.
- `FR-9.5` (_chạy ngay `G1`/`G2` đầu tiên sau bước 4_ và _hồ sơ đã nghỉ việc lịch sử_ trong file nhân sự bước 1 — ledger L4-23 gán W7): cần đổi `src`
  (listener sau `seatBaselineClose`, cột ngày nghỉ của import nhân sự hiện chưa có) ⟹ ngoài hạng mục seed; chat review xếp lại dòng L4-23 ở [LEDGER](../../../reviews/qd103-108-alignment-2026-11-08/LEDGER.md).
- Không đổi `MF-2`, `MF-3` ngoài việc seed dùng API hiện có.

## Dependencies and blockers

- **Điều kiện bắt đầu: W1 → W6 PASS** (tracker §5). Hạng mục dùng hợp đồng cuối của: `qd103-calendar-fiscal-year`, `qd103-shared-pool-subscription`,
  `qd103-budget-cycle-ceilings` (bước `budget.cycles`), `qd103-department-effective-year`, `qd103-budget-baseline-annual-check`,
  `qd103-budget-proposal-lines-cleanup` (dòng `lineType`/`priorityRank`/`zbb`), `qd103-budget-views`, `qd103-grant-from-shared-pool` (chặn trùng sau khi
  đóng baseline), `qd103-subscription-adjustment-point` (bỏ phòng sở hữu, khóa idempotent mới), `qd103-subscription-alerts-incidents`
  (`nextBillingDate`, `autoRenew` nullable), `qd103-remove-business-owner` (`responsibleItAdmin` của ứng dụng), `qd103-subscription-close-kpi4-savings`.
- Seed hiện tại là `shared-demo-v3` đã được W1–W6 sửa tại chỗ (task seed tối thiểu). Hạng mục này **chép trạng thái v3 cuối W6** sang v4 rồi dựng lại
  (Q-98).
- Owner reset DB demo (VPS) sau khi release chứa v4 deploy — dataset cũ không chạy tiếp được (khóa idempotent đổi).

## Ownership: module, data, API

- `src/cli/seed/**`: `fixture/shared-demo-v4/` (mới: `index.ts`, `installation.ts`, `organization.ts`, `background-staff.ts`, `catalog.ts`,
  `finance.ts`, `README.md`; các file `requests.ts`, `assets.ts`, `invoices.ts` thuộc `-mf1`, `usage.ts`, `personnel.ts` thuộc `-mf5`),
  `fixture/demo-fixture.types.ts`, `fixture/shared-demo-v4.spec.ts`, `demo-dates.ts` (mới, hàm thuần, gồm `scenarioDay` sắp dòng flow), `seed-steps.ts`,
  `seed.arguments.ts`, `seed-run.ts`, `seed-calendar.ts`, `seed.command.ts`, `seed-secrets.ts`, `steps/{organization,catalog,finance}.steps.ts`,
  `steps/baseline.steps.ts` (mới). Xóa `fixture/shared-demo-v3/` và `shared-demo-v3.spec.ts` sau khi mọi consumer chuyển (như v2 → v3).
- Wrapper: `scripts/ops/seed.sh` (nhánh không reset: khởi động lại `api` + chờ ready ngay trước apply — Q-99), `scripts/dev/seed-local.mjs` (giữ: đã
  khởi động `dist/main` mới ngay trước apply và dừng sau), `scripts/verify/seed.test.mjs`, `seed-local.test.mjs`.
- Consumer phải chuyển sang v4: `test/support/flows/flow-template.ts`, `flow-actors.ts`, `test/integration/installation/seed*.integration-spec.ts`,
  `test/integration/_serial/seed-check-runtime.integration-spec.ts`, `src/modules/installation/public/demo-accounts.api.spec.ts`,
  `src/infrastructure/database/session-advisory-lock.spec.ts`, `src/cli/seed/seed.command.ts`, `src/cli/seed/seed-secrets.ts`, mọi file
  `src/cli/seed/*.spec.ts` đang import `SHARED_DEMO_V3`.
- Không bảng, không route, không contract mới. Mọi lệnh gọi theo hợp đồng cuối của hạng mục chủ (operationId ở bảng _Kịch bản demo_).

## Behavior and design

### 1. Phát hành v4 và chạy lại an toàn

1. `id: 'shared-demo-v4'`, marker `SV`, domain `saoviet.example`, tiền `VND`, tổ chức và Super Admin giữ như v3 (FE không đổi tài khoản). CLI mặc định
   v4; `--fixture shared-demo-v3` ⟹ `Unknown fixture` (exit 3).
2. **DB đã có dataset khác:** Audit có `operatorReference` bắt đầu `DEMO_DATASET:` mà không phải `DEMO_DATASET:shared-demo-v4:` ⟹ `plan`/`apply` bị
   từ chối "dataset khác đã nạp; reset bằng wrapper", exit 3, không ghi gì (đọc chung truy vấn của `datasetYear`, `seed-run.ts:184-195`).
3. `calendarRefusal` giữ: dataset nạp ở năm khác ⟹ từ chối.
4. **Idempotent theo khóa bền, không theo ngày** (Q-106): mọi step tìm bản ghi theo khóa nghiệp vụ (mã nhân viên, mã phòng, tên ứng dụng/gói, gói của
   thuê bao, tag `[SV-…]` trong văn bản, `Idempotency-Key = SV-<key>`, số hóa đơn `SV-HDn`). Ngày tương đối chỉ dùng khi **tạo**; bản ghi đã có giữ ngày
   của lần đầu. Chỉ so trường khi bản ghi còn đúng trạng thái seed tạo; **không** so trường có thể đổi do thao tác demo (số seat đã mua, ngày kỳ, Trần, số
   cơ sở). Chạy lại cùng ngày hoặc ngày khác cùng năm ⟹ exit 2 (không ghi thêm); kịch bản theo ngày trôi theo lần đầu.
5. **Đã đi tiếp ⟹ `present`, không `conflict`** — luật cho từng loại (unit + `seed-rerun`):

   | Loại                                                                              | Tìm theo                                     | Coi là `present` khi                                                                                          |
   | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
   | Request                                                                           | tag `[SV-Rnn]`                               | trạng thái ở **sau** đích trên đường kịch bản (`scenario-path.ts` thêm `isPastTarget`)                        |
   | thuê bao                                                                          | gói, trên cả chuỗi kỳ (kỳ kế tiếp, `CLOSED`) | có bất kỳ kỳ nào của gói (không tạo thêm, không so số seat/ngày — mua thêm R15, điểm điều chỉnh, đóng Notion) |
   | seat nền                                                                          | thuê bao                                     | baseline đã đóng                                                                                              |
   | kỳ ngân sách, Trần phòng                                                          | năm                                          | kỳ đã phát hành một lần (`firstPublishedAt`, mẫu `finance.steps.ts:344-346`), kể cả khi Finance sửa Trần sau  |
   | đề xuất, phiên bản ngân sách                                                      | (Cost Center, năm)                           | có đề xuất/phiên bản bất kỳ trạng thái (kể cả `APPROVED` ở W9)                                                |
   | hóa đơn, khóa `K4`, thiết bị, quyền theo vai, nguồn/lần nhập usage, hồ sơ nhân sự | khóa của hạng mục chủ (`-mf1`, `-mf5`)       | có bản ghi bất kỳ trạng thái                                                                                  |

### 2. Ngày tương đối (`demo-dates.ts`, hàm thuần)

`D0` = ngày nghiệp vụ của tổ chức lúc chạy (`ctx.today`), `Y` = năm của `D0`. Fixture chỉ chứa **độ lệch**, không chứa ngày:

| Hàm                                           | Nghĩa                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dayOffset(D0, n)`                            | `D0 + n` ngày lịch                                                                                                                                                                                  |
| `endOfMonth(D0)` (`EOM`)                      | ngày cuối tháng của `D0`                                                                                                                                                                            |
| `addMonths(D0, m)`                            | cùng ngày, tháng + m, kẹp về ngày cuối tháng                                                                                                                                                        |
| `termEndingOn({ renewalInDays, termMonths })` | kỳ đang chạy: `renewal = D0 + renewalInDays`, `end = renewal − 1`, `start = addMonths(renewal, −termMonths)`                                                                                        |
| `noticeDeadline(renewal, noticeDays)`         | `renewal − noticeDays` (gói năm; thiếu số ngày ⟹ không có hạn chót)                                                                                                                                 |
| `cycleDeadlines(year, days)`                  | hạn nộp/duyệt = 01/01/`year` − `days` (giữ cách của v3)                                                                                                                                             |
| `scenarioDay(when, D0)`                       | ngày chạy của một dòng bảng kịch bản (`D0`, `D0+n`, `D0` + n ngày làm việc, ngày 1 tháng sau, ngày 1 tháng sau tháng chứa `D0+n`, `addMonths(D0, m) ± n`, 01/01/`Y+1`) — flow sắp dòng theo hàm này |

Kiểm biên năm bằng unit: `D0` = 15/03, 20/12, 31/12, 01/01 — kỳ thuê bao vắt năm, `EOM` của 31/12 là chính nó, thứ tự `scenarioDay` của mọi bảng không
giảm sau khi sắp.

### 3. Tổ chức (BRD 3.4: 100–500 người, phòng phẳng, 1–3 IT Admin) — Q-97

| Phòng | Tên                       | Trưởng phòng | IT Admin | Cost Center | Vai trong demo                                                                                                                 |
| ----- | ------------------------- | ------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| BOD   | Ban Giám đốc              | NV-DEP       | NV-ITA2  | CC-BOD      | Người duyệt chi (NV-CEO) thuộc phòng này                                                                                       |
| ENG   | Phòng Kỹ thuật            | NV-ENGH      | NV-ITA1  | CC-ENG      | ngân sách rộng: phần lớn kịch bản MF-1 ra `WITHIN_BASE`; phòng mới của NV-MOV1                                                 |
| DES   | Phòng Thiết kế            | NV-DESH      | NV-ITA2  | CC-DES      | năm `Y` **không** có ngân sách duyệt (phiên bản bị yêu cầu sửa) ⟹ chặn `NO_APPROVED_BUDGET`; MF-5                              |
| FIN   | Phòng Tài chính - Kế toán | NV-FINH      | NV-ITA2  | CC-FIN      | dashboard; năm `Y+1` chưa nộp đề xuất                                                                                          |
| ITO   | Phòng Công nghệ thông tin | NV-ITOH      | NV-ITA1  | CC-ITO      | Request cá nhân của IT Admin; đề xuất `Y+1` bị Finance trả lại                                                                 |
| MKT   | Phòng Marketing           | NV-MKTH      | NV-ITA2  | CC-MKT      | ngân sách sát: `USES_RESERVE` qua trưởng phòng; **không** giữ seat trả phí nền (Q-103)                                         |
| SAL   | Phòng Kinh doanh          | NV-SALH      | NV-ITA1  | CC-SAL      | ngân sách hẹp: `BLOCKED OVER_RESERVE`, Request một bước `USES_RESERVE`; **không** giữ seat trả phí nền (Q-103)                 |
| OPS   | Phòng Vận hành            | —            | —        | —           | cố ý thiếu cấu hình: Request trả phí ⟹ `FINANCE.SETUP_INCOMPLETE`; MF-5 chờ trưởng phòng; khoản 01/01 bị bỏ (`NO_COST_CENTER`) |
| LGL   | Phòng Pháp chế (mới)      | —            | NV-ITA1  | CC-LGL      | không trưởng phòng nhưng đủ Cost Center: phiên bản `BASELINE` (B4), Request một bước `NO_DEPARTMENT_HEAD` (Q-105)              |
| DAT   | Phòng Dữ liệu (mới)       | —            | NV-ITA1  | CC-DAT      | tạo trong cửa sổ kỳ `Y+1` chưa phát hành ⟹ hiệu lực 01/01/`Y+1` (Q-104); phiên bản số liệu nền `Y+1` (DM4-13)                  |

Ngoài 10 phòng trên, cài đặt có **phòng gốc `ADMIN`** (Super Admin; `shared-demo-v3/README.md`): phòng `ACTIVE`, thuộc tập phòng của mọi năm ⟹ có dòng
Trần (0) ở `Y` và `Y+1` (`budget-cycle-ceilings` mục 3–4; seed `Y` hiện đã chia cho mọi phòng `ACTIVE` đọc từ `/departments`, `finance.steps.ts:356-367`).

- **Persona có mã** (36 người, 26 tài khoản + Super Admin cài đặt): giữ nguyên 23 người của v3 (mã, email, vai) và thêm 13 người ở bảng _Người dùng/vai
  demo_ dưới. Mỗi tài khoản đúng một vai; NV-CEO bắt đầu `EMPLOYEE`, step vai đổi thành `SPENDING_APPROVER` (giữ cách v3).
- **Ngày vào làm tương đối:** mọi người (persona và nền) `hire_date = D0 − 400` (thay hằng `2025-01-06` của `organization.steps.ts:21`) ⟹ mọi seat nền
  `granted_on ≥ hire_date` (`seat-baseline-rows.policy.ts:184-188`). Người không phải `STAFF` có `contractEndDate`: NV-CTR1 `D0+120`, NV-INT1 `D0+90`.
- **Nhân viên nền** `NV-B001` → `NV-B084` (84 người, không tài khoản, `STAFF`), nạp bằng **một** lần `employeeImportUpload` → `employeeImportConfirm`
  (Super Admin), tag `[SV]` ở ghi chú; chia theo thứ tự mã: ENG 34 (`B001`–`B034`), SAL 16, MKT 11, DES 7, FIN 5, ITO 4, BOD 3, LGL 2, OPS 2 (`B083`,
  `B084`). Tổng 120 người. Họ chỉ giữ seat nền (mục 4) để số seat, số seat cần và chi phí kho có quy mô thật.
- LGL, OPS tạo trước mọi kỳ ngân sách (ngoại lệ khởi tạo `NO_CYCLE_YET` ⟹ hiệu lực hôm nay). DAT tạo **sau** khi mở kỳ `Y+1` và **trước** khi phát
  hành (mục 5).

#### Người dùng/vai demo (đăng nhập bằng `SEED_DEMO_ACCOUNT_PASSWORD`; email `@saoviet.example`)

| Mã                                                           | Email                                           | Vai                                                   | Phòng                             | Dùng ở (kịch bản)                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| NV-SA                                                        | `system.admin@` (hoặc `SEED_SUPER_ADMIN_EMAIL`) | SUPER_ADMIN                                           | ADMIN                             | tổ chức, nhân sự, tham số, `KPI-5`, quyền theo vai `SUPER_ADMIN`                   |
| NV-CEO                                                       | `an.nguyen@`                                    | SPENDING_APPROVER                                     | BOD                               | B5, duyệt chi, Request một bước, nhận sự cố gia hạn                                |
| NV-FIN1                                                      | `phuc.trinh@`                                   | FINANCE                                               | FIN                               | B1, B2, B4, xác nhận/trả hóa đơn, nhận cảnh báo đỏ                                 |
| NV-ITA1                                                      | `quan.ly@`                                      | IT_ADMIN                                              | ITO                               | phụ trách Jira, GitHub, Postman, 1Password, JetBrains, Google Workspace, Slack, K1 |
| NV-ITA2                                                      | `rang.mai@`                                     | IT_ADMIN                                              | ITO                               | phụ trách Figma, Adobe CC, Zoom, Canva, Loom, Notion, Mailchimp; Request cá nhân   |
| NV-DEP, NV-ENGH, NV-DESH, NV-FINH, NV-ITOH, NV-MKTH, NV-SALH | như v3                                          | MANAGER                                               | BOD, ENG, DES, FIN, ITO, MKT, SAL | bước nhu cầu, trình lô, xác nhận dự phòng, B3, quyết ghost seat                    |
| NV-DEV1, NV-DEV2, NV-DEV3                                    | như v3                                          | EMPLOYEE                                              | ENG                               | Request các trạng thái, GH-1/2/3, `K4`                                             |
| NV-DES1, NV-DES2                                             | như v3                                          | EMPLOYEE                                              | DES                               | Request bị từ chối/chặn; seat Figma `G4`                                           |
| NV-MKT1, NV-MKT2, NV-SAL1, NV-SAL2, NV-OPS1                  | như v3                                          | EMPLOYEE                                              | MKT, SAL, OPS                     | dự phòng, vượt dự phòng, chờ trưởng phòng                                          |
| NV-INT1, NV-NEW1                                             | — (không tài khoản)                             | —                                                     | ENG, OPS                          | ứng viên tạo tài khoản (giữ v3); NV-INT1 `INTERN`, `contractEndDate` `D0+90`       |
| NV-DES3                                                      | `hoa.truong@`                                   | EMPLOYEE                                              | DES                               | `G3` chưa từng hoạt động trên Jira — `-mf5`                                        |
| NV-DES4 → NV-DES10, NV-DES12                                 | — (không tài khoản)                             | —                                                     | DES                               | hồ sơ MF-5 (tầng _Theo dõi_, bẫy `TC-2`, luật 1 tháng); NV-DES5 giữ Loom — `-mf5`  |
| NV-MOV1                                                      | `khoa.lam@`                                     | EMPLOYEE                                              | DES → ENG                         | điều chuyển hôm nay ⟹ khuyến nghị tạm dừng — `-mf5`                                |
| NV-OFF1                                                      | `nam.ha@`                                       | EMPLOYEE                                              | ENG                               | nghỉ việc chặn ngay hôm nay ⟹ `G2` — `-mf5`                                        |
| NV-CTR1                                                      | `phong.vu@`                                     | EMPLOYEE (`CONTRACTOR`, `contractEndDate` = `D0+120`) | ENG                               | quyền có thời hạn, cửa sổ tiếp tục, `TERM_REQUIRED` — `-mf1`                       |
| NV-LGL1                                                      | `thu.ly@`                                       | EMPLOYEE                                              | LGL                               | Request một bước `NO_DEPARTMENT_HEAD`, `K5` cấp thẳng — `-mf1`                     |

### 4. Danh mục và kho dùng chung (`SBF-20`, `BR-MF1-09`)

- 17 ứng dụng: 15 SaaS + JetBrains (khóa `K4`) + Cổng Nhân sự Nội bộ (`K5`). Mỗi ứng dụng có `responsibleItAdmin` (W5). Mỗi (ứng dụng, gói) **một**
  thuê bao `TERM` (trừ JetBrains `PERPETUAL`), không phòng sở hữu, `commitmentTermMonths` ∈ {1, 12}, `responsibleItAdminEmployeeId`; K1 có một thuê
  bao mang giá (`MONTHLY`, kỳ 1) làm nguồn giá Request.
- **Seat nền** nạp bằng `seatBaselineImportUpload` → `seatBaselineImportConfirm` (IT Admin, một file mỗi thuê bao, `granted_on` tương đối, `kind`
  `personal`/`service`, `expected_end_date` khi có), **trước** khi ghi nghỉ việc/điều chuyển; xong thì `seatBaselineClose` ⟹ từ đây tạo thuê bao trùng
  bị 409 `SUBSCRIPTION.DUPLICATE_PLAN` (R-E02). Mọi dòng baseline của fixture qua **chính** `seat-baseline-rows.policy` ở unit (không lỗi dòng nào).
- `purchasedQuantity` **tính** = số dòng baseline của thuê bao + `freeAfterBaseline` của fixture (unit kiểm đủ chỗ cho mọi kịch bản lấy từ kho, kể cả
  quyền theo vai RB1–RB3 của `-mf1`).
- Cảnh báo đỏ ở lượt quét đầu (`alerts-incidents` mục 3: điểm kỳ 12 chưa ghi, hôm nay ≥ mốc − 7): **Adobe, Zoom, Loom**; Figma đỏ từ `D0+13`; Canva đỏ
  từ `D0+18`.

| Ứng dụng / gói                 | Kiểu | Giá tháng (VND)         | Kỳ · chu kỳ trả                                         | Mốc tương đối (lúc tạo)                                                              | `freeAfterBaseline` | IT phụ trách | Vai trong `SBF-20` / MF-1                                                                                                  |
| ------------------------------ | ---- | ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Jira Software · Standard       | K2   | 200.000                 | 1 · MONTHLY                                             | `renewalInDays` 5 ⟹ điểm điều chỉnh mở từ `D0−2`                                     | 4                   | ITA1         | gói tháng có điểm mở: IT ghi đúng số seat cần; mặc định giữ nếu qua `D0+5`; hóa đơn SV-HD3; nguồn usage tươi `G3` (`-mf5`) |
| Figma · Professional           | K2   | 375.000 (năm 4.500.000) | 12 · ANNUAL                                             | `renewalInDays` 50, báo trước 30 ⟹ hạn chót `D0+20`, điểm mở `D0−10`, đỏ `D0+13`     | 5                   | ITA2         | gói năm điểm đang mở; `G1`; MF-5                                                                                           |
| Adobe Creative Cloud · Teams   | K2   | 1.200.000               | 12 · ANNUAL                                             | `renewalInDays` 35, báo trước 30 ⟹ hạn chót `D0+5` ⟹ **cảnh báo đỏ** ở lượt quét đầu | 1                   | ITA2         | cảnh báo đỏ cho ITA2 + FIN1; R12, R22 (`-mf1`)                                                                             |
| Zoom · Business                | K2   | 300.000                 | 12 · ANNUAL, `autoRenew: true`                          | `renewalInDays` 28, báo trước 30 ⟹ hạn chót đã qua (`D0−2`), mua 12 > cần 10         | 2                   | ITA2         | **sự cố `UNINTENDED_RENEWAL`** và cảnh báo đỏ ở lượt quét đầu (C1, IT, F1); `KPI-4` (flow)                                 |
| Loom · Business                | K2   | 300.000                 | 12 · ANNUAL, `autoRenew: false`                         | `renewalInDays` 3 ⟹ mốc `END_DATE` = `D0+2` ⟹ đỏ ở lượt quét đầu; NV-DES5 còn seat   | 2                   | ITA2         | từ `D0+3` (hôm nay ≥ ngày gia hạn) chưa ghi ⟹ `EXPIRED_NOT_RENEWED`, `suspendedByVendor` (flow — Q-101)                    |
| Canva · Teams                  | K2   | 250.000                 | 12 · ANNUAL, `autoRenew: null`, không số ngày báo trước | `renewalInDays` 25 ⟹ mốc `RENEWAL_DATE` = `D0+25`, điểm mở `D0−5`, đỏ `D0+18`        | 3                   | ITA2         | cảnh báo chất lượng dữ liệu (`RENEWAL_DATE`) ở lượt quét đầu; nguồn usage cũ (`-mf5`); R04, R09, R10, R23, R24             |
| Notion · Plus                  | K2   | 200.000                 | 1 · MONTHLY                                             | `renewalInDays` 4; **0** seat đã gán, mua 5                                          | 5                   | ITA2         | `CANCEL` rồi đóng thuê bao, tiết kiệm thực `CANCELLED` (cần hóa đơn SV-HD5 của `-mf1`)                                     |
| GitHub · Team                  | K2   | 100.000                 | 1 · MONTHLY, `vendorMinimumSeats: 10`                   | `renewalInDays` 6; seat nền 6 ⟹ mua 10 = mức tối thiểu                               | 4                   | ITA1         | ghi `KEEP` 10 > số seat cần kèm bằng chứng mức tối thiểu; R02                                                              |
| Slack · Pro                    | K2   | 180.000                 | 1 · MONTHLY                                             | `renewalInDays` 20 (điểm chưa mở)                                                    | 3                   | ITA1         | quyền theo vai NV-CEO; R14; `KPI-4` gói tháng (flow)                                                                       |
| 1Password · Business           | K2   | 200.000                 | 1 · MONTHLY                                             | `renewalInDays` 12                                                                   | **0**               | ITA1         | kho hết: mua thêm `POOL_TOP_UP` (R15)                                                                                      |
| Postman · Professional         | K2   | 300.000                 | 1 · MONTHLY                                             | `renewalInDays` 15                                                                   | 3                   | ITA1         | cấp từ kho, _tránh được_ (R01, R17); Request một bước `USES_RESERVE` của NV-SALH (DM1-53)                                  |
| Google Workspace · Business    | K2   | 150.000                 | 1 · MONTHLY                                             | `renewalInDays` 25; hồ sơ workspace (ITA1 `ADMIN`)                                   | 3                   | ITA1         | quyền theo vai `SUPER_ADMIN`, `WORKSPACE_ADMIN` (`-mf1`)                                                                   |
| Mailchimp · Standard           | K2   | 400.000                 | 1 · MONTHLY                                             | `renewalInDays` 18                                                                   | 2                   | ITA2         | R07, R11, R21                                                                                                              |
| ChatGPT · Plus                 | K1   | 500.000                 | 1 · MONTHLY                                             | thuê bao mang giá                                                                    | —                   | ITA1         | Request `K1` + hóa đơn HD1, HD2 (`-mf1`)                                                                                   |
| Cursor · Pro                   | K1   | 500.000                 | 1 · MONTHLY                                             | thuê bao mang giá                                                                    | —                   | ITA1         | R03                                                                                                                        |
| JetBrains · All Products       | K4   | 6.000.000 / khóa        | PERPETUAL                                               | khóa nhập ở `-mf1`                                                                   | —                   | ITA1         | kho khóa `K4` (`-mf1`)                                                                                                     |
| Cổng Nhân sự Nội bộ · Truy cập | K5   | —                       | —                                                       | —                                                                                    | —                   | ITA2         | Request nội bộ R06, cấp thẳng (DM1-56)                                                                                     |

- **Seat nền** (quy tắc, unit kiểm):
  - Google Workspace cho mọi người **trừ** NV-SA, NV-ITA1 (để ghi quyền theo vai không trùng `ASSIGNMENT.OVERLAP`) và người của MKT, SAL (Q-103);
    NV-CTR1, NV-INT1 kèm `expected_end_date` = `contractEndDate` (`EXPECTED_END_REQUIRED` cho người có thời hạn — `seat-baseline-rows.policy.ts:196-199`).
  - Jira cho nền ENG/LGL và NV-DEV1..3, NV-ITA1, NV-OFF1, **NV-DES3** (`G3` của `-mf5`); không cho SAL.
  - Slack cho nền BOD/ENG; Figma theo bảng MF-5 (`-mf5`) + nền DES (không MKT); Zoom 10 người (NV-DEV1 + 9 nền ENG); Loom **NV-DES5**; GitHub NV-DEV1 +
    5 nền ENG.
  - NV-DEV1 giữ đúng 8 phần mềm trả phí (Jira, Figma, Slack, Google Workspace, GitHub, 1Password, Zoom, Canva) để GH-3 rơi đúng vào R21 (`-mf1`).
  - MKT và SAL **không** có dòng seat trả phí nào ⟹ thực chi seat-tháng của hai phòng = 0 tới 31/12 (Q-103).
- Không seat nào của persona trùng gói mà persona đó sẽ xin trong kịch bản (unit: GH-1 chỉ xảy ra ở dòng từ chối cố ý).
- **Seat Figma của MF-5 nằm trong baseline của hạng mục này** (baseline đóng ở đây, hạng mục `-mf5` không thêm seat được nữa). Mặc định mọi seat nền
  `granted_on = D0−130` (cửa sổ usage 120 ngày phủ ≥ 80 % số ngày xét — tránh biên CF-4), `personal`; ngoại lệ:

| Người giữ (định danh)                                             | `granted_on` | `kind`   | `expected_end_date`    | Dùng ở `-mf5`                    |
| ----------------------------------------------------------------- | ------------ | -------- | ---------------------- | -------------------------------- |
| NV-DES6                                                           | `D0−5`       | personal | —                      | bẫy người mới (`NEW_ASSIGNMENT`) |
| NV-DES9                                                           | `D0−30`      | personal | —                      | bẫy ngoài cửa sổ (`COVERAGE`)    |
| NV-DES10                                                          | `D0−130`     | personal | `D0+20`                | bẫy thời hạn còn ≤ 1 tháng       |
| NV-DES12                                                          | `D0−130`     | personal | `addMonths(D0, 1) + 2` | luật 1 tháng lúc quyết (flow)    |
| `design-bot@saoviet.example` (NV-DESH chịu trách nhiệm, `CC-DES`) | `D0−130`     | service  | —                      | bẫy tài khoản dịch vụ            |
| NV-DES8 (`ha.vo@saoviet.example`)                                 | `D0−130`     | personal | —                      | bẫy định danh chưa khớp          |

Người giữ Figma còn lại: NV-DESH, NV-DES1 → NV-DES5, NV-DES7, NV-MOV1, NV-OFF1, NV-OPS1, NV-DEV1 và nền DES.

### 5. Ngân sách `MF-4` (`BR-MF4-01`→`BR-MF4-06`)

**Năm `Y`** — kỳ mở và phát hành bởi Finance như bước `budget.cycles` của W2 (Trần năm 20.000.000.000, dự phòng kho 1.000.000.000, chia đều Trần phòng
cho mọi phòng `ACTIVE` gồm ADMIN; hạn nộp/duyệt = 01/01/`Y` − 60/30 ngày, tức đã qua). Phiên bản theo luồng đề xuất → phiên bản (dự phòng mặc định 10 %
do server tính) → Người duyệt chi:

| Phòng         | Cơ sở `Y`            | Trạng thái cuối                                    | Vì sao                                                                                                                                                                                  |
| ------------- | -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENG           | 600.000.000          | `APPROVED`                                         | rộng                                                                                                                                                                                    |
| MKT           | 240.000              | `APPROVED`                                         | R10 (Canva tới `EOM`, 250.000) nằm trong (cơ sở, cơ sở + 24.000] ⟹ `USES_RESERVE`; thực chi seat-tháng của MKT = 0 cả năm (không seat nền) ⟹ kết quả không đổi theo tháng (Q-103)       |
| SAL           | 290.000              | `APPROVED`                                         | dự phòng 29.000: R11 (Mailchimp 400.000), R22 (Adobe 1.200.000) > 319.000 ⟹ `BLOCKED OVER_RESERVE`; Postman 300.000 của NV-SALH ∈ (290.000, 319.000] ⟹ `USES_RESERVE` một bước (DM1-53) |
| BOD, FIN, ITO | 50.000.000 mỗi phòng | `APPROVED`                                         | dashboard; R24 của IT Admin                                                                                                                                                             |
| DES           | 80.000.000           | `CHANGES_REQUESTED` (CEO yêu cầu sửa kèm lý do)    | không có ngân sách duyệt ⟹ R09 `BLOCKED NO_APPROVED_BUDGET`; B5 nhánh _yêu cầu sửa_                                                                                                     |
| LGL           | số liệu nền          | `APPROVED`, phiên bản `source: BASELINE` (Finance) | phòng không trưởng phòng, quá hạn nộp ⟹ phiên bản từ số liệu nền có cờ                                                                                                                  |
| OPS           | —                    | không có                                           | không Cost Center ⟹ Request trả phí chỉ lưu nháp (DM1-09)                                                                                                                               |

**Năm `Y+1`** — trình tự step: Finance mở kỳ `Y+1` (Trần năm 500.000.000, dự phòng kho 50.000.000, hạn = 01/01/`Y+1` − 60/30) ⟹ Super Admin tạo DAT
(cửa sổ mở, hiệu lực 01/01/`Y+1`) và Finance tạo `CC-DAT` ⟹ Finance nhập Trần phòng **theo fixture** (Q-107) cho **đủ tập phòng của năm** (đọc
`/departments` như `finance.steps.ts:356-367`, gồm ADMIN): ENG 100M, MKT 60M, SAL 60M, ITO 50M, DES 40M, FIN 30M, BOD 30M, DAT 20M, LGL 10M, OPS 0,
ADMIN 0 (11 phòng; Σ 400M + 50M ≤ 500M; phòng có trong tập mà fixture không ghi ⟹ step dừng `conflict`, không đoán số) ⟹ phát hành. Rồi:

| Phòng                               | Trạng thái `Y+1` để W9 đi tiếp                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENG                                 | đề xuất `SUBMITTED` 120M: 4 dòng (`RENEW` Jira 60M hạng 1, `CHANGE` GitHub 20M hạng 2, `NEW` Cursor 30M hạng 3 có ZBB, `NEW` Notion 10M hạng 4 có ZBB; dòng 3–4 có `note`) ⟹ cờ vượt Trần phòng 10M + 10M ở dòng 3–4 theo cộng dồn (không chặn) |
| MKT                                 | phiên bản `SENT` cơ sở 50M ⟹ chờ CEO (B5)                                                                                                                                                                                                       |
| SAL                                 | phiên bản `APPROVED` cơ sở 50M (B6)                                                                                                                                                                                                             |
| ITO                                 | đề xuất 20M (1 dòng `RENEW` Google Workspace) bị Finance trả lại (`budgetProposalReturn`, có lý do) ⟹ trưởng phòng nộp lại                                                                                                                      |
| FIN, BOD, DES, DAT, LGL, OPS, ADMIN | chưa có đề xuất (nhắc hạn; DAT chưa có trưởng phòng — Q-104)                                                                                                                                                                                    |

Tổng tập B4 sau seed: SAL 55M + MKT 55M = 110M ≤ 450M (Trần năm − dự phòng kho); W9 cố tình đặt cơ sở ENG 400M ⟹ 409 `BUDGET.OVER_ANNUAL_CEILING`
(DM4-10), chia lại 120M ⟹ 242M; phiên bản ITO 22M ⟹ 264M (DM4-25).

### 6. Tham số

Seed **không** ghi tham số (dùng mặc định của server, QT A.4): `GH2_OPEN_NEW_REQUESTS_MAX` 3, `GH3_PAID_SOFTWARE_THRESHOLD` 10, `RENEWAL_WINDOW_DAYS` 30,
`BUDGET_ZBB_KPI3_BELOW_PERCENT` 70, `BUDGET_ZBB_PRICE_INCREASE_PERCENT` 10, `ADJUSTMENT_POINT_MONTHLY_DAYS` 7, `ADJUSTMENT_POINT_ANNUAL_DAYS` 30,
`RED_ALERT_ANNUAL_DAYS` 7, `IDLE_SEAT_COST_ALERT_PERCENT` 10, `PURCHASE_INVOICE_*_WORKING_DAYS` 5, `ROLE_BASED_HOLD_WORKING_DAYS` 5,
`GHOST_SEAT_*` (14 · 5 · 7), `DETECTION_THRESHOLD_DAYS` [30, 60, 90], `RULE_SCHEDULE_G1_G2` `DAILY`, `RULE_SCHEDULE_G3_G4` `WEEKLY`. Unit kiểm mốc fixture
dựa trên đúng các mặc định này (đọc từ `parameter-definitions.policy.ts`, không chép số).

### 7. Thứ tự step (hạng mục này)

`org.*` (phòng gồm LGL/OPS, người có mã, tài khoản, vai, trưởng phòng) → `org.background-staff` (import nhân sự) → `finance.cost-centers` →
`catalog.applications` → `catalog.plans` (+ hồ sơ workspace Google Workspace) → `catalog.subscriptions` (một mỗi gói, ngày tương đối) →
`catalog.baseline-seats` (import + đóng baseline) → `finance.tax-profile` → `budget.cycles` (`Y`) → `budget.year` (`Y`: ENG, MKT, SAL, BOD, FIN, ITO
duyệt; DES yêu cầu sửa; LGL `BASELINE`) → `budget.next-cycle` (`Y+1` mở → DAT → Trần đủ tập phòng → phát hành) → `budget.next-year` (trạng thái `Y+1`)
→ bước của `-mf1` → bước của `-mf5` (cuối cùng là `jobs.first-pass-guard`). Mỗi step khai `needs`; `plan` không ghi gì.

### 8. Lượt job đầu (Q-99)

- **Sự thật về tiến trình:** job tạo điểm điều chỉnh/cảnh báo/sự cố, `cycle-deadline`, lượt rule `G1`/`G2` (`internal-rules`, ngày) và `G3`/`G4`
  (`usage-rules`, tuần) chạy trong **tiến trình API** (`dist/main`): lần đầu 5 phút sau khi API khởi động, rồi mỗi giờ (mẫu
  `subscription-renewal.job.ts:6-7`; `ghost-seat-g1-g2` mục 1; `budget-baseline-annual-check` job). `dist/worker` chỉ có `EmailDispatchLoop`,
  `RequestWorkLoop` (`src/worker/worker.module.ts:22`) ⟹ dừng/khởi động worker không ảnh hưởng.
- **Rủi ro:** lượt rule claim **một lần mỗi kỳ** (`ghost_seat_rule_runs` UNIQUE `(organization_id, rule_set, period_key)`): lượt chạy giữa lúc seed chưa
  xong khóa ngày (`G1`/`G2`) hoặc cả tuần (`G3`/`G4`) với dữ liệu thiếu; khởi động lại API sau đó **không** chạy lại kỳ đã claim. Job theo mốc (điểm,
  đỏ, sự cố, nhắc hạn) chạy lại mỗi giờ và ghi một lần mỗi mốc ⟹ chạy sớm không hỏng.
- **Cách làm:**
  1. API phục vụ apply phải **mới khởi động ngay trước apply**: `seed-local.mjs` đã làm (khởi động `dist/main` + `dist/worker` trước apply, dừng sau —
     giữ nguyên); `seed.sh` nhánh reset đã `up -d api worker` ngay trước apply (giữ); nhánh không reset thêm `compose restart api` + chờ ready trước
     apply.
  2. Apply phải xong trong **5 phút** kể từ lúc đó. Integration `seed.integration-spec.ts` đo và ghi thời gian apply thật (plan _Verification_, README);
     > 4 phút ⟹ dừng, báo chat review (phương án dự phòng: biến env kỹ thuật lùi lượt đầu của sweeper trong API phục vụ apply — đổi `src` ngoài
     > hạng mục, cần hạng mục riêng).
  3. Step cuối `jobs.first-pass-guard` (`-mf5`) đọc `ghostSeatRuleRunList`: có lượt của kỳ hiện tại bắt đầu **trước** khi step này chạy mà lần apply
     này đã ghi dữ liệu ⟹ `conflict` "lượt job đã chạy trong lúc seed; reset và chạy lại", exit 1.
- **README fixture:** dữ liệu theo job (điểm, đỏ, sự cố, `G1`–`G4`) có sau lượt đầu = 5 phút sau khi API **demo** khởi động. Local: API do wrapper
  dựng cho apply đã dừng ⟹ chạy `pnpm start:dev` rồi chờ ≥ 5 phút; VPS: `api` đã chạy từ trước apply ⟹ chờ tới mốc 5 phút. W9 kiểm
  `ghostSeatRuleRunList` (`G1_G2`, `G3_G4` `COMPLETED`) trước khi chạy DM5.

### 9. Kịch bản demo (dùng cho W9 — gọi API từng bước)

Cột _Khi_: `D0` = ngay sau seed + lượt job đầu; `D0+n` = chỉ chạy trong flow bằng `FlowClock` (W9 thủ công bỏ qua, chỉ kiểm qua flow — Q-100).
Tài khoản ghi bằng mã persona. `operationId` có sẵn ở BE pin hoặc **sẽ có** theo spec `qd103-*` ghi trong ngoặc. Chủ: hạng mục sở hữu dữ liệu + flow.

**Thứ tự chạy trong flow** (`FlowClock` chỉ đi tới — `flow-clock.ts:73-77`): mọi dòng `D0` theo thứ tự bảng, rồi các dòng có ngày sắp theo
`scenarioDay(when, D0)` tăng dần (cùng ngày giữ thứ tự bảng); bảng dưới đã xếp theo thứ tự đó với `D0` thông thường, flow vẫn sắp lại lúc chạy vì
_ngày 1 tháng sau_ có thể đứng trước hoặc sau `D0+n`. Dòng ghi _world riêng_ chạy trong `describe` riêng clone từ template (không thấy thao tác của
dòng khác). Kết quả phụ thuộc `D0` (ghi _theo `D0`_) do flow tính bằng hàm trong `demo-scenarios.ts`.

#### 9.1 MF-4 — ngân sách năm (chủ: hạng mục này, flow `demo-mf4.flow-spec.ts` `@MF4 @DEMO`)

| ID     | Bước                           | Khi         | Tài khoản       | API                                                                                    | Đầu vào chính                                                      | Kết quả mong đợi                                                                                                                                                                                                                                 |
| ------ | ------------------------------ | ----------- | --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DM4-01 | B1 xem kỳ                      | D0          | NV-FIN1         | `budgetCycleList`, `budgetCycleGet` (W2)                                               | `year=Y+1`                                                         | kỳ `Y+1` đã phát hành, `ceilings` 11 phòng (ADMIN 0, OPS 0), Trần năm 500M, dự phòng kho 50M                                                                                                                                                     |
| DM4-02 | B1 quyền                       | D0          | NV-ENGH         | `budgetCycleGet`                                                                       | `year=Y+1`                                                         | 403                                                                                                                                                                                                                                              |
| DM4-03 | B1 số liệu nền                 | D0          | NV-FIN1         | `budgetCycleBaseline` (W2)                                                             | `year=Y+1`                                                         | số liệu nền mỗi phòng từ seat đang gán (giá tháng × 12), `kpi3 = null`; MKT, SAL 0                                                                                                                                                               |
| DM4-04 | B2 vượt Trần năm               | D0          | NV-FIN1         | `budgetDepartmentCeilingsSet`, `budgetCyclePublish` (W2)                               | PUT ENG 160M, còn lại như seed; publish; PUT lại ENG 100M; publish | PUT 200, kỳ **bỏ phát hành** (`firstPublishedAt` giữ); publish ⟹ 409 `BUDGET.CEILINGS_OVER_ANNUAL` (`gapMinor` 10M); PUT 100M + publish ⟹ 200, kỳ phát hành lại                                                                                  |
| DM4-05 | B2 sai vai                     | D0          | NV-SA           | `budgetDepartmentCeilingsSet`                                                          | như trên                                                           | 403                                                                                                                                                                                                                                              |
| DM4-06 | B3 thiếu ZBB                   | D0          | NV-FINH         | `budgetProposalSubmit` (W2)                                                            | `Y+1`, dòng `NEW` không `zbb`                                      | 422 `BUDGET.ZBB_REQUIRED`                                                                                                                                                                                                                        |
| DM4-07 | B3 vượt Trần phòng             | D0          | NV-FINH         | `budgetProposalSubmit`                                                                 | tổng 35M > Trần FIN 30M, dòng vượt không `note`                    | 422 `BUDGET.OVER_CEILING_NOTE_REQUIRED`; thêm `note` ⟹ 201, dòng cuối `overCeiling` 5M, không chặn                                                                                                                                               |
| DM4-08 | B3 xem cờ                      | D0          | NV-FIN1         | `budgetProposalGet`, `budgetProposalLineList`                                          | đề xuất ENG `Y+1`                                                  | dòng 3 `overCeiling` 10M, dòng 4 10M (cộng dồn theo hạng); `lineType`, `priorityRank`, `zbb`                                                                                                                                                     |
| DM4-09 | B3 nộp lại                     | D0          | NV-ITOH         | `budgetProposalResubmit`                                                               | đề xuất ITO đã bị trả                                              | `SUBMITTED`; đề xuất đã nộp bất biến (sửa trực tiếp ⟹ 409/404 theo hợp đồng hiện có)                                                                                                                                                             |
| DM4-10 | B4 vượt Trần năm               | D0          | NV-FIN1         | `budgetVersionCreate` (`source: PROPOSAL`), `budgetVersionUpdate`, `budgetVersionSend` | từ đề xuất ENG (`DRAFT`); cơ sở 400M + `baseReason`; gửi           | 409 `BUDGET.OVER_ANNUAL_CEILING` (`gapMinor`, `availableMinor`); phiên bản vẫn `DRAFT`                                                                                                                                                           |
| DM4-11 | B4 chia lại                    | D0          | NV-FIN1         | `budgetVersionUpdate`, `budgetVersionSend`, `budgetCyclePackage`                       | cơ sở 120M + `baseReason`; gửi                                     | `SENT`; `versionsTotal` 242M ≤ 450M                                                                                                                                                                                                              |
| DM4-12 | B4 số liệu nền OK              | D0          | NV-FIN1         | (đã seed cho LGL `Y`) `budgetVersionGet`                                               | phiên bản LGL `Y`                                                  | `origin: BASELINE_NO_HEAD`, `APPROVED`                                                                                                                                                                                                           |
| DM4-13 | B4 số liệu nền phòng mới       | D0          | NV-FIN1         | `budgetVersionCreate` (`source: BASELINE`)                                             | `CC-DAT`, `year=Y+1`                                               | _theo `D0`_: `D0` > hạn nộp `Y+1` ⟹ 201 `origin: BASELINE_NO_HEAD`, cơ sở 0 (DAT chưa có seat); ngược lại 409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED` (`details.reason` hạn nộp chưa qua)                                                          |
| DM4-14 | B4 số liệu nền có trưởng phòng | D0          | NV-FIN1         | `budgetVersionCreate` (`source: BASELINE`)                                             | ENG, `year=Y`                                                      | 409 `BUDGET.BASELINE_VERSION_NOT_ALLOWED` (`details.reason`)                                                                                                                                                                                     |
| DM4-15 | B5 yêu cầu sửa thiếu lý do     | D0          | NV-CEO          | `budgetVersionDecide`                                                                  | MKT `Y+1`, `REQUEST_CHANGES` không lý do                           | 422                                                                                                                                                                                                                                              |
| DM4-16 | B5 duyệt                       | D0          | NV-CEO          | `budgetVersionDecide`                                                                  | MKT `Y+1`, `APPROVE`                                               | `APPROVED`; trưởng phòng MKT thấy ở `budgetMine?year=Y+1`                                                                                                                                                                                        |
| DM4-17 | B5 SoD                         | D0          | NV-FIN1         | `budgetVersionDecide`                                                                  | phiên bản ENG `Y+1`                                                | 403                                                                                                                                                                                                                                              |
| DM4-25 | B5 từ chối                     | D0          | NV-FIN1, NV-CEO | `budgetVersionCreate`, `budgetVersionSend`, `budgetVersionDecide`                      | phiên bản từ đề xuất ITO (DM4-09); `REJECT` không lý do / có lý do | gửi ⟹ `SENT` (tập B4 264M); 422 / `REJECTED`                                                                                                                                                                                                     |
| DM4-26 | B6 khóa cả năm                 | D0          | NV-FIN1         | `budgetVersionCreate`                                                                  | SAL `Y+1` (đã `APPROVED`)                                          | 409 `BUDGET.CURRENT_EXISTS`                                                                                                                                                                                                                      |
| DM4-27 | B3 nộp cho phòng khác          | D0          | NV-ENGH         | `budgetProposalSubmit`                                                                 | `CC-MKT`, `Y+1`                                                    | 403                                                                                                                                                                                                                                              |
| DM4-18 | B6 xem ngân sách               | D0          | NV-MKTH         | `budgetMine` (W2)                                                                      | `Y`                                                                | cơ sở 240.000, dự phòng 24.000, `spent` 0, `departmentCeiling`, `cycle`; `remainingWithReserve` theo R10                                                                                                                                         |
| DM4-19 | B6 bảng Finance                | D0          | NV-FIN1         | `budgetTable`, `budgetSummary` (W2)                                                    | `Y`                                                                | DES dòng `NO_BUDGET`; `annualCeiling`, `sharedPoolReserve`                                                                                                                                                                                       |
| DM4-20 | B6 sai vai                     | D0          | NV-ENGH         | `budgetTable`                                                                          | —                                                                  | 403                                                                                                                                                                                                                                              |
| DM4-21 | phòng mới                      | D0          | NV-SA           | `departmentCreate`                                                                     | phòng mới                                                          | 409 `DEPARTMENT.OUTSIDE_BUDGET_PERIOD` (kỳ `Y+1` đã phát hành lần đầu)                                                                                                                                                                           |
| DM4-22 | phòng chưa hiệu lực            | D0          | NV-SA           | `departmentTransferRecord` (căn cứ hợp lệ)                                             | NV-DEV1 sang DAT, hiệu lực `D0`                                    | 422 `DEPARTMENT.NOT_YET_EFFECTIVE`                                                                                                                                                                                                               |
| DM4-23 | B7 đóng năm                    | 01/01/`Y+1` | hệ thống (flow) | sweep đóng năm                                                                         | `FlowClock.jumpTo(Y+1-01-01)`                                      | phiên bản `Y` thành đối chiếu bất biến; `budgetMine?year=Y` chỉ đọc                                                                                                                                                                              |
| DM4-24 | cam kết 01/01                  | 01/01/`Y+1` | hệ thống (flow) | sweep `year-start-commitments` (W4)                                                    | quyền `K1`/`K2` đang chạy                                          | khoản `YEAR_START_AUTO` cho năm `Y+1` (năm `Y` bị bỏ vì tổ chức tạo trong năm — Q-48); seat nền có khoản theo Assignment; **không** khoản cho `K4` vĩnh viễn (KEY-1) và quyền theo vai RB1–RB3; seat của OPS bị bỏ, audit lý do `NO_COST_CENTER` |

#### 9.2 SBF-20 / SBF-11 — kho và thuê bao (chủ: hạng mục này, flow `demo-sbf20.flow-spec.ts` `@SBF20 @DEMO`)

| ID      | Bước                 | Khi                                     | Tài khoản        | API                                                             | Đầu vào chính                                                                                   | Kết quả mong đợi                                                                                                                                                                                                    |
| ------- | -------------------- | --------------------------------------- | ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS20-01 | chặn trùng           | D0                                      | NV-ITA2          | `subscriptionCreate`                                            | Figma thứ hai                                                                                   | 409 `SUBSCRIPTION.DUPLICATE_PLAN` (baseline đã đóng)                                                                                                                                                                |
| DS20-02 | điểm gói năm         | D0                                      | NV-ITA2          | `subscriptionAdjustmentList`, `subscriptionAdjustmentGet` (W5)  | Figma                                                                                           | điểm mở, `pointDate = D0−10`, số seat cần = công thức C.2.1 (không seat đệm), số Trống, `vacantCostRatio`                                                                                                           |
| DS20-03 | ghi sai số           | D0                                      | NV-ITA2          | `subscriptionAdjustmentRecord`                                  | Figma `REDUCE`, số ≠ số seat cần                                                                | 422 `SUBSCRIPTION_ADJUSTMENT.QUANTITY_NOT_SEATS_NEEDED`                                                                                                                                                             |
| DS20-04 | ghi đúng             | D0                                      | NV-ITA2          | `subscriptionAdjustmentRecord`                                  | Figma `REDUCE`, đúng số                                                                         | `RECORDED`; FIN1 nhận `SUBSCRIPTION_ADJUSTMENT_RECORDED`; ghi lần hai ⟹ 409 `ALREADY_RECORDED`                                                                                                                      |
| DS20-05 | sai người ghi        | D0                                      | NV-FIN1          | `subscriptionAdjustmentRecord`                                  | Jira                                                                                            | 403                                                                                                                                                                                                                 |
| DS20-06 | mức tối thiểu NCC    | D0                                      | NV-ITA1          | `subscriptionAdjustmentRecord`                                  | GitHub `KEEP` 10 (= đã mua, > số seat cần) kèm `vendorMinimum` không bằng chứng / có bằng chứng | 422 `VENDOR_MINIMUM_EVIDENCE_REQUIRED` / `RECORDED` với `vendorMinimum.seats` 10                                                                                                                                    |
| DS20-07 | giảm giữa kỳ         | D0                                      | NV-ITA2          | `subscriptionUpdate`                                            | Figma `purchasedQuantity` giảm                                                                  | 409 `SUBSCRIPTION.REDUCE_AT_ADJUSTMENT_POINT`                                                                                                                                                                       |
| DS20-24 | tăng giữa kỳ         | D0                                      | NV-ITA2          | `subscriptionUpdate`                                            | Canva (gói năm) `purchasedQuantity` +1                                                          | 200 (gói năm tăng giữa kỳ được — R-G01)                                                                                                                                                                             |
| DS20-08 | cảnh báo đỏ          | D0                                      | NV-ITA2, NV-FIN1 | `notificationList`                                              | —                                                                                               | `SUBSCRIPTION_RED_ALERT` của Adobe CC, Zoom, Loom (mỗi thuê bao một lần); Figma, Canva chưa; NV-CEO không nhận                                                                                                      |
| DS20-09 | sự cố gia hạn        | D0                                      | NV-CEO           | `subscriptionIncidentList` (W5)                                 | `kind=UNINTENDED_RENEWAL`                                                                       | Zoom, nguồn `NO_RESULT_PAST_DEADLINE`; CEO, ITA2, FIN1 có thông báo                                                                                                                                                 |
| DS20-10 | chất lượng dữ liệu   | D0                                      | NV-ITA2          | `notificationList`, `subscriptionAdjustmentGet`                 | Canva                                                                                           | điểm mở (`pointDate = D0−5`), basis `RENEWAL_DATE`; `SUBSCRIPTION_RENEWAL_DATA_QUALITY` một lần                                                                                                                     |
| DS20-11 | hủy không hợp lệ     | D0                                      | NV-ITA1          | `subscriptionAdjustmentRecord`                                  | Jira `CANCEL`                                                                                   | 409 `SUBSCRIPTION_ADJUSTMENT.CANCEL_NOT_ALLOWED` (còn quyền)                                                                                                                                                        |
| DS20-12 | đóng trước khi hủy   | D0                                      | NV-ITA2          | `subscriptionClose` (W5)                                        | Notion                                                                                          | 409 `SUBSCRIPTION.CLOSE_REQUIRES_CANCEL`                                                                                                                                                                            |
| DS20-13 | hủy rồi đóng         | D0                                      | NV-ITA2          | `subscriptionAdjustmentRecord` (`CANCEL`) → `subscriptionClose` | Notion, `dataExported`/`ownerTransferred` true                                                  | thiếu cam kết ⟹ 422 `CLOSE_ATTESTATION_REQUIRED`; đủ ⟹ `CLOSED`; `realisedSavingList` (NV-FIN1) có dòng `CANCELLED` = net SV-HD5 (hóa đơn `CONFIRMED` phủ kỳ cuối — seed ở `-mf1`; trước khi có `-mf1`: không dòng) |
| DS20-14 | đóng còn quyền       | D0                                      | NV-ITA1          | `subscriptionClose`                                             | Jira (điểm mở, chưa `CANCEL`)                                                                   | 409 `SUBSCRIPTION.CLOSE_REQUIRES_CANCEL` (luật kiểm theo thứ tự, trước `ACTIVE_RIGHTS_REMAIN`)                                                                                                                      |
| DS20-15 | sai vai `KPI-4`      | D0                                      | NV-FIN1          | `kpi4MonthList` (W5)                                            | —                                                                                               | 403                                                                                                                                                                                                                 |
| DS20-18 | hết hạn chưa gia hạn | D0+3                                    | hệ thống (flow)  | sweep `subscription-renewal`                                    | Loom                                                                                            | sự cố `EXPIRED_NOT_RENEWED`; `licenseAssignmentList` NV-DES5 `suspendedByVendor` (Q-101)                                                                                                                            |
| DS20-22 | gia hạn trễ          | D0+3                                    | NV-ITA2 (flow)   | `subscriptionAdjustmentRecord`                                  | Loom `KEEP` (= đã mua)                                                                          | sự cố được giải quyết `LATE_RENEWAL`; NV-DES5 `suspendedByVendor` false; NV-CEO không nhận thêm                                                                                                                     |
| DS20-16 | mặc định gói tháng   | D0+5                                    | hệ thống (flow)  | sweep `subscription-adjustment`                                 | Jira chưa ghi tới ngày thanh toán                                                               | `KEEP` `SYSTEM_DEFAULT`, `SUBSCRIPTION_MONTHLY_KEPT_BY_DEFAULT`                                                                                                                                                     |
| DS20-17 | đỏ gói năm           | D0+13 (world riêng)                     | hệ thống (flow)  | sweep                                                           | Figma chưa ghi (world không chạy DS20-04)                                                       | `SUBSCRIPTION_RED_ALERT` cho ITA2 + FIN1                                                                                                                                                                            |
| DS20-23 | NCC tự gia hạn sai   | D0+21                                   | NV-ITA2 (flow)   | `subscriptionAdjustmentVendorOutcomeRecord` (W5)                | Figma (đã `REDUCE` ở DS20-04), `AUTO_RENEWED` số cũ                                             | sự cố `UNINTENDED_RENEWAL` nguồn `VENDOR_OUTCOME`; CEO, ITA2, FIN1 có thông báo (R-G07)                                                                                                                             |
| DS20-19 | seat-tháng, dòng kho | ngày 1 tháng sau                        | hệ thống (flow)  | job `seat-cost` (W5)                                            | tháng của `D0`                                                                                  | `sharedPoolCostList` (FIN1): dòng `HOLDER` theo Cost Center người giữ, `SHARED_POOL` cho seat Trống; OPS ⟹ `UNALLOCATED_COST_CENTER`; MKT, SAL không dòng                                                           |
| DS20-21 | tỷ lệ seat Trống     | ngày 1 tháng sau                        | NV-ITA1 (flow)   | `itAdminDashboardGet`                                           | —                                                                                               | `vacantSeatCost`; vượt 10 % ⟹ `SHARED_POOL_IDLE_SEAT_RATIO`                                                                                                                                                         |
| DS20-20 | `KPI-4`              | ngày 1 của tháng sau tháng chứa `D0+28` | NV-ITA1 (flow)   | `kpi4MonthGet`                                                  | tháng chứa `D0+28`                                                                              | Zoom (sự cố, từ `D0+28`) và Jira (giữ mặc định) có seat-tháng `counted` (số _theo `D0`_)                                                                                                                            |

DS20-25 (lũy kế dòng kho vượt Dự phòng kho ⟹ cảnh báo Finance, R-H03) **không** đưa vào: Dự phòng kho `Y` 1 tỷ, dữ liệu demo không thể vượt; luật đã có
integration ở W5 `seat-month-cost-pool-line`.

#### 9.3 MF-1 (chủ: `qd103-seed-demo-v4-mf1`) và 9.4 MF-5 (chủ: `qd103-seed-demo-v4-mf5`)

Bảng chi tiết nằm ở spec của hai hạng mục đó (mục _Kịch bản demo_, ID `DM1-xx`, `DM5-xx`), cùng định dạng cột và cùng luật thứ tự. W9 đọc ba bảng theo
thứ tự **DM4 → DS20 → DM1 → DM5** (MF-1 cần ngân sách; MF-5 cần kho và quyền đã cấp).

### 10. Diễn biến theo ngày (README fixture)

`D0`: mọi trạng thái của mục 3–5 và hai hạng mục kia; lượt job đầu (5 phút sau khi API demo khởi động) tạo điểm điều chỉnh, cảnh báo đỏ Adobe/Zoom/Loom,
sự cố Zoom, cảnh báo chất lượng dữ liệu Canva, `G1`–`G4`. `D0+3`: Loom hết hạn chưa gia hạn. `D0+5`: Jira giữ mặc định. `D0+13`: đỏ Figma (nếu chưa ghi).
`D0+18`: đỏ Canva. Ngày 1 tháng sau: seat-tháng, tỷ lệ seat Trống. Ngày 1 sau tháng chứa `D0+28`: `KPI-4` có Zoom. 01/01/`Y+1`: đóng năm, khoản cam
kết tự tạo. Các mốc của MF-1/MF-5 ở spec tương ứng. Chạy lại seed không làm mới các mốc (Q-106) — muốn lại từ đầu thì reset. **Giới hạn tháng 12:** `D0`
trong tháng 12 ⟹ mọi dòng _tháng sau_ rơi vào năm `Y+1` (số tiền tính theo năm mới, ENG `Y+1` chưa có ngân sách duyệt) — kết quả flow tính _theo `D0`_.

## Test matrix

| AC / rủi ro             | Tình huống (gồm từ chối, edge case)                                                                                                                                      | Cấp test                                         | Kết quả mong đợi                                                                                                                                                      | Bằng chứng sau implement |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| phát hành               | `--fixture shared-demo-v3`; DB có Audit `DEMO_DATASET:shared-demo-v3:`                                                                                                   | unit (`seed.arguments`, `seed-run`)              | exit 3 `Unknown fixture`; exit 3 "dataset khác", không ghi                                                                                                            | planned                  |
| ngày tương đối          | `demo-dates` với `D0` 15/03, 20/12, 31/12, 01/01                                                                                                                         | unit (`demo-dates.spec.ts`)                      | kỳ thuê bao, hạn chót, `EOM`, `addMonths` đúng; kỳ vắt năm hợp lệ                                                                                                     | planned                  |
| thứ tự dòng flow        | `scenarioDay` mọi dòng DM4/DS20/DM1/DM5 với `D0` 15/03, 20/12, 31/12, 01/01                                                                                              | unit (`demo-dates.spec.ts`)                      | sau khi sắp, ngày không giảm; dòng `D0` đứng trước; cùng ngày giữ thứ tự bảng                                                                                         | planned                  |
| quy mô BRD 3.4          | fixture                                                                                                                                                                  | unit (`shared-demo-v4.spec.ts`)                  | 120 người (36 + 84), 26 tài khoản, 10 phòng nghiệp vụ + ADMIN, 15 SaaS + K4 + K5; mỗi gói một thuê bao                                                                | planned                  |
| baseline hợp lệ         | mọi dòng seat nền qua `seat-baseline-rows.policy` (người, `hire_date`, `employmentType`)                                                                                 | unit                                             | không lỗi dòng (`EXPECTED_END_REQUIRED`, `EFFECTIVE_BEFORE_HIRE`…); CTR1/INT1 có `expected_end_date`                                                                  | planned                  |
| kho đủ chỗ              | `purchasedQuantity` = baseline + `freeAfterBaseline`; mọi kịch bản lấy từ kho (gồm RB1–RB3) có chỗ; 1Password 0                                                          | unit                                             | không âm; Slack R14 + RB1 = 3/3; Google Workspace RB2 + RB3 = 2/3; 1Password Trống 0; Zoom mua 12 > cần 10; GitHub mua 10 = mức tối thiểu                             | planned                  |
| GH-1 vô tình            | seat nền × gói kịch bản của cùng người                                                                                                                                   | unit                                             | không trùng ngoài dòng từ chối cố ý                                                                                                                                   | planned                  |
| B2/B4 bất đẳng thức     | Σ Trần phòng (đủ tập phòng, gồm ADMIN) + dự phòng kho ≤ Trần năm (`Y`, `Y+1`); tập B4 sau seed ≤ khả dụng; DM4-10 > khả dụng                                             | unit                                             | đúng; DM4-04 vượt 10M                                                                                                                                                 | planned                  |
| ba kết quả ngân sách    | MKT: `spent` tối đa tới 31/12 + `held` + `pending` = 0 ⟹ 240.000 < 250.000 ≤ 264.000; SAL: 290.000 < 300.000 ≤ 319.000 < 400.000; LGL R13 trong cơ sở với `spent` tối đa | unit (bất đẳng thức, giá và seat đọc từ fixture) | `USES_RESERVE`, `BLOCKED`, `WITHIN_BASE` không phụ thuộc tháng (Q-103)                                                                                                | planned                  |
| tham số                 | mốc fixture so với mặc định trong `parameter-definitions.policy.ts`                                                                                                      | unit                                             | đỏ ở `D0` = {Adobe, Zoom, Loom}; Figma, Canva điểm mở chưa đỏ; Zoom qua hạn chót; Jira/Notion/GitHub/Canva điểm mở; Slack chưa mở                                     | planned                  |
| seed thật               | DB trống, `apply`                                                                                                                                                        | integration (`seed.integration-spec.ts`)         | exit 0; số người/tài khoản/phòng; DAT `effectiveFrom` = 01/01/`Y+1`; baseline đóng; phiên bản `Y`/`Y+1` đúng bảng mục 5; thuê bao đúng mốc; **ghi thời gian apply**   | planned                  |
| plan không ghi          | `plan` trên DB đã cài                                                                                                                                                    | integration (`seed.integration-spec.ts`)         | không bản ghi nghiệp vụ mới                                                                                                                                           | planned                  |
| chạy lại                | apply hai lần cùng ngày; lần hai sau khi chạy rút gọn DM4-04, DM4-11, DM4-16, DS20-04, DS20-13 và đẩy R02 đi tiếp                                                        | integration (`seed-rerun`)                       | lần hai exit 2, không `conflict`, không ghi thừa; bản ghi đi tiếp ⟹ `present` theo bảng mục 1.5                                                                       | planned                  |
| chạy lại ngày khác      | apply D0, apply lại D0+3 (đồng hồ giả, cùng năm)                                                                                                                         | integration (`seed-calendar`)                    | exit 2; ngày thuê bao giữ của lần đầu                                                                                                                                 | planned                  |
| biên năm                | apply với `D0` = 20/12, 31/12 và 01/01 (phần nền + `-mf1`; step nhân sự của `-mf5` chỉ khi đã kiểm trigger đọc đồng hồ DB — plan _Before coding_)                        | integration (`seed-calendar`)                    | exit 0; kỳ `Y`/`Y+1` đúng năm; R10/R11 giữ kết quả                                                                                                                    | planned                  |
| runtime role            | `check` bằng role production                                                                                                                                             | integration serial (`seed-check-runtime`)        | đếm phòng/tài khoản đúng v4                                                                                                                                           | planned                  |
| lượt job đầu sau apply  | wrapper VPS hai nhánh; wrapper local                                                                                                                                     | script (`seed.test.mjs`, `seed-local.test.mjs`)  | VPS nhánh không reset: `compose restart api` + ready **trước** apply; nhánh reset giữ `up -d api worker` trước apply; local giữ khởi động `dist/main` mới trước apply | planned                  |
| MF-4 từng bước          | DM4-01 → DM4-27                                                                                                                                                          | flow `demo-mf4.flow-spec.ts` `@MF4 @DEMO`        | đúng cột _Kết quả_; thứ tự theo `scenarioDay`                                                                                                                         | planned                  |
| SBF-20/SBF-11 từng bước | DS20-01 → DS20-24 (DS20-17 world riêng)                                                                                                                                  | flow `demo-sbf20.flow-spec.ts` `@SBF20 @DEMO`    | đúng cột _Kết quả_; thứ tự theo `scenarioDay`                                                                                                                         | planned                  |
| consumer không vỡ       | mọi flow hiện có đọc dataset                                                                                                                                             | flow (danh sách ở plan)                          | xanh, không nới assertion                                                                                                                                             | planned                  |
| README                  | bảng phòng/người/thuê bao/ngân sách, _Lượt job đầu_                                                                                                                      | unit (`shared-demo-v4.spec.ts` đọc README)       | khớp fixture; không chữ "demo" trong dữ liệu                                                                                                                          | planned                  |

## Definition of Done

- [ ] Mọi dòng test matrix có test đỏ-trước/xanh-sau ở cấp ghi; flow chạy trên revision cuối.
- [ ] Kiểm tra nhanh tracker §4.5 xanh (`openapi:export` không drift — hạng mục không đổi HTTP); test theo file xanh; `pnpm check` và test toàn bộ CHƯA chạy (W9).
- [ ] `fixture/shared-demo-v4/README.md`, `docs/guides/seed.md`, `docs/guides/huong-dan-dev-moi.md` trỏ v4; không còn tham chiếu v3 ngoài spec cũ.
- [ ] Runbook reset VPS cập nhật (API khởi động lại trước apply, chờ 5 phút trước khi demo MF-5); phần chưa chạy trên VPS ghi rõ, Owner chạy.
- [ ] Thời gian apply thật ghi ở plan _Verification_ và README; > 4 phút đã báo chat review.
- [ ] Bảng _Kịch bản demo_ (mục 9 + hai hạng mục kia) khớp `operationId` trong `openapi.json` cuối (unit đọc OpenAPI export); operation đã gỡ có trong
      `REMOVED_OPERATIONS` và **không** có trong `openapi.json`.

## Changes and acceptance

- 08/11/2026: bản nháp đầu (subagent chat review, W7). Chưa qua cổng thiết kế, chưa nghiệm thu.
- 09/11/2026: sửa theo audit thiết kế W7 (`design-audit-w7.md`): DA7-01 ADMIN trong Trần `Y+1` (11 phòng), DA7-02 DM4-04 bỏ phát hành → publish 409 →
  phát hành lại, DA7-03 lượt job đầu chạy trong API (Q-99 đổi: API mới trước apply, đo thời gian, chốt ở `-mf5`), DA7-05 MKT/SAL không seat trả phí
  nền, SAL 290.000 (Q-103 đổi), DA7-06 sắp dòng theo `scenarioDay`, DA7-07 DM4-10/11 thứ tự, DA7-08 DS20-13 cần SV-HD5, DA7-09 GitHub mua 10, DA7-10 tập
  đỏ {Adobe, Zoom, Loom} + Canva 25 ngày (vế "Loom chất lượng dữ liệu" của audit không đúng: `autoRenew` false ⟹ mốc `END_DATE`), DA7-11 DS20-20 theo
  tháng chứa `D0+28` + giới hạn tháng 12, DA7-12 DM4-13 thành DAT `Y+1`, DA7-13 `hire_date` tương đối + `expected_end_date`, DA7-14 luật `present` từng
  loại (Q-106 sửa), DA7-15 biên năm không chạy step nhân sự khi chưa kiểm trigger, DA7-17 DM4-25…27, DA7-22 `granted_on` `D0−130`, DA7-24 DM4-24 loại
  trừ + RB trong unit kho, DA7-25 Task 1, DA7-26 đo thời gian, DA7-27 link QUESTIONS; thêm DS20-22…24, ghi `FR-9.5` (L4-23) ngoài hạng mục. Thiết kế
  `ready`, chờ chat review duyệt.
