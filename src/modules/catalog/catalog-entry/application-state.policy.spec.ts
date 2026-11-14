import { applicationChangesOf } from './application-state.policy';

const current = {
  name: 'Slack',
  domains: ['slack.com'],
  dataSensitivity: 'MEDIUM' as const,
  functionalGroup: { id: 'grp-1' } as { id: string } | null,
  dictionaryServiceLineId: 'line-1' as string | null,
};

describe('what an update of an application changes (US-04-01, US-04-02)', () => {
  it('changes nothing when the update gives nothing, or gives what the application already has', () => {
    expect(applicationChangesOf(current, {}, {})).toEqual({});
    expect(
      applicationChangesOf(
        current,
        {
          dataSensitivity: 'MEDIUM',
          functionalGroupId: 'grp-1',
          dictionaryServiceLineId: 'line-1',
        },
        { name: 'Slack', domains: ['slack.com'] },
      ),
    ).toEqual({});
  });

  it('notes every field that differs, and nothing else', () => {
    expect(
      applicationChangesOf(
        current,
        {
          dataSensitivity: 'HIGH',
          functionalGroupId: 'grp-2',
          dictionaryServiceLineId: 'line-2',
        },
        { name: 'Slack Pro', domains: ['slack.com', 'slack-edge.com'] },
      ),
    ).toEqual({
      name: 'Slack Pro',
      domains: ['slack.com', 'slack-edge.com'],
      dataSensitivity: 'HIGH',
      functionalGroupId: 'grp-2',
      dictionaryServiceLineId: 'line-2',
    });
  });

  it('clears the dictionary line when the update says null and there is one; the functional group is never cleared (QĐ-111d)', () => {
    expect(applicationChangesOf(current, { dictionaryServiceLineId: null }, {})).toEqual({
      dictionaryServiceLineId: null,
    });
    expect(
      applicationChangesOf({ ...current, dictionaryServiceLineId: null }, { dictionaryServiceLineId: null }, {}),
    ).toEqual({});
  });

  it('rates the data, or clears the rating with null (QĐ-111f), and notes it only when it differs', () => {
    expect(applicationChangesOf(current, { dataSensitivity: null }, {})).toEqual({ dataSensitivity: null });
    expect(applicationChangesOf({ ...current, dataSensitivity: null }, { dataSensitivity: null }, {})).toEqual({});
  });
});
