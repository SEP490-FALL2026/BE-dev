import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
  DismissBodyDto,
  FindingListQueryDto,
  FindingPageResponseDto,
  IdParamDto,
  MappingEndBodyDto,
  MappingListQueryDto,
  MappingPageResponseDto,
  MappingResponseDto,
  ResolveBodyDto,
  UnmatchedListQueryDto,
  UnmatchedPageResponseDto,
  UnmatchedResponseDto,
} from './identity.dto';
import { USAGE_IDENTITY_ERROR_EXAMPLES as EXAMPLES, toUsageIdentityApiException } from './identity.http-errors';
import { IdentityQueryService, type FindingView, type MappingView, type UnmatchedView } from './identity-query.service';
import { IdentityService } from './identity.service';
import type { MappingRecord } from './identity.types';

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin reads or changes who a vendor identifier is.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

const iso = (date: Date | null) => (date ? date.toISOString() : null);

const unmatchedToWire = (item: UnmatchedView) => ({
  id: item.id,
  applicationId: item.applicationId,
  sourceId: item.sourceId,
  identifierType: item.identifierType,
  identifier: item.rawIdentifier,
  reason: item.reason,
  status: item.status,
  candidates: item.candidates,
  firstImportId: item.firstImportId,
  lastImportId: item.lastImportId,
  resolvedMappingId: item.resolvedMappingId,
  note: item.note,
  handledAt: iso(item.handledAt),
});

const mappingToWire = (item: MappingView | (MappingRecord & { employeeCode?: string | null })) => ({
  id: item.id,
  applicationId: item.applicationId,
  identifierType: item.identifierType,
  identifier: item.rawIdentifier,
  employeeId: item.employeeId,
  employeeCode: item.employeeCode ?? null,
  method: item.method,
  confidence: item.confidence,
  createdAt: item.createdAt.toISOString(),
  endedAt: iso(item.endedAt),
  endReason: item.endReason,
});

const findingToWire = (item: FindingView) => ({
  id: item.id,
  applicationId: item.applicationId,
  employeeId: item.employeeId,
  employeeCode: item.employeeCode,
  firstActivityDate: item.firstActivityDate,
  lastActivityDate: item.lastActivityDate,
  status: item.status,
  closedAt: iso(item.closedAt),
  closedReason: item.closedReason,
});

/**
 * Who an identifier of a vendor is (`US-08-04`): the queue of identifiers nobody could be tied to, the mappings that tie them, and the people
 * who were active with no seat to cover the day (`FR-4.8`). Only the IT Admin: the heads of departments never see the raw usage (`QĐ-101i`).
 */
@ApiTags('usage-identities')
@Controller({ version: '1' })
@RequireRoles('IT_ADMIN')
export class IdentityController {
  constructor(
    private readonly identities: IdentityService,
    private readonly queries: IdentityQueryService,
  ) {}

