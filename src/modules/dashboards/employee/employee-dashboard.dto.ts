import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { dashboardSectionSchema } from '../section/dashboard-section.dto';

const employeeDashboardSchema = z.strictObject({
  asOf: responseBusinessDate,
  sections: z.strictObject({
    softwareRights: dashboardSectionSchema.meta({
      description: 'The software rights the caller holds on the business day or will hold, K4 included.',
    }),
    expiringRights: dashboardSectionSchema.meta({
      description: 'Of those, the rights in force whose expected end day is within seven days.',
    }),
    requests: dashboardSectionSchema.meta({
      description:
        'The requests the caller sent that are not over, as meAccessRequestList with view=open counts them; drafts and requests sent on their behalf are not counted. Not available (NO_DATA_SOURCE) for a Super Admin, who sends none. The results are read from the list with view=ended, not from here.',
    }),
    saasIssues: dashboardSectionSchema.meta({
      description: 'The SaaS error reports the caller sent that are not resolved, closed or marked duplicate.',
    }),
  }),
});

export type EmployeeDashboardWire = z.infer<typeof employeeDashboardSchema>;

export class EmployeeDashboardResponseDto extends createZodDto(successEnvelopeSchema(employeeDashboardSchema)) {}
