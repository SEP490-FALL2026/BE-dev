# ADR-0019: Tầng module, cửa `public/` và extension point thống nhất

## Trạng thái

**Accepted — Owner chấp nhận ngày 31/10/2026**, qua xác nhận trực tiếp "ADR-0019 thì tui accept nha" sau khi được bàn giao
tóm tắt và kết quả Prompt 09. Bao gồm quy tắc nhóm chức năng (mục 3) và chi tiết extension point (mục 5).
Acceptance thiết kế này không thay thế walkthrough O7 hoặc kiểm thử nghiệp vụ; O7 vẫn chưa có kết quả người thật.

Lịch sử: Owner chốt `OD-A1` → `OD-A8` của
[be-architecture-boundaries-restructure](../workspace/items/be-architecture-boundaries-restructure/spec.md) theo đề xuất
ngày 28/10/2026; triển khai 29/10/2026 và bổ sung R1–R10 trong
[be-architecture-readability-hardening](../workspace/items/be-architecture-readability-hardening/spec.md) (30–31/10/2026).
Ngày 29/10/2026 Owner chấp nhận ba sai khác của lượt triển khai
([nghiệm thu](../reviews/be-architecture-test-acceptance-2026-10-29/README.md)): capability trong cùng module được import
nhau (S5, O1), `Dockerfile` chép `scripts/build` ở stage build để sinh alias lệnh (S12, O2) và ba văn bản OpenAPI rút gọn
(S13, O3). ADR giữ Proposed (`OD-R7`) tới trước xác nhận ngày 31/10/2026 ở trên; hai phần còn lại từng chờ Owner
review nay đã được chấp nhận. Thay một phần
[ADR-0003](0003-flat-feature-module-layout.md) (layout phẳng, độ sâu ≤ 2, allowlist file gốc).
[ADR-0001](0001-modular-monolith.md) giữ nguyên: vẫn một modular monolith.

## Bối cảnh

Audit 28/10/2026 (BE `c49a7dd`): 1 028 file production trong 9 ngày, 54 loại hậu tố file, thư mục 91 file một cấp, một
cặp module import hai chiều (`organization` ↔ `identity-access`), ~20 lớp `Registered*`/`Refusing*` gắn bằng
`register*()` lúc chạy, và bộ gate tự viết 7 371 dòng cùng các ledger ngoại lệ. Gate "độ sâu ≤ 2" và "> 400 dòng" ép
code thành thư mục phẳng và file cắt theo chữ cái. Người đọc không lần được luồng của một route nếu không có AI.

## Quyết định

