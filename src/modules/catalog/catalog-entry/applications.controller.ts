import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
  ApplicationDetailResponseDto,
  ApplicationIdParamDto,
  ApplicationPageResponseDto,
  ApplicationResponseDto,
  CreatedApplicationResponseDto,
  DeclareApplicationBodyDto,
  ListApplicationsQueryDto,
  UpdateApplicationBodyDto,
} from './application.dto';
import { toApplicationApiException } from './application.http-errors';
import { usageCollectionDefault } from './application.policy';
import { ApplicationListService } from './application-list.service';
import { ApplicationService } from './application.service';
import type { ApplicationSummaryView, ApplicationView } from './application.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin changes the application catalog.',
} as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read the application catalog.',
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule refuses it: NAME_INVALID, VENDOR_NAME_INVALID, DOMAIN_INVALID, TOO_MANY_DOMAINS, NOTE_INVALID, VENDOR_REQUIRED, VENDOR_SOURCE_AMBIGUOUS, INTERNAL_HAS_NO_VENDOR, BUSINESS_OWNER_INVALID, FUNCTIONAL_GROUP_INVALID, DICTIONARY_LINE_NOT_FOUND, DICTIONARY_LINE_MISMATCH or UPDATE_EMPTY.',
} as const;
const CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The vendor already has an application of this name (APPLICATION.NAME_TAKEN), the dictionary line belongs to another application (APPLICATION.DICTIONARY_LINE_TAKEN), or a simultaneous request changed the dictionary group of the vendor or of the line first (APPLICATION.DICTIONARY_GROUP_CHANGED): refresh the application and the line, then send the request again.',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The application does not exist (APPLICATION.NOT_FOUND).',
} as const;

function toSummaryWire(application: ApplicationSummaryView) {
  return {
    id: application.id,
    name: application.name,
    kind: application.kind,
    vendor: application.vendor ? { id: application.vendor.id, name: application.vendor.name } : null,
    dataSensitivity: application.dataSensitivity,
    isCommunicationService: application.isCommunicationService,
    businessOwner: application.businessOwner,
    businessOwnerReplacementRequired: application.businessOwnerReplacementRequired,
    usageCollectionDefault: usageCollectionDefault(application.isCommunicationService),
    functionalGroup: application.functionalGroup,
    status: application.status,
    updatedAt: application.updatedAt.toISOString(),
  };
}

/** The detail: the summary fields (the same function) and the rest of the application. */
function toWire(application: ApplicationView) {
  return {
    ...toSummaryWire({ ...application, isCommunicationService: application.communication.isCommunicationService }),
    dictionaryServiceLineId: application.dictionaryServiceLineId,
    domains: application.domains,
    communication: application.communication,
    createdAt: application.createdAt.toISOString(),
  };
}

/**
 * The application catalog (`US-04-01`). The IT Admin declares and changes applications; Finance reads them. Finance,
 * the department head, employees and the Super Admin do not declare or change one (AC-6, `SoD-1`); the Business Owner is
 * an attribute, not an account. Retiring an application is `g3-catalog-retire`; there is no route that deletes one.
 */
@ApiTags('applications')
@Controller({ path: 'applications', version: '1' })
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly summaries: ApplicationListService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'applicationList', summary: 'List applications' })
  @ApiSuccessResponse(ApplicationPageResponseDto, {
    message: 'APPLICATION.LISTED',
    description:
      'A page of applications by name, optionally searched by application or vendor name and filtered by kind, status and functional group.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListApplicationsQueryDto) {
    try {
      const page = await this.summaries.list(query);
      const emptyState = page.items.length === 0 ? await this.applications.emptyState() : null;

      return { items: page.items.map(toSummaryWire), pagination: page.pagination, emptyState };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'applicationCreate', summary: 'Declare an application' })
  @ApiSuccessResponse(CreatedApplicationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'APPLICATION.CREATED',
    description:
      'The application is in the catalog; proposedToDictionary says it was outside the dictionary and proposed to it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID, CONFLICT)
  async declare(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DeclareApplicationBodyDto) {
    try {
      const { application, proposed } = await this.applications.declare(actor, body);

      return { ...toWire(application), proposedToDictionary: proposed };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'applicationGet', summary: 'Get an application' })
  @ApiSuccessResponse(ApplicationDetailResponseDto, {
    message: 'APPLICATION.FETCHED',
    description:
      'The application and, in similarApplications, the first 20 other approved applications of its functional group and, in similarTotal, how many there are; recommendations says, without blocking anything, when a K2 plan is worth considering (three different people on K1 plans).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not a UUID (VALIDATION_ERROR).',
  })
  async get(@Param() params: ApplicationIdParamDto) {
    try {
      const { application, similar, similarTotal, recommendations } = await this.applications.get(params.id);

      return { ...toWire(application), similarApplications: similar, similarTotal, recommendations };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'applicationUpdate', summary: 'Update an application' })
  @ApiSuccessResponse(ApplicationResponseDto, {
    message: 'APPLICATION.UPDATED',
    description:
      'The application as it is after the change; a change of nothing is answered the same and not audited. The kind and the vendor cannot change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID, CONFLICT, NOT_FOUND)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ApplicationIdParamDto,
    @Body() body: UpdateApplicationBodyDto,
  ) {
    try {
      return toWire(await this.applications.update(actor, params.id, body));
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }
}
