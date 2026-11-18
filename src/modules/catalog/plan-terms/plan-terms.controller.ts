import { Body, Controller, Get, HttpStatus, Param, Put, Query } from '@nestjs/common';
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
import {
  PlanIdParamDto,
  PlanTermsBodyDto,
  PlanTermsResponseDto,
  PlanTermsSetResponseDto,
  PlanWarningPageResponseDto,
  PlanWarningsQueryDto,
} from './plan-terms.dto';
import { PLAN_TERMS_ERROR_EXAMPLES as EXAMPLES, toPlanTermsApiException } from './plan-terms.http-errors';
import { PlanTermsService } from './plan-terms.service';
import type { TermsRecord } from './plan-terms.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin records the terms of a plan.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The plan does not exist (PLAN.NOT_FOUND).',
  examples: [EXAMPLES.PLAN_NOT_FOUND],
} as const;

const toTermsWire = (terms: TermsRecord) => ({
  termsUrl: terms.termsUrl,
  lastReviewedOn: terms.lastReviewedOn,
  aiTraining: terms.aiTraining,
  dataLocation: terms.dataLocation,
  installLimit: { maxDevicesPerKey: terms.installLimitMaxDevices, note: terms.installLimitNote },
  commercialUse: terms.commercialUse,
  cancellationRefund: terms.cancellationRefund,
  updatedAt: terms.updatedAt.toISOString(),
});

/**
 * The terms of a plan, as IT read them (`US-04-11`). The IT Admin records the link, the date of the last review and the
 * checklist; Finance may read the terms. The review alerts are read here, derived
 * from the subscriptions. Nothing in these routes judges the terms or decides anything: no route concludes, deletes or
 * revokes.
 */
@ApiTags('plan-terms')
@Controller({ version: '1' })
export class PlanTermsController {
  constructor(private readonly terms: PlanTermsService) {}

  @Get('plans/:id/terms')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'planTermsGet', summary: 'Get the terms of a plan' })
  @ApiSuccessResponse(PlanTermsResponseDto, {
    message: 'PLAN_TERMS.FETCHED',
    description:
      'The terms as IT recorded them, the sharing policy kept on the plan, and the review alerts open for the plan. A K5 plan answers applicable false.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin and Finance read the terms of a plan.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not a UUID (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(@Param() params: PlanIdParamDto) {
    try {
      const view = await this.terms.get(params.id);

      return { ...view, terms: view.terms ? toTermsWire(view.terms) : null };
    } catch (error) {
      throw toPlanTermsApiException(error);
    }
  }

  @Put('plans/:id/terms')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'planTermsSet', summary: 'Record the terms of a plan' })
  @ApiSuccessResponse(PlanTermsSetResponseDto, {
    message: 'PLAN_TERMS.SET',
    description:
      'The terms replace the previous ones as a whole, exactly as given; changed says whether anything differed. The sharing policy is not set here but on the plan.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR) or a rule refuses it: PLAN_TERMS.NOT_APPLICABLE, URL_INVALID, TEXT_INVALID, REVIEW_DATE_IN_FUTURE or INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4.',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.NOT_APPLICABLE,
      EXAMPLES.URL_INVALID,
      EXAMPLES.TEXT_INVALID,
      EXAMPLES.REVIEW_DATE_IN_FUTURE,
      EXAMPLES.INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4,
    ],
  })
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PlanIdParamDto,
    @Body() body: PlanTermsBodyDto,
  ) {
    try {
      const { terms, changed } = await this.terms.set(actor, params.id, body);

      return { terms: toTermsWire(terms), changed };
    } catch (error) {
      throw toPlanTermsApiException(error);
    }
  }

  @Get('plan-warnings')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'planWarningList', summary: 'List the terms that need a new review' })
  @ApiSuccessResponse(PlanWarningPageResponseDto, {
    message: 'PLAN_WARNING.LISTED',
    description:
      'A page of the review alerts open today, the earliest milestone first: the plan, the deadline of the subscription (and where it comes from), and the date of the last review.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the review alerts.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async warnings(@Query() query: PlanWarningsQueryDto) {
    try {
      const { page, asOf } = await this.terms.warnings(query);

      return { items: page.items, pagination: page.pagination, asOf };
    } catch (error) {
      throw toPlanTermsApiException(error);
    }
  }
}
