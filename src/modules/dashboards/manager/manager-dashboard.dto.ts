import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { dashboardSectionSchema } from '../section/dashboard-section.dto';

const section = (description: string) => dashboardSectionSchema.meta({ description });

const managerDashboardSchema = z.strictObject({
  asOf: responseBusinessDate,
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  sections: z.strictObject({
    needApprovals: section(
      'The need steps given to the caller now, as needDecisionList counts them: requests of the caller, steps already decided and steps handed to somebody else are not counted.',
    ),
    departmentSoftware: section(
      'The seats the department is granted or manages on the business day: a read of the records, not a proof of use.',
    ),
    transferReviews: section('The reviews of tools after a transfer into the department that are still open.'),
    ghostSeats: section('The ghost seats waiting for a decision; they need usage data, which is not delivered yet.'),
    spending: section(
      'The actual cost and the commitments held of the department; the figures are not delivered yet and are never shown as zero.',
    ),
    spendQueue: section('The requests ready to be submitted for spending approval, with those returned and why.'),
    budgetProposals: section('The budget proposals of the department.'),
    approvedBudgetLines: section('The lines of the approved budget version of the department.'),
  }),
});

export type ManagerDashboardWire = z.infer<typeof managerDashboardSchema>;

export class ManagerDashboardResponseDto extends createZodDto(successEnvelopeSchema(managerDashboardSchema)) {}
