// R-03 probe: how Prisma 7.9.1 + adapter-pg renders `id: { notIn: [...] }` for large lists, and the cost
// of the exclusion query. Read-only. Usage: node probe-notin.cjs <cloneRoot> <databaseUrl>
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const [root, url] = process.argv.slice(2);
const { PrismaClient } = require(path.join(root, 'dist/generated/prisma/client.js'));
const { PrismaPg } = require(path.join(root, 'node_modules/@prisma/adapter-pg'));

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: 'event', level: 'query' }] });
  let last = null;
  prisma.$on('query', (e) => {
    last = { sqlLength: e.query.length, params: JSON.parse(e.params).length, sqlHead: e.query.replace(/\$\d+/g, '$n').slice(0, 160) };
  });
  for (const n of [10, 5000, 32766, 40000]) {
    const ids = Array.from({ length: n }, () => randomUUID());
    const started = Date.now();
    try {
      await prisma.employee.findMany({ where: { status: 'ACTIVE', id: { notIn: ids } }, select: { id: true }, orderBy: { employeeCode: 'asc' }, take: 20 });
      console.log(JSON.stringify({ n, ok: true, ms: Date.now() - started, ...last }));
    } catch (error) {
      console.log(JSON.stringify({ n, ok: false, ms: Date.now() - started, error: `${error.constructor.name}: ${String(error.message).split('\n').slice(-2).join(' ').slice(0, 200)}` }));
    }
  }
  await prisma.$disconnect();
})();
