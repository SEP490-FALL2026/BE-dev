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
import {
  ListRequestableApplicationsQueryDto,
  ListRequestablePlansQueryDto,
  RequestableApplicationPageResponseDto,
  RequestableApplicationResponseDto,
  RequestableIdParamDto,
  RequestablePlanPageResponseDto,
  RequestablePlanResponseDto,
} from './requestable-software.dto';
import {
  REQUESTABLE_SOFTWARE_ERROR_EXAMPLES as EXAMPLES,
  toRequestableSoftwareApiException,
} from './requestable-software.http-errors';
import { RequestableSoftwareService } from './requestable-software.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NO_DEPARTMENT = {
  status: HttpStatus.CONFLICT,
  description:
    'The caller belongs to no department today, so they can send no request and nothing is offered (REQUESTABLE_SOFTWARE.NO_DEPARTMENT).',
  examples: [EXAMPLES.NO_DEPARTMENT],
} as const;
const INVALID_QUERY = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The catalog as a person who asks for software reads it (`US-05-01`, main flow: open the catalog, pick the software and the
 * plan, then preview). Any signed-in person reads it, as any signed-in person previews and sends a request; it is not the
 * catalog the IT Admin and Finance keep (`/applications`, `/plans`), and shows nothing of cost, contract, seat or key.
 */
@ApiTags('requestable-software')
@Controller({ version: '1' })
export class RequestableSoftwareController {
  constructor(private readonly software: RequestableSoftwareService) {}

  @Get('requestable-applications')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestableApplicationList', summary: 'List the software a person may request' })
  @ApiSuccessResponse(RequestableApplicationPageResponseDto, {
    message: 'REQUESTABLE_APPLICATION.LISTED',
    description:
      'A page of the applications the caller may ask for, by name: in the catalog and not retired, of a kind a request is made for (SaaS, licensed or internal), with at least one plan. Searched by application or vendor name and filtered by kind and functional group. Each row says whether it costs money and whether a request for it can be sent today; no owner, price, contract or seat is shown.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NO_DEPARTMENT, INVALID_QUERY)
  async listApplications(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: ListRequestableApplicationsQueryDto,
  ) {
    try {
      return await this.software.listApplications(actor, query);
    } catch (error) {
      throw toRequestableSoftwareApiException(error);
    }
  }

  @Get('requestable-applications/:id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestableApplicationGet', summary: 'Get a piece of software a person may request' })
  @ApiSuccessResponse(RequestableApplicationResponseDto, {
    message: 'REQUESTABLE_APPLICATION.FETCHED',
    description:
      'The application as the list shows it, with the sensitivity of the data it holds. Its plans are listed by the plan list with applicationId.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The application does not exist, is retired, has no plan or is of a kind nobody requests (REQUESTABLE_SOFTWARE.APPLICATION_NOT_FOUND).',
      examples: [EXAMPLES.APPLICATION_NOT_FOUND],
    },
    NO_DEPARTMENT,
    INVALID_ID,
  )
  async getApplication(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestableIdParamDto) {
    try {
      return await this.software.getApplication(actor, params.id);
    } catch (error) {
      throw toRequestableSoftwareApiException(error);
    }
  }

  @Get('requestable-plans')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestablePlanList', summary: 'List the plans a person may request' })
  @ApiSuccessResponse(RequestablePlanPageResponseDto, {
    message: 'REQUESTABLE_PLAN.LISTED',
    description:
      'A page of the plans of the applications the caller may ask for, by application then plan name; optionally of one application, searched by plan or application name and filtered by kind. Each row says whether the department of the caller can price it and whether a request for it can be sent today; pick one and preview it with the request preview.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NO_DEPARTMENT, INVALID_QUERY)
  async listPlans(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListRequestablePlansQueryDto) {
    try {
      return await this.software.listPlans(actor, query);
    } catch (error) {
      throw toRequestableSoftwareApiException(error);
    }
  }

  @Get('requestable-plans/:id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'requestablePlanGet', summary: 'Get a plan a person may request' })
  @ApiSuccessResponse(RequestablePlanResponseDto, {
    message: 'REQUESTABLE_PLAN.FETCHED',
    description:
      'The plan as the list shows it, with the vendor, whether an account of it may be shared and whether its data is lost when it is taken away.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The plan does not exist, or its application is not offered for a request (REQUESTABLE_SOFTWARE.PLAN_NOT_FOUND).',
      examples: [EXAMPLES.PLAN_NOT_FOUND],
    },
    NO_DEPARTMENT,
    INVALID_ID,
  )
  async getPlan(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestableIdParamDto) {
    try {
      return await this.software.getPlan(actor, params.id);
    } catch (error) {
      throw toRequestableSoftwareApiException(error);
    }
  }
}
