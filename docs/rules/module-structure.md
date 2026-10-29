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

Cần gọi ngược chiều (module dưới cần biết điều module trên giữ): module dưới **mở một extension point**, module trên
đăng ký (mục dưới). Không thêm cạnh ngược, không thêm cạnh cùng tầng khi chưa sửa bảng và ADR.

## Layout trong một module

```text
src/modules/<m>/
  README.md                 # module card: mục đích, tầng, public API, bảng sở hữu, extension point
  <m>.module.ts             # wiring Nest (và <m>-http.module.ts … nếu cần tách graph API/worker/CLI)
  public/                   # cửa DUY NHẤT cho module khác và composition root
    <m>.api.ts              # facade: class <M>Api
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
- Không có thư mục catch-all `src/common`, `src/shared`, `utils`, `helpers`, `errors` toàn cục.

**Khi nào tách nhóm.** Mục tiêu: mở một capability là thấy các chức năng của nó, không phải một danh sách file dài. Tách
theo **chức năng**, không theo loại file (không `services/`, `types/`, `errors/` trong capability — đó là dựng lại tầng
kỹ thuật), không theo số dòng hay chữ cái. Tách một cụm thành `<capability>/<group>/` khi nó là một việc người đọc tìm
theo tên (upload và preview, xác nhận, bảng luật) và ra khỏi cấp capability thì danh sách còn lại ngắn và rõ hơn — số
file chỉ là tín hiệu để xem lại, không tự nó là lý do. File mà mọi nhóm dùng — repo, types, errors, http-errors, mapper,
policy quyền — ở cấp capability; controller ở cấp capability là điểm vào HTTP và điều phối sang các nhóm. Service gánh
nhiều use case thì tách theo nhóm, không chỉ dời file; không thêm "service chính" chỉ để gọi lại service khác, không tạo
Nest module cho nhóm, không barrel. Mẫu: `catalog/catalog-entry/retirement/`, `data-import/employee-import/`
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

Spec unit nằm cạnh file: `x.policy.ts` → `x.policy.spec.ts`. Tên file kebab-case, bắt đầu bằng danh từ của capability.

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
- Nest module nghiệp vụ chỉ export contract công khai; danh sách chính xác ở `PUBLIC_CONTRACT_EXPORTS` của
  [module-graph](../../test/gates/module-graph.gate-spec.ts).

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
- Bên đăng ký có một `<tên>.listener.ts` inject provider đó và `bind`/`add` trong `onModuleInit`.
- `Hook` chưa bind thì ném lỗi có tên. Chỉ khai `whenUnbound` khi một graph hợp lệ chạy thiếu bên đăng ký (lệnh CLI chỉ
  nạp một phần app) — giá trị đó nằm ngay chỗ khai báo, không giấu trong lớp "Refusing".
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

ESLint (`eslint.config.mjs`) đo trên `src/**` trừ spec và mã sinh:

| Rule                     | Ngưỡng                                 |
| ------------------------ | -------------------------------------- |
| `max-lines`              | 500 dòng code (bỏ dòng trống, comment) |
| `max-lines-per-function` | 60                                     |
| `complexity`             | 12                                     |
| `max-params`             | 8 (cả constructor)                     |
| `max-depth`              | 4                                      |

Vượt ngưỡng là tín hiệu tách use case hoặc đưa nhánh vào policy thuần — **không** cắt file theo chữ cái hay theo con số.
Ngoại lệ ghi tại chỗ: `// eslint-disable-next-line complexity -- <lý do>`; không có ledger riêng. Một ngoại lệ theo mẫu
file: `*.http-errors.ts` không đo `complexity`/`max-lines-per-function` — đó là bảng `instanceof` → câu trả lời HTTP,
mỗi lỗi một nhánh, thứ tự có nghĩa với lớp con; độ dài của nó là số lỗi, không phải logic. `pnpm lint` chạy với
`--max-warnings N` (`package.json`): ESLint chỉ thoát lỗi khi **tổng** số cảnh báo của mọi rule mức `warn` vượt N — nó
không chặn một hàm đã vượt ngưỡng dài thêm, không chặn cảnh báo mới được bù bằng cảnh báo vừa sửa, và không tự hạ N. Hai
quy ước review (không phải gate): PR chạm vào một hàm vượt ngưỡng để lại nó nhỏ hơn; PR làm giảm số cảnh báo hạ N ngay
trong PR đó. Spec unit của module tối đa 400 dòng (H8-RV-01, gate `module-layout`): dài hơn thì tách
theo use case, harness có kiểu đặt ở `test/support/`.

## Gate

| Lệnh                   | Kiểm                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm arch:check`      | Tầng module, cửa `public/`, composition root, nhóm chỉ qua điểm vào, không vòng import, controller không import controller |
| `pnpm test:gates`      | Layout và từ vựng file, chỗ đặt lỗi/SQL/HTTP, sở hữu bảng Prisma, export Nest, lệnh vận hành                               |
| `pnpm arch:docs:check` | `docs/generated/module-graph.md` và `docs/generated/routes.md` khớp code (`pnpm arch:graph`, `pnpm arch:routes`)           |
| `pnpm lint`            | Kích thước và độ phức tạp (mục trên)                                                                                       |

## Thêm một use case

1. Tìm module sở hữu dữ liệu (bảng tầng ở trên, [routes](../generated/routes.md) cho route gần giống).
2. Đặt file vào capability của nó: `<x>.controller.ts`, `<x>.dto.ts`, `<x>.service.ts`, `<x>.policy.ts` + spec.
3. Cần dữ liệu module khác: gọi facade trong `public/` của module đó; cần module tầng trên phản ứng: mở extension point.
4. `pnpm check`, rồi integration/HTTP của module ([test guide](../../test/README.md)); cập nhật module card nếu public
   API hay extension point đổi.
