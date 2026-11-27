import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { SubscriptionResponsibleNotItAdminError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
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
    for (const toEmployeeId of ['it-2', 'it-1']) {
      try {
        judgeResponsibleChange({ currentEmployeeId: 'it-1', toEmployeeId, toIsUsableItAdmin: false });
        throw new Error('Expected SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN');
      } catch (error) {
        expect(error).toBeInstanceOf(SubscriptionResponsibleNotItAdminError);
        const mapped = toSubscriptionApiException(error);
        expect(mapped).toBeInstanceOf(ApiException);
        expect((mapped as ApiException).getResponse()).toMatchObject({
          code: 'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN',
        });
      }
    }
  });
});
