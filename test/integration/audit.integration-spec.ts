import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AuditRepo } from '../../src/modules/audit/audit.repo';
import { AuditService } from '../../src/modules/audit/audit.service';
import { testConfig } from '../support/test-config';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

describe('Audit Trail (integration)', () => {
  let database: DisposableDatabase;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let audit: AuditService;
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const event = (action: string) => ({
    organizationId,
    actorKind: 'SYSTEM' as const,
    action,
    resourceType: 'Probe',
    resourceId: 'p-1',
    after: { status: 'NEW' },
    correlationId: 'corr-audit',
  });

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const config = testConfig({ DATABASE_URL: database.url });
    prisma = new PrismaService(config);
    runner = new TransactionRunner(prisma, config);
    audit = new AuditService(new AuditRepo());
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  it('records an event with every required field', async () => {
    await runner.run((tx) => audit.record(tx, { ...event('PROBE.CREATED'), actorRoles: ['SUPER_ADMIN'] }));

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'PROBE.CREATED' } });
    expect(row).toMatchObject({
      organizationId,
      actorKind: 'SYSTEM',
      actorRoles: ['SUPER_ADMIN'],
      resourceType: 'Probe',
      resourceId: 'p-1',
      correlationId: 'corr-audit',
      after: { status: 'NEW' },
    });
    expect(row.occurredAt).toBeInstanceOf(Date);
  });

  it('stores an instant exactly, whatever time zone the database server defaults to', async () => {
    const instant = new Date('2026-10-12T09:00:00.000Z');
    await runner.run((tx) => audit.record(tx, { ...event('PROBE.INSTANT'), occurredAt: instant }));

    const { rows } = await prisma.$queryRaw<{ epoch_ms: number }[]>`
      SELECT (extract(epoch FROM occurred_at) * 1000)::bigint::float8 AS epoch_ms
      FROM audit_events WHERE action = 'PROBE.INSTANT'`.then((result) => ({ rows: result }));
    expect(rows[0].epoch_ms).toBe(instant.getTime());
  });

  it('orders events of one millisecond by their random id, not by the order they were written (P28-02)', async () => {
    // Why no test may read causal order from `ORDER BY occurred_at, id`: `occurred_at` keeps milliseconds and `id` is a
    // random UUID, so two events of one transaction (one millisecond) come back in id order. Written first, read last.
    const instant = '2026-10-23T12:00:00.123Z';
    await prisma.$executeRaw`
      INSERT INTO audit_events (id, organization_id, occurred_at, actor_kind, actor_roles, action, resource_type,
                                resource_id, correlation_id)
      VALUES ('ffffffff-ffff-4fff-bfff-ffffffffffff', ${organizationId}::uuid, ${instant}::timestamptz, 'SYSTEM', '{}',
              'PROBE.WRITTEN_FIRST', 'Probe', 'p-order', 'corr-order'),
             ('00000000-0000-4000-8000-000000000001', ${organizationId}::uuid, ${instant}::timestamptz, 'SYSTEM', '{}',
              'PROBE.WRITTEN_SECOND', 'Probe', 'p-order', 'corr-order')`;

    const rows = await prisma.$queryRaw<{ action: string }[]>`
      SELECT action FROM audit_events WHERE resource_id = 'p-order' ORDER BY occurred_at, id`;

    expect(rows.map((row) => row.action)).toEqual(['PROBE.WRITTEN_SECOND', 'PROBE.WRITTEN_FIRST']);
  });

  it('rejects UPDATE, DELETE and TRUNCATE at the database', async () => {
    await runner.run((tx) => audit.record(tx, event('PROBE.IMMUTABLE')));

    await expect(prisma.$executeRaw`UPDATE audit_events SET action = 'X'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM audit_events`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`TRUNCATE audit_events`).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.count({ where: { action: 'PROBE.IMMUTABLE' } })).resolves.toBe(1);
  });

  it('leaves no orphan audit row when the business change rolls back', async () => {
    await expect(
      runner.run(async (tx) => {
        await audit.record(tx, event('PROBE.ROLLED_BACK'));
        throw new Error('business step failed after the audit insert');
      }),
    ).rejects.toThrow('business step failed');

    await expect(prisma.auditEvent.count({ where: { action: 'PROBE.ROLLED_BACK' } })).resolves.toBe(0);
  });
});
