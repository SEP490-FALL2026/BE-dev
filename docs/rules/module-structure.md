# Cấu trúc module, capability và lỗi

Áp dụng khi thêm, di chuyển hay đổi tên file trong `src/`. Máy kiểm phần lớn quy tắc dưới đây: `pnpm arch:check`
([dependency-cruiser](../../.dependency-cruiser.cjs)), `pnpm test:gates`
([module layout](../../test/gates/module-layout.gate-spec.ts),
[architecture boundaries](../../test/gates/architecture-boundaries.gate-spec.ts)) và ESLint. Quyết định:
[ADR-0019](../decisions/0019-module-tiers-and-public-api.md).

## Tầng source

| Thư mục                            | Chứa                                                                            | Được import                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/core`                         | TypeScript thuần: ngày nghiệp vụ, tiền, CSV, `Hook`/`Listeners`/`Contributions` | không gì khác                                            |
| `src/infrastructure`               | Adapter kỹ thuật: config, database, HTTP, bảo mật, mail, storage, queue         | `core`                                                   |
| `src/modules/<m>`                  | Một bounded context nghiệp vụ                                                   | `core`, `infrastructure`, module tầng dưới qua `public/` |
| `src/app`, `src/worker`, `src/cli` | Ghép API, worker, lệnh vận hành (composition root)                              | mọi thứ, nhưng module chỉ qua `public/` và `*.module.ts` |

`src/main.ts`, `src/worker.ts`, `src/cli.ts` là ba điểm vào tiến trình; xem [src/README](../../src/README.md).

**`src/core` chỉ chứa primitive dùng chung (R7).** Một file của `core` mà chưa tới hai vùng (một module, `infrastructure`, `app`,
`worker`, `cli`) import là khái niệm của riêng vùng đó và thuộc thư mục của nó. Gate
[capability-graph](../../test/gates/capability-graph.gate-spec.ts) đỏ khi có file như vậy, trừ file nằm trong
`CORE_PRIMITIVES_OF_ONE_AREA` kèm lý do (hiện có `core/money/convert.ts`); danh sách chỉ thu hẹp, mục không còn đúng cũng đỏ.
`pnpm arch:capabilities --core` in ai dùng từng file.

## Tầng module

Module chỉ import module **tầng thấp hơn**, hoặc module cùng tầng có ghi trong bảng. Nguồn duy nhất:
[scripts/arch/tiers.cjs](../../scripts/arch/tiers.cjs); hình: [module graph](../generated/module-graph.md).

| Tầng | Module                                    | Cùng tầng được phép              |
| ---- | ----------------------------------------- | -------------------------------- |
| T1   | `audit`, `notifications`                  | —                                |
| T2   | `organization`, `identity-access`         | `identity-access → organization` |
| T3   | `finance`, `operating-parameters`         | `operating-parameters → finance` |
| T4   | `catalog`, `licensing`                    | `licensing → catalog`            |
| T5   | `budgets`, `requests`, `data-import`      | `requests → budgets`             |
| T6   | `personnel`, `onboarding`, `installation` | —                                |
| T7   | `dashboards`                              | —                                |

Cần gọi ngược chiều (module dưới cần biết điều module trên giữ): module dưới **mở một extension point**, module trên
đăng ký (mục dưới). Không thêm cạnh ngược, không thêm cạnh cùng tầng khi chưa sửa bảng và ADR.

## Layout trong một module

```text
src/modules/<m>/
  README.md                 # module card: mục đích, tầng, public API, bảng sở hữu, extension point
  <m>.module.ts             # wiring Nest; tên file nói graph (mục Tên Nest module nói graph): <m>-http, <m>-<x>-facade, <cap>-cli …
  <m>-<…>.<vai trò>.ts      # chỉ khi nhiều capability dùng chung: <m>-audit-event.mapper.ts, <m>.http-errors.ts …
  public/                   # cửa DUY NHẤT cho module khác và composition root
    <m>.api.ts              # facade: class <M>Api (một module có thể mở nhiều facade: <x>.api.ts → <X>Api)
    <m>.types.ts  <m>.errors.ts  <m>.extension-points.ts
  <capability>/             # nhóm theo năng lực: department/, spend/, offboarding/ …
    <capability>.controller.ts  .repo.ts  .types.ts  .errors.ts  .http-errors.ts  .mapper.ts   # điểm vào + lõi chung
    <group>/                # nhóm chức năng: một use case (preview/, confirmation/) hoặc một phần chung (rules/)
      <capability>-<group>.service.ts   # điểm vào của nhóm (.service, .policy hoặc .types mang tên nhóm)
