import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { issueCommands } from './saas-issues.steps';

describe('SaaS issue scenarios', () => {
  const transition = (to: string) => ({ kind: 'TRANSITION', to });

  it('keeps the original report and adds the four reports and a duplicate on the specified seats', () => {
    expect(fixture.saasIssues.map(({ key, reporter, plan, end }) => [key, reporter, plan, end])).toEqual([
      ['ISSUE', 'NV-DEV1', 'postman-professional', 'NEW'],
      ['ISSUE2', 'NV-DEV5', 'confluence-standard', 'IN_PROGRESS'],
      ['ISSUE3', 'NV-ITO1', 'm365-basic', 'RESOLVED'],
      ['ISSUE4', 'NV-BOD1', 'zoom-pro', 'REOPENED'],
      ['ISSUE5', 'NV-BOD4', 'adobe-cc-teams', 'WAITING_PROVIDER'],
      ['ISSUE5B', 'NV-BOD4', 'adobe-cc-teams', 'DUPLICATE'],
    ]);
  });

  it('starts handling before waiting for the provider, and resumes after partial progress', () => {
    expect(issueCommands({ state: 'NEW', reopenCount: 0, replied: false }, { end: 'WAITING_PROVIDER' })).toEqual([
      transition('IN_PROGRESS'),
      transition('WAITING_PROVIDER'),
    ]);
    expect(
      issueCommands({ state: 'IN_PROGRESS', reopenCount: 0, replied: false }, { end: 'WAITING_PROVIDER' }),
    ).toEqual([transition('WAITING_PROVIDER')]);
  });

  it('resolves before the reporter reopens once, then leaves the reopened issue in progress', () => {
    const spec = { end: 'REOPENED' } as const;
    expect(issueCommands({ state: 'NEW', reopenCount: 0, replied: false }, spec)).toEqual([
      transition('IN_PROGRESS'),
      transition('RESOLVED'),
      { kind: 'REOPEN' },
    ]);
    expect(issueCommands({ state: 'IN_PROGRESS', reopenCount: 1, replied: false }, spec)).toEqual([]);
    expect(issueCommands({ state: 'IN_PROGRESS', reopenCount: 2, replied: false }, spec)).toBeNull();
  });

  it('accepts a resolved issue closed by the sweep and rejects an unrelated state', () => {
    expect(issueCommands({ state: 'CLOSED', reopenCount: 0, replied: false }, { end: 'RESOLVED' })).toEqual([]);
    expect(issueCommands({ state: 'DUPLICATE', reopenCount: 0, replied: false }, { end: 'RESOLVED' })).toBeNull();
    expect(
      issueCommands({ state: 'RESOLVED', reopenCount: 0, replied: false }, { end: 'WAITING_PROVIDER' }),
    ).toBeNull();
  });

  it('replies once after IT starts handling and marks the second report as a duplicate', () => {
    const spec = { end: 'IN_PROGRESS', reporterReply: 'Đã thử lại.' } as const;
    expect(issueCommands({ state: 'NEW', reopenCount: 0, replied: false }, spec)).toEqual([
      transition('IN_PROGRESS'),
      { kind: 'REPLY' },
    ]);
    expect(issueCommands({ state: 'IN_PROGRESS', reopenCount: 0, replied: true }, spec)).toEqual([]);
    expect(issueCommands({ state: 'NEW', reopenCount: 0, replied: false }, { end: 'DUPLICATE' })).toEqual([
      { kind: 'DUPLICATE' },
    ]);
  });

  it('orders the reports after their seats and first request', () => {
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(keys.indexOf('saas.issues')).toBeGreaterThan(keys.indexOf('requests.R01'));
    expect(keys.indexOf('saas.issues')).toBeGreaterThan(keys.indexOf('catalog.baseline-close'));
    expect(keys).not.toContain('saas.issue');
  });
});
