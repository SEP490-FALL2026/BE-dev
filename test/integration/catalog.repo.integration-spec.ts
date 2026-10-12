import { ConfigService } from '@nestjs/config';
import {
  DisposableDatabase,
  provisionDisposableDatabase,
  migrateDisposableDatabase,
  dropDisposableDatabase,
} from '../support/disposable-database';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { CatalogRepo } from '../../src/modules/catalog/catalog.repo';
import { ApplicationSlugTakenError } from '../../src/modules/catalog/errors/catalog.errors';

// Rows below live only in the database owned by this suite.
const SLUG_PREFIX = 'itest-catalog-';

describe('CatalogRepo (integration)', () => {
  let prisma: PrismaService;
  let database: DisposableDatabase;
  let repo: CatalogRepo;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: database.url }));
    repo = new CatalogRepo(prisma);
  }, 60000);

  afterEach(async () => {
    if (prisma) await prisma.catalogApplication.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  it('persists an application and reads it back', async () => {
    const created = await repo.create({
      slug: `${SLUG_PREFIX}figma`,
      name: 'Figma',
      vendor: 'Figma Inc.',
    });

    expect(created).toMatchObject({ slug: `${SLUG_PREFIX}figma`, name: 'Figma', status: 'ACTIVE' });
    expect(created.createdAt).toBeInstanceOf(Date);

    await expect(repo.findById(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it('returns null for an unknown id', async () => {
    await expect(repo.findById('4f24d10d-63ad-49b1-a7a1-c988765990ae')).resolves.toBeNull();
  });

  it('translates a duplicate slug into a business error', async () => {
    // Only a real unique index can prove this path. A mock would happily accept both inserts.
    const input = { slug: `${SLUG_PREFIX}duplicate`, name: 'First', vendor: 'Vendor' };
    await repo.create(input);

    await expect(repo.create({ ...input, name: 'Second' })).rejects.toBeInstanceOf(ApplicationSlugTakenError);
  });

  it('returns a page and total count', async () => {
    for (const index of [1, 2, 3]) {
      await repo.create({ slug: `${SLUG_PREFIX}app-${index}`, name: `App ${index}`, vendor: 'Vendor' });
    }

    const page = await repo.findPage({ page: 1, pageSize: 2 });

    expect(page.rows).toHaveLength(2);
    expect(page.totalItems).toBe(3);
  });

  it('keeps page and count consistent across a concurrent committed insert', async () => {
    await repo.create({ slug: 'snapshot-before', name: 'Before', vendor: 'Vendor' });
    const observed = prisma.$extends({
      query: {
        catalogApplication: {
          async findMany({ args, query }) {
            const rows = await query(args);
            await repo.create({ slug: 'snapshot-after', name: 'After', vendor: 'Vendor' });
            return rows;
          },
        },
      },
    });
    const observedRepo = new CatalogRepo(observed as unknown as PrismaService);
    const page = await observedRepo.findPage({ page: 1, pageSize: 20 });
    expect(page.rows.map((row) => row.slug)).toEqual(['snapshot-before']);
    expect(page.totalItems).toBe(1);
    expect(await prisma.catalogApplication.count()).toBe(2);
  });

  it('filters by status', async () => {
    await repo.create({ slug: `${SLUG_PREFIX}active`, name: 'Active', vendor: 'Vendor' });

    const active = await repo.findPage({ page: 1, pageSize: 10, status: 'ACTIVE' });
    const underReview = await repo.findPage({
      page: 1,
      pageSize: 10,
      status: 'UNDER_REVIEW',
    });

    expect(active.totalItems).toBe(1);
    expect(underReview.totalItems).toBe(0);
  });

  it('breaks duplicate-name ties by id across pages', async () => {
    const a = await repo.create({ slug: 'tie-a', name: 'Same', vendor: 'Vendor' });
    const b = await repo.create({ slug: 'tie-b', name: 'Same', vendor: 'Vendor' });
    const first = await repo.findPage({ page: 1, pageSize: 1 });
    const second = await repo.findPage({ page: 2, pageSize: 1 });
    expect([first.rows[0].id, second.rows[0].id]).toEqual([a.id, b.id].sort());
  });

  it('orders by name', async () => {
    await repo.create({ slug: `${SLUG_PREFIX}z`, name: 'Zeta', vendor: 'Vendor' });
    await repo.create({ slug: `${SLUG_PREFIX}a`, name: 'Alpha', vendor: 'Vendor' });

    const page = await repo.findPage({ page: 1, pageSize: 10 });

    expect(page.rows.map((row) => row.name)).toEqual(['Alpha', 'Zeta']);
  });
});
