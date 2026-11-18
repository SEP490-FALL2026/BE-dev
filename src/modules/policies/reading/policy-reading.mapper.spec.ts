import type { PolicyRecord, PublishedVersionRecord } from '../library/library.types';
import { toPolicyDetail, toPolicySummary, toPolicyStep, toVersionSummary } from './policy-reading.mapper';

const version: PublishedVersionRecord = {
  id: '0199c4a0-0000-7000-8000-000000000001',
  policyId: '0199c4a0-0000-7000-8000-000000000002',
  policyCode: 'POL-MF1',
  versionNumber: 2,
  title: 'Chính sách cấp phát',
  content: {
    sections: [{ heading: 'Mục đích', body: 'a' }],
    steps: [{ code: '1.2', title: 'Xác nhận nhu cầu', checklist: [{ code: '1.2-01', text: 'q', check: 'PERSON' }] }],
  },
  applicableRoles: ['MANAGER'],
  changeNote: 'Quyết định số 05',
  requiresReacknowledgement: false,
  publishedByAppUserId: '0199c4a0-0000-7000-8000-0000000000aa',
  publishedAt: new Date('2026-11-15T02:00:00.000Z'),
  updatedAt: new Date('2026-11-15T02:00:00.000Z'),
};
const policy: PolicyRecord = { id: version.policyId, code: 'POL-MF1', current: version, hasDraft: true };

describe('the answers of the reading of the library', () => {
  it('tells only the Super Admin whether a draft is open (US-01-13)', () => {
    expect(toPolicySummary(policy, version, 'PENDING', true).hasDraft).toBe(true);
    expect(toPolicySummary(policy, version, 'PENDING', false).hasDraft).toBeNull();
  });

  it('names who published each version of the history, and nobody for a version the installation wrote (US-01-13 AC-3)', () => {
    expect(toVersionSummary(version).publishedByAppUserId).toBe('0199c4a0-0000-7000-8000-0000000000aa');
    expect(toVersionSummary({ ...version, publishedByAppUserId: null }).publishedByAppUserId).toBeNull();
  });

  it('gives the same on the version read with its text, with the state of the caller only for the version in force', () => {
    const current = toPolicyDetail(version, true, 'DONE');
    const older = toPolicyDetail(version, false, null);

    expect(current.publishedByAppUserId).toBe('0199c4a0-0000-7000-8000-0000000000aa');
    expect([current.myAcknowledgement, older.myAcknowledgement]).toEqual(['DONE', null]);
    expect(current.content.steps[0]?.code).toBe('1.2');
  });

  it('gives the version a decision names with the step it asks', () => {
    expect(toPolicyStep(version, version.content.steps[0])).toEqual({
      policyCode: 'POL-MF1',
      policyVersionId: version.id,
      versionNumber: 2,
      step: version.content.steps[0],
    });
  });
});
