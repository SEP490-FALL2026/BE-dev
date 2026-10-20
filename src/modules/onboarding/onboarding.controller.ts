import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ApiErrorResponses,
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
        .strictObject({
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
        })
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
      'The five steps and where each stands, judged from the data that exists. Step 1 says what is missing and which departments lack a head or an IT Admin; steps 2 to 5 are not built yet and say so.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin sees the onboarding checklist.' },
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
