import { Test } from '@nestjs/testing';
import {
  ApprovalRoleChangeListeners,
  SpendingApproverGrantChecks,
} from '../modules/identity-access/public/identity-access.extension-points';
import { NotificationNameContributions } from '../modules/notifications/public/notifications.extension-points';
import { OrganizationChangeListeners } from '../modules/organization/public/organization.extension-points';
import { EmailDispatchLoop } from './email-dispatch.job';
import { RequestWorkLoop } from './request-work.job';
import { WorkerModule } from './worker.module';

describe('WorkerModule DI graph', () => {
  it('compiles, runs onModuleInit, and registers worker extension points without starting loops', async () => {
    const emailBootstrap = jest
      .spyOn(EmailDispatchLoop.prototype, 'onApplicationBootstrap')
      .mockImplementation(() => undefined);
    const requestBootstrap = jest
      .spyOn(RequestWorkLoop.prototype, 'onApplicationBootstrap')
      .mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    try {
      await moduleRef.init();

      expect(moduleRef.get(OrganizationChangeListeners).names().length).toBeGreaterThan(0);
      expect(moduleRef.get(ApprovalRoleChangeListeners).names().length).toBeGreaterThan(0);
      expect(moduleRef.get(SpendingApproverGrantChecks).names().length).toBeGreaterThan(0);
      expect(moduleRef.get(NotificationNameContributions)).toBeDefined();
    } finally {
      emailBootstrap.mockRestore();
      requestBootstrap.mockRestore();
      await moduleRef.close();
    }
  });
});
