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
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LICENSING_ERROR_EXAMPLES } from '../licensing.http-errors';
import { DepartmentSoftwareChangesService } from './department-software-changes.service';
import { DepartmentSoftwareQueryService } from './department-software-query.service';
import {
  DepartmentSoftwareChangesBodyDto,
  DepartmentSoftwareChangesResponseDto,
  DepartmentSoftwareIdParamDto,
  DepartmentSoftwareListResponseDto,
  DepartmentSoftwareQueryDto,
  MyDepartmentSoftwareListResponseDto,
} from './department-software.dto';
import {
  DEPARTMENT_SOFTWARE_ERROR_EXAMPLES as EXAMPLES,
  toDepartmentSoftwareApiException,
} from './department-software.http-errors';

const LIST_ORDER =
  'One page, the places added last first and then by entry id, with the application and the plan by name and the note of the IT Admin. The list only guides: it grants nothing, and software of the catalog that is not in it is asked for as usual.';

/**
 * The list of software of a department (`QĐ-110s`, `QĐ-111c`, SPEC P16, P17): the applications and plans of the catalog the IT Admin in
 * charge lists for the people who ask for software. Read by the people of the department, its head, every IT Admin and the Super Admin;
 * changed only by an IT Admin in charge of the department. The proposals to add to it are `DepartmentSoftwareProposalsController`.
 */
@ApiTags('department-software-list')
@Controller({ version: '1' })
export class DepartmentSoftwareController {
  constructor(
    private readonly queries: DepartmentSoftwareQueryService,
    private readonly changes: DepartmentSoftwareChangesService,
  ) {}

  @Get('departments/:id/software-list')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'departmentSoftwareList', summary: 'List the software of a department' })
  @ApiSuccessResponse(DepartmentSoftwareListResponseDto, {
    message: 'DEPARTMENT_SOFTWARE.LISTED',
    description: `Available to the people placed in the department today, its head, every IT Admin and the Super Admin. ${LIST_ORDER}`,
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not of the department, is not its head and is neither an IT Admin nor the Super Admin (DEPARTMENT.OUT_OF_SCOPE).',
      examples: [LICENSING_ERROR_EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The department does not exist (DEPARTMENT.NOT_FOUND).',
      examples: [LICENSING_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentSoftwareIdParamDto,
    @Query() query: DepartmentSoftwareQueryDto,
  ) {
    try {
      const page = await this.queries.listOf(actor, params.id, query);

      return { departmentId: params.id, items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }

  @Post('departments/:id/software-list/changes')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'departmentSoftwareListChange',
    summary: 'Add places to the list of a department and take places out of it',
  })
  @ApiSuccessResponse(DepartmentSoftwareChangesResponseDto, {
    message: 'DEPARTMENT_SOFTWARE.CHANGED',
    description:
      'Only an IT Admin in charge of the department changes its list. The entries to take out are removed first, then the places to add are written (up to 50 of each), in one transaction: a place that is not in the catalog (422), one that is already listed (409) or an entry that is not in this department (404) refuses the whole call and writes nothing. The answer lists the entries written, with their ids, and the ids taken out. The Audit Trail records each place added or taken out.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Not an IT Admin (AUTHORIZATION.FORBIDDEN), or an IT Admin who is not in charge of this department (DEPARTMENT.OUT_OF_SCOPE).',
      examples: [FORBIDDEN_EXAMPLE, LICENSING_ERROR_EXAMPLES.DEPARTMENT_OUT_OF_SCOPE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The department does not exist (DEPARTMENT.NOT_FOUND), or an entry to take out is not in its list (DEPARTMENT_SOFTWARE.ENTRY_NOT_FOUND, with the ids).',
      examples: [LICENSING_ERROR_EXAMPLES.DEPARTMENT_NOT_FOUND, EXAMPLES.ENTRY_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'A place to add is already in the list (DEPARTMENT_SOFTWARE.ALREADY_LISTED, with the places).',
      examples: [EXAMPLES.ALREADY_LISTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: nothing to do, more than 50, the same place or entry twice), or a place is not in the catalog (DEPARTMENT_SOFTWARE.NOT_IN_CATALOG, with the places): an application that does not exist or is retired, or a plan that is not one of that application.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NOT_IN_CATALOG],
    },
  )
  async change(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DepartmentSoftwareIdParamDto,
    @Body() body: DepartmentSoftwareChangesBodyDto,
  ) {
    try {
      return await this.changes.change(actor, params.id, {
        add: (body.add ?? []).map((item) => ({
          applicationId: item.applicationId,
          planId: item.planId ?? null,
          note: item.note ?? null,
        })),
        remove: body.remove ?? [],
      });
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }

  @Get('me/department-software-list')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meDepartmentSoftwareList', summary: 'List the software of my department' })
  @ApiSuccessResponse(MyDepartmentSoftwareListResponseDto, {
    message: 'ME.DEPARTMENT_SOFTWARE_LISTED',
    description: `Available to every signed-in account: the list of the department the caller is placed in today, so nobody reads another department's. An account placed nowhere gets no department and an empty page. The screen to ask for software shows this list first, with a way to the whole catalog. ${LIST_ORDER}`,
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async mine(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: DepartmentSoftwareQueryDto) {
    try {
      const { departmentId, page } = await this.queries.listOfMine(actor, query);

      return { departmentId, items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toDepartmentSoftwareApiException(error);
    }
  }
}
