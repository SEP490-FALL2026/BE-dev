# Plan: GOV.1/GATE.2 — hạng mục theo Story và contract capability chính xác

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bdc9fe8`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (Prompt 20; finding `PLAN-01`, `GATE2-01`; Prompt
  20A; finding `PLAN-02`, `GATE2-02`).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026, Prompt 20 + 20A trên cùng cây làm việc chưa commit trên `bdc9fe8`).
  Revision: commit `c760705` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026, không PR); remote CI chưa
  có bằng chứng.

## Before coding

Preflight 19/10/2026: `dev` = `origin/dev` = `bdc9fe8ab2aa432a7fae0d2252de306b548e2ab1`, ahead/behind `0/0`, cây sạch
(0 path). `bdc9fe8` là commit Wave B của Owner (message `refactor: align identity access contracts by capability`, trùng
message của Wave A `19cf3b1`); chứa item `h5-wave-b-identity-access-capability-recovery`, code/test/OpenAPI Wave B và
`LEGACY.crossCapabilityImports` rỗng. Node v24.0.1, pnpm 11.1.3. `openapi.json` SHA-256 `14fd428b…d23d8`. Docs `9416fe0`
(cây Docs có 2 path dirty không thuộc lát này, không đọc/sửa). Hash trước của 778 file tracked lưu ngoài repo để so cuối.

Hiện trạng đo được: 23 file capability có consumer xuyên phần trong module (`identity-access` 13, `organization` 10);
`ACCOUNT_SESSIONS` khai ở `accounts/account.types.ts`, consumer `accounts/account-status.service.ts` và
`recovery/holder-credential-reset.service.ts`, implementer `auth/session-directory.service.ts`, bind ở
`identity-access.module.ts` và `recovery.module.ts`; `APPROVAL_ROLE_HOLDINGS` chỉ có consumer `accounts`.

Preflight Prompt 20A (19/10/2026): HEAD = `origin/dev` = `bdc9fe8`, `0/0`; đúng cây Prompt 20 (23 tracked sửa + 4 mới,
file tracked trùng hash cuối Prompt 20, `openapi.json` `14fd428b…`); hash từng file Prompt 20 lưu ngoài repo. Đo được:
checker không đọc scope map; 10 cạnh từ thư mục dùng chung vào capability/root (bảng ở spec Phase D).

## Tasks

### Phase A — GOV.1

### Task 1: test đỏ cho mọi ca sizing

- Files: `scripts/check-rules.test.mjs`.
- Depends on: none.
- Acceptance: fixture builder có `## Sizing decision`; 10 ca từ chối + ca phụ, 4 chế độ hợp lệ, ratchet grandfather và
  test ghim 14 tên; đỏ trên checker `bdc9fe8` vì assertion (không lỗi cú pháp).
- Verify: `node --test scripts/check-rules.test.mjs` → 10 fail (9 `ERR_ASSERTION`, 1 `TypeError` do config thiếu khóa).

### Task 2: checker sizing và danh sách grandfather

- Files: `scripts/check-rules.mjs`, `rules-check.config.json`.
- Depends on: Task 1.
- Acceptance: `checkSizing` + `sizingGrandfathered`; dùng parser section/table sẵn có, thêm parser bullet `- Field:`;
  `legacy` không đổi.
- Verify: `pnpm rules:test` → 28/28; `pnpm rules:check` → 0 lỗi trên repo thật.

### Task 3: rule chuẩn, router và mẫu

