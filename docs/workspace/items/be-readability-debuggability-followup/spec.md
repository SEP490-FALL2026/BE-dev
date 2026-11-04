# Spec: dễ đọc và dễ gỡ lỗi sau tái cấu trúc — lượt 2

- Phụ trách: chưa phân công (đề xuất: người giữ gate kiến trúc BE; Phase 2 cần người quen `requests`, `personnel`,
  `data-import`).
- Thiết kế ban đầu bởi: AI theo yêu cầu Owner (31/10/2026) — review tĩnh trên BE `bbbbe81`, không chạy jest
  ([review](../../../reviews/be-architecture-readability-review-2026-10-30/README.md) là lượt 1; lượt 2 ghi trong
  `## Supporting references`).
- Thiết kế: `ready` (Owner duyệt spec/plan và `OD-F1` → `OD-F5` = A ngày 31/10/2026, mục _Owner decisions_). Triển khai:
  `verified` — local: `local-implementation-verified`. Phase 0–6 `implemented-local` trên BE `bbbbe81` cộng cây chưa commit (số liệu ở _Test matrix_ và
  [plan](plan.md#verification-and-handoff)); `ready-for-owner-review`. Owner review phần implement: chưa; integration/E2E `pending (Docker)`.
- Nguồn: Docs `d6d868c` (BRD v3.57 mục 6.1, 7.3), BE `bbbbe81` (`eb41f9c` = refactor Prompt 09 đã commit; working tree chỉ
  có 3 file WIP của Owner về `deploy-release`). ADR liên quan: 0001, 0004, 0010, 0019.
- Nhóm roadmap: xuyên module — `technical-enabler`, không thuộc nhóm G (xem `## Sizing decision`). ADR liên quan: 0001,
  0004, 0019.
- [Kế hoạch](plan.md). Hạng mục trước: [be-architecture-readability-hardening](../be-architecture-readability-hardening/spec.md)
  (lượt 1, đã commit `eb41f9c`), [be-test-architecture-redesign](../be-test-architecture-redesign/spec.md).

## Business outcome

Sau hạng mục này, một dev mới (1) đọc log của một sweeper/worker/listener bị lỗi là biết lỗi gì, ở bản ghi nào và có
thử lại được không; (2) mở một cột JSON của PostgreSQL là thấy một codec duy nhất định nghĩa hình dạng của nó và mọi
lần đọc đều được kiểm; (3) nhìn tên file `*.module.ts` là biết nó thuộc graph nào (API, mọi graph, một lệnh) mà không
cần module card; (4) nhìn tên một service đọc là đoán được nó trả gì cho ai; (5) mở `public/` của `organization` là thấy
cửa nào dành cho ai thay vì một lớp 47 phương thức. Không đổi hành vi nghiệp vụ, route, mã lỗi, `openapi.json`, schema.

## Sizing decision

- Container: yêu cầu trực tiếp của Owner ngày 31/10/2026 (review, audit kiến trúc src sau refactor Prompt 09 và lên
  spec/plan cho finding còn lại).
- Mode: `technical-enabler`
- Outcome and owner: code đọc và gỡ lỗi được bởi người không có AI, giữ bằng luật và gate; sở hữu: `src/modules/**`
  (tên file, facade, mapper JSON), `src/worker/*.job.ts`, `src/modules/**/*.job.ts|*.listener.ts` (log), gate
  `module-layout`, `docs/rules/module-structure.md`, `docs/guides/huong-dan-dev-moi.md`.
- Boundaries: không đổi transaction, bảng, migration, route, mã lỗi HTTP, OpenAPI (đúng byte), env bắt buộc; extension point
  giữ tên và thứ tự listener; đổi tên file/lớp chỉ là di chuyển cơ học, import trong `test/` sửa cùng lúc.
- Not larger: không làm lại tháp test hay thời gian CI (thuộc `be-test-architecture-redesign`, AT-01/AT-04 còn mở); không
  gộp thêm capability của `requests` (tiêu chí Owner 31/10/2026 đã đóng Task 4.3 của lượt 1); không thêm tính năng.
- Not smaller: năm finding dùng chung một gate (`module-layout`), một rule file (`module-structure.md`) và một hướng dẫn
  dev mới; tách thành năm hạng mục sẽ là năm người sửa cùng ba file đó. Ranh giới review/rollback là phase trong
  [plan](plan.md), mỗi phase độc lập và bỏ được.
- Siblings: `be-architecture-readability-hardening`, `be-test-architecture-redesign`, `shared-demo-dataset`
- Scope map: n/a

## Primary Story/AC

| Story | AC        | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                            |
| ----- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | `ARCH-R4` | n/a      | gỡ chặn các hạng mục API GAP/G5 mà dev A/B nhận theo [audit 31/10/2026](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md), trước hết `g5-request-submission-and-routing` và `catalog-application-plan-read-contracts`, trên code đọc và gỡ lỗi được |

`ARCH-R4`: lỗi của job/listener có ngữ cảnh gỡ lỗi; cột JSON có codec kiểm khi đọc; tên Nest module nói graph; từ vựng
service đọc có trong rule; facade `organization` tách theo người dùng. Mọi điều kiểm được bằng gate hoặc grep ghi trong
`## Test matrix`.

## Supporting references

- Lượt 2 (31/10/2026, BE `bbbbe81`), lệnh thực chạy: `pnpm arch:check` → 0 vi phạm (1 422 module, 7 320 cạnh);
  `pnpm arch:docs:check`, `pnpm rules:check` (323 file, 2 757 link, 0 lỗi), `pnpm typecheck`, `pnpm lint` đều exit 0;
  `eslint-suppressions.json` 113 mục / 82 file. Không chạy jest (quy tắc Owner 28/10/2026: hỏi trước).
- Số đo tĩnh dùng cho finding (grep trên `src/`, trừ spec và `generated/`): 120 563 dòng / 1 147 file production;
  `requests` 30 096 dòng, 36 capability (9 capability ≤ 2 file); 18 chỗ log `(error as Error).name`; 20 `as unknown as`
  (11 là đọc cột JSON); 31 `*.module.ts` cho 14 module với 7 kiểu tên; service đọc mang 7 hậu tố (`-view` 19, `-query` 11,
  `-facts` 7, `-directory` 6, `-lookup` 6, `-read` 3, `-reader` 1); `OrganizationApi` 47 phương thức / 327 dòng.
- Đo lại ở Task 0.1 (31/10/2026, HEAD `bbbbe81`, cây chỉ thêm gate; `grep` trên `src/`, trừ spec và `generated/`; cùng số với
  trên, thêm các chi tiết mà luật gate cần): `(error as Error).name` **18 chỗ nhưng chỉ 12 nằm trong `*.job.ts`** (10 trong
  module + 2 ở `src/worker/`), **6 còn lại nằm trong service/api** (`email-dispatcher.service`,
  `organization-change.service`, `backlog-alert.service`, `step-sla.service` ×2, `step-redetermination-sweep.api`) và **không
  `*.listener.ts` nào log tên lỗi** — bản spec ghi "3 listener của `personnel`" là nhầm, nên luật L1 áp cho mọi file non-spec
  của `src/` (18 chỗ, gồm cả `*.job.ts`/`*.listener.ts`); `as unknown as` **20 chỗ trong `src/`, 17 chỗ ở 9 file của
  `src/modules/`** (16 trong `*.repo.ts`/`*.mapper.ts`, 1 ở `operating-parameters.controller.ts`; 3 chỗ còn lại ở
  `src/infrastructure`) — luật L2 đếm theo dòng nên đỏ **17**; `*.module.ts` **31** file / 14 module, **8** file không khớp
  bảng tên của RV2-03 (7 module của lệnh + `identity-access/recovery.module.ts`; `identity-access-facade.module.ts` khớp dòng
  `<m>-<phần>-facade` với phần để trống); hậu tố service đọc cũ **17** file (`directory` 6, `lookup` 6, `read` 3, `reader` 1,
  `support` 1). Bốn luật L1–L4 đã đỏ đúng các số này trên cây thật (xem _Verification and handoff_ của plan).
- Finding lượt 1 đã đóng trong `eb41f9c`: AR-01 → AR-14, AT-02 (bảng _Kết quả sau Prompt 09_ của
  [review 30/10/2026](../../../reviews/be-architecture-readability-review-2026-10-30/README.md)). Còn mở ngoài hạng mục
  này: AT-01/AT-04 (tháp test, timeout CI 40 so quy tắc ≈ 47 phút — Owner), O7 walkthrough dev mới, review ADR-0019
  (`Proposed`), 7/15 ADR còn `Proposed`.
- [Module structure](../../../rules/module-structure.md), [security/jobs](../../../rules/security-jobs.md) ("a failed pass
  only logs"), [ADR-0004](../../../decisions/0004-error-contract-availability-and-request-id-trust.md) (log 500 kèm stack);
  nguyên tắc thận trọng dữ liệu trong log lấy từ BRD 7.3/7.5 (Docs `d6d868c`) — repo BE không có ADR riêng cho việc này.

## Explicit out of scope

- Tối ưu thời gian test, chia shard CI, đổi `timeout-minutes`: `be-test-architecture-redesign` (AT-01, AT-04, Owner).
- Tách `requests` thành module/microservice; gộp bớt capability của `requests`: Owner đã chốt tiêu chí 31/10/2026.
- Đổi hành vi khi một job lỗi (retry, dead-letter, dừng tiến trình): hạng mục này chỉ đổi **nội dung log**.
- Đổi hình dạng JSON đang lưu, migration dữ liệu: codec mô tả hình dạng **hiện có**; cột có bản ghi không khớp codec là
  bug dữ liệu, ghi hạng mục riêng.
- Chấp nhận ADR (Owner), bài đi thử O7 (Owner), sửa BRD.
- Gỡ hạ tầng queue/Redis: Owner `OD-R5` = GIỮ.

## Dependencies and blockers

- Owner trả lời `OD-F1` → `OD-F5` trước phase dùng quyết định đó (bảng _Quyết định chặn task_ trong plan). Phase 0
  (đo lại, gate đỏ-trước) làm được ngay.
- Bắt đầu từ BE ≥ `bbbbe81`; cây sạch hoặc chỉ có thay đổi của task. Ba file WIP của Owner (`docs/guides/containers.md`,
  `scripts/ops/deploy-release.sh`, `scripts/verify/deploy-release.test.mjs`) không được chạm.
- Chạy `pnpm test:gates`, `pnpm test`, `pnpm test:http`, `pnpm test:integration` cần Owner cho phép trong phiên (quy tắc
  28/10/2026); gate tĩnh không jest (`arch:check`, `typecheck`, `lint`, `rules:check`) chạy tự do.
- Phase 4 (đổi tên service) và Phase 5 (tách facade) chạm nhiều file của nhiều module: chỉ bắt đầu khi không có hạng mục
  tính năng nào đang mở trên cùng module trong `dev` (hỏi Owner lịch của dev A/B).

## Ownership: module, data, API

- Không bảng, migration, route, mã lỗi, env mới. `openapi.json` **đúng byte** sau mọi phase (bất biến của plan).
- File mới: `src/infrastructure/observability/operator-error.ts` (hoặc dùng lại `describeForOperator` nếu đã đủ — Task 1.1
  quyết theo code thật), `<capability>/<cột>.json.ts` cho từng cột JSON (Phase 2), mục _Từ vựng tên service đọc_ và _Tên
  Nest module_ trong `module-structure.md`, luật mới trong `test/gates/module-layout.gate-spec.ts`.
- File đổi tên (cơ học, giữ lớp và hành vi): Nest module của lệnh trong `src/modules/**` (Phase 3), service đọc theo từ
  vựng (Phase 4), `organization/public/*.api.ts` (Phase 5). Import trong `test/` sửa cùng commit.

## Behavior and design

### Finding lượt 2

| Mã     | Mức                | Điều quan sát được (BE `bbbbe81`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Vì sao làm khó người đọc / người gỡ lỗi                                                                                                                                              |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RV2-01 | Medium             | 18 chỗ trong `*.job.ts`, `src/worker/*.job.ts`, ba `*.listener.ts` của `personnel` log `` `${name} failed: ${(error as Error).name}` `` — không mã lỗi, không SQLSTATE, không id bản ghi, không stack. `HttpExceptionFilter` thì log stack cho 500 (ADR-0004).                                                                                                                                                                                                                                     | Một sweep đỏ hằng giờ chỉ in `Error`/`TransientDatabaseError`; không biết bản ghi nào, có thử lại được không, có phải bug không. Trái với mục tiêu "dễ debug".                       |
| RV2-02 | Medium (Plausible) | 11/20 `as unknown as` đọc cột JSON thành kiểu tĩnh không kiểm: `access_requests.policy` → `RequestPolicy`, `paymentSchedule` → `ScheduleJson[]` (kèm mặc định `binding ?? true`), `errors`/`summary`/`result` của import, `headHandover`/`detail` của personnel, `rows` của audit. Chỉ `requests/draft/request-draft-content.mapper.ts` parse bằng zod.                                                                                                                                            | Đổi hình dạng JSON ở một nơi ghi mà quên nơi đọc thì TypeScript vẫn xanh và lỗi lộ ra ở chỗ khác, sau. Comment "written by insert and nowhere else" là lời hứa, không phải kiểm tra. |
| RV2-03 | Medium             | 31 `*.module.ts` / 14 module, 7 kiểu tên: `<m>`, `<m>-http`, `<m>-facade`, `<m>-work-facade`, `<m>-inspection-facade`, `<m>-local-seed-facade`, `recovery`; graph của lệnh nằm hai nơi — `src/cli/<cmd>/<cmd>-cli.module.ts` (4) và `src/modules/<m>/<cap>/<cap>.module.ts` (7: `inspection`, `migration-preflight`, `dev-seed`, `demo-dataset`, `super-admin-event`, `cost-center-direction`, `subscription-owner-assignment`). Rule chỉ nêu `<m>.module.ts` và "`<m>-http.module.ts` … nếu cần". | Câu hỏi "đăng ký provider vào module nào" (lượt 1 đã nhận là khó) vẫn cần module card để trả lời; tên file không nói graph.                                                          | đỏ 8 trên `bbbbe81` (đo bằng tắt `it.skip` tạm), xanh sau khi đổi tên 8 module; L3 chạy trong `pnpm test:gates`; `extension-wiring` 11 graph và 9 mục ngoại lệ không đổi, `module-graph` xanh |
| RV2-04 | Low                | Service đọc mang 7 hậu tố không có trong bảng từ vựng của rule: `-view` 19, `-query` 11, `-facts` 7, `-directory` 6, `-lookup` 6, `-read` 3, `-reader` 1 (+ `-support` 1).                                                                                                                                                                                                                                                                                                                         | Không đoán được "đọc X" nằm ở file nào; mỗi module đặt tên theo thói quen của lát làm ra nó.                                                                                         | đỏ 17 trên `bbbbe81`, xanh sau khi đổi 17 file (12 chỉ đọc sang `-facts`/`-query`/`-view`, 5 service ghi sang `-record`); L4 chạy trong `pnpm test:gates`                                     |
| RV2-05 | Low                | `organization/public/organization.api.ts`: 47 phương thức, 327 dòng, 7 phụ thuộc; 11 module dùng. Đã có hai facade tách (`OrganizationHistoryApi`, `CostCenterDirectionApi`). ESLint giới hạn phụ thuộc (8), không giới hạn bề mặt.                                                                                                                                                                                                                                                                | Cửa càng rộng, người đọc module khác càng phải đọc hết để biết mình được gọi gì; đổi một phương thức là chạm 11 module.                                                              |
| RV2-06 | Low (ghi nhận)     | `requests` 36 capability, 9 capability ≤ 2 file (`outcome`, `plan-line`, `request-end`, `budget-questions`, `proposal-review`, `grant`, `renewal-apply`, `request-draft`, `request-intake`); bảng tầng L0–L3 chỉ có trong module card, `pnpm arch:capabilities` không in tầng.                                                                                                                                                                                                                     | Đánh đổi Owner đã chấp nhận (31/10/2026). Chỉ làm cho công cụ và card nói cùng một điều (Task 6.2).                                                                                  |
| RV2-07 | Low (ngoài code)   | 7/15 ADR `Proposed` (0013 → 0019); hướng dẫn dev mới ghi "chưa được dev mới đi thử" (O7); AT-01/AT-04 còn mở.                                                                                                                                                                                                                                                                                                                                                                                      | Việc của Owner; hạng mục này chỉ nhắc, không làm.                                                                                                                                    |

Điểm giữ nguyên (không finding): tầng module và cửa `public/` do máy giữ, 0 vòng capability, 0 thư mục tầng kỹ thuật,
0 `any`, 0 `eslint-disable` cho luật kích thước, mọi luật ESLint ở `error` với nợ chỉ giảm, R1 wiring theo 11 graph,
`routes.md`/`module-graph.md` sinh từ code, 14/14 module card khớp thư mục capability, policy thuần có spec (120/125
policy có spec cạnh file), harness test theo nghiệp vụ (`RequestHarness`, `StatusHarness`).

### RV2-01 — log của job và listener (Phase 1)

- Một hàm thuần `describeForOperator(error): string` ở `src/infrastructure/observability/operator-error.ts`. Hàm cùng
  tên hiện có là hàm **cục bộ** của `authentication.guard.ts` (trả `stack ?? name: message` — dùng cho lỗi của bộ xác
  thực token, không phải lỗi nghiệp vụ): chuyển sang dùng hàm mới với tùy chọn stack, xóa hàm cục bộ, giữ **một** hàm.
  Trả về: `name`, `code`/SQLSTATE nếu là `TransientDatabaseError`/Prisma/pg (dùng lại `readSqlState` của
  `transaction-runner.ts`), `retryable: true|false`, và `cause.name` một cấp. **Không** trả `message` của lỗi nghiệp vụ
  hay stack trong chuỗi mặc định (lỗi có thể mang email, tên người — BRD 7.3).
- Mỗi chỗ gọi thêm chủ thể khi có: `subject: { kind, id }` (id bản ghi đang xử lý trong vòng lặp). Vòng lặp xử lý nhiều
  bản ghi log theo từng bản ghi lỗi, không chỉ cả lượt.
- Lỗi **không dự kiến** (không phải `TransientDatabaseError`, không phải lỗi nghiệp vụ đã khai) log thêm `stack` qua
  `logger.error(summary, stack)` — cùng mẫu `HttpExceptionFilter`. Đây là điểm `OD-F1` quyết.
- Gate: `module-layout` thêm luật "file `*.job.ts`/`*.listener.ts` không chứa `(error as Error).name`"; thay bằng
  `describeForOperator`. Luật đỏ trên cây hiện tại (18) và xanh sau Phase 1.
- **Task 0.3 và kết quả Phase 1 (31/10/2026).** Hàm có sẵn là `describeForOperator(reason: unknown): string` **cục bộ** của
  `authentication.guard.ts`: trả `reason.stack ?? "name: message"` cho `Error` và `String(reason)` cho giá trị khác. Nó không biết mã
  lỗi, SQLSTATE hay `retryable`, và in cả message, nên không dùng lại được cho job. Quyết định một hàm một chỗ:
  `src/infrastructure/observability/operator-error.ts` xuất `describeForOperator(error, { stack? })` (dòng
  `<name> code=… sqlState=… retryable=… cause=…`, không message) và `traceForOperator(error)` (đối số trace của `logger.error`); guard
  gọi `describeForOperator(error.reason, { stack: true })` và hàm cục bộ đã xóa. Khác bản thiết kế ở ba điểm: (1) "stack" là **các dòng
  `at …`**, bỏ các dòng đầu V8 viết từ message — vì message của lỗi không dự kiến có thể mang chuỗi kết nối hay địa chỉ (spec và
  test cũ của vòng worker đã cấm), nên log không bao giờ có message; muốn thấy message thì đổi `framesOf` một chỗ, cần Owner đồng ý;
  (2) `retryable` đúng cả cho lỗi thô mà `toTransientError` nhận ra (không chỉ `TransientDatabaseError`); (3) không có lớp gốc chung cho
  352 lỗi nghiệp vụ nên "không phải lỗi nghiệp vụ đã khai" không nhận ra được trong hàm thuần: mọi lỗi **không** `retryable` kèm các dòng
  stack (không message), và không chỗ gọi nào mong một lỗi nghiệp vụ lọt tới `catch` của job. Luật L1 áp cho mọi file non-spec của
  `src/` (18 chỗ, gồm 6 chỗ trong service/api mà bản thiết kế không đếm), và các chỗ lặp theo bản ghi nay nêu id bản ghi lỗi.
  Hệ quả có chủ ý, ngoài phạm vi hạng mục này: dòng log 503 của `AuthenticationGuard` khi verifier sập không còn in
  `connect ECONNREFUSED host:port` (thận trọng dữ liệu, BRD 7.3) trong khi `HttpExceptionFilter` vẫn log đủ stack kèm message cho lỗi
  500 (ADR-0004); hai chỗ không cùng chính sách và không bị gộp ở đây. `describeForOperator` thêm `column=<bảng>.<cột>` cho
  `JsonColumnShapeError` (thông báo của nó được thiết kế không chứa giá trị).

### RV2-02 — codec cho cột JSON (Phase 2)

- Mỗi cột JSON có **một** file `<tên>.json.ts` trong capability của repo sở hữu: zod schema, `type` suy từ schema,
  `decode(value: unknown): T` (parse, lỗi ném `JsonColumnShapeError(table, column, issues)` — lỗi hạ tầng, 500, không lộ
  dữ liệu), `encode(value: T): Prisma.InputJsonValue`. Repo/mapper đọc qua `decode`, ghi qua `encode`; `as unknown as`
  cho cột JSON về 0.
- Phạm vi (đối chiếu `grep Json prisma/models/*.prisma`, 31/10/2026 — 22 cột): **codec bắt buộc** cho cột được đọc
  thành kiểu domain: `requests.prisma` `policy` (→ `RequestPolicy`), `paymentSchedule` (→ `ScheduleJson[]`, giữ mặc định
  `binding ?? true` **trong schema** `z.boolean().default(true)` để mặc định có một chỗ); `data-import.prisma` hai cặp
  `summary`/`result` và hai `errors`, một `differences` (employee import và seat baseline import — tên bảng đọc từ
  `@@map`); `personnel.prisma` hai `headHandover` (→ `HeadHandoverFacts`) và `detail`. **Không cần codec** (ghi lý do một
  dòng ở repo) cho payload tự do trả nguyên dạng `Prisma.JsonValue`: `audit.prisma` `before`/`after`, `budgets.prisma`
  `before`/`after`, `notifications.prisma` `params` ×2, `operating-parameters.prisma` `value`, `licensing.prisma`
  `linkedWork`, `data-import.prisma` `cells` ×2 — Task 2.1 kiểm từng cột: cột nào hiện đã được parse (zod hoặc guard) thì
  giữ; cột nào bị ép kiểu domain mà chưa kiểm thì chuyển vào nhóm bắt buộc. `request-draft-content.mapper.ts` là mẫu đã
  có.
- Hai cast không phải cột JSON nhưng nằm trong repo/controller: `audit/audit-query.repo.ts` (`rows as unknown as
StoredAuditEvent[]` — kết quả `$queryRaw`) → thay bằng generic `$queryRaw<Row[]>` cộng mapper hàng tường minh, không
  cast; `operating-parameters.controller.ts` (`view.constraints as unknown as Record<string, unknown>`) → sửa kiểu ở
  nguồn (`.types.ts`) để không cần cast.
- Hiệu năng: parse ở mỗi lần đọc; cột lớn nhất là `payment_schedule` (≤ 36 kỳ). Không cache. Nếu đo thấy chậm ở
  danh sách phân trang, `decode` có chế độ `safe` chỉ kiểm hình dạng cấp 1 — quyết sau khi đo, không làm trước.
- Gate: `module-layout` luật L2 "không `as unknown as` trong bất kỳ file non-spec nào dưới `src/modules/`" — không
  danh sách ngoại lệ. Ba cast ở `src/infrastructure` (`pg-pool`, `request-body-limit`, `environment-validation`) ngoài
  phạm vi luật và giữ nguyên.
- **Kết quả Phase 2 (31/10/2026, Task 2.1).** Cả 22 cột `Json`/`Json?` có codec dựng bằng `jsonColumn`/`nullableJsonColumn`
  (`src/infrastructure/database/json-column.ts`, lỗi `JsonColumnShapeError` ở `json-column.errors.ts`: bảng, cột, vị trí và loại lỗi,
  không giá trị). Kiểm từng cột như Task 2.1 yêu cầu cho thấy **cột nào cũng bị ép kiểu domain không kiểm** (kể cả nhóm "payload
  tự do" của bản thiết kế), nên không cột nào chỉ ghi chú: payload tự do có codec "một object của giá trị JSON", cột có hình dạng thì
  codec liệt kê trường. `access_requests.policy` có **hai hình dạng theo trạng thái dòng**: `RequestPolicy` khi request đã gửi và
  `{ draft: { kind, … } }` khi còn là bản nháp (`request-draft/request-draft-policy.json.ts`, dùng khi ghi bản nháp và trong `contentOf`).
  `step-reassignment.repo.ts` đọc `policy` qua `requestPolicyJson` vì chỉ đọc request có bước đang mở và trigger
  `access_requests_draft_has_no_work` cấm bản nháp có bước, nên không cần codec hợp; `role-duties.repo.ts` đọc `headHandover` qua
  `offboardingHeadHandoverJson`. Sau đó không còn chỗ nào của `src/modules` đọc cột JSON bằng ép kiểu một cấp.
  Mã lỗi dòng seat có đuôi đã bỏ: `COST_CENTER_REQUIRED` và `COST_CENTER_NOT_COMPANY` được ghi từ 20/10 tới 23/10/2026 và không migration
  nào viết lại, nên codec **đọc** chấp nhận `RETIRED_SEAT_ROW_ERROR_CODES` còn **ghi** chỉ nhận mã đang dùng; mã lỗi dòng của file
  người (`employee-import-errors`) là chuỗi mở nên không liệt kê.

  | Bảng.cột                                                                                    | Codec                                                                                                                                              |
  | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `access_requests.policy`, `payment_schedule` (và `policy` của bản nháp)                     | `requests/access-request/access-request.json.ts` (chung file: thư mục đã 25 file); bản nháp: `requests/request-draft/request-draft-policy.json.ts` |
  | `employee_imports.summary`, `result`; `employee_import_rows.cells`, `errors`, `differences` | `data-import/employee-import/employee-import-{summary,result,cells,errors,differences}.json.ts`                                                    |
  | `seat_baseline_imports.summary`, `result`; `seat_baseline_import_rows.cells`, `errors`      | `data-import/seat-baseline-import/seat-baseline-import-{summary,result,cells,errors}.json.ts`                                                      |
  | `department_transfers.head_handover`, `offboarding_cases.head_handover`                     | `personnel/personnel-head-handover.json.ts` (gốc module: hai capability dùng chung hình dạng)                                                      |
  | `offboarding_case_changes.detail`                                                           | `personnel/personnel-change-detail.json.ts` (gốc module: `offboarding/` đã 24 file)                                                                |
  | `audit_events.before`, `after`                                                              | `audit/audit-event-payload.json.ts`                                                                                                                |
  | `budget_version_history.before`, `after`                                                    | `budgets/version/version-history-snapshot.json.ts`                                                                                                 |
  | `in_app_notifications.params`, `held_department_notifications.params`                       | `notifications/inbox/notification-params.json.ts`                                                                                                  |
  | `parameter_values.value`                                                                    | `operating-parameters/operating-parameters-value.json.ts`                                                                                          |
  | `saas_issues.linked_work`                                                                   | `licensing/saas-issue/saas-issue-linked-work.json.ts`                                                                                              |
  | `subscription_renewals.decision_snapshot` (cột của dev A, tích hợp 31/10/2026)              | `licensing/subscription-renewal/subscription-renewal-decision-snapshot.json.ts`                                                                    |

  Hai cast không phải cột JSON: `audit-query.repo.ts` (thực ra là `findMany`, không phải `$queryRaw`) nay có hàm ánh xạ hàng tường
  minh; cast ở `operating-parameters.controller.ts` thừa (kiểu `Shape` đã gán được cho `Record<string, unknown>`) nên bỏ, không cần
  sửa `.types.ts`. `as unknown as` trong `src/modules`: 17 → 0. Thư mục giới hạn 25 file buộc hai ngoại lệ về chỗ đặt (bảng trên);
  spec của hai codec `requests` nằm trong `access-request.policy.spec.ts` và `pricing.policy.spec.ts`.

### RV2-03 — tên Nest module nói graph (Phase 3)

Bảng tên (vào `module-structure.md`, gate `module-layout` kiểm hậu tố và nơi đặt):

| Tên file                      | Graph                                                                              | Nơi đặt                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `<m>.module.ts`               | mọi graph cần module: facade, provider, listener, extension point                  | gốc module                                                          |
| `<m>-http.module.ts`          | chỉ API: controller, sweeper                                                       | gốc module                                                          |
| `<m>-<phần>-facade.module.ts` | tập con cho worker/lệnh dùng chung với API (`work`, `inspection`, `local-seed`)    | gốc module                                                          |
| `<lệnh>-cli.module.ts`        | gốc graph của đúng một lệnh, ghép các module                                       | `src/cli/<lệnh>/` (4 file hiện có, giữ)                             |
| `<cap>-cli.module.ts`         | phần của **một** module chỉ một lệnh dùng (không controller, không export cho API) | capability của module, hoặc gốc module dạng `<m>-<x>-cli.module.ts` |

Đối chiếu code 31/10/2026 (ai import ai, `grep -rl`): 8 file đổi tên, lớp đổi theo file (`XxxModule` → `XxxCliModule`),
nơi đặt giữ nguyên (`OD-F3` = A):

| Hiện tại                                                                        | Tên mới                                                  | Ai import                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `installation/inspect/inspection.module.ts`                                     | `installation/inspect/inspection-cli.module.ts`          | `src/cli/inspect/inspect.command.ts`                |
| `installation/migration-preflight/migration-preflight.module.ts`                | `…/migration-preflight-cli.module.ts`                    | `src/cli/preflight/preflight.command.ts`            |
| `installation/dev-seed/dev-seed.module.ts`                                      | `…/dev-seed-cli.module.ts`                               | `src/cli/dev-seed/dev-seed.command.ts`              |
| `installation/demo-dataset/demo-dataset.module.ts`                              | `…/demo-dataset-cli.module.ts`                           | `src/cli/demo-dataset/demo-dataset.command.ts`      |
| `personnel/super-admin-event/super-admin-event.module.ts`                       | `…/super-admin-event-cli.module.ts`                      | `src/cli/record-super-admin-event/*-cli.module.ts`  |
| `organization/cost-center-direction/cost-center-direction.module.ts`            | `…/cost-center-direction-cli.module.ts`                  | `src/cli/cost-center-direction/*-cli.module.ts`     |
| `catalog/subscription-owner-assignment/subscription-owner-assignment.module.ts` | `…/subscription-owner-assignment-cli.module.ts`          | `src/cli/assign-subscription-owner/*-cli.module.ts` |
| `identity-access/recovery.module.ts`                                            | `identity-access/identity-access-recovery-cli.module.ts` | `src/cli/recover/recover-cli.module.ts`             |

`installation/installation.module.ts` giữ tên: nó là **module** `installation` (bảng tầng T6), bootstrap là lệnh duy nhất
dùng nó — module card ghi điều đó. `identity-access-inspection-facade` và `identity-access-local-seed-facade` khớp dòng
`<m>-<phần>-facade` (tập con của identity-access cho lệnh của installation) — giữ. Gate L3: mọi `*.module.ts` dưới
`src/modules/` khớp đúng một dòng của bảng tên; `PROCESS_GRAPHS` và `GRAPH_WIRING_EXCEPTIONS` đổi tên lớp theo. Không
đổi provider, import, export.

**Kết quả Phase 3 (Task 3.1–3.3, 31/10/2026).** Tám file đổi tên đúng bảng trên (`git` không stage: đổi bằng hệ thống tệp); lớp đổi theo
file, importer ở `src/cli/**`, `test/support/process-graphs.ts`, `test/gates/{extension-wiring,module-graph,operational-commands}`,
bốn spec integration của `installation`, và module card `installation`, `identity-access`, `personnel`, `catalog`, `organization` sửa cùng
lúc; không đổi provider, import hay export.

| File mới                                                                            | Lớp cũ → lớp mới                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `installation/inspect/inspection-cli.module.ts`                                     | `InspectionModule` → `InspectionCliModule`                                   |
| `installation/migration-preflight/migration-preflight-cli.module.ts`                | `MigrationPreflightModule` → `MigrationPreflightCliModule`                   |
| `installation/dev-seed/dev-seed-cli.module.ts`                                      | `DevSeedModule` → `DevSeedCliModule`                                         |
| `installation/demo-dataset/demo-dataset-cli.module.ts`                              | `DemoDatasetModule` → `DemoDatasetCliModule`                                 |
| `personnel/super-admin-event/super-admin-event-cli.module.ts`                       | `SuperAdminEventModule` → `SuperAdminEventCliModule`                         |
| `organization/cost-center-direction/cost-center-direction-cli.module.ts`            | `CostCenterDirectionModule` → `CostCenterDirectionCliModule`                 |
| `catalog/subscription-owner-assignment/subscription-owner-assignment-cli.module.ts` | `SubscriptionOwnerAssignmentModule` → `SubscriptionOwnerAssignmentCliModule` |
| `identity-access/identity-access-recovery-cli.module.ts`                            | `RecoveryModule` → `IdentityAccessRecoveryCliModule`                         |

**Va chạm tên lớp mà bảng không thấy.** Ba gốc graph của lệnh ở `src/cli/` đã mang đúng tên mà lớp phần của module sẽ nhận
(`SuperAdminEventCliModule`, `SubscriptionOwnerAssignmentCliModule`, `CostCenterDirectionCliModule`), và gốc `cost-center-direction` còn
trùng cả tên file với phần của nó. Hai lớp cùng tên làm import trùng và khóa `tên: …` của gate mơ hồ, nên ba gốc đổi trước:
`RecordSuperAdminEventCliModule` (theo `record-super-admin-event-cli.module.ts`), `AssignSubscriptionOwnerCliModule` (theo
`assign-subscription-owner-cli.module.ts`) và `CostCenterDirectionRootCliModule` (cùng tên file với phần nên phải có tên khác).
`RecoveryCliModule` của `recover` không va chạm nên giữ (nit: theo file phải là `RecoverCliModule`, có từ trước, chưa đổi). Tên graph trong `PROCESS_GRAPHS` và `GRAPH_WIRING_EXCEPTIONS` đổi theo; vẫn 11
graph và 9 mục ngoại lệ.

Luật L3 chạy thật và kiểm đúng bảng ở `module-structure.md` (mục _Tên Nest module nói graph_): năm dòng của `src/modules/`, với phần `<x>`
của `-facade` tùy chọn nên `identity-access-facade.module.ts` khớp, và dòng thứ sáu, gốc lệnh `src/cli/<lệnh>/<lệnh>-cli.module.ts`.
Đỏ 8 trên tên cũ (7 module của lệnh + `identity-access/recovery.module.ts`), xanh sau khi đổi tên. Gate có thể thêm sau (chưa làm): không
`*-cli.module.ts` nào nằm trong graph của `AppModule`, để API không kéo một phần của lệnh.

### RV2-04 — từ vựng service đọc (Phase 4)

Ba tên, vào bảng từ vựng của `module-structure.md`:

| Hậu tố              | Trả về                                                                                              | Chạy ở đâu                          |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `<x>-query.service` | bản ghi/trang cho HTTP đọc (list, detail), ngoài transaction ghi                                    | controller gọi                      |
| `<x>-facts.service` | dữ kiện một quyết định, một capability hoặc module khác cần; `tx` tùy chọn; không trả thẳng ra wire | service ghi, policy hoặc facade gọi |
| `<x>-view.service`  | ghép nhiều nguồn thành một hình chiếu trước khi `mapper` ra wire                                    | controller hoặc query gọi           |

`-directory`, `-lookup`, `-reader`, `-read`, `-support` đổi về một trong ba (Task 4.1 lập bảng đổi tên theo nội dung thật,
không theo chữ). 17 file (31/10/2026): `budgets/budget/budget-support`, `catalog/catalog-entry/application-lookup`,
`catalog/functional-group/functional-group-lookup`, `catalog/plan/plan-lookup`, `catalog/subscription/subscription-lookup`,
`catalog/vendor/vendor-directory`, `catalog/vendor/vendor-lookup`, `catalog/vendor-dictionary/vendor-dictionary-lookup`,
`identity-access/accounts/account-directory`, `identity-access/approval-roles/approval-role-directory`,
`identity-access/auth/session-directory`, `licensing/provisioning/revocation-read`, `organization/department/department-directory`,
`organization/employee/employee-directory`, `requests/assessment/assessment-reader`, `requests/spend/spend-read`,
`requests/spend-submission/supplement-read`. Một service vừa đọc vừa ghi (ví dụ `*-directory` có `create`) không phải
"service đọc": Task 4.1 đổi về tên theo việc nó làm (`<x>.service.ts` hoặc tách) và ghi lý do; gate L4 chỉ cấm năm hậu tố cũ.
Đổi tên là cơ học: lớp đổi tên theo file, import và `providers`/`exports`/`PUBLIC_CONTRACT_EXPORTS` sửa cùng lúc,
`openapi.json` không đổi.

**Task 4.1 — bảng đổi tên theo nội dung thật (31/10/2026, trước khi đổi tên).** Đọc từng file: ghi hay chỉ đọc, ai gọi, trong hay
ngoài `tx`. Một service **ghi** không phải service đọc nên đổi về `<x>-record.service` (`<x>.service.ts` với `<x>` = "các dòng của
`<x>` như capability khác đọc và ghi chúng"): `<x>.service` trơn đã bị lớp khác của module chiếm ở `department` và `session`, nên cả năm
service ghi dùng `-record` cho thống nhất. Mọi đường dẫn dưới `src/modules/`.

| #   | File hiện tại (đuôi `.service.ts`)                       | Tên mới (file · lớp)                                       | Loại    | Lý do một dòng                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------- | ---------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `budgets/budget/budget-support`                          | `budget-facts` · `BudgetFactsService`                      | facts   | hỗn hợp: `require*` (quyền), định dạng tiền, tra người, và các lần đọc (người giữ vai, Cost Center, trưởng phòng, tiền); không ghi, `tx` tùy chọn, bốn view service của budget gọi ngoài `tx`: xếp `-facts` vì dữ kiện cho quyết định là phần chính |
| 2   | `catalog/catalog-entry/application-lookup`               | `application-facts` · `ApplicationFactsService`            | facts   | `lockShared` trong `tx` của người gọi, cộng đọc người nhận cảnh báo; không ghi                                                                                                                                                                      |
| 3   | `catalog/functional-group/functional-group-lookup`       | `functional-group-facts` · `FunctionalGroupFactsService`   | facts   | một lần đọc `FOR SHARE` trong `tx` của việc khai ứng dụng                                                                                                                                                                                           |
| 4   | `catalog/plan/plan-lookup`                               | `plan-facts` · `PlanFactsService`                          | facts   | khóa và đọc dữ kiện của gói cho subscription, điều khoản, ứng dụng; nhận `tx`, không ghi                                                                                                                                                            |
| 5   | `catalog/subscription/subscription-lookup`               | `subscription-facts` · `SubscriptionFactsService`          | facts   | giá và điều khoản của các gói mà luật của capability khác cần; `tx` tùy chọn, không ghi                                                                                                                                                             |
| 6   | `catalog/vendor/vendor-directory`                        | `vendor-record` · `VendorRecordService`                    | **ghi** | `ensureForDictionaryGroup`, `ensureByName`, `adoptDictionaryGroup` tạo hoặc gắn nhóm cho nhà cung cấp trong `tx` của người gọi                                                                                                                      |
| 7   | `catalog/vendor/vendor-lookup`                           | `vendor-facts` · `VendorFactsService`                      | facts   | một lần đọc cho facade `CatalogApi`: tên nhà cung cấp; không ghi (`vendor-query` đã có cho HTTP)                                                                                                                                                    |
| 8   | `catalog/vendor-dictionary/vendor-dictionary-lookup`     | `vendor-dictionary-facts` · `VendorDictionaryFactsService` | facts   | một lần đọc dòng dịch vụ trong `tx` của việc khai ứng dụng                                                                                                                                                                                          |
| 9   | `identity-access/accounts/account-directory`             | `account-record` · `AccountRecordService`                  | **ghi** | `createAppUser`, `setStatus`, `markActivated`, `changeLoginEmail`, `markEmployeeLeft` ghi `app_users`; đọc chỉ là nửa còn lại                                                                                                                       |
| 10  | `identity-access/approval-roles/approval-role-directory` | `approval-role-facts` · `ApprovalRoleFactsService`         | facts   | ai giữ vai duyệt bây giờ, cho kiểm tra theo từng request và kiểm tra người kế nhiệm Super Admin; chỉ đọc                                                                                                                                            |
| 11  | `identity-access/auth/session-directory`                 | `session-record` · `SessionRecordService`                  | **ghi** | `revokeAllSessions` thu hồi phiên trong `tx`; `findPrincipalContext` của guard là nửa đọc                                                                                                                                                           |
| 12  | `licensing/provisioning/revocation-read`                 | `revocation-view` · `RevocationViewService`                | view    | ghép ghế cá nhân (licensing) với cách gỡ của gói (catalog) thành `PersonalSeat` cho các danh sách sau thu hồi; chỉ đọc                                                                                                                              |
| 13  | `organization/department/department-directory`           | `department-record` · `DepartmentRecordService`            | **ghi** | `createForInstallation`, `endHeadPeriodOf`, `restoreHeadPeriodEnd`, `deleteHeadPeriod` ghi phòng ban và kỳ trưởng phòng                                                                                                                             |
| 14  | `organization/employee/employee-directory`               | `employee-record` · `EmployeeRecordService`                | **ghi** | `createWithPlacement`, `updateOfficialFields`, `scheduleStructureChange`, `setWorkState`, `scheduleDepartureEnd` ghi nhân viên và vị trí                                                                                                            |
| 15  | `requests/assessment/assessment-reader`                  | `assessment-query` · `AssessmentQueryService`              | query   | `GET /access-requests/{id}/assessment`: controller gọi, kiểm ai được đọc rồi trả qua `AssessmentViewService`, không ghi                                                                                                                             |
| 16  | `requests/spend-submission/supplement-read`              | `supplement-query` · `SupplementQueryService`              | query   | `GET /access-requests/{id}/supplements`: danh sách phân trang cho controller; `wires` là phần ghép của chính nó                                                                                                                                     |
| 17  | `requests/spend/spend-read`                              | `spend-wire-view` · `SpendWireViewService`                 | view    | định dạng tiền và tra người cho các view/query của spend và supplement; tên `spend-view` đã dùng ở `finance-review/` nên thêm `wire`                                                                                                                |
| 18  | `organization/department-management/department-lookups`  | `department-facts` (không có lớp)                          | facts   | hai hàm `lockAndReadEmployee` (khóa `FOR SHARE` rồi đọc nhân viên trong `tx`) và `requireOrganization` cho `DepartmentService` và `DepartmentHeadService`; số nhiều nên lọt đo ban đầu; vẫn là hàm (có từ trước), chưa thành lớp                    |

5 file ghi (6, 9, 11, 13, 14) đổi sang `-record`; 13 file chỉ đọc: 9 facts, 2 query, 2 view. Dòng 18 do gate L4 phát hiện ở vòng review
Round B (hậu tố số nhiều `-lookups`), nên luật L4 nay cấm cả dạng số nhiều của năm hậu tố. Không tách file nào: nửa đọc của năm service
ghi chỉ là lối vào của cùng các repo, và tách chúng là việc của một hạng mục có spec riêng.

**Việc sau (Low, chưa làm; bốn việc).**

1. `budget-facts` là hỗn hợp (dòng 1): tách phần định dạng tiền và tra người ra `budget-wire-view` như `spend-wire-view` để
   `-facts` chỉ còn dữ kiện và quyền.
2. Dòng 18: đưa hai hàm của `department-facts.service.ts` (`lockAndReadEmployee`, `requireOrganization`) vào một lớp
   `@Injectable() DepartmentFactsService`, để file `*-facts.service.ts` có lớp như mọi `.service.ts` khác (phán quyết của reviewer Round B).
3. (MG-05, review tích hợp dev A) `licensing/subscription-renewal/decision/renewal-decision-trail.service.ts` ghi snapshot vào audit bằng
   `JSON.parse(JSON.stringify(decision.snapshot)) as { [key: string]: string }`: kiểu khai báo hẹp hơn dữ liệu (snapshot lồng nhau). Đổi sang
   `{ [key: string]: AuditValue }` (kiểu của `public/audit.types.ts`) hoặc một hàm `toAuditSnapshot`.
4. (MG-06) Cùng file: `run<T>()` chỉ chuyển tiếp sang `TransactionRunner`; tiêm `TransactionRunner` thẳng vào `RenewalDecisionService` rồi bỏ
   `run`.

Gate L4 chỉ cấm năm hậu tố cũ ở `*.service.ts`; `-record` không bị luật nào đòi, nên bảng từ vựng ghi nó thành một dòng chú thích bên dưới ba
tên đọc.

### RV2-05 — tách facade `organization` (Phase 5)

Tách theo người gọi, không theo bảng: `OrganizationReadApi` (đọc phòng ban, nhân viên, Cost Center, IT Admin phụ trách,
`businessToday`), `OrganizationApi` giữ ghi (`createEmployeeWithPlacement`, `createUnitCostCenter`, `emitChange`) và
`getDepartmentUse`/`getCostCenterUse`. `OrganizationHistoryApi`, `CostCenterDirectionApi` giữ nguyên. Mỗi file gọi
import đúng facade nó cần — **169 file** ở 11 module (`requests` 58, `personnel` 30, `licensing` 28, `catalog` 18,
`identity-access` 16…; đo 31/10/2026), phần lớn chỉ đọc. `PUBLIC_CONTRACT_EXPORTS` thêm một dòng. Không đổi chữ ký phương
thức. Đây là phase chạm nhiều file nhất cho finding thấp nhất: làm **cuối cùng**, một commit riêng để Owner revert được
độc lập; Task 5.1 có thể dùng script (`ts-morph` hoặc grep phương thức) để chọn facade cho từng file, nhưng kết quả phải
`typecheck` và bộ test HTTP/integration xanh.

**Task 5.1 — bảng 47 phương thức theo người gọi (31/10/2026, trước khi sửa mã).** Số liệu từ cây TypeScript của `src/` (mọi lớp có tham
số constructor kiểu `OrganizationApi`, mọi truy cập `this.organization.<phương thức>`), không từ grep chữ. Quy tắc xếp: ghi (`create*`, `set*`,
`update*`, `emit*`, `activate*`), khóa `FOR UPDATE` (ý định ghi) và hai bộ đọc "đang được dùng" ở `OrganizationApi`; mọi lần đọc, kể cả khóa
`FOR SHARE` chỉ để giữ giá trị đọc ổn định, ở `OrganizationReadApi`.

| #   | Phương thức                               | Facade                | File gọi (module)                                                                                                                                     | Ghi chú                                                                                                                                                                                               |
| --- | ----------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `businessToday`                           | `OrganizationReadApi` | 78: requests 27, personnel 20, licensing 19, catalog 5, operating-parameters 2, budgets 1, data-import 1, finance 1, installation 1, organization 1   |                                                                                                                                                                                                       |
| 2   | `isDepartmentHead`                        | `OrganizationReadApi` | 1: identity-access 1                                                                                                                                  |                                                                                                                                                                                                       |
| 3   | `getHeadedDepartment`                     | `OrganizationReadApi` | 15: requests 8, personnel 4, budgets 1, identity-access 1, licensing 1                                                                                |                                                                                                                                                                                                       |
| 4   | `getDepartmentBrief`                      | `OrganizationReadApi` | 8: requests 4, personnel 3, catalog 1                                                                                                                 |                                                                                                                                                                                                       |
| 5   | `getDepartmentBriefs`                     | `OrganizationReadApi` | 6: licensing 2, personnel 2, requests 2                                                                                                               |                                                                                                                                                                                                       |
| 6   | `lockDepartmentShared`                    | `OrganizationReadApi` | 4: budgets 1, catalog 1, personnel 1, requests 1                                                                                                      | `FOR SHARE`: chỉ giữ cho đọc ổn định                                                                                                                                                                  |
| 7   | `getEmployeePlacement`                    | `OrganizationReadApi` | 8: requests 4, personnel 3, licensing 1                                                                                                               |                                                                                                                                                                                                       |
| 8   | `getItAdminInCharge`                      | `OrganizationReadApi` | 10: licensing 4, requests 4, personnel 2                                                                                                              |                                                                                                                                                                                                       |
| 9   | `getDepartmentIdsInChargeOf`              | `OrganizationReadApi` | 1: requests 1                                                                                                                                         |                                                                                                                                                                                                       |
| 10  | `getItAdminScope`                         | `OrganizationReadApi` | 4: personnel 4                                                                                                                                        |                                                                                                                                                                                                       |
| 11  | `getDepartmentMemberIds`                  | `OrganizationReadApi` | 5: personnel 2, requests 2, licensing 1                                                                                                               |                                                                                                                                                                                                       |
| 12  | `getDepartmentHeads`                      | `OrganizationReadApi` | 12: personnel 5, requests 5, budgets 1, licensing 1                                                                                                   |                                                                                                                                                                                                       |
| 13  | `countUnmarkedChangesAsOf`                | `OrganizationReadApi` | 1: installation 1                                                                                                                                     | chỉ đọc, cho `ops:inspect`                                                                                                                                                                            |
| 14  | `emitChange`                              | `OrganizationApi`     | không có                                                                                                                                              | không module nào gọi qua facade (chỉ spec); phát sự kiện thay đổi                                                                                                                                     |
| 15  | `getOrganization`                         | `OrganizationReadApi` | 58: licensing 12, catalog 11, identity-access 8, personnel 8, requests 6, installation 4, data-import 3, operating-parameters 3, finance 2, budgets 1 |                                                                                                                                                                                                       |
| 16  | `getOrganizationShared`                   | `OrganizationReadApi` | 2: finance 2                                                                                                                                          | `FOR SHARE`                                                                                                                                                                                           |
| 17  | `setReportingCurrency`                    | `OrganizationApi`     | 1: operating-parameters 1                                                                                                                             |                                                                                                                                                                                                       |
| 18  | `createOrganization`                      | `OrganizationApi`     | 1: installation 1                                                                                                                                     |                                                                                                                                                                                                       |
| 19  | `createUnitCostCenter`                    | `OrganizationApi`     | 1: installation 1                                                                                                                                     |                                                                                                                                                                                                       |
| 20  | `getCostCentersByCodes`                   | `OrganizationReadApi` | 2: budgets 1, data-import 1                                                                                                                           |                                                                                                                                                                                                       |
| 21  | `costCentersByIds`                        | `OrganizationReadApi` | 7: requests 5, budgets 1, licensing 1                                                                                                                 |                                                                                                                                                                                                       |
| 22  | `lockCostCentersShared`                   | `OrganizationReadApi` | 1: data-import 1                                                                                                                                      | `FOR SHARE`                                                                                                                                                                                           |
| 23  | `createDepartment`                        | `OrganizationApi`     | 2: installation 2                                                                                                                                     |                                                                                                                                                                                                       |
| 24  | `createEmployeeWithPlacement`             | `OrganizationApi`     | 3: installation 2, data-import 1                                                                                                                      |                                                                                                                                                                                                       |
| 25  | `lockEmployeeForShare`                    | `OrganizationReadApi` | 21: requests 7, identity-access 4, personnel 4, catalog 3, licensing 2, data-import 1                                                                 | `FOR SHARE`                                                                                                                                                                                           |
| 26  | `lockEmployeeForUpdate`                   | `OrganizationApi`     | 6: personnel 6                                                                                                                                        | `FOR UPDATE`: ý định ghi, ở lại `OrganizationApi`                                                                                                                                                     |
| 27  | `updateEmployeeOfficialFields`            | `OrganizationApi`     | 1: personnel 1                                                                                                                                        |                                                                                                                                                                                                       |
| 28  | `getEmployee`                             | `OrganizationReadApi` | 39: identity-access 14, personnel 10, requests 7, catalog 4, licensing 3, data-import 1                                                               |                                                                                                                                                                                                       |
| 29  | `getEmployeeByCode`                       | `OrganizationReadApi` | 2: identity-access 1, personnel 1                                                                                                                     |                                                                                                                                                                                                       |
| 30  | `getEmployeesByCodes`                     | `OrganizationReadApi` | 2: data-import 1, installation 1                                                                                                                      |                                                                                                                                                                                                       |
| 31  | `getCompanyEmailDomains`                  | `OrganizationReadApi` | 2: data-import 1, licensing 1                                                                                                                         |                                                                                                                                                                                                       |
| 32  | `getEmployees`                            | `OrganizationReadApi` | 47: requests 22, licensing 9, personnel 7, catalog 6, identity-access 2, budgets 1                                                                    |                                                                                                                                                                                                       |
| 33  | `searchActiveEmployees`                   | `OrganizationReadApi` | 1: identity-access 1                                                                                                                                  |                                                                                                                                                                                                       |
| 34  | `getEmployeeProfile`                      | `OrganizationReadApi` | 1: identity-access 1                                                                                                                                  |                                                                                                                                                                                                       |
| 35  | `lookupForEmployeeImport`                 | `OrganizationReadApi` | 2: data-import 1, installation 1                                                                                                                      |                                                                                                                                                                                                       |
| 36  | `lockForEmployeeImport`                   | `OrganizationReadApi` | 1: data-import 1                                                                                                                                      | `FOR SHARE` trên phòng ban (đã đọc code: không phải `FOR UPDATE`)                                                                                                                                     |
| 37  | `lockDepartmentForEntry`                  | `OrganizationReadApi` | 1: catalog 1                                                                                                                                          | `FOR SHARE`                                                                                                                                                                                           |
| 38  | `isWorkEmailTaken`                        | `OrganizationReadApi` | 1: personnel 1                                                                                                                                        |                                                                                                                                                                                                       |
| 39  | `departmentsWithoutHead`                  | `OrganizationReadApi` | 1: data-import 1                                                                                                                                      |                                                                                                                                                                                                       |
| 40  | `readLocalSeedFixture`                    | `OrganizationReadApi` | 1: installation 1                                                                                                                                     | chỉ đọc, cho `dev:seed`                                                                                                                                                                               |
| 41  | `activateCostCenterDirectionForLocalSeed` | `OrganizationApi`     | không có                                                                                                                                              | **xóa** 31/10/2026 (Owner): không caller, `dev:seed` thôi ghi dòng kích hoạt; xóa cả `CostCenterCatalogueService.recordLocalSeedActivation` và `CostCenterRepo.recordLocalSeedActivation` chỉ nó dùng |
| 42  | `getOwningUnits`                          | `OrganizationReadApi` | 15: requests 8, licensing 5, budgets 1, data-import 1                                                                                                 |                                                                                                                                                                                                       |
| 43  | `requireUnitCostCenter`                   | `OrganizationReadApi` | 2: requests 2                                                                                                                                         | kiểm thuần trên giá trị đã đọc, không chạm CSDL                                                                                                                                                       |
| 44  | `getDepartmentUse`                        | `OrganizationApi`     | không có                                                                                                                                              | bộ đọc "đang được dùng"; không module nào gọi qua facade (chỉ spec/integration)                                                                                                                       |
| 45  | `getCostCenterUse`                        | `OrganizationApi`     | không có                                                                                                                                              | như trên                                                                                                                                                                                              |
| 46  | `getProfileNotices`                       | `OrganizationReadApi` | 2: data-import 1, personnel 1                                                                                                                         |                                                                                                                                                                                                       |
| 47  | `getOnboardingFacts`                      | `OrganizationReadApi` | 2: installation 1, onboarding 1                                                                                                                       |                                                                                                                                                                                                       |

Kết quả: **36** phương thức ở `OrganizationReadApi`, **11** ở `OrganizationApi` lúc tách, **10** sau khi Owner cho xóa `activateCostCenterDirectionForLocalSeed` (31/10/2026) (`emitChange`, `setReportingCurrency`, `createOrganization`,
`createUnitCostCenter`, `createDepartment`, `createEmployeeWithPlacement`, `lockEmployeeForUpdate`, `updateEmployeeOfficialFields`,
`activateCostCenterDirectionForLocalSeed`, `getDepartmentUse`, `getCostCenterUse`). Người gọi: **167** lớp trong `src/` (bản thiết kế đếm
169 file, gồm cả file spec và hàm tự do): **156** chỉ đọc nên chuyển hẳn sang `OrganizationReadApi`, **11** dùng cả hai nên inject cả hai, **0** chỉ ghi.
Hai lớp ghi nhiều nhất là `DevSeedApi` và `InstallationApi` (cổng khởi tạo); sáu lớp của `personnel` khóa nhân viên `FOR UPDATE` và một sửa trường
chính thức của nhân viên. Bốn phương thức (`emitChange`, `activateCostCenterDirectionForLocalSeed`, `getDepartmentUse`, `getCostCenterUse`) không module nào gọi qua facade: ba cái đầu/cuối được test và harness gọi nên giữ; `activateCostCenterDirectionForLocalSeed` chết từ trước HEAD và Owner cho xóa 31/10/2026 (cùng chuỗi service/repo chỉ nó dùng). Quy ước tên trường, một cho mọi nơi: `organization` là `OrganizationApi`, `organizationReads` là `OrganizationReadApi`.

Lớp dùng cả hai (11): `data-import/employee-import/confirmation/employee-import-confirmation.service`, `installation/public/dev-seed.api`, `installation/public/installation.api`, `operating-parameters/reporting-currency.service`, `personnel/leave/leave.service`, `personnel/offboarding/offboarding-frame.service`, `personnel/offboarding/offboarding-preconditions.service`, `personnel/public/super-admin-event.api`, `personnel/super-admin-event/profile-correction.service`, `personnel/transfer/transfer-change.service`, `personnel/transfer/transfer-preconditions.service`.

**Task 5.2–5.3 — đã làm (31/10/2026).** `organization/public/organization-read.api.ts` (`OrganizationReadApi`, 6 dependency trong constructor, R4) giữ
36 phương thức đọc, `organization.api.ts` còn 11; thân phương thức chép nguyên văn, chữ ký không đổi. `organization.module.ts` khai và export cả
hai, `PUBLIC_CONTRACT_EXPORTS` thêm `OrganizationModule: OrganizationReadApi`. 167 lớp trong `src/` đổi bằng script đọc cây TypeScript (không
grep): 156 lớp chỉ đọc đổi hẳn sang `organizationReads: OrganizationReadApi`, 11 lớp dùng cả hai inject thêm `organizationReads` ngay sau
`organization`; các spec, `test/integration` và `test/support` sửa theo (provider của `TestingModule` đổi sang `OrganizationReadApi`).
`pnpm arch:graph` chỉ đổi số cạnh (`data_import → organization` 11 → 12, `installation` 9 → 11, `operating_parameters` 5 → 6, `personnel` 75 → 81,
vì lớp dùng cả hai import hai file), **không có cạnh module mới**. Hai lớp dùng cả hai vượt 8 tham số của ESLint (cứng, không ngoại lệ): sửa
bằng cách chuyển trách nhiệm, không thêm nợ. `SuperAdminEventApi` bỏ `organization` và gọi `ProfileCorrectionService.lockSubject` (khóa nhân
viên `FOR UPDATE` nằm ở service đã có `organization`); `DevSeedApi` đưa `IdentityAccessApi` và bộ sinh mật khẩu vào `DevSeedCredentialsService`
(`installation/dev-seed/dev-seed-credentials.service.ts`, giữ token `LOCAL_PASSWORD_GENERATOR`). Module card `organization` liệt kê hai facade với từng
phương thức; hướng dẫn dev mới (ví dụ "gọi sang module khác"), `ARCHITECTURE.md` và các card nhắc `OrganizationApi` đã khớp code.

**Phase 6 — đã làm (31/10/2026).** Task 6.1: `huong-dan-dev-moi.md` và `ARCHITECTURE.md` khớp code sau Phase 1–5 (bảng tên và từ vựng service
đọc trỏ về `module-structure.md`, codec `.json.ts`, `column=` trong log, hai facade `organization`); câu "chưa được dev mới đi thử (O7)" giữ nguyên.
Task 6.2: `pnpm arch:capabilities --module requests` in cột tầng L0–L3 cho từng capability, từ cùng đồ thị và cùng hàm tìm capability có
controller mà gate `capability-graph` dùng (`controllerCapabilities` trong `scripts/arch/capability-graph.cjs`; gate gọi hàm đó, không còn bản riêng).
Luật tầng: có controller thì L3; còn lại, không import capability nào thì L0, chỉ import L0 thì L1, import ít nhất một L1 hoặc L2 thì L2.
Danh sách ngoại lệ "L3 bị import" vẫn ở gate (một nguồn); lệnh in tên bên import cạnh mỗi L3 bị import. **Bảng tầng của module card `requests`
lệch với lệnh và đã được sửa theo lệnh, không sửa lệnh**: luật L1/L2 cũ ("lõi nhánh" và "dịch vụ dùng chung") là phân loại tay, mà `spend` và
`plan-line` có đúng cạnh ra của một L2 (`plan-line` và `request-view` cùng import `access-request` và `spend`), nên `spend`, `plan-line` chuyển
L1 → L2, `status` (không controller, không cạnh) vào L0; L3 20 capability và L0 `access-request`, `outcome` giữ nguyên. Test
`scripts/verify/capability-graph.test.mjs` (không tạo file `capabilities.test.mjs` riêng: lệnh đã có test ở file này) đọc bảng module card so với
đầu ra của lệnh nên lệch là đỏ. Task 6.3 ở _Verification and handoff_ của [plan](plan.md).

### Tương thích

Mọi phase giữ `openapi.json` đúng byte, `prisma/` không đổi, không migration, không đổi env. Phase 2 là phase duy nhất
đổi đường chạy (parse khi đọc): một bản ghi JSON sai hình dạng nay thành 500 `JsonColumnShapeError` thay vì lỗi ở nơi
khác — đó là mục đích; test integration của repo liên quan chứng minh bản ghi đúng vẫn đọc như cũ.

## Owner decisions

| Mã                                                                                                                        | Câu hỏi                        | Phương án                                                                                                                                                                                                                                                                          | Đề xuất                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `OD-F1`                                                                                                                   | Job/listener log gì khi lỗi?   | **A** `describeForOperator` (name, code/SQLSTATE, retryable, subject id) + stack chỉ cho lỗi không dự kiến; **B** như A nhưng không bao giờ stack; **C** giữ `error.name`                                                                                                          | A                                            |
| `OD-F2`                                                                                                                   | Cột JSON kiểm thế nào khi đọc? | **A** codec zod `decode`/`encode` một file mỗi cột, gate cấm `as unknown as` trong repo/mapper; **B** chỉ type guard tay (`isRequestPolicy`), không zod; **C** giữ cast kèm comment                                                                                                | A                                            |
| `OD-F3`                                                                                                                   | Graph của lệnh đặt ở đâu?      | **A** giữ chỗ hiện tại, chỉ đổi tên `<lệnh>-cli.module.ts` và ghi bảng tên vào rule + gate (7 file đổi tên); **B** dời cả 7 về `src/cli/<lệnh>/` (provider/repo của lệnh vẫn ở module, chỉ module Nest dời); **C** chỉ ghi bảng vào rule                                           | A                                            |
| `OD-F4`                                                                                                                   | Từ vựng service đọc            | **A** ba tên + đổi tên cơ học `directory/lookup/reader/read/support` (≈ 17 file); **B** ba tên chỉ cho file mới, file cũ giữ                                                                                                                                                       | A                                            |
| `OD-F5`                                                                                                                   | Facade `organization`          | **A** tách `OrganizationReadApi` khỏi `OrganizationApi` (169 file ở 11 module sửa import, không đổi chữ ký); **B** giữ một lớp, module card nhóm phương thức theo người gọi                                                                                                        | A                                            |
| `OD-F4` sai khác                                                                                                          | Hậu tố `-record`               | Hậu tố `-record` cho 5 service cổng ghi dùng chung (`vendor-record`, `account-record`, `session-record`, `department-record`, `employee-record`); lý do: `<x>.service.ts` trơn nghĩa là một use case và đã bị `DepartmentService`, `SessionService` chiếm — **chờ Owner xác nhận** | **Owner xác nhận 31/10/2026: giữ `-record`** |
| **Owner quyết 31/10/2026:** "sửa hết toàn bộ finding còn lại theo spec/plan" → `OD-F1` → `OD-F5` = **A** (phương án đề    |
| xuất); cho phép chạy jest (`pnpm test`, `test:gates`, `test:http`, `test:integration`, `test:e2e`) trong phiên này với    |
| ba vai implement / test / review độc lập, lặp tới khi review không còn finding. Docker Desktop lúc bắt đầu **không chạy** |
| (`docker version` lỗi npipe): integration/E2E ghi `pending` cho tới khi Owner khởi động Docker hoặc cấp PostgreSQL test.  |

**Owner quyết 31/10/2026 (tối), sau Round C và integration/E2E xanh:** (1) **giữ** hậu tố `-record`; (2) **xác nhận** bảng tầng `requests` sửa theo lệnh (`spend`, `plan-line` → L2; `status` L0 cô lập); (3) **xóa** `OrganizationApi.activateCostCenterDirectionForLocalSeed` (và `recordLocalSeedActivation` của service/repo chỉ nó dùng).

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                                                                       | Cấp test                                          | Kết quả mong đợi                                                                                                      | Bằng chứng sau implement                                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV2-01      | `describeForOperator` với `TransientDatabaseError(40P01)`, Prisma P2002, lỗi nghiệp vụ, `Error` trần                                      | unit `src/infrastructure/observability`           | chuỗi có name + code + retryable; không có `message` của lỗi nghiệp vụ                                                | `operator-error.spec.ts` 18 ca xanh (thêm lỗi thô retryable, cause, `JsonColumnShapeError`, giá trị không phải `Error`, stack không message); `pnpm test` 296 suites / 4 178 tests xanh (31/10/2026)                                                                          |
| RV2-01      | gate: `(x as Error).name` trong bất kỳ file non-spec của `src/` (không chỉ `*.job.ts`/`*.listener.ts`: 12 trong job, 6 trong service/api) | gate `module-layout`                              | đỏ trên cây `bbbbe81` (18), xanh sau Phase 1                                                                          | đỏ 18 → 0; `pnpm test:gates` 16 suites, 323 passed + 2 skipped; tester độc lập chạy bốn đột biến (a–d), cả bốn làm test/gate đỏ, cây đã khôi phục (chi tiết ở báo cáo của tester, không gán riêng cho luật nào ở đây)                                                         |
| RV2-01      | `RequestWorkLoop.attempt` khi một sweep ném lỗi                                                                                           | unit cạnh file                                    | log một dòng có kind + mô tả; sweep kế vẫn chạy (hành vi cũ)                                                          | `request-work.job.spec`, `email-dispatch.job.spec`, `year-end.job.spec`, `organization-change.service.spec` xanh (lỗi không dự kiến có trace, lỗi retryable không trace, không `s3cr3t`)                                                                                      |
| RV2-02      | mỗi codec: `decode` giá trị đúng, thiếu trường, sai kiểu, `null`                                                                          | unit `<cột>.json.spec.ts`                         | đúng → giá trị; sai → `JsonColumnShapeError` nêu bảng/cột, không nêu giá trị                                          | spec của cả 22 cột, của `policy` bản nháp và `json-column.spec` xanh; có ca "dòng ghi trước 23/10/2026 vẫn đọc được" cho mã lỗi seat đã bỏ; `encode` khẳng định bằng giá trị cụ thể                                                                                           |
| RV2-02      | repo đọc bản ghi thật đã ghi bởi code cũ (seed của integration)                                                                           | integration module liên quan                      | đọc như trước; không bản ghi nào trong seed vi phạm codec                                                             | `pending (Docker)`; kèm truy vấn mã lỗi seat của Owner trên CSDL đã triển khai, ghi ở plan                                                                                                                                                                                    |
| RV2-02      | gate: `as unknown as` trong mọi file non-spec của `src/modules` (không chỉ `*.repo.ts`/`*.mapper.ts`)                                     | gate `module-layout`                              | đỏ trên `bbbbe81` (17 dòng ở 9 file; con số 11 của bản thiết kế chỉ đếm cột JSON), xanh sau Phase 2                   | đỏ 17 → 0; `pnpm test:gates` xanh                                                                                                                                                                                                                                             |
| RV2-03      | gate: tên `*.module.ts` ngoài bảng; `<lệnh>-cli.module.ts` ngoài nơi `OD-F3` chọn                                                         | gate `module-layout`                              | đỏ trên `bbbbe81` (≥ 8), xanh sau Phase 3; `extension-wiring` 11 graph vẫn xanh                                       | đỏ 8 trên `bbbbe81` (đo bằng tắt `it.skip` tạm), xanh sau khi đổi tên 8 module; L3 chạy trong `pnpm test:gates`; `extension-wiring` 11 graph và 9 mục ngoại lệ không đổi, `module-graph` xanh                                                                                 |
| RV2-04      | gate: `*.service.ts` có hậu tố `-directory/-lookup/-reader/-read/-support`                                                                | gate `module-layout`                              | đỏ trên `bbbbe81`, xanh sau Phase 4 (khi `OD-F4` = A)                                                                 | đỏ 17 trên `bbbbe81`, xanh sau khi đổi 17 file (12 chỉ đọc sang `-facts`/`-query`/`-view`, 5 service ghi sang `-record`); L4 chạy trong `pnpm test:gates`                                                                                                                     |
| RV2-05      | `module-graph` R10 và `arch:check` sau tách facade; mọi module gọi vẫn compile                                                            | gate + `pnpm typecheck`                           | xanh; `PUBLIC_CONTRACT_EXPORTS` +1 dòng, không mục nào khác đổi                                                       | `arch:check` 0; `test:gates` 16 suites / 325 passed (R10 giữ, `PUBLIC_CONTRACT_EXPORTS` +1 dòng); `typecheck` 0; module-graph chỉ đổi số cạnh, không cạnh mới; `pnpm test` 291 suites / 4 122 tests, `test:http` 51 suites / 1 272 tests xanh; integration `pending (Docker)` |
| RV2-06      | `pnpm arch:capabilities --module requests` in tầng L0–L3 của 36 capability; bảng tầng của module card `requests` khớp lệnh                | script `scripts/verify/capability-graph.test.mjs` | 36 dòng có cột tầng; mỗi tầng đúng capability của bảng card; không capability dưới L3 import capability có controller | `node --test scripts/verify/capability-graph.test.mjs` 27 tests xanh (có ca đỏ khi card lệch, thử bằng cách đưa `spend` về L1); bảng card sửa theo lệnh (`spend`, `plan-line` L1 → L2, `status` vào L0)                                                                       |
| Bất biến    | `openapi.json`, `prisma/` sau **mọi** phase                                                                                               | `git diff --exit-code`                            | không đổi                                                                                                             | exit 0 sau Phase 0–6 (và sau các vòng sửa review); `pnpm openapi:export` chạy lại cũng không đổi byte nào                                                                                                                                                                     |
| Bất biến    | HTTP contract và integration của module bị chạm                                                                                           | `test:http`, `test:integration`                   | số test bằng trước, xanh (Owner cho phép chạy)                                                                        | `test:http` toàn bộ 51 suites / 1 272 tests xanh; sau vòng sửa review chạy lại module bị chạm (`data-import`, `requests`, `personnel`) 12 suites / 302 tests xanh; integration `pending (Docker)`                                                                             |

## Definition of Done

- [ ] Mọi luật mới của gate đỏ trên `bbbbe81` (bằng chứng số đếm) và xanh trên cây cuối; không thêm danh sách ngoại lệ mới
      ngoài các cast ở `infrastructure` ghi lý do.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; `openapi.json` đúng byte; `prisma/`
      không đổi.
- [ ] `module-structure.md` có bảng tên Nest module và từ vựng service đọc; `huong-dan-dev-moi.md` mục 4 và 5 cập nhật
      (graph theo tên file; đọc log job).
- [ ] Mọi `OD-F*` có câu trả lời Owner ghi ngày; phương án không chọn không làm.
- [ ] Không tăng `eslint-suppressions.json`; gỡ được mục nào thì hạ trần gate `lint-debt` cùng thay đổi.
- [ ] Tài liệu vận hành bị ảnh hưởng (`containers.md` mục log nếu có) cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

- 31/10/2026: soạn spec lượt 2 từ review tĩnh trên `bbbbe81` (AI theo yêu cầu Owner). Chưa implement, chưa test sản phẩm,
  chưa nghiệm thu. Owner chưa review.
- 31/10/2026: Phase 0, 1, 2 implement trên `bbbbe81` (chưa commit); L1 và L2 bật trong gate, L3 và L4 viết sẵn và `it.skip` tới Phase
  3 và 4. Bằng chứng trong _Verification and handoff_ của [plan](plan.md). Integration/E2E `pending` (Docker không chạy).
- 31/10/2026: Phase 3 và 4 implement trên cùng cây (chưa commit): 8 Nest module của lệnh đổi tên, 17 service đổi tên theo bảng 4.1,
  L3 và L4 bật (không còn `it.skip`). Bằng chứng ở _Verification and handoff_ của [plan](plan.md). Phase 5 chưa làm.
- 31/10/2026: Phase 5 và 6 implement trên cùng cây (chưa commit): `OrganizationApi` tách thành `OrganizationReadApi` (36 phương thức) và
  `OrganizationApi` (11), 167 lớp đổi (156 chỉ đọc, 11 dùng cả hai), module-graph không có cạnh mới; hướng dẫn dev mới và `ARCHITECTURE.md`
  khớp code; `pnpm arch:capabilities --module requests` in tầng L0–L3 và bảng tầng của module card `requests` sửa theo lệnh (`spend`, `plan-line`
  L1 → L2, `status` vào L0). Hai việc Low ghi ở RV2-04 (`budget-wire-view`, `DepartmentFactsService`). Bằng chứng ở _Verification and handoff_
  của [plan](plan.md). Chờ review độc lập; Owner chưa review; integration/E2E `pending (Docker)`.
- 31/10/2026: sai khác với `OD-F4` = A đã ghi: hậu tố `-record` cho 5 service cổng ghi dùng chung (xem _Owner decisions_), **chờ Owner xác nhận**.
- 31/10/2026: sửa dòng đầu của spec (một mảnh dòng bảng bị dán trước tiêu đề bởi một lần sửa trước, do regex không escape) và đặt đúng ô codec của `policy` bản nháp vào bảng RV2-02; không đổi nội dung nào khác.
- 31/10/2026: review độc lập Round C đóng RC-01 → RC-05 sau sửa (RC-01 High: harness integration `reassignment-harness.ts` truyền sai
  facade — typecheck không bắt, chỉ integration bắt). **Rủi ro còn lại trước merge:** (1) integration/E2E chưa chạy (Docker) trong khi
  Phase 2 đổi đường đọc/ghi 22 cột JSON và Phase 5 đổi DI của 167 lớp; tester cho thấy đột biến thân phương thức `OrganizationReadApi`
  không làm test HTTP hay (trừ một) unit nào đỏ — facade chỉ được integration chứng minh; (2) truy vấn mã lỗi seat trên CSDL đã triển
  khai chưa chạy; (3) `-record` và bảng tầng `requests` mới chờ Owner xác nhận; (4) diff > 390 file, nên commit theo phase, Phase 5 riêng.
  Trạng thái lúc ghi: `implemented-local`, chưa `ready-for-owner-review`.
- 31/10/2026 (tối): Owner mở Docker và cho phép chạy đủ: integration `3398 passed / 4 skipped`, timing 28, serial 92, E2E 36 — bằng số của
  Prompt 09, không hồi quy; khảo sát chỉ đọc 22 cột `jsonb` trên CSDL đã triển khai: không dòng nào vi phạm codec (`seat_baseline_import_rows`
  0 dòng). Trạng thái: `ready-for-owner-review`. Còn chờ Owner: xác nhận `-record`, bảng tầng `requests`, quyết xóa
  `activateCostCenterDirectionForLocalSeed`; CI cây mới; commit theo phase.
- 31/10/2026 (tối, sau): Owner quyết giữ `-record`, xác nhận bảng tầng `requests`, xóa `activateCostCenterDirectionForLocalSeed` (+ chuỗi
  `recordLocalSeedActivation` chỉ nó dùng); `OrganizationApi` còn 10 phương thức. Còn chờ Owner: CI cây mới, commit theo phase.
