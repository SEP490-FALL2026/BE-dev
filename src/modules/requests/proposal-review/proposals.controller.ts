import { Body, Controller, Get, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestResponseDto, RequestIdParamDto } from '../access-request/access-request.dto';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import {
  AssessmentPatchDto,
  AssessmentRejectionBodyDto,
  AssessmentResponseDto,
  CatalogLinkBodyDto,
  CatalogLinkResponseDto,
  InternalRegistrationBodyDto,
  ProposalBodyDto,
} from '../assessment/assessment.dto';
import { ASSESSMENT_ERROR_EXAMPLES as EXAMPLES, toAssessmentApiException } from '../assessment/assessment.http-errors';
import { AssessmentCompletionService } from '../assessment/assessment-completion.service';
import { AssessmentQueryService } from '../assessment/assessment-query.service';
import { AssessmentRejectionService } from '../assessment/assessment-rejection.service';
import { AssessmentService } from '../assessment/assessment.service';
import { CatalogLinkService } from '../catalog-link/catalog-link.service';
import { InternalRegistrationService } from '../assessment/internal-registration.service';
import { ProposalService } from '../assessment/proposal.service';
import { ACCESS_REQUEST_ERROR_EXAMPLES as ACCESS_EXAMPLES } from '../access-request/access-request.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY_DESCRIPTION =
  'Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).';
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: IT_ONLY_DESCRIPTION,
  examples: [FORBIDDEN_EXAMPLE, EXAMPLES.OWN_REQUEST],
} as const;
const NOT_FOUND_DESCRIPTION =
  'The request does not exist, is not a proposal, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).';
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: NOT_FOUND_DESCRIPTION,
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const ID_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_AWAITING_ASSESSMENT = {
  status: HttpStatus.CONFLICT,
  description: 'The request is not waiting for its assessment (ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT).',
  examples: [EXAMPLES.NOT_AWAITING_ASSESSMENT],
} as const;

