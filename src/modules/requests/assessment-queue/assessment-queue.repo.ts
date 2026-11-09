import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AssessmentFields, Quote } from '../access-request/assessment-record.types';

/** One open assessment step as the queue reads it: who holds it, what the proposal is, and the fields the IT Admin has filled. */
export interface AssessmentQueueRow {
  requestId: string;
  stepState: 'PENDING' | 'WAITING';
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  slaWorkingDays: number;
  /** When the step came to the IT Admin: the head approved the need. */
  reachedItAt: Date;
  requesterEmployeeId: string;
  departmentId: string;
  /** The reader sent the request or is who it is for: the assessment is not theirs to fill (`SoD-4`). */
  readerIsParty: boolean;
  softwareName: string;
  expectedUsers: number;
  /** The IT Admin has saved the assessment at least once. */
  started: boolean;
  fields: AssessmentFields;
}

const ASSESSMENT_FIELDS = {
  classification: true,
  vendorName: true,
  plannedPlanName: true,
  provisioningType: true,
  adminConsole: true,
  memberExport: true,
  sso: true,
  termsSummary: true,
  memberUsageMethod: true,
  grantRevokeMethod: true,
  dataSensitivity: true,
  opinionStatus: true,
  opinionNote: true,
  controlLevel: true,
  quoteUnitPriceMinor: true,
  quoteCurrency: true,
  quoteBillingCycle: true,
  quoteValidFrom: true,
  quoteValidUntil: true,
  savedByEmployeeId: true,
} as const;

type AssessmentColumns = Prisma.AccessRequestAssessmentGetPayload<{ select: typeof ASSESSMENT_FIELDS }>;

/** The quote as the assessment rules read it; null when none is recorded (the columns are all or none). */
function quoteOf(row: AssessmentColumns): Quote | null {
  if (
    row.quoteUnitPriceMinor === null ||
    row.quoteCurrency === null ||
    row.quoteBillingCycle === null ||
    row.quoteValidFrom === null ||
    row.quoteBillingCycle === 'OTHER'
  ) {
    return null;
  }

  return {
    unitPrice: { amountMinor: row.quoteUnitPriceMinor, currency: row.quoteCurrency },
    billingCycle: row.quoteBillingCycle,
    validFrom: fromDateColumn(row.quoteValidFrom),
    validUntil: row.quoteValidUntil ? fromDateColumn(row.quoteValidUntil) : null,
  };
}

/** What the queue reads of a step, the proposal and the assessment behind it; the reader's own part in the request is a filtered read. */
const stepSelect = (readerEmployeeId: string) =>
  ({
    state: true,
    assigneeEmployeeId: true,
    waitingReason: true,
    slaWorkingDays: true,
    createdAt: true,
    request: {
      select: {
        id: true,
        requesterEmployeeId: true,
        departmentId: true,
        beneficiaries: { where: { employeeId: readerEmployeeId }, select: { employeeId: true }, take: 1 },
        proposal: { select: { softwareName: true, expectedUsers: true } },
        assessment: { select: ASSESSMENT_FIELDS },
      },
    },
  }) satisfies Prisma.AccessRequestStepSelect;

type StepColumns = Prisma.AccessRequestStepGetPayload<{ select: ReturnType<typeof stepSelect> }>;

function fieldsOf(row: AssessmentColumns): AssessmentFields {
  return {
    classification: row.classification,
    vendorName: row.vendorName,
    plannedPlanName: row.plannedPlanName,
    provisioningType: row.provisioningType,
    adminConsole: row.adminConsole,
    memberExport: row.memberExport,
    sso: row.sso,
    termsSummary: row.termsSummary,
    memberUsageMethod: row.memberUsageMethod,
    grantRevokeMethod: row.grantRevokeMethod,
    dataSensitivity: row.dataSensitivity,
    opinionStatus: row.opinionStatus,
    opinionNote: row.opinionNote,
    controlLevel: row.controlLevel,
    quote: quoteOf(row),
  };
}

function rowOf(step: StepColumns, readerEmployeeId: string): AssessmentQueueRow {
  const { proposal, assessment, beneficiaries, ...request } = step.request;
  // An open assessment step belongs to a proposal, which has its declaration and its assessment from the day it is sent.
  if (!proposal || !assessment) throw new Error(`The proposal ${request.id} has no declaration or assessment.`);

  return {
    requestId: request.id,
    stepState: step.state as 'PENDING' | 'WAITING',
    assigneeEmployeeId: step.assigneeEmployeeId,
    waitingReason: step.waitingReason,
    slaWorkingDays: step.slaWorkingDays,
    reachedItAt: step.createdAt,
    requesterEmployeeId: request.requesterEmployeeId,
    departmentId: request.departmentId,
    readerIsParty: request.requesterEmployeeId === readerEmployeeId || beneficiaries.length > 0,
    softwareName: proposal.softwareName,
    expectedUsers: proposal.expectedUsers,
    started: assessment.savedByEmployeeId !== null,
    fields: fieldsOf(assessment),
  };
}

/**
 * The assessments of new software that wait for an IT Admin, read as the IT Admin discovers them: the open assessment steps of the
 * departments in their scope, the oldest first. It only reads; the assessment itself is `AssessmentReadRepo`'s and the writes are
 * the assessment capability's.
 */
@Injectable()
export class AssessmentQueueRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the open assessments of the departments, and the total for the same filter, from one snapshot so an assessment that
   * ends meanwhile cannot make the total disagree with the page. `id` breaks ties between steps that came at the same instant.
   */
  async page(
    readerEmployeeId: string,
    departmentIds: readonly string[],
    skip: number,
    take: number,
  ): Promise<{ rows: AssessmentQueueRow[]; total: number }> {
    const where: Prisma.AccessRequestStepWhereInput = {
      kind: 'IT_ASSESSMENT',
      state: { in: ['PENDING', 'WAITING'] },
      request: {
        state: 'AWAITING_IT_ASSESSMENT',
        departmentId: { in: [...departmentIds] },
        assessment: { status: 'DRAFT' },
      },
    };
    const { steps, total } = await this.prisma.$transaction(
      async (tx) => ({
        steps: await tx.accessRequestStep.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: stepSelect(readerEmployeeId),
        }),
        total: await tx.accessRequestStep.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return { rows: steps.map((step) => rowOf(step, readerEmployeeId)), total };
  }
}
