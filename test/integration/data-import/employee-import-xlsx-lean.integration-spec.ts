import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { EmployeeImportHttpHarness } from '../../support/employee-import-http-harness';

describe('Excel employee import integration', () => {
  const h = new EmployeeImportHttpHarness();
  beforeAll(async () => h.start(), 120000);
  afterAll(async () => h.stop());
  it('previews and confirms the fifteen example employees including three unplaced', async () => {
    for (const code of ['DS1-ENG', 'DS1-DES', 'DS1-OPS']) {
      await request(h.server()).post('/api/v1/departments').set(h.asSuper()).send({ code, name: code }).expect(201);
    }
    const bytes = await readFile(resolve('docs/examples/employee-import/employees-15.xlsx'));
    const uploaded = await request(h.server())
      .post('/api/v1/employee-imports')
      .set(h.asSuper())
      .attach('file', bytes, 'employees-15.xlsx')
      .expect(201);
    const preview = (
      uploaded.body as {
        data: {
          id: string;
          previewVersion: number;
          summary: { totalRows: number; valid: number; newUnplaced: number };
        };
      }
    ).data;
    expect(preview.summary).toMatchObject({ totalRows: 15, valid: 15, newUnplaced: 3 });
    const result = await h
      .confirm(preview.id, { previewVersion: preview.previewVersion, idempotencyKey: 'xlsx-confirm-01' })
      .expect(200);
    expect(
      (result.body as { data: { import: { result: { created: number; newUnplaced: number } } } }).data.import.result,
    ).toMatchObject({ created: 15, newUnplaced: 3 });
  });
});