  @Get('usage-unmatched-identities')
  @ApiOperation({
    operationId: 'usageUnmatchedIdentityList',
    summary: 'List the vendor identifiers nobody could be tied to',
  })
  @ApiSuccessResponse(UnmatchedPageResponseDto, {
    message: 'USAGE_IDENTITY.UNMATCHED_LISTED',
    description:
      'The queue: the open identifiers and the dismissed ones (dismissing keeps them here); each with the people it may be, by code and work email only.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, INVALID)
  async queue(@Query() query: UnmatchedListQueryDto) {
    try {
      const page = await this.queries.queue(query);

      return { items: page.items.map(unmatchedToWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }

  @Post('usage-unmatched-identities/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'usageUnmatchedIdentityResolve', summary: 'Say who a vendor identifier is' })
  @ApiSuccessResponse(UnmatchedResponseDto, {
    message: 'USAGE_IDENTITY.RESOLVED',
    description:
      'A mapping made by hand ties the identifier, as the vendor wrote it, to the person; the days of that identifier are read as theirs from now on.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The identifier is not in the queue (USAGE_IDENTITY.UNMATCHED_NOT_FOUND).',
      examples: [EXAMPLES.UNMATCHED_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The identifier is already tied to someone (USAGE_IDENTITY.ALREADY_MAPPED) or was resolved already (ALREADY_HANDLED).',
      examples: [EXAMPLES.ALREADY_MAPPED, EXAMPLES.ALREADY_HANDLED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the person does not exist (USAGE_IDENTITY.EMPLOYEE_NOT_FOUND).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
  )
  async resolve(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ResolveBodyDto,
  ) {
    try {
      return unmatchedToWire(
        await this.queries.viewOf(await this.identities.resolve(actor, params.id, body.employeeId)),
      );
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }

  @Post('usage-unmatched-identities/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'usageUnmatchedIdentityDismiss',
    summary: 'Dismiss a vendor identifier that nobody could be tied to',
  })
  @ApiSuccessResponse(UnmatchedResponseDto, {
    message: 'USAGE_IDENTITY.DISMISSED',
    description:
      'The identifier stays in the queue as dismissed, with the note; its days still conclude nothing about anyone.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The identifier is not in the queue (USAGE_IDENTITY.UNMATCHED_NOT_FOUND).',
      examples: [EXAMPLES.UNMATCHED_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The identifier was resolved already (USAGE_IDENTITY.ALREADY_HANDLED).',
      examples: [EXAMPLES.ALREADY_HANDLED],
    },
    INVALID,
  )
  async dismiss(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: DismissBodyDto,
  ) {
    try {
      return unmatchedToWire(await this.queries.viewOf(await this.identities.dismiss(actor, params.id, body.note)));
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }

  @Get('usage-identity-mappings')
  @ApiOperation({
    operationId: 'usageIdentityMappingList',
    summary: 'List the mappings of vendor identifiers to people',
  })
  @ApiSuccessResponse(MappingPageResponseDto, {
    message: 'USAGE_IDENTITY.MAPPINGS_LISTED',
    description: 'The mappings in force (or all, with inForceOnly=false), each with how it was made.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, INVALID)
  async mappings(@Query() query: MappingListQueryDto) {
    try {
      const page = await this.queries.mappings(query);

      return { items: page.items.map(mappingToWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }

  @Post('usage-identity-mappings/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'usageIdentityMappingEnd', summary: 'Take a wrong mapping of a vendor identifier back' })
  @ApiSuccessResponse(MappingResponseDto, {
    message: 'USAGE_IDENTITY.MAPPING_ENDED',
    description:
      'The mapping ends with its reason; its identifier goes back to the queue as open, and its days are tied to nobody until it is resolved again.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The mapping does not exist (USAGE_IDENTITY.MAPPING_NOT_FOUND).',
      examples: [EXAMPLES.MAPPING_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The mapping has ended already (USAGE_IDENTITY.MAPPING_ENDED).',
      examples: [EXAMPLES.MAPPING_ENDED],
    },
    INVALID,
  )
  async endMapping(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: MappingEndBodyDto,
  ) {
    try {
      return mappingToWire(await this.identities.endMapping(actor, params.id, body.reason));
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }

  @Get('usage-no-assignment-findings')
  @ApiOperation({
    operationId: 'usageNoAssignmentFindingList',
    summary: 'List the people active in a vendor with no seat to cover the day',
  })
  @ApiSuccessResponse(FindingPageResponseDto, {
    message: 'USAGE_IDENTITY.FINDINGS_LISTED',
    description:
      'The findings (open by default), each with the first and the last day of activity no seat covers; no seat is made from them.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, INVALID)
  async findings(@Query() query: FindingListQueryDto) {
    try {
      const page = await this.queries.noAssignmentFindings(query);

      return { items: page.items.map(findingToWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageIdentityApiException(error);
    }
  }
}
