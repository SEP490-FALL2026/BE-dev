import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const TEMPLATES = '/api/v1/import-templates';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ALLOWED: ReadonlyArray<readonly [string, string]> = [
  ['employees', 'SUPER_ADMIN'],
  ['seat-baseline', 'IT_ADMIN'],
  ['license-keys', 'IT_ADMIN'],
  ['usage-csv', 'IT_ADMIN'],
  ['budget-proposal', 'MANAGER'],
  ['budget-proposal', 'FINANCE'],
];

/** The template files: who may download which, the formats, and that no bank statement template exists (`QĐ-111as`). The files are built from the real parsers' columns. */
describe('import template route (http contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  const get = (kind: string, role: string, query = '') =>
    request(app.getHttpServer())
      .get(`${TEMPLATES}/${kind}${query}`)
      .set('Authorization', bearer(principal([role])))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('answers 401 without a token', async () => {
    const response = await request(app.getHttpServer()).get(`${TEMPLATES}/employees`).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(ALLOWED)('gives %s to %s as xlsx by default and as csv when asked', async (kind, role) => {
    const xlsx = await get(kind, role).expect(200);
    expect(xlsx.headers['content-type']).toContain(XLSX);
    expect(xlsx.headers['content-disposition']).toContain(`mau-${kind}.xlsx`);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const csv = await get(kind, role, '?format=csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(`mau-${kind}.csv`);
    expect((csv.body as Buffer).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it.each([
    ['employees', 'IT_ADMIN'],
    ['employees', 'MANAGER'],
    ['seat-baseline', 'SUPER_ADMIN'],
    ['license-keys', 'FINANCE'],
    ['usage-csv', 'MANAGER'],
    ['budget-proposal', 'IT_ADMIN'],
    ['budget-proposal', 'SUPER_ADMIN'],
  ])('refuses %s to %s with 403', async (kind, role) => {
    const response = await get(kind, role);

    expect(response.status).toBe(403);
  });

  it.each([['EMPLOYEE'], ['SPENDING_APPROVER']])('refuses every kind to %s with 403', async (role) => {
    for (const kind of ['employees', 'seat-baseline', 'license-keys', 'usage-csv', 'budget-proposal']) {
      expect((await get(kind, role)).status).toBe(403);
    }
  });

  it('has the example rows of the budget form in the csv', async () => {
    const csv = (await get('budget-proposal', 'FINANCE', '?format=csv').expect(200)).body as Buffer;

    expect(csv.toString('utf8')).toContain('software,plan,seats,monthly_price_vnd,months,amount_vnd,reason');
  });

  it.each([['bank-statement'], ['employee'], ['EMPLOYEES']])(
    'knows no kind %s (422, no bank statement template)',
    async (kind) => {
      expect((await get(kind, 'SUPER_ADMIN')).status).toBe(422);
    },
  );

  it('refuses a format that is not xlsx or csv (422)', async () => {
    expect((await get('employees', 'SUPER_ADMIN', '?format=pdf')).status).toBe(422);
  });
});
