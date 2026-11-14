import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingRenewalApi } from '../../../src/modules/licensing/public/licensing-renewal.api';
import { itAdminSeat, MACHINE_NOTE, machineSeatRow } from '../../support/machine-account-seat';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * `R-9` (review of X-SA, Required): the record the renewal of one right begins (`AssignmentRenewalService`) keeps the flag and the
 * reason of the right it continues. Without them the successor is a plain personal seat of the IT Admin, which overlaps the IT Admin's
 * own seat (INV-02) and makes the renewal fail, or turns a bot into a seat that wastes the ghost-seat rules.
 */
describe('the record that follows a renewed right keeps the machine account flag of the right (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const renew = async (assignmentId: string) => {
    const licensing = h.ctx.app.get(LicensingRenewalApi);
    const runner = h.ctx.app.get(TransactionRunner);

    return runner.run((tx) =>
      licensing.renewAssignment(tx, h.principal(h.it1, ['IT_ADMIN']), {
        assignmentId,
        requestId: randomUUID(),
        previousExpectedEndDate: h.inDays(2),
        newExpectedEndDate: h.inDays(95),
        now: new Date(),
      }),
    );
  };

  it('begins the record that follows a right renewed on its own with the flag of the right it continues, beside the personal seat of the same IT Admin', async () => {
    const internalPlan = await h.plan('K5');
    const flagged = await itAdminSeat(h, { planId: internalPlan }, 'bot-a@acme.vn', {
      flagged: true,
      expectedEnd: h.inDays(2),
      validFrom: h.inDays(-300),
    });
    await itAdminSeat(h, { planId: internalPlan }, 'it1@acme.vn', {
      expectedEnd: h.inDays(2),
      validFrom: h.inDays(-300),
    });

    const renewed = await renew(flagged);

    expect(await machineSeatRow(h, renewed.successorAssignmentId)).toMatchObject({
      predecessor_id: flagged,
      source: 'REQUEST',
      is_machine_account: true,
      machine_account_note: MACHINE_NOTE,
    });
  }, 300_000);

  it('leaves the record that follows a plain personal seat plain', async () => {
    const internalPlan = await h.plan('K5');
    const own = await itAdminSeat(h, { planId: internalPlan }, 'it1@acme.vn', {
      expectedEnd: h.inDays(2),
      validFrom: h.inDays(-300),
    });

    const renewed = await renew(own);

    expect(await machineSeatRow(h, renewed.successorAssignmentId)).toMatchObject({
      is_machine_account: false,
      machine_account_note: null,
    });
  }, 300_000);
});
