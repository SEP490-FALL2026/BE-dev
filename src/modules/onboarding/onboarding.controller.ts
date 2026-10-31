import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { FORBIDDEN_ERROR } from '../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { successEnvelopeSchema } from '../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../infrastructure/http/dto/zod-dto';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { OnboardingForbiddenError } from './onboarding.errors';
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
            departmentsWithoutCostCenter: z.number().int().nonnegative(),
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
      warnings: z
        .array(
          z.strictObject({
            code: z.enum(['MISSING_HEAD', 'MISSING_IT_ADMIN', 'MISSING_COST_CENTER']),
            departmentCode: z.string(),
            departmentName: z.string(),
          }),
        )
        .optional(),
    }),
  ),
});

class OnboardingChecklistResponseDto extends createZodDto(successEnvelopeSchema(checklistSchema)) {}

/**
 * The onboarding checklist (`US-02-04`): for the Super Admin, who does step 1 (the organization and its people, on an HR basis), and
 * the IT Admin, who does steps 2 to 5. Nobody else sees it, whatever the route lets through.
 */
@ApiTags('onboarding')
@Controller({ path: 'onboarding-checklist', version: '1' })
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'onboardingChecklistGet', summary: 'Get the onboarding checklist' })
  @ApiSuccessResponse(OnboardingChecklistResponseDto, {
    message: 'ONBOARDING.CHECKLIST_FETCHED',
    description:
      'The five steps and where each stands, judged from the data that exists. Step 1 says what is missing and which departments lack a head, an IT Admin in charge or a Cost Center (a warning that stops nothing: Finance creates it for a department that exists); step 2 (applications) and step 3 (subscriptions) are done when the catalog holds one; step 4 (seat baseline) is blocked until steps 1 and 3 are done, then ready, and done once closed; step 5 (usage) is not built yet and says so.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin and the IT Admin see the onboarding checklist.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      return await this.onboarding.checklist(actor);
    } catch (error) {
      // The policy of the service refuses a role the way the guard of the route does, with the same body.
      if (error instanceof OnboardingForbiddenError) throw new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
