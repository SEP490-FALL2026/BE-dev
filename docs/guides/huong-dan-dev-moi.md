# Hướng dẫn dev mới

Đọc theo thứ tự. Mỗi phần trả lời một câu hỏi: code nằm ở đâu (1), một request đi qua những file nào (2), thêm thứ mới thì
đặt ở đâu (3), đăng ký provider vào Nest module nào (4), tìm lỗi bằng cách nào (5), viết test ở tầng nào (6), và những chỗ
hay nhầm (7). Hướng dẫn chỉ dẫn đường; luật nằm ở [module structure](../rules/module-structure.md), lý do ở
[ADR-0019](../decisions/0019-module-tiers-and-public-api.md), gate và lệnh ở [CONTRIBUTING](../../CONTRIBUTING.md). Khi hai
chỗ khác nhau, luật và source thắng hướng dẫn này.

Trạng thái: bản này **chưa được một dev mới đi thử từ đầu đến cuối** (bài đi thử O7 do Owner thực hiện, đang `pending`). Chưa ai
xác nhận rằng đọc xong là làm được một task đầu tiên mà không hỏi.

## 1. Bản đồ một trang

**Ba tiến trình, một image, một PostgreSQL.** Chi tiết ở [ARCHITECTURE](../../ARCHITECTURE.md).

| Tiến trình | Điểm vào        | Ghép module ở                 | Làm gì                                                                            |
| ---------- | --------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| API        | `src/main.ts`   | `src/app/app.module.ts`       | HTTP `/api/v1/*` và các sweeper theo giờ (ADR-0018)                               |
| Worker     | `src/worker.ts` | `src/worker/worker.module.ts` | gửi email từ outbox, xử lý bước mở của Request (`src/worker/request-work.job.ts`) |
| Lệnh       | `src/cli.ts`    | `src/cli/commands.ts`         | cài đặt, khôi phục, kiểm tra, preflight, role DB, seed local/VPS                  |

**Sáu tầng module** (nguồn duy nhất: `scripts/arch/tiers.cjs`; module chỉ import module tầng thấp hơn):

| Tầng | Module                                    |
| ---- | ----------------------------------------- |
| T1   | `audit`, `notifications`                  |
| T2   | `organization`, `identity-access`         |
| T3   | `finance`, `operating-parameters`         |
| T4   | `catalog`, `licensing`                    |
| T5   | `budgets`, `requests`, `data-import`      |
| T6   | `personnel`, `onboarding`, `installation` |

Module dưới cần phản ứng của module trên thì **mở một extension point** (`Hook`, `Listeners`, `Contributions` ở
`src/core/extension/`); module trên đăng ký trong một `*.listener.ts`. Không có cạnh ngược.

**Một module** (ví dụ `src/modules/requests/`): `README.md` là module card (đọc trước), `requests.module.ts` là wiring Nest,
`public/` là cửa duy nhất cho module khác (`requests.api.ts` chứa `RequestsApi`, `requests.extension-points.ts`), còn lại là các
capability. Module có nhiều phương thức thì tách facade theo việc: `organization` có `OrganizationReadApi` (chỉ đọc) và `OrganizationApi` (ghi,
khóa `FOR UPDATE`), xem module card của nó.

**Một capability** (ví dụ `src/modules/requests/need-decision/`): thư mục theo chức năng, chứa file theo vai trò:
`.controller.ts` map HTTP, `.service.ts` một use case, `.policy.ts` quy tắc thuần, `.repo.ts` mọi SQL, `.dto.ts` hình dạng
request/response, `.errors.ts` lỗi nghiệp vụ, `.http-errors.ts` ánh xạ lỗi sang HTTP, `.mapper.ts` record sang wire,
`.listener.ts` đăng ký extension point, `.job.ts` việc định kỳ. Tối đa 2 cấp thư mục dưới module, 25 file mỗi thư mục, không
thư mục tên tầng kỹ thuật (`services/`, `dto/`, `utils/`).

