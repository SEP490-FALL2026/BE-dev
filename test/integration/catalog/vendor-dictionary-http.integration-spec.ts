import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

interface LineWire {
  id: string;
  name: string;
  domains: string[];
  patterns: string[];
}

interface GroupWire {
  id: string;
  name: string;
  brandDomains: string[];
  serviceLines: LineWire[];
}

interface Candidate {
  serviceLineId: string;
  serviceLineName: string;
  groupId: string;
  groupName: string;
}

interface ErrorBody {
  error: { code: string };
}

describe('the vendor dictionary over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as ErrorBody).error.code;

  const createGroup = (body: object, headers: Record<string, string> = asIt()) =>
    request(server()).post('/api/v1/vendor-dictionary/groups').set(headers).send(body);
  const createLine = (groupId: string, body: object, headers: Record<string, string> = asIt()) =>
    request(server()).post(`/api/v1/vendor-dictionary/groups/${groupId}/service-lines`).set(headers).send(body);
  const group = async (name = unique('Vendor'), extra: object = {}): Promise<GroupWire> =>
    dataOf<GroupWire>(await createGroup({ name, ...extra }).expect(201));
  const line = async (groupId: string, name: string, extra: object = {}): Promise<LineWire> =>
    dataOf<LineWire>(await createLine(groupId, { name, ...extra }).expect(201));
  const suggest = async (name: string): Promise<Candidate[]> =>
    dataOf<{ candidates: Candidate[] }>(
      await request(server()).get('/api/v1/vendor-dictionary/suggestions').query({ name }).set(asIt()).expect(200),
    ).candidates;
  const normalize = async (kind: 'DOMAIN' | 'DESCRIPTION', value: string) =>
    dataOf<{ method: string | null; candidates: Candidate[] }>(
      await request(server())
        .post('/api/v1/vendor-dictionary/normalizations')
        .set(asIt())
        .send({ kind, value })
        .expect(200),
    );
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  describe('writing the dictionary', () => {
    it('creates a group with brand domains normalized, and records who did it', async () => {
      const created = await group('Figma Inc', {
        brandDomains: ['WWW.Figma.com', 'figma.com', 'https://figma.design/x'],
      });

      expect(created).toMatchObject({
        name: 'Figma Inc',
        brandDomains: ['figma.com', 'figma.design'],
        serviceLines: [],
      });
      expect(await auditOf(created.id)).toEqual([
        {
          action: 'VENDOR_GROUP.CREATED',
          before: null,
          after: { name: 'Figma Inc', brandDomains: ['figma.com', 'figma.design'] },
          actor_roles: ['IT_ADMIN'],
        },
      ]);
    });

    it('creates a service line with its domains and literal patterns', async () => {
      const g = await group(unique('Canva Pty'));

      const created = await line(g.id, 'Canva', { domains: ['canva.com'], patterns: ['  PayPal*Canva '] });

      expect(created).toMatchObject({ name: 'Canva', domains: ['canva.com'], patterns: ['PayPal*Canva'] });
      expect((await auditOf(created.id))[0]).toMatchObject({ action: 'VENDOR_SERVICE_LINE.CREATED' });
    });

    it('refuses a group whose name equals another once case, accents and spacing are ignored: 409, one row', async () => {
      const name = unique('Atlassian');
      await group(name);

      const response = await createGroup({ name: `  ${name.toUpperCase()}  ` }).expect(409);

      expect(codeOf(response)).toBe('VENDOR_DICTIONARY.GROUP_NAME_TAKEN');
      const rows = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM vendor_groups WHERE normalized_name = $1`,
        [name.toLowerCase()],
      );
      expect(rows.rows[0].n).toBe(1);
    });

    it('refuses a line name already used in the same group, and allows it in another group', async () => {
      const a = await group(unique('A'));
      const b = await group(unique('B'));
      await line(a.id, 'Teams');

      expect(codeOf(await createLine(a.id, { name: 'TEAMS' }).expect(409))).toBe(
        'VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN',
      );
      await createLine(b.id, { name: 'Teams' }).expect(201);
    });

    it('lets exactly one of two simultaneous groups with the same name succeed', async () => {
      const name = unique('Race');

      const results = await Promise.all([createGroup({ name }), createGroup({ name })]);

      expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    });

    it('updates a group and a line, audits before and after, and leaves a no-op update unaudited', async () => {
      const g = await group(unique('Zoom Video'), { brandDomains: ['zoom.us'] });
      const l = await line(g.id, 'Zoom Workplace', { domains: ['zoom.us'] });

      const renamed = await request(server())
        .patch(`/api/v1/vendor-dictionary/groups/${g.id}`)
        .set(asIt())
        .send({ brandDomains: ['zoom.us', 'zoom.com'] })
        .expect(200);
      await request(server())
        .patch(`/api/v1/vendor-dictionary/service-lines/${l.id}`)
        .set(asIt())
        .send({ patterns: ['ZOOM.US'] })
        .expect(200);
      await request(server())
        .patch(`/api/v1/vendor-dictionary/groups/${g.id}`)
        .set(asIt())
        .send({ brandDomains: ['zoom.us', 'zoom.com'] })
        .expect(200);

      expect(dataOf<GroupWire>(renamed).brandDomains).toEqual(['zoom.us', 'zoom.com']);
      const groupEvents = await auditOf(g.id);
      expect(groupEvents.map((event) => event.action)).toEqual(['VENDOR_GROUP.CREATED', 'VENDOR_GROUP.UPDATED']);
      expect(groupEvents[1]).toMatchObject({
        before: { name: g.name, brandDomains: ['zoom.us'] },
        after: { name: g.name, brandDomains: ['zoom.us', 'zoom.com'] },
      });
      expect((await auditOf(l.id)).map((event) => event.action)).toEqual([
        'VENDOR_SERVICE_LINE.CREATED',
        'VENDOR_SERVICE_LINE.UPDATED',
      ]);
    });

    it('answers 404 for a group or line that does not exist, and 422 for an empty update', async () => {
      const g = await group();

      expect(
        codeOf(
          await request(server())
            .patch(`/api/v1/vendor-dictionary/groups/${randomUUID()}`)
            .set(asIt())
            .send({ name: 'x' })
            .expect(404),
        ),
      ).toBe('VENDOR_DICTIONARY.GROUP_NOT_FOUND');
      expect(codeOf(await createLine(randomUUID(), { name: 'x' }).expect(404))).toBe(
        'VENDOR_DICTIONARY.GROUP_NOT_FOUND',
      );
      expect(
        codeOf(
          await request(server())
            .patch(`/api/v1/vendor-dictionary/service-lines/${randomUUID()}`)
            .set(asIt())
            .send({ name: 'x' })
            .expect(404),
        ),
      ).toBe('VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND');
      expect(
        codeOf(
          await request(server()).patch(`/api/v1/vendor-dictionary/groups/${g.id}`).set(asIt()).send({}).expect(422),
        ),
      ).toBe('VENDOR_DICTIONARY.UPDATE_EMPTY');
    });

    it.each([
      ['an empty name', { name: '   ' }, 'VENDOR_DICTIONARY.NAME_INVALID'],
      ['a name over 200 characters', { name: 'N'.repeat(201) }, 'VENDOR_DICTIONARY.NAME_INVALID'],
      ['a domain that is not a host', { name: 'D', brandDomains: ['not a host'] }, 'VENDOR_DICTIONARY.DOMAIN_INVALID'],
      [
        'more than twenty domains',
        { name: 'M', brandDomains: Array.from({ length: 21 }, (_, index) => `d${index}.example.com`) },
        'VENDOR_DICTIONARY.TOO_MANY_VALUES',
      ],
    ])('refuses a group with %s: 422 %s and nothing stored', async (_name, body, code) => {
      const before = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM vendor_groups')).rows[0].n;

      expect(codeOf(await createGroup(body).expect(422))).toBe(code);
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM vendor_groups')).rows[0].n).toBe(
        before,
      );
    });

    it('refuses a line with a pattern under three characters or over a hundred', async () => {
      const g = await group();

      expect(codeOf(await createLine(g.id, { name: 'P', patterns: ['ab'] }).expect(422))).toBe(
        'VENDOR_DICTIONARY.PATTERN_INVALID',
      );
      expect(codeOf(await createLine(g.id, { name: 'P', patterns: ['x'.repeat(101)] }).expect(422))).toBe(
        'VENDOR_DICTIONARY.PATTERN_INVALID',
      );
    });
  });

  describe('who may use it (AC-4)', () => {
    it.each([
      ['Finance', () => finance],
      ['an employee', () => employee],
    ])('turns %s away from reading and from writing: 403, dictionary unchanged', async (_name, who) => {
      const headers = { Authorization: `Bearer ${who().accessToken}` };
      const before = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM vendor_groups')).rows[0].n;

      await request(server()).get('/api/v1/vendor-dictionary/groups').set(headers).expect(403);
      await createGroup({ name: unique('Nope') }, headers).expect(403);

      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM vendor_groups')).rows[0].n).toBe(
        before,
      );
    });

    it('lists groups with their lines in name order, with a search and pages from one snapshot', async () => {
      const tag = unique('ListTag');
      const first = await group(`${tag} Beta`);
      await group(`${tag} Alpha`);
      await line(first.id, 'Beta One');

      const found = dataOf<{ items: GroupWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/vendor-dictionary/groups').query({ search: tag }).set(asIt()).expect(200),
      );
      expect(found.items.map((item) => item.name)).toEqual([`${tag} Alpha`, `${tag} Beta`]);
      expect(found.items[1].serviceLines.map((l) => l.name)).toEqual(['Beta One']);
      expect(found.pagination.totalItems).toBe(2);

      const paged = dataOf<{ items: GroupWire[] }>(
        await request(server())
          .get('/api/v1/vendor-dictionary/groups')
          .query({ search: tag, page: 2, pageSize: 1 })
          .set(asIt())
          .expect(200),
      );
      expect(paged.items.map((item) => item.name)).toEqual([`${tag} Beta`]);
    });
  });

  describe('recognising a vendor', () => {
    let figma: { group: GroupWire; line: LineWire };
    let azure: LineWire;
    let m365: LineWire;
    let microsoft: GroupWire;
    let canva: LineWire;

    beforeAll(async () => {
      const figmaGroup = await group('Figma Recognised');
      figma = {
        group: figmaGroup,
        line: await line(figmaGroup.id, 'Figma Recognised', { domains: ['figma-rec.com'] }),
      };
      microsoft = await group('Microsoft Recognised', { brandDomains: ['microsoft-rec.com'] });
      m365 = await line(microsoft.id, 'Microsoft Recognised 365', { domains: ['office-rec.com'] });
      azure = await line(microsoft.id, 'Azure Recognised', { domains: ['azure-rec.com'] });
      const canvaGroup = await group('Canva Recognised');
      canva = await line(canvaGroup.id, 'Canva Recognised', { patterns: ['PAYPAL*CANVAREC'] });
    });

    it('AC-1: a typed name suggests the line and its vendor, whatever the case or accents', async () => {
      for (const typed of ['figma recognised', '  FIGMA RECOGNISED ', 'Fígma Recognised']) {
        expect(await suggest(typed)).toEqual([
          {
            serviceLineId: figma.line.id,
            serviceLineName: 'Figma Recognised',
            groupId: figma.group.id,
            groupName: 'Figma Recognised',
          },
        ]);
      }
    });

    it('AC-5: a vendor with several lines offers every line and chooses none; the exact line name picks only itself', async () => {
      const offered = await suggest('Microsoft Recognised');
      expect(offered.map((candidate) => candidate.serviceLineName)).toEqual([
        'Azure Recognised',
        'Microsoft Recognised 365',
      ]);
      expect(offered.map((candidate) => candidate.groupId)).toEqual([microsoft.id, microsoft.id]);

      expect((await suggest('azure recognised')).map((candidate) => candidate.serviceLineId)).toEqual([azure.id]);
      expect(await suggest('no such vendor xyz')).toEqual([]);
    });

    it('AC-2: a host, with www, a URL, or a subdomain, is recognised by domain; a look-alike is not', async () => {
      for (const value of ['www.figma-rec.com', 'https://app.figma-rec.com/files?x=1', 'FIGMA-REC.COM:443']) {
        const result = await normalize('DOMAIN', value);
        expect(result.method).toBe('DOMAIN');
        expect(result.candidates.map((candidate) => candidate.serviceLineId)).toEqual([figma.line.id]);
      }
      expect(await normalize('DOMAIN', 'notfigma-rec.com')).toEqual({ method: null, candidates: [] });
      expect(await normalize('DOMAIN', 'PAYPAL*CANVAREC 1')).toEqual({ method: null, candidates: [] });
    });

    it('AC-2: a brand domain offers every line of the vendor, a line domain wins over it', async () => {
      const brand = await normalize('DOMAIN', 'www.microsoft-rec.com');
      expect(brand.method).toBe('DOMAIN');
      expect(brand.candidates.map((candidate) => candidate.serviceLineId).sort()).toEqual([azure.id, m365.id].sort());

      const direct = await normalize('DOMAIN', 'portal.azure-rec.com');
      expect(direct.candidates.map((candidate) => candidate.serviceLineId)).toEqual([azure.id]);
    });

    it('AC-3: a bank description containing a pattern is recognised by pattern, not read as an expression', async () => {
      const result = await normalize('DESCRIPTION', 'paypal*canvarec   123');

      expect(result.method).toBe('PATTERN');
      expect(result.candidates.map((candidate) => candidate.serviceLineId)).toEqual([canva.id]);
      expect(await normalize('DESCRIPTION', 'PAYPALXCANVAREC 123')).toEqual({ method: null, candidates: [] });
    });
  });

  describe('proposals to add a vendor', () => {
    const proposal = async (name: string): Promise<string> => {
      const id = randomUUID();
      await ctx.sql.query(
        `INSERT INTO vendor_dictionary_proposals (id, organization_id, proposed_name, normalized_name) VALUES ($1, $2, $3, $4)`,
        [id, seed.organizationId, name, name.toLowerCase()],
      );

      return id;
    };
    const resolve = (id: string, body: object) =>
      request(server()).post(`/api/v1/vendor-dictionary/proposals/${id}/resolutions`).set(asIt()).send(body);

    it('lists them by status, oldest first, and records a resolution with who made it', async () => {
      const tag = unique('Prop').toLowerCase();
      const first = await proposal(`${tag} one`);
      await proposal(`${tag} two`);
      const g = await group();
      const l = await line(g.id, unique('Line'));

      const resolved = await resolve(first, { outcome: 'ACCEPTED', serviceLineId: l.id }).expect(200);

      expect(dataOf<{ status: string; serviceLineId: string | null }>(resolved)).toMatchObject({
        status: 'ACCEPTED',
        serviceLineId: l.id,
      });
      const open = dataOf<{ items: { name: string; status: string }[] }>(
        await request(server())
          .get('/api/v1/vendor-dictionary/proposals')
          .query({ status: 'PENDING' })
          .set(asIt())
          .expect(200),
      );
      expect(open.items.map((item) => item.name)).toContain(`${tag} two`);
      expect(open.items.map((item) => item.name)).not.toContain(`${tag} one`);
      expect((await auditOf(first)).map((event) => event.action)).toEqual(['VENDOR_PROPOSAL.RESOLVED']);
    });

    it('refuses to resolve one twice, to accept without a line, to dismiss with a line, and for a missing line or proposal', async () => {
      const id = await proposal(unique('Once').toLowerCase());
      const g = await group();
      const l = await line(g.id, unique('Line'));

      expect(codeOf(await resolve(id, { outcome: 'ACCEPTED' }).expect(422))).toBe(
        'VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID',
      );
      expect(codeOf(await resolve(id, { outcome: 'DISMISSED', serviceLineId: l.id }).expect(422))).toBe(
        'VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID',
      );
      expect(codeOf(await resolve(id, { outcome: 'ACCEPTED', serviceLineId: randomUUID() }).expect(404))).toBe(
        'VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND',
      );
      await resolve(id, { outcome: 'DISMISSED' }).expect(200);
      expect(codeOf(await resolve(id, { outcome: 'DISMISSED' }).expect(409))).toBe(
        'VENDOR_DICTIONARY.PROPOSAL_ALREADY_RESOLVED',
      );
      expect(codeOf(await resolve(randomUUID(), { outcome: 'DISMISSED' }).expect(404))).toBe(
        'VENDOR_DICTIONARY.PROPOSAL_NOT_FOUND',
      );
    });

    it('lets exactly one of two simultaneous resolutions of the same proposal win', async () => {
      const id = await proposal(unique('Both').toLowerCase());

      const results = await Promise.all([resolve(id, { outcome: 'DISMISSED' }), resolve(id, { outcome: 'DISMISSED' })]);

      expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
      expect((await auditOf(id)).filter((event) => event.action === 'VENDOR_PROPOSAL.RESOLVED')).toHaveLength(1);
    });
  });
});
