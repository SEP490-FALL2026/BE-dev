import type { InAppNotificationInput } from '../public/notifications.types';
import { refuseInAppNotification } from './inbox.policy';

const ID = '0199c4a0-0000-7000-8000-000000000001';

const notice = (params: InAppNotificationInput['params']): InAppNotificationInput => ({
  organizationId: ID,
  recipientEmployeeId: ID,
  code: 'POLICY_PUBLISHED',
  subject: { type: 'POLICY_VERSION', id: ID },
  params,
  eventKey: `policy-published:${ID}`,
});

describe('the notice of a published policy version (QĐ-111bi)', () => {
  it('carries the code of the policy, the number and whether it asks again', () => {
    expect(
      refuseInAppNotification(notice({ policyCode: 'POL-MF1', versionNumber: 2, requiresReacknowledgement: true })),
    ).toBeNull();
  });

  it('carries nothing else, and no text of the policy', () => {
    expect(refuseInAppNotification(notice({ policyCode: 'POL-MF1', changeNote: 'Quyết định số 05' }))).not.toBeNull();
  });
});
