import { judgeIntakeState } from './intake-gate.policy';

describe('judgeIntakeState', () => {
  it('lets an acknowledged machine through to the day-by-day judgment', () => {
    expect(judgeIntakeState({ state: 'ACTIVE', toolStatusAcknowledged: false }, 'AI_USAGE_BATCH')).toBeNull();
    expect(judgeIntakeState({ state: 'ACTIVE', toolStatusAcknowledged: true }, 'AI_TOOL_STATUS_SNAPSHOT')).toBeNull();
  });

  it('refuses a machine whose holder has not acknowledged, and one whose collection was stopped', () => {
    expect(
      judgeIntakeState({ state: 'AWAITING_ACKNOWLEDGEMENT', toolStatusAcknowledged: false }, 'AI_USAGE_BATCH'),
    ).toBe('NOT_ACKNOWLEDGED');
    expect(judgeIntakeState({ state: 'COLLECTION_STOPPED', toolStatusAcknowledged: true }, 'AI_USAGE_BATCH')).toBe(
      'COLLECTION_STOPPED',
    );
  });

  it('refuses the status of tools until the notice that names it is acknowledged, but not the usage', () => {
    expect(judgeIntakeState({ state: 'ACTIVE', toolStatusAcknowledged: false }, 'AI_TOOL_STATUS_SNAPSHOT')).toBe(
      'TOOL_STATUS_NOT_ACKNOWLEDGED',
    );
    expect(judgeIntakeState({ state: 'ACTIVE', toolStatusAcknowledged: false }, 'AI_USAGE_BATCH')).toBeNull();
  });
});
