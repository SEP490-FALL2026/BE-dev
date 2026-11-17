import { CODE_LABELS } from './notification-labels.types';
import { nameLookupKey, nameRefsOf, renderNotificationText } from './inbox-notification-text.policy';

/** The sentences and labels of the notices the operations round (A2) added: the spend batch, and two causes of a step given to someone. */

const UUID = '00000000-0000-0000-0000-000000000000';

describe('the notices of the operations round', () => {
  const batchParams = { batchId: UUID, departmentId: UUID, sentCount: 3 };
  const names = new Map([[nameLookupKey('DEPARTMENT', UUID), 'Phòng Thiết kế']]);

  it('tells the spending approver of a batch, with the name of the department and the number of requests (vi)', () => {
    expect(renderNotificationText('SPEND_BATCH_SUBMITTED', batchParams, 'vi', names)).toEqual({
      title: 'Có lô trình duyệt chi mới',
      message: 'Trưởng phòng Phòng Thiết kế vừa trình một lô có 3 yêu cầu chờ bạn duyệt chi.',
    });
  });

  it('tells the spending approver of a batch, with the name of the department and the number of requests (en)', () => {
    expect(renderNotificationText('SPEND_BATCH_SUBMITTED', batchParams, 'en', names)).toEqual({
      title: 'New spend batch',
      message: 'The head of Phòng Thiết kế sent a batch with 3 requests awaiting your spend decision.',
    });
  });

  it('lists the department of the batch as the one name it prints', () => {
    expect(nameRefsOf('SPEND_BATCH_SUBMITTED', batchParams, 'vi')).toEqual([{ kind: 'DEPARTMENT', id: UUID }]);
  });

  it.each([
    ['RESUBMITTED', 'người gửi đã gửi lại sau khi bổ sung', 'sent again after revision'],
    ['SPEND_SENT', 'dự phòng đã được xác nhận, chờ bạn duyệt chi', 'reserve confirmed, awaiting your spend decision'],
  ])('words the cause %s of a step given to someone', (cause, vi, en) => {
    const params = { requestId: UUID, stepKind: 'SPEND_APPROVAL', cause };
    expect(renderNotificationText('STEP_ASSIGNED', params, 'vi', new Map()).message).toContain(`(${vi})`);
    expect(renderNotificationText('STEP_ASSIGNED', params, 'en', new Map()).message).toContain(`(${en})`);
  });

  it('has a label in both languages for every cause the writers of a step send', () => {
    const sent = ['SUBMITTED', 'ASSESSMENT', 'RESUBMITTED', 'WAIT_ENDED', 'REASSIGNED', 'SPEND_SENT'];
    expect(Object.keys(CODE_LABELS.STEP_ASSIGNED.cause).sort()).toEqual([...sent].sort());
  });
});
