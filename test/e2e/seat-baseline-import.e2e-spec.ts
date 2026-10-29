import request from 'supertest';
import { type Department, RequestHarness } from '../support/request-harness';
import type { ImportWire } from '../support/seat-baseline-harness';

const h = new RequestHarness();

/**
 * E2E smoke of D-2: the IT Admin records who already holds a seat of a subscription the department owns, from a CSV file: an upload
 * that previews and writes nothing, a confirmation that writes the seats, the use of the subscription, and the closing of the
 * baseline. Real HTTP and PostgreSQL.
 */
describe('the seat baseline of a subscription, from the file to the seats (e2e, D-2)', () => {
  let design: Department;
  let subscriptionId: string;
  const people: Record<string, string> = {};
  let preview: ImportWire;

  const row = (code: string) => ({
    employee_code: code,
    account_identifier: `${code.toLowerCase()}@acme.vn`,
    granted_on: '2026-10-05',
  });

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    // The Super Admin entered the people; the IT Admin created the subscription of 10 seats the department owns.
    for (const code of ['DES-E1', 'DES-E2', 'DES-E3']) people[code] = await h.member(design.code, code, 'Designer');
    subscriptionId = await h.subscription(10, 'K2', design.id);
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the upload previews the file: three valid rows, the seats before and after, and nothing written yet', async () => {
    const uploaded = await h.upload({ subscriptionId }, h.file(Object.keys(people).map(row))).expect(201);
    preview = h.dataOf<ImportWire>(uploaded);

    expect(preview).toMatchObject({
      status: 'PREVIEW',
      target: { subscriptionId },
      summary: {
        totalRows: 3,
        valid: 3,
        errors: 0,
        seats: { purchased: 10, occupiedBefore: 0, freeBefore: 10, freeAfter: 7 },
      },
    });
    expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);
  });

  it('the confirmation writes one seat for each person, marked as the baseline', async () => {
    const confirmed = h.dataOf<{ import: ImportWire }>(
      await h.confirm(preview.id, preview.previewVersion).expect(200),
    ).import;

    expect(confirmed).toMatchObject({ status: 'COMPLETED', result: { created: 3, errors: 0, occupied: 3, free: 7 } });
    const seats = await h.assignmentsOf({ subscriptionId });
    expect(seats.map((seat) => seat.employeeId).sort()).toEqual(Object.values(people).sort());
    expect(seats.every((seat) => seat.source === 'BASELINE' && seat.kind === 'PERSONAL')).toBe(true);
    expect(seats.find((seat) => seat.employeeId === people['DES-E1'])).toMatchObject({
      accountIdentifier: 'des-e1@acme.vn',
      grantedOn: '2026-10-05',
    });
  });

  it('the subscription counts the seats taken and the seats free', async () => {
    const usage = h.dataOf<{ purchased: number; occupied: number; free: number }>(
      await h.seatUsage(subscriptionId).expect(200),
    );

    expect(usage).toMatchObject({ purchased: 10, occupied: 3, free: 7 });
  });

  it('the IT Admin closes the baseline', async () => {
    await h.closeBaseline().expect(200);

    const state = h.dataOf<{ closed: boolean }>(
      await request(h.server()).get('/api/v1/seat-baseline').set(h.as(h.it1)).expect(200),
    );
    expect(state.closed).toBe(true);
  });
});
