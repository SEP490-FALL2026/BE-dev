import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PolicyStepNotInForceError } from '../public/policy-checklist.errors';
import { toChecklistApiException } from '../public/policy-checklist.http-errors';
import { ChecklistJudgeService } from './checklist-judge.service';
import type { ChecklistRepo, VersionInForce } from './checklist.repo';

const tx = {} as DbTx;
const VERSION = '019a0000-0000-7000-8000-000000000001';

const judgeWith = (versions: VersionInForce[]) =>
  new ChecklistJudgeService({ versionsInForce: () => Promise.resolve(versions) } as unknown as ChecklistRepo).judge(
    tx,
    {
      organizationId: 'org-1',
      stepCode: '1.7',
      checklist: { policyVersionId: VERSION, answers: [] },
      decision: 'REJECT',
      reason: 'No need',
    },
  );

describe('ChecklistJudgeService with no policy in force at the step', () => {
  it('says the step has no policy in force, a business error with the step, never a bare Error that ends as a 500', async () => {
    const other: VersionInForce = {
      policyCode: 'POL-MF2',
      policyVersionId: VERSION,
      versionNumber: 1,
      content: { steps: [{ code: '1.2', title: 'Need', checklist: [] }] } as unknown as VersionInForce['content'],
    };

    await expect(judgeWith([])).rejects.toMatchObject({ constructor: PolicyStepNotInForceError, stepCode: '1.7' });
    await expect(judgeWith([other])).rejects.toMatchObject({ constructor: PolicyStepNotInForceError, stepCode: '1.7' });
  });

  it('answers 409 POLICY.NOT_IN_FORCE with the step in the details', () => {
    const exception = toChecklistApiException(new PolicyStepNotInForceError('1.7'));

    expect(exception?.getStatus()).toBe(409);
    expect(exception?.getResponse()).toMatchObject({ code: 'POLICY.NOT_IN_FORCE', details: { stepCode: '1.7' } });
  });
});
