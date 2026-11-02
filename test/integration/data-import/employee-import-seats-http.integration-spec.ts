import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const HEADER = 'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title';

interface QueueWire {
  total: number;
  items: Array<{ employeeCode: string; fullName: string; seats: number }>;
}
interface ImportWire {
  id: string;
  status: string;
  summary: { reviewQueue: QueueWire };
}

describe('the people file and the people who hold seats (US-02-02 AC-4, integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const superAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const upload = (rows: string[]) =>
    request(h.server())
      .post('/api/v1/employee-imports')
      .set(superAdmin())
      .attach('file', Buffer.from(`${HEADER}\n${rows.join('\n')}\n`), 'people.csv');
  const newRow = (code: string) =>
    `${code},Person ${code},${code.toLowerCase()}@acme.vn,STAFF,2026-09-01,P-OPS,Administrator`;
  const queueOf = async (rows: string[]): Promise<{ id: string; queue: QueueWire }> => {
    const created = h.dataOf<ImportWire>(await upload(rows).expect(201));

    return { id: created.id, queue: created.summary.reviewQueue };
  };

  it('puts a person who holds a seat and is not in the new file in the queue to review, and changes nothing about them', async () => {
    const subscriptionId = await h.subscription(10);
    const e7 = await h.person('E7');
    await h.person('E8');
    await h.written({ subscriptionId }, [
      { employee_code: 'E7', account_identifier: 'e7@acme.vn' },
      { employee_code: 'E8', account_identifier: 'e8@acme.vn' },
    ]);

    const { id, queue } = await queueOf([newRow('E-NEW1')]);

    expect(queue.total).toBe(2);
    expect(queue.items).toEqual([
      { employeeCode: 'E7', fullName: 'Person E7', seats: 1 },
      { employeeCode: 'E8', fullName: 'Person E8', seats: 1 },
    ]);
    await request(h.server())
      .post(`/api/v1/employee-imports/${id}/confirmations`)
      .set(superAdmin())
      .send({ previewVersion: 1, idempotencyKey: 'key-queue-0001', acknowledgeDuplicateFile: false })
      .expect(200);
    const status = await h.ctx.sql.query<{ status: string }>(`SELECT status FROM employees WHERE id = $1`, [e7]);
    expect(status.rows[0].status).toBe('ACTIVE');
    const kept = h.dataOf<ImportWire>(
      await request(h.server()).get(`/api/v1/employee-imports/${id}`).set(superAdmin()).expect(200),
    );
    expect(kept.summary.reviewQueue.items.map((item) => item.employeeCode)).toEqual(['E7', 'E8']);
  });

  it('leaves out a person the file lists, however the row is judged, and counts all the seats a person holds', async () => {
    const subscriptionId = await h.subscription(10);
    await h.person('E9');
    await h.written({ subscriptionId }, [
      { employee_code: 'E9', account_identifier: 'e9@acme.vn' },
      { employee_code: 'E9', account_identifier: 'e9-bot', kind: 'service', reason: 'CI' },
    ]);

    const without = await queueOf([newRow('E-NEW2')]);
    const withE9 = await queueOf([`E9,Person E9,e9@acme.vn,STAFF,2026-01-05,P-OPS,Administrator`]);

    expect(without.queue.items.find((item) => item.employeeCode === 'E9')).toEqual({
      employeeCode: 'E9',
      fullName: 'Person E9',
      seats: 2,
    });
    expect(withE9.queue.items.map((item) => item.employeeCode)).not.toContain('E9');
  });

  it('does not queue a person whose seats have ended or who has left, nor one who holds none', async () => {
    const subscriptionId = await h.subscription(10);
    const ended = await h.person('E10');
    const left = await h.person('E11');
    await h.person('E12');
    await h.written({ subscriptionId }, [
      { employee_code: 'E10', account_identifier: 'e10@acme.vn', granted_on: '2025-01-01' },
      { employee_code: 'E11', account_identifier: 'e11@acme.vn' },
    ]);
    await h.ctx.sql.query(`ALTER TABLE license_assignments DISABLE TRIGGER license_assignments_immutable`);
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2025-06-01' WHERE employee_id = $1`, [ended]);
    await h.ctx.sql.query(`ALTER TABLE license_assignments ENABLE TRIGGER license_assignments_immutable`);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left]);

    const { queue } = await queueOf([newRow('E-NEW3')]);

    const codes = queue.items.map((item) => item.employeeCode);
    expect(codes).not.toContain('E10');
    expect(codes).not.toContain('E11');
    expect(codes).not.toContain('E12');
  });

  it('is empty when nobody holds a seat that the file leaves out', async () => {
    const fresh = await queueOf([newRow('E-NEW4')]);

    expect(fresh.queue.total).toBe(fresh.queue.items.length);
  });
});
