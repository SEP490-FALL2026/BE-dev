import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toWire } from '../catalog-entry/application.mapper';
import {
  APPLICATION_ERROR_EXAMPLES as EXAMPLES,
  toApplicationApiException,
} from '../catalog-entry/application.http-errors';
import { PLAN_ERROR_EXAMPLES, toPlanApiException } from '../plan/plan.http-errors';
import { toPlanWire } from '../plan/plan.mapper';
import { CreateApplicationBodyDto, CreatedApplicationResponseDto } from './application-intake.dto';
import { ApplicationIntakeService } from './application-intake.service';

const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule of the application or of its plan refuses it: APPLICATION.NAME_INVALID, VENDOR_NAME_INVALID, DOMAIN_INVALID, TOO_MANY_DOMAINS, VENDOR_REQUIRED, VENDOR_SOURCE_AMBIGUOUS, INTERNAL_HAS_NO_VENDOR, FUNCTIONAL_GROUP_INVALID, DICTIONARY_LINE_NOT_FOUND, DICTIONARY_LINE_MISMATCH, or a PLAN.* rule (kind not supported, control level required, data-loss note required, name invalid). Nothing is kept when any of them refuses.',
  examples: [
    VALIDATION_EXAMPLE,
    EXAMPLES.NAME_INVALID,
    EXAMPLES.VENDOR_NAME_INVALID,
    EXAMPLES.DOMAIN_INVALID,
    EXAMPLES.TOO_MANY_DOMAINS,
    EXAMPLES.VENDOR_REQUIRED,
    EXAMPLES.VENDOR_SOURCE_AMBIGUOUS,
    EXAMPLES.INTERNAL_HAS_NO_VENDOR,
    EXAMPLES.FUNCTIONAL_GROUP_INVALID,
    EXAMPLES.DICTIONARY_LINE_NOT_FOUND,
    EXAMPLES.DICTIONARY_LINE_MISMATCH,
    PLAN_ERROR_EXAMPLES.PROVISIONING_TYPE_NOT_SUPPORTED,
    PLAN_ERROR_EXAMPLES.CONTROL_LEVEL_REQUIRED,
  ],
} as const;
const CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The catalog already has this software, by name or by a domain it shares (APPLICATION.DUPLICATE: details.existing is the entry, details.matchedBy says NAME or DOMAIN), the vendor already has an application of this name (APPLICATION.NAME_TAKEN), the dictionary line belongs to another application (APPLICATION.DICTIONARY_LINE_TAKEN), or a simultaneous request changed the dictionary group first (APPLICATION.DICTIONARY_GROUP_CHANGED).',
  examples: [
    EXAMPLES.DUPLICATE,
    EXAMPLES.NAME_TAKEN,
    EXAMPLES.DICTIONARY_LINE_TAKEN,
    EXAMPLES.DICTIONARY_GROUP_CHANGED,
  ],
} as const;

/**
 * A new entry of the catalog in one command (`QĐ-111f`): the application and its first plan. Only an IT Admin makes one; the one who does answers for
 * it. Plans after the first are `POST /plans`.
 */
@ApiTags('applications')
@Controller({ path: 'applications', version: '1' })
export class ApplicationIntakeController {
  constructor(private readonly intake: ApplicationIntakeService) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'applicationCreate',
    summary: 'Declare an application with its first plan',
  })
  @ApiSuccessResponse(CreatedApplicationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'APPLICATION.CREATED',
    description:
      'The application and its first plan are in the catalog. The application is INTERNAL when the plan is granted by hand (K5) and SAAS otherwise; it stands in the group named, or in Khác. The pricing model of the plan follows its kind of provisioning. proposedToDictionary says the vendor was outside the dictionary and proposed to it.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin changes the application catalog.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    INVALID,
    CONFLICT,
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateApplicationBodyDto) {
    try {
      const { application, plan, proposed } = await this.intake.create(actor, body);

      return { ...toWire(application), proposedToDictionary: proposed, plan: toPlanWire(plan) };
    } catch (error) {
      throw toPlanApiException(toApplicationApiException(error));
    }
  }
}
