# Spec: hoàn thiện ranh giới bên trong module và luật kiến trúc cho dev mới

> **Owner quyết định OD-R5 — 30/10/2026: GIỮ queue/Redis cho nhu cầu tương lai.** Không xóa module/config/test queue,
> `bullmq`, `@nestjs/bullmq`, cấu hình Redis hay service/volume Compose chỉ vì chưa có consumer. Task 2.6 chuyển thành
> rà soát/refactor hạ tầng dự phòng và tài liệu đúng trạng thái; không tự mount queue, thêm producer/consumer/job hoặc
> biến Redis thành dependency bắt buộc của API/worker hiện tại. Quyết định này thay mọi đề xuất xóa trước đó.

> **Kết quả Prompt 09 — 31/10/2026:** spec đã được triển khai trên cây local chưa commit (BE `f498c74` +
> thay đổi), `local-implementation-verified` / `ready-for-owner-review`; bằng chứng, finding và phần `pending` của Owner
> (O7, review ADR-0019, CI cây mới, timeout CI) ở [plan](plan.md#verification-and-handoff). Owner đã quyết thêm tiêu chí
> thay thế cho Task 4.3 (mục _Đích của `requests`_). Câu "chưa implement" ở đoạn dưới là trạng thái ngày 30/10/2026.

> **Cập nhật phạm vi Owner — 30/10/2026:** Owner yêu cầu triển khai spec/plan này, đồng thời sửa H7 quyền sequence
> BM-09/BM-11 và `API-DOC-F01/F03` trong cùng lượt implement → test → review độc lập → sửa finding. Xem
> [phụ lục triển khai trong plan](plan.md#owner-execution-addendum-2026-10-30). Phụ lục có ưu tiên đối với các câu cũ
> yêu cầu OpenAPI đúng byte tuyệt đối, xin phép từng suite và checkpoint chờ Owner giữa mọi task. Các OD bên dưới
> vẫn là lịch sử đề xuất, không tự biến thành quyết định đã được Owner duyệt. Các lựa chọn kỹ thuật thông thường được
> giao người thực hiện giải quyết có bằng chứng; câu hỏi quan trọng phải hỏi có phương án rồi tiếp tục cùng package.
> Lượt này chỉ mở rộng spec/plan và lưu prompt, **chưa implement, chưa test sản phẩm, chưa nghiệm thu**.

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc BE cho Phase 0–3, 5–7; người quen `requests` cho Phase 4).
- Thiết kế ban đầu bởi: AI theo yêu cầu Owner (30/10/2026) — review tĩnh, không chạy test
  ([review](../../../reviews/be-architecture-readability-review-2026-10-30/README.md)).
- Thiết kế: `draft`. Owner review: chưa review. Chờ Owner: `OD-R1` → `OD-R10` (mục _Owner decisions_) và bảng tầng của
  `requests` (Task 4.0 của plan).
- Nguồn: Docs `578f442` (BRD v3.57 mục 6.1), BE `25d5244` (review; cây làm việc có WIP `shared-demo-dataset`, Owner commit
  sau đó trong `f498c74`). Implement từ BE `f498c74` trở đi. ADR liên quan: 0001, 0003, 0005, 0019.
- Nhóm roadmap: xuyên module — `technical-enabler`, không thuộc nhóm G (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Hạng mục trước: [be-architecture-boundaries-restructure](../be-architecture-boundaries-restructure/spec.md),
  [be-test-architecture-redesign](../be-test-architecture-redesign/spec.md).

## Business outcome

Sau hạng mục này, một dev mới mở bất kỳ capability nào — kể cả trong `requests` — là thấy đủ route, use case, quy tắc và
SQL của nó, biết đặt file mới ở đâu và đăng ký provider vào Nest module nào; máy chặn vòng giữa capability, thư mục tầng
kỹ thuật, listener vắng mặt trong một tiến trình, truy vấn đồng thời trên một transaction và nợ kích thước mới. Kiểm bằng
`pnpm check` (gate mới) và số đo `pnpm arch:capabilities` trước/sau. Mọi việc còn mở của
[nghiệm thu 29/10/2026](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md) có chủ và bằng chứng. Không
đổi hành vi nghiệp vụ, HTTP contract hay schema — trừ đúng một chỗ có quyết định riêng: lỗi của hook hồ sơ nhân sự
(AR-14, `OD-R10`).

## Sizing decision

- Container: yêu cầu trực tiếp của Owner ngày 30/10/2026 (review kiến trúc và độ dễ đọc sau tái cấu trúc, BE `25d5244`).
- Mode: `technical-enabler`
- Outcome and owner: capability trong mọi module đọc được độc lập và luật cấu trúc do máy giữ; sở hữu: gate kiến trúc
  (`test/gates/`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `scripts/arch/`) và layout `src/modules/**`.
- Boundaries: không đổi transaction nào ngoài việc tuần tự hóa truy vấn trên cùng `tx` (AR-06); không đổi bảng, migration,
  route, mã lỗi, OpenAPI; không đổi env bắt buộc; extension point giữ tên và thứ tự listener. Ngoài `src/`: `Dockerfile`
  (`OD-R9`), `.github/workflows/ci.yml`, `nightly.yml` (`OD-R8`); transaction của ghi điều chuyển/nghỉ việc chỉ đổi khi
  `OD-R10` chọn.
- Not larger: không tách module `spend` (`OD-R6`), không làm lại test integration (thuộc `be-test-architecture-redesign`),
  không thêm tính năng.
- Not smaller: các phase dùng chung một bộ luật và gate (`capability-graph`, `module-layout`, `extension-wiring`); tách
  thành nhiều hạng mục sẽ có nhiều người sửa cùng gate và cùng file cấu hình. Ranh giới review/rollback là phase và
  checkpoint trong [plan](plan.md); mỗi task cỡ S/M, task cơ học (đổi chỗ, thêm một dòng ở nhiều file) được nhiều file.
- Siblings: `be-architecture-boundaries-restructure`, `be-test-architecture-redesign`, `shared-demo-dataset`
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                                                                                     |
| ----- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `ARCH-R3` | n/a      | gỡ chặn hạng mục tính năng mới chạm `requests`, `personnel`, `licensing`, `catalog`; hoàn tất mục tiêu "đọc không cần AI" của `be-architecture-boundaries-restructure` |

`ARCH-R3`: mọi module qua luật DAG capability, không thư mục tầng kỹ thuật, wiring extension point khớp giữa các graph,
không truy vấn đồng thời trên một transaction, ESLint chặn vi phạm mới; hướng dẫn dev mới khớp code.

## Supporting references

- Review [be-architecture-readability-review-2026-10-30](../../../reviews/be-architecture-readability-review-2026-10-30/README.md):
  finding AR-01 → AR-14, AT-01 → AT-04 (mỗi finding trỏ tới task sửa) và bảng _Đối chiếu với nghiệm thu 29/10/2026_ (mỗi
  điểm mở của nghiệm thu → task ở đây).
- [Nghiệm thu 29/10/2026](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md): O1–O7, S1–S13, §4 bảy file
  ưu tiên, §5 P5/P7/P8, §8 bước GitHub/VPS, §9–§10 sửa harness và ngân sách thời gian CI.
- [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md) (Proposed, chấp nhận một phần).
- [Module structure](../../../rules/module-structure.md), [test guide](../../../../test/README.md).
- BRD 6.1 (Docs `578f442`) ghi "Redis và background-job queue" — chỉ để đối chiếu AR-09; không sửa Docs ở đây.

## Explicit out of scope

- Tách `requests` thành nhiều module, microservice, tách database: `OD-R6`, ADR-0001.
- Tối ưu thời gian từng file test để đạt P7/P8: Owner miễn (O5), không làm. P5 xử lý bằng cấu hình CI hoặc sửa mục tiêu
  (Task 7.6, `OD-R8`), không bằng tối ưu test.
- Sửa bug hành vi phát hiện trong lúc di chuyển: ghi thành hạng mục riêng, kể cả nếu R1 tìm ra listener thật sự thiếu ở
  một graph (khi đó thêm listener là thay đổi hành vi, cần hạng mục và test riêng). Ngoại lệ duy nhất đã biết trước: AR-14
  (Task 1.4), làm ở đây chỉ khi Owner chọn `OD-R10` = A hoặc B; chọn C thì tách hạng mục.
- Sửa BRD 6.1 (thuộc repo Docs); chỉ báo Owner.
- Nội dung nghiệp vụ của `src/cli/demo-dataset/**`, `src/modules/installation/demo-dataset/**` (`shared-demo-dataset`);
  ở đây chỉ chạm khi một luật chung buộc (ví dụ R2, R8).

## Dependencies and blockers

- ~~Chặn Phase 1–7 tới khi cây làm việc của `shared-demo-dataset` được Owner commit~~ — **đã gỡ 30/10/2026**: Owner commit
  `f498c74`. Bắt đầu từ `f498c74` trở đi, đo lại bảng mốc trong plan nếu số khác.
- Owner trả lời `OD-R1` → `OD-R10` trước task dùng quyết định đó (bảng _Quyết định chặn task_ trong plan). Task không phụ
  thuộc quyết định nào làm được ngay.
- Owner duyệt bảng tầng của `requests` (Task 4.0) trước Task 4.2 → 4.4.
- Task 0.3 cần Owner gửi bằng chứng GitHub/VPS của nghiệm thu §8 và quyết định O6, O7; phần chưa có ghi `pending` kèm người
  theo dõi, không chặn task khác.
- Lưới an toàn: integration chạy trong CI `dev` theo module bị ảnh hưởng. Phase 4 cần CI xanh trên `dev` trước khi bắt đầu.
- Chạy suite jest dài (`test:http`, `test:integration`, `test:e2e`) cần Owner cho phép trong phiên làm việc (plan, _Quy
  tắc cho người thực hiện_).

## Ownership: module, data, API

- Không bảng, migration, route, mã lỗi, Nest module mới cho nghiệp vụ. OpenAPI `openapi.json` giữ **đúng byte**.
- File mới: `scripts/arch/capability-graph.cjs`, `scripts/arch/capabilities.mjs`, `scripts/verify/capability-graph.test.mjs`,
  `test/gates/capability-graph.gate-spec.ts`, `test/gates/extension-wiring.gate-spec.ts`, `test/gates/test-size.gate-spec.ts`,
  `test/support/nest-module-graph.ts`, `test/support/api-collection-registry.ts`, `eslint-suppressions.json` (nếu
  `OD-R4` = A). Tài liệu: `docs/guides/huong-dan-dev-moi.md` thay `docs/guides/kien-truc-backend-va-cach-viet-code.md`.
- Di chuyển file trong `src/modules/**` theo bảng ở Phase 2–4 của plan; module card cập nhật cùng lúc.
- Ngoài `src/`: `Dockerfile`, `package.json` (`prisma` sang `dependencies` nếu `OD-R9` = A; giữ `bullmq`, `@nestjs/bullmq`
  theo Owner `OD-R5`), `.env.example`, `compose.yaml`, `.github/workflows/ci.yml`, `.github/workflows/nightly.yml` (`OD-R8`),
  `docs/guides/runtime-details.md` (ràng buộc đồng hồ), spec/plan của `be-test-architecture-redesign` (quy tắc timeout),
  [nghiệm thu](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md) §5/§8 (điền bằng chứng Owner gửi).

## Behavior and design

### Luật đích

| Mã  | Luật                                                                                                                                                                                                                                                                                        | Máy kiểm bằng                                                                                                                               | Finding      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R1  | Với mỗi graph tiến trình (API, worker, 9 lệnh CLI có Nest graph) và mỗi extension point có **người dùng** trong graph đó (provider/controller không có `binds` mà inject nó): tập bên đăng ký trong graph = tập bên đăng ký khai trong toàn `src/`, trừ ngoại lệ có lý do được Owner đồng ý | gate `extension-wiring` (đọc metadata Nest, không cần DB)                                                                                   | AR-01, AR-05 |
| R2  | Không chạy nhiều truy vấn đồng thời trên một client transaction: trong đối số của `Promise.all(...)` không xuất hiện định danh `tx` hay biến gán từ `tx ?? …` / `tx \|\| …` — dù là `tx.model.x()` hay `repo.x(tx)`                                                                         | gate `module-layout`                                                                                                                        | AR-06        |
| R3  | Không thư mục tầng kỹ thuật ở bất kỳ cấp nào dưới `src/modules/<m>/`: `mappers`, `dto`, `dtos`, `policies`, `services`, `repos`, `types`, `errors`, `controllers`, `common`, `shared`, `utils`, `helpers`                                                                                   | gate `module-layout`                                                                                                                        | AR-04        |
| R4  | `*.api.ts`, `*.extension-points.ts` chỉ trong `public/`; mỗi `public/<x>.api.ts` export đúng một lớp `<X>Api` (một module được nhiều facade)                                                                                                                                                | gate `module-layout`                                                                                                                        | AR-05        |
| R5  | Module có thư mục capability: file ở gốc chỉ là `README.md`, `*.module.ts` hoặc file dùng chung toàn module tên bắt đầu bằng tên module. Module chưa có capability (`audit`, `onboarding`, `operating-parameters`) giữ phẳng tới 25 file, không ràng buộc tên (`OD-R2`)                     | gate `module-layout`                                                                                                                        | AR-05        |
| R6  | Đồ thị capability → capability trong một module không có vòng (nhóm riêng tư giữa capability đã do `group-is-private` của dependency-cruiser giữ)                                                                                                                                           | gate `capability-graph` (bật dần theo `CAPABILITY_DAG_MODULES`)                                                                             | AR-02, AR-03 |
| R7  | `src/core` chỉ giữ primitive dùng chung, không giữ khái niệm của một module; khái niệm đó ở `public/` của module sở hữu                                                                                                                                                                     | review (danh sách người dùng in bởi `pnpm arch:capabilities --core`); không gate vì primitive như `money/convert` hợp lệ dù một module dùng | AR-08        |
| R8  | `no-floating-promises`, `no-unsafe-argument`, `no-explicit-any` là `error`; rule kích thước/độ phức tạp là `error` với suppressions chuẩn của ESLint (`OD-R4`)                                                                                                                              | `pnpm lint`                                                                                                                                 | AR-07        |
| R9  | Spec dưới `test/integration`, `test/http`, `test/e2e` tối đa 800 dòng; tên `it`/`describe` của gate mô tả hành vi, không bắt đầu bằng mã nội bộ                                                                                                                                             | gate `test-size`; review                                                                                                                    | AT-02, AR-11 |
| R10 | Nest module nghiệp vụ chỉ export contract công khai, hoặc provider mà **mọi** Nest module import nó nằm cùng thư mục module (ví dụ `organization-http.module.ts` dùng `CostCenterRepo` của `organization.module.ts`)                                                                        | gate `module-graph` (thay ledger `LEGACY_PRIVATE_EXPORTS`)                                                                                  | AR-12        |

Không thêm ledger: `CAPABILITY_DAG_MODULES` là danh sách bật dần chỉ được **thêm**, xóa hẳn khi chứa mọi module (luật áp
cho tất cả). Ngoại lệ wiring `GRAPH_WIRING_EXCEPTIONS` bắt đầu rỗng; thêm mục cần Owner, ghi graph, extension point, bên
đăng ký vắng và vì sao luồng phát không chạy trong graph đó.

### Thiết kế R1 (wiring)

- 19 extension point (7 `Hook`, 6 `Listeners`, 6 `Contributions`) và 33 file `*.listener.ts`. Mọi `bind`/`add` vào extension
  point hiện nằm trong `*.listener.ts` (đã quét 30/10/2026).
- Mỗi lớp trong `*.listener.ts` khai `static readonly binds = [<ExtensionPointClass>] as const;` (TypeScript thuần, không cần
  `reflect-metadata` trong `core`).
- `Command` của `src/cli/run-command.ts` không để lộ Nest module, nên gate **liệt kê graph tường minh** (`PROCESS_GRAPHS`):
  `AppModule`, `WorkerModule`, `InstallationModule` (bootstrap), `RecoveryCliModule`, `SuperAdminEventCliModule`,
  `InspectionModule`, `MigrationPreflightModule`, `SubscriptionOwnerAssignmentCliModule`, `CostCenterDirectionCliModule`,
  `DevSeedModule`, `DemoDatasetModule`. Một test kèm theo đọc mọi `src/cli/**/*.command.ts`, lấy tên trong
  `.then((m) => m.<Tên>)` và đỏ khi tên đó không có trong `PROCESS_GRAPHS` — lệnh mới không thể bị quên. `db-roles` không có
  Nest graph.
- Người dùng của extension point = provider hoặc controller không có `binds` mà `design:paramtypes` chứa lớp extension point.
  Hook theo cùng luật. Chỉ giữ một cơ chế cho "graph hợp lệ thiếu bên đăng ký": `GRAPH_WIRING_EXCEPTIONS`; xóa
  `whenUnbound` (0 điểm dùng, S2 của nghiệm thu) và `assertHooksBound` (0 điểm gọi ngoài spec). Không gọi gì lúc khởi động:
  không đổi hành vi runtime.
- Gate tìm ra chênh lệch thật (ví dụ graph `record-super-admin-event` có người dùng `OrganizationChangeListeners` nhưng thiếu
  listener): dừng, báo Owner, mở hạng mục sửa hành vi; ở đây chỉ thêm mục ngoại lệ có lý do **khi Owner đồng ý**.

### Đích của `requests` (Phase 4)

Hiện trạng đo 30/10/2026: 24 capability, 82 cạnh, một vòng 19 capability. Gốc của vòng:

- Lõi `access-request/` import ngược capability lá qua ~12 cạnh (`access-request-query.service.ts` → `assessment.repo`,
  `group-request.types`, `spend-status.service`; `access-request.errors.ts` → kiểu lý do trong policy của `cancellation`,
  `delegated-request`, `withdraw`; `request-end.service.ts` → `budget-information`, `spend`; nhóm `grant/` →
  `group-request`, `outcome`; `request-draft.repo.ts` → policy của `draft`).
- Ba "lõi nhánh" `spend/`, `assessment/`, `group-request/` vòng lẫn nhau (ví dụ `spend/budget-check.service.ts` →
  `assessment/assessment.repo`, `group-request/line-allocation.policy`; `assessment` → `spend/spend-entry.service`,
  `group-request.types`; `group-request` → `assessment/repricing.service`).
- Năm capability vừa có controller vừa bị capability khác import: `assessment`, `budget-information`, `finance-review`,
  `reassignment`, `group-request` (nhóm `lines/`). Dịch vụ đọc `AccessRequestView` được 10 controller ở các capability lá
  dùng, nên đưa nó lên một capability trên cùng sẽ sinh vòng mới.

Nguyên tắc đích (Owner duyệt ở Task 4.0):

1. **Tầng trong module.** `requests` có bảng tầng ghi trong module card: L0 lõi (`access-request/`, `outcome/`), L1 lõi
   nhánh không controller (`spend/`, …), L2 dịch vụ dùng chung có controller tách ra, L3 use case lá có controller. Cạnh chỉ
   đi xuống hoặc ngang tầng không vòng; R6 kiểm vòng.
2. **Controller chỉ ở capability lá.** Capability bị capability khác import không chứa controller; controller của nó chuyển
   sang một capability lá đặt tên theo use case (ví dụ `assessment/proposals.controller.ts` → `proposal-review/`).
3. **Lỗi và kiểu lý do ở tầng thấp nhất cần chúng.** `*.errors.ts` không import policy của capability khác; kiểu lý do
   (`WithdrawalRefusal`, `ReviewRefusal`…) khai trong `*.types.ts` hoặc file lỗi của tầng thấp nhất cần nó.
4. **Đọc `AccessRequestView` ở lõi.** `access-request-query.service.ts` ở lại L0; phần nó đọc từ capability khác chuyển xuống
   L0/L1: bản ghi proposal đọc qua một repo đọc của lõi (bảng `access_request_*` thuộc module `requests`, module sở hữu được
   đọc mọi bảng của mình), trạng thái chi qua `spend` ở L1 nếu L0 → L1 không tạo vòng; nếu tạo vòng thì view lên L2 và các
   controller dùng nó phải ở L3 (nguyên tắc 2).
5. `request-end.service.ts` (chỉ `cancellation`, `withdraw` dùng) → capability `request-end/`; nhóm `grant/` → capability
   `grant/`.

Đích số đo: không vòng capability; cạnh capability → capability ≤ 50 (từ 82); cảnh báo ESLint của `requests` ≤ 50 (từ 102).

> **Owner quyết 31/10/2026 (Task 4.3, finding `P09-FR-03`):** thay tiêu chí "cạnh ≤ 50; capability có controller không bị
> capability khác import" bằng tiêu chí gate đang ép: không vòng capability (đo xuyên file gốc/`public/`); L0
> (`access-request`, `outcome`) không import capability; không thư mục quá 25 file; capability có controller chỉ bị import
> khi nằm trong `REQUESTS_CONTROLLER_IMPORTED` (năm mục `draft`, `group-request-submission`, `service-account-request`,
> `line-closure`, `sla`, mỗi mục có lý do; mục thừa hoặc mục mới chưa ghi đều đỏ). Số đo cuối: 36 capability, 111 cạnh
> (82 nếu bỏ cạnh vào `access-request`). Đích ESLint `requests` ≤ 50 giữ nguyên và đã đạt (37).
> Handler `need-decision`, `withdraw`, `similar-seats` chuyển sang controller của capability tương ứng **chỉ khi**
> `openapi.json` giữ đúng byte; không thì giữ ở `access-requests.controller.ts` và ghi trong module card.

### Hook hồ sơ nhân sự (AR-14, `OD-R10`)

- Hiện trạng: `PersonnelFileHooks.each` gọi các `PersonnelFileHookContributions` trong transaction của lần ghi, nuốt mọi lỗi.
  Lỗi SQL làm transaction PostgreSQL hỏng nên lần ghi vẫn thất bại ở câu sau; lỗi JavaScript làm việc của hook mất im lặng.
- A (đề xuất): hook như `Listeners` — lỗi lan ra, cả lần ghi hoàn tác, người ghi thấy lỗi và làm lại; comment và module card
  sửa theo. Hook nào thật sự được phép thất bại thì tự bắt lỗi bên trong nó và ghi cảnh báo có thể tra (không phải log).
- B: giữ "lần ghi không đổi" bằng `SAVEPOINT` quanh từng hook (`tx.$executeRaw` trong repo của personnel), lỗi được ghi
  thành bản ghi cần xử lý; phức tạp hơn và cần bảng/cột — tức migration, ngoài ranh giới hạng mục này nếu cần bảng mới.
- C: tách hạng mục riêng, hạng mục này không chạm.

### Image và CI (AR-13, AT-04)

- `OD-R9` = A: stage `runtime` chép `node_modules` từ `production-dependencies`; `prisma` (CLI cho `migrate deploy`) chuyển
  sang `dependencies`; client sinh nằm trong `dist/generated/prisma` (đã kiểm 30/10/2026), không đổi. Kiểm: image build,
  container `migrate` chạy `migrate deploy`, `node dist/cli.js --help`, `node dist/main.js` lên `health/ready`.
- `OD-R8` = A: job `integration` chạy song song theo shard (`jest --shard=i/N`, matrix N = 2) trên hai runner, mỗi shard
  một PostgreSQL service; timing và `_serial` giữ một job tuần tự. B: giữ một runner, đổi mục tiêu P5 thành số đo thật
  và sửa quy tắc "timeout gấp đôi mục tiêu" trong spec test thành "timeout = số đo p95 + 50 %". Chọn nào cũng sửa spec test.

### Tương thích

- HTTP, mã lỗi, OpenAPI, schema, migration, env: không đổi ngoài metadata F01/F03 theo phụ lục. Env `REDIS_*` chưa là
  dependency của runtime hiện tại; giữ module/config/test queue, dependency và Compose Redis theo Owner `OD-R5`.
  Validate Redis vẫn nằm tại ranh giới bật queue; không bắt API/worker chưa dùng queue phải kết nối Redis.
- Tuần tự hóa truy vấn trên `tx`: kết quả giống hệt (cùng snapshot transaction); số round-trip không đổi vì pg@8 vốn xếp hàng.
- Alias `dist/<tên>-cli.js` và lệnh vận hành giữ nguyên.

## Owner decisions

| Mã       | Câu hỏi                                                                                                                            | Đề xuất                                                                                                               | Phương án khác                                                      | Chặn            | Owner                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------- | -------------------------------------------- |
| `OD-R1`  | Kiểm wiring theo graph bằng gì?                                                                                                    | Gate tĩnh R1 (không đổi runtime, chạy trong `pnpm test:gates`)                                                        | Kiểm lúc khởi động mỗi tiến trình (fail fast, đổi hành vi boot)     | Task 1.1b       | người thực hiện: đề xuất (P09)               |
| `OD-R2`  | Hình dạng gốc module                                                                                                               | R5: module chưa capability được phẳng (≤ 25 file); module có capability chỉ giữ ở gốc file dùng chung mang tên module | Bắt mọi module dùng capability folder                               | Task 2.1–2.5    | người thực hiện: đề xuất (P09)               |
| `OD-R3`  | Capability trong một module                                                                                                        | R6: được import nhau (giữ S5) nhưng không vòng; bật dần theo module                                                   | Giữ S5 tự do, chỉ đo                                                | Phase 3–4       | người thực hiện: đề xuất (P09)               |
| `OD-R4`  | Chặn nợ ESLint                                                                                                                     | Rule kích thước `error` + `eslint-suppressions.json` (ESLint 9.39 có `--suppress-all`, `--prune-suppressions`)        | Giữ `warn` + `--max-warnings`, hạ N mỗi PR                          | Task 1.3, Ph. 5 | người thực hiện: đề xuất (P09)               |
| `OD-R5`  | Hạ tầng queue/Redis chưa dùng                                                                                                      | Giữ module, dependency, config/test và Compose Redis; refactor có lý do và ghi rõ hạ tầng dự phòng                    | Đề xuất xóa trước đây đã bị Owner bác                               | Task 2.6        | Owner: GIỮ, 30/10/2026                       |
| `OD-R6`  | Tách `spend` khỏi `requests`?                                                                                                      | Chưa; đo lại sau Phase 4 (giữ `OD-A5`)                                                                                | Tách ngay thành module T6 `spending`                                | —               | người thực hiện: đề xuất (P09)               |
| `OD-R7`  | ADR 0011–0019 đang Proposed; ADR-0019 còn hai phần chưa có sự kiện Owner review (quy tắc nhóm chức năng, chi tiết extension point) | Owner review từng ADR; 0019 ghi S1–S13 và R1–R10, Owner review hai phần còn thiếu, đề nghị Accepted cuối hạng mục     | Giữ Proposed                                                        | Task 6.2        | người thực hiện: giữ Proposed, chờ Owner     |
| `OD-R8`  | P5 chưa đạt (job integration 24–27 phút, mục tiêu ≤ 15)                                                                            | A: shard integration thành 2 job song song                                                                            | B: giữ một runner, sửa mục tiêu P5 và quy tắc timeout theo số đo    | Task 7.6        | người thực hiện: B (phụ lục)                 |
| `OD-R9`  | Image production chứa devDependencies (O4)                                                                                         | A: chép `node_modules` từ stage `--prod`, `prisma` sang `dependencies`                                                | B: giữ, xóa stage `production-dependencies` không dùng và ghi lý do | Task 2.7        | người thực hiện: A nếu image smoke đạt (P09) |
| `OD-R10` | Hook hồ sơ nhân sự nuốt lỗi trong transaction (AR-14)                                                                              | A: lỗi lan ra, hoàn tác lần ghi                                                                                       | B: `SAVEPOINT` mỗi hook + ghi lỗi cần xử lý; C: tách hạng mục       | Task 1.4        | **Owner: A** (30/10/2026)                    |

## Test matrix

| AC / rủi ro          | Tình huống (gồm từ chối, edge case)                                                                                              | Cấp test                                                                  | Kết quả mong đợi                                                        | Bằng chứng sau implement |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| R1                   | Graph có người dùng `OrganizationChangeListeners` nhưng thiếu một listener khai `binds`                                          | gate (cây thật + module tổng hợp)                                         | đỏ, nêu graph, extension point, listener thiếu                          | chưa có                  |
| R1                   | Graph không có người dùng extension point (lệnh `inspect`)                                                                       | gate                                                                      | không yêu cầu listener                                                  | chưa có                  |
| R1                   | Listener `*.listener.ts` không khai `binds`, hoặc `binds` không có trong tham số constructor                                     | gate                                                                      | đỏ                                                                      | chưa có                  |
| R1                   | Lệnh CLI mới có `graph: () => import(…).then((m) => m.NewModule)` mà `PROCESS_GRAPHS` chưa có                                    | gate                                                                      | đỏ, nêu tên module                                                      | chưa có                  |
| R2                   | `Promise.all([tx.a.findMany(), tx.a.count()])`; `Promise.all([this.repo.x(tx), this.repo.y(tx)])`; biến `db = tx ?? this.prisma` | gate (tổng hợp)                                                           | cả ba đỏ; `Promise.all` chỉ trên `this.prisma` vẫn xanh                 | chưa có                  |
| R2 hành vi           | Danh sách phân trang đọc tuần tự trong `RepeatableRead`                                                                          | integration module bị chạm                                                | cùng kết quả như trước                                                  | chưa có                  |
| R3, R4, R5           | Thư mục `mappers/` dưới capability; `x.api.ts` ngoài `public/`; file gốc không mang tên module                                   | gate (tổng hợp)                                                           | đỏ, nêu đường dẫn                                                       | chưa có                  |
| R6                   | `a → b → a` giữa hai capability của một module trong `CAPABILITY_DAG_MODULES`                                                    | gate (tổng hợp + cây thật)                                                | đỏ, nêu chu trình và cạnh file                                          | chưa có                  |
| R6 đích `requests`   | Lõi `access-request/` import capability khác; capability có controller bị capability khác import                                 | gate + `pnpm arch:capabilities --module requests`                         | gate đỏ với vòng; bảng tầng khớp số đo                                  | chưa có                  |
| R8                   | Promise thả nổi; hàm mới vượt 60 dòng                                                                                            | `pnpm lint`                                                               | lỗi                                                                     | chưa có                  |
| R9                   | File integration 801 dòng                                                                                                        | gate                                                                      | đỏ                                                                      | chưa có                  |
| R10                  | Nest module nghiệp vụ export repo cho một Nest module ở thư mục khác                                                             | gate (tổng hợp + cây thật)                                                | đỏ; export cho `*-http.module.ts` cùng thư mục xanh                     | chưa có                  |
| Không đổi hành vi    | Toàn bộ di chuyển file                                                                                                           | `pnpm check`, HTTP, integration module bị chạm, `openapi:export`          | xanh; `openapi.json` đúng byte; `prisma/` không đổi                     | chưa có                  |
| AR-14 (`OD-R10` = A) | Hook `role-duties` ném lỗi JavaScript khi ghi nghỉ việc                                                                          | integration `personnel` (đỏ trước: lần ghi thành công, việc của hook mất) | lần ghi hoàn tác, lỗi tới exception filter, không dòng nào được ghi     | chưa có                  |
| AR-14                | Hook gây lỗi SQL (vi phạm ràng buộc) trong transaction                                                                           | integration `personnel`                                                   | trước: lỗi `25P02` ở câu sau, không trỏ tới hook; sau: lỗi gốc của hook | chưa có                  |
| AR-13 (`OD-R9` = A)  | Image mới không có `jest`, `eslint`, `typescript` trong `node_modules`                                                           | build image + lệnh trong container                                        | `migrate deploy`, `dist/cli.js --help`, `health/ready` 200              | chưa có                  |
| AT-04 (`OD-R8`)      | Job integration đầy đủ trên `dev`                                                                                                | CI GitHub                                                                 | A: mỗi shard ≤ 15 phút; B: trong timeout mới, spec test khớp            | chưa có                  |
| Nghiệm thu §8        | CI chứa `25d5244`, thử chặn deploy A/B, nightly, VPS                                                                             | CI GitHub, VPS (Owner)                                                    | run ID và kết quả ghi ở nghiệm thu §5/§8 và hai plan                    | chưa có                  |

## Definition of Done

- [ ] R1 → R10 có gate/lint/review như bảng _Luật đích_ và test tổng hợp cho phần máy kiểm; `CAPABILITY_DAG_MODULES` chứa
      mọi module rồi được xóa.
- [ ] `pnpm arch:capabilities` báo 0 vòng ở mọi module; số đo trước/sau ghi ở plan.
- [ ] `LEGACY_PRIVATE_EXPORTS` bị xóa, thay bằng R10; không thêm ledger mới.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; `openapi.json` đúng byte; HTTP và
      integration của module bị chạm xanh trên CI.
- [ ] Hướng dẫn dev mới, module card, ARCHITECTURE, module structure, ADR-0019 khớp code; spec/plan/roadmap phản ánh
      implementation cuối.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Mọi dòng của bảng _Đối chiếu với nghiệm thu 29/10/2026_ trong review có kết quả: đóng có bằng chứng, hoặc `pending`
      kèm người theo dõi.

## Changes and acceptance

- 30/10/2026 (Owner execution addendum): bổ sung outcome `H7-SEQ`, `API-DOC-F01`, `API-DOC-F03`, test matrix và vòng
  review/sửa vào plan hiện hữu. Refactor vẫn giữ hành vi; ngoại lệ metadata OpenAPI và quyền hai sequence được giới hạn
  tường minh trong phụ lục. Không bao gồm sửa lỗi CLI seed chưa rõ nguyên nhân, API-GAP hoặc test tay VPS của FE.

- 30/10/2026: lập spec từ review tĩnh; chưa implement, chưa Owner review, chưa nghiệm thu.
- 30/10/2026 (lượt 2): đối chiếu với nghiệm thu 29/10/2026 — thêm AR-13, AR-14, AT-04, `OD-R8` → `OD-R10`, Task 0.3, 1.4,
  2.7, 7.6; mở rộng Task 5.1, 5.2, 6.2 cho đủ bảy file ưu tiên của §4, S1–S13 và ràng buộc đồng hồ.
- 30/10/2026 (lượt 3, tự audit bằng bằng chứng trên code, không có reviewer độc lập): R1 liệt kê graph tường minh vì
  `Command` không để lộ module; R2 bắt cả `tx` truyền làm tham số; R7 thành luật review (gate sẽ báo nhầm `money/convert`);
  thêm R10 thay cách sửa ledger cũ (cách cũ đụng gate "không khai provider ở hai module"); đích `requests` viết lại theo
  tầng vì chuyển dịch vụ đọc view lên trên sẽ sinh vòng mới; 19 extension point (không phải 20).
