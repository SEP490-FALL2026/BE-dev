// Architecture gate (`pnpm arch:check`), docs/rules/module-structure.md. One rule per sentence of the rule file.
// Tiers and the allowed edges inside a tier live in scripts/arch/tiers.cjs (also drawn by `pnpm arch:graph`).
const { TIERS, SAME_TIER } = require('./scripts/arch/tiers.cjs');

const alt = (names) => `(${names.join('|')})`;
const tierRules = TIERS.flatMap((tier, index) => {
  const higher = TIERS.slice(index + 1).flat();
  const rules = [];
  if (higher.length) {
    rules.push({
      name: `tier-${index + 1}-not-up`,
      comment: `${tier.join(', ')} (T${index + 1}) must not import a module of a higher tier`,
      severity: 'error',
      from: { path: `^src/modules/${alt(tier)}/` },
      to: { path: `^src/modules/${alt(higher)}/` },
    });
  }
  for (const name of tier) {
    const others = tier.filter((other) => other !== name && !(SAME_TIER[name] ?? []).includes(other));
    if (others.length) {
      rules.push({
        name: `same-tier-${name}`,
        comment: `${name} may import only ${(SAME_TIER[name] ?? []).join(', ') || 'no module'} of its own tier`,
        severity: 'error',
        from: { path: `^src/modules/${name}/` },
        to: { path: `^src/modules/${alt(others)}/` },
      });
    }
  }
  return rules;
});

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'A file cycle hides the reading order; break it with a type file or an extension point',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'core-is-the-base',
      comment: 'src/core is pure TypeScript: no Nest wiring of the app, no infrastructure, no module',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(infrastructure|modules|app|worker|cli)/' },
    },
    {
      name: 'infrastructure-knows-no-module',
      comment: 'Infrastructure serves every module and knows none of them',
      severity: 'error',
      from: { path: '^src/infrastructure/', pathNot: '\\.spec\\.ts$' },
      to: { path: '^src/(modules|app|worker|cli)/' },
    },
    {
      name: 'modules-not-composition-root',
      comment: 'Modules never import the API, worker or CLI composition roots',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/(app|worker|cli)/|^src/[^/]+\\.ts$' },
    },
    {
      name: 'public-door-only',
      comment:
        'Another module is reached only through its public/ folder or its root *.module.ts (specs may look inside)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: '\\.spec\\.ts$' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/public/', '^src/modules/[^/]+/[^/]+\\.module\\.ts$'],
      },
    },
    {
      name: 'composition-root-public-door',
      comment: 'app/, worker/ and cli/ reach a module through public/ or a *.module.ts file',
      severity: 'error',
      from: { path: '^src/(app|worker|cli)/|^src/[^/]+\\.ts$' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/[^/]+/public/', '^src/modules/.+\\.module\\.ts$'],
      },
    },
    // A group is a folder inside a capability (module/capability/group/). Its entry is the files named after it,
    // <…>-<group>.service.ts, .policy.ts or .types.ts; the rest of the group is its own.
    {
      name: 'group-is-private',
      comment:
        'A group folder (module/capability/group/) is reached from outside its capability only by its Nest module and the facade in public/',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/([^/]+)/',
        pathNot: ['\\.module\\.ts$', '^src/modules/[^/]+/public/', '\\.spec\\.ts$'],
      },
      to: { path: '^src/modules/[^/]+/[^/]+/[^/]+/[^/]+\\.ts$', pathNot: '^src/modules/$1/$2/' },
    },
    {
      name: 'group-entry-from-capability',
      comment: 'A file of a capability reaches one of its groups only through the entry of that group',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/([^/]+)/[^/]+$', pathNot: '\\.spec\\.ts$' },
      to: {
        path: '^src/modules/$1/$2/[^/]+/[^/]+\\.ts$',
        pathNot: '^src/modules/$1/$2/([^/]+)/[^/]*-\\1\\.(service|policy|types)\\.ts$',
      },
    },
    {
      name: 'group-entry-from-sibling',
      comment: 'A group reaches a sibling group of its capability only through the entry of that group',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/([^/]+)/([^/]+)/', pathNot: '\\.spec\\.ts$' },
      to: {
        path: '^src/modules/$1/$2/[^/]+/[^/]+\\.ts$',
        pathNot: ['^src/modules/$1/$2/$3/', '^src/modules/$1/$2/([^/]+)/[^/]*-\\1\\.(service|policy|types)\\.ts$'],
      },
    },
    {
      name: 'controller-not-controller',
      comment: 'A controller never imports another controller; what two share goes in a mapper, DTO or service',
      severity: 'error',
      from: { path: '\\.controller\\.ts$' },
      to: { path: '\\.controller\\.ts$' },
    },
    {
      name: 'no-test-code-in-src',
      comment: 'Production code never imports test helpers',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.spec\\.ts$' },
      to: { path: '^test/|\\.spec\\.ts$' },
    },
    ...tierRules,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/generated/' },
    includeOnly: '^src/',
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: {
      dot: { collapsePattern: '^src/modules/[^/]+|^src/(core|infrastructure|app|worker|cli)' },
    },
  },
};
