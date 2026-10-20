# Spec: GOV.1/GATE.2 — hạng mục theo Story và contract capability chính xác

- Phụ trách: AI theo giao việc Owner (Prompt 20, 19/10/2026).
- Thiết kế ban đầu bởi: Owner qua Prompt 20 — finding `PLAN-01` (cách chia hạng mục) và `GATE2-01` (bề mặt public nội
  module suy từ hậu tố, ownership port `ACCOUNT_SESSIONS`) của review sau
  [Wave B](../h5-wave-b-identity-access-capability-recovery/spec.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không có Story/AC mới; nghiệp vụ hiện hành giữ nguyên), BE `bdc9fe8` (`dev` = `origin/dev`,
  commit Wave B của Owner). Không ADR mới; ADR-0011/0012 vẫn `Proposed`, lát này không chạm.
- Nhóm roadmap: governance + gate trước khi lập hạng mục G3–G10 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, người lập hạng mục (dev hoặc AI) không thể tạo spec mới gom Story chỉ vì cùng nhóm G, che hạng mục quá lớn
bằng một câu Size exception, để AC `partial` không có chủ, hay để một AC của nhóm G mồ côi/hai chủ so với scope map của
nhóm: `pnpm rules:check` từ chối các dạng đó. Đồng thời gate
cấu trúc chỉ coi một file capability là public trong module khi nó nằm trong registry contract chính xác — kể cả khi
importer là thư mục dùng chung — nên đặt tên `*.service.ts`/`*.types.ts` hay đặt file vào `mappers/`/`policies/` không còn
mở được helper/type riêng; port phiên dùng chung có một owner cấp module.

## Sizing decision

- Container: bó finding `PLAN-01` + `GATE2-01` (Prompt 20) và `PLAN-02` + `GATE2-02` (Prompt 20A) giao trực tiếp bởi Owner,
  sau commit Wave B `bdc9fe8`; không thuộc nhóm roadmap nào.
- Mode: `technical-enabler`
- Outcome and owner: gate làm việc của BE (rule sizing, scope map nhóm G và `check-rules.mjs`) cùng gate kiến trúc
  (`architecture-structure` và port module-level của `identity-access`) phải chặt trước khi thiết kế G3–G10 dựa vào
  chúng; owner là bộ rule/gate của repo, không phải capability nghiệp vụ.
- Boundaries: không transaction, bảng, migration, HTTP, OpenAPI hay sự kiện mới; bảo mật không đổi. Phase A/C chỉ đổi
  Markdown, config và checker Node; Phase B/D chỉ đổi test gate, registry và vị trí khai báo một port (import + wiring
  Nest), giữ nguyên token, chữ ký method, SQL và hành vi.
- Not larger: không gồm H6/H7/H8, ROOT.1, hardening `CP0-09`/`CP0-10`/AUTH.1/AUTH.2/INF.1, bảng phân rã G3 thật hay hạng
  mục G3 nào; không sửa hàng loạt spec lịch sử.
- Not smaller: bốn phase cùng là gate mà việc lập hạng mục G3–G10 dựa vào; Phase C/D (Prompt 20A) vá đúng hai khe hở
  của Phase A/B trước checkpoint; đều là thay đổi không hành vi, review và rollback trong một lần. Owner giao gộp ở
  Prompt 20 và 20A.
- Siblings: none — hạng mục phía sau ghi ở bảng dưới.
- Scope map: n/a — technical enabler ngoài nhóm G; không có Story/AC.

## Primary Story/AC

| Story | AC                                   | Coverage | Phần còn lại thuộc                                                                                                           |
| ----- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| —     | PLAN-01, GATE2-01, PLAN-02, GATE2-02 | n/a      | gỡ chặn hạng mục G3 đầu tiên (tên dự kiến `g3-catalog-foundation`, chưa tạo — Owner chọn khi phân rã G3) và mọi hạng mục mới |

## Supporting references

- [Rule work-item sizing](../../../rules/work-item-sizing.md) (tạo ở lát này) và [module structure](../../../rules/module-structure.md).
- [Wave B spec/plan](../h5-wave-b-identity-access-capability-recovery/spec.md): nguồn của 23 contract nội module hiện có
  consumer và của hai port `ACCOUNT_SESSIONS`, `APPROVAL_ROLE_HOLDINGS`.
- [Audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md) (E5–E7) và GATE.1 (`5b75930`).
- Tracker điều phối ngoài repo: `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`.

## Explicit out of scope

