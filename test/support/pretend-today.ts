import type { INestApplicationContext } from '@nestjs/common';
import { OrganizationContextService } from '../../src/modules/organization/organization-context.service';

/**
 * Says what day the organization is on, for a test. The one seam of that day is `OrganizationContextService.businessToday`: the
 * capabilities of the organization module read it there directly, and `OrganizationApi.businessToday` (the door the other modules use)
 * delegates to it, so a stub here is seen by every reader of the day. A spy on the facade would not be: the capabilities of the
 * organization module never go through it, so they would keep reading the real day. Restore it with `jest.restoreAllMocks()` or the
 * returned spy's `mockRestore()`.
 */
export const pretendBusinessToday = (app: INestApplicationContext, day: string) =>
  jest.spyOn(app.get(OrganizationContextService, { strict: false }), 'businessToday').mockResolvedValue(day);