- Files: `docs/rules/work-item-sizing.md` (mới), `docs/rules/README.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `docs/workspace/README.md`, `docs/workspace/_template/{README,spec,plan}.md`.
- Depends on: Task 2.
- Acceptance: rule đến được từ `AGENTS.md`; nơi khác chỉ câu ngắn + link; một từ vựng (`full`/`partial`/`n/a`, bốn
  mode, năm trường Size exception).
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint A

`rules:test`, `rules:check`, `rules:format` xanh; mỗi ca từ chối tái hiện bằng hạng mục tạm trong repo rồi xóa, cây trở
lại byte-identical.

### Phase B — GATE.2

### Task 4: đặc tả lỗ hậu tố và port phiên

- Files: `src/architecture-structure.spec.ts`, `src/module-graph.spec.ts`.
- Depends on: Checkpoint A.
- Acceptance: `internal-helper.service.ts`, `private-state.types.ts` xuyên capability phải bị từ chối — đỏ trên gate
  `bdc9fe8` đúng lý do; đặc tả port (một khai báo symbol, cùng token bind ở API/recovery, hai consumer inject token đó)
  xanh trên vị trí cũ.
- Verify: `pnpm exec jest --runInBand src/architecture-structure.spec.ts src/module-graph.spec.ts`.

### Task 5: registry contract chính xác

- Files: `src/architecture-structure.spec.ts`.
- Depends on: Task 4.
- Acceptance: `INTRA_MODULE_CONTRACTS` thay suy luận hậu tố; ratchet file thiếu/entry thừa/import mới; test synthetic
  cho service lạ, type lạ, contract thật, thiếu contract thật, entry thừa.
- Verify: jest focused xanh; ba đột biến đỏ đúng test rồi khôi phục byte-identical.

### Task 6: port `ACCOUNT_SESSIONS` về `identity-access.ports.ts`

- Files: `src/modules/identity-access/identity-access.ports.ts` (mới), `accounts/account.types.ts`,
  `accounts/account-status.service.ts`, `auth/session-directory.service.ts`, `recovery/holder-credential-reset.service.ts`,
  `identity-access.module.ts`, `recovery.module.ts`, `src/module-graph.spec.ts`, `src/architecture-structure.spec.ts`.
- Depends on: Task 5.
- Acceptance: một owner khai báo; cùng token/chữ ký/binding; không export `SessionRepo`, không private export mới.
- Verify: jest identity-access + module graph; integration session revocation/recovery trên PostgreSQL cô lập.

### Checkpoint B

Gate focused xanh; registry hai chiều; không mục legacy/allowlist mới ngoài registry.

### Task 7: tài liệu kiến trúc và metadata

- Files: `docs/rules/module-structure.md`, `ARCHITECTURE.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`,
  `docs/workspace/items/h5-wave-b-identity-access-capability-recovery/plan.md`, plan/spec này; tracker ngoài repo.
- Depends on: Checkpoint B.
- Acceptance: rule public surface mô tả registry; port ở vị trí mới; Wave B pin `bdc9fe8`, bằng chứng local lịch sử giữ.
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Phase C — PLAN-02 (Prompt 20A)

### Task 8: test đỏ cho scope map

- Files: `scripts/check-rules.test.mjs`.
- Depends on: Task 7.
- Acceptance: fixture hợp lệ (gom, split hai sibling có thật, hai G, enabler ngoài G, grandfathered) và 12 ca từ chối +
  pin/`Active`/số đếm/cột/Story ngoài G + đột biến nhân đôi AC và bỏ dòng chủ; đỏ trên checker Prompt 20 vì assertion.
- Verify: `node --test scripts/check-rules.test.mjs`.

### Task 9: checker scope map, rule và mẫu

- Files: `scripts/check-rules.mjs`, `rules-check.config.json` (`roadmap`), `docs/rules/work-item-sizing.md`,
  `docs/workspace/_template/spec.md`, `docs/workspace/README.md`, spec này (`- Scope map: n/a`).
- Depends on: Task 8.
- Acceptance: `checkScopeMaps` + `checkScopeLinks`; một định dạng, một bộ tên cột; giới hạn so với Docs ghi rõ.
- Verify: `pnpm rules:test`, `pnpm rules:check`; item + map tạm trên repo thật rồi khôi phục byte-identical.

### Checkpoint C

`rules:test`, `rules:check`, `rules:format` xanh; 12 ca tạm trên repo thật exit 1, ca đối chứng exit 0.

### Phase D — GATE2-02 (Prompt 20A)

### Task 10: chiều ranh giới của thư mục dùng chung

- Files: `src/architecture-structure.spec.ts`, `docs/rules/module-structure.md`, `ARCHITECTURE.md`.
- Depends on: Checkpoint C.
- Acceptance: ba test synthetic đỏ trên gate Prompt 20; `crossesModuleParts` có chiều; 7 file lỗi được đăng ký với lý
  do; không ledger/wildcard/miễn trừ; không đổi `src/modules/**`.
- Verify: `jest` gate; đột biến shared → repo, bỏ contract, thêm mục thừa đỏ rồi khôi phục byte-identical.

### Checkpoint D

`pnpm check`, `openapi:export` byte-identical; metadata (roadmap, tracker) cập nhật.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24.0.1, pnpm 11.1.3, Docker 29.1.2, cây làm việc chưa commit trên `bdc9fe8`,
19/10/2026. Integration dùng PostgreSQL 17 (`postgres:17-alpine`) trong container riêng mỗi lượt (`127.0.0.1:55441`,
`:55442`), role `LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; container xóa sau lượt, log lưu đủ.

| Lệnh / kiểm tra AC                                                                                                                                                                        | Revision / môi trường      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                                         | Giới hạn / việc còn lại                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1: `node --test scripts/check-rules.test.mjs` trên checker `bdc9fe8`                                                                                                                 | `bdc9fe8` + test mới       | 28 test: 18 pass, **10 fail** — 9 `ERR_ASSERTION` (ca 1–10 và ratchet grandfather), 1 `TypeError` (config chưa có `sizingGrandfathered`); ca bốn chế độ hợp lệ xanh vì checker cũ bỏ qua sizing                                                                                                                                                                           | —                                                                                                                                       |
| Task 2: `pnpm rules:test`, `pnpm rules:check`                                                                                                                                             | cây sau Task 2             | 28/28; repo thật 0 lỗi (14 hạng mục grandfathered)                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                       |
| Checkpoint A: 16 hạng mục tạm sai `docs/workspace/items/zz-tmp-*` qua CLI thật                                                                                                            | cây sau Task 3             | mỗi ca exit 1 với đúng thông báo (thiếu Sizing, mode lạ, single 0/2 Story, grouped 1, split không partial, partial rỗng/`—`/`none`/`n/a`/không tên hạng mục, enabler claim Story/không downstream, 4 Story không exception, exception thiếu `Maximum scope`, `toàn bộ G3`); xóa hết, items index byte-identical, 0 thư mục sót                                            | —                                                                                                                                       |
| Checkpoint A: `rules:test`, `rules:check`, `rules:format`, `git diff --check`                                                                                                             | cây sau Task 3             | 28/28; 104 tệp/885 link 0 lỗi; format sạch; diff sạch                                                                                                                                                                                                                                                                                                                     | Prettier căn lại bảng Markdown (diff `-w`: roadmap/index chỉ thêm dòng mới)                                                             |
| Task 4: `jest` architecture-structure + module-graph trên gate `bdc9fe8`                                                                                                                  | `bdc9fe8` + test mới       | 2 fail đúng lý do (`internal-helper.service.ts`, `private-state.types.ts`: Expected `true`, Received `false`); đặc tả port (một symbol, cùng token bind API/recovery, hai consumer inject) **xanh** ở vị trí cũ                                                                                                                                                           | —                                                                                                                                       |
| Task 5: registry + đột biến                                                                                                                                                               | cây sau Task 5             | structure gate 40/40. Thêm `app-user.repo.ts` + `ghost.service.ts` → `unusedEntries`/`missingFiles` và test repo private đỏ; bỏ `credential.service.ts` → 6 cạnh mới (`auth` ×4, facade, `recovery`); thêm import `login.service` → `invitation-mail.service` → 1 cạnh mới; khôi phục byte-identical                                                                      | —                                                                                                                                       |
| Task 6: port + đột biến                                                                                                                                                                   | cây sau Task 6             | `jest` structure/module-graph/boundaries + `src/modules/identity-access`: 20 suite/276 test; `tsc --noEmit` exit 0; thêm `Symbol('ACCOUNT_SESSIONS')` thứ hai vào `account.types.ts` → test port đỏ, khôi phục byte-identical                                                                                                                                             | —                                                                                                                                       |
| `pnpm check`                                                                                                                                                                              | cây cuối                   | exit 0 (142 s): rules 104 tệp/886 link 0 lỗi, `rules:test` 28/28, format, prisma, lint, typecheck, unit 67 suite/987 test (+16 so với Wave B), script 19/19, test discovery, build                                                                                                                                                                                        | —                                                                                                                                       |
| `pnpm test:e2e`                                                                                                                                                                           | cây cuối                   | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                       |
| Integration tập trung: account-concurrency, account-management-http, auth-concurrency, auth-http, password-self-service ×4, super-admin-recovery, super-admin-transfer-http, recovery-cli | cây cuối, PostgreSQL riêng | exit 0; 11 suite/176 test (119 s); 0 `42501`; 0 database `slm_*_test` sót; container đã xóa                                                                                                                                                                                                                                                                               | —                                                                                                                                       |
| `pnpm test:integration` (toàn bộ)                                                                                                                                                         | cây cuối, PostgreSQL riêng | exit 0; 46 suite/625 test (312 s); 0 `42501`; 0 DB sót; container đã xóa                                                                                                                                                                                                                                                                                                  | U-01 không tái hiện ở lượt này                                                                                                          |
| `pnpm openapi:export`                                                                                                                                                                     | cây cuối                   | `openapi.json` SHA-256 `14fd428b…d23d8` = preflight; `git status` không đổi                                                                                                                                                                                                                                                                                               | —                                                                                                                                       |
| Quét cuối                                                                                                                                                                                 | cây cuối                   | 0 import `ACCOUNT_SESSIONS`/`AccountSessions` từ `account.types`; một khai báo `Symbol('ACCOUNT_SESSIONS')` (`identity-access.ports.ts`); registry 24 mục = 23 contract có consumer + port; không còn nhánh hậu tố cho capability (chỉ còn rule bề mặt root có sẵn); `LEGACY`, `LEGACY_PRIVATE_EXPORTS`, `CLI_ENTRY_FILES`, `PUBLIC_CONTRACT_EXPORTS`, `legacy` không đổi | thư mục dùng chung làm importer còn miễn trừ ở Prompt 20 — khép ở Phase D (Prompt 20A)                                                  |
| Task 8 (20A): `node --test scripts/check-rules.test.mjs` trên checker Prompt 20                                                                                                           | cây Prompt 20 + test mới   | 38 test: 30 pass, **8 fail** — đều `ERR_ASSERTION` (ca 1–12, pin/`Active`/số đếm/cột, Story ngoài G, đột biến, config chưa bật `roadmap`); các fixture hợp lệ xanh vì checker cũ bỏ qua map                                                                                                                                                                               | —                                                                                                                                       |
| Task 9 (20A): `rules:test`, `rules:check`                                                                                                                                                 | cây sau Task 9             | 38/38; repo thật 0 lỗi sau khi item này ghi `- Scope map: n/a` (checker bắt đúng thiếu trường trước đó)                                                                                                                                                                                                                                                                   | —                                                                                                                                       |
| Checkpoint C: item + map G9 tạm trên repo thật                                                                                                                                            | cây sau Task 9             | đối chứng exit 0; 12 ca exit 1 đúng thông báo (thiếu Scope map, sai anchor, disposition `done`, AC hai dòng, `full` không chủ, `partial` thiếu chủ còn lại, `deferred` đích không tồn tại, `not affected` có chủ, chủ không đăng ký, khóa spec ngoài map, chủ không claim khóa, `full` ↔ `partial`); roadmap + items index byte-identical, 0 thư mục sót                  | lượt đầu của script tạm có hai lỗi script (heading `Ownership:` thiếu `##`, giá trị mặc định nuốt `undefined`), sửa script rồi chạy lại |
| Task 10 (20A): `jest architecture-structure` trên gate Prompt 20                                                                                                                          | cây Prompt 20 + test mới   | 3 fail đúng lý do (`mappers/`, `policies/`, `dto/` → repo/helper/type riêng: Expected `true`, Received `false`)                                                                                                                                                                                                                                                           | —                                                                                                                                       |
| Task 10: sửa chiều + đăng ký 7 file lỗi + đột biến                                                                                                                                        | cây sau Task 10            | gate kiến trúc + module graph + boundaries 81/81 (structure 46). Đột biến: `mappers/account.http-errors` import `accounts/app-user.repo` → 1 cạnh mới; bỏ mục `account.errors.ts` → cạnh mapper đỏ và test contract thật đỏ; thêm mục `account-constraints.ts` → `unusedEntries`; khôi phục byte-identical                                                                | —                                                                                                                                       |
| `pnpm check` (20A)                                                                                                                                                                        | cây cuối                   | exit 0 (81 s): rules 104 tệp/905 link 0 lỗi, `rules:test` 38/38, format, prisma, lint, typecheck, unit 67 suite/993 test (+6 so với Prompt 20), script 19/19, test discovery, build                                                                                                                                                                                       | —                                                                                                                                       |
| `pnpm openapi:export` (20A)                                                                                                                                                               | cây cuối                   | `openapi.json` SHA-256 `14fd428b…d23d8` = trước Prompt 20; `git status` không đổi                                                                                                                                                                                                                                                                                         | —                                                                                                                                       |
| e2e / integration (20A)                                                                                                                                                                   | —                          | không chạy lại: 20A không đổi `src/modules/**` hay wiring runtime (chỉ test gate, checker, config, tài liệu); bằng chứng Prompt 20 ở trên giữ                                                                                                                                                                                                                             | U-01 không có lượt quan sát mới                                                                                                         |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (remote
      CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