- Sửa 16 hạng mục `legacy` hoặc 14 hạng mục `sizingGrandfathered` cho khớp mẫu mới (chỉ pin metadata Wave B).
- Bảng phân rã **thật** của G3 (hay nhóm nào khác): lập ở lượt lập kế hoạch G3 trên nguồn Docs có thẩm quyền; lát này chỉ
  định nghĩa định dạng và checker (Phase C).
- Chứng minh scope map đủ so với Docs: checker không đọc generator User Stories; người review so pin Docs và số đếm khai
  báo với nguồn.
- `APPROVAL_ROLE_HOLDINGS` giữ ở `accounts/account.types.ts` (consumer duy nhất là `accounts`).
- Controller, DTO, wire schema, query, Prisma, OpenAPI, auth/recovery behavior, package, deployment.

## Dependencies and blockers

- Đầu vào: Wave B ở `bdc9fe8` (`dev` = `origin/dev`, `crossCapabilityImports` rỗng). Không blocker.
- Không cần quyết định Owner mới; ownership `ACCOUNT_SESSIONS` theo Prompt 20 (file module-level).

## Ownership: module, data, API

- Phase A: `docs/rules/work-item-sizing.md` (mới, nguồn chuẩn), router `docs/rules/README.md`, `AGENTS.md`,
  `CONTRIBUTING.md`, `docs/workspace/README.md`, `_template/{README,spec,plan}.md`, `scripts/check-rules{,.test}.mjs`,
  `rules-check.config.json` (`sizingGrandfathered`).
- Phase B: `src/architecture-structure.spec.ts` (registry `INTRA_MODULE_CONTRACTS`), `src/module-graph.spec.ts`
  (đặc tả token port), `src/modules/identity-access/identity-access.ports.ts` (mới) và đúng các file import/wiring port.
- Phase C (Prompt 20A): `docs/rules/work-item-sizing.md` (mục scope map), mẫu spec (`- Scope map:`),
  `docs/workspace/README.md`, `scripts/check-rules{,.test}.mjs`, `rules-check.config.json` (`roadmap`).
- Phase D (Prompt 20A): `src/architecture-structure.spec.ts` (chiều ranh giới + 7 mục registry), `module-structure.md`,
  `ARCHITECTURE.md`. Không đổi file `src/modules/**`.
- Không bảng, không operation HTTP/CLI, không Nest submodule mới. Contract giữ nguyên: token `Symbol(ACCOUNT_SESSIONS)`,
  `AccountSessions.revokeAllSessions(tx, appUserId, reason, now)`, binding `useExisting: SessionDirectoryService` ở
  `IdentityAccessModule` và `RecoveryModule`.

## Behavior and design

### Phase A — GOV.1

Rule chuẩn [work-item-sizing.md](../../../rules/work-item-sizing.md): tám quy tắc, bốn chế độ, quy ước `full`/`partial`/
`n/a`, năm trường Size exception, năm ví dụ (gom đúng, tách đúng, gom sai, tách sai, enabler), plan có phase/checkpoint
và không ngưỡng cứng số file. Mục `## Sizing decision` có bảy trường `- Field:`; checker đọc bằng parser
section/table/bullet sẵn có, không thêm dependency Markdown.

Checker từ chối với hạng mục không `legacy`, không `sizingGrandfathered`:

| #   | Ca từ chối                                                                                | Thông báo (rút gọn)                                         |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | thiếu `## Sizing decision`                                                                | `missing section "## Sizing decision"`                      |
| 2   | `Mode` lạ; trường bắt buộc trống/placeholder                                              | `"- Mode:" must be one of …`; `needs "- <Field>:"`          |
| 3   | `single-story` với 0 hoặc nhiều Story                                                     | `single-story needs exactly one …; found N`                 |
| 4   | `grouped-stories` dưới hai Story                                                          | `grouped-stories needs at least two …`                      |
| 5   | `split-story` không dòng `partial`, hoặc `Siblings` không nêu hạng mục                    | `split-story needs at least one partial row` / `… Siblings` |
| 6   | dòng `partial` có cột cuối rỗng, `—`, `none`, `n/a` hoặc không nêu tên hạng mục           | `partial row "…" needs the item that owns the remaining AC` |
| 7   | `technical-enabler` claim `full`/`partial`, hoặc không nêu hạng mục phía sau              | `technical-enabler claims Story coverage` / `… downstream`  |
| 8   | trên ba Story không `## Size exception`                                                   | `N primary Stories; at most 3 …`                            |
| 9   | Size exception thiếu/placeholder một trong năm trường                                     | `"## Size exception" needs "- <Field>:"`                    |
| 10  | lập luận dựa trên nhóm G (`all G3`, `same G`, `toàn bộ G3`, `cùng một G`)                 | `"…" uses the roadmap group as the sizing reason`           |
| +   | dòng `full` thiếu AC chính xác hoặc còn phần chưa làm; `n/a` ngoài enabler hoặc nêu Story | `needs the exact AC` / `must not leave remaining AC` / …    |

