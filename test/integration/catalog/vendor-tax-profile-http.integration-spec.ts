import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

interface LineWire {
  taxType: string;
  ratePercent: string;
  deductible: boolean;
  payer: string;
}

interface ProfileWire {
  group: string;
  lines: LineWire[];
  version: number;
  declaredBy: string;
  declaredAt: string;
}

interface EstimateWire {
  basis: string;
  label: string;
  group: string;
  currency: string;
  netAmount: string;
  taxAmount: string;
  deductibleTaxAmount: string;
  nonDeductibleTaxAmount: string;
  estimatedCost: string;
  lines: Array<LineWire & { taxAmount: string }>;
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const VAT = { taxType: 'GTGT', ratePercent: '10', deductible: true };
const CIT = { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false };

describe('vendor tax profiles over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let businessOwner: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      role: 'FINANCE',
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, {
      code: 'E-EMP',
      email: 'emp@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    businessOwner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  /** A vendor of the organization, made the way the catalog makes one: by declaring an application. */
  const vendor = async (name = unique('Vendor')): Promise<string> =>
    dataOf<{ vendor: { id: string } }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name: unique('App'),
          kind: 'SAAS',
          vendorName: name,
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner,
          communication: NO,
        })
        .expect(201),
    ).vendor.id;
  const declare = (id: string, body: object, account: ApiAccount = finance) =>
    request(server()).put(`/api/v1/vendors/${id}/tax-profile`).set(as(account)).send(body);
  const profileOf = async (id: string, body: object): Promise<ProfileWire> =>
    dataOf<{ profile: ProfileWire }>(await declare(id, body).expect(200)).profile;
  const estimate = (id: string, netAmount: string, currency: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/vendors/${id}/tax-estimate`).query({ netAmount, currency }).set(as(account));
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        "SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 AND resource_type = 'VendorTaxProfile' ORDER BY occurred_at, id",
        [resourceId],
      )
    ).rows;

  describe('declaring a profile (AC-1 to AC-3)', () => {
    it('AC-1: a profile with no group is T2, the buyer remits, and a change to T3 moves the payer to the vendor', async () => {
      const id = await vendor('Figma Inc.');

      const first = await profileOf(id, { lines: [VAT, CIT] });
      expect(first).toMatchObject({
        group: 'T2',
        version: 1,
        declaredBy: finance.appUserId,
        lines: [
          { taxType: 'GTGT', ratePercent: '10', deductible: true, payer: 'BUYER_REMITS' },
          { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false, payer: 'BUYER_REMITS' },
        ],
      });
      const second = await profileOf(id, { group: 'T3', lines: [VAT] });
      expect(second).toMatchObject({ group: 'T3', version: 2, lines: [{ payer: 'VENDOR_COLLECTS' }] });
      expect((await auditOf(id)).map((event) => event.action)).toEqual([
        'VENDOR_TAX_PROFILE.DECLARED',
        'VENDOR_TAX_PROFILE.DECLARED',
      ]);
    });

    it('AC-2: a domestic vendor is T1 with VAT 10% or not subject to tax, with no line at all', async () => {
      const taxed = await vendor('FPT Cloud');
      const exempt = await vendor('Exempt Software Ltd');

      expect(await profileOf(taxed, { group: 'T1', lines: [VAT] })).toMatchObject({
        group: 'T1',
        lines: [{ ratePercent: '10', payer: 'VENDOR_COLLECTS' }],
      });
      expect(await profileOf(exempt, { group: 'T1', lines: [] })).toMatchObject({ group: 'T1', lines: [] });
      expect(dataOf<EstimateWire>(await estimate(exempt, '1000.00', 'USD').expect(200))).toMatchObject({
        taxAmount: '0.00',
        estimatedCost: '1000.00',
      });
    });

    it('AC-3: a T3 profile records the taxes the vendor or platform collected and none as paid by the company', async () => {
      const id = await vendor();

      const profile = await profileOf(id, { group: 'T3', lines: [VAT, { ...CIT, taxType: 'Other tax' }] });

      expect(profile.lines.map((line) => line.payer)).toEqual(['VENDOR_COLLECTS', 'VENDOR_COLLECTS']);
      expect(JSON.stringify(profile)).not.toContain('BUYER_REMITS');
    });

    it('does not let a payer be typed in: a profile naming one is refused', async () => {
      const id = await vendor();

      expect(codeOf(await declare(id, { group: 'T3', lines: [{ ...VAT, payer: 'BUYER_REMITS' }] }).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
    });
  });

  describe('estimating (AC-4, AC-8)', () => {
    it('AC-4: 1,000.00 USD with VAT 10% deductible and CIT 5% not is 150.00 tax, 100.00 + 50.00, cost 1,050.00', async () => {
      const id = await vendor('Figma Estimate');
      await profileOf(id, { lines: [VAT, CIT] });

      const result = dataOf<EstimateWire>(await estimate(id, '1000.00', 'USD').expect(200));

      expect(result).toMatchObject({
        basis: 'PROFILE',
        label: 'ESTIMATE',
        group: 'T2',
        currency: 'USD',
        netAmount: '1000.00',
        taxAmount: '150.00',
        deductibleTaxAmount: '100.00',
        nonDeductibleTaxAmount: '50.00',
        estimatedCost: '1050.00',
      });
      expect(result.lines.map((line) => [line.taxType, line.taxAmount, line.payer])).toEqual([
        ['GTGT', '100.00', 'BUYER_REMITS'],
        ['TNDN nhà thầu', '50.00', 'BUYER_REMITS'],
      ]);
    });

    it('rounds each line to the minor unit of the currency, an exact half away from zero, and VND has no decimals', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [{ taxType: 'Half', ratePercent: '10', deductible: false }] });

      expect(dataOf<EstimateWire>(await estimate(id, '5', 'VND').expect(200))).toMatchObject({
        netAmount: '5',
        taxAmount: '1',
        estimatedCost: '6',
      });
      expect(dataOf<EstimateWire>(await estimate(id, '0.05', 'USD').expect(200))).toMatchObject({
        taxAmount: '0.01',
        estimatedCost: '0.06',
      });
      expect(dataOf<EstimateWire>(await estimate(id, '0', 'VND').expect(200))).toMatchObject({ taxAmount: '0' });
    });

    it('refuses an amount that is malformed, has too many decimals, is negative or too large, and a currency it does not know', async () => {
      const id = await vendor();

      expect(codeOf(await estimate(id, 'abc', 'USD').expect(422))).toBe('VALIDATION_ERROR');
      expect(codeOf(await estimate(id, '1000.001', 'USD').expect(422))).toBe('MONEY_SCALE_EXCEEDED');
      expect(codeOf(await estimate(id, '1.5', 'VND').expect(422))).toBe('MONEY_SCALE_EXCEEDED');
      expect(codeOf(await estimate(id, '-5', 'VND').expect(422))).toBe('MONEY_OUT_OF_RANGE');
      expect(codeOf(await estimate(id, '10000000000000.01', 'USD').expect(422))).toBe('MONEY_OUT_OF_RANGE');
      expect(codeOf(await estimate(id, '10', 'XYZ').expect(422))).toBe('CURRENCY_NOT_SUPPORTED');
    });

    it('AC-8: a vendor with no profile shows MISSING with the default, estimates by it with its own label, and blocks nothing', async () => {
      const id = await vendor('Miro Inc.');

      const shown = dataOf<{ status: string; profile: unknown; defaultProfile: { group: string; lines: LineWire[] } }>(
        await request(server()).get(`/api/v1/vendors/${id}/tax-profile`).set(as(finance)).expect(200),
      );
      expect(shown.status).toBe('MISSING');
      expect(shown.profile).toBeNull();
      expect(shown.defaultProfile).toEqual({
        group: 'T2',
        lines: [
          { taxType: 'GTGT', ratePercent: '10', deductible: true, payer: 'BUYER_REMITS' },
          { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false, payer: 'BUYER_REMITS' },
        ],
      });
      expect(dataOf<EstimateWire>(await estimate(id, '20000000', 'VND').expect(200))).toMatchObject({
        basis: 'DEFAULT_NO_PROFILE',
        label: 'ESTIMATE_NO_PROFILE',
        taxAmount: '3000000',
        deductibleTaxAmount: '2000000',
        nonDeductibleTaxAmount: '1000000',
        estimatedCost: '21000000',
      });
    });

    it('AC-8: Finance finds the vendors still to declare, and a vendor leaves that list once declared', async () => {
      const tag = unique('Missing').replace(/ /g, '-');
      const open = await vendor(`${tag} A`);
      const done = await vendor(`${tag} B`);
      await profileOf(done, { group: 'T1', lines: [VAT] });
      const list = async (taxProfile: string) =>
        dataOf<{ items: Array<{ id: string; taxProfileStatus: string; taxGroup: string | null }> }>(
          await request(server())
            .get('/api/v1/vendors')
            .query({ search: tag, taxProfile })
            .set(as(finance))
            .expect(200),
        ).items;

      expect(await list('MISSING')).toEqual([
        expect.objectContaining({ id: open, taxProfileStatus: 'MISSING', taxGroup: null }),
      ]);
      expect(await list('DECLARED')).toEqual([
        expect.objectContaining({ id: done, taxProfileStatus: 'DECLARED', taxGroup: 'T1' }),
      ]);

      await profileOf(open, { lines: [] });
      expect(await list('MISSING')).toEqual([]);
    });
  });

  describe('changing a profile (AC-5, version part)', () => {
    it('AC-5: a changed rate is a new version, the old one stays whole in the history, and the estimate uses the new one', async () => {
      const id = await vendor('Figma Rates');
      await profileOf(id, { lines: [VAT, CIT] });

      const changed = dataOf<{ profile: ProfileWire; changed: boolean }>(
        await declare(id, { lines: [VAT, { ...CIT, ratePercent: '10' }] }).expect(200),
      );

      expect(changed).toMatchObject({ changed: true, profile: { version: 2 } });
      const history = dataOf<{ items: ProfileWire[]; pagination: { totalItems: number } }>(
        await request(server()).get(`/api/v1/vendors/${id}/tax-profile/history`).set(as(it1)).expect(200),
      );
      expect(history.pagination.totalItems).toBe(2);
      expect(history.items.map((item) => item.version)).toEqual([2, 1]);
      expect(history.items[1].lines[1]).toMatchObject({ taxType: 'TNDN nhà thầu', ratePercent: '5' });
      expect(history.items[0].lines[1]).toMatchObject({ ratePercent: '10' });
      expect(dataOf<EstimateWire>(await estimate(id, '1000.00', 'USD').expect(200)).taxAmount).toBe('200.00');
      const events = await auditOf(id);
      expect(events[1]).toMatchObject({
        action: 'VENDOR_TAX_PROFILE.DECLARED',
        actor_roles: ['FINANCE'],
        before: { version: 1, lines: ['GTGT|1000|deductible', 'TNDN nhà thầu|500|not deductible'] },
        after: { version: 2, lines: ['GTGT|1000|deductible', 'TNDN nhà thầu|1000|not deductible'] },
      });
    });

    it('AC-5: no one, not even a direct SQL write, can change or delete a version already recorded', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [VAT] });

      await expect(
        ctx.sql.query(`UPDATE vendor_tax_profile_versions SET tax_group = 'T3' WHERE vendor_id = $1`, [id]),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        ctx.sql.query(
          `DELETE FROM vendor_tax_profile_lines WHERE rate_bp = 1000 AND version_id IN (SELECT id FROM vendor_tax_profile_versions WHERE vendor_id = $1)`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('answers 200 with changed false and records nothing for a profile equal to the current one', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [VAT, CIT] });
      const versions = await n('vendor_tax_profile_versions');

      const same = dataOf<{ profile: ProfileWire; changed: boolean }>(
        await declare(id, { group: 'T2', lines: [{ ...VAT, taxType: ' gtgt ', ratePercent: '10.00' }, CIT] }).expect(
          200,
        ),
      );

      expect(same).toMatchObject({ changed: false, profile: { version: 1 } });
      expect(await n('vendor_tax_profile_versions')).toBe(versions);
      expect(await auditOf(id)).toHaveLength(1);
    });

    it('queues two different declarations at once, after a first one, into versions 2 and 3, and records one version for two equal ones', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [] });

      const different = await Promise.all([declare(id, { lines: [VAT] }), declare(id, { lines: [CIT] })]);
      expect(different.map((response) => response.status)).toEqual([200, 200]);
      const versions = await ctx.sql.query<{ version: number }>(
        `SELECT version FROM vendor_tax_profile_versions WHERE vendor_id = $1 ORDER BY version`,
        [id],
      );
      expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3]);

      const other = await vendor();
      const equal = await Promise.all([declare(other, { lines: [VAT] }), declare(other, { lines: [VAT] })]);
      expect(equal.map((response) => response.status)).toEqual([200, 200]);
      expect(dataOf<{ changed: boolean }>(equal[0]).changed !== dataOf<{ changed: boolean }>(equal[1]).changed).toBe(
        true,
      );
      expect(
        (await ctx.sql.query(`SELECT 1 FROM vendor_tax_profile_versions WHERE vendor_id = $1`, [other])).rowCount,
      ).toBe(1);
    });

    it.each([
      ['an empty tax name', { lines: [{ ...VAT, taxType: '  ' }] }, 'VENDOR_TAX_PROFILE.TAX_TYPE_INVALID'],
      [
        'a tax name over 100 characters',
        { lines: [{ ...VAT, taxType: 'T'.repeat(101) }] },
        'VENDOR_TAX_PROFILE.TAX_TYPE_INVALID',
      ],
      ['a tax name used twice', { lines: [VAT, { ...CIT, taxType: 'gtgt' }] }, 'VENDOR_TAX_PROFILE.TAX_TYPE_DUPLICATE'],
      ['a negative rate', { lines: [{ ...VAT, ratePercent: '-1' }] }, 'VENDOR_TAX_PROFILE.RATE_INVALID'],
      ['a rate over 100', { lines: [{ ...VAT, ratePercent: '100.01' }] }, 'VENDOR_TAX_PROFILE.RATE_INVALID'],
      ['a rate with three decimals', { lines: [{ ...VAT, ratePercent: '7.255' }] }, 'VENDOR_TAX_PROFILE.RATE_INVALID'],
      ['a rate that is not a number', { lines: [{ ...VAT, ratePercent: '10%' }] }, 'VENDOR_TAX_PROFILE.RATE_INVALID'],
      [
        'twenty-one taxes',
        {
          lines: Array.from({ length: 21 }, (_, index) => ({
            taxType: `Tax ${index}`,
            ratePercent: '1',
            deductible: false,
          })),
        },
        'VENDOR_TAX_PROFILE.TOO_MANY_LINES',
      ],
    ])('refuses a profile with %s: 422 %s and nothing recorded', async (_name, body, code) => {
      const id = await vendor();
      const before = await n('vendor_tax_profile_versions');

      expect(codeOf(await declare(id, body).expect(422))).toBe(code);
      expect(await n('vendor_tax_profile_versions')).toBe(before);
      expect((await ctx.sql.query(`SELECT 1 FROM vendor_tax_profiles WHERE vendor_id = $1`, [id])).rowCount).toBe(0);
    });

    it('answers 404 VENDOR.NOT_FOUND on every route for a vendor that does not exist, writing nothing', async () => {
      const missing = randomUUID();
      const before = { heads: await n('vendor_tax_profiles'), audit: await n('audit_events') };

      expect(codeOf(await declare(missing, { lines: [] }).expect(404))).toBe('VENDOR.NOT_FOUND');
      expect(
        codeOf(await request(server()).get(`/api/v1/vendors/${missing}/tax-profile`).set(as(it1)).expect(404)),
      ).toBe('VENDOR.NOT_FOUND');
      expect(
        codeOf(await request(server()).get(`/api/v1/vendors/${missing}/tax-profile/history`).set(as(it1)).expect(404)),
      ).toBe('VENDOR.NOT_FOUND');
      expect(codeOf(await estimate(missing, '10', 'VND').expect(404))).toBe('VENDOR.NOT_FOUND');
      expect({ heads: await n('vendor_tax_profiles'), audit: await n('audit_events') }).toEqual(before);
    });
  });

  describe('who may use it (AC-6, AC-7)', () => {
    it('AC-6: turns the IT Admin, an employee and the Super Admin away from declaring: 403 and the profile is unchanged', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [VAT] });
      const before = await n('vendor_tax_profile_versions');
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      await declare(id, { lines: [CIT] }, it1).expect(403);
      await declare(id, { lines: [CIT] }, employee).expect(403);
      await request(server())
        .put(`/api/v1/vendors/${id}/tax-profile`)
        .set(asSuperAdmin)
        .send({ lines: [CIT] })
        .expect(403);

      expect(await n('vendor_tax_profile_versions')).toBe(before);
    });

    it('AC-6: lets the IT Admin read the profile, its history, the estimate and the list; an employee reads none of them', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [VAT] });

      for (const path of [
        `/api/v1/vendors/${id}/tax-profile`,
        `/api/v1/vendors/${id}/tax-profile/history`,
        `/api/v1/vendors/${id}/tax-estimate?netAmount=10&currency=USD`,
        '/api/v1/vendors',
      ]) {
        await request(server()).get(path).set(as(it1)).expect(200);
        await request(server()).get(path).set(as(finance)).expect(200);
        await request(server()).get(path).set(as(employee)).expect(403);
      }
    });

    it('AC-7: the estimate stores nothing, and the system has no route that computes a payable tax, files, or deletes', async () => {
      const id = await vendor();
      await profileOf(id, { lines: [VAT, CIT] });
      const before = { versions: await n('vendor_tax_profile_versions'), audit: await n('audit_events') };

      await estimate(id, '1000.00', 'USD').expect(200);
      await estimate(id, '1000.00', 'USD').expect(200);

      expect({ versions: await n('vendor_tax_profile_versions'), audit: await n('audit_events') }).toEqual(before);
      for (const path of [`/api/v1/vendors/${id}/tax-profile`, `/api/v1/vendors/${id}`]) {
        await request(server()).delete(path).set(as(finance)).expect(404);
      }
    });

    it('lists vendors by name in pages and shows the group of the declared ones', async () => {
      const tag = unique('Paging').replace(/ /g, '-');
      await vendor(`${tag} B`);
      const a = await vendor(`${tag} A`);
      await profileOf(a, { group: 'T3', lines: [] });

      const page = dataOf<{
        items: Array<{ name: string; taxGroup: string | null }>;
        pagination: { totalItems: number };
      }>(
        await request(server())
          .get('/api/v1/vendors')
          .query({ search: tag, pageSize: 1, page: 1 })
          .set(as(it1))
          .expect(200),
      );
      expect(page.items).toEqual([expect.objectContaining({ name: `${tag} A`, taxGroup: 'T3' })]);
      expect(page.pagination.totalItems).toBe(2);
    });
  });
});
