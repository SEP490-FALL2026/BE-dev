import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
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
  sections: z.strictObject({
    grantTasks: section('The grant tasks not finished whose IT Admin in charge by default is the caller.'),
    revocationTasks: section('The revocation tasks not finished whose IT Admin in charge by default is the caller.'),
    discrepancies: section('The discrepancies between data sources; they need usage data, which is not delivered yet.'),
    cancellationDeadlines: section(
      'Not counted here: the rows are all the subscriptions of `subscriptionList`, and the client keeps the ones whose `noticeDeadline` is near. The list has no filter by deadline yet.',
    ),
    licenseKeys: section('The license keys in the vault not assigned yet.'),
    termsToReview: section('The plan terms that need a review.'),
    offboardingHandovers: section('The departures still handing over in the departments of the caller.'),
    unconfirmedDevices: section(
      'The company machines without a confirmation of the monitoring policy; the device registry is not delivered yet.',
    ),
    saasIssues: section(
      'The SaaS error reports given to the caller that are not resolved, closed or marked duplicate.',
    ),
  }),
});

export type ItAdminDashboardWire = z.infer<typeof itAdminDashboardSchema>;

export class ItAdminDashboardResponseDto extends createZodDto(successEnvelopeSchema(itAdminDashboardSchema)) {}
