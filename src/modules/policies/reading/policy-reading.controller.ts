import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyCodeParamDto } from '../library/library.dto';
import { LIBRARY_ERROR_EXAMPLES as EXAMPLES, toLibraryApiException } from '../library/library.http-errors';
import {
  PolicyDetailQueryDto,
  PolicyDetailResponseDto,
  PolicyPageQueryDto,
  PolicyPageResponseDto,
  PolicyStepParamDto,
  PolicyStepResponseDto,
  PolicyVersionPageResponseDto,
} from './policy-reading.dto';
import { PolicyReadingQueryService } from './policy-reading-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const VALIDATION_422 = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The code, the step or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'No such policy (POLICY.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const NOT_PUBLISHED = {
  status: HttpStatus.CONFLICT,
  description: 'The policy has no published version yet (POLICY.NOT_PUBLISHED).',
  examples: [EXAMPLES.NOT_PUBLISHED],
} as const;

/** The policies every account may read: the fixed set, the version in force, the history and the checklist of a step. */
@ApiTags('policies')
@Controller({ path: 'policies', version: '1' })
export class PolicyReadingController {
  constructor(private readonly reading: PolicyReadingQueryService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'policyList', summary: 'List the policies in force' })
  @ApiSuccessResponse(PolicyPageResponseDto, {
    message: 'POLICY.LIST_FETCHED',
    description:
      'The policies of the library by code, each with the version in force and whether the caller owes an acknowledgement of it (PENDING, DONE, or NOT_REQUIRED when it applies to none of their roles).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422)
  async list(@CurrentPrincipal() caller: AuthenticatedPrincipal, @Query() query: PolicyPageQueryDto) {
    try {
      return await this.reading.list(caller, query.page, query.pageSize);
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Get(':code')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'policyGet', summary: 'Read a policy with its text' })
  @ApiSuccessResponse(PolicyDetailResponseDto, {
    message: 'POLICY.FETCHED',
    description:
      'The version in force, or the published version asked for: its sections and the steps with their checklists, the ground of its issue and the roles it applies to.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422, NOT_FOUND, NOT_PUBLISHED)
  async get(
    @CurrentPrincipal() caller: AuthenticatedPrincipal,
    @Param() params: PolicyCodeParamDto,
    @Query() query: PolicyDetailQueryDto,
  ) {
    try {
      return await this.reading.detail(caller, params.code, query.version);
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Get(':code/versions')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'policyVersionList', summary: 'List the published versions of a policy' })
  @ApiSuccessResponse(PolicyVersionPageResponseDto, {
    message: 'POLICY.VERSIONS_FETCHED',
    description: 'A page of the published versions, the newest first, each with the ground of its issue.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422, NOT_FOUND)
  async versions(@Param() params: PolicyCodeParamDto, @Query() query: PolicyPageQueryDto) {
    try {
      return await this.reading.versions(params.code, query.page, query.pageSize);
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Get(':code/steps/:stepCode')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'policyStepGet', summary: 'Read the checklist of a decision step' })
  @ApiSuccessResponse(PolicyStepResponseDto, {
    message: 'POLICY.STEP_FETCHED',
    description:
      'The step of the version in force that a decision answers: its questions, which the system answers itself and which the person decides, and the id of the version to name in the answer.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422, NOT_FOUND, NOT_PUBLISHED, {
    status: HttpStatus.NOT_FOUND,
    description: 'No such policy (POLICY.NOT_FOUND) or the version in force has no such step (POLICY.STEP_NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND, EXAMPLES.STEP_NOT_FOUND],
  })
  async step(@Param() params: PolicyStepParamDto) {
    try {
      return await this.reading.step(params.code, params.stepCode);
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }
}
