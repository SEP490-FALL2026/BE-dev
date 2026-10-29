# Spec: hoàn thiện ranh giới bên trong module và luật kiến trúc cho dev mới

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc BE cho Phase 0–3, 5–7; người quen `requests` cho Phase 4).
- Thiết kế ban đầu bởi: AI theo yêu cầu Owner (30/10/2026) — review tĩnh, không chạy test
  ([review](../../../reviews/be-architecture-readability-review-2026-10-30/README.md)).
- Thiết kế: `draft`. Owner review: chưa review. Quyết định `OD-R1` → `OD-R7` chờ Owner (mục _Owner decisions_).
- Nguồn: Docs `578f442` (BRD v3.57 mục 6.1), BE `25d5244` (cây làm việc có WIP `shared-demo-dataset` chưa commit). ADR liên
  quan: 0001, 0003, 0005, 0019.
- Nhóm roadmap: xuyên module — `technical-enabler`, không thuộc nhóm G (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Hạng mục trước: [be-architecture-boundaries-restructure](../be-architecture-boundaries-restructure/spec.md),
  [be-test-architecture-redesign](../be-test-architecture-redesign/spec.md).

## Business outcome

Sau hạng mục này, một dev mới mở bất kỳ capability nào — kể cả trong `requests` — là thấy đủ route, use case, quy tắc và
SQL của nó, biết đặt file mới ở đâu và đăng ký provider vào Nest module nào; máy chặn vòng giữa capability, thư mục tầng
kỹ thuật, listener vắng mặt trong một tiến trình và nợ kích thước mới. Kiểm bằng `pnpm check` (gate mới) và số đo
`pnpm arch:capabilities` trước/sau. Không đổi hành vi nghiệp vụ, HTTP contract hay schema.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner ngày 30/10/2026 (review kiến trúc và độ dễ đọc sau tái cấu trúc, BE `25d5244`).
- Mode: `technical-enabler`
- Outcome and owner: capability trong mọi module đọc được độc lập và luật cấu trúc do máy giữ; sở hữu: gate kiến trúc
  (`test/gates/`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `scripts/arch/`) và layout `src/modules/**`.
- Boundaries: không đổi transaction nào ngoài việc tuần tự hóa truy vấn trên cùng `tx` (AR-06); không đổi bảng, migration,
  route, mã lỗi, OpenAPI; không đổi env bắt buộc; extension point giữ tên và thứ tự listener.
- Not larger: không tách module `spend` (`OD-R6`), không làm lại test integration (thuộc `be-test-architecture-redesign`),
  không thêm tính năng.
- Not smaller: các phase dùng chung một bộ luật và gate (`capability-graph`, `module-layout`, wiring); tách thành nhiều
  hạng mục sẽ có nhiều người sửa cùng gate và cùng file cấu hình. Ranh giới review/rollback là phase và checkpoint trong
  [plan](plan.md).
- Siblings: `be-architecture-boundaries-restructure`, `be-test-architecture-redesign`, `shared-demo-dataset`
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                                                                                     |
| ----- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `ARCH-R3` | n/a      | gỡ chặn hạng mục tính năng mới chạm `requests`, `personnel`, `licensing`, `catalog`; hoàn tất mục tiêu "đọc không cần AI" của `be-architecture-boundaries-restructure` |

`ARCH-R3`: mọi module qua luật DAG capability, không thư mục tầng kỹ thuật, wiring extension point khớp giữa các graph,
ESLint chặn vi phạm mới; hướng dẫn dev mới khớp code.

## Supporting references

- Review [be-architecture-readability-review-2026-10-30](../../../reviews/be-architecture-readability-review-2026-10-30/README.md):
  finding AR-01 → AR-12, AT-01 → AT-03 (mỗi finding trỏ tới task sửa).
- [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md) (Proposed, chấp nhận một phần), S5 trong
  [nghiệm thu 29/10/2026](../../../reviews/be-architecture-test-acceptance-2026-10-29/README.md).
- [Module structure](../../../rules/module-structure.md), [test guide](../../../../test/README.md).
- BRD 6.1 (Docs `578f442`) ghi "Redis và background-job queue" — chỉ để đối chiếu AR-09; không sửa Docs ở đây.

## Explicit out of scope

- Tách `requests` thành nhiều module, microservice, tách database: `OD-R6`, ADR-0001.
- Tăng tốc test integration, đạt P7/P8: thuộc `be-test-architecture-redesign` (Owner đã miễn cho checkpoint 29/10/2026).
  Ở đây chỉ chặn kích thước file test (Task 7.4) và đo phân tầng (Task 7.5).
- Sửa bug hành vi phát hiện trong lúc di chuyển: ghi thành hạng mục riêng, kể cả nếu AR-01 tìm ra listener thật sự thiếu
  ở một graph (khi đó thêm listener là thay đổi hành vi, cần hạng mục và test riêng).
- Sửa BRD 6.1 (thuộc repo Docs); chỉ báo Owner.
- Mã `src/cli/demo-dataset/**`, `src/modules/installation/demo-dataset/**`: thuộc `shared-demo-dataset`.

## Dependencies and blockers

- **Chặn Phase 1–7** tới khi cây làm việc của `shared-demo-dataset` được Owner commit: nó sửa `test/gates/module-graph.gate-spec.ts`,
  `test/gates/operational-commands.gate-spec.ts`, `src/cli/commands.ts`, `identity-access`, `installation` — đúng các file
  Task 1.1, 2.2, 7.1 chạm. Phase 0 (đo, tài liệu quyết định) không chặn.
- Owner trả lời `OD-R1` → `OD-R7` trước phase dùng quyết định đó (cột "Chặn" ở bảng dưới).
- Lưới an toàn: integration chạy trong CI `dev` theo module bị ảnh hưởng (bật lại 28–30/10/2026). Phase 4 cần CI xanh trên
  `dev` trước khi bắt đầu.
- Trong phiên AI: hỏi Owner trước khi chạy suite jest dài (unit nhanh và gate tĩnh được chạy theo task).

## Ownership: module, data, API

- Không bảng, migration, route, mã lỗi, Nest module mới cho nghiệp vụ. OpenAPI `openapi.json` giữ **đúng byte**.
- File mới: `scripts/arch/capability-graph.cjs`, `scripts/arch/capabilities.mjs`, `test/gates/capability-graph.gate-spec.ts`,
  `test/gates/extension-wiring.gate-spec.ts`, `test/gates/test-size.gate-spec.ts`, `test/support/nest-module-graph.ts`,
  `eslint-suppressions.json` (nếu `OD-R4` = A). Tài liệu: `docs/guides/huong-dan-dev-moi.md` thay
  `docs/guides/kien-truc-backend-va-cach-viet-code.md`.
- Di chuyển file trong `src/modules/**` theo bảng ở Phase 2–4 của plan; module card cập nhật cùng lúc.

## Behavior and design

### Luật đích

| Mã  | Luật                                                                                                                                                                                                                                                | Máy kiểm bằng                                                   | Finding      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| R1  | Với mỗi graph tiến trình (API, worker, mỗi lệnh trong `src/cli/commands.ts`) và mỗi extension point có **người dùng** trong graph đó (provider không phải listener inject nó): tập bên đăng ký trong graph = tập bên đăng ký khai trong toàn `src/` | gate `extension-wiring` (đọc metadata Nest, không cần DB)       | AR-01, AR-05 |
| R2  | Không chạy nhiều truy vấn đồng thời trên cùng client transaction (`Promise.all` mà phần tử dùng `tx`)                                                                                                                                               | gate `module-layout`                                            | AR-06        |
| R3  | Không thư mục tầng kỹ thuật ở bất kỳ cấp nào dưới `src/modules/<m>/`: `mappers`, `dto`, `dtos`, `policies`, `services`, `repos`, `types`, `errors`, `controllers`, `common`, `shared`, `utils`, `helpers`                                           | gate `module-layout`                                            | AR-04        |
| R4  | `*.api.ts`, `*.extension-points.ts` chỉ trong `public/`; mỗi `public/<x>.api.ts` export đúng một lớp `<X>Api`                                                                                                                                       | gate `module-layout`                                            | AR-05        |
| R5  | Gốc module chỉ chứa `README.md`, `*.module.ts` và file dùng chung toàn module đặt tên `<m>[-…].<hậu tố>.ts`; module chưa có capability được giữ phẳng tới 25 file (`OD-R2`)                                                                         | gate `module-layout`                                            | AR-05        |
| R6  | Đồ thị capability → capability trong một module không có vòng (nhóm riêng tư giữa capability đã do `group-is-private` của dependency-cruiser giữ)                                                                                                   | gate `capability-graph` (bật dần theo `CAPABILITY_DAG_MODULES`) | AR-02, AR-03 |
| R7  | File non-spec trong `src/core` được ít nhất hai khu vực dùng (module khác nhau, `infrastructure`, `app`, `worker`, `cli`); khái niệm của một module ở `public/` của module đó                                                                       | gate `architecture-boundaries`                                  | AR-08        |
| R8  | `no-floating-promises`, `no-unsafe-argument`, `no-explicit-any` là `error`; rule kích thước/độ phức tạp là `error` với suppressions chuẩn của ESLint (`OD-R4`)                                                                                      | `pnpm lint`                                                     | AR-07        |
| R9  | Spec dưới `test/integration`, `test/http`, `test/e2e` tối đa 800 dòng; tên `it`/`describe` của gate mô tả hành vi, không bắt đầu bằng mã nội bộ                                                                                                     | gate `test-size`; review                                        | AT-02, AR-11 |

Không thêm ledger: `CAPABILITY_DAG_MODULES` là danh sách bật dần chỉ được **thêm**, xóa hẳn khi chứa mọi module (luật áp
cho tất cả). Ngoại lệ wiring `GRAPH_WIRING_EXCEPTIONS` bắt đầu rỗng; thêm mục cần Owner, ghi graph, extension point, bên
đăng ký vắng và vì sao luồng phát không chạy trong graph đó.

### Thiết kế R1 (wiring)

- Mỗi lớp `*.listener.ts` khai `static readonly binds = [<ExtensionPointClass>] as const;` (TypeScript thuần, không cần
  `reflect-metadata` trong `core`).
- Gate dựng graph bằng hàm `collectGraph` hiện có của `module-graph.gate-spec.ts` (chuyển sang `test/support/nest-module-graph.ts`),
  lấy danh sách graph từ `AppModule`, `WorkerModule` và `module` của mỗi lệnh. Người dùng của extension point = provider
  không có `binds` mà `design:paramtypes` chứa lớp extension point.
- Hook: luật như Listeners; `assertHooksBound` hiện không ai gọi — giữ (unit test dùng) hoặc xóa ở Task 1.1, không gọi lúc
  khởi động (không đổi hành vi runtime).
- Nếu gate tìm ra chênh lệch thật (ví dụ graph `record-super-admin-event` thiếu listener của `OrganizationChangeListeners`
  trong khi có người dùng): dừng, báo Owner, mở hạng mục sửa hành vi; trong hạng mục này chỉ thêm mục ngoại lệ có lý do
  **khi Owner đồng ý** để gate xanh.

### Đích của `requests` (Phase 4)

- `access-request/` là lõi: record, repo của `access_requests`/`_beneficiaries`/`_steps`, policy định tuyến và giá, lỗi,
  mapper. **Lõi không import capability nào khác của `requests`.** Ba file điều phối đang ở lõi chuyển ra capability riêng:
  `access-request-query.service.ts` → `request-read/`, `request-end.service.ts` → `request-end/`, nhóm `grant/` →
  capability `grant/`.
- Mỗi capability sở hữu file mang tên nó: `request-draft.repo.ts` → `draft/`, `need-decision.policy.ts` → `need-decision/`,
  `assessment-step.repo.ts` → `assessment/`, `finance-review.repo.ts` → `finance-review/`, `spend-submission.dto.ts` →
  `spend-submission/`. Kiểu dùng chéo (lý do của `cancellation`, `delegated-request`, `withdraw` mà `access-request.errors.ts`
  cần; kiểu của `group-request` mà lõi cần) chuyển xuống `access-request.types.ts`.
- Handler `need-decision`, `withdraw`, `similar-seats` có thể chuyển sang controller của capability tương ứng **chỉ khi**
  `openapi.json` giữ đúng byte (cùng path, operationId, tag, thứ tự); không thì giữ ở `access-requests.controller.ts` và ghi
  trong module card.
- Đích số đo: không vòng capability; cạnh capability → capability ≤ 50 (từ 82); cảnh báo ESLint của `requests` ≤ 50 (từ 102).

### Tương thích

- HTTP, mã lỗi, OpenAPI, schema, migration, env: không đổi. Env `REDIS_*` không có trong schema; bỏ hạ tầng queue (`OD-R5`)
  chỉ xóa module không được nạp và hai dependency.
- Tuần tự hóa truy vấn trên `tx`: kết quả giống hệt (cùng snapshot transaction); số round-trip không đổi vì pg@8 vốn xếp hàng.
- Alias `dist/<tên>-cli.js` và lệnh vận hành giữ nguyên.

## Owner decisions

| Mã      | Câu hỏi                         | Đề xuất                                                                                                                 | Phương án khác                                                  | Chặn            | Owner |
| ------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------- | ----- |
| `OD-R1` | Kiểm wiring theo graph bằng gì? | Gate tĩnh R1 (không đổi runtime, chạy trong `pnpm test:gates`)                                                          | Kiểm lúc khởi động mỗi tiến trình (fail fast, đổi hành vi boot) | Task 1.1        | chờ   |
| `OD-R2` | Hình dạng gốc module            | R5: module nhỏ được phẳng (≤ 25 file, chưa capability); file dùng chung toàn module ở gốc mang tên module               | Bắt mọi module dùng capability folder                           | Task 2.1–2.3    | chờ   |
| `OD-R3` | Capability trong một module     | R6: được import nhau (giữ S5) nhưng không vòng; bật dần theo module                                                     | Giữ S5 tự do, chỉ đo                                            | Phase 3–4       | chờ   |
| `OD-R4` | Chặn nợ ESLint                  | Rule kích thước `error` + `eslint-suppressions.json` (ESLint 9.39 có `--suppress-all`, `--prune-suppressions`)          | Giữ `warn` + `--max-warnings`, hạ N mỗi PR                      | Task 1.3, Ph. 5 | chờ   |
| `OD-R5` | Hạ tầng queue/Redis không dùng  | Xóa `src/infrastructure/queue/`, `bullmq`, `@nestjs/bullmq`, service `redis` trong `compose.yaml`; báo Docs sửa BRD 6.1 | Giữ, ghi "dự phòng" trong ARCHITECTURE                          | Task 2.6        | chờ   |
| `OD-R6` | Tách `spend` khỏi `requests`?   | Chưa; đo lại sau Phase 4 (giữ `OD-A5`)                                                                                  | Tách ngay thành module T6 `spending`                            | —               | chờ   |
| `OD-R7` | ADR 0011–0019 đang Proposed     | Owner review từng ADR; 0019 cập nhật R1–R9 rồi đề nghị Accepted cuối hạng mục                                           | Giữ Proposed                                                    | Task 6.2        | chờ   |

## Test matrix

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                                                            | Cấp test                                                         | Kết quả mong đợi                                    | Bằng chứng sau implement |
| ------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------ |
| R1                 | Graph có người dùng `OrganizationChangeListeners` nhưng thiếu một listener khai `binds`        | gate (cây thật + file tổng hợp)                                  | đỏ, nêu graph, extension point, listener thiếu      | chưa có                  |
| R1                 | Graph không có người dùng extension point (lệnh `inspect`)                                     | gate                                                             | không yêu cầu listener                              | chưa có                  |
| R1                 | Listener `*.listener.ts` không khai `binds`                                                    | gate                                                             | đỏ                                                  | chưa có                  |
| R2                 | `Promise.all([tx.a.findMany(), tx.a.count()])` trong repo                                      | gate (tổng hợp)                                                  | đỏ; `Promise.all` trên `this.prisma` vẫn xanh       | chưa có                  |
| R2 hành vi         | Danh sách phân trang đọc tuần tự trong `RepeatableRead`                                        | integration module bị chạm                                       | cùng kết quả như trước                              | chưa có                  |
| R3, R4, R5         | Thư mục `mappers/` dưới capability; `x.api.ts` ngoài `public/`; file gốc không mang tên module | gate (tổng hợp)                                                  | đỏ, nêu đường dẫn                                   | chưa có                  |
| R6                 | `a → b → a` giữa hai capability của một module trong `CAPABILITY_DAG_MODULES`                  | gate (tổng hợp + cây thật)                                       | đỏ, nêu chu trình và cạnh file                      | chưa có                  |
| R6 đích `requests` | Lõi `access-request/` import capability khác                                                   | gate                                                             | đỏ                                                  | chưa có                  |
| R7                 | File `core/x.ts` chỉ một module dùng                                                           | gate                                                             | đỏ                                                  | chưa có                  |
| R8                 | Promise thả nổi; hàm mới vượt 60 dòng                                                          | `pnpm lint`                                                      | lỗi                                                 | chưa có                  |
| R9                 | File integration 801 dòng                                                                      | gate                                                             | đỏ                                                  | chưa có                  |
| Không đổi hành vi  | Toàn bộ di chuyển file                                                                         | `pnpm check`, HTTP, integration module bị chạm, `openapi:export` | xanh; `openapi.json` đúng byte; `prisma/` không đổi | chưa có                  |

## Definition of Done

- [ ] R1 → R9 có gate/lint và test tổng hợp; `CAPABILITY_DAG_MODULES` chứa mọi module rồi được xóa.
- [ ] `pnpm arch:capabilities` báo 0 vòng ở mọi module; số đo trước/sau ghi ở plan.
- [ ] `LEGACY_PRIVATE_EXPORTS` rỗng và bị xóa; không thêm ledger mới.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; `openapi.json` đúng byte; HTTP và
      integration của module bị chạm xanh trên CI.
- [ ] Hướng dẫn dev mới, module card, ARCHITECTURE, module structure, ADR-0019 khớp code; spec/plan/roadmap phản ánh
      implementation cuối.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

- 30/10/2026: lập spec từ review tĩnh; chưa implement, chưa Owner review, chưa nghiệm thu.
