# Plan: hoàn thiện ranh giới bên trong module và luật kiến trúc cho dev mới

> **Owner override OD-R5 — 30/10/2026: giữ queue/Redis cho tương lai.** Task 2.6 dưới đây đã đổi từ xóa sang
> kiểm tra/refactor phần dự phòng. Không gỡ BullMQ, module/config/test queue, Redis service/volume hoặc config mẫu;
> không bật queue hay mở rộng nghiệp vụ khi chưa có use case. Ưu tiên hơn lựa chọn người thực hiện đề xuất trước đó.

> **Owner execution update — 30/10/2026:** triển khai theo [phụ lục cuối plan](#owner-execution-addendum-2026-10-30),
> gồm Tasks 8.1–8.3 (H7 sequence và API-DOC-F01/F03), ba vai trò implement/test/review và sửa hết finding trong scope.
> Phụ lục điều chỉnh quyền test, checkpoint và invariant OpenAPI của phần lịch sử bên dưới. Chưa implement ở lượt soạn.

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `25d5244` (review); implement từ BE `f498c74` trở đi.
- Phụ trách: Prompt 09 (Claude: Orchestrator `claude-opus-5-5`; Implementer, Tester `claude-sonnet-5-5`; Reviewer
  `claude-opus-5-5`). Thiết kế ban đầu bởi: AI theo yêu cầu Owner (30/10/2026).
- Owner review: chưa review (diff local); peer review: Reviewer độc lập, 10 finding đều đóng.
- Triển khai: `verified` — local: `local-implementation-verified` / `ready-for-owner-review` (31/10/2026) trên BE `f498c74` + cây chưa
  commit (dấu vân tay ngoài `docs/` `14ec31e0…`, 1 108 path); chưa stage/commit/push/deploy. PR: chưa có.

## Before coding

- Đọc [AGENTS.md](../../../../AGENTS.md), [module structure](../../../rules/module-structure.md),
  [test guide](../../../../test/README.md), [spec](spec.md) mục _Luật đích_ và _Đích của `requests`_,
  [review 30/10/2026](../../../reviews/be-architecture-readability-review-2026-10-30/README.md).
- Bắt đầu từ BE `f498c74` trở đi; `git status` sạch hoặc chỉ có thay đổi của chính task. Chạy `pnpm arch:capabilities`
  (Task 0.1) để đo lại bảng mốc; số khác thì cập nhật bảng trước khi làm tiếp.

### Quy tắc cho người hoặc AI thực hiện

- **Luôn làm:** một task một lượt thay đổi; chạy đúng mục `Verify` của task; sau **mọi** task chạy bộ bất biến dưới đây; di
  chuyển file thì sửa import trong `test/` cùng lúc (spec được import file private của `src`), chạy `pnpm arch:graph`,
  `pnpm arch:routes`, cập nhật module card; ghi bằng chứng (lệnh, revision, kết quả thật) vào bảng _Verification and
  handoff_; đánh dấu task xong trong plan.
- **Hỏi trước:** chạy `pnpm test:http`, `pnpm test:integration`, `pnpm test:e2e` khi Owner chưa cho phép trong phiên; thêm
  dependency; sửa `openapi.json`, `prisma/`, env schema, workflow, `Dockerfile` ngoài phạm vi task; thêm mục vào
  `GRAPH_WIRING_EXCEPTIONS` hoặc làm `eslint-suppressions.json` tăng.
- **Không bao giờ:** commit, push, deploy; đổi hành vi nghiệp vụ (ngoại lệ duy nhất: Task 1.4 theo `OD-R10`); nới một
  gate/test để nó xanh; sửa file của hạng mục khác đang mở; ghi `merged-dev`, `accepted` khi chưa có sự kiện thật.
- **Dừng và báo Owner khi:** `Verify` đỏ mà sửa cần đổi hành vi; gate R1 tìm ra listener thật sự thiếu; `openapi.json` đổi
  dù task không định đổi; task cần quyết định chưa có câu trả lời; file chạm vượt danh sách `Files` quá nửa (tách task, ghi
  lại).

Bộ bất biến sau mỗi task (từ gốc BE):

```bash
pnpm arch:check && pnpm typecheck && pnpm lint && pnpm test:gates && pnpm arch:docs:check
git diff --exit-code -- openapi.json prisma/   # trừ task ghi rõ được đổi
```

### Quyết định chặn task

| Task                       | Cần                                         | Làm được ngay khi chưa có quyết định                    |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| 0.1, 0.2, 1.1a, 1.2a, 1.2b | —                                           | có                                                      |
| 0.3                        | Owner gửi bằng chứng §8, quyết định O6, O7  | §8 bước 1 có run; 2A/2B, 3, 4, O6, O7 `pending` (Owner) |
| 1.1b                       | `OD-R1`                                     | không                                                   |
| 1.3, Phase 5               | `OD-R4`                                     | không                                                   |
| 1.4                        | `OD-R10`                                    | không                                                   |
| 2.1a → 2.5                 | `OD-R2`                                     | không                                                   |
| 2.6                        | `OD-R5`                                     | không                                                   |
| 2.7                        | `OD-R9`                                     | không                                                   |
| Phase 3, 4                 | `OD-R3`; Task 4.2 → 4.4 thêm duyệt Task 4.0 | không                                                   |
| 6.2                        | `OD-R7`                                     | phần không phụ thuộc ADR làm được                       |
| 7.6                        | `OD-R8`, số đo CI của Task 0.3              | không                                                   |
| 7.1 → 7.5                  | —                                           | có                                                      |

Song song an toàn (không chạm cùng file): Phase 7 Task 7.2 → 7.5 với Phase 1–3; Task 2.6, 2.7 với Phase 3. Phase 4 và 5 đi
sau Phase 3, tuần tự.

### Số đo mốc (30/10/2026, BE `25d5244` + WIP; đo lại ở `f498c74` bằng Task 0.1)

| Đo                                             | Mốc                                                                                                  | Đích cuối hạng mục                                | Sau (31/10/2026, cây local)                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Module có vòng capability                      | 7/14 (`catalog`, `finance`, `identity-access`, `licensing`, `organization`, `personnel`, `requests`) | 0                                                 | 0/14 (đo xuyên file gốc/`public/`)                                                                     |
| Cạnh capability → capability của `requests`    | 82, vòng 19 capability                                                                               | ≤ 50, không vòng                                  | 111, không vòng; tiêu chí thay thế Owner duyệt 31/10/2026                                              |
| Thư mục tầng kỹ thuật dưới module              | 10 (`mappers` ×6, `dto` ×2, `policies` ×2)                                                           | 0                                                 | 0                                                                                                      |
| Cảnh báo ESLint `src/` (complexity/dài/params) | 101 / 99 / 29 = 229                                                                                  | ≤ 120, `max-params` 0                             | 59 / 54 / 0 = 113; `requests` 37                                                                       |
| `Promise.all` trên client transaction          | 23 file                                                                                              | 0                                                 | 0 (gate R2 quét cả `src/`)                                                                             |
| Extension point có kiểm wiring theo graph      | 0/19                                                                                                 | 19/19                                             | 19/19 (8 ngoại lệ có lý do)                                                                            |
| Mục `LEGACY_PRIVATE_EXPORTS`                   | 4                                                                                                    | 0 (thay bằng R10)                                 | 0 (R10)                                                                                                |
| File spec integration/HTTP/E2E > 800 dòng      | 6                                                                                                    | 0                                                 | 0 (7 file tách, gate 800)                                                                              |
| Job `integration` CI (nghiệm thu §10)          | bước song song 1 142–1 280 s, job ≈ 24–27 phút, timeout 40                                           | `OD-R8`: ≤ 15 phút/shard hoặc mục tiêu mới ghi rõ | B: P5 = số đo 30–31 phút; timeout 40 vs quy tắc ≈ 47 → Owner; CI cây mới `remote-verification-pending` |
| devDependencies trong image `runtime`          | 31 (chép từ stage `build`)                                                                           | `OD-R9` = A: 0                                    | 0 (stage `production-dependencies`)                                                                    |
| Hook nuốt lỗi trong transaction                | 1 (`PersonnelFileHooks.each`)                                                                        | `OD-R10` = A: 0                                   | 0                                                                                                      |
| Việc mở của nghiệm thu 29/10/2026              | 8 dòng thiếu, 3 dòng phủ một phần (bảng _Đối chiếu_ của review)                                      | 0 chưa có chủ                                     | mỗi dòng có kết quả hoặc `pending` + chủ                                                               |

## Tasks

### Phase 0 — đo và quyết định (không đổi code nghiệp vụ)

### Task 0.1: công cụ đồ thị capability

- Files: tạo `scripts/arch/capability-graph.cjs`, `scripts/arch/capabilities.mjs`, `scripts/verify/capability-graph.test.mjs`;
  sửa `package.json` (script `arch:capabilities`), `scripts/README.md`.
- Depends on: none.
- Acceptance: `pnpm arch:capabilities` in mỗi module số cạnh và các vòng; `--module <m>` in từng cạnh kèm cạnh file;
  `--core` in mỗi file `src/core` và khu vực dùng nó. Số in ra ở BE `f498c74` được ghi vào bảng mốc.
- Verify: `pnpm arch:capabilities` → 7 module có vòng (hoặc số mới, ghi lại); `pnpm test:scripts` xanh.

`scripts/arch/capability-graph.cjs` (dùng chung cho lệnh và gate Task 3.1; đọc import bằng parser TypeScript):

```js
// Capability graph of each business module (docs/rules/module-structure.md, R6): which capability folder of a module
// imports which other capability folder of the same module. A file at the module root, public/ and *.module.ts wiring
// are not capabilities and are left out.
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, relative, resolve, sep } = require('node:path');
const ts = require('typescript');

// Modules whose capability graph must stay acyclic. Only grows; deleted once it holds every module (the gate then
// checks every module). Task 3.1 fills it first.
const CAPABILITY_DAG_MODULES = [];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const toSrc = (srcRoot, file) => relative(srcRoot, file).split(sep).join('/');

/** `modules/<m>/<capability>/…` → { module, capability }; capability is null for the module root and for public/. */
function placeOf(srcPath) {
  const parts = srcPath.split('/');
  const capability = parts.length > 3 && parts[2] !== 'public' ? parts[2] : null;
  return { module: parts[1], capability };
}

function importsOf(file) {
  const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  return importedFiles
    .map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => resolve(dirname(file), specifier))
    .map((base) => [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)))
    .filter(Boolean);
}

/** Map<module, Map<fromCapability, Map<toCapability, string[]>>>, the strings being `file -> file` edges. */
function capabilityGraph(srcRoot) {
  const graph = new Map();
  for (const file of sourceFiles(join(srcRoot, 'modules'))) {
    if (file.endsWith('.module.ts')) continue;
    const from = placeOf(toSrc(srcRoot, file));
    if (!from.capability) continue;
    for (const target of importsOf(file)) {
      const to = placeOf(toSrc(srcRoot, target));
      if (to.module !== from.module || !to.capability || to.capability === from.capability) continue;
      const byFrom = graph.get(from.module) ?? new Map();
      const byTo = byFrom.get(from.capability) ?? new Map();
      byTo.set(to.capability, [
        ...(byTo.get(to.capability) ?? []),
        `${toSrc(srcRoot, file)} -> ${toSrc(srcRoot, target)}`,
      ]);
      byFrom.set(from.capability, byTo);
      graph.set(from.module, byFrom);
    }
  }
  return graph;
}

/** Map<core file, sorted areas importing it from outside core>: an area is a module name or infrastructure/app/worker/cli. */
function coreUsers(srcRoot) {
  const users = new Map();
  for (const file of sourceFiles(srcRoot)) {
    const path = toSrc(srcRoot, file);
    if (path.startsWith('core/')) continue;
    const area = path.startsWith('modules/') ? path.split('/')[1] : path.split('/')[0];
    for (const target of importsOf(file)) {
      const core = toSrc(srcRoot, target);
      if (!core.startsWith('core/')) continue;
      users.set(core, [...new Set([...(users.get(core) ?? []), area])].sort());
    }
  }
  return users;
}

/** Strongly connected components of more than one capability (Tarjan), each sorted, the list sorted. */
function cyclesOf(edges) {
  let index = 0;
  const order = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  const nodes = new Set([...edges.keys(), ...[...edges.values()].flatMap((to) => [...to.keys()])]);
  const visit = (node) => {
    order.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of edges.get(node)?.keys() ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), order.get(next)));
      }
    }
    if (low.get(node) !== order.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) cycles.push(component.sort());
  };
  for (const node of [...nodes].sort()) if (!order.has(node)) visit(node);
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

module.exports = { CAPABILITY_DAG_MODULES, capabilityGraph, coreUsers, cyclesOf };
```

`scripts/arch/capabilities.mjs`:

```js
// `pnpm arch:capabilities [--module <m>] [--core]`: capability edges and cycles of each module (R6), or who uses each
// file of src/core (R7). Prints only; the gate is test/gates/capability-graph.gate-spec.ts.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { capabilityGraph, coreUsers, cyclesOf } = require('./capability-graph.cjs');

const srcRoot = join(process.cwd(), 'src');
const argument = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);

if (process.argv.includes('--core')) {
  for (const [file, areas] of [...coreUsers(srcRoot)].sort()) console.log(`${file}: ${areas.join(', ')}`);
} else {
  const only = argument('--module');
  for (const [module, edges] of [...capabilityGraph(srcRoot)].sort(([a], [b]) => a.localeCompare(b))) {
    if (only && module !== only) continue;
    const count = [...edges.values()].reduce((sum, to) => sum + to.size, 0);
    const cycles = cyclesOf(edges).map((cycle) => `[${cycle.join(' <-> ')}]`);
    console.log(`${module}: ${count} capability edges, cycles: ${cycles.join(' ') || 'none'}`);
    if (!only) continue;
    for (const [from, to] of [...edges].sort()) {
      for (const [target, files] of [...to].sort()) {
        console.log(`  ${from} -> ${target}`);
        for (const edge of files) console.log(`      ${edge}`);
      }
    }
  }
}
```

`scripts/verify/capability-graph.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { cyclesOf } = require('../arch/capability-graph.cjs');
const edges = (pairs) => new Map(pairs.map(([from, to]) => [from, new Map([[to, [`${from} -> ${to}`]]])]));

test('finds a cycle of two capabilities', () => {
  assert.deepEqual(
    cyclesOf(
      edges([
        ['a', 'b'],
        ['b', 'a'],
      ]),
    ),
    [['a', 'b']],
  );
});

test('finds no cycle in a chain', () => {
  assert.deepEqual(
    cyclesOf(
      edges([
        ['a', 'b'],
        ['b', 'c'],
      ]),
    ),
    [],
  );
});
```

### Task 0.2: ghi quyết định Owner

- Files: `docs/workspace/items/be-architecture-readability-hardening/spec.md` (cột _Owner_ của bảng _Owner decisions_).
- Depends on: Owner trả lời.
- Acceptance: `OD-R1` → `OD-R10` có câu trả lời, ngày; phương án khác đề xuất thì sửa spec/plan trước khi làm task bị chặn.
- Verify: `pnpm rules:check`, `pnpm rules:format` xanh.

### Task 0.3: đóng việc mở của nghiệm thu 29/10/2026

- Files: `docs/reviews/be-architecture-test-acceptance-2026-10-29/README.md` (bảng O6, O7; §5 dòng P5; §8 cột kết quả);
  `docs/workspace/items/be-architecture-boundaries-restructure/plan.md`,
  `docs/workspace/items/be-test-architecture-redesign/plan.md` (mục _Verification and handoff_); roadmap (cột bằng chứng
  hai hạng mục); bảng _Đối chiếu_ trong review 30/10/2026.
- Depends on: Owner gửi bằng chứng; không chặn task khác.
- Acceptance: mỗi việc có kết quả hoặc `pending` kèm người theo dõi:
  - §8 bước 1: run CI trên `dev` chứa `25d5244` (dừng cả cây tiến trình Prisma, §10) — kết luận `quality`,
    `http-contract`, `integration`; thời gian ba bước integration; artifact `test-timings-*`. Ghi số P5 thật vào §5.
  - §8 bước 2A/2B: run ID nhánh `ci-trial/deploy-gate`; A: `Deploy gate probe (no VPS)` chạy; B: probe `skipped` khi
    integration đỏ. Nhánh đã xóa.
  - §8 bước 3: run nightly trên `ci-trial/nightly` (integration, mutation, artifact `nightly-test-timings`).
  - §8 bước 4: sau lần deploy thường kế tiếp — `health/ready` 200, đăng nhập, log `Worker started`, `dist/cli.js --help` và
    `dist/inspect-cli.js --help` thoát 0.
  - O6: Owner chọn bằng chứng "xanh trên `main`" (run của lần merge `main` kế tiếp, hoặc chấp nhận bằng chứng `dev` + nhánh
    thử) và ghi vào bảng O.
  - O7: Owner đi 10 route ngẫu nhiên trong `docs/generated/routes.md` tới controller → service → repo; ghi route, thời gian,
    chỗ vướng (đầu vào cho Task 6.1).
- Verify: `pnpm rules:check`, `pnpm rules:format`; run ID mở được bằng `gh run view <id>`.

### Checkpoint

Bộ bất biến xanh; bảng mốc ghi số đo ở `f498c74`.

### Phase 1 — an toàn: wiring, transaction, lint, hook

### Task 1.1a: listener khai extension point nó đăng ký

- Files: 33 file `src/**/*.listener.ts` (liệt kê: `find src -name '*.listener.ts'`); tạo `test/support/nest-module-graph.ts`
  (chuyển `metadata`, `describeModule`, `collectGraph`, `tokenOf`, `tokenName`, kiểu `ModuleNode`, `Token` từ
  `test/gates/module-graph.gate-spec.ts`; gate đó import lại, không đổi test nào).
- Depends on: none.
- Acceptance: mỗi lớp export từ `*.listener.ts` có `static readonly binds = [<ExtensionPointClass>, …] as const;` đúng các
  extension point nó `bind`/`add` trong `onModuleInit`; `module-graph` gate giữ đúng số test và kết quả.
- Verify: bộ bất biến; `pnpm test:gates -- module-graph` cùng số test trước/sau; `pnpm test:discovery`.

```ts
@Injectable()
export class HeldNoticeHandoverListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;
  // constructor và onModuleInit giữ nguyên
}
```

### Task 1.1b: gate wiring theo graph (R1, AR-01)

- Files: tạo `test/gates/extension-wiring.gate-spec.ts`; sửa `src/core/extension/hook.ts` (xóa tham số `whenUnbound`,
  `canAnswer`, `assertHooksBound`), `src/core/extension/extension.spec.ts`, `test/http/platform/extension-points.http-spec.ts`
  (dòng 36 đang gọi `hook.canAnswer()` — đổi sang `hook.isBound()`); `docs/rules/module-structure.md` (mục Extension point:
  `binds`, ngoại lệ wiring, bỏ câu về `whenUnbound`).
- Depends on: Task 1.1a, Task 0.2 (`OD-R1`).
- Acceptance: các test dưới đây xanh trên cây thật và đỏ đúng thông điệp trên module tổng hợp. Lần chạy đầu trên cây thật
  có thể báo nhiều chênh lệch ở graph CLI (một facade inject `Hook` nhưng lệnh không gọi đúng phương thức cần nó). Mỗi
  chênh lệch: dừng, báo Owner; Owner phân loại — lỗi thật thì mở hạng mục sửa hành vi, hợp lệ thì thêm một mục
  `GRAPH_WIRING_EXCEPTIONS` có lý do. Ghi bảng phân loại vào _Verification and handoff_.
- Verify: `pnpm test:gates -- extension-wiring`; `pnpm test -- src/core/extension`; bộ bất biến.

Khung gate (chép cách chặn `@nestjs/config` của `module-graph.gate-spec.ts`):

```ts
import 'reflect-metadata';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Type } from '@nestjs/common';
import { AppModule } from '../../src/app/app.module';
import { WorkerModule } from '../../src/worker/worker.module';
import { InstallationModule } from '../../src/modules/installation/installation.module';
import { RecoveryCliModule } from '../../src/cli/recover/recover-cli.module';
import { SuperAdminEventCliModule } from '../../src/cli/record-super-admin-event/record-super-admin-event-cli.module';
import { InspectionModule } from '../../src/modules/installation/inspect/inspection.module';
import { MigrationPreflightModule } from '../../src/modules/installation/migration-preflight/migration-preflight.module';
import { SubscriptionOwnerAssignmentCliModule } from '../../src/cli/assign-subscription-owner/assign-subscription-owner-cli.module';
import { CostCenterDirectionCliModule } from '../../src/cli/cost-center-direction/cost-center-direction-cli.module';
import { DevSeedModule } from '../../src/modules/installation/dev-seed/dev-seed.module';
import { DemoDatasetModule } from '../../src/modules/installation/demo-dataset/demo-dataset.module';
import { Contributions } from '../../src/core/extension/contributions';
import { Hook } from '../../src/core/extension/hook';
import { Listeners } from '../../src/core/extension/listeners';
import { collectGraph, tokenName, tokenOf, type Token } from '../support/nest-module-graph';

jest.mock('@nestjs/config', () => ({
  ...jest.requireActual<object>('@nestjs/config'),
  ConfigModule: { forRoot: () => ({ module: class ConfigStubModule {} }) },
}));

/** Every Nest graph a process boots: the API, the worker and each out-of-HTTP command (db-roles has none). */
const PROCESS_GRAPHS: readonly (readonly [string, Type<unknown>])[] = [
  ['AppModule', AppModule],
  ['WorkerModule', WorkerModule],
  ['InstallationModule', InstallationModule],
  ['RecoveryCliModule', RecoveryCliModule],
  ['SuperAdminEventCliModule', SuperAdminEventCliModule],
  ['InspectionModule', InspectionModule],
  ['MigrationPreflightModule', MigrationPreflightModule],
  ['SubscriptionOwnerAssignmentCliModule', SubscriptionOwnerAssignmentCliModule],
  ['CostCenterDirectionCliModule', CostCenterDirectionCliModule],
  ['DevSeedModule', DevSeedModule],
  ['DemoDatasetModule', DemoDatasetModule],
];

/** Missing registrations an Owner decision allows: graph, extension point, absent binder and why. Starts empty. */
const GRAPH_WIRING_EXCEPTIONS: readonly { graph: string; point: string; binder: string; reason: string }[] = [];

type PointClass = abstract new (...args: never[]) => object;
const BASES = [Hook, Listeners, Contributions] as const;
const isPoint = (token: Token): token is PointClass =>
  typeof token === 'function' && BASES.some((base) => token.prototype instanceof base);
const bindsOf = (token: Token): readonly PointClass[] =>
  typeof token === 'function' ? ((token as { binds?: readonly PointClass[] }).binds ?? []) : [];
const injected = (token: Token): Token[] =>
  typeof token === 'function' ? ((Reflect.getMetadata('design:paramtypes', token) as Token[] | undefined) ?? []) : [];

function files(directory: string, suffix: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : files(path, suffix);
    return path.endsWith(suffix) ? [path] : [];
  });
}

/** Nest marks every @Injectable() class with this metadata key (INJECTABLE_WATERMARK of @nestjs/common). */
const isInjectable = (value: unknown): value is Type<unknown> =>
  typeof value === 'function' && Reflect.getMetadata('__injectable__', value) === true;

/** Every @Injectable class exported by a *.listener.ts of src/: the reference set of binders. */
function listenerClasses(): Type<unknown>[] {
  return files(join(process.cwd(), 'src'), '.listener.ts').flatMap((file) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the gate loads every listener file it finds
    Object.values(require(file) as Record<string, unknown>).filter(isInjectable),
  );
}

/** For one graph: each extension point it uses, mapped to the binders present in the graph. */
function wiringOf(root: Type<unknown>): Map<PointClass, Set<string>> {
  const wiring = new Map<PointClass, Set<string>>();
  const tokens = collectGraph(root).flatMap((node) => [...node.providers.map(tokenOf), ...node.controllers]);
  for (const token of tokens) {
    if (bindsOf(token).length > 0) continue;
    for (const dependency of injected(token)) if (isPoint(dependency)) wiring.set(dependency, new Set());
  }
  for (const token of tokens) for (const point of bindsOf(token)) wiring.get(point)?.add(tokenName(token));
  return wiring;
}

describe('extension point wiring per process graph (R1)', () => {
  const reference = new Map<PointClass, string[]>();
  for (const listener of listenerClasses()) {
    for (const point of bindsOf(listener)) reference.set(point, [...(reference.get(point) ?? []), listener.name]);
  }

  it('declares, on every listener class, the extension points it binds, each one injected in its constructor', () => {
    const wrong = listenerClasses()
      .filter(
        (listener) => bindsOf(listener).length === 0 || bindsOf(listener).some((p) => !injected(listener).includes(p)),
      )
      .map((listener) => listener.name);
    expect(wrong).toEqual([]);
  });

  it('lists every Nest graph a command of src/cli boots', () => {
    const named = files(join(process.cwd(), 'src', 'cli'), '.command.ts').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/then\(\s*\(m\)\s*=>\s*m\.(\w+)\s*\)/g)].map((match) => match[1]),
    );
    expect(named.filter((name) => !PROCESS_GRAPHS.some(([graph]) => graph === name))).toEqual([]);
  });

  it.each(PROCESS_GRAPHS)('%s carries every binder of each extension point it uses', (graph, root) => {
    const missing = [...wiringOf(root)].flatMap(([point, present]) =>
      (reference.get(point) ?? [])
        .filter((binder) => !present.has(binder))
        .filter(
          (binder) =>
            !GRAPH_WIRING_EXCEPTIONS.some((e) => e.graph === graph && e.point === point.name && e.binder === binder),
        )
        .map((binder) => `${point.name}: ${binder}`),
    );
    expect(missing).toEqual([]);
  });
});
```

Thêm một `describe` tổng hợp trong cùng file: hai lớp `class DemoPoint extends Listeners<string, unknown>`, một listener có
`binds = [DemoPoint]` và một service inject `DemoPoint`; một `@Module` có service mà không có listener ⇒ `wiringOf` trả
`DemoPoint` với tập rỗng và bên thiếu được nêu tên.

### Task 1.2a: luật R2 và sửa sáu module

- Files: `test/gates/module-layout.gate-spec.ts`; 14 file dưới `src/modules/` có `Promise.all` trên `tx`:
  `budgets/budget/budget-facts.repo.ts`, `catalog/catalog-entry/retirement/application-retirement.repo.ts`,
  `catalog/plan-terms/plan-terms.service.ts`, `identity-access/approval-roles/approval-role.service.ts`,
  `licensing/assignment/assignment-department.repo.ts`, `licensing/assignment/assignment.repo.ts`,
  `licensing/assignment/service-account-duty/service-account-duty.service.ts`, `licensing/expiry/expiry-queue.service.ts`,
  `licensing/expiry/expiry-reminder.service.ts`, `licensing/provisioning/open-grants/open-grant-task.repo.ts`,
  `licensing/public/licensing.api.ts`, `organization/employee/import-lookup.repo.ts`,
  `personnel/event-notice/department-open-work.repo.ts`, `personnel/offboarding/open-requests/open-requests.service.ts`.
- Depends on: none.
- Acceptance: luật `concurrentQueriesOnTransaction` có test tổng hợp (ba dạng đỏ: `tx.model.x()`, `repo.x(tx)`, biến
  `db = tx ?? this.prisma`; một dạng xanh: `Promise.all` chỉ trên `this.prisma`); gate chỉ còn báo các file của
  `requests` (Task 1.2b) — tạm ghi chúng vào test như danh sách còn lại, xóa ở Task 1.2b. Hành vi giữ nguyên.
- Verify: `pnpm test:gates -- module-layout`; bộ bất biến; `pnpm test:integration -- test/integration/budgets
test/integration/catalog test/integration/identity-access test/integration/licensing test/integration/organization
test/integration/personnel` (hỏi Owner); log không còn `client.query() when the client is already executing`.

Cách sửa (giữ thứ tự đọc như mảng cũ):

```ts
// trước
const [rows, total] = await Promise.all([
  tx.licenseAssignment.findMany({ where, orderBy, skip, take }),
  tx.licenseAssignment.count({ where }),
]);
// sau: một client transaction chạy từng truy vấn một (pg@9 không tự xếp hàng)
const rows = await tx.licenseAssignment.findMany({ where, orderBy, skip, take });
const total = await tx.licenseAssignment.count({ where });
```

Luật gate (thêm vào phần luật của `module-layout.gate-spec.ts`, dùng `codeOnly` có sẵn):

```ts
/** Index of the `)` closing the call whose `(` is at `open`. */
function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '(') depth += 1;
    if (code[index] === ')' && --depth === 0) return index;
  }
  return code.length;
}

/**
 * Files that run several queries at once on one transaction client (R2): a `Promise.all(...)` whose arguments name `tx`,
 * or a variable assigned from `tx ?? …` / `tx || …`, whether as `tx.model.x()` or as an argument `repo.x(tx)`.
 */
function concurrentQueriesOnTransaction(files: SourceFile[]): string[] {
  return files
    .filter(({ path }) => isModuleFile(path) && !isSpec(path))
    .filter(({ source }) => {
      const code = codeOnly(source);
      const aliases = [...code.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*tx\s*(?:\?\?|\|\|)/g)].map((match) => match[1]);
      const client = new RegExp(`\\b(?:${['tx', ...aliases].join('|')})\\b`);
      return [...code.matchAll(/Promise\.all\(/g)].some((match) => {
        const open = match.index + 'Promise.all'.length;
        return client.test(code.slice(open, closingParen(code, open)));
      });
    })
    .map(({ path }) => path)
    .sort();
}
```

### Task 1.2b: R2 trong `requests`

- Files: 9 file dưới `src/modules/requests/`: `access-request/open-request/open-request.repo.ts`,
  `access-request/open-request/open-request.service.ts`, `assessment/assessment-view.service.ts`,
  `finance-review/spend-view.service.ts`, `group-request-submission/group-submission-facts.service.ts`,
  `request-submission/request-preview.service.ts`, `spend/spend-request.repo.ts`,
  `spend-submission/plan-line-route.service.ts`, `spend-submission/supplement.service.ts`;
  `test/gates/module-layout.gate-spec.ts` (xóa danh sách còn lại).
- Depends on: Task 1.2a.
- Acceptance: gate R2 không còn danh sách tạm; hành vi giữ nguyên.
- Verify: `pnpm test:gates -- module-layout`; bộ bất biến; `pnpm test:integration -- test/integration/requests` (hỏi Owner).

### Task 1.3: cấu hình ESLint (R8, AR-07)

- Files: `eslint.config.mjs`, `package.json` (`lint`), 15 chỗ `any` ngoài spec trong `src/` (liệt kê bằng
  `npx eslint "src/**/*.ts" --rule "@typescript-eslint/no-explicit-any: error" -f unix`), `eslint-suppressions.json` (nếu
  `OD-R4` = A), `docs/rules/module-structure.md` (mục Kích thước).
- Depends on: Task 0.2 (`OD-R4`).
- Acceptance: `no-floating-promises`, `no-unsafe-argument`, `no-explicit-any` là `error` với 0 vi phạm; với `OD-R4` = A các
  rule kích thước là `error`, vi phạm hiện có nằm trong `eslint-suppressions.json` sinh bởi `eslint --suppress-all`,
  `--max-warnings` bỏ, vi phạm mới ở bất kỳ file nào làm `pnpm lint` đỏ. Rule viết lại đúng cơ chế mới (đếm nợ = tổng số
  trong `eslint-suppressions.json`).
- Verify: `pnpm lint` xanh; thêm tạm một hàm 61 dòng vào một service → `pnpm lint` đỏ; hoàn tác.

```js
// eslint.config.mjs — khối rules chung
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  'prettier/prettier': ['error', { endOfLine: 'auto' }]
},
// khối kích thước (OD-R4 = A): 'warn' → 'error', ngưỡng giữ nguyên
'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
complexity: ['error', 12],
'max-params': ['error', 8],
'max-depth': ['error', 4]
```

```bash
npx eslint "{src,test,scripts}/**/*.ts" --suppress-all   # một lần, ghi eslint-suppressions.json
# package.json: "lint": "eslint \"{src,test,scripts}/**/*.ts\""
# sau khi sửa vi phạm: npx eslint "{src,test,scripts}/**/*.ts" --prune-suppressions
```

### Task 1.4: hook hồ sơ nhân sự không nuốt lỗi trong transaction (AR-14, `OD-R10`)

- Files: `src/modules/personnel/event-notice/personnel-file-hooks.service.ts` (+ spec);
  `src/modules/personnel/public/personnel.extension-points.ts` (comment hợp đồng của `PersonnelFileHook`);
  `src/modules/personnel/README.md`; integration mới `test/integration/personnel/personnel-file-hooks.integration-spec.ts`.
- Depends on: Task 0.2 (`OD-R10` = A hoặc B). `OD-R10` = C: bỏ task, tạo hạng mục riêng.
- Acceptance: (khi `OD-R10` = A) test đỏ trước trên code hiện tại — (1) hook ném lỗi JavaScript khi ghi nghỉ việc ⟹ hiện lần
  ghi thành công và việc của hook mất; (2) hook gây lỗi SQL ⟹ hiện lỗi `25P02` ở câu sau, không trỏ tới hook. Sau sửa: cả
  hai ca lần ghi hoàn tác, lỗi gốc của hook tới exception filter; ba hook hiện có (`open-requests`, `role-duties`,
  `service-account-duty`) vẫn chạy đúng thứ tự trong ca thường.
- Verify: `pnpm test -- src/modules/personnel/event-notice`; `pnpm test:integration -- test/integration/personnel`
  (hỏi Owner); E2E `offboarding-revocation`, `department-transfer-review`.

```ts
// OD-R10 = A: a hook runs in the transaction of the write; one that throws rolls the write back, like a Listeners entry.
private async each(call: (hook: PersonnelFileHook) => Promise<void> | undefined): Promise<void> {
  for (const hook of this.hooks.all()) await call(hook);
}
```

### Checkpoint

Bộ bất biến xanh; HTTP và integration của module bị chạm xanh trên CI `dev`; ghi số đo vào bảng mốc.

### Phase 2 — layout nhất quán

Bảng đích của Task 2.1a → 2.1c lập từ người dùng thật của từng file (quét 30/10/2026). Quy tắc chọn đích: file chỉ một
capability dùng → vào capability đó; nhiều capability dùng mà các capability đó đã import một capability chung → vào
capability chung (không tạo cạnh mới); còn lại → gốc module, tên bắt đầu bằng tên module (R5). Spec đi theo file.

### Task 2.1a: bỏ thư mục kỹ thuật của `catalog`, `finance`, `licensing` (R3)

- Files: dưới `src/modules/`, theo bảng; import ở `src/` và `test/`.

| Hiện tại                                                    | Người dùng                     | Đích                                        |
| ----------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| `catalog/mappers/catalog-audit-event.mapper.ts`             | 7 capability                   | `catalog/catalog-audit-event.mapper.ts`     |
| `finance/mappers/finance-audit-event.mapper.ts`             | `exchange-rate`, `tax-profile` | `finance/finance-audit-event.mapper.ts`     |
| `finance/mappers/finance.http-errors.ts` (+spec)            | `currency`, `exchange-rate`    | `finance/finance.http-errors.ts`            |
| `licensing/mappers/licensing-audit-event.mapper.ts` (+spec) | 6 capability                   | `licensing/licensing-audit-event.mapper.ts` |
| `licensing/mappers/licensing.http-errors.ts`                | 6 capability                   | `licensing/licensing.http-errors.ts`        |

- Depends on: Task 0.2 (`OD-R2`).
- Acceptance: không còn `mappers/` ở ba module; `pnpm arch:capabilities --module finance` không vòng.
- Verify: bộ bất biến; `pnpm test -- src/modules/catalog src/modules/finance src/modules/licensing`;
  `pnpm test:http -- test/http/catalog test/http/finance test/http/licensing` (hỏi Owner).

### Task 2.1b: bỏ thư mục kỹ thuật của `identity-access` (R3)

- Files: dưới `src/modules/identity-access/`, theo bảng; import ở `src/` và `test/`.

| Hiện tại                                 | Người dùng                                               | Đích                                 |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| `mappers/account.http-errors.ts` (+spec) | `accounts`, `auth`                                       | `accounts/account.http-errors.ts`    |
| `mappers/auth.http-errors.ts`            | `access`, `auth`                                         | `auth/auth.http-errors.ts`           |
| `dto/account-management.dto.ts` (+spec)  | `accounts`, `auth`                                       | `accounts/account-management.dto.ts` |
| `dto/auth.dto.ts` (+spec)                | `access`, `auth`                                         | `auth/auth.dto.ts`                   |
| `policies/account.policy.ts` (+spec)     | `access`, `accounts`, `approval-roles`, `auth`, `public` | `accounts/account.policy.ts`         |

- Depends on: Task 0.2 (`OD-R2`).
- Acceptance: không còn `mappers/`, `dto/`, `policies/`; `pnpm arch:capabilities --module identity-access` ghi lại vòng còn
  lại (nếu có) cho Task 3.3b. Hướng dẫn cũ nhắc `identity-access/dto/account-management.dto.ts` — sửa link.
- Verify: bộ bất biến; `pnpm test -- src/modules/identity-access`; `pnpm test:http -- test/http/identity-access` (hỏi Owner).

### Task 2.1c: bỏ thư mục kỹ thuật của `organization`, `personnel` (R3)

- Files: dưới `src/modules/`, theo bảng; import ở `src/` và `test/`.

| Hiện tại                                                     | Người dùng                                   | Đích                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `organization/mappers/audit-event.mapper.ts`                 | 4 capability                                 | `organization/organization-audit-event.mapper.ts`                                                          |
| `organization/mappers/organization.http-errors.ts` (+spec)   | 4 capability                                 | `organization/organization.http-errors.ts`                                                                 |
| `organization/mappers/project.mapper.ts` (+spec)             | `department`, `project`                      | `organization/project/project.mapper.ts`                                                                   |
| `organization/dto/project-wire.dto.ts`                       | `department`, `project`                      | gộp vào `organization/project/project.dto.ts` nếu không trùng tên; không thì `project/project-wire.dto.ts` |
| `organization/mappers/local-seed-fixture.mapper.ts`          | `public`                                     | `organization/organization-local-seed-fixture.mapper.ts`                                                   |
| `personnel/mappers/personnel-access.http-errors.ts`          | `leave`, `notice`, `offboarding`, `transfer` | `personnel/personnel-access.http-errors.ts`                                                                |
| `personnel/mappers/personnel-audit-event.mapper.ts`          | 8 capability                                 | `personnel/personnel-audit-event.mapper.ts`                                                                |
| `personnel/mappers/personnel-unavailable.spec.ts`            | spec không có file nguồn cùng tên            | cạnh file nó kiểm, đổi tên `<file nguồn>.spec.ts`                                                          |
| `personnel/policies/grounds.policy.ts` (+spec)               | 5 capability + `public`                      | `personnel/personnel-grounds.policy.ts`                                                                    |
| `personnel/policies/personnel-self-action.policy.ts` (+spec) | `leave`, `notice`, `offboarding`, `transfer` | `personnel/personnel-self-action.policy.ts`                                                                |

- Depends on: Task 0.2 (`OD-R2`).
- Acceptance: không còn thư mục kỹ thuật nào dưới `src/modules` (`find src/modules -type d -name mappers -o -type d -name
dto -o -type d -name policies` rỗng); vòng của `organization` không còn đi qua `mappers`.
- Verify: bộ bất biến; `pnpm test -- src/modules/organization src/modules/personnel`; `pnpm test:http -- test/http/organization
test/http/personnel` (hỏi Owner).

### Task 2.2: cửa công khai và gốc module (R4, R5)

- Files: `src/modules/identity-access/account-sessions.extension-points.ts` → `src/modules/identity-access/auth/account-sessions.types.ts`
  (sửa comment trỏ `architecture-structure.spec.ts`, file không còn); `src/modules/notifications/email-dispatcher.service.ts`,
  `email-templates.mapper.ts` (+spec), `payload-cipher.service.ts` (+spec) → capability `src/modules/notifications/email/`;
  `src/modules/organization/onboarding-facts-transaction.repo.spec.ts` (spec ở gốc, không có file nguồn cùng tên) → cạnh file
  nó kiểm, đổi tên cho khớp; `docs/rules/module-structure.md` (một module được nhiều facade `public/<x>.api.ts`, mỗi facade một
  lớp `<X>Api`).
- Depends on: Task 2.1a → 2.1c.
- Acceptance: ở BE `f498c74`, đây là toàn bộ vi phạm R4/R5 (đã quét 30/10/2026: mọi `public/*.api.ts` chỉ export lớp
  `*Api`); rule viết đúng thực tế.
- Verify: bộ bất biến; `pnpm test -- src/modules/notifications src/modules/identity-access src/modules/organization`.

### Task 2.3: `budgets` thành lõi + capability

- Files: `src/modules/budgets/budget/{budget-view,commitment,proposal,version,year-end}/` lên một cấp thành capability
  `src/modules/budgets/<tên>/`; `src/modules/budgets/budget/` giữ lõi (repo, types, errors, policy dùng chung);
  `src/modules/budgets/budgets.module.ts`; module card.
- Depends on: Task 2.1a → 2.1c.
- Acceptance: lõi `budget/` hiện không import nhóm nào (đã quét), nên sau khi nâng không có cạnh lõi → capability; điểm vào
  nhóm cũ (`<…>-<group>.service.ts`) thành file thường của capability; `pnpm arch:capabilities --module budgets` không vòng.
- Verify: bộ bất biến; `pnpm test -- src/modules/budgets`; `pnpm test:integration -- test/integration/budgets` (hỏi Owner).

### Task 2.4: `src/core` chỉ giữ primitive dùng chung (R7, AR-08)

- Files: (tên theo nội dung thật, kiểm 30/10/2026) `src/core/hr-basis.ts` (chỉ `interface HrBasis`) →
  `src/modules/organization/public/hr-basis.types.ts`; `src/core/account-identifier.ts` (+spec; hàm thuần
  `normalizeAccountIdentifier`, `isCompanyAccount`…) → `src/modules/licensing/public/account-identifier.policy.ts`;
  `src/core/budget-year-lock-key.ts` (+spec; hàm `budgetYearLockKey`) → `src/modules/budgets/public/budget-year-lock-key.policy.ts`;
  `src/core/seat-occupancy.ts` (+spec; `SeatPeriod`, `occupies`, `peakOccupancy`) →
  `src/modules/data-import/seat-baseline-import/seat-occupancy.policy.ts` (người dùng duy nhất); xóa `src/core/time/` rỗng;
  đăng ký hai policy mới trong `public/` ở `PUBLIC_ROOT_POLICY_FILES` của `test/gates/policy-ownership.gate-spec.ts`
  (policy dùng liên module, BEH.1).
- Depends on: Task 2.1a → 2.1c.
- Acceptance: mọi cạnh mới đi xuống tầng (`pnpm arch:check` xanh); `pnpm arch:capabilities --core` không còn file khái niệm
  của một module. `money/convert` giữ trong core (primitive tiền, một module dùng là hợp lệ — R7).
- Verify: bộ bất biến; `pnpm test -- src/core src/modules/organization src/modules/licensing src/modules/budgets
src/modules/data-import`.

### Task 2.5: gate layout R3 → R5

- Files: `test/gates/module-layout.gate-spec.ts`.
- Depends on: Task 2.1a → 2.4.
- Acceptance: ba luật mới, mỗi luật một hàm thuần trên danh sách file như các luật hiện có, có test tổng hợp xanh/đỏ:
  `technicalLayerFolders` (mọi cấp dưới module, danh sách R3), `publicOnlySuffixes` (`.api.ts`, `.extension-points.ts`
  ngoài `public/`; `public/<x>.api.ts` export lớp khác `<X>Api`), `moduleRootFiles` (R5, theo `OD-R2`: chỉ áp cho module có
  thư mục capability).
- Verify: `pnpm test:gates -- module-layout`.

### Task 2.6: giữ và chuẩn hóa hạ tầng queue dự phòng (AR-09, `OD-R5`)

- Owner chọn **GIỮ** ngày 30/10/2026 vì tương lai sẽ dùng queue. Đề xuất xóa trước đây bị thay thế, không còn là
  acceptance criterion. "Chưa có consumer" không đồng nghĩa với "được phép xóa".
- Files: rà `src/infrastructure/queue/` (module/config/spec), config tests, `package.json`, lockfile, `compose.yaml`,
  `.env.example`, `ARCHITECTURE.md`, `src/README.md` và gate wiring liên quan. Giữ module, API cấu hình, validate/test,
  `bullmq`, `@nestjs/bullmq`, config mẫu `REDIS_*`, service `redis` và volume `redis-data` hiện hữu. Không đọc env thật.
- Refactor chỉ khi có vấn đề cụ thể về ranh giới, tên hoặc test; phần đã đúng giữ nguyên. Tài liệu phân biệt rõ hạ tầng
  đã chuẩn bị với luồng chưa kích hoạt. Không buộc sửa BRD để bỏ Redis; không tự thêm job, retry framework, producer,
  consumer hay runtime import chỉ để chứng minh đang dùng.
- Depends on: Task 0.2 đã có Owner OD-R5 = GIỮ; không mount queue vào API/worker/CLI hiện tại nếu chưa có use case.
  Validation Redis chỉ khi queue được
  bật, API/worker không phát sinh kết nối hoặc env bắt buộc Redis. Không chạm Redis/container/volume đang chạy.
- Acceptance: queue vẫn có thể được module tương lai opt-in qua ranh giới cấu hình hiện hữu; config validation/test còn
  nguyên ý nghĩa, wiring gate mô tả trạng thái hiện tại thay vì cấm queue mãi mãi. Compose Redis được giữ hợp lệ, không
  có đường xóa volume. Không tạo bản refactor hình thức nếu không tìm thấy vấn đề.
- Verify: focused unit/config/wiring tests khi có thay đổi; build và Compose config validation cần thiết, tránh render
  secret. Dùng env tổng hợp nếu validator cần giá trị. Full gates theo pass cuối của phụ lục, không chạy lại từng task.

### Task 2.7: image production không chứa devDependencies (AR-13, `OD-R9`)

- Files: `Dockerfile` (stage `runtime`: `COPY --from=production-dependencies /app/node_modules`; với `OD-R9` = B xóa stage
  `production-dependencies` và ghi lý do giữ `node_modules` của build); `package.json` + `pnpm-lock.yaml` (`prisma` sang
  `dependencies`); `test/gates/deployment-roles.gate-spec.ts` (khẳng định stage `runtime` chép từ stage `--prod`);
  `docs/guides/containers.md`.
- Depends on: Task 0.2 (`OD-R9`); Task 2.6 (chốt inventory dependency cần giữ, gồm BullMQ, trước khi đổi đóng gói).
- Acceptance: image `runtime` không có `jest`, `eslint`, `typescript`, `ts-jest`, `jest-environment-node`; `prisma migrate
deploy`, `node dist/cli.js --help`, `node dist/inspect-cli.js --help`, `node dist/main.js` chạy trong image (client sinh nằm
  ở `dist/generated/prisma`). Stage `migrate` không đổi. Kích thước image trước/sau ghi vào plan.
- Verify: `docker build --target runtime -t slm-be:check .`;
  `docker run --rm slm-be:check sh -c "test ! -e node_modules/jest && node dist/cli.js --help"`; CI job `quality`
  (`Validate production Compose configuration`); Owner kiểm `deploy-release.sh` trên VPS ở lần deploy kế tiếp.

### Checkpoint

Bộ bất biến xanh; `pnpm openapi:export` không đổi `openapi.json`; HTTP và integration của module bị chạm xanh trên CI.

### Phase 3 — DAG capability ở module nhỏ và vừa

### Task 3.1: gate DAG capability (R6)

- Files: tạo `test/gates/capability-graph.gate-spec.ts`; sửa `CAPABILITY_DAG_MODULES` trong
  `scripts/arch/capability-graph.cjs` — điền mọi module `pnpm arch:capabilities` báo không vòng sau Phase 2 (dự kiến
  `audit`, `budgets`, `data-import`, `finance`, `installation`, `notifications`, `onboarding`, `operating-parameters`).
- Depends on: Phase 2, Task 0.2 (`OD-R3`).
- Acceptance: gate đỏ cho vòng trong module thuộc danh sách, nêu vòng và cạnh file. Danh sách không rỗng khi gate ra đời
  (`it.each` của Jest từ chối bảng rỗng); khi danh sách chứa mọi module thì xóa nó và gate lặp qua mọi module của đồ thị.
- Verify: `pnpm test:gates -- capability-graph`.

```ts
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the same CommonJS file serves `pnpm arch:capabilities`
const architecture = require('../../scripts/arch/capability-graph.cjs') as {
  CAPABILITY_DAG_MODULES: string[];
  capabilityGraph: (srcRoot: string) => Map<string, Map<string, Map<string, string[]>>>;
  cyclesOf: (edges: Map<string, Map<string, string[]>>) => string[][];
};

describe('capability graph (R6)', () => {
  const graph = architecture.capabilityGraph(join(process.cwd(), 'src'));

  it.each(architecture.CAPABILITY_DAG_MODULES)('%s has no cycle between its capabilities', (module) => {
    const edges = graph.get(module) ?? new Map();
    const cycles = architecture.cyclesOf(edges).map((cycle) => ({
      cycle,
      edges: cycle.flatMap((from) => cycle.flatMap((to) => edges.get(from)?.get(to) ?? [])),
    }));
    expect(cycles).toEqual([]);
  });
});
```

### Task 3.2: `catalog` không vòng

- Files: `src/modules/catalog/plan/plan.service.ts`, `catalog/subscription/onboarding-facts.service.ts` (đang gọi
  `catalog-entry/application-lookup.service`); `catalog/catalog-entry/application-view.service.ts`,
  `internal-software-registration.service.ts`, `retirement/application-retirement.service.ts` (gọi `plan/…`,
  `subscription/…`); `catalog/catalog-entry/application.service.ts` (gọi `subscription/seat-guard.policy`).
- Depends on: Task 3.1.
- Acceptance: hướng `plan`, `subscription` → `catalog-entry` (ứng dụng là gốc). `seat-guard.policy.ts` (thuần) xuống
  `catalog-entry/` hoặc gốc module; `application-view` và nhóm `retirement/` (điều phối nhiều capability) thành capability
  `application-view/`, `application-retirement/` phụ thuộc cả ba. `catalog` vào `CAPABILITY_DAG_MODULES`.
- Verify: `pnpm arch:capabilities --module catalog` → không vòng; bộ bất biến; `pnpm test:http -- test/http/catalog` (hỏi Owner).

### Task 3.3a: `licensing`, `personnel` không vòng

- Files: `src/modules/licensing/assignment/department-tools/` → capability `src/modules/licensing/department-tools/` (cạnh
  ngược duy nhất `department-tools.service.ts` → `provisioning/revocation-read.service`; chỉ `licensing.module.ts` dùng nhóm
  này); `src/modules/personnel/transfer/transfer-notice.listener.ts` (lớp `TransferNoticeRecorder`, cạnh `transfer → notice`)
  → `src/modules/personnel/notice/`, giữ hướng `notice → transfer`; `licensing.module.ts`, `personnel.module.ts`.
- Depends on: Task 3.1.
- Acceptance: hai module vào `CAPABILITY_DAG_MODULES`, gate xanh.
- Verify: `pnpm arch:capabilities --module licensing`, `--module personnel`; bộ bất biến; `pnpm test:integration --
test/integration/licensing test/integration/personnel` (hỏi Owner).

### Task 3.3b: `organization`, `identity-access` không vòng

- Files: `src/modules/organization/department/department.types.ts` (đang import `employee/employee.types`) — kiểu cần chung
  xuống `department.types.ts` hoặc `organization` gốc, giữ hướng `employee → department`;
  `src/modules/organization/employee/employee-directory.service.ts`; cạnh còn lại của `identity-access` theo
  `pnpm arch:capabilities --module identity-access` sau Task 2.1b (hướng chính `access → auth → accounts`, `recovery →
accounts`).
- Depends on: Task 3.1.
- Acceptance: hai module vào `CAPABILITY_DAG_MODULES`, gate xanh.
- Verify: `pnpm arch:capabilities --module organization`, `--module identity-access`; bộ bất biến; `pnpm test:http --
test/http/organization test/http/identity-access` (hỏi Owner).

### Checkpoint

`pnpm arch:capabilities` → chỉ `requests` còn vòng; bộ bất biến xanh; CI `dev` xanh.

### Phase 4 — `requests` đọc được theo capability (AR-02)

### Task 4.0: bảng tầng của `requests` (thiết kế, không đổi code)

- Files: `docs/workspace/items/be-architecture-readability-hardening/plan.md` (mục _Bảng tầng `requests`_ thêm dưới task
  này); `src/modules/requests/README.md` (bản nháp mục tầng).
- Depends on: Phase 3; CI `dev` xanh.
- Acceptance: mỗi capability có một tầng L0–L3 theo nguyên tắc ở spec (_Đích của `requests`_); mọi cạnh ngược hiện có (in
  bởi `pnpm arch:capabilities --module requests`) có một dòng: cạnh file, kỹ thuật gỡ (kiểu xuống tầng thấp / chuyển file
  sang capability sở hữu / tách controller ra capability lá / chuyển dịch vụ điều phối lên tầng trên), task thực hiện (4.1
  → 4.3). Ghi rõ ba bẫy đã biết: `AccessRequestView` có 10 controller dùng; ba lõi nhánh `spend`/`assessment`/`group-request`
  vòng nhau; năm capability vừa có controller vừa bị import. **Owner duyệt bảng trước Task 4.2.**
- Verify: `pnpm rules:check`, `pnpm rules:format`; số cạnh trong bảng khớp lệnh.

Bản nháp tầng (người làm Task 4.0 kiểm lại bằng lệnh, sửa nếu số đo khác):

| Tầng | Capability                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Ghi chú                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| L0   | `access-request` (lõi, gồm `AccessRequestView`), `outcome`                                                                                                                                                                                                                                                                                                                                                                                                                     | không import capability nào của `requests`                 |
| L1   | `spend` (nhận `line-allocation.policy` từ `group-request`; `step-target.service` của `reassignment` xuống L0 nếu chỉ là tính định tuyến)                                                                                                                                                                                                                                                                                                                                       | không controller                                           |
| L2   | lõi của `assessment`, `budget-information`, `finance-review`, `group-request` (dữ liệu, policy, service dùng chung), `request-end`, `grant`, `reassignment`                                                                                                                                                                                                                                                                                                                    | không controller; thứ tự trong L2 do bảng chốt, không vòng |
| L3   | mọi controller và use case lá: `request-submission`, `need-decision`, `withdraw`, `draft`, `delegated-request`, `cancellation`, `line-closure`, `group-request-submission`, `renewal-request`, `return-request`, `service-account-request`, `spend-submission`, `spend-approval`, `sla`, `status`, `timing`, cùng capability lá mới nhận controller tách từ L2 (ví dụ `proposal-review`, `budget-questions`, `finance-review-desk`, `group-line-decisions`, `controlled-wait`) | tên capability lá mới do Task 4.0 chốt                     |

Cạnh ngược đã biết (30/10/2026) để điền bảng:

| Cạnh file                                                                                                           | Kỹ thuật đề xuất                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `access-request/access-request-query.service.ts` → `assessment/assessment.repo` (`findProposal`)                    | đọc proposal qua repo đọc của lõi                                                                  |
| `access-request/access-request-query.service.ts` → `group-request/group-request.types`                              | kiểu xuống `access-request.types.ts`                                                               |
| `access-request/access-request-query.service.ts` → `spend/spend-status.service`                                     | quyết ở Task 4.0: L0 → L1 hợp lệ nếu `spend` không import lại lõi theo vòng; không thì view lên L2 |
| `access-request/access-request.errors.ts` → policy của `cancellation`, `delegated-request`, `withdraw` (kiểu lý do) | kiểu lý do xuống `access-request.types.ts`                                                         |
| `access-request/request-draft.repo.ts` → `draft/request-draft.policy`                                               | repo sang `draft/` (Task 4.1)                                                                      |
| `access-request/request-end.service.ts` → `budget-information`, `spend`                                             | capability `request-end/` (L2)                                                                     |
| `access-request/grant/*` → `group-request/group-grant.service`, `outcome`                                           | capability `grant/` (L2)                                                                           |
| `access-request/open-request/*.repo.ts` → `cancellation/cancellation.policy`                                        | hằng/kiểu xuống lõi                                                                                |
| `spend/spend.errors.ts` → policy của `budget-information`, `finance-review` (kiểu lý do)                            | kiểu lý do xuống `spend` hoặc lõi                                                                  |
| `spend/budget-check.service.ts` → `assessment/assessment.repo`, `group-request/line-allocation.policy`              | đọc qua repo đọc của lõi; policy sang `spend/`                                                     |
| `spend/spend-effects.service.ts` → `budget-information/budget-information.service`                                  | điều phối lên L2 hoặc tách phần dùng chung xuống                                                   |
| `spend/spend-routing.service.ts` → `reassignment/step-target.service`                                               | `step-target` xuống L0/L1                                                                          |
| `group-request/group-request.policy.ts` → `delegated-request/beneficiary-eligibility.policy`                        | policy xuống lõi hoặc `group-request`                                                              |
| `group-request/group-withdrawal.*` → `withdraw/withdrawal.policy`                                                   | policy rút xuống lõi                                                                               |
| `group-request/group-resolution.service.ts` → `assessment/repricing.service`, `budget-information.service`          | theo thứ tự trong L2                                                                               |
| `group-request/lines/group-need-decision.service.ts` → `need-decision/need-spend.service`                           | `need-spend` xuống L1/L2                                                                           |
| `group-request/lines/group-lines.controller.ts` → `spend-approval/*`                                                | controller ra capability lá (L3)                                                                   |
| `assessment/*` → `spend/spend-entry.service`, `group-request.types`, `group-request.http-errors`                    | theo thứ tự trong L2; kiểu xuống lõi                                                               |

### Task 4.1: mỗi capability sở hữu file mang tên nó

- Files: dưới `src/modules/requests/` — `access-request/request-draft.repo.ts` → `draft/`;
  `access-request/need-decision.policy.ts` (+spec) → `need-decision/`; `access-request/assessment-step.repo.ts` →
  `assessment/`; `spend/finance-review.repo.ts` → `finance-review/`; `spend/spend-submission.dto.ts` → `spend-submission/`;
  `access-request/request-assessment.service.ts` → `assessment/` nếu chỉ phục vụ thẩm định, không thì đổi tên theo việc nó
  làm (đọc cấu hình năm tài chính).
- Depends on: Task 4.0 (không cần Owner duyệt: chỉ di chuyển theo tên).
- Acceptance: chỉ di chuyển và sửa import; `openapi.json` đúng byte.
- Verify: bộ bất biến; `pnpm test -- src/modules/requests`; `pnpm test:http -- test/http/requests` (hỏi Owner).

### Task 4.2: kiểu và lỗi xuống tầng thấp, lõi không import lá

- Files: theo các dòng "kiểu xuống", "hằng/kiểu xuống lõi", "repo đọc của lõi", `request-end/`, `grant/` của bảng Task 4.0;
  `src/modules/requests/requests.module.ts`; module card.
- Depends on: Task 4.1; Owner duyệt bảng Task 4.0.
- Acceptance: `pnpm arch:capabilities --module requests` không còn cạnh nào từ `access-request` (L0) sang capability khác;
  `*.errors.ts` không import policy của capability khác.
- Verify: bộ bất biến; `pnpm test:http -- test/http/requests`, `pnpm test:integration -- test/integration/requests` (hỏi Owner).

### Task 4.3: lõi nhánh và controller theo bảng tầng

- Files: theo các dòng còn lại của bảng Task 4.0 (lõi nhánh `spend`, `assessment`, `budget-information`, `finance-review`,
  `group-request`, `reassignment`; controller tách ra capability lá); `requests.module.ts`; module card.
- Depends on: Task 4.2.
- Acceptance: không vòng; cạnh capability ≤ 50; capability có controller không bị capability khác import; `requests` vào
  `CAPABILITY_DAG_MODULES`. Cạnh chỉ gỡ được bằng đổi hành vi: dừng, ghi, báo Owner. Có thể chia thành nhiều lượt theo
  từng lõi nhánh, mỗi lượt chạy bộ bất biến.
- Verify: `pnpm arch:capabilities --module requests`; bộ bất biến; HTTP + integration + E2E `requests` (hỏi Owner).

### Task 4.4: route theo capability và module card

- Files: `src/modules/requests/request-submission/access-requests.controller.ts` (handler `need-decision`, `withdraw`,
  `similar-seats`) → controller của `need-decision/`, `withdraw/` **chỉ khi** `pnpm openapi:export` cho `openapi.json` đúng
  byte; `src/modules/requests/README.md` (đếm capability đúng, bảng tầng, bảng "tìm X ở đâu").
- Depends on: Task 4.3.
- Acceptance: module card khớp `pnpm arch:capabilities --module requests`; `docs/generated/routes.md` sinh lại.
- Verify: `pnpm openapi:export` + `git diff --exit-code openapi.json`; `pnpm arch:docs:check`.

### Checkpoint

`CAPABILITY_DAG_MODULES` chứa cả 14 module → xóa danh sách, gate áp cho mọi module; bộ bất biến xanh; CI `dev` xanh
(integration đầy đủ cho `requests`, `personnel`).

### Phase 5 — kích thước và độ phức tạp (AR-07)

Đếm nợ: tổng số trong `eslint-suppressions.json` (khi `OD-R4` = A) hoặc số cảnh báo (`OD-R4` = B). Một module mỗi lượt,
sau mỗi lượt `npx eslint "{src,test,scripts}/**/*.ts" --prune-suppressions` và bộ bất biến.

### Task 5.1: không lớp nào quá 8 dependency

- Files: trước tiên bốn file ưu tiên của nghiệm thu §4: `src/modules/personnel/offboarding/offboarding.service.ts` (14 tham
  số), `src/modules/licensing/public/licensing.api.ts` (13), `src/modules/requests/assessment/assessment.service.ts` (13),
  `src/modules/personnel/transfer/transfer.service.ts` (10); rồi 25 lớp còn lại theo module (danh sách:
  `npx eslint "src/**/*.ts" --rule "max-params: [error, 8]" -f unix`).
- Depends on: Phase 4 cho file của `requests`; module khác sau Phase 3; Task 1.3.
- Acceptance: tách theo use case (một service một use case), không thêm "service chính" chỉ để chuyển tiếp; facade
  `licensing.api.ts` chỉ ủy quyền, phần use case vào service của capability; 0 vi phạm `max-params`.
- Verify: `pnpm lint`; bộ bất biến; HTTP + integration module bị chạm (hỏi Owner).

### Task 5.2: hàm dài và phức tạp

- Files: trước tiên năm hàm của nghiệm thu §4 (số đo 30/10/2026 khớp): `src/modules/personnel/offboarding/offboarding.service.ts`
  (complexity 42, hàm 147 dòng), `src/modules/organization/employee/employee-maintenance.service.ts` (41; 101 dòng),
  `src/modules/requests/need-decision/need-decision.service.ts` (36; 102 dòng), `src/modules/personnel/transfer/transfer.service.ts`
  (34; 126 dòng), `src/modules/requests/request-submission/access-request.service.ts` (31; 113 dòng); rồi các file còn lại
  theo module, bắt đầu từ `catalog-entry/application.service.ts`, `subscription/subscription.service.ts`,
  `delegated-request.service.ts`, `spend-approval-view.service.ts`.
- Depends on: Task 5.1.
- Acceptance: nhánh điều kiện vào policy thuần có unit test; tổng `complexity` + `max-lines-per-function` ≤ 120 (từ 200).
- Verify: `pnpm lint`; `pnpm test`; bộ bất biến; HTTP + integration module bị chạm (hỏi Owner).

### Checkpoint

Bộ bất biến xanh; số đo ESLint ghi vào bảng mốc.

### Phase 6 — tài liệu cho dev mới (AR-10, AR-11)

### Task 6.1: hướng dẫn dev mới thay hướng dẫn cũ

- Files: tạo `docs/guides/huong-dan-dev-moi.md`; xóa `docs/guides/kien-truc-backend-va-cach-viet-code.md`; sửa link ở
  `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `docs/README.md`, `rules-check.config.json`, script `rules:format`.
- Depends on: Phase 4 (ví dụ dùng cấu trúc cuối); Task 0.3 (ghi chép O7 làm đầu vào).
- Acceptance: tài liệu có đủ: (1) bản đồ một trang (ba tiến trình, sáu tầng, một module, một capability, tầng trong
  `requests`); (2) lần một route phức tạp — `POST /api/v1/access-requests/{id}/need-decision` từ routes.md tới controller,
  service, policy, repo, transaction, audit, outcome listener; (3) bảng "thêm X thì đặt ở đâu" (route, use case, quy tắc
  thuần, truy vấn, lỗi, job, lệnh CLI, migration, listener); (4) bảng "đăng ký provider vào Nest module nào" theo graph
  API/worker/CLI và cách gate R1 báo thiếu; (5) cách debug: `requestId` → log → mã lỗi → `*.http-errors.ts` → `*.errors.ts`,
  Audit Trail, `ops:inspect`; (6) chọn tầng test; (7) lỗi thường gặp. Không mâu thuẫn rule.
- Verify: `pnpm rules:check`, `pnpm rules:format`; một dev chưa đọc code làm theo mục (2) và (3) — ghi người thử, thời
  gian, chỗ vướng.

### Task 6.2: ADR, rule và tài liệu vận hành khớp code

- Files: `docs/decisions/0019-module-tiers-and-public-api.md` (thêm R1–R10 và mục _Sai khác đã chấp nhận_ chép S1–S13 của
  nghiệm thu §1 kèm quyết định O1–O3; trạng thái theo `OD-R7`), `docs/decisions/0005-database-constraints-outside-prisma.md`
  (sửa câu trạng thái "No such custom constraints…"), `docs/decisions/0003-flat-feature-module-layout.md` (giữ ghi chú
  superseded), `docs/rules/module-structure.md`, `ARCHITECTURE.md`, `docs/guides/runtime-details.md` (ràng buộc nghiệm thu
  §5: `occurred_at` theo đồng hồ tiến trình ghi; API, worker và PostgreSQL chạy khác máy thì độ lệch đồng hồ phải < 5 s
  margin của độ trễ đọc), module card của module bị chạm.
- Depends on: Phase 2–5; Task 0.2 (`OD-R7`).
- Acceptance: mọi luật máy kiểm có một câu trong rule, mỗi câu rule có gate hoặc ghi "review"; ADR không hứa điều đã bỏ
  ("bỏ ledger" đúng sau Task 7.1). Owner có sự kiện review ghi ngày cho hai phần ADR-0019 còn thiếu: quy tắc nhóm chức năng
  (§3) và chi tiết extension point (§5).
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Task 6.3: comment nói lý do, không nói mã nội bộ

- Files: `src/**/*.ts` theo module đã đi qua Phase 2–4, một module mỗi lượt; tạo `scripts/arch/comment-codes.mjs` (chỉ in,
  không gate — mã nghiệp vụ hợp lệ như `G1`–`G5`, `K1`–`K5`, `T1`–`T6` dễ báo nhầm).
- Depends on: Phase 4.
- Acceptance: giữ `US-xx-yy`, `AC-n`, `QĐ-n`, `FR-n`, `INV-n`, `SoD-n`, `ADR-n`, `BR-n`; thay mã finding/lát (`F13`,
  `T-11`, `E1`, `P23-RV`, `GATE.2`, `H6.4`…) bằng một câu lý do hoặc bỏ nếu comment vẫn đủ nghĩa. Không đổi code.
- Verify: `node scripts/arch/comment-codes.mjs` → 0 mã finding/lát; bộ bất biến.

### Checkpoint

`pnpm rules:check`, `pnpm rules:format`, bộ bất biến xanh.

### Phase 7 — gate, test và CI dễ đọc (AR-12, AT-01 → AT-04)

### Task 7.1: thay ledger `LEGACY_PRIVATE_EXPORTS` bằng luật R10

- Files: `test/gates/module-graph.gate-spec.ts` (xóa `LEGACY_PRIVATE_EXPORTS`, thêm luật R10 và test tổng hợp);
  `docs/rules/module-structure.md` (mục Liên module).
- Depends on: Task 1.1a (dùng `test/support/nest-module-graph.ts`).
- Acceptance: export ngoài `PUBLIC_CONTRACT_EXPORTS` chỉ hợp lệ khi **mọi** Nest module import module xuất nằm cùng thư mục
  module (đọc metadata `imports` của mọi graph trong `PROCESS_GRAPHS`); bốn export hiện có (`OrganizationModule`:
  `CostCenterRepo`, `DepartmentRepo`, `OrganizationRepo`; `OperatingParametersModule`: `NonWorkingDatesService`) xanh theo
  luật, hoặc đỏ nếu một module ngoài thư mục import chúng (khi đó sửa code, không thêm ngoại lệ). Không khai lại repo ở
  `*-http.module.ts`: gate "không khai một provider ở hai module" vẫn giữ.
- Verify: `pnpm test:gates -- module-graph`.

### Task 7.2: tên gate nói hành vi, dữ liệu tách khỏi luật

- Files: `test/gates/*.gate-spec.ts` (bỏ mã ở đầu tên `it`/`describe`: `E6:`, `GATE.2:`, `H6.4 (…)`, `A4-03:`, `G5:`,
  `ROOT-HARDEN.1:`…, đưa mã vào comment nếu còn cần truy vết); `test/gates/api-collection-contract.gate-spec.ts` → luật
  giữ trong gate, các registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS`, `INITIAL_*`) sang
  `test/support/api-collection-registry.ts`.
- Depends on: none.
- Acceptance: gate đọc được từ tên test; số test và kết quả không đổi.
- Verify: `pnpm test:gates` trước/sau cùng số test; `pnpm test:discovery`.

### Task 7.3: manifest mã lỗi ví dụ theo module

- Files: `test/support/openapi-example-route-codes-a-l.ts`, `test/support/openapi-example-route-codes-m-z.ts` → chia theo
  module sở hữu operation (đã có `-budgets`, `-licensing`, `-personnel`, `-requests`, `-requests-spend`);
  `test/support/openapi-example-manifest.ts`.
- Depends on: none.
- Acceptance: không file nào chia theo chữ cái; nội dung gộp lại bằng đúng bản cũ.
- Verify: `pnpm test:http -- test/http/platform` (hỏi Owner).

### Task 7.4: trần kích thước spec ngoài unit (R9, AT-02)

- Files: tạo `test/gates/test-size.gate-spec.ts` (trần 800 dòng cho `test/integration`, `test/http`, `test/e2e`); tách
  `test/integration/organization/departments-http.integration-spec.ts` (1 952),
  `test/integration/data-import/employee-imports-http.integration-spec.ts` (1 344),
  `test/integration/identity-access/super-admin-recovery.integration-spec.ts` (1 064),
  `test/integration/catalog/subscription-http.integration-spec.ts` (957),
  `test/integration/identity-access/password-self-service-http.integration-spec.ts` (903),
  `test/integration/identity-access/account-management-http.integration-spec.ts` (840) theo use case; harness chung vào
  `test/support/`. Một file mỗi lượt.
- Depends on: none trong hạng mục; phối hợp `be-test-architecture-redesign`.
- Acceptance: gate xanh; tổng số test của mỗi module không đổi; mỗi file mới có `beforeAll` riêng (một database mỗi file,
  nên thời gian tổng có thể tăng nhẹ — đo và ghi).
- Verify: `pnpm test:gates -- test-size`; `pnpm test:integration -- <thư mục>` (hỏi Owner); `pnpm test:discovery`.

### Task 7.5: đo phân tầng HTTP ↔ integration (AT-03)

- Files: bảng kết quả trong plan này (mục _Verification and handoff_).
- Depends on: none.
- Acceptance: 109 file integration dùng `supertest` được phân loại: (a) chứng minh ánh xạ HTTP ↔ DB, (b) dùng HTTP chỉ để
  dựng dữ liệu, (c) kiểm điều HTTP contract đã kiểm. Nhóm (b), (c) ghi tên file và hạng mục sẽ xử lý; không chuyển file
  ở đây.
- Verify: rà tay + grep; ghi người phân loại và revision.

### Task 7.6: ngân sách thời gian CI và quy tắc timeout (AT-04, `OD-R8`)

- Files: `.github/workflows/ci.yml`, `.github/workflows/nightly.yml` (job `integration`);
  `docs/workspace/items/be-test-architecture-redesign/spec.md` (P5, quy tắc "timeout gấp đôi mục tiêu"), plan của hạng mục
  đó; `test/README.md` (mục CI); nghiệm thu §5 dòng P5.
- Depends on: Task 0.2 (`OD-R8`), Task 0.3 (số đo CI thật trên `25d5244`).
- Acceptance:
  - `OD-R8` = A: bước song song chạy `strategy.matrix.shard: [1, 2]`, mỗi shard một PostgreSQL service và
    `pnpm test:integration -- --shard=${{ matrix.shard }}/2 --maxWorkers=2`; timing và `_serial` ở một job sau, cũng chặn
    `deploy`; artifact thời gian mỗi shard tên riêng. Mỗi shard ≤ 15 phút trên CI (P5 đạt) hoặc ghi số thật.
  - `OD-R8` = B: P5 ghi lại thành số đo thật (ví dụ ≤ 30 phút); quy tắc timeout sửa thành "timeout = p95 đo được + 50 %",
    `timeout-minutes` khớp; không ai đọc spec còn tưởng P5 = 15 phút.
  - Cả hai: P7/P8 vẫn `owner-waived`, không tối ưu file test.
- Verify: `pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/nightly.yml`; gate
  `deployment-roles` xanh (`deploy` vẫn `needs` mọi job test); một run CI trên `dev` với `integration` `ALL` (Owner) — ghi
  run ID và thời gian từng shard.

### Checkpoint

Bộ bất biến, HTTP, integration đầy đủ, E2E xanh trên CI `dev`; bảng mốc điền cột "sau".

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                       | Revision / môi trường         | Kết quả thực chạy                                                                                                                        | Giới hạn / việc còn lại                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 8.1 đỏ trước sửa: unit `database-role-judgement` + `database-role-provisioning`                                          | `f498c74` + test mới, Windows | 18 fail / 41 (ví dụ `saas_issue_seq: expected USAGE, has SELECT, UPDATE`)                                                                | —                                                                                             |
| 8.1 đỏ trước sửa: `pnpm test:integration:serial -- …database-runtime-sequences…`; hai spec đường ứng dụng BM-11/BM-09    | PG 17.11 `slm-p09-impl-pg`    | 13/27 fail; 6/6 fail — HTTP 500, `42501 permission denied for sequence saas_issue_seq` tại `SaasIssueRepo.nextCode` (tái hiện sự cố VPS) | —                                                                                             |
| 8.1 xanh: unit `src/infrastructure/database`; ba spec `_serial` mới; spec H7 lân cận; gate `runtime-sequence-privileges` | như trên                      | 121; 27; 6; 42 + 5; 3 (cùng 3 gate khác: 53)                                                                                             | chạy lại ở lượt cuối của Tester                                                               |
| 0.1 `pnpm arch:capabilities`                                                                                             | `f498c74` + thay đổi P09      | 7/14 module có vòng; `requests` 82 cạnh, vòng 19 capability — khớp bảng mốc; `test:scripts` 248 pass / 2 skip (Linux-only)               | `test:scripts` đỏ giả nếu shell export `TEST_DATABASE_BOOTSTRAP_URL` (có sẵn, ghi cho Tester) |

**8.1 — chính sách đã hiện thực (Implementer, Orchestrator duyệt).** Nguồn duy nhất `RUNTIME_SEQUENCE_EXCEPTIONS` trong
`src/infrastructure/database/database-role-judgement.ts`: `personnel_notice_seq`, `saas_issue_seq` = **`SELECT, UPDATE`**,
không USAGE (UPDATE đã cho `nextval`; SELECT cho đọc trạng thái trong `nextCode`; probe PG 17.11 và tài liệu PG 17
`functions-sequence`, `ddl-priv`). Sequence khác và default privilege tương lai giữ `USAGE`. Provisioner probe sequence
tồn tại trước khi GRANT; verifier đỏ khi thiếu hoặc thừa quyền. Gate tĩnh mới đối chiếu `setval`/`FROM <seq>` trong `src`
với chính sách. Tài liệu: `docs/rules/database-business.md`, `docs/guides/containers.md`, H7 spec.

**Phase 1 (Implementer, focused).** Kết quả thực chạy trên cây làm việc, PG17 `slm-p09-impl-pg`:

| Task   | Bằng chứng                                                                                                                                                               | Ghi chú                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1.1a   | 33 `*.listener.ts` khai `binds`; `test/support/nest-module-graph.ts`; gate `module-graph` giữ 32 test                                                                    | `OpenRequestsSource` bind hai điểm                                                                                     |
| 1.1b   | gate `extension-wiring` lần đầu trên cây thật: 8 graph thiếu bên đăng ký (đỏ); sau phân loại 21/24, 3 đỏ = 3 chênh lệch thật; hai mutation của luật làm test tổng hợp đỏ | xóa `whenUnbound`/`canAnswer`/`assertHooksBound` (0 người dùng production); ADR-0019 còn nhắc `whenUnbound` → Task 6.2 |
| 1.2a/b | gate R2 (AST) trên cây thật đỏ đúng 14 file; sau tuần tự hóa 26/26                                                                                                       | danh sách thật 14 file (9 file của plan chạy `Promise.all` trên pool, không `tx`); không còn danh sách tạm             |
| 1.3    | `pnpm lint` exit 0; `eslint-suppressions.json` 229 = complexity 101 + max-lines-per-function 99 + max-params 29; hàm 64 dòng tạm làm lint đỏ                             | 0 `any` trong `src` (số 15 của plan đã cũ); `--max-warnings` bỏ; `lint:prune`                                          |
| 1.4    | integration `personnel-file-hooks` đỏ trước sửa 4/5 (201 thay 409/500; `25P02` ở `revocation-read.repo.ts`); sau sửa 5/5; thư mục `test/integration/personnel` 289 xanh  | `OD-R10` = A; thứ tự hook thường giữ                                                                                   |

**Phân loại R1 (luật Owner).** 7 nhóm ngoại lệ (86 bộ ba graph × điểm × bên đăng ký) có bằng chứng đồ thị gọi: điểm chỉ
được phát/đọc từ controller API, job hoặc lệnh không thuộc graph đó; hai mục `ApprovalRoleChangeListeners` của
Installation/Recovery dựa trên chứng minh mức giá trị (chỉ cấp `SUPER_ADMIN`, chỉ `FINANCE` mới phát). Ba chênh lệch thật
đã hỏi Owner ngày 30/10/2026: `SuperAdminEventCliModule` × `HeldNoticeHandoverListener` → **ngoại lệ, lý do FR-8.7**;
`DevSeedModule`, `DemoDatasetModule` × `RequestsApprovalRoleListener` → **ngoại lệ + ghi trong tài liệu lệnh** (bước đang
chờ Finance không được thử lại bởi hai lệnh này). Không đổi hành vi. Giới hạn: gate chỉ phát hiện bên đăng ký xuất hiện,
không phát hiện đường gọi mới tới điểm phát trong graph có ngoại lệ — người thêm đường gọi phải xóa ngoại lệ. Sau áp
dụng: 9 mục / 89 bộ ba; gate `extension-wiring` 24/24 xanh.

**Phase 2 (Implementer, focused; Orchestrator kiểm lại `openapi.json`/`prisma/` không đổi, 0 thư mục `mappers`/`dto`/`policies`).**

- 2.1a–2.2: di chuyển theo bảng, đã đối chiếu người dùng thật. Lệch bảng có lý do: `account-sessions.types.ts` vào
  `accounts/` (đặt ở `auth/` sinh vòng); capability mới `identity-access/credentials/` (gốc `accounts` 28 file > 25);
  `installation/public/inspection.api.ts` → `installation-inspection.api.ts` (R4: tên file khớp lớp); spec mồ côi của
  `organization` tách theo ba repo nó kiểm.
- 2.3: năm nhóm của `budgets/budget/` thành capability; 2.4: `hr-basis`, `account-identifier`, `budget-year-lock-key`,
  `seat-occupancy` ra khỏi `core` về module sở hữu; `money/*` giữ (primitive).
- 2.5: luật R3/R4/R5 hàm thuần, đỏ trên vi phạm tạm/tổng hợp, xanh cây thật; `module-layout` 32 test.
- 2.6 (`OD-R5` = GIỮ): không thấy vấn đề cụ thể nên không refactor; tài liệu ghi "hạ tầng dự phòng, chưa có consumer";
  gate `module-graph` mô tả trạng thái hiện tại (queue chưa mount) thay vì cấm vĩnh viễn.
- 2.7 (`OD-R9` = A có bằng chứng): stage `runtime` chép `node_modules` từ stage `--prod`; `prisma` sang `dependencies`.
  Image 1,58 GB → 939 MB (`node_modules` 909 → 427 MB). Trong `slm-be:p09-check`: `dist/cli.js` và 10 alias `--help` exit 0;
  `bullmq`, `@nestjs/bullmq` nạp được; client Prisma sinh, adapter pg, argon2 native chạy; `jest`/`eslint`/`ts-jest`/
  `typescript`/`@nestjs/cli` không resolve được; `db-roles provision` → `migrate deploy` (role deploy) → `reconcile` → `main.js`
  `health/ready` 200, `worker.js` "Worker started". Gate `deployment-roles` đỏ khi đặt lại Dockerfile/`package.json` cũ.
  Giới hạn: build stage `--prod` cần mạng để tải schema engine (như stage `build` hiện có).
- Sau Phase 2: 5/14 module còn vòng (`catalog`, `licensing`, `organization`, `personnel`, `requests`); unit 262 suite /
  3 777 test, gates 250, `openapi:export` không đổi `openapi.json`.

**Phase 3 (Implementer, focused; Orchestrator kiểm lại `pnpm arch:capabilities`: 13/14 module không vòng, chỉ còn
`requests` 82 cạnh / vòng 19; `openapi.json`, `prisma/` không đổi).**

- 3.1: gate `capability-graph` (dùng lại `scripts/arch/capability-graph.cjs`): danh sách không rỗng, sắp xếp, duy nhất,
  tên module thật; một test không vòng mỗi module trong `CAPABILITY_DAG_MODULES`; 3 test tổng hợp. Đỏ 1: danh sách rỗng;
  đỏ 2: liệt kê `catalog` khi còn vòng → gate đỏ, nêu vòng `[catalog-entry, plan, subscription]` và 12 cạnh file. Gates
  14 suite / 267 test.
- 3.2 `catalog` (16 cạnh, không vòng): `catalog-entry/retirement/*` → capability `application-retirement/`;
  `internal-software-registration.service.ts` → `internal-software-registration/`; `seat-guard.policy.ts` **tách** (lệch
  plan): phần khuyến nghị K2 → `catalog-entry/k2-recommendation.policy.ts` (+spec), `assertQuantityNotBelowOccupied` ở lại
  `subscription/` (nó import `subscription.errors`, chuyển nguyên file sinh lại vòng). Thay cho capability
  `application-view/` của plan: port `ApplicationPlans` (lớp trừu tượng một hàm đọc) trong `catalog-entry/`,
  `PlanLookupService implements ApplicationPlans`, `CatalogModule` nối `useExisting`. **Orchestrator duyệt kỹ thuật**:
  nối tĩnh trong module (thiếu thì Nest lỗi khi boot, không fail-open); tách handler `GET /applications/:id` sang
  controller khác đổi thứ tự method trong path item → `openapi.json` lệch byte.
- 3.3a: `licensing/assignment/department-tools/*` → capability `licensing/department-tools/` (8 cạnh);
  `personnel/transfer/transfer-notice.listener.ts` → `personnel/notice/` (17 cạnh; lớp và `binds` giữ nguyên).
- 3.3b: `organization/employee/employee.types.ts` (chỉ 3 kiểu trạng thái) → gốc module `organization-employee.types.ts`
  (3 cạnh; đi qua `public/` vi phạm `no-circular` của `arch:check`); `identity-access` vốn không vòng, chỉ thêm vào danh sách.
- Kiểm: typecheck, lint, format, `arch:check` (1 325 module), `arch:docs:check`, `rules:check`, `test:discovery`; unit 263
  suite / 3 777 test; `test:scripts` 248 pass / 2 skip. Chưa chạy HTTP/integration cho bốn module bị chạm → lượt cuối.

**Task 4.1 (Implementer).** Chỉ `access-request/assessment-step.repo.ts` → `assessment/` (6 import; đồ thị không đổi;
`openapi.json` đúng byte). Năm di chuyển còn lại của plan **không làm**, bằng chứng mô hình đổi chỗ trên import thật:
`request-draft.repo` → `draft/` tạo vòng `draft` ↔ `group-request-submission`/`service-account-request`;
`need-decision.policy` → `need-decision/` +3 cạnh và vòng với `renewal-request` (6 capability dùng policy);
`finance-review.repo` → `finance-review/` +1 cạnh, trạng thái chi phải import `finance-review`; `spend-submission.dto` →
`spend-submission/` +2 cạnh (3 capability dùng, `spend` là chủ đúng); `request-assessment.service` dùng bởi 9 capability →
không chuyển, đổi tên theo việc nó làm ở Task 4.2.

**Task 4.0 — bảng tầng `requests` (Implementer lập; Orchestrator duyệt kỹ thuật 30/10/2026; chưa có Owner review).**
Bảng đích và ngoại lệ ghi ở `src/modules/requests/README.md` mục _Tầng trong module_; 32 cạnh ngược hiện có mỗi cạnh
một dòng (cạnh file, kỹ thuật, task) trong báo cáo Implementer, mô hình đổi chỗ chạy trên import thật cho thiết kế V4:
không vòng, L0 0 cạnh ra, 91 cạnh, 8 capability có controller còn bị import. Ba bẫy: `AccessRequestView` lên capability
L2 `request-view/` (spec nguyên tắc 4, nhánh dự phòng: L0 → `spend` và `spend` → L0 là vòng); vòng
`spend`/`assessment`/`group-request` gỡ bằng repo đọc của lõi, `line-allocation.policy` → `spend/`, `spend-effects` lên
`budget-information/`, kiểu lý do xuống `spend.errors.ts`, định tuyến bước xuống L1 `step-routing/`; năm capability vừa có
controller vừa bị import: tách `proposal-review/`, `budget-questions/`, `group-line-decisions/`, còn `finance-review`,
`reassignment` hết bị import sau hai dòng trên. Điều chỉnh của Orchestrator khi duyệt:

| Điều chỉnh                                                                                                                                                                                                                                                    | Lý do                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `request-end.service.ts` → capability `request-end/`; nhóm `access-request/grant/` → capability `grant/` (thay vì gộp vào `withdraw/`, `group-request/`)                                                                                                      | spec nguyên tắc 5; `cancellation` không phụ thuộc `withdraw`, grant cá nhân không nằm trong `group-request` |
| `assessment.repo.ts` tách: phần đọc dùng ngoài thẩm định → repo đọc của lõi; phần ghi ở lại `assessment/`                                                                                                                                                     | spec nguyên tắc 4 ("repo đọc của lõi"); `assessment` vẫn sở hữu lần ghi                                     |
| Gốc lõi ≤ 25 file: `access-request.service.ts` → `request-intake/`; `request-draft.repo` + `request-draft.policy` → L1 `request-draft/`                                                                                                                       | V4 để lõi 27 file > trần 25; không file nào trong L0 dùng repo bản nháp                                     |
| Ngoại lệ controller: chuyển xuống file dùng chung không phải use case (`beneficiary-eligibility.policy`, `sla-queue-age.service`, `renewal-apply.service`, view/dto của `spend-approval`) nếu không sinh vòng; phần còn lại vào allowlist có lý do trong gate | spec nguyên tắc 2; ngoại lệ mới phải sửa allowlist mới qua gate                                             |

Đích số đo "cạnh capability ≤ 50": **không đạt được với thiết kế không vòng** — mô hình đo 82 → 91 (bản chặt 103), vì mỗi
use case đọc lõi (24 cạnh vào `access-request`, 13 vào `spend`, 9 vào `outcome`) và capability mới để giữ trần 25 file thêm
cạnh. Không bẻ thiết kế để đuổi số. Đề xuất cho Owner thay tiêu chí bằng: không vòng; L0 không import capability; không
thư mục quá 25 file; controller chỉ ở lá trừ allowlist. Số cuối và các số loại trừ cạnh vào lõi ghi sau Task 4.3.

> **Owner quyết 31/10/2026 (`P09-FR-03`):** chấp nhận tiêu chí thay thế cho AC Task 4.3 đúng như gate ép (không vòng; L0
> không import capability; ≤ 25 file mỗi thư mục; năm import capability có controller trong `REQUESTS_CONTROLLER_IMPORTED`
> có lý do, mục thừa/mới đều đỏ). Task 4.3 đóng theo tiêu chí này; bảng Task 4.0 vẫn là duyệt kỹ thuật của Orchestrator
> cho phần còn lại.

**Review sớm (Reviewer `claude-opus-5-5`, chỉ đọc, 30/10/2026; phạm vi 8.1 + Phase 1–3, trừ `requests`).** Không có
Blocker/High. M-1 (Medium): gate R6 chỉ đếm cạnh trực tiếp, không thấy vòng đi qua facade `public/*.api.ts` hoặc file gốc
của chính module — có sẵn từ HEAD ở `organization` (17 file capability tiêm `OrganizationApi`), `finance`, `identity-access`,
`personnel`; số "13/14 không vòng" ở trên đo bằng công cụ cũ. Xử lý: công cụ coi file gốc/`public` của chính module là trong
suốt, sửa vòng lộ ra, thêm luật capability không import facade của chính module (giao Implementer trong checkpoint Phase 4).
L-1 ngoại lệ wiring không cũ đi khi graph có bên phát mới → lưu tập bên dùng trong từng ngoại lệ; L-2 gate R2 chỉ quét
module → quét cả `src/`; L-3 gate sequence chỉ nhận hai dạng câu lệnh → ghi giới hạn ở đầu gate. Kết quả kiểm lại ghi ở
vòng review cuối.

**Task 7.5 — phân tầng HTTP ↔ integration (AT-03).** Người phân loại: Tester (`claude-sonnet-5-5`), chỉ đọc; revision
`f498c74` + cây làm việc 30/10/2026 (8/105 file đang khác HEAD do Implementer, phân loại theo ý định test nên không đổi).
Cách làm: liệt kê `test/integration/**/*.integration-spec.ts` có `from 'supertest'`, đọc thân test của 40 file, 65 file theo
docblock/tên `it`/số đo (gán (a) khi không có bước hành động ngoài HTTP). Số thật: **105** file (plan/AT-03 ghi 109; cây đã
đổi) trong 269 spec integration; thêm 105 spec khác chạm HTTP qua harness `test/support/*-harness.ts` mà không import
`supertest` (ngoài định nghĩa của task, AT-03 nên đếm: 210/269 spec chạm HTTP).

| Lớp                                | Số file | Theo thư mục                                             |
| ---------------------------------- | ------- | -------------------------------------------------------- |
| (a) chứng minh ánh xạ HTTP ↔ DB    | 91      | phần còn lại                                             |
| (b) HTTP chỉ dựng dữ liệu          | 12      | catalog 2, identity-access 5, installation 1, requests 4 |
| (c) kiểm lại contract HTTP đã kiểm | 2       | personnel 1, requests 1                                  |

- (b), hạng mục xử lý `be-test-architecture-redesign` (đích: context integration không HTTP + builder):
  `catalog/department-use-subscriptions`, `catalog/seat-baseline-contracts`, `identity-access/action-link-purpose`,
  `identity-access/password-self-service-mail`, `identity-access/query-count-harness`, `identity-access/super-admin-recovery`,
  `identity-access/worker-mail-loop`, `installation/demo-dataset`, `requests/controlled-wait`, `requests/request-use-readers`,
  `requests/spend-budget-check-years`, `requests/step-reassignment`.
- (c), cùng hạng mục (giữ phần cần DB, phần còn lại về `test/http`): `personnel/personnel-access-policy` (ma trận vai trò đã ở
  `test/http/personnel/*`), `requests/super-admin-cannot-request` (nửa bản nháp đã ở
  `test/http/requests/request-drafts.http-spec.ts`).
- Mức test: 170/1 376 khối `it` (12 %) trong 44 file (a) chỉ kiểm từ chối 401/403/404/422 không đọc DB — ứng viên chuyển
  `test/http` khi có spec đối ứng (ví dụ `catalog/plan-http` 11/25, trùng `plan-declaration.http-spec`). Không chuyển file ở
  hạng mục này. Giới hạn: trùng lặp với `test/http` chứng minh theo mẫu, chưa từng ca.

**Review sớm của Tester (chỉ đọc).** Không blocker; không test mất/bị skip (+85 khai báo test khớp từng nguồn; hai lần tách
spec giữ đủ lời gọi; 28 spec chuyển chỗ chỉ đổi import). Giao Implementer: TG-1 (= L-1), TG-4 (`requests` vào DAG ở
checkpoint Phase 4), TG-7 (suppression đổi khóa theo đường dẫn, không `--suppress-all`), TG-8 (graph có ngoại lệ phải
phân tích được ít nhất một điểm); để Phase 5/7: TG-2 (gate "nợ ESLint chỉ giảm": luật ở mức `error` + trần tổng
suppression), TG-3 (gate `deployment-roles` quét import runtime của `src` phải nằm trong `dependencies`), TG-9 (gate R7:
file `src/core` chỉ một module dùng thì đỏ, trừ primitive có danh sách). Ghi chú không sửa: TG-5 (gate sequence ghim đường
dẫn repo — chấp nhận, đi cùng L-3), TG-6 (integration OD-R10 chứng minh rollback trên đường nghỉ việc; unit phủ cơ chế chung).

**Phase 4 + checkpoint + M-1/L-1/L-2/L-3/TG-8 (Implementer, focused; Orchestrator kiểm lại `pnpm arch:capabilities`,
`openapi.json`/`prisma/` không đổi, không thư mục nào quá 25 file).**

- `requests`: **36 capability, 111 cạnh, không vòng** (từ 24 / 82 / vòng 19). Cạnh không tính cạnh vào `access-request`
  (29): 82; không tính thêm `outcome` (10): 72; không tính thêm `spend` (15): 57. Đích "≤ 50" **không đạt** (xem Task 4.0);
  gốc lõi `access-request/` 24 file.
- 4.2: 12 capability mới (`request-end`, `grant`, `request-draft`, `request-intake`, `request-view`, `step-routing`,
  `plan-line`, `budget-questions`, `proposal-review`, `group-line-decisions`, `renewal-apply`, `spend-approval-view`); kiểu lý
  do/hằng xuống `access-request.types.ts`, `spend/spend.errors.ts`; `assessment.repo` tách: đọc → `access-request/assessment-read.repo.ts`,
  ghi (`open`, `patch`, `reject`, `complete`, chỉ `assessment/` gọi) ở lại; `RequestAssessmentService` →
  `RequestFactsService` (`request-facts.service.ts`, gom dữ kiện để xét request; trùng tên capability `assessment`).
- 4.3: tách `proposal-review/`, `budget-questions/`, `group-line-decisions/`; `finance-review`, `reassignment` hết bị import.
  Ngoại lệ controller còn lại (allowlist trong gate, mỗi mục có lý do): `draft`, `group-request-submission`,
  `service-account-request`, `line-closure`, `sla` (`sla-queue-age` kéo theo repo/policy của `sla`; `request-draft-departure`
  chuyển đi sinh vòng 5 capability).
- 4.4: handler `need-decision`, `similar-seats` → `need-decision/`, `withdraw` → `withdraw/withdrawal.controller.ts`, đăng
  ký ngay sau hub theo thứ tự path cũ; `openapi.json` đúng byte.
- Checkpoint: xóa `CAPABILITY_DAG_MODULES`; gate `capability-graph` áp mọi module (28 test): L0 `requests` không import
  capability; controller bị import phải trong allowlist (mục thừa cũng đỏ); `*.errors.ts` mọi module không import policy
  capability khác. Đỏ có chủ đích: bỏ mục `sla`; thêm `access-request/zz-red.ts`; bỏ mục sổ vòng; errors import policy.
- M-1: công cụ coi file gốc và `public/` của chính module là trong suốt (in `via <file>`), 19 test công cụ (6 mới). Vòng lộ
  ra và đã gỡ: `finance` [currency, exchange-rate] (controller/service tiêm `CurrencyService` thay facade; `FinanceModule`
  export `CurrencyService` — importer cùng thư mục module), `identity-access` [accounts, approval-roles]
  (`inspectEmployeeAccount` vào `AccountDirectoryService`, facade ủy quyền), `personnel` [event-notice, notice, transfer]
  (`notice.types.ts` → gốc `personnel-notice.types.ts`). `organization` còn vòng 5 capability qua facade và
  `organization.http-errors.ts` gốc → Orchestrator quyết sửa thật (tách http-errors theo capability, tiêm service trực
  tiếp, tách `department-head/` nếu còn vòng), không giữ sổ — đang làm ở lượt kế. Luật mới: capability không import
  `public/*.api.ts` của chính module (gate `module-layout`, đỏ có chủ đích).
- L-1/TG-8: mỗi ngoại lệ wiring lưu tập lớp dùng điểm; đổi tập hoặc graph không phân tích được điểm nào → mục cũ đi, đỏ.
  L-2: gate R2 quét cả `src/` (trừ mã sinh), đỏ tổng hợp ở `infrastructure`/`cli`/`worker`/`main.ts`. L-3: đầu gate sequence
  ghi dạng câu nhận/không nhận và chỗ chặn dự phòng.
- Suppression đổi khóa theo đường dẫn (11 khóa), không `--suppress-all`: 229 → 228 (handler `decide` tách mô tả 422 thành
  hằng). DI 11 graph resolve được (`Test.createTestingModule(...).compile()` từng graph).
- Kiểm: typecheck, lint, format, `arch:check`, `arch:docs:check`, `rules:check`, `test:discovery`; gates 14 suite / 284
  test; unit 264 suite / 3 779 test; HTTP focused trên `slm-p09-impl-pg` 33 suite / 944 test (`requests` 4 / 77);
  `test:scripts` 252 pass / 2 skip. Integration/E2E để lượt cuối.

**Lượt 6 — `organization` hết vòng + Phase 5 lần 1 (Implementer, focused; Orchestrator kiểm lại `pnpm arch:capabilities`
0/14 module có vòng, `openapi.json`/`prisma/` không đổi, đếm suppression theo luật, hai sổ đã xóa).**

- 3.3b xong thật: vòng `organization` là `department` ↔ `employee` bị facade che. Capability mới `department-management/` (13
  file chuyển vào), `organization-context.service.ts` ở gốc (ngày làm việc + ngữ cảnh), bốn `*.http-errors.ts` theo
  capability (`organization.http-errors.ts` gốc còn phần chung). Mười file từng tiêm facade của chính module nay tiêm service
  capability (cùng phương thức, transaction, thứ tự khóa). Xóa `KNOWN_CAPABILITY_CYCLES` và `OWN_FACADE_IMPORT_LEDGER`.
  `OrganizationModule` export thêm 5 service cho `OrganizationHttpModule` cùng thư mục (giống `OrganizationRepo` đã export;
  module khác vẫn chỉ import được `public/`), 5 mục hợp đồng mới trong gate `module-graph`.
- 5.1/5.2 lần 1: suppression 228 → **194** (complexity 101 → 86, max-lines-per-function 98 → 85, max-params 29 → 23);
  complexity + max-lines 199 → 171; `requests` 101 → 78. **Chưa đạt** cả ba đích (0 / ≤ 120 / ≤ 50) — thiếu khối lượng, không
  có chỗ phải đổi hành vi. Năm hàm và bốn constructor ưu tiên của nghiệm thu §4 đã hết suppression (`offboarding#recordInTx`
  42/147, `employee-maintenance#update` 41/101, `need-decision#decide` 36/102, `transfer#recordInTx` 34/126,
  `access-request#submitWithin` 31/113; constructor `offboarding` 14 → 7, `assessment` 14 → 6, `transfer` 10 → 6), tách theo
  use case (lớp giai đoạn có logic thật, không service chuyển tiếp, không gói dependency); 66 unit test mới cho policy/mapper.
  `licensing.api.ts` (13) và `super-admin-event.api.ts` (11) chưa tách: Implementer cho là ngoài scope, Orchestrator không
  nhận — Task 5.1 ghi rõ `licensing.api.ts` và `docs/rules/module-structure.md` cho một module nhiều facade → giao lượt 6b.
- TG-2: gate `test/gates/lint-debt.gate-spec.ts` (10 test): ba luật ở `error` với 12 / 60 / 8,
  `reportUnusedDisableDirectives: 'error'`, chỉ `*.http-errors.ts` tắt hai luật kích thước, không `eslint-disable` ba luật
  trong `src`, khóa suppression trỏ file có thật, trần theo luật/tổng/`requests` bằng đúng số đạt (chỉ được giảm). Đỏ có chủ
  đích: hạ trần 1 + thêm khóa file không có → 5 đỏ, trả lại → 10 xanh.
- Kiểm: typecheck, lint, format, `arch:check`, `arch:docs:check`, `rules:check`, `test:discovery`; gates 15 suite / 293
  test; unit 268 suite / 3 845 test; DI 11 graph; HTTP focused 13 suite / 387 test; integration focused 124/126 suite —
  `unit-only-cost-attribution` đỏ thật (spec stub đồng hồ trên facade, capability nay đọc `OrganizationContextService`) → spy
  thêm context, 5/5; `cost-center-direction-cli` đỏ một lần khi chạy song song ("Fewer than 2 backends reached a lock wait in
  time"), chạy riêng 18/18 — Tester theo dõi ở lượt cuối, không coi là đã xong nếu tái diễn.

**Lượt 6b — Phase 5 đạt đích (Implementer, focused; Orchestrator kiểm lại tổng suppression theo luật, 0/14 module có vòng,
`openapi.json` sha1 `7f475bd7…` và `prisma/` không đổi, không `eslint-disable` ba luật trong `src`, ngưỡng 12 / 60 / 8).**

- Suppression 194 → **113**: complexity 86 → 59, max-lines-per-function 85 → 54, **max-params 23 → 0** (không còn khóa);
  complexity + max-lines **113 ≤ 120**; `requests` **37 ≤ 50**. Dừng khi đạt cả ba đích; 113 mục còn lại liệt kê theo
  file/hàm, không mục nào cần đổi hành vi.
- Facade: `LicensingApi` 13 → 6 dependency (thu hồi, giao task, đọc seat) + năm facade mới trong `licensing/public/`
  (`LicensingHandoverApi`, `LicensingRenewalApi`, `LicensingOpenGrantsApi`, `LicensingServiceAccountApi`,
  `LicensingSeatBaselineApi`), tên/chữ ký/JSDoc phương thức giữ nguyên, consumer tiêm facade sở hữu phương thức, 5 mục
  `PUBLIC_CONTRACT_EXPORTS`. `SuperAdminEventApi` 11 → 8, vẫn một facade một phương thức `run` (hợp đồng CLI), phần ghi sự
  kiện vào service riêng của `personnel/super-admin-event/`. Cổng `DepartureChanges` (abstract class,
  `useExisting: OffboardingChangeService`, như `ApplicationPlans` của `catalog`) vì nhóm `offboarding/change/` là riêng.
- Tách theo use case bằng lớp giai đoạn (`*Preconditions`, `*Writer`, `*Judge`, `*Recorder`, `*Gate`) + policy/mapper thuần
  có spec viết trước và đỏ trước khi có code; `ProvisioningService` 12 → `ProvisioningGrantService` (4) +
  `ProvisioningGrantPlanner` + `ProvisioningGrantWriter` + `provisioning-grant.policy.ts`.
- TG-2: trần 59 / 54 / 113 / `requests` 37; test mới "không khóa `max-params`". Đỏ có chủ đích: trần complexity 58, trần
  `requests` 36, chèn khóa `max-params` → mỗi lần 2 đỏ; trả lại 10/10 xanh.
- Kiểm: typecheck, lint, format, `rules:check`/`rules:format`, `arch:check` (1 420 module), `arch:capabilities`,
  `arch:docs:check`, `test:discovery`; gates 15 / 293; unit 274 suite / 3 956 test; DI 11 graph; HTTP focused 32 suite / 922
  test (một lỗi đọc cache transform của jest, chạy lại riêng 42/42). **Integration focused chưa có kết quả:** Docker Desktop
  ngừng trả lời giữa lượt (máy còn < 1 GB RAM trống), 151 suite đỏ vì môi trường (`Cannot provision a disposable database`,
  `ECONNRESET`, timeout hook), 0 assertion sai; không khởi động lại Docker vì sẽ chạm `redis-server` — chạy lại ở lượt kiểm
  cuối của Tester.
- Thư mục ở trần 25: `requests/group-request`; 24: `requests/assessment`, `requests/access-request`, `personnel/offboarding`,
  `licensing/provisioning`, `catalog/subscription`.

**Lượt 7 — 7.1–7.4, TG-3, TG-9, 8.2, 8.3 (Implementer, focused; Orchestrator kiểm lại sha1 `openapi.json` và diff ngữ
nghĩa với `HEAD`, phân loại phía request/response; Docker vẫn treo nên không có integration/E2E).**

- 7.1 R10: export ngoài `PUBLIC_CONTRACT_EXPORTS` chỉ hợp lệ khi mọi lớp tiêm token (tham số constructor, `@Inject`,
  `inject` của factory, kể cả qua module re-export) nằm trong Nest module cùng thư mục module xuất; đọc từ DI của 11 graph
  (`test/support/module-export-consumers.ts`, `test/support/process-graphs.ts`). `LEGACY_PRIVATE_EXPORTS` xóa; 5 service
  `OrganizationModule` + `FinanceModule: CurrencyService` ra khỏi danh sách hợp đồng (0 consumer ngoài thư mục), 5 facade
  `Licensing*Api` ở lại. Đỏ có chủ đích: `StepTargetService` tiêm `DepartmentRepo` → đỏ ở `AppModule`, `WorkerModule`,
  `SuperAdminEventCliModule`. Ghi cho Owner: `OrganizationModule: OrganizationRepo` không còn consumer nào (ngoại lệ E4 của
  Owner) — giữ nguyên, không tự gỡ.
- 7.2: 74 tên gate bỏ mã (mã sang comment); registry của `api-collection-contract` sang năm file
  `test/support/api-collection-registry*.ts` (≤ 400 dòng mỗi file, trần cấu trúc support); 297 test trước = sau, từng file.
- 7.3: manifest mã ví dụ theo module (catalog, data-import, finance, health, identity-access, operating-parameters,
  organization; 14 mục licensing vào file có sẵn); so map gộp cũ/mới: bằng nhau, 233 operation, 0 trùng.
- TG-3: gate `deployment-roles` đọc import runtime của `src` bằng parser TypeScript (bỏ spec, import type, builtin), 21 gói
  đều trong `dependencies`; đỏ có chủ đích: file tạm import `supertest`. TG-9: gate `capability-graph` — file `src/core` chỉ
  một module dùng thì đỏ, trừ `CORE_PRIMITIVES_OF_ONE_AREA` (`core/money/convert.ts`, có lý do; mục thừa đỏ); đỏ có chủ
  đích: file core tạm chỉ `finance` dùng.
- 8.2 (F01): `src/infrastructure/http/dto/business-date.dto.ts` thay 25 định nghĩa ngày ở 23 DTO — giữ đúng
  `refine(isBusinessDate, message)` và bốn câu lỗi đang có, thêm `.meta({ format: 'date', description })`, không `pattern`;
  unit 28 test (issue/code/path như refine viết tay; khớp `z.iso.date()` trên hơn 300 năm × tháng 00–13 × ngày 00–32).
  Đóng: 96 lá ngày phía request (gồm 4 lá trong `oneOf` của draft), `format: email` 3 trường (+ câu chuẩn hóa ở 2 `workEmail`),
  `uniqueItems` 6 mảng, `minProperties: 1` 3 patch, câu trim một lần ở `info.description`, mô tả cho 19 luật object còn
  lại (query `auditEventList` mô tả trên trường), không `anyOf`. Chỉ mô tả: RC-4 URL, RC-7 non-blank, `items` duy nhất theo
  `planId`, trim, `canBeNormalized`. Ghim cũ của bốn trường ngày nullable (`UpdateSubscriptionBodyDto`, `PlanTermsBodyDto`)
  đổi thành `{ type: 'string', nullable: true, format: 'date' }` + mô tả "calendar date" — đổi hợp đồng có chủ đích.
  Test đầy đủ mới `test/http/platform/openapi-request-rules.http-spec.ts`; đỏ có chủ đích ba lần (bỏ factory một ngày,
  bỏ `uniqueItems`, bỏ `minProperties`).
- 8.3 (F03): 23 mô tả response đổi — Tier 1: 9 bắt buộc + 2 tùy chọn cùng loại (`projectList`/`projectGet` 403); Tier 2:
  12 GET, câu chữ theo guard/policy đọc thật (budget version: Finance, spending approver và người thay khi xung đột lợi ích —
  `requireVersionReader`). 422 giữ `VALIDATION_ERROR`; status/ví dụ/security/guard/thông điệp runtime không đổi. Gate mới
  `test/http/platform/openapi-read-wording.http-spec.ts` (denylist mọi GET + kỳ vọng đúng 19 route đọc): đỏ trước sửa 22
  lỗi, đúng 21 cặp (operation, status) sai. Thấy, không sửa: 422 của `seatBaselineImportRows` chỉ nói "identifier".
- Export hai lần byte bằng nhau: `96eaaafef3cd85df29206cd523e8b44a0d482bab` (trước `7f475bd7…`). Diff ngữ nghĩa với `HEAD`
  (bỏ qua `description`): 114 khóa thêm, không gì khác — `format: date` 94 request + **8 response** (task thu hồi của
  `licensing/provisioning`: `GrantResponseDto`, `TaskResponseDto`, `TaskPageResponseDto` — DTO response dùng chung lược đồ
  ngày), `format: email` 3, `uniqueItems` 6, `minProperties` 3. Mô tả: 132 thêm, 24 đổi (23 response + `info`).
  `verify-f01.js`: 96 lá ngày, 0 lá thiếu format, 0 pattern; `uniqueItems` 6/7; `minProperties` 3/3.
- 7.4: gate `test/gates/test-size.gate-spec.ts` (trần 800 dòng `test/integration|http|e2e`, không ngoại lệ), đỏ trước đúng 7
  file. `api-inventory.http-spec.ts` (840) → 4 spec, 39 = 39 test, chạy xanh. Sáu spec integration → 20 spec + 6 harness
  `test/support/`; khai báo test 252 = 252 (đếm tĩnh), dài nhất 554 dòng; mutation probe trỏ sang
  `account-creation-http.integration-spec.ts`. **Orchestrator thấy yếu đi:** `it` bất biến I-2
  (`findPlacementCoverageViolations`) trước chạy cuối file cũ trên mọi nhân viên của file; sau tách chỉ còn ở
  `department-integrity-http` và `employee-import-confirm-http` → giao sửa ở lượt 8. Chưa chạy runtime vì Docker.
- Kiểm: typecheck, lint (59 / 54 / 0), format, `rules:check`/`rules:format`, `arch:check`, `arch:capabilities`,
  `arch:docs:check`, `test:discovery`; gates 16 suite / 305 test; unit 275 / 3 984; HTTP 51 suite / 1 267; `test:scripts`
  252 pass / 2 skip; DI 11 graph.

**Lượt 8 — sửa hai điểm của lượt 7 + Phase 6 + tài liệu 7.6 (Implementer; Orchestrator kiểm lại sha1, `prisma/` và
`.github/` không đổi, `comment-codes` 0 mã, guide cũ đã xóa, ADR-0019 vẫn Proposed).**

- A1: tám spec tách từ `departments-http`/`employee-imports-http` có ghi nhân viên/placement đều kết thúc bằng `it` I-2
  (helper `placementViolations()` của harness); khai báo 252 → 258 (+6 = tám file thay hai). Bốn nhóm tách còn lại: mỗi file
  giữ `beforeAll`/`afterAll`/`afterEach` của file gốc.
- A2: lá ngày phía response dùng `responseBusinessDate` ("A calendar date as YYYY-MM-DD.", giữ `format: date`); test
  `openapi-request-rules` đỏ khi lá response mang câu của input. Export hai lần `fa1b6f73d2345f76306d0bf38b1e1c9e78b4dd24`;
  so bản `96eaaafe…`: 8 khác biệt, đều `description`.
- 6.3: `scripts/arch/comment-codes.mjs` (chỉ in) → 0 mã việc; dọn comment `src/**/*.ts` theo module; chứng minh chỉ đổi
  comment: `tsc --removeComments` trước/sau giống hệt 4 012 file của `src/`; `openapi.json` đúng byte.
- 6.2: ADR-0019 viết lại theo R1–R10 đã làm (R10, TG-2, TG-9, trần R9), mục _Sai khác đã chấp nhận_ S1–S13 + O1–O3, bỏ
  `whenUnbound`/`canAnswer`; **giữ Proposed** (`OD-R7`), §3 và §5 ghi "Owner review: pending" — không có sự kiện Owner
  review. ADR-0005 câu trạng thái theo số đếm migration thật; ADR-0003 giữ ghi chú superseded; `module-structure.md` (mỗi
  luật nêu gate hoặc "review"), `ARCHITECTURE.md`, `runtime-details.md` (ràng buộc đồng hồ < 5 s), card `organization`,
  `finance`, `operating-parameters`.
- 6.1: `docs/guides/huong-dan-dev-moi.md` (7 phần, 238 dòng) thay `kien-truc-backend-va-cach-viet-code.md` (đã xóa); link
  sửa ở `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/README.md`, `docs/rules/api-contract.md`,
  `rules-check.config.json`, `rules:format`. Phần 2 lần `need-decision` theo đường dẫn hiện tại; script kiểm 145 tham chiếu
  (link, đường dẫn, lớp, `Class.method`, script) — 0 thiếu. Walkthrough người thật (O7) **pending**, ghi ngay trang đầu.
- 7.6 (`OD-R8` = B, Orchestrator duyệt theo §2.3 của Prompt 09, không phải phiếu Owner): spec/plan
  `be-test-architecture-redesign`, `test/README.md`, nghiệm thu §5 P5 và §8 bước 1 ghi P5 = số đo (job 1 886 s / 1 825 s,
  bước song song 1 676 / 1 624 s, timing 56 / 54 s, serial 61 / 59 s — run 40923299529, 40945441332); quy tắc
  "timeout = p95 đo được + 50 %" cho ≈ 47 phút so với 40 đang cấu hình → **Owner quyết**, chỉ 2 mẫu; đo lại sau khi tách 6
  → 20 spec. Không sửa `.github/workflows`.
- Kiểm (một lần sau sửa cuối): `rules:check` 322 file / 2 751 link 0 lỗi, `rules:format`, `format:check`, typecheck, lint,
  `arch:check` 1 422 module 0 vi phạm, `arch:capabilities` 0/14, `arch:docs:check`, `test:discovery`; gates 16 / 305; unit
  275 / 3 985; HTTP 51 / 1 269; `test:scripts` 252 pass / 2 skip; DI 11/11. Integration/E2E chưa chạy (Docker treo).

**Kiểm cuối của Tester (§5 của Prompt 09) trên cây ổn định, 31/10/2026 01:29–01:51.** Dấu vân tay ngoài `docs/` (HEAD +
nội dung mọi path đổi/chưa track): `HEAD=f498c74… paths_outside_docs=1096 fingerprint=e173051de7272d79…` — giống nhau đầu
và cuối lượt; Tester không sửa file sản phẩm. Logs: thư mục `p09-test-tmp/final/` trong scratchpad của phiên.

| Bước | Lệnh                                                        | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm check` (một lệnh, `TEST_DATABASE_*` unset, 11 m 36 s) | xanh cả 15 bước: rules 322 file / 2 751 link, `rules:test` 38; lint 113 suppression (59 / 54 / 0); unit 275 / 3 985; gates 16 / 305; `arch:check` 1 422 module; `test:scripts` 252 pass / 2 skip (sẵn có ở HEAD); `test:discovery`; build (10 alias CLI)                                                                                                                                                                                        |
| 2    | `pnpm test:http`; `openapi:export` ×2; diff ngữ nghĩa       | 51 / 1 269 xanh; hai export và file commit cùng sha1 `fa1b6f73…`; so `HEAD`: 114 khóa ngoài `description` (date 94 request + 8 response, email 3, `uniqueItems` 6, `minProperties` 3); 287 operation: status/security/ví dụ/operationId/summary/tham số/schema response không đổi; 23 mô tả 403/422 khớp đúng inventory §6 (0 thừa, 0 thiếu); `verify-f01` 96 lá ngày, 0 thiếu format                                                           |
| 3–5  | integration song song/timing/serial; E2E; image             | **pending — Docker Desktop engine treo** (`docker ps`, `docker version` timeout); không khởi động lại Docker/WSL, không chạm container. Thay thế cục bộ (không phải bằng chứng image): `node dist/cli.js --help`, `node dist/inspect-cli.js --help` thoát 0; `pnpm install --prod --frozen-lockfile` ở thư mục tạm: 21 gói runtime của `dist` resolve, `bullmq`/`@nestjs/bullmq` nạp được, module queue biên dịch nhưng không ai import (OD-R5) |
| 6    | vệ sinh diff so `HEAD`                                      | không `.skip`/`.only`/`xit` mới; timeout tường minh: tập giá trị như HEAD, số lần tăng chỉ do `beforeAll` của file tách (bằng file gốc); không snapshot; không `eslint-disable` ba luật; `.github/`, `prisma/` không đổi; không gì staged; quét secret 310 file chưa track + dòng thêm: 3 chuỗi fixture dạng khóa chuyển nguyên từ spec cũ                                                                                                      |

- Tester kiểm độc lập: suppression 113 ở 82 file (`requests` 37 ở 24 file), mọi khóa trỏ file có thật; khai báo bảy file
  tách 288 → 294 (+6 = các `it` I-2), mọi tiêu đề cũ còn nguyên; I-2 có ở cả 8 file; hook gốc đều còn (dọn trong
  `afterEach`/`stop` của harness).
- Mối lo test (chuyển Reviewer cân): gate TG-2 chưa ghim các luật lỗi khác (`no-explicit-any`, `no-floating-promises`…)
  và việc không có mức `warn`/`--max-warnings`; 20 spec integration tách + 3 spec `_serial` H7 + `personnel-file-hooks`
  chưa có bằng chứng runtime ở cây này; 422 của `seatBaselineImportRows` chỉ nói "identifier" dù route nhận query.

**Bước 3–5 sau khi Docker chạy lại (31/10/2026 02:00–03:51).** Owner cho phép restart; Main chạy `docker desktop restart`
(~01:58), `redis-server` (restart policy `no`) được Main bật lại đúng trạng thái trước (Up, port 6379); container Dead
`4501222215c4…` không đổi. Dấu vân tay `e173051d…` giống nhau đầu/cuối; `openapi.json` vẫn `fa1b6f73…`.

| Bước | Lệnh (PG 17.11 riêng `slm-p09-test-pg` `127.0.0.1:55452`, role `ci_integration` không superuser)                                                                                                                                              | Kết quả                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a   | `pnpm test:integration --maxWorkers=2` (`TEST_CLI_RUNTIME=dist`)                                                                                                                                                                              | 271 suite xanh, 1 skip; 3 398 test, 4 skip (`object-storage-real`, `describe.skip` khi không có MinIO — như HEAD), 0 đỏ; 26 m 22 s. 20 spec tách: 0 đỏ, 0 skip (từng file trong báo cáo Tester); `cost-center-direction-cli` 18/18, không tái diễn                                                                                           |
| 3b   | `pnpm test:integration:timing`                                                                                                                                                                                                                | 7 suite / 28 test xanh; 65 s                                                                                                                                                                                                                                                                                                                 |
| 3c   | `pnpm test:integration:serial` (+ `TEST_DATABASE_BOOTSTRAP_URL`)                                                                                                                                                                              | 11 suite / 92 test, 0 skip; gồm `database-runtime-sequences` 27, `…-notice-write` 3, `…-saas-issue-write` 3 (H7-SEQ); `personnel-file-hooks` 5 xanh; 94 s                                                                                                                                                                                    |
| 4    | `pnpm test:e2e`                                                                                                                                                                                                                               | 8 suite / 36 test xanh; 45 s                                                                                                                                                                                                                                                                                                                 |
| 5    | `docker build --target runtime -t slm-be:p09-final` (như `deploy.yml`); provision → preflight → `migrate deploy` → reconcile từ image trên DB rỗng; `prisma migrate diff … --exit-code`; container API/worker trên mạng riêng, cấu hình bỏ đi | build xanh (941 MB); preflight `READY (NOT_INSTALLED)`, reconcile không finding; "No difference detected", 125 = 125 migration; API `health/ready` 200 với role runtime; worker log `Worker started`; `cli.js`/`inspect-cli.js --help` thoát 0; OD-R5: `bullmq` nạp được, không env redis/queue, không socket tới 6379; restart 0, OOM không |

Dọn: Tester xóa container/mạng/image `slm-be:p09-final`/DB/role của mình (`rm -v`), không còn DB/role `slm_*`; còn
`slm-p09-impl-pg` (Implementer) và `slm-be:p09-check` — Main dọn ở cuối. Ghi chú 7.6: số đo cục bộ nhóm song song
26 m 22 s (`--maxWorkers=2`, 272 file sau khi tách) chỉ tham khảo, không thay số đo CI.

**Review cuối vòng 1 (Reviewer `claude-opus-5-5`, chỉ đọc, 31/10/2026, cùng dấu vân tay `e173051d…`).** Không Blocker/High;
3 Medium, 7 Low. Đã kiểm đạt: H7 (chính sách, thứ tự, lặp lại, schema cũ), giữ hành vi của các tách Phase 5 và bỏ vòng
`organization` (so từng dòng với HEAD), F01 (ngày/email/`uniqueItems`/`minProperties` khớp runtime), F03 (23 câu khớp
guard/policy), M-1/L-1/L-2/L-3, gói/OD-R5, ADR-0019 Proposed, trace của guide.

| ID        | Mức    | Chỗ                                                                  | Vấn đề                                                                                                                                                                 | Xử lý                                                                                                                                                                                     | Chủ                  | Trạng thái                                                              |
| --------- | ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| P09-FR-01 | Medium | `src/app/configure-application.ts` (`info.description`)              | câu trim toàn cục sai với 97 trường không `.trim()` (mật khẩu `min(1)` nhận `"   "`, `jobTitle` đo trước trim, `functional-group` từ chối bằng lỗi riêng)              | chỉ khẳng định trim ở trường có `.trim()`, nêu ngoại lệ; test: mỗi lá được mô tả là trim phải có trim, không còn câu toàn cục                                                             | Implementer          | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-02 | Medium | `test/gates/lint-debt.gate-spec.ts`                                  | gate so chuỗi config; thêm override `'warn'` vẫn xanh; không ghim luật lỗi khác, không ghim việc thiếu `--max-warnings`                                                | đọc config hiệu lực (`calculateConfigForFile`) cho file `src`/`test`, ghim mức 2 + tùy chọn tám luật, `reportUnusedDisableDirectives`, script `lint`; đỏ có chủ đích bằng override `warn` | Implementer          | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-03 | Medium | AC Task 4.3; `REQUESTS_CONTROLLER_IMPORTED`                          | AC "≤ 50 cạnh; capability có controller không bị import" chưa đạt mà bảng ghi xong; allowlist chưa có Owner duyệt                                                      | **Owner quyết 31/10/2026: chấp nhận tiêu chí thay thế** (ghi ở spec và Task 4.0); sửa comment gate "Owner decides" thành quyết định đã có                                                 | Main/Owner           | đóng — Owner quyết; comment gate/card/ADR sửa vòng 1; Reviewer xác nhận |
| P09-FR-04 | Low    | `organization.api.ts`, `finance.api.ts`; gate `extension-wiring`     | 8 phương thức facade không còn người gọi; `OrganizationApi` tiêm `DepartmentServiceAccountReaderHook` chỉ cho phương thức chết, giữ ngoại lệ wiring #3 với lý do đã cũ | gỡ phương thức chết (0 người dùng) hoặc nêu lý do giữ; sửa/gỡ ngoại lệ wiring theo                                                                                                        | Implementer          | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-05 | Low    | `seat-baseline-imports.controller.ts` (422 `seatBaselineImportRows`) | mô tả 422 chỉ nói "identifier", route còn kiểm query                                                                                                                   | câu như `employeeImportRowList`; thêm vào `READ_WORDING`                                                                                                                                  | Implementer          | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-06 | Low    | `organization-context.service.ts`; 12 spy ở `test/**`                | capability đọc đồng hồ qua `OrganizationContextService`, spec spy `OrganizationApi.businessToday` không còn điều khiển ngày                                            | một seam: harness/spy stub `OrganizationContextService.businessToday` (facade ủy quyền vào nó)                                                                                            | Implementer → Tester | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-07 | Low    | ADR-0005 (trạng thái)                                                | 126 migration / 343 `CHECK (` sai                                                                                                                                      | sửa 125 thư mục / 341 (phân biệt hoa thường), ghi cách đếm                                                                                                                                | Main                 | đóng — Main sửa (125 thư mục, 341 `CHECK (`); Reviewer xác nhận         |
| P09-FR-08 | Low    | plan H7                                                              | thiếu mục Prompt 09 / H7-SEQ                                                                                                                                           | thêm mục có ngày, trỏ bằng chứng ở plan này, runtime cây cuối và VPS ghi pending                                                                                                          | Main                 | đóng — Main thêm mục H7-SEQ; Reviewer xác nhận                          |
| P09-FR-09 | Low    | `test/support/module-export-consumers.ts`                            | provider `useExisting` không sinh token consumer → R10 bị vượt nếu alias chéo thư mục                                                                                  | tính đích `useExisting` là bị tiêm; ca tổng hợp đỏ                                                                                                                                        | Implementer          | đóng — sửa vòng 1, Tester kiểm lại, Reviewer xác nhận                   |
| P09-FR-10 | Low    | `BudgetNotAReaderError` (ví dụ 403 `budgetVersionList`)              | message runtime "Only Finance and the spending approver…" thiếu người thay khi xung đột lợi ích                                                                        | **Owner quyết 31/10/2026: giữ message, ghi việc sau** (ngoài phạm vi 8.3: không đổi message runtime)                                                                                      | Owner                | đóng theo Owner — việc sau ngoài P09                                    |

**Vòng sửa 1 (Implementer, 31/10/2026) → Tester kiểm lại → Reviewer xác nhận.** FR-01: `info.description` chỉ hứa cắt
khoảng trắng cho trường có mô tả nói "trimmed" (4 lá, đều trim trước khi kiểm); test lá: lá nói trim phải trim, lá không
trim không được nói trim. FR-02: gate `lint-debt` đọc config ESLint hiệu lực từng file (`calculateConfigForFile` qua
`scripts/arch/eslint-effective-config.mjs`, chạy bằng `runScript`) cho 8 luật mức 2 + tùy chọn, không mức `warn`,
`reportUnusedDisableDirectives` error mọi file (trước đó `warn` cho spec trong `src` — sửa ở `eslint.config.mjs`); đỏ có
chủ đích bằng override `warn`. FR-03: comment gate, card `requests`, `module-structure.md`, ADR-0019 ghi quyết định Owner
(ADR vẫn Proposed). FR-04: gỡ 7 phương thức `OrganizationApi` + `FinanceApi.listCurrencies` (0 người dùng), facade thôi tiêm
`DepartmentServiceAccountReaderHook`, ngoại lệ wiring #3 xóa (còn 8). FR-05: 422 `seatBaselineImportRows` nói cả query, ghim
trong `READ_WORDING`. FR-06: `test/support/pretend-today.ts` stub `OrganizationContextService.businessToday` (một seam cho
capability và facade), 12 chỗ dùng, gate cấm spy `businessToday` khác; probe cho thấy spy cũ không điều khiển 13 lần đọc
của module trong `organization-identity-read-contracts` (assertion không phụ thuộc ngày). FR-09: đích `useExisting` tính là
bị tiêm, ca tổng hợp đỏ trước. Export: 2 khác biệt so `fa1b6f73…`, đều `description`; `openapi.json`
`6acc716751f9efd858c77ab150780fc6bffd81a5`.

Tester kiểm lại trên dấu vân tay `14ec31e0aa9f7334…` (1 108 path ngoài `docs/`, giống nhau đầu/giữa/cuối): `pnpm check` xanh
mọi bước (gates 16 / **317**, unit 275 / 3 985, `test:scripts` 252 pass / 2 skip, build); `test:http` 51 / **1 272**; hai
export = file commit `6acc7167…`; so `HEAD` vẫn đúng 114 khóa ngoài `description`; integration song song 271 suite + 1 skip
(`object-storage-real`), 3 398 test + 4 skip, 0 đỏ, 1 118,8 s; E2E 8 / 36. Không chạy lại timing/serial/image: không file
nào của hai nhóm đổi ngoài helper ngày (serial không gọi), `Dockerfile`/lockfile/`package.json`/`.github/`/`prisma/` không
đổi — bằng chứng của chúng là lượt trên `e173051d…`. Ghi chú môi trường: một khoảng ~3 h 50 m treo trong `test:scripts`
(máy ngủ, CPU không chạy), không phải lỗi test. Reviewer kiểm lại từng sửa trên code: **10/10 đóng, 0 finding mới, 0
finding trong scope chưa xử lý.**

Hồ sơ hợp đồng cho Docs/FE: [delta metadata OpenAPI](openapi-contract-delta-2026-10-31.md) (sinh từ hai bản export).

Dọn tài nguyên: Tester xóa `slm-p09-test-pg` (hai lượt), mạng, container API/worker, image `slm-be:p09-final`, DB/role
`slm_*`; Main xóa `slm-p09-impl-pg` (`rm -v`, kèm volume dữ liệu) và image `slm-be:p09-check`. Còn một volume vô danh
`d36efb1f3b89…` (nhãn `com.docker.volume.anonymous`, tạo 01:42Z lúc tạo `slm-p09-test-pg` lượt hai, không container nào
dùng): Tester bị chặn xóa vì không xác minh được chủ từ tên → Owner cho phép, Main xóa 31/10/2026. 0 tài nguyên do lượt này tạo còn lại. `redis-server` Up, container Dead không đổi.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker. (Task 4.3 đóng theo tiêu chí Owner duyệt; phần cần
      Owner/remote ghi `pending`: O7, review ADR-0019, CI cây mới, A/B deploy gate, nightly, deploy VPS cho H7-SEQ.)
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review đã xử lý (10 finding, mục trên).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. (Đã giao cây local + dấu vân tay; roadmap ghi `ready-for-owner-review`; chưa commit/PR.)

## Owner execution addendum 2026-10-30

### Authority, scope and execution

Owner yêu cầu ngày 30/10/2026: thực hiện toàn bộ plan/spec hiện hữu cùng H7 sequence BM-09/BM-11 và
API-DOC-F01/F03; implement → test → review độc lập → sửa → kiểm lại đến khi hoàn tất phạm vi local.
Prompt điều phối được lưu ngoài repo BE tại workspace:
`Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/09-implement-readability-h7-and-openapi-closure.md`.
Đây là bổ sung kế hoạch, không phải bằng chứng đã implement hoặc Owner đã duyệt mọi OD/ADR.

Phụ lục này có ưu tiên đối với các câu xung đột trong spec/plan trước nó:

- Giữ Phase 0–7 và AC hiện hữu. Thêm Tasks 8.1–8.3 vào inventory; làm 8.1 trước khi di chuyển các file nó phụ thuộc,
  làm 8.2/8.3 trước export và gate contract cuối. Không tạo work item/prompt con chỉ để chuyển finding.
- Được chạy test local cần thiết theo phân tầng mới, kể cả PostgreSQL cô lập và HTTP/E2E; không xin phép lại từng suite.
  Trong lúc implement chỉ focused red/green và kiểm tra tĩnh liên quan. Gom bộ bất biến/full suites thành một pass cuối;
  không chạy toàn bộ lint/gates/check/export sau từng task hoặc phase. Các checkpoint là nội bộ, không phải điểm dừng
  chờ Owner. Chạy lại gate bị ảnh hưởng sau sửa lỗi, giữ bằng chứng gate không bị tác động trên fingerprint xác định.
- Chọn và ghi lý do các lựa chọn kỹ thuật thường lệ của OD-R1/R2/R3/R4/R6/R8/R9 và Task 4.0 trong cùng plan;
  không ghi là Owner đã chọn A khi chưa có câu trả lời. R5 đã được Owner quyết định GIỮ queue/Redis; R6 giữ module
  hiện tại. R8 mặc định bám hướng B: giữ một runner và số đo/budget thực tế, không mở tối ưu P7/P8 hoặc bắt shard 15 phút.
  R9 phải chứng minh image còn đủ Prisma engine/CLI, native binary và mọi lệnh vận hành khi thay packaging.
- OD-R7: cập nhật ADR đúng thiết kế, giữ Proposed hoặc Implemented nếu chưa có Owner acceptance; không ép Owner ký
  từng ADR để chặn code. OD-R10 hoặc thiếu listener có thể đổi nghiệp vụ phải đối chiếu nguồn và hỏi gộp có phương án
  trước khi đổi kết quả transaction/boot. Sau trả lời, tiếp tục chính lượt này; không kết thúc bằng một plan sửa để sau.
- Refactor thuần không được đổi route/status/security/schema/runtime validation. Riêng Tasks 8.2/8.3 được đổi metadata
  OpenAPI mô tả đúng runtime đã có; thay invariant đúng byte bằng semantic diff có danh sách thay đổi được phép.
  Schema database/migration vẫn giữ nguyên cho ba task bổ sung; nếu thật sự cần đổi phải chứng minh và hỏi trước.
- Owner chỉ yêu cầu chuẩn bị implement ở lượt soạn prompt này. Không stage/commit/push/merge/SSH/deploy, không đọc
  private env, không reset/seed VPS, không dọn dump/volume cũ. Manual flow testing thuộc FE; API-GAP thuộc dev BE.
  Lỗi CLI seed exit 1 vẫn là task riêng, không được gọi là đã sửa nhờ refactor hoặc nhờ cấp quyền sequence.

### Task 8.1 — H7-SEQ: quyền sequence BM-09/BM-11 bền vững

- Outcome: runtime tạo BM-09/BM-11 qua đường ứng dụng thật sau reconcile lần 1 và lần 2; không còn SQLSTATE 42501
  cho `personnel_notice_seq` và `saas_issue_seq`. Reconcile không xóa quyền cần thiết vừa được sửa.
- Sources: `src/infrastructure/database/roles/database-role-provisioning.ts`,
  `src/infrastructure/database/database-role-judgement.ts`, facts reader/types/tests liên quan;
  `src/modules/personnel/notice/notice.repo.ts`, `src/modules/licensing/saas-issue/saas-issue.repo.ts`;
  [H7 spec](../h7-postgresql-runtime-role-separation/spec.md) và
  [H7 plan](../h7-postgresql-runtime-role-separation/plan.md).
- Diagnosis input: provisioner revoke toàn bộ quyền sequence rồi chỉ GRANT USAGE; verifier cũng bắt đúng USAGE.
  Hai repo còn đọc trạng thái sequence và gọi setval để giữ tương thích. Phải tái xác minh trên HEAD thật.
- Design: một chính sách tên/ACL sequence canonical dùng chung grant và judgement; chỉ hai sequence thực sự cần mới
  có USAGE/SELECT/UPDATE. Sequence khác và default privilege cho sequence tương lai vẫn chỉ USAGE; không thêm
  SECURITY DEFINER, không tăng quyền owner/superuser hoặc UPDATE hàng loạt. Probe object tồn tại ở baseline cũ;
  không phát GRANT vào object chưa có và không bỏ qua object bắt buộc ở schema cuối.
- Giữ cơ chế đồng bộ số/khả năng recovery hiện có. Không xóa setval chỉ để hết lỗi quyền. Cập nhật ma trận/runbook H7
  tại nguồn sở hữu; plan này chỉ điều phối task.
- Red/green: unit bắt thiếu quyền và quyền thừa; isolated PG17 chạy deploy/runtime riêng, reconcile → verify → thực thi
  tạo cả hai nghiệp vụ bằng runtime → reconcile lần nữa → verify → tạo lần nữa. Đối chứng sequence thường/tương lai:
  nextval được, SELECT trạng thái/setval bị từ chối, DDL bị từ chối. Kiểm assertion kết quả nghiệp vụ/audit/số duy nhất,
  không chỉ SELECT 1 hoặc health.
- Acceptance: grant/verify đồng bộ và idempotent, test đỏ đúng nguyên nhân trước sửa rồi xanh, các quyền cấm vẫn cấm,
  không cần lệnh GRANT tay sau deploy bình thường.
- Reference: [PostgreSQL 17 sequence functions](https://www.postgresql.org/docs/17/functions-sequence.html);
  setval yêu cầu UPDATE; đọc trạng thái sequence phải kiểm ACL thực tế.

### Task 8.2 — API-DOC-F01: metadata validation đúng runtime

- Outcome: contract máy đọc được phản ánh đầy đủ ràng buộc runtime có thể biểu diễn trong OpenAPI dialect hiện tại;
  luật refine/transform/liên trường không thể biểu diễn chính xác được mô tả rõ, không khai pattern/format giả.
- Sources: `Docs/Figma UI-UX/API-Integration/changes/CHANGELOG.md` (đọc); DTO/Zod schema thực tế,
  `src/infrastructure/http/dto/zod-dto.ts`, `openapi-presentation.ts`,
  `scripts/dev/export-openapi.ts`, `test/http/platform/`, validators và manifest literal liên quan.
- Inventory trước sửa: operation/schema/field, runtime constraint, metadata hiện tại, cách biểu diễn/description,
  regression case và trạng thái. Không tuyên bố closure chỉ vì thêm format email/date ở một field; kiểm mọi trường hợp
  của finding F01 trong exporter chung và các DTO bị ảnh hưởng.
- Không đổi runtime schema/parser, trim, timezone/date semantics, required/null/empty, status/code/message để khớp docs.
  Ví dụ ngày phải phân biệt format bề mặt và ngày thực; email/trim/refinement không tự nhận tương đương regex.
  Giữ dialect OpenAPI 3.0 hiện hữu, success messages, error mapper-derived examples và security.
- Regression cases: ngày tồn tại/không tồn tại, email, khoảng trắng, bounds/pattern/format, null/omitted và luật liên
  trường hiện có; so runtime validation trước/sau không đổi và metadata đúng giới hạn biểu diễn.
- Export cuối hai lần bằng lệnh bình thường, byte-identical giữa hai lần; semantic diff với input chỉ chứa metadata
  được inventory cho phép. Không hand-edit openapi.json, không transpile-only, không cho manifest tự học.
- Acceptance: từng dòng inventory đóng có bằng chứng; constraint không thể biểu diễn có mô tả chính xác và test runtime,
  không được giấu dưới nhãn fixed toàn bộ OpenAPI validation parity.
- Reference: [OpenAPI 3.0.3 Schema Object](https://spec.openapis.org/oas/v3.0.3.html#schema-object).

### Task 8.3 — API-DOC-F03: mô tả route đọc đúng quyền và hành vi

- Outcome: route đọc không còn mô tả 403/422 như thao tác ghi; ít nhất kiểm `departmentList`,
  `costCenterEmployeeList` và toàn bộ nơi dùng chung mô tả đã gây finding.
- Sources: owning decorators/controller/error declaration của organization; inventory thay đổi operation/status/text.
- Sửa tại nguồn, route-specific khi cần; không đổi guard, policy, ví dụ code/message runtime hoặc response status để
  làm câu chữ đúng. Giữ ví dụ mapper-derived và security hiện hữu.
- Acceptance: focused regression bắt câu sai cũ, semantic OpenAPI diff chỉ đổi description/metadata được duyệt.
  Bàn giao artifact mới cho team Docs/FE cập nhật bằng generator của họ; không tự sửa Docs authoritative trong task BE.

### Matrix bổ sung và closure

| ID           | Cấp bằng chứng                                    | Điều kiện đóng                                                                                   |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| H7-SEQ       | Unit + PostgreSQL17 runtime-role integration      | BM-09/BM-11 ghi được sau hai reconcile, verify xanh; sequence thường/tương lai vẫn giới hạn      |
| API-DOC-F01  | DTO/exporter unit + HTTP contract + semantic diff | Inventory constraint đủ, runtime validation bất biến, metadata/mô tả trung thực                  |
| API-DOC-F03  | Focused description regression + HTTP contract    | Mọi mô tả bị finding sửa tại nguồn; route/status/security không đổi                              |
| FINAL-REVIEW | Reviewer độc lập + log disposition                | Không còn finding trong scope chưa xử lý; reviewer kiểm lại mọi fix và không chỉ đưa plan để sau |

Vòng cuối: implementer hoàn tất → tester kiểm cây ổn định → reviewer độc lập audit diff/AC/test strength →
implementer sửa finding → tester chạy focused/gate bị tác động → reviewer xác nhận lại; lặp trong cùng package.
Một writer tại một thời điểm; tester không sửa sản phẩm hoặc chạy suite khi implementer đang đổi cây; reviewer không
chỉnh cùng file với implementer. Không có giới hạn vòng để bỏ lại lỗi thật; không lặp audit toàn G0–G6 hay mở rộng scope.

Kiểm cuối phù hợp phạm vi rộng của plan: `pnpm check`; HTTP contract; integration parallel, timing và serial trên PG17
cô lập; E2E smoke của các luồng bị ảnh hưởng (toàn bộ smoke hiện hữu nếu thay đổi wiring xuyên graph); OpenAPI hai export
và semantic diff; image/CLI smoke nếu Dockerfile thay đổi; rules/diff/secret/resource cleanup. Lấy lệnh/cờ từ package.json,
test/README và config thực, không giả định `test:integration` đã chạy nhóm timing/serial. Không chạy lặp ba toàn bộ lượt
ổn định hay benchmark chỉ để đạt P7/P8 cũ.

### Execution ledger — Prompt 09 (30/10/2026)

Input BE: `dev` @ `f498c74` = `origin/dev` (remote-tracking ref, không fetch; 0 ahead/0 behind), không staged, không
stash; 5 path tài liệu chưa commit có sẵn (review README, roadmap, items README, spec, plan này) — giữ nguyên.

**Quyết định.** Owner trả lời qua câu hỏi có phương án ngày 30/10/2026: `OD-R10` = **A** (lỗi hook lan ra, hoàn tác lần
ghi); chênh lệch gate R1: **phân loại** — sự kiện chứng minh được không phát trong graph thì thêm
`GRAPH_WIRING_EXCEPTIONS` có lý do và báo trong bàn giao; listener thiếu thật thì dừng hỏi Owner. Các OD còn lại là lựa chọn
kỹ thuật Owner giao người thực hiện (phụ lục), ghi là **đề xuất của người thực hiện, chưa có Owner vote**:

| OD       | Lựa chọn thực hiện                                                                       | Căn cứ / điều kiện                                                                           |
| -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `OD-R1`  | Gate tĩnh R1, không kiểm lúc boot                                                        | không đổi hành vi khởi động; chạy trong `pnpm test:gates`                                    |
| `OD-R2`  | R5 như spec (module chưa capability phẳng ≤ 25 file)                                     | khớp layout hiện có của `audit`, `onboarding`, `operating-parameters`                        |
| `OD-R3`  | R6: capability import nhau được nhưng không vòng; bật dần                                | giữ S5 của nghiệm thu                                                                        |
| `OD-R4`  | Rule kích thước `error` + `eslint-suppressions.json`                                     | ESLint 9.39.5 đã cài (hỗ trợ `--suppress-all`, `--prune-suppressions`)                       |
| `OD-R5`  | GIỮ queue/Redis, chuẩn hóa khi có vấn đề cụ thể, không tự kích hoạt                      | Owner override 30/10/2026 thay lựa chọn xóa trước đây; không chạm tài nguyên Redis đang chạy |
| `OD-R6`  | Không tách `spend`                                                                       | phụ lục                                                                                      |
| `OD-R7`  | ADR cập nhật đúng thiết kế, giữ `Proposed`/ghi Implemented; không giả Owner review       | phụ lục                                                                                      |
| `OD-R8`  | B: một runner, P5 theo số đo thật, quy tắc timeout theo số đo                            | phụ lục; không shard, không tối ưu P7/P8                                                     |
| `OD-R9`  | A **chỉ khi** image smoke chứng minh Prisma CLI/engine, native binary, mọi lệnh vận hành | không chứng minh được thì B có lý do                                                         |
| Task 4.0 | Bảng tầng `requests` do người thực hiện lập, orchestrator duyệt kỹ thuật                 | phụ lục giao lựa chọn kỹ thuật; ghi là chưa có Owner review                                  |

**Vai trò.** Orchestrator (main) giữ plan/spec/ledger/tích hợp; Implementer giữ sửa sản phẩm và test nguồn; Tester chạy
lượt kiểm cuối trên fingerprint ổn định; Reviewer audit độc lập chỉ đọc. Model ID thật ghi ở mục kết quả.
Override `OD-R5` (GIỮ queue/Redis, Prompt 09 §8) đã gửi Implementer (đang ở Phase 1) và Tester ngày 30/10/2026; Reviewer
nhận trong brief khi được giao. Kiểm tại thời điểm nhận override: chưa có thay đổi nào ở `src/infrastructure/queue/`,
`bullmq`/`@nestjs/bullmq`, `.env.example`, `compose.yaml` — không cần hoàn tác.

**Tài nguyên tạm (một chủ mỗi tài nguyên, xóa đúng tên sau khi dùng).** Container PG17 `slm-p09-impl-pg`
(`127.0.0.1:55451`, Implementer) và `slm-p09-test-pg` (`127.0.0.1:55452`, Tester); image `slm-be:p09-check`,
`slm-be:p09-before` (chỉ khi Task 2.7 đổi Dockerfile); thư mục TEMP trong scratchpad của phiên `p09-impl-tmp`,
`p09-test-tmp`. Không chạm container `redis-server` và container khác có sẵn trên máy.

| Task     | Phụ thuộc              | Cấp test chính                                          | Trạng thái                                                     |
| -------- | ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 8.1      | —                      | unit + PG17 `_serial` runtime role                      | xong; local-verified 31/10/2026                                |
| 0.1      | —                      | `test:scripts`                                          | xong                                                           |
| 0.2      | Owner/ledger           | rules                                                   | đóng ở đây                                                     |
| 0.3      | bằng chứng GitHub/VPS  | đọc `gh` chỉ đọc nếu có; còn lại `pending`              | mở                                                             |
| 1.1a–1.4 | 0.1, 8.1               | gate/unit; 1.4 integration `personnel`                  | xong; local-verified 31/10/2026                                |
| 2.1a–2.7 | Phase 1                | gate/unit; 2.7 image smoke                              | xong; local-verified 31/10/2026                                |
| 3.1–3.3b | Phase 2                | gate `capability-graph`                                 | xong; local-verified 31/10/2026                                |
| 4.0–4.4  | Phase 3                | gate + HTTP/integration `requests`                      | xong; 4.3 theo tiêu chí Owner duyệt 31/10/2026; local-verified |
| 5.1–5.2  | Phase 3/4, 1.3         | lint + unit/integration module bị chạm                  | xong; local-verified 31/10/2026                                |
| 6.1–6.3  | Phase 2–5              | rules; walkthrough người thật = `pending` (O7)          | xong; O7 + review ADR-0019 `pending` (Owner)                   |
| 7.1–7.6  | 1.1a (7.1); 0.3 (7.6)  | gates/discovery; 7.6 CI = `remote-verification-pending` | xong local; 7.6 CI `remote-verification-pending`               |
| 8.2, 8.3 | trước export/gate cuối | unit DTO/exporter + HTTP contract + semantic diff       | xong; local-verified 31/10/2026                                |
| FINAL    | mọi task               | tester pass + reviewer + vòng sửa                       | mở                                                             |

Trạng thái cuối local là `local-implementation-verified / ready-for-owner-review` chỉ khi code, test, review/sửa trong scope
đạt. Remote CI/CD và FE manual QA là bằng chứng của target khác: ghi run/image thật khi truy cập được, hoặc
`remote-verification-pending` rõ ràng; không tự tạo run hoặc báo đã deploy. Owner đã báo CI/CD cũ thành công nhưng hồ sơ
O6/O7 còn trống tại thời điểm soạn phụ lục; không suy từ ảnh danh sách spec/plan thành run xanh cho code mới.
