import { applicationKindOf } from './application-intake.policy';

describe('applicationKindOf (QĐ-111d: Internal comes from the kind of provisioning, nobody is asked)', () => {
  it('makes an application INTERNAL when its plan is granted by hand (K5) and SAAS for every other kind', () => {
    expect(applicationKindOf('K5')).toBe('INTERNAL');
    for (const type of ['K1', 'K2', 'K3', 'K4'] as const) expect(applicationKindOf(type)).toBe('SAAS');
  });
});
