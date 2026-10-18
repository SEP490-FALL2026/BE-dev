import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
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
} from './dto/cost-center.dto';
import { toOrganizationApiException } from './organization.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance maintains the Cost Center catalogue.',
} as const;

const NOT_FOUND = { status: HttpStatus.NOT_FOUND, description: 'The cost center does not exist.' } as const;

const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR), the kind is not UNIT or COMPANY (COST_CENTER.KIND_NOT_SUPPORTED), or the name is empty, too long (COST_CENTER.NAME_INVALID) or reserved (COST_CENTER.NAME_RESERVED).',
} as const;

function toWire(record: CostCenterRecord) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    kind: record.kind,
    status: record.status,
    department: record.department,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deactivatedAt: record.deactivatedAt ? record.deactivatedAt.toISOString() : null,
  };
}

/**
 * The Cost Center catalogue (`US-04-09`). Finance creates, renames and retires; the IT Admin may read it (to pick a
 * free `UNIT` for a department) but not change it (AC-2). Every other role is refused, the Super Admin included
 * (`SoD-1`). There is no route that deletes a cost center: a code that has been used is kept.
 */
@ApiTags('cost-centers')
@Controller({ path: 'cost-centers', version: '1' })
export class CostCentersController {
  constructor(private readonly costCenters: CostCenterService) {}

  @Get()
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'costCenterList', summary: 'List cost centers' })
  @ApiSuccessResponse(CostCenterPageResponseDto, {
    message: 'COST_CENTER.LISTED',
    description: 'A page of cost centers in code order, with the department charged to each.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance and the IT Admin read the Cost Center catalogue.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query is invalid (VALIDATION_ERROR).' },
  )
  async list(@Query() query: ListCostCentersQueryDto) {
    try {
      const page = await this.costCenters.list(query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterCreate', summary: 'Add a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    status: HttpStatus.CREATED,
    message: 'COST_CENTER.CREATED',
    description: 'The cost center is in the catalogue, in use, with no department yet.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VALIDATION_ERROR, {
    status: HttpStatus.CONFLICT,
    description: 'The code is already taken (COST_CENTER.CODE_TAKEN).',
  })
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateCostCenterBodyDto) {
    try {
      return toWire(await this.costCenters.create(actor, body));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterRename', summary: 'Rename a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    message: 'COST_CENTER.RENAMED',
    description: 'The cost center has its new name; its code, department and history do not change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async rename(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CostCenterIdParamDto,
    @Body() body: RenameCostCenterBodyDto,
  ) {
    try {
      return toWire(await this.costCenters.rename(actor, params.id, body.name));
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }

  @Post(':id/deactivate')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'costCenterDeactivate', summary: 'Retire a cost center' })
  @ApiSuccessResponse(CostCenterResponseDto, {
    message: 'COST_CENTER.DEACTIVATED',
    description: 'The cost center is no longer in use. If it is already retired, the answer is the same.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VALIDATION_ERROR, NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description:
      'The department charged to it still has people (COST_CENTER.IN_USE; details lists the department and the people).',
  })
  async deactivate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CostCenterIdParamDto) {
    try {
      return toWire(await this.costCenters.deactivate(actor, params.id));
    } catch (error) {
      throw toOrganizationApiException(error);
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
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VALIDATION_ERROR, NOT_FOUND)
  async employees(@Param() params: CostCenterIdParamDto, @Query() query: ListCostCenterEmployeesQueryDto) {
    try {
      return await this.costCenters.employees(params.id, query);
    } catch (error) {
      throw toOrganizationApiException(error);
    }
  }
}