Grandfathering: `sizingGrandfathered` (14 hạng mục lập 18–19/10 trước GOV.1) chỉ miễn sizing, vẫn chịu mọi kiểm tra mẫu
cũ (kể cả "trên ba Story cần Size exception"). Ratchet: mục không có thư mục, mục trùng `legacy`, mục đã có
`## Sizing decision` đều lỗi; test `the repository grandfathers no item created after GOV.1` ghim tập 14 tên ban đầu nên
thêm tên mới phải sửa test (lộ ra khi review). Danh sách `legacy` không đổi.

### Phase B — GATE.2

**Trước:** `isPrivateCrossAreaImport` coi mọi `*.service.ts`/`*.types.ts` của capability khác là public (trừ
`password-hasher.service.ts`), nên một helper mới đặt tên `internal-helper.service.ts` vượt gate.

**Sau:** một import nội module qua ranh giới phần (capability ↔ capability, root ↔ capability) là public chỉ khi đích là:

1. file trong registry chính xác `INTRA_MODULE_CONTRACTS` (đường dẫn tương đối `src/`, kèm lý do public); hoặc
2. bề mặt public ở root theo rule có sẵn (`<module>.module.ts`, `*-http.module.ts`, `*-facade.module.ts`, facade,
   `*.types.ts`, `*.errors.ts`); hoặc
3. file trong thư mục dùng chung cấp module (`dto/`, `errors/`, `mappers/`, `policies/`), như rule ownership hiện hành.

`*.module.ts` vẫn ghép mọi provider. Ratchet hai chiều trên cây thật: entry không có file ⟹ lỗi; entry không còn consumer
xuyên phần ⟹ lỗi; import mới tới file chưa đăng ký ⟹ lỗi. Không ledger, không wildcard, không hậu tố. (Phase B còn miễn
thư mục dùng chung làm **importer**; Phase D đóng khe hở đó.)

Registry sau Phase B: 24 file — 23 contract có consumer ở `bdc9fe8`, cộng `identity-access.ports.ts` thay phần
`ACCOUNT_SESSIONS` của `account.types.ts`. Sau Phase D: 31 file (thêm 7 file lỗi, bảng dưới); lý do từng mục nằm ngay
trong registry:

| Module            | Contract                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-access` | `identity-access.ports.ts`; `accounts/`: `account-directory`, `action-link`, `action-link-revocation`, `credential`, `invitation-redemption`, `role-grant`, `successor-eligibility` (`.service.ts`), `account.types.ts`; `approval-roles/approval-role-directory.service.ts`; `auth/`: `password-change`, `session-directory`, `token` (`.service.ts`); `recovery/recovery-ticket.service.ts` |
| `organization`    | `cost-center/`: `cost-center-catalogue.service.ts`, `cost-center.service.ts`, `cost-center.types.ts`; `department/`: `department-directory.service.ts`, `department.types.ts`; `employee/employee-directory.service.ts`; `job-title/`: `job-title-catalogue.service.ts`, `job-title.types.ts`; `project/`: `project.service.ts`, `project.types.ts`                                           |

**Port phiên:** `ACCOUNT_SESSIONS`/`AccountSessions` chuyển từ `accounts/account.types.ts` sang
`identity-access.ports.ts` ở root module — consumer là `accounts` (`AccountStatusService`) và `recovery`
(`HolderCredentialReset`), implementer là `auth` (`SessionDirectoryService`); file root này là contract nội module
đăng ký ở registry, **không** thuộc bề mặt liên module (`architecture-boundaries` không mở `*.ports.ts`). Một khai báo
`Symbol('ACCOUNT_SESSIONS')` duy nhất ⟹ cùng một token trong mọi graph. `APPROVAL_ROLE_HOLDINGS` ở lại
`accounts/account.types.ts`: consumer duy nhất là `SuccessorEligibility` của `accounts` (owner theo consumer),
`approval-roles` chỉ hiện thực nó.

### Phase C — PLAN-02 (Prompt 20A): scope map của nhóm G

Định dạng duy nhất ở [rule](../../../rules/work-item-sizing.md#scope-map-của-nhóm-g): heading
`### Work-item decomposition: Gx` dưới mục nhóm trong `docs/roadmap.md`; pin Docs/BE; `- Active: <n> Story, <m> AC.`;
bảng `Story | AC | Disposition | Owner | Remaining owner | Reason | Order`. Hạng mục mới nêu G ở `- Container:` và có
`- Scope map:` một link mỗi G tới heading đó; Story luôn thuộc một G; `n/a` chỉ cho enabler ngoài G (hạng mục này dùng
`n/a`). Config `workItems.roadmap` bật kiểm tra; test ghim config thật bật nó.

