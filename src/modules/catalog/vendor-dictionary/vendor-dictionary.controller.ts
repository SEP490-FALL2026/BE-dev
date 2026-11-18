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
import {
  CreateGroupBodyDto,
  CreateServiceLineBodyDto,
  IdParamDto,
  ListGroupsQueryDto,
  ListProposalsQueryDto,
  NormalizeBodyDto,
  ResolveProposalBodyDto,
  SuggestQueryDto,
  UpdateGroupBodyDto,
  UpdateServiceLineBodyDto,
  VendorGroupPageResponseDto,
  VendorGroupResponseDto,
  VendorNormalizationResponseDto,
  VendorProposalPageResponseDto,
  VendorProposalResponseDto,
  VendorServiceLineResponseDto,
  VendorSuggestionResponseDto,
} from './vendor-dictionary.dto';
import { toVendorDictionaryApiException, VENDOR_DICTIONARY_ERROR_EXAMPLES } from './vendor-dictionary.http-errors';
import { VendorDictionaryService } from './vendor-dictionary.service';
import type { VendorGroupRecord, VendorLineRecord, VendorProposalRecord } from './vendor-dictionary.types';
import { VendorProposalService } from './vendor-proposal.service';
import { VendorRecognitionService } from './vendor-recognition.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin uses the vendor dictionary.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a value is refused: VENDOR_DICTIONARY.NAME_INVALID, DOMAIN_INVALID, PATTERN_INVALID, TOO_MANY_VALUES or UPDATE_EMPTY.',
} as const;
const E = VENDOR_DICTIONARY_ERROR_EXAMPLES;
const INVALID_GROUP_CREATE = {
  ...INVALID,
  examples: [VALIDATION_EXAMPLE, E.NAME_INVALID, E.DOMAIN_INVALID, E.TOO_MANY_VALUES],
} as const;
const INVALID_GROUP_UPDATE = {
  ...INVALID,
  examples: [VALIDATION_EXAMPLE, E.NAME_INVALID, E.DOMAIN_INVALID, E.TOO_MANY_VALUES, E.UPDATE_EMPTY],
} as const;
const INVALID_LINE_CREATE = {
  ...INVALID,
  examples: [VALIDATION_EXAMPLE, E.NAME_INVALID, E.DOMAIN_INVALID, E.PATTERN_INVALID, E.TOO_MANY_VALUES],
} as const;
const INVALID_LINE_UPDATE = {
  ...INVALID,
  examples: [
    VALIDATION_EXAMPLE,
    E.NAME_INVALID,
    E.DOMAIN_INVALID,
    E.PATTERN_INVALID,
    E.TOO_MANY_VALUES,
    E.UPDATE_EMPTY,
  ],
} as const;
const GROUP_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The vendor group does not exist (VENDOR_DICTIONARY.GROUP_NOT_FOUND).',
  examples: [E.GROUP_NOT_FOUND],
} as const;
const LINE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The service line does not exist (VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND).',
  examples: [E.SERVICE_LINE_NOT_FOUND],
} as const;

const toLineWire = (line: VendorLineRecord) => ({
  id: line.id,
  name: line.name,
  domains: line.domains,
  patterns: line.patterns,
  createdAt: line.createdAt.toISOString(),
  updatedAt: line.updatedAt.toISOString(),
});

const toGroupWire = (group: VendorGroupRecord) => ({
  id: group.id,
  name: group.name,
  brandDomains: group.brandDomains,
  serviceLines: group.serviceLines.map(toLineWire),
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
});

const toProposalWire = (proposal: VendorProposalRecord) => ({
  id: proposal.id,
  name: proposal.name,
  status: proposal.status,
  serviceLineId: proposal.serviceLineId,
  createdAt: proposal.createdAt.toISOString(),
  resolvedAt: proposal.resolvedAt ? proposal.resolvedAt.toISOString() : null,
});

/**
 * The shared vendor dictionary (`US-04-07`). Only the IT Admin reads or changes it; every other role, the Super Admin
 * included, is refused (AC-4, `SoD-1`). Recognition only offers candidates and never chooses one (AC-5). Nothing in the
 * dictionary is deleted: there is no route that does.
 */
@ApiTags('vendor-dictionary')
@Controller({ path: 'vendor-dictionary', version: '1' })
export class VendorDictionaryController {
  constructor(
    private readonly dictionary: VendorDictionaryService,
    private readonly recognition: VendorRecognitionService,
    private readonly proposals: VendorProposalService,
  ) {}