/**
 * A proposal of software that is not in the catalog and the assessment the IT Admin completes for it (`US-05-06`,
 * `US-01-12` AC-2). Any signed-in person proposes for themselves; only an IT Admin fills the assessment, and the head and
 * the spending approver only read it. Nothing here puts the software into the catalog or decides the spend.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class ProposalsController {
  constructor(
    private readonly proposals: ProposalService,
    private readonly assessments: AssessmentService,
    private readonly assessmentReads: AssessmentQueryService,
    private readonly completions: AssessmentCompletionService,
    private readonly rejections: AssessmentRejectionService,
    private readonly links: CatalogLinkService,
    private readonly registrations: InternalRegistrationService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post('proposals')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestPropose', summary: 'Propose software that is not in the catalog' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.PROPOSED',
    description:
      'The request takes the third branch (the need, the assessment of the IT Admin, the spend decision, the grant) with no plan, and the assessment is opened for the IT Admin. The price is missing until the IT Admin records a quote. From a department with no effective head the proposal waits at the need step for a head (waitingReason NO_DEPARTMENT_HEAD) and does not reach the IT Admin before its need is decided, because it is not yet known whether the software will be free or paid; the head of a department sends it without a need step.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
      examples: [EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT), the department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE), the catalog has this software already by its name or by the domain of its page, or has the plan asked for of the application named (ACCESS_REQUEST.SOFTWARE_IN_CATALOG: details.existing is the application with at most twenty of its plans and details.matchedBy says why; ask for it from the catalog instead), or the application named has left the catalog (ACCESS_REQUEST.APPLICATION_RETIRED). Nothing is written.',
      examples: [
        EXAMPLES.NO_DEPARTMENT,
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.SOFTWARE_IN_CATALOG,
        EXAMPLES.APPLICATION_RETIRED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is incomplete or invalid (VALIDATION_ERROR): the name, the homepage, the purpose, the company data that will go through the software and the term are required; existingApplicationId and plannedPlanName go together. The application named does not exist (ASSESSMENT.REFERENCE_NOT_FOUND, details.field existingApplicationId). The sender is the spending approver (REQUEST_PARTY.INELIGIBLE). A proposal counts as a request for new access: a person who was already named in as many requests for new access this calendar week (Monday to Sunday, organization time zone; a request withdrawn or refused still counts) as the weekly limit allows is refused until the next Monday (ACCESS_REQUEST.OPEN_LIMIT_REACHED, details.limit and details.resetsOn; GH-2, BR-MF1-01f). The kind of plan is not known yet, so the term takes 1 to 12 months or none (ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE); a contractor, a freelancer or an intern gives the months (ACCESS_REQUEST.TERM_REQUIRED, and TERM_LONG_TERM_NOT_ALLOWED for a right with no end), and one whose contract ended before today gets no access (ACCESS_REQUEST.TERM_CONTRACT_ENDED, details.contractEndDate). Nothing is written.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.REFERENCE_NOT_FOUND,
        EXAMPLES.REQUEST_PARTY_INELIGIBLE,
        ACCESS_EXAMPLES.OPEN_LIMIT_REACHED,
        ACCESS_EXAMPLES.TERM_REQUIRED,
        ACCESS_EXAMPLES.TERM_MONTHS_OUT_OF_RANGE,
        ACCESS_EXAMPLES.TERM_LONG_TERM_NOT_ALLOWED,
        ACCESS_EXAMPLES.TERM_CONTRACT_ENDED,
      ],
    },
  )
  async propose(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: ProposalBodyDto) {
    try {
      const record = await this.proposals.submit(actor, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Get(':id/assessment')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestAssessmentGet', summary: 'Get the assessment of a proposal' })
  @ApiSuccessResponse(AssessmentResponseDto, {
    message: 'ACCESS_REQUEST.ASSESSMENT_FETCHED',
    description:
      'What the Employee declared and what the IT Admin has filled so far, the quote and the amount it gives, the control level and whether the assessment can be completed. Only the people of the request, the head, an IT Admin and, once it is completed, the spending approver read it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, ID_INVALID)
  async getAssessment(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestIdParamDto) {
    try {
      return { assessment: await this.assessmentReads.get(actor, params.id) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Put(':id/assessment')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'accessRequestAssessmentSave', summary: 'Fill the assessment of a proposal' })
  @ApiSuccessResponse(AssessmentResponseDto, {
    message: 'ACCESS_REQUEST.ASSESSMENT_SAVED',
    description:
      'The fields given are written and the ones that can be cleared take null; the others stay. It can be saved in several steps while the request waits for its assessment, and not once it is completed.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, NOT_AWAITING_ASSESSMENT, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'A field is invalid (VALIDATION_ERROR), a vendor, plan or person it names does not exist (ASSESSMENT.REFERENCE_NOT_FOUND), or the quote runs backwards (ASSESSMENT.QUOTE_PERIOD_INVALID) or is not in dong (ASSESSMENT.QUOTE_PRICE_NOT_VND; the price the vendor quoted in another currency goes in quote.originalPrice).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.REFERENCE_NOT_FOUND,
      EXAMPLES.QUOTE_PERIOD_INVALID,
      EXAMPLES.QUOTE_PRICE_NOT_VND,
      EXAMPLES.MONEY_SCALE_EXCEEDED,
      EXAMPLES.MONEY_OUT_OF_RANGE,
      EXAMPLES.CURRENCY_NOT_SUPPORTED,
    ],
  })
  async saveAssessment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: AssessmentPatchDto,
  ) {
    try {
      return { assessment: await this.assessments.save(actor, params.id, body) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Post(':id/assessment/completion')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'accessRequestAssessmentComplete', summary: 'Complete the assessment of a proposal' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.ASSESSMENT_COMPLETED',
    description:
      'The assessment is complete: the quote gives the request its amount and its payments, the step of the IT Admin ends, and the request waits for the head to send it on for a spend decision.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not waiting for its assessment (ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT), internal software is completed by registering it (ASSESSMENT.INTERNAL_COMPLETES_BY_REGISTRATION), a tool that cannot be controlled is refused at the gate (ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE), or a short proposal names internal software, whose plans are free (ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN): add the plan to the catalog and reject the proposal as not eligible, naming that plan, for the person to ask for it from the catalog.',
      examples: [
        EXAMPLES.NOT_AWAITING_ASSESSMENT,
        EXAMPLES.INTERNAL_COMPLETES_BY_REGISTRATION,
        EXAMPLES.CONTROL_LEVEL_UNCONTROLLABLE,
        EXAMPLES.SHORT_PROPOSAL_FREE_PLAN,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The assessment lacks fields, with the names in details.missing (ASSESSMENT.INCOMPLETE), the quote cannot price the request (ASSESSMENT.QUOTE_NOT_IN_FORCE, AMOUNT_TOO_LARGE, or QUOTE_PRICE_NOT_VND when the stored quote is not in dong: record it again in dong), or the time of use the person gave does not fit the kind of plan concluded (ASSESSMENT.TERM_NOT_FIT_KIND, with details.provisioningType, termMonths, maxMonths and the reason: a plan bought by the month takes 1 to 9 months; reject the request for the person to propose again with months that fit). Nothing is written and the request stays with the IT Admin. A plan bought once takes no months: completing it clears any the person gave.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.INCOMPLETE,
        EXAMPLES.QUOTE_NOT_IN_FORCE,
        EXAMPLES.AMOUNT_TOO_LARGE,
        EXAMPLES.QUOTE_PRICE_NOT_VND,
        EXAMPLES.TERM_NOT_FIT_KIND,
      ],
    },
  )
  async completeAssessment(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestIdParamDto) {
    try {
      const record = await this.completions.complete(actor, params.id);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Post(':id/assessment/rejection')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'accessRequestAssessmentReject', summary: 'Refuse a proposal at the gate' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.ASSESSMENT_REJECTED',
    description:
      'The IT Admin concludes that a tool cannot be controlled, or that the software is not eligible for the catalog, with the reason that must go with it and an alternative when there is one. The request ends as refused by IT: no spend step, no snapshot, no commitment, and nothing is added to the catalog. The person who asked and the head read the reason and the alternative in the assessment.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, NOT_AWAITING_ASSESSMENT, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The reason is missing or blank, or the kind is not one of the two (VALIDATION_ERROR); the alternative plan does not exist (ASSESSMENT.REFERENCE_NOT_FOUND). Nothing is written and the request stays with the IT Admin.',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.ALTERNATIVE_PLAN_NOT_FOUND],
  })
  async rejectAssessment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: AssessmentRejectionBodyDto,
  ) {
    try {
      const record = await this.rejections.reject(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Post(':id/internal-registration')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'accessRequestInternalRegister',
    summary: 'Register the internal software of a proposal',
  })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED',
    description:
      'The software the company built itself is registered in the catalog, answered for by the IT Admin who registers it, with one plan granted by hand, and the request goes the way that has no spend: the IT Admin grants it. No vendor, contract, subscription, invoice, commitment or seat bought is made. With a payment (a quote in the body) the request keeps its spend step and waits for the head to send it on.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not waiting for its assessment (ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT), was not classified as internal software (ASSESSMENT.NOT_INTERNAL), or the name is taken (APPLICATION.NAME_TAKEN).',
      examples: [EXAMPLES.NOT_AWAITING_ASSESSMENT, EXAMPLES.NOT_INTERNAL, EXAMPLES.NAME_TAKEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The data sensitivity is not known (ASSESSMENT.INCOMPLETE), the quote cannot price the request (ASSESSMENT.QUOTE_NOT_IN_FORCE and the others, ASSESSMENT.QUOTE_PRICE_NOT_VND when it is not in dong), or the body is invalid (VALIDATION_ERROR). Nothing is registered and the request stays with the IT Admin.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.INCOMPLETE_DATA_SENSITIVITY,
        EXAMPLES.QUOTE_PERIOD_INVALID,
        EXAMPLES.QUOTE_PRICE_NOT_VND,
        EXAMPLES.QUOTE_NOT_IN_FORCE,
        EXAMPLES.AMOUNT_TOO_LARGE,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
        EXAMPLES.CURRENCY_NOT_SUPPORTED,
      ],
    },
  )
  async registerInternal(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: InternalRegistrationBodyDto,
  ) {
    try {
      const record = await this.registrations.register(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }

  @Post(':id/catalog-link')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'accessRequestCatalogLink', summary: 'Link a proposal to its registered plan' })
  @ApiSuccessResponse(CatalogLinkResponseDto, {
    message: 'ACCESS_REQUEST.CATALOG_LINKED',
    description:
      'After the spending approver has decided the request, the IT Admin links it to the plan registered in the catalog; the plan may be one the catalog already had, when the IT Admin was told the software is there and the request goes on as a request for what the catalog has. The grant is possible only after this. With addToDepartmentList the application and the plan are also put in the list of software of the department of the request (departmentList.added is false when they were listed already); the list only guides, nothing it holds grants anything.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    // The link checks no assessor, so OWN_REQUEST is not reachable; a plan that does not exist is (PLAN_NOT_FOUND).
    {
      status: HttpStatus.FORBIDDEN,
      description: `${IT_ONLY_DESCRIPTION} With addToDepartmentList, the department of the request must be one the IT Admin is in charge of (DEPARTMENT.OUT_OF_SCOPE); nothing is written.`,
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: `${NOT_FOUND_DESCRIPTION} Or the plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND), or the department of the request does not (DEPARTMENT.NOT_FOUND).`,
      examples: [EXAMPLES.NOT_FOUND, EXAMPLES.PLAN_NOT_FOUND, EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not waiting for its grant or is already linked (ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED) or the application is retired (ACCESS_REQUEST.APPLICATION_RETIRED).',
      examples: [EXAMPLES.CATALOG_LINK_NOT_ALLOWED, EXAMPLES.APPLICATION_RETIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), or the plan is of another kind than the assessment concluded and the months of use the person gave do not fit it (ASSESSMENT.TERM_NOT_FIT_KIND, with details.provisioningType, termMonths, maxMonths and the reason: link a plan of a kind that takes them, or reject the request for the person to propose again), or the proposal is a short one that names an application of the catalog and the plan belongs to another application (ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH, with details.expectedApplicationId: only the plan of that application was assessed; a proposal of software that is new links to any plan), or the catalog no longer offers what the list of the department would hold (DEPARTMENT_SOFTWARE.NOT_IN_CATALOG). Nothing is written. A plan bought once takes no months: linking it clears any the person gave.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.TERM_NOT_FIT_KIND,
        EXAMPLES.CATALOG_LINK_APPLICATION_MISMATCH,
        EXAMPLES.DEPARTMENT_SOFTWARE_NOT_IN_CATALOG,
      ],
    },
  )
  async linkCatalogPlan(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: CatalogLinkBodyDto,
  ) {
    try {
      const linked = await this.links.link(actor, params.id, body);

      return { request: toWire(await this.queries.view(linked.request)), departmentList: linked.departmentList };
    } catch (error) {
      throw toAssessmentApiException(error);
    }
  }
}