Checker (`checkScopeMaps` + `checkScopeLinks`) từ chối: (1) G thiếu link Scope map; (2) link sai heading/nhóm hoặc nhóm
chưa có map; (3) disposition lạ; (4) một khóa Story/AC hai dòng; (5) `full` không đúng một chủ; (6) `partial` thiếu chủ
hoặc chủ phần còn lại; (7) `deferred` thiếu đích tồn tại/lý do; (8) `not affected` có chủ hoặc không lý do; (9) chủ không
đăng ký/không có spec+plan; (10) khóa trong spec không có trong map với hạng mục là chủ; (11) dòng map mà spec chủ không
claim; (12) claim `full`/`partial` mâu thuẫn map; thêm: thiếu pin/`Active`, số đếm lệch bảng, sai cột, Story ngoài G.
Giới hạn: không chứng minh map **đủ** so với Docs (không đọc generator User Stories) — reviewer so pin và số đếm.

### Phase D — GATE2-02 (Prompt 20A): thư mục dùng chung làm importer

`crossesModuleParts` có chiều: capability/root → thư mục dùng chung và thư mục dùng chung ↔ nhau vẫn tự do; thư mục dùng
chung → capability/root vượt ranh giới (cần bề mặt public ở root hoặc mục registry). Cây thật có 10 cạnh như vậy:

| Importer (thư mục dùng chung)                   | Đích                                                                               | Xử lý                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `catalog/mappers/catalog-application.mapper`    | `catalog/catalog.types.ts`                                                         | bề mặt public ở root, giữ                                    |
| `identity-access/mappers/auth.http-errors`      | `identity-access/identity-access.errors.ts`                                        | bề mặt public ở root, giữ                                    |
| `identity-access/mappers/account.http-errors`   | `accounts/account.errors.ts`                                                       | đăng ký: mapper dùng chung của route accounts + auth         |
| `identity-access/mappers/auth.http-errors`      | `auth/auth.errors.ts`                                                              | đăng ký: mapper dùng chung của route auth + access           |
| `organization/mappers/organization.http-errors` | `cost-center/`, `department/`, `employee/`, `job-title/`, `project/` `*.errors.ts` | đăng ký 5 file: mapper dùng chung của mọi route organization |
| `organization/mappers/project.mapper`           | `project/project.types.ts`                                                         | đã đăng ký (Phase B), lý do bổ sung consumer                 |

Không cạnh nào tới repo/helper/service riêng, nên không cần dời file; không ledger, wildcard hay miễn trừ mới. Mapper
không dời được vào một capability vì mỗi mapper phục vụ controller của ít nhất hai capability (rule thư mục dùng chung).

