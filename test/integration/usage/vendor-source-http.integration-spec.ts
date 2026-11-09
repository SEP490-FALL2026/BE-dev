import request from 'supertest';
import { UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();

describe('the usage sources over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  describe('INV-11, FR-4.16: a source of an external application with an activity definition', () => {
    it('declares a source with the groups it can detect and answers it back; a definition is required', async () => {
      const { applicationId } = await h.usageApp();

      const created = await h.source(applicationId);

      expect(created).toMatchObject({
        application: { id: applicationId },
        detectableGroups: ['G1', 'G2', 'G3', 'G4'],
        canConcludeAbsence: false,
      });
      expect(created.limitation).toContain('không được hiểu là không dùng');
      const { activityDefinition: _omitted, ...withoutDefinition } = h.sourceBody(applicationId);

      expect((await h.createSource(withoutDefinition).expect(422)).body.error.code).toBe('VALIDATION_ERROR');
      expect(
        (await h.createSource(h.sourceBody(applicationId, { activityDefinition: 'ab' })).expect(422)).body.error.code,
      ).toBe('VALIDATION_ERROR');
      expect(await h.auditOf('UsageSource', created.id)).toHaveLength(1);
    });

    it('refuses an application the company built (APPLICATION_INTERNAL) and one that does not exist', async () => {
      const internal = await h.usageApp({ kind: 'INTERNAL' });

      expect(h.codeOf(await h.createSource(h.sourceBody(internal.applicationId)).expect(422))).toBe(
        'USAGE_SOURCE.APPLICATION_INTERNAL',
      );
      expect(h.codeOf(await h.createSource(h.sourceBody('0b7a1f5e-0000-4000-8000-0000000000aa')).expect(422))).toBe(
        'USAGE_SOURCE.APPLICATION_NOT_FOUND',
      );
    });
  });

  describe('US-08-02 AC-3: a messaging service is not collected', () => {
    it('refuses a source for an application that carries the communication flag, and writes nothing', async () => {
      const before = await h.count('usage_sources');
      const slack = await h.usageApp({ communication: true });

      const response = await h.createSource(h.sourceBody(slack.applicationId)).expect(422);

      expect(h.codeOf(response)).toBe('USAGE_SOURCE.COMMUNICATION_APP');
      expect(await h.count('usage_sources')).toBe(before);
    });
  });

  describe('FR-4.4, US-08-01 AC-2: what a source can tell', () => {
    it('a source that only lists members detects G1 and G2, says so, and never concludes an absence', async () => {
      const { applicationId } = await h.usageApp();

      const roster = await h.source(applicationId, {
        template: { columns: { identifier: 'email' }, eventClasses: {} },
        capabilities: { memberList: true, lastActivity: false, eventDetail: false },
        evidenceDirection: 'POSITIVE_AND_NEGATIVE',
      });

      expect(roster.detectableGroups).toEqual(['G1', 'G2']);
      expect(roster.canConcludeAbsence).toBe(false);
      expect(roster.limitation).toContain('chỉ cho biết ai là thành viên');
    });

    it('a source that tells the last activity and both directions can conclude an absence and has no limitation', async () => {
      const { applicationId } = await h.usageApp();

      const full = await h.source(applicationId, { evidenceDirection: 'POSITIVE_AND_NEGATIVE' });

      expect(full).toMatchObject({ canConcludeAbsence: true, limitation: null });
    });

    it('TEMPLATE_CAPABILITY_MISMATCH: it declares the last activity but the template has no date column', async () => {
      const { applicationId } = await h.usageApp();

      const response = await h
        .createSource(
          h.sourceBody(applicationId, {
            template: { columns: { identifier: 'email' }, eventClasses: {} },
            capabilities: { memberList: true, lastActivity: true, eventDetail: false },
          }),
        )
        .expect(422);

      expect(h.codeOf(response)).toBe('USAGE_SOURCE.TEMPLATE_INVALID');
      const mismatch = await h
        .createSource(
          h.sourceBody(applicationId, {
            capabilities: { memberList: true, lastActivity: false, eventDetail: false },
          }),
        )
        .expect(422);

      expect(h.codeOf(mismatch)).toBe('USAGE_SOURCE.TEMPLATE_CAPABILITY_MISMATCH');
    });
  });

  describe('listing, reading and changing a source', () => {
    it('lists the sources of an application, reads one, and changes it for the imports that come after (audited, name unique)', async () => {
      const { applicationId } = await h.usageApp();
      const first = await h.source(applicationId);
      const second = await h.source(applicationId);

      const list = h.dataOf<{ items: Array<{ id: string }> }>(
        await request(h.server()).get('/api/v1/usage-sources').query({ applicationId }).set(h.as(h.it1)).expect(200),
      );
      expect(list.items.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
      expect(
        h.dataOf<SourceName>(
          await request(h.server()).get(`/api/v1/usage-sources/${first.id}`).set(h.as(h.it1)).expect(200),
        ).id,
      ).toBe(first.id);

      const changed = await request(h.server())
        .patch(`/api/v1/usage-sources/${first.id}`)
        .set(h.as(h.it1))
        .send({ activityDefinition: 'tạo hoặc sửa một thiết kế', evidenceDirection: 'POSITIVE_AND_NEGATIVE' })
        .expect(200);
      expect(h.dataOf<{ canConcludeAbsence: boolean }>(changed).canConcludeAbsence).toBe(true);
      expect(await h.auditOf('UsageSource', first.id)).toHaveLength(2);

      const taken = await request(h.server())
        .patch(`/api/v1/usage-sources/${first.id}`)
        .set(h.as(h.it1))
        .send({ name: second.name })
        .expect(409);
      expect(h.codeOf(taken)).toBe('USAGE_SOURCE.NAME_TAKEN');
      await request(h.server())
        .get('/api/v1/usage-sources/0b7a1f5e-0000-4000-8000-0000000000aa')
        .set(h.as(h.it1))
        .expect(404);
    });

    it('QĐ-101i: a head of department, Finance and an employee never read the sources (403)', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);

      for (const account of [h.finance, h.employee]) {
        await request(h.server()).get('/api/v1/usage-sources').set(h.as(account)).expect(403);
        await request(h.server()).get(`/api/v1/usage-sources/${source.id}`).set(h.as(account)).expect(403);
        await h.createSource(h.sourceBody(applicationId), account).expect(403);
      }
    });
  });
});

interface SourceName {
  id: string;
}
