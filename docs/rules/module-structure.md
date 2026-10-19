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
  module khác thật sự phải bắt); entry point của capability có entry riêng (ví dụ `recovery.*` của lệnh `ops:recover`,
  giữ ở root theo Q6). Không biến root thành nơi chứa mọi controller/service/repo.
- **Root module không phải vùng public mặc định.** Trong cùng module, root là một phần như capability: file root không
  import file private của capability, capability không import file private ở root (ví dụ repo). Chỉ file Nest module
  (`*.module.ts`) được ghép mọi provider của module mình.
- **Folder dùng chung cấp module** (`dto/`, `errors/`, `mappers/`, `policies/` ở root module) chỉ cho nội dung mà ít nhất
  hai capability cùng dùng; nội dung của một capability nằm trong folder của capability đó.

### Ownership của capability folder

Mỗi capability folder sở hữu controller, service, repo cho aggregate/bảng của mình, cùng `dto/`, `errors/`, `mappers/`,
`policies/` của nó. Mỗi bảng có **một** repo ghi trong module. Capability khác trong **cùng** module chỉ dùng bề mặt công
khai của capability đó: `*.service.ts` và `*.types.ts` (trừ `password-hasher.service.ts`); **không** import repo,
controller, http-errors, policy hay helper riêng của nó. Cần nhiều hơn thì đưa contract lên root/folder dùng chung hoặc
tách service — ghi lý do trong spec của item.

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

| Tín hiệu                                    | Ngưỡng                              | Hành động                                                       |
| ------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| File non-spec trong `src/`                  | > 400 dòng (gate); > 700 dòng (cấm) | Tách trước khi thêm; file trong ledger không được vượt cap      |
| Controller ở root module                    | > 2 (gate)                          | Chia theo capability                                            |
| File non-spec ở root module                 | > 12 (gate)                         | Chia theo capability                                            |
| Độ sâu thư mục trong module                 | > 2 (gate)                          | Gộp lại hoặc tách capability                                    |
| Service nhận > 6 dependency                 | review                              | Xem service có điều phối quá nhiều capability không             |
| Repo ghi > 1 aggregate hoặc nhiều nhóm bảng | review                              | Tách repo theo aggregate                                        |
| Capability không có owner rõ ràng           | review                              | Ghi owner trong spec của item; tách folder hoặc bounded context |

Ngoại lệ phải ghi lý do và người sở hữu remediation trong item. Refactor cấu trúc là thay đổi riêng, không gộp với thay
đổi hành vi.

## Gate và legacy ledger

| Gate                                                                                                                                                                                                                                                                                                       | Nơi enforce                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Core không import Nest/Prisma/SDK/`infrastructure`/`modules`                                                                                                                                                                                                                                               | [architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts) |
| Liên module chỉ qua allowlist bề mặt công khai (+ entry CLI cho composition root); Prisma delegate và raw SQL chỉ trên bảng mình sở hữu                                                                                                                                                                    | [architecture-boundaries.spec.ts](../../src/architecture-boundaries.spec.ts) |
| Import chéo capability (gồm root module), controller → controller, folder catch-all, lỗi trong service/controller/repo, lỗi trùng tên, HTTP mapping trong tệp lỗi và trong business service, so khớp `error.name` trong toàn `src`, raw SQL ngoài repo, kích thước file, số file/controller ở root, độ sâu | [architecture-structure.spec.ts](../../src/architecture-structure.spec.ts)   |
| Module nghiệp vụ chỉ export contract trong allowlist; provider không khai trùng                                                                                                                                                                                                                            | [module-graph.spec.ts](../../src/module-graph.spec.ts)                       |

Vi phạm có sẵn khi một gate ra đời nằm trong ledger: `LEGACY` của `architecture-structure.spec.ts`,
`LEGACY_PRIVATE_MODULE_IMPORTS` của `architecture-boundaries.spec.ts` và `LEGACY_PRIVATE_EXPORTS` của
`module-graph.spec.ts`. Mỗi mục là một file, cạnh import hoặc token **chính xác** (không wildcard, không regex theo thư
mục, không nới cap), kèm lý do tạm thời và lát sẽ gỡ nó — trong
[foundation-remediation-handoff-2026-10-18](../workspace/items/foundation-remediation-handoff-2026-10-18/spec.md) hoặc mục
9 của [audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md). Gate fail khi có vi phạm **mới** và cả
khi một mục ledger **không còn đúng** (vi phạm đã hết mà mục còn), nên ledger chỉ có thể co lại: lát gỡ vi phạm xóa đúng
mục của nó trong cùng thay đổi. Không thêm mục để làm xanh build; nếu buộc phải thêm, ghi lý do trong item và chờ
Owner/dev review. Allowlist (`CLI_ENTRY_FILES`, `PUBLIC_CONTRACT_EXPORTS`) chỉ mở rộng khi contract công khai thật sự đổi,
cũng qua review. Gate không chứng minh thiết kế đúng — review vẫn bắt buộc.

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
`errors/`. Root 10 file, 0 controller: module, facade module, facade, type, lỗi public (`PasswordPolicyError`) và
`recovery.*` làm entry CLI (Q6). Wave B (H5.5 → H5.7) gỡ các cạnh `crossCapabilityImports` còn lại và chu trình auth ↔
accounts theo E5–E7 của [audit H4.0](../reviews/be-full-src-architecture-audit-2026-10-19/README.md), không đổi contract.
