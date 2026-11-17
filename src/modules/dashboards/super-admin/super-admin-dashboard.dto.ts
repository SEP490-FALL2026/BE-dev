import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { progressCalendarSchema, progressSectionsShape } from '../progress/dashboard-progress.dto';
import { dashboardSectionSchema } from '../section/dashboard-section.dto';

const section = (description: string) => dashboardSectionSchema.meta({ description });

const superAdminDashboardSchema = z.strictObject({
  asOf: responseBusinessDate,
  calendar: progressCalendarSchema,
  sections: z.strictObject({
    ...progressSectionsShape,
    congestion: section('The board of the approval steps that are late or congested.'),
    backgroundJobs: section('The background tasks of the system; nothing records them yet.'),
    approverConfiguration: section('Who holds the spending approver role: the accounts, with the roles each holds.'),
    superAdminRole: section('Whether the Super Admin role can be used now.'),
    departmentsWithoutHead: section('The active departments nobody heads on the business day.'),
    departmentsWithoutItAdmin: section('The active departments without a usable IT Admin in charge.'),
    accountCandidates: section('The employee profiles that can get an account.'),
    personnelNotices: section('The notices of heads about their people that wait to be rejected or recorded.'),
  }),
});

export type SuperAdminDashboardWire = z.infer<typeof superAdminDashboardSchema>;

export class SuperAdminDashboardResponseDto extends createZodDto(successEnvelopeSchema(superAdminDashboardSchema)) {}
