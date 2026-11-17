import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { DevicesApi } from '../../devices/public/devices.api';
import type { AllowlistFactsService } from '../allowlist/allowlist-facts.service';
import type { IntakeRejectionRepo } from '../intake-gate/intake-rejection.repo';
import type { VendorAccountIntakeService } from '../vendor-account-review/vendor-account-intake.service';
import { AiUsageBatchService } from './ai-usage-batch.service';
import type { AiUsageRepo } from './ai-usage.repo';

const NOW = new Date('2026-11-10T08:00:00.000Z');
const TX = {} as DbTx;
const context = {
  organizationId: 'org-1',
  deviceId: 'device-1',
  registrationId: 'registration-1',
  credentialId: 'credential-1',
  state: 'COLLECTING' as const,
  acceptFromAt: new Date('2026-11-01T00:00:00.000Z'),
  acceptUntilAt: null,
  toolStatusAcknowledged: true,
  timeZone: 'Asia/Ho_Chi_Minh',
};
const tool = (name: 'CODEX' | 'CLAUDE_CODE' | 'ANTIGRAVITY_CLI') => ({
  tool: name,
  coverage: 'PARTIAL' as const,
  responses: 1,
  totalTokens: 10,
});

function build(allowed: string[], current: string[] = allowed) {
  const review = { fromUnlistedTools: jest.fn().mockResolvedValue(undefined) };
  const usage = { upsertDays: jest.fn().mockResolvedValue(new Set<string>()) };
  const rejections = { insertMany: jest.fn().mockResolvedValue(undefined) };
  const service = new AiUsageBatchService(
    { getIntakeContext: jest.fn().mockResolvedValue(context), recordAccepted: jest.fn() } as unknown as DevicesApi,
    {
      currentTools: jest.fn().mockResolvedValue(new Set(current)),
      allowedOn: jest
        .fn()
        .mockImplementation((_org: string, dates: string[]) =>
          Promise.resolve(new Map(dates.map((date) => [date, new Map(allowed.map((name) => [name, `app-${name}`]))]))),
        ),
    } as unknown as AllowlistFactsService,
    usage as unknown as AiUsageRepo,
    rejections as unknown as IntakeRejectionRepo,
    review as unknown as VendorAccountIntakeService,
    {
      run: jest.fn().mockImplementation((work: (tx: DbTx) => Promise<unknown>) => work(TX)),
    } as unknown as TransactionRunner,
  );

  return { service, review, rejections };
}

describe('the days of usage a collector sends and the review of the accounts at the vendors (RC-2.3, US-13-03 AC-13)', () => {
  it('keeps the allowed tool of a day and tells the review of each tool off the current allowlist, once, with the last day it was reported', async () => {
    const { service, review, rejections } = build(['CODEX']);
    const results = await service.process(
      'credential-1',
      {
        generatedAt: NOW,
        days: [
          { date: '2026-11-08', tools: [tool('CODEX'), tool('CLAUDE_CODE')] },
          { date: '2026-11-09', tools: [tool('CLAUDE_CODE')] },
          { date: '2026-11-10', tools: [tool('CODEX')] },
        ],
      },
      NOW,
    );

    expect(results.map((result) => [result.outcome, result.reasonCode])).toEqual([
      ['UNCHANGED', null],
      ['REJECTED', 'NOT_IN_ALLOWLIST'],
      ['UNCHANGED', null],
    ]);
    expect(rejections.insertMany).toHaveBeenCalledTimes(1);
    expect(review.fromUnlistedTools).toHaveBeenCalledTimes(1);
    expect(review.fromUnlistedTools).toHaveBeenCalledWith(
      TX,
      {
        organizationId: 'org-1',
        sightings: [
          { tool: 'CLAUDE_CODE', date: '2026-11-08' },
          { tool: 'CLAUDE_CODE', date: '2026-11-09' },
        ],
      },
      NOW,
    );
  });

  it('does not tell the review of a tool the current allowlist has, though it was not on the list of that day', async () => {
    const { service, review, rejections } = build(['CODEX'], ['CODEX', 'CLAUDE_CODE']);
    const results = await service.process(
      'credential-1',
      { generatedAt: NOW, days: [{ date: '2026-11-08', tools: [tool('CODEX'), tool('CLAUDE_CODE')] }] },
      NOW,
    );

    expect(results.map((result) => result.reasonCode)).toEqual([null]);
    expect(rejections.insertMany).toHaveBeenCalledWith(TX, []);
    expect(review.fromUnlistedTools).not.toHaveBeenCalled();
  });

  it('tells the review nothing when every tool of the batch is on the allowlist', async () => {
    const { service, review } = build(['CODEX', 'CLAUDE_CODE']);
    await service.process(
      'credential-1',
      { generatedAt: NOW, days: [{ date: '2026-11-10', tools: [tool('CODEX')] }] },
      NOW,
    );

    expect(review.fromUnlistedTools).not.toHaveBeenCalled();
  });
});
