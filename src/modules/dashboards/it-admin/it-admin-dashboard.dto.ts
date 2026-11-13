import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { progressCalendarSchema, progressSectionsShape } from '../progress/dashboard-progress.dto';
import { dashboardSectionSchema } from '../section/dashboard-section.dto';

const section = (description: string) => dashboardSectionSchema.meta({ description });

const itAdminDashboardSchema = z.strictObject({
  asOf: responseBusinessDate,
  scope: z.strictObject({
    departments: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'How many departments the caller is in charge of or stands in for.' }),
  }),
  calendar: progressCalendarSchema,
  sections: z.strictObject({
    ...progressSectionsShape,
    grantTasks: section('The grant tasks not finished whose IT Admin in charge by default is the caller.'),
    revocationTasks: section('The revocation tasks not finished whose IT Admin in charge by default is the caller.'),
    discrepancies: section(
      'The people active in a vendor with no seat to cover the day: the open findings of the vendor usage import.',
    ),
    cancellationDeadlines: section(
      'Not counted here: the rows are all the subscriptions of `subscriptionList`, and the client keeps the ones whose `noticeDeadline` is near. The list has no filter by deadline yet.',
    ),
    licenseKeys: section('The license keys in the vault not assigned yet.'),
    termsToReview: section('The plan terms that need a review.'),
    offboardingHandovers: section(
      'The departures still handing over in the departments of the caller. Kept one release beside `departures`, which says where every departure stands; dropped after.',
    ),
    unconfirmedDevices: section(
      'The company machines whose holder has not yet acknowledged the monitoring notice: the same number the machine list (`deviceList`) answers for the awaiting-acknowledgement state.',
    ),
    saasIssues: section(
      'The SaaS error reports given to the caller that are not resolved, closed or marked duplicate.',
    ),
    ghostSeats: section(
      'The recommendations of wasted seats not closed: the seats of people who left (G2) and the free seats of subscriptions (G1 open).',
    ),
  }),
});

export type ItAdminDashboardWire = z.infer<typeof itAdminDashboardSchema>;

export class ItAdminDashboardResponseDto extends createZodDto(successEnvelopeSchema(itAdminDashboardSchema)) {}
