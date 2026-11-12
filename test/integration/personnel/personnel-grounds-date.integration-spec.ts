import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { OffboardingHarness } from '../../support/offboarding-harness';

const h = new OffboardingHarness();

/**
 * A basis cannot be issued after today in the organization (Owner, 06/11/2026): every operation that takes one refuses it with 422
 * `PERSONNEL.GROUNDS_ISSUED_ON_FUTURE` before it does any work. The ids below do not exist on purpose: a refusal that comes before the
 * lookup is the proof that nothing was read or saved, and the same bodies with today as the day pass the check and are refused as 404.
 */
describe('the day a basis was issued (integration, real PostgreSQL)', () => {
  const id = randomUUID();

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const grounds = (issuedOn: string) => ({ ...h.grounds, issuedOn });
  const OPERATIONS: Array<[string, string, string, (issuedOn: string) => object]> = [
    [
      'personnelNoticeRecord',
      'post',
      `/personnel-notices/${id}/recording`,
      (day) => ({
        verification: { method: 'ATTACHED_DOCUMENT', reference: 'Resignation letter DN-31/2026' },
        grounds: grounds(day),
        event: { lastWorkingDay: h.day(10), accessBlockMode: 'WITH_LAST_DAY' },
      }),
    ],
  ];

  it.each(OPERATIONS)(
    '%s refuses a basis issued tomorrow with 422, before any work',
    async (_op, _method, path, body) => {
      const tomorrow = addDays(h.today(), 1);

      const response = await request(h.server()).post(`/api/v1${path}`).set(h.as(h.sa)).send(body(tomorrow));

      expect(response.status).toBe(422);
      expect(h.codeOf(response)).toBe('PERSONNEL.GROUNDS_ISSUED_ON_FUTURE');
      expect(h.detailsOf(response)).toEqual({ today: h.today() });
    },
  );

  it.each(OPERATIONS)('%s lets a basis issued today through the check', async (_op, _method, path, body) => {
    const response = await request(h.server()).post(`/api/v1${path}`).set(h.as(h.sa)).send(body(h.today()));

    expect([response.status, h.codeOf(response)]).not.toEqual([422, 'PERSONNEL.GROUNDS_ISSUED_ON_FUTURE']);
  });
});
