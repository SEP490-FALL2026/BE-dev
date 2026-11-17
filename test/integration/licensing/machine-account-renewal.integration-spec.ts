import { itAdminSeat, MACHINE_NOTE, machineSeatFollowers, machineSeatRow } from '../../support/machine-account-seat';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * `R-9` (review of X-SA, Critical): a seat flagged as a machine account keeps its flag when the renewal of its subscription carries it
 * to the new period (`RENEWAL_CARRY`). A carried seat that loses the flag is a plain personal seat: it breaks INV-02 beside the IT
 * Admin's own seat (23P01, the whole renewal fails), or, alone, turns the bot into a seat the rules of wasted seats judge as a ghost.
 */
describe('a seat flagged as a machine account keeps its flag when the renewal carries it (integration, real PostgreSQL)', () => {
  const year = () => ({ startDate: h.inDays(-300), endDate: h.inDays(64) });
  const nextYear = (quantity: number) => ({
    purchasedQuantity: quantity,
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    startDate: h.inDays(65),
    endDate: h.inDays(429),
    noticeDeadline: h.inDays(400),
    autoRenew: true,
    allowsMidTermReduction: false,
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /**
   * A subscription of a unit of two people and the seats of the IT Admin that `seatsOfTheItAdmin` makes, its result recorded at the point of
   * adjustment as the reduction to the seats counted (a machine account holds a seat like anybody): the seats are carried.
   */
  const renewedSubscription = async (seatsOfTheItAdmin: (subscriptionId: string) => Promise<string[]>) => {
    const unit = await h.unit(2);
    const { subscriptionId } = await h.termWithSeats(unit, 20, { quantity: 10, ...year() });
    const itAdminSeats = await seatsOfTheItAdmin(subscriptionId);
    const seatsNeeded = unit.members.length + itAdminSeats.length;

    const response = await h.propose({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: seatsNeeded,
      outcome: 'AS_DECIDED',
      nextPeriod: nextYear(seatsNeeded),
    });

    return { response, itAdminSeats };
  };

  it('carries both the personal seat and the flagged seat of one IT Admin to the new period, the flag and its reason kept', async () => {
    const { response, itAdminSeats } = await renewedSubscription(async (subscriptionId) => [
      await itAdminSeat(h, { subscriptionId }, 'it1@acme.vn', { validFrom: h.inDays(-300) }),
      await itAdminSeat(h, { subscriptionId }, 'ci-bot@acme.vn', { flagged: true, validFrom: h.inDays(-300) }),
    ]);

    expect(response.status).toBe(201);
    const carried = await machineSeatFollowers(h, itAdminSeats);
    expect(carried).toHaveLength(2);
    expect(carried.every((row) => row.source === 'RENEWAL_CARRY')).toBe(true);
    const byPredecessor = new Map(carried.map((row) => [row.predecessor_id, row]));
    expect(byPredecessor.get(itAdminSeats[0])).toMatchObject({ is_machine_account: false, machine_account_note: null });
    expect(byPredecessor.get(itAdminSeats[1])).toMatchObject({
      is_machine_account: true,
      machine_account_note: MACHINE_NOTE,
    });
    for (const old of itAdminSeats) expect((await machineSeatRow(h, old)).valid_until).toBe(h.inDays(65));
  }, 300_000);

  it('carries a flagged seat that has no personal seat beside it with its flag: the bot does not become a plain seat', async () => {
    const { response, itAdminSeats } = await renewedSubscription(async (subscriptionId) => [
      await itAdminSeat(h, { subscriptionId }, 'release-bot@acme.vn', { flagged: true, validFrom: h.inDays(-300) }),
    ]);

    expect(response.status).toBe(201);
    expect(await machineSeatFollowers(h, itAdminSeats)).toEqual([
      expect.objectContaining({
        is_machine_account: true,
        machine_account_note: MACHINE_NOTE,
        source: 'RENEWAL_CARRY',
      }),
    ]);
  }, 300_000);
});
