import type { GrantOutcomeFacts } from '../../licensing/public/licensing.types';
import { releasesAllOnPoolGrant } from './pool-grant-release.policy';

describe('BR-MF1-09: the commitment of a K4 request granted from the pool goes back in full (QĐ-106d, FR-5.8(2))', () => {
  const facts = (extra: Partial<GrantOutcomeFacts> = {}): GrantOutcomeFacts => ({
    fromPool: true,
    provisioningType: 'K4',
    grantedOn: '2026-11-10',
    assignmentId: 'a-1',
    ...extra,
  });

  it('releases everything when a K4 key was given from the pool', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts())).toBe(true);
  });

  it('keeps the commitment of a K4 grant that bought its key, until the invoice', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ fromPool: false }))).toBe(false);
  });

  it('is not the rule of a K2 seat from the pool, nor of K1 or K5', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K2' }))).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K1', fromPool: false }))).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K5', fromPool: false }))).toBe(false);
  });

  it('releases nothing for a failed grant here (its own rule does) or when the outcome carries no facts', () => {
    expect(releasesAllOnPoolGrant('FAILED', facts())).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', undefined)).toBe(false);
  });
});
