import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';

describe('the additional vendor usage sources', () => {
  const sources = fixture.usageSources.filter((source) => ['adobe', 'hubspot', 'notion'].includes(source.key));
  it('adds exactly the three sources and preserves the original rules decisions', () => {
    expect(fixture.usageSources).toHaveLength(6);
    expect(sources.map((source) => source.key)).toEqual(['adobe', 'hubspot', 'notion']);
    expect(fixture.ghostDecisions).toHaveLength(4);
    for (const source of sources)
      expect(source).toMatchObject({ windowFromDaysAgo: 120, windowToDaysAgo: 1, notice: 'CONFIRMED_DELIVERED' });
  });
  it('reports only baseline holders who still hold a seat after returns', () => {
    for (const source of sources) {
      for (const row of source.rows) {
        const person = fixture.people.find((person) => `${person.email}@${fixture.emailDomain}` === row.identifier)!;
        expect(person).toBeDefined();
        expect(
          fixture.seats.some(
            (seat) =>
              seat.holder === person.code &&
              fixture.subscriptions.some(
                (subscription) =>
                  subscription.key === seat.subscription &&
                  fixture.applications.some(
                    (app) => app.key === source.application && app.plans.some((plan) => plan.key === subscription.plan),
                  ),
              ),
          ),
        ).toBe(true);
        expect(['DES', 'MKT']).not.toContain(person.department);
        expect(['NV-DEV1', 'NV-DEV2', 'NV-DEV3', 'NV-DEV4', 'NV-DEV6']).not.toContain(person.code);
      }
    }
  });
  it('creates the intended inactive seats and leaves BOD6 and SAL4 absent for G3', () => {
    const email = (code: string) =>
      `${fixture.people.find((person) => person.code === code)!.email}@${fixture.emailDomain}`;
    expect(
      sources.find((source) => source.key === 'adobe')!.rows.find((row) => row.identifier === email('NV-BOD5'))!
        .lastActivityDaysAgo,
    ).toBe(76);
    expect(
      sources.find((source) => source.key === 'notion')!.rows.find((row) => row.identifier === email('NV-BOD3'))!
        .lastActivityDaysAgo,
    ).toBe(96);
    for (const source of sources)
      expect(source.rows.some((row) => [email('NV-BOD6'), email('NV-SAL4')].includes(row.identifier))).toBe(false);
    expect(sources.some((source) => ['zoom', 'skype'].includes(source.application))).toBe(false);
  });
});
