import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { AssignmentService } from '../../src/modules/licensing/assignment/assignment.service';
import { AssignmentConflictError, SeatBaselineClosedError } from '../../src/modules/licensing/licensing.errors';
import type { NewBaselineAssignment } from '../../src/modules/licensing/licensing.types';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

describe('what the database refuses when assignments are written (integration, real PostgreSQL)', () => {
  let assignments: AssignmentService;
  let catalog: CatalogService;
  let runner: TransactionRunner;
  let actor: AuthenticatedPrincipal;

  beforeAll(async () => {
    await h.start();
    assignments = h.ctx.app.get(AssignmentService, { strict: false });
    catalog = h.ctx.app.get(CatalogService, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
    actor = {
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: 's1',
      employeeId: 'e1',
      directRoles: ['IT_ADMIN'],
      derivedRoles: [],
      roles: ['IT_ADMIN'],
    };
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const personal = async (
    code: string,
    extra: Partial<NewBaselineAssignment> = {},
  ): Promise<NewBaselineAssignment> => ({
    kind: 'PERSONAL',
    employeeId: await h.person(code),
    accountIdentifier: `${code.toLowerCase()}@acme.vn`,
    reason: null,
    costCenterId: null,
    owningDepartmentId: null,
    effectiveFrom: '2026-10-01',
    effectiveFromBasis: 'RECORDED',
    expectedEndDate: null,
    ...extra,
  });
  /** A subscription with `seats` seats and the import row the baseline names; made before anything is written. */
  const prepare = async (seats: number) => {
    const subscriptionId = await h.subscription(seats);
    const preview = await h.preview({ subscriptionId }, [
      { employee_code: 'E-OWN', account_identifier: 'owner@acme.vn' },
    ]);
    const target = await catalog.findSeatTarget({ subscriptionId });
    if (!target) throw new Error('no target');

    return { target, importId: preview.id };
  };
  /** Writes rows the way the baseline does, for a subscription with `seats` seats, and answers what came of it. */
  const write = async (
    seats: number,
    rows: NewBaselineAssignment[],
    prepared?: Awaited<ReturnType<typeof prepare>>,
  ) => {
    const { target, importId } = prepared ?? (await prepare(seats));

    return runner.run((tx) =>
      assignments.createBaseline(tx, actor, { organizationId: h.seed.organizationId, importId, target, rows }),
    );
  };

  it('answers an overlap of one person on one subscription with the index of the row that was refused', async () => {
    await expect(
      write(5, [await personal('WRI1'), await personal('WRI1', { accountIdentifier: 'wri1.other@acme.vn' })]),
    ).rejects.toMatchObject({
      conflict: 'OVERLAP',
      index: 1,
    });
  });

  it('answers an account identifier that is in use, whatever its case, as another conflict', async () => {
    await expect(
      write(5, [
        await personal('WRI2', { accountIdentifier: 'Shared-Name' }),
        await personal('WRI3', { accountIdentifier: ' shared-name ' }),
      ]),
    ).rejects.toMatchObject({ conflict: 'IDENTIFIER_IN_USE', index: 1 });
  });

  it('answers the seats all taken, and an intern without an expected end date', async () => {
    await expect(write(1, [await personal('WRI4'), await personal('WRI5')])).rejects.toMatchObject({
      conflict: 'SEAT_CAPACITY',
      index: 1,
    });
    await expect(
      write(5, [
        await personal('WRI6'),
        { ...(await personal('WRI7')), employeeId: await h.person('WRI7I', 'INTERN') },
      ]),
    ).rejects.toMatchObject({
      conflict: 'EXPECTED_END_REQUIRED',
      index: 1,
    });
  });

  it('writes nothing of the rows before the one that was refused: the whole write is one transaction', async () => {
    const before = await h.count('license_assignments');

    await expect(write(1, [await personal('WRI8'), await personal('WRI9')])).rejects.toBeInstanceOf(
      AssignmentConflictError,
    );

    expect(await h.count('license_assignments')).toBe(before);
  });

  it('answers a baseline that closed in the meantime, which the database refuses for every writer', async () => {
    const prepared = await prepare(5);
    await h.ctx.sql.query(`INSERT INTO seat_baseline_states (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
      h.seed.organizationId,
    ]);
    await h.ctx.sql.query(
      `UPDATE seat_baseline_states SET closed_at = now(), closed_by_app_user_id = $2 WHERE organization_id = $1`,
      [h.seed.organizationId, randomUUID()],
    );

    await expect(write(5, [await personal('WRIA')], prepared)).rejects.toBeInstanceOf(SeatBaselineClosedError);
  });
});
