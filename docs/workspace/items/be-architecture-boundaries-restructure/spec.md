# Spec: tái cấu trúc ranh giới modular monolith cho người đọc

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc BE, mỗi phase một người sở hữu module đang chuyển).
- Thiết kế ban đầu bởi: AI theo yêu cầu Owner (28/10/2026) — audit tĩnh source, không chạy test (Owner không cho chạy).
- Thiết kế: `draft`. Owner review: chưa review toàn spec. Owner chốt `OD-A1` → `OD-A6` ngày 28/10/2026, cả sáu theo đề xuất;
  cùng ngày Owner đổi `OD-A1`: dừng giao tính năng mới tới khi refactor xong. Bổ sung 28/10/2026: thiết kế gốc `src/`
  (D11); Owner chốt `OD-A7`, `OD-A8` theo đề xuất cùng ngày — mục _Owner decisions_.
- Nguồn: Docs `578f442` (BRD v3.57), BE `c49a7dd` (working tree sạch lúc audit). ADR liên quan: 0001, 0003, 0013, 0015–0018.
- Nhóm roadmap: xuyên module — `technical-enabler`, không thuộc nhóm G (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Hạng mục anh em: [thiết kế lại test](../be-test-architecture-redesign/spec.md).

## Business outcome

Sau hạng mục này một dev mới đọc được luồng của bất kỳ route nào mà không cần AI: từ URL tìm ra controller → use case →
policy → repo trong tối đa ba bước điều hướng, mỗi module có một trang mô tả ngắn, và máy chặn mọi phụ thuộc trái chiều.
Kiểm bằng: `dependency-cruiser` 0 vi phạm, không còn ledger ngoại lệ, OpenAPI export không đổi byte nào, toàn bộ test xanh.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner ngày 28/10/2026 (audit kiến trúc BE sau đợt remediation `c49a7dd`).
- Mode: `technical-enabler`.
- Outcome and owner: quy ước cấu trúc mới + công cụ kiểm phụ thuộc + di chuyển từng module; sở hữu bởi
  `docs/rules/module-structure.md`, `ARCHITECTURE.md` và từng module được chuyển.
- Boundaries: chỉ di chuyển file, đổi tên, tách/gộp file và thay cơ chế đăng ký hook; **không** đổi route, DTO, mã lỗi, SQL,
  migration, transaction hay thứ tự khóa. Mỗi PR là refactor giữ hành vi.
- Not larger: không đổi hành vi nghiệp vụ, không tách deployable, không thay ORM, không đổi contract FE/Mobile.
- Not smaller: quy ước, gate và di chuyển phải đi cùng nhau; quy ước không có gate sẽ trôi lại như hiện nay, gate không có
  di chuyển chỉ sinh thêm một ledger mới.
- Siblings: `be-test-architecture-redesign` (lưới an toàn phải có trước Phase 2).
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                            |
| ----- | --------- | -------- | --------------------------------------------------------------------------------------------- |
| —     | `ARCH-R1` | n/a      | gỡ chặn mọi hạng mục capability mới sau G6 (`be-test-architecture-redesign` dùng cùng layout) |
| —     | `ARCH-R2` | n/a      | gỡ chặn `be-test-architecture-redesign` Phase T2 (context test theo module)                   |

`ARCH-R1` = quy ước layout/tầng + gate; `ARCH-R2` = cơ chế extension point thống nhất và module card.

## Supporting references

- ADR-0001 (modular monolith — vẫn đúng, giữ nguyên), ADR-0003 (layout phẳng — bị thay một phần), ADR-0013/0015/0016/0017
  (ranh giới catalog/finance/licensing, requests, budgets, personnel — giữ nguyên ranh giới, chỉ đổi cách tổ chức bên trong).
- `docs/rules/module-structure.md` (ngưỡng 400 dòng, độ sâu 2, allowlist file gốc, legacy ledger) — sẽ được viết lại.
- Báo cáo ngoài repo `Docs/CI-CD/Test-Optimization-and-Redesign-Guide.md` — chỉ liên quan phần test, xem hạng mục anh em.

## Explicit out of scope

- Microservice, tách database, message broker, CQRS/Event sourcing: không cần cho quy mô 100–500 người (BRD 3.4, ADR-0001).
- Thay Prisma hay bỏ raw SQL: 256 lời gọi raw SQL ở 68/114 repo là có chủ đích (ADR-0005); chỉ quy định chỗ đặt.
- Viết lại nghiệp vụ, đổi schema, sửa bug hành vi: phát hiện trong lúc chuyển thì ghi thành hạng mục riêng.
- Thiết kế lại test: thuộc `be-test-architecture-redesign`.

## Dependencies and blockers

- **Chặn mọi thay đổi trong `src/`, `package.json`, `scripts/`** tới khi script bootstrap đang làm ở phiên khác
  (`scripts/ops/bootstrap-installation.sh`, `src/installation-cli.ts`, `src/modules/installation/*`, `.env.bootstrap.example`)
  được commit: nó sửa đúng các file Phase 1b di chuyển và gọi `node dist/installation-cli.js`, `dist/inspect-cli.js`.
- Phase 2 trở đi **chặn** tới khi `be-test-architecture-redesign` Phase T1–T3 xanh: hiện integration và HTTP test đều tắt
  trong CI (`if: ${{ false }}`), nên refactor lúc này không có lưới an toàn.
- `OD-A1` (Owner, 28/10/2026, lần 2): **không giao tính năng mới tới khi refactor xong**. Thứ tự: script bootstrap commit →
  test T0–T3 song song với kiến trúc Phase 0–1b → Phase 2–5. Không có hạng mục tính năng chạy song song nên không có xung
  đột merge theo module.

## Ownership: module, data, API

Chạm mọi thư mục `src/modules/*`, `src/core`, `src/infrastructure` ở mức file/thư mục; 33 file ở gốc `src/` (D11);
`docs/rules/module-structure.md`, `docs/rules/operational-commands.md`, `ARCHITECTURE.md`, `AGENTS.md`; script `build` trong
`package.json` (sinh alias CLI). Không chạm bảng, migration, route, schema OpenAPI, `Dockerfile`, compose hay script deploy —
đường dẫn `dist/main.js`, `dist/worker.js`, `dist/<tên>-cli.js` giữ nguyên.

## Audit hiện trạng

Số liệu đo tĩnh trên BE `c49a7dd` ngày 28/10/2026 (script đếm file/dòng/import; không chạy test).

### Kết luận ngắn

**Vẫn là monolith và nên giữ là monolith** (một codebase, một PostgreSQL, API + worker + CLI cùng image — ADR-0001 đúng).
Vấn đề không phải "monolith" mà là **monolith bị phân mảnh**: module có tên nhưng ranh giới rò, bên trong module quá phẳng
và quá vụn, wiring ẩn ở runtime, và tri thức nằm trong văn xuôi dài chỉ AI đọc nổi. So với trước thì khó kiểm soát hơn rõ:

| Mốc (git)       | File production `src/` (không spec, không generated) | File test | Module nghiệp vụ |
| --------------- | ---------------------------------------------------- | --------- | ---------------- |
| 19/10 `895b729` | 252                                                  | 72        | 9                |
| 23/10 `2bb130c` | 485                                                  | 165       | 11               |
| 28/10 `c49a7dd` | 1 028 (112 538 dòng)                                 | 381       | 14               |

Gấp 4 lần trong 9 ngày, phần lớn do AI sinh; không có người nào trong nhóm đọc hết được tốc độ này.

### Điểm tốt phải giữ

- Facade giữa module, cấm đọc bảng của module khác, `TransactionRunner` + `DbTx` cho ghi xuyên module.
- 80 file `*.policy.ts` thuần (không Nest, không DB) và **cả 80 đều có unit spec**.
- Ràng buộc dữ liệu đặt ở PostgreSQL (ADR-0005), Zod contract, mã lỗi ổn định, đồ thị API/worker/CLI tách riêng.
- Đồ thị module ở mức package **gần như là DAG** — chỉ một cặp hai chiều (xem D5). Tức là nền móng đúng; cần dọn, không cần
  đập đi.

### Các vấn đề (có bằng chứng)

| Mã  | Vấn đề                                     | Bằng chứng                                                                                                                                                                                                                                                                                                                                                              | Hệ quả cho người đọc                                                                      |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | Một module chiếm 1/4 hệ thống              | `requests`: 228 file, 28 006 dòng, 18 controller, 80 service; `licensing` 121 file, `personnel` 122, `catalog` 111                                                                                                                                                                                                                                                      | Không ai giữ được mô hình trong đầu                                                       |
| D2  | Thư mục phẳng quá lớn                      | `requests/access-request/` 91 file một cấp, `spend/` 52, `group-request/` 40                                                                                                                                                                                                                                                                                            | Tìm file chỉ bằng đoán tên                                                                |
| D3  | Rule ép hình dạng code                     | Gate "độ sâu ≤ 2" gây ra D2; gate cứng "> 400 dòng" làm 19 file dừng ở 360–400 dòng, tách theo chữ cái (`openapi-example-route-codes-a-l.ts` / `-m-z.ts`), `licensing.types.ts` tách thành 6 file `licensing-*.types.ts`                                                                                                                                                | File bị cắt theo con số, không theo ý nghĩa                                               |
| D4  | Từ vựng file quá nhiều                     | 54 loại hậu tố (`service`, `repo`, `policy`, `reader`, `source`, `recorder`, `hook`, `wire`, `support`, `state`, `arguments`…), 111 file không có hậu tố loại                                                                                                                                                                                                           | Không đoán được vai trò file từ tên                                                       |
| D5  | Phụ thuộc hai chiều                        | `organization` → `identity-access` (4 file: `department*.service.ts`, `organization-http.module.ts`) trong khi `identity-access` → `organization` 31 import                                                                                                                                                                                                             | Không xếp được thứ tự đọc/sửa                                                             |
| D6  | Wiring ẩn ở runtime                        | ~20 loại `register*()` ở 26 file (`registerGrantRequestGate`, `registerOutcomeListener`, `registerDepartmentUseReader`…), mỗi loại một lớp chuyển tiếp riêng (`RegisteredGrantRequestGate`), gán trong `onModuleInit`; thiếu đăng ký thì âm thầm từ chối (`RefusingGrantRequestGate`). ADR-0001 hứa "in-process events" nhưng không có                                  | "Go to definition" dừng ở lớp chuyển tiếp; luồng thật chỉ thấy khi chạy                   |
| D7  | Fan-in/fan-out lớn                         | `requests` import 9 module, `personnel` 9; 60 cạnh có hướng giữa 14 module; `LicensingService` 16 dependency, 5 service khác ≥ 11 (rule hiện hành chỉ "review" khi > 6)                                                                                                                                                                                                 | Mỗi use case phải đọc nhiều module cùng lúc                                               |
| D8  | Bộ máy quản trị nặng hơn code              | 7 371 dòng spec gate ở `src/*.spec.ts` (`api-collection-contract` 2 773, `architecture-structure` 1 321, `architecture-boundaries` 842, `module-graph` 737); 4 293 dòng script; `check-rules.mjs` kiểm cả cấu trúc Markdown; `docs/` 8 MB Markdown, 121 work item                                                                                                       | Người sửa phải học quy trình trước khi học code                                           |
| D9  | Tài liệu kiến trúc không đọc được bằng mắt | `ARCHITECTURE.md` 137 KB, có dòng 8 838 ký tự; `AGENTS.md` có dòng 7 499 ký tự                                                                                                                                                                                                                                                                                          | Chỉ AI đọc nổi — trái mục tiêu Owner                                                      |
| D11 | Gốc `src/` không có điểm bắt đầu đọc       | 33 file, 8 500 dòng nằm chung: 2 điểm vào tiến trình (`main.ts`, `worker.ts`), 4 file ghép app (`app.module.ts`, `worker.module.ts`, `bootstrap.ts` + spec), 2 vòng lặp worker + spec, 9 CLI (13 file, 818 dòng — 4 CLI để Nest module ở gốc, các CLI khác để trong `modules/`; cùng một khung ~40 dòng chép lại 9 lần), 10 spec gate (7 087 dòng = 83 % số dòng ở gốc) | Mở `src/` không biết file nào là điểm vào, file nào là app, file nào chỉ là test kiểm tra |
| D10 | Raw SQL và Prisma trộn không quy ước       | 256 lời gọi `$queryRaw/$executeRaw` ở 68/114 repo, 426 lời gọi Prisma model                                                                                                                                                                                                                                                                                             | Không biết tìm truy vấn ở đâu, nhưng chấp nhận được vì đều nằm trong `*.repo.ts`          |

## Behavior and design

Hành vi runtime **không đổi**. Phần dưới là thiết kế cấu trúc đích.

### Nguyên tắc

1. **Giữ modular monolith** (ADR-0001). Một codebase, một DB, ba entry (API, worker, CLI).
2. **Tầng module cố định, phụ thuộc một chiều**; ngược chiều chỉ qua extension point khai báo.
3. **Mỗi module có đúng một cửa công khai**: thư mục `public/`. Không còn allowlist theo tên file hay ledger.
4. **Tổ chức theo use case**, tối đa ba cấp: module → capability → use case.
5. **Từ vựng file ngắn và cố định**; tên file nói vai trò.
6. **Giới hạn kích thước theo độ phức tạp**, đo bằng ESLint chuẩn, không cắt file theo con số dòng.
7. **Tài liệu cho người**: module card một trang, sơ đồ sinh tự động, ARCHITECTURE.md ngắn.
8. **Gate dùng công cụ chuẩn** thay cho spec tự viết hàng nghìn dòng.

### Tầng module (thay cho danh sách cạnh tự do)

Xếp theo cạnh import **đang có** — chỉ một cặp phải sửa (D5):

| Tầng                   | Module                                          | Được import                                            |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| T0 nền tảng            | `core`, `infrastructure`                        | không module nghiệp vụ nào                             |
| T1 dịch vụ lõi         | `audit`, `notifications`                        | T0                                                     |
| T2 tổ chức & danh tính | `organization`, `identity-access`               | T0–T1; trong tầng chỉ `identity-access → organization` |
| T3 dữ liệu tham chiếu  | `finance`, `operating-parameters`               | T0–T2; trong tầng `operating-parameters → finance`     |
| T4 tài sản phần mềm    | `catalog`, `licensing`                          | T0–T3; trong tầng `licensing → catalog`                |
| T5 quy trình           | `budgets`, `requests`, `data-import`            | T0–T4; trong tầng `requests → budgets`                 |
| T6 vòng đời & vận hành | `personnel`, `onboarding`, `installation`       | T0–T5                                                  |
| Gốc                    | `app.module.ts`, `worker.module.ts`, `*-cli.ts` | mọi tầng                                               |

Sửa D5: bốn chỗ `organization` gọi `IdentityAccessService` chuyển thành extension point do `organization` khai báo
(ví dụ `DepartmentHeadEligibility`: "người này có giữ `SUPER_ADMIN` không") và `identity-access` đăng ký hiện thực.

### Layout trong một module

```text
src/modules/requests/
  README.md                      # module card (mẫu bên dưới), tối đa ~80 dòng
  requests.module.ts             # wiring Nest; requests-http.module.ts nếu cần tách controller khỏi worker/CLI
  public/                        # CỬA DUY NHẤT cho module khác và composition root
    index.ts                     # re-export: facade, type, lỗi, extension point, event
    requests.api.ts              # facade (hiện là requests.service.ts)
    requests.types.ts
    requests.errors.ts
    requests.extension-points.ts # hook/listener module này mở cho tầng trên (nếu có)
  access-request/                # capability
    access-request.repo.ts       # persistence dùng chung trong capability (SQL chỉ ở *.repo.ts)
    access-request.types.ts
    access-request.errors.ts
    access-request.http-errors.ts
    withdraw-request/            # use case — bắt buộc khi capability > 20 file
      withdraw-request.controller.ts
      withdraw-request.dto.ts
      withdraw-request.service.ts
      withdraw-request.policy.ts
      withdraw-request.policy.spec.ts
    submit-draft/
      …
  spend/
    …
```

Quy tắc:

- Module khác chỉ import `modules/<x>/public` (hoặc `public/index.ts`). Trong module: use case không import file của use case
  khác — chia sẻ qua file cấp capability; capability không import file nội bộ của capability khác — chia sẻ qua
  `public/` của chính module hoặc file cấp module ghi rõ trong module card.
- Độ sâu tối đa 3 dưới module. Thư mục không quá **25 file** (kể cả spec); vượt thì tách use case.
- Controller nằm cạnh use case nó phục vụ; một controller có thể phục vụ nhiều use case cùng resource nếu nhỏ.

### Từ vựng file (thay 54 loại bằng 14)

| Hậu tố                           | Vai trò                                                         | Được import Nest/Prisma? |
| -------------------------------- | --------------------------------------------------------------- | ------------------------ |
| `.module.ts`                     | Wiring Nest                                                     | Nest                     |
| `.controller.ts`                 | Map HTTP ↔ DTO, gọi một service                                 | Nest                     |
| `.dto.ts`                        | Zod schema request/response                                     | không                    |
| `.service.ts`                    | Use case: mở transaction, điều phối, ghi audit                  | Nest                     |
| `.policy.ts`                     | Quy tắc nghiệp vụ thuần, trả quyết định                         | không                    |
| `.repo.ts`                       | Persistence (Prisma + raw SQL); mọi SQL nằm đây                 | Prisma                   |
| `.mapper.ts`                     | Record → wire                                                   | không                    |
| `.types.ts`                      | Type/record                                                     | không                    |
| `.errors.ts` / `.http-errors.ts` | Lỗi miền / ánh xạ lỗi → HTTP                                    | không / Nest             |
| `.api.ts`                        | Facade công khai trong `public/`                                | Nest                     |
| `.extension-points.ts`           | Hook/listener mở cho tầng trên                                  | không                    |
| `.listener.ts`                   | Hiện thực một listener/hook của module khác                     | Nest                     |
| `.job.ts`                        | Sweeper/loop chạy định kỳ (hiện là `*.sweeper.ts`, `*.loop.ts`) | Nest                     |

Các hậu tố hiện có quy đổi khi chuyển: `reader`/`source`/`support`/`state`/`recorder` → `repo` hoặc `service`;
`arguments` → `dto` (CLI); `hook`/`registry`/`port` → `extension-points`; `wire` → `dto`; file không hậu tố → đặt hậu tố
đúng vai trò. Bảng quy đổi đầy đủ lập ở Phase 1 bằng script, Owner duyệt.

### Extension point thống nhất (thay ~20 lớp `Registered*`)

Hai kiểu, định nghĩa một lần ở `src/core/extension/`:

```ts
// core/extension/hook.ts — đúng một hiện thực, bắt buộc có khi khởi động
export class Hook<T> {
  constructor(readonly name: string) {}
  private impl?: T;
  bind(impl: T): void {
    if (this.impl) throw new Error(`Hook ${this.name} is already bound`);
    this.impl = impl;
  }
  get(): T {
    if (!this.impl) throw new Error(`Hook ${this.name} is not bound`); // fail fast, không âm thầm từ chối
    return this.impl;
  }
}

// core/extension/listeners.ts — 0..n người nghe, chạy trong transaction của người phát
export class Listeners<E> {
  private readonly items: Array<{ name: string; handle: (tx: DbTx, event: E) => Promise<void> }> = [];
  add(name: string, handle: (tx: DbTx, event: E) => Promise<void>): void {
    this.items.push({ name, handle });
  }
  async emit(tx: DbTx, event: E): Promise<void> {
    for (const l of this.items) await l.handle(tx, event);
  }
  names(): string[] {
    return this.items.map((l) => l.name);
  }
}
```

- Module tầng dưới khai báo trong `public/<module>.extension-points.ts`, ví dụ
  `export const GRANT_REQUEST_GATE = new Hook<GrantRequestGate>('licensing.grant-request-gate')`.
- Module tầng trên đăng ký trong một file `<module>.listener.ts` duy nhất mỗi điểm, gọi từ `onModuleInit`.
- Khởi động API/worker kiểm mọi `Hook` bắt buộc đã `bind` (một test module-graph nhỏ ghim điều này).
- Không dùng `@nestjs/event-emitter`: listener hiện nay chạy **trong** transaction của người gọi và có thể chặn/hoàn tác;
  emitter bất đồng bộ phá ngữ nghĩa đó.
- Module card liệt kê điểm mở và người đăng ký → đọc được luồng ngược chiều mà không chạy code.

### Kích thước và độ phức tạp (thay gate 400 dòng)

ESLint chuẩn, áp cho `src/**` trừ `generated/`:

| Rule                                      | Ngưỡng                | Lý do                                                    |
| ----------------------------------------- | --------------------- | -------------------------------------------------------- |
| `max-lines` (file, bỏ dòng trống/comment) | warn 300, error 500   | Tín hiệu tách theo use case, không phải cắt theo chữ cái |
| `max-lines-per-function`                  | 60                    | Một hàm đọc được trong một màn hình                      |
| `complexity`                              | 12                    | Nhánh nhiều ⇒ đưa vào policy thuần                       |
| `max-params`                              | 8 (áp cả constructor) | Constructor > 8 dependency ⇒ use case làm quá nhiều việc |
| `max-depth`                               | 4                     |                                                          |

Ngoại lệ ghi bằng `eslint-disable-next-line <rule> -- <lý do>` ngay tại chỗ; không còn ledger riêng.

### Gate kiến trúc bằng công cụ chuẩn

- `dependency-cruiser` (devDependency mới — `OD-A3`): rule `no-circular` mức module, rule tầng T0→T6, rule "chỉ import
  `public/` của module khác", rule "use case không import use case khác". Cấu hình một file ~150 dòng, đọc được bằng mắt.
- Sinh sơ đồ: `pnpm arch:graph` → `docs/generated/module-graph.svg` (mức module) và một sơ đồ mỗi module.
- Giữ `module-graph.spec.ts` ở dạng rút gọn (đồ thị API/worker/CLI không chứa controller/queue sai chỗ, hook bắt buộc đã
  bind). Bỏ `architecture-structure.spec.ts`, `architecture-boundaries.spec.ts` khi rule tương ứng đã có trong
  dependency-cruiser/ESLint. `api-collection-contract.spec.ts` giữ nguyên (gate contract API, không phải cấu trúc).
- Mục tiêu: spec gate cấu trúc ≤ 1 500 dòng (hiện 2 900 dòng cho ba file cấu trúc).

### Tài liệu cho người

- `ARCHITECTURE.md` ≤ 250 dòng, dòng ≤ 120 ký tự: bảng tầng, layout module, từ vựng file, pipeline HTTP, transaction và
  khóa, cách thêm một use case. Chi tiết lịch sử chuyển về ADR/spec đã có, chỉ để link.
- `AGENTS.md` ≤ 80 dòng, dòng ≤ 120 ký tự; danh sách năng lực dài chuyển sang `docs/generated/routes.md`.
- **Module card** `src/modules/<x>/README.md` theo mẫu:

```md
# requests

Mục đích: một câu. Story chính: US-05-_, US-06-_.
Tầng: T5. Phụ thuộc: budgets, licensing, catalog, organization, identity-access, finance, operating-parameters, audit, notifications.
Public API: `RequestsApi` (các hàm chính, 1 dòng mỗi hàm).
Bảng sở hữu: access_requests, access_request_steps, spend_batches, …
Extension point mở: `requests.outcome` (Listeners) — đăng ký bởi personnel/transfer-review.
Extension point dùng: `licensing.grant-request-gate` (Hook), `licensing.revocation` (Listeners).
Capability → use case: access-request (submit-draft, withdraw-request, …), spend (…), …
Bất biến quan trọng và nơi kiểm: …
Test: unit `src/modules/requests/**/*.spec.ts`, integration `test/integration/requests/`.
```

- `docs/generated/routes.md` sinh từ OpenAPI + metadata Nest: `METHOD path → controller file → service file`. Đây là "bản đồ"
  để đọc code không cần AI.
- Comment trong code: một khối JSDoc ở đầu mỗi service use case (Story/AC + một đoạn tóm tắt); comment dòng chỉ cho "vì sao".
  Văn xuôi dài về lịch sử quyết định chuyển ra spec/ADR.

### Gốc `src/`: điểm vào, worker, lệnh vận hành và gate (D11)

**Phân loại 33 file hiện có:**

| Nhóm                | File                                                                          | Vai trò thật                                                                                    | Đích                                          |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Điểm vào tiến trình | `main.ts`, `worker.ts`                                                        | `node dist/main.js` (API), `node dist/worker.js` (worker) — Dockerfile, compose                 | **giữ ở gốc**                                 |
| Ghép API            | `app.module.ts`, `bootstrap.ts` (+ spec)                                      | Danh sách module của API; cấu hình HTTP (CORS, version, pipe, Swagger) và dựng tài liệu OpenAPI | `src/app/`                                    |
| Ghép worker         | `worker.module.ts`, `email-dispatch.loop.ts`, `request-work.loop.ts` (+ spec) | Danh sách module của worker; hai vòng thăm dò PostgreSQL nối hai module không được import nhau  | `src/worker/` (vòng lặp đổi hậu tố `.job.ts`) |
| Lệnh vận hành       | 9 `*-cli.ts`, 4 `*-cli.module.ts`                                             | `pnpm ops:*`, `pnpm dev:seed`; script deploy/bootstrap gọi `node dist/<tên>-cli.js` trong image | `src/cli/<lệnh>/` + một điểm vào `src/cli.ts` |
| Gate tĩnh           | 10 spec (bảng dưới)                                                           | Đọc source/OpenAPI/compose/migration để chặn vi phạm; không chạy app                            | `test/gates/`                                 |

**Cây đích:**

```text
src/
  README.md              # "Đọc từ đâu": 3 tiến trình, mỗi tiến trình bắt đầu ở file nào, rồi tới module nào
  main.ts                # tiến trình API      → app/app.module.ts
  worker.ts              # tiến trình worker   → worker/worker.module.ts
  cli.ts                 # tiến trình lệnh     → cli/commands.ts  (node dist/cli.js <lệnh> [tham số])
  app/
    app.module.ts
    configure-application.ts   # phần HTTP của bootstrap.ts
    openapi-document.ts        # createOpenApiDocument của bootstrap.ts
  worker/
    worker.module.ts
    email-dispatch.job.ts
    request-work.job.ts
  cli/
    commands.ts          # bảng lệnh: tên, mô tả, file, alias dist cũ — nguồn duy nhất
    run-command.ts       # khung chung (gộp infrastructure/cli/cli-runtime.ts)
    bootstrap/           # installation: bootstrap.command.ts, bootstrap-cli.module.ts, bootstrap.arguments.ts
    recover/
    inspect/
    dev-seed/
    db-roles/
    preflight/
    cost-center-direction/
    assign-subscription-owner/
    record-super-admin-event/
  core/  infrastructure/  modules/  generated/
```

**Khung lệnh chung** — mỗi lệnh chỉ còn phần riêng của nó:

```ts
// src/cli/cost-center-direction/cost-center-direction.command.ts
export const costCenterDirectionCommand = defineCommand({
  name: 'cost-center-direction',
  usage: DIRECTION_USAGE,
  parse: parseDirectionArguments, // ném ArgumentError → in usage, exit 1
  exitCodes: { done: 0, failed: 1, nothingToDo: 2 },
  loadModule: () => import('./cost-center-direction-cli.module').then((m) => m.CostCenterDirectionCliModule),
  refusals: [[DirectionRefusedError, (e) => `Refused (${e.problem}). Nothing was changed.`]],
  async execute(app, args, exit) {
    const result = await app.get(CostCenterDirectionApi).run(args);
    printDirectionResult(result);
    return result.changed ? exit.done : exit.nothingToDo;
  },
});
```

`run-command.ts` làm phần lặp lại: `--help`, lỗi tham số, nạp Nest graph muộn (để `--help` không cần biến DB), logger im
lặng, lỗi cấu hình môi trường, lỗi chỉ in tên (không URL/stack), `app.close()`, `process.exitCode`. Hợp đồng exit code và nội
dung in ra của từng lệnh **giữ nguyên byte** (test CLI hiện có ghim).

**Giữ nguyên đường dẫn `dist/` cũ** (`OD-A7`): `Dockerfile`, `docker-compose.prod.yml`, `scripts/ops/deploy-release.sh`,
`scripts/ops/bootstrap-installation.sh` và tài liệu vận hành ở Docs gọi `node dist/<tên>-cli.js` **trong image đang chạy**,
kể cả image cũ khi khôi phục (H7). Sau `nest build`, bước `scripts/build/emit-cli-aliases.mjs` đọc `cli/commands.ts` và sinh
`dist/<tên>-cli.js` một dòng (`require('./cli.js').run('<lệnh>')`). Không file alias nào nằm trong `src/`; tên `pnpm ops:*`
không đổi. Gate `operational-commands` kiểm mỗi lệnh có alias và mỗi alias trỏ đúng lệnh.

**Gate tĩnh** chuyển sang `test/gates/*.gate-spec.ts`, project Jest riêng `pnpm test:gates`, vẫn nằm trong `pnpm check`
(`OD-A8`); unit chỉ còn test của code:

| Gate                      | Dòng  | Kiểm gì                                                                           | Số phận                                                                     |
| ------------------------- | ----- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `api-collection-contract` | 2 773 | Mọi collection `GET` có summary/biên/paging (API-LIST-DETAIL.1)                   | Giữ; tách theo module khi > 500 dòng                                        |
| `architecture-structure`  | 1 321 | Ngưỡng 400 dòng, độ sâu, file gốc module, legacy ledger                           | **Bỏ** ở Phase 5 — thay bằng dependency-cruiser + ESLint                    |
| `architecture-boundaries` | 842   | Mỗi Prisma model một module sở hữu; module chỉ dùng delegate của mình             | Giữ phần sở hữu Prisma (dependency-cruiser không thấy được); bỏ phần import |
| `module-graph`            | 737   | Export của Nest module; đồ thị API/worker/CLI không chứa controller/queue sai chỗ | Giữ, rút gọn; thêm kiểm `Hook` bắt buộc đã bind                             |
| `deployment-roles`        | 335   | Role PostgreSQL của từng tiến trình trong compose/Dockerfile (H7)                 | Giữ                                                                         |
| `policy-ownership`        | 263   | Policy dùng chung có một chủ (BEH.1)                                              | Giữ                                                                         |
| `operational-commands`    | 257   | Quy tắc lệnh ngoài HTTP                                                           | Giữ; viết lại theo `cli/commands.ts` + alias                                |
| `test-support-structure`  | 255   | `test/support` không chứa assertion, ≤ 400 dòng                                   | Chuyển sang hạng mục test (rule ESLint cho `test/support`)                  |
| `contract-objects-unused` | 212   | Bản tương thích không dùng object sắp bị xóa (P03-RV-03)                          | **Tạm thời** — xóa khi migration hợp đồng đã chạy ở mọi môi trường          |
| `migration-order`         | 92    | Migration mới không xếp trước migration đã merge                                  | Giữ                                                                         |

**`src/README.md`** (≤ 60 dòng) là trang đầu tiên dev mới mở: ba tiến trình và file bắt đầu; bảng tầng module (link
ARCHITECTURE); cách tìm code của một route (`docs/generated/routes.md`); cách tìm code của một lệnh (`cli/commands.ts`); test
nằm ở đâu.

### Module `requests` (D1)

ADR-0015 giữ `spend` trong `requests` vì hai bên gọi nhau trong cùng transaction (ví dụ rút yêu cầu đọc trạng thái chi).
Đề xuất: **không tách Nest module ở hạng mục này**; tái cấu trúc bên trong thành use case folder và tách facade theo
capability (`RequestsApi`, `SpendApi` trong `public/`). Sau khi extension point thống nhất, đo lại cạnh `spend ↔ access-request`;
nếu chỉ còn qua `public/` thì Owner cân nhắc tách module `spend` ở hạng mục sau (`OD-A5`).

### Cách di chuyển an toàn

- Mỗi PR một module (hoặc một capability của `requests`), chỉ di chuyển/đổi tên; dùng `git mv` để giữ lịch sử và một script
  codemod `scripts/refactor/move-module.ts` (ts-morph) cập nhật import.
- Bằng chứng giữ hành vi mỗi PR: `openapi.json` không đổi, `prisma/` không đổi, `pnpm check` xanh, integration + HTTP test
  của module xanh, số test không giảm.
- Thứ tự từ lá vào gốc (ít người phụ thuộc trước): audit, notifications → finance, operating-parameters → organization,
  identity-access (sửa D5) → catalog → licensing → budgets → data-import → personnel, onboarding, installation → requests.

### Owner decisions

| Mã      | Câu hỏi                                                                                | Đề xuất                                                                                                       | Owner chọn 28/10/2026                                                                                             |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OD-A1` | Làm khi nào so với hạn RB-1 và các nhóm tính năng còn lại?                             | Phase 0–1 ngay (rẻ, không đụng code nghiệp vụ); Phase 2+ sau khi test redesign xanh và giữa hai đợt tính năng | theo đề xuất; **đổi cùng ngày**: dừng giao tính năng tới khi refactor xong (vẫn test trước, sau script bootstrap) |
| `OD-A2` | Thay rule "độ sâu ≤ 2" và gate cứng 400 dòng bằng độ sâu 3 + ESLint complexity?        | Đồng ý — hai rule này là nguyên nhân trực tiếp của D2, D3                                                     | theo đề xuất                                                                                                      |
| `OD-A3` | Thêm devDependency `dependency-cruiser` và bỏ dần gate tự viết?                        | Đồng ý; nếu không, viết rule tương đương bằng `eslint-plugin-boundaries`                                      | theo đề xuất                                                                                                      |
| `OD-A4` | `public/index.ts` (barrel) hay import thẳng file trong `public/`?                      | Import thẳng file trong `public/` (tránh vòng import qua barrel); rule chỉ cần kiểm đường dẫn chứa `/public/` | theo đề xuất                                                                                                      |
| `OD-A5` | Tách `spend` khỏi `requests` thành module riêng?                                       | Chưa; đo lại sau Phase 3                                                                                      | theo đề xuất                                                                                                      |
| `OD-A6` | Đổi tên facade `XService` → `XApi`?                                                    | Đồng ý — phân biệt được facade công khai với service nội bộ chỉ bằng tên                                      | theo đề xuất                                                                                                      |
| `OD-A7` | Sắp lại 9 CLI thế nào khi script deploy/bootstrap gọi `dist/<tên>-cli.js` trong image? | `src/cli/<lệnh>/` + một điểm vào `dist/cli.js`; alias `dist/<tên>-cli.js` sinh lúc build, giữ vĩnh viễn       | chốt 28/10/2026 theo đề xuất                                                                                      |
| `OD-A8` | 10 spec gate (7 087 dòng) ở gốc `src/` đặt đâu?                                        | `test/gates/`, project `pnpm test:gates` trong `pnpm check`                                                   | chốt 28/10/2026 theo đề xuất                                                                                      |

## Test matrix

| AC / rủi ro             | Tình huống (gồm từ chối, edge case)                                                         | Cấp test                                       | Kết quả mong đợi                              | Bằng chứng sau implement |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- | ------------------------ |
| `ARCH-R1` tầng          | Import từ T2 sang T5                                                                        | gate (dependency-cruiser)                      | đỏ, chỉ ra file và rule                       | chưa có                  |
| `ARCH-R1` cửa công khai | Module khác import file ngoài `public/`                                                     | gate                                           | đỏ                                            | chưa có                  |
| `ARCH-R1` vòng          | `organization` import `identity-access`                                                     | gate                                           | đỏ sau Phase 2                                | chưa có                  |
| `ARCH-R1` kích thước    | Hàm 80 dòng, constructor 10 dependency                                                      | ESLint                                         | lỗi `max-lines-per-function`, `max-params`    | chưa có                  |
| `ARCH-R2` hook          | Khởi động API khi một `Hook` bắt buộc chưa bind                                             | unit + module graph                            | lỗi khởi động nêu tên hook                    | chưa có                  |
| `ARCH-R2` listener      | Listener ném lỗi trong transaction                                                          | integration (giữ test hiện có)                 | transaction hoàn tác như hiện nay             | chưa có                  |
| D11 alias CLI           | `node dist/installation-cli.js --help` và `node dist/cli.js bootstrap --help` sau build     | gate `operational-commands` + test CLI hiện có | cùng nội dung, cùng exit code                 | chưa có                  |
| D11 script deploy       | `scripts/ops/deploy-release.sh`, `bootstrap-installation.sh` không sửa, chạy trên image mới | `pnpm test:scripts` + chạy thử trên VPS        | xanh                                          | chưa có                  |
| Giữ hành vi             | Mọi PR di chuyển                                                                            | `pnpm openapi:export` + diff, toàn bộ test     | không đổi byte, test xanh, số test không giảm | chưa có                  |

## Definition of Done

- Rule mới thay `docs/rules/module-structure.md`; `ARCHITECTURE.md`, `AGENTS.md` theo giới hạn ở trên.
- Mọi module đã chuyển sang layout mới, có module card; không còn legacy ledger cấu trúc.
- `pnpm arch:check` (dependency-cruiser) 0 vi phạm; ESLint complexity 0 lỗi (ngoại lệ có lý do tại chỗ).
- Không còn lớp `Registered*`/`Refusing*` tự viết; mọi điểm mở dùng `Hook`/`Listeners`, hook bắt buộc fail fast.
- Không thư mục nào > 25 file; không file > 500 dòng; không cặp module hai chiều.
- Gốc `src/` chỉ còn `README.md`, `main.ts`, `worker.ts`, `cli.ts` và các thư mục `app/`, `worker/`, `cli/`, `core/`,
  `infrastructure/`, `modules/`, `generated/`; gate tĩnh nằm ở `test/gates/`; mọi `dist/<tên>-cli.js` cũ vẫn chạy.
- OpenAPI, Prisma schema, migration không đổi; unit/HTTP/integration xanh trên CI; Owner đi thử "10 route ngẫu nhiên tìm
  được controller → service → repo trong 2 phút mỗi route" bằng `docs/generated/routes.md`.
