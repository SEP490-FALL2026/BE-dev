import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';

interface ApplicationWire {
  id: string;
  name: string;
  kind: string;
  vendor: { id: string; name: string } | null;
  dictionaryServiceLineId: string | null;
  domains: string[];
  dataSensitivity: string;
  businessOwner: { employeeId: string; employeeCode: string; fullName: string; status: string };
  communication: {
    personToPersonMessaging: boolean;
    callsOrMeetings: boolean;
    mailbox: boolean;
    isCommunicationService: boolean;
    note: string | null;
  };
  usageCollectionDefault: string | null;
  functionalGroup: { id: string; name: string } | null;
  status: string;
  proposedToDictionary?: boolean;
  similarApplications?: { id: string; name: string }[];
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const omit = (source: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));

describe('the application catalog over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let owner: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
    owner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const base = (extra: object = {}) => ({
    name: unique('App'),
    kind: 'SAAS',
    vendorName: unique('Vendor'),
    dataSensitivity: 'MEDIUM',
    businessOwnerEmployeeId: owner,
    communication: NO,
    ...extra,
  });
  const create = (body: object, account: ApiAccount = it1) =>
    request(server()).post('/api/v1/applications').set(as(account)).send(body);
  const patch = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).patch(`/api/v1/applications/${id}`).set(as(account)).send(body);
  const get = (id: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/applications/${id}`).set(as(account));
  const app = async (extra: object = {}): Promise<ApplicationWire> =>
    dataOf<ApplicationWire>(await create(base(extra)).expect(201));
  const dictionary = async (groupName: string, lineName: string) => {
    const group = dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/vendor-dictionary/groups')
        .set(as(it1))
        .send({ name: groupName })
        .expect(201),
    );
    const line = dataOf<{ id: string }>(
      await request(server())
        .post(`/api/v1/vendor-dictionary/groups/${group.id}/service-lines`)
        .set(as(it1))
        .send({ name: lineName })
        .expect(201),
    );

    return { groupId: group.id, lineId: line.id };
  };
  const functionalGroup = async (name = unique('Group')): Promise<{ id: string; name: string }> =>
    dataOf<{ id: string; name: string }>(
      await request(server()).post('/api/v1/functional-groups').set(as(it1)).send({ name }).expect(201),
    );
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const counts = async () => ({
    applications: await n('applications'),
    vendors: await n('vendors'),
    proposals: await n('vendor_dictionary_proposals'),
  });
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;
  const terminated = async (): Promise<string> => {
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, {
      code: unique('E-GONE'),
      email: `gone${counter}@acme.vn`,
    });
    await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employeeId]);

    return employeeId;
  };

  describe('declaring an application (US-04-01)', () => {
    it('AC-1: Figma with a dictionary line, a working Business Owner and three "no" is stored without the flag, vendor made once, all audited', async () => {
      const { groupId, lineId } = await dictionary('Figma Inc', 'Figma');

      const created = dataOf<ApplicationWire>(
        await create({
          name: 'Figma',
          kind: 'SAAS',
          dictionaryServiceLineId: lineId,
          dataSensitivity: 'MEDIUM',
          businessOwnerEmployeeId: owner,
          communication: NO,
          domains: ['WWW.figma.com'],
        }).expect(201),
      );

      expect(created).toMatchObject({
        name: 'Figma',
        kind: 'SAAS',
        vendor: { name: 'Figma Inc' },
        dictionaryServiceLineId: lineId,
        domains: ['figma.com'],
        dataSensitivity: 'MEDIUM',
        businessOwner: { employeeId: owner, employeeCode: 'E-OWN', status: 'ACTIVE' },
        communication: { ...NO, isCommunicationService: false, note: null },
        usageCollectionDefault: null,
        functionalGroup: null,
        status: 'APPROVED',
        proposedToDictionary: false,
      });
      const vendors = await ctx.sql.query<{ id: string; dictionary_group_id: string }>(
        `SELECT id, dictionary_group_id FROM vendors WHERE name = 'Figma Inc'`,
      );
      expect(vendors.rows).toEqual([{ id: created.vendor?.id, dictionary_group_id: groupId }]);
      expect(await auditOf(created.id)).toEqual([
        expect.objectContaining({ action: 'APPLICATION.CREATED', before: null, actor_roles: ['IT_ADMIN'] }),
      ]);
      expect((await auditOf(created.vendor?.id ?? '')).map((event) => event.action)).toEqual(['VENDOR.CREATED']);
      expect(dataOf<ApplicationWire>(await get(created.id).expect(200))).toMatchObject({
        id: created.id,
        name: 'Figma',
      });
    });

    it('AC-2: a "yes" to any one question marks a communication service, collected by default for nothing', async () => {
      for (const answers of [
        { personToPersonMessaging: true, callsOrMeetings: false, mailbox: false },
        { personToPersonMessaging: false, callsOrMeetings: true, mailbox: false },
        { personToPersonMessaging: false, callsOrMeetings: false, mailbox: true },
      ]) {
        const created = await app({ communication: answers });

        expect(created.communication).toMatchObject({ ...answers, isCommunicationService: true });
        expect(created.usageCollectionDefault).toBe('NOT_COLLECTED');
      }
    });

    it('AC-3: a note that mentions ticket comments, with three "no", does not make a communication service', async () => {
      const created = await app({ communication: { ...NO, note: '  có bình luận   trên ticket ' } });

      expect(created.communication).toMatchObject({ isCommunicationService: false, note: 'có bình luận trên ticket' });
      expect(created.usageCollectionDefault).toBeNull();
    });

    it('AC-4: refuses a missing, unknown or departed Business Owner, for a catalogued and for an internal application, storing nothing', async () => {
      const before = await counts();
      const withoutOwner = omit(base(), 'businessOwnerEmployeeId');

      expect(codeOf(await create(withoutOwner).expect(422))).toBe('VALIDATION_ERROR');
      expect(codeOf(await create(base({ businessOwnerEmployeeId: randomUUID() })).expect(422))).toBe(
        'APPLICATION.BUSINESS_OWNER_INVALID',
      );
      expect(codeOf(await create(base({ businessOwnerEmployeeId: await terminated() })).expect(422))).toBe(
        'APPLICATION.BUSINESS_OWNER_INVALID',
      );
      expect(
        codeOf(
          await create(
            base({ kind: 'INTERNAL', vendorName: undefined, businessOwnerEmployeeId: await terminated() }),
          ).expect(422),
        ),
      ).toBe('APPLICATION.BUSINESS_OWNER_INVALID');

      expect(await counts()).toEqual(before);
    });

    it('AC-4: a Business Owner who leaves while the application is being declared does not get through', async () => {
      const { employeeId } = await insertEmployeeFixture(ctx.app, seed, {
        code: unique('E-LEAVING'),
        email: `leaving${counter}@acme.vn`,
      });
      const before = await counts();
      await ctx.sql.query('BEGIN');
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employeeId]);

      const pending = create(base({ businessOwnerEmployeeId: employeeId })).then((response) => response);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await ctx.sql.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('APPLICATION.BUSINESS_OWNER_INVALID');
      expect(await counts()).toEqual(before);
    });

    it('AC-5: software outside the dictionary is stored and proposes itself to the dictionary, once', async () => {
      const name = unique('Software X');

      const created = dataOf<ApplicationWire>(await create(base({ name, domains: ['x.example.com'] })).expect(201));

      expect(created.proposedToDictionary).toBe(true);
      expect(created.dictionaryServiceLineId).toBeNull();
      const proposals = await ctx.sql.query<{
        proposed_name: string;
        status: string;
        source_application_id: string;
        proposed_domains: string[];
      }>(
        `SELECT proposed_name, status, source_application_id, proposed_domains FROM vendor_dictionary_proposals
          WHERE normalized_name = $1`,
        [name.toLowerCase()],
      );
      expect(proposals.rows).toEqual([
        {
          proposed_name: name,
          status: 'PENDING',
          source_application_id: created.id,
          proposed_domains: ['x.example.com'],
        },
      ]);

      // Another vendor's application of the same name does not raise a second open proposal.
      await create(base({ name: name.toUpperCase() })).expect(201);
      const after = await ctx.sql.query(`SELECT 1 FROM vendor_dictionary_proposals WHERE normalized_name = $1`, [
        name.toLowerCase(),
      ]);
      expect(after.rowCount).toBe(1);
    });

    it('AC-6: Finance, an employee and the Super Admin cannot declare or change an application: 403 and the catalog is unchanged', async () => {
      const existing = await app();
      const before = await counts();

      for (const account of [finance, employee]) {
        await create(base(), account).expect(403);
        await patch(existing.id, { name: unique('Renamed') }, account).expect(403);
      }
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };
      await request(server()).post('/api/v1/applications').set(asSuperAdmin).send(base()).expect(403);
      await request(server())
        .patch(`/api/v1/applications/${existing.id}`)
        .set(asSuperAdmin)
        .send({ name: 'x' })
        .expect(403);

      expect(await counts()).toEqual(before);
      expect(dataOf<ApplicationWire>(await get(existing.id).expect(200)).name).toBe(existing.name);
    });

    it('lets Finance read the catalog and turns an employee away from reading it', async () => {
      const existing = await app();

      await get(existing.id, finance).expect(200);
      await request(server()).get('/api/v1/applications').set(as(finance)).expect(200);
      await get(existing.id, employee).expect(403);
      await request(server()).get('/api/v1/applications').set(as(employee)).expect(403);
    });

    it('AC-7: an application in a functional group shows the other applications of that group as similar tools', async () => {
      const design = await functionalGroup('Thiết kế giao diện');
      const figma = await app({ name: 'Figma Design', functionalGroupId: design.id });
      const sketch = await app({ name: 'Sketch', functionalGroupId: design.id });
      await app({ name: 'Unrelated tool' });

      expect(figma.functionalGroup).toEqual({ id: design.id, name: 'Thiết kế giao diện' });
      expect(dataOf<ApplicationWire>(await get(sketch.id).expect(200)).similarApplications).toEqual([
        { id: figma.id, name: 'Figma Design' },
      ]);
      expect(dataOf<ApplicationWire>(await get(figma.id).expect(200)).similarApplications).toEqual([
        { id: sketch.id, name: 'Sketch' },
      ]);
      const listed = dataOf<{ items: ApplicationWire[] }>(
        await request(server())
          .get('/api/v1/applications')
          .query({ functionalGroupId: design.id })
          .set(as(it1))
          .expect(200),
      );
      expect(listed.items.map((item) => item.name)).toEqual(['Figma Design', 'Sketch']);
    });

    it('AC-7: refuses a functional group that does not exist or is not active', async () => {
      const off = await functionalGroup();
      await request(server())
        .patch(`/api/v1/functional-groups/${off.id}`)
        .set(as(it1))
        .send({ status: 'INACTIVE' })
        .expect(200);
      const before = await counts();

      expect(codeOf(await create(base({ functionalGroupId: off.id })).expect(422))).toBe(
        'APPLICATION.FUNCTIONAL_GROUP_INVALID',
      );
      expect(codeOf(await create(base({ functionalGroupId: randomUUID() })).expect(422))).toBe(
        'APPLICATION.FUNCTIONAL_GROUP_INVALID',
      );
      expect(await counts()).toEqual(before);
    });

    it('AC-10: registers an internal application with no vendor, no proposal and no approver step', async () => {
      const before = await counts();

      const created = dataOf<ApplicationWire>(
        await create({
          name: unique('Cổng báo cáo nội bộ'),
          kind: 'INTERNAL',
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: owner,
          communication: NO,
        }).expect(201),
      );

      expect(created).toMatchObject({
        kind: 'INTERNAL',
        vendor: null,
        status: 'APPROVED',
        proposedToDictionary: false,
      });
      expect(await counts()).toEqual({ ...before, applications: before.applications + 1 });
      expect((await auditOf(created.id)).map((event) => event.action)).toEqual(['APPLICATION.CREATED']);
    });

    it('AC-10: refuses a vendor or a dictionary line for an internal application, and a second one of the same name', async () => {
      const name = unique('Portal');
      const body = {
        name,
        kind: 'INTERNAL',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: owner,
        communication: NO,
      };
      await create(body).expect(201);

      expect(codeOf(await create({ ...body, name: unique('P2'), vendorName: 'Acme' }).expect(422))).toBe(
        'APPLICATION.INTERNAL_HAS_NO_VENDOR',
      );
      expect(
        codeOf(await create({ ...body, name: unique('P3'), dictionaryServiceLineId: randomUUID() }).expect(422)),
      ).toBe('APPLICATION.INTERNAL_HAS_NO_VENDOR');
      expect(codeOf(await create({ ...body, name: name.toUpperCase() }).expect(409))).toBe('APPLICATION.NAME_TAKEN');
    });

    it('AC-12: free external software is refused whole: 422, and no application, vendor or proposal appears', async () => {
      const before = await counts();

      const response = await create(base({ kind: 'FREE_EXTERNAL', name: 'Photo editor (Free plan)' })).expect(422);

      expect(codeOf(response)).toBe('APPLICATION.KIND_NOT_MANAGED');
      expect(await counts()).toEqual(before);
    });

    it('AC-13: licensed software is stored without any plan or subscription', async () => {
      const created = await app({ kind: 'LICENSED', name: 'Office 2021', vendorName: unique('Microsoft Corporation') });

      expect(created).toMatchObject({ kind: 'LICENSED', status: 'APPROVED' });
    });

    it('needs a vendor for a SaaS or licensed application, from exactly one source', async () => {
      const withoutVendor = omit(base(), 'vendorName');

      expect(codeOf(await create(withoutVendor).expect(422))).toBe('APPLICATION.VENDOR_REQUIRED');
      expect(codeOf(await create(base({ dictionaryServiceLineId: randomUUID() })).expect(422))).toBe(
        'APPLICATION.VENDOR_SOURCE_AMBIGUOUS',
      );
      expect(
        codeOf(await create(base({ dictionaryServiceLineId: randomUUID(), vendorName: undefined })).expect(422)),
      ).toBe('APPLICATION.DICTIONARY_LINE_NOT_FOUND');
      expect(codeOf(await create(base({ vendorName: '   ' })).expect(422))).toBe('APPLICATION.VENDOR_NAME_INVALID');
    });
  });

  describe('names, vendors and one dictionary line per application', () => {
    it('refuses a name already used by the same vendor (case, accents, spacing) and allows it for another vendor', async () => {
      const vendorName = unique('Name vendor');
      await create(base({ name: 'Notion', vendorName })).expect(201);

      expect(codeOf(await create(base({ name: ' NOTION ', vendorName: vendorName.toUpperCase() })).expect(409))).toBe(
        'APPLICATION.NAME_TAKEN',
      );
      await create(base({ name: 'Notion', vendorName: unique('Other vendor') })).expect(201);
    });

    it('makes the vendor once for two applications, however its name is spelled', async () => {
      const vendorName = unique('Shared Vendor Ltd');
      const first = await app({ vendorName });
      const second = await app({ vendorName: ` ${vendorName.toUpperCase()}` });

      expect(second.vendor?.id).toBe(first.vendor?.id);
      expect(
        (await ctx.sql.query(`SELECT 1 FROM vendors WHERE normalized_name = $1`, [vendorName.toLowerCase()])).rowCount,
      ).toBe(1);
    });

    it('lets exactly one of two simultaneous applications of the same name succeed', async () => {
      const body = base();

      const results = await Promise.all([create(body), create(body)]);

      expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    });

    it('creates only one vendor when two applications name the same new vendor at once', async () => {
      const vendorName = unique('Concurrent Vendor');

      const results = await Promise.all([create(base({ vendorName })), create(base({ vendorName }))]);

      expect(results.map((response) => response.status)).toEqual([201, 201]);
      expect(
        (await ctx.sql.query(`SELECT 1 FROM vendors WHERE normalized_name = $1`, [vendorName.toLowerCase()])).rowCount,
      ).toBe(1);
    });

    it('US-04-07 AC-6: a dictionary line belongs to one application only; it is free again once detached', async () => {
      const { lineId, groupId } = await dictionary(unique('Line vendor'), unique('Line one'));
      const second = await dictionary(unique('Line vendor two'), unique('Line two'));
      const holder = dataOf<ApplicationWire>(
        await create(base({ vendorName: undefined, dictionaryServiceLineId: lineId })).expect(201),
      );
      const before = await counts();

      expect(codeOf(await create(base({ vendorName: undefined, dictionaryServiceLineId: lineId })).expect(409))).toBe(
        'APPLICATION.DICTIONARY_LINE_TAKEN',
      );
      expect((await counts()).applications).toBe(before.applications);
      expect(holder.vendor).not.toBeNull();

      // A second application of the same vendor group, on another line of that group, may not take the line either.
      const sibling = dataOf<{ id: string }>(
        await request(server())
          .post(`/api/v1/vendor-dictionary/groups/${groupId}/service-lines`)
          .set(as(it1))
          .send({ name: unique('Sibling line') })
          .expect(201),
      );
      const other = dataOf<ApplicationWire>(
        await create(base({ vendorName: undefined, dictionaryServiceLineId: sibling.id })).expect(201),
      );
      expect(codeOf(await patch(other.id, { dictionaryServiceLineId: lineId }).expect(409))).toBe(
        'APPLICATION.DICTIONARY_LINE_TAKEN',
      );

      await patch(holder.id, { dictionaryServiceLineId: null }).expect(200);
      expect(
        dataOf<ApplicationWire>(await patch(other.id, { dictionaryServiceLineId: lineId }).expect(200)),
      ).toMatchObject({
        dictionaryServiceLineId: lineId,
      });
      expect(second.lineId).toBeDefined();
    });

    it('US-04-07 AC-6: refuses a line of another vendor group for an application whose vendor already has a group', async () => {
      const mine = await dictionary(unique('Grouped vendor'), unique('Mine'));
      const other = await dictionary(unique('Foreign vendor'), unique('Theirs'));
      const created = dataOf<ApplicationWire>(
        await create(base({ vendorName: undefined, dictionaryServiceLineId: mine.lineId })).expect(201),
      );

      expect(codeOf(await patch(created.id, { dictionaryServiceLineId: other.lineId }).expect(422))).toBe(
        'APPLICATION.DICTIONARY_LINE_MISMATCH',
      );
      expect(codeOf(await patch(created.id, { dictionaryServiceLineId: randomUUID() }).expect(422))).toBe(
        'APPLICATION.DICTIONARY_LINE_NOT_FOUND',
      );
    });

    it('lets a free-text vendor take the dictionary group of a line it is attached to, and refuses a group another vendor holds', async () => {
      const free = await app({ vendorName: unique('Zoom Video Communications') });
      const { lineId } = await dictionary(unique('Zoom'), unique('Zoom Workplace'));

      const linked = dataOf<ApplicationWire>(await patch(free.id, { dictionaryServiceLineId: lineId }).expect(200));
      expect(linked.dictionaryServiceLineId).toBe(lineId);
      const group = await ctx.sql.query<{ dictionary_group_id: string | null }>(
        `SELECT dictionary_group_id FROM vendors WHERE id = $1`,
        [free.vendor?.id],
      );
      expect(group.rows[0].dictionary_group_id).not.toBeNull();

      const another = await app({ vendorName: unique('Another vendor') });
      expect(codeOf(await patch(another.id, { dictionaryServiceLineId: lineId }).expect(422))).toBe(
        'APPLICATION.DICTIONARY_LINE_MISMATCH',
      );
    });
  });

  describe('changing and reading', () => {
    it('updates the name, sensitivity, domains, owner, one answer and the note, auditing before and after', async () => {
      const created = await app({ domains: ['a.example.com'] });
      const newOwner = (
        await insertEmployeeFixture(ctx.app, seed, { code: unique('E-NEW'), email: `new${counter}@acme.vn` })
      ).employeeId;
      const group = await functionalGroup();

      const updated = dataOf<ApplicationWire>(
        await patch(created.id, {
          name: unique('Renamed'),
          dataSensitivity: 'HIGH',
          domains: ['https://B.example.com/x', 'a.example.com'],
          businessOwnerEmployeeId: newOwner,
          communication: { mailbox: true, note: 'shared mailbox' },
          functionalGroupId: group.id,
        }).expect(200),
      );

      expect(updated).toMatchObject({
        dataSensitivity: 'HIGH',
        domains: ['b.example.com', 'a.example.com'],
        businessOwner: { employeeId: newOwner },
        communication: { mailbox: true, isCommunicationService: true, note: 'shared mailbox' },
        usageCollectionDefault: 'NOT_COLLECTED',
        functionalGroup: { id: group.id },
      });
      const events = await auditOf(created.id);
      expect(events.map((event) => event.action)).toEqual(['APPLICATION.CREATED', 'APPLICATION.UPDATED']);
      expect(events[1]).toMatchObject({
        before: { dataSensitivity: 'MEDIUM', isCommunicationService: false },
        after: { dataSensitivity: 'HIGH', isCommunicationService: true },
      });

      await patch(created.id, { functionalGroupId: null, communication: { mailbox: false } }).expect(200);
      const cleared = dataOf<ApplicationWire>(await get(created.id).expect(200));
      expect(cleared.functionalGroup).toBeNull();
      expect(cleared.communication.isCommunicationService).toBe(false);
    });

    it('answers 200 and records nothing for an update that changes nothing', async () => {
      const created = await app({ domains: ['same.example.com'] });

      await patch(created.id, { name: ` ${created.name}  `, domains: ['same.example.com'] }).expect(200);

      expect((await auditOf(created.id)).map((event) => event.action)).toEqual(['APPLICATION.CREATED']);
    });

    it('refuses a departed Business Owner on update, an empty update, a missing application, and the fields that cannot change', async () => {
      const created = await app();

      expect(codeOf(await patch(created.id, { businessOwnerEmployeeId: await terminated() }).expect(422))).toBe(
        'APPLICATION.BUSINESS_OWNER_INVALID',
      );
      expect(codeOf(await patch(created.id, {}).expect(422))).toBe('APPLICATION.UPDATE_EMPTY');
      expect(codeOf(await patch(randomUUID(), { name: 'x' }).expect(404))).toBe('APPLICATION.NOT_FOUND');
      expect(codeOf(await get(randomUUID()).expect(404))).toBe('APPLICATION.NOT_FOUND');
      expect(codeOf(await patch(created.id, { kind: 'INTERNAL' }).expect(422))).toBe('VALIDATION_ERROR');
      expect(codeOf(await patch(created.id, { vendorName: 'Other' }).expect(422))).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an empty name', { name: '   ' }, 'APPLICATION.NAME_INVALID'],
      ['a name over 200 characters', { name: 'N'.repeat(201) }, 'APPLICATION.NAME_INVALID'],
      ['a domain that is not a host', { domains: ['not a host'] }, 'APPLICATION.DOMAIN_INVALID'],
      [
        'more than twenty domains',
        { domains: Array.from({ length: 21 }, (_, index) => `d${index}.example.com`) },
        'APPLICATION.TOO_MANY_DOMAINS',
      ],
      ['a note over 1000 characters', { communication: { ...NO, note: 'n'.repeat(1001) } }, 'APPLICATION.NOTE_INVALID'],
    ])('refuses a declaration with %s: 422 %s and nothing stored', async (_name, extra, code) => {
      const before = await counts();

      expect(codeOf(await create(base(extra)).expect(422))).toBe(code);
      expect(await counts()).toEqual(before);
    });

    it('lists the catalog by name with a search over names and vendors, a kind and a status filter, in pages', async () => {
      const tag = unique('Catalogue').replace(/ /g, '-');
      const vendorName = `${tag} Vendor`;
      await app({ name: `${tag} Beta`, vendorName });
      await app({ name: `${tag} Alpha`, vendorName });
      await create({
        name: `${tag} Internal`,
        kind: 'INTERNAL',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: owner,
        communication: NO,
      }).expect(201);

      const found = dataOf<{ items: ApplicationWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/applications').query({ search: tag }).set(as(it1)).expect(200),
      );
      expect(found.items.map((item) => item.name)).toEqual([`${tag} Alpha`, `${tag} Beta`, `${tag} Internal`]);
      expect(found.pagination.totalItems).toBe(3);

      const byVendor = dataOf<{ items: ApplicationWire[] }>(
        await request(server())
          .get('/api/v1/applications')
          .query({ search: `${tag} vendor` })
          .set(as(it1))
          .expect(200),
      );
      expect(byVendor.items.map((item) => item.name)).toEqual([`${tag} Alpha`, `${tag} Beta`]);
      const internal = dataOf<{ items: ApplicationWire[] }>(
        await request(server())
          .get('/api/v1/applications')
          .query({ search: tag, kind: 'INTERNAL', status: 'APPROVED' })
          .set(as(it1))
          .expect(200),
      );
      expect(internal.items.map((item) => item.name)).toEqual([`${tag} Internal`]);
      const paged = dataOf<{ items: ApplicationWire[] }>(
        await request(server())
          .get('/api/v1/applications')
          .query({ search: tag, page: 2, pageSize: 2 })
          .set(as(it1))
          .expect(200),
      );
      expect(paged.items.map((item) => item.name)).toEqual([`${tag} Internal`]);
    });

    it('rolls the application back with its vendor and audit when any part of the transaction fails', async () => {
      const before = await counts();
      const { lineId } = await dictionary(unique('Taken vendor'), unique('Taken line'));
      await create(base({ vendorName: undefined, dictionaryServiceLineId: lineId })).expect(201);
      const afterFirst = await counts();

      await create(base({ vendorName: undefined, dictionaryServiceLineId: lineId })).expect(409);

      expect(afterFirst.applications).toBe(before.applications + 1);
      expect(await counts()).toEqual(afterFirst);
    });
  });
});
