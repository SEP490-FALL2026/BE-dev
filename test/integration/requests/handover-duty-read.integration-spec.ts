import { HandoverHarness, type DutyWire } from '../../support/handover-harness';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import type { Department, Person } from '../../support/request-harness';

const h = new HandoverHarness();

/** What the lists and the detail of the handover duties show to whom, with a number of statements that does not grow (API-LIST-DETAIL). */
describe('reading the handover duties (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let h1: Person;
  let h2: Person;
  let subscriptionId: string;
  let sequence = 0;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h1 = await h.veteran(des, 'H1-RD');
    h2 = await h.veteran(fin, 'H2-RD');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
    subscriptionId = await h.subscription(100, 'K2');
    await h.describePlan(subscriptionId, true, 'Sao lưu trước khi gỡ');
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** Opens the handover of a person of the department who leaves `dueIn` days from today. */
  const leaver = async (department: Department, dueIn: number) => {
    const employeeCode = `E-RD-${(sequence += 1)}`;
    const person = await h.veteran(department, employeeCode);
    const assignmentId = await h.seatOf(person, { subscriptionId }, employeeCode);
    await h.openDuties({
      leaverEmployeeId: person.employeeId,
      source: 'DEPARTURE',
      lastWorkingDay: h.day(dueIn + 1),
      dueOn: h.day(dueIn),
      leaverIsHead: false,
    });

    return { person, assignmentId };
  };

  const page = async (query: string, account = h.it1) => {
    const response = await h.duties(query, account).expect(200);

    return h.dataOf<{ items: DutyWire[]; pagination: { totalItems: number; totalPages: number } }>(response);
  };

  it('shows a person only what falls to them, and the IT Admin everything without the right to confirm it', async () => {
    const a = await leaver(des, 5);
    const b = await leaver(fin, 5);

    const forDes = await page('?pageSize=100', h1.account);
    const forFin = await page('?pageSize=100', h2.account);
    const everything = await page('?scope=all&pageSize=100');

    expect(forDes.items.some((duty) => duty.employee.id === a.person.employeeId)).toBe(true);
    expect(forDes.items.some((duty) => duty.employee.id === b.person.employeeId)).toBe(false);
    expect(forFin.items.some((duty) => duty.employee.id === b.person.employeeId)).toBe(true);
    expect(forFin.items.some((duty) => duty.employee.id === a.person.employeeId)).toBe(false);
    expect(everything.items.map((duty) => duty.employee.id)).toEqual(
      expect.arrayContaining([a.person.employeeId, b.person.employeeId]),
    );
    expect(everything.items.every((duty) => !duty.canConfirm)).toBe(true);
    expect((await page('?pageSize=100', a.person.account)).items).toEqual([]);
    expect((await page('?pageSize=100', h.finance)).items).toEqual([]);
    // The IT Admin sees them in the default view only when they are theirs (the duties of the IT Admin).
    expect((await page('?pageSize=100')).items.filter((duty) => duty.role !== 'IT_ADMIN')).toEqual([]);
  });

  it('is ordered by deadline then id, paged with a total, and filtered by state, person and lateness', async () => {
    const early = await leaver(des, 2);
    const late = await leaver(des, 40);
    const overdue = await leaver(des, 7);
    await h.ctx.sql.query(`UPDATE handover_duties SET due_on = $2 WHERE assignment_id = $1`, [
      overdue.assignmentId,
      h.day(-2),
    ]);

    const everything = await page('?scope=all&pageSize=100');
    const dues = everything.items.map((duty) => duty.dueOn);
    expect([...dues].sort()).toEqual(dues);
    const firstPage = await page('?scope=all&pageSize=2&page=1');
    const secondPage = await page('?scope=all&pageSize=2&page=2');
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.pagination).toMatchObject({
      totalItems: everything.items.length,
      totalPages: Math.ceil(everything.items.length / 2),
    });
    expect(secondPage.items[0].id).toBe(everything.items[2].id);
    expect((await page(`?scope=all&employeeId=${late.person.employeeId}`)).items).toHaveLength(1);
    expect((await page('?scope=all&overdue=true&pageSize=100')).items.map((duty) => duty.employee.id)).toEqual([
      overdue.person.employeeId,
    ]);

    const row = (await page(`?scope=all&employeeId=${early.person.employeeId}`)).items[0];
    await h.confirmDuty(row.id, { value: 'NOT_NEEDED' }, h1.account).expect(201);
    expect((await page(`?scope=all&status=CONFIRMED&employeeId=${early.person.employeeId}`)).items).toHaveLength(1);
    expect((await page(`?scope=all&status=OPEN&employeeId=${early.person.employeeId}`)).items).toHaveLength(0);
    expect((await page(`?scope=all&status=CANCELLED&pageSize=100`)).items).toEqual([]);
    // What a head confirmed stays in their own list as history.
    expect((await page(`?status=CONFIRMED&pageSize=100`, h1.account)).items.map((duty) => duty.id)).toContain(row.id);
  });

  it('takes the same number of statements for a few duties as for many, for a head and for the IT Admin', async () => {
    for (let index = 0; index < 2; index += 1) await leaver(des, 10 + index);
    const fewMine = await counter.run(() => h.duties('?pageSize=100', h1.account).expect(200));
    const fewAll = await counter.run(() => h.duties('?scope=all&pageSize=100').expect(200));
    for (let index = 0; index < 6; index += 1) await leaver(des, 20 + index);

    const manyMine = await counter.run(() => h.duties('?pageSize=100', h1.account).expect(200));
    const manyAll = await counter.run(() => h.duties('?scope=all&pageSize=100').expect(200));

    const sizeOf = (response: { result: { body: unknown } }) =>
      (response.result.body as { data: { items: unknown[] } }).data.items.length;
    expect(sizeOf(manyMine)).toBeGreaterThan(sizeOf(fewMine));
    expect(sizeOf(manyAll)).toBeGreaterThan(sizeOf(fewAll));
    expect(dataStatements(manyMine.statements)).toHaveLength(dataStatements(fewMine.statements).length);
    expect(dataStatements(manyAll.statements)).toHaveLength(dataStatements(fewAll.statements).length);
  }, 300000);

  it('reads the detail of one duty for the head, the IT Admin and nobody else', async () => {
    const { person } = await leaver(des, 6);
    const row = (await page(`?scope=all&employeeId=${person.employeeId}`)).items[0];

    const forHead = h.dataOf<DutyWire>(await h.duty(row.id, h1.account).expect(200));
    const forIt = h.dataOf<DutyWire>(await h.duty(row.id).expect(200));

    expect(forHead).toMatchObject({
      id: row.id,
      noticeText: 'Sao lưu trước khi gỡ',
      canConfirm: true,
      confirmer: { id: h1.employeeId },
    });
    expect(forIt).toMatchObject({
      id: row.id,
      canConfirm: false,
      confirmer: { id: h1.employeeId },
      confirmation: null,
      cancellation: null,
    });
    for (const account of [h2.account, person.account, h.finance, h.employee]) {
      expect(h.codeOf(await h.duty(row.id, account).expect(404))).toBe('HANDOVER_DUTY.NOT_FOUND');
    }
  });
});
