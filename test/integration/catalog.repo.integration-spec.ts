import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConfigurationModule } from '../../src/infrastructure/config/configuration.module';
import { DatabaseModule } from '../../src/infrastructure/database/database.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { CatalogRepo } from '../../src/modules/catalog/catalog.repo';
import { ApplicationSlugTakenError } from '../../src/modules/catalog/errors/catalog.errors';

/**
 * Every row this suite creates carries this prefix, so it can clean up after itself without
 * touching anything else and can page over its own rows in isolation.
 */
const SLUG_PREFIX = 'itest-catalog-';

describe('CatalogRepo (integration)', () => {
  let prisma: PrismaService;
  let repo: CatalogRepo;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigurationModule, DatabaseModule],
      providers: [CatalogRepo],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CatalogRepo);

    // Fail with something diagnosable rather than letting every test die on a raw driver
    // error. A native PostgreSQL bound to 127.0.0.1:5432 can shadow the Compose container,
    // which produces a confusing "role does not exist" instead of a connection refusal.
    try {
      await prisma.catalogApplication.count();
    } catch (error) {
      const url = moduleRef.get(ConfigService).get<string>('DATABASE_URL') ?? '(unset)';
      const host = /@([^/]+)/.exec(url)?.[1] ?? 'unknown host';

      throw new Error(
        `Cannot reach the catalog_applications table at ${host}. Run "docker compose up -d", ` +
          `apply migrations against this database, and make sure no other PostgreSQL is bound ` +
          `to that port. Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  afterEach(async () => {
    await prisma.catalogApplication.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

  it('pages and counts against the same snapshot', async () => {
    for (const index of [1, 2, 3]) {
      await repo.create({ slug: `${SLUG_PREFIX}app-${index}`, name: `App ${index}`, vendor: 'Vendor' });
    }

    const page = await repo.findPage({ page: 1, pageSize: 2, slugPrefix: SLUG_PREFIX });

    expect(page.rows).toHaveLength(2);
    expect(page.totalItems).toBe(3);
  });

  it('filters by status', async () => {
    await repo.create({ slug: `${SLUG_PREFIX}active`, name: 'Active', vendor: 'Vendor' });

    const active = await repo.findPage({ page: 1, pageSize: 10, status: 'ACTIVE', slugPrefix: SLUG_PREFIX });
    const underReview = await repo.findPage({
      page: 1,
      pageSize: 10,
      status: 'UNDER_REVIEW',
      slugPrefix: SLUG_PREFIX,
    });

    expect(active.totalItems).toBe(1);
    expect(underReview.totalItems).toBe(0);
  });

  it('orders by name', async () => {
    await repo.create({ slug: `${SLUG_PREFIX}z`, name: 'Zeta', vendor: 'Vendor' });
    await repo.create({ slug: `${SLUG_PREFIX}a`, name: 'Alpha', vendor: 'Vendor' });

    const page = await repo.findPage({ page: 1, pageSize: 10, slugPrefix: SLUG_PREFIX });

    expect(page.rows.map((row) => row.name)).toEqual(['Alpha', 'Zeta']);
  });
});
