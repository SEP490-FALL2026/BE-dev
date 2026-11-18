# Review kiến trúc và độ dễ đọc của BE sau tái cấu trúc (30/10/2026)

- Phạm vi: `src/` và `test/` của BE sau đợt tái cấu trúc modular monolith và thiết kế lại test
  ([be-architecture-boundaries-restructure](../../workspace/items/be-architecture-boundaries-restructure/spec.md),
  [be-test-architecture-redesign](../../workspace/items/be-test-architecture-redesign/spec.md)).
- Revision: BE `25d5244` (`dev`) cộng cây làm việc chưa commit của hạng mục `shared-demo-dataset` (phiên khác, không sửa).
  Docs `578f442`.
- Người review: AI theo yêu cầu Owner ngày 30/10/2026. Không có Owner review, peer review hay nghiệm thu nào được ghi ở
  đây.
- Phương pháp: chỉ phân tích tĩnh — đọc code, đếm bằng script, chạy công cụ tĩnh. **Không chạy jest** (unit, gate, HTTP,
  integration, E2E), không build. Số đo test lấy từ
  [nghiệm thu 29/10/2026](../be-architecture-test-acceptance-2026-10-29/README.md).
- Kế hoạch sửa: [be-architecture-readability-hardening](../../workspace/items/be-architecture-readability-hardening/spec.md).

## Lệnh đã chạy

