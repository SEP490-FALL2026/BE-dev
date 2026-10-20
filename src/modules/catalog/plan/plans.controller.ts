import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
  DeclarePlanBodyDto,
  ListPlansQueryDto,
  PlanDetailResponseDto,
  PlanIdParamDto,
  PlanPageResponseDto,
  PlanResponseDto,
  UpdatePlanBodyDto,
  WorkspaceProfileBodyDto,
  WorkspaceProfileResponseDto,
} from './plan.dto';
import { toPlanApiException } from './plan.http-errors';
import { seatTrackingOf } from './plan.policy';
import { PlanService } from './plan.service';
import type { PlanRecord, WorkspaceProfileView } from './plan.types';
import { PlanWorkspaceService } from './plan-workspace.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin declares or changes plans.' } as const;
const READERS = { status: HttpStatus.FORBIDDEN, description: 'Only the IT Admin and Finance read plans.' } as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule refuses it: PLAN.APPLICATION_NOT_FOUND, APPLICATION_RETIRED, NAME_INVALID, NOTE_INVALID, PROVISIONING_TYPE_NOT_SUPPORTED, PROVISIONING_TYPE_MISMATCH, PRICING_MODEL_REQUIRED, PRICING_MODEL_NOT_APPLICABLE, CONTROL_LEVEL_REQUIRED, DATA_LOSS_NOTE_REQUIRED or UPDATE_EMPTY.',
} as const;
const NAME_TAKEN = {
  status: HttpStatus.CONFLICT,
  description:
    'The application already has a plan of this name (PLAN.NAME_TAKEN) or the plan still has a workspace profile or a numeric install limit the new kind cannot keep (PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE, PLAN.TERMS_BLOCK_TYPE_CHANGE).',
} as const;
const NOT_FOUND = { status: HttpStatus.NOT_FOUND, description: 'The plan does not exist (PLAN.NOT_FOUND).' } as const;

function toPlanWire(plan: PlanRecord) {
  return {
    id: plan.id,
    applicationId: plan.applicationId,
    applicationName: plan.applicationName,
    name: plan.name,
    provisioningType: plan.provisioningType,
    pricingModel: plan.pricingModel,
    controlLevel: plan.controlLevel,
    revocationNote: plan.revocationNote,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    sharingPolicy: plan.sharingPolicy,
    seatTracking: seatTrackingOf(plan.pricingModel),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function toProfileWire(profile: WorkspaceProfileView) {
  return { ...profile, updatedAt: profile.updatedAt.toISOString() };
}

/**
 * The plans of an application (`US-04-02`). The IT Admin declares and changes them and keeps the workspace profile of a
 * K2 plan; Finance reads them. Finance, the department head, employees and the Super Admin change nothing (AC-11,
 * `SoD-1`, `SoD-5`). A plan is never deleted: there is no route that does. No route takes a password.
 */
@ApiTags('plans')
@Controller({ path: 'plans', version: '1' })
export class PlansController {
  constructor(
    private readonly plans: PlanService,
    private readonly workspace: PlanWorkspaceService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'planList', summary: 'List plans' })
  @ApiSuccessResponse(PlanPageResponseDto, {
    message: 'PLAN.LISTED',
    description: 'A page of plans by application then plan name, optionally for one application or one kind.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListPlansQueryDto) {
    try {
      const page = await this.plans.list(query);

      return { items: page.items.map(toPlanWire), pagination: page.pagination };
    } catch (error) {
      throw toPlanApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'planCreate', summary: 'Declare a plan' })
  @ApiSuccessResponse(PlanResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PLAN.CREATED',
    description: 'The plan is declared; seatTracking says whether seats are counted for it at all.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID, NAME_TAKEN)
  async declare(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DeclarePlanBodyDto) {
    try {
      return toPlanWire(await this.plans.declare(actor, body));
    } catch (error) {
      throw toPlanApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'planGet', summary: 'Get a plan' })
  @ApiSuccessResponse(PlanDetailResponseDto, {
    message: 'PLAN.FETCHED',
    description: 'The plan and, for a K2 plan that has one, its workspace profile.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not a UUID (VALIDATION_ERROR).',
  })
  async get(@Param() params: PlanIdParamDto) {
    try {
      const { plan, workspaceProfile } = await this.plans.get(params.id);

      return { ...toPlanWire(plan), workspaceProfile: workspaceProfile ? toProfileWire(workspaceProfile) : null };
    } catch (error) {
      throw toPlanApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'planUpdate', summary: 'Update a plan' })
  @ApiSuccessResponse(PlanResponseDto, {
    message: 'PLAN.UPDATED',
    description:
      'The plan as it is after the change; a change of nothing is answered the same and not audited. The application cannot change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID, NAME_TAKEN, NOT_FOUND)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PlanIdParamDto,
    @Body() body: UpdatePlanBodyDto,
  ) {
    try {
      return toPlanWire(await this.plans.update(actor, params.id, body));
    } catch (error) {
      throw toPlanApiException(error);
    }
  }

  @Put(':id/workspace-profile')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'planWorkspaceProfileSet', summary: 'Record the workspace profile of a K2 plan' })
  @ApiSuccessResponse(WorkspaceProfileResponseDto, {
    message: 'PLAN.WORKSPACE_PROFILE_SET',
    description:
      'The workspace profile replaces the previous one as a whole; it names the owners, the admins and the emergency account, and takes no password.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR) or a rule refuses it: PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE, WORKSPACE_PERSON_INVALID, PRIMARY_OWNER_NOT_LISTED, WORKSPACE_MEMBER_DUPLICATE, WORKSPACE_LIMIT_EXCEEDED or WORKSPACE_TEXT_INVALID.',
  })
  async setWorkspaceProfile(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PlanIdParamDto,
    @Body() body: WorkspaceProfileBodyDto,
  ) {
    try {
      return toProfileWire(await this.workspace.set(actor, params.id, body));
    } catch (error) {
      throw toPlanApiException(error);
    }
  }
}
