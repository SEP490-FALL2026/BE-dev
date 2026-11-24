import { SubscriptionResponsibleNotItAdminError } from '../subscription.errors';
import { judgeResponsibleChange } from './subscription-responsible.policy';

describe('judgeResponsibleChange (the Super Admin names who answers for a subscription, QĐ-118f)', () => {
  it('changes who answers when another working IT Admin is named', () => {
    expect(judgeResponsibleChange({ currentEmployeeId: 'it-1', toEmployeeId: 'it-2', toIsUsableItAdmin: true })).toBe(
      'CHANGE',
    );
  });

  it('gives a subscription that names nobody the one named', () => {
    expect(judgeResponsibleChange({ currentEmployeeId: null, toEmployeeId: 'it-2', toIsUsableItAdmin: true })).toBe(
      'CHANGE',
    );
  });

  it('changes nothing when the one named already answers for it', () => {
    expect(judgeResponsibleChange({ currentEmployeeId: 'it-1', toEmployeeId: 'it-1', toIsUsableItAdmin: true })).toBe(
      'UNCHANGED',
    );
  });

  it('refuses a person who is not an IT Admin who works now, even the one who already answers for it', () => {
    expect(() =>
      judgeResponsibleChange({ currentEmployeeId: 'it-1', toEmployeeId: 'it-2', toIsUsableItAdmin: false }),
    ).toThrow(SubscriptionResponsibleNotItAdminError);
    expect(() =>
      judgeResponsibleChange({ currentEmployeeId: 'it-1', toEmployeeId: 'it-1', toIsUsableItAdmin: false }),
    ).toThrow(SubscriptionResponsibleNotItAdminError);
  });
});