```

- Tối đa **2 cấp thư mục** dưới module (capability → nhóm), tối đa **25 file mỗi thư mục** (kể cả spec).
- **Nhóm chức năng có một điểm vào và phần riêng.** Điểm vào là file đặt tên `<…>-<tên nhóm>.service.ts`,
  `.policy.ts` hoặc `.types.ts` (ví dụ `employee-import/preview/employee-import-preview.service.ts`,
  `requests/status/rules/request-status-rules.policy.ts`). Trong capability, mọi file — controller, service điều phối,
  nhóm anh em — chỉ gọi điểm vào của nhóm; file còn lại của nhóm (đọc CSV, bảng luật con …) chỉ nhóm đó dùng. Ngoài
  capability chỉ Nest module và facade `public/` thấy nhóm. Spec được nhìn vào trong. Không vòng import.
- Một phần mà capability khác dùng thì nó là một capability, không phải nhóm (ví dụ `requests/assessment/`). Hai chức
  năng không chia sẻ gì là hai capability (ví dụ `requests/status/` và `requests/timing/`).
- Capability trong cùng module được import nhau; module card ghi file nào là "lõi chung" (ví dụ
  `requests/access-request/`).
- Không có thư mục catch-all `src/common`, `src/shared`, `utils`, `helpers`, `errors` toàn cục, và **không thư mục tên tầng kỹ
  thuật ở bất kỳ cấp nào dưới module** (`mappers`, `dto`, `dtos`, `policies`, `services`, `repos`, `types`, `errors`,
  `controllers`, `common`, `shared`, `utils`, `helpers`; R3): file nằm ở nơi chức năng của nó nằm.
- **Gốc module (R5, `OD-R2`).** Module có thư mục capability chỉ giữ ở gốc `README.md`, `*.module.ts` và file dùng chung toàn
  module có tên bắt đầu bằng tên module (`finance.http-errors.ts`, `catalog-audit-event.mapper.ts`, `personnel-grounds.policy.ts`);
  một file chỉ vài capability dùng đặt vào capability thấp nhất mà các bên đã import, không tạo cạnh mới. Module chưa có thư
  mục capability (hiện `audit`, `onboarding`, `operating-parameters`) được phẳng, chỉ chịu trần 25 file.
- **Cửa công khai (R4).** `*.api.ts` và `*.extension-points.ts` chỉ nằm trong `public/`; mỗi `public/<x>.api.ts` export đúng một
  lớp `<X>Api` (tên file viết PascalCase + `Api`), một module được mở nhiều facade.
- **Capability không vòng (R6, `OD-R3`).** Capability trong một module được import nhau nhưng không theo vòng: `a → b → a` là lỗi, ở
  **mọi** module. `pnpm arch:capabilities [--module <m>]` in cạnh và vòng của từng module kèm cạnh file, và với `--module` thêm tầng L0–L3 của từng capability (L3 có controller; còn lại L0 không import capability nào, L1 chỉ import L0, L2 import L1 hoặc L2); gate `capability-graph` đỏ
  và nêu chu trình cùng cạnh file cần gỡ. File ở gốc module và trong `public/` không phải capability nhưng không chặn đồ thị: capability
  import facade của module (`public/<m>.api.ts`) hoặc một file gốc thì được tính cạnh tới mọi capability file đó chạm, in
  `(via <file>)`. Vì vậy capability **không import facade của chính module mình** (facade là cửa cho module khác; capability tiêm
  service mà facade gọi; gate `module-layout`). Riêng `requests`: lõi (`access-request`,
  `outcome`) không import capability nào, và capability có controller không bị capability khác import trừ danh sách có lý do (tiêu chí thay thế của Task 4.3, Owner 31/10/2026). Gỡ một
  cạnh ngược bằng cách đưa kiểu hoặc file thuần xuống capability thấp, hoặc đưa dịch vụ điều phối lên capability mới đặt tên theo
  use case; không dùng barrel, facade giả hay thư mục dùng chung. `*.errors.ts` không import policy của capability khác.

**Khi nào tách nhóm.** Mục tiêu: mở một capability là thấy các chức năng của nó, không phải một danh sách file dài. Tách
theo **chức năng**, không theo loại file (không `services/`, `types/`, `errors/` trong capability — đó là dựng lại tầng
kỹ thuật), không theo số dòng hay chữ cái. Tách một cụm thành `<capability>/<group>/` khi nó là một việc người đọc tìm
theo tên (upload và preview, xác nhận, bảng luật) và ra khỏi cấp capability thì danh sách còn lại ngắn và rõ hơn — số
file chỉ là tín hiệu để xem lại, không tự nó là lý do. File mà mọi nhóm dùng — repo, types, errors, http-errors, mapper,
policy quyền — ở cấp capability; controller ở cấp capability là điểm vào HTTP và điều phối sang các nhóm. Service gánh
nhiều use case thì tách theo nhóm, không chỉ dời file; không thêm "service chính" chỉ để gọi lại service khác, không tạo
Nest module cho nhóm, không barrel. Mẫu: `data-import/employee-import/`
(`row-validation/`, `preview/`, `confirmation/`), `requests/status/rules/`.

## Từ vựng file

| Hậu tố                           | Vai trò                                                                   | Được dùng Nest/Prisma? |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| `.module.ts`                     | Wiring Nest                                                               | Nest                   |
| `.controller.ts`                 | Map HTTP ↔ DTO, khai quyền, gọi service; không import controller khác     | Nest                   |
| `.dto.ts`                        | Zod schema / wire shape của request, response                             | không                  |
| `.service.ts`                    | Một use case: transaction, điều phối, audit                               | Nest                   |
| `.policy.ts`                     | Quy tắc nghiệp vụ thuần, trả quyết định                                   | không                  |
| `.repo.ts`                       | Persistence; mọi SQL (Prisma lẫn raw) nằm đây                             | Prisma                 |
| `.mapper.ts`                     | Record → wire                                                             | không                  |
| `.types.ts`                      | Type, hằng số                                                             | không                  |
| `.errors.ts` / `.http-errors.ts` | Lỗi nghiệp vụ / ánh xạ lỗi → HTTP                                         | không / Nest           |
| `.api.ts`                        | Facade công khai, chỉ trong `public/`                                     | Nest                   |
| `.extension-points.ts`           | Hook/Listeners/Contributions module này mở, chỉ trong `public/`           | không                  |
| `.listener.ts`                   | Hiện thực extension point của module khác (bind/add trong `onModuleInit`) | Nest                   |
| `.job.ts`                        | Việc định kỳ (sweeper, vòng của worker)                                   | Nest                   |
| `.json.ts`                       | Codec của một cột JSON: zod schema, `decode` (đọc), `encode` (ghi)        | kiểu Prisma            |

Spec unit nằm cạnh file: `x.policy.ts` → `x.policy.spec.ts`. Tên file kebab-case, bắt đầu bằng danh từ của capability.

**`.json.ts` — cột JSON.** Mỗi cột `Json`/`Json?` của `prisma/models` có đúng một codec, đặt trong capability của repo sở hữu bảng. Repo
và mapper đọc qua `decode` và ghi qua `encode`, không bao giờ ép kiểu (`as unknown as`: gate `module-layout` đỏ ở mọi file non-spec của
`src/modules`). Các cột cùng một hình dạng (`before`/`after`, hai bảng giữ cùng một dữ kiện) chung một schema và một file. Một cột có hai
hình dạng theo trạng thái của dòng thì có hai codec: `access_requests.policy` là `RequestPolicy` khi request đã gửi
(`access-request/access-request.json.ts`) và `{ draft: … }` khi còn là bản nháp (`request-draft/request-draft-policy.json.ts`).

Chỗ đặt có hai ngoại lệ vì trần 25 file mỗi thư mục (spec tính vào trần), và một chỗ ở gốc module:

- `requests/access-request/access-request.json.ts` giữ hai cột khác hình dạng của `access_requests` trong một file, và spec của chúng nằm trong
  `access-request.policy.spec.ts` (policy) và `pricing.policy.spec.ts` (payment_schedule) vì thư mục đã đủ 25 file.
- `personnel/personnel-change-detail.json.ts` ở gốc module vì `personnel/offboarding/` đã 24 file; spec cạnh file.
- `personnel/personnel-head-handover.json.ts` ở gốc module vì không có capability thấp hơn mà cả ba bên đọc (`transfer`, `offboarding`,
  `role-duties`) đã cùng import: `offboarding` đã import `transfer`, còn `role-duties` thì chưa, và thêm cạnh đó chỉ để lấy một codec là
  cạnh mới. Hai capability khác cùng cần một hình dạng thì đặt codec ở capability thấp nhất cả hai đã import (R5).

Quy tắc đầy đủ ở [database rules](database-business.md#cột-json-một-codec-đọc-qua-decode); module card của `requests` và `personnel` ghi spec
của codec nằm ở đâu.

## Tên service đọc

Một service **chỉ đọc** mang một trong ba tên, nên "đọc X nằm ở file nào" đoán được từ tên. Gate `module-layout` đỏ khi một `*.service.ts`
của module kết thúc bằng `-directory`, `-lookup`, `-reader`, `-read` hoặc `-support`, số ít hay số nhiều (năm hậu tố cũ không nói trả gì cho ai).

| Hậu tố              | Trả về                                                                                              | Chạy ở đâu                          | Ví dụ                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `<x>-query.service` | bản ghi hoặc trang cho HTTP đọc (list, detail), ngoài transaction ghi                               | controller gọi                      | `requests/assessment/assessment-query.service.ts`, `catalog/vendor/vendor-query.service.ts`   |
| `<x>-facts.service` | dữ kiện một quyết định, một capability hoặc module khác cần; `tx` tùy chọn; không trả thẳng ra wire | service ghi, policy hoặc facade gọi | `catalog/plan/plan-facts.service.ts`, `catalog/catalog-entry/application-facts.service.ts`    |
| `<x>-view.service`  | ghép nhiều nguồn thành một hình chiếu trước khi `mapper` ra wire                                    | controller hoặc query gọi           | `licensing/provisioning/revocation-view.service.ts`, `budgets/budget/version-view.service.ts` |

- Một service vừa đọc vừa **ghi** một bảng cho các capability khác không phải service đọc: đặt `<x>-record.service.ts`
  (`identity-access/accounts/account-record.service.ts`, `organization/employee/employee-record.service.ts`). Đừng đặt `-query`, `-facts` hay
  `-view` cho nó, vì ba tên đó hứa không ghi. Hậu tố `-record` là bản ghi nhận 31/10/2026 ngoài ba tên của `OD-F4` = A (lý do: `<x>.service.ts`
  trơn nghĩa là một use case và đã bị `DepartmentService`, `SessionService` chiếm); **Owner xác nhận 31/10/2026**.
- Tên đúng là tên theo việc nó làm, không theo chữ: một service gọi là `-facts` mà có `create` là service ghi.

## Tên Nest module nói graph

Tên một `*.module.ts` nói nó thuộc graph nào, nên "khai provider ở module nào" trả lời được từ tên file, không cần module card. Gate
`module-layout` đỏ khi một `*.module.ts` của `src/modules/` không khớp **đúng một** dòng, hoặc một module gốc lệnh của `src/cli/` không
tên `<lệnh>-cli.module.ts`.

| Tên file                              | Graph                                                                                 | Nơi đặt                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| `<m>.module.ts`                       | mọi graph cần module: facade, provider, listener, extension point                     | gốc module               |
| `<m>-http.module.ts`                  | chỉ API: controller, sweeper                                                          | gốc module               |
| `<m>-<x>-facade.module.ts`            | tập con dùng chung với worker hoặc lệnh; `<x>` có thể bỏ trống                        | gốc module               |
| `<cap>-cli.module.ts`                 | phần của **một** module mà chỉ một lệnh dùng (không controller, không export cho API) | `src/modules/<m>/<cap>/` |
| `<m>-<x>-cli.module.ts`               | như dòng trên, khi phần đó không thuộc capability nào                                 | gốc module               |
| `src/cli/<lệnh>/<lệnh>-cli.module.ts` | gốc graph của đúng một lệnh, ghép các module                                          | `src/cli/<lệnh>/`        |

- Phần `<x>` của `-facade` bỏ trống thì đó là phần mọi graph cần của module: `identity-access-facade.module.ts`; có `<x>` thì là tập con
  cho một nơi dùng: `requests-work-facade.module.ts` (worker), `identity-access-inspection-facade.module.ts` (`ops:inspect`),
  `identity-access-local-seed-facade.module.ts` (`ops:seed`).
- `<cap>-cli.module.ts` chỉ cần kết thúc bằng `-cli`, không buộc trùng tên thư mục (`installation/inspect/inspection-cli.module.ts`).
- `installation/installation.module.ts` giữ tên: nó là **module** `installation` (tầng T6), không phải phần của một lệnh; bootstrap và pha bootstrap của seed
  dùng cùng graph này, không thêm graph mới.
- Lớp theo tên file (`inspection-cli.module.ts` → `InspectionCliModule`). Lớp gốc của lệnh (`src/cli/<lệnh>/`) đặt tên theo lệnh; riêng
  `cost-center-direction` có cùng tên cho phần và gốc nên gốc là `CostCenterDirectionRootCliModule`.
- Gốc graph của một lệnh thường là `src/cli/<lệnh>/<lệnh>-cli.module.ts`, nhưng `ops:inspect`, `ops:preflight` và `ops:seed`
  dùng chính `<cap>-cli.module.ts` của module làm gốc (lệnh không ghép thêm gì), và `PROCESS_GRAPHS` ghi các lớp đó làm graph.
- Lệnh mới có Nest graph: thêm vào `PROCESS_GRAPHS` ([process-graphs](../../test/support/process-graphs.ts)); đổi tên graph thì đổi cả
  `GRAPH_WIRING_EXCEPTIONS` của gate `extension-wiring`.

## Liên module

- Module khác và composition root chỉ import `modules/<x>/public/**` hoặc `modules/<x>/*.module.ts`. Không import repo,
  không đọc bảng của module khác. Spec unit được nhìn vào trong (white-box) khi cần.
- Mỗi file non-spec dưới `src/modules/**` export tối đa **một** lớp `@Injectable`; không file module nào re-export
  (`export … from`), kể cả `public/` — import thẳng file trong `public/`, không barrel.
- **Validation dùng chung là dùng chung policy ngữ nghĩa (BEH.1).** Khi hai workflow cần cùng một quyết định, chỉ quyết
  định đó dùng chung: một hàm thuần ở module sở hữu dữ liệu, trả **mã lý do ngữ nghĩa** theo thứ tự xác định (không
  `field`/`column`); mỗi adapter tự ánh xạ sang vị trí trình bày. File policy dùng liên module nằm trong `public/`, đăng
  ký chính xác ở `PUBLIC_ROOT_POLICY_FILES` của [policy-ownership](../../test/gates/policy-ownership.gate-spec.ts). Ví
  dụ: `organization/public/employee-placement.policy.ts` dùng cho form nhập tay và preview import.
- **Export của Nest module nghiệp vụ (R10).** Một export nằm ngoài `PUBLIC_CONTRACT_EXPORTS` của
  [module-graph](../../test/gates/module-graph.gate-spec.ts) (facade, port cho infrastructure, service của CLI entry module)
  chỉ hợp lệ khi mọi consumer của token đó nằm trong thư mục của chính module export. Consumer là provider hoặc controller
  của một Nest module import module export, mà constructor inject token (kiểu tham số, `@Inject`, `inject` của factory
  provider) hoặc alias `useExisting` trỏ tới token đó, đọc từ DI metadata của mọi graph tiến trình (`test/support/process-graphs.ts`); thư mục của consumer là thư
  mục của Nest module khai báo nó. Consumer ngoài thư mục là lỗi code phải sửa (đi qua facade hoặc extension point), không
  có ngoại lệ ghi sổ.

## Extension point

Ba kiểu, định nghĩa một lần ở `src/core/extension/`:

| Kiểu               | Khi nào                                                                             | Ví dụ                             |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| `Hook<T>`          | Đúng một hiện thực; module dưới gọi, module trên cung cấp                           | cổng cấp quyền của licensing      |
| `Listeners<E, Tx>` | 0..n người nghe chạy tuần tự **trong transaction** của bên phát; ném lỗi = hoàn tác | kết quả của một Request           |
| `Contributions<T>` | 0..n hiện thực trả giá trị; bên mở gọi `all()` rồi gộp                              | "điều gì giữ phòng ban đang dùng" |

- Bên mở khai một provider trong `public/<m>.extension-points.ts`
  (`@Injectable() export class XHook extends Hook<X> { constructor() { super('<m>.x'); } }`) và export nó từ Nest
  module.
- Bên đăng ký có một `<tên>.listener.ts` inject provider đó và `bind`/`add` trong `onModuleInit`. Mỗi lớp `@Injectable` của
  file đó khai `static readonly binds = [<LớpExtensionPoint>] as const;` đúng các điểm nó đăng ký (gate đối chiếu với
  `onModuleInit`).
- `Hook` chưa bind thì ném lỗi có tên, không có giá trị thay thế. Gate `extension-wiring` (`pnpm test:gates`) kiểm **từng graph
  tiến trình** (API, worker, mọi lệnh có Nest graph): extension point nào có provider hoặc controller trong graph dùng, mọi
  bên đăng ký của nó trong `src/` phải có mặt trong graph đó. Graph không cần một bên đăng ký vì luồng phát không chạy trong
  tiến trình ấy thì ghi vào `GRAPH_WIRING_EXCEPTIONS` của gate, kèm lý do nêu mã phát và mọi đường tới nó; thêm mục cần Owner
  đồng ý, và mục hết đúng (bên đăng ký đã có mặt) làm gate đỏ. Lệnh mới có Nest graph phải vào `PROCESS_GRAPHS` ở [process-graphs](../../test/support/process-graphs.ts) (gate `extension-wiring` và luật R10 đọc cùng danh sách).
- Không dùng event bus bất đồng bộ: người nghe có quyền từ chối và phải hoàn tác cùng transaction.
- Module card liệt kê điểm mở và người đăng ký, để đọc được luồng ngược mà không cần chạy code.

## Lỗi

- Lỗi nghiệp vụ khai trong `*.errors.ts` của capability sở hữu; **không** khai lớp lỗi trong service, controller, repo.
- Ánh xạ HTTP ở `*.http-errors.ts` hoặc controller; **không** `ApiException`/`HttpStatus` trong file lỗi hay service.
- Lỗi adapter kỹ thuật ở `src/infrastructure` (ví dụ `TransientDatabaseError`); lỗi liên module trong `public/`.
- Một lớp cho mỗi tên lỗi trong một module; so khớp bằng `instanceof`, không bằng chuỗi `error.name`.
- FE dùng **mã ổn định** (`DOMAIN.ACTION`), không branch theo message. Dependency không sẵn sàng là 503, lỗi không nhận
  diện được là 500 ([API contract](api-contract.md), [security](security-jobs.md)).

## Kích thước và độ phức tạp

ESLint (`eslint.config.mjs`) đo trên `src/**` trừ spec và mã sinh. Mọi rule dưới đây là **`error`**: không còn mức `warn` và
không còn `--max-warnings` (một directive `eslint-disable` thừa cũng là `error`).

| Rule                     | Ngưỡng                                 |
| ------------------------ | -------------------------------------- |
| `max-lines`              | 500 dòng code (bỏ dòng trống, comment) |
| `max-lines-per-function` | 60                                     |
| `complexity`             | 12                                     |
| `max-params`             | 8 (cả constructor)                     |
| `max-depth`              | 4                                      |

Vượt ngưỡng là tín hiệu tách use case hoặc đưa nhánh vào policy thuần — **không** cắt file theo chữ cái hay theo con số.
Nợ có sẵn lúc các rule thành `error` (`OD-R4`) nằm trong [eslint-suppressions.json](../../eslint-suppressions.json) do
`eslint --suppress-all` sinh, đếm theo từng file và rule; tổng các số đếm là nợ còn lại (229 lúc ghi; 113 sau remediation 30/10:
59 `complexity`, 54 `max-lines-per-function`, 0 `max-params`; riêng `src/modules/requests` 37). Hệ quả:

- Vi phạm mới ở bất kỳ file nào làm `pnpm lint` đỏ; file đã có nợ mà vượt số đếm của nó cũng đỏ (ESLint báo mọi vi phạm của
  file và rule đó).
- Sửa một vi phạm cũ cũng làm `pnpm lint` đỏ ("suppressions left that do not occur anymore") cho tới khi `pnpm lint:prune`
  gỡ mục của nó; commit file đã gỡ cùng thay đổi. Nợ chỉ có thể giảm.
- Không sửa tay file đó, không `--suppress-all` lại trên cây đang có vi phạm mới, không `--pass-on-unpruned-suppressions`.
- Gate `test/gates/lint-debt.gate-spec.ts` (TG-2) đọc cấu hình ESLint **hiệu lực** của từng file `.ts` trong `src`, `test`, `scripts`
  (`scripts/arch/eslint-effective-config.mjs`, sau khi gộp mọi override, không đọc chữ của `eslint.config.mjs`), nên một override
  `warn` hay `off` thêm sau làm gate đỏ. Gate giữ mức `error` và tùy chọn: `complexity` 12, `max-lines-per-function` 60 (bỏ dòng trống và
  comment), `max-params` 8, `max-lines` 500, `max-depth` 4 ở mọi file `src` không phải spec; ba rule kiểu ở mọi file; `reportUnusedDisableDirectives:
'error'` ở mọi file; chỉ `*.http-errors.ts` tắt hai rule kích thước; script `lint` không có `--max-warnings` hay tùy chọn hạ mức. Gate còn giữ
  không `eslint-disable` cho ba rule trong `src`, mọi mục trong file suppression trỏ tới file còn tồn tại, và tổng số đếm theo rule
  (`complexity` 59, `max-lines-per-function` 54), `complexity` + `max-lines-per-function` (113), và riêng `src/modules/requests` (37)
  không vượt trần ghi trong gate. `max-params` không còn nợ: không file nào được mang suppression của nó (gate đòi không có khóa
  `max-params`), một constructor hay hàm quá 8 tham số phải được tách chứ không ghi nợ. Trần bằng số đã đạt: gỡ được suppression
  thì hạ trần trong cùng thay đổi (gate đòi trần đúng bằng số hiện có), không bao giờ nâng.
- Ngoại lệ đáng giữ lâu dài ghi tại chỗ: `// eslint-disable-next-line complexity -- <lý do>`. Một ngoại lệ theo mẫu file:
  `*.http-errors.ts` không đo `complexity`/`max-lines-per-function` — đó là bảng `instanceof` → câu trả lời HTTP, mỗi lỗi một
  nhánh, thứ tự có nghĩa với lớp con; độ dài của nó là số lỗi, không phải logic.

`@typescript-eslint/no-explicit-any`, `no-floating-promises` và `no-unsafe-argument` cũng là `error`, với 0 vi phạm và không có
suppression nào. Spec unit của module tối đa 400 dòng (H8-RV-01, gate `module-layout`): dài hơn thì tách theo use case, harness
có kiểu đặt ở `test/support/`.

## Luật máy kiểm (R1–R10) và luật review

Mỗi luật có một câu ở đây và một gate; luật không có máy kiểm ghi "review". Chi tiết ở các mục trên.

| #   | Luật                                                                                                                                      | Gate                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| R1  | Mỗi graph tiến trình có mặt đủ bên đăng ký của extension point nó dùng; ngoại lệ ghi kèm lý do (mục Extension point)                      | `extension-wiring`                                     |
| R2  | Client của một transaction chạy một truy vấn một lúc, không `Promise.all` trên `tx` ([database rules](database-business.md))              | `module-layout`                                        |
| R3  | Không thư mục tên tầng kỹ thuật ở bất kỳ cấp nào dưới module                                                                              | `module-layout`                                        |
| R4  | `*.api.ts` và `*.extension-points.ts` chỉ trong `public/`; mỗi facade export đúng một lớp `<X>Api`, ≤ 8 phụ thuộc                         | `module-layout`; ESLint `max-params`                   |
| R5  | Gốc module có thư mục capability chỉ giữ `README.md`, `*.module.ts` và file mang tên module                                               | `module-layout`                                        |
| R6  | Capability không import nhau theo vòng, ở mọi module; capability không import facade của chính module                                     | `capability-graph`, `module-layout`                    |
| R7  | `src/core` chỉ giữ primitive ít nhất hai vùng dùng                                                                                        | `capability-graph` (TG-9)                              |
| R8  | `complexity` 12, `max-lines-per-function` 60, `max-params` 8 là `error`; nợ cũ chỉ giảm, `max-params` về 0                                | `lint-debt` (TG-2), `pnpm lint`                        |
| R9  | Spec unit của module ≤ 400 dòng; spec database/server (`test/integration`, `test/http`, `test/e2e`) ≤ 800 dòng; `test/support` ≤ 400 dòng | `module-layout`, `test-size`, `test-support-structure` |
| R10 | Export Nest ngoài hợp đồng công khai chỉ hợp lệ khi mọi consumer cùng thư mục module                                                      | `module-graph`                                         |
|     | Mọi package `src` import lúc chạy nằm trong `dependencies` của `package.json`                                                             | `deployment-roles` (TG-3)                              |
|     | Tầng module, cửa `public/`, nhóm chỉ qua điểm vào, không vòng import, controller không import controller                                  | `pnpm arch:check`                                      |

Luật chỉ có review (không có máy kiểm): tách nhóm khi nào (mục Layout), module card cập nhật khi public API hay extension point đổi,
kiểm lại thứ tự khóa của luồng ghi mới, và **comment nói lý do, không nói mã nội bộ** — giữ mã yêu cầu (`US-xx-yy`, `AC-n`, `QĐ-n`,
`FR-n`, `INV-n`, `SoD-n`, `ADR-n`, `BR-n`) và mã nghiệp vụ hợp lệ (`G1`–`G5`, `K1`–`K5`, `T1`–`T6`), thay mã finding hay lát
(`F13`, `T-11`, `P23-RV`, `GATE.2`, `H6.4`…) bằng một câu lý do; `node scripts/arch/comment-codes.mjs` chỉ in danh sách để người đọc,
không phải gate. Test trong `test/` được giữ mã tham chiếu ở dòng chú thích trên test, không ở tên test.

## Gate

| Lệnh                   | Kiểm                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm arch:check`      | Tầng module, cửa `public/`, composition root, nhóm chỉ qua điểm vào, không vòng import, controller không import controller                                                                                                                                                                                                                                                                                                                                            |
| `pnpm test:gates`      | Layout và từ vựng file (R3 → R5), capability không vòng (R6), `src/core` chỉ primitive dùng chung (R7), export Nest chỉ được module cùng thư mục dùng (R10), log lỗi của job qua `describeForOperator`, không `as unknown as` trong module, tên Nest module nói graph, từ vựng service đọc, chỗ đặt lỗi/SQL/HTTP, sở hữu bảng Prisma, lệnh vận hành, dependency chạy thật của `src` nằm trong `dependencies`, cỡ spec database/server ≤ 800 dòng, trần nợ lint (TG-2) |
| `pnpm arch:docs:check` | `docs/generated/module-graph.md` và `docs/generated/routes.md` khớp code (`pnpm arch:graph`, `pnpm arch:routes`)                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm lint`            | Kích thước và độ phức tạp (mục trên)                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Thêm một use case

1. Tìm module sở hữu dữ liệu (bảng tầng ở trên, [routes](../generated/routes.md) cho route gần giống).
2. Đặt file vào capability của nó: `<x>.controller.ts`, `<x>.dto.ts`, `<x>.service.ts`, `<x>.policy.ts` + spec.
3. Cần dữ liệu module khác: gọi facade trong `public/` của module đó; cần module tầng trên phản ứng: mở extension point.
4. `pnpm check`, rồi integration/HTTP của module ([test guide](../../test/README.md)); cập nhật module card nếu public
   API hay extension point đổi.
