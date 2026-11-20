import type { DemoRunContext } from '../demo-run.types';
import { yesChecklist } from './checklist-kit';

describe('the policy that owns a checklist step', () => {
  it.each([
    ['1.2', 'POL-MF1'],
    ['1.3', 'POL-SAAS'],
    ['1.7', 'POL-MF1'],
    ['4.7', 'POL-MF4'],
    ['5.4', 'POL-MF5'],
  ])('reads step %s from %s and answers only the human checks', async (step, policy) => {
    const call = jest.fn().mockResolvedValue({
      policyVersionId: 'v1',
      step: {
        checklist: [
          { code: 'system', check: 'SYSTEM' },
          { code: 'person', check: 'PERSON' },
        ],
      },
    });
    const ctx = { api: { call } } as unknown as DemoRunContext;
    await expect(yesChecklist(ctx, 'it@example.test', step)).resolves.toEqual({
      policyVersionId: 'v1',
      answers: [{ itemCode: 'person', answer: 'YES' }],
    });
    expect(call).toHaveBeenCalledWith('it@example.test', 'GET', `/policies/${policy}/steps/${step}`);
  });
});