Transaction, concurrency, migration, jobs/storage: không áp dụng (không đổi runtime path ngoài vị trí import).

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case)                                                                                | Cấp test                      | Kết quả mong đợi                                    | Bằng chứng sau implement                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------- | ---------------------------------------- |
| PLAN-01 ca 1–10, +     | fixture từng ca từ chối ở bảng Phase A                                                                             | `rules:test` (node:test)      | đỏ trên checker cũ, xanh sau; thông báo cụ thể      | [plan](plan.md#verification-and-handoff) |
| PLAN-01 bốn chế độ     | fixture hợp lệ `single-story`, `grouped-stories`, `split-story`, `technical-enabler`                               | `rules:test`                  | 0 lỗi                                               | [plan](plan.md#verification-and-handoff) |
| PLAN-01 grandfather    | miễn đúng sizing; tên thừa/trùng legacy/đã có Sizing ⟹ lỗi; config thật ⊆ 14 tên                                   | `rules:test`                  | ratchet hai chiều                                   | [plan](plan.md#verification-and-handoff) |
| PLAN-01 trên repo thật | hạng mục tạm thời sai từng ca trong `docs/workspace/items/`                                                        | `rules:check` rồi xóa         | exit 1, đúng thông báo; cây trở lại byte-identical  | [plan](plan.md#verification-and-handoff) |
| GATE2-01 lỗ hậu tố     | `internal-helper.service.ts`, `private-state.types.ts` xuyên capability                                            | unit synthetic                | đỏ trên gate `bdc9fe8`, xanh sau                    | [plan](plan.md#verification-and-handoff) |
| GATE2-01 registry      | contract thật được nhận; bỏ một contract thật ⟹ vi phạm; entry thừa/không file ⟹ lỗi                               | unit synthetic + cây thật     | ratchet hai chiều                                   | [plan](plan.md#verification-and-handoff) |
| GATE2-01 đột biến      | thêm entry giả; xóa entry thật; thêm import tới service chưa đăng ký                                               | `jest architecture-structure` | mỗi đột biến đỏ đúng test; khôi phục byte-identical | [plan](plan.md#verification-and-handoff) |
| Port phiên             | một khai báo symbol; API và recovery bind cùng token tới `SessionDirectoryService`; hai consumer inject đúng token | `module-graph.spec.ts`        | xanh trước (vị trí cũ) và sau (vị trí mới)          | [plan](plan.md#verification-and-handoff) |
| PLAN-02 ca 1–12        | fixture từng ca từ chối ở Phase C; thiếu pin/`Active`, số đếm lệch, sai cột, Story ngoài G                         | `rules:test`                  | đỏ trên checker Prompt 20, xanh sau                 | [plan](plan.md#verification-and-handoff) |
| PLAN-02 hợp lệ         | gom nhóm, một Story tách cho hai sibling có thật, hai G hai link, enabler ngoài G; grandfathered miễn đúng phần    | `rules:test`                  | 0 lỗi                                               | [plan](plan.md#verification-and-handoff) |
| PLAN-02 đột biến       | nhân đôi một AC; bỏ dòng chủ của một split hợp lệ                                                                  | `rules:test` + repo thật      | đỏ đúng thông báo; khôi phục byte-identical         | [plan](plan.md#verification-and-handoff) |
| PLAN-02 trên repo thật | item + map G9 tạm cho 12 ca và một ca hợp lệ                                                                       | `rules:check` rồi xóa         | 12 ca exit 1, đối chứng exit 0; byte-identical      | [plan](plan.md#verification-and-handoff) |
| GATE2-02 chiều         | `mappers/`, `policies/`, `dto/` → repo/helper/type riêng; shared → root private; shared → contract; part → shared  | unit synthetic + cây thật     | đỏ trên gate Prompt 20 (3 ca), xanh sau             | [plan](plan.md#verification-and-handoff) |
| GATE2-02 đột biến      | mapper import repo; bỏ mục `account.errors.ts`; thêm mục thừa                                                      | `jest architecture-structure` | đỏ đúng test; khôi phục byte-identical              | [plan](plan.md#verification-and-handoff) |
| Không đổi hành vi      | session revocation, recovery, e2e graph, OpenAPI                                                                   | unit/integration/e2e/OpenAPI  | xanh; `openapi.json` byte-identical `14fd428b…`     | [plan](plan.md#verification-and-handoff) |

## Definition of Done

- [x] Mọi ca PLAN-01, PLAN-02, GATE2-01 và GATE2-02 có test đỏ-trước/xanh-sau; chế độ hợp lệ và ratchet có test.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; OpenAPI byte-identical.
- [x] Rule chuẩn đến được từ `AGENTS.md`; AGENTS/CONTRIBUTING/workspace chỉ giữ câu ngắn + link.
- [x] Không thêm mục legacy/ledger/allowlist nào ngoài registry contract chính xác; `legacy` không đổi.
- [x] Roadmap, items index, metadata Wave B (`bdc9fe8`) và tracker ngoài repo cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

19/10/2026 — lập theo Prompt 20. Lệch so với bản nháp đầu: số contract có consumer ở `bdc9fe8` là 23 (đếm lại từ đồ thị
thật; con số 25 của bản nháp sai), registry cuối 24.

19/10/2026 — Prompt 20A khép hai khe hở trước checkpoint, cùng hạng mục: `PLAN-02` (scope map nhóm G được checker đối
chiếu) và `GATE2-02` (thư mục dùng chung làm importer chịu contract; registry 24 → 31). Sửa kèm: trường `Outcome and
owner` từng bị Prettier biến dấu `+` đầu dòng thành bullet con. Owner review chưa có; chưa nghiệm thu.