**Tầng trong `requests`.** `requests` có 39 capability; đồ thị giữa chúng không có vòng (R6) và xếp thành bốn lớp trong
[module card](../../src/modules/requests/README.md#tầng-trong-module): L0 lõi (`access-request`, `outcome`), L1 lõi nhánh
(`step-routing`, `request-draft`...), L2 dịch vụ dùng chung (`spend`, `request-view`, `assessment`...), L3 use case lá có controller
(`need-decision`, `withdraw`, `finance-review`...). `pnpm arch:capabilities --module requests` in lớp của từng capability, tính từ
đồ thị mà gate dùng. Lớp cao import lớp thấp; use case lá
(L3) không ai import lên, trừ năm ngoại lệ ghi ở module card. Đừng nhầm lớp L0–L3 trong một module với tầng T1–T7 giữa các module.

## 2. Đi hết một route: `POST /api/v1/access-requests/{id}/need-decision`

Người giữ bước "nhu cầu" của một Request duyệt hoặc từ chối nó (`US-05-04`). Mở
[docs/generated/routes.md](../generated/routes.md) và tìm `/access-requests/{id}/need-decision`: bảng ghi controller và service
của route (file này sinh bằng `pnpm arch:routes`, gate `pnpm arch:docs:check` giữ cho khớp code). Từ đó đi xuống:

```text
RequestIdMiddleware                      src/infrastructure/observability/request-id.middleware.ts   gắn requestId
ThrottlerGuard → AccessDeclarationGuard  src/infrastructure/security/guards/access-declaration.guard.ts   route phải khai đúng một kiểu
  → AuthenticationGuard → AuthorizationGuard                     route này khai @AuthenticatedOnly(): ai đăng nhập cũng qua
ApplicationZodValidationPipe             src/infrastructure/http/pipes/zod-validation.pipe.ts   RequestIdParamDto + NeedDecisionBodyDto
NeedDecisionController.decide            src/modules/requests/need-decision/need-decision.controller.ts
  NeedDecisionService.decide             src/modules/requests/need-decision/need-decision.service.ts
    RequestFactsService                  đọc cấu hình (ngoài transaction)
    TransactionRunner.run(async (tx))    src/infrastructure/database/transaction-runner.ts
      AccessRequestRepo.lockById         src/modules/requests/access-request/access-request.repo.ts   SELECT ... FOR UPDATE
      canViewRequest, checkNeedDecision  src/modules/requests/access-request/access-request.policy.ts, need-decision.policy.ts
      needDecisionOutcome                need-decision.policy.ts   quyết định thuần: trạng thái kế, ai quyết
      NeedSpendService.apply             src/modules/requests/assessment/need-spend.service.ts   chỉ khi head duyệt Request có tiền
      AccessRequestRepo.recordNeedDecision   bước + trạng thái Request + approval_records, cùng tx
      AuditApi.record(tx, event)         src/modules/audit/public/audit.api.ts   sự kiện dựng bởi access-request-audit-event.mapper.ts
      NeedDecisionEffects.follow         src/modules/requests/need-decision/need-decision-effects.service.ts
        RequestOutcomeService.ended      src/modules/requests/outcome/request-outcome.service.ts   khi từ chối
          RequestOutcomeListeners.emit   src/modules/requests/public/requests.extension-points.ts   người nghe chạy trong tx
            TransferReviewOutcomeListener  src/modules/personnel/transfer-review/transfer-review-outcome.listener.ts
        RenewalApplyService / SpendEntryService / AssessmentStepRepo   theo nhánh của Request
  AccessRequestQueryService.view + toWire   src/modules/requests/request-view/ → mapper record sang wire
SuccessEnvelopeInterceptor               { success, data, message: 'ACCESS_REQUEST.NEED_DECIDED' }
ZodSerializerInterceptor                 kiểm response theo AccessRequestResponseDto
lỗi → toAccessRequestApiException        src/modules/requests/access-request/access-request.http-errors.ts → HttpExceptionFilter
```

Đọc từ trên xuống:

1. **Guard trước pipe.** Route không khai `@Public()`, `@AuthenticatedOnly()` hay `@RequireRoles(...)` thì
   `AccessDeclarationGuard` trả 500 (fail closed). Ở route này không có vai nào bị chặn; quyền thật nằm ở policy: nhờ
   `checkNeedDecision` mà chỉ người **được giao** bước mới quyết (`NOT_THE_ASSIGNEE`, 403) và không ai quyết Request của mình
   (`OWN_REQUEST`, 403, `SoD-4`).
2. **Controller chỉ map.** `decide` đổi body sang `DecisionInput`, gọi service, dựng response bằng `toWire`, và bọc `try/catch`
   để chuyển lỗi nghiệp vụ qua `toAccessRequestApiException`. Khai báo OpenAPI (operation ID, mô tả, các mã lỗi và ví dụ) ở
   decorator của handler.
3. **Service giữ transaction.** Mọi thứ cần đúng cùng lúc, hoặc không gì cả, chạy trong **một** `tx` của
   `TransactionRunner`: khóa Request, ghi quyết định, ghi audit, và các hệ quả (`NeedDecisionEffects`). Ném lỗi ở bất kỳ điểm nào
   là hoàn tác tất cả. Request bị khóa `FOR UPDATE` suốt giao dịch nên hai quyết định xếp hàng và người sau thấy bước đã quyết. Không
   `Promise.all` trên `tx` (R2).
4. **Policy thuần.** `need-decision.policy.ts` không biết Nest, Prisma hay HTTP; test bằng
   `need-decision.policy.spec.ts`. Muốn đổi luật "ai được quyết" hay "quyết xong đi đâu", sửa ở đây.
5. **Repo giữ SQL.** `access-request.repo.ts` giữ Prisma và raw SQL của bảng Request (khóa `FOR UPDATE`, ghi quyết định); service
   không gọi Prisma.
6. **Module khác qua facade.** `AuditApi` là cửa `public/` của module `audit`; `organization` có hai cửa: `OrganizationReadApi` cho
   việc đọc (như `need-decision-effects.service.ts`, trường `organizationReads`) và `OrganizationApi` cho việc ghi, khóa `FOR UPDATE`
   (trường `organization`). Lớp chỉ đọc chỉ inject cửa đọc. Không import repo của module khác.
7. **Outcome listener.** Khi từ chối, `RequestOutcomeService.ended` báo cho các bên nghe kết quả **trong cùng transaction**. Bên nghe
   hiện có là `TransferReviewOutcomeListener` của module `personnel` (tầng trên `requests`), đăng ký trong `onModuleInit` bởi
   `PersonnelModule`; `requests` không import `personnel`. Người nghe ném lỗi thì quyết định cũng bị hoàn tác.
8. **Lỗi.** Lớp lỗi nghiệp vụ khai ở `access-request.errors.ts` (`AccessRequestDecisionRefusedError`,
   `AccessRequestNotFoundError`, `AccessRequestGroupUsesLinesError`); ánh xạ sang mã HTTP và mã ổn định
   (`ACCESS_REQUEST.NOT_THE_ASSIGNEE`...) ở `access-request.http-errors.ts`. Lỗi DB tạm thời thành 503 qua
   `toUnavailableApiException`; lỗi không nhận diện được thành 500 ở `HttpExceptionFilter`.

Test của route: unit `need-decision.policy.spec.ts`; integration đi qua HTTP bằng `RequestHarness.decide` trong
[request-harness](../../test/support/request-harness.ts), ví dụ
[access-request-internal-path](../../test/integration/requests/access-request-internal-path.integration-spec.ts); route có trong
[API manifest](../../test/support/api-coverage-manifest.ts).

## 3. Thêm X thì đặt ở đâu

`<m>` là module, `<c>` là capability. Cột phải là thứ cần làm kèm và gate/luật nó đụng.

| Thêm                                    | Đặt ở                                                                                                                                                                                      | Làm kèm, gate                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route HTTP                              | `src/modules/<m>/<c>/<c>.controller.ts`, hình dạng ở `<c>.dto.ts` (Zod)                                                                                                                    | khai `@Public()`/`@AuthenticatedOnly()`/`@RequireRoles(...)`; thêm vào `controllers` của module; `pnpm arch:routes`, `pnpm openapi:export`; manifest ở bước 6                                                                             |
| Use case ghi                            | `<c>/<tên>.service.ts` (một `@Injectable` mỗi file)                                                                                                                                        | `TransactionRunner.run`, audit trong cùng `tx`; ghi thứ tự khóa ở comment đầu file; review                                                                                                                                                |
| Quy tắc nghiệp vụ thuần                 | `<c>/<tên>.policy.ts` + `<tên>.policy.spec.ts`                                                                                                                                             | không import Nest/Prisma; unit test                                                                                                                                                                                                       |
| Truy vấn / SQL                          | `<c>/<tên>.repo.ts`                                                                                                                                                                        | Prisma và raw SQL chỉ ở repo của module sở hữu bảng; gate `module-layout`                                                                                                                                                                 |
| Cột JSON của một bảng                   | `<c>/<tên>.json.ts`: một codec `jsonColumn` (hay `nullableJsonColumn`) mỗi cột, repo và mapper đọc bằng `decode`, ghi bằng `encode`                                                        | không ép kiểu qua `unknown` (gate `module-layout` L2); hình dạng sai là `JsonColumnShapeError` (phần 5); [luật](../rules/module-structure.md#từ-vựng-file)                                                                                |
| Service chỉ đọc                         | `<c>/<x>-query.service.ts` (HTTP đọc), `<x>-facts.service.ts` (dữ kiện cho nơi khác), `<x>-view.service.ts` (ghép nhiều nguồn); vừa đọc vừa ghi thì `<x>-record.service.ts`                | gate `module-layout` L4 cấm `-lookup`, `-reader`, `-directory`, `-read`, `-support`; [bảng tên](../rules/module-structure.md#tên-service-đọc)                                                                                             |
| Lỗi nghiệp vụ                           | lớp ở `<c>/<c>.errors.ts`; ánh xạ HTTP ở `<c>/<c>.http-errors.ts`                                                                                                                          | không `HttpStatus` trong file lỗi/service; mã `DOMAIN.ACTION` ổn định cho FE                                                                                                                                                              |
| Record sang wire                        | `<c>/<tên>.mapper.ts`                                                                                                                                                                      | handler trả data, không tự bọc envelope                                                                                                                                                                                                   |
| Gọi sang module khác                    | facade `src/modules/<x>/public/<x>.api.ts` (`<X>Api`); `organization` có hai: `OrganizationReadApi` để đọc, `OrganizationApi` để ghi hay khóa `FOR UPDATE`, lớp chỉ đọc chỉ inject cửa đọc | `pnpm arch:check` chặn import ngoài `public/` và cạnh sai tầng; gate `module-graph` (R10) giữ danh sách facade                                                                                                                            |
| Mở điểm cho module trên phản ứng        | `src/modules/<m>/public/<m>.extension-points.ts`                                                                                                                                           | export provider từ Nest module; ghi vào module card                                                                                                                                                                                       |
| Listener (đăng ký điểm của module dưới) | `<c>/<tên>.listener.ts` với `static readonly binds = [<Điểm>] as const` và `onModuleInit`                                                                                                  | provider phải có mặt ở mọi graph dùng điểm đó (R1, phần 4)                                                                                                                                                                                |
| Việc định kỳ                            | sweeper `<c>/<tên>.job.ts` trong API (ví dụ `src/modules/budgets/year-end/year-end.job.ts`, ADR-0018); vòng của worker ở `src/worker/*.job.ts` gọi một `public/*.api.ts`                   | idempotent, lỗi một lượt chỉ log; không giữ tiến trình sống bằng timer                                                                                                                                                                    |
| Lệnh vận hành                           | `src/cli/<tên>/<tên>.command.ts` và một mục trong `COMMANDS` ở `src/cli/commands.ts`                                                                                                       | script `ops:<tên>` ở `package.json`; [operational commands](../rules/operational-commands.md); có Nest graph thì thêm vào `PROCESS_GRAPHS` (phần 4)                                                                                       |
| Migration / ràng buộc DB                | `prisma/models/<m>.prisma` và `prisma/migrations/<mốc thời gian>_<tên>/migration.sql`                                                                                                      | không sửa migration đã áp dụng; ràng buộc Prisma không biểu diễn được thì SQL có duyệt ([ADR-0005](../decisions/0005-database-constraints-outside-prisma.md), [database rules](../rules/database-business.md)); test đối tượng và hành vi |
| Cấu hình / biến môi trường              | `src/infrastructure/config/` (schema ở `env-schema.ts`)                                                                                                                                    | cập nhật `.env.example` và [containers](containers.md) nếu là biến vận hành                                                                                                                                                               |
| Test                                    | xem phần 6                                                                                                                                                                                 | `pnpm test:discovery` kiểm mỗi spec thuộc đúng một runner                                                                                                                                                                                 |

Một việc mới chưa rõ nằm ở đâu: tìm route gần giống trong [routes](../generated/routes.md), mở module card của module sở hữu
dữ liệu, và làm theo capability đó. Không tạo base controller/service/repository, không thư mục dùng chung, không barrel
(`export ... from`).

## 4. Provider đăng ký vào Nest module nào, theo từng graph

Mỗi tiến trình khởi động một **graph** Nest riêng, và một provider chỉ tồn tại trong graph nào import module khai báo nó.

**Đọc graph từ tên file** (bảng đầy đủ và gate: [module structure](../rules/module-structure.md#tên-nest-module-nói-graph)). Hỏi "khai provider ở
đâu" là hỏi ai dùng nó, rồi chọn theo tên:

- **Chỉ API dùng** (controller, service của use case HTTP): `<m>.module.ts` của module, hoặc `<m>-http.module.ts` khi module tách phần HTTP
  (`audit-http.module.ts`).
- **API và worker cùng dùng**: một lần trong module mà cả hai import: `<m>-<x>-facade.module.ts` là tập con dành cho worker hoặc lệnh
  (`requests-work-facade.module.ts`), `<m>-facade.module.ts` là phần mọi graph cần (`identity-access-facade.module.ts`); không khai hai bản.
- **Một lệnh dùng**: `<cap>-cli.module.ts` trong capability (`installation/inspect/inspection-cli.module.ts`) hoặc `<m>-<x>-cli.module.ts` ở
  gốc module (`identity-access/identity-access-recovery-cli.module.ts`); gốc graph của lệnh là `src/cli/<lệnh>/<lệnh>-cli.module.ts`
  (`src/cli/recover/recover-cli.module.ts`). Tên có `-cli` thì API và worker không import nó.

| Graph                   | Gốc                                                                                                                                                                                 | Khai provider ở                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API (`AppModule`)       | `src/app/app.module.ts`                                                                                                                                                             | `<m>.module.ts` của module sở hữu (controller và provider). Module có tách HTTP khai controller ở `<m>-http.module.ts` (`audit-http.module.ts`, `organization-http.module.ts`...)         |
| Worker (`WorkerModule`) | `src/worker/worker.module.ts`                                                                                                                                                       | chỉ phần module cung cấp cho worker: `requests-work-facade.module.ts`, `identity-access-facade.module.ts`, `notifications.module.ts`; vòng lặp `src/worker/*.job.ts` gọi facade `public/` |
| Lệnh có Nest graph      | `src/cli/<lệnh>/<lệnh>-cli.module.ts`, ví dụ `src/cli/recover/recover-cli.module.ts`; hoặc chính module `<cap>-cli` như `src/modules/installation/inspect/inspection-cli.module.ts` | module `*-cli` của lệnh; mỗi lệnh nạp đúng phần nó cần, không nạp `AppModule`                                                                                                             |

Quy tắc chọn:

- Provider **chỉ API dùng** (controller, service của use case HTTP): khai trong `<m>.module.ts`. Ví dụ `NeedDecisionController` và
  `NeedDecisionService` khai ở `src/modules/requests/requests.module.ts`.
- Provider **API và worker cùng dùng**: khai **một lần** trong module facade mà cả hai import, không khai hai bản. Ví dụ
  `RoutingFactsService` và các listener chuyển bước khai ở `src/modules/requests/requests-work-facade.module.ts`, `RequestsModule`
  import module đó.
- Provider của **lệnh**: trong module của lệnh; một lệnh mới có Nest graph phải thêm vào `PROCESS_GRAPHS` ở
  [process-graphs](../../test/support/process-graphs.ts), nếu không hai gate dưới đây không nhìn thấy graph của nó.
- Export của một Nest module nghiệp vụ chỉ nên là facade và port; export khác chỉ module **cùng thư mục** được inject (R10, gate
  `module-graph`).

**Gate R1 báo thế nào khi thiếu.** Với mỗi graph trong `PROCESS_GRAPHS`, gate
[extension-wiring](../../test/gates/extension-wiring.gate-spec.ts) xét từng extension point mà graph đó dùng (có provider hoặc
controller inject nó): mọi bên đăng ký của điểm trong `src/` phải có mặt trong graph. Thiếu thì test
`<Graph> carries every binder of each extension point it uses` đỏ, và diff liệt kê từng dòng dạng
`<ExtensionPoint>: <Bên đăng ký>`, ví dụ `DepartmentUseContributions: DepartmentOpenRequestsReader`. Cách sửa: thêm module chứa
bên đăng ký vào graph đó. Nếu graph không bao giờ chạm đoạn code phát sự kiện (chứng minh được qua mọi đường gọi), thêm một mục
vào `GRAPH_WIRING_EXCEPTIONS` của gate kèm lý do; thêm mục cần Owner đồng ý, và mục hết đúng làm gate đỏ. Gate đọc DI metadata, không
khởi động graph; một provider thiếu cho worker hay lệnh vẫn có thể lộ ra khi tiến trình khởi động (ví dụ
[worker-mail-loop](../../test/integration/identity-access/worker-mail-loop.integration-spec.ts) khởi động `WorkerModule` thật).

## 5. Gỡ lỗi: từ `requestId` đến nguyên nhân

1. **`requestId`.** Mỗi response, thành công hay lỗi, có header `x-request-id`; body lỗi có `error.requestId`. Giá trị do server sinh
   (`src/infrastructure/observability/request-id.ts`); header của client chỉ được tin khi `TRUST_PROXY_HOPS` bật
   ([ADR-0004](../decisions/0004-error-contract-availability-and-request-id-trust.md)).
2. **Log.** Log là JSON mỗi dòng (`src/infrastructure/observability/structured-json.logger.ts`) có trường `requestId`. Chỉ lỗi
   **không dự kiến** (500) và lỗi serialize response được log, ở `HttpExceptionFilter`, với dòng bắt đầu `[requestId=<id>]` và stack.
   Lỗi nghiệp vụ 4xx không có dòng log: mã lỗi đã nằm trong response.

   **Log của job và vòng worker** (không có `requestId`: không có request). Một lượt lỗi của sweeper `*.job.ts`, vòng của
   `src/worker/` hay một vòng xử lý từng bản ghi in đúng một dòng `<việc> failed: <mô tả>` (ví dụ
   `Step reminders failed: TransientDatabaseError code=P2010 sqlState=40P01 retryable=true cause=PrismaClientKnownRequestError`). Mô tả do
   `describeForOperator` ([operator-error.ts](../../src/infrastructure/observability/operator-error.ts)) viết: tên lớp lỗi,
   `code=` (mã Prisma hoặc mã socket), `sqlState=`, `column=<bảng>.<cột>` (chỉ khi một cột JSON sai hình dạng), `retryable=true|false` và
   `cause=` một cấp — **không có message** của lỗi, vì message có thể mang tên, địa chỉ hay bí mật. Cách đọc: `retryable=true` là cơ sở dữ liệu hoặc một kết nối mạng tạm không sẵn sàng
   (deadlock, hết thời gian khóa hay câu lệnh, mất hay bị từ chối kết nối, kể cả SMTP), lượt sau thường tự qua, không có stack kèm theo; `retryable=false` là lỗi khác, có
   stack (các dòng `at …` ở trường `stack` của dòng JSON, không kèm message) để tìm nơi ném. Vòng lặp theo bản ghi ghi thêm id của
   bản ghi lỗi trong ngoặc (`The reminder of a step failed (step <id>): …`): lấy id đó đi tìm hàng và audit event của nó. Hành vi
   không đổi: lượt sau chạy tiếp, listener ném lỗi vẫn hoàn tác transaction của bên phát. Quy tắc đầy đủ ở
   [security/jobs](../rules/security-jobs.md).

   **Một cột JSON sai hình dạng.** Cột JSON được đọc qua codec `<tên>.json.ts` của nó; giá trị không đúng hình dạng ném
   `JsonColumnShapeError`, ra 500 như mọi lỗi không dự kiến (hoặc một dòng `<việc> failed: JsonColumnShapeError column=<bảng>.<cột> …` ở job). Message nêu
   bảng, cột, chỗ sai (`chain.0: invalid_value`) và loại lỗi, **không nêu giá trị**: dùng id của bản ghi để tìm hàng, rồi so với schema trong codec.

3. **Mã lỗi.** `error.code` dạng `DOMAIN.ACTION` (ví dụ `ACCESS_REQUEST.NOT_THE_ASSIGNEE`). Tìm chuỗi đó trong
   `src/modules/<m>/**/*.http-errors.ts`: nó cho biết lớp lỗi và mã HTTP. Lớp lỗi khai ở `*.errors.ts` cùng capability; tìm nơi
   `throw new <Lớp>` để thấy điều kiện sinh ra nó (thường là một policy hoặc service). Mã chung (`VALIDATION_ERROR`, 401, 429, 503)
   nằm ở `src/infrastructure/http/`.
4. **Audit Trail.** Một thay đổi nghiệp vụ ghi `audit_events` trong cùng transaction. Super Admin đọc bằng
   `GET /api/v1/audit-events` (lọc theo `resourceType` + `resourceId`, `actorAppUserId`, `action`, `occurredFrom`/`occurredTo`).
   Event của Request mang `correlationId` là id **phiên** của người thực hiện (`actor.sessionId`), **không phải** `requestId` của HTTP;
   nối hai đầu bằng thời điểm và tài nguyên, không bằng `requestId`.
5. **Trạng thái cài đặt.** `pnpm ops:inspect [--json]` báo trạng thái cài đặt, chỉ đọc (mã thoát 0 đã cài và nhất quán, 2 chưa cài
   hoặc dở dang, 1 lỗi); không dùng nó để đọc dữ liệu nghiệp vụ. Chi tiết ở
   [operational commands](../rules/operational-commands.md).
6. **Tái hiện.** Thành phần của hành vi nghiệp vụ thường tái hiện được bằng một test integration với harness trong
   `test/support/` (ví dụ `RequestHarness`); bắt đầu từ test gần nhất, không từ production.

## 6. Chọn tầng test

Chi tiết và lệnh ở [test guide](../../test/README.md). Hỏi theo thứ tự:

| Điều cần chứng minh                                                                              | Tầng                    | Ở đâu                                                 |
| ------------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------- |
| Một quyết định thuần (policy, mapper, schema DTO)                                                | Unit                    | `src/**/*.spec.ts` cạnh file                          |
| Ai gọi được route, input nào bị từ chối, lỗi ra mã nào, hình dạng envelope và OpenAPI            | HTTP contract, không DB | `test/http/<module>/*.http-spec.ts`                   |
| Điều chỉ PostgreSQL chứng minh được: ràng buộc, khóa, transaction hoàn tác, đồng thời, role, CLI | Integration             | `test/integration/<module>/*.integration-spec.ts`     |
| Một luồng nghiệp vụ nối nhiều module chạy từ đầu đến cuối                                        | E2E smoke               | `test/e2e/`, thêm một bước, không thêm file mỗi nhánh |
| Luật kiến trúc, OpenAPI, lệnh vận hành, migration                                                | Gate tĩnh               | `test/gates/*.gate-spec.ts`                           |

Quy tắc đi kèm: một file test trong `test/integration`, `test/http`, `test/e2e` tối đa 800 dòng (tách theo use case, phần dựng
chung vào `test/support/`); `test/support` không chứa `describe`/`it`/`expect`/hook. Thêm hoặc bỏ route thì cập nhật
[API manifest](../../test/support/api-coverage-manifest.ts) cùng test. Integration cần một PostgreSQL 17 riêng cho test (mục Database của test guide; mỗi
file một database riêng); `pnpm test:http` và `pnpm test` thì không. Chạy local không thay kết quả của GitHub Actions.

Trước khi báo xong một thay đổi: `pnpm check` (luật tài liệu, định dạng, lint, typecheck, unit, gate tĩnh, `arch:check`, discovery,
build), rồi `pnpm test:http`, rồi integration của module bạn đụng, và `pnpm openapi:export` nếu đổi hợp đồng HTTP (xem diff `openapi.json`).

## 7. Những chỗ hay nhầm

- **Guard chạy trước pipe.** Input ở guard chưa được Zod validate. `@Public()` chỉ bỏ xác thực; nó không phải cách sửa test thiếu
  token.
- **`@AuthenticatedOnly()` không có nghĩa là ai cũng làm được.** Nó chỉ cho người đăng nhập tới handler; quyền theo dữ liệu (ai
  được giao bước, ai không được tự duyệt) phải nằm ở policy và được test.
- **Vai đọc từ PostgreSQL mỗi request**, không nằm trong token: khóa tài khoản hay thu hồi vai có hiệu lực ngay.
- **`@Param('id')` trần không được Zod kiểm.** Dùng DTO tham số như `RequestIdParamDto`.
- **Một transaction không tự bảo đảm page và count cùng snapshot.** Danh sách phân trang đọc trong một giao dịch `RepeatableRead`
  (xem `src/modules/audit/audit-query.repo.ts`).
- **Không đặt SQL hay Prisma ở service/controller**, không khai lớp lỗi ở service/controller/repo, không `HttpStatus` trong
  `*.errors.ts`.
- **Một file một `@Injectable`**, không file re-export, không barrel. Module khác chỉ import `public/**` và `*.module.ts`.
- **Provider thiếu ở một graph.** Thêm listener hay provider vào module API mà quên graph worker hoặc lệnh dùng cùng điểm: gate R1
  báo (phần 4). Đừng thêm exception để làm gate xanh.
- **Nợ lint chỉ giảm.** Vượt `complexity` 12, hàm 60 dòng, 8 tham số thì tách use case hoặc đưa nhánh vào policy; không thêm
  `eslint-disable`, không `--suppress-all`; sửa một vi phạm cũ thì chạy `pnpm lint:prune` và giữ file `eslint-suppressions.json` đã gỡ.
- **Không sửa tay thứ sinh ra:** `docs/generated/*.md` (`pnpm arch:graph`, `pnpm arch:routes`), `openapi.json`
  (`pnpm openapi:export`), `src/generated/`, client được generate.
- **Không sửa migration đã áp dụng.** Thêm migration mới; test cả sự tồn tại lẫn hành vi của ràng buộc.
- **Comment nói lý do, không nói mã nội bộ.** Giữ mã yêu cầu (`US-xx-yy`, `AC-n`, `QĐ-n`, `SoD-n`, `ADR-n`), bỏ mã finding hay lát
  làm việc; `node scripts/arch/comment-codes.mjs` in danh sách để người đọc, không phải gate.
- **ADR "Accepted" là lựa chọn thiết kế**, không phải bằng chứng code đã làm đúng như vậy: kiểm source trước khi gọi một facade hay
  helper; ADR-0019 vẫn ở trạng thái Proposed.

## Dataset demo

Use [seed local/VPS](seed.md) and the [fixture inventory](../../src/cli/seed/fixture/shared-demo-v4/README.md). `pnpm seed:local` reads private settings and checks development/loopback before offering reset/continue/exit. Real reset belongs to the Owner; Nest does not delete databases. Accounts have one role, department heads hold MANAGER, and self-service follows the current limits. Mock script success is not integration or VPS verification.