| Lệnh                                        | Kết quả trên cây làm việc 30/10/2026                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm arch:check`                           | Xanh: `no dependency violations found (1317 modules, 6624 dependencies cruised)`, 8,6 s                             |
| `npx tsc --noEmit`                          | Xanh, 7 s                                                                                                           |
| `npx eslint "src/**/*.ts"`                  | 1 lỗi, 229 cảnh báo. Lỗi duy nhất ở `src/cli/demo-dataset/demo-dataset.command.ts:32` (WIP lúc đó; hết ở `f498c74`) |
| `pnpm arch:docs:check`                      | Xanh (`module-graph.md`, `routes.md` khớp code)                                                                     |
| `pnpm rules:check`                          | Xanh: 320 file, 2 689 link, 0 lỗi                                                                                   |
| Script đếm import (bản sao ở plan Task 0.1) | Cạnh module, cạnh capability trong module, vòng ở mức capability, file lớn, extension point                         |

`pnpm lint` đầy đủ (gồm `test/`, `scripts/`), `pnpm check` và mọi runner jest **chưa chạy**.

## Kết luận

**Ở mức module, đây là một modular monolith đúng chuẩn và được máy giữ.** Một codebase, một PostgreSQL, ba tiến trình
từ một image; 14 module xếp sáu tầng; module khác chỉ đi qua `public/` hoặc `*.module.ts`; không vòng import ở mức file;
lỗi, SQL và HTTP nằm đúng loại file. Dependency-cruiser không thấy vi phạm nào trên 6 624 cạnh.

**Bên trong các module lớn thì chưa đạt mục tiêu "đọc được không cần AI".** `requests` (24 capability, 28 057 dòng, 24 %
mã) có 82 cạnh giữa các capability và một vòng gồm 19 capability: mở một capability không đủ để hiểu nó. Sáu module khác
có vòng ở mức capability, phần lớn đi qua thư mục kỹ thuật `mappers/`. Rủi ro lớn nhất về đúng/sai nằm ở chỗ khác: tập
listener của một extension point phụ thuộc graph Nest đang chạy (API, worker, từng lệnh CLI) và không có gì kiểm tập đó.

| Câu hỏi của Owner                      | Trả lời ngắn                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đúng chuẩn monolith chưa?              | Có, ở mức module (tầng, cửa công khai, một DB, một image). Chưa, ở mức capability trong `requests` và năm module khác.                                                                                                                                       |
| Dễ đọc, dễ nhìn?                       | Module nhỏ/vừa: có. `requests`, `personnel`, `licensing`, `catalog`: khó — một luồng trải trên 3–4 thư mục (ví dụ quyết định nhu cầu: route ở `request-submission/`, service ở `need-decision/`, policy ở `access-request/`).                                |
| Dễ implement?                          | Công thức thêm route rõ. Hai câu hỏi chưa có câu trả lời viết ra: đặt file ở capability nào khi use case chạm nhiều capability, và đăng ký provider/listener vào Nest module nào (45 Nest module, nhiều graph).                                              |
| Dễ maintain, debug?                    | Tốt ở mã lỗi ổn định, request id, Audit Trail, thứ tự khóa ghi trong comment. Yếu ở wiring âm thầm (AR-01) và test integration rất dài (AT-02).                                                                                                              |
| Dev mới đọc hiểu không?                | Lần được một route trong vài phút nhờ [routes.md](../../generated/routes.md) và module card. Nhưng hướng dẫn chính cho dev mới đã lỗi thời và mâu thuẫn rule (AR-10), và hàng trăm mã nội bộ trong comment cần tra lịch sử review (AR-11).                   |
| Rules, cấu hình kiến trúc đã đủ chuẩn? | Phần lớn: dependency-cruiser, gate layout, ESLint, OpenAPI, migration. Còn lỗ: không kiểm vòng capability, không cấm thư mục kỹ thuật dưới module, cảnh báo ESLint có trần bằng đúng số hiện tại, không kiểm wiring theo graph (AR-01, AR-03, AR-04, AR-07). |

### Điểm theo trục

| Trục                               | Mức        | Căn cứ                                                                         |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Ranh giới module (tầng, `public/`) | Tốt        | `arch:check` 0 vi phạm; 59 cạnh module, đều đi xuống tầng                      |
| Ranh giới capability trong module  | Yếu        | 7/14 module có vòng capability; `requests` 82 cạnh, vòng 19 capability         |
| Wiring nhiều tiến trình            | Rủi ro     | 19 extension point, 33 listener, không kiểm theo graph                         |
| Lần một route                      | Tốt        | `routes.md` sinh từ code, module card, comment gắn US/AC (1 346 tham chiếu)    |
| Nhất quán layout                   | Trung bình | Thư mục kỹ thuật ở 6 module, 5 module phẳng, nhiều facade                      |
| Kích thước, độ phức tạp            | Trung bình | 0 file > 500 dòng; 101 hàm quá phức tạp, 99 hàm quá dài, 29 lớp > 8 dependency |
| Rules và cấu hình                  | Khá        | Gate tự động đủ rộng; còn lỗ ở AR-03, AR-04, AR-07                             |
| Tài liệu cho dev mới               | Trung bình | Bản đồ tốt; hướng dẫn lỗi thời; 9/16 ADR còn Proposed                          |
| Test                               | Khá, nặng  | Năm tầng rõ; integration 81 623 dòng, trung vị 9–12 s/file                     |

## Điểm mạnh nên giữ

- **Tầng và cửa công khai do máy giữ.** [`.dependency-cruiser.cjs`](../../../.dependency-cruiser.cjs) sinh luật từ
  [`scripts/arch/tiers.cjs`](../../../scripts/arch/tiers.cjs); thêm cạnh ngược phải sửa file tầng và ADR.
- **Bản đồ đọc code sinh từ code.** [routes.md](../../generated/routes.md) (route → controller → service) và
  [module-graph.md](../../generated/module-graph.md); `arch:docs:check` chặn khi lệch.
- **Từ vựng file nói vai trò.** 14 hậu tố, gate bắt lỗi khai ngoài `*.errors.ts`, `ApiException` trong service, raw SQL
  ngoài repo, so lỗi bằng chuỗi tên.
- **Extension point đơn giản.** `Hook`, `Listeners`, `Contributions` trong
  [`src/core/extension/`](../../../src/core/extension/) chưa tới 100 dòng; không còn lớp `Registered*`/`Refusing*` nào;
  không chỗ nào dùng `whenUnbound`.
- **File không phình.** Không file production nào quá 500 dòng; 54 file trên 300 dòng.
- **Code giải thích nghiệp vụ.** Service mở đầu bằng comment nêu Story/AC, SoD, thứ tự khóa (ví dụ
  [`need-decision.service.ts`](../../../src/modules/requests/need-decision/need-decision.service.ts)); một transaction
  bao trọn mỗi use case.
- **Bất biến ở DB.** 94 migration có `CHECK`/`EXCLUDE`/trigger; vai đọc từ DB mỗi request.

## Finding

Mức: **High** — rủi ro sai hành vi hoặc chặn mục tiêu "đọc không cần AI"; **Medium** — làm chậm hay dễ sai khi sửa code;
**Low** — vệ sinh, tài liệu. "Plausible" = cơ chế cho phép lỗi xảy ra nhưng review chưa chứng minh luồng hiện tại bị lỗi.
Mỗi finding có task sửa ở [plan](../../workspace/items/be-architecture-readability-hardening/plan.md).

### AR-01 — High (Plausible): tập listener phụ thuộc graph Nest đang chạy, không có gì kiểm

- Bằng chứng: listener được đăng ký bằng provider `*.listener.ts` trong Nest module nào nạp nó. Cùng một extension point
  có tập listener khác nhau theo graph: `HeldNoticeHandoverListener` chỉ có trong
  [`organization-http.module.ts:48`](../../../src/modules/organization/organization-http.module.ts) (graph API). Graph lệnh
  `record-super-admin-event` ([`super-admin-event.module.ts`](../../../src/modules/personnel/super-admin-event/super-admin-event.module.ts))
  nạp `PersonnelModule` và `OrganizationModule` nhưng không nạp budgets, requests hay `OrganizationHttpModule` — tức
  thiếu 3/5 listener của `OrganizationChangeListeners`.
- Vì sao nguy hiểm: [`OrganizationChangeService.emit`](../../../src/modules/organization/change-announcement/organization-change.service.ts)
  ghi dòng announcement rồi báo listener "đúng một lần". Listener vắng mặt trong graph phát sự kiện sẽ không bao giờ nhận
  thay đổi đó, và không có lỗi nào. `Listeners`/`Contributions` thiếu người đăng ký là im lặng; `Hook` thiếu bind chỉ nổ
  khi được gọi lần đầu. `assertHooksBound` có trong `core/extension/hook.ts` nhưng không chỗ nào gọi. Chỉ một test
  integration kiểm tên listener (`provisioning-revocation-read-contracts.integration-spec.ts:323`).
- Chưa chứng minh: luồng sự kiện về chính Super Admin hiện có gây mất thông báo hay không.
- Sửa: plan Task 1.1 — gate tĩnh so tập listener/hook của mỗi graph với graph API, chênh lệch phải khai có lý do.

### AR-02 — High: `requests` không đọc được theo từng capability

- Số đo: 24 capability, 229 file, 28 057 dòng; 82 cạnh capability → capability; một vòng gồm 19 capability. 102/229 cảnh
  báo ESLint nằm ở module này.
- Lõi chung `access-request/` import ngược 9 capability lá — chỉ qua ~12 cạnh file: `access-request-query.service.ts` →
  `assessment.repo`, `group-request.types`, `spend-status.service`; `access-request.errors.ts` → policy của
  `cancellation`, `delegated-request`, `withdraw`; `request-end.service.ts` → `budget-information`, `spend-batch.repo`,
  `spend-step.repo`; `grant/access-request-grant.listener.ts` → `group-grant.service`; `request-draft.repo.ts` → policy
  của `draft`.
- Quyền sở hữu file lệch tên thư mục: repo của bản nháp là `access-request/request-draft.repo.ts`, không ở `draft/`;
  `need-decision.policy.ts` ở `access-request/` còn route `POST /access-requests/:id/need-decision` và `/withdraw` ở
  `request-submission/access-requests.controller.ts`; `finance-review.repo.ts` và `spend-submission.dto.ts` ở `spend/`.
- Module card ghi "23 capability", thực tế 24.
- Sửa: plan Phase 4 — lõi không import lá, mỗi capability sở hữu route/policy/repo của nó, rồi bật luật vòng capability
  cho `requests`.

### AR-03 — Medium: vòng ở mức capability trong sáu module khác

- `catalog`: `catalog-entry ↔ plan ↔ subscription` (ví dụ `plan.service.ts` → `catalog-entry/application-lookup.service`,
  `catalog-entry/application-view.service.ts` → `plan/plan-lookup.service`).
- `licensing`: `assignment ↔ provisioning` (`assignment/department-tools/department-tools.service.ts` →
  `provisioning/revocation-read.service`).
- `personnel`: `notice ↔ transfer` (`transfer/transfer-notice.listener.ts` → `notice/notice.errors`, `notice.types`).
- `organization`: `department ↔ employee ↔ mappers ↔ cost-center ↔ project`; `identity-access`:
  `accounts ↔ auth ↔ mappers ↔ recovery`; `finance`: `exchange-rate ↔ mappers`. Ba vòng này đi qua thư mục `mappers/`.
- Vì sao: dependency-cruiser chỉ có `no-circular` ở mức file; S5 (Owner, 29/10/2026) cho capability import nhau tự do
  nên không có hướng. Không vòng file nhưng vẫn vòng thư mục — người đọc không biết bắt đầu từ đâu.
- Sửa: plan Phase 3 — gate DAG capability bật dần theo module (quyết định `OD-R3`).

### AR-04 — Medium: thư mục tầng kỹ thuật dưới module, gate không thấy

- `mappers/` ở `catalog`, `finance`, `identity-access`, `licensing`, `organization`, `personnel`; `dto/` ở
  `identity-access`, `organization`; `policies/` ở `identity-access`, `personnel`. Rule
  [module structure](../../rules/module-structure.md#layout-trong-một-module) cấm tách theo loại file.
- `mappers/` chứa cả `*.http-errors.ts` (`identity-access/mappers/auth.http-errors.ts`,
  `licensing/mappers/licensing.http-errors.ts`); `organization/dto/project-wire.dto.ts` nằm ngoài capability
  `organization/project/` đã có `project.dto.ts`; `personnel/mappers/personnel-unavailable.spec.ts` không có file nguồn
  cùng tên.
- Gate [module-layout](../../../test/gates/module-layout.gate-spec.ts) chỉ tìm `errors|common|shared|utils|helpers` ở
  `src/` và `src/modules/`, không ở cấp dưới module.
- Sửa: plan Task 2.1 và gate mới ở Task 2.5.

### AR-05 — Medium: hình dạng module và cửa công khai không thống nhất

- Năm module giữ file ở gốc thay vì capability (`audit`, `notifications`, `onboarding`, `operating-parameters`, một phần
  `installation`); `budgets` bọc mọi thứ trong một capability `budget/`. Hướng dẫn nói "module nhỏ giữ layout phẳng",
  rule không nói — hai nguồn khác nhau.
- Rule nói một facade `<M>Api` trong `public/<m>.api.ts`; thực tế `installation/public` có 5 file `*.api.ts`,
  `identity-access/public` có 5, `organization/public` có 3.
- `identity-access/account-sessions.extension-points.ts` nằm ở gốc module (rule: `.extension-points.ts` chỉ trong
  `public/`); comment của nó trỏ tới `architecture-structure.spec.ts`, file không còn tồn tại.
- 28 Nest module trong 14 module nghiệp vụ (identity-access 5, installation 5) cộng 17 ở hạ tầng/CLI/app/worker. Không có
  bảng nào nói một provider mới đăng ký vào module nào để có mặt trong API, worker hay lệnh CLI cần nó — đây là nguồn của
  AR-01.
- Sửa: plan Task 2.2, 2.3 và bảng "đăng ký ở đâu" trong hướng dẫn mới (Task 6.1).

### AR-06 — Medium: nhiều truy vấn đồng thời trên một client transaction

- `Promise.all` có ở 23 file của `src/modules` có tham số transaction (ví dụ `licensing/assignment/assignment.repo.ts:263`
  `Promise.all([tx.licenseAssignment.findMany(…), tx.licenseAssignment.count(…)])`).
- `pg` 8.23 in cảnh báo "client.query() when the client is already executing a query"; `pg@9` bỏ hành vi tự xếp hàng.
  Trên một client không có song song thật, chỉ có rủi ro. Đã ghi từ 18/10/2026 (F-30 audit nền tảng) và trong
  [nghiệm thu §10](../be-architecture-test-acceptance-2026-10-29/README.md), chưa sửa.
- Sửa: plan Task 1.2 — tuần tự trên `tx`, giữ `Promise.all` khi đọc qua pool; gate chặn tái phát.

### AR-07 — Medium: cấu hình ESLint không chặn được nợ mới

- Kích thước/độ phức tạp ở mức `warn`, `pnpm lint` dùng `--max-warnings 229` — đúng bằng số cảnh báo hiện có. Rule tự
  ghi: không chặn một hàm dài thêm, không chặn cảnh báo mới bù bằng cảnh báo vừa sửa.
- 101 `complexity`, 99 `max-lines-per-function`, 29 `max-params` (constructor 9–10 dependency, ví dụ `NeedDecisionService`
  10). Mười file nhiều cảnh báo nhất đều là service của `requests`, `catalog`, `budgets`.
- `@typescript-eslint/no-floating-promises` chỉ `warn` (một promise thả nổi trong transaction là lỗi dữ liệu), `no-explicit-any`
  tắt (15 chỗ `any` ngoài spec), `no-unsafe-argument` `warn`. `no-floating-promises` và `no-unsafe-argument` hiện không có
  vi phạm nào trong `src/` nên nâng lên `error` gần như miễn phí; `no-explicit-any` cần sửa 15 chỗ trước.
- [Nghiệm thu](../be-architecture-test-acceptance-2026-10-29/README.md) §4 đã nêu bảy file ưu tiên: `offboarding.service.ts`
  (complexity 42, 14 tham số), `employee-maintenance.service.ts` (41), `need-decision.service.ts` (36),
  `transfer.service.ts` (34), `request-submission/access-request.service.ts` (31), `licensing/public/licensing.api.ts` (13
  tham số), `assessment.service.ts` (13 tham số).
- Sửa: plan Task 1.3 và Phase 5 (quyết định `OD-R4`: ESLint 9.39 có bulk suppressions — chặn vi phạm mới theo từng file).

### AR-08 — Low: `src/core` bắt đầu chứa khái niệm của một module

- `core/hr-basis.ts` (dùng bởi organization, data-import), `core/account-identifier.ts` (licensing, data-import),
  `core/budget-year-lock-key.ts` (budgets, requests), `core/seat-occupancy.ts` (chỉ data-import dùng ngoài spec); thư mục
  `core/time/` rỗng.
- Các module dùng chúng đều được phép import `public/` của module sở hữu theo tầng, nên không cần đưa vào core. Để lâu
  `core` thành `shared/`.
- Sửa: plan Task 2.4.

### AR-09 — Low: hạ tầng hàng đợi chết và hai thư viện validate

> **Disposition Owner — 30/10/2026:** GIỮ queue/Redis cho tương lai. "Chết" là nhận định của review ban đầu,
> không phải lý do cho phép xóa: đây là hạ tầng dự phòng chưa mount. Task 2.6 đã chuyển sang rà/refactor có lý do,
> giữ module/dependency/config/test/Compose Redis, không tự thêm job hoặc kích hoạt kết nối Redis cho API/worker.
> Không yêu cầu Docs bỏ Redis khỏi BRD chỉ vì hiện tại chưa có consumer. Các quan sát ban đầu dưới đây giữ làm lịch sử.

- `src/infrastructure/queue/queue-infrastructure.module.ts` không được Nest module nào nạp (gate H6.4 khẳng định "mounts no
  queue anywhere"); `bullmq`, `@nestjs/bullmq` vẫn ở `dependencies`; `compose.yaml` vẫn chạy `redis`. BRD 6.1 (Docs) vẫn
  ghi "Redis và background-job queue" — lệch giữa tài liệu nghiệp vụ và kỹ thuật.
- Nit: env validate bằng `joi`, HTTP bằng `zod`.
- Sửa: plan Task 2.6 (quyết định `OD-R5`).

### AR-10 — Medium: tài liệu cho dev mới lỗi thời hoặc chưa được duyệt

- Hướng dẫn chính lúc review, `docs/guides/kien-truc-backend-va-cach-viet-code.md` (đã xóa ở Prompt 09 Task 6.1, thay
  bằng [hướng dẫn dev mới](../../guides/huong-dan-dev-moi.md)) (tên "kiến trúc backend và cách viết code", tiêu
  đề "Thêm một endpoint") vẫn nói "module đã vượt 2 controller hoặc 12 file ở root thì đặt vào capability" và "chỉ tạo
  `policies/`, `mappers/`, `errors/` khi có nội dung" — trái rule hiện hành; nhắc `audit-filter.ts` (file thật là
  `audit-filter.repo.ts`); không có ví dụ module lớn, không nói extension point, graph hay cách debug.
- 9/16 ADR còn **Proposed**: 0011–0019, gồm ADR-0019 về chính kiến trúc hiện tại ("Proposed, chấp nhận một phần").
  ADR-0005 ghi "No such custom constraints are currently needed" trong khi 94 migration có ràng buộc tùy biến.
- Sửa: plan Phase 6 (quyết định `OD-R7` cho ADR).

### AR-11 — Low: mã nội bộ trong comment và tên test

- Ngoài 1 346 tham chiếu `US-xx-yy` (có ích), comment trong `src` chứa hàng trăm mã finding/lát nội bộ: `F13` 64 lần,
  `F29` 24, `T-11` 24, `F43` 19, `P23-RV` 15, `GATE.2`, `H6.4`… Dev mới phải mở lịch sử review mới hiểu.
- Tên test gate cũng mang mã: `E6: declares…`, `GATE.2: binds…`, `H6.4 (E2 = A, ADR-0014): …`, `A4-03: …`.
- Sửa: plan Task 6.3 và 7.2.

### AR-12 — Low: gate vẫn to và vẫn có ledger

- 11 gate, 6 156 dòng (trước tái cấu trúc 7 371). Riêng
  [`api-collection-contract.gate-spec.ts`](../../../test/gates/api-collection-contract.gate-spec.ts) 2 774 dòng với các
  registry `COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS`.
- ADR-0019 §6 nói "bỏ ledger", nhưng `LEGACY_PRIVATE_EXPORTS` trong
  [`module-graph.gate-spec.ts:165`](../../../test/gates/module-graph.gate-spec.ts) còn 4 mục (`CostCenterRepo`,
  `DepartmentRepo`, `OrganizationRepo`, `NonWorkingDatesService`).
- `test/support/openapi-example-route-codes-a-l.ts` và `-m-z.ts` chia theo chữ cái — đúng kiểu cắt file ADR-0019 phê phán.
- Sửa: plan Phase 7.

### AT-01 — Medium: tháp test nặng ở integration và chậm

- Dòng code test: integration 271 file / 81 623 dòng; unit 258 file / 31 254; HTTP 46 / 8 013; E2E 8 / 862; support 73 /
  11 150. Mã production 116 175 dòng.
- Theo [nghiệm thu](../be-architecture-test-acceptance-2026-10-29/README.md) §5–§6: trung vị integration 9,3–11,9 s/file ở 6
  worker, p90 21–28 s; 234 `beforeAll` integration khai timeout 90–300 s; P7/P8 được Owner miễn, **không** phải đã đạt.
- Không sửa trong hạng mục này (thuộc `be-test-architecture-redesign`); chỉ đo phân loại ở Task 7.5.

### AT-02 — Medium: file test integration rất dài, không có trần

- `organization/departments-http.integration-spec.ts` 1 952 dòng, `data-import/employee-imports-http` 1 344,
  `identity-access/super-admin-recovery` 1 064; 10 file trên 675 dòng. Trần 400 dòng chỉ áp cho unit spec trong
  `src/modules`.
- Sửa: plan Task 7.4.

### AT-03 — Low: phân tầng HTTP và integration chưa đo

- 109/271 file integration dùng `supertest`. [Test guide](../../../test/README.md) cho dùng HTTP trong integration khi
  chính ánh xạ HTTP ↔ DB là điều cần chứng minh, không cho dùng HTTP chỉ để dựng dữ liệu. Review không phân loại từng
  file.
- Sửa: plan Task 7.5 (đo, ghi kết quả; chưa chuyển file).

### Bổ sung sau khi đối chiếu nghiệm thu 29/10/2026

Ba finding dưới đây có từ lượt đối chiếu (mục kế tiếp); lượt review đầu không có.

### AR-13 — Low: image production chứa devDependencies, stage `production-dependencies` không dùng

- [`Dockerfile`](../../../Dockerfile) dòng 36: stage `runtime` chép `node_modules` từ stage `build`
  (`pnpm install --frozen-lockfile`, đủ 31 devDependencies: jest, eslint, typescript…). Stage `production-dependencies`
  (`--prod`) có nhưng không stage nào chép. Nghiệm thu ghi nhận ở O4, "lượt này không đổi cách đóng gói".
- Ràng buộc: runtime và `deploy-release.sh` gọi `node_modules/prisma/build/index.js migrate deploy`, mà `prisma` đang ở
  `devDependencies`; muốn chép bản `--prod` thì phải chuyển `prisma` sang `dependencies` (và giữ client đã sinh).
- Sửa: plan Task 2.7 (quyết định `OD-R9`).

### AR-14 — Medium (Plausible): hook hồ sơ nhân sự nuốt lỗi bên trong transaction

- [`personnel-file-hooks.service.ts`](../../../src/modules/personnel/event-notice/personnel-file-hooks.service.ts):
  `PersonnelFileHooks.each` gọi từng hook (`open-requests`, `role-duties`, `service-account-duty`) trong transaction của
  lần ghi điều chuyển/nghỉ việc, `catch` mọi lỗi chỉ để log, comment hứa "the result of the write never changes".
- Lời hứa chỉ đúng với lỗi JavaScript ném trước khi chạm DB. Lỗi SQL trong một transaction PostgreSQL làm transaction bị hủy
  (`25P02 current transaction is aborted`): câu lệnh kế tiếp và commit đều thất bại, nên lần ghi vẫn hỏng nhưng thông báo
  lỗi trỏ sai chỗ. Với lỗi JavaScript, việc của hook (tạo tác vụ, chuyển trách nhiệm) biến mất mà lần ghi vẫn thành công.
  Trái quy ước `Listeners` của chính repo ("ném lỗi = hoàn tác").
- Đã được review 28/10/2026 nêu; tái cấu trúc giữ nguyên hành vi. Chưa dựng ca thử chứng minh.
- Sửa: plan Task 1.4 — thay đổi hành vi, cần `OD-R10`.

### AT-04 — Medium: integration trên CI vượt mục tiêu P5, quy tắc timeout của spec test lỗi thời

- Nghiệm thu §10: bước song song trên runner 2 vCPU mất 1 142–1 280 s; cả job ước 24–27 phút. P5 (≤ 15 phút) **chưa đạt**
  và **không** được miễn (O5 chỉ miễn P7, P8). Owner nâng `timeout-minutes` 30 → 40 (`ci.yml`), 40 → 50 (`nightly.yml`).
- [Spec test](../../workspace/items/be-test-architecture-redesign/spec.md) vẫn ghi "`timeout-minutes` … gấp đôi mục tiêu" —
  không còn khớp. Plan của hạng mục test ghi mọi task "xong", không có task nào cho P5.
- Sửa: plan Task 7.6 (quyết định `OD-R8`).

## Đối chiếu với nghiệm thu 29/10/2026

Mọi điểm còn mở của [nghiệm thu](../be-architecture-test-acceptance-2026-10-29/README.md) và nơi xử lý. "Đóng" = nghiệm
thu đã ghi xong và review này không thấy gì trái lại.

| Mục nghiệm thu                                                         | Trạng thái trong nghiệm thu                           | Lượt review đầu           | Xử lý ở hạng mục `be-architecture-readability-hardening`       |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| O1/S5 capability import nhau                                           | chấp nhận, bảo vệ bị nới                              | có (AR-03)                | R6, `OD-R3`, Phase 3–4                                         |
| O2/S12 `COPY scripts/build`; O3/S13 ba văn bản OpenAPI                 | chấp nhận                                             | —                         | Đóng; ADR-0019 ghi lại (Task 6.2)                              |
| O4 `jest-environment-node`, image có devDependencies                   | chấp nhận, "không đổi cách đóng gói"                  | **thiếu**                 | AR-13, Task 2.7, `OD-R9`                                       |
| O5 P7, P8                                                              | Owner miễn, không phải đã đạt                         | có (AT-01)                | Không làm (đúng O5); số đo ghi tham khảo ở Task 7.6            |
| O6 bằng chứng "xanh trên `main`"                                       | chưa có quyết định                                    | **thiếu**                 | Task 0.3                                                       |
| O7 đi 10 route ngẫu nhiên                                              | việc Owner khi review                                 | **thiếu**                 | Task 0.3; dùng lại ở Task 6.1                                  |
| ADR-0019: quy tắc nhóm chức năng, chi tiết extension point chưa review | chờ Owner                                             | một phần (AR-10)          | Task 6.2, `OD-R7`                                              |
| S1, S3, S7–S11 sai khác giữ lại                                        | giữ                                                   | —                         | Đóng; ADR-0019 ghi lại (Task 6.2)                              |
| S2 `whenUnbound`, 0 điểm dùng                                          | giữ                                                   | một phần (AR-01)          | Task 1.1: chọn một cơ chế (ngoại lệ wiring hoặc `whenUnbound`) |
| S4 `requests` 23→24 capability, đo lại khi xét tách `spend`            | giữ, `OD-A5`                                          | có (AR-02)                | Phase 4, `OD-R6`                                               |
| S10/§4 229 cảnh báo, bảy file ưu tiên                                  | theo dõi, "mỗi file nên có hạng mục riêng"            | một phần (thiếu 4/7 file) | Task 5.1, 5.2 (đủ bảy file), `OD-R4`                           |
| §5 P3(b) ProcSignalBarrier trên Docker Desktop                         | môi trường, không sửa được trong repo                 | —                         | Đóng (không phải lỗi code)                                     |
| §5 P5 integration ≤ 15 phút trên GitHub                                | chờ CI → nay biết chưa đạt (§10)                      | **thiếu**                 | AT-04, Task 7.6, `OD-R8`                                       |
| §5 ràng buộc đồng hồ: ghi và worker khác máy phải lệch < 5 s           | ghi trong nghiệm thu, chưa có trong tài liệu vận hành | **thiếu**                 | Task 6.2 (ghi vào `runtime-details.md`)                        |
| §7 capability gần trần 25 file                                         | xét lại khi thêm file                                 | có (AR-02)                | Phase 4 cho `access-request`, `spend`; gate trần giữ nguyên    |
| §8 bước 1–4 trên GitHub/VPS, artifact thời gian                        | chờ Owner                                             | **thiếu**                 | Task 0.3 (ghi run ID, kết quả vào hai plan và §5)              |
| §9 sửa harness, §10 dừng cả cây tiến trình Prisma                      | §10 đã commit `25d5244`, CI chưa có                   | **thiếu**                 | Task 0.3 (bằng chứng CI trên `25d5244`)                        |
| §10 `Promise.all` trên client transaction                              | ghi nhận, không sửa                                   | có (AR-06)                | Task 1.2                                                       |
| §10 quy tắc "timeout gấp đôi mục tiêu" không khớp                      | ghi nhận                                              | **thiếu**                 | AT-04, Task 7.6                                                |

Ngoài nghiệm thu: AR-14 (hook nuốt lỗi) có từ review 28/10/2026, vẫn còn ở BE `25d5244`.

### Kết quả sau Prompt 09 (31/10/2026, cây local chưa commit trên `f498c74`)

Phần trên giữ nguyên là hồ sơ của review. Kết quả xử lý (bằng chứng ở
[plan](../../workspace/items/be-architecture-readability-hardening/plan.md#verification-and-handoff); trạng thái
`local-implementation-verified` / `ready-for-owner-review`, chưa commit, CI cây mới chưa chạy):

| Finding      | Kết quả                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AR-01        | gate wiring extension point theo 11 graph tiến trình, 19/19 điểm; `whenUnbound`/`canAnswer` bỏ (S2); 8 ngoại lệ có lý do, mục cũ tự đỏ      |
| AR-02        | `requests` 36 capability, không vòng, L0 không import capability; tiêu chí "≤ 50 cạnh" thay bằng tiêu chí gate (Owner 31/10/2026), 111 cạnh |
| AR-03        | 0/14 module có vòng capability, đo xuyên file gốc/`public/`; capability không import facade của chính module                                |
| AR-04, AR-05 | 0 thư mục tầng kỹ thuật; R4/R5; nhiều facade một module, mỗi facade một `<X>Api`; R10 thay `LEGACY_PRIVATE_EXPORTS`                         |
| AR-06        | 0 `Promise.all` trên client transaction, gate quét cả `src/`                                                                                |
| AR-07        | mọi luật ở `error`; nợ 229 → 113 (`max-params` 0); gate đọc config ESLint hiệu lực, nợ chỉ được giảm                                        |
| AR-08        | gate R7: file `src/core` chỉ một module dùng thì đỏ, trừ danh sách primitive có lý do                                                       |
| AR-09        | Owner giữ queue/Redis (OD-R5): hạ tầng dự phòng, không consumer, không mount; API/worker không kết nối Redis (kiểm trên image)              |
| AR-10        | [hướng dẫn dev mới](../../guides/huong-dan-dev-moi.md) thay hướng dẫn cũ; ADR-0019 viết lại, vẫn Proposed; walkthrough O7 `pending` (Owner) |
| AR-11, AR-12 | comment hết mã việc nội bộ (chỉ đổi comment, chứng minh bằng build bỏ comment); tên gate nói hành vi; registry tách khỏi gate               |
| AR-13        | image `runtime` chỉ chép `production-dependencies` (OD-R9)                                                                                  |
| AR-14        | hook hồ sơ nhân sự ném lỗi, transaction rollback (OD-R10 = A)                                                                               |
| AT-01, AT-03 | P7/P8 vẫn miễn; phân tầng HTTP ↔ integration đo (Task 7.5), nhóm (b)/(c) giao `be-test-architecture-redesign`                               |
| AT-02        | gate trần 800 dòng; 7 file tách, số test và hook giữ nguyên, thêm kiểm bất biến I-2                                                         |
| AT-04        | P5 ghi theo số đo CI (30–31 phút); quy tắc timeout "p95 + 50 %" ≈ 47 phút so 40 đang cấu hình → Owner quyết                                 |

## Không kiểm chứng trong review này

- Không chạy test nào, không build, không chạy `pnpm lint` đầy đủ hay `pnpm check`.
- AR-01: chưa dựng kịch bản chứng minh mất thông báo trên luồng hiện có.
- AR-06: chưa đo ảnh hưởng hiệu năng của việc chuyển sang tuần tự (trên một client vốn đã tuần tự).
- Mã `demo-dataset` lúc review chưa commit, thuộc phiên khác; Owner commit trong `f498c74`, lỗi ESLint của nó đã hết ở đó (kiểm lại 30/10/2026 bằng `npx eslint` trên đúng file).
