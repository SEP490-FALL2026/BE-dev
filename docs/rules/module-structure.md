# Cấu trúc module, capability và lỗi

Áp dụng khi thêm hoặc di chuyển file trong `src/`, tạo controller/service/repo/error mới, hoặc review một thay đổi chạm
ranh giới. [ARCHITECTURE](../../ARCHITECTURE.md) mô tả hiện trạng; rule này là mô hình đích. Nguồn: kết luận và quyết định
Owner Q6/Q7 trong [báo cáo audit nền tảng 18/10/2026](../reviews/be-foundation-audit-2026-10-18/README.md).

## Tầng source

1. `src/core`: TypeScript thuần — không Nest, Prisma, SDK, `infrastructure` hay business module.
2. `src/infrastructure`: adapter kỹ thuật và port dùng chung (HTTP, security, database, mail, storage, queue, config,
   observability). Không chứa business workflow, không import business module.
3. `src/modules/<bounded-context>`: sở hữu nghiệp vụ và persistence của mình. Bảng nào thuộc module nào nằm trong
   `PRISMA_MODEL_OWNER` của [architecture test](../../src/architecture-boundaries.spec.ts).
4. File ở `src/` gốc chỉ là composition root (API, worker, CLI) và gate kiến trúc.

## Layout trong một bounded context

- **Phẳng** khi module nhỏ: tối đa 2 controller và 12 file non-spec ở root.
- **Theo capability** khi vượt một trong hai ngưỡng trên, hoặc khi có nhiều capability khó tìm file: mỗi capability một
  folder, tối đa **hai tầng thư mục** dưới root module (`<module>/<capability>/<dto|errors|mappers|policies>/file.ts`).
- **Root module** chỉ giữ thứ thực sự công khai hoặc là điểm ghép: `<module>.module.ts`; `<module>-http.module.ts` khi lớp
  HTTP có vòng đời riêng; facade `<module>.service.ts`; `<module>.types.ts` (type public); `<module>.errors.ts` (lỗi mà
  module khác thật sự phải bắt); Nest module của capability có entry riêng (ví dụ `recovery.module.ts` của lệnh
  `ops:recover`; hiện thực nằm trong `recovery/` theo E7); `<module>.ports.ts` khi nhiều capability cùng dùng một port
  (contract nội module đăng ký, xem dưới). Không biến root thành nơi chứa mọi controller/service/repo.
- **Root module không phải vùng public mặc định.** Trong cùng module, root là một phần như capability: file root không
  import file private của capability, capability không import file private ở root (ví dụ repo). Chỉ file Nest module
  (`*.module.ts`) được ghép mọi provider của module mình.
