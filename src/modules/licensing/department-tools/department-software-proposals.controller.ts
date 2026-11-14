import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { DepartmentSoftwareProposalService } from './department-software-proposal.service';
import { DepartmentSoftwareQueryService } from './department-software-query.service';
import {
  DepartmentSoftwareAcceptanceResponseDto,
  DepartmentSoftwareIdParamDto,
  DepartmentSoftwareProposalBodyDto,
  DepartmentSoftwareProposalListResponseDto,
  DepartmentSoftwareProposalQueryDto,
  DepartmentSoftwareProposalResponseDto,
  DepartmentSoftwareRejectionBodyDto,
} from './department-software.dto';
import {
  DEPARTMENT_SOFTWARE_ERROR_EXAMPLES as EXAMPLES,
  toDepartmentSoftwareApiException,
} from './department-software.http-errors';

/**
 * The proposals to add software to the list of a department (`QĐ-110t`, `QĐ-111c`, SPEC P18): the head of the department proposes a place of
 * the catalog with a reason, the IT Admin in charge accepts it into the list or rejects it with a reason. Software the catalog does not have
 * is asked for as new software (case B), not proposed here.
 */
@ApiTags('department-software-proposals')
@Controller({ path: 'department-software-proposals', version: '1' })
export class DepartmentSoftwareProposalsController {
  constructor(
    private readonly proposals: DepartmentSoftwareProposalService,
    private readonly queries: DepartmentSoftwareQueryService,
  ) {}

  @Post()
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'departmentSoftwareProposalCreate',
    summary: 'Propose a place of the catalog for the list of my department',
  })
  @ApiSuccessResponse(DepartmentSoftwareProposalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT_SOFTWARE.PROPOSED',
    description:
      'Only the head of a department proposes, and for the department they lead: the body names no department. The application must be in the catalog (not retired) and a plan, when given, one of that application. The proposal waits for the IT Admin in charge, who is told; there is one open proposal for each application and plan of a department. The list only guides: an accepted place grants nothing.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Not a department head (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The place is already in the list of the department (DEPARTMENT_SOFTWARE.ALREADY_LISTED), or one proposal for it is open (DEPARTMENT_SOFTWARE.PROPOSAL_ALREADY_OPEN).',
      examples: [EXAMPLES.ALREADY_LISTED, EXAMPLES.PROPOSAL_ALREADY_OPEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a reason is required), or the place is not in the catalog (DEPARTMENT_SOFTWARE.NOT_IN_CATALOG): ask for it as new software instead.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NOT_IN_CATALOG],
    },
  )
  async propose(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DepartmentSoftwareProposalBodyDto) {
    try {
      return {
        proposal: await this.proposals.propose(actor, {
          applicationId: body.applicationId,
          planId: body.planId ?? null,
          reason: body.reason,
        }),
      };
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }

  @Get()
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({
    operationId: 'departmentSoftwareProposalList',
    summary: 'List the proposals for the lists of software',
  })
  @ApiSuccessResponse(DepartmentSoftwareProposalListResponseDto, {
    message: 'DEPARTMENT_SOFTWARE.PROPOSALS_LISTED',
    description:
      'One page, the newest proposals first and then by id. An IT Admin reads those of the departments they are in charge of, a department head those of the department they lead (both, for a person who is both); the filter by department or state outside that scope gives an empty page. Each names the application and plan, the head who proposed, the reason, and for a decided one when and, for a rejection, why.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Neither an IT Admin nor a department head (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: DepartmentSoftwareProposalQueryDto) {
    try {
      const page = await this.queries.proposals(actor, query);

      return { items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }

  @Post(':id/acceptance')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentSoftwareProposalAccept',
    summary: 'Accept a proposal: the place goes in the list of the department',
  })
  @ApiSuccessResponse(DepartmentSoftwareAcceptanceResponseDto, {
    message: 'DEPARTMENT_SOFTWARE.PROPOSAL_ACCEPTED',
    description:
      'Only an IT Admin in charge of the proposal’s department accepts. The place is added to the list at once and the head who proposed is told; entryId is the entry in the list (the one that was already there when an IT Admin had added the place meanwhile). A proposal is decided once.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Not an IT Admin (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The proposal does not exist, or its department is not one the IT Admin is in charge of (DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND).',
      examples: [EXAMPLES.PROPOSAL_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal was decided already (DEPARTMENT_SOFTWARE.PROPOSAL_NOT_PENDING).',
      examples: [EXAMPLES.PROPOSAL_NOT_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id is invalid (VALIDATION_ERROR), or the catalog no longer offers the place, say its application was retired (DEPARTMENT_SOFTWARE.NOT_IN_CATALOG): reject the proposal instead.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NOT_IN_CATALOG],
    },
  )
  async accept(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: DepartmentSoftwareIdParamDto) {
    try {
      return await this.proposals.accept(actor, params.id);
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }

  @Post(':id/rejection')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentSoftwareProposalReject',
    summary: 'Reject a proposal with a reason',
  })
  @ApiSuccessResponse(DepartmentSoftwareProposalResponseDto, {
    message: 'DEPARTMENT_SOFTWARE.PROPOSAL_REJECTED',
    description:
      'Only an IT Admin in charge of the proposal’s department rejects, and the reason is required: the head who proposed reads it in their notice. Nothing is added to the list. A proposal is decided once, and the place can be proposed again.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Not an IT Admin (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The proposal does not exist, or its department is not one the IT Admin is in charge of (DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND).',
      examples: [EXAMPLES.PROPOSAL_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal was decided already (DEPARTMENT_SOFTWARE.PROPOSAL_NOT_PENDING).',
      examples: [EXAMPLES.PROPOSAL_NOT_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the body is invalid (VALIDATION_ERROR: the reason is required).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async reject(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentSoftwareIdParamDto,
    @Body() body: DepartmentSoftwareRejectionBodyDto,
  ) {
    try {
      return { proposal: await this.proposals.reject(actor, params.id, body.reason) };
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }
}