1. **Tầng module cố định** (bảng ở [module structure](../rules/module-structure.md#tầng-module), nguồn
   `scripts/arch/tiers.cjs`): module chỉ import tầng thấp hơn hoặc cạnh cùng tầng có ghi. Gỡ cặp hai chiều bằng
   `EmployeeAccountsHook` do `organization` mở, `identity-access` bind.
2. **Một cửa công khai mỗi module:** `public/` (facade `<M>Api` trong `<x>.api.ts`, type, lỗi, extension point) cộng các
   `*.module.ts`. Import thẳng file trong `public/`, không barrel (`OD-A4`). Facade đổi tên `XService` → `XApi`
   (`OD-A6`); một module được mở nhiều facade, mỗi facade ≤ 8 phụ thuộc.
3. **Tổ chức theo capability, nhóm chức năng khi cần:** tối đa 2 cấp thư mục dưới module, 25 file mỗi thư mục
   (`OD-A2`). Capability trong cùng module được import nhau (S5) nhưng không theo vòng (R6). Thư mục con của capability là
   một nhóm chức năng — một use case hoặc một phần chung như bảng luật — gọi qua điểm vào
   `<…>-<nhóm>.service|policy|types.ts` từ bất kỳ file nào của capability; phần còn lại của nhóm riêng tư; ngoài capability
   chỉ Nest module và `public/` thấy nhóm. Bản đầu (chỉ Nest module và `public/` được import thư mục use case) chặn
   controller của capability điều phối sang các nhóm, nên được thay ngày 29/10/2026; gate: `group-is-private`,
   `group-entry-from-capability`, `group-entry-from-sibling`. **Owner: Accepted, 31/10/2026.**
4. **Từ vựng 14 hậu tố** thay 54 loại; vai trò đọc được từ tên file.
5. **Ba kiểu extension point** ở `src/core/extension/`: `Hook` (một hiện thực, ném lỗi có tên khi chưa bind), `Listeners`
   (0..n, trong transaction của bên phát), `Contributions` (0..n trả giá trị). Mỗi điểm là một provider Nest — một instance
   mỗi app — thay lớp chuyển tiếp tự viết. Một graph tiến trình thiếu bên đăng ký mà nó cần bị gate `extension-wiring`
   chặn (R1), không còn cơ chế giá trị thay thế khai tại chỗ. **Owner: Accepted, 31/10/2026.**
6. **Gate bằng công cụ chuẩn:** dependency-cruiser (`OD-A3`) cho import, ESLint cho kích thước/độ phức tạp, vài gate
   tĩnh ngắn ở `test/gates/` (`OD-A8`); bỏ ledger cấu trúc (xem mục "Luật đã triển khai"). Gốc `src/` chỉ còn ba điểm vào
   và `app/`, `worker/`, `cli/`; lệnh CLI có một điểm vào `dist/cli.js` và alias `dist/<tên>-cli.js` sinh lúc build (`OD-A7`).

OD-S3 exception to OD-A7 (Owner 04/11/2026): demo-dataset/dev-seed and their aliases are removed during unified seed rollout; the rebuilt demo VPS uses seed.sh. This does not add an extension-wiring exception.

## Luật đã triển khai (R1–R10)

Mỗi luật có một câu ở [module structure](../rules/module-structure.md) và một gate; luật không có máy kiểm ghi "review".

| #   | Luật                                                                                                                                                | Gate                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R1  | Mỗi graph tiến trình (API, worker, mọi lệnh có Nest graph) có mặt đủ bên đăng ký của extension point mà nó dùng; ngoại lệ ghi kèm lý do             | `extension-wiring` (`PROCESS_GRAPHS` ở `test/support/process-graphs.ts`) |
| R2  | Client của một transaction chạy một truy vấn một lúc: không `Promise.all`/`allSettled`/`race`/`any` trên `tx`                                       | `module-layout`                                                          |
| R3  | Không thư mục tên tầng kỹ thuật (`mappers`, `dto`, `services`, `repos`, `types`, `errors`…) ở bất kỳ cấp nào dưới module                            | `module-layout`                                                          |
| R4  | `*.api.ts` và `*.extension-points.ts` chỉ nằm trong `public/`; mỗi facade export đúng một lớp `<X>Api`                                              | `module-layout`                                                          |
| R5  | Gốc module có thư mục capability chỉ giữ `README.md`, `*.module.ts` và file dùng chung mang tên module                                              | `module-layout`                                                          |
| R6  | Capability trong một module không import nhau theo vòng, ở mọi module; capability không import facade của chính module                              | `capability-graph`, `module-layout`; `pnpm arch:capabilities`            |
| R7  | `src/core` chỉ giữ primitive ít nhất hai vùng dùng; ngoại lệ có lý do, danh sách chỉ thu hẹp (hiện `core/money/convert.ts`)                         | `capability-graph` (TG-9); `pnpm arch:capabilities --core`               |
| R8  | ESLint `complexity` 12, `max-lines-per-function` 60, `max-params` 8 là `error`; nợ cũ nằm ở `eslint-suppressions.json`, chỉ giảm, `max-params` về 0 | `lint-debt` (TG-2), `pnpm lint`                                          |
| R9  | Cỡ spec: unit trong module ≤ 400 dòng; `test/integration`, `test/http`, `test/e2e` ≤ 800 dòng; `test/support` ≤ 400 dòng                            | `module-layout`, `test-size`, `test-support-structure`                   |
| R10 | Export của Nest module nghiệp vụ ngoài danh sách hợp đồng công khai chỉ hợp lệ khi mọi consumer (theo DI metadata của mọi graph) ở cùng thư mục     | `module-graph` (`test/support/module-export-consumers.ts`)               |

Ngoài R1–R10: dependency trong `dependencies` phải gồm mọi package `src` import lúc chạy (gate `deployment-roles`, TG-3); comment
trong `src` nói lý do, không nói mã finding hay lát (`node scripts/arch/comment-codes.mjs` chỉ in, **review**).

**"Bỏ ledger" đúng ở nghĩa sau:** không còn ledger cấu trúc ngoại lệ cũ (`LEGACY.*`, `LEGACY_PRIVATE_EXPORTS`, registry hợp đồng
gốc, allowlist import chéo). Còn lại là các danh sách ngắn, mỗi mục có lý do, chỉ thu hẹp: `GRAPH_WIRING_EXCEPTIONS`,
`CORE_PRIMITIVES_OF_ONE_AREA`, `REQUESTS_CONTROLLER_IMPORTED` (tiêu chí thay thế của Task 4.3, Owner chấp nhận 31/10/2026: một
quyết định về tiêu chí, không phải Owner review của ADR này), `PUBLIC_CONTRACT_EXPORTS` và số đếm nợ lint
(`eslint-suppressions.json`), cùng ngoại lệ Owner E4 (ba repo `organization` export cho `OrganizationHttpModule`, qua R10).

## Sai khác đã chấp nhận

Sai khác giữa thiết kế ban đầu của ADR này và bản triển khai, chép từ
[nghiệm thu §1](../reviews/be-architecture-test-acceptance-2026-10-29/README.md#1-sai-khác-so-với-thiết-kế-adr-0019), kèm trạng
thái hiện tại. Quyết định của Owner (29/10/2026): **O1** chấp nhận S5; **O2** chấp nhận S12; **O3** chấp nhận S13.

| #   | Sai khác                                                                                                     | Lý do                                                                                                                                        | Đánh giá                                                       |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| S1  | `Hook` là provider Nest (một instance mỗi app) thay vì hằng số cấp module                                    | Hằng số dùng chung giữa nhiều app trong cùng tiến trình test, app thứ hai `bind` sẽ ném lỗi                                                  | Giữ                                                            |
| S2  | Thêm cơ chế khai giá trị thay thế tại chỗ cho `Hook` chưa bind                                               | Thay lớp "Refusing" ẩn khi graph CLI hợp lệ thiếu bên đăng ký                                                                                | **Đã gỡ** (0 điểm dùng); gate `extension-wiring` (R1) thay thế |
| S3  | Thêm kiểu thứ ba `Contributions<T>`                                                                          | 6 điểm mở trả về giá trị (use readers, blocker/warning của offboarding, notice recorder, personnel file hooks)                               | Giữ                                                            |
| S4  | `requests` có 23 capability ngang hàng; 13 thư mục use case được nâng thành capability                       | Use case của `requests` dùng chéo nhau; quy tắc "use case riêng tư" sẽ vi phạm nếu giữ lồng                                                  | Giữ; đo lại khi xét tách `spend` (`OD-A5`)                     |
| S5  | Capability trong cùng module được import nhau (bỏ allowlist A4-01/GATE.2 cũ)                                 | Allowlist ~100 file là "ledger" spec muốn bỏ; ranh giới chặn ở cửa `public/` (giữa module) và điểm vào của nhóm chức năng (trong capability) | Owner chấp nhận 29/10/2026 (O1); thêm R6: không vòng           |
| S6  | `*.module.ts` là cửa hợp lệ ngoài `public/`; spec unit được nhìn vào module khác                             | Nest DI phải import module; spec hộp trắng đã được miễn ở gate cũ                                                                            | Giữ                                                            |
| S7  | `*.extension-points.ts` được khai nhiều provider `@Injectable`                                               | Mọi điểm mở của một module nằm một chỗ; mỗi class một dòng                                                                                   | Giữ                                                            |
| S8  | `app/configure-application.ts` một file (spec định tách hai)                                                 | 74 dòng, tách không tăng độ rõ                                                                                                               | Giữ                                                            |
| S9  | Sơ đồ module là Mermaid (`docs/generated/module-graph.md`) thay vì SVG                                       | Không cần Graphviz, GitHub vẽ được, `--check` trong `pnpm check`                                                                             | Giữ                                                            |
| S10 | ESLint một ngưỡng `max-lines` 500 ở mức `warn` + trần tổng `--max-warnings 229`, thay cho warn 300/error 500 | Một rule không có hai mức; trần tổng chặn số cảnh báo tăng mà không ép sửa hàng loạt hàm nghiệp vụ                                           | **Đã thay** bằng R8: mọi rule là `error`, nợ ở suppressions    |
| S11 | `test-support-structure` giữ là gate trong `test/gates/` (spec định chuyển sang ESLint)                      | Gate đọc bằng parser TypeScript đã đúng và có self-test; ESLint không có rule tương đương sẵn                                                | Giữ                                                            |
| S12 | `Dockerfile` thêm `COPY scripts/build` cho bước build (spec: không chạm Dockerfile)                          | `pnpm build` sinh alias CLI cần script đó trong image builder; đường chạy không đổi                                                          | Owner chấp nhận 29/10/2026 (O2)                                |
| S13 | Ba văn bản OpenAPI đổi (summary 73 ký tự, hai message > 160 ký tự)                                           | Test `api-inventory` đỏ sẵn ở mốc; mã lỗi giữ nguyên, message của lệnh vận hành vẫn nêu lệnh đó                                              | Owner chấp nhận 29/10/2026 (O3)                                |

## Hệ quả

- Thứ tự đọc của một route: [routes](../generated/routes.md) → controller → service → repo; luồng ngược đọc trong module
  card. Hướng dẫn cho dev mới: [huong-dan-dev-moi](../guides/huong-dan-dev-moi.md).
- Thêm cạnh module ngược tầng phải sửa `tiers.cjs` và ADR này, không thể lách bằng ledger.
- `requests` có ~36 capability ngang hàng vì các use case của nó dùng chéo nhau, nay không vòng (R6) và có bảng tầng riêng
  trong [module structure](../rules/module-structure.md); tách module `spend` vẫn để sau (`OD-A5`).
- Ngưỡng ESLint là `error`; số nợ còn lại và trần của nó ở [module structure](../rules/module-structure.md#kích-thước-và-độ-phức-tạp).
