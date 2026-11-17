import { Logger } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { InAppNotificationInput } from '../public/notifications.types';
import type { InAppNotificationRepo } from './in-app-notification.repo';
import { InboxService } from './inbox.service';

const TX = {} as DbTx;

const notice = (subject: InAppNotificationInput['subject']): InAppNotificationInput => ({
  organizationId: '22222222-2222-4222-8222-222222222222',
  recipientEmployeeId: '33333333-3333-4333-8333-333333333333',
  code: 'LICENSE_EXPIRY_REMINDER',
  subject,
  params: { assignmentId: 'a1', audience: 'EMPLOYEE' },
  eventKey: 'EXPIRY:a1:7',
});

describe('InboxService.deliver and the type of the subject', () => {
  let insertIfAbsent: jest.MockedFunction<InAppNotificationRepo['insertIfAbsent']>;
  let service: InboxService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    insertIfAbsent = jest.fn<Promise<boolean>, [DbTx, InAppNotificationInput]>().mockResolvedValue(true);
    service = new InboxService({ insertIfAbsent } as unknown as InAppNotificationRepo);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('writes an old spelling in UPPER_SNAKE and does not throw or warn', async () => {
    await expect(service.deliver(TX, notice({ type: 'LicenseAssignment', id: 'a1' }))).resolves.toBe(true);

    expect(insertIfAbsent).toHaveBeenCalledTimes(1);
    expect(insertIfAbsent.mock.calls[0][1].subject).toEqual({ type: 'LICENSE_ASSIGNMENT', id: 'a1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a canonical type as it is', async () => {
    await service.deliver(TX, notice({ type: 'PROVISIONING_TASK', id: 't1' }));

    expect(insertIfAbsent.mock.calls[0][1].subject).toEqual({ type: 'PROVISIONING_TASK', id: 't1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes a type it cannot normalise, warns with the code, the key and the type, and does not throw', async () => {
    await expect(service.deliver(TX, notice({ type: 'strange type', id: 'x' }))).resolves.toBe(true);

    expect(insertIfAbsent.mock.calls[0][1].subject).toEqual({ type: 'strange type', id: 'x' });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String((warn.mock.calls as unknown[][])[0][0]);
    expect(line).toContain('LICENSE_EXPIRY_REMINDER');
    expect(line).toContain('EXPIRY:a1:7');
    expect(line).toContain('strange type');
  });

  it('does not touch a notice about nothing, and does not change the notice it was given', async () => {
    const input = notice({ type: 'Employee', id: 'e1' });
    await service.deliver(TX, notice(null));
    await service.deliver(TX, input);

    expect(insertIfAbsent.mock.calls[0][1].subject).toBeNull();
    expect(insertIfAbsent.mock.calls[1][1].subject).toEqual({ type: 'EMPLOYEE', id: 'e1' });
    expect(input.subject).toEqual({ type: 'Employee', id: 'e1' });
  });
});
