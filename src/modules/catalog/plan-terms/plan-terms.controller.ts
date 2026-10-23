import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  OpinionBodyDto,
  OpinionPageResponseDto,
  OpinionResponseDto,
  PlanIdParamDto,
  PlanTermsBodyDto,
  PlanTermsResponseDto,
  PlanTermsSetResponseDto,
  PlanWarningPageResponseDto,
  PlanWarningsQueryDto,
  TermOpinionsQueryDto,
} from './plan-terms.dto';
import { toPlanTermsApiException } from './plan-terms.http-errors';
import { PlanTermsService } from './plan-terms.service';
import type { OpinionView, TermsRecord } from './plan-terms.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin records the terms of a plan.' } as const;
const NOT_FOUND = { status: HttpStatus.NOT_FOUND, description: 'The plan does not exist (PLAN.NOT_FOUND).' } as const;

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

const toOpinionWire = (opinion: OpinionView) => ({ ...opinion, recordedAt: opinion.recordedAt.toISOString() });

/**
 * The terms of a plan, as IT read them (`US-04-11`). The IT Admin records the link, the date of the last review and the
 * checklist, and the opinion of the Business Owner; Finance may read the terms. The review alerts are read here, derived
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
      'The terms as IT recorded them, the sharing policy kept on the plan, the opinions on them, and the review alerts open for the plan. A K5 plan answers applicable false.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the IT Admin and Finance read the terms of a plan.' },
    NOT_FOUND,
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is not a UUID (VALIDATION_ERROR).' },
  )
  async get(@Param() params: PlanIdParamDto) {
    try {
      const view = await this.terms.get(params.id);

      return {
        ...view,
        terms: view.terms ? toTermsWire(view.terms) : null,
        opinions: view.opinions.map(toOpinionWire),
      };
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

  @Get('plans/:id/term-opinions')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'planTermOpinionList', summary: 'List the opinions on the terms of a plan' })
  @ApiSuccessResponse(OpinionPageResponseDto, {
    message: 'PLAN_TERM_OPINION.LISTED',
    description: 'A page of the opinions of the Business Owner on the terms of the plan, the newest first.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the IT Admin and Finance read the opinions.' },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not a UUID or the query is invalid (VALIDATION_ERROR).',
    },
  )
  async listOpinions(@Param() params: PlanIdParamDto, @Query() query: TermOpinionsQueryDto) {
    try {
      const page = await this.terms.opinions(params.id, query);

      return { items: page.items.map(toOpinionWire), pagination: page.pagination };
    } catch (error) {
      throw toPlanTermsApiException(error);
    }
  }

  @Post('plans/:id/term-opinions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'planTermOpinionRecord',
    summary: 'Record an opinion of the Business Owner on the terms',
  })
  @ApiSuccessResponse(OpinionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PLAN_TERM_OPINION.RECORDED',
    description:
      'The opinion is kept with the Business Owner of the application, who recorded it and when. It adds no step, deadline or approver.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR), the opinion is empty or too long (PLAN_TERMS.TEXT_INVALID) or the plan has no terms (PLAN_TERMS.NOT_APPLICABLE).',
  })
  async recordOpinion(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PlanIdParamDto,
    @Body() body: OpinionBodyDto,
  ) {
    try {
      return toOpinionWire(await this.terms.recordOpinion(actor, params.id, body));
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
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin reads the review alerts.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query is invalid (VALIDATION_ERROR).' },
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