  @Get('groups')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorGroupList', summary: 'List vendor groups' })
  @ApiSuccessResponse(VendorGroupPageResponseDto, {
    message: 'VENDOR_DICTIONARY.GROUPS_LISTED',
    description: 'A page of vendor groups by name, each with its service lines, optionally filtered by a name search.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async listGroups(@Query() query: ListGroupsQueryDto) {
    try {
      const page = await this.dictionary.listGroups(query);

      return { items: page.items.map(toGroupWire), pagination: page.pagination };
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Post('groups')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorGroupCreate', summary: 'Create a vendor group' })
  @ApiSuccessResponse(VendorGroupResponseDto, {
    status: HttpStatus.CREATED,
    message: 'VENDOR_DICTIONARY.GROUP_CREATED',
    description: 'The vendor group exists with no service line yet.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_GROUP_CREATE, {
    status: HttpStatus.CONFLICT,
    description:
      'A group with this name exists, ignoring case, accents and spacing (VENDOR_DICTIONARY.GROUP_NAME_TAKEN).',
    examples: [E.GROUP_NAME_TAKEN],
  })
  async createGroup(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateGroupBodyDto) {
    try {
      return toGroupWire(await this.dictionary.createGroup(actor, body));
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Patch('groups/:id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorGroupUpdate', summary: 'Update a vendor group' })
  @ApiSuccessResponse(VendorGroupResponseDto, {
    message: 'VENDOR_DICTIONARY.GROUP_UPDATED',
    description:
      'The group as it is after the change; a change that changes nothing is answered the same and not audited.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_GROUP_UPDATE, GROUP_NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description: 'Another group has this name (VENDOR_DICTIONARY.GROUP_NAME_TAKEN).',
    examples: [E.GROUP_NAME_TAKEN],
  })
  async updateGroup(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: UpdateGroupBodyDto,
  ) {
    try {
      return toGroupWire(await this.dictionary.updateGroup(actor, params.id, body));
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Post('groups/:id/service-lines')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorServiceLineCreate', summary: 'Add a service line to a vendor group' })
  @ApiSuccessResponse(VendorServiceLineResponseDto, {
    status: HttpStatus.CREATED,
    message: 'VENDOR_DICTIONARY.SERVICE_LINE_CREATED',
    description: 'The service line exists in the group, with its domains and literal description patterns.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_LINE_CREATE, GROUP_NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description: 'The group already has a line with this name (VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN).',
    examples: [E.SERVICE_LINE_NAME_TAKEN],
  })
  async createServiceLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: CreateServiceLineBodyDto,
  ) {
    try {
      return toLineWire(await this.dictionary.createServiceLine(actor, params.id, body));
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Patch('service-lines/:id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorServiceLineUpdate', summary: 'Update a service line' })
  @ApiSuccessResponse(VendorServiceLineResponseDto, {
    message: 'VENDOR_DICTIONARY.SERVICE_LINE_UPDATED',
    description:
      'The line as it is after the change; a change that changes nothing is answered the same and not audited.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_LINE_UPDATE, LINE_NOT_FOUND, {
    status: HttpStatus.CONFLICT,
    description: 'Another line of the group has this name (VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN).',
    examples: [E.SERVICE_LINE_NAME_TAKEN],
  })
  async updateServiceLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: UpdateServiceLineBodyDto,
  ) {
    try {
      return toLineWire(await this.dictionary.updateServiceLine(actor, params.id, body));
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Get('suggestions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorSuggestionList', summary: 'Suggest service lines for a typed name' })
  @ApiSuccessResponse(VendorSuggestionResponseDto, {
    message: 'VENDOR_DICTIONARY.SUGGESTED',
    description: 'The lines the name could mean; none is chosen for the caller.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async suggest(@Query() query: SuggestQueryDto) {
    try {
      return { candidates: await this.recognition.suggest(query.name) };
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Post('normalizations')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorNormalize', summary: 'Recognise a vendor from a domain or a bank description' })
  @ApiSuccessResponse(VendorNormalizationResponseDto, {
    message: 'VENDOR_DICTIONARY.NORMALIZED',
    description:
      'One candidate is a unique match, several are ambiguous, none is no match; method says how the match was made.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The request is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async normalize(@Body() body: NormalizeBodyDto) {
    try {
      return await this.recognition.normalize(body.kind, body.value);
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Get('proposals')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorProposalList', summary: 'List proposals to add a vendor' })
  @ApiSuccessResponse(VendorProposalPageResponseDto, {
    message: 'VENDOR_DICTIONARY.PROPOSALS_LISTED',
    description: 'A page of proposals, oldest first, optionally for one status.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async listProposals(@Query() query: ListProposalsQueryDto) {
    try {
      const page = await this.proposals.list(query);

      return { items: page.items.map(toProposalWire), pagination: page.pagination };
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }

  @Post('proposals/:id/resolutions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'vendorProposalResolve', summary: 'Accept or dismiss a proposal' })
  @ApiSuccessResponse(VendorProposalResponseDto, {
    message: 'VENDOR_DICTIONARY.PROPOSAL_RESOLVED',
    description: 'The proposal as it is after it was accepted (naming the line it became) or dismissed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The proposal (VENDOR_DICTIONARY.PROPOSAL_NOT_FOUND) or the named service line (VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND) does not exist.',
      examples: [E.PROPOSAL_NOT_FOUND, E.SERVICE_LINE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal was already resolved (VENDOR_DICTIONARY.PROPOSAL_ALREADY_RESOLVED).',
      examples: [E.PROPOSAL_ALREADY_RESOLVED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or ACCEPTED names no line or DISMISSED names one (VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID).',
      examples: [VALIDATION_EXAMPLE, E.PROPOSAL_RESOLUTION_INVALID],
    },
  )
  async resolveProposal(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ResolveProposalBodyDto,
  ) {
    try {
      return toProposalWire(await this.proposals.resolve(actor, params.id, body));
    } catch (error) {
      throw toVendorDictionaryApiException(error);
    }
  }
}
