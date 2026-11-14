import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

interface PlanWire {
  id: string;
  applicationId: string;
  name: string;
  provisioningType: string;
  pricingModel: string | null;
  seatTracking: string;
}

interface CreatedWire {
  id: string;
  name: string;
  kind: 'SAAS' | 'LICENSED' | 'INTERNAL';
  vendor: { id: string; name: string } | null;
  dataSensitivity: string | null;
  isCommunicationService: boolean;
  functionalGroup: { id: string; name: string } | null;
  responsibleItAdmin: { employeeId: string } | null;
  domains: string[];
  proposedToDictionary: boolean;
  plan: PlanWire;
}

/**
 * CT-1.4 (QĐ-111d, QĐ-111e, QĐ-111f, QĐ-111b, B-5): the one command that makes an application and its first plan, over HTTP and real PostgreSQL. The
 * kind of the application follows the plan, the pricing model follows the kind of provisioning, an application with no group stands in Khác, the
 * software the catalog already has is refused with the entry it is, and what a plan refuses leaves no application behind.
 */
describe('POST /applications: the application and its first plan in one command (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const errorOf = (response: request.Response) =>
    (response.body as { error: { code: string; details?: Record<string, unknown> } }).error;
  const create = (body: object) => request(server()).post('/api/v1/applications').set(as(it1)).send(body);
  const k2 = (name = unique('Team')) => ({ name, provisioningType: 'K2', controlLevel: 'FULL' });
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const groupId = async (systemKey: string): Promise<string> =>
    (await ctx.sql.query<{ id: string }>(`SELECT id FROM functional_groups WHERE system_key = $1`, [systemKey])).rows[0]
      .id;

  it('makes the application and its plan together: SAAS, priced per seat, in Khác, answered for by the IT Admin who made it', async () => {
    const name = unique('Figma');
    const created = dataOf<CreatedWire>(
      await create({ name, vendorName: unique('Figma Inc'), plan: k2('Organization') }).expect(201),
    );

    expect(created).toMatchObject({
      name,
      kind: 'SAAS',
      dataSensitivity: null,
      isCommunicationService: false,
      functionalGroup: { name: 'Khác' },
      responsibleItAdmin: { employeeId: it1.employeeId },
      proposedToDictionary: true,
      plan: {
        applicationId: created.id,
        name: 'Organization',
        provisioningType: 'K2',
        pricingModel: 'PER_SEAT',
        seatTracking: 'APPLICABLE',
      },
    });
    expect(created.functionalGroup?.id).toBe(await groupId('OTHER'));
    const events = await ctx.sql.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = ANY($1::text[]) ORDER BY occurred_at, id`,
      [[created.id, created.plan.id]],
    );
    expect(events.rows.map((row) => row.action)).toEqual(['APPLICATION.CREATED', 'PLAN.CREATED']);
  });

  it('prices a plan bought once (K4) by no model and a plan with no price (K5) by none, and makes an internal application of the second', async () => {
    const bought = dataOf<CreatedWire>(
      await create({
        name: unique('Acrobat'),
        vendorName: unique('Adobe'),
        plan: { name: 'Perpetual licence', provisioningType: 'K4', controlLevel: 'PARTIAL' },
      }).expect(201),
    );
    const internal = dataOf<CreatedWire>(
      await create({ name: unique('Portal'), plan: { name: 'Portal access', provisioningType: 'K5' } }).expect(201),
    );

    expect(bought).toMatchObject({
      kind: 'SAAS',
      plan: { provisioningType: 'K4', pricingModel: null, seatTracking: 'NOT_APPLICABLE' },
    });
    expect(internal).toMatchObject({
      kind: 'INTERNAL',
      vendor: null,
      plan: { provisioningType: 'K5', pricingModel: null },
    });
  });

  it('puts the application in the group named, refuses a group that is switched off, and keeps the sensitivity when it is given', async () => {
    const group = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/functional-groups')
        .set(as(it1))
        .send({ name: unique('Group') })
        .expect(201),
    );
    const placed = dataOf<CreatedWire>(
      await create({
        name: unique('Slack'),
        vendorName: unique('Slack Tech'),
        functionalGroupId: group.id,
        dataSensitivity: 'HIGH',
        plan: k2(),
      }).expect(201),
    );
    expect(placed).toMatchObject({ functionalGroup: { id: group.id }, dataSensitivity: 'HIGH' });

    await request(server())
      .patch(`/api/v1/functional-groups/${group.id}`)
      .set(as(it1))
      .send({ status: 'INACTIVE' })
      .expect(200);
    const refused = await create({
      name: unique('Zoom'),
      vendorName: unique('Zoom Inc'),
      functionalGroupId: group.id,
      plan: k2(),
    }).expect(422);
    expect(errorOf(refused).code).toBe('APPLICATION.FUNCTIONAL_GROUP_INVALID');
  });

  it('keeps the host of the homepage among the domains, first', async () => {
    const created = dataOf<CreatedWire>(
      await create({
        name: unique('Miro'),
        vendorName: unique('RealtimeBoard'),
        homepageUrl: 'https://www.miro-test.example/pricing',
        domains: ['app.miro-test.example'],
        plan: k2(),
      }).expect(201),
    );

    expect(created.domains).toEqual(['miro-test.example', 'app.miro-test.example']);
  });

  it('leaves nothing behind when the plan is refused: no application, no vendor, no audit event (the transaction is one)', async () => {
    const before = {
      applications: await n('applications'),
      plans: await n('plans'),
      vendors: await n('vendors'),
      audit: await n('audit_events'),
    };
    const name = unique('Refused');

    const notSupported = await create({
      name,
      vendorName: unique('V'),
      plan: { name: 'Plan', provisioningType: 'K3', controlLevel: 'FULL' },
    }).expect(422);
    const noControl = await create({
      name: unique('Refused'),
      vendorName: unique('V'),
      plan: { name: 'Plan', provisioningType: 'K1' },
    }).expect(422);

    expect(errorOf(notSupported).code).toBe('PLAN.PROVISIONING_TYPE_NOT_SUPPORTED');
    expect(errorOf(noControl).code).toBe('PLAN.CONTROL_LEVEL_REQUIRED');
    expect({
      applications: await n('applications'),
      plans: await n('plans'),
      vendors: await n('vendors'),
      audit: await n('audit_events'),
    }).toEqual(before);
  });

  it('refuses an internal application that names a vendor, and any other that names none, before writing anything', async () => {
    const internal = await create({
      name: unique('Tool'),
      vendorName: 'Somebody',
      plan: { name: 'Access', provisioningType: 'K5' },
    }).expect(422);
    const noVendor = await create({ name: unique('Tool'), plan: k2() }).expect(422);

    expect(errorOf(internal).code).toBe('APPLICATION.INTERNAL_HAS_NO_VENDOR');
    expect(errorOf(noVendor).code).toBe('APPLICATION.VENDOR_REQUIRED');
  });

  it('refuses software the catalog has, by name once case, accents and spacing are ignored: 409 APPLICATION.DUPLICATE with the entry', async () => {
    const existing = dataOf<CreatedWire>(
      await create({ name: unique('Fígma'), vendorName: unique('Figma Inc'), plan: k2() }).expect(201),
    );
    const before = await n('applications');

    const response = await create({
      name: `  ${existing.name.toUpperCase().replace('Í', 'I')}  `,
      vendorName: unique('Another vendor'),
      plan: k2(),
    }).expect(409);

    expect(errorOf(response)).toMatchObject({
      code: 'APPLICATION.DUPLICATE',
      details: {
        matchedBy: 'NAME',
        existing: {
          id: existing.id,
          name: existing.name,
          vendorName: existing.vendor?.name,
          functionalGroup: { name: 'Khác' },
        },
      },
    });
    expect(await n('applications')).toBe(before);
  });

  it('refuses software the catalog has by a domain it shares, whatever the name: 409 with the entry and matchedBy DOMAIN', async () => {
    const existing = dataOf<CreatedWire>(
      await create({
        name: unique('Claude'),
        vendorName: unique('Anthropic'),
        domains: ['claude-test.example'],
        plan: k2(),
      }).expect(201),
    );

    const response = await create({
      name: unique('Claude AI'),
      vendorName: unique('Anthropic PBC'),
      homepageUrl: 'https://claude-test.example',
      plan: k2(),
    }).expect(409);

    expect(errorOf(response)).toMatchObject({
      code: 'APPLICATION.DUPLICATE',
      details: { matchedBy: 'DOMAIN', existing: { id: existing.id } },
    });
  });

  it('does not count a retired application as software the catalog has', async () => {
    const retired = dataOf<CreatedWire>(
      await create({ name: unique('Old tool'), vendorName: unique('Old vendor'), plan: k2() }).expect(201),
    );
    await ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
      retired.id,
    ]);

    await create({ name: retired.name, vendorName: unique('New vendor'), plan: k2() }).expect(201);
  });

  it('answers POST /plans with the plan that has the name when a second plan repeats it: 409 PLAN.NAME_TAKEN, details.existing', async () => {
    const created = dataOf<CreatedWire>(
      await create({ name: unique('Notion'), vendorName: unique('Notion Labs'), plan: k2('Team') }).expect(201),
    );

    const response = await request(server())
      .post('/api/v1/plans')
      .set(as(it1))
      .send({ applicationId: created.id, name: ' team ', provisioningType: 'K2', controlLevel: 'FULL' })
      .expect(409);

    expect(errorOf(response)).toMatchObject({
      code: 'PLAN.NAME_TAKEN',
      details: { existing: { id: created.plan.id, name: 'Team', provisioningType: 'K2' } },
    });
  });

  it('derives the pricing model of a plan declared on its own when none is sent (B-5)', async () => {
    const created = dataOf<CreatedWire>(
      await create({ name: unique('Linear'), vendorName: unique('Linear Inc'), plan: k2() }).expect(201),
    );

    const second = dataOf<PlanWire>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({ applicationId: created.id, name: unique('Business'), provisioningType: 'K1', controlLevel: 'PARTIAL' })
        .expect(201),
    );
    const bought = dataOf<PlanWire>(
      await request(server())
        .post('/api/v1/plans')
        .set(as(it1))
        .send({ applicationId: created.id, name: unique('Once'), provisioningType: 'K4', controlLevel: 'FULL' })
        .expect(201),
    );

    expect(second.pricingModel).toBe('PER_SEAT');
    expect(bought.pricingModel).toBeNull();
  });
  describe('the logo: a link to an image, https only (CT-1.L1)', () => {
    const LOGO = 'https://cdn.example.com/logo.png';
    const patch = (id: string, body: object) =>
      request(server()).patch(`/api/v1/applications/${id}`).set(as(it1)).send(body);
    const detail = async (id: string) =>
      dataOf<{ logoUrl: string | null }>(
        await request(server()).get(`/api/v1/applications/${id}`).set(as(it1)).expect(200),
      );
    const make = async (extra: object = {}) =>
      dataOf<CreatedWire & { logoUrl: string | null }>(
        await create({ name: unique('Logo app'), vendorName: unique('Logo vendor'), plan: k2(), ...extra }).expect(201),
      );

    it('keeps the link given with the application (blanks cut off), answers it in the detail and the list, and null when there is none', async () => {
      const withLogo = await make({ logoUrl: `  ${LOGO} ` });
      const without = await make();

      expect(withLogo.logoUrl).toBe(LOGO);
      expect(without.logoUrl).toBeNull();
      expect((await detail(withLogo.id)).logoUrl).toBe(LOGO);
      const list = dataOf<{ items: { id: string; logoUrl: string | null }[] }>(
        await request(server()).get('/api/v1/applications').query({ pageSize: 100 }).set(as(it1)).expect(200),
      );
      expect(list.items.find((item) => item.id === withLogo.id)?.logoUrl).toBe(LOGO);
      expect(list.items.find((item) => item.id === without.id)?.logoUrl).toBeNull();
    });

    it('refuses a link that is not https, a script or one of 501 characters: 422 VALIDATION_ERROR, nothing stored', async () => {
      const before = await n('applications');

      for (const logoUrl of [
        'http://cdn.example.com/logo.png',
        'javascript:alert(1)',
        `https://cdn.example.com/${'a'.repeat(480)}`,
      ]) {
        const response = await create({
          name: unique('Bad logo'),
          vendorName: unique('V'),
          plan: k2(),
          logoUrl,
        }).expect(422);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
      }
      expect(await n('applications')).toBe(before);
    });

    it('replaces the link, leaves it when the update does not send it, removes it with null, and audits each change', async () => {
      const created = await make({ logoUrl: LOGO });
      const next = 'https://cdn.example.com/logo-2.png';

      await patch(created.id, { logoUrl: next }).expect(200);
      expect((await detail(created.id)).logoUrl).toBe(next);
      await patch(created.id, { dataSensitivity: 'LOW' }).expect(200);
      expect((await detail(created.id)).logoUrl).toBe(next);
      const cleared = dataOf<{ logoUrl: string | null }>(await patch(created.id, { logoUrl: null }).expect(200));
      expect(cleared.logoUrl).toBeNull();
      const events = await ctx.sql.query<{ before: { logoUrl?: string | null }; after: { logoUrl?: string | null } }>(
        `SELECT before, after FROM audit_events WHERE resource_id = $1 AND action = 'APPLICATION.UPDATED' ORDER BY occurred_at, id`,
        [created.id],
      );
      expect(events.rows.map((row) => [row.before.logoUrl, row.after.logoUrl])).toEqual([
        [LOGO, next],
        [next, next],
        [next, null],
      ]);
    });

    it('refuses an update with a link that is not https or is empty: 422 VALIDATION_ERROR, the logo stays', async () => {
      const created = await make({ logoUrl: LOGO });

      for (const logoUrl of ['http://cdn.example.com/logo.png', '', '   ']) {
        expect(errorOf(await patch(created.id, { logoUrl }).expect(422)).code).toBe('VALIDATION_ERROR');
      }
      expect((await detail(created.id)).logoUrl).toBe(LOGO);
    });

    it('is held by the database too: a row cannot keep a link that is not https, has a space or is over 500 characters', async () => {
      const created = await make();
      const write = async (logoUrl: string) =>
        ctx.sql.query(`UPDATE applications SET logo_url = $2 WHERE id = $1`, [created.id, logoUrl]).then(
          () => null,
          (error: { code?: string }) => error.code ?? 'error',
        );

      expect(await write('http://cdn.example.com/logo.png')).toBe('23514');
      expect(await write('https://cdn.example.com/a b.png')).toBe('23514');
      expect(await write(`https://cdn.example.com/${'a'.repeat(480)}`)).toBe('23514');
      expect(await write(LOGO)).toBeNull();
    });
  });
});
