import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestQueryService } from '../access-request/access-request-query.service';
import { toWire } from '../access-request/access-request.wire';
import { PricingViewService } from '../access-request/pricing-view.service';
import { GroupCandidateService } from './group-candidate.service';
import {
  GroupBodyDto,
  GroupCandidatesQueryDto,
  GroupCandidatesResponseDto,
  GroupCheckResponseDto,
  GroupResponseDto,
} from './group-request.dto';
import { toGroupRequestApiException } from './group-request.http-errors';
import { GroupRequestService } from './group-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * A request for a group of people of one department (`US-05-17`): an Employee names up to ten people, a head as many as the
 * department has, and the check says what is wrong with each at the moment it is added, without writing anything. The
 * people go to the step that holds them and are decided one by one afterwards.
 */
@ApiTags('group-requests')
@Controller({ version: '1' })
export class GroupRequestsController {
  constructor(
    private readonly groups: GroupRequestService,
    private readonly candidates: GroupCandidateService,
    private readonly queries: AccessRequestQueryService,
    private readonly money: PricingViewService,
  ) {}

  @Post('group-requests/check')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'groupRequestCheck', summary: 'Check a request for a group before sending it' })
  @ApiSuccessResponse(GroupCheckResponseDto, {
    message: 'GROUP_REQUEST.CHECKED',
    description:
      'What sending the request for the group would do, without writing anything: whether the plan takes a group, whether too many people were named, and, for every person, whether they can be in it and why not; the cost for one person and for all of them, whether it has a spend step, and whether a tool outside the standard toolset needs a reason. This is where a person who cannot be named is refused as they are added.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'The plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED) or the caller belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The body is invalid (VALIDATION_ERROR).' },
  )
  async check(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: GroupBodyDto) {
    try {
      const checked = await this.groups.check(actor, body);
      const { pricing } = checked;
      const perPerson =
        pricing.unitPrice !== null && pricing.schedule !== null
          ? await this.money.moneyView({
              amountMinor: pricing.unitPrice.amountMinor * BigInt(pricing.schedule.length),
              currency: pricing.unitPrice.currency,
            })
          : null;

      return {
        plan: checked.plan,
        tooManyLines: checked.tooManyLines,
        lines: checked.lines,
        lineCount: checked.lineCount,
        hasSpendStep: true,
        outsideStandard: checked.outsideStandard,
        pricing: await this.money.view(pricing),
        amountPerPerson: perPerson,
      };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Post('group-requests')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'groupRequestSubmit', summary: 'Send a request for a group of people' })
  @ApiSuccessResponse(GroupResponseDto, {
    status: HttpStatus.CREATED,
    message: 'GROUP_REQUEST.SUBMITTED',
    description:
      'One request for the people named, each a line with a state of its own, charged to the Unit Cost Center of the department of the sender on the day with one amount for all of them. A head who sends confirms the need of the others by sending, and the head named among them is decided by the person who decides a head’s own request; an Employee who sends has the people decided by the head of the department. Everything is written or nothing is.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'The plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED) or the sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR); the plan does not take a group (GROUP_REQUEST.PLAN_NOT_ELIGIBLE); too many people are named (GROUP_REQUEST.TOO_MANY_LINES) or a person twice (GROUP_REQUEST.DUPLICATE_LINE); a person cannot be in it (GROUP_REQUEST.LINES_REFUSED, with each person and the reason); a tool outside the standard toolset has no reason (ACCESS_REQUEST.OUTSIDE_STANDARD_REASON_REQUIRED); a head sends a term over twelve months without confirming it (GROUP_REQUEST.TERM_CONFIRMATION_REQUIRED). Nothing is written.',
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: GroupBodyDto) {
    try {
      const record = await this.groups.submit(actor, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Get('group-request-candidates')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'groupRequestCandidateList', summary: 'List the people who may be named in a group' })
  @ApiSuccessResponse(GroupCandidatesResponseDto, {
    message: 'GROUP_REQUEST.CANDIDATES_LISTED',
    description:
      'The people of the department of the caller who still work here and have a work email, by name, to pick from when naming the people of a request for a group. Only the name and the work email of each: no job title, no tools they hold. Searched by name or email.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.CONFLICT, description: 'The caller belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT).' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query is invalid (VALIDATION_ERROR).' },
  )
  async candidateList(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: GroupCandidatesQueryDto) {
    try {
      return await this.candidates.page(actor, query);
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }
}
