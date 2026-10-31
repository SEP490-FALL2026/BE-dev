import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
import { CostCenterService } from './cost-center.service';
import { CostCenterRecord } from './cost-center.types';
import {
  CostCenterEmployeesResponseDto,
  CostCenterIdParamDto,
  CostCenterPageResponseDto,
  CostCenterResponseDto,
  CreateCostCenterBodyDto,
  ListCostCenterEmployeesQueryDto,
  ListCostCentersQueryDto,
  RenameCostCenterBodyDto,
} from './cost-center.dto';
import { COST_CENTER_ERROR_EXAMPLES, toCostCenterApiException } from './cost-center.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance maintains the Cost Center catalogue (the IT Admin and the Super Admin do not).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/** Reading the people of a cost center is Finance's too: no other role, the Super Admin included, reads them. */
const FINANCE_READS_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance reads the people in a cost center (the IT Admin and the Super Admin do not).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The cost center does not exist.',
  examples: [COST_CENTER_ERROR_EXAMPLES.COST_CENTER_NOT_FOUND],
} as const;

const VALIDATION_ERROR_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR), the kind is not UNIT (COST_CENTER.KIND_NOT_SUPPORTED), the name is empty, too long (COST_CENTER.NAME_INVALID) or reserved (COST_CENTER.NAME_RESERVED), or the department does not exist or is no longer in use (COST_CENTER.DEPARTMENT_NOT_ACTIVE).';

/** A new cost center: the request, its kind, its name or its department. */
const CREATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_DEPARTMENT_NOT_ACTIVE,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_KIND_NOT_SUPPORTED,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_NAME_INVALID,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_NAME_RESERVED,
  ],
} as const;

/** A new name: the request or the name. */
const RENAME_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [
    VALIDATION_EXAMPLE,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_NAME_INVALID,
    COST_CENTER_ERROR_EXAMPLES.COST_CENTER_NAME_RESERVED,
  ],
} as const;

/** The read of the people of a cost center takes an id and a paging query, no kind and no name. */
const ID_OR_QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/** The routes that take no kind or name: only the request itself can be invalid. */
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;

function toWire(record: CostCenterRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    kind: record.kind,
    status: record.status,
    department: record.department,
    linkedAt: record.linkedAt ? record.linkedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deactivatedAt: record.deactivatedAt ? record.deactivatedAt.toISOString() : null,
  };
}

/**
 * The Cost Center catalogue (`US-04-09`). Finance creates, renames and retires; the Super Admin, who owns the departments, may
 * read it to see which still have none; the IT Admin has no operation on it (AC-2, `QĐ-87a`). Every other role is refused. Who may
 * is decided by the policy of the service as well as by the role of the route. There is no route that deletes a cost
 * center: a code that has been used is kept.
 */
@ApiTags('cost-centers')
@Controller({ path: 'cost-centers', version: '1' })
export class CostCentersController {
  constructor(private readonly costCenters: CostCenterService) {}

  @Get()
  @RequireRoles('FINANCE', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'costCenterList', summary: 'List cost centers' })
  @ApiSuccessResponse(CostCenterPageResponseDto, {
    message: 'COST_CENTER.LISTED',
    description: 'A page of cost centers in code order, with the department each belongs to and since when.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the Super Admin read the Cost Center catalogue.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListCostCentersQueryDto) {
    try {
      const page = await this.costCenters.list(actor, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toCostCenterApiException(error);
    }
  }

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterCreate', summary: 'Add a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    status: HttpStatus.CREATED,
    message: 'COST_CENTER.CREATED',
    description:
      "The cost center is in the catalogue, in use, created for the department: it is the department's current one from now on.",
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, CREATE_INVALID, {
    status: HttpStatus.CONFLICT,
    description:
      'The code is already taken (COST_CENTER.CODE_TAKEN), or the department already has a cost center in use (COST_CENTER.DEPARTMENT_ALREADY_LINKED).',
    examples: [
      COST_CENTER_ERROR_EXAMPLES.COST_CENTER_CODE_TAKEN,
      COST_CENTER_ERROR_EXAMPLES.COST_CENTER_DEPARTMENT_ALREADY_LINKED,
    ],
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateCostCenterBodyDto) {
    try {
      return toWire(await this.costCenters.create(actor, body));
    } catch (error) {
      throw toCostCenterApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterRename', summary: 'Rename a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    message: 'COST_CENTER.RENAMED',
    description: 'The cost center has its new name; its code, department and history do not change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, RENAME_INVALID, NOT_FOUND)
  async rename(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CostCenterIdParamDto,
    @Body() body: RenameCostCenterBodyDto,
  ) {
    try {
      return toWire(await this.costCenters.rename(actor, params.id, body.name));
    } catch (error) {
      throw toCostCenterApiException(error);
    }
  }

  @Post(':id/deactivate')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterDeactivate', summary: 'Retire a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    message: 'COST_CENTER.DEACTIVATED',
    description:
      'The cost center is no longer in use and its department goes back to an incomplete finance configuration. If it is already retired, the answer is the same.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description:
      'Open obligations sit on it (COST_CENTER.IN_USE; details lists the department and, with their totals, the Requests with a cost that are not over and the commitments still held). The people in the department do not block it.',
    examples: [COST_CENTER_ERROR_EXAMPLES.COST_CENTER_IN_USE],
  })
  async deactivate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CostCenterIdParamDto) {
    try {
      return toWire(await this.costCenters.deactivate(actor, params.id));
    } catch (error) {
      throw toCostCenterApiException(error);
    }
  }

  @Get(':id/employees')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterEmployeeList', summary: 'List the people in a cost center' })
  @ApiSuccessResponse(CostCenterEmployeesResponseDto, {
    message: 'COST_CENTER.EMPLOYEES_LISTED',
    description:
      'The people in the cost center today, reduced to code, name and that they are working: no email, contract, dates or manager.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_READS_ONLY, ID_OR_QUERY_INVALID, NOT_FOUND)
  async employees(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CostCenterIdParamDto,
    @Query() query: ListCostCenterEmployeesQueryDto,
  ) {
    try {
      return await this.costCenters.employees(actor, params.id, query);
    } catch (error) {
      throw toCostCenterApiException(error);
    }
  }
}
