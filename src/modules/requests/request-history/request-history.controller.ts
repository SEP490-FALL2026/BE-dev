import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
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
  AccessRequestHistoryPageResponseDto,
  DepartmentAccessRequestPageResponseDto,
  DepartmentHistoryQueryDto,
  HistoryIdParamDto,
  OversightHistoryQueryDto,
} from './request-history.dto';
import { REQUEST_HISTORY_ERROR_EXAMPLES, toRequestHistoryApiException } from './request-history.http-errors';
import { RequestHistoryService } from './request-history.service';

const ROW_DESCRIPTION =
  'Each row names the plan or the proposed software, who sent it and who it is for, the department it was sent from, its state, its one-step or via-head routing, who it waits for at the need step, where a request that costs money stands on its way to the spending approver, the reason when it was refused, when it was withdrawn, and whether the head confirmed the use of the reserve. No price, amount, figure of a budget, result of a check, commitment or reason Finance wrote is answered; the detail, the time, the people and the history of a request are read by its id.';

/**
 * The history of requests by role, for the people who oversee them (`FR-3.7`, `SoD-3`, `SoD-7`): a request that was decided stays
 * in the history of its head, its spending approver, Finance and the IT Admin. Read only.
 */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class RequestHistoryController {
  constructor(private readonly history: RequestHistoryService) {}

  @Get('departments/:id/access-requests')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'departmentAccessRequestList', summary: 'List the requests of the department I head' })
  @ApiSuccessResponse(DepartmentAccessRequestPageResponseDto, {
    message: 'ACCESS_REQUEST_HISTORY.DEPARTMENT_LISTED',
    description: `One page of every request sent from the department the caller heads today, in every state (decided, completed, refused, withdrawn and cancelled included), the newest sent first and then by id: pageSize 1 to 100, 20 when left out. The department of a request is the one it was sent from: a request of a person who left or moved away stays, a request a person who moved in sent from their former department is not here, and a one-step request of the head is here. Narrowed by view (open or ended), by one or more states, by type, by the moment it was sent and by a person who sent it or is one of the people for it. awaitingMe says that it waits for the head now. ${ROW_DESCRIPTION}`,
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only a department head reads the requests of a department, and only of the department they head today (AUTHORIZATION.FORBIDDEN for any other role, ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE for the head of another department).',
      examples: [FORBIDDEN_EXAMPLE, REQUEST_HISTORY_ERROR_EXAMPLES.OUT_OF_SCOPE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The department does not exist (ACCESS_REQUEST_HISTORY.DEPARTMENT_NOT_FOUND).',
      examples: [REQUEST_HISTORY_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id, the page, its size, the view, the states, the type, the person or the window of the moment sent is invalid, or a parameter that is not listed is given (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async department(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: HistoryIdParamDto,
    @Query() query: DepartmentHistoryQueryDto,
  ) {
    try {
      return await this.history.departmentPage(actor, params.id, query);
    } catch (error) {
      throw toRequestHistoryApiException(error);
    }
  }

  @Get('access-requests')
  @RequireRoles('IT_ADMIN', 'SPENDING_APPROVER', 'FINANCE')
  @ApiOperation({ operationId: 'accessRequestList', summary: 'List the requests my role oversees' })
  @ApiSuccessResponse(AccessRequestHistoryPageResponseDto, {
    message: 'ACCESS_REQUEST_HISTORY.LISTED',
    description: `One page of the requests the role of the caller oversees, in every state, the newest sent first and then by id: pageSize 1 to 100, 20 when left out. An IT Admin reads every request sent in the organization; a spending approver the requests a spend step was opened on (one-step requests included), decided or not; Finance the requests whose spend was approved, so a commitment was made, released since or not. A caller with more than one of these roles reads all they reach. A draft is never listed. Narrowed by view (open or ended), by one or more states, by type, by the moment it was sent, by department, by a person who sent it or is one of the people for it, and by the flags ONE_STEP and RESERVE_USED. ${ROW_DESCRIPTION}`,
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin, a spending approver or Finance reads the requests of the organization (AUTHORIZATION.FORBIDDEN): a department head reads those of their department, a person their own, and the Super Admin reads no request.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The page, its size, the view, the states, the type, the department, the person, the flags or the window of the moment sent is invalid, or a parameter that is not listed is given (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async oversight(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: OversightHistoryQueryDto) {
    try {
      return await this.history.oversightPage(actor, query);
    } catch (error) {
      throw toRequestHistoryApiException(error);
    }
  }
}