- **Folder dùng chung cấp module** (`dto/`, `errors/`, `mappers/`, `policies/` ở root module) chỉ cho nội dung mà ít nhất
  hai capability cùng dùng; nội dung của một capability nằm trong folder của capability đó. Folder dùng chung là đích
  tự do cho mọi phần, nhưng khi chính nó import vào capability/root thì chịu cùng contract (xem
  [gate](#gate-và-legacy-ledger)).

### Ownership của capability folder

Mỗi capability folder sở hữu controller, service, repo cho aggregate/bảng của mình, cùng `dto/`, `errors/`, `mappers/`,
`policies/` của nó. Mỗi bảng có **một** repo ghi trong module. Phần khác trong **cùng** module (capability khác, hoặc file
root) chỉ import một file của capability khi file đó là **contract nội module đã đăng ký** trong registry chính xác
`INTRA_MODULE_CONTRACTS` của [architecture-structure.spec.ts](../../src/architecture-structure.spec.ts) (GATE.2): đường dẫn
tương đối `src/` kèm lý do public. Hậu tố tên file không mở gì — `*.service.ts`/`*.types.ts` chưa đăng ký vẫn private;
repo, controller, http-errors, credential hasher, policy, validator, helper và service hiện thực luôn private trừ khi
được nâng thành contract có chủ đích. Mỗi mục phải có file và còn consumer ở phần khác của module; mục mất consumer cuối
cùng bị gate báo và phải xóa. Cần một contract mới thì đăng ký nó trong cùng thay đổi (review như
`PUBLIC_CONTRACT_EXPORTS`), ghi lý do trong spec của item; port mà nhiều capability cùng dùng đặt ở file root
`<module>.ports.ts` đăng ký trong registry (không thuộc bề mặt liên module), port chỉ một capability tiêu thụ ở lại
capability đó.

### Khi nào folder trở thành Nest submodule

Folder **không** tự động là Nest module. Chỉ tạo Nest submodule khi có ít nhất một điều kiện sau, và ghi điều kiện đó
trong spec của item:

1. một entry point/graph khác cần nó mà không cần phần còn lại (CLI, worker, chỉ API);
2. vòng đời hoặc provider riêng (ví dụ JWT, queue, scheduler);
3. contract công khai riêng được module khác tiêu thụ;
4. loại bỏ coupling có bằng chứng (ví dụ phá một `forwardRef` hoặc chu trình đo được).

Ví dụ hiện có đúng điều kiện 1: `OrganizationHttpModule`, `AuditHttpModule`, `IdentityAccessFacadeModule`,
`RecoveryModule`. Tách thành **bounded context mới** khi capability có bảng riêng, contract công khai riêng và nghiệp vụ
riêng; quyết định bằng ADR. `approval-roles` hoãn quyết định này tới thiết kế G3 (Q7); hiện không chuyển ownership bảng.

### Trách nhiệm từng loại file

- Controller: map HTTP/DTO/lỗi, khai báo quyền, operation ID và response; không chứa business logic, không import
  controller khác.
- Service: điều phối một use case, transaction và gọi facade module khác; ném lỗi nghiệp vụ, **không** dùng
  `ApiException`/`HttpStatus` — ánh xạ HTTP thuộc controller hoặc `*.http-errors.ts`.
- Repo (`*.repo.ts`): persistence duy nhất của bảng mình sở hữu; raw SQL chỉ ở đây.
- Mapper: tạo wire model; policy: rule thuần, test độc lập.
- Không generic base repository/service/controller, không scaffold hàng loạt khi chưa có Story.

### Liên module

Bề mặt công khai của module là **allowlist**, không phải mọi file ở root. Module khác và composition root chỉ import
file ở root module khác khớp: `<module>.module.ts`, `*-http.module.ts`, `*-facade.module.ts`, facade
`<module>.service.ts`, `*.types.ts`, `*.errors.ts`. Composition root (file trực tiếp trong `src/`) được import thêm đúng các
entry CLI liệt kê trong `CLI_ENTRY_FILES` của [architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts);
module khác thì không. Mọi file root khác, file trong subfolder, repo và credential hasher là private; không truy cập
bảng module khác.

**Một hợp đồng injectable công khai mỗi tệp (ROOT-HARDEN.1).** Mỗi tệp nguồn non-spec dưới `src/modules/**` export tối
đa **một** lớp `@Injectable` (lớp/interface/hàm helper private vẫn được). Một hợp đồng công khai thứ hai của module nằm ở
tệp root riêng, đăng ký **chính xác** trong `PUBLIC_ROOT_CONTRACT_FILES` của
[architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts) (cùng danh sách ở
`architecture-structure.spec.ts`), có consumer thật ngoài module và token ở `PUBLIC_CONTRACT_EXPORTS`. Không tệp module nào
re-export (`export ... from`). Gate đọc bằng parser TypeScript.

- **Đúng:** `notifications/notifications.service.ts` chỉ chứa `NotificationsService`; `notifications/email-delivery.service.ts`
  chứa `EmailDeliveryService` cho vòng gửi thư của worker; `identity-access-inspection.service.ts` và
  `local-demo-account.service.ts` cho hai lệnh vận hành.
- **Sai:** hai facade `@Injectable` công khai trong một `<module>.service.ts` để lọt qua quy tắc tên tệp.
- **Lách sai:** barrel hay `export { EmailDispatcher } from './email-dispatcher.service'` trong tệp công khai; allowlist chung
  cho mọi `*.service.ts` ở root; đăng ký một tệp không ai ngoài module dùng.

**Validation dùng chung là dùng chung policy ngữ nghĩa (BEH.1).** Khi hai workflow cần cùng một quyết định nghiệp vụ, chỉ
quyết định đó được dùng chung: một hàm thuần ở module sở hữu dữ liệu nghiệp vụ, nhận model tra cứu trung tính (không DTO
HTTP, tên cột file, row Prisma hay repo) và trả **mã lý do ngữ nghĩa** theo thứ tự xác định, không `field`/`column`. Mỗi
adapter (form, import, lệnh) tự ánh xạ lý do sang vị trí trình bày của mình và thêm lý do riêng của workflow (khóa đã có,
trùng trong file, ô khác) theo thứ tự của nó. Tệp policy dùng liên module ở root module, đăng ký chính xác trong
`PUBLIC_ROOT_POLICY_FILES` (cùng danh sách ở `architecture-boundaries.spec.ts`, `architecture-structure.spec.ts`), và
[policy-ownership.spec.ts](../../src/policy-ownership.spec.ts) giữ consumer chính xác, tính thuần (không class, decorator
hay import giá trị ngoài `src/core`) và việc mã lý do chỉ được viết trong policy (ngoại lệ là quyết định khác, liệt kê
chính xác kèm lý do).

- **Đúng:** `organization/employee-placement.policy.ts` trả `{ subject: 'DEPARTMENT', code: 'DEPARTMENT_INACTIVE' }`; form
  nhập tay ánh xạ thành `field: departmentCode`, preview import thành `column: department_code`; import vẫn so người đã
  có (`EXISTS_*`) trước khi gọi policy và giữ `EMPLOYEE_CODE_DUPLICATE_IN_FILE` của mình.
- **Sai:** policy trả tên cột CSV hay `field` của form; ép form nhập tay dùng outcome import `EXISTS_DIFFERENT`; làm hai
  đường giống nhau chỉ để dùng lại code khi Story không đòi.
- **Lách sai:** chép cùng thang `if`/`switch` lý do vào hai adapter; import validator private của module khác
  (`organization/employee/employee-row.validator.ts`) từ `data-import`; dồn mọi thứ vào `core/utils` hay
  `shared/common`; mở mọi `*.policy.ts` bằng hậu tố.

Nest module nghiệp vụ chỉ export **contract công khai**: facade, port nó hiện thực cho `infrastructure`, hoặc service của
module entry CLI — danh sách cặp `Module: token` chính xác trong `PUBLIC_CONTRACT_EXPORTS` của
[module-graph.spec.ts](../../src/module-graph.spec.ts). Token khác bị coi là private bất kể tên (ngoại lệ đang gỡ nằm
trong ledger, xem dưới).

## Lỗi

- Lỗi domain/application ở **capability sở hữu** (`<capability>/errors/` hoặc `<capability>.errors.ts`); helper/adapter
  nhỏ có thể khai lỗi riêng ngay cạnh mình khi chỉ chính nó ném. **Không** khai lớp lỗi trong service, controller hay repo.
- Mapper lỗi HTTP ở cùng capability hoặc lớp HTTP của bounded context (`*.http-errors.ts`); **không** đặt
  `ApiException`/`HttpStatus` trong tệp lỗi nghiệp vụ.
- Lỗi adapter kỹ thuật ở adapter sở hữu trong `src/infrastructure` (ví dụ `TransientDatabaseError`).
- Lỗi public liên module chỉ ở root module khi consumer thật sự phải bắt nó (ví dụ `PasswordPolicyError`).
- **Không** có `src/errors`, `src/common`, `src/shared` hay folder catch-all tương tự.
- **Không** có hai lớp hoặc hai mã lỗi đồng nghĩa ở root và `errors/` của cùng module.
- So khớp lỗi bằng `instanceof`, không bằng chuỗi `error.name` — trong toàn bộ `src` (module, `infrastructure`,
  composition root), trừ test và mã sinh.
- FE dùng **mã ổn định** (`DOMAIN.ACTION`), không branch theo message.
- Không log secret, token, credential; không biến lỗi hệ thống thành 401 giả — dependency không sẵn sàng là 503, lỗi
  không nhận diện được vẫn là 500 ([API contract](api-contract.md), [security](security-jobs.md)).

## Kích thước và tín hiệu review

Ngưỡng là **tín hiệu kiểm tra**, không phải lý do máy móc để chia nhỏ:

| Tín hiệu                                    | Ngưỡng                                                         | Hành động                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| File non-spec trong `src/`                  | > 400 dòng (gate); > 700 dòng (cấm)                            | Tách trước khi thêm; file trong ledger không được vượt cap                                                               |
| Unit spec trong `src/modules/**`            | > 400 dòng (gate, không ledger)                                | Tách theo use case; harness chung ở `test/support/` ([test guide](../../test/README.md#kích-thước-unit-spec-của-module)) |
| Tệp `test/support/**/*.ts`                  | > 400 dòng, gọi/import test hay assertion (gate, không ledger) | Fixture/harness thuần; assertion ở spec ([test guide](../../test/README.md#tệp-trong-testsupport-test-harden1))          |
| Controller ở root module                    | > 2 (gate)                                                     | Chia theo capability                                                                                                     |
| File non-spec ở root module                 | > 12 (gate)                                                    | Chia theo capability                                                                                                     |
| Độ sâu thư mục trong module                 | > 2 (gate)                                                     | Gộp lại hoặc tách capability                                                                                             |
| Service nhận > 6 dependency                 | review                                                         | Xem service có điều phối quá nhiều capability không                                                                      |
| Repo ghi > 1 aggregate hoặc nhiều nhóm bảng | review                                                         | Tách repo theo aggregate                                                                                                 |
| Capability không có owner rõ ràng           | review                                                         | Ghi owner trong spec của item; tách folder hoặc bounded context                                                          |

Ngoại lệ phải ghi lý do và người sở hữu remediation trong item. Refactor cấu trúc là thay đổi riêng, không gộp với thay
đổi hành vi.

## Gate và legacy ledger

| Gate                                                                                                                                                                                                                                                                                                                                                                                                          | Nơi enforce                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Core không import Nest/Prisma/SDK/`infrastructure`/`modules`                                                                                                                                                                                                                                                                                                                                                  | [architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts) |
| Liên module chỉ qua allowlist bề mặt công khai (+ entry CLI cho composition root); Prisma delegate và raw SQL chỉ trên bảng mình sở hữu                                                                                                                                                                                                                                                                       | [architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts) |
| Import chéo capability (gồm root module) chỉ tới contract đăng ký chính xác, registry không thừa/thiếu, controller → controller, folder catch-all, lỗi trong service/controller/repo, lỗi trùng tên, HTTP mapping trong tệp lỗi và trong business service, so khớp `error.name` trong toàn `src`, raw SQL ngoài repo, kích thước file và unit spec của module (`H8-RV-01`), số file/controller ở root, độ sâu | [architecture-structure.spec.ts](../../src/architecture-structure.spec.ts)   |
| Module nghiệp vụ chỉ export contract trong allowlist; provider không khai trùng                                                                                                                                                                                                                                                                                                                               | [module-graph.spec.ts](../../src/module-graph.spec.ts)                       |
| `test/support/**/*.ts` ≤ 400 dòng, không đăng ký test/hook/assertion, không import thư viện test, không tên giống spec (TEST-HARDEN.1, đọc bằng parser TypeScript)                                                                                                                                                                                                                                            | [test-support-structure.spec.ts](../../src/test-support-structure.spec.ts)   |
| Policy nghiệp vụ dùng chung có một chủ: mã lý do chỉ viết trong policy (ngoại lệ chính xác), policy thuần, consumer chính xác và có gọi, `PUBLIC_ROOT_POLICY_FILES` bằng nhau ở hai gate kiến trúc (BEH.1, đọc bằng parser TypeScript)                                                                                                                                                                        | [policy-ownership.spec.ts](../../src/policy-ownership.spec.ts)               |

Vi phạm có sẵn khi một gate ra đời nằm trong ledger: `LEGACY` của `architecture-structure.spec.ts`,
`LEGACY_PRIVATE_MODULE_IMPORTS` của `architecture-boundaries.spec.ts` và `LEGACY_PRIVATE_EXPORTS` của
`module-graph.spec.ts`. Mỗi mục là một file, cạnh import hoặc token **chính xác** (không wildcard, không regex theo thư
mục, không nới cap), kèm lý do tạm thời và lát sẽ gỡ nó — trong
[foundation-remediation-handoff-2026-10-18](../workspace/items/foundation-remediation-handoff-2026-10-18/spec.md) hoặc mục
9 của [audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md). Gate fail khi có vi phạm **mới** và cả
khi một mục ledger **không còn đúng** (vi phạm đã hết mà mục còn), nên ledger chỉ có thể co lại: lát gỡ vi phạm xóa đúng
mục của nó trong cùng thay đổi. Không thêm mục để làm xanh build; nếu buộc phải thêm, ghi lý do trong item và chờ
Owner/dev review. Allowlist (`CLI_ENTRY_FILES`, `PUBLIC_CONTRACT_EXPORTS`) và registry `INTRA_MODULE_CONTRACTS` chỉ đổi
khi contract thật sự đổi, cũng qua review; registry không phải ledger — mục mất consumer phải xóa. Gate không chứng minh
thiết kế đúng — review vẫn bắt buộc.

Ranh giới nội module có **chiều** (GATE2-02): capability hoặc root dùng thư mục dùng chung cấp module (`dto/`, `errors/`,
`mappers/`, `policies/`) tự do, và các thư mục dùng chung dùng lẫn nhau; nhưng một file trong thư mục dùng chung đọc vào
capability hoặc root là **vượt ranh giới** như mọi phần khác — đích phải là bề mặt public ở root hoặc mục chính xác của
`INTRA_MODULE_CONTRACTS`; hậu tố tên file không mở gì, chỉ `*.module.ts` ghép mọi provider. Đúng:
`identity-access/mappers/account.http-errors.ts` → `accounts/account.errors.ts` (lỗi của capability là contract mà mapper
HTTP dùng chung của route `accounts` và `auth` ánh xạ, đã đăng ký). Sai: một mapper hay policy dùng chung import
`accounts/app-user.repo.ts` hoặc một helper/type riêng của capability — dời file đó về capability sở hữu hoặc dùng
contract công khai nhỏ nhất đã có.

## Ví dụ đích và trạng thái chuyển tiếp

`organization` đích theo capability `cost-center/`, `department/`, `project/`, `job-title/`, `employee/`; root giữ
module, HTTP module, facade, type và lỗi public; `normalizeDisplayName` và `Page<T>`/`pageOf` ở `src/core` (Q6).
**Sau Wave 3 (H4.6, H4.7):** cả năm capability đã tách; root còn 6 file, 0 controller (`organization.repo.ts` chỉ còn
Organization); `dto/` và `mappers/` chỉ giữ nội dung ít nhất hai capability dùng. Repo Job Title, Employee, Department
Head là provider riêng của `OrganizationModule` sau capability service mà chỉ facade dùng; use case HTTP gọi facade (E4
giữ ba repo export — ngoại lệ ledger duy nhất còn lại của `organization`, xem lại ở G3).
**Sau Identity Access Wave A (H5.0 → H5.4):** `identity-access` giữ `auth/`, `accounts/`, `approval-roles/`, `access/`;
DTO, lỗi, mapper HTTP và policy của một capability nằm phẳng trong capability đó (ví dụ `auth/auth.errors.ts`,
`access/me.dto.ts`, `approval-roles/approval-role.http-errors.ts`); `dto/`, `mappers/` (`auth.http-errors.ts`,
`account.http-errors.ts`) và `policies/account-policy.ts` chỉ giữ nội dung có ít nhất hai capability dùng; không còn
`errors/`.
**Sau Identity Access Wave B (H5.5 → H5.7):** theo E5–E7 của
[audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md), không đổi contract. Ledger
`crossCapabilityImports` rỗng; không còn mục identity-access trong `LEGACY_PRIVATE_EXPORTS`. `accounts` sở hữu một repo
mỗi aggregate (`app-user`, `credential`, `role-grant`, `action-token`) sau bốn contract service export bởi
`IdentityAccessFacadeModule`; chu trình capability bị cắt bằng hai port bind `useExisting`: `ACCOUNT_SESSIONS` (consumer
`accounts` và `recovery`, `auth` hiện thực) ở `identity-access.ports.ts` từ GATE.2, `APPROVAL_ROLE_HOLDINGS` (consumer
duy nhất `accounts`, `approval-roles` hiện thực) ở `accounts/account.types.ts`. Lệnh khôi phục ở `recovery/` (entry
`HolderRecoveryService`, `RoleTransferRecoveryService`); root 7 file, 0 controller: module, facade module, facade,
type, lỗi public, port dùng chung và `recovery.module.ts`. Provider dùng cho cả API và lệnh khôi phục mà
facade không cần khai ở cả `IdentityAccessModule` và `RecoveryModule` (E6), ghim bằng danh sách chính xác trong
[module-graph.spec.ts](../../src/module-graph.spec.ts).
**Lệnh vận hành H6.1/H6.2 (E8 = A):** `installation` giữ root (cài đặt) và hai capability `inspect/` (`ops:inspect`) và
`dev-seed/` (`dev:seed`), mỗi capability có Nest module riêng làm entry của lệnh (điều kiện "một entry point/graph khác"),
không module `operations` chung. Hai hợp đồng hẹp của `identity-access` (`IdentityAccessInspectionService`,
`LocalDemoAccountService`) ở hai tệp root riêng `identity-access-inspection.service.ts`, `local-demo-account.service.ts` (ROOT-HARDEN.1), khai trong hai `*-facade.module.ts` chỉ đồ thị lệnh nạp; quy tắc
riêng của lệnh ở [operational commands](operational-commands.md).
**Sau Data Import Wave (H8.1 → H8.3):** `data-import` giữ một capability `employee-import/` (controller, service điều
phối, repo duy nhất của `employee_imports`/`employee_import_rows`, đọc file thuần, quy tắc dòng và so judgement, builder
audit, type, DTO, lỗi và mapper HTTP `employee-import.http-errors.ts` cạnh nhau; không `dto/` một file, không Nest
submodule). Root 3 file non-spec: module, facade `DataImportService` (một method `latestEmployeeImport` cho
onboarding) và `data-import.types.ts`; facade là export liên module duy nhất (`DataImportModule: DataImportService`);
service capability là contract nội module đăng ký vì facade đọc qua nó. Không còn mục `data-import` trong ledger nào;
`Page<T>` dùng bản core. Hai đường kiểm dòng (import và nhập tay) dùng chung đúng một quyết định — điều kiện phòng/chức
vụ của `organization/employee-placement.policy.ts` — và giữ phần còn lại riêng (H8 D-1 → D-4,
[`beh1-employee-row-validation-ownership`](../workspace/items/beh1-employee-row-validation-ownership/spec.md), A4-11).
