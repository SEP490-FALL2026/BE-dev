# Plan: hoàn thiện ranh giới bên trong module và luật kiến trúc cho dev mới

- [Spec](spec.md); revision đầu vào: Docs `578f442`, BE `25d5244` (cây làm việc có WIP `shared-demo-dataset`).
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo yêu cầu Owner (30/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc [AGENTS.md](../../../../AGENTS.md), [module structure](../../../rules/module-structure.md),
  [test guide](../../../../test/README.md), [review 30/10/2026](../../../reviews/be-architecture-readability-review-2026-10-30/README.md).
- Kiểm `git status`: WIP `shared-demo-dataset` phải đã được Owner commit (spec, _Dependencies and blockers_). Không sửa file
  của hạng mục khác đang mở.
- Mỗi task chỉ di chuyển/đổi tên hoặc thêm gate — không đổi hành vi. Task nào buộc đổi hành vi thì dừng, ghi lại, mở hạng
  mục riêng.
- Sau mỗi lần di chuyển file: `pnpm arch:graph`, `pnpm arch:routes` (tài liệu sinh), cập nhật module card và import trong
  `test/` (spec được import file private của `src`).
- Trong phiên AI: hỏi Owner trước khi chạy `pnpm test:integration`, `pnpm test:http`, `pnpm test:e2e`; `pnpm check` chứa
  unit và gate, chạy được theo task.

### Số đo mốc (30/10/2026, BE `25d5244` + WIP)

| Đo                                             | Mốc                                                                                                  | Đích cuối hạng mục    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------- |
| Module có vòng capability                      | 7/14 (`catalog`, `finance`, `identity-access`, `licensing`, `organization`, `personnel`, `requests`) | 0                     |
| Cạnh capability → capability của `requests`    | 82, vòng 19 capability                                                                               | ≤ 50, không vòng      |
| Thư mục tầng kỹ thuật dưới module              | 10 (`mappers` ×6, `dto` ×2, `policies` ×2)                                                           | 0                     |
| Cảnh báo ESLint `src/` (complexity/dài/params) | 101 / 99 / 29 = 229                                                                                  | ≤ 120, `max-params` 0 |
| `Promise.all` trên client transaction          | 23 file                                                                                              | 0                     |
| Extension point có kiểm wiring theo graph      | 0/20                                                                                                 | 20/20                 |
| Mục `LEGACY_PRIVATE_EXPORTS`                   | 4                                                                                                    | 0 (xóa ledger)        |
| File spec integration/HTTP/E2E > 800 dòng      | 6                                                                                                    | 0                     |

## Tasks

### Phase 0 — đo và quyết định (không đổi code nghiệp vụ, không bị chặn)

### Task 0.1: công cụ đồ thị capability

- Files: tạo `scripts/arch/capability-graph.cjs`, `scripts/arch/capabilities.mjs`; sửa `package.json` (script
  `arch:capabilities`), `scripts/README.md`.
- Depends on: none.
- Acceptance: `pnpm arch:capabilities` in cho mỗi module số thư mục, số cạnh, các vòng; `--module requests` in từng cạnh
  kèm cạnh file. Số in ra khớp bảng mốc.
- Verify: `pnpm arch:capabilities` → 7 module có vòng; `pnpm test:scripts` xanh với test mới
  `scripts/verify/capability-graph.test.mjs` (đồ thị tổng hợp `a→b→a` cho một vòng, `a→b` cho không vòng).

`scripts/arch/capability-graph.cjs` (dùng chung cho lệnh và gate Task 3.1; đọc import bằng parser TypeScript, không regex):

```js
// Capability graph of each business module (docs/rules/module-structure.md, R6): which capability folder of a module
// imports which other capability folder of the same module. A file at the module root, public/ and *.module.ts wiring
// are not capabilities and are left out.
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { dirname, join, relative, resolve, sep } = require('node:path');
const ts = require('typescript');

// Modules whose capability graph must stay acyclic. Only grows; deleted once it holds every module (the rule then
// applies to all of them). Task 3.1 starts it, Phase 3 and 4 add the rest.
const CAPABILITY_DAG_MODULES = [];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.module.ts') ? [path] : [];
  });
}

/** `modules/<m>/<capability>/…` → { module, capability }; capability is null for the module root and for public/. */
function placeOf(srcPath) {
  const parts = srcPath.split('/');
  const capability = parts.length > 3 && parts[2] !== 'public' ? parts[2] : null;
  return { module: parts[1], capability };
}

function resolveImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(file), specifier);
  return [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)) ?? null;
}

/** Map<module, Map<fromCapability, Map<toCapability, string[]>>>, the strings being `file -> file` edges. */
function capabilityGraph(srcRoot) {
  const toSrc = (file) => relative(srcRoot, file).split(sep).join('/');
  const graph = new Map();
  for (const file of sourceFiles(join(srcRoot, 'modules'))) {
    const from = placeOf(toSrc(file));
    if (!from.capability) continue;
    const { importedFiles } = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
    for (const { fileName } of importedFiles) {
      const target = resolveImport(file, fileName);
      if (!target) continue;
      const to = placeOf(toSrc(target));
      if (to.module !== from.module || !to.capability || to.capability === from.capability) continue;
      const byFrom = graph.get(from.module) ?? new Map();
      const byTo = byFrom.get(from.capability) ?? new Map();
      byTo.set(to.capability, [...(byTo.get(to.capability) ?? []), `${toSrc(file)} -> ${toSrc(target)}`]);
      byFrom.set(from.capability, byTo);
      graph.set(from.module, byFrom);
    }
  }
  return graph;
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

module.exports = { CAPABILITY_DAG_MODULES, capabilityGraph, cyclesOf };
```

`scripts/arch/capabilities.mjs`:

```js
// `pnpm arch:capabilities [--module <m>]`: capability edges and cycles of each module (R6). Prints only; the gate is
// test/gates/capability-graph.gate-spec.ts.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { capabilityGraph, cyclesOf } = require('./capability-graph.cjs');

const only = process.argv.includes('--module') ? process.argv[process.argv.indexOf('--module') + 1] : null;
const graph = capabilityGraph(join(process.cwd(), 'src'));
for (const [module, edges] of [...graph].sort(([a], [b]) => a.localeCompare(b))) {
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
```

### Task 0.2: ghi quyết định Owner

- Files: `docs/workspace/items/be-architecture-readability-hardening/spec.md` (cột _Owner_ của bảng _Owner decisions_).
- Depends on: Owner trả lời.
- Acceptance: `OD-R1` → `OD-R7` có câu trả lời, ngày; phương án khác đề xuất thì sửa spec/plan trước khi làm phase bị
  chặn.
- Verify: `pnpm rules:check`, `pnpm rules:format` xanh.

### Checkpoint

`pnpm check` xanh; số đo ghi vào bảng mốc nếu khác.

### Phase 1 — an toàn: wiring, transaction, lint (chặn bởi commit `shared-demo-dataset`)

### Task 1.1: gate wiring extension point theo graph (R1, AR-01)

- Files: tạo `test/support/nest-module-graph.ts` (chuyển `metadata`, `describeModule`, `collectGraph`, `tokenOf`,
  `tokenName` từ `test/gates/module-graph.gate-spec.ts`, gate đó import lại), `test/gates/extension-wiring.gate-spec.ts`;
  sửa 33 file `src/**/*.listener.ts` (thêm `static readonly binds`); `docs/rules/module-structure.md` (mục Extension point);
  `src/core/extension/hook.ts` (xóa `assertHooksBound` nếu không còn ai dùng ngoài spec).
- Depends on: Task 0.2 (`OD-R1`), commit `shared-demo-dataset`.
- Acceptance: gate đỏ khi một graph có người dùng extension point mà thiếu bên đăng ký; đỏ khi listener không khai `binds`
  hoặc `binds` không khớp tham số constructor; graph lấy đủ từ `AppModule`, `WorkerModule` và mọi lệnh trong
  `src/cli/commands.ts` (hiện thiếu `SuperAdminEventCliModule`, `CostCenterDirectionCliModule`,
  `SubscriptionOwnerAssignmentCliModule` ở danh sách graph của `module-graph`). Chênh lệch thật: dừng, báo Owner (spec,
  _Thiết kế R1_).
- Verify: `pnpm test:gates -- extension-wiring` → xanh trên cây thật sau khi xử lý chênh lệch; test tổng hợp (một
  module giả có người dùng, thiếu listener) đỏ đúng thông điệp.

Mẫu trên listener (mỗi file một dòng):

```ts
@Injectable()
export class HeldNoticeHandoverListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;
  // …constructor và onModuleInit giữ nguyên
}
```

Lõi của gate:

```ts
import 'reflect-metadata';
import { Contributions } from '../../src/core/extension/contributions';
import { Hook } from '../../src/core/extension/hook';
import { Listeners } from '../../src/core/extension/listeners';
import { collectGraph, tokenName, tokenOf, type Token } from '../support/nest-module-graph';

type ExtensionPointClass = abstract new (...args: never[]) => object;

const BASES = [Hook, Listeners, Contributions] as const;
const isExtensionPoint = (token: Token): token is ExtensionPointClass =>
  typeof token === 'function' && BASES.some((base) => token.prototype instanceof base);
const bindsOf = (token: Token): readonly ExtensionPointClass[] =>
  typeof token === 'function' ? ((token as { binds?: readonly ExtensionPointClass[] }).binds ?? []) : [];
const injectedInto = (token: Token): Token[] =>
  typeof token === 'function' ? ((Reflect.getMetadata('design:paramtypes', token) as Token[] | undefined) ?? []) : [];

/** Graph name → missing registrations allowed by an Owner decision, with the reason. Starts empty. */
const GRAPH_WIRING_EXCEPTIONS: readonly { graph: string; point: string; binder: string; reason: string }[] = [];

interface PointWiring {
  users: Set<string>;
  binders: Set<string>;
}

/** For one graph: every extension point it uses, who uses it and who registers with it. */
function wiringOf(root: Parameters<typeof collectGraph>[0]): Map<ExtensionPointClass, PointWiring> {
  const wiring = new Map<ExtensionPointClass, PointWiring>();
  const entry = (point: ExtensionPointClass): PointWiring => {
    const found = wiring.get(point) ?? { users: new Set<string>(), binders: new Set<string>() };
    wiring.set(point, found);
    return found;
  };
  for (const node of collectGraph(root)) {
    for (const token of [...node.providers.map(tokenOf), ...node.controllers]) {
      const binds = bindsOf(token);
      for (const point of binds) entry(point).binders.add(tokenName(token));
      if (binds.length > 0) continue;
      for (const dependency of injectedInto(token)) {
        if (isExtensionPoint(dependency)) entry(dependency).users.add(tokenName(token));
      }
    }
  }
  return wiring;
}
```

Tập tham chiếu của một extension point = mọi lớp có `binds` chứa nó trong toàn `src/` (gate `require` mọi
`src/**/*.listener.ts`). Với mỗi graph và mỗi điểm có `users` khác rỗng: `tham chiếu − binders − ngoại lệ` phải rỗng.

### Task 1.2: tuần tự hóa truy vấn trên client transaction (R2, AR-06)

- Files: 23 file có `Promise.all` trên `tx`/`db = tx ?? this.prisma` — `budgets/budget/budget-facts.repo.ts`,
  `catalog/catalog-entry/retirement/application-retirement.repo.ts`, `catalog/plan-terms/plan-terms.service.ts`,
  `identity-access/approval-roles/approval-role.service.ts`, `licensing/assignment/assignment-department.repo.ts`,
  `licensing/assignment/assignment.repo.ts`, `licensing/assignment/service-account-duty/service-account-duty.service.ts`,
  `licensing/expiry/expiry-queue.service.ts`, `licensing/expiry/expiry-reminder.service.ts`,
  `licensing/provisioning/open-grants/open-grant-task.repo.ts`, `licensing/public/licensing.api.ts`,
  `organization/employee/import-lookup.repo.ts`, `personnel/event-notice/department-open-work.repo.ts`,
  `personnel/offboarding/open-requests/open-requests.service.ts`, `requests/access-request/open-request/open-request.repo.ts`,
  `requests/access-request/open-request/open-request.service.ts`, `requests/assessment/assessment-view.service.ts`,
  `requests/finance-review/spend-view.service.ts`, `requests/group-request-submission/group-submission-facts.service.ts`,
  `requests/request-submission/request-preview.service.ts`, `requests/spend/spend-request.repo.ts`,
  `requests/spend-submission/plan-line-route.service.ts`, `requests/spend-submission/supplement.service.ts` (đường dẫn
  dưới `src/modules/`); `test/gates/module-layout.gate-spec.ts`.
- Depends on: commit `shared-demo-dataset`.
- Acceptance: không còn `Promise.all` mà phần tử chạy trên `tx` hoặc biến gán từ `tx ?? …`; `Promise.all` trên
  `this.prisma` (pool) giữ nguyên. Gate thêm luật R2 với test tổng hợp. Hành vi giữ nguyên.
- Verify: `pnpm test:gates -- module-layout` xanh; `pnpm test:integration -- test/integration/<module>` cho budgets,
  catalog, identity-access, licensing, organization, personnel, requests (hỏi Owner trước); log không còn cảnh báo
  `client.query() when the client is already executing`.

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

Luật gate (thêm vào phần rules của `module-layout.gate-spec.ts`, dùng `codeOnly` có sẵn):

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

/** Files that run several queries at once on one transaction client: `Promise.all` over `tx` or `x = tx ?? …` (R2). */
function concurrentQueriesOnTransaction(files: SourceFile[]): string[] {
  return files
    .filter(({ path }) => isModuleFile(path) && !isSpec(path))
    .filter(({ source }) => {
      const code = codeOnly(source);
      const aliases = [...code.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*tx\s*(?:\?\?|\|\|)/g)].map((match) => match[1]);
      const client = new RegExp(`\\b(?:${['tx', ...aliases].join('|')})\\.\\w+`);
      return [...code.matchAll(/Promise\.all\(/g)].some((match) => {
        const open = match.index + 'Promise.all'.length;
        return client.test(code.slice(open, closingParen(code, open)));
      });
    })
    .map(({ path }) => path)
    .sort();
}
```

### Task 1.3: cấu hình ESLint (R8, AR-07)

- Files: `eslint.config.mjs`, `package.json` (`lint`), 15 chỗ `any` ngoài spec trong `src/`, `eslint-suppressions.json`
  (nếu `OD-R4` = A), `docs/rules/module-structure.md` (mục Kích thước).
- Depends on: Task 0.2 (`OD-R4`), commit `shared-demo-dataset` (lỗi `no-unsafe-return` ở `demo-dataset.command.ts:32`
  thuộc hạng mục đó).
- Acceptance: `no-floating-promises`, `no-unsafe-argument`, `no-explicit-any` là `error`; với `OD-R4` = A các rule kích
  thước là `error`, vi phạm hiện có nằm trong `eslint-suppressions.json` sinh bởi `eslint --suppress-all`, `--max-warnings`
  bỏ; vi phạm mới ở bất kỳ file nào làm `pnpm lint` đỏ. Rule viết lại đúng cơ chế mới.
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

### Checkpoint

`pnpm check` xanh; HTTP và integration của module bị chạm xanh trên CI `dev`; ghi số đo vào bảng mốc.

### Phase 2 — layout nhất quán (chặn bởi `OD-R2`)

### Task 2.1: bỏ thư mục tầng kỹ thuật (R3, AR-04)

- Files: dưới `src/modules/`, cùng spec đi kèm, theo bảng:

| Hiện tại                                                                         | Đích                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `catalog/mappers/catalog-audit-event.mapper.ts`                                  | `catalog/catalog-audit-event.mapper.ts` (gốc, dùng toàn module)                    |
| `finance/mappers/finance-audit-event.mapper.ts`, `finance.http-errors.ts`        | gốc `finance/`                                                                     |
| `identity-access/mappers/account.http-errors.ts`                                 | `identity-access/accounts/account.http-errors.ts`                                  |
| `identity-access/mappers/auth.http-errors.ts`                                    | `identity-access/auth/auth.http-errors.ts`                                         |
| `identity-access/mappers/*` còn lại                                              | capability dùng nó; dùng ≥ 2 capability thì gốc `identity-access-…`                |
| `identity-access/dto/account-management.dto.ts`, `auth.dto.ts`                   | `accounts/`, `auth/`                                                               |
| `identity-access/policies/account.policy.ts`                                     | `accounts/`                                                                        |
| `licensing/mappers/licensing-audit-event.mapper.ts`, `licensing.http-errors.ts`  | gốc `licensing/`                                                                   |
| `organization/mappers/project.mapper.ts`, `organization/dto/project-wire.dto.ts` | `organization/project/` (gộp `project-wire.dto.ts` vào `project.dto.ts` nếu trùng) |
| `organization/mappers/audit-event.mapper.ts`, `organization.http-errors.ts`      | gốc `organization/` (`organization-audit-event.mapper.ts`)                         |
| `organization/mappers/local-seed-fixture.mapper.ts`                              | capability dùng nó (seed của `employee/` hoặc `department/`)                       |
| `personnel/mappers/*`, `personnel/policies/*`                                    | gốc `personnel/` với tên `personnel-…` hoặc capability dùng duy nhất               |

`personnel/mappers/personnel-unavailable.spec.ts` đi theo file nó kiểm (đổi tên cho khớp).

- Depends on: Task 0.2 (`OD-R2`), Phase 1.
- Acceptance: không còn thư mục tên trong danh sách R3; `pnpm arch:capabilities` cho `finance` không còn vòng; vòng của
  `identity-access`, `organization` không còn đi qua `mappers`.
- Verify: `pnpm check`; `pnpm arch:capabilities`; `pnpm test:http -- test/http/<module>` cho sáu module.

### Task 2.2: cửa công khai và gốc module (R4, AR-05)

- Files: `identity-access/account-sessions.extension-points.ts` → `identity-access/auth/account-sessions.types.ts` (sửa
  comment trỏ `architecture-structure.spec.ts`); rà mọi `public/*.api.ts` export đúng một lớp `*Api`; `notifications`
  gốc (`email-dispatcher.service.ts`, `email-templates.mapper.ts`, `payload-cipher.service.ts`, `notifications.repo.ts`)
  → capability `notifications/email/`; `docs/rules/module-structure.md` (một module có thể có nhiều facade
  `public/<x>.api.ts`, mỗi facade một lớp `<X>Api` — khớp `installation`, `identity-access`, `organization`).
- Depends on: Task 2.1.
- Acceptance: R4, R5 đúng trên cây thật; rule viết đúng thực tế.
- Verify: `pnpm check`.

### Task 2.3: `budgets` thành lõi + capability

- Files: `budgets/budget/{budget-view,commitment,proposal,version,year-end}/` lên một cấp thành capability
  `budgets/<tên>/`; `budgets/budget/` giữ lõi (repo, types, errors, policy dùng chung); module card.
- Depends on: Task 2.1.
- Acceptance: điểm vào nhóm cũ (`<…>-<group>.service.ts`) thành file thường của capability; không vòng capability
  (`pnpm arch:capabilities --module budgets`).
- Verify: `pnpm check`; `pnpm test:http -- test/http` không có thư mục budgets riêng nên chạy
  `pnpm test:integration -- test/integration/budgets` (hỏi Owner).

### Task 2.4: `src/core` chỉ giữ thứ dùng chung (R7, AR-08)

- Files: `core/hr-basis.ts` → `organization/public/organization.types.ts` (hoặc file `hr-basis.types.ts` trong `public/`);
  `core/account-identifier.ts` → `licensing/public/`; `core/budget-year-lock-key.ts` → `budgets/public/`;
  `core/seat-occupancy.ts` → `data-import` (người dùng duy nhất) hoặc `licensing/public/` nếu đúng là khái niệm seat; xóa
  `core/time/` rỗng; gate R7 trong `test/gates/architecture-boundaries.gate-spec.ts`.
- Depends on: Task 2.1.
- Acceptance: cạnh mới đều đi xuống tầng (`pnpm arch:check` xanh); gate đỏ khi một file core chỉ một module dùng.
- Verify: `pnpm check`.

### Task 2.5: gate layout R3–R5

- Files: `test/gates/module-layout.gate-spec.ts`.
- Depends on: Task 2.1 → 2.4.
- Acceptance: ba luật mới, mỗi luật một hàm thuần trên danh sách file như các luật hiện có, có test tổng hợp xanh/đỏ:
  `technicalLayerFolders` (mọi cấp dưới module, danh sách R3), `publicOnlySuffixes` (`.api.ts`,
  `.extension-points.ts` ngoài `public/`), `moduleRootFiles` (R5, theo `OD-R2`).
- Verify: `pnpm test:gates -- module-layout`.

### Task 2.6: hạ tầng queue không dùng (AR-09, `OD-R5`)

- Files: (khi `OD-R5` = A) xóa `src/infrastructure/queue/`; `package.json` bỏ `bullmq`, `@nestjs/bullmq`; `pnpm-lock.yaml`
  qua `pnpm install`; `compose.yaml` bỏ service `redis` và volume; ARCHITECTURE, `src/README.md` bỏ "queue"; gate H6.4
  trong `module-graph` giữ khẳng định "không queue". Ghi cho Owner: BRD 6.1 (Docs) cần sửa ở repo Docs.
- Depends on: Task 0.2.
- Acceptance: `pnpm build` xanh; image không còn hai package; `docker compose config` hợp lệ.
- Verify: `pnpm check`; `docker compose -f compose.yaml config -q`.

### Checkpoint

`pnpm check` xanh; `pnpm openapi:export` không đổi `openapi.json`; HTTP và integration của module bị chạm xanh trên CI.

### Phase 3 — DAG capability ở module nhỏ và vừa (chặn bởi `OD-R3`)

### Task 3.1: gate DAG capability (R6)

- Files: tạo `test/gates/capability-graph.gate-spec.ts`; sửa `CAPABILITY_DAG_MODULES` trong
  `scripts/arch/capability-graph.cjs` (khởi đầu: mọi module không còn vòng sau Phase 2 — dự kiến `audit`, `budgets`,
  `data-import`, `finance`, `installation`, `notifications`, `onboarding`, `operating-parameters`).
- Depends on: Phase 2.
- Acceptance: gate đỏ cho vòng trong module thuộc danh sách, thông điệp nêu vòng và cạnh file; test tổng hợp cho
  `cyclesOf`. Luật nhóm riêng tư giữa capability đã có ở dependency-cruiser (`group-is-private`), không viết lại.
- Verify: `pnpm test:gates -- capability-graph`.

```ts
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

  it('finds a cycle of two capabilities and none in a chain', () => {
    const edge = (pairs: [string, string][]) =>
      new Map(pairs.map(([from, to]) => [from, new Map([[to, [`${from} -> ${to}`]]])]));
    expect(
      architecture.cyclesOf(
        edge([
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
    ).toEqual([['a', 'b']]);
    expect(
      architecture.cyclesOf(
        edge([
          ['a', 'b'],
          ['b', 'c'],
        ]),
      ),
    ).toEqual([]);
  });
});
```

### Task 3.2: `catalog` không vòng

- Files: `catalog/plan/plan.service.ts`, `catalog/subscription/onboarding-facts.service.ts` (đang gọi
  `catalog-entry/application-lookup.service`); `catalog/catalog-entry/application-view.service.ts`,
  `internal-software-registration.service.ts`, `retirement/application-retirement.service.ts` (gọi `plan/…`,
  `subscription/…`); `catalog/catalog-entry/application.service.ts` (gọi `subscription/seat-guard.policy`).
- Depends on: Task 3.1.
- Acceptance: chọn một hướng — `plan` và `subscription` phụ thuộc `catalog-entry` (ứng dụng là gốc). Phần `catalog-entry`
  cần từ `plan`/`subscription` (tra plan, `seat-guard.policy`, tra subscription khi ngừng ứng dụng) chuyển: policy thuần
  `seat-guard.policy.ts` xuống `catalog-entry/` hoặc gốc module; `application-view` và `retirement/` (điều phối nhiều
  capability) thành capability riêng `application-view/`, `application-retirement/` phụ thuộc cả ba. `catalog` vào
  `CAPABILITY_DAG_MODULES`.
- Verify: `pnpm arch:capabilities --module catalog` → không vòng; `pnpm check`; HTTP + integration `catalog`.

### Task 3.3: `licensing`, `personnel`, `organization`, `identity-access` không vòng

- Files: các file nêu dưới đây, kèm hướng sửa từng module:
  - `licensing`: `assignment/department-tools/department-tools.service.ts` → `provisioning/revocation-read.service` là cạnh
    ngược duy nhất (provisioning → assignment là hướng chính). Chuyển nhóm `department-tools/` thành capability
    `department-tools/` phụ thuộc cả hai.
  - `personnel`: `transfer/transfer-notice.listener.ts` → `notice/notice.errors`, `notice.types`; `notice/notice-handling.service.ts`
    → `transfer/transfer-guard.service`. Giữ hướng `notice → transfer`; chuyển `transfer-notice.listener.ts` sang `notice/`
    (nó là phần của notice phản ứng với transfer).
  - `organization`: `department/department.types.ts` → `employee/employee.types`, `employee/employee-directory.service.ts` →
    `department/department-directory.service`. Giữ `employee → department`; kiểu `employee` mà `department.types.ts` cần
    chuyển xuống `department.types.ts` hoặc gốc `organization.types`.
  - `identity-access`: sau Task 2.1, `auth → recovery → accounts`; gỡ cạnh còn lại theo `pnpm arch:capabilities --module
identity-access`.
- Depends on: Task 3.1.
- Acceptance: bốn module vào `CAPABILITY_DAG_MODULES`, gate xanh.
- Verify: `pnpm check`; HTTP + integration bốn module.

### Checkpoint

`pnpm arch:capabilities` → chỉ `requests` còn vòng; `pnpm check` xanh; CI `dev` xanh.

### Phase 4 — `requests` đọc được theo capability (AR-02)

### Task 4.1: mỗi capability sở hữu file mang tên nó

- Files: dưới `src/modules/requests/` — `access-request/request-draft.repo.ts` → `draft/`;
  `access-request/need-decision.policy.ts` (+ spec) → `need-decision/`; `access-request/assessment-step.repo.ts` →
  `assessment/`; `spend/finance-review.repo.ts` → `finance-review/`; `spend/spend-submission.dto.ts` → `spend-submission/`;
  `access-request/request-assessment.service.ts` → `assessment/` nếu chỉ phục vụ thẩm định, không thì đổi tên theo việc
  nó làm (đọc cấu hình năm tài chính).
- Depends on: Phase 3.
- Acceptance: chỉ di chuyển và sửa import; `openapi.json` đúng byte.
- Verify: `pnpm check`; `pnpm test:http -- test/http/requests`.

### Task 4.2: lõi `access-request/` không import capability lá

- Files: `access-request/access-request.types.ts`, `access-request.errors.ts`, `grant/grant.policy.ts` (kiểu của
  `group-request`, mã lý do của `cancellation`/`delegated-request`/`withdraw` chuyển xuống lõi);
  `access-request/open-request/*.repo.ts` (hằng của `cancellation.policy` xuống lõi);
  `access-request/access-request-query.service.ts` → capability mới `request-read/`;
  `access-request/request-end.service.ts` → capability mới `request-end/`; nhóm `access-request/grant/` → capability
  `grant/`; module card.
- Depends on: Task 4.1.
- Acceptance: `pnpm arch:capabilities --module requests` không còn cạnh nào từ `access-request`; capability lá vẫn import
  lõi tự do.
- Verify: `pnpm check`; HTTP + integration `requests`.

### Task 4.3: lõi thứ cấp `spend/` và `group-request/` không vòng

- Files: theo `pnpm arch:capabilities --module requests` sau Task 4.2. Vòng mốc: `spend ↔ reassignment`,
  `spend ↔ finance-review`, `spend ↔ budget-information`, `spend ↔ assessment`, `spend ↔ group-request`,
  `group-request ↔ {assessment, budget-information, delegated-request, need-decision, spend-approval, withdraw}`.
- Depends on: Task 4.2.
- Acceptance: cùng ba kỹ thuật cho mỗi cạnh ngược — (1) kiểu/hằng dùng chéo xuống lõi; (2) service điều phối nhiều
  capability thành capability riêng ở trên; (3) phản ứng chéo trong cùng transaction qua lời gọi trực tiếp từ capability
  trên, không thêm extension point trong module. Không vòng; cạnh capability ≤ 50; `requests` vào `CAPABILITY_DAG_MODULES`.
  Nếu một cạnh chỉ gỡ được bằng đổi hành vi: dừng, ghi, báo Owner.
- Verify: `pnpm arch:capabilities --module requests`; `pnpm check`; HTTP + integration + E2E `requests` (hỏi Owner).

### Task 4.4: route theo capability và module card

- Files: `request-submission/access-requests.controller.ts` (handler `need-decision`, `withdraw`, `similar-seats`) →
  controller của `need-decision/`, `withdraw/` **chỉ khi** `pnpm openapi:export` cho `openapi.json` đúng byte;
  `requests/README.md` (đếm capability đúng, sơ đồ lõi → lá, bảng "tìm X ở đâu").
- Depends on: Task 4.3.
- Acceptance: module card khớp `pnpm arch:capabilities`; routes.md sinh lại.
- Verify: `pnpm openapi:export` + `git diff --exit-code openapi.json`; `pnpm arch:docs:check`.

### Checkpoint

`CAPABILITY_DAG_MODULES` chứa cả 14 module → xóa danh sách, gate áp cho mọi module; `pnpm check` xanh; CI `dev` xanh
(integration đầy đủ cho `requests`, `personnel`).

### Phase 5 — kích thước và độ phức tạp (AR-07)

### Task 5.1: không lớp nào quá 8 dependency

- Files: 29 lớp bị `max-params` (danh sách từ `npx eslint "src/**/*.ts" --rule "max-params: [error, 8]" -f unix`), trước
  tiên `NeedDecisionService`, `SpendDecisionService`, `RenewalRequestService`, `VersionDecisionService`,
  `ApplicationService`, `SubscriptionService`, `OffboardingService`, `TransferService`.
- Depends on: Phase 4 cho file của `requests`; module khác sau Phase 3.
- Acceptance: tách theo use case (một service một use case như rule đã nói), không thêm "service chính" chỉ để chuyển
  tiếp; 0 vi phạm `max-params`, mục tương ứng bị xóa khỏi suppressions.
- Verify: `pnpm lint`; HTTP + integration module bị chạm.

### Task 5.2: hàm dài và phức tạp

- Files: 30 file nhiều cảnh báo nhất (review §AR-07), ưu tiên `catalog-entry/application.service.ts`,
  `subscription/subscription.service.ts`, `delegated-request.service.ts`, `spend-approval-view.service.ts`.
- Depends on: Task 5.1.
- Acceptance: nhánh điều kiện vào policy thuần có unit test; tổng `complexity` + `max-lines-per-function` ≤ 120 (từ 200);
  `eslint --prune-suppressions` cập nhật file suppressions.
- Verify: `pnpm lint`; `pnpm test`; HTTP + integration module bị chạm.

### Checkpoint

`pnpm check` xanh; số đo ESLint ghi vào bảng mốc.

### Phase 6 — tài liệu cho dev mới (AR-10, AR-11)

### Task 6.1: hướng dẫn dev mới thay hướng dẫn cũ

- Files: tạo `docs/guides/huong-dan-dev-moi.md`; xóa `docs/guides/kien-truc-backend-va-cach-viet-code.md`; sửa link ở
  `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `docs/README.md`, `rules-check.config.json`, script `rules:format`.
- Depends on: Phase 4 (ví dụ dùng cấu trúc cuối).
- Acceptance: tài liệu có đủ: (1) bản đồ 1 trang (ba tiến trình, sáu tầng, một module, một capability); (2) lần một route
  phức tạp — `POST /api/v1/access-requests/{id}/need-decision` từ routes.md tới controller, service, policy, repo,
  transaction, audit, outcome listener; (3) bảng "thêm X thì đặt ở đâu" (route, use case, quy tắc thuần, truy vấn, lỗi, job,
  lệnh CLI, migration, listener); (4) bảng "đăng ký provider vào Nest module nào" theo graph API/worker/CLI và cách gate R1
  báo thiếu; (5) cách debug: `requestId` → log → mã lỗi → `*.http-errors.ts` → `*.errors.ts`, Audit Trail, `ops:inspect`;
  (6) chọn tầng test; (7) lỗi thường gặp. Không mâu thuẫn rule.
- Verify: `pnpm rules:check`, `pnpm rules:format`; một dev chưa đọc code làm theo mục (2) và (3) — ghi người thử, thời
  gian, chỗ vướng.

### Task 6.2: ADR và rule khớp code

- Files: `docs/decisions/0019-module-tiers-and-public-api.md` (thêm R1–R9, trạng thái theo `OD-R7`), `0005-…` (sửa câu
  trạng thái "No such custom constraints…"), `0003-…` (giữ ghi chú superseded), `docs/rules/module-structure.md`,
  `ARCHITECTURE.md`, module card của module bị chạm.
- Depends on: Phase 2–5.
- Acceptance: mọi luật máy kiểm có một câu trong rule, mỗi câu rule có gate hoặc ghi "review"; ADR không hứa điều đã bỏ
  ("bỏ ledger" đúng sau Task 7.1).
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Task 6.3: comment nói lý do, không nói mã nội bộ

- Files: `src/**/*.ts` theo module đã đi qua Phase 2–4; script liệt kê `scripts/arch/comment-codes.mjs` (chỉ in, không
  gate — mã nghiệp vụ hợp lệ như `G1`–`G5`, `K1`–`K5`, `T1`–`T6` dễ báo nhầm).
- Depends on: Phase 4.
- Acceptance: giữ `US-xx-yy`, `AC-n`, `QĐ-n`, `FR-n`, `INV-n`, `SoD-n`, `ADR-n`, `BR-n`; thay mã finding/lát (`F13`,
  `T-11`, `E1`, `P23-RV`, `GATE.2`, `H6.4`…) bằng một câu lý do hoặc bỏ nếu comment vẫn đủ nghĩa. Không đổi code.
- Verify: `node scripts/arch/comment-codes.mjs` → 0 mã finding/lát; `pnpm check`.

### Checkpoint

`pnpm rules:check`, `pnpm rules:format`, `pnpm check` xanh.

### Phase 7 — gate và test dễ đọc (AR-12, AT-01 → AT-03)

### Task 7.1: xóa `LEGACY_PRIVATE_EXPORTS`

- Files: `organization/organization.module.ts`, `organization/organization-http.module.ts` (HTTP module tự khai
  `CostCenterRepo`, `DepartmentRepo` thay vì nhận export), `operating-parameters/*.module.ts` (`NonWorkingDatesService`
  tương tự hoặc qua facade `public/`), `test/gates/module-graph.gate-spec.ts` (xóa ledger, giữ luật).
- Depends on: Phase 2.
- Acceptance: Nest module nghiệp vụ chỉ export contract công khai; gate không còn ledger.
- Verify: `pnpm test:gates -- module-graph`; `pnpm test:http -- test/http/organization test/http/operating-parameters`.

### Task 7.2: tên gate nói hành vi, dữ liệu tách khỏi luật

- Files: `test/gates/*.gate-spec.ts` (bỏ mã ở đầu tên `it`/`describe`: `E6:`, `GATE.2:`, `H6.4 (…)`, `A4-03:`, `G5:`,
  `ROOT-HARDEN.1:`…, đưa mã vào comment nếu còn cần truy vết); `test/gates/api-collection-contract.gate-spec.ts` → luật
  giữ trong gate, các registry (`COLLECTION_EXCEPTIONS`, `NESTED_ARRAYS`, `INITIAL_*`) sang
  `test/support/api-collection-registry.ts`.
- Depends on: none trong hạng mục (chỉ test).
- Acceptance: gate đọc được từ tên test; số test và kết quả không đổi.
- Verify: `pnpm test:gates` trước/sau cùng số test; `pnpm test:discovery`.

### Task 7.3: manifest mã lỗi ví dụ theo module

- Files: `test/support/openapi-example-route-codes-a-l.ts`, `-m-z.ts` → chia theo module sở hữu operation (đã có
  `-budgets`, `-licensing`, `-personnel`, `-requests`, `-requests-spend`); `test/support/openapi-example-manifest.ts`.
- Depends on: none.
- Acceptance: không file nào chia theo chữ cái; nội dung gộp lại bằng đúng bản cũ.
- Verify: `pnpm test:http -- test/http/platform`.

### Task 7.4: trần kích thước spec ngoài unit (R9, AT-02)

- Files: tạo `test/gates/test-size.gate-spec.ts` (trần 800 dòng cho `test/integration`, `test/http`, `test/e2e`); tách
  `organization/departments-http.integration-spec.ts` (1 952), `data-import/employee-imports-http.integration-spec.ts`
  (1 344), `identity-access/super-admin-recovery.integration-spec.ts` (1 064), `catalog/subscription-http` (957),
  `identity-access/password-self-service-http` (903), `identity-access/account-management-http` (840) theo use case; harness
  chung vào `test/support/`.
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

### Checkpoint

`pnpm check`, HTTP, integration đầy đủ, E2E xanh trên CI `dev`; bảng mốc điền cột "sau".

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | chưa implement          |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
