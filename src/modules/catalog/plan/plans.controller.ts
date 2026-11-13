import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
import { PLAN_ERROR_EXAMPLES as EXAMPLES, toPlanApiException } from './plan.http-errors';
import { seatTrackingOf } from './plan.policy';
import { PlanService } from './plan.service';
import type { PlanRecord, PlanSummaryRecord, WorkspaceProfileView } from './plan.types';
import { PlanWorkspaceService } from './plan-workspace.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin declares or changes plans.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read plans.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const INVALID_DESCRIPTION =
  'The request is invalid (VALIDATION_ERROR) or a rule refuses it: PLAN.APPLICATION_NOT_FOUND, APPLICATION_RETIRED, NAME_INVALID, NOTE_INVALID, PROVISIONING_TYPE_NOT_SUPPORTED, PROVISIONING_TYPE_MISMATCH, PRICING_MODEL_REQUIRED, PRICING_MODEL_NOT_APPLICABLE, CONTROL_LEVEL_REQUIRED, DATA_LOSS_NOTE_REQUIRED, ADMIN_CONSOLE_NOT_APPLICABLE (the flag hasAdminConsole belongs to a K4 plan alone) or UPDATE_EMPTY.';
/** The rule refusals of the shape of a plan, met by a declaration and by a change alike. */
const SHAPE_EXAMPLES = [
  EXAMPLES.NAME_INVALID,
  EXAMPLES.NOTE_INVALID,
  EXAMPLES.PROVISIONING_TYPE_NOT_SUPPORTED,
  EXAMPLES.PROVISIONING_TYPE_MISMATCH,
  EXAMPLES.PRICING_MODEL_REQUIRED,
  EXAMPLES.PRICING_MODEL_NOT_APPLICABLE,
  EXAMPLES.CONTROL_LEVEL_REQUIRED,
  EXAMPLES.DATA_LOSS_NOTE_REQUIRED,
  EXAMPLES.ADMIN_CONSOLE_NOT_APPLICABLE,
] as const;
const DECLARE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: INVALID_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE, EXAMPLES.APPLICATION_NOT_FOUND, EXAMPLES.APPLICATION_RETIRED, ...SHAPE_EXAMPLES],
} as const;
const UPDATE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: INVALID_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE, ...SHAPE_EXAMPLES, EXAMPLES.UPDATE_EMPTY],
} as const;
const CONFLICT_DESCRIPTION =
  'The application already has a plan of this name (PLAN.NAME_TAKEN) or the plan still has a workspace profile or a numeric install limit the new kind cannot keep (PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE, PLAN.TERMS_BLOCK_TYPE_CHANGE), or a subscription or license key of the plan would no longer fit the new pricing model or kind (PLAN.IN_USE_BLOCKS_CHANGE, `details.reason`: ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY, LICENSE_KEYS or SUBSCRIPTIONS).';
const DECLARE_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description: CONFLICT_DESCRIPTION,
  examples: [EXAMPLES.NAME_TAKEN],
} as const;
const UPDATE_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description: CONFLICT_DESCRIPTION,
  examples: [
    EXAMPLES.NAME_TAKEN,
    EXAMPLES.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE,
    EXAMPLES.TERMS_BLOCK_TYPE_CHANGE,
    EXAMPLES.IN_USE_BLOCKS_CHANGE,
  ],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The plan does not exist (PLAN.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

function toPlanSummaryWire(plan: PlanSummaryRecord) {
  return {
    id: plan.id,
    applicationId: plan.applicationId,
    applicationName: plan.applicationName,
    name: plan.name,
    provisioningType: plan.provisioningType,
    pricingModel: plan.pricingModel,
    controlLevel: plan.controlLevel,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    sharingPolicy: plan.sharingPolicy,
    hasAdminConsole: plan.hasAdminConsole,
    seatTracking: seatTrackingOf(plan.pricingModel),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function toPlanWire(plan: PlanRecord) {
  return { ...toPlanSummaryWire(plan), revocationNote: plan.revocationNote };
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
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListPlansQueryDto) {
    try {
      const page = await this.plans.list(query);

      return { items: page.items.map(toPlanSummaryWire), pagination: page.pagination };
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
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, DECLARE_INVALID, DECLARE_CONFLICT)
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
    examples: [VALIDATION_EXAMPLE],
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
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, UPDATE_INVALID, UPDATE_CONFLICT, NOT_FOUND)
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
  @ApiOperation({ operationId: 'planWorkspaceProfileSet', summary: 'Record who administers a plan at the vendor' })
  @ApiSuccessResponse(WorkspaceProfileResponseDto, {
    message: 'PLAN.WORKSPACE_PROFILE_SET',
    description:
      'The workspace profile replaces the previous one as a whole; it names the owners, the admins and the emergency account, the email of the company account that owns the plan at the vendor (optional) and a free note, and takes no password. Only a plan that needs admins at the vendor has one: a K2 plan, or a K4 plan with an admin console. The owners and admins are at least two different IT Admins who work now.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR) or a rule refuses it: PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE, WORKSPACE_PERSON_INVALID, PRIMARY_OWNER_NOT_LISTED, WORKSPACE_MEMBER_DUPLICATE, WORKSPACE_LIMIT_EXCEEDED, WORKSPACE_TEXT_INVALID or VENDOR_ADMINS_INVALID (fewer than two different IT Admins).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.WORKSPACE_PROFILE_NOT_APPLICABLE,
      EXAMPLES.WORKSPACE_PERSON_INVALID,
      EXAMPLES.PRIMARY_OWNER_NOT_LISTED,
      EXAMPLES.WORKSPACE_MEMBER_DUPLICATE,
      EXAMPLES.WORKSPACE_LIMIT_EXCEEDED,
      EXAMPLES.WORKSPACE_TEXT_INVALID,
      EXAMPLES.VENDOR_ADMINS_INVALID,
    ],
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
