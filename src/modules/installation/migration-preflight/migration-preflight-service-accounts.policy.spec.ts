import { formatPreflight } from '../public/migration-preflight-report.mapper';
import type { ContractGateFacts, PreflightReport } from '../public/migration-preflight.types';
import { judgeContractGates, withContractGates } from './migration-preflight-judgement.policy';

/**
 * A service account still in force (`QĐ-110m`, review of X-SA) is information on every run, never a blocker: the migration that converts it
 * is the deploy that has to run, and the guide `service-account-conversion.md` says what to do with the ones it keeps.
 */
const noDirection: ContractGateFacts['costCenterDirection'] = {
  schema: 'NO_TABLE',
  organizationIds: [],
  costCenterIds: [],
  mismatches: [],
  notActivated: [],
};
const facts = (serviceAccountIds: string[]): ContractGateFacts => ({
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: noDirection,
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [], serviceAccountIds },
  legacyReturns: { candidates: [], neighbours: [] },
});
const converged: PreflightReport = {
  status: 'READY',
  history: 'CONVERGED',
  blockers: [],
  corrections: [],
  companyCostCentersRemoved: [],
  information: [],
};

describe('judgeContractGates: the service accounts still in force (review of X-SA)', () => {
  it('lists them as information by id and in order, and never as a blocker (the deploy that converts them must run)', () => {
    const report = withContractGates(converged, judgeContractGates(facts(['a-9', 'a-2'])));

    expect(report.status).toBe('READY');
    expect(report.blockers).toEqual([]);
    expect(report.information).toEqual([
      { code: 'SERVICE_ACCOUNT_STILL_IN_FORCE', assignmentId: 'a-2' },
      { code: 'SERVICE_ACCOUNT_STILL_IN_FORCE', assignmentId: 'a-9' },
    ]);
  });

  it('has nothing to say when none is in force', () => {
    expect(judgeContractGates(facts([]))).toEqual({ blockers: [], information: [] });
  });

  it('says in the text how many are still in force, which ones, and which guide ends them, in a ready report', () => {
    const text = formatPreflight(withContractGates(converged, judgeContractGates(facts(['a-9', 'a-2']))));

    expect(text).toMatch(/^Preflight: READY/);
    expect(text).toContain('2 service account(s) are still in force.');
    expect(text).toContain('SERVICE_ACCOUNT_STILL_IN_FORCE');
    expect(text).toContain('assignment a-2');
    expect(text).toContain('assignment a-9');
    expect(text).toContain('20261113000900_licensing_service_accounts_converted');
    expect(text).toContain('docs/guides/service-account-conversion.md');
  });
});
