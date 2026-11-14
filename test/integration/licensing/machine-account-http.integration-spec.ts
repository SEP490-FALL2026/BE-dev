import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();
const NOTE = 'Release pipeline of the build farm';

interface FlagWire {
  id: string;
  kind: string;
  employeeId: string;
  isMachineAccount: boolean;
  machineAccountNote: string | null;
  validUntil: string | null;
}

/**
 * `QĐ-110m`, `R-9` (X-SA.2, P13): the IT Admin turns the flag "used for a machine account" of the personal seat of an IT Admin on and off.
 * Real PostgreSQL through the route: the seat is written, audited and read back; the person who is not an IT Admin, the seat that is not
 * open, the service account of the earlier releases and the flag that would overlap another personal seat are refused with their codes.
 */
describe('the flag of a machine account over HTTP and PostgreSQL (integration)', () => {
  let subscriptionId: string;

  beforeAll(async () => {
    await h.start();
    subscriptionId = await h.subscription(20, 'K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const flag = (id: string, body: object) =>
    request(h.server()).post(`/api/v1/license-assignments/${id}/machine-account`).set(h.as(h.it1)).send(body);
  const seatOf = async (id: string): Promise<FlagWire> =>
    (
      await h.ctx.sql.query<FlagWire>(
        `SELECT id, kind::text, employee_id AS "employeeId", is_machine_account AS "isMachineAccount",
                machine_account_note AS "machineAccountNote", to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
           FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const eventsOf = async (id: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ action: string }>(
        `SELECT action FROM audit_events WHERE resource_type = 'LicenseAssignment' AND resource_id = $1
            AND action LIKE 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_%' ORDER BY occurred_at, id`,
        [id],
      )
    ).rows.map((row) => row.action);
  /** A personal seat of a new subscription for a person who is not an IT Admin. */
  const staffSeat = async (code: string): Promise<string> => h.seat({ subscriptionId }, code);
  /** The personal seat of the IT Admin of the installation on a subscription of its own, so INV-02 starts clean. */
  const itAdminSeat = async (): Promise<{ id: string; subscriptionId: string }> => {
    const own = await h.subscription(5, 'K2');
    await h.written({ subscriptionId: own }, [
      { employee_code: 'E-IT1', account_identifier: 'it1@acme.vn', granted_on: '2026-01-05' },
    ]);
    const found = (await h.assignmentsOf({ subscriptionId: own })).find(
      (assignment) => assignment.employeeId === h.it1.employeeId,
    );
    if (!found) throw new Error('no seat of the IT Admin');

    return { id: found.id, subscriptionId: own };
  };

  it('turns the flag on with its reason, shows it on the seat and in the list, audits it, and takes no seat more', async () => {
    const seat = await itAdminSeat();
    const before = await h.seatUsage(seat.subscriptionId).expect(200);

    const response = await flag(seat.id, { isMachineAccount: true, note: ` ${NOTE} ` }).expect(200);

    expect(h.dataOf<{ assignment: FlagWire }>(response).assignment).toMatchObject({
      id: seat.id,
      kind: 'PERSONAL',
      isMachineAccount: true,
      machineAccountNote: NOTE,
    });
    expect(await seatOf(seat.id)).toMatchObject({ isMachineAccount: true, machineAccountNote: NOTE });
    expect(await eventsOf(seat.id)).toEqual(['LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_FLAGGED']);
    const listed = (await h.assignmentsOf({ subscriptionId: seat.subscriptionId })).find((a) => a.id === seat.id);
    expect(listed).toMatchObject({ isMachineAccount: true, machineAccountNote: NOTE });
    expect(h.dataOf(await h.seatUsage(seat.subscriptionId).expect(200))).toEqual(h.dataOf(before));
  }, 120_000);

  it('answers 200 and writes nothing when the flag already is as asked, and audits a new reason once', async () => {
    const seat = await itAdminSeat();
    await flag(seat.id, { isMachineAccount: true, note: NOTE }).expect(200);

    await flag(seat.id, { isMachineAccount: true, note: NOTE }).expect(200);
    expect(await eventsOf(seat.id)).toEqual(['LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_FLAGGED']);
    await flag(seat.id, { isMachineAccount: true, note: 'Another reason' }).expect(200);

    expect(await eventsOf(seat.id)).toEqual([
      'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_FLAGGED',
      'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_NOTE_CHANGED',
    ]);
    expect(await seatOf(seat.id)).toMatchObject({ machineAccountNote: 'Another reason' });
  }, 120_000);

  it('turns the flag off, clears the reason, and does not write when it is off already; a note given with the flag off is not kept', async () => {
    const seat = await itAdminSeat();
    await flag(seat.id, { isMachineAccount: true, note: NOTE }).expect(200);

    await flag(seat.id, { isMachineAccount: false, note: 'ignored' }).expect(200);
    await flag(seat.id, { isMachineAccount: false }).expect(200);

    expect(await seatOf(seat.id)).toMatchObject({ isMachineAccount: false, machineAccountNote: null });
    expect(await eventsOf(seat.id)).toEqual([
      'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_FLAGGED',
      'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_UNFLAGGED',
    ]);
  }, 120_000);

  it('asks for the reason when the flag is turned on (422)', async () => {
    const seat = await itAdminSeat();

    for (const body of [{ isMachineAccount: true }, { isMachineAccount: true, note: '   ' }, { note: NOTE }, {}]) {
      const response = await flag(seat.id, body).expect(422);
      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
    }
    expect(await seatOf(seat.id)).toMatchObject({ isMachineAccount: false });
  }, 120_000);

  it('refuses the seat of a person who is not an IT Admin (422) and changes nothing', async () => {
    const id = await staffSeat('MA-STAFF');

    const response = await flag(id, { isMachineAccount: true, note: NOTE }).expect(422);

    expect(h.codeOf(response)).toBe('LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_HOLDER_NOT_IT_ADMIN');
    expect(await seatOf(id)).toMatchObject({ isMachineAccount: false, machineAccountNote: null });
    expect(await eventsOf(id)).toEqual([]);
  }, 120_000);

  it('refuses a seat that has ended (409), and a service account of the earlier releases (422)', async () => {
    const ended = await itAdminSeat();
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-06-01' WHERE id = $1`, [ended.id]);
    const unit = await h.ctx.sql.query<{ id: string }>(
      `SELECT c.id FROM cost_centers c WHERE c.department_id = $1 AND c.status = 'ACTIVE'`,
      [h.seed.departmentId],
    );
    const service = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
       SELECT $2, s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $3, 'old-bot', 'old-bot', 'CI', $4, s.owner_department_id,
              '2026-01-05', 'RECORDED', $5
         FROM subscriptions s WHERE s.id = $1`,
      [subscriptionId, service, h.it1.employeeId, unit.rows[0].id, randomUUID()],
    );

    const closed = await flag(ended.id, { isMachineAccount: true, note: NOTE }).expect(409);
    const legacy = await flag(service, { isMachineAccount: true, note: NOTE }).expect(422);

    expect(h.codeOf(closed)).toBe('LICENSE_ASSIGNMENT.NOT_OPEN');
    expect(h.codeOf(legacy)).toBe('LICENSE_ASSIGNMENT.NOT_PERSONAL');
  }, 120_000);

  it('flags a seat that is set to end on a later day, as the seat the conversion writes keeps the end of its service account, and refuses one that ends today', async () => {
    const later = await itAdminSeat();
    const endingToday = await itAdminSeat();
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = $2::date WHERE id = $1`, [
      later.id,
      h.inDays(30),
    ]);
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = $2::date WHERE id = $1`, [
      endingToday.id,
      h.today(),
    ]);

    await flag(later.id, { isMachineAccount: true, note: NOTE }).expect(200);
    const refused = await flag(endingToday.id, { isMachineAccount: true, note: NOTE }).expect(409);

    expect(await seatOf(later.id)).toMatchObject({
      isMachineAccount: true,
      machineAccountNote: NOTE,
      validUntil: h.inDays(30),
    });
    expect(h.codeOf(refused)).toBe('LICENSE_ASSIGNMENT.NOT_OPEN');
    expect(await seatOf(endingToday.id)).toMatchObject({ isMachineAccount: false });
    await flag(later.id, { isMachineAccount: false }).expect(200);
    expect(await seatOf(later.id)).toMatchObject({ isMachineAccount: false, machineAccountNote: null });
  }, 120_000);

  it('refuses turning the flag off while the IT Admin holds another personal seat of the subscription for an overlapping period (409)', async () => {
    const own = await itAdminSeat();
    const flagged = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id, is_machine_account, machine_account_note)
       SELECT $2, s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $3, 'ci-bot', 'ci-bot', '2026-01-05', 'RECORDED', $4, true, $5
         FROM subscriptions s WHERE s.id = $1`,
      [own.subscriptionId, flagged, h.it1.employeeId, randomUUID(), NOTE],
    );

    const response = await flag(flagged, { isMachineAccount: false }).expect(409);

    expect(h.codeOf(response)).toBe('LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_OVERLAP');
    expect(await seatOf(flagged)).toMatchObject({ isMachineAccount: true, machineAccountNote: NOTE });
    expect(await eventsOf(flagged)).toEqual([]);
  }, 120_000);

  it('answers 404 for a seat that does not exist', async () => {
    const response = await flag(randomUUID(), { isMachineAccount: false }).expect(404);

    expect(h.codeOf(response)).toBe('LICENSE_ASSIGNMENT.NOT_FOUND');
  });
});
