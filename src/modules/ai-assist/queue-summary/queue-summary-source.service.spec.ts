import { principal, queueSummaryWorld, sourceStep } from '../../../../test/support/ai-assist-fakes';
import { queueRevisionOf } from './queue-summary-context.policy';
import { AiDisabledError } from './queue-summary.errors';

const EMPLOYEE = 'e0000000-0000-4000-8000-000000000001';

describe('QueueSummaryService.readSource', () => {
  it('gives the revision of the queue now and how many steps a summary would cover, without calling the AI service', async () => {
    const { service, source, ai, repo } = queueSummaryWorld();
    source.steps = [sourceStep(1), sourceStep(2), sourceStep(3)];

    const answer = await service.readSource(principal(EMPLOYEE));

    expect(answer).toEqual({ queueRevision: queueRevisionOf(source.steps, 3), stepCount: 3, omittedCount: 0 });
    expect(source.openStepsHeldBy).toHaveBeenCalledWith(EMPLOYEE, 20);
    expect(ai.summarizeQueue).not.toHaveBeenCalled();
    expect(repo.rows.size).toBe(0);
  });

  it('answers a queue of nobody with no step, and the revision a later queue with a step differs from', async () => {
    const { service, source } = queueSummaryWorld();

    const empty = await service.readSource(principal(EMPLOYEE));
    source.steps = [sourceStep(1)];
    const one = await service.readSource(principal(EMPLOYEE));

    expect(empty).toEqual({ queueRevision: queueRevisionOf([], 0), stepCount: 0, omittedCount: 0 });
    expect(one.queueRevision).not.toBe(empty.queueRevision);
  });

  it('counts the steps past the first 20 as omitted, and keeps the revision `create` checks against', async () => {
    const { service, source } = queueSummaryWorld();
    source.steps = Array.from({ length: 25 }, (_value, index) => sourceStep(index + 1));

    const answer = await service.readSource(principal(EMPLOYEE));

    expect(answer).toEqual({
      queueRevision: queueRevisionOf(source.steps.slice(0, 20), 25),
      stepCount: 20,
      omittedCount: 5,
    });
  });

  it('counts the steps that wait in all, not only the ones read', async () => {
    const { service, source } = queueSummaryWorld();
    source.steps = [sourceStep(1), sourceStep(2)];
    source.total = 31;

    const answer = await service.readSource(principal(EMPLOYEE));

    expect(answer).toMatchObject({ stepCount: 2, omittedCount: 29 });
  });

  it.each(['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'])(
    'refuses with AI.DISABLED when %s is OFF, before reading a step',
    async (key) => {
      const { service, source, switches } = queueSummaryWorld();
      switches.set(key, 'OFF');

      await expect(service.readSource(principal(EMPLOYEE))).rejects.toThrow(AiDisabledError);
      expect(source.openStepsHeldBy).not.toHaveBeenCalled();
    },
  );

  it('lets the error of a queue that cannot be read through: nothing is invented', async () => {
    const { service, source } = queueSummaryWorld();
    source.failure = new Error('The step points at a missing record.');

    await expect(service.readSource(principal(EMPLOYEE))).rejects.toThrow('missing record');
  });
});
