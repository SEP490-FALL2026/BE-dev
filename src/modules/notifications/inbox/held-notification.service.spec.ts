import { Logger } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HeldDepartmentNotificationInput } from '../public/notifications.types';
import type { HeldNotificationRepo } from './held-notification.repo';
import { HeldNotificationService } from './held-notification.service';
import type { InboxService } from './inbox.service';

const TX = {} as DbTx;

const held = (subject: HeldDepartmentNotificationInput['subject']): HeldDepartmentNotificationInput => ({
  organizationId: '22222222-2222-4222-8222-222222222222',
  departmentId: '44444444-4444-4444-8444-444444444444',
  code: 'GHOST_SEAT_WAITING_FOR_HEAD',
  subject,
  params: { recommendationId: 'r1', departmentId: '44444444-4444-4444-8444-444444444444' },
  eventKey: 'GHOST:d1:2026-W46',
});

describe('HeldNotificationService.hold and the type of the subject', () => {
  let insertIfAbsent: jest.MockedFunction<HeldNotificationRepo['insertIfAbsent']>;
  let service: HeldNotificationService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    insertIfAbsent = jest.fn<Promise<boolean>, [DbTx, HeldDepartmentNotificationInput]>().mockResolvedValue(true);
    service = new HeldNotificationService({ insertIfAbsent } as unknown as HeldNotificationRepo, {} as InboxService);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('keeps an old spelling in UPPER_SNAKE and does not throw or warn', async () => {
    await expect(service.hold(TX, held({ type: 'ProvisioningTask', id: 't1' }))).resolves.toBe(true);

    expect(insertIfAbsent).toHaveBeenCalledTimes(1);
    expect(insertIfAbsent.mock.calls[0][1].subject).toEqual({ type: 'PROVISIONING_TASK', id: 't1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a type it cannot normalise, warns with the code, the key and the type, and does not throw', async () => {
    await expect(service.hold(TX, held({ type: 'strange type', id: 'x' }))).resolves.toBe(true);

    expect(insertIfAbsent.mock.calls[0][1].subject).toEqual({ type: 'strange type', id: 'x' });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String((warn.mock.calls as unknown[][])[0][0]);
    expect(line).toContain('GHOST_SEAT_WAITING_FOR_HEAD');
    expect(line).toContain('GHOST:d1:2026-W46');
    expect(line).toContain('strange type');
  });

  it('keeps a notice about nothing as it is', async () => {
    await service.hold(TX, held(null));

    expect(insertIfAbsent.mock.calls[0][1].subject).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
