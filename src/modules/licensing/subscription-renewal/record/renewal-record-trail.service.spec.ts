import { RenewalRecordTrail, type RecordedBy } from './renewal-record-trail.service';

describe('RenewalRecordTrail.told', () => {
  const tx = {} as never;
  const recorded = {
    id: 'ren-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    proposedChoice: 'REDUCE',
    proposedQuantity: 2,
    outcome: { kind: 'RENEWED_AS_PROPOSED', nextSubscriptionId: null },
  } as never;
  const period = {} as never;
  const adjustment = { end: '2026-12-31' } as never;
  const input = { outcome: 'RENEWED_AS_PROPOSED', nextQuantity: 2 } as never;

  function build(finance: string | null) {
    const tell = jest.fn(() => Promise.resolve());
    const parties = {
      financeOf: jest.fn(() => Promise.resolve(finance)),
      approverOf: jest.fn(() => Promise.resolve('approver')),
      itAdminOf: jest.fn(() => Promise.resolve('it-owner')),
    };
    const trail = new RenewalRecordTrail({} as never, parties as never, { tell } as never);

    return { trail, tell };
  }

  const recipientsOf = (tell: jest.Mock) =>
    (tell.mock.calls[0] as unknown as [unknown, { recipients: string[] }])[1].recipients;

  it('tells Finance, and the IT Admin responsible too when another IT Admin recorded the result for them', async () => {
    const { trail, tell } = build('finance');
    const who: RecordedBy = { substitute: true, responsibleItAdminEmployeeId: 'it-responsible' };

    await trail.told(tx, recorded, period, adjustment, who, input);

    expect(recipientsOf(tell)).toEqual(['finance', 'it-responsible']);
  });

  it('tells only Finance when the IT Admin responsible recorded the result themselves', async () => {
    const { trail, tell } = build('finance');
    const who: RecordedBy = { substitute: false, responsibleItAdminEmployeeId: 'it-responsible' };

    await trail.told(tx, recorded, period, adjustment, who, input);

    expect(recipientsOf(tell)).toEqual(['finance']);
  });

  it('tells the IT Admin responsible even when nobody is Finance, and nobody when there is none and no responsible one', async () => {
    const withResponsible = build(null);
    await withResponsible.trail.told(
      tx,
      recorded,
      period,
      adjustment,
      { substitute: true, responsibleItAdminEmployeeId: 'it-responsible' },
      input,
    );
    expect(recipientsOf(withResponsible.tell)).toEqual(['it-responsible']);

    const nobody = build(null);
    await nobody.trail.told(
      tx,
      recorded,
      period,
      adjustment,
      { substitute: true, responsibleItAdminEmployeeId: null },
      input,
    );
    expect(recipientsOf(nobody.tell)).toEqual([]);
  });
});
