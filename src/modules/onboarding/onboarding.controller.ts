import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { successEnvelopeSchema } from '../../infrastructure/http/dto/success-envelope.dto';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { OnboardingService } from './onboarding.service';

const stepStatus = z.enum(['DONE', 'INCOMPLETE', 'BLOCKED', 'NOT_AVAILABLE']);

const checklistSchema = z.strictObject({
  steps: z.array(
    z.strictObject({
      step: z.number().int().min(1).max(5),
      key: z.string(),
      status: stepStatus,
      reasons: z.array(z.string()),
      facts: z
        .union([
          z.strictObject({
            activeDepartments: z.number().int().nonnegative(),
            activeEmployees: z.number().int().nonnegative(),
            freeCostCenters: z.number().int().nonnegative(),
            latestImport: z
              .strictObject({
                id: z.uuid(),
                status: z.enum(['PREVIEW', 'COMPLETED']),
                errorRows: z.number().int().nonnegative(),
              })
              .nullable(),
          }),
          z.strictObject({ applications: z.number().int().nonnegative() }),
          z.strictObject({ plans: z.number().int().nonnegative(), subscriptions: z.number().int().nonnegative() }),
          z.strictObject({
            assignments: z.number().int().nonnegative(),
            closed: z.boolean(),
            closedAt: z.iso.datetime().nullable(),
          }),
        ])
        .optional(),
      createDepartmentBlockedBy: z.enum(['NO_FREE_COST_CENTER']).nullable().optional(),
      warnings: z
        .array(
          z.strictObject({
            code: z.enum(['MISSING_HEAD', 'MISSING_IT_ADMIN']),
            departmentCode: z.string(),
            departmentName: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  suggestions: z.array(
    z.strictObject({
      key: z.enum(['STANDARD_TOOLSET']),
      afterStep: z.literal(3),
      story: z.string(),
      available: z.boolean(),
      configuredPairs: z.number().int().nonnegative(),
      blocksStep: z.literal(false),
    }),
  ),
});

class OnboardingChecklistResponseDto extends createZodDto(successEnvelopeSchema(checklistSchema)) {}

/** The onboarding checklist (`US-02-04`): for the IT Admin, who sets the organization up. Nobody else sees it. */
@ApiTags('onboarding')
@Controller({ path: 'onboarding-checklist', version: '1' })
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'onboardingChecklistGet', summary: 'Get the onboarding checklist' })
  @ApiSuccessResponse(OnboardingChecklistResponseDto, {
    message: 'ONBOARDING.CHECKLIST_FETCHED',
    description:
      'The five steps and where each stands, judged from the data that exists. Step 1 says what is missing and which departments lack a head or an IT Admin; step 2 (applications) and step 3 (subscriptions) are done when the catalog holds one; step 4 (seat baseline) is blocked until steps 1 and 3 are done, then ready, and done once closed; step 5 (usage) is not built yet and says so. The suggestions name what is worth doing next without requiring it: the standard toolsets, after step 3.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin sees the onboarding checklist.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async get() {
    try {
      return await this.onboarding.checklist();
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
