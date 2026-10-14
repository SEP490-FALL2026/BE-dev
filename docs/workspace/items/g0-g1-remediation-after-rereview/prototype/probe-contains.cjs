// R-03 probe: does Prisma 7.9.1 `contains` (mode insensitive) escape % and _ ? Read-only.
// Usage: node probe-contains.cjs <cloneRoot> <databaseUrl>
const path = require('node:path');

const [root, url] = process.argv.slice(2);
const { PrismaClient } = require(path.join(root, 'dist/generated/prisma/client.js'));
const { PrismaPg } = require(path.join(root, 'node_modules/@prisma/adapter-pg'));

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [{ emit: 'event', level: 'query' }] });
  let last = null;
  prisma.$on('query', (e) => (last = { sql: e.query.replace(/"public"\./g, '').slice(0, 220), params: e.params }));
  for (const term of ['SA0_1', '%', 'SA_01']) {
    const rows = await prisma.employee.findMany({
      where: { employeeCode: { contains: term, mode: 'insensitive' } },
      select: { employeeCode: true },
    });
    console.log(JSON.stringify({ term, matched: rows.map((r) => r.employeeCode), params: last.params, sqlTail: last.sql.slice(-120) }));
  }
  await prisma.$disconnect();
})();
