import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
  ChangeWorkspaceResponsibleBodyDto,
  CreateWorkspaceBodyDto,
  ListWorkspacesQueryDto,
  SetWorkspaceAdminsBodyDto,
  UpdateWorkspaceBodyDto,
  WorkspaceChangeResponseDto,
  WorkspaceDetailResponseDto,
  WorkspaceIdParamDto,
  WorkspacePageResponseDto,
} from './workspace.dto';
import { WORKSPACE_ERROR_EXAMPLES as EXAMPLES, toWorkspaceApiException } from './workspace.http-errors';
import { WorkspaceService } from './workspace.service';
import { WorkspaceAdminsService } from './workspace-admins.service';
import { WorkspaceResponsibleService } from './workspace-responsible.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin, Finance and the Super Admin read workspaces.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin makes or changes a workspace.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_RESPONSIBLE = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only an IT Admin changes a workspace, and only the one who answers for it (WORKSPACE.NOT_RESPONSIBLE): another IT Admin does not stand in for them.',
  examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The workspace does not exist (WORKSPACE.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The workspaces the company holds at its vendors (`QĐ-115c`). Any IT Admin makes one and answers for it; only that IT Admin changes it and its
 * administrators; only the Super Admin changes who answers for it (`QĐ-118d/f/l`). Every IT Admin, Finance and the Super Admin read them: the
 * catalog is the company's, not a department's. A workspace is never deleted, and no route takes a password.
 */
@ApiTags('workspaces')
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly admins: WorkspaceAdminsService,
    private readonly responsible: WorkspaceResponsibleService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'workspaceList', summary: 'List the workspaces held at vendors' })
  @ApiSuccessResponse(WorkspacePageResponseDto, {
    message: 'WORKSPACE.LISTED',
    description:
      'A page of workspaces by vendor name then workspace name, optionally for one vendor or those that carry one flag (too few administrators who work, no email of the company account, nobody in charge).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListWorkspacesQueryDto) {
    try {
      return await this.workspaces.list(query);
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'workspaceCreate', summary: 'Make a workspace at a vendor' })
  @ApiSuccessResponse(WorkspaceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'WORKSPACE.CREATED',
    description:
      'The workspace is made; the IT Admin who made it answers for it. The request names no one to answer for it, and the vendor never changes.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The vendor does not exist (VENDOR.NOT_FOUND).',
      examples: [EXAMPLES.VENDOR_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The vendor already has a workspace of this name, ignoring case (WORKSPACE.NAME_TAKEN).',
      examples: [EXAMPLES.NAME_TAKEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or a text is too long (WORKSPACE.TEXT_INVALID).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.TEXT_INVALID],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateWorkspaceBodyDto) {
    try {
      return await this.workspaces.create(actor, body);
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'workspaceGet', summary: 'Get a workspace' })
  @ApiSuccessResponse(WorkspaceDetailResponseDto, {
    message: 'WORKSPACE.FETCHED',
    description:
      'The workspace with its administrators (each marked when they no longer work as an IT Admin), its owner, the emergency account and the flags it carries.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not a UUID (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@Param() params: WorkspaceIdParamDto) {
    try {
      return await this.workspaces.get(params.id);
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'workspaceUpdate', summary: 'Change the profile of a workspace' })
  @ApiSuccessResponse(WorkspaceDetailResponseDto, {
    message: 'WORKSPACE.UPDATED',
    description:
      'The workspace as it is after the change, on the version the caller read (expectedUpdatedAt). The vendor and the person who answers for it do not change here.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_RESPONSIBLE,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The workspace changed since it was read (WORKSPACE.STALE, details.currentUpdatedAt) or the vendor already has a workspace of this name (WORKSPACE.NAME_TAKEN). Nothing is written.',
      examples: [EXAMPLES.STALE, EXAMPLES.NAME_TAKEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR: the version is required and at least one field must be named), a text is too long (WORKSPACE.TEXT_INVALID), the holder of the emergency account is not an IT Admin who can sign in (WORKSPACE.ADMIN_NOT_IT_ADMIN) or a limit is below the administrators named (WORKSPACE.LIMIT_EXCEEDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.TEXT_INVALID, EXAMPLES.ADMIN_NOT_IT_ADMIN, EXAMPLES.LIMIT_EXCEEDED],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: WorkspaceIdParamDto,
    @Body() body: UpdateWorkspaceBodyDto,
  ) {
    try {
      return await this.workspaces.update(actor, params.id, {
        ...body,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }

  @Put(':id/admins')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'workspaceAdminsSet', summary: 'Record who administers a workspace at the vendor' })
  @ApiSuccessResponse(WorkspaceDetailResponseDto, {
    message: 'WORKSPACE.ADMINS_SET',
    description:
      'The administrators are replaced as a whole on the version the caller read. At least two different IT Admins, the primary owner among them as an owner; whether they still work shows in the flags, not here.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_RESPONSIBLE,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The workspace changed since it was read (WORKSPACE.STALE, details.currentUpdatedAt). Nothing is written.',
      examples: [EXAMPLES.STALE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), a person is not an IT Admin who can sign in (WORKSPACE.ADMIN_NOT_IT_ADMIN, details.employeeId), the primary owner is not listed as an owner (WORKSPACE.PRIMARY_OWNER_NOT_ADMIN), fewer than two different people are named (WORKSPACE.ADMINS_TOO_FEW, details.given and details.minimum) or more owners or administrators than the limit of the workspace (WORKSPACE.LIMIT_EXCEEDED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.ADMIN_NOT_IT_ADMIN,
        EXAMPLES.PRIMARY_OWNER_NOT_ADMIN,
        EXAMPLES.ADMINS_TOO_FEW,
        EXAMPLES.LIMIT_EXCEEDED,
      ],
    },
  )
  async setAdmins(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: WorkspaceIdParamDto,
    @Body() body: SetWorkspaceAdminsBodyDto,
  ) {
    try {
      return await this.admins.set(actor, params.id, { ...body, expectedUpdatedAt: new Date(body.expectedUpdatedAt) });
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }

  @Post(':id/responsible-it-admin')
  @RequireRoles('SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'workspaceResponsibleItAdminChange',
    summary: 'Name the IT Admin who answers for a workspace',
  })
  @ApiSuccessResponse(WorkspaceChangeResponseDto, {
    message: 'WORKSPACE.RESPONSIBLE_CHANGED',
    description:
      'The workspace as it is after the change; changed is false when the IT Admin named already answered for it and nothing was written. The audit trail names who changed it, from whom to whom and the reason.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin names who answers for a workspace.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the person named is not an IT Admin who works now (WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN): nothing changes.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN],
    },
  )
  async changeResponsible(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: WorkspaceIdParamDto,
    @Body() body: ChangeWorkspaceResponsibleBodyDto,
  ) {
    try {
      const { workspace, changed } = await this.responsible.change(actor, params.id, body);

      return { ...workspace, changed };
    } catch (error) {
      throw toWorkspaceApiException(error);
    }
  }
}
